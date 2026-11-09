import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface NodeWhisperSTTConfig {
  engineType: 'package' | 'manual';
  selectedModel: string;
  customModelPath: string;
  endpointUrl: string;
}

function float32ToWav(audio: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = audio.length * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < audio.length; i++) {
    const sample = Math.max(-1, Math.min(1, audio[i]));
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    buffer.writeInt16LE(Math.round(int16), 44 + i * 2);
  }

  return buffer;
}

export class NodeWhisperSTT extends EventEmitter {
  private _config: NodeWhisperSTTConfig | null = null;
  private _tmpDir: string;
  private _counter = 0;

  constructor(config?: NodeWhisperSTTConfig) {
    super();
    if (config) this._config = config;
    this._tmpDir = path.join(app.getPath('userData'), 'whisper-tmp');
    if (!fs.existsSync(this._tmpDir)) {
      fs.mkdirSync(this._tmpDir, { recursive: true });
    }
  }

  updateConfig(config: NodeWhisperSTTConfig): void {
    this._config = config;
  }

  getConfig(): NodeWhisperSTTConfig | null {
    return this._config;
  }

  async transcribe(audio: Float32Array, sampleRate: number): Promise<{ text: string; segments: { start: number; end: number; speech: string }[] }> {
    if (!this._config) {
      this.emit('error', new Error('NodeWhisperSTT not configured'));
      return { text: '', segments: [] };
    }

    const wavPath = path.join(this._tmpDir, `chunk_${this._counter++}_${Date.now()}.wav`);

    try {
      const wavBuffer = float32ToWav(audio, sampleRate);
      fs.writeFileSync(wavPath, wavBuffer);

      let result: { text: string; segments: { start: number; end: number; speech: string }[] } = { text: '', segments: [] };

      if (this._config.engineType === 'manual' && this._config.endpointUrl) {
        result = await this._transcribeViaEndpoint(wavPath);
      } else {
        result = await this._transcribeViaPackage(wavPath);
      }

      return result;
    } catch (err: any) {
      this.emit('error', err);
      return { text: '', segments: [] };
    } finally {
      try { fs.unlinkSync(wavPath); } catch {}
    }
  }

  private async _transcribeViaPackage(wavPath: string): Promise<{ text: string; segments: { start: number; end: number; speech: string }[] }> {
    const { whisper } = require('whisper-node');

    const options: any = {};
    if (this._config!.customModelPath) {
      options.modelPath = this._config!.customModelPath;
    } else if (this._config!.selectedModel) {
      options.modelName = this._config!.selectedModel;
    }
    options.whisperOptions = { word_timestamps: false };

    const transcript = await whisper(wavPath, options);
    const text = transcript.map((t: any) => t.speech).join(' ').trim();
    return { text, segments: transcript || [] };
  }

  private async _transcribeViaEndpoint(wavPath: string): Promise<{ text: string; segments: { start: number; end: number; speech: string }[] }> {
    const audioBuffer = fs.readFileSync(wavPath);
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');

    const res = await fetch(this._config!.endpointUrl, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new Error(`Whisper endpoint returned ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const text = (data.text || data.transcript || '').trim();
    return { text, segments: data.segments || [] };
  }

  destroy(): void {
    this.removeAllListeners();
    try { fs.rmSync(this._tmpDir, { recursive: true, force: true }); } catch {}
  }
}
