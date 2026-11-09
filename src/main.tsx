// Mock Electron bridge when running in a standard web browser (e.g. localhost:5180)
if (typeof window !== 'undefined' && !(window as any).electronAPI) {
  (window as any).electronAPI = new Proxy({}, {
    get: (_target, prop) => {
      // Event listener subscriptions (e.g. onThemeChanged, onKeybindsUpdate): return an unsubscribe function
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return () => () => {};
      }
      // Method calls (e.g. showWindow, hideWindow, getKeybinds, getThemeMode)
      return (..._args: any[]) => {
        if (prop === 'getThemeMode') {
          return Promise.resolve({ resolved: 'dark' });
        }
        if (prop === 'platform') {
          return 'win32';
        }
        return Promise.resolve(null);
      };
    }
  });
}

import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import ErrorBoundary from "./components/ErrorBoundary"
import "./index.css"

const THEME_CACHE_KEY = 'natively_resolved_theme';

// Set platform attribute safely without triggering ReferenceError on undeclared process
document.documentElement.setAttribute(
  'data-platform',
  (window as any).electronAPI?.platform ?? 
  (typeof process !== 'undefined' ? process.platform : 'win32')
);

// Step 1: Apply cached theme synchronously — before React renders.
const cachedTheme = localStorage.getItem(THEME_CACHE_KEY) as 'light' | 'dark' | null;
document.documentElement.setAttribute('data-theme', cachedTheme ?? 'dark');

// Step 2: Confirm/correct from main process (authoritative) and keep cache in sync.
if ((window as any).electronAPI?.getThemeMode) {
  (window as any).electronAPI.getThemeMode().then(({ resolved }: any) => {
    if (resolved) {
      document.documentElement.setAttribute('data-theme', resolved);
      localStorage.setItem(THEME_CACHE_KEY, resolved);
    }
  }).catch(() => {});

  (window as any).electronAPI?.onThemeChanged?.(({ resolved }: any) => {
    if (resolved) {
      document.documentElement.setAttribute('data-theme', resolved);
      localStorage.setItem(THEME_CACHE_KEY, resolved);
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)