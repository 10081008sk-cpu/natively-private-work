/**
 * Global Error Handler
 * Centralized error handling for the Electron main process
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { ErrorNotificationService } from '../services/ErrorNotificationService';

export interface ErrorInfo {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  stack?: string;
  process: number;
  command: string;
  nodeVersion: string;
  electronVersion: string;
  context?: Record<string, any>;
}

export interface ErrorNotification {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  actions: Array<{
    label: string;
    action: string;
    primary?: boolean;
  }>;
  context?: Record<string, any>;
  autoHideMs?: number;
}

export class GlobalErrorHandler {
  private notificationService: ErrorNotificationService;
  private logFile: string;
  private maxLogSize: number;
  private maxLogFiles: number;

  constructor() {
    this.notificationService = new ErrorNotificationService();
    this.logFile = path.join(app.getPath('userData'), 'logs', 'errors.log');
    this.maxLogSize = 10 * 1024 * 1024; // 10MB
    this.maxLogFiles = 5;

    this.ensureLogDirectory();
    this.setupGlobalHandlers();
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private setupGlobalHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      await this.handleError(error, 'uncaught_exception');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      await this.handleError(reason, 'unhandled_rejection');
    });

    // Handle process signals
    process.on('SIGINT', () => this.handleShutdown('SIGINT'));
    process.on('SIGTERM', () => this.handleShutdown('SIGTERM'));

    // Handle process exit
    process.on('exit', (code) => {
      if (code !== 0) {
        this.logSystemExit(code);
      }
    });
  }

  private async handleError(error: any, type: string): Promise<void> {
    const errorInfo: ErrorInfo = {
      id: this.generateId(),
      timestamp: Date.now(),
      type,
      message: this.getErrorMessage(error),
      stack: this.getErrorStack(error),
      process: process.pid,
      command: process.argv.join(' '),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      context: this.getContextInfo(error),
    };

    // Create user-friendly notification
    const notification = this.createUserNotification(errorInfo);

    // Show notification to user
    try {
      await this.notificationService.show(notification);
    } catch (notificationError) {
      console.error('Failed to show error notification:', notificationError);
    }

    // Log error for debugging
    await this.logError(errorInfo);
  }

  private createUserNotification(errorInfo: ErrorInfo): ErrorNotification {
    const severity = this.determineSeverity(errorInfo);
    const title = this.getErrorTitle(errorInfo.type);
    const message = this.getUserFriendlyMessage(errorInfo);
    const actions = this.getActions(errorInfo.type, severity);

    return {
      id: errorInfo.id,
      title,
      message,
      severity,
      actions,
      context: errorInfo.context,
      autoHideMs: this.getAutoHideDuration(severity),
    };
  }

  private getErrorMessage(error: any): string {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && error.message) return String(error.message);
    return String(error);
  }

  private getErrorStack(error: any): string | undefined {
    if (error instanceof Error) return error.stack;
    if (error && typeof error === 'object' && error.stack) return String(error.stack);
    return new Error().stack;
  }

  private getContextInfo(error: any): Record<string, any> {
    const context: Record<string, any> = {};

    if (error && typeof error === 'object') {
      // Extract relevant properties
      for (const key of ['code', 'errno', 'syscall', 'path', 'status', 'statusCode', 'url']) {
        if (key in error) {
          context[key] = error[key];
        }
      }
    }

    return context;
  }

  private determineSeverity(errorInfo: ErrorInfo): 'info' | 'warning' | 'error' | 'critical' {
    // Critical: Uncaught exceptions, security issues, data loss
    if (errorInfo.type === 'uncaught_exception') return 'critical';

    // Error: Unhandled rejections, network failures
    if (errorInfo.type === 'unhandled_rejection') return 'error';

    // Check error code for specific severity
    if (errorInfo.context?.code) {
      const criticalCodes = ['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EMFILE'];
      const errorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'];

      if (criticalCodes.includes(errorInfo.context.code)) return 'critical';
      if (errorCodes.includes(errorInfo.context.code)) return 'error';
    }

    return 'warning';
  }

  private getErrorTitle(type: string): string {
    switch (type) {
      case 'uncaught_exception':
        return 'Application Error';
      case 'unhandled_rejection':
        return 'Promise Rejection';
      default:
        return 'Error';
    }
  }

  private getUserFriendlyMessage(errorInfo: ErrorInfo): string {
    const message = errorInfo.message;

    // Provide user-friendly messages for common errors
    if (errorInfo.context?.code) {
      switch (errorInfo.context.code) {
        case 'ENOENT':
          return 'A required file or resource was not found. Please check your configuration.';
        case 'EACCES':
        case 'EPERM':
          return 'Permission denied. Please check file permissions or run as administrator.';
        case 'ENOSPC':
          return 'Disk space is full. Please free up space and try again.';
        case 'EMFILE':
          return 'Too many open files. Please restart the application.';
        case 'ECONNREFUSED':
          return 'Unable to connect to the service. Please check your network connection.';
        case 'ETIMEDOUT':
          return 'The request timed out. Please try again.';
        case 'ENOTFOUND':
          return 'Unable to resolve the server address. Please check your internet connection.';
        case 'ECONNRESET':
          return 'Connection was closed unexpectedly. Please try again.';
      }
    }

    // Generic user-friendly message
    return `An error occurred: ${message}. The application will attempt to recover automatically.`;
  }

  private getActions(type: string, severity: string): Array<{ label: string; action: string; primary?: boolean }> {
    const actions: Array<{ label: string; action: string; primary?: boolean }> = [];

    if (severity === 'critical' || severity === 'error') {
      actions.push({ label: 'Restart App', action: 'restart', primary: true });
    }

    actions.push({ label: 'Copy Error', action: 'copy_error' });
    actions.push({ label: 'Report Issue', action: 'report_issue' });
    actions.push({ label: 'Dismiss', action: 'dismiss' });

    return actions;
  }

  private getAutoHideDuration(severity: string): number {
    switch (severity) {
      case 'critical': return 30000; // 30 seconds
      case 'error': return 15000;    // 15 seconds
      case 'warning': return 10000;  // 10 seconds
      default: return 5000;          // 5 seconds
    }
  }

  private async logError(errorInfo: ErrorInfo): Promise<void> {
    try {
      // Rotate logs if needed
      await this.rotateLogsIfNeeded();

      const logEntry = `${JSON.stringify(errorInfo)}\n`;
      fs.appendFileSync(this.logFile, logEntry, 'utf8');
    } catch (error) {
      console.error('Failed to log error:', error);
    }
  }

  private async rotateLogsIfNeeded(): Promise<void> {
    try {
      if (!fs.existsSync(this.logFile)) return;

      const stats = fs.statSync(this.logFile);
      if (stats.size < this.maxLogSize) return;

      // Rotate logs
      for (let i = this.maxLogFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        if (fs.existsSync(oldFile)) {
          fs.renameSync(oldFile, newFile);
        }
      }

      // Move current log
      fs.renameSync(this.logFile, `${this.logFile}.1`);
    } catch (error) {
      console.error('Failed to rotate logs:', error);
    }
  }

  private handleShutdown(signal: string): void {
    console.log(`Received ${signal}, shutting down gracefully...`);
    process.exit(0);
  }

  private logSystemExit(code: number): void {
    const errorInfo: ErrorInfo = {
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'system_exit',
      message: `Process exited with code ${code}`,
      process: process.pid,
      command: process.argv.join(' '),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
    };

    this.logError(errorInfo).catch(console.error);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API for manual error reporting
  async reportError(error: Error | string, context?: Record<string, any>): Promise<void> {
    const errorInfo: ErrorInfo = {
      id: this.generateId(),
      timestamp: Date.now(),
      type: 'manual_report',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      process: process.pid,
      command: process.argv.join(' '),
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      context,
    };

    const notification = this.createUserNotification(errorInfo);
    await this.notificationService.show(notification);
    await this.logError(errorInfo);
  }
}

// Singleton instance
let globalErrorHandlerInstance: GlobalErrorHandler | null = null;

export function getGlobalErrorHandler(): GlobalErrorHandler {
  if (!globalErrorHandlerInstance) {
    globalErrorHandlerInstance = new GlobalErrorHandler();
  }
  return globalErrorHandlerInstance;
}

export function initializeGlobalErrorHandler(): GlobalErrorHandler {
  globalErrorHandlerInstance = new GlobalErrorHandler();
  return globalErrorHandlerInstance;
}