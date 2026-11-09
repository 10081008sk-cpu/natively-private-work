import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('speechAPI', {
  sendTranscript: (data: { text: string; isFinal: boolean; confidence: number }) =>
    ipcRenderer.send('web-speech-transcript', data),
  sendError: (error: string) =>
    ipcRenderer.send('web-speech-error', error),
  sendReady: () =>
    ipcRenderer.send('web-speech-ready'),
});
