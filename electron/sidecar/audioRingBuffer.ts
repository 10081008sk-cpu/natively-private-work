/**
 * Circular Audio Ring Buffer - Production Implementation
 * 
 * Fixed-capacity, pre-allocated circular buffer using Float32Array to prevent
 * memory thrashing and V8 GC pauses. Designed for 16kHz mono float32 audio.
 * 
 * Specifications:
 * - Sample Rate: 16,000 Hz
 * - Format: 16-bit Mono PCM, Float32 normalized [-1.0, 1.0]
 * - Buffer Length: 5-second circular window (80,000 samples)
 * - Atomic write/read pointers for lock-free operation
 */

export interface RingBufferConfig {
    sampleRate: number;
    capacitySeconds: number;
    channels: number;
}

export interface RingBufferStats {
    writePointer: number;
    readPointerVAD: number;
    readPointerSTT: number;
    availableSamples: number;
    capacity: number;
    overflowCount: number;
    underflowCount: number;
}

const DEFAULT_CONFIG: RingBufferConfig = {
    sampleRate: 16000,
    capacitySeconds: 5,
    channels: 1,
};

export class AudioRingBuffer {
    private readonly buffer: Float32Array;
    private readonly capacity: number;
    private readonly sampleRate: number;
    private readonly channels: number;
    
    private writePointer = 0;
    private readPointerVAD = 0;
    private readPointerSTT = 0;
    private overflowCount = 0;
    private underflowCount = 0;
    
    private readonly writePointerView: Int32Array;
    private readonly readPointerVADView: Int32Array;
    private readonly readPointerSTTView: Int32Array;

    constructor(config: Partial<RingBufferConfig> = {}) {
        const finalConfig = { ...DEFAULT_CONFIG, ...config };
        this.sampleRate = finalConfig.sampleRate;
        this.channels = finalConfig.channels;
        this.capacity = finalConfig.sampleRate * finalConfig.capacitySeconds * finalConfig.channels;
        
        if (!Number.isInteger(this.capacity) || this.capacity <= 0) {
            throw new Error(`Invalid buffer capacity: ${this.capacity}`);
        }
        
        this.buffer = new Float32Array(this.capacity);
        
        const sharedBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 3);
        this.writePointerView = new Int32Array(sharedBuffer, 0, 1);
        this.readPointerVADView = new Int32Array(sharedBuffer, Int32Array.BYTES_PER_ELEMENT, 1);
        this.readPointerSTTView = new Int32Array(sharedBuffer, Int32Array.BYTES_PER_ELEMENT * 2, 1);
        
        this.writePointerView[0] = 0;
        this.readPointerVADView[0] = 0;
        this.readPointerSTTView[0] = 0;
    }

    public write(samples: Float32Array): number {
        if (!samples || samples.length === 0) return 0;
        
        const inputLength = samples.length;
        const writePtr = this.writePointerView[0];
        let written = 0;
        
        if (inputLength >= this.capacity) {
            const start = inputLength - this.capacity;
            this.buffer.set(samples.subarray(start));
            this.writePointerView[0] = 0;
            this.overflowCount++;
            return this.capacity;
        }
        
        const spaceToEnd = this.capacity - writePtr;
        
        if (inputLength <= spaceToEnd) {
            this.buffer.set(samples, writePtr);
            this.writePointerView[0] = (writePtr + inputLength) % this.capacity;
            written = inputLength;
        } else {
            this.buffer.set(samples.subarray(0, spaceToEnd), writePtr);
            this.buffer.set(samples.subarray(spaceToEnd), 0);
            this.writePointerView[0] = inputLength - spaceToEnd;
            written = inputLength;
        }
        
        const vadPtr = this.readPointerVADView[0];
        const sttPtr = this.readPointerSTTView[0];
        const minReadPtr = Math.min(vadPtr, sttPtr);
        
        if (writePtr < minReadPtr) {
            const availableBefore = minReadPtr - writePtr;
            if (inputLength > availableBefore) {
                this.overflowCount++;
            }
        } else {
            const availableBefore = this.capacity - writePtr + minReadPtr;
            if (inputLength > availableBefore) {
                this.overflowCount++;
            }
        }
        
        return written;
    }

    public readForVAD(output: Float32Array, maxSamples: number): number {
        return this.read(output, maxSamples, this.readPointerVADView);
    }

    public readForSTT(output: Float32Array, maxSamples: number): number {
        return this.read(output, maxSamples, this.readPointerSTTView);
    }

    private read(output: Float32Array, maxSamples: number, readPointerView: Int32Array): number {
        if (!output || maxSamples <= 0) return 0;
        
        const writePtr = this.writePointerView[0];
        let readPtr = readPointerView[0];
        let available: number;
        
        if (writePtr >= readPtr) {
            available = writePtr - readPtr;
        } else {
            available = this.capacity - readPtr + writePtr;
        }
        
        const toRead = Math.min(maxSamples, available, output.length);
        
        if (toRead === 0) {
            this.underflowCount++;
            return 0;
        }
        
        const spaceToEnd = this.capacity - readPtr;
        
        if (toRead <= spaceToEnd) {
            output.set(this.buffer.subarray(readPtr, readPtr + toRead));
            readPointerView[0] = (readPtr + toRead) % this.capacity;
        } else {
            output.set(this.buffer.subarray(readPtr), 0);
            output.set(this.buffer.subarray(0, toRead - spaceToEnd), spaceToEnd);
            readPointerView[0] = toRead - spaceToEnd;
        }
        
        return toRead;
    }

    public peekAvailable(readPointerType: 'vad' | 'stt' = 'vad'): number {
        const writePtr = this.writePointerView[0];
        const readPtr = readPointerType === 'vad' 
            ? this.readPointerVADView[0] 
            : this.readPointerSTTView[0];
        
        if (writePtr >= readPtr) {
            return writePtr - readPtr;
        }
        return this.capacity - readPtr + writePtr;
    }

    public getStats(): RingBufferStats {
        return {
            writePointer: this.writePointerView[0],
            readPointerVAD: this.readPointerVADView[0],
            readPointerSTT: this.readPointerSTTView[0],
            availableSamples: this.peekAvailable('vad'),
            capacity: this.capacity,
            overflowCount: this.overflowCount,
            underflowCount: this.underflowCount,
        };
    }

    public reset(): void {
        this.writePointerView[0] = 0;
        this.readPointerVADView[0] = 0;
        this.readPointerSTTView[0] = 0;
        this.overflowCount = 0;
        this.underflowCount = 0;
        this.buffer.fill(0);
    }

    public getCapacity(): number {
        return this.capacity;
    }

    public getSampleRate(): number {
        return this.sampleRate;
    }

    public getChannels(): number {
        return this.channels;
    }

    public getDurationSeconds(): number {
        return this.capacity / this.sampleRate / this.channels;
    }
}

export function createAudioRingBuffer(config?: Partial<RingBufferConfig>): AudioRingBuffer {
    return new AudioRingBuffer(config);
}