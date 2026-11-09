import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/** Resolve log path, preferring absolute E:\\Project\\logs\\app.log, fallback to userData */
function getLogPath(): string {
  const absolute = path.join('E:', 'Project', 'logs', 'app.log');
  try {
    fs.accessSync(path.dirname(absolute), fs.constants.W_OK);
    return absolute;
  } catch {
    const fallbackDir = path.join(app.getPath('userData'), 'logs');
    try { fs.mkdirSync(fallbackDir, { recursive: true }); } catch {}
    return path.join(fallbackDir, 'app.log');
  }
}

/** Ensure log directory exists */
export function ensureLogDirectory(): void {
  const logPath = getLogPath();
  const dir = path.dirname(logPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

/** Log a concise network (Axios) error without request config */
export function logNetworkError(error: any): void {
  const logPath = getLogPath();
  const timestamp = new Date().toLocaleString();
  let entry = `[${timestamp}] [NETWORK ERROR]`;
  const status = error?.response?.status;
  const statusText = error?.response?.statusText;
  const url = error?.config?.url;
  const data = error?.response?.data;
  const headers = error?.response?.headers || {};
  if (status) entry += ` Axios ${status} ${statusText || ''}`;
  entry += `\n- URL: ${url || 'unknown'}`;
  if (status) entry += `\n- Status Code: ${status}`;
  const limit = headers['x-ratelimit-limit-requests'];
  const remaining = headers['x-ratelimit-remaining-requests'];
  const reset = headers['x-ratelimit-reset-requests'];
  if (limit) entry += `\n- RateLimit-Limit: ${limit}`;
  if (remaining) entry += `\n- RateLimit-Remaining: ${remaining}`;
  if (reset) entry += `\n- RateLimit-Reset: ${reset}`;
  if (data) entry += `\n- Error Payload: ${JSON.stringify(data)}`;
  entry += '\n============================================================\n';
  try { fs.appendFileSync(logPath, entry, 'utf8'); } catch {}
}

/** Log generic system error */
export function logSystemError(message: string): void {
  const logPath = getLogPath();
  const entry = `[${new Date().toLocaleString()}] [SYSTEM ERROR] ${message}\n`;
  try { fs.appendFileSync(logPath, entry, 'utf8'); } catch {}
}

/** Optional UI event logger */
export function logUIEvent(event: string, payload?: string): void {
  const logPath = getLogPath();
  const entry = `[${new Date().toLocaleString()}] [UI EVENT] [${event}] ${payload ?? ''}\n`;
  try { fs.appendFileSync(logPath, entry, 'utf8'); } catch {}
}
