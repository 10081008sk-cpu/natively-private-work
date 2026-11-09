/**
 * SQLite Database Layer
 * Production-grade SQLite connection with WAL mode and performance optimizations
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { app } from 'electron';

export interface TranscriptSession {
  id: string;
  session_id: string;
  start_time: number;
  end_time?: number;
  duration?: number;
  mode: string;
  language: string;
  provider: string;
  total_chunks: number;
  total_tokens: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export interface AudioChunk {
  id: string;
  session_id: string;
  chunk_index: number;
  audio_data: Buffer;
  sample_rate: number;
  channels: number;
  duration_ms: number;
  vad_speech_start: number;
  vad_speech_end: number;
  is_speech: number;
  confidence: number;
  created_at: number;
}

export interface TranscriptChunk {
  id: string;
  session_id: string;
  chunk_index: number;
  text: string;
  is_final: number;
  confidence: number;
  timestamp: number;
  speaker: string;
  language: string;
  provider: string;
  processing_time_ms: number;
  metadata: string;
  created_at: number;
}

export interface QAEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  keywords: string;
  confidence: number;
  source: string;
  usage_count: number;
  last_used: number;
  metadata: string;
  created_at: number;
  updated_at: number;
}

export interface ModelPerformance {
  id: string;
  provider: string;
  model: string;
  operation: string;
  latency_ms: number;
  success: number;
  error_code?: string;
  error_message?: string;
  metadata: string;
  created_at: number;
}

export interface VADEvent {
  id: string;
  session_id: string;
  event_type: 'speech_start' | 'speech_end' | 'vad_trigger';
  timestamp: number;
  audio_level: number;
  confidence: number;
  channel: string;
  metadata: string;
  created_at: number;
}

export class DatabaseManager {
  private db: Database.Database;
  private readonly dbPath: string;
  private isInitialized = false;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(app.getPath('userData'), 'natively.db');
    this.ensureDirectory();
    this.db = this.createConnection();
    this.initialize();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private createConnection(): Database.Database {
    const db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

    // Performance pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000');
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');
    db.pragma('page_size = 4096');
    db.pragma('mmap_size = 268435456');
    db.pragma('busy_timeout = 5000');

    return db;
  }

  private initialize(): void {
    if (this.isInitialized) return;

    this.createTables();
    this.createIndexes();
    this.isInitialized = true;
    console.log('[DatabaseManager] Initialized with WAL mode at:', this.dbPath);
  }

  private createTables(): void {
    const schema = `
      -- Transcript Sessions
      CREATE TABLE IF NOT EXISTS transcript_sessions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        mode TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'en-US',
        provider TEXT NOT NULL,
        total_chunks INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Audio Chunks
      CREATE TABLE IF NOT EXISTS audio_chunks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        audio_data BLOB,
        sample_rate INTEGER NOT NULL DEFAULT 16000,
        channels INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER NOT NULL,
        vad_speech_start INTEGER,
        vad_speech_end INTEGER,
        is_speech INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0.0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES transcript_sessions(session_id) ON DELETE CASCADE
      );

      -- Transcript Chunks
      CREATE TABLE IF NOT EXISTS transcript_chunks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        is_final INTEGER NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0.0,
        timestamp INTEGER NOT NULL,
        speaker TEXT NOT NULL DEFAULT 'user',
        language TEXT NOT NULL DEFAULT 'en-US',
        provider TEXT NOT NULL,
        processing_time_ms INTEGER NOT NULL DEFAULT 0,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES transcript_sessions(session_id) ON DELETE CASCADE
      );

      -- Q&A Knowledge Base
      CREATE TABLE IF NOT EXISTS qa_entries (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        keywords TEXT DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.8,
        source TEXT NOT NULL DEFAULT 'user',
        usage_count INTEGER NOT NULL DEFAULT 0,
        last_used INTEGER,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      -- Model Performance Metrics
      CREATE TABLE IF NOT EXISTS model_performance (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        operation TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        success INTEGER NOT NULL DEFAULT 1,
        error_code TEXT,
        error_message TEXT,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      -- VAD Events
      CREATE TABLE IF NOT EXISTS vad_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        audio_level REAL NOT NULL DEFAULT 0.0,
        confidence REAL NOT NULL DEFAULT 0.0,
        channel TEXT NOT NULL DEFAULT 'mic',
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES transcript_sessions(session_id) ON DELETE CASCADE
      );

      -- Settings
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'string',
        description TEXT,
        updated_at INTEGER NOT NULL
      );
    `;

    this.db.exec(schema);
  }

  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_transcript_sessions_session_id ON transcript_sessions(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_transcript_sessions_start_time ON transcript_sessions(start_time);',
      'CREATE INDEX IF NOT EXISTS idx_transcript_sessions_mode ON transcript_sessions(mode);',
      'CREATE INDEX IF NOT EXISTS idx_audio_chunks_session_id ON audio_chunks(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_audio_chunks_chunk_index ON audio_chunks(session_id, chunk_index);',
      'CREATE INDEX IF NOT EXISTS idx_transcript_chunks_session_id ON transcript_chunks(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_transcript_chunks_chunk_index ON transcript_chunks(session_id, chunk_index);',
      'CREATE INDEX IF NOT EXISTS idx_transcript_chunks_timestamp ON transcript_chunks(timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_qa_entries_category ON qa_entries(category);',
      'CREATE INDEX IF NOT EXISTS idx_qa_entries_question ON qa_entries(question);',
      'CREATE INDEX IF NOT EXISTS idx_qa_entries_keywords ON qa_entries(keywords);',
      'CREATE INDEX IF NOT EXISTS idx_model_performance_provider ON model_performance(provider);',
      'CREATE INDEX IF NOT EXISTS idx_model_performance_operation ON model_performance(operation);',
      'CREATE INDEX IF NOT EXISTS idx_model_performance_created_at ON model_performance(created_at);',
      'CREATE INDEX IF NOT EXISTS idx_vad_events_session_id ON vad_events(session_id);',
      'CREATE INDEX IF NOT EXISTS idx_vad_events_timestamp ON vad_events(timestamp);',
    ];

    for (const index of indexes) {
      this.db.exec(index);
    }
  }

  // Transcript Session Operations
  createSession(session: Omit<TranscriptSession, 'created_at' | 'updated_at'>): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO transcript_sessions (id, session_id, start_time, end_time, duration, mode, language, provider, total_chunks, total_tokens, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.session_id,
      session.start_time,
      session.end_time ?? null,
      session.duration ?? null,
      session.mode,
      session.language,
      session.provider,
      session.total_chunks,
      session.total_tokens,
      session.metadata,
      now,
      now
    );
  }

  updateSession(sessionId: string, updates: Partial<TranscriptSession>): void {
    const fields: string[] = [];
    const values: any[] = [];
    const now = Date.now();

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'session_id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(sessionId);

    const stmt = this.db.prepare(`
      UPDATE transcript_sessions SET ${fields.join(', ')} WHERE session_id = ?
    `);
    stmt.run(...values);
  }

  getSession(sessionId: string): TranscriptSession | null {
    const stmt = this.db.prepare('SELECT * FROM transcript_sessions WHERE session_id = ?');
    return stmt.get(sessionId) as TranscriptSession | null;
  }

  getRecentSessions(limit = 50): TranscriptSession[] {
    const stmt = this.db.prepare('SELECT * FROM transcript_sessions ORDER BY start_time DESC LIMIT ?');
    return stmt.all(limit) as TranscriptSession[];
  }

  // Audio Chunk Operations
  insertAudioChunk(chunk: Omit<AudioChunk, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO audio_chunks (id, session_id, chunk_index, audio_data, sample_rate, channels, duration_ms, vad_speech_start, vad_speech_end, is_speech, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      chunk.id,
      chunk.session_id,
      chunk.chunk_index,
      chunk.audio_data,
      chunk.sample_rate,
      chunk.channels,
      chunk.duration_ms,
      chunk.vad_speech_start ?? null,
      chunk.vad_speech_end ?? null,
      chunk.is_speech,
      chunk.confidence,
      Date.now()
    );
  }

  getAudioChunks(sessionId: string): AudioChunk[] {
    const stmt = this.db.prepare('SELECT * FROM audio_chunks WHERE session_id = ? ORDER BY chunk_index');
    return stmt.all(sessionId) as AudioChunk[];
  }

  // Transcript Chunk Operations
  insertTranscriptChunk(chunk: Omit<TranscriptChunk, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO transcript_chunks (id, session_id, chunk_index, text, is_final, confidence, timestamp, speaker, language, provider, processing_time_ms, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      chunk.id,
      chunk.session_id,
      chunk.chunk_index,
      chunk.text,
      chunk.is_final,
      chunk.confidence,
      chunk.timestamp,
      chunk.speaker,
      chunk.language,
      chunk.provider,
      chunk.processing_time_ms,
      chunk.metadata,
      Date.now()
    );
  }

  getTranscriptChunks(sessionId: string): TranscriptChunk[] {
    const stmt = this.db.prepare('SELECT * FROM transcript_chunks WHERE session_id = ? ORDER BY chunk_index');
    return stmt.all(sessionId) as TranscriptChunk[];
  }

  // Q&A Operations
  insertQAEntry(entry: Omit<QAEntry, 'created_at' | 'updated_at'>): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO qa_entries (id, question, answer, category, keywords, confidence, source, usage_count, last_used, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.id,
      entry.question,
      entry.answer,
      entry.category,
      entry.keywords,
      entry.confidence,
      entry.source,
      entry.usage_count,
      entry.last_used ?? null,
      entry.metadata,
      now,
      now
    );
  }

  updateQAEntry(id: string, updates: Partial<QAEntry>): void {
    const fields: string[] = [];
    const values: any[] = [];
    const now = Date.now();

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE qa_entries SET ${fields.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
  }

  searchQAEntries(query: string, category?: string, limit = 10): QAEntry[] {
    let sql = 'SELECT * FROM qa_entries WHERE question LIKE ? OR answer LIKE ? OR keywords LIKE ?';
    const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY usage_count DESC, confidence DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as QAEntry[];
  }

  getQAEntry(id: string): QAEntry | null {
    const stmt = this.db.prepare('SELECT * FROM qa_entries WHERE id = ?');
    return stmt.get(id) as QAEntry | null;
  }

  // Model Performance
  recordModelPerformance(perf: Omit<ModelPerformance, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO model_performance (id, provider, model, operation, latency_ms, success, error_code, error_message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      perf.id,
      perf.provider,
      perf.model,
      perf.operation,
      perf.latency_ms,
      perf.success ? 1 : 0,
      perf.error_code ?? null,
      perf.error_message ?? null,
      perf.metadata,
      Date.now()
    );
  }

  getModelPerformance(provider?: string, operation?: string, limit = 100): ModelPerformance[] {
    let sql = 'SELECT * FROM model_performance WHERE 1=1';
    const params: any[] = [];

    if (provider) {
      sql += ' AND provider = ?';
      params.push(provider);
    }
    if (operation) {
      sql += ' AND operation = ?';
      params.push(operation);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as ModelPerformance[];
  }

  // VAD Events
  insertVADEvent(event: Omit<VADEvent, 'created_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO vad_events (id, session_id, event_type, timestamp, audio_level, confidence, channel, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.id,
      event.session_id,
      event.event_type,
      event.timestamp,
      event.audio_level,
      event.confidence,
      event.channel,
      event.metadata,
      Date.now()
    );
  }

  getVADEvents(sessionId: string): VADEvent[] {
    const stmt = this.db.prepare('SELECT * FROM vad_events WHERE session_id = ? ORDER BY timestamp');
    return stmt.all(sessionId) as VADEvent[];
  }

  // Settings
  setSetting(key: string, value: any, type = 'json', description = ''): void {
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value, type, description, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, type = excluded.type, description = excluded.description, updated_at = excluded.updated_at
    `);
    stmt.run(key, valueStr, type, description, Date.now());
  }

  getSetting<T>(key: string, defaultValue?: T): T | null {
    const stmt = this.db.prepare('SELECT value, type FROM app_settings WHERE key = ?');
    const row = stmt.get(key) as { value: string; type: string } | null;

    if (!row) return defaultValue ?? null;

    try {
      if (row.type === 'json') return JSON.parse(row.value) as T;
      if (row.type === 'number') return parseFloat(row.value) as T;
      if (row.type === 'boolean') return false as unknown as T;//return row.value === 'true' as T;
      return row.value as T;
    } catch {
      return defaultValue ?? null;
    }
  }

  // Utility
  executeTransaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  vacuum(): void {
    this.db.exec('VACUUM;');
  }

  backup(backupPath: string): void {
    this.db.backup(backupPath);
  }

  close(): void {
    this.db.close();
    this.isInitialized = false;
  }

  getStats(): { size: number; pageCount: number; walSize: number } {
    const dbStat = fs.statSync(this.dbPath);
    const walPath = `${this.dbPath}-wal`;
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    const pageCountStmt = this.db.prepare('PRAGMA page_count;');
    const pageCount = pageCountStmt.get() as { page_count: number };

    return {
      size: dbStat.size,
      pageCount: pageCount.page_count,
      walSize,
    };
  }
}

// Singleton instance
let databaseManagerInstance: DatabaseManager | null = null;

export function getDatabaseManager(): DatabaseManager {
  if (!databaseManagerInstance) {
    databaseManagerInstance = new DatabaseManager();
  }
  return databaseManagerInstance;
}

export function initializeDatabase(dbPath?: string): DatabaseManager {
  databaseManagerInstance = new DatabaseManager(dbPath);
  return databaseManagerInstance;
}

export function closeDatabase(): void {
  if (databaseManagerInstance) {
    databaseManagerInstance.close();
    databaseManagerInstance = null;
  }
}