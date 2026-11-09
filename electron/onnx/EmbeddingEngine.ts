import * as ort from 'onnxruntime-node';
import path from 'path';
import fs from 'fs';

const SPECIAL_TOKENS: Record<string, number> = {
  '[PAD]': 0,
  '[UNK]': 1,
  '[CLS]': 101,
  '[SEP]': 102,
};

const VOCAB: Record<string, number> = {
  ...SPECIAL_TOKENS,
  'the': 2, 'a': 3, 'an': 4, 'is': 5, 'are': 6, 'was': 7, 'were': 8,
  'be': 9, 'been': 10, 'being': 11, 'have': 12, 'has': 13, 'had': 14,
  'do': 15, 'does': 16, 'did': 17, 'will': 18, 'would': 19, 'could': 20,
  'should': 21, 'may': 22, 'might': 23, 'can': 24, 'shall': 25,
  'to': 26, 'of': 27, 'in': 28, 'for': 29, 'on': 30, 'with': 31,
  'at': 32, 'by': 33, 'from': 34, 'as': 35, 'into': 36, 'through': 37,
  'during': 38, 'before': 39, 'after': 40, 'above': 41, 'below': 42,
  'between': 43, 'under': 44, 'again': 45, 'further': 46, 'then': 47,
  'once': 48, 'here': 49, 'there': 50, 'when': 51, 'where': 52, 'why': 53,
  'how': 54, 'all': 55, 'each': 56, 'every': 57, 'both': 58, 'few': 59,
  'more': 60, 'most': 61, 'other': 62, 'some': 63, 'such': 64, 'no': 65,
  'nor': 66, 'not': 67, 'only': 68, 'own': 69, 'same': 70, 'so': 71,
  'than': 72, 'too': 73, 'very': 74, 'just': 75, 'because': 76,
  'about': 77, 'if': 78, 'or': 79, 'but': 80, 'and': 81,
  'up': 82, 'down': 83, 'out': 84, 'off': 85, 'over': 86,
  'what': 94, 'which': 95, 'who': 96, 'whom': 97,
  'this': 98, 'that': 99,
  'these': 100, 'those': 103, 'i': 104, 'me': 105, 'my': 106, 'myself': 107,
  'we': 108, 'our': 109, 'ours': 110, 'ourselves': 111, 'you': 112,
  'your': 113, 'yours': 114, 'yourself': 115, 'yourselves': 116,
  'he': 117, 'him': 118, 'his': 119, 'himself': 120, 'she': 121,
  'her': 122, 'hers': 123, 'herself': 124, 'it': 125, 'its': 126,
  'itself': 127, 'they': 128, 'them': 129, 'their': 130, 'theirs': 131,
  'themselves': 132, 'please': 137, 'thank': 138, 'yes': 139, 'hello': 141,
  'hi': 142, 'goodbye': 143, 'meeting': 144, 'team': 145, 'project': 146,
  'status': 148, 'done': 149, 'todo': 150, 'blocker': 151,
  'issue': 152, 'bug': 153, 'fix': 154, 'feature': 155, 'release': 156,
  'deploy': 157, 'build': 158, 'test': 159, 'code': 160, 'review': 161,
  'merge': 162, 'push': 163, 'pull': 164, 'commit': 165, 'branch': 166,
  'main': 167, 'dev': 168, 'staging': 169, 'production': 170, 'api': 171,
  'endpoint': 172, 'route': 173, 'database': 174, 'schema': 175, 'query': 176,
  'server': 177, 'client': 178, 'frontend': 179, 'backend': 180, 'ui': 181,
  'ux': 182, 'design': 183, 'spec': 184, 'requirement': 185, 'deadline': 186,
  'sprint': 187, 'backlog': 188, 'standup': 189, 'retro': 190, 'demo': 191,
  'stakeholder': 192, 'customer': 193, 'user': 194, 'feedback': 195,
  'priority': 196, 'critical': 197, 'high': 198, 'medium': 199, 'low': 200,
  'time': 201, 'date': 202, 'week': 203, 'month': 204, 'quarter': 205,
  'year': 206, 'today': 207, 'tomorrow': 208, 'yesterday': 209, 'next': 210,
  'last': 211, 'current': 212, 'previous': 213, 'new': 214, 'old': 215,
  'start': 216, 'end': 217, 'begin': 218, 'finish': 219, 'continue': 220,
  'stop': 221, 'pause': 222, 'resume': 223, 'plan': 224, 'discuss': 225,
  'decide': 226, 'confirm': 227, 'approve': 228, 'reject': 229, 'agree': 230,
  'disagree': 231, 'suggest': 232, 'propose': 233, 'recommend': 234,
  'question': 235, 'answer': 236, 'explain': 237, 'clarify': 238,
  'summarize': 239, 'report': 240, 'document': 241, 'share': 242,
  'send': 243, 'receive': 244, 'create': 245, 'delete': 246, 'update': 247,
  'read': 248, 'write': 249, 'run': 250, 'configure': 251, 'setup': 252,
  'install': 253, 'upgrade': 254, 'migrate': 255,
};

const HASH_BASE = 10000;
const MAX_SEQ_LEN = 256;

const PUNCTUATION_REGEX = /[^\w\s<>[\]/]/g;

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) - hash) + token.charCodeAt(i);
    hash |= 0;
  }
  return HASH_BASE + (Math.abs(hash) % 20000);
}

function tokenize(text: string): string[] {
  const cleaned = text.toLowerCase().replace(PUNCTUATION_REGEX, ' ');
  return cleaned.split(/\s+/).filter(t => t.length > 0);
}

function tokensToIds(tokens: string[]): number[] {
  const ids: number[] = [SPECIAL_TOKENS['[CLS]']];
  for (const token of tokens) {
    const id = VOCAB[token];
    ids.push(id !== undefined ? id : hashToken(token));
    if (ids.length >= MAX_SEQ_LEN - 1) break;
  }
  ids.push(SPECIAL_TOKENS['[SEP]']);
  return ids;
}

function resolveModelPath(): string {
  const envVar = process.env['NATIVELY_MODEL_PATH'];
  if (envVar && fs.existsSync(envVar)) return envVar;

  const candidates = [
    path.join(__dirname, '../assets/model.onnx'),
    path.join(__dirname, '../../assets/model.onnx'),
    path.join(__dirname, '../../../assets/model.onnx'),
    path.join(process.cwd(), 'assets/model.onnx'),
  ];

  const localAsset = path.resolve(process.cwd(), 'assets/model.onnx');
  if (fs.existsSync(localAsset)) return localAsset;

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return candidates[0];
}

export class EmbeddingEngine {
  private session: ort.InferenceSession | null = null;
  private _ready = false;
  private loadingPromise: Promise<void> | null = null;
  private modelPath: string;

  constructor() {
    this.modelPath = resolveModelPath();
  }

  isReady(): boolean {
    return this._ready && this.session !== null;
  }

  async ensureLoaded(): Promise<void> {
    return this._ensureLoaded();
  }

  private async _ensureLoaded(): Promise<void> {
    if (this.session) return;
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = (async () => {
      if (!fs.existsSync(this.modelPath)) {
        console.warn(`[EmbeddingEngine] Model file not found at ${this.modelPath}. Embedding will be unavailable.`);
        return;
      }

      try {
        this.session = await ort.InferenceSession.create(this.modelPath);
        this._ready = true;
        console.log('[EmbeddingEngine] ONNX model loaded successfully');
      } catch (err) {
        console.error('[EmbeddingEngine] Failed to load ONNX model:', err);
        this._ready = false;
      }
    })();

    try {
      await this.loadingPromise;
    } catch {
      this.loadingPromise = null;
    }
  }

  async getEmbedding(text: string): Promise<Float32Array> {
    await this._ensureLoaded();

    if (!this.session) {
      throw new Error('[EmbeddingEngine] Model is not loaded. Cannot generate embedding.');
    }

    const tokens = tokenize(text);
    const inputIds = tokensToIds(tokens);
    const seqLen = inputIds.length;

    const attentionMask = new Array(seqLen).fill(1);
    const tokenTypeIds = new Array(seqLen).fill(0);

    const inputIdsTensor = new ort.Tensor('int64', BigInt64Array.from(inputIds.map(BigInt)), [1, seqLen]);
    const attentionMaskTensor = new ort.Tensor('int64', BigInt64Array.from(attentionMask.map(BigInt)), [1, seqLen]);
    const tokenTypeIdsTensor = new ort.Tensor('int64', BigInt64Array.from(tokenTypeIds.map(BigInt)), [1, seqLen]);

    const feeds: Record<string, ort.Tensor> = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    };

    try {
      const results = await this.session.run(feeds);
      const output = results[this.session.outputNames[0]];
      return new Float32Array(output.data as unknown as ArrayBuffer);
    } catch (err) {
      console.error('[EmbeddingEngine] Inference failed:', err);
      throw err;
    }
  }

  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return dotProduct / magnitude;
  }
}

export const embeddingEngine = new EmbeddingEngine();
export default EmbeddingEngine;
