/**
 * Orchestration Sidecar Worker
 * Runs in isolated utilityProcess for NLP vector operations, embeddings, web search, and LLM routing
 */

import { MessagePort, parentPort } from 'worker_threads';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

interface OrchestrationConfig {
  knowledgeBasePath: string;
  cacheDir: string;
  webSearchEnabled: boolean;
  webSearchProvider: string;
  webSearchApiKey?: string;
  llmProviders: LLMProviderConfig[];
  nlpThreshold: number;
  cacheTTL: number;
  maxCacheSize: number;
}

interface LLMProviderConfig {
  id: string;
  name: string;
  type: 'gemini' | 'groq' | 'openai' | 'claude' | 'ollama' | 'local';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeout: number;
  maxRetries: number;
  priority: number;
}

interface OrchestrationRequest {
  id: string;
  type: 'search' | 'llm' | 'embed' | 'rerank' | 'web_search';
  payload: any;
  context?: any;
  priority: number;
  timeout: number;
  requestId: string;
}

interface OrchestrationResponse {
  id: string;
  requestId: string;
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    provider?: string;
    model?: string;
    latencyMs: number;
    tokensUsed?: number;
    cacheHit: boolean;
  };
  timestamp: number;
}

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string[];
  confidence: number;
  source: string;
  embedding?: number[];
}

interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  hits: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = 1000, ttl: number = 3600000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    entry.timestamp = Date.now();
    return entry.value;
  }

  set(key: string, value: any): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      key,
      value,
      timestamp: Date.now(),
      hits: 1,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        this.cache.delete(entry.key); // Safety
        removed++;
      }
    }
    return removed;
  }

  stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Would need hit/miss tracking
    };
  }
}

class NLPMatcher {
  private stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'among', 'this', 'that', 'these', 'those', 'i',
    'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers',
    'ours', 'theirs', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'can', 'will', 'just', 'should', 'now', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'doing',
  ]);

  private documentFrequencies = new Map<string, number>();
  private totalDocuments = 0;

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenize(text: string): string[] {
    return this.normalizeText(text)
      .split(/\s+/)
      .filter(token => token.length > 1 && !this.stopWords.has(token));
  }

  private buildNGrams(tokens: string[], n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  addDocument(text: string, docId: string): void {
    const tokens = this.tokenize(text);
    const unigrams = new Set(tokens);
    const bigrams = new Set(this.buildNGrams(Array.from(unigrams), 2));

    for (const token of unigrams) {
      this.documentFrequencies.set(token, (this.documentFrequencies.get(token) || 0) + 1);
    }
    for (const bigram of this.buildNGrams(tokens, 2)) {
      this.documentFrequencies.set(bigram, (this.documentFrequencies.get(bigram) || 0) + 1);
    }

    this.totalDocuments++;
  }

  buildIndex(entries: any[]): void {
    this.documentFrequencies.clear();
    this.totalDocuments = 0;

    for (const entry of entries) {
      const text = `${entry.question} ${entry.answer}`;
      this.addDocument(text, entry.id);
    }
  }

  private calculateTFIDF(queryTokens: string[], entryText: string): number {
    const entryTokens = this.tokenize(entryText);
    const entryTokenSet = new Set(entryTokens);
    const entryLength = entryTokens.length;

    if (entryLength === 0) return 0;

    let score = 0;
    const queryTokenSet = new Set(this.tokenize(this.normalizeText(''))); // This will be populated from query

    // Actually, let's use the query tokens passed in
    // For TF-IDF, we need to compute term frequency in document * inverse document frequency
    let scoreSum = 0;
    let maxPossibleScore = 0;

    for (const token of new Set(this.tokenize(''))) {
      // This is a simplified version - in practice you'd pass the query tokens
    }

    // Simplified TF-IDF calculation
    let scoreSum2 = 0;
    for (const token of this.tokenize('')) {
      // This is a placeholder - actual implementation would use the query tokens
    }

    return 0;
  }

  search(query: string, entries: any[], threshold: number = 0.3): any[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const results: Array<{ entry: any; score: number }> = [];

    for (const entry of entries) {
      const entryText = `${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`.toLowerCase();
      const entryTokens = this.tokenize(`${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`);

      if (entryTokens.length === 0) continue;

      // Tier 1: Exact keyword/acronym matching
      let exactMatch = 0;
      const queryLower = query.toLowerCase();
      for (const keyword of entry.keywords || []) {
        if (queryLower.includes(keyword.toLowerCase())) {
          exactMatch += 1;
        }
      }

      // Also check for exact question matches
      if (entry.question.toLowerCase().includes(queryLower) || queryLower.includes(entry.question.toLowerCase())) {
        exactMatch += 2;
      }

      // Tier 2: Token overlap (TF-IDF style)
      let tokenOverlap = 0;
      const entryTokensSet = new Set(this.tokenize(`${entry.question} ${entry.answer}`));
      for (const token of this.tokenize(query)) {
        if (entryTokensSet.has(token)) {
          tokenOverlap++;
        }
      }

      // Tier 3: Levenshtein for typo tolerance (simplified)
      let levenshteinScore = 0;
      if (query.length > 3) {
        for (const keyword of entry.keywords || []) {
          const dist = this.levenshteinDistance(query.toLowerCase(), keyword.toLowerCase());
          const maxLen = Math.max(query.length, keyword.length);
          if (maxLen > 0) {
            const similarity = 1 - dist / maxLen;
            if (similarity > 0.8) {
              levenshteinScore = Math.max(levenshteinScore, similarity);
            }
          }
        }
      }

      // Combine scores
      const exactScore = exactMatch > 0 ? 1.0 : 0;
      const tokenScore = queryTokens.length > 0 ? entryTokens.length > 0 ?
        Array.from(new Set(this.tokenize(query))).filter(t => 
          this.tokenize(`${entry.question} ${entry.answer}`).includes(t)
        ).length / queryTokens.length : 0 : 0;
      const levenshteinWeight = levenshteinScore > 0.8 ? 0.5 : 0;

      const combinedScore = Math.max(
        exactScore * 0.5,
        tokenScore * 0.3,
        levenshteinScore * 0.2
      );

      if (combinedScore >= 0.3) {
        results.push({ entry, score: combinedScore, exactMatch: exactMatch > 0 });
      }
    }

    return results
      .filter(r => r.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(r => ({
        entry: r.entry,
        score: r.score,
        exactMatch: r.exactMatch,
      }));
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];

    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[a.length][b.length];
  }
}

class OrchestrationWorker extends EventEmitter {
  private config: any;
  private messagePort: any;
  private cache = new Map<string, any>();
  private knowledgeBase: any[] = [];
  private nlpMatcher = new NLPMatcher();
  private requestQueue: any[] = [];
  private isProcessing = false;
  private providers: Map<string, any> = new Map();

  constructor(config: any, messagePort: any) {
    super();
    this.config = config;
    this.messagePort = messagePort;
    this.setupMessagePort();
    this.initialize();
  }

  private setupMessagePort(): void {
    if (!this.messagePort) return;

    this.messagePort.on('message', (message: any) => {
      this.handleMessage(message);
    });

    this.messagePort.on('close', () => {
      this.emit('close');
    });

    this.messagePort.on('error', (error: Error) => {
      console.error('[OrchestrationWorker] MessagePort error:', error);
    });

    this.messagePort.start();
  }

  private initialize(): void {
    try {
      this.initializeProviders();
      this.loadKnowledgeBase();
      this.send({ type: 'ready' });
      console.log('[OrchestrationWorker] Initialized');
    } catch (error) {
      console.error('[OrchestrationWorker] Initialization failed:', error);
      this.send({ type: 'error', error: String(error) });
    }
  }

  private initializeProviders(): void {
    // Initialize LLM providers based on config
    if (this.config.llmProviders) {
      for (const provider of this.config.llmProviders) {
        if (provider.enabled !== false) {
          this.providers.set(provider.id, {
            config: provider,
            lastUsed: 0,
            failureCount: 0,
          });
        }
      }
    }
  }

  private loadKnowledgeBase(): void {
    // Load knowledge base from disk
    // In production, load from config.knowledgeBasePath
    this.knowledgeBase = [];
    // Build NLP index
    // this.nlpMatcher.buildIndex(this.knowledgeBase);
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case 'search':
        this.handleSearch(message);
        break;
      case 'llm':
        this.handleLLMRequest(message);
        break;
      case 'embed':
        this.handleEmbed(message);
        break;
      case 'rerank':
        this.handleRerank(message);
        break;
      case 'web_search':
        this.handleWebSearch(message);
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

  private handleSearch(message: any): void {
    const { query, context, threshold = this.config.nlpThreshold || 0.75, requestId } = message.payload;

    // Check cache first
    const cacheKey = `search:${createHash('md5').update(`${query}|${context || ''}`).digest('hex')}`;
    const cached = this.getCache(cacheKey);
    if (cached) {
      this.send({
        type: 'response',
        requestId: message.requestId,
        success: true,
        data: { results: cached.results, confidence: cached.confidence, source: 'cache' },
        metadata: { cacheHit: true },
      });
      return;
    }

    // Perform NLP search
    const results = this.searchKnowledgeBase(message.payload.query, message.payload.context);

    // Cache results
    this.setCache(cacheKey, results);

    this.send({
      id: createHash('md5').update(`${Date.now()}-${Math.random()}`).digest('hex'),
      requestId: message.requestId,
      success: true,
      data: {
        results: results.results,
        confidence: results.confidence,
        source: 'knowledge_base',
      },
      metadata: { cacheHit: false },
    });
  }

  private searchKnowledgeBase(query: string, context?: string): { results: any[]; confidence: number } {
    // Use NLP matcher
    const results = this.nlpMatcher.search(query, this.knowledgeBase, this.config.nlpThreshold || 0.75);

    const scoredResults = results.map(r => ({
      entry: r.entry,
      score: r.score,
      exactMatch: r.exactMatch,
    }));

    const topResults = scoredResults
      .filter(r => r.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const confidence = topResults.length > 0
      ? topResults.reduce((sum, r) => sum + r.score, 0) / topResults.length
      : 0;

    return {
      results: topResults.map(r => ({
        id: r.entry.id,
        question: r.entry.question,
        answer: r.entry.answer,
        category: r.entry.category,
        confidence: r.score,
        source: r.entry.source,
      })),
      confidence,
    };
  }

  private handleLLMRequest(message: any): void {
    // Route to appropriate LLM provider
    // Implementation would route through provider chain
    this.send({
      id: require('crypto').randomUUID(),
      requestId: message.requestId,
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'LLM routing not yet implemented' },
      timestamp: Date.now(),
    });
  }

  private handleEmbed(message: any): void {
    // Generate embeddings for text
    this.send({
      id: require('crypto').randomUUID(),
      requestId: message.requestId,
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'Embeddings not yet implemented' },
      timestamp: Date.now(),
    });
  }

  private handleRerank(message: any): void {
    // Rerank results using cross-encoder or similar
    this.send({
      id: require('crypto').randomUUID(),
      requestId: message.requestId,
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'Reranking not yet implemented' },
      timestamp: Date.now(),
    });
  }

  private handleWebSearch(message: any): void {
    // Web search implementation
    this.send({
      id: require('crypto').randomUUID(),
      requestId: message.requestId,
      success: false,
      error: { code: 'NOT_IMPLEMENTED', message: 'Web search not yet implemented' },
      timestamp: Date.now(),
    });
  }

  private sendStats(): void {
    this.send({
      type: 'stats',
      data: {
        cacheSize: 0, // this.cache.size(),
        knowledgeBaseSize: this.knowledgeBase.length,
        providers: Array.from(this.providers.keys()),
      },
    });
  }

  private getCache(key: string): any {
    return null; // Placeholder
  }

  private setCache(key: string, value: any): void {
    // Placeholder
  }

  destroy(): void {
    this.removeAllListeners();
  }
}

// Main entry point for utilityProcess
if (require.main === module) {
  console.log('[OrchestrationSidecarWorker] Starting...');

  if (!parentPort) {
    console.error('[OrchestrationSidecarWorker] No parent port');
    process.exit(1);
  }

  parentPort.once('message', (message: any) => {
    if (message.type === 'config' && message.config) {
      const worker = new (require('./OrchestrationSidecarWorker').OrchestrationWorker)(message.config, parentPort);

      process.on('SIGINT', () => process.exit(0));
      process.on('SIGTERM', () => process.exit(0));

      console.log('[OrchestrationSidecarWorker] Initialized');
    }
  });

  parentPort.postMessage({ type: 'ready' });
}

export { OrchestrationWorker, OrchestrationConfig, LLMProviderConfig };