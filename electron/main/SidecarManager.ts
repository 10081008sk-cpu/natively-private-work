/**
 * Sidecar Manager
 * Supervises utilityProcess forks for STT and Orchestration sidecars
 * Handles MessagePort transfer, lifecycle, and error recovery
 */

import { EventEmitter } from 'events';
import { utilityProcess, UtilityProcess, BrowserWindow, MessageChannelMain, app } from 'electron';
import * as path from 'path';

export interface SidecarConfig {
  id: string;
  entryPoint: string;
  args?: string[];
  env?: Record<string, string>;
  maxRestarts: number;
  restartDelay: number;
  healthCheckInterval: number;
  healthCheckTimeout: number;
}

export interface SidecarState {
  id: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed' | 'restarting';
  pid?: number;
  restartCount: number;
  lastError?: string;
  lastHeartbeat: number;
  startTime?: number;
  uptime: number;
}

export interface SidecarMessage {
  type: string;
  payload?: any;
  requestId?: string;
  timestamp: number;
}

export interface SidecarEntry {
  config: SidecarConfig;
  process: UtilityProcess | null;
  state: SidecarState;
  messagePort: any;
  heartbeatTimer: NodeJS.Timeout | null;
  restartTimer: NodeJS.Timeout | null;
  pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>;
}

export class SidecarManager extends EventEmitter {
  private sidecars = new Map<string, SidecarEntry>();

  private defaultConfig = {
    maxRestarts: 3,
    restartDelay: 1000,
    healthCheckInterval: 5000,
    healthCheckTimeout: 15000,
  };

  constructor() {
    super();
  }

  registerSidecar(config: SidecarConfig): void {
    const mergedConfig = { ...this.defaultConfig, ...config };

    this.sidecars.set(config.id, {
      config: mergedConfig,
      process: null,
      state: {
        id: config.id,
        status: 'stopped',
        restartCount: 0,
        lastHeartbeat: 0,
        uptime: 0,
      },
      messagePort: null,
      heartbeatTimer: null,
      restartTimer: null,
      pendingRequests: new Map(),
    });

    console.log(`[SidecarManager] Registered sidecar: ${config.id}`);
  }

  async startSidecar(id: string): Promise<void> {
    const sidecar = this.sidecars.get(id);
    if (!sidecar) {
      throw new Error(`Sidecar not registered: ${id}`);
    }

    if (sidecar.state.status === 'running' || sidecar.state.status === 'starting') {
      console.log(`[SidecarManager] ${id} already running`);
      return;
    }

    sidecar.state.status = 'starting';
    sidecar.state.startTime = Date.now();
    sidecar.state.restartCount = 0;
    this.emitStateChange(id);

    try {
      await this.forkProcess(id);
    } catch (error) {
      sidecar.state.status = 'failed';
      sidecar.state.lastError = error instanceof Error ? error.message : String(error);
      this.emitStateChange(id);
      throw error;
    }
  }

  private async forkProcess(id: string): Promise<void> {
    const sidecar = this.sidecars.get(id)!;
    const { config } = sidecar;

    return new Promise((resolve, reject) => {
      try {
        const childProcess = utilityProcess.fork(config.entryPoint, config.args || [], {
          env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'production',
            ...config.env,
          },
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        });

        sidecar.process = childProcess;
        sidecar.state.pid = childProcess.pid;

        // Create MessageChannel for direct communication
        const { port1, port2 } = new MessageChannelMain();
        sidecar.messagePort = port1;

        // Send port2 to child
        childProcess.postMessage({ type: 'port', port: port2 }, [port2]);

        // Handle messages from sidecar
        port1.on('message', (message: any) => {
          this.handleSidecarMessage(id, message);
        });

        port1.on('close', () => {
          console.log(`[SidecarManager] MessagePort closed for ${id}`);
        });

        port1.on('error', (error: Error) => {
          console.error(`[SidecarManager] MessagePort error for ${id}:`, error);
        });

        // Handle process events
        childProcess.on('spawn', () => {
          console.log(`[SidecarManager] ${id} spawned (PID: ${childProcess.pid})`);
        });

        childProcess.on('exit', (code, signal) => {
          console.log(`[SidecarManager] ${id} exited: code=${code}, signal=${signal}`);
          this.handleProcessExit(id, code, signal);
        });

        childProcess.on('error', (error) => {
          console.error(`[SidecarManager] ${id} process error:`, error);
        });

        // Send configuration
        childProcess.postMessage({
          type: 'config',
          config: config.args ? { args: config.args } : {},
        });

        // Wait for ready signal
        const readyTimeout = setTimeout(() => {
          reject(new Error(`${id} failed to initialize within 30s`));
        }, 30000);

        const readyHandler = (message: any) => {
          if (message.type === 'ready') {
            clearTimeout(readyTimeout);
            port1.off('message', readyHandler);
            sidecar.state.status = 'running';
            sidecar.state.lastHeartbeat = Date.now();
            this.startHealthCheck(id);
            this.emitStateChange(id);
            resolve();
          }
        };

        port1.on('message', readyHandler);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleSidecarMessage(id: string, message: any): void {
    const sidecar = this.sidecars.get(id)!;
    sidecar.state.lastHeartbeat = Date.now();

    // Handle pending requests
    if (message.requestId && sidecar.pendingRequests.has(message.requestId)) {
      const pending = sidecar.pendingRequests.get(message.requestId)!;
      clearTimeout(pending.timeout);
      sidecar.pendingRequests.delete(message.requestId);

      if (message.success) {
        pending.resolve(message.data);
      } else {
        const error = new Error(message.error?.message || 'Unknown error');
        (error as any).code = message.error?.code;
        pending.reject(error);
      }
      return;
    }

    // Handle async messages
    switch (message.type) {
      case 'stt:token':
      case 'vad:speech_start':
      case 'vad:speech_end':
      case 'stt:status':
        this.emit(message.type, { ...message, sidecarId: id });
        break;
      case 'ready':
        console.log(`[SidecarManager] ${id} ready`);
        break;
      case 'error':
        this.handleSidecarError(id, message.error);
        break;
      case 'stats':
        this.emit('stats', { ...message.data, sidecarId: id });
        break;
      case 'pong':
        break;
    }
  }

  private handleSidecarError(id: string, error: any): void {
    const sidecar = this.sidecars.get(id)!;
    sidecar.state.lastError = error?.message || String(error);
    console.error(`[SidecarManager] ${id} error:`, error);
    this.emit('error', { sidecarId: id, error });
  }

  private handleProcessExit(id: string, code: number, signal: string): void {
    const sidecar = this.sidecars.get(id)!;
    sidecar.process = null;
    sidecar.state.pid = undefined;

    if (sidecar.state.status === 'stopping' || sidecar.state.status === 'stopped') {
      sidecar.state.status = 'stopped';
      this.emitStateChange(id);
      return;
    }

    const errorMsg = `Process exited: code=${code}, signal=${signal}`;
    sidecar.state.lastError = errorMsg;
    sidecar.state.status = 'failed';

    console.error(`[SidecarManager] ${id} crashed:`, errorMsg);
    this.emitStateChange(id);

    // Check for segfault
    if (signal === 'SIGSEGV' || code === 139 || code === -11) {
      console.error(`[SidecarManager] ${id} SEGFAULT detected!`);
      this.emit('segfault', { sidecarId: id, code, signal });
    }

    this.scheduleRestart(id);
  }

  private scheduleRestart(id: string): void {
    const sidecar = this.sidecars.get(id)!;
    const config = sidecar.config;

    if (sidecar.state.restartCount >= config.maxRestarts) {
      console.error(`[SidecarManager] ${id} max restarts exceeded`);
      sidecar.state.status = 'failed';
      sidecar.state.lastError = `Max restarts (${config.maxRestarts}) exceeded`;
      this.emitStateChange(id);
      this.emit('maxRestartsExceeded', { sidecarId: id });
      return;
    }

    if (sidecar.restartTimer) {
      clearTimeout(sidecar.restartTimer);
    }

    const delay = Math.min(
      config.restartDelay * Math.pow(2, sidecar.state.restartCount),
      30000
    );

    console.log(`[SidecarManager] Scheduling ${id} restart in ${delay}ms (attempt ${sidecar.state.restartCount + 1}/${config.maxRestarts})`);

    sidecar.state.status = 'restarting';
    this.emitStateChange(id);
    this.emit('restarting', { sidecarId: id, attempt: sidecar.state.restartCount + 1 });

    sidecar.restartTimer = setTimeout(async () => {
      sidecar.state.restartCount++;
      try {
        await this.startSidecar(id);
      } catch (error) {
        console.error(`[SidecarManager] ${id} restart failed:`, error);
        this.scheduleRestart(id);
      }
    }, config.restartDelay);
  }

  private startHealthCheck(id: string): void {
    const sidecar = this.sidecars.get(id)!;
    const config = sidecar.config;

    if (sidecar.heartbeatTimer) {
      clearInterval(sidecar.heartbeatTimer);
    }

    sidecar.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceHeartbeat = now - sidecar.state.lastHeartbeat;

      if (timeSinceHeartbeat > config.healthCheckTimeout) {
        console.warn(`[SidecarManager] ${id} heartbeat timeout (${timeSinceHeartbeat}ms)`);
        this.handleHealthCheckTimeout(id);
      } else if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
        sidecar.messagePort.postMessage({ type: 'ping', timestamp: Date.now() });
      }
    }, config.healthCheckInterval);
  }

  private handleHealthCheckTimeout(id: string): void {
    console.error(`[SidecarManager] ${id} health check timeout - forcing restart`);
    this.forceRestart(id);
  }

  private forceRestart(id: string): void {
    const sidecar = this.sidecars.get(id)!;

    if (sidecar.heartbeatTimer) {
      clearInterval(sidecar.heartbeatTimer);
      sidecar.heartbeatTimer = null;
    }

    if (sidecar.process) {
      sidecar.process.kill('SIGKILL');
      sidecar.process = null;
    }

    if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
      sidecar.messagePort.close();
      sidecar.messagePort = null;
    }

    sidecar.state.status = 'restarting';
    this.emitStateChange(id);
    this.scheduleRestart(id);
  }

  async stopSidecar(id: string): Promise<void> {
    const sidecar = this.sidecars.get(id)!;

    if (sidecar.heartbeatTimer) {
      clearInterval(sidecar.heartbeatTimer);
      sidecar.heartbeatTimer = null;
    }
    if (sidecar.restartTimer) {
      clearTimeout(sidecar.restartTimer);
      sidecar.restartTimer = null;
    }

    sidecar.state.status = 'stopping';
    this.emitStateChange(id);

    if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
      sidecar.messagePort.close();
      sidecar.messagePort = null;
    }

    if (sidecar.process) {
      sidecar.process.kill('SIGTERM');
      sidecar.process = null;
    }

    // Reject pending requests
    for (const [, pending] of sidecar.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Sidecar stopped'));
    }
    sidecar.pendingRequests.clear();

    sidecar.state.status = 'stopped';
    sidecar.state.pid = undefined;
    this.emitStateChange(id);
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.sidecars.keys()).map(id => this.stopSidecar(id))
    );
  }

  async sendMessage<T>(id: string, message: any, timeout: number = 30000): Promise<T> {
    const sidecar = this.sidecars.get(id)!;

    if (!sidecar.messagePort || sidecar.messagePort.destroyed || sidecar.state.status !== 'running') {
      throw new Error(`Sidecar ${id} not available`);
    }

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        sidecar.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      sidecar.pendingRequests.set(requestId, { resolve, reject, timeout: timeoutHandle });

      sidecar.messagePort.postMessage({
        ...message,
        requestId,
        timestamp: Date.now(),
      });
    });
  }

  broadcast(message: any): void {
    for (const [id, sidecar] of this.sidecars) {
      if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
        sidecar.messagePort.postMessage(message);
      }
    }
  }

  getState(id: string): SidecarState {
    return { ...this.sidecars.get(id)!.state };
  }

  getAllStates(): Map<string, SidecarState> {
    const states = new Map<string, SidecarState>();
    for (const [id, sidecar] of this.sidecars) {
      states.set(id, { ...sidecar.state });
    }
    return states;
  }

  isHealthy(id: string): boolean {
    const sidecar = this.sidecars.get(id)!;
    return sidecar.state.status === 'running' &&
           (Date.now() - sidecar.state.lastHeartbeat) < sidecar.config.healthCheckTimeout;
  }

  private emitStateChange(id: string): void {
    this.emit('stateChange', this.getState(id));
  }

  getSidecarIds(): string[] {
    return Array.from(this.sidecars.keys());
  }

  async shutdown(): Promise<void> {
    await this.stopAll();
    this.removeAllListeners();
  }
}

// Singleton
let sidecarManagerInstance: SidecarManager | null = null;

export function getSidecarManager(): SidecarManager {
  if (!sidecarManagerInstance) {
    sidecarManagerInstance = new SidecarManager();
  }
  return sidecarManagerInstance;
}

export function initializeSidecarManager(): SidecarManager {
  sidecarManagerInstance = new SidecarManager();
  return sidecarManagerInstance;
}

export function shutdownSidecarManager(): void {
  if (sidecarManagerInstance) {
    sidecarManagerInstance.shutdown().catch(console.error);
    sidecarManagerInstance = null;
  }
}