/**
 * Analytics Service
 * Local telemetry tracker for STT latency, inference dropouts, model fallbacks, VAD triggers
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AnalyticsEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: AnalyticsEventType;
  category: string;
  data: Record<string, unknown>;
  metadata?: {
    provider?: string;
    model?: string;
    sessionId?: string;
    requestId?: string;
  };
}

export type AnalyticsEventType =
  | 'stt_latency'
  | 'stt_inference_dropout'
  | 'stt_vad_trigger'
  | 'stt_model_fallback'
  | 'stt_error'
  | 'llm_request'
  | 'llm_fallback'
  | 'llm_error'
  | 'llm_token_stream'
  | 'knowledge_base_hit'
  | 'knowledge_base_miss'
  | 'web_search_request'
  | 'web_search_fallback'
  | 'window_load'
  | 'window_crash'
  | 'circuit_breaker_trip'
  | 'circuit_breaker_recover'
  | 'speech_provider_health'
  | 'audio_capture_error'
  | 'vad_speech_start'
  | 'vad_speech_end'
  | 'user_action';

export interface AnalyticsConfig {
  flushInterval: number;
  maxBatchSize: number;
  maxQueueSize: number;
  logDirectory: string;
  enableConsoleLog: boolean;
}

export interface STTLatencyEvent {
  provider: string;
  model: string;
  latencyMs: number;
  audioDurationMs: number;
  isFinal: boolean;
  confidence: number;
  success: boolean;
  errorCode?: string;
}

export interface InferenceDropoutEvent {
  provider: string;
  model: string;
  dropoutCount: number;
  totalChunks: number;
  dropoutRate: number;
  lastSuccessfulChunk: number;
}

export interface VADTriggerEvent {
  provider: string;
  eventType: 'speech_start' | 'speech_end' | 'vad_trigger';
  audioLevel: number;
  confidence: number;
  channel: string;
}

export interface ModelFallbackEvent {
  fromProvider: string;
  fromModel: string;
  toProvider: string;
  toModel: string;
  reason: string;
  triggerType: 'timeout' | 'error' | 'circuit_breaker' | 'rate_limit' | 'manual';
}

export interface CircuitBreakerEvent {
  provider: string;
  eventType: 'trip' | 'recover' | 'half_open_test';
  failureCount: number;
  successCount: number;
  stateBefore: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  stateAfter: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class AnalyticsService {
  private config: AnalyticsConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private currentSessionId: string;
  private logFile: string;
  private isInitialized = false;
  private isShuttingDown = false;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = {
      flushInterval: config.flushInterval ?? 30000,
      maxBatchSize: config.maxBatchSize ?? 100,
      maxQueueSize: config.maxQueueSize ?? 10000,
      logDirectory: config.logDirectory ?? path.join(app.getPath('userData'), 'analytics'),
      enableConsoleLog: config.enableConsoleLog ?? process.env.NODE_ENV === 'development',
    };

    this.currentSessionId = this.generateSessionId();
    this.ensureLogDirectory();
    this.initialize();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }

  private initialize(): void {
    if (this.isInitialized) return;

    this.logFile = path.join(
      this.config.logDirectory,
      `analytics-${new Date().toISOString().split('T')[0]}.jsonl`
    );

    // Start flush interval
    this.flushInterval = setInterval(() => {
      this.flush().catch(console.error);
    }, this.config.flushInterval);

    // Flush on process exit
    process.on('beforeExit', () => this.flush());
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    this.isInitialized = true;
    console.log('[AnalyticsService] Initialized, session:', this.currentSessionId);
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Core tracking methods

  trackSTTLatency(event: STTLatencyEvent): void {
    this.enqueue({
      type: 'stt_latency',
      category: 'stt',
      data: event,
    });
  }

  trackInferenceDropout(event: InferenceDropoutEvent): void {
    this.enqueue({
      type: 'stt_inference_dropout',
      category: 'stt',
      data: event,
    });
  }

  trackVADTrigger(event: VADTriggerEvent): void {
    this.enqueue({
      type: event.eventType === 'speech_start' ? 'vad_speech_start' :
            event.eventType === 'speech_end' ? 'vad_speech_end' : 'stt_vad_trigger',
      category: 'stt',
      data: event,
    });
  }

  trackModelFallback(event: ModelFallbackEvent): void {
    this.enqueue({
      type: 'stt_model_fallback',
      category: 'stt',
      data: event,
    });
  }

  trackSTTError(provider: string, model: string, error: Error, context?: Record<string, unknown>): void {
    this.enqueue({
      type: 'stt_error',
      category: 'stt',
      data: {
        provider,
        model,
        error: error.message,
        stack: error.stack,
        ...context,
      },
    });
  }

  trackLLMRequest(provider: string, model: string, latencyMs: number, tokens: number, success: boolean, errorCode?: string): void {
    this.enqueue({
      type: 'llm_request',
      category: 'llm',
      data: {
        provider,
        model,
        latencyMs,
        tokens,
        success,
        errorCode,
      },
    });
  }

  trackLLMFallback(event: ModelFallbackEvent): void {
    this.enqueue({
      type: 'llm_fallback',
      category: 'llm',
      data: event,
    });
  }

  trackLLMError(provider: string, model: string, error: Error, context?: Record<string, unknown>): void {
    this.enqueue({
      type: 'llm_error',
      category: 'llm',
      data: {
        provider,
        model,
        error: error.message,
        stack: error.stack,
        ...context,
      },
    });
  }

  trackLLMTokenStream(provider: string, model: string, tokenCount: number, firstTokenLatencyMs: number, totalLatencyMs: number): void {
    this.enqueue({
      type: 'llm_token_stream',
      category: 'llm',
      data: {
        provider,
        model,
        tokenCount,
        firstTokenLatencyMs,
        totalLatencyMs,
        tokensPerSecond: tokenCount / (totalLatencyMs / 1000),
      },
    });
  }

  trackKnowledgeBaseHit(query: string, confidence: number, source: 'knowledge_base' | 'cache'): void {
    this.enqueue({
      type: 'knowledge_base_hit',
      category: 'knowledge_base',
      data: { query, confidence, source },
    });
  }

  trackKnowledgeBaseMiss(query: string, threshold: number): void {
    this.enqueue({
      type: 'knowledge_base_miss',
      category: 'knowledge_base',
      data: { query, threshold },
    });
  }

  trackWebSearchRequest(query: string, provider: string, latencyMs: number, success: boolean, errorCode?: string): void {
    this.enqueue({
      type: 'web_search_request',
      category: 'web_search',
      data: { query, provider, latencyMs, success, errorCode },
    });
  }

  trackWebSearchFallback(event: ModelFallbackEvent): void {
    this.enqueue({
      type: 'web_search_fallback',
      category: 'web_search',
      data: event,
    });
  }

  trackWindowLoad(windowId: string, loadTimeMs: number, success: boolean, errorCode?: string): void {
    this.enqueue({
      type: 'window_load',
      category: 'ui',
      data: { windowId, loadTimeMs, success, errorCode },
    });
  }

  trackWindowCrash(windowId: string, reason: string): void {
    this.enqueue({
      type: 'window_crash',
      category: 'ui',
      data: { windowId, reason },
    });
  }

  trackCircuitBreakerTrip(event: CircuitBreakerEvent): void {
    this.enqueue({
      type: event.eventType === 'trip' ? 'circuit_breaker_trip' : 'circuit_breaker_recover',
      category: 'circuit_breaker',
      data: event,
    });
  }

  trackCircuitBreakerEvent(event: CircuitBreakerEvent): void {
    this.enqueue({
      type: event.eventType === 'trip' ? 'circuit_breaker_trip' : 'circuit_breaker_recover',
      category: 'circuit_breaker',
      data: event,
    });
  }

  trackSpeechProviderHealth(provider: string, healthy: boolean, checks: Array<{ name: string; passed: boolean; message: string; latency?: number }>): void {
    this.enqueue({
      type: 'speech_provider_health',
      category: 'stt',
      data: { provider, healthy, checks },
    });
  }

  trackAudioCaptureError(error: Error, deviceId?: string): void {
    this.enqueue({
      type: 'audio_capture_error',
      category: 'audio',
      data: { error: error.message, stack: error.stack, deviceId },
    });
  }

  trackVADSpeechStart(provider: string, audioLevel: number, confidence: number, channel: string): void {
    this.enqueue({
      type: 'vad_speech_start',
      category: 'stt',
      data: { provider, audioLevel, confidence, channel },
    });
  }

  trackVADSpeechEnd(provider: string, audioLevel: number, confidence: number, channel: string, durationMs: number): void {
    this.enqueue({
      type: 'vad_speech_end',
      category: 'stt',
      data: { provider, audioLevel, confidence, channel, durationMs },
    });
  }

  trackUserAction(action: string, context?: Record<string, unknown>): void {
    this.enqueue({
      type: 'user_action',
      category: 'ui',
      data: { action, ...context },
    });
  }

  // Generic enqueue method
  private enqueue(event: Omit<AnalyticsEvent, 'id' | 'sessionId' | 'timestamp'>): void {
    if (this.isShuttingDown) return;

    if (this.eventQueue.length >= this.config.maxQueueSize) {
      // Drop oldest events if queue is full
      this.eventQueue.shift();
    }

    const fullEvent: AnalyticsEvent = {
      ...event,
      id: this.generateEventId(),
      sessionId: this.currentSessionId,
      timestamp: Date.now(),
    };

    this.eventQueue.push(fullEvent);

    // Console logging for development
    if (this.config.enableConsoleLog) {
      console.log(`[Analytics] ${event.category}:${event.type}`, event.data);
    }

    // Immediate flush for critical events
    if (this.isCriticalEvent(event.type)) {
      this.flush().catch(console.error);
    }
  }

  private isCriticalEvent(type: AnalyticsEventType): boolean {
    const criticalEvents: AnalyticsEventType[] = [
      'stt_error',
      'llm_error',
      'window_crash',
      'circuit_breaker_trip',
      'audio_capture_error',
    ];
    return criticalEvents.includes(type);
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || this.isShuttingDown) return;

    const eventsToFlush = this.eventQueue.splice(0, this.config.maxBatchSize);

    try {
      await this.writeEvents(eventsToFlush);
    } catch (error) {
      // Re-queue failed events (up to max queue size)
      const failedCount = eventsToFlush.length;
      const availableSpace = this.config.maxQueueSize - this.eventQueue.length;
      const eventsToRequeue = eventsToFlush.slice(0, Math.min(failedCount, availableSpace));
      this.eventQueue.unshift(...eventsToRequeue);
      console.error('[AnalyticsService] Failed to flush events:', error);
    }
  }

  private async writeEvents(events: AnalyticsEvent[]): Promise<void> {
    const lines = events.map(e => JSON.stringify(e)).join('\n') + '\n';

    return new Promise((resolve, reject) => {
      fs.appendFile(this.logFile, lines, 'utf8', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // Query methods for analytics dashboard
  async getEvents(
    startTime: number,
    endTime: number,
    types?: AnalyticsEventType[],
    limit = 1000
  ): Promise<AnalyticsEvent[]> {
    const allEvents: AnalyticsEvent[] = [];

    // Read current log file
    await this.readLogFile(this.logFile, allEvents, startTime, endTime, types);

    // Read rotated log files
    const logDir = this.config.logDirectory;
    const files = fs.readdirSync(logDir)
      .filter(f => f.startsWith('analytics-') && f.endsWith('.jsonl'))
      .sort()
      .reverse();

    for (const file of files) {
      if (allEvents.length >= 10000) break; // Limit total events read
      const filePath = path.join(logDir, file);
      await this.readLogFile(filePath, allEvents, startTime, endTime, types);
    }

    // Filter by type if specified
    let filtered = allEvents;
    if (types && types.length > 0) {
      filtered = allEvents.filter(e => types.includes(e.type));
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    return filtered.slice(0, limit);
  }

  private async readLogFile(
    filePath: string,
    events: AnalyticsEvent[],
    startTime: number,
    endTime: number,
    types?: AnalyticsEventType[]
  ): Promise<void> {
    if (!fs.existsSync(filePath)) return;

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
      let buffer = '';

      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line) as AnalyticsEvent;
            if (event.timestamp < startTime || event.timestamp > endTime) continue;
            if (types && types.length > 0 && !types.includes(event.type)) continue;

            events.push(event);
          } catch {
            // Skip malformed lines
          }
        }
      });

      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  async getAggregatedStats(
    startTime: number,
    endTime: number
  ): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByCategory: Record<string, number>;
    averageLatencies: Record<string, number>;
    errorRates: Record<string, number>;
    fallbackCounts: Record<string, number>;
  }> {
    const events = await this.getEvents(startTime, endTime, undefined, 50000);

    const stats = {
      totalEvents: events.length,
      eventsByType: {} as Record<string, number>,
      eventsByCategory: {} as Record<string, number>,
      averageLatencies: {} as Record<string, number>,
      errorRates: {} as Record<string, number>,
      fallbackCounts: {} as Record<string, number>,
    };

    const latencySums: Record<string, { sum: number; count: number }> = {};
    const errorCounts: Record<string, { errors: number; total: number }> = {};
    const fallbackCounts: Record<string, number> = {};

    for (const event of events) {
      stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
      stats.eventsByCategory[event.category] = (stats.eventsByCategory[event.category] || 0) + 1;

      // Track latencies
      if (event.data.latencyMs !== undefined) {
        const key = `${event.category}:${event.type}`;
        if (!latencySums[key]) latencySums[key] = { sum: 0, count: 0 };
        latencySums[key].sum += event.data.latencyMs as number;
        latencySums[key].count += 1;
      }

      // Track errors
      if (event.type.includes('error') || event.type.includes('fallback') || event.type === 'circuit_breaker_trip') {
        const key = event.category;
        if (!errorCounts[key]) errorCounts[key] = { errors: 0, total: 0 };
        errorCounts[key].errors += 1;
      }
      errorCounts[event.category] = errorCounts[event.category] || { errors: 0, total: 0 };
      errorCounts[event.category].total += 1;

      // Track fallbacks
      if (event.type.includes('fallback')) {
        const fromProvider = (event.data.fromProvider as string) || 'unknown';
        const toProvider = (event.data.toProvider as string) || 'unknown';
        const key = `${fromProvider}->${toProvider}`;
        fallbackCounts[key] = (fallbackCounts[key] || 0) + 1;
      }
    }

    // Calculate averages
    for (const [key, { sum, count }] of Object.entries(latencySums)) {
      stats.averageLatencies[key] = count > 0 ? sum / count : 0;
    }

    // Calculate error rates
    for (const [key, { errors, total }] of Object.entries(errorCounts)) {
      stats.errorRates[key] = total > 0 ? errors / total : 0;
    }

    stats.fallbackCounts = fallbackCounts;

    return stats;
  }

  // Session management
  getCurrentSessionId(): string {
    return this.currentSessionId;
  }

  newSession(): void {
    this.flush().catch(console.error);
    this.currentSessionId = this.generateSessionId();
    console.log('[AnalyticsService] New session started:', this.currentSessionId);
  }

  // Shutdown
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('[AnalyticsService] Shutting down...');

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    await this.flush();

    console.log('[AnalyticsService] Shutdown complete');
  }

  // Getters
  getQueueSize(): number {
    return this.eventQueue.length;
  }

  getCurrentSession(): string {
    return this.currentSessionId;
  }

  isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }
}

// Singleton instance
let analyticsServiceInstance: AnalyticsService | null = null;

export function getAnalyticsService(): AnalyticsService {
  if (!analyticsServiceInstance) {
    analyticsServiceInstance = new AnalyticsService();
  }
  return analyticsServiceInstance;
}

export function initializeAnalyticsService(config?: Partial<AnalyticsConfig>): AnalyticsService {
  analyticsServiceInstance = new AnalyticsService(config);
  return analyticsServiceInstance;
}

export function shutdownAnalyticsService(): void {
  if (analyticsServiceInstance) {
    analyticsServiceInstance.shutdown().catch(console.error);
    analyticsServiceInstance = null;
  }
}