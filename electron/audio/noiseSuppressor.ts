import { EventEmitter } from 'events';

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 480;
const OVERLAP = 240;
const RMS_THRESHOLD = 0.006;
const NOISE_FLOOR_ALPHA = 0.01;
const SPECTRAL_SMOOTHING = 0.8;
const ATTACK_MS = 10;
const RELEASE_MS = 100;
const MAX_GAIN_REDUCTION_DB = 18;

interface NoiseProfile {
  noiseMagnitudes: Float64Array;
  frameCount: number;
}

interface SuppressorOptions {
  sampleRate?: number;
  rmsThreshold?: number;
  aggression?: 'light' | 'moderate' | 'aggressive';
}

export class NoiseSuppressor extends EventEmitter {
  private sampleRate: number;
  private rmsThreshold: number;
  private aggression: 'light' | 'moderate' | 'aggressive';
  private noiseProfile: NoiseProfile | null = null;
  private enabled: boolean = false;
  private speechFrames: number = 0;
  private silenceFrames: number = 0;
  private smoothingBuf: Float64Array | null = null;
  private attackCoeff: number;
  private releaseCoeff: number;

  constructor(options: SuppressorOptions = {}) {
    super();
    this.sampleRate = options.sampleRate || SAMPLE_RATE;
    this.rmsThreshold = options.rmsThreshold || RMS_THRESHOLD;
    this.aggression = options.aggression || 'moderate';
    this.attackCoeff = Math.exp(-1 / ((this.sampleRate / FRAME_SIZE) * (ATTACK_MS / 1000)));
    this.releaseCoeff = Math.exp(-1 / ((this.sampleRate / FRAME_SIZE) * (RELEASE_MS / 1000)));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.noiseProfile = null;
      this.smoothingBuf = null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setAggression(level: 'light' | 'moderate' | 'aggressive'): void {
    this.aggression = level;
  }

  private getGainReductionMultiplier(): number {
    switch (this.aggression) {
      case 'light': return 0.5;
      case 'moderate': return 1.0;
      case 'aggressive': return 1.8;
    }
  }

  private computeRMS(samples: Float64Array): number {
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSq += samples[i] * samples[i];
    }
    return Math.sqrt(sumSq / samples.length);
  }

  private applyHanningWindow(samples: Float64Array): void {
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (samples.length - 1)));
    }
  }

  private buildNoiseProfile(samples: Float64Array): void {
    const magnitudes = new Float64Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      magnitudes[i] = Math.abs(samples[i]);
    }

    if (!this.noiseProfile) {
      this.noiseProfile = { noiseMagnitudes: magnitudes, frameCount: 1 };
    } else {
      const nm = this.noiseProfile.noiseMagnitudes;
      for (let i = 0; i < samples.length; i++) {
        nm[i] = nm[i] * (1 - NOISE_FLOOR_ALPHA) + magnitudes[i] * NOISE_FLOOR_ALPHA;
      }
      this.noiseProfile.frameCount++;
    }
  }

  private applySpectralGating(samples: Float64Array): Float64Array {
    if (!this.noiseProfile || this.noiseProfile.frameCount < 5) {
      return samples;
    }

    const output = new Float64Array(samples.length);
    const noiseMag = this.noiseProfile.noiseMagnitudes;
    const reductionMul = this.getGainReductionMultiplier();

    for (let i = 0; i < samples.length; i++) {
      const signalMag = Math.abs(samples[i]);
      const noiseFloor = noiseMag[i] * 1.5 * reductionMul;

      let gain: number;
      if (signalMag <= noiseFloor) {
        gain = Math.pow(signalMag / (noiseFloor + 1e-10), 1.5);
      } else {
        const excess = (signalMag - noiseFloor) / (signalMag + 1e-10);
        gain = 0.3 + 0.7 * Math.min(1, excess * 2);
      }

      const gainDb = 20 * Math.log10(Math.max(gain, 1e-10));
      const clampedGainDb = Math.max(gainDb, -MAX_GAIN_REDUCTION_DB);
      const finalGain = Math.pow(10, clampedGainDb / 20);

      if (this.smoothingBuf === null) {
        this.smoothingBuf = new Float64Array(samples.length);
      }

      const smoothCoeff = finalGain >= (this.smoothingBuf[i] || 0)
        ? this.attackCoeff
        : this.releaseCoeff;

      const smoothedGain = smoothCoeff * (this.smoothingBuf[i] || 0) + (1 - smoothCoeff) * finalGain;
      this.smoothingBuf[i] = smoothedGain;

      output[i] = samples[i] * smoothedGain;
    }

    return output;
  }

  private applyOverlapAdd(
    newFrame: Float64Array,
    overlapBuf: Float64Array | null,
    outputLen: number
  ): { output: Float64Array; nextOverlap: Float64Array } {
    const outLen = outputLen;
    const output = new Float64Array(outLen);
    const nextOverlap = new Float64Array(OVERLAP);

    if (overlapBuf) {
      for (let i = 0; i < OVERLAP; i++) {
        const fadeOut = 0.5 * (1 + Math.cos((Math.PI * i) / OVERLAP));
        const fadeIn = 0.5 * (1 - Math.cos((Math.PI * i) / OVERLAP));
        output[i] = overlapBuf[i] * fadeOut + newFrame[i] * fadeIn;
      }
    } else {
      for (let i = 0; i < Math.min(OVERLAP, newFrame.length); i++) {
        output[i] = newFrame[i];
      }
    }

    const remaining = Math.min(newFrame.length - OVERLAP, output.length - OVERLAP);
    for (let i = 0; i < remaining; i++) {
      output[OVERLAP + i] = newFrame[OVERLAP + i];
    }

    for (let i = 0; i < OVERLAP; i++) {
      const srcIdx = newFrame.length - OVERLAP + i;
      nextOverlap[i] = srcIdx >= 0 ? newFrame[srcIdx] : 0;
    }

    return { output, nextOverlap };
  }

  processBuffer(inputBuffer: Buffer): Buffer {
    if (!this.enabled || inputBuffer.length < 2) {
      return inputBuffer;
    }

    const sampleCount = Math.floor(inputBuffer.length / 2);
    const samples = new Float64Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = inputBuffer.readInt16LE(i * 2) / 32768;
    }

    const rms = this.computeRMS(samples);

    if (rms < this.rmsThreshold) {
      this.silenceFrames++;
      this.speechFrames = 0;
      if (this.silenceFrames > 10 && !this.noiseProfile) {
        this.buildNoiseProfile(samples);
      }
      if (this.noiseProfile && this.noiseProfile.frameCount > 10) {
        const attenuated = new Float64Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          attenuated[i] = samples[i] * 0.05;
        }
        const output = new Int16Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          const val = Math.max(-32768, Math.min(32767, Math.round(attenuated[i] * 32768)));
          output[i] = val;
        }
        return Buffer.from(output.buffer);
      }
      return inputBuffer;
    }

    this.speechFrames++;
    this.silenceFrames = 0;

    const frameSize = FRAME_SIZE;
    const overlap = OVERLAP;
    const numFrames = Math.max(1, Math.ceil((samples.length - overlap) / (frameSize - overlap)));
    const outputSamples = new Float64Array(samples.length);

    let overlapBuf: Float64Array | null = null;
    let outputOffset = 0;

    for (let f = 0; f < numFrames; f++) {
      const frameStart = f * (frameSize - overlap);
      const frameEnd = Math.min(frameStart + frameSize, samples.length);
      const actualFrameSize = frameEnd - frameStart;

      if (actualFrameSize < 4) break;

      const frame = new Float64Array(actualFrameSize);
      for (let i = 0; i < actualFrameSize; i++) {
        frame[i] = samples[frameStart + i];
      }

      this.applyHanningWindow(frame);

      const processedFrame = this.applySpectralGating(frame);

      const { output: frameOut, nextOverlap } = this.applyOverlapAdd(
        processedFrame,
        overlapBuf,
        actualFrameSize
      );

      for (let i = 0; i < frameOut.length && outputOffset + i < outputSamples.length; i++) {
        outputSamples[outputOffset + i] = frameOut[i];
      }
      outputOffset += frameOut.length - overlap;
      overlapBuf = nextOverlap;
    }

    const output = new Int16Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const val = Math.max(-32768, Math.min(32767, Math.round(outputSamples[i] * 32768)));
      output[i] = val;
    }

    const rmsOut = this.computeRMS(
      new Float64Array(samples.length).map((_, i) => output[i] / 32768)
    );
    this.emit('level', rmsOut);

    return Buffer.from(output.buffer);
  }

  reset(): void {
    this.noiseProfile = null;
    this.smoothingBuf = null;
    this.speechFrames = 0;
    this.silenceFrames = 0;
  }
}
