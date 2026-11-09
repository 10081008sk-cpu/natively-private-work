/**
 * STT Sidecar Worker
 * Runs in isolated Electron utilityProcess with WASAPI capture, Silero VAD, Sherpa-ONNX
 * Communicates via MessagePort for zero-latency transcript streaming
 */

import { MessagePort } from 'worker_threads';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';

// Type definitions for Sherpa-ONNX
interface SherpaOnnxModule {
  OfflineRecognizer: new (config: any) => OfflineRecognizer;
  Vad: new (config: any, bufferSize: number) => Vad;
  setSessionOptions: (options: any) => void;
  OfflineRecognizerResult: any;
  SpeechSegment: any;
}

interface OfflineRecognizer {
  createStream(): RecognizerStream;
  decode(stream: RecognizerStream): void;
  getResult(stream: RecognizerStream): OfflineRecognizerResult;
}

interface RecognizerStream {
  acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
}

interface Vad {
  acceptWaveform(samples: Float32Array): void;
  isEmpty(): boolean;
  front(allowEmpty: boolean): SpeechSegment | undefined;
  pop(): void;
  flush(): void;
}

interface SpeechSegment {
  samples: Float32Array;
  start: number;
  end: number;
}

// Configuration
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const RING_BUFFER_SECONDS = 5;
const FRAME_SIZE = 512;
const VAD_THRESHOLD = 0.45;
const MIN_SILENCE_DURATION_MS = 300;
const SPEECH_PAD_MS = 80;
const MIN_SPEECH_DURATION_MS = 250;
const MAX_SPEECH_DURATION_S = 20;
const CONFIDENCE_THRESHOLD = 0.65;
const BLANK_TOKEN_RATIO_THRESHOLD = 0.7;

interface SidecarConfig {
  modelDir: string;
  channel: 'system' | 'mic';
  enableVAD: boolean;
  enableHallucinationFilter: boolean;
  enableDirectML: boolean;
}

interface STTToken {
  type: 'stt:token';
  text: string;
  isFinal: boolean;
  channel: 'system' | 'mic';
  confidence: number;
  timestamp: number;
}

interface VADEvent {
  type: 'vad:speech_start' | 'vad:speech_end';
  channel: 'system' | 'mic';
  timestamp: number;
}

interface StatusEvent {
  type: 'stt:status';
  state: 'connected' | 'reconnecting' | 'failed';
  channel: 'system' | 'mic';
  error?: string;
  timestamp: number;
}

type SidecarMessage = STTToken | VADEvent | StatusEvent;

class AudioRingBuffer {
  private buffer: Float32Array;
  private writeIndex = 0;
  private readIndex = 0;
  private size: number;
  private capacity: number;

  constructor(capacitySeconds: number, sampleRate: number, channels: number) {
    this.capacity = capacitySeconds * sampleRate * channels;
    this.buffer = new Float32Array(this.capacity);
    this.size = 0;
  }

  write(samples: Float32Array): number {
    const samplesToWrite = Math.min(samples.length, this.capacity - this.size);
    if (samplesToWrite <= 0) return 0;

    const firstPart = Math.min(samplesToWrite, this.capacity - this.writeIndex);
    this.buffer.set(samples.subarray(0, firstPart), this.writeIndex);
    this.writeIndex = (this.writeIndex + firstPart) % this.capacity;

    if (firstPart < samplesToWrite) {
      this.buffer.set(samples.subarray(firstPart, samplesToWrite), 0);
      this.writeIndex = samplesToWrite - firstPart;
    }

    this.size += samplesToWrite;
    return samplesToWrite;
  }

  read(output: Float32Array, count: number): number {
    const samplesToRead = Math.min(count, this.size);
    if (samplesToRead <= 0) return 0;

    const firstPart = Math.min(samplesToRead, this.capacity - this.readIndex);
    output.set(this.buffer.subarray(this.readIndex, this.readIndex + firstPart), 0);
    this.readIndex = (this.readIndex + firstPart) % this.capacity;

    if (firstPart < samplesToRead) {
      output.set(this.buffer.subarray(0, samplesToRead - firstPart), firstPart);
      this.readIndex = samplesToRead - firstPart;
    }

    this.size -= samplesToRead;
    return samplesToRead;
  }

  peekAvailable(mode: 'vad' | 'decoder'): number {
    return this.size;
  }

  reset(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.size = 0;
    this.buffer.fill(0);
  }

  getStats() {
    return {
      size: this.size,
      capacity: this.capacity,
      utilization: this.size / this.capacity,
    };
  }
}

function createAudioRingBuffer(config: { sampleRate: number; capacitySeconds: number; channels: number }): AudioRingBuffer {
  return new AudioRingBuffer(config.capacitySeconds, config.sampleRate, config.channels);
}

function resampleToF32(input: Buffer, inputSampleRate: number): Float32Array {
  // Simple linear interpolation resampling
  // In production, use a proper resampler like speex-resampler or rubato
  const outputSampleRate = SAMPLE_RATE;
  const ratio = inputSampleRate / outputSampleRate;
  const inputLength = input.length / 2; // Int16 = 2 bytes per sample
  const outputLength = Math.round(inputLength / ratio);
  const output = new Float32Array(outputLength);

  const inputView = new Int16Array(input.buffer, input.byteOffset, inputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const frac = srcIndex - srcIndexFloor;

    if (srcIndexFloor + 1 < inputLength) {
      const sample1 = inputView[srcIndexFloor] / 32768.0;
      const sample2 = inputView[srcIndexFloor + 1] / 32768.0;
      output[i] = sample1 + frac * (sample2 - sample1);
    } else if (srcIndexFloor < inputLength) {
      output[i] = inputView[srcIndexFloor] / 32768.0;
    } else {
      output[i] = 0;
    }
  }

  return output;
}

class STTSidecarWorker extends EventEmitter {
  private recognizer: OfflineRecognizer | null = null;
  private vad: Vad | null = null;
  private ringBuffer: AudioRingBuffer;
  private config: SidecarConfig;
  private modelDir: string;
  private isRunning = false;
  private isProcessing = false;
  private inputSampleRate = 48000;
  private lastErrorAt = 0;
  private pendingSamples = new Float32Array(0);
  private speechDetected = false;
  private silenceFrames = 0;
  private speechFrames = 0;
  private readonly vadFrameSize = FRAME_SIZE;
  private readonly samplesPerVADFrame = FRAME_SIZE;
  private readonly silenceFrameThreshold: number;
  private readonly speechPadFrames: number;
  private readonly minSpeechFrames: number;
  private readonly maxSpeechFrames: number;
  private audioLevel = 0;
  private rmsThreshold = 0.001;
  private messagePort: MessagePort | null = null;
  private preflightPassed = false;

  constructor(config: SidecarConfig, messagePort: MessagePort) {
    super();
    this.config = config;
    this.modelDir = config.modelDir;
    this.messagePort = messagePort;

    this.ringBuffer = createAudioRingBuffer({
      sampleRate: SAMPLE_RATE,
      capacitySeconds: RING_BUFFER_SECONDS,
      channels: CHANNELS,
    });

    this.silenceFrameThreshold = Math.ceil((MIN_SILENCE_DURATION_MS / 1000) * SAMPLE_RATE / this.vadFrameSize);
    this.speechPadFrames = Math.ceil((SPEECH_PAD_MS / 1000) * SAMPLE_RATE / this.vadFrameSize);
    this.minSpeechFrames = Math.ceil((MIN_SPEECH_DURATION_MS / 1000) * SAMPLE_RATE / this.vadFrameSize);
    this.maxSpeechFrames = Math.ceil(MAX_SPEECH_DURATION_S * SAMPLE_RATE / this.vadFrameSize);

    this.setupMessagePort();
    this.initialize();
  }

  private setupMessagePort(): void {
    if (!this.messagePort) return;

    this.messagePort.on('message', (message: any) => {
      this.handleMessage(message);
    });

    this.messagePort.on('close', () => {
      this.stop();
      this.emit('close');
    });

    this.messagePort.on('error', (error) => {
      console.error(`[STTSidecar:${this.config.channel}] MessagePort error:`, error);
      this.emit('error', error);
    });

    // Start the port
    this.messagePort.start();
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'audio':
        if (message.data) {
          this.writeAudio(message.data);
        }
        break;
      case 'start':
        this.start();
        break;
      case 'stop':
        this.stop();
        break;
      case 'setSampleRate':
        if (typeof message.sampleRate === 'number') {
          this.setSampleRate(message.sampleRate);
        }
        break;
      case 'speechEnded':
        this.notifySpeechEnded();
        break;
      case 'getStats':
        this.sendStats();
        break;
      case 'ping':
        this.send({ type: 'pong', timestamp: Date.now() });
        break;
    }
  }

  private send(message: any): void {
    if (this.messagePort && !this.messagePort.destroyed) {
      this.messagePort.postMessage(message);
    }
  }

  private initialize(): void {
    try {
      this.setupONNXRuntime();
      this.createRecognizer();
      if (this.config.enableVAD) {
        this.createVAD();
      }
      this.runPreflightProbe();
      this.emit('status', {
        type: 'stt:status',
        state: 'connected',
        channel: this.config.channel,
        timestamp: Date.now(),
      } as any);
      console.log(`[STTSidecar:${this.config.channel}] Initialized successfully`);
    } catch (error) {
      console.error(`[STTSidecar:${this.config.channel}] Initialization failed:`, error);
      this.emit('status', {
        type: 'stt:status',
        state: 'failed',
        channel: this.config.channel,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      } as any);
    }
  }

  private setupONNXRuntime(): void {
    const cpuCount = os.cpus().length;
    const intraOpThreads = Math.max(2, Math.min(4, cpuCount - 2));
    const interOpThreads = 1;

    try {
      // Dynamic import for Sherpa-ONNX
      const sherpa = require('sherpa-onnx-node');

      // Try DirectML first if enabled
      if (this.config.enableDirectML) {
        try {
          sherpa.setSessionOptions({
            intra_op_num_threads: intraOpThreads,
            inter_op_num_threads: interOpThreads,
            execution_mode: 'sequential',
            graph_optimization_level: 'all',
            // DirectML provider configuration
            provider: 'dml',
            provider_options: {
              device_id: '0',
            },
          });
          console.log(`[STTSidecar:${this.config.channel}] DirectML enabled`);
        } catch (dmlError) {
          console.warn(`[STTSidecar:${this.config.channel}] DirectML failed, falling back to CPU:`, dmlError);
          // Fallback to CPU
          sherpa.setSessionOptions({
            intra_op_num_threads: intraOpThreads,
            inter_op_num_threads: interOpThreads,
            execution_mode: 'sequential',
            graph_optimization_level: 'all',
            provider: 'cpu',
          });
        }
      } else {
        sherpa.setSessionOptions({
          intra_op_num_threads: intraOpThreads,
          inter_op_num_threads: interOpThreads,
          execution_mode: 'sequential',
          graph_optimization_level: 'all',
          provider: 'cpu',
        });
      }

      console.log(`[STTSidecar:${this.config.channel}] ONNX threads: intra=${intraOpThreads}, inter=${interOpThreads} (CPU cores: ${cpuCount})`);
    } catch (error) {
      console.warn(`[STTSidecar:${this.config.channel}] Could not set ONNX session options:`, error);
    }
  }

  private createRecognizer(): void {
    const sherpa = require('sherpa-onnx-node');

    const encoderPath = path.join(this.modelDir, 'base-encoder.int8.onnx');
    const decoderPath = path.join(this.modelDir, 'base-decoder.int8.onnx');
    const tokensPath = path.join(this.modelDir, 'base-tokens.txt');

    // Verify model files exist
    for (const file of [encoderPath, decoderPath, tokensPath]) {
      if (!require('fs').existsSync(file)) {
        throw new Error(`Model file not found: ${file}`);
      }
    }

    this.recognizer = new sherpa.OfflineRecognizer({
      featConfig: {
        sampleRate: SAMPLE_RATE,
        featureDim: 80,
      },
      modelConfig: {
        whisper: {
          encoder: encoderPath,
          decoder: decoderPath,
          language: '',
          task: 'transcribe',
        },
        tokens: tokensPath,
        numThreads: Math.max(2, Math.min(4, require('os').cpus().length - 2)),
        provider: this.config.enableDirectML ? 'dml' : 'cpu',
        debug: 0,
      },
      decodingMethod: 'greedy_search',
    });
  }

  private createVAD(): void {
    const sherpa = require('sherpa-onnx-node');
    const vadModelPath = path.join(this.modelDir, 'silero_vad.onnx');

    if (!require('fs').existsSync(vadModelPath)) {
      throw new Error(`VAD model not found: ${vadModelPath}`);
    }

    this.vad = new sherpa.Vad(
      {
        sileroVad: {
          model: vadModelPath,
          threshold: VAD_THRESHOLD,
          minSpeechDuration: MIN_SPEECH_DURATION_MS / 1000,
          minSilenceDuration: MIN_SILENCE_DURATION_MS / 1000,
          windowSize: FRAME_SIZE,
          maxSpeechDuration: MAX_SPEECH_DURATION_S,
        },
        sampleRate: SAMPLE_RATE,
        numThreads: 1,
        provider: this.config.enableDirectML ? 'dml' : 'cpu',
        debug: 0,
      },
      60 // buffer size in seconds
    );
  }

  private runPreflightProbe(): void {
    try {
      if (!this.recognizer || !this.vad) {
        throw new Error('Recognizer or VAD not initialized');
      }

      // Create 0.5 seconds of silent audio at 16kHz
      const silentSamples = new Float32Array(SAMPLE_RATE * 0.5);
      silentSamples.fill(0);

      // Run through VAD
      this.vad.acceptWaveform(silentSamples);

      // Run through recognizer
      const stream = this.recognizer.createStream();
      stream.acceptWaveform({ samples: silentSamples, sampleRate: SAMPLE_RATE });
      this.recognizer.decode(stream);
      const result = this.recognizer.getResult(stream);

      this.preflightPassed = true;
      console.log(`[STTSidecar:${this.config.channel}] Pre-flight probe passed`);
    } catch (error) {
      console.error(`[STTSidecar:${this.config.channel}] Pre-flight probe failed:`, error);
      this.preflightPassed = false;
      throw new Error(`Pre-flight probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.ringBuffer.reset();
    this.speechDetected = false;
    this.silenceFrames = 0;
    this.speechFrames = 0;
    this.pendingSamples = new Float32Array(0);
    console.log(`[STTSidecar:${this.config.channel}] Started`);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.flush();
    console.log(`[STTSidecar:${this.config.channel}] Stopped`);
  }

  public setSampleRate(rate: number): void {
    if (Number.isFinite(rate) && rate > 0) {
      this.inputSampleRate = rate;
    }
  }

  public writeAudio(audioData: ArrayBuffer | number[]): void {
    if (!this.isRunning) return;

    try {
      let samples: Float32Array;

      if (audioData instanceof ArrayBuffer) {
        // Convert Int16 to Float32
        const int16 = new Int16Array(audioData);
        samples = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          samples[i] = int16[i] / 32768.0;
        }
      } else if (Array.isArray(audioData)) {
        samples = new Float32Array(audioData);
      } else {
        return;
      }

      // Resample if needed
      if (this.inputSampleRate !== SAMPLE_RATE) {
        // Convert to buffer for resampling
        const int16Buffer = Buffer.alloc(samples.length * 2);
        const int16View = new Int16Array(int16Buffer.buffer);
        for (let i = 0; i < samples.length; i++) {
          int16View[i] = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)));
        }
        samples = resampleToF32(int16Buffer, this.inputSampleRate);
      }

      if (samples.length === 0) return;

      this.updateAudioLevel(samples);

      // Skip if below noise threshold
      if (this.audioLevel < this.rmsThreshold) {
        return;
      }

      this.ringBuffer.write(samples);
      this.processAvailableAudio();
    } catch (error) {
      this.reportError(error);
    }
  }

  private updateAudioLevel(samples: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    this.audioLevel = Math.sqrt(sum / samples.length);
  }

  private processAvailableAudio(): void {
    if (this.isProcessing || !this.vad) return;
    this.isProcessing = true;

    try {
      const available = this.ringBuffer.peekAvailable('vad');
      if (available < this.vadFrameSize) {
        this.isProcessing = false;
        return;
      }

      const framesToProcess = Math.floor(available / this.vadFrameSize);
      const tempBuffer = new Float32Array(this.vadFrameSize);

      for (let i = 0; i < framesToProcess; i++) {
        const read = this.ringBuffer.read(tempBuffer, this.vadFrameSize);
        if (read !== this.vadFrameSize) break;

        this.vad.acceptWaveform(tempBuffer);
        this.processVADSegments();
      }
    } catch (error) {
      this.reportError(error);
    } finally {
      this.isProcessing = false;
    }
  }

  private processVADSegments(): void {
    if (!this.vad || !this.recognizer) return;

    let guard = 0;
    while (!this.vad.isEmpty() && guard < 32) {
      guard++;

      let segment: SpeechSegment | undefined;
      try {
        segment = this.vad.front(false);
      } catch (error) {
        console.error(`[STTSidecar:${this.config.channel}] VAD front() error:`, error);
        break;
      }

      if (!segment?.samples?.length) {
        if (!this.vad.isEmpty()) this.vad.pop();
        continue;
      }

      const text = this.decodeSegment(segment.samples);
      const confidence = this.calculateConfidence(segment.samples, text);

      if (text.trim()) {
        this.emit('token', {
          type: 'stt:token',
          text: text.trim(),
          isFinal: true,
          channel: this.config.channel,
          confidence,
          timestamp: Date.now(),
        } as any);

        this.send({
          type: 'stt:token',
          text: text.trim(),
          isFinal: true,
          channel: this.config.channel,
          confidence,
          timestamp: Date.now(),
        });
      }

      if (!this.vad.isEmpty()) this.vad.pop();
    }
  }

  private decodeSegment(samples: Float32Array): string {
    if (!this.recognizer || !samples.length) return '';

    const stream = this.recognizer.createStream();
    try {
      stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
      this.recognizer.decode(stream);
      const result = this.recognizer.getResult(stream);
      return (result?.text ?? '').trim();
    } catch (error) {
      console.error(`[STTSidecar:${this.config.channel}] Decode error:`, error);
      return '';
    }
  }

  private calculateConfidence(samples: Float32Array, text: string): number {
    if (!text.trim()) return 0;

    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      energy += samples[i] * samples[i];
    }
    energy = Math.sqrt(energy / samples.length);

    const wordCount = text.trim().split(/\s+/).length;
    const duration = samples.length / SAMPLE_RATE;
    const wordsPerSecond = wordCount / duration;

    let confidence = 0.5;
    confidence += Math.min(0.3, energy * 10);
    confidence += Math.min(0.2, wordsPerSecond / 10);

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  private flush(): void {
    if (!this.vad || !this.recognizer) return;

    try {
      this.vad.flush();
      this.processVADSegments();
    } catch (error) {
      this.reportError(error);
    }
  }

  private notifySpeechEnded(): void {
    // Send empty buffer to flush VAD
    this.writeAudio(new Float32Array(0));
  }

  private sendStats(): void {
    this.send({
      type: 'stats',
      data: {
        ...this.ringBuffer.getStats(),
        channel: this.config.channel,
        isRunning: this.isRunning,
        audioLevel: this.audioLevel,
        speechDetected: this.speechDetected,
      },
    });
  }

  private reportError(error: any): void {
    const now = Date.now();
    if (now - this.lastErrorAt < 5000) return;
    this.lastErrorAt = now;

    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[STTSidecar:${this.config.channel}]`, err);

    this.emit('status', {
      type: 'stt:status',
      state: 'failed',
      channel: this.config.channel,
      error: err.message,
      timestamp: now,
    } as any);

    this.send({
      type: 'stt:status',
      state: 'failed',
      channel: this.config.channel,
      error: err.message,
      timestamp: now,
    });
  }

  public destroy(): void {
    this.stop();
    this.recognizer = null;
    this.vad = null;
    this.removeAllListeners();
    if (this.messagePort) {
      this.messagePort.close();
      this.messagePort = null;
    }
  }
}

// Main entry point when run as utilityProcess
if (require.main === module) {
  console.log('[STTSidecarWorker] Starting as utility process...');

  // Get MessagePort from parent process
  const { parentPort } = require('worker_threads');

  if (!parentPort) {
    console.error('[STTSidecarWorker] No parent port available');
    process.exit(1);
  }

  // Receive configuration from main process
  parentPort.once('message', (message: any) => {
    if (message.type === 'config' && message.config) {
      const worker = new STTSidecarWorker(message.config, parentPort);

      // Handle process shutdown
      process.on('SIGINT', () => {
        worker.destroy();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        worker.destroy();
        process.exit(0);
      });

      console.log('[STTSidecarWorker] Worker initialized and ready');
    }
  });

  // Signal ready to receive config
  parentPort.postMessage({ type: 'ready' });
}

// Global sidecar instances for backward compatibility
let systemWorkerInstance: STTSidecarWorker | null = null;
let micWorkerInstance: STTSidecarWorker | null = null;

export function initializeSidecarWorkers(config: SidecarConfig): { system: STTSidecarWorker; mic: STTSidecarWorker } {
  if (!systemWorkerInstance) {
    systemWorkerInstance = new STTSidecarWorker({ ...config, channel: 'system' }, null as any);
  }
  if (!micWorkerInstance) {
    micWorkerInstance = new STTSidecarWorker({ ...config, channel: 'mic' }, null as any);
  }
  return { system: systemWorkerInstance!, mic: micWorkerInstance! };
}

export function getSystemWorker(): STTSidecarWorker | null {
  return systemWorkerInstance;
}

export function getMicWorker(): STTSidecarWorker | null {
  return micWorkerInstance;
}

export function shutdownSidecarWorkers(): void {
  if (systemWorkerInstance) {
    systemWorkerInstance.destroy();
    systemWorkerInstance = null;
  }
  if (micWorkerInstance) {
    micWorkerInstance.destroy();
    micWorkerInstance = null;
  }
}

export { STTSidecarWorker, SidecarConfig, STTToken, VADEvent, StatusEvent };