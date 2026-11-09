/**
 * Minimal ambient typings for `sherpa-onnx-node` (v2.x).
 *
 * The package ships no `.d.ts` file, but the project runs with
 * `noImplicitAny: true`, so we declare only the surface we actually use:
 * the offline recognizer (Whisper) and the Silero VAD.
 */

declare module 'sherpa-onnx-node' {
  export interface FeatureConfig {
    sampleRate?: number;
    featureDim?: number;
  }

  export interface SileroVadModelConfig {
    model?: string;
    threshold?: number;
    minSilenceDuration?: number;
    minSpeechDuration?: number;
    windowSize?: number;
    maxSpeechDuration?: number;
  }

  export interface VadConfig {
    sileroVad?: SileroVadModelConfig;
    sampleRate?: number;
    numThreads?: number;
    provider?: string;
    debug?: boolean | number;
  }

  /** A detected speech segment returned by `Vad.front()`. */
  export interface SpeechSegment {
    samples: Float32Array;
    start: number;
  }

  export class Vad {
    constructor(config: VadConfig, bufferSizeInSeconds?: number);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    pop(): void;
    clear(): void;
    front(enableExternalBuffer?: boolean): SpeechSegment;
    reset(): void;
    flush(): void;
  }

  export interface OfflineWhisperModelConfig {
    encoder?: string;
    decoder?: string;
    language?: string;
    task?: string;
    tailPaddings?: number;
  }

  export interface OfflineModelConfig {
    whisper?: OfflineWhisperModelConfig;
    tokens?: string;
    numThreads?: number;
    debug?: boolean | number;
    provider?: string;
  }

  export interface OfflineRecognizerConfig {
    featConfig?: FeatureConfig;
    modelConfig?: OfflineModelConfig;
    decodingMethod?: string;
    maxActivePaths?: number;
    hotwordsFile?: string;
    hotwordsScore?: number;
    ruleFsts?: string;
    ruleFars?: string;
  }

  export interface OfflineRecognizerResult {
    text: string;
    lang?: string;
    emotion?: string;
    event?: string;
    timestamps?: number[];
    durations?: number[];
    tokens?: string[];
    words?: string[];
  }

  export interface Waveform {
    samples: Float32Array;
    sampleRate: number;
  }

  export class OfflineStream {
    acceptWaveform(waveform: Waveform): void;
    setOption(key: string, value: string): void;
  }

  export class OfflineRecognizer {
    constructor(config: OfflineRecognizerConfig);
    static createAsync(config: OfflineRecognizerConfig): Promise<OfflineRecognizer>;
    createStream(hotwords?: string): OfflineStream;
    setConfig(config: OfflineRecognizerConfig): void;
    decode(stream: OfflineStream): void;
    decodeAsync(stream: OfflineStream): Promise<OfflineRecognizerResult>;
    getResult(stream: OfflineStream): OfflineRecognizerResult;
  }

  const sherpa_onnx: {
    Vad: typeof Vad;
    OfflineRecognizer: typeof OfflineRecognizer;
  };

  export default sherpa_onnx;
}
