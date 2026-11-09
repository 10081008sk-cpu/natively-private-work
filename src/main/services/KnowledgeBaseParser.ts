/**
 * Knowledge Base Parser
 * Parses TXT, MD, JSON, CSV, PDF, and DOCX files into semantic chunks
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface ParsedKnowledgeEntry {
  question: string;
  answer: string;
  category?: string;
  keywords?: string[];
  confidence?: number;
  source?: string;
  metadata?: Record<string, any>;
}

export interface ParseResult {
  entries: ParsedKnowledgeEntry[];
  errors: string[];
  warnings: string[];
  stats: {
    totalLines: number;
    parsedEntries: number;
    skippedLines: number;
    fileSize: number;
    parseTimeMs: number;
  };
}

export interface ParserOptions {
  defaultCategory?: string;
  defaultConfidence?: number;
  source?: string;
  extractKeywords?: boolean;
  maxEntryLength?: number;
  minEntryLength?: number;
}

export class KnowledgeBaseParser {
  private options: Required<ParserOptions>;
  private contentHashes = new Set<string>();

  constructor(options: ParserOptions = {}) {
    this.options = {
      defaultCategory: options.defaultCategory || 'general',
      defaultConfidence: options.defaultConfidence ?? 0.8,
      source: options.source || 'user-import',
      extractKeywords: options.extractKeywords ?? true,
      maxEntryLength: options.maxEntryLength ?? 10000,
      minEntryLength: options.minEntryLength ?? 10,
    };
  }

  
async parseFile(filePath: string): Promise<ParseResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const entries: ParsedKnowledgeEntry[] = [];

  let content = '';
  let fileSize = 0;

  try {
    // Get file information once
    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
      throw new Error('Provided path is not a file');
    }

    fileSize = stats.size;

    const extension = path.extname(filePath).toLowerCase();

    switch (extension) {
      case '.json': {
        content = fs.readFileSync(filePath, 'utf8');

        const jsonResult = this.parseJSON(content);

        entries.push(...jsonResult.entries);
        errors.push(...jsonResult.errors);
        warnings.push(...jsonResult.warnings);
        break;
      }

      case '.md':
      case '.txt': {
        content = fs.readFileSync(filePath, 'utf8');

        const textResult = this.parseText(content);

        entries.push(...textResult.entries);
        errors.push(...textResult.errors);
        warnings.push(...textResult.warnings);
        break;
      }

      case '.csv': {
        content = fs.readFileSync(filePath, 'utf8');

        const csvResult = this.parseCSV(content);

        entries.push(...csvResult.entries);
        errors.push(...csvResult.errors);
        warnings.push(...csvResult.warnings);
        break;
      }

      case '.pdf': {
        warnings.push('PDF parsing not implemented, skipping');
        break;
      }

      case '.docx': {
        warnings.push('DOCX parsing not implemented, skipping');
        break;
      }

      default: {
        errors.push(`Unsupported file format: ${extension || 'unknown'}`);
        break;
      }
    }

    // Validate and filter entries
    const validEntries = this.validateEntries(entries);

    return {
      entries: validEntries,
      errors,
      warnings,
      stats: {
        totalLines: content ? content.split(/\r\n|\r|\n/).length : 0,
        parsedEntries: validEntries.length,
        skippedLines: entries.length - validEntries.length,
        fileSize,
        parseTimeMs: Date.now() - startTime,
      },
    };

  } catch (error: unknown) {
    return {
      entries: [],
      errors: [
        `Failed to parse file: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      warnings,
      stats: {
        totalLines: 0,
        parsedEntries: 0,
        skippedLines: 0,
        fileSize,
        parseTimeMs: Date.now() - startTime,
      },
    };
  }
}


  parseJSON(content: string): { entries: ParsedKnowledgeEntry[]; errors: string[]; warnings: string[] } {
    const entries: ParsedKnowledgeEntry[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const data = JSON.parse(content);

      if (!Array.isArray(data)) {
        errors.push('JSON root must be an array of objects');
        return { entries, errors, warnings };
      }

      for (let i = 0; i < data.length; i++) {
        const item = data[i];

        if (!item || typeof item !== 'object') {
          warnings.push(`Item ${i}: Not an object, skipping`);
          continue;
        }

        // Handle different JSON formats
        let question = '';
        let answer = '';
        let keywords: string[] = [];
        let category = this.options.defaultCategory;
        let confidence = this.options.defaultConfidence;

        // Format 1: { question: "...", answer: "..." }
        if (item.question && item.answer) {
          question = String(item.question).trim();
          answer = String(item.answer).trim();
        }
        // Format 2: { keywords: [...], answer: "..." }
        else if (item.keywords && item.answer) {
          keywords = Array.isArray(item.keywords) ? item.keywords.map(String) : [String(item.keywords)];
          answer = String(item.answer).trim();
          question = keywords.join(', ');
        }
        // Format 3: { q: "...", a: "..." } or { query: "...", response: "..." }
        else if ((item.q || item.query) && (item.a || item.response)) {
          question = String(item.q || item.query).trim();
          answer = String(item.a || item.response).trim();
        }
        // Format 4: Key-value pairs where key is short (acronym/topic)
        else {
          const keys = Object.keys(item);
          if (keys.length === 1) {
            const key = keys[0];
            const value = item[key];
            if (typeof value === 'string' && value.trim().length > 0) {
              // Check if key looks like an acronym/topic
              if (key.length <= 20 && /^[A-Z0-9_\-\s]+$/i.test(key)) {
                question = key;
                answer = value.trim();
              } else {
                question = value.trim();
                answer = ''; // Will be filtered out
              }
            }
          } else if (keys.length >= 2) {
            // Try to find question/answer pairs
            const questionKeys = keys.filter(k => /^(q|question|query|prompt)$/i.test(k));
            const answerKeys = keys.filter(k => /^(a|answer|response|reply)$/i.test(k));

            if (questionKeys.length > 0 && answerKeys.length > 0) {
              question = String(item[questionKeys[0]]).trim();
              answer = String(item[answerKeys[0]]).trim();
            }
          }
        }

        if (!question && !answer) {
          warnings.push(`Item ${i}: No recognizable question/answer format`);
          continue;
        }

        if (this.options.extractKeywords && !keywords.length) {
          keywords = this.extractKeywords(question + ' ' + answer);
        }

        entries.push({
          question: question || this.generateQuestionFromAnswer(answer),
          answer: answer || '',
          category,
          keywords,
          confidence,
          source: this.options.source,
        });
      }
    } catch (error) {
      errors.push(`JSON parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { entries, errors, warnings };
  }

  parseText(content: string): { entries: ParsedKnowledgeEntry[]; errors: string[]; warnings: string[] } {
    const entries: ParsedKnowledgeEntry[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = content.split('\n');
    let currentQuestion = '';
    let currentAnswer = '';
    let currentCategory = this.options.defaultCategory;
    let inAnswer = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        if (currentQuestion && currentAnswer) {
          this.addEntry(entries, currentQuestion, currentAnswer, currentCategory);
          currentQuestion = '';
          currentAnswer = '';
          inAnswer = false;
        }
        continue;
      }

      // Check for category headers
      const categoryMatch = trimmed.match(/^#+\s*(.+)$/);
      if (categoryMatch) {
        if (currentQuestion && currentAnswer) {
          this.addEntry(entries, currentQuestion, currentAnswer, currentCategory);
        }
        currentCategory = categoryMatch[1].trim();
        currentQuestion = '';
        currentAnswer = '';
        inAnswer = false;
        continue;
      }

      // Check for explicit Q/A markers
      const qMatch = trimmed.match(/^(?:Q|Question|Query|Prompt)\s*[:]\s*(.+)$/i);
      const aMatch = trimmed.match(/^(?:A|Answer|Response|Reply)\s*[:]\s*(.+)$/i);

      if (qMatch) {
        if (currentQuestion && currentAnswer) {
          this.addEntry(entries, currentQuestion, currentAnswer, currentCategory);
        }
        currentQuestion = qMatch[1].trim();
        currentAnswer = '';
        inAnswer = false;
        continue;
      }

      if (aMatch) {
        currentAnswer = aMatch[1].trim();
        inAnswer = true;
        continue;
      }

      // Check for key-value format (key: value)
      const kvMatch = trimmed.match(/^([^:]{1,50}):\s*(.+)$/);
      if (kvMatch && !trimmed.startsWith('http')) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();

        if (currentQuestion && currentAnswer) {
          this.addEntry(entries, currentQuestion, currentAnswer, currentCategory);
        }

        // Check if key looks like an acronym/topic
        if (key.length <= 30 && /^[A-Z0-9_\-\s]+$/i.test(key) && value.length > 5) {
          entries.push({
            question: key,
            answer: value,
            category: currentCategory,
            keywords: this.options.extractKeywords ? this.extractKeywords(key + ' ' + value) : [],
            confidence: this.options.defaultConfidence,
            source: this.options.source,
          });
        } else {
          currentQuestion = key;
          currentAnswer = value;
          inAnswer = true;
        }
        continue;
      }

      // Regular text line
      if (inAnswer) {
        currentAnswer += (currentAnswer ? '\n' : '') + trimmed;
      } else if (!currentQuestion) {
        currentQuestion = trimmed;
        inAnswer = true;
      } else {
        currentAnswer += (currentAnswer ? '\n' : '') + trimmed;
        inAnswer = true;
      }
    }

    // Don't forget the last entry
    if (currentQuestion && currentAnswer) {
      this.addEntry(entries, currentQuestion, currentAnswer, currentCategory);
    }

    return { entries, errors, warnings };
  }

  parseCSV(content: string): { entries: ParsedKnowledgeEntry[]; errors: string[]; warnings: string[] } {
    const entries: ParsedKnowledgeEntry[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return { entries, errors, warnings };

    // Parse header
    const headers = this.parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const questionIdx = headers.indexOf('question');
    const answerIdx = headers.indexOf('answer');
    const categoryIdx = headers.indexOf('category');
    const keywordsIdx = headers.indexOf('keywords');
    const confidenceIdx = headers.indexOf('confidence');
    const sourceIdx = headers.indexOf('source');

    if (questionIdx === -1 || answerIdx === -1) {
      errors.push('CSV must contain "question" and "answer" columns');
      return { entries, errors, warnings };
    }

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length <= Math.max(questionIdx, answerIdx)) continue;

      const question = values[questionIdx]?.trim() || '';
      const answer = values[answerIdx]?.trim() || '';

      if (!question || !answer) continue;

      const category = categoryIdx >= 0 ? (values[categoryIdx]?.trim() || 'general') : 'general';
      const confidence = confidenceIdx >= 0 ? parseFloat(values[confidenceIdx] || '0.8') : 0.8;
      const source = sourceIdx >= 0 ? (values[sourceIdx]?.trim() || 'csv-import') : 'csv-import';

      let keywords: string[] = [];
      if (keywordsIdx >= 0 && values[keywordsIdx]) {
        keywords = values[keywordsIdx].split(';').map(k => k.trim()).filter(Boolean);
      }

      entries.push({
        question,
        answer,
        category,
        keywords: keywords.length > 0 ? keywords : undefined,
        confidence,
        source,
      });
    }

    return { entries, errors, warnings };
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

  private addEntry(entries: ParsedKnowledgeEntry[], question: string, answer: string, category: string): void {
    question = question.trim();
    answer = answer.trim();

    if (!question || !answer) return;
    if (question.length < this.options.minEntryLength || answer.length < this.options.minEntryLength) return;
    if (question.length > this.options.maxEntryLength || answer.length > this.options.maxEntryLength) return;

    const keywords = this.options.extractKeywords ? this.extractKeywords(question + ' ' + answer) : [];

    entries.push({
      question: question.trim(),
      answer: answer.trim(),
      category,
      keywords: keywords.length > 0 ? keywords : undefined,
      confidence: this.options.defaultConfidence,
      source: this.options.source,
    });
  }

  private validateEntries(entries: ParsedKnowledgeEntry[]): ParsedKnowledgeEntry[] {
    const valid: ParsedKnowledgeEntry[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      // Check for duplicates
      const hash = this.hashEntry(entry.question, entry.answer);
      if (this.contentHashes.has(hash)) continue;
      this.contentHashes.add(hash);

      // Validate length
      if (entry.question.length < this.options.minEntryLength ||
          entry.answer.length < this.options.minEntryLength) {
        continue;
      }

      if (entry.question.length > this.options.maxEntryLength ||
          entry.answer.length > this.options.maxEntryLength) {
        continue;
      }

      // Ensure required fields
      if (!entry.question.trim() || !entry.answer.trim()) continue;

      // Ensure category
      if (!entry.category) entry.category = this.options.defaultCategory;

      // Ensure confidence
      if (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) {
        entry.confidence = this.options.defaultConfidence;
      }

      // Ensure source
      if (!entry.source) entry.source = this.options.source;

      // Ensure keywords
      if (!entry.keywords || entry.keywords.length === 0) {
        entry.keywords = this.extractKeywords(entry.question + ' ' + entry.answer);
      }

      valid.push(entry);
    }

    return valid;
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
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

    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Count frequencies
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Return top keywords by frequency
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private generateQuestionFromAnswer(answer: string): string {
    // Simple heuristic: first sentence or first 50 chars
    const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      return sentences[0].trim().substring(0, 100);
    }
    return answer.substring(0, 100);
  }

  private hashEntry(question: string, answer: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(`${question}|${answer}`).digest('hex');
  }

  async parseMultipleFiles(filePaths: string[]): Promise<ParseResult> {
    const allEntries: ParsedKnowledgeEntry[] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let totalLines = 0;
    let totalParsed = 0;
    let totalSkipped = 0;
    let totalSize = 0;
    let totalTime = 0;

    for (const filePath of filePaths) {
      const result = await this.parseFile(filePath);
      allEntries.push(...result.entries);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
      totalLines += result.stats.totalLines;
      totalParsed += result.stats.parsedEntries;
      totalSkipped += result.stats.skippedLines;
      totalSize += result.stats.fileSize;
      totalTime += result.stats.parseTimeMs;
    }

    return {
      entries: allEntries,
      errors: allErrors,
      warnings: allWarnings,
      stats: {
        totalLines,
        parsedEntries: totalParsed,
        skippedLines: totalSkipped,
        fileSize: totalSize,
        parseTimeMs: totalTime,
      },
    };
  }
}

let knowledgeBaseParserInstance: KnowledgeBaseParser | null = null;

export function createParser(options?: any): KnowledgeBaseParser {
  return new KnowledgeBaseParser(options);
}

export function getKnowledgeBaseParser(): KnowledgeBaseParser {
  if (!knowledgeBaseParserInstance) {
    knowledgeBaseParserInstance = new KnowledgeBaseParser();
  }
  return knowledgeBaseParserInstance;
}