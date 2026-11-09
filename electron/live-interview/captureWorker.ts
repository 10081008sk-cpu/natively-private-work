import { parentPort, workerData } from 'worker_threads';

interface WorkerInput {
  inputDeviceId: string;
  sampleRate: number;
}

interface ThreadSafeQueue<T> {
  push(item: T): void;
  pop(): T | undefined;
  peek(): T | undefined;
  isEmpty(): boolean;
  clear(): void;
}

function createQueue<T>(): ThreadSafeQueue<T> {
  const items: T[] = [];
  return {
    push(item: T): void { items.push(item); },
    pop(): T | undefined { return items.shift(); },
    peek(): T | undefined { return items[0]; },
    isEmpty(): boolean { return items.length === 0; },
    clear(): void { items.length = 0; },
  };
}

const { inputDeviceId, sampleRate } = workerData as WorkerInput;

if (!parentPort) {
  throw new Error('captureWorker must be run as a Worker thread');
}

parentPort.postMessage({ type: 'status', status: 'worker-started', deviceId: inputDeviceId });

const audioQueue = createQueue<Buffer>();

const SAMPLE_RATE_HZ = sampleRate || 16000;
const VAD_FRAME_MS = 30;
const FRAME_SIZE = Math.floor(SAMPLE_RATE_HZ * VAD_FRAME_MS / 1000);
const BYTES_PER_FRAME = FRAME_SIZE * 2;
const VAD_THRESHOLD = 500;
const SPEECH_FRAMES_MIN = 3;
const MAX_SILENCE_FRAMES = 20;

let isInSpeech = false;
let speechFrames = 0;
let silenceFrames = 0;

function computeEnergy(frame: Buffer): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 2) {
    if (i + 1 < frame.length) {
      const sample = frame.readInt16LE(i);
      sum += Math.abs(sample);
    }
  }
  return sum / Math.max(1, frame.length / 2);
}

function processAudioChunk(chunk: Buffer): void {
  let offset = 0;
  while (offset + BYTES_PER_FRAME <= chunk.length) {
    const frame = chunk.slice(offset, offset + BYTES_PER_FRAME);
    offset += BYTES_PER_FRAME;

    const energy = computeEnergy(frame);
    const isSpeech = energy > VAD_THRESHOLD;

    if (isSpeech) {
      speechFrames++;
      silenceFrames = 0;
      if (!isInSpeech && speechFrames >= SPEECH_FRAMES_MIN) {
        isInSpeech = true;
        parentPort!.postMessage({
          type: 'speech-started',
          timestamp: Date.now(),
        });
      }
    } else {
      silenceFrames++;
      if (isInSpeech && silenceFrames >= MAX_SILENCE_FRAMES) {
        isInSpeech = false;
        speechFrames = 0;
        parentPort!.postMessage({
          type: 'speech-ended',
          timestamp: Date.now(),
        });
      }
    }
  }
}

async function startCaptureThread(): Promise<void> {
  parentPort!.postMessage({ type: 'status', status: 'initializing-capture', deviceId: inputDeviceId });

  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');

  const scriptCandidates = [
    path.join(__dirname, 'capture.py'),
    path.join(__dirname, '..', 'live-interview', 'capture.py'),
    path.join(__dirname, '..', '..', 'electron', 'live-interview', 'capture.py'),
  ];

  let scriptPath = '';
  for (const p of scriptCandidates) {
    try {
      if (fs.existsSync(p)) { scriptPath = p; break; }
    } catch { }
  }

  if (!scriptPath) {
    parentPort!.postMessage({ type: 'error', error: 'capture.py not found' });
    return;
  }

  const pythonCandidates = ['python3', 'py', 'python'];
  let pythonCmd = '';

  for (const cmd of pythonCandidates) {
    try {
      const { execSync } = require('child_process');
      execSync(`${cmd} --version`, { stdio: 'ignore', timeout: 3000 });
      pythonCmd = cmd;
      break;
    } catch { }
  }

  if (!pythonCmd) {
    parentPort!.postMessage({ type: 'error', error: 'Python not found. Install Python 3 with: pip install sounddevice numpy' });
    return;
  }

  try {
    const child = spawn(pythonCmd, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        SAMPLE_RATE: String(SAMPLE_RATE_HZ),
        INPUT_DEVICE: inputDeviceId,
      },
    });

    parentPort!.postMessage({ type: 'status', status: 'capture-process-spawned', python: pythonCmd });

    const readThread = async () => {
      for await (const chunk of child.stdout) {
        audioQueue.push(chunk);
        processAudioChunk(chunk);
      }
    };

    const stderrReader = async () => {
      for await (const chunk of child.stderr) {
        const text = chunk.toString().trim();
        if (text) {
          parentPort!.postMessage({ type: 'status', status: 'python', message: text });
        }
      }
    };

    readThread().catch(() => {});
    stderrReader().catch(() => {});

    const pollQueue = setInterval(() => {
      if (!audioQueue.isEmpty()) {
        const chunk = audioQueue.pop();
        if (chunk) {
          parentPort!.postMessage({
            type: 'audio-data',
            data: chunk,
            timestamp: Date.now(),
          });
        }
      }
    }, 100);

    child.on('error', (err: Error) => {
      clearInterval(pollQueue);
      parentPort!.postMessage({ type: 'error', error: err.message });
    });

    child.on('exit', (code: number | null) => {
      clearInterval(pollQueue);
      parentPort!.postMessage({ type: 'status', status: 'capture-exited', code });
    });

    parentPort!.on('close', () => {
      clearInterval(pollQueue);
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 2000);
    });

  } catch (err: any) {
    parentPort!.postMessage({ type: 'error', error: err.message });
  }
}

startCaptureThread();
