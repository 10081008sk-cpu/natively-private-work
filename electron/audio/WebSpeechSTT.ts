import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

// Maps hidden-window webContents id → WebSpeechSTT instance so the global
// IPC handlers can route events to the correct instance (interviewer vs user).
const instancesByContentsId = new Map<number, WebSpeechSTT>();

export class WebSpeechSTT extends EventEmitter {
  private hiddenWindow: BrowserWindow | null = null;
  private _isActive = false;
  private label: string;
  private languageCode = 'en-US';
  private contentsId: number | null = null;
  private static ipcReady = false;

  constructor(label?: string) {
    super();
    this.label = label || 'default';
    if (!WebSpeechSTT.ipcReady) {
      WebSpeechSTT.ipcReady = true;
      WebSpeechSTT.registerGlobalIpcHandlers();
    }
  }

  private static registerGlobalIpcHandlers(): void {
    ipcMain.on('web-speech-transcript', (event, data: { text: string; isFinal: boolean; confidence: number }) => {
      const instance = instancesByContentsId.get(event.sender.id);
      if (instance) {
        instance.emit('transcript', { text: data.text, isFinal: data.isFinal, confidence: data.confidence ?? 0.5 });
      }
    });

    ipcMain.on('web-speech-error', (event, error: string) => {
      const instance = instancesByContentsId.get(event.sender.id);
      if (instance) {
        instance.emit('error', new Error(error));
      }
    });
  }

  start(): void {
    if (this._isActive) return;
    this._isActive = true;
    this.createHiddenWindow();
  }

  stop(): void {
    this._isActive = false;
    if (this.contentsId !== null) {
      instancesByContentsId.delete(this.contentsId);
      this.contentsId = null;
    }
    if (this.hiddenWindow && !this.hiddenWindow.isDestroyed()) {
      this.hiddenWindow.webContents.executeJavaScript('window.speechRecognition?.stop()').catch(() => {});
      this.hiddenWindow.close();
    }
    this.hiddenWindow = null;
  }

  write(_chunk: Buffer): void {
    // Web Speech API handles audio capture internally — no-op.
  }

  setRecognitionLanguage(lang: string): void {
    if (lang && lang !== 'auto') {
      this.languageCode = lang;
    }
  }

  setSampleRate(_rate: number): void {
    // Web Speech API handles resampling internally — no-op.
  }

  setCredentials(_path: string): void {
    // Web Speech API does not use credentials — no-op.
  }

  private createHiddenWindow(): void {
    const html = `<!DOCTYPE html>
<html>
<body>
<script>
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  window.speechAPI.sendError('SpeechRecognition API not available in this browser');
  return;
}
const recognition = new SpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = '${this.languageCode}';
recognition.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    window.speechAPI.sendTranscript({
      text: result[0].transcript,
      isFinal: result.isFinal,
      confidence: result[0].confidence,
    });
  }
};
recognition.onerror = (event) => {
  window.speechAPI.sendError(event.error);
};
recognition.onend = () => {
  if (window.speechRecognitionRunning) {
    recognition.start();
  }
};
recognition.start();
window.speechRecognition = recognition;
window.speechRecognitionRunning = true;
window.speechAPI.sendReady();
</script>
</body>
</html>`;

    this.hiddenWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '..', 'speechPreload.js'),
      },
    });

    this.hiddenWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    this.contentsId = this.hiddenWindow.webContents.id;
    instancesByContentsId.set(this.contentsId, this);

    this.hiddenWindow.on('closed', () => {
      if (this.contentsId !== null) {
        instancesByContentsId.delete(this.contentsId);
        this.contentsId = null;
      }
      this.hiddenWindow = null;
    });
  }
}
