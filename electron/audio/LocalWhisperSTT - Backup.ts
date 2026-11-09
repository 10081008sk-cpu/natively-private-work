/**
 * LocalWhisperSTT — local Whisper / Distil-Whisper / Moonshine STT provider.
 * Optimized for lightweight resource usage and multi-language fluid transcription.
 */

import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';
import path from 'path';
import { app } from 'electron';
import { resampleToF32 } from './whisper/audioResampler';
import { VadProcessor } from './whisper/vadProcessor';
import { filterHallucination } from './whisper/hallucinationFilter';
import { configureTransformersCache } from './whisper/modelManager';
import { modelPreloader } from './whisper/modelPreloader';
import type { WorkerOutMessage } from './whisper/types';
import { SettingsManager } from '../services/SettingsManager';

export class LocalWhisperSTT extends EventEmitter {
    private readonly modelId: string;
    private inputSampleRate = 48000;
    private language: string | null = null;
    private contextPrompt = '';
    private contextPromptSentToWorker = '';
    private static readonly PROMPT_MAX_CHARS = 8000;

    // Telemetry & Tracking Boundaries
    private trackedSegmentId = 0;
    private segmentOpenedAt = 0;
    private firstPartialEmittedForSegment = 0;
    private firstPartialLatencies: number[] = [];
    private finalLatencies: number[] = [];
    private static readonly LATENCY_WINDOW = 100;
    private static readonly LATENCY_LOG_EVERY = 20;
    private static readonly LATENCY_MAX_MS = 60_000;
    private latencyLogCounter = 0;
    
    private channelLabel = '';
    private worker: Worker | null = null;
    private vad: VadProcessor | null = null;
    private isActive = false;
    private taskCounter = 0;
    private workerReady = false;
    private isDrainingFinals = false;
    private drainingFinalsInFlight = 0;
    private pendingAudio: Float32Array[] = [];

    private gapFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly GAP_FLUSH_MS = 400;
    private workerTerminateTimer: ReturnType<typeof setTimeout> | null = null;

    // Streaming Thread Loop State Configs
    private streamingTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly streamingIntervalBaseMs: number;
    private readonly streamingMinAudioMs: number;
    private readonly skipAgreement: boolean;
    private static readonly STREAMING_INTERVAL_MAX_MS = 12000;
    private static readonly MAX_SEGMENT_MS = 14000;       
    private streamingStallCount = 0;
    private streamingNextDelayMs = 0; 

    private lastPartialText = '';
    private lastEmittedText = '';
    private streamingTaskInFlight = false;
    private streamingTaskId: string | null = null;

    constructor() {
        super();
        this.modelId = 'Xenova/whisper-base'; 
        configureTransformersCache();

        // 🌟 STEP 1: PARSE AND ALIGN SYSTEM REGIONAL SETTINGS STRINGS ACCURATELY
        const settingsInstance = SettingsManager.getInstance();
        const rawLanguageSetting = settingsInstance.get('sttLanguage') || settingsInstance.get('audio.sttLanguage') || 'auto';
        
        const langStr = String(rawLanguageSetting).toLowerCase();
        if (langStr.includes('hi') || langStr.includes('hindi')) {
            this.language = 'hindi';
        } else if (langStr.includes('mr') || langStr.includes('marathi')) {
            this.language = 'marathi';
        } else if (langStr.includes('en') || langStr.includes('english')) {
            this.language = 'english';
        }
        
        // } else {
        //     preferredLanguages = ['en', 'hi', 'mr'];
        //     //this.language = null; // Triggers multi-language smart auto-detection
        // }
        console.log(`[LocalWhisperSTT] Streaming profile initialized. Language Mapped to: ${this.language || 'auto-detect'}`);

        // 🌟 STEP 2: RE-ENGINEER STREAMING PROFILES FOR CPU RESOURCE CONSERVATION
        // Extending intervals to 3500ms entirely prevents processing backlog chains!
        this.streamingIntervalBaseMs = 3500;
        this.streamingMinAudioMs = 1200;
        this.skipAgreement = true; // Bypasses flickering prefixes processing loop cycles
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;
    }

    private static resolveStreamingProfile(modelId: string): { intervalMs: number; minAudioMs: number; skipAgreement: boolean } {
        if (modelId.toLowerCase().includes('moonshine')) {
            return { intervalMs: 750, minAudioMs: 400, skipAgreement: true };
        }
        return { intervalMs: 3500, minAudioMs: 1200, skipAgreement: true };
    }

    setSampleRate(rate: number): void { this.inputSampleRate = rate; }
    setAudioChannelCount(_count: number): void {}
    setRecognitionLanguage(key: string): void { 
        const langStr = String(key).toLowerCase();
        if (langStr.includes('hi') || langStr.includes('hindi')) {
            this.language = 'hindi';
        } else if (langStr.includes('mr') || langStr.includes('marathi')) {
            this.language = 'marathi';
        } else if (langStr.includes('en') || langStr.includes('english')) {
            this.language = 'english';
        } else {
            this.language = null;
        }
    }
    setCredentials(_credPath: string): void {}

    setChannel(label: string): void { this.channelLabel = (label ?? '').trim(); }

    setContext(prompt: string): void {
        let trimmed = (prompt ?? '').trim();
        if (trimmed.length > LocalWhisperSTT.PROMPT_MAX_CHARS) {
            trimmed = trimmed.slice(0, LocalWhisperSTT.PROMPT_MAX_CHARS);
        }
        this.contextPrompt = trimmed;
        this.maybePushPromptToWorker();
    }

    private maybePushPromptToWorker(): void {
        if (!this.worker || !this.workerReady) return;
        if (this.contextPrompt === this.contextPromptSentToWorker) return;
        this.worker.postMessage({ type: 'setPrompt', prompt: this.contextPrompt });
        this.contextPromptSentToWorker = this.contextPrompt;
    }

    start(): void {
        if (this.isActive) return;
        this.isDrainingFinals = false;
        this.drainingFinalsInFlight = 0;
        this.isActive = true;
        this.vad = new VadProcessor();
        this.spawnWorker();
        this.startStreamingLoop();
    }

    stop(): void {
        if (!this.isActive) return;
        this.isActive = false;

        this.stopStreamingLoop();
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

        this.resetAgreementState();

        if (this.firstPartialLatencies.length > 0 || this.finalLatencies.length > 0) {
            this.logLatencySummary();
        }
        this.firstPartialLatencies = [];
        this.finalLatencies = [];
        this.segmentOpenedAt = 0;
        this.firstPartialEmittedForSegment = 0;
        this.trackedSegmentId = 0;
        this.latencyLogCounter = 0;

        const w = this.worker;
        if (w) {
            const shouldKeepWorkerForFinals = this.isDrainingFinals && (this.pendingAudio.length > 0 || this.drainingFinalsInFlight > 0);
            if (shouldKeepWorkerForFinals) return;
            console.log('[LocalWhisperSTT] Flushing memory context: terminating worker thread.');
            w.terminate();
            this.worker = null;
            this.pendingAudio = [];
            (this as any).audioBuffer = [];
        }
    }

    write(chunk: Buffer): void {
        if (!this.isActive || !this.vad) return;
        const f32 = resampleToF32(chunk, this.inputSampleRate);
        const segs = this.vad.push(f32);
        segs.forEach(s => this.dispatchFinal(s.samples));

        const open = this.vad.peekOpenSegment();
        if (open && open.durationMs >= LocalWhisperSTT.MAX_SEGMENT_MS) {
            const committed = this.vad.softCommit();
            if (committed) this.dispatchFinal(committed.samples);
        }

        if (this.vad.isInSpeech()) {
            const id = this.vad.currentSegmentId();
            if (id !== this.trackedSegmentId) {
                this.trackedSegmentId = id;
                this.segmentOpenedAt = performance.now();
                this.firstPartialEmittedForSegment = 0;
            }
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

    finalize(): void {
        if (!this.isActive || !this.vad) return;
        const segs = this.vad.flush();
        segs.forEach(s => this.dispatchFinal(s.samples));
    }

    /* ──────────────── Streaming inference loop ──────────────── */

    private startStreamingLoop(): void {
        if (this.streamingTimer) return;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;
        this.streamingStallCount = 0;
        this.scheduleNextStreamingTick();
    }

    private scheduleNextStreamingTick(): void {
        if (!this.isActive) return;
        this.streamingTimer = setTimeout(() => {
            this.streamingTimer = null;
            try {
                this.streamingTick();
            } catch (e) {
                console.warn('[LocalWhisperSTT] streamingTick threw, continuing loop:', e);
                this.recordStreamingStall();
            }
            this.scheduleNextStreamingTick();
        }, this.streamingNextDelayMs);
    }

    private stopStreamingLoop(): void {
        if (this.streamingTimer) {
            clearTimeout(this.streamingTimer);
            this.streamingTimer = null;
        }
        this.streamingTaskInFlight = false;
        this.streamingTaskId = null;
        this.streamingStallCount = 0;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;
    }

    private streamingTick(): void {
        if (!this.isActive || !this.vad || !this.workerReady || !this.worker) {
            this.recordStreamingStall();
            return;
        }
        if (!this.vad.isInSpeech()) { this.recordStreamingStall(); return; }
        if (this.streamingTaskInFlight) { this.recordStreamingStall(); return; }

        const open = this.vad.peekOpenSegment();
        if (!open || open.durationMs < this.streamingMinAudioMs) {
            this.recordStreamingStall();
            return;
        }

        this.streamingStallCount = 0;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;

        this.streamingTaskInFlight = true;
        const taskId = `s${++this.taskCounter}`;
        this.streamingTaskId = taskId;
        const copy = open.samples.slice();
        this.worker.postMessage(
            { type: 'transcribe', taskId, audio: copy, language: this.language, streaming: true },
            [copy.buffer]
        );
    }

    private recordStreamingStall(): void {
        this.streamingStallCount++;
        if (this.streamingStallCount >= 3) {
            this.streamingNextDelayMs = Math.min(
                LocalWhisperSTT.STREAMING_INTERVAL_MAX_MS,
                this.streamingNextDelayMs * 2
            );
        }
    }

    private handleStreamingPartial(text: string): void {
        this.streamingTaskInFlight = false;
        this.streamingStallCount = 0;
        this.streamingNextDelayMs = this.streamingIntervalBaseMs;

        const cleaned = filterHallucination(text);
        if (!cleaned) return;

        if (this.skipAgreement) {
            if (cleaned !== this.lastEmittedText) {
                this.lastEmittedText = cleaned;
                this.recordFirstPartialLatencyOnce();
                this.emit('transcript', {
                      text: cleaned.trim(),
                      isFinal: false,
                      final: false,
                      confidence: 0.7,
                      speaker: this.channelLabel === 'mic' ? 'user' : 'interviewer',
                    });
            }
            return;
        }

        if (this.lastPartialText === '') {
            this.lastPartialText = cleaned;
            return;
        }

        const agreed = this.longestCommonPrefix(this.lastPartialText, cleaned);
        this.lastPartialText = cleaned;

        if (agreed.length > this.lastEmittedText.length) {
            this.lastEmittedText = agreed;
            this.recordFirstPartialLatencyOnce();
            this.emit('transcript', {
                      text: this.lastEmittedText.trim(),
                      isFinal: false,
                      final: false,
                      confidence: 0.7,
                      speaker: this.channelLabel === 'mic' ? 'user' : 'interviewer',
                    });
        }
    }

    private recordFirstPartialLatencyOnce(): void {
        if (this.segmentOpenedAt > 0 && this.firstPartialEmittedForSegment !== this.trackedSegmentId) {
            const dt = performance.now() - this.segmentOpenedAt;
            if (dt > 0 && dt < LocalWhisperSTT.LATENCY_MAX_MS) {
                this.recordLatency(this.firstPartialLatencies, dt);
            }
            this.firstPartialEmittedForSegment = this.trackedSegmentId;
        }
    }

    private recordLatency(arr: number[], ms: number): void {
        arr.push(ms);
        if (arr.length > LocalWhisperSTT.LATENCY_WINDOW) arr.shift();
        this.latencyLogCounter++;
        if (this.latencyLogCounter >= LocalWhisperSTT.LATENCY_LOG_EVERY) {
            this.latencyLogCounter = 0;
            this.logLatencySummary();
        }
    }

    private percentile(sorted: number[], p: number): number {
        if (sorted.length === 0) return 0;
        const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
        return Math.round(sorted[idx]);
    }

    private logLatencySummary(): void {
        const fp = [...this.firstPartialLatencies].sort((a, b) => a - b);
        const fn = [...this.finalLatencies].sort((a, b) => a - b);
        const fmt = (s: number[]) => s.length === 0
            ? 'n=0'
            : `n=${s.length} p50=${this.percentile(s, 50)}ms p95=${this.percentile(s, 95)}ms p99=${this.percentile(s, 99)}ms`;
        const channelTag = this.channelLabel ? `:${this.channelLabel}` : '';
        console.log(`[LocalWhisperSTT/${this.modelId.split('/').pop()}${channelTag}] latency · first-partial: ${fmt(fp)} · final: ${fmt(fn)}`);
    }

    public getLatencyStats(): { firstPartial: { count: number; p50: number; p95: number; p99: number }; final: { count: number; p50: number; p95: number; p99: number } } {
        const fp = [...this.firstPartialLatencies].sort((a, b) => a - b);
        const fn = [...this.finalLatencies].sort((a, b) => a - b);
        return {
            firstPartial: { count: fp.length, p50: this.percentile(fp, 50), p95: this.percentile(fp, 95), p99: this.percentile(fp, 99) },
            final:        { count: fn.length, p50: this.percentile(fn, 50), p95: this.percentile(fn, 95), p99: this.percentile(fn, 99) },
        };
    }

    private longestCommonPrefix(a: string, b: string): string {
        if (!a || !b) return '';
        const len = Math.min(a.length, b.length);
        let i = 0;
        while (i < len && a[i] === b[i]) i++;
        if (i < a.length && /\S/.test(a[i]) && i > 0 && /\S/.test(a[i - 1])) {
            while (i > 0 && /\S/.test(a[i - 1])) i--;
        }
        return a.slice(0, i);
    }

    private resetAgreementState(): void {
        this.lastPartialText = '';
        this.lastEmittedText = '';
        this.streamingTaskId = null;
    }

    private dispatchFinal(audio: Float32Array): void {
        if (!this.worker) return;

        this.resetAgreementState();
        this.streamingTaskInFlight = false;

        if (!this.workerReady) {
            const MAX_PENDING = 500;
            if (this.pendingAudio.length < MAX_PENDING) {
                this.pendingAudio.push(audio.slice());
            } else {
                console.warn('[LocalWhisperSTT] Pending queue full — dropping oldest segment');
                this.pendingAudio.shift();
                this.pendingAudio.push(audio.slice());
            }
            return;
        }

        if (this.isDrainingFinals) {
            this.drainingFinalsInFlight++;
        }
        this.sendTranscribe(audio, false);
    }

    private sendTranscribe(audio: Float32Array, streaming: boolean): void {
        if (!this.worker) return;
        const taskId = `${streaming ? 's' : 't'}${++this.taskCounter}`;
        const copy = audio.slice();
        this.worker.postMessage(
            { type: 'transcribe', taskId, audio: copy, language: this.language, streaming },
            [copy.buffer]
        );
    }

    private spawnWorker(): void {
        const warm = modelPreloader.takeWarmWorker(this.modelId);
        if (warm) {
            console.log(`[LocalWhisperSTT] Using preloaded warm worker for ${this.modelId}`);
            this.worker = warm;
            this.workerReady = true;
            this.attachWorkerListeners();
            this.flushPending();
        } else {
            console.log(`[LocalWhisperSTT] Cold-starting worker for ${this.modelId}`);
            const workerPath = app.isPackaged ?
            path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'audio', 'whisper', 'whisperWorker.mjs') :
            path.join(__dirname, 'whisper', 'whisperWorker.mjs');
            this.worker = new Worker(workerPath);
            this.attachWorkerListeners();
            
            const initMsg = {
                type: 'init',
                modelId: this.modelId,
                cacheDir: 'E:/Project/resources/models'
            };
            this.worker.postMessage(initMsg);
        }
    }

    private attachWorkerListeners(): void {
        if (!this.worker) return;

        this.worker.on('message', (msg: WorkerOutMessage) => {
            if (msg.type === 'ready') {
                this.workerReady = true;
                this.flushPending();
                return;
            }

            if (!this.isActive && !(this.isDrainingFinals && msg.type === 'result')) return;

            if (msg.type === 'partial') {
                if (msg.taskId !== this.streamingTaskId) {
                    this.streamingTaskInFlight = false;
                    return;
                }
                this.handleStreamingPartial(msg.text);
            } else if (msg.type === 'result') {
                const text = filterHallucination(msg.text);
                if (text) {
                    if (this.segmentOpenedAt > 0) {
                        const dt = performance.now() - this.segmentOpenedAt;
                        if (dt > 0 && dt < LocalWhisperSTT.LATENCY_MAX_MS) {
                            this.recordLatency(this.finalLatencies, dt);
                        }
                    }
                    this.emit('transcript', { text, isFinal: true, final: true, confidence: 0.9, speaker: this.channelLabel === 'mic' ? 'user' : 'interviewer' });
                }
                this.segmentOpenedAt = 0;
                if (this.isDrainingFinals) {
                    this.drainingFinalsInFlight = Math.max(0, this.drainingFinalsInFlight - 1);
                    if (this.drainingFinalsInFlight === 0 && this.worker) {
                        this.beginWorkerTermination(this.worker);
                    }
                }
            } else if (msg.type === 'error') {
                console.error('[LocalWhisperSTT] Worker error:', msg.message);
                if (this.isDrainingFinals && msg.taskId?.startsWith('t')) {
                    this.drainingFinalsInFlight = Math.max(0, this.drainingFinalsInFlight - 1);
                    if (this.drainingFinalsInFlight === 0 && this.worker) {
                        this.beginWorkerTermination(this.worker);
                    }
                }
                if (msg.taskId && msg.taskId === this.streamingTaskId) {
                    this.streamingTaskInFlight = false;
                    this.streamingTaskId = null;
                    this.streamingStallCount = 0;
                    this.streamingNextDelayMs = this.streamingIntervalBaseMs;
                }
                if (msg.message.includes('Failed to load model')) {
                    this.emit('error', new Error(
                        'Local Whisper model not found. Please download a model in Settings → Audio.'
                    ));
                }
            }
        });

        this.worker.on('error', (err) => this.emit('error', err));
    }

    private flushPending(): void {
        this.maybePushPromptToWorker();
        const queued = this.pendingAudio.splice(0);
        queued.forEach(audio => this.sendTranscribe(audio, false));
        if (this.isDrainingFinals && queued.length === 0 && this.drainingFinalsInFlight === 0 && this.worker) {
            this.beginWorkerTermination(this.worker);
        }
    }

    private beginWorkerTermination(w: Worker): void {
        if (this.workerTerminateTimer) {
            clearTimeout(this.workerTerminateTimer);
            this.workerTerminateTimer = null;
        }
        w.removeAllListeners('message');
        w.removeAllListeners('error');
        w.terminate();

        this.worker = null;
        this.workerReady = false;
        this.isDrainingFinals = false;
        this.drainingFinalsInFlight = 0;
        this.contextPromptSentToWorker = '';
    }
    
    private scheduleWorkerTermination(): void {
        const t = setTimeout(() => {
            if (!this.worker) return;
            this.worker.removeAllListeners('message');
            this.worker.removeAllListeners('error');
            this.workerTerminateTimer = null;
            this.worker.terminate();
            this.worker = null;
            this.workerReady = false;
        }, 5000);
        (t as any).unref?.();
        this.workerTerminateTimer = t;
    }
}