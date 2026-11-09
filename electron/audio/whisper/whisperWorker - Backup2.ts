/**
 * Optimized Local Whisper Worker Thread
 * Merges high-performance prompt-biasing and progress reporting 
 * with hardcoded local fallback paths for your E: drive storage.
 */
import { parentPort } from 'worker_threads';

const LANG_MAP: Record<string, string | null> = {
  'auto': null,
  'en-US': 'english',
  'en-GB': 'english',
  'fr-FR': 'french',
  'de-DE': 'german',
  'es-ES': 'spanish',
  'ja-JP': 'japanese',
  'ko-KR': 'korean',
  'zh-CN': 'chinese',
  'zh-TW': 'chinese',
  'pt-BR': 'portuguese',
  'it-IT': 'italian',
  'ru-RU': 'russian',
  'ar': 'arabic',
  'hi-IN': 'hindi',
};

let pipe: any = null;
let loadedModelId = '';
let cachedPromptText = '';
let cachedPromptIds: number[] | null = null;

const isMoonshineModel = (id: string) => /\/moonshine-/i.test(id);
const PROMPT_TOKEN_CAP = 224;

const ENGLISH_ONLY_MODELS = new Set([
  'onnx-community/moonshine-tiny-ONNX',
  'onnx-community/moonshine-base-ONNX',
  'distil-whisper/distil-small.en',
  'distil-whisper/distil-medium.en',
  'distil-whisper/distil-large-v2',
  'distil-whisper/distil-large-v3',
  'Xenova/whisper-tiny.en',
  'Xenova/whisper-base.en',
  'Xenova/whisper-small.en',
  'Xenova/whisper-medium.en',
]);

if (!parentPort) throw new Error('whisperWorker must be run as a Worker thread');

// Safeguards ESM loading constraints dynamically
async function loadTransformers(): Promise<{ pipeline: any; env: any }> {
  return (new Function('return import("@huggingface/transformers")')()) as any;
}

async function updatePromptCache(promptText: string): Promise<void> {
  const trimmed = (promptText ?? '').trim();
  if (!trimmed || !pipe?.tokenizer || isMoonshineModel(loadedModelId)) {
    cachedPromptText = trimmed;
    cachedPromptIds = null;
    return;
  }
  if (trimmed === cachedPromptText && cachedPromptIds !== null) return;
  try {
    const encoded = await pipe.tokenizer(trimmed, { add_special_tokens: false });
    const raw = encoded?.input_ids?.tolist?.()?.[0] ?? [];
    cachedPromptIds = raw.slice(0, PROMPT_TOKEN_CAP).map((n: bigint | number) => Number(n));
    cachedPromptText = trimmed;
  } catch (e: any) {
    console.warn('[WhisperWorker] Prompt tokenization failed:', e.message);
    cachedPromptText = '';
    cachedPromptIds = null;
  }
}

parentPort.on('message', async (msg: any) => {
  if (msg.type === 'init') {
    try {
      const { pipeline, env } = await loadTransformers();

      // 🌟 FORCE COMPLIANCE WITH YOUR HARD DRIVE STORAGE LOCATION RIGHT HERE
      const rawPath = msg.cacheDir || 'E:/Project/resources/models';
      const normalizedPath = rawPath.replace(/\\/g, '/');
      const finalCacheDir = normalizedPath.endsWith('/') ? normalizedPath : `${normalizedPath}/`;

      env.cacheDir = finalCacheDir;
      env.localModelPath = finalCacheDir;
      env.allowRemoteModels = false; // Zero internet calls allowed

      const providers: string[] = msg.executionProviders ?? ['cpu'];
      if (env.backends?.onnx) {
        env.backends.onnx.executionProviders = providers;
      }
      
      console.log(`[WhisperWorker] Loading Xenova/whisper-base from: ${finalCacheDir}`);

      const fileProgress = new Map<string, number>();
      let lastPostedPct = 0;

      // 🌟 COMBINED CONFIGURATION LAYER FOR RAW UNQUANTIZED FP32 ASSETS
      pipe = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        dtype: 'fp32',            // Force full precision matching your raw .onnx files
        quantized: false,         // Stops the framework appending '_quantized' to targets
        cache_dir: finalCacheDir,
        local_files_only: true,
        progress_callback: (data: any) => {
          const key: string | undefined = data.file ?? data.name;
          if (!key) return;
          let val: number | null = null;
          if (data.status === 'initiate' || data.status === 'download' || data.status === 'downloading') {
            if (!fileProgress.has(key)) val = 0;
          } else if (data.status === 'progress') {
            const p = Number(data.progress);
            if (!Number.isNaN(p)) val = Math.min(100, Math.max(0, p));
          } else if (data.status === 'done') {
            val = 100;
          } else {
            return;
          }
          if (val !== null) {
            fileProgress.set(key, Math.max(fileProgress.get(key) ?? 0, val));
          }
          let sum = 0;
          for (const v of fileProgress.values()) sum += v;
          const rounded = Math.min(99, Math.floor(sum / fileProgress.size));
          const next = Math.max(lastPostedPct, rounded);
          if (next === lastPostedPct) return;
          lastPostedPct = next;
          parentPort!.postMessage({ type: 'progress', modelId: msg.modelId, progress: next });
        },
      });

      loadedModelId = 'Xenova/whisper-base';
      parentPort!.postMessage({ type: 'ready' });
    } catch (e: any) {
      parentPort!.postMessage({ type: 'error', message: `Failed to load model: ${e.message}` });
    }
  } else if (msg.type === 'setPrompt') {
    await updatePromptCache(msg.prompt);
  } else if (msg.type === 'transcribe') {
    if (!pipe) {
      parentPort!.postMessage({ type: 'error', message: 'Model not loaded' });
      return;
    }
    try {
      let language: string | null = LANG_MAP[msg.language] ?? null;
      const streaming: boolean = !!msg.streaming;

      if (ENGLISH_ONLY_MODELS.has(loadedModelId)) {
        language = 'english';
      }

      const opts: any = streaming
        ? {
            sampling_rate: 16000,
            task: 'transcribe',
            temperature: 0,
            beam_size: 5,
            no_speech_threshold: 0.6,
            compression_ratio_threshold: 2.4,
            condition_on_previous_text: false,
            return_timestamps: false,
          }
        : {
            sampling_rate: 16000,
            task: 'transcribe',
            condition_on_previous_text: false,
            beam_size: 5,
            compression_ratio_threshold: 2.4,
            logprob_threshold: -1.0,
            no_speech_threshold: 0.6,
          };
      if (language) opts.language = language;

      if (cachedPromptIds && cachedPromptIds.length > 0 && !isMoonshineModel(loadedModelId)) {
        opts.prompt_ids = cachedPromptIds;
      }

      // Check whether audio loop passed via 'audio' or 'audioBuffer' key attributes safely
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