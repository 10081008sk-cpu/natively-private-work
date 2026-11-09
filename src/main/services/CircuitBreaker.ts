/**
 * Circuit Breaker Pattern Implementation
 * Enterprise-grade fault tolerance for service calls
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface CircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  currentState: CircuitState;
  lastFailureTime: number;
  lastSuccessTime: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  resetTimeout: 60000, // 1 minute
};

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN - service unavailable`);
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
    console.log(`🔄 Circuit breaker ${this.name} transitioned to HALF_OPEN`);
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
    console.log(`✅ Circuit breaker ${this.name} transitioned to CLOSED`);
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.transitionToOpen();
    } else if (this.state === 'CLOSED' && this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  private transitionToOpen(): void {
    this.state = 'OPEN';
    console.log(`🔌 Circuit breaker ${this.name} OPEN after ${this.failures} failures`);
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
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

  isHealthy(): boolean {
    return this.state === 'CLOSED';
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getOrCreate(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getAllMetrics(): Map<string, CircuitBreakerMetrics> {
    const metrics = new Map<string, CircuitBreakerMetrics>();
    for (const [name, breaker] of this.breakers) {
      metrics.set(name, breaker.getMetrics());
    }
    return metrics;
  }

  getAllStates(): Map<string, CircuitState> {
    const states = new Map<string, CircuitState>();
    for (const [name, breaker] of this.breakers) {
      states.set(name, breaker.getState());
    }
    return states;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();