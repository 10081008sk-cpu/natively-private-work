/**
 * STT Error Handler & Supervisor
 * Monitors STT sidecar health, manages restarts, and provides UI state updates
 */

import { EventEmitter } from 'events';
import { utilityProcess, UtilityProcess, BrowserWindow } from 'electron';
import * as path from 'path';
import { STTSidecarWorker, SidecarConfig, STTToken, VADEvent, StatusEvent } from '../sidecar/STTSidecarWorker';

export interface SidecarState {
  channel: 'system' | 'mic';
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed' | 'restarting';
  pid?: number;
  restartCount: number;
  lastError?: string;
  lastHeartbeat: number;
  startTime?: number;
}

export interface STTSidecarOptions {
  channel: 'system' | 'mic';
  modelDir: string;
  enableVAD: boolean;
  enableHallucinationFilter: boolean;
  enableDirectML: boolean;
  maxRestarts: number;
  restartDelay: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
}

export interface STTSidecarStats {
  bufferUtilization: number;
  audioLevel: number;
  isRunning: boolean;
  speechDetected: boolean;
  uptime: number;
}

export class STTErrorHandler extends EventEmitter {
  private sidecars = new Map<string, {
    process: UtilityProcess | null;
    worker: any;
    state: SidecarState;
    options: STTSidecarOptions;
    heartbeatTimer: NodeJS.Timeout | null;
    restartTimer: NodeJS.Timeout | null;
    messagePort: any;
  }>();

  private channelStates = new Map<'system' | 'mic', SidecarState>();

  private maxRestarts = 3;
  private baseRestartDelay = 1000;
  private maxRestartDelay = 30000;
  private heartbeatInterval = 5000;
  private heartbeatTimeout = 15000;

  constructor() {
    super();
    this.initializeDefaultOptions();
  }

  private initializeDefaultOptions(): void {
    for (const channel of ['system', 'mic'] as const) {
      this.channelStates.set(channel, {
        channel,
        status: 'stopped',
        restartCount: 0,
        lastHeartbeat: 0,
        uptime: 0,
      });
      
      this.sidecars.set(channel, {
        process: null,
        worker: null,
        state: {
          channel,
          status: 'stopped',
          restartCount: 0,
          lastHeartbeat: 0,
        },
        options: {
          channel,
          modelDir: '',
          enableVAD: true,
          enableHallucinationFilter: true,
          enableDirectML: true,
          maxRestarts: this.maxRestarts,
          restartDelay: this.baseRestartDelay,
          heartbeatInterval: this.heartbeatInterval,
          heartbeatTimeout: this.heartbeatTimeout,
        },
        heartbeatTimer: null,
        restartTimer: null,
        messagePort: null,
      });
    }
  }

  async startSidecar(channel: 'system' | 'mic', options: Partial<STTSidecarOptions> = {}): Promise<void> {
    const sidecar = this.sidecars.get(channel);
    if (!sidecar) {
      throw new Error(`Invalid channel: ${channel}`);
    }

    if (sidecar.state.status === 'running' || sidecar.state.status === 'starting') {
      console.log(`[STTErrorHandler] Sidecar ${channel} already running`);
      return;
    }

    // Update options
    sidecar.options = { ...sidecar.options, ...options };

    if (!sidecar.options.modelDir) {
      throw new Error(`Model directory not configured for ${channel} sidecar`);
    }

    sidecar.state.status = 'starting';
    sidecar.state.startTime = Date.now();
    sidecar.state.restartCount = 0;
    this.emitStateChange(channel);

    try {
      // Try to fork as utilityProcess first
      await this.forkSidecarProcess(channel);
    } catch (error) {
      console.error(`[STTErrorHandler] Failed to fork ${channel} sidecar:`, error);
      sidecar.state.status = 'failed';
      sidecar.state.lastError = error instanceof Error ? error.message : String(error);
      this.emitStateChange(channel);
      throw error;
    }
  }

  private async forkSidecarProcess(channel: 'system' | 'mic'): Promise<void> {
    const sidecar = this.sidecars.get(channel)!;
    const workerPath = path.join(__dirname, '..', 'sidecar', 'STTSidecarWorker.js');

    return new Promise((resolve, reject) => {
      try {
        const childProcess = utilityProcess.fork(workerPath, [], {
          env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'production',
          },
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        });

        sidecar.process = childProcess;
        sidecar.state.pid = childProcess.pid;

        // Set up message port for direct communication
        const { port1, port2 } = new (require('electron').MessageChannelMain)();
        sidecar.messagePort = port1;

        // Send port2 to child process
        childProcess.postMessage({ type: 'port', port: port2 }, [port2]);

        // Send configuration
        childProcess.postMessage({
          type: 'config',
          config: {
            channel: sidecar.options.channel,
            modelDir: sidecar.options.modelDir,
            enableVAD: sidecar.options.enableVAD,
            enableHallucinationFilter: sidecar.options.enableHallucinationFilter,
            enableDirectML: sidecar.options.enableDirectML,
          },
        });

        // Handle messages from sidecar
        port1.on('message', (message: any) => {
          this.handleSidecarMessage(channel, message);
        });

        // Handle port close
        port1.on('close', () => {
          console.log(`[STTErrorHandler] MessagePort closed for ${channel}`);
        });

        // Handle process events
        childProcess.on('spawn', () => {
          console.log(`[STTErrorHandler] ${channel} sidecar spawned (PID: ${childProcess.pid})`);
        });

        childProcess.on('exit', (code, signal) => {
          console.log(`[STTErrorHandler] ${channel} sidecar exited: code=${code}, signal=${signal}`);
          this.handleSidecarExit(channel, code, signal);
        });

        childProcess.on('error', (error) => {
          console.error(`[STTErrorHandler] ${channel} sidecar error:`, error);
          this.handleSidecarError(channel, error);
        });

        // Wait for ready signal
        const readyTimeout = setTimeout(() => {
          reject(new Error(`Sidecar ${channel} failed to initialize within timeout`));
        }, 30000);

        port1.once('message', (message: any) => {
          if (message.type === 'ready') {
            clearTimeout(readyTimeout);
            sidecar.state.status = 'running';
            sidecar.state.lastHeartbeat = Date.now();
            this.startHeartbeat(channel);
            this.emitStateChange(channel);
            resolve();
          }
        });

        // Send initial config request
        port1.postMessage({ type: 'getConfig' });

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleSidecarMessage(channel: 'system' | 'mic', message: any): void {
    const sidecar = this.sidecars.get(channel)!;
    sidecar.state.lastHeartbeat = Date.now();

    switch (message.type) {
      case 'stt:token':
        this.emit('token', { ...message, channel });
        break;
      case 'vad:speech_start':
      case 'vad:speech_end':
        this.emit('vad', { ...message, channel });
        break;
      case 'stt:status':
        this.handleStatusUpdate(channel, message);
        break;
      case 'stats':
        this.emit('stats', { ...message.data, channel });
        break;
      case 'pong':
        // Heartbeat response
        break;
      case 'ready':
        console.log(`[STTErrorHandler] ${channel} sidecar ready`);
        break;
      case 'error':
        this.handleSidecarError(channel, new Error(message.error));
        break;
    }
  }

  private handleStatusUpdate(channel: 'system' | 'mic', status: StatusEvent): void {
    const sidecar = this.sidecars.get(channel)!;

    if (status.state === 'failed') {
      sidecar.state.status = 'failed';
      sidecar.state.lastError = status.error;
      this.emitStateChange(channel);
      this.scheduleRestart(channel);
    } else if (status.state === 'connected') {
      sidecar.state.status = 'running';
      sidecar.state.restartCount = 0; // Reset on successful connection
      this.emitStateChange(channel);
    } else if (status.state === 'reconnecting') {
      sidecar.state.status = 'restarting';
      this.emitStateChange(channel);
    }
  }

  private handleSidecarExit(channel: 'system' | 'mic', code: number, signal: string): void {
    const sidecar = this.sidecars.get(channel)!;
    sidecar.process = null;
    sidecar.state.pid = undefined;

    if (sidecar.state.status === 'stopping' || sidecar.state.status === 'stopped') {
      sidecar.state.status = 'stopped';
      this.emitStateChange(channel);
      return;
    }

    // Unexpected exit
    const errorMsg = `Process exited: code=${code}, signal=${signal}`;
    sidecar.state.lastError = errorMsg;
    sidecar.state.status = 'failed';

    console.error(`[STTErrorHandler] ${channel} sidecar crashed:`, errorMsg);
    this.emitStateChange(channel);

    // Check for segmentation fault (native crash)
    if (signal === 'SIGSEGV' || code === 139 || code === -11) {
      console.error(`[STTErrorHandler] ${channel} sidecar SEGFAULT detected!`);
      this.emit('segfault', { channel, code, signal });
    }

    this.scheduleRestart(channel);
  }

  private handleSidecarError(channel: 'system' | 'mic', error: Error): void {
    const sidecar = this.sidecars.get(channel)!;
    sidecar.state.lastError = error.message;
    console.error(`[STTErrorHandler] ${channel} sidecar error:`, error);
    this.emit('error', { channel, error });
  }

  private scheduleRestart(channel: 'system' | 'mic'): void {
    const sidecar = this.sidecars.get(channel)!;

    if (sidecar.state.restartCount >= sidecar.options.maxRestarts) {
      console.error(`[STTErrorHandler] ${channel} max restarts (${sidecar.options.maxRestarts}) exceeded`);
      sidecar.state.status = 'failed';
      sidecar.state.lastError = `Max restarts exceeded (${sidecar.options.maxRestarts})`;
      this.emitStateChange(channel);
      this.emit('max_restarts_exceeded', { channel });
      return;
    }

    if (sidecar.restartTimer) {
      clearTimeout(sidecar.restartTimer);
    }

    const delay = Math.min(
      sidecar.options.restartDelay * Math.pow(2, sidecar.state.restartCount),
      this.maxRestartDelay
    );

    console.log(`[STTErrorHandler] Scheduling ${channel} restart in ${delay}ms (attempt ${sidecar.state.restartCount + 1}/${sidecar.options.maxRestarts})`);

    sidecar.state.status = 'restarting';
    this.emitStateChange(channel);
    this.emit('restarting', { channel, attempt: sidecar.state.restartCount + 1 });

    sidecar.restartTimer = setTimeout(async () => {
      sidecar.state.restartCount++;
      try {
        await this.startSidecar(channel, {});
      } catch (error) {
        console.error(`[STTErrorHandler] ${channel} restart failed:`, error);
        this.scheduleRestart(channel);
      }
    }, delay);
  }

  private startHeartbeat(channel: 'system' | 'mic'): void {
    const sidecar = this.sidecars.get(channel)!;

    if (sidecar.heartbeatTimer) {
      clearInterval(sidecar.heartbeatTimer);
    }

    sidecar.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceHeartbeat = now - sidecar.state.lastHeartbeat;

      if (timeSinceHeartbeat > sidecar.options.heartbeatTimeout) {
        console.warn(`[STTErrorHandler] ${channel} heartbeat timeout (${timeSinceHeartbeat}ms)`);
        this.handleHeartbeatTimeout(channel);
      } else {
        // Send ping
        if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
          sidecar.messagePort.postMessage({ type: 'ping', timestamp: Date.now() });
        }
      }
    }, sidecar.options.heartbeatInterval);
  }

  private handleHeartbeatTimeout(channel: 'system' | 'mic'): void {
    console.error(`[STTErrorHandler] ${channel} heartbeat timeout - forcing restart`);
    this.forceRestart(channel);
  }

  private forceRestart(channel: 'system' | 'mic'): void {
    const sidecar = this.sidecars.get(channel)!;

    // Stop heartbeat
    if (sidecar.heartbeatTimer) {
      clearInterval(sidecar.heartbeatTimer);
      sidecar.heartbeatTimer = null;
    }

    // Kill process
    if (sidecar.process) {
      sidecar.process.kill('SIGKILL');
      sidecar.process = null;
    }

    // Close message port
    if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
      sidecar.messagePort.close();
      sidecar.messagePort = null;
    }

    sidecar.state.status = 'restarting';
    this.emitStateChange(channel);

    // Schedule restart
    this.scheduleRestart(channel);
  }

  async stopSidecar(channel: 'system' | 'mic'): Promise<void> {
    const sidecar = this.sidecars.get(channel)!;

    // Clear timers
    if (sidecar.heartbeatTimer) {
      clearInterval(sidecar.heartbeatTimer);
      sidecar.heartbeatTimer = null;
    }
    if (sidecar.restartTimer) {
      clearTimeout(sidecar.restartTimer);
      sidecar.restartTimer = null;
    }

    sidecar.state.status = 'stopping';
    this.emitStateChange(channel);

    // Close message port
    if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
      sidecar.messagePort.close();
      sidecar.messagePort = null;
    }

    // Kill process
    if (sidecar.process) {
      sidecar.process.kill('SIGTERM');
      sidecar.process = null;
    }

    sidecar.state.status = 'stopped';
    sidecar.state.pid = undefined;
    this.emitStateChange(channel);
  }

  async stopAll(): Promise<void> {
    await Promise.all([
      this.stopSidecar('system'),
      this.stopSidecar('mic'),
    ]);
  }

  // Public API

  async writeAudio(channel: 'system' | 'mic', audioData: ArrayBuffer | number[]): Promise<void> {
    const sidecar = this.sidecars.get(channel)!;
    if (sidecar.messagePort && !sidecar.messagePort.destroyed && sidecar.state.status === 'running') {
      sidecar.messagePort.postMessage({
        type: 'audio',
        data: audioData instanceof ArrayBuffer ? Array.from(new Uint8Array(audioData)) : audioData,
      });
    }
  }

  notifySpeechEnded(channel: 'system' | 'mic'): void {
    const sidecar = this.sidecars.get(channel)!;
    if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
      sidecar.messagePort.postMessage({ type: 'speechEnded' });
    }
  }

  setSampleRate(channel: 'system' | 'mic', rate: number): void {
    const sidecar = this.sidecars.get(channel)!;
    if (sidecar.messagePort && !sidecar.messagePort.destroyed) {
      sidecar.messagePort.postMessage({ type: 'setSampleRate', sampleRate: rate });
    }
  }

  async getStats(channel: 'system' | 'mic'): Promise<STTSidecarStats | null> {
    const sidecar = this.sidecars.get(channel)!;
    if (!sidecar.messagePort || sidecar.messagePort.destroyed) {
      return null;
    }

    // Request stats via message port
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 2000);

      const handler = (message: any) => {
        if (message.type === 'stats') {
          clearTimeout(timeout);
          sidecar.messagePort?.off('message', handler);
          resolve(message.data);
        }
      };

      sidecar.messagePort.on('message', handler);
      sidecar.messagePort.postMessage({ type: 'getStats' });
    });
  }

  getState(channel: 'system' | 'mic'): SidecarState {
    return { ...this.sidecars.get(channel)!.state };
  }

  getAllStates(): Map<'system' | 'mic', SidecarState> {
    const states = new Map<'system' | 'mic', SidecarState>();
    for (const [channel, sidecar] of this.sidecars) {
      states.set(channel, { ...sidecar.state });
    }
    return states;
  }

  isHealthy(channel: 'system' | 'mic'): boolean {
    const sidecar = this.sidecars.get(channel)!;
    return sidecar.state.status === 'running' &&
           (Date.now() - sidecar.state.lastHeartbeat) < sidecar.options.heartbeatTimeout;
  }

  private emitStateChange(channel: 'system' | 'mic'): void {
    this.emit('stateChange', this.getState(channel));
  }

  // Configuration
  setModelDir(channel: 'system' | 'mic', modelDir: string): void {
    this.sidecars.get(channel)!.options.modelDir = modelDir;
  }

  setDirectML(channel: 'system' | 'mic', enabled: boolean): void {
    this.sidecars.get(channel)!.options.enableDirectML = enabled;
  }

  setMaxRestarts(max: number): void {
    this.maxRestarts = max;
    for (const sidecar of this.sidecars.values()) {
      sidecar.options.maxRestarts = max;
    }
  }

  setRestartDelay(delay: number): void {
    this.baseRestartDelay = delay;
    for (const sidecar of this.sidecars.values()) {
      sidecar.options.restartDelay = delay;
    }
  }

  // Cleanup
  destroy(): void {
    for (const channel of ['system', 'mic'] as const) {
      this.stopSidecar(channel).catch(console.error);
    }
    this.removeAllListeners();
  }
}

// Singleton instance
let sttErrorHandlerInstance: STTErrorHandler | null = null;

export function getSTTErrorHandler(): STTErrorHandler {
  if (!sttErrorHandlerInstance) {
    sttErrorHandlerInstance = new STTErrorHandler();
  }
  return sttErrorHandlerInstance;
}

export function initializeSTTErrorHandler(): STTErrorHandler {
  sttErrorHandlerInstance = new STTErrorHandler();
  return sttErrorHandlerInstance;
}

export function shutdownSTTErrorHandler(): void {
  if (sttErrorHandlerInstance) {
    sttErrorHandlerInstance.destroy();
    sttErrorHandlerInstance = null;
  }
}