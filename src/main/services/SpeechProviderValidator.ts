/**
 * Speech Provider Validator
 * Health checking, dependency validation, and provider compatibility verification
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SpeechProviderConfig {
  systemCommands?: boolean | string[] | Record<string, any>;
  id: string;
  name: string;
  type: 'sherpa' | 'gemini' | 'groq' | 'openai' | 'claude' | 'ollama' | 'local';
  model: string;
  apiKey?: string;
  modelPath?: string;
  memoryUsage?: number;
  dependencies?: string[];
  supportsMultimodal?: boolean;
  maxComplexity?: number;
  rateLimit?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: ValidationCheck[];
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface HealthCheckResult {
  healthy: boolean;
  providerId: string;
  checks: HealthCheck[];
  timestamp: number;
  responseTime?: number;
}

export interface HealthCheck {
  name: string;
  passed: boolean;
  message: string;
  latency?: number;
}

export class SpeechProviderValidator {
  private providers: SpeechProviderConfig[] = [];
  private healthCache = new Map<string, HealthCheckResult>();
  private readonly HEALTH_CACHE_TTL = 30000; // 30 seconds

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    this.providers = [
      {
        id: 'sherpa',
        name: 'Sherpa-ONNX',
        type: 'sherpa',
        model: 'sherpa-multilingual-auto',
        modelPath: 'resources/models/sherpa-multilingual-auto',
        memoryUsage: 512,
        dependencies: ['sherpa-onnx-node', 'better-sqlite3', 'keytar', 'sqlite-vec'],
        systemCommands: ['arecord', 'ffmpeg'],
      },
      {
        id: 'gemini',
        name: 'Gemini 3.1 Flash',
        type: 'gemini',
        model: 'gemini-3.1-flash-lite-preview',
        memoryUsage: 256,
        dependencies: ['@google/genai'],
        supportsMultimodal: true,
      },
      {
        id: 'groq',
        name: 'Groq Llama 3.3',
        type: 'groq',
        model: 'llama-3.3-70b-versatile',
        memoryUsage: 128,
        dependencies: ['groq-sdk'],
      },
      {
        id: 'openai',
        name: 'GPT-5',
        type: 'openai',
        model: 'gpt-5.4',
        memoryUsage: 384,
        dependencies: ['openai'],
        supportsMultimodal: true,
      },
      {
        id: 'claude',
        name: 'Claude Opus 4.1',
        type: 'claude',
        model: 'claude-opus-4-1',
        memoryUsage: 768,
        dependencies: ['@anthropic-ai/sdk'],
        supportsMultimodal: true,
      },
      {
        id: 'ollama',
        name: 'Local Ollama',
        type: 'ollama',
        model: 'qwen2.5:4b',
        memoryUsage: 2048,
        dependencies: [],
        systemCommands: ['ollama'],
      },
    ];
  }

  public async validateProvider(providerId: string): Promise<ValidationResult> {
    const provider = this.providers.find(p => p.id === providerId);

    if (!provider) {
      return {
        valid: false,
        errors: ['Provider not found'],
        warnings: [],
        checks: [],
      };
    }

    const checks: ValidationCheck[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Model file validation (for local providers)
    if (provider.type === 'sherpa') {
      const modelCheck = await this.validateModelFiles(provider);
      checks.push(modelCheck);
      if (!modelCheck.passed) errors.push(modelCheck.message);
    }

    // 2. API key validation (for cloud providers)
    if (['gemini', 'groq', 'openai', 'claude'].includes(provider.type)) {
      const apiKeyCheck = this.validateApiKey(provider);
      checks.push(apiKeyCheck);
      if (!apiKeyCheck.passed) {
        if (apiKeyCheck.severity === 'error') errors.push(apiKeyCheck.message);
        else warnings.push(apiKeyCheck.message);
      }
    }

    // 3. Dependency validation
    const depCheck = this.validateDependencies(provider);
    checks.push(depCheck);
    if (!depCheck.passed) {
      if (depCheck.severity === 'error') errors.push(depCheck.message);
      else warnings.push(depCheck.message);
    }

    // 4. System command validation
    if (Array.isArray(provider.systemCommands) && provider.systemCommands.length > 0) {
      const cmdCheck = await this.validateSystemCommands(provider);
      checks.push(cmdCheck);
      if (!cmdCheck.passed) {
        if (cmdCheck.severity === 'error') errors.push(cmdCheck.message);
        else warnings.push(cmdCheck.message);
      }
    }

    // 5. Ollama-specific validation
    if (provider.type === 'ollama') {
      const ollamaCheck = await this.validateOllama(provider);
      checks.push(ollamaCheck);
      if (!ollamaCheck.passed) {
        if (ollamaCheck.severity === 'error') errors.push(ollamaCheck.message);
        else warnings.push(ollamaCheck.message);
      }
    }

    // 6. Model compatibility check
    const compatCheck = this.checkModelCompatibility(provider);
    checks.push(compatCheck);
    if (!compatCheck.passed) warnings.push(compatCheck.message);

    // 7. Memory requirement check
    const memoryCheck = this.checkMemoryRequirements(provider);
    checks.push(memoryCheck);
    if (!memoryCheck.passed) warnings.push(memoryCheck.message);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      checks,
    };
  }

  private async validateModelFiles(provider: SpeechProviderConfig): Promise<ValidationCheck> {
    try {
      if (!provider.modelPath) {
        return {
          name: 'model_files',
          passed: false,
          message: 'Model path not configured for Sherpa provider',
          severity: 'error',
        };
      }

      const requiredFiles = [
        'silero_vad.onnx',
        'base-encoder.int8.onnx',
        'base-decoder.int8.onnx',
        'base-tokens.txt',
      ];

      const missingFiles: string[] = [];

      for (const file of requiredFiles) {
        const filePath = path.join(provider.modelPath!, file);
        if (!fs.existsSync(filePath)) {
          missingFiles.push(file);
        }
      }

      if (missingFiles.length > 0) {
        return {
          name: 'model_files',
          passed: false,
          message: `Missing required model files: ${missingFiles.join(', ')}`,
          severity: 'error',
        };
      }

      // Check file sizes (basic sanity check)
      for (const file of requiredFiles) {
        const filePath = path.join(provider.modelPath!, file);
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
          return {
            name: 'model_files',
            passed: false,
            message: `Model file is empty: ${file}`,
            severity: 'error',
          };
        }
      }

      return {
        name: 'model_files',
        passed: true,
        message: 'All required model files present and valid',
        severity: 'info',
      };
    } catch (error) {
      return {
        name: 'model_files',
        passed: false,
        message: `Model validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      };
    }
  }

  private validateApiKey(provider: SpeechProviderConfig): ValidationCheck {
    if (!provider.apiKey || provider.apiKey.trim().length === 0) {
      return {
        name: 'api_key',
        passed: false,
        message: `API key required for ${provider.name} but not configured`,
        severity: 'error',
      };
    }

    // Basic format validation
    const key = provider.apiKey.trim();

    if (key.length < 10) {
      return {
        name: 'api_key',
        passed: false,
        message: `API key appears to be invalid (too short)`,
        severity: 'error',
      };
    }

    // Provider-specific format checks
    if (provider.type === 'gemini' && !key.startsWith('AIza')) {
      return {
        name: 'api_key',
        passed: false,
        message: 'Gemini API key should start with "AIza"',
        severity: 'warning',
      };
    }

    if (provider.type === 'openai' && !key.startsWith('sk-')) {
      return {
        name: 'api_key',
        passed: false,
        message: 'OpenAI API key should start with "sk-"',
        severity: 'warning',
      };
    }

    if (provider.type === 'claude' && !key.startsWith('sk-ant-')) {
      return {
        name: 'api_key',
        passed: false,
        message: 'Claude API key should start with "sk-ant-"',
        severity: 'warning',
      };
    }

    return {
      name: 'api_key',
      passed: true,
      message: 'API key format appears valid',
      severity: 'info',
    };
  }

  private validateDependencies(provider: SpeechProviderConfig): ValidationCheck {
    if (!provider.dependencies || provider.dependencies.length === 0) {
      return {
        name: 'dependencies',
        passed: true,
        message: 'No Node.js dependencies required',
        severity: 'info',
      };
    }

    const missingDeps: string[] = [];

    for (const dep of provider.dependencies) {
      if (!this.checkNodeModule(dep)) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      return {
        name: 'dependencies',
        passed: false,
        message: `Missing required Node.js modules: ${missingDeps.join(', ')}`,
        severity: 'error',
      };
    }

    return {
      name: 'dependencies',
      passed: true,
      message: 'All required Node.js dependencies available',
      severity: 'info',
    };
  }

  private checkNodeModule(moduleName: string): boolean {
    try {
      require.resolve(moduleName);
      return true;
    } catch {
      return false;
    }
  }

  private async validateSystemCommands(provider: SpeechProviderConfig): Promise<ValidationCheck> {
    // systemCommands is a union type, so narrow it before using array operations.
    if (!Array.isArray(provider.systemCommands) || provider.systemCommands.length === 0) {
      return {
        name: 'system_commands',
        passed: true,
        message: 'No system commands required',
        severity: 'info',
      };
    }

    const missingCommands: string[] = [];

    for (const cmd of provider.systemCommands) {
      try {
        await execAsync(`${cmd} --version`, { timeout: 5000 });
      } catch {
        missingCommands.push(cmd);
      }
    }

    if (missingCommands.length > 0) {
      return {
        name: 'system_commands',
        passed: false,
        message: `Missing required system commands: ${missingCommands.join(', ')}`,
        severity: 'error',
      };
    }

    return {
      name: 'system_commands',
      passed: true,
      message: 'All required system commands available',
      severity: 'info',
    };
  }

  private async validateOllama(provider: SpeechProviderConfig): Promise<ValidationCheck> {
    try {
      // Check if Ollama is installed
      await execAsync('ollama --version', { timeout: 5000 });

      // Check if model is available
      try {
        const { stdout } = await execAsync(`ollama list`, { timeout: 10000 });
        if (!stdout.includes(provider.model)) {
          return {
            name: 'ollama_model',
            passed: false,
            message: `Ollama model "${provider.model}" not found. Run: ollama pull ${provider.model}`,
            severity: 'error',
          };
        }
      } catch {
        return {
          name: 'ollama_model',
          passed: false,
          message: `Failed to check Ollama models. Is Ollama running?`,
          severity: 'error',
        };
      }

      // Test model loading
      try {
        await execAsync(`ollama run ${provider.model} "test"`, { timeout: 30000 });
      } catch {
        return {
          name: 'ollama_model_load',
          passed: false,
          message: `Failed to load Ollama model "${provider.model}". Model may be corrupted or require more memory.`,
          severity: 'warning',
        };
      }

      return {
        name: 'ollama',
        passed: true,
        message: 'Ollama is installed and model is available',
        severity: 'info',
      };
    } catch (error) {
      return {
        name: 'ollama',
        passed: false,
        message: `Ollama not installed or not in PATH. Install from https://ollama.ai`,
        severity: 'error',
      };
    }
  }

  private checkModelCompatibility(provider: SpeechProviderConfig): ValidationCheck {
    const compatibilityIssues: string[] = [];

    // Check for known compatibility issues
    if (provider.type === 'sherpa' && provider.model?.includes('multilingual')) {
      // Sherpa multilingual models have specific requirements
      if (!provider.modelPath) {
        compatibilityIssues.push('Multilingual Sherpa model requires explicit model path');
      }
    }

    if (provider.type === 'ollama') {
      const largeModels = ['llama2:70b', 'llama2:13b', 'codellama:34b'];
      if (largeModels.some(m => provider.model?.includes(m))) {
        compatibilityIssues.push('Large Ollama models may require 16GB+ RAM');
      }
    }

    if (compatibilityIssues.length > 0) {
      return {
        name: 'model_compatibility',
        passed: true, // Not blocking, just warnings
        message: `Compatibility notes: ${compatibilityIssues.join('; ')}`,
        severity: 'warning',
      };
    }

    return {
      name: 'model_compatibility',
      passed: true,
      message: 'No known compatibility issues',
      severity: 'info',
    };
  }

  private checkMemoryRequirements(provider: SpeechProviderConfig): ValidationCheck {
    if (!provider.memoryUsage) {
      return {
        name: 'memory_requirements',
        passed: true,
        message: 'Memory requirements not specified',
        severity: 'info',
      };
    }

    // Check available system memory
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const requiredMem = provider.memoryUsage * 1024 * 1024; // Convert MB to bytes

    if (freeMem < requiredMem) {
      return {
        name: 'memory_requirements',
        passed: true, // Not blocking
        message: `Low memory warning: ${provider.name} requires ~${provider.memoryUsage}MB, ${Math.round(freeMem / 1024 / 1024)}MB available`,
        severity: 'warning',
      };
    }

    return {
      name: 'memory_requirements',
      passed: true,
      message: `Sufficient memory available (${Math.round(freeMem / 1024 / 1024)}MB free)`,
      severity: 'info',
    };
  }

  public async checkProviderHealth(providerId: string): Promise<HealthCheckResult> {
    // Check cache first
    const cached = this.healthCache.get(providerId);
    if (cached && Date.now() - cached.timestamp < this.HEALTH_CACHE_TTL) {
      return cached;
    }

    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) {
      return {
        healthy: false,
        providerId,
        checks: [{
          name: 'provider_exists',
          passed: false,
          message: 'Provider not found',
        }],
        timestamp: Date.now(),
      };
    }

    const checks: HealthCheck[] = [];

    // 1. Basic connectivity
    const connectivityCheck = await this.checkConnectivity(provider);
    checks.push(connectivityCheck);

    // 2. Response time
    const latencyCheck = await this.checkLatency(provider);
    checks.push(latencyCheck);

    // 3. Error rate (from circuit breaker)
    const errorRateCheck = this.checkErrorRate(provider.id);
    checks.push(errorRateCheck);

    // 4. Resource usage
    const resourceCheck = await this.checkResourceUsage(provider);
    checks.push(resourceCheck);

    const healthy = checks.every(c => c.passed);
    const responseTime = checks.find(c => c.name === 'latency')?.latency;

    const result: HealthCheckResult = {
      healthy,
      providerId,
      checks,
      timestamp: Date.now(),
      responseTime,
    };

    this.healthCache.set(providerId, result);
    return result;
  }

  private async checkConnectivity(provider: SpeechProviderConfig): Promise<HealthCheck> {
    const start = Date.now();

    try {
      switch (provider.type) {
        case 'gemini':
        case 'groq':
        case 'openai':
        case 'claude':
          // For cloud providers, check if API key is configured
          if (!provider.apiKey) {
            return {
              name: 'connectivity',
              passed: false,
              message: 'API key not configured',
              latency: Date.now() - start,
            };
          }
          return {
            name: 'connectivity',
            passed: true,
            message: 'API key configured',
            latency: Date.now() - start,
          };

        case 'ollama':
          try {
            await execAsync('ollama --version', { timeout: 5000 });
            return {
              name: 'connectivity',
              passed: true,
              message: 'Ollama is running',
              latency: Date.now() - start,
            };
          } catch {
            return {
              name: 'connectivity',
              passed: false,
              message: 'Ollama not accessible',
              latency: Date.now() - start,
            };
          }

        case 'sherpa':
          // Check model files
          if (provider.modelPath && fs.existsSync(provider.modelPath)) {
            return {
              name: 'connectivity',
              passed: true,
              message: 'Model files accessible',
              latency: Date.now() - start,
            };
          }
          return {
            name: 'connectivity',
            passed: false,
            message: 'Model files not accessible',
            latency: Date.now() - start,
          };

        default:
          return {
            name: 'connectivity',
            passed: true,
            message: 'Provider type not requiring connectivity check',
            latency: Date.now() - start,
          };
      }
    } catch (error) {
      return {
        name: 'connectivity',
        passed: false,
        message: `Connectivity check failed: ${error instanceof Error ? error.message : String(error)}`,
        latency: Date.now() - start,
      };
    }
  }

  private async checkLatency(_provider: SpeechProviderConfig): Promise<HealthCheck> {
    // For now, return a placeholder - in production, this would do actual latency testing
    return {
      name: 'latency',
      passed: true,
      message: 'Latency check not implemented',
      latency: 0,
    };
  }

  private checkErrorRate(providerId: string): HealthCheck {
    const { circuitBreakerRegistry } = require('./CircuitBreaker');
    const breaker = circuitBreakerRegistry.get(providerId);

    if (!breaker) {
      return {
        name: 'error_rate',
        passed: true,
        message: 'No circuit breaker data available',
      };
    }

    const metrics = breaker.getMetrics();
    const totalCalls = metrics.totalCalls;
    const failedCalls = metrics.failedCalls;

    if (totalCalls < 10) {
      return {
        name: 'error_rate',
        passed: true,
        message: 'Insufficient data for error rate calculation',
      };
    }

    const errorRate = failedCalls / totalCalls;

    if (errorRate > 0.5) {
      return {
        name: 'error_rate',
        passed: false,
        message: `High error rate: ${(errorRate * 100).toFixed(1)}%`,
      };
    } else if (errorRate > 0.2) {
      return {
        name: 'error_rate',
        passed: true,
        message: `Elevated error rate: ${(errorRate * 100).toFixed(1)}%`,
      };
    }

    return {
      name: 'error_rate',
      passed: true,
      message: `Low error rate: ${(errorRate * 100).toFixed(1)}%`,
    };
  }

  private async checkResourceUsage(provider: SpeechProviderConfig): Promise<HealthCheck> {
    if (!provider.memoryUsage) {
      return {
        name: 'resource_usage',
        passed: true,
        message: 'Memory usage not specified',
      };
    }

    const os = require('os');
    const freeMem = os.freemem();
    const requiredMem = provider.memoryUsage * 1024 * 1024;

    if (freeMem < requiredMem) {
      return {
        name: 'resource_usage',
        passed: false,
        message: `Insufficient memory: ${Math.round(freeMem / 1024 / 1024)}MB free, ${provider.memoryUsage}MB required`,
      };
    }

    return {
      name: 'resource_usage',
      passed: true,
      message: `Memory OK: ${Math.round(freeMem / 1024 / 1024)}MB free`,
    };
  }

  public getAllProviders(): SpeechProviderConfig[] {
    return [...this.providers];
  }

  public getProvider(providerId: string): SpeechProviderConfig | undefined {
    return this.providers.find(p => p.id === providerId);
  }

  public async validateAllProviders(): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const provider of this.providers) {
      results.set(provider.id, await this.validateProvider(provider.id));
    }

    return results;
  }

  public clearHealthCache(): void {
    this.healthCache.clear();
  }
}

// Singleton instance
let speechProviderValidatorInstance: SpeechProviderValidator | null = null;

export function getSpeechProviderValidator(): SpeechProviderValidator {
  if (!speechProviderValidatorInstance) {
    speechProviderValidatorInstance = new SpeechProviderValidator();
  }
  return speechProviderValidatorInstance;
}

export function initializeSpeechProviderValidator(): SpeechProviderValidator {
  speechProviderValidatorInstance = new SpeechProviderValidator();
  return speechProviderValidatorInstance;
}