export interface ResourceSnapshot {
  cpuPercent: number;
  memoryMB: number;
  heapUsedMB: number;
  timestamp: number;
}

export class ResourceMonitor {
  private _interval: NodeJS.Timeout | null = null;
  private _onAlert: ((snapshot: ResourceSnapshot) => void) | null = null;
  private _cpuThreshold = 80;
  private _memoryThresholdMB = 500;
  private _lastAlertTime = 0;
  private _alertCooldownMs = 5000;

  set onAlert(cb: ((snapshot: ResourceSnapshot) => void) | null) {
    this._onAlert = cb;
  }

  setThresholds(cpu: number, memoryMB: number): void {
    this._cpuThreshold = cpu;
    this._memoryThresholdMB = memoryMB;
  }

  start(intervalMs = 2000): void {
    if (this._interval) return;
    this._interval = setInterval(() => {
      this._poll();
    }, intervalMs);
  }

  stop(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  private async _poll(): Promise<void> {
    const usage = process.cpuUsage();
    const mem = process.memoryUsage();
    const now = Date.now();

    const snapshot: ResourceSnapshot = {
      cpuPercent: Math.round((usage.user + usage.system) / 10000),
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      timestamp: now,
    };

    if (
      this._onAlert &&
      now - this._lastAlertTime > this._alertCooldownMs &&
      (snapshot.cpuPercent > this._cpuThreshold || snapshot.memoryMB > this._memoryThresholdMB)
    ) {
      this._lastAlertTime = now;
      this._onAlert(snapshot);
    }
  }
}
