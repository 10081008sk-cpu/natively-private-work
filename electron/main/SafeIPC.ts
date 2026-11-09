/**
 * Safe IPC Communication Layer
 * Type-safe, validated IPC wrapper for Main-Renderer and Main-Worker communication
 */

import { ipcMain, IpcMainInvokeEvent, WebContents, MessageChannelMain, BrowserWindow } from 'electron';
import { z } from 'zod';

export interface IPCChannelDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  inputSchema?: z.ZodSchema<TInput>;
  outputSchema?: z.ZodSchema<TOutput>;
  description?: string;
  timeout?: number;
}

export interface IPCMessage<T = unknown> {
  id: string;
  channel: string;
  payload: T;
  timestamp: number;
  requestId?: string;
}

export interface IPCResponse<T = unknown> {
  id: string;
  requestId: string;
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: number;
}

export interface IPCError extends Error {
  code: string;
  channel?: string;
  details?: unknown;
}

class IPCValidationError extends Error implements IPCError {
  code = 'IPC_VALIDATION_ERROR';
  channel?: string;
  details?: unknown;

  constructor(message: string, channel?: string, details?: unknown) {
    super(message);
    this.name = 'IPCValidationError';
    this.channel = channel;
    this.details = details;
  }
}

class IPCTimeoutError extends Error implements IPCError {
  code = 'IPC_TIMEOUT';
  channel?: string;

  constructor(channel: string, timeout: number) {
    super(`IPC timeout on channel ${channel} after ${timeout}ms`);
    this.name = 'IPCTimeoutError';
    this.channel = channel;
  }
}

class IPCHandlerNotFoundError extends Error implements IPCError {
  code = 'IPC_HANDLER_NOT_FOUND';
  channel: string;

  constructor(channel: string) {
    super(`No handler registered for channel: ${channel}`);
    this.name = 'IPCHandlerNotFoundError';
    this.channel = channel;
  }
}

export class SafeIPC {
  private channels = new Map<string, IPCChannelDefinition>();
  private handlers = new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>>();
  private messagePorts = new Map<string, MessageChannelMain>();
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  private defaultTimeout = 30000;
  private isShuttingDown = false;

  constructor(defaultTimeout = 30000) {
    this.defaultTimeout = defaultTimeout;
    this.setupGlobalHandlers();
  }

  private setupGlobalHandlers(): void {
    // Handle incoming messages from renderer/workers
    ipcMain.on('ipc:message', (event, message: IPCMessage) => {
      this.handleMessage(event, message);
    });

    // Handle responses from renderer/workers
    ipcMain.on('ipc:response', (event, response: IPCResponse) => {
      this.handleResponse(response);
    });

    // Handle port transfer
    ipcMain.on('ipc:port', (event, { portId, port }) => {
      this.handlePortTransfer(portId, port);
    });
  }

  private async handleMessage(event: IpcMainInvokeEvent, message: IPCMessage): Promise<void> {
    const { id, channel, payload, requestId } = message;

    if (this.isShuttingDown) {
      this.sendResponse(event, {
        id: this.generateId(),
        requestId: id,
        success: false,
        error: { code: 'IPC_SHUTTING_DOWN', message: 'System is shutting down' },
        timestamp: Date.now(),
      });
      return;
    }

    const definition = this.channels.get(channel);
    if (!definition) {
      this.sendResponse(event, {
        id: this.generateId(),
        requestId: id,
        success: false,
        error: { code: 'CHANNEL_NOT_FOUND', message: `Channel not registered: ${channel}` },
        timestamp: Date.now(),
      });
      return;
    }

    // Validate input
    if (definition.inputSchema) {
      const result = definition.inputSchema.safeParse(payload);
      if (!result.success) {
        this.sendResponse(event, {
          id: this.generateId(),
          requestId: id,
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input payload',
            details: result.error.format(),
          },
          timestamp: Date.now(),
        });
        return;
      }
    }

    const handler = this.handlers.get(channel);
    if (!handler) {
      this.sendResponse(event, {
        id: this.generateId(),
        requestId: id,
        success: false,
        error: { code: 'HANDLER_NOT_FOUND', message: `No handler for channel: ${channel}` },
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const result = await handler(event, payload);

      // Validate output
      if (definition.outputSchema) {
        const outputResult = definition.outputSchema.safeParse(result);
        if (!outputResult.success) {
          console.warn(`[SafeIPC] Output validation failed for ${channel}:`, outputResult.error.format());
        }
      }

      this.sendResponse(event, {
        id: this.generateId(),
        requestId: id,
        success: true,
        data: result,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendResponse(event, {
        id: this.generateId(),
        requestId: id,
        success: false,
        error: {
          code: error instanceof Error ? (error as any).code || 'HANDLER_ERROR' : 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          details: error instanceof Error ? error.stack : undefined,
        },
        timestamp: Date.now(),
      });
    }
  }

  private handleResponse(response: IPCResponse): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.requestId);

    if (response.success) {
      pending.resolve(response.data);
    } else {
      const error = new Error(response.error?.message || 'Unknown IPC error') as IPCError;
      error.code = response.error?.code || 'IPC_ERROR';
      error.details = response.error?.details;
      pending.reject(error);
    }
  }

  private handlePortTransfer(portId: string, port: MessagePort): void {
    this.messagePorts.set(portId, { port1: port, port2: null as any } as any);
    console.log(`[SafeIPC] Received MessagePort: ${portId}`);
  }

  private sendResponse(event: IpcMainInvokeEvent, response: IPCResponse): void {
    event.sender.send('ipc:response', response);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API

  registerChannel<TInput = unknown, TOutput = unknown>(
    definition: IPCChannelDefinition<TInput, TOutput>
  ): void {
    if (this.channels.has(definition.name)) {
      console.warn(`[SafeIPC] Channel already registered: ${definition.name}`);
    }
    this.channels.set(definition.name, definition);
    console.log(`[SafeIPC] Registered channel: ${definition.name}`);
  }

  registerHandler<TInput = unknown, TOutput = unknown>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, payload: TInput) => Promise<TOutput>
  ): void {
    if (this.handlers.has(channel)) {
      console.warn(`[SafeIPC] Handler already registered for: ${channel}`);
    }
    this.handlers.set(channel, handler as any);
    console.log(`[SafeIPC] Registered handler for: ${channel}`);
  }

  unregisterChannel(channel: string): void {
    this.channels.delete(channel);
    this.handlers.delete(channel);
    console.log(`[SafeIPC] Unregistered channel: ${channel}`);
  }

  async invoke<TInput = unknown, TOutput = unknown>(
    webContents: WebContents,
    channel: string,
    payload: TInput,
    timeout?: number
  ): Promise<TOutput> {
    const definition = this.channels.get(channel);
    if (!definition) {
      throw new IPCHandlerNotFoundError(channel);
    }

    // Validate input
    if (definition.inputSchema) {
      const result = definition.inputSchema.safeParse(payload);
      if (!result.success) {
        throw new IPCValidationError('Invalid input payload', channel, result.error.format());
      }
    }

    const requestId = this.generateId();
    const message: IPCMessage = {
      id: requestId,
      channel,
      payload,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeoutMs = timeout || definition.timeout || this.defaultTimeout;
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new IPCTimeoutError(channel, timeoutMs));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle });

      webContents.send('ipc:message', message);
    });
  }

  async send<TInput = unknown>(
    webContents: WebContents,
    channel: string,
    payload: TInput
  ): Promise<void> {
    const definition = this.channels.get(channel);
    if (!definition) {
      throw new IPCHandlerNotFoundError(channel);
    }

    if (definition.inputSchema) {
      const result = definition.inputSchema.safeParse(payload);
      if (!result.success) {
        throw new IPCValidationError('Invalid input payload', channel, result.error.format());
      }
    }

    const message: IPCMessage = {
      id: this.generateId(),
      channel,
      payload,
      timestamp: Date.now(),
    };

    webContents.send('ipc:message', message);
  }

  broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        this.send(window.webContents, channel, payload).catch(console.error);
      }
    }
  }

  // MessagePort management
  createMessageChannel(portId: string): MessageChannelMain {
    const { port1, port2 } = new MessageChannelMain();
    this.messagePorts.set(portId, { port1, port2 });
    return { port1, port2 };
  }

  getPort(portId: string): MessagePort | undefined {
    const channel = this.messagePorts.get(portId);
    return channel?.port1;
  }

  transferPortToWindow(portId: string, window: BrowserWindow): void {
    const channel = this.messagePorts.get(portId);
    if (!channel) {
      throw new Error(`MessagePort not found: ${portId}`);
    }

    window.webContents.postMessage('ipc:port', {
      portId,
      port: channel.port1,
    }, [channel.port1]);

    // Keep port2 for main process communication
    this.messagePorts.set(portId, { port1: channel.port2, port2: null as any } as any);
  }

  // Cleanup
  shutdown(): void {
    this.isShuttingDown = true;

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('IPC system shutting down'));
    }
    this.pendingRequests.clear();

    // Close all message ports
    for (const [, channel] of this.messagePorts) {
      if (channel.port1 && !channel.port1.closed) {
        channel.port1.close();
      }
      if (channel.port2 && !channel.port2.closed) {
        channel.port2.close();
      }
    }
    this.messagePorts.clear();

    // Remove all handlers
    ipcMain.removeAllListeners('ipc:message');
    ipcMain.removeAllListeners('ipc:response');
    ipcMain.removeAllListeners('ipc:port');

    console.log('[SafeIPC] Shutdown complete');
  }

  getRegisteredChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  getChannelDefinition(channel: string): IPCChannelDefinition | undefined {
    return this.channels.get(channel);
  }
}

// Predefined channel definitions for common operations
export const IPCChannels = {
  // Knowledge Base
  KNOWLEDGE_BASE_SEARCH: {
    name: 'knowledge-base:search',
    inputSchema: z.object({
      query: z.string().min(1),
      context: z.string().optional(),
      threshold: z.number().min(0).max(1).optional(),
    }),
    outputSchema: z.object({
      results: z.array(z.object({
        id: z.string(),
        question: z.string(),
        answer: z.string(),
        category: z.string(),
        confidence: z.number(),
        source: z.string(),
      })),
      confidence: z.number(),
      source: z.enum(['knowledge_base', 'cache']),
    }),
    description: 'Search local knowledge base for Q&A matches',
    timeout: 5000,
  } as IPCChannelDefinition,

  KNOWLEDGE_BASE_ADD: {
    name: 'knowledge-base:add',
    inputSchema: z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      category: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1).optional(),
    }),
    outputSchema: z.object({
      id: z.string(),
    }),
    description: 'Add entry to knowledge base',
    timeout: 5000,
  } as IPCChannelDefinition,

  KNOWLEDGE_BASE_IMPORT: {
    name: 'knowledge-base:import',
    inputSchema: z.object({
      filePath: z.string().min(1),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      imported: z.number(),
      errors: z.array(z.string()),
    }),
    description: 'Import knowledge base from file',
    timeout: 30000,
  } as IPCChannelDefinition,

  // Intelligent Router
  ROUTER_ROUTE: {
    name: 'router:route',
    inputSchema: z.object({
      query: z.string().min(1),
      context: z.string().optional(),
      mode: z.string().optional(),
      preferences: z.object({
        preferredProvider: z.string().optional(),
        responseLanguage: z.string().optional(),
        verboseMode: z.boolean().optional(),
        enableFallback: z.boolean().optional(),
      }).optional(),
      maxResponseTime: z.number().optional(),
    }),
    outputSchema: z.object({
      content: z.string(),
      provider: z.string(),
      routing: z.enum(['knowledge_base', 'web_search', 'llm_primary', 'llm_fallback', 'emergency']),
      confidence: z.number(),
      processingTime: z.number(),
      error: z.string().optional(),
      fallbackReason: z.string().optional(),
    }),
    description: 'Route AI request through tiered fallback pipeline',
    timeout: 60000,
  } as IPCChannelDefinition,

  ROUTER_STATUS: {
    name: 'router:status',
    inputSchema: z.object({}),
    outputSchema: z.record(z.object({
      state: z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']),
      metrics: z.object({
        totalCalls: z.number(),
        successfulCalls: z.number(),
        failedCalls: z.number(),
      }),
    })),
    description: 'Get circuit breaker status for all providers',
    timeout: 5000,
  } as IPCChannelDefinition,

  // Speech Provider Validation
  SPEECH_VALIDATE: {
    name: 'speech:validate',
    inputSchema: z.object({
      providerId: z.string().min(1),
    }),
    outputSchema: z.object({
      valid: z.boolean(),
      errors: z.array(z.string()),
      warnings: z.array(z.string()),
      checks: z.array(z.object({
        name: z.string(),
        passed: z.boolean(),
        message: z.string(),
        severity: z.enum(['error', 'warning', 'info']),
      })),
    }),
    description: 'Validate speech provider configuration and dependencies',
    timeout: 10000,
  } as IPCChannelDefinition,

  SPEECH_HEALTH: {
    name: 'speech:health',
    inputSchema: z.object({
      providerId: z.string().min(1),
    }),
    outputSchema: z.object({
      healthy: z.boolean(),
      providerId: z.string(),
      checks: z.array(z.object({
        name: z.string(),
        passed: z.boolean(),
        message: z.string(),
        latency: z.number().optional(),
      })),
      timestamp: z.number(),
      responseTime: z.number().optional(),
    }),
    description: 'Check speech provider health status',
    timeout: 10000,
  } as IPCChannelDefinition,

  // Circuit Breaker
  CIRCUIT_BREAKER_STATUS: {
    name: 'circuit-breaker:status',
    inputSchema: z.object({}),
    outputSchema: z.object({
      states: z.record(z.enum(['CLOSED', 'OPEN', 'HALF_OPEN'])),
      metrics: z.record(z.object({
        totalCalls: z.number(),
        successfulCalls: z.number(),
        failedCalls: z.number(),
        currentState: z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']),
        lastFailureTime: z.number(),
        lastSuccessTime: z.number(),
      })),
    }),
    description: 'Get circuit breaker states and metrics',
    timeout: 5000,
  } as IPCChannelDefinition,

  CIRCUIT_BREAKER_RESET: {
    name: 'circuit-breaker:reset',
    inputSchema: z.object({
      providerId: z.string().optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    description: 'Reset circuit breaker for provider or all providers',
    timeout: 5000,
  } as IPCChannelDefinition,

  // Error Handling
  ERROR_REPORT: {
    name: 'error:report',
    inputSchema: z.object({
      error: z.union([z.string(), z.object({ message: z.string(), stack: z.string().optional() })]),
      context: z.record(z.unknown()).optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    description: 'Report error from renderer to main process',
    timeout: 5000,
  } as IPCChannelDefinition,

  // Window Management
  WINDOW_CREATE: {
    name: 'window:create',
    inputSchema: z.object({
      id: z.string().min(1),
      url: z.string().min(1),
      options: z.record(z.unknown()).optional(),
      backgroundColor: z.string().optional(),
      showOnReady: z.boolean().optional(),
      retryAttempts: z.number().optional(),
      retryDelay: z.number().optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      windowId: z.string(),
    }),
    description: 'Create new BrowserWindow',
    timeout: 10000,
  } as IPCChannelDefinition,

  WINDOW_SHOW: {
    name: 'window:show',
    inputSchema: z.object({
      id: z.string().min(1),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    description: 'Show window',
    timeout: 5000,
  } as IPCChannelDefinition,

  WINDOW_HIDE: {
    name: 'window:hide',
    inputSchema: z.object({
      id: z.string().min(1),
    }),
    outputSchema: z.object({
      success: z.boolean(),
    }),
    description: 'Hide window',
    timeout: 5000,
  } as IPCChannelDefinition,

  // Settings
  SETTINGS_KNOWLEDGE_BASE: {
    name: 'settings:knowledge-base',
    inputSchema: z.object({}),
    outputSchema: z.object({
      files: z.array(z.object({
        id: z.string(),
        name: z.string(),
        entriesCount: z.number(),
        status: z.enum(['indexing', 'ready', 'error']),
      })),
    }),
    description: 'Get knowledge base settings and files',
    timeout: 5000,
  } as IPCChannelDefinition,
};

// Singleton instance
let safeIPCInstance: SafeIPC | null = null;

export function getSafeIPC(): SafeIPC {
  if (!safeIPCInstance) {
    safeIPCInstance = new SafeIPC();
  }
  return safeIPCInstance;
}

export function initializeSafeIPC(defaultTimeout?: number): SafeIPC {
  safeIPCInstance = new SafeIPC(defaultTimeout);
  return safeIPCInstance;
}

export function shutdownSafeIPC(): void {
  if (safeIPCInstance) {
    safeIPCInstance.shutdown();
    safeIPCInstance = null;
  }
}