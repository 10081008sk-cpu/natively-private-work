import { EventEmitter } from 'events';
import { resampleToF32 } from './whisper/audioResampler';
import { sherpaAutoService } from '../../src/main/services/SherpaAutoService';

interface SherpaTranscript {
  text: string;
  isFinal: boolean;
  confidence: number;
}

/**
 * Adapter that exposes the shared `SherpaAutoService` singleton through the
 * same EventEmitter surface as the other STT providers, so `createSTTProvider`
 * can reuse its transcript / error / status wiring unchanged.
 *
 * Capture chunks arrive as Int16LE PCM at the native device rate. They are
 * resampled to 16 kHz Float32 before being handed to the VAD + recognizer.
 *
 * Each instance owns one VAD channel ('system' for interviewer, 'mic' for the
 * user) but all instances share the single Whisper recognizer.
 */
export class SherpaSTT extends EventEmitter {
  private readonly channel: string;
  private inputSampleRate = 48000;
  private isActive = false;
  private lastErrorAt = 0;

  constructor(channel: string = 'default') {
    super();
    this.channel = channel;

    if (!sherpaAutoService.isReady()) {
      // Throwing lets the existing createSTTProvider() try/catch surface a
      // terminal "provider failed to initialize" banner instead of silently
      // producing an empty transcript for the whole meeting.
      throw new Error(
        sherpaAutoService.getInitError() ||
        'Sherpa-ONNX STT is not initialized. Check that the sherpa-multilingual-auto model is installed.',
      );
    }
  }

  start(): void {
    if (this.isActive) return;
    this.isActive = true;
    // Fresh meeting → drop any buffered partial speech from a previous run.
    sherpaAutoService.reset(this.channel);
  }

  stop(): void {
    if (this.isActive) {
      this.flush();
    }
    this.isActive = false;
    sherpaAutoService.reset(this.channel);
  }

  finalize(): void {
    this.flush();
  }

  notifySpeechEnded(): void {
    this.flush();
  }

  write(chunk: Buffer): void {
    if (!this.isActive || !chunk || chunk.length === 0) return;

    try {
      const samples = resampleToF32(chunk, this.inputSampleRate);
      const text = sherpaAutoService.processChunk(samples, this.channel);
      this.emitTranscript(text);
    } catch (err: any) {
      this.reportError(err);
    }
  }

  setSampleRate(rate: number): void {
    if (Number.isFinite(rate) && rate > 0) {
      this.inputSampleRate = rate;
    }
  }

  setAudioChannelCount(_count: number): void {
    // Capture is mono; nothing to do.
  }

  setRecognitionLanguage(_language: string): void {
    // Whisper multilingual runs with language: '' (auto-detect).
  }

  setCredentials(_path: string): void {
    // Local model — no credentials required.
  }

  private flush(): void {
    try {
      const text = sherpaAutoService.flush(this.channel);
      this.emitTranscript(text);
    } catch (err: any) {
      this.reportError(err);
    }
  }

  private emitTranscript(text: string): void {
    const cleaned = (text || '').trim();
    if (!cleaned) return;

    const segment: SherpaTranscript = {
      text: cleaned,
      isFinal: true,
      confidence: 0.9,
    };
    this.emit('transcript', segment);
  }

  private reportError(err: any): void {
    const now = Date.now();
    // Rate-limit: a broken decoder would otherwise emit on every 20ms chunk.
    if (now - this.lastErrorAt < 5000) return;
    this.lastErrorAt = now;

    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[SherpaSTT:${this.channel}]`, error);
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    }
  }
}
