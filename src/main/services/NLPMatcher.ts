/**
 * NLP Matcher
 * Lightweight semantic matching with TF-IDF, exact keyword matching, and Levenshtein fallback
 */

import { createHash } from 'crypto';

export interface MatchResult {
  entry: any;
  score: number;
  matchType: 'exact' | 'keyword' | 'tfidf' | 'levenshtein';
  matchedTerms: string[];
}

export interface NLPMatcherConfig {
  stopWords?: Set<string>;
  ngramSize?: number;
  tfidfWeight?: number;
  keywordWeight?: number;
  levenshteinWeight?: number;
  exactMatchWeight?: number;
  minScore?: number;
  maxResults?: number;
  cacheTTL?: number;
  maxCacheSize?: number;
}

export interface CachedResult {
  queryHash: string;
  results: any[];
  confidence: number;
  timestamp: number;
}

export class NLPMatcher {
  private config: Required<NLPMatcherConfig>;
  private stopWords: Set<string>;
  private documentFrequencies = new Map<string, number>();
  private totalDocuments = 0;
  private documentVectors = new Map<string, Map<string, number>>();
  private cache = new Map<string, CachedResult>();
  private lruKeys: string[] = [];

  constructor(config: NLPMatcherConfig = {}) {
    this.config = {
      stopWords: config.stopWords || new Set([
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
      ]),
      ngramSize: config.ngramSize ?? 2,
      tfidfWeight: config.tfidfWeight ?? 0.4,
      keywordWeight: config.keywordWeight ?? 0.3,
      levenshteinWeight: config.levenshteinWeight ?? 0.2,
      exactMatchWeight: config.exactMatchWeight ?? 0.1,
      minScore: config.minScore ?? 0.3,
      maxResults: config.maxResults ?? 5,
      cacheTTL: config.cacheTTL ?? 3600000, // 1 hour
      maxCacheSize: config.maxCacheSize ?? 1000,
    };

    this.stopWords = this.config.stopWords;
  }

  buildIndex(entries: any[]): void {
    this.documentFrequencies.clear();
    this.documentVectors.clear();

    for (const entry of entries) {
      const text = `${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`;
      const tokens = this.tokenize(text);

      // Build n-grams
      const unigrams = new Set(tokens);
      const bigrams = this.getNGrams(Array.from(unigrams), 2);
      const trigrams = this.getNGrams(Array.from(unigrams), 3);

      // Update document frequencies
      for (const token of unigrams) {
        this.documentFrequencies.set(token, (this.documentFrequencies.get(token) || 0) + 1);
      }
      for (const bigram of bigrams) {
        this.documentFrequencies.set(bigram, (this.documentFrequencies.get(bigram) || 0) + 1);
      }

      // Build document vector
      const vector = new Map<string, number>();
      for (const token of unigrams) {
        vector.set(token, (vector.get(token) || 0) + 1);
      }
      for (const bigram of bigrams) {
        vector.set(bigram, (vector.get(bigram) || 0) + 1);
      }

      // Normalize vector
      const magnitude = Math.sqrt(
        Array.from(vector.values()).reduce((sum, val) => sum + val * val, 0)
      );
      if (magnitude > 0) {
        for (const [key, val] of vector) {
          vector.set(key, val / magnitude);
        }
      }

      // Use entry ID or generate one
      const docId = entry.id || createHash('md5').update(JSON.stringify(entry)).digest('hex').slice(0, 16);
      this.documentVectors.set(docId, vector);
    }
  }

  search(query: string, entries: any[], threshold?: number): { results: any[]; confidence: number } {
    const minScore = threshold ?? this.config.minScore;
    const maxResults = this.config.maxResults;

    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return {
        results: cached.results,
        confidence: cached.confidence,
      };
    }

    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      return { results: [], confidence: 0 };
    }

    const scoredResults: Array<{ entry: any; score: number; matchType: string; matchedTerms: string[] }> = [];

    for (const entry of entries) {
      const result = this.scoreEntry(query, entry);
      if (result.score >= (threshold || this.config.minScore)) {
        scoredResults.push({
          entry,
          score: result.score,
          matchType: result.matchType,
          matchedTerms: result.matchedTerms,
        });
      }
    }

    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);

    const topResults = scoredResults.slice(0, this.config.maxResults);

    const results = topResults.map(r => ({
      entry: r.entry,
      score: r.score,
      matchType: r.matchType,
      matchedTerms: r.matchedTerms,
    }));

    const confidence = results.length > 0
      ? results.reduce((sum, r) => sum + r.score, 0) / results.length
      : 0;

    // Cache results
    this.setCache(query, {
      queryHash: this.generateCacheKey(query),
      results,
      confidence,
      timestamp: Date.now(),
    });

    return { results, confidence };
  }

  private scoreEntry(query: string, entry: any): { score: number; matchType: string; matchedTerms: string[] } {
    const queryLower = query.toLowerCase();
    const entryText = `${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`.toLowerCase();
    const entryKeywords = entry.keywords?.map((k: string) => k.toLowerCase()) || [];

    const matchedTerms: string[] = [];
    let maxScore = 0;
    let bestMatchType = 'tfidf';

    // Tier 1: Exact keyword/acronym matching
    let exactMatches = 0;
    for (const keyword of entry.keywords || []) {
      if (query.toLowerCase().includes(keyword.toLowerCase())) {
        maxScore = Math.max(maxScore, 1.0);
        matchedTerms.push(keyword);
      }
    }

    // Check for exact question match
    if (entry.question.toLowerCase().includes(query.toLowerCase()) ||
        query.toLowerCase().includes(entry.question.toLowerCase())) {
      maxScore = Math.max(maxScore, 1.0);
      matchedTerms.push('exact_question');
    }

    // Check for acronyms in query
    const acronymMatches = this.findAcronymMatches(query, entry);
    if (acronymMatches.length > 0) {
      maxScore = Math.max(maxScore, 1.0);
      matchedTerms.push(...acronymMatches);
    }

    if (maxScore >= 1.0) {
      return { score: 1.0, matchType: 'exact', matchedTerms };
    }

    // Tier 2: TF-IDF / Cosine Similarity
    const tfidfScore = this.calculateTFIDFSimilarity(query, entry);
    if (tfidfScore > maxScore) {
      maxScore = tfidfScore;
      bestMatchType = 'tfidf';
      // Note: matched terms would need more detailed tracking
    }

    // Tier 3: Keyword overlap
    const keywordScore = this.calculateKeywordOverlap(query, entry);
    if (keywordScore > maxScore) {
      maxScore = keywordScore;
      bestMatchType = 'keyword';
    }

    // Tier 4: Levenshtein distance for typo tolerance
    const levenshteinScore = this.calculateLevenshteinSimilarity(query, entry);
    if (levenshteinScore > maxScore) {
      maxScore = levenshteinScore;
      bestMatchType = 'levenshtein';
    }

    // Weighted combination
    let finalScore = 0;
    matchedTerms.length = 0;

    // Exact match bonus
    if (maxScore >= 0.95) {
      finalScore = 1.0;
    } else {
      // Weighted combination
      finalScore = Math.max(
        maxScore * 0.4 + 0.3, // Base
        this.calculateTFIDFSimilarity(query, entry) * this.config.tfidfWeight +
        this.calculateKeywordOverlap(query, entry) * this.config.keywordWeight +
        this.calculateLevenshteinSimilarity(query, entry) * this.config.levenshteinWeight
      );
    }

    // Boost for exact keyword matches
    const exactKeywordMatches = this.findExactKeywordMatches(query, entry);
    if (exactKeywordMatches.length > 0) {
      finalScore = Math.min(1.0, finalScore + exactKeywordMatches.length * 0.1);
      matchedTerms.push(...exactKeywordMatches);
    }

    return { score: Math.min(1.0, finalScore), matchType: 'combined', matchedTerms };
  }

  private calculateTFIDFSimilarity(query: string, entry: any): number {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return 0;

    const entryText = `${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`.toLowerCase();
    const entryTokens = this.tokenize(entryText);

    if (entryTokens.length === 0) return 0;

    let score = 0;
    let maxPossible = 0;

    for (const token of queryTokens) {
      const tf = entryText.split(token.toLowerCase()).length - 1;
      if (tf > 0) {
        const idf = Math.log(this.totalDocuments / (this.documentFrequencies.get(token) || 1));
        score += tf * idf;
      }
      maxPossible += Math.log(this.totalDocuments);
    }

    return maxPossible > 0 ? score / maxPossible : 0;
  }

  private calculateKeywordOverlap(query: string, entry: any): number {
    const queryTokens = new Set(this.tokenize(query));
    const entryText = `${entry.question} ${entry.answer} ${entry.keywords?.join(' ') || ''}`.toLowerCase();
    const entryTokens = new Set(this.tokenize(entryText));

    if (queryTokens.size === 0 || entryTokens.size === 0) return 0;

    let intersection = 0;
    for (const token of queryTokens) {
      if (entryTokens.has(token)) intersection++;
    }

    return intersection / Math.max(queryTokens.size, 1);
  }
private levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;
  for (let i = 0; i <= bn; ++i) matrix[i][0] = i;
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[bn][an];
}
  private calculateLevenshteinSimilarity(query: string, entry: any): number {
    const queryLower = query.toLowerCase();
    let bestScore = 0;

    // Check against question
    const questionDist = this.levenshteinDistance(queryLower, entry.question.toLowerCase());
    const maxLen = Math.max(queryLower.length, entry.question.length);
    if (maxLen > 0) {
      bestScore = Math.max(bestScore, 1 - questionDist / maxLen);
    }

    // Check against keywords
    for (const keyword of entry.keywords || []) {
      const dist = this.levenshteinDistance(queryLower, keyword.toLowerCase());
      const maxLen = Math.max(queryLower.length, keyword.length);
      if (maxLen > 0) {
        bestScore = Math.max(bestScore, 1 - dist / maxLen);
      }
    }

    return bestScore > 0.7 ? bestScore * 0.5 : 0; // Downweight levenshtein
  }

  private findAcronymMatches(query: string, entry: any): string[] {
    const matches: string[] = [];
    const queryUpper = query.toUpperCase();

    // Check if query contains known acronyms from entry
    const acronyms = this.extractAcronyms(entry.question + ' ' + entry.answer);
    for (const acronym of acronyms) {
      if (queryUpper.includes(acronym.toUpperCase())) {
        matches.push(acronym);
      }
    }

    // Check if query itself is an acronym
    if (query.length <= 10 && /^[A-Z0-9]+$/.test(query.toUpperCase())) {
      if (entry.question.toUpperCase().includes(queryUpper) ||
          entry.answer.toUpperCase().includes(queryUpper)) {
        matches.push(query.toUpperCase());
      }
    }

    return matches;
  }

  private findExactKeywordMatches(query: string, entry: any): string[] {
    const matches: string[] = [];
    const queryLower = query.toLowerCase();

    for (const keyword of entry.keywords || []) {
      if (queryLower.includes(keyword.toLowerCase())) {
        matches.push(keyword);
      }
    }

    return matches;
  }

  private extractAcronyms(text: string): string[] {
    const acronymRegex = /\b[A-Z]{2,}\b/g;
    const matches = text.match(acronymRegex) || [];
    return [...new Set(matches)];
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1 && !this.config.stopWords.has(token));
  }

  private getNGrams(tokens: string[], n: number): string[] {
    const ngrams: string[] = [];
    for (let i = 0; i <= tokens.length - n; i++) {
      ngrams.push(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
  }

  private generateCacheKey(query: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query.toLowerCase().trim()).digest('hex');
  }

  private getCache(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this.cache.delete(key);
      const idx = this.lruKeys.indexOf(key);
      if (idx > -1) this.lruKeys.splice(idx, 1);
      return null;
    }

    return entry.results;
  }

  private setCache(query: string, result: any): void {
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.lruKeys.shift();
      if (oldestKey) this.cache.delete(oldestKey);
    }

    const key = this.generateCacheKey(query);
    this.cache.set(key, {
      queryHash: key,
      results: result.results,
      confidence: result.confidence,
      timestamp: Date.now(),
    });
    this.lruKeys.push(key);
  }

  clearCache(): void {
    this.cache.clear();
    this.lruKeys = [];
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      keys: this.lruKeys.length,
    };
  }
}

export function createNLPMatcher(config?: any): NLPMatcher {
  return new NLPMatcher(config);
}