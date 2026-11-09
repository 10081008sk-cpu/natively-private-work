/**
 * LocalWhisperSTT — High-Speed Faster-Whisper Subprocess Coordinator.
 * Optimized with Native Windows Task Killing to eliminate Zombie Processes.
 */

import { EventEmitter } from 'events';
import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { resampleToF32 } from './whisper/audioResampler';
import { VadProcessor } from './whisper/vadProcessor';
import { filterHallucination } from './whisper/hallucinationFilter';
import { SettingsManager } from '../services/SettingsManager';

export class LocalWhisperSTT extends EventEmitter {
    private readonly modelId: string;
    private inputSampleRate = 48000;
    private language: string | null = null;
    private contextPrompt = '';
    
    private channelLabel = '';
    private vad: VadProcessor | null = null;
    private isActive = false;
    private chunkCounter = 0;
    private isDrainingFinals = false;

    private sidecarProcess: ChildProcess | null = null;
    private sidecarReady = false;
    private pendingFilesQueue: string[] = [];

    private gapFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly GAP_FLUSH_MS = 1200; // Stabilizes natural phrase pauses
    private static readonly MAX_SEGMENT_MS = 12000;       

    constructor() {
        super();
        this.modelId = 'Xenova/whisper-base'; 
        this.syncSystemLanguageConfig();
    }

    private syncSystemLanguageConfig(): void {
        const settingsInstance = SettingsManager.getInstance();
        const rawLanguageSetting = settingsInstance.get('sttLanguage') || settingsInstance.get('audio.sttLanguage') || 'auto';
        this.resolveLanguageMapping(String(rawLanguageSetting));
    }

    private resolveLanguageMapping(rawLang: string): void {
        const langStr = rawLang.toLowerCase();
        if (langStr.includes('hi') || langStr.includes('hindi')) {
            this.language = 'hi';
        } else if (langStr.includes('mr') || langStr.includes('marathi')) {
            this.language = 'mr';
        } else if (langStr.includes('en') || langStr.includes('english')) {
            this.language = 'en';
        } else {
            this.language = null;
        }
        console.log(`[LocalWhisperSTT] Language Alignment locked to: ${this.language || 'dynamic-auto-detect'}`);
    }

    setSampleRate(rate: number): void { this.inputSampleRate = rate; }
    setAudioChannelCount(_count: number): void {}
    setRecognitionLanguage(key: string): void { this.resolveLanguageMapping(key); }
    setCredentials(_credPath: string): void {}
    setChannel(label: string): void { this.channelLabel = (label ?? '').trim(); }
    setContext(prompt: string): void { this.contextPrompt = (prompt ?? '').trim(); }

    public start(): void {
        if (this.isActive) return;
        this.syncSystemLanguageConfig();
        this.isDrainingFinals = false;
        this.isActive = true;
        this.vad = new VadProcessor();
        
        this.spawnFasterWhisperSidecar();
    }

    public stop(): void {
        if (!this.isActive) return;
        this.isActive = false;

        if (this.gapFlushTimer) {
          clearTimeout(this.gapFlushTimer);
          this.gapFlushTimer = null;
        }

        if (this.vad) {
            const segs = this.vad.flush();
            this.vad = null;
            this.isDrainingFinals = true;
            segs.forEach(s => this.dispatchFinal(s.samples));
        }

        // CRITICAL FIX: Force-kill the child process tree on Windows to prevent silent locks
        if (this.sidecarProcess && this.sidecarProcess.pid) {
            const pid = this.sidecarProcess.pid;
            if (process.platform === 'win32') {
                exec(`taskkill /F /PID ${pid} /T`, (err) => {
                    console.log(`[LocalWhisperSTT] Windows Force-Kill Process Tree executed for PID ${pid}`);
                });
            } else {
                this.sidecarProcess.kill('SIGKILL');
            }
            this.sidecarProcess = null;
        }
        
        this.sidecarReady = false;
        this.pendingFilesQueue = [];
    }

    public write(chunk: Buffer): void {
        if (!this.isActive || !this.vad) return;
        
        const f32 = resampleToF32(chunk, this.inputSampleRate);
        const segs = this.vad.push(f32);
        segs.forEach(s => this.dispatchFinal(s.samples));

        const open = this.vad.peekOpenSegment();
        if (open && open.durationMs >= LocalWhisperSTT.MAX_SEGMENT_MS) {
            const committed = this.vad.softCommit();
            if (committed) this.dispatchFinal(committed.samples);
        }

        if (this.gapFlushTimer) clearTimeout(this.gapFlushTimer);
        this.gapFlushTimer = setTimeout(() => {
            this.gapFlushTimer = null;
            if (this.isActive && this.vad) {
                const pending = this.vad.flush();
                pending.forEach(s => this.dispatchFinal(s.samples));
            }
        }, LocalWhisperSTT.GAP_FLUSH_MS);
    }

    public finalize(): void {
        if (!this.isActive || !this.vad) return;
        const segs = this.vad.flush();
        segs.forEach(s => this.dispatchFinal(s.samples));
    }

    private dispatchFinal(audio: Float32Array): void {
        if (audio.length === 0) return;

        try {
            this.chunkCounter++;
            const tempTrackPath = path.join(app.getPath('temp'), `live_chunk_${Date.now()}_${this.chunkCounter}.wav`);
            
            this.writeWavFileFallback(tempTrackPath, audio);

            if (!this.sidecarReady) {
                this.pendingFilesQueue.push(tempTrackPath);
                return;
            }

            this.sendInferenceRequest(tempTrackPath);
        } catch (err) {
            console.error('[LocalWhisperSTT] Failed to generate wav chunk path payload:', err);
        }
    }

    private spawnFasterWhisperSidecar(): void {
        let scriptPath = path.join(app.getAppPath(), 'electron', 'audio', 'whisper', 'faster_transcriber.py');
        
        if (!fs.existsSync(scriptPath)) {
            scriptPath = path.join(app.getAppPath(), '..', 'electron', 'audio', 'whisper', 'faster_transcriber.py');
        }
        if (!fs.existsSync(scriptPath) && app.isPackaged) {
            scriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'audio', 'whisper', 'faster_transcriber.py');
        }

        this.sidecarProcess = spawn('python', ['-u', scriptPath]);

        this.sidecarProcess.stdout?.on('data', (data) => {
            try {
                const response = JSON.parse(data.toString().trim());
                
                if (response.status === 'ready') {
                    this.sidecarReady = true;
                    this.flushPendingRequests();
                    return;
                }

                if (response.text && response.text.length > 0) {
                    const filteredText = filterHallucination(response.text);
                    if (filteredText && filteredText.trim().length > 0) {
                        this.emit('transcript', {
                            text: filteredText.trim(),
                            isFinal: true,
                            final: true,
                            confidence: response.probability || 0.9,
                            speaker: this.channelLabel === 'mic' ? 'user' : 'interviewer'
                        });
                    }
                }
            } catch (err) { }
        });

        this.sidecarProcess.on('error', (err) => {
            console.error('[Faster-Whisper Subprocess Initialization Failure]:', err);
        });
    }

    private sendInferenceRequest(filePath: string): void {
        if (!this.sidecarProcess || this.sidecarProcess.killed) return;
        
        const payload = { path: filePath, language: this.language };
        this.sidecarProcess.stdin?.write(JSON.stringify(payload) + '\n');

        setTimeout(() => {
            try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
        }, 30000); 
    }

    private flushPendingRequests(): void {
        const queuedFiles = this.pendingFilesQueue.splice(0);
        queuedFiles.forEach(file => this.sendInferenceRequest(file));
    }

    private writeWavFileFallback(filePath: string, f32Array: Float32Array): void {
        const sampleRate = 16000; 
        const buffer = Buffer.alloc(44 + f32Array.length * 2);

        buffer.write('RIFF', 0);
        buffer.writeUInt32LE(36 + f32Array.length * 2, 4);
        buffer.write('WAVE', 8);
        buffer.write('fmt ', 12);
        buffer.writeUInt32LE(16, 16);
        buffer.writeUInt16LE(1, 20); 
        buffer.writeUInt16LE(1, 22); 
        buffer.writeUInt32LE(sampleRate, 24);
        buffer.writeUInt32LE(sampleRate * 2, 28);
        buffer.writeUInt16LE(2, 32);
        buffer.writeUInt16LE(16, 34); 
        buffer.write('data', 36);
        buffer.writeUInt32LE(f32Array.length * 2, 40);

        let offset = 44;
        for (let i = 0; i < f32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, f32Array[i]));
            buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, offset);
            offset += 2;
        }
        fs.writeFileSync(filePath, buffer);
    }
}