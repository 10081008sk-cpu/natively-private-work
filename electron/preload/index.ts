/**
 * Preload Script
 * Secure context bridge for Renderer <-> Main IPC communication
 * Receives MessagePort for high-throughput transcript streaming
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Type definitions for exposed API
interface ElectronAPI {
  // Knowledge Base
  knowledgeBase: {
    search: (query: string, context?: string, threshold?: number) => Promise<{
      results: Array<{ id: string; question: string; answer: string; category: string; confidence: number; source: string }>;
      confidence: number;
      source: 'knowledge_base' | 'cache';
    }>;
    add: (entry: { question: string; answer: string; category?: string; keywords?: string[]; confidence?: number }) => Promise<string>;
    import: (filePath: string) => Promise<{ success: boolean; imported: number; errors: string[] }>;
    getFiles: () => Promise<Array<{ id: string; name: string; entriesCount: number; status: 'indexing' | 'ready' | 'error' }>>;
    clear: () => Promise<void>;
  };

  // Intelligent Router
  router: {
    route: (request: {
      query: string;
      context?: string;
      mode?: string;
      preferences?: {
        preferredProvider?: string;
        responseLanguage?: string;
        verboseMode?: boolean;
        enableFallback?: boolean;
        confidenceThreshold?: number;
      };
      maxResponseTime?: number;
    }) => Promise<{
      content: string;
      provider: string;
      routing: 'knowledge_base' | 'web_search' | 'llm_primary' | 'llm_fallback' | 'emergency';
      confidence: number;
      processingTime: number;
      error?: string;
      fallbackReason?: string;
      metadata?: Record<string, any>;
    }>;
    getStatus: () => Promise<Record<string, { state: string; metrics: any }>>;
    resetCircuits: () => Promise<void>;
    enableProvider: (id: string) => Promise<boolean>;
    disableProvider: (id: string) => Promise<boolean>;
    getProviders: () => Promise<any[]>;
  };

  // Speech Provider
  speech: {
    validate: (providerId: string) => Promise<{
      valid: boolean;
      errors: string[];
      warnings: string[];
      checks: Array<{ name: string; passed: boolean; message: string; severity: 'error' | 'warning' | 'info' }>;
    }>;
    health: (providerId: string) => Promise<{
      healthy: boolean;
      providerId: string;
      checks: Array<{ name: string; passed: boolean; message: string; latency?: number }>;
      timestamp: number;
      responseTime?: number;
    }>;
    validateAll: () => Promise<Record<string, { valid: boolean; errors: string[]; warnings: string[]; checks: any[] }>>;
  };

  // Circuit Breaker
  circuitBreaker: {
    getStatus: () => Promise<{
      states: Record<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'>;
      metrics: Record<string, { totalCalls: number; successfulCalls: number; failedCalls: number }>;
    }>;
    reset: (providerId?: string) => Promise<void>;
  };

  // Error Handling
  error: {
    report: (error: Error | string, context?: Record<string, any>) => Promise<void>;
  };

  // Window Management
  window: {
    create: (id: string, url: string, options?: any) => Promise<{ success: boolean; windowId: string }>;
    show: (id: string) => Promise<{ success: boolean }>;
    hide: (id: string) => Promise<{ success: boolean }>;
    close: (id: string) => Promise<{ success: boolean }>;
    getMetrics: (id?: string) => Promise<any>;
  };

  // Settings
  settings: {
    getKnowledgeBase: () => Promise<{
      files: Array<{ id: string; name: string; entriesCount: number; status: 'indexing' | 'ready' | 'error' }>;
    }>;
  };

  // Notifications
  notification: {
    action: (notificationId: string, action: string) => Promise<void>;
  };

  // Transcript Streaming (MessagePort)
  transcript: {
    onToken: (callback: (token: any) => void) => () => void;
    onVAD: (callback: (event: any) => void) => () => void;
    onStatus: (callback: (status: any) => void) => () => void;
  };

  // Analytics
  analytics: {
    trackEvent: (type: string, category: string, data: any) => void;
    getEvents: (startTime: number, endTime: number, types?: string[], limit?: number) => Promise<any[]>;
    getStats: (startTime: number, endTime: number) => Promise<any>;
  };

  // Utility
  platform: string;
  versions: Record<string, string>;
  getPath: (name: string) => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// MessagePort for transcript streaming
let transcriptPort: MessagePort | null = null;
const transcriptListeners = new Map<string, Set<Function>>();

// Initialize transcript MessagePort
ipcRenderer.on('transcript:port', (event, port: MessagePort) => {
  transcriptPort = port;
  port.onmessage = (event) => {
    const message = event.data;
    const listeners = transcriptListeners.get(message.type) || new Set();
    for (const listener of listeners) {
      try {
        listener(message);
      } catch (error) {
        console.error('[Preload] Transcript listener error:', error);
      }
    }
  };
  transcriptPort.start();
});

// Secure IPC wrapper
function createIPCWrapper() {
  const pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();
  let requestCounter = 0;

  function invoke(channel: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`IPC timeout on channel ${channel}`));
      }, 30000);

      const pending = { resolve, reject, timeout };
      const requestIdStr = `req-${++requestCounter}`;

      // Store pending request
      const pendingRequestsMap = (window as any).__ipcPendingRequests || new Map();
      pendingRequestsMap.set(requestIdStr, { resolve, reject, timeout });
      (window as any).__ipcPendingRequests = pendingRequestsMap;

      ipcRenderer.send('ipc:invoke', { channel, args, requestId: requestIdStr });
    });
  }

  // Handle responses
  ipcRenderer.on('ipc:response', (event, response: any) => {
    if (response.requestId) {
      const pendingRequestsMap = (window as any).__ipcPendingRequests;
      if (pendingRequestsMap && pendingRequestsMap.has(response.requestId)) {
        const pending = pendingRequestsMap.get(response.requestId);
        clearTimeout(pending.timeout);
        pendingRequestsMap.delete(response.requestId);

        if (response.success) {
          pending.resolve(response.data);
        } else {
          const error = new Error(response.error?.message || 'IPC error');
          (error as any).code = response.error?.code;
          pending.reject(error);
        }
      }
    }
  });

  // Handle async events
  ipcRenderer.on('ipc:event', (event, message: any) => {
    window.dispatchEvent(new CustomEvent(`ipc:${message.channel}`, { detail: message.data }));
  });

  return {
    invoke,
    on: (channel: string, listener: (data: any) => void) => {
      window.addEventListener(`ipc:${channel}`, (event: CustomEvent) => listener(event.detail));
      return () => window.removeEventListener(`ipc:${channel}`, listener);
    },
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send('ipc:send', { channel, args });
    },
  };
}

const ipc = createIPCWrapper();

// Build the exposed API
const electronAPI: ElectronAPI = {
  // Knowledge Base
  knowledgeBase: {
    search: (query: string, context?: string, threshold?: number) =>
      ipc.invoke('knowledge-base:search', query, context, threshold),
    add: (entry: any) => ipc.invoke('knowledge-base:add', entry),
    import: (filePath: string) => ipc.invoke('knowledge-base:import', filePath),
    getFiles: () => ipc.invoke('knowledge-base:files'),
    clear: () => ipc.invoke('knowledge-base:clear'),
  },

  // Intelligent Router
  router: {
    route: (request: any) => ipc.invoke('router:route', request),
    getStatus: () => ipc.invoke('router:status'),
    resetCircuits: () => ipc.invoke('circuit-breaker:reset'),
    enableProvider: (id: string) => ipc.invoke('router:enable', id),
    disableProvider: (id: string) => ipc.invoke('router:disable', id),
    getProviders: () => ipc.invoke('router:providers'),
  },

  // Speech Provider
  speech: {
    validate: (providerId: string) => ipc.invoke('speech:validate', providerId),
    health: (providerId: string) => ipc.invoke('speech:health', providerId),
    validateAll: () => ipc.invoke('speech:validate-all'),
  },

  // Circuit Breaker
  circuitBreaker: {
    getStatus: () => ipc.invoke('circuit-breaker:status'),
    reset: (providerId?: string) => ipc.invoke('circuit-breaker:reset', providerId),
  },

  // Error Handling
  error: {
    report: (error: Error | string, context?: Record<string, any>) =>
      ipc.invoke('error:report', error, context),
  },

  // Window Management
  window: {
    create: (id: string, url: string, options?: any) => ipc.invoke('window:create', id, url, options),
    show: (id: string) => ipc.invoke('window:show', id),
    hide: (id: string) => ipc.invoke('window:hide', id),
    close: (id: string) => ipc.invoke('window:close', id),
    getMetrics: (id?: string) => ipc.invoke('window:metrics', id),
  },

  // Settings
  settings: {
    getKnowledgeBase: () => ipc.invoke('settings:knowledge-base'),
  },

  // Notifications
  notification: {
    action: (notificationId: string, action: string) => ipc.invoke('notification:action', notificationId, action),
  },

  // Transcript Streaming
  transcript: {
    onToken: (callback: (token: any) => void) => {
      const listeners = transcriptListeners.get('stt:token') || new Set();
      listeners.add(callback);
      transcriptListeners.set('stt:token', listeners);
      return () => {
        const ls = transcriptListeners.get('stt:token');
        if (ls) ls.delete(callback);
      };
    },
    onVAD: (callback: (event: any) => void) => {
      const listeners = transcriptListeners.get('vad') || new Set();
      listeners.add(callback);
      transcriptListeners.set('vad', listeners);
      return () => {
        const ls = transcriptListeners.get('vad');
        if (ls) ls.delete(callback);
      };
    },
    onStatus: (callback: (status: any) => void) => {
      const listeners = transcriptListeners.get('stt:status') || new Set();
      listeners.add(callback);
      transcriptListeners.set('stt:status', listeners);
      return () => {
        const ls = transcriptListeners.get('stt:status');
        if (ls) ls.delete(callback);
      };
    },
  },

  // Analytics
  analytics: {
    trackEvent: (type: string, category: string, data: any) => {
      ipc.send('analytics:track', { type, category, data });
    },
    getEvents: (startTime: number, endTime: number, types?: string[], limit?: number) =>
      ipc.invoke('analytics:events', startTime, endTime, types, limit),
    getStats: (startTime: number, endTime: number) => ipc.invoke('analytics:stats', startTime, endTime),
  },

  // Utility
  platform: process.platform,
  versions: process.versions,
  getPath: (name: string) => ipc.invoke('app:getPath', name),
};

// Expose the API
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Also expose minimal process info
contextBridge.exposeInMainWorld('process', {
  platform: process.platform,
  versions: process.versions,
  env: { NODE_ENV: process.env.NODE_ENV },
});

// Handle renderer process errors
window.addEventListener('error', (event) => {
  console.error('[Renderer] Uncaught error:', event.error);
  ipcRenderer.send('error:report', {
    message: event.error?.message || event.message,
    stack: event.error?.stack,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] Unhandled rejection:', event.reason);
  ipcRenderer.send('error:report', {
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack,
    type: 'unhandled_rejection',
  });
});

// Notify main process when renderer is ready
document.addEventListener('DOMContentLoaded', () => {
  ipcRenderer.send('renderer:ready');
});

// Notify when page is about to unload
window.addEventListener('beforeunload', () => {
  ipcRenderer.send('renderer:unload');
});

console.log('[Preload] Electron API exposed');