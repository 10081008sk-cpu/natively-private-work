import { BrowserWindow, screen, app } from "electron"
import { WindowHelper } from "./WindowHelper"
import path from "node:path"

type WindowActivationOptions = { activate?: boolean };

const isDev = process.env.NODE_ENV === "development"

const startUrl = isDev
    ? "http://localhost:5180"
    : `file://${path.join(app.getAppPath(), "dist/index.html")}`


async function loadUrlWithRetry(
  win: BrowserWindow,
  url: string,
  tag: string,
  maxAttempts = 10,
  initialDelayMs = 500
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (win.isDestroyed()) return false;
      await win.loadURL(url);
      console.log(`[SettingsWindowHelper:${tag}] Successfully loaded ${url} on attempt ${attempt}`);
      return true;
    } catch (err: any) {
      const errorMessage = err.message || err;
      console.warn(`[SettingsWindowHelper:${tag}] Attempt ${attempt}/${maxAttempts} failed: ${errorMessage}`);
      
      const isTransientError = errorMessage.includes('ERR_FAILED') || 
                               errorMessage.includes('ERR_CONNECTION_REFUSED') ||
                               errorMessage.includes('ERR_CONNECTION_RESET') ||
                               errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
                               errorMessage.includes('ERR_INTERNET_DISCONNECTED');
      
      if (!isTransientError) {
        console.error(`[SettingsWindowHelper:${tag}] Non-transient error, stopping retries: ${errorMessage}`);
        return false;
      }
      
      if (attempt < maxAttempts) {
        const delay = 500 * Math.pow(1.5, attempt - 1);
        console.log(`[SettingsWindowHelper:${tag}] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[SettingsWindowHelper:${tag}] All 10 loadURL attempts exhausted for ${url}`);
  return false;
}

export class SettingsWindowHelper {
    private settingsWindow: BrowserWindow | null = null
    private windowHelper: WindowHelper | null = null;
    private contentProtection: boolean = false;

    private offsetX: number = 0
    private offsetY: number = 0

    private lastBlurTime: number = 0
    private ignoreBlur: boolean = false;

    constructor() { }

    public setIgnoreBlur(ignore: boolean): void {
        this.ignoreBlur = ignore;
    }

    public toggleWindow(x?: number, y?: number): void {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w !== this.settingsWindow);
        if (mainWindow && x !== undefined && y !== undefined) {
            const bounds = mainWindow.getBounds();
            this.offsetX = x - bounds.x;
            this.offsetY = y - (bounds.y + bounds.height);
        }

        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            if (!this.settingsWindow.isVisible() && (Date.now() - this.lastBlurTime < 250)) {
                return;
            }

            if (this.settingsWindow.isVisible()) {
                this.closeWindow();
            } else {
                this.showWindow(x, y)
            }
        } else {
            this.createWindow(x, y)
        }
    }

    public showWindow(x?: number, y?: number, options: WindowActivationOptions = {}): void {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
            this.createWindow(x, y)
            return
        }

        const activate = options.activate ?? true;

        const mainWin = this.windowHelper?.getMainWindow();
        if (mainWin && !mainWin.isDestroyed()) {
            this.settingsWindow.setParentWindow(mainWin);
        }

        if (x !== undefined && y !== undefined) {
            this.settingsWindow.setPosition(Math.round(x), Math.round(y))
        }

        this.ensureVisibleOnScreen();

        if (process.platform === 'win32' && this.contentProtection && !isDev) {
            this.settingsWindow.setContentProtection(true);
            if (activate) this.settingsWindow.show(); else this.settingsWindow.showInactive();
            if (activate) this.settingsWindow.focus();
        } else {
            if (!isDev && this.contentProtection) {
                this.settingsWindow.setContentProtection(this.contentProtection);
            }
            if (activate) this.settingsWindow.show(); else this.settingsWindow.showInactive();
            if (activate) this.settingsWindow.focus();
        }

        // Open DevTools in dev mode for diagnosing renderer/Vite issues
        if (isDev) {
            this.settingsWindow.webContents.openDevTools({ mode: 'detach' });
        }

        // Comprehensive renderer error listeners
        this.settingsWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
          console.error(`[SettingsWindowHelper] did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
        });

        this.settingsWindow.webContents.on('render-process-gone', (_event, details) => {
          console.error('[SettingsWindowHelper] Renderer crashed:', details.reason);
          const settingsWindow = this.settingsWindow;
          if (
            details.reason !== 'clean-exit' &&
            settingsWindow &&
            !settingsWindow.isDestroyed()
          ) {
            settingsWindow.reload();
          }
        });

        this.settingsWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
          console.log(`[Renderer Console:${level}] ${message} (${sourceId}:${line})`);
        });

        this.emitVisibilityChange(true);
    }

    public reposition(mainBounds: Electron.Rectangle): void {
        if (!this.settingsWindow || !this.settingsWindow.isVisible() || this.settingsWindow.isDestroyed()) return;

        const newX = mainBounds.x + this.offsetX;
        const newY = mainBounds.y + mainBounds.height + this.offsetY;

        this.settingsWindow.setPosition(Math.round(newX), Math.round(newY));
    }

    public closeWindow(): void {
        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            this.settingsWindow.hide()
            this.emitVisibilityChange(false);
        }
    }

    private emitVisibilityChange(isVisible: boolean): void {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w !== this.settingsWindow);
        if (mainWindow) {
            mainWindow.webContents.send('settings-visibility-changed', isVisible);
        }
    }

    private async createWindow(x?: number, y?: number, showWhenReady: boolean = true): Promise<void> {
        const isMac = process.platform === 'darwin';
        const windowSettings: Electron.BrowserWindowConstructorOptions = {
            width: 200,
            height: 238,
            frame: false,
            transparent: true,
            resizable: false,
            fullscreenable: false,
            hasShadow: false,
            alwaysOnTop: true,
            backgroundColor: "#00000000",
            show: false,
            skipTaskbar: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, "preload.js"),
                backgroundThrottling: false
            },
            ...(isMac ? { type: 'panel' as const } : {}),
        }

        if (x !== undefined && y !== undefined) {
            windowSettings.x = Math.round(x)
            windowSettings.y = Math.round(y)
        }

        this.settingsWindow = new BrowserWindow(windowSettings)

        if (process.platform === "darwin") {
            this.settingsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
            this.settingsWindow.setHiddenInMissionControl(true)
            this.settingsWindow.setAlwaysOnTop(true, "floating")
        }

        console.log(`[SettingsWindowHelper] Creating Settings Window with Content Protection: ${this.contentProtection}`);
        if (!isDev && this.contentProtection) {
            this.settingsWindow.setContentProtection(this.contentProtection);
        } else if (isDev) {
            console.log('[SettingsWindowHelper] Skipping content protection in dev mode');
        }

        const settingsUrl = isDev
            ? `${startUrl}?window=settings`
            : `${startUrl}?window=settings`

        // Handle ready-to-show - do NOT show yet, wait for did-finish-load
        this.settingsWindow.once('ready-to-show', () => {
            console.log('[SettingsWindowHelper] ready-to-show triggered');
            if (process.platform === 'darwin' && this.settingsWindow && !this.settingsWindow.isDestroyed()) {
                try {
                    const { loadNativeModule } = require('./audio/nativeModuleLoader');
                    const native = loadNativeModule();
                    if (native && typeof native.applyStealthToWindow === 'function') {
                        native.applyStealthToWindow(this.settingsWindow.getNativeWindowHandle());
                    }
                } catch (e) {
                    console.error('[SettingsWindowHelper] applyStealthToWindow failed:', e);
                }
            }
        });

        // Handle did-finish-load - only show after content is actually loaded
        this.settingsWindow.webContents.once('did-finish-load', () => {
          console.log('[SettingsWindowHelper] did-finish-load triggered, showing window');
          if (showWhenReady) {
            this.showWindow(this.settingsWindow?.getBounds().x || 0, this.settingsWindow?.getBounds().y || 0)
          }
        });

        // Handle renderer process crashes
        this.settingsWindow.webContents.on('render-process-gone', (_event, details) => {
          console.error('[SettingsWindowHelper] Renderer crashed:', details.reason);
          if (details.reason !== 'clean-exit') {
            this.settingsWindow.reload();
          }
        });

        // Execute resilient URL load with retry
        const loadSuccess = await loadUrlWithRetry(this.settingsWindow, settingsUrl, 'settings');
        if (!loadSuccess) {
          console.error('[SettingsWindowHelper] Failed to load URL after all retries');
        }
    }

    private ensureVisibleOnScreen() {
        if (!this.settingsWindow) return;
        const { x, y, width, height } = this.settingsWindow.getBounds();
        const display = screen.getDisplayNearestPoint({ x, y });
        const bounds = display.workArea;

        let newX = x;
        let newY = y;

        if (x + width > bounds.x + bounds.width) {
            newX = bounds.x + bounds.width - width;
        }
        if (y + height > bounds.y + bounds.height) {
            newY = bounds.y + bounds.height - height;
        }

        this.settingsWindow.setPosition(newX, newY);
    }

    public setContentProtection(enable: boolean): void {
        console.log(`[SettingsWindowHelper] Setting content protection to: ${enable}`);
        this.contentProtection = enable;

        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            this.settingsWindow.setContentProtection(enable);
        }
    }

    public setWindowHelper(wh: WindowHelper): void {
        this.windowHelper = wh;
    }

    public setWindowDimensions(width: number, height: number): void {
        const mainWindow = this.windowHelper?.getMainWindow();
        if (!mainWindow || mainWindow.isDestroyed()) return;

        const [currentX, currentY] = mainWindow.getPosition();
        const primaryDisplay = screen.getPrimaryDisplay();
        const workArea = primaryDisplay.workAreaSize;
        const maxAllowedWidth = Math.floor(workArea.width * 0.9);
        const newWidth = Math.min(width, maxAllowedWidth);
        const newHeight = Math.ceil(height);
        const maxX = workArea.width - newWidth;
        const newX = Math.min(Math.max(currentX, 0), maxX);

        mainWindow.setBounds({
            x: newX,
            y: currentY,
            width: newWidth,
            height: newHeight
        });
    }

    public preloadWindow(): void {
        if (!this.settingsWindow || this.settingsWindow.isDestroyed()) {
            this.createWindow(0, 0, false);
        }
    }

    public getSettingsWindow(): BrowserWindow | null {
        return this.settingsWindow;
    }
}