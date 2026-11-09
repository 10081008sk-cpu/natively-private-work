/**
 * Window Manager
 * Enterprise-grade window lifecycle management for Electron
 */

import { BrowserWindow, BrowserWindowConstructorOptions, screen, app, ipcMain } from 'electron';
import * as path from 'path';

export interface WindowOptions {
  id: string;
  url: string;
  options?: BrowserWindowConstructorOptions;
  showOnReady?: boolean;
  backgroundColor?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface WindowMetrics {
  windowId: string;
  loadTime: number;
  memoryUsage: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export class WindowManager {
  private windows: Map<string, BrowserWindow> = new Map();
  private windowOptions: Map<string, WindowOptions> = new Map();
  private metrics: Map<string, WindowMetrics[]> = new Map();
  private isDev: boolean;
  private startUrl: string;

  constructor() {
    this.isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
    this.startUrl = this.isDev
      ? 'http://localhost:5180'
      : `file://${path.join(__dirname, '../../dist/index.html')}`;

    console.log(`[WindowManager] Initialized - isDev: ${this.isDev}, startUrl: ${this.startUrl}`);
  }

  public createWindow(id: string, options: WindowOptions): BrowserWindow {
    if (this.windows.has(id)) {
      console.warn(`[WindowManager] Window ${id} already exists, returning existing`);
      return this.windows.get(id)!;
    }

    // Store options for retry logic
    this.windowOptions.set(id, options);

    // Create window with optimized settings
    const window = this.createOptimizedWindow(id, options);
    this.windows.set(id, window);

    // Setup event handlers
    this.setupWindowEvents(window, id, options);

    // Load URL with retry logic
    this.loadWindowWithRetry(window, id, options);

    return window;
  }

  private createOptimizedWindow(id: string, options: WindowOptions): BrowserWindow {
    const defaultOptions: BrowserWindowConstructorOptions = {
      show: false, // CRITICAL: Hide until ready-to-show
      backgroundColor: options.backgroundColor || '#121212', // Match theme
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        enableWebSQL: false,
        experimentalFeatures: false,
        disableHtmlFullscreen: true,
      },
      ...options.options,
    };

    const window = new BrowserWindow(defaultOptions);
    console.log(`[WindowManager] Created window: ${id}`);
    return window;
  }

  private setupWindowEvents(window: BrowserWindow, id: string, options: WindowOptions): void {
    // Handle ready-to-show
    window.once('ready-to-show', () => {
      if (options.showOnReady !== false) {
        window.show();
        console.log(`[WindowManager] Window ${id} shown after ready-to-show`);
      }
    });

    // Handle load errors
    window.webContents.on('did-fail-load', (event, errorCode, errorDescription, url) => {
      console.error(`[WindowManager] Window ${id} failed to load:`, errorCode, errorDescription);
      this.handleLoadError(window, id, options, errorCode, errorDescription);
    });

    // Handle renderer crashes
    window.webContents.on('render-process-gone', (event, details) => {
      console.error(`[WindowManager] Renderer crashed in window ${id}:`, details.reason);
      this.handleRendererCrash(window, id, options, details);
    });

    // Handle unresponsive
    window.webContents.on('unresponsive', () => {
      console.warn(`[WindowManager] Window ${id} became unresponsive`);
    });

    window.webContents.on('responsive', () => {
      console.log(`[WindowManager] Window ${id} became responsive again`);
    });

    // Handle window close
    window.on('closed', () => {
      console.log(`[WindowManager] Window ${id} closed`);
      this.windows.delete(id);
      this.windowOptions.delete(id);
    });
  }

  private async loadWindowWithRetry(
    window: BrowserWindow,
    id: string,
    options: WindowOptions
  ): Promise<void> {
    const maxAttempts = options.retryAttempts || 5;
    const initialDelay = options.retryDelay || 600;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (window.isDestroyed()) return;

        const startTime = Date.now();
        await window.loadURL(options.url);
        const loadTime = Date.now() - startTime;

        console.log(`[WindowManager] Window ${id} loaded successfully on attempt ${attempt} (${loadTime}ms)`);

        // Record success metrics
        this.recordMetrics(id, {
          windowId: id,
          loadTime,
          memoryUsage: process.getHeapStatistics().usedHeapSize / 1024 / 1024,
          timestamp: Date.now(),
          success: true,
        });

        return;
      } catch (error: any) {
        console.warn(`[WindowManager] Window ${id} load attempt ${attempt}/${maxAttempts} failed:`, error.message);

        if (attempt < maxAttempts) {
          const delay = initialDelay * Math.pow(1.5, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[WindowManager] All ${maxAttempts} load attempts exhausted for window ${id}`);

          // Record failure metrics
          this.recordMetrics(id, {
            windowId: id,
            loadTime: 0,
            memoryUsage: process.getHeapStatistics().usedHeapSize / 1024 / 1024,
            timestamp: Date.now(),
            success: false,
            error: `All ${maxAttempts} attempts failed`,
          });

          // Show error in window if possible
          this.showLoadError(window, id);
        }
      }
    }
  }

  private handleLoadError(
    window: BrowserWindow,
    id: string,
    options: WindowOptions,
    errorCode: number,
    errorDescription: string
  ): void {
    console.error(`[WindowManager] Load error for window ${id}:`, errorCode, errorDescription);

    // Attempt reload
    if (!window.isDestroyed()) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          console.log(`[WindowManager] Retrying load for window ${id}`);
          window.reload();
        }
      }, 2000);
    }
  }

  private handleRendererCrash(
    window: BrowserWindow,
    id: string,
    options: WindowOptions,
    details: any
  ): void {
    console.error(`[WindowManager] Renderer crash in window ${id}:`, details.reason);

    // Attempt recovery
    if (!window.isDestroyed()) {
      if (details.reason !== 'clean-exit') {
        console.log(`[WindowManager] Reloading window ${id} after renderer crash`);
        window.reload();
      }
    }

    // Notify UI of crash
    this.notifyRendererCrash(id, details);
  }

  private showLoadError(window: BrowserWindow, id: string): void {
    if (window.isDestroyed()) return;

    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 40px; background: #1a1a1a; color: #fff; text-align: center; }
          .container { max-width: 400px; margin: 0 auto; }
          .icon { font-size: 48px; margin-bottom: 20px; }
          h1 { font-size: 24px; margin-bottom: 16px; }
          p { color: #aaa; margin-bottom: 24px; }
          button { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; }
          button:hover { background: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">⚠</div>
          <h1>Unable to Load</h1>
          <p>Unable to load the application. Please check your connection and try again.</p>
          <button onclick="window.location.reload()">Retry</button>
        </div>
      </body>
      </html>
    `;

    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
  }

  private notifyRendererCrash(windowId: string, details: any): void {
    // Notify all windows about the crash
    for (const [id, window] of this.windows) {
      if (!window.isDestroyed()) {
        window.webContents.send('renderer-crash', {
          windowId,
          reason: details.reason,
          timestamp: Date.now(),
        });
      }
    }
  }

  private recordMetrics(windowId: string, metric: WindowMetrics): void {
    if (!this.metrics.has(windowId)) {
      this.metrics.set(windowId, []);
    }

    const windowMetrics = this.metrics.get(windowId)!;
    windowMetrics.push(metric);

    // Keep only last 100 metrics per window
    if (windowMetrics.length > 100) {
      windowMetrics.shift();
    }

    // Log slow loads
    if (metric.success && metric.loadTime > 5000) {
      console.warn(`[WindowManager] Slow load detected for window ${windowId}: ${metric.loadTime}ms`);
    }
  }

  // Public API

  public getWindow(id: string): BrowserWindow | undefined {
    return this.windows.get(id);
  }

  public getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values());
  }

  public showWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.show();
    }
  }

  public hideWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }

  public closeWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  public reloadWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.reload();
    }
  }

  public focusWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.focus();
    }
  }

  public getWindowBounds(id: string): Electron.Rectangle | null {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      return window.getBounds();
    }
    return null;
  }

  public setWindowBounds(id: string, bounds: Electron.Rectangle): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.setBounds(bounds);
    }
  }

  public centerWindow(id: string): void {
    const window = this.windows.get(id);
    if (window && !window.isDestroyed()) {
      window.center();
    }
  }

  // Metrics and monitoring

  public getMetrics(windowId: string): WindowMetrics[] {
    return this.metrics.get(windowId) || [];
  }

  public getAllMetrics(): Map<string, WindowMetrics[]> {
    return new Map(this.metrics);
  }

  public getAverageLoadTime(windowId: string): number {
    const metrics = this.metrics.get(windowId) || [];
    const successful = metrics.filter(m => m.success);
    if (successful.length === 0) return 0;

    const sum = successful.reduce((sum, m) => sum + m.loadTime, 0);
    return sum / successful.length;
  }

  // Memory monitoring
  public startMemoryMonitoring(intervalMs: number = 30000): void {
    setInterval(() => {
      const heapStats = process.getHeapStatistics();
      const usedMemory = heapStats.usedHeapSize / 1024 / 1024; // MB
      const totalMemory = heapStats.totalHeapSize / 1024 / 1024; // MB
      const usagePercent = (usedMemory / totalMemory) * 100;

      if (usagePercent > 80) {
        console.warn(`[WindowManager] High memory usage: ${usedMemory.toFixed(2)}MB / ${totalMemory.toFixed(2)}MB (${usagePercent.toFixed(1)}%)`);
      }
    }, intervalMs);
  }

  // GPU acceleration handling
  public disableHardwareAcceleration(): void {
    app.disableHardwareAcceleration();
    console.log('[WindowManager] Hardware acceleration disabled');
  }

  // Cleanup
  public closeAllWindows(): void {
    for (const [id, window] of this.windows) {
      if (!window.isDestroyed()) {
        window.close();
      }
    }
    this.windows.clear();
    this.windowOptions.clear();
    this.metrics.clear();
  }
}

// Singleton instance
let windowManagerInstance: WindowManager | null = null;

export function getWindowManager(): WindowManager {
  if (!windowManagerInstance) {
    windowManagerInstance = new WindowManager();
  }
  return windowManagerInstance;
}

export function initializeWindowManager(): WindowManager {
  windowManagerInstance = new WindowManager();
  return windowManagerInstance;
}

// Predefined window configurations
export const WINDOW_CONFIGS = {
  launcher: {
    id: 'launcher',
    url: '',
    options: {
      width: 400,
      height: 600,
      minWidth: 320,
      minHeight: 400,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      skipTaskbar: false,
    },
    backgroundColor: '#121212',
  },
  overlay: {
    id: 'overlay',
    url: '',
    options: {
      width: 600,
      height: 400,
      minWidth: 400,
      minHeight: 200,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
    },
    backgroundColor: '#00000000',
  },
  cropper: {
    id: 'cropper',
    url: '',
    options: {
      width: 800,
      height: 600,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
    },
    backgroundColor: '#00000000',
  },
  settings: {
    id: 'settings',
    url: '',
    options: {
      width: 700,
      height: 600,
      minWidth: 600,
      minHeight: 500,
      frame: false,
      transparent: true,
      alwaysOnTop: false,
      skipTaskbar: false,
    },
    backgroundColor: '#121212',
  },
};