/**
 * Intelligent Router - Tiered Fallback Engine
 * Orchestrates requests across Knowledge Base, Web Search, and LLM Providers
 */

import { CircuitBreaker, circuitBreakerRegistry } from './CircuitBreaker';
import { KnowledgeBase, KnowledgeEntry } from './KnowledgeBase';

export interface AIRequest {
  query: string;
  context?: string;
  mode?: string;
  preferences?: UserPreferences;
  maxResponseTime?: number;
  previousAttempts?: number;
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

export class IntelligentRouter {
  private providers: Map<string, ProviderConfig> = new Map();
  private knowledgeBase: KnowledgeBase;
  private requestQueue: Array<{ request: AIRequest; resolve: (value: AIResponse) => void; reject: (error: Error) => void }> = [];
  private isProcessing = false;
  private maxConcurrentRequests = 3;
  private activeRequests = 0;

  constructor() {
    this.knowledgeBase = new (require('./KnowledgeBase').KnowledgeBase)();
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
      timeout: 100, // 100ms max
      maxRetries: 0,
    });

    // Web Search (Tier 2 - Fast)
    this.providers.set('web_search', {
      id: 'web_search',
      name: 'Web Search',
      type: 'web_search',
      priority: 2,
      enabled: true,
      timeout: 2500, // 2.5 seconds
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

  async routeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Check if request should be queued
      if (this.activeRequests >= this.maxConcurrentRequests) {
        return this.queueRequest(request);
      }

      this.activeRequests++;
      const response = await this.executeRouting(request);
      return response;
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  private async executeRouting(request: AIRequest): Promise<AIResponse> {
    const preferences = request.preferences || {};
    const enableFallback = preferences.enableFallback !== false;

    // Tier 1: Knowledge Base (Instant)
    if (enableFallback) {
      try {
        const kbResponse = await this.tryKnowledgeBase(request);
        if (kbResponse && kbResponse.confidence >= 0.75) {
          return {
            ...kbResponse,
            processingTime: Date.now() - Date.now(), // Will be calculated at end
            routing: 'knowledge_base',
          };
        }
      } catch (error) {
        console.warn('[IntelligentRouter] Knowledge base failed:', error);
      }
    }

    // Tier 2: Web Search
    if (enableFallback) {
      try {
        const webResponse = await this.tryWebSearch(request);
        if (webResponse) {
          return {
            ...webResponse,
            processingTime: Date.now() - Date.now(),
            routing: 'web_search',
          };
        }
      } catch (error) {
        console.warn('[IntelligentRouter] Web search failed:', error);
      }
    }

    // Tier 3: LLM Fallback Chain
    if (enableFallback) {
      try {
        const llmResponse = await this.tryLLMFallbackChain(request);
        return {
          ...llmResponse,
          processingTime: Date.now() - Date.now(),
          routing: llmResponse.metadata?.fallback ? 'llm_fallback' : 'llm_primary',
        };
      } catch (error) {
        console.error('[IntelligentRouter] All LLM providers failed:', error);
      }
    }

    // Emergency fallback
    return this.emergencyFallback(request);
  }

  private async tryKnowledgeBase(request: AIRequest): Promise<AIResponse | null> {
    const provider = this.providers.get('knowledge_base');
    if (!provider || !provider.enabled) return null;

    const breaker = this.getOrCreateBreaker(provider.id, provider.circuitBreakerConfig);

    return breaker.execute(async () => {
      const kbResult = await this.knowledgeBase.search(request.query, request.context);

      if (kbResult.results.length > 0 && kbResult.confidence >= 0.75) {
        // Use the best match
        const bestMatch = kbResult.results[0];
        return {
          content: bestMatch.answer,
          provider: 'knowledge_base',
          routing: 'knowledge_base',
          confidence: kbResult.confidence,
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

  private async tryWebSearch(_request: AIRequest): Promise<AIResponse | null> {
    const provider = this.providers.get('web_search');
    if (!provider || !provider.enabled) return null;

    // Web search implementation would go here
    // For now, return null to fall through to LLM
    return null;
  }

  private async tryLLMFallbackChain(request: AIRequest): Promise<AIResponse> {
    const llmProviders = this.getLLMProviders();

    for (const provider of llmProviders) {
      if (!provider.enabled) continue;

      try {
        const breaker = this.getOrCreateBreaker(provider.id, provider.circuitBreakerConfig);

        const response = await breaker.execute(async () => {
          return await this.callLLMProvider(provider.id, request);
        });

        // Check if this was a fallback
        const isFallback = provider.priority > 3;

        return {
          content: response.content,
          provider: provider.id,
          routing: isFallback ? 'llm_fallback' : 'llm_primary',
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
        console.warn(`[IntelligentRouter] Provider ${provider.id} failed:`, error);
        continue;
      }
    }

    throw new Error('All LLM providers failed');
  }

  private async callLLMProvider(providerId: string, request: AIRequest): Promise<any> {
    // This would integrate with existing LLMHelper or similar
    // For now, return a placeholder response
    switch (providerId) {
      case 'gemini':
        return this.callGemini(request);
      case 'groq':
        return this.callGroq(request);
      case 'openai':
        return this.callOpenAI(request);
      case 'claude':
        return this.callClaude(request);
      case 'ollama':
        return this.callOllama(request);
      default:
        throw new Error(`Unknown provider: ${providerId}`);
    }
  }

  private async callGemini(request: AIRequest): Promise<any> {
    // Integrate with existing LLMHelper
    const { LLMHelper } = require('../../../electron/LLMHelper');
    const helper = LLMHelper.getInstance();
    const content = await helper.generateSuggestion(request.context || '', request.query);
    return { content, confidence: 0.85, model: 'gemini-3.1-flash-lite-preview' };
  }

  private async callGroq(request: AIRequest): Promise<any> {
    const { LLMHelper } = require('../../../electron/LLMHelper');
    const helper = LLMHelper.getInstance();
    helper.setGroqFastTextMode(true);
    const content = await helper.generateSuggestion(request.context || '', request.query);
    return { content, confidence: 0.82, model: 'llama-3.3-70b-versatile' };
  }

  private async callOpenAI(request: AIRequest): Promise<any> {
    const { LLMHelper } = require('../../../electron/LLMHelper');
    const helper = LLMHelper.getInstance();
    const content = await helper.generateSuggestion(request.context || '', request.query);
    return { content, confidence: 0.88, model: 'gpt-5.4' };
  }

  private async callClaude(request: AIRequest): Promise<any> {
    const { LLMHelper } = require('../../../electron/LLMHelper');
    const helper = LLMHelper.getInstance();
    const content = await helper.generateSuggestion(request.context || '', request.query);
    return { content, confidence: 0.9, model: 'claude-opus-4-1' };
  }

  private async callOllama(request: AIRequest): Promise<any> {
    const { LLMHelper } = require('../../../electron/LLMHelper');
    const helper = LLMHelper.getInstance();
    const content = await helper.generateSuggestion(request.context || '', request.query);
    return { content, confidence: 0.75, model: 'qwen2.5:4b' };
  }

  private getLLMProviders(): Array<ProviderConfig & { circuitBreakerConfig?: any }> {
    const providers: Array<ProviderConfig & { circuitBreakerConfig?: any }> = [];

    for (const [id, provider] of this.providers) {
      if (provider.type === 'llm' && provider.enabled) {
        providers.push(provider);
      }
    }

    // Sort by priority
    return providers.sort((a, b) => a.priority - b.priority);
  }

  private getOrCreateBreaker(name: string, config?: any): CircuitBreaker {
    const { circuitBreakerRegistry } = require('./CircuitBreaker');
    return circuitBreakerRegistry.getOrCreate(name, config);
  }

  private async queueRequest(request: AIRequest): Promise<AIResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ request, resolve, reject });
    });
  }

  private processQueue(): void {
    if (this.requestQueue.length === 0 || this.activeRequests >= this.maxConcurrentRequests) {
      return;
    }

    const next = this.requestQueue.shift();
    if (next) {
      this.activeRequests++;
      this.executeRouting(next.request)
        .then(next.resolve)
        .catch(next.reject)
        .finally(() => {
          this.activeRequests--;
          this.processQueue();
        });
    }
  }

  private emergencyFallback(request: AIRequest): AIResponse {
    return {
      content: `I apologize, but all AI services are currently unavailable. Here's what I can tell you based on available knowledge:\n\nBased on your question "${request.query}", I don't have specific information available locally. Please try again in a few moments or check your internet connection.\n\nIf this is urgent, you may want to try rephrasing your question or checking the settings to ensure your API keys are configured correctly.`,
      provider: 'emergency',
      routing: 'emergency',
      confidence: 0.1,
      processingTime: 0,
      error: 'All providers unavailable',
      metadata: { emergency: true },
    };
  }

  // Public API
  getProviderStatus(): Map<string, { state: string; metrics: any }> {
    const { circuitBreakerRegistry } = require('./CircuitBreaker');
    const states = circuitBreakerRegistry.getAllStates();
    const metrics = circuitBreakerRegistry.getAllMetrics();

    const status = new Map();
    for (const [id, provider] of this.providers) {
      status.set(id, {
        state: states.get(id) || 'UNKNOWN',
        metrics: metrics.get(id) || { totalCalls: 0, successfulCalls: 0, failedCalls: 0 },
        config: provider,
      });
    }
    return status;
  }

  async resetAllCircuits(): Promise<void> {
    const { circuitBreakerRegistry } = require('./CircuitBreaker');
    circuitBreakerRegistry.resetAll();
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
let intelligentRouterInstance: any = null;

export function getIntelligentRouter(): any {
  if (!intelligentRouterInstance) {
    intelligentRouterInstance = new IntelligentRouter();
  }
  return intelligentRouterInstance;
}

export function initializeIntelligentRouter(): any {
  intelligentRouterInstance = new IntelligentRouter();
  return intelligentRouterInstance;
}