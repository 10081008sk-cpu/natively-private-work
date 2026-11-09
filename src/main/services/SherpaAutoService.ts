// src/main/services/SherpaAutoService.ts
/// <reference path="../../types/sherpa-onnx-node.d.ts" />

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import sherpa_onnx, {
  OfflineRecognizer,
  OfflineRecognizerResult,
  SpeechSegment,
  Vad,
} from 'sherpa-onnx-node';

const MODEL_DIR_NAME = 'sherpa-multilingual-auto';
const VAD_MODEL_FILE = 'silero_vad.onnx';
const ENCODER_FILE = 'base-encoder.int8.onnx';
const DECODER_FILE = 'base-decoder.int8.onnx';
const TOKENS_FILE = 'base-tokens.txt';
const SAMPLE_RATE = 16000;

/**
 * Fully-offline multilingual STT (Sherpa-ONNX + Silero VAD + Whisper base int8).
 *
 * Audio path:
 *   Int16LE PCM (any rate) ──resample──▶ Float32 @16 kHz
 *     ──▶ Silero VAD (per channel) ──▶ complete speech segments
 *     ──▶ OfflineRecognizer (shared, Whisper base int8) ──▶ text
 *
 * The VAD is what guarantees "zero hallucination during silence": the decoder
 * is never invoked unless Silero actually detected speech. One recognizer is
 * shared by both channels; VAD state is kept per channel so mic and system
 * audio cannot flush each other's partial segment.
 */
export class SherpaAutoService {
  private recognizer: OfflineRecognizer | null = null;
  private readonly vads = new Map<string, Vad>();
  private modelDir: string | null = null;
  private initError: string | null = null;

  constructor() {
    this.init();
  }

  public static getInstance(): SherpaAutoService {
    if (!this.instance) {
      this.instance = new SherpaAutoService();
    }
    return this.instance;
  }

  private static instance: SherpaAutoService | null = null;

  public isReady(): boolean {
    return this.recognizer !== null;
  }

  public getInitError(): string | null {
    return this.initError;
  }

  public getModelDir(): string | null {
    return this.modelDir;
  }

  /**
   * Resolve `resources/models/sherpa-multilingual-auto/` for both layouts:
   *
   *  - Development: `app.getAppPath()` is the repository root, so the model
   *    lives at `<root>/resources/models/...`.
   *  - Packaged: electron-builder copies `resources/models` to
   *    `<resources>/assets/models` (see `extraResources` in package.json),
   *    i.e. `<process.resourcesPath>/assets/models/...`.
   *
   * `__dirname` fallbacks are also provided because esbuild bundles this file
   * into `dist-electron/electron` (or `dist-electron/src/main/services` under
   * `tsc`), where a fixed number of `..` segments is unreliable.
   */
  private resolveModelDir(): string | null {
    const candidates: string[] = [];
    // `app` / `process.resourcesPath` are unavailable outside Electron (tests).
    const safe = <T,>(read: () => T, fallback: T): T => {
      try { return read(); } catch { return fallback; }
    };
    const appPath = safe(() => app.getAppPath(), '');
    const resourcesPath = safe(() => process.resourcesPath || '', '');
    const isPackaged = safe(() => app.isPackaged, false);

    if (isPackaged && resourcesPath) {
      candidates.push(path.join(resourcesPath, 'assets', 'models', MODEL_DIR_NAME));
      candidates.push(path.join(resourcesPath, 'models', MODEL_DIR_NAME));
    }

    if (appPath) {
      candidates.push(path.join(appPath, 'resources', 'models', MODEL_DIR_NAME));
      candidates.push(path.join(appPath, 'assets', 'models', MODEL_DIR_NAME));
    }

    candidates.push(path.join(process.cwd(), 'resources', 'models', MODEL_DIR_NAME));

    // dist-electron/src/main/services/SherpaAutoService.js → repo root
    candidates.push(path.join(__dirname, '..', '..', '..', '..', 'resources', 'models', MODEL_DIR_NAME));
    // dist-electron/electron/main.js (bundled) → repo root
    candidates.push(path.join(__dirname, '..', '..', 'resources', 'models', MODEL_DIR_NAME));

    const seen = new Set<string>();
    for (const dir of candidates) {
      if (!dir || seen.has(dir)) continue;
      seen.add(dir);
      if (this.looksLikeModelDir(dir)) return dir;
    }

    return null;
  }

  private looksLikeModelDir(dir: string): boolean {
    const required = [VAD_MODEL_FILE, ENCODER_FILE, DECODER_FILE, TOKENS_FILE];
    return required.every((file) => {
      try {
        return fs.existsSync(path.join(dir, file));
      } catch {
        return false;
      }
    });
  }

  private init(): void {
    try {
      const modelDir = this.resolveModelDir();
      if (!modelDir) {
        this.initError =
          `Sherpa model directory "${MODEL_DIR_NAME}" was not found. Expected ` +
          `resources/models/${MODEL_DIR_NAME} in development or ` +
          `resources/assets/models/${MODEL_DIR_NAME} in a packaged build.`;
        console.error(`[SherpaAuto] ${this.initError}`);
        return;
      }

      this.modelDir = modelDir;

      // Multilingual Whisper int8. `language: ''` lets Whisper auto-detect the
      // language and tolerate code-switching (e.g. Hindi + English).
      this.recognizer = new sherpa_onnx.OfflineRecognizer({
        featConfig: {
          sampleRate: SAMPLE_RATE,
          featureDim: 80,
        },
        modelConfig: {
          whisper: {
            encoder: path.join(modelDir, ENCODER_FILE),
            decoder: path.join(modelDir, DECODER_FILE),
            language: '',
            task: 'transcribe',
          },
          tokens: path.join(modelDir, TOKENS_FILE),
          numThreads: 1, // Keep CPU usage reasonable on low-RAM laptops / dual-core.
          provider: 'cpu',
          debug: 0,
        },
        decodingMethod: 'greedy_search',
      });

      console.log(`[SherpaAuto] Multilingual recognizer ready (${modelDir})`);
    } catch (err: any) {
      this.recognizer = null;
      this.initError = err?.message ?? String(err);
      console.error('[SherpaAuto] Failed to initialise recognizer:', err);
    }
  }

  private createVad(): Vad | null {
    if (!this.modelDir) return null;
    try {
      return new sherpa_onnx.Vad(
        {
          sileroVad: {
            model: path.join(this.modelDir, VAD_MODEL_FILE),
            threshold: 0.45, // Tuned for strong vocal commands
            minSpeechDuration: 0.25, // 250ms
            minSilenceDuration: 0.3, // 300ms
            windowSize: 512,
            maxSpeechDuration: 20,
          },
          sampleRate: SAMPLE_RATE,
          numThreads: 1,
          provider: 'cpu',
          debug: 0,
        },
        60
      );
    } catch (err: any) {
      this.initError = this.initError ?? (err?.message ?? String(err));
      console.error('[SherpaAuto] Failed to create VAD:', err);
      return null;
    }
  }

  private getOrCreateVad(channel: string): Vad | null {
    const existing = this.vads.get(channel);
    if (existing) return existing;
    const created = this.createVad();
    if (created) this.vads.set(channel, created);
    return created;
  }

  public processChunk(pcmChunk16kHz: Float32Array, channel: string = 'default'): string {
    if (!this.recognizer || !pcmChunk16kHz || pcmChunk16kHz.length === 0) {
      return '';
    }

    const vad = this.getOrCreateVad(channel);
    if (!vad) return '';

    try {
      vad.acceptWaveform(pcmChunk16kHz);
      return this.drainSegments(vad);
    } catch (err: any) {
      console.error('[SherpaAuto] processChunk failed:', err);
      return '';
    }
  }

  public flush(channel: string = 'default'): string {
    if (!this.recognizer) return '';
    const vad = this.vads.get(channel);
    if (!vad) return '';

    try {
      vad.flush();
      return this.drainSegments(vad);
    } catch (err: any) {
      console.error('[SherpaAuto] flush failed:', err);
      return '';
    }
  }

  public reset(channel?: string): void {
    if (channel) {
      const vad = this.vads.get(channel);
      if (vad) {
        try {
          vad.clear();
        } catch {
          // Ignore native teardown races.
        }
      }
      this.vads.delete(channel);
      return;
    }

    for (const vad of this.vads.values()) {
      try {
        vad.clear();
      } catch {
        // Ignore native teardown races.
      }
    }
    this.vads.clear();
  }

  private drainSegments(vad: Vad): string {
    const pieces: string[] = [];
    let guard = 0;

    while (!vad.isEmpty() && guard < 64) {
      guard++;

      let segment: SpeechSegment | undefined;

      try {
        segment = vad.front(false);
        console.log(
  "[SherpaAuto] Segment samples:",
  segment?.samples?.length
);

        console.log(
          `[SherpaAuto] Segment received, samples=${segment?.samples?.length ?? 0}`
        );
      } catch (err: any) {
        console.error(
          '[SherpaAuto] Failed to read VAD segment:',
          err
        );
        break;
      } finally {
        if (!vad.isEmpty()) {
          vad.pop();
        }
      }

      if (!segment?.samples?.length) {
        continue;
      }

      const text = this.decodeSegment(segment.samples);

      console.log('[SherpaAuto] Decoded text:', text);

      if (text?.trim()) {
        pieces.push(text.trim());
      }
    }

    return pieces.join(' ').replace(/\s+/g, ' ').trim();
  }

  private decodeSegment(samples: Float32Array): string {
    if (!this.recognizer) return '';

    const stream = this.recognizer.createStream();
    try {
      stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
      this.recognizer.decode(stream);
      const result: OfflineRecognizerResult = this.recognizer.getResult(stream);
      return (result?.text ?? '').trim();
    } catch (err: any) {
      console.error('[SherpaAuto] decode failed:', err);
      return '';
    }
  }
}

export const sherpaAutoService = new SherpaAutoService();
