import { EventEmitter } from 'events';

export interface LiveTranscriberConfig {
  modelId?: string;
  cacheDir?: string;
}

export class LiveTranscriber extends EventEmitter {
  private _isReady = false;
  private _isActive = false;

  constructor(config?: LiveTranscriberConfig) {
    super();
  }

  async start(): Promise<void> {
    if (this._isActive) return;
    this._isActive = true;
    this._isReady = true;
    this.emit('ready');
  }

  transcribe(data: { text: string }): void {
    if (!this._isActive || !this._isReady) return;
    const text = (data.text || '').trim();
    if (!text) return;
    this.emit('transcript', { text, isFinal: true });
  }

  async stop(): Promise<void> {
    this._isActive = false;
    this._isReady = false;
  }
}
