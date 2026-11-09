/**
 * Light-Weight Multilingual Whisper Worker Thread
 * Optimizes calculation footprint for English, Hindi, and Marathi pipelines on the fly.
 */
import { parentPort } from 'worker_threads';

let pipe: any = null;
let loadedModelId = '';

if (!parentPort) throw new Error('whisperWorker must be run as a Worker thread');

async function loadTransformers() {
  return (new Function('return import("@huggingface/transformers")')()) as any;
}

parentPort.on('message', async (msg: any) => {
  if (msg.type === 'init') {
    try {
      const { pipeline, env } = await loadTransformers();

      const rawPath = msg.cacheDir || 'E:/Project/resources/models';
      const normalizedPath = rawPath.replace(/\\/g, '/');
      const finalCacheDir = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;

      env.cacheDir = finalCacheDir;
      env.localModelPath = finalCacheDir;
      env.allowRemoteModels = false; // Restricts background network polling

      console.log(`[WhisperWorker] Loading Light-Weight Multilingual Engine from: ${finalCacheDir}`);

      pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        dtype: 'fp32',
        quantized: false,
        cache_dir: finalCacheDir,
        local_files_only: true
      });

      loadedModelId = 'Xenova/whisper-base';
      parentPort!.postMessage({ type: 'ready' });
    } catch (e: any) {
      parentPort!.postMessage({ type: 'error', message: `Failed to load model: ${e.message}` });
    }
  } else if (msg.type === 'transcribe') {
    if (!pipe) {
      parentPort!.postMessage({ type: 'error', message: 'Model not loaded' });
      return;
    }
    try {
      const streaming: boolean = !!msg.streaming;

      // 🌟 ULTRA-FAST INFRASTRUCTURE TUNING
      // Shifting beam_size down to 1 for live stream segments cuts math operations drastically,
      // which completely stops your desktop environment from hanging during long meetings.
      const opts: any = streaming
        ? {
            sampling_rate: 16000,
            task: 'transcribe',
            temperature: 0,
            beam_size: 1, // High speed execution profile for partial transcripts
            no_speech_threshold: 0.3,
            compression_ratio_threshold: 2.2,
            condition_on_previous_text: false,
            return_timestamps: false,
          }
        : {
            sampling_rate: 16000,
            task: 'transcribe',
            temperature: 0,
            condition_on_previous_text: false,
            beam_size: 2, // Balances final block corrections safely
            compression_ratio_threshold: 2.4,
            logprob_threshold: -1.0,
            no_speech_threshold: 0.5,
          };

      // Dynamically load the specific language string handled by the parent orchestrator
      if (msg.language) {
        opts.language = msg.language;
      }

      const audioBufferData = msg.audio || msg.audioBuffer;
      const result = await pipe(audioBufferData, opts);

      parentPort!.postMessage({
        type: streaming ? 'partial' : 'result',
        taskId: msg.taskId,
        text: result.text ?? '',
      });
    } catch (e: any) {
      parentPort!.postMessage({
        type: 'error',
        taskId: msg.taskId,
        message: `Transcription failed: ${e.message}`,
      });
    }
  }
});