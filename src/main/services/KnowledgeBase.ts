/**
 * Knowledge Base Service
 * Local Q&A file parsing, indexing, and semantic search
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  confidence: number;
  source: string;
  keywords?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeResult {
  results: KnowledgeEntry[];
  confidence: number;
  source: 'knowledge_base' | 'cache';
}

export interface CachedResult {
  results: KnowledgeEntry[];
  confidence: number;
  timestamp: number;
}

export class KnowledgeBase {
  private entries: KnowledgeEntry[] = [];
  private cache = new Map<string, CachedResult>();
  private lruKeys: string[] = [];
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CACHE_TTL = 3600000; // 1 hour
  private knowledgeBasePath: string;

  constructor() {
    this.knowledgeBasePath = path.join(
      process.env.APPDATA || process.env.HOME || '',
      '.natively',
      'knowledge-base'
    );
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Ensure knowledge base directory exists
    if (!fs.existsSync(this.knowledgeBasePath)) {
      fs.mkdirSync(this.knowledgeBasePath, { recursive: true });
    }

    // Load existing knowledge base
    await this.loadKnowledgeBase();

    // Start cache cleanup interval
    setInterval(() => this.cleanupCache(), 300000); // Every 5 minutes
  }

  private async loadKnowledgeBase(): Promise<void> {
    try {
      const files = fs.readdirSync(this.knowledgeBasePath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      for (const file of jsonFiles) {
        try {
          const filePath = path.join(this.knowledgeBasePath, file);
          const content = fs.readFileSync(filePath, 'utf8');
          const entries = JSON.parse(content);

          if (Array.isArray(entries)) {
            this.entries.push(...entries);
          }
        } catch (error) {
          console.error(`Failed to load knowledge base file ${file}:`, error);
        }
      }

      console.log(`[KnowledgeBase] Loaded ${this.entries.length} entries from ${jsonFiles.length} files`);
    } catch (error) {
      console.error('[KnowledgeBase] Failed to load knowledge base:', error);
    }
  }

  async search(query: string, context?: string): Promise<KnowledgeResult> {
    if (!query || query.trim().length === 0) {
      return { results: [], confidence: 0, source: 'knowledge_base' };
    }

    // Fast path: Check cache
    const cacheKey = this.generateCacheKey(query, context);
    const cached = this.cache.get(cacheKey);

    if (cached && !this.isCacheExpired(cached.timestamp)) {
      return {
        results: cached.results,
        confidence: cached.confidence,
        source: 'cache',
      };
    }

    // Perform hybrid search
    const results = this.performHybridSearch(query, context);

    // Cache results
    this.cacheResult(cacheKey, results);

    return {
      results,
      confidence: this.calculateOverallConfidence(results),
      source: 'knowledge_base',
    };
  }

  private performHybridSearch(query: string, context?: string): KnowledgeEntry[] {
    const queryWords = this.normalizeText(query).split(/\s+/).filter(w => w.length > 1);
    const contextWords = context ? this.normalizeText(context).split(/\s+/).filter(w => w.length > 1) : [];

    if (queryWords.length === 0) return [];

    const scoredResults: { entry: KnowledgeEntry; score: number }[] = [];

    for (const entry of this.entries) {
      const entryText = this.normalizeText(`${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`);

      // Calculate relevance score using hybrid approach
      const queryScore = this.calculateRelevance(queryWords, entryText);
      const contextScore = context ? this.calculateContextRelevance(contextWords, entryText) : 0;
      const keywordScore = this.calculateKeywordMatch(queryWords, entry);

      // Combine scores with weights
      const combinedScore = (queryScore * 0.5) + (contextScore * 0.3) + (keywordScore * 0.2);

      if (combinedScore >= 0.3 && entry.confidence >= 0.7) {
        scoredResults.push({ entry, score: combinedScore });
      }
    }

    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);

    // Return top results
    return scoredResults.slice(0, 5).map(r => r.entry);
  }

  private calculateRelevance(queryWords: string[], entryText: string): number {
    if (queryWords.length === 0) return 0;

    let matches = 0;
    for (const word of queryWords) {
      if (entryText.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
  }

  private calculateContextRelevance(contextWords: string[], entryText: string): number {
    if (contextWords.length === 0) return 0;

    let matches = 0;
    for (const word of contextWords) {
      if (entryText.includes(word)) {
        matches++;
      }
    }

    return matches / contextWords.length;
  }

  private calculateKeywordMatch(queryWords: string[], entry: KnowledgeEntry): number {
    if (!entry.keywords || entry.keywords.length === 0) return 0;

    let matches = 0;
    for (const keyword of entry.keywords) {
      for (const word of queryWords) {
        if (keyword.toLowerCase().includes(word) || word.includes(keyword.toLowerCase())) {
          matches++;
          break;
        }
      }
    }

    return entry.keywords.length > 0 ? matches / entry.keywords.length : 0;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private generateCacheKey(query: string, context?: string): string {
    const data = `${query}|${context || ''}`;
    return createHash('md5').update(data).digest('hex');
  }

  private cacheResult(cacheKey: string, results: KnowledgeEntry[]): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.lruKeys.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const confidence = this.calculateOverallConfidence(results);
    this.cache.set(cacheKey, {
      results,
      confidence,
      timestamp: Date.now(),
    });
    this.lruKeys.push(cacheKey);
  }

  private isCacheExpired(timestamp: number): boolean {
    return Date.now() - timestamp > this.CACHE_TTL;
  }

  private calculateOverallConfidence(results: KnowledgeEntry[]): number {
    if (results.length === 0) return 0;
    return results.reduce((sum, entry) => sum + entry.confidence, 0) / results.length;
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
        const index = this.lruKeys.indexOf(key);
        if (index > -1) {
          this.lruKeys.splice(index, 1);
        }
      }
    }
  }

  // Public API for managing knowledge base

  async addEntry(entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const newEntry: KnowledgeEntry = {
      ...entry,
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.entries.push(newEntry);
    await this.saveKnowledgeBase();

    // Invalidate relevant cache entries
    this.invalidateCacheForEntry(newEntry);

    return newEntry.id;
  }

  async updateEntry(id: string, updates: Partial<KnowledgeEntry>): Promise<boolean> {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    this.entries[index] = {
      ...this.entries[index],
      ...updates,
      updatedAt: Date.now(),
    };

    await this.saveKnowledgeBase();
    this.invalidateCacheForEntry(this.entries[index]);
    return true;
  }

  async deleteEntry(id: string): Promise<boolean> {
    const index = this.entries.findIndex(e => e.id === id);
    if (index === -1) return false;

    const entry = this.entries[index];
    this.entries.splice(index, 1);
    await this.saveKnowledgeBase();
    this.invalidateCacheForEntry(entry);
    return true;
  }

  async importFromFile(filePath: string): Promise<ImportResult> {
    try {
      const extension = path.extname(filePath).toLowerCase();
      let entries: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>[] = [];

      switch (extension) {
        case '.json':
          entries = await this.parseJSONFile(filePath);
          break;
        case '.md':
        case '.txt':
          entries = await this.parseTextFile(filePath);
          break;
        case '.csv':
          entries = await this.parseCSVFile(filePath);
          break;
        default:
          return { success: false, imported: 0, errors: [`Unsupported file format: ${extension}`] };
      }

      let imported = 0;
      const errors: string[] = [];

      for (const entry of entries) {
        try {
          await this.addEntry(entry);
          imported++;
        } catch (error) {
          errors.push(`Failed to import entry: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return { success: true, imported, errors };
    } catch (error) {
      return {
        success: false,
        imported: 0,
        errors: [`Failed to import file: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  private async parseJSONFile(filePath: string): Promise<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
      throw new Error('JSON file must contain an array of entries');
    }

    return data.map(entry => ({
      question: entry.question || '',
      answer: entry.answer || '',
      category: entry.category || 'general',
      confidence: entry.confidence || 0.8,
      source: entry.source || 'user-import',
      keywords: entry.keywords,
    }));
  }

  private async parseTextFile(filePath: string): Promise<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const entries: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    // Try different parsing strategies
    const lines = content.split('\n');
    let currentQuestion = '';
    let currentAnswer = '';
    let inAnswer = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for question markers
      if (trimmed.match(/^(Q|Question):/i) || trimmed.match(/^#\s*Q:/i)) {
        // Save previous entry if exists
        if (currentQuestion && currentAnswer) {
          entries.push({
            question: currentQuestion,
            answer: currentAnswer,
            category: 'general',
            confidence: 0.8,
            source: 'user-import',
          });
        }
        currentQuestion = trimmed.replace(/^(Q|Question):/i, '').replace(/^#\s*Q:/i, '').trim();
        currentAnswer = '';
        inAnswer = true;
      } else if (trimmed.match(/^(A|Answer):/i)) {
        currentAnswer = trimmed.replace(/^(A|Answer):/i, '').trim();
      } else if (inAnswer && trimmed) {
        currentAnswer += (currentAnswer ? '\n' : '') + trimmed;
      }
    }

    // Save last entry
    if (currentQuestion && currentAnswer) {
      entries.push({
        question: currentQuestion,
        answer: currentAnswer,
        category: 'general',
        confidence: 0.8,
        source: 'user-import',
      });
    }

    return entries;
  }

  private async parseCSVFile(filePath: string): Promise<Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>[]> {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const entries: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    // Assume first line is header
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const questionIndex = headers.indexOf('question');
    const answerIndex = headers.indexOf('answer');
    const categoryIndex = headers.indexOf('category');
    const confidenceIndex = headers.indexOf('confidence');
    const keywordsIndex = headers.indexOf('keywords');

    if (questionIndex === -1 || answerIndex === -1) {
      throw new Error('CSV must contain "question" and "answer" columns');
    }

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length <= Math.max(questionIndex, answerIndex)) continue;

      const question = values[questionIndex]?.trim() || '';
      const answer = values[answerIndex]?.trim() || '';

      if (!question || !answer) continue;

      entries.push({
        question,
        answer,
        category: categoryIndex >= 0 ? (values[categoryIndex]?.trim() || 'general') : 'general',
        confidence: confidenceIndex >= 0 ? parseFloat(values[confidenceIndex] || '0.8') : 0.8,
        source: 'user-import',
        keywords: keywordsIndex >= 0 ? values[keywordsIndex]?.split(';').map(k => k.trim()) : undefined,
      });
    }

    return entries;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result.map(v => v.replace(/^"|"$/g, ''));
  }

  private async saveKnowledgeBase(): Promise<void> {
    try {
      // Split entries into multiple files by category for better performance
      const byCategory = new Map<string, KnowledgeEntry[]>();

      for (const entry of this.entries) {
        const category = entry.category || 'general';
        if (!byCategory.has(category)) {
          byCategory.set(category, []);
        }
        byCategory.get(category)!.push(entry);
      }

      for (const [category, entries] of byCategory) {
        const fileName = `${category}.json`;
        const filePath = path.join(this.knowledgeBasePath, fileName);
        fs.writeFileSync(filePath, JSON.stringify(entries, null, 2), 'utf8');
      }
    } catch (error) {
      console.error('[KnowledgeBase] Failed to save knowledge base:', error);
    }
  }

  private invalidateCacheForEntry(_entry: KnowledgeEntry): void {
    // Simple cache invalidation - in production, use more sophisticated approach
    if (this.cache.size > this.MAX_CACHE_SIZE * 0.5) {
      this.cache.clear();
      this.lruKeys = [];
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getAllEntries(): KnowledgeEntry[] {
    return [...this.entries];
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  getCategories(): string[] {
    const categories = new Set(this.entries.map(e => e.category || 'general'));
    return Array.from(categories);
  }
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: string[];
}

// Singleton instance
let knowledgeBaseInstance: KnowledgeBase | null = null;

export function getKnowledgeBase(): KnowledgeBase {
  if (!knowledgeBaseInstance) {
    knowledgeBaseInstance = new KnowledgeBase();
  }
  return knowledgeBaseInstance;
}

export function initializeKnowledgeBase(): KnowledgeBase {
  knowledgeBaseInstance = new KnowledgeBase();
  return knowledgeBaseInstance;
}