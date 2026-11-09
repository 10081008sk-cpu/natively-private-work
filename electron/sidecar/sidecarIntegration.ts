/**
 * Sidecar Integration Module
 * 
 * Connects the STT Sidecar Workers to the main Electron process.
 * Routes audio capture to sidecar workers and forwards transcripts to existing handlers.
 * Only activated when STT provider is 'sherpa'.
 */

import { EventEmitter } from 'events';
import { initializeSidecarWorkers, getSystemWorker, getMicWorker, shutdownSidecarWorkers, STTSidecarWorker } from './sttSidecarWorker';
import { AppState } from './main';

interface TranscriptPayload {
    speaker: 'user' | 'interviewer';
    text: string;
    timestamp: number;
    final: boolean;
    confidence: number;
}

export class SidecarIntegration extends EventEmitter {
    private appState: AppState;
    private systemWorker: STTSidecarWorker | null = null;
    private micWorker: STTSidecarWorker | null = null;
    private isInitialized = false;
    private isActive = false;

    constructor(appState: AppState) {
        super();
        this.appState = appState;
    }

    public initialize(): boolean {
        if (this.isInitialized) return true;
        
        const { CredentialsManager } = require('../services/CredentialsManager');
        const sttProvider = CredentialsManager.getInstance().getSttProvider();
        
        if (sttProvider !== 'sherpa') {
            console.log('[SidecarIntegration] STT provider is not sherpa, skipping sidecar initialization');
            return false;
        }

        try {
            const workers = initializeSidecarWorkers();
            this.systemWorker = workers.system;
            this.micWorker = workers.mic;
            
            this.setupEventForwarding();
            this.isInitialized = true;
            console.log('[SidecarIntegration] Sidecar workers initialized successfully');
            return true;
        } catch (error) {
            console.error('[SidecarIntegration] Failed to initialize sidecar workers:', error);
            return false;
        }
    }

    private setupEventForwarding(): void {
        if (!this.systemWorker || !this.micWorker) return;

        this.systemWorker.on('token', (token: any) => {
            this.forwardTranscript('interviewer', token);
        });

        this.micWorker.on('token', (token: any) => {
            this.forwardTranscript('user', token);
        });

        this.systemWorker.on('status', (status: any) => {
            this.forwardStatus(status);
        });

        this.micWorker.on('status', (status: any) => {
            this.forwardStatus(status);
        });
    }

    private forwardTranscript(speaker: 'user' | 'interviewer', token: any): void {
        if (!this.isActive && !this.appState['_isDraining']) return;

        const payload: TranscriptPayload = {
            speaker,
            text: token.text,
            timestamp: token.timestamp,
            final: token.isFinal,
            confidence: token.confidence,
        };

        this.appState['intelligenceManager'].handleTranscript(payload);

        if (token.isFinal && this.appState['ragManager']) {
            this.appState['ragManager'].feedLiveTranscript([{
                speaker,
                text: token.text,
                timestamp: token.timestamp,
            }]);
        }

        const helper = this.appState.getWindowHelper();
        helper.getLauncherWindow()?.webContents.send('native-audio-transcript', payload);
        helper.getOverlayWindow()?.webContents.send('native-audio-transcript', payload);

        if (token.isFinal && speaker === 'interviewer') {
            this.appState['knowledgeOrchestrator']?.feedInterviewerUtterance?.(token.text);
        }
    }

    private forwardStatus(status: any): void {
        this.appState.broadcast('stt-status', {
            state: status.state,
            provider: 'sherpa',
            error: status.error,
            channel: status.channel,
        });
    }

    public start(): void {
        if (!this.isInitialized || !this.systemWorker || !this.micWorker) return;
        this.isActive = true;
        this.systemWorker.start();
        this.micWorker.start();
        console.log('[SidecarIntegration] Sidecar workers started');
    }

    public stop(): void {
        this.isActive = false;
        this.systemWorker?.stop();
        this.micWorker?.stop();
        console.log('[SidecarIntegration] Sidecar workers stopped');
    }

    public writeSystemAudio(chunk: Buffer): void {
        this.systemWorker?.write(chunk);
    }

    public writeMicAudio(chunk: Buffer): void {
        this.micWorker?.write(chunk);
    }

    public setSystemSampleRate(rate: number): void {
        this.systemWorker?.setSampleRate(rate);
    }

    public setMicSampleRate(rate: number): void {
        this.micWorker?.setSampleRate(rate);
    }

    public notifySystemSpeechEnded(): void {
        this.systemWorker?.write(Buffer.alloc(0));
    }

    public notifyMicSpeechEnded(): void {
        this.micWorker?.write(Buffer.alloc(0));
    }

    public getStats() {
        return {
            system: this.systemWorker?.getStats(),
            mic: this.micWorker?.getStats(),
            isInitialized: this.isInitialized,
            isActive: this.isActive,
        };
    }

    public destroy(): void {
        this.stop();
        shutdownSidecarWorkers();
        this.systemWorker = null;
        this.micWorker = null;
        this.isInitialized = false;
        this.removeAllListeners();
        console.log('[SidecarIntegration] Destroyed');
    }
}

let sidecarIntegration: SidecarIntegration | null = null;

export function getSidecarIntegration(appState: AppState): SidecarIntegration {
    if (!sidecarIntegration) {
        sidecarIntegration = new SidecarIntegration(appState);
    }
    return sidecarIntegration;
}

export function destroySidecarIntegration(): void {
    sidecarIntegration?.destroy();
    sidecarIntegration = null;
}