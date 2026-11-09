/**
 * Error Notification Service
 * Displays user-friendly error notifications in the Electron app
 */

import { BrowserWindow } from 'electron';
import * as path from 'path';

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

export class ErrorNotificationService {
  private notifications: ErrorNotification[] = [];
  private notificationWindow: BrowserWindow | null = null;
  private isProcessing = false;
  private maxConcurrent = 3;

  constructor() {
    this.setupIPC();
  }

  private setupIPC(): void {
    // Handle notification actions from renderer
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      // Renderer-side IPC handling would be set up in preload script
    }
  }

  async show(notification: ErrorNotification): Promise<void> {
    // Add to queue
    this.notifications.push(notification);

    // Process queue
    await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.notifications.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.notifications.length > 0) {
      const notification = this.notifications.shift()!;
      await this.displayNotification(notification);
    }

    this.isProcessing = false;
  }

  private async displayNotification(notification: ErrorNotification): Promise<void> {
    return new Promise((resolve) => {
      // Create notification window if needed
      if (!this.notificationWindow || this.notificationWindow.isDestroyed()) {
        this.notificationWindow = this.createNotificationWindow();
      }

      // Send notification to window
      this.notificationWindow.webContents.send('show-notification', notification);

      // Show window
      this.notificationWindow.show();

      // Auto-hide based on severity
      const autoHideMs = notification.autoHideMs || this.getAutoHideDuration(notification.severity);
      setTimeout(() => {
        if (this.notificationWindow && !this.notificationWindow.isDestroyed()) {
          this.notificationWindow.hide();
        }
        resolve();
      }, autoHideMs);

      // Handle window close
      this.notificationWindow.once('hide', () => {
        resolve();
      });
    });
  }

  private createNotificationWindow(): BrowserWindow {
    const { BrowserWindow } = require('electron');

    const window = new BrowserWindow({
      width: 420,
      height: 220,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload', 'notification-preload.js'),
      },
    });

    // Load notification HTML
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getNotificationHTML())}`);

    // Handle window events
    window.on('closed', () => {
      this.notificationWindow = null;
    });

    return window;
  }

  private getNotificationHTML(): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: rgba(31, 41, 55, 0.95);
      backdrop-filter: blur(10px);
      border-radius: 12px;
      border: 1px solid rgba(59, 130, 246, 0.3);
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      overflow: hidden;
    }
    .notification {
      padding: 16px;
      color: #f9fafb;
    }
    .header {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    .icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      margin-right: 12px;
      flex-shrink: 0;
    }
    .icon.critical { background: #dc2626; }
    .icon.error { background: #ef4444; }
    .icon.warning { background: #f59e0b; }
    .icon.info { background: #3b82f6; }
    .title {
      font-size: 14px;
      font-weight: 600;
      color: #f9fafb;
    }
    .message {
      font-size: 13px;
      line-height: 1.5;
      color: #d1d5db;
      margin-bottom: 16px;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn.primary {
      background: #3b82f6;
      color: white;
    }
    .btn.primary:hover { background: #2563eb; }
    .btn.secondary {
      background: #374151;
      color: #f9fafb;
      border: 1px solid #4b5563;
    }
    .btn.secondary:hover { background: #4b5563; }
    .btn.danger {
      background: #dc2626;
      color: white;
    }
    .btn.danger:hover { background: #b91c1c; }
    .severity-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: auto;
    }
    .severity-badge.critical { background: #dc2626; }
    .severity-badge.error { background: #ef4444; }
    .severity-badge.warning { background: #f59e0b; }
    .severity-badge.info { background: #3b82f6; }
  </style>
</head>
<body>
  <div class="notification" id="notification">
    <div class="header">
      <div class="icon" id="icon">!</div>
      <div class="title" id="title">Error</div>
      <span class="severity-badge" id="severityBadge">ERROR</span>
    </div>
    <div class="message" id="message">An error occurred</div>
    <div class="actions" id="actions"></div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    
    // Listen for notification data
    ipcRenderer.on('show-notification', (event, notification) => {
      document.getElementById('title').textContent = notification.title;
      document.getElementById('message').textContent = notification.message;
      
      const icon = document.getElementById('icon');
      icon.textContent = getIconForSeverity(notification.severity);
      icon.className = 'icon ' + notification.severity;
      
      const badge = document.getElementById('severityBadge');
      badge.textContent = notification.severity.toUpperCase();
      badge.className = 'severity-badge ' + notification.severity;
      
      const actionsContainer = document.getElementById('actions');
      actionsContainer.innerHTML = '';
      
      notification.actions.forEach((action, index) => {
        const btn = document.createElement('button');
        btn.className = 'btn ' + (action.primary ? 'primary' : 'secondary');
        if (action.action === 'restart') btn.classList.add('danger');
        btn.textContent = action.label;
        btn.onclick = () => {
          ipcRenderer.send('notification-action', notification.id, action.action);
        };
        actionsContainer.appendChild(btn);
      });
    });
    
    function getIconForSeverity(severity) {
      switch (severity) {
        case 'critical': return '✕';
        case 'error': return '⚠';
        case 'warning': return '⚡';
        case 'info': return 'ℹ';
        default: return '!';
      }
    }
  </script>
</body>
</html>
    `;
  }

  private getIconForSeverity(severity: string): string {
    switch (severity) {
      case 'critical': return '✕';
      case 'error': return '⚠';
      case 'warning': return '⚡';
      case 'info': return 'ℹ';
      default: return '!';
    }
  }

  private getAutoHideDuration(severity: string): number {
    switch (severity) {
      case 'critical': return 30000; // 30 seconds
      case 'error': return 15000;    // 15 seconds
      case 'warning': return 10000;  // 10 seconds
      default: return 5000;          // 5 seconds
    }
  }

  // IPC handler for notification actions
  handleAction(notificationId: string, action: string): void {
    console.log(`Notification action: ${action} for ${notificationId}`);

    switch (action) {
      case 'restart':
        // Trigger app restart
        const { app } = require('electron');
        app.relaunch();
        app.exit(0);
        break;
      case 'copy_error':
        // Copy error details to clipboard
        const { clipboard } = require('electron');
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
          clipboard.writeText(JSON.stringify(notification, null, 2));
        }
        break;
      case 'report_issue':
        // Open issue reporting URL
        const { shell } = require('electron');
        shell.openExternal('https://github.com/Natively-AI-assistant/natively-cluely-ai-assistant/issues/new');
        break;
      case 'dismiss':
        // Just dismiss - window will auto-hide
        break;
    }
  }
}

// Singleton instance
let errorNotificationServiceInstance: ErrorNotificationService | null = null;

export function getErrorNotificationService(): ErrorNotificationService {
  if (!errorNotificationServiceInstance) {
    errorNotificationServiceInstance = new ErrorNotificationService();
  }
  return errorNotificationServiceInstance;
}

export function initializeErrorNotificationService(): ErrorNotificationService {
  errorNotificationServiceInstance = new ErrorNotificationService();
  return errorNotificationServiceInstance;
}