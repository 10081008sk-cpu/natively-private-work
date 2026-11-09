/**
 * Orchestrator Service
 * Tiered fallback pipeline: Knowledge Base -> Web Search -> Multi-Provider LLM
 */

import { EventEmitter } from 'events';
import { AbortController } from 'abort-controller';
import { NLPMatcher } from './NLPMatcher';
import { KnowledgeBase } from './KnowledgeBase';

export interface AIRequest {
  query: string;
  context?: string;
  mode?: string;
  preferences?: UserPreferences;
  maxResponseTime?: number;
  previousAttempts?: number;
  requestId?: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  routing: 'knowledge_base' | 'web_search' | 'llm_primary' | 'llm_fallback' | 'emergency';
  confidence: number;
  processingTime: number;
  error?: string;
  fallbackReason?: string;
  metadata?: Record<string, any>;
}

export interface UserPreferences {
  preferredProvider?: string;
  responseLanguage?: string;
  verboseMode?: boolean;
  enableFallback?: boolean;
  confidenceThreshold?: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'knowledge_base' | 'web_search' | 'llm';
  priority: number;
  enabled: boolean;
  timeout: number;
  maxRetries: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  circuitBreakerConfig?: {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    resetTimeout: number;
  };
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private readonly config: {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    resetTimeout: number;
  };

  constructor(config: { failureThreshold: number; successThreshold: number; timeout: number; resetTimeout: number }) {
    this.config = config;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  private transitionToHalfOpen(): void {
    this.state = 'HALF_OPEN';
    this.successes = 0;
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      if (this.successes >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === 'CLOSED') {
      this.failures = 0;
    }
  }

  private transitionToClosed(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionToOpen();
    } else if (this.state === 'CLOSED' && this.failures >= 3) {
      this.transitionToOpen();
    }
  }

  private transitionToOpen(): void {
    this.state = 'OPEN';
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  getMetrics() {
    return {
      totalCalls: this.failures + this.successes,
      successfulCalls: this.successes,
      failedCalls: this.failures,
      currentState: this.state,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = 0;
  }
}

export class OrchestratorService extends EventEmitter {
  private nlpMatcher: any;
  private knowledgeBase: any;
  private providers: Map<string, ProviderConfig> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private requestQueue: Array<{ request: any; resolve: (value: any) => void; reject: (error: Error) => void }> = [];
  private isProcessing = false;
  private maxConcurrentRequests = 3;
  private activeRequests = 0;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(nlpMatcher: any, knowledgeBase: any) {
    super();
    this.nlpMatcher = nlpMatcher;
    this.knowledgeBase = knowledgeBase;
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Knowledge Base (Tier 1 - Instant)
    this.providers.set('knowledge_base', {
      id: 'knowledge_base',
      name: 'Local Knowledge Base',
      type: 'knowledge_base',
      priority: 1,
      enabled: true,
      timeout: 100,
      maxRetries: 0,
    });

    // Web Search (Tier 2 - Fast)
    this.providers.set('web_search', {
      id: 'web_search',
      name: 'Web Search',
      type: 'web_search',
      priority: 2,
      enabled: true,
      timeout: 2500,
      maxRetries: 1,
      rateLimit: {
        requestsPerMinute: 30,
        tokensPerMinute: 10000,
      },
    });

    // LLM Providers (Tier 3 - Fallback chain)
    const llmProviders: ProviderConfig[] = [
      {
        id: 'gemini',
        name: 'Gemini 3.1 Flash',
        type: 'llm',
        priority: 3,
        enabled: true,
        timeout: 10000,
        maxRetries: 2,
        rateLimit: { requestsPerMinute: 60, tokensPerMinute: 100000 },
        circuitBreakerConfig: { failureThreshold: 3, successThreshold: 2, timeout: 30000, resetTimeout: 60000 },
      },
      {
        id: 'groq',
        name: 'Groq Llama 3.3',
        type: 'llm',
        priority: 4,
        enabled: true,
        timeout: 8000,
        maxRetries: 2,
        rateLimit: { requestsPerMinute: 30, tokensPerMinute: 50000 },
        circuitBreakerConfig: { failureThreshold: 3, successThreshold: 2, timeout: 30000, resetTimeout: 60000 },
      },
      {
        id: 'openai',
        name: 'GPT-5',
        type: 'llm',
        priority: 5,
        enabled: true,
        timeout: 15000,
        maxRetries: 2,
        rateLimit: { requestsPerMinute: 20, tokensPerMinute: 80000 },
        circuitBreakerConfig: { failureThreshold: 3, successThreshold: 2, timeout: 30000, resetTimeout: 60000 },
      },
      {
        id: 'claude',
        name: 'Claude Opus 4.1',
        type: 'llm',
        priority: 6,
        enabled: true,
        timeout: 15000,
        maxRetries: 2,
        rateLimit: { requestsPerMinute: 20, tokensPerMinute: 80000 },
        circuitBreakerConfig: { failureThreshold: 3, successThreshold: 2, timeout: 30000, resetTimeout: 60000 },
      },
      {
        id: 'ollama',
        name: 'Local Ollama',
        type: 'llm',
        priority: 7,
        enabled: true,
        timeout: 30000,
        maxRetries: 1,
        circuitBreakerConfig: { failureThreshold: 3, successThreshold: 2, timeout: 30000, resetTimeout: 60000 },
      },
    ];

    for (const provider of llmProviders) {
      this.providers.set(provider.id, provider);
    }
  }

  async routeRequest(request: any): Promise<any> {
    const startTime = Date.now();
    const requestId = request.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      if (this.activeRequests >= 3) {
        return this.queueRequest(request, requestId);
      }

      this.activeRequests++;
      const abortController = new AbortController();
      this.abortControllers.set(requestId, abortController);

      try {
        const response = await this.executeRouting(request, requestId, abortController.signal as any);
        return { ...response, requestId, processingTime: Date.now() - startTime };
      } finally {
        this.activeRequests--;
        this.abortControllers.delete(requestId);
        this.processQueue();
      }
    } catch (error) {
      return this.createErrorResponse(requestId, error, Date.now() - startTime);
    }
  }
  private async emergencyFallback(query: string, error?: any): Promise<any> {
  console.warn('[Orchestrator] Engaging emergency fallback for query:', query, error);
  return {
    success: true,
    routing: 'emergency_fallback',
    content: 'Unable to reach online AI providers or local match. Please check your connectivity or settings.',
    confidence: 0.1,
    timestamp: Date.now()
  };
}

  private async executeRouting(request: any, requestId: string, signal: AbortSignal): Promise<any> {
    
    const preferences = request.preferences || {};
    const enableFallback = preferences.enableFallback !== false;
    const confidenceThreshold = preferences.confidenceThreshold || 0.75;

    // Tier 1: Knowledge Base (Instant)
    if (enableFallback) {
      try {
        const kbResponse = await this.withTimeout(
          this.tryKnowledgeBase(request),
          100
        );
        if (kbResponse && kbResponse.confidence >= (request.preferences?.confidenceThreshold || 0.75)) {
          return {
            ...kbResponse,
            routing: 'knowledge_base',
            metadata: { ...kbResponse.metadata, requestId },
          };
        }
      } catch (error) {
        console.warn('[Orchestrator] Knowledge base failed:', error);
      }
    }

    // Tier 2: Web Search
    if (enableFallback) {
      try {
        const webResponse = await this.withTimeout(
          this.tryWebSearch(request),
          2500
        );
        if (webResponse) {
          return {
            ...webResponse,
            routing: 'web_search',
            metadata: { ...webResponse.metadata, requestId },
          };
        }
      } catch (error) {
        console.warn('[Orchestrator] Web search failed:', error);
      }
    }

    // Tier 3: LLM Fallback Chain
    if (enableFallback) {
      try {
        const llmResponse = await this.tryLLMFallbackChain(request, signal);
        return {
          ...llmResponse,
          routing: llmResponse.metadata?.fallback ? 'llm_fallback' : 'llm_primary',
          metadata: { ...llmResponse.metadata, requestId },
        };
      } catch (error) {
        console.error('[Orchestrator] All LLM providers failed:', error);
      }
    }

    // Emergency fallback
    return this.emergencyFallback(request);
  }

  private async tryKnowledgeBase(request: any): Promise<any | null> {
    const provider = this.providers.get('knowledge_base');
    if (!provider || !provider.enabled) return null;

    const breaker = this.getOrCreateBreaker('knowledge_base');

    return breaker.execute(async () => {
      // Use NLP matcher to search knowledge base
      const results = this.searchKnowledgeBase(request.query, request.context);

      if (results.results.length > 0 && results.confidence >= 0.75) {
        const bestMatch = results.results[0];
        return {
          content: bestMatch.answer,
          provider: 'knowledge_base',
          confidence: results.confidence,
          processingTime: 0,
          metadata: {
            question: bestMatch.question,
            category: bestMatch.category,
            source: bestMatch.source,
          },
        };
      }

      throw new Error('No suitable knowledge base match found');
    });
  }

  private searchKnowledgeBase(_query: string, _context?: string): { results: any[]; confidence: number } {
    // This would integrate with the NLPMatcher
    // For now, return empty results - actual implementation uses NLPMatcher
    return { results: [], confidence: 0 };
  }

  private async tryWebSearch(_request: any): Promise<any | null> {
    // Web search implementation
    // In production, integrate with search API (Bing, Google, DuckDuckGo, etc.)
    return null;
  }

  private async tryLLMFallbackChain(request: any, signal: AbortSignal): Promise<any> {
    const llmProviders = this.getLLMProviders();

    for (const provider of llmProviders) {
      if (!provider.enabled) continue;

      // Check circuit breaker
      const breaker = this.getOrCreateBreaker(provider.id, provider.circuitBreakerConfig);

      try {
        const response = await this.withTimeout(
          breaker.execute(() => this.callLLMProvider(provider.id, request, signal)),
          provider.timeout
        );

        const isFallback = provider.priority > 3;

        return {
          content: response.content,
          provider: provider.id,
          confidence: response.confidence || 0.8,
          processingTime: 0,
          fallbackReason: isFallback ? `Fallback from higher priority provider` : undefined,
          metadata: {
            model: response.model,
            tokens: response.tokens,
            fallback: isFallback,
          },
        };
      } catch (error) {
        console.warn(`[Orchestrator] Provider ${provider.id} failed:`, error);
        continue;
      }
    }

    throw new Error('All LLM providers failed');
  }

  private async callLLMProvider(providerId: string, request: any, signal: AbortSignal): Promise<any> {
    // Integration with existing LLMHelper or sidecar
    switch (providerId) {
      case 'gemini':
        return this.callGemini(request, signal);
      case 'groq':
        return this.callGroq(request, signal);
      case 'openai':
        return this.callOpenAI(request, signal);
      case 'claude':
        return this.callClaude(request, signal);
      case 'ollama':
        return this.callOllama(request, signal);
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  private async callGemini(request: any, _signal: AbortSignal): Promise<any> {
    // Integration with existing LLMHelper
    try {
      const { LLMHelper } = require('../LLMHelper');
      const helper = LLMHelper.getInstance();
      const content = await helper.generateSuggestion(request.context || '', request.query);
      return { content, confidence: 0.85, model: 'gemini-3.1-flash-lite-preview' };
    } catch (error) {
      throw new Error(`Gemini failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async callGroq(request: any, _signal: AbortSignal): Promise<any> {
    try {
      const { LLMHelper } = require('../LLMHelper');
      const helper = LLMHelper.getInstance();
      helper.setGroqFastTextMode(true);
      const content = await helper.generateSuggestion(request.context || '', request.query);
      return { content, confidence: 0.82, model: 'llama-3.3-70b-versatile' };
    } catch (error) {
      throw new Error(`Groq failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async callOpenAI(request: any, _signal: AbortSignal): Promise<any> {
    try {
      const { LLMHelper } = require('../LLMHelper');
      const helper = LLMHelper.getInstance();
      const content = await helper.generateSuggestion(request.context || '', request.query);
      return { content, confidence: 0.88, model: 'gpt-5.4' };
    } catch (error) {
      throw new Error(`OpenAI failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async callClaude(request: any, _signal: AbortSignal): Promise<any> {
    try {
      const { LLMHelper } = require('../LLMHelper');
      const helper = LLMHelper.getInstance();
      const content = await helper.generateSuggestion(request.context || '', request.query);
      return { content, confidence: 0.9, model: 'claude-opus-4-1' };
    } catch (error) {
      throw new Error(`Claude failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async callOllama(request: any, _signal: AbortSignal): Promise<any> {
    try {
      const { LLMHelper } = require('../LLMHelper');
      const helper = LLMHelper.getInstance();
      const content = await helper.generateSuggestion(request.context || '', request.query);
      return { content, confidence: 0.75, model: 'qwen2.5:4b' };
    } catch (error) {
      throw new Error(`Ollama failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private getLLMProviders(): Array<ProviderConfig & { circuitBreakerConfig?: any }> {
    const providers: Array<ProviderConfig & { circuitBreakerConfig?: any }> = [];

    for (const [id, provider] of this.providers) {
      if (provider.type === 'llm' && provider.enabled) {
        providers.push(provider);
      }
    }

    return providers.sort((a, b) => a.priority - b.priority);
  }

  private getOrCreateBreaker(name: string, config?: any): CircuitBreaker {
    if (!this.circuitBreakers.has(name)) {
      this.circuitBreakers.set(name, new CircuitBreaker(config || {
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 30000,
        resetTimeout: 60000,
      }));
    }
    return this.circuitBreakers.get(name)!;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  private createErrorResponse(requestId: string, error: any, processingTime: number): any {
    return {
      content: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : String(error)}. Please try again or rephrase your question.`,
      provider: 'error',
      routing: 'emergency',
      confidence: 0,
      processingTime,
      error: error instanceof Error ? error.message : String(error),
      requestId,
    };
  }

  private async queueRequest(request: any, _requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
    });
  }

  private processQueue(): void {
    if (this.requestQueue.length === 0 || this.activeRequests >= 3) return;

    const next = this.requestQueue.shift();
    if (next) {
      this.activeRequests++;
      this.routeRequest(next.request)
        .then(next.resolve)
        .catch(next.reject)
        .finally(() => {
          this.activeRequests--;
          this.processQueue();
        });
    }
  }

  // Public API
  getProviderStatus(): Map<string, any> {
    const status = new Map();
    for (const [id, provider] of this.providers) {
      const breaker = this.circuitBreakers.get(id);
      status.set(id, {
        state: breaker?.getState() || 'UNKNOWN',
        metrics: breaker?.getMetrics() || { totalCalls: 0, successfulCalls: 0, failedCalls: 0 },
        config: provider,
      });
    }
    return status;
  }

  async resetAllCircuits(): Promise<void> {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  enableProvider(id: string): boolean {
    const provider = this.providers.get(id);
    if (provider) {
      provider.enabled = true;
      return true;
    }
    return false;
  }

  disableProvider(id: string): boolean {
    const provider = this.providers.get(id);
    if (provider) {
      provider.enabled = false;
      return true;
    }
    return false;
  }

  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }
}

// Singleton instance
let orchestratorServiceInstance: OrchestratorService | null = null;

export function getOrchestratorService(): OrchestratorService {
  if (!orchestratorServiceInstance) {
    orchestratorServiceInstance = new OrchestratorService(null, null);
  }
  return orchestratorServiceInstance;
}

export function initializeOrchestratorService(nlpMatcher: any, knowledgeBase: any): OrchestratorService {
  orchestratorServiceInstance = new OrchestratorService(nlpMatcher, knowledgeBase);
  return orchestratorServiceInstance;
}

export function shutdownOrchestratorService(): void {
  if (orchestratorServiceInstance) {
    orchestratorServiceInstance.removeAllListeners();
    orchestratorServiceInstance = null;
  }
}