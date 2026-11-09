import { EventEmitter } from 'events';

export interface AudioSegment {
  speaker: 'interviewer' | 'user' | 'noise';
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export interface DiarizationConfig {
  sampleRate: number;
  languages: string[];
}

export class AudioPipeline extends EventEmitter {
  private _isRunning = false;

    async start(inputDeviceId: string): Promise<void> {
      // 🌟 Hard-stop this dummy fallback script so it doesn't hijack our Local Whisper stream!
      console.log('[AudioPipeline] Local Whisper is active. Bypassing Web Speech dummy fallback loop.');
      this._isRunning = false;
      return;
    }

  processText(text: string, speaker: string): void {
    if (!this._isRunning || !text.trim()) return;
    this.emit('transcript', {
      text: text.trim(),
      speaker,
      isFinal: true,
      timestamp: Date.now(),
    });
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return;
    this._isRunning = false;
    console.log('[AudioPipeline] Stopped');
  }

  get isRunning(): boolean {
    return this._isRunning;
  }
}
