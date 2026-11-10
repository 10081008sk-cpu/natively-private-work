import fs from 'fs';
import path from 'path';
import { app } from 'electron';

type KnowledgeChunk = { id: string; text: string; terms: string[] };
type KnowledgeDocument = {
  id: string; name: string; size: number; type: string; entriesCount: number;
  status: 'ready'; lastIndexed: number; chunks: KnowledgeChunk[];
};
type KnowledgeStore = { enabled: boolean; confidenceThreshold: number; documents: KnowledgeDocument[] };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv', '.pdf']);
const DEFAULT_STORE: KnowledgeStore = { enabled: false, confidenceThreshold: 0.8, documents: [] };

function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9+#.-]{2,}/g) || [])
    .map((term) => term.endsWith('ies') && term.length > 5
      ? term.slice(0, -3) + 'y'
      : term.endsWith('s') && !term.endsWith('ss') && term.length > 4 ? term.slice(0, -1) : term)
    .filter((term) => !STOP_WORDS.has(term));
}
const STOP_WORDS = new Set([
  'the','and','for','that','with','this','from','you','are','was','were','have','has','had',
  'what','when','where','how','why','can','will','would','could','should','into','your','about',
  'then','than','there','their','them','they','our','not','but','use','is','it','of','in','on',
  'to','do','does','explain','describe','give','example','examples','difference','between','please',
  'tell','me','show','compare','vs','using','used','useful','also','like','such','which','who'
]);

function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ').trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs.length ? paragraphs : [normalized]) {
    if (paragraph.length <= 1200) { chunks.push(paragraph); continue; }
    for (let offset = 0; offset < paragraph.length; offset += 1000) {
      const piece = paragraph.slice(offset, offset + 1200).trim();
      if (piece) chunks.push(piece);
    }
  }
  return chunks.slice(0, 500);
}

export class KnowledgeBaseService {
  private static instance: KnowledgeBaseService;
  private store: KnowledgeStore | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private get filePath(): string { return path.join(app.getPath('userData'), 'knowledge-base', 'index.json'); }

  static getInstance(): KnowledgeBaseService {
    if (!this.instance) this.instance = new KnowledgeBaseService();
    return this.instance;
  }

  private load(): KnowledgeStore {
    if (this.store) return this.store;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<KnowledgeStore>;
      this.store = {
        enabled: parsed.enabled === true,
        confidenceThreshold: typeof parsed.confidenceThreshold === 'number' ? Math.min(0.95, Math.max(0.5, parsed.confidenceThreshold)) : 0.8,
        documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      };
    } catch { this.store = { ...DEFAULT_STORE, documents: [] }; }
    return this.store;
  }

  private save(): Promise<void> {
    const snapshot = JSON.stringify(this.load());
    const write = async () => {
      await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = this.filePath + '.tmp';
      await fs.promises.writeFile(tempPath, snapshot, 'utf8');
      await fs.promises.rename(tempPath, this.filePath);
    };
    // Serialize writes so concurrent uploads/removals cannot overwrite newer state.
    this.writeQueue = this.writeQueue.then(write, write);
    return this.writeQueue;
  }

  getSettings(): { enabled: boolean; confidenceThreshold: number; files: Array<Omit<KnowledgeDocument, 'chunks'>> } {
    const store = this.load();
    return {
      enabled: store.enabled,
      confidenceThreshold: store.confidenceThreshold,
      files: store.documents.map(({ chunks: _chunks, ...metadata }) => metadata),
    };
  }

  async updateSettings(settings: { enabled?: boolean; confidenceThreshold?: number }): Promise<void> {
    const store = this.load();
    if (typeof settings.enabled === 'boolean') store.enabled = settings.enabled;
    if (typeof settings.confidenceThreshold === 'number' && Number.isFinite(settings.confidenceThreshold)) {
      store.confidenceThreshold = Math.min(0.95, Math.max(0.5, settings.confidenceThreshold));
    }
    await this.save();
  }

  async addDocument(input: { name: string; dataBase64: string }): Promise<{ id: string; name: string; size: number; type: string; entriesCount: number; status: 'ready'; lastIndexed: number }> {
    if (!input || typeof input.name !== 'string' || typeof input.dataBase64 !== 'string') throw new Error('Invalid knowledge file payload');
    const extension = path.extname(input.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Supported formats: TXT, MD, JSON, CSV and PDF');
    const bytes = Buffer.from(input.dataBase64, 'base64');
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('File must be between 1 byte and 10 MB');

    let text: string;
    if (extension === '.pdf') {
      const pdfModule = await import('pdf-parse');
      const PDFParse = (pdfModule as any).PDFParse;
      if (!PDFParse) throw new Error('PDF parser is unavailable in this build');
      const parser = new PDFParse({ data: bytes });
      try {
        const result = await parser.getText();
        text = typeof result?.text === 'string' ? result.text : '';
      } finally { await parser.destroy(); }
    } else {
      text = bytes.toString('utf8');
      if (extension === '.json') {
        try { text = JSON.stringify(JSON.parse(text), null, 2); }
        catch { throw new Error('The JSON file is not valid JSON'); }
      }
    }

    const parts = splitIntoChunks(text);
    if (!parts.length) throw new Error('No readable text was found in this file');
    const id = `kb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const chunks = parts.map((part, index) => ({ id: `${id}-${index}`, text: part, terms: tokenize(part) }));
    const document: KnowledgeDocument = {
      id, name: path.basename(input.name).slice(0, 180), size: bytes.length, type: extension,
      entriesCount: chunks.length, status: 'ready', lastIndexed: Date.now(), chunks,
    };
    const store = this.load();
    store.documents.push(document);
    await this.save();
    return { id: document.id, name: document.name, size: document.size, type: document.type, entriesCount: document.entriesCount, status: 'ready', lastIndexed: document.lastIndexed };
  }

  async removeDocument(id: string): Promise<void> {
    const store = this.load();
    store.documents = store.documents.filter((document) => document.id !== id);
    await this.save();
  }

  async clear(): Promise<void> { this.load().documents = []; await this.save(); }

  search(query: string, limit = 5): Array<{ text: string; source: string; confidence: number }> {
    const store = this.load();
    if (!store.enabled || !query.trim()) return [];
    const queryTerms = Array.from(new Set(tokenize(query)));
    if (!queryTerms.length) return [];
    const scored: Array<{ text: string; source: string; confidence: number }> = [];
    for (const document of store.documents) {
      for (const chunk of document.chunks) {
        const uniqueTerms = new Set(chunk.terms);
        const overlap = queryTerms.filter((term) => uniqueTerms.has(term)).length;
        if (!overlap) continue;
        const confidence = overlap / queryTerms.length;
        if (confidence >= store.confidenceThreshold) scored.push({ text: chunk.text, source: document.name, confidence });
      }
    }
    return scored.sort((a, b) => b.confidence - a.confidence).slice(0, Math.max(1, Math.min(10, limit)));
  }
}
