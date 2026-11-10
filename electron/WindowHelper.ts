import { BrowserWindow, screen, app, Menu } from "electron"
import { AppState } from "./main"
import { KeybindManager } from "./services/KeybindManager"
import path from "node:path"

const isEnvDev = process.env.NODE_ENV === "development"
const isPackaged = app.isPackaged;
const inAppBundle = process.execPath.includes('.app/') || process.execPath.includes('.app\\');

console.log(`[WindowHelper] isEnvDev: ${isEnvDev}, isPackaged: ${isPackaged}, inAppBundle: ${inAppBundle}`);

// Force production mode if running as packaged app or inside app bundle
const isDev = isEnvDev && !isPackaged;

const startUrl = isDev
  ? "http://localhost:5180"
  : `file://${path.join(__dirname, "../../dist/index.html")}`

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
      console.log(`[WindowHelper:${tag}] Successfully loaded ${url} on attempt ${attempt}`);
      return true;
    } catch (err: any) {
      const errorMessage = err.message || err;
      console.warn(`[WindowHelper:${tag}] Attempt ${attempt}/${maxAttempts} failed: ${errorMessage}`);
      
      // Check for specific error codes that indicate transient network issues
      const isTransientError = errorMessage.includes('ERR_FAILED') || 
                               errorMessage.includes('ERR_CONNECTION_REFUSED') ||
                               errorMessage.includes('ERR_CONNECTION_RESET') ||
                               errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
                               errorMessage.includes('ERR_INTERNET_DISCONNECTED');
      
      if (!isTransientError) {
        console.error(`[WindowHelper:${tag}] Non-transient error, stopping retries: ${errorMessage}`);
        return false;
      }
      
      if (attempt < maxAttempts) {
        const delay = initialDelayMs * Math.pow(1.5, attempt - 1);
        console.log(`[WindowHelper:${tag}] Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`[WindowHelper:${tag}] All ${maxAttempts} loadURL attempts exhausted for ${url}`);
  return false;
}

export class WindowHelper {
  private launcherWindow: BrowserWindow | null = null
  private overlayWindow: BrowserWindow | null = null
  private isWindowVisible: boolean = false
  // Position/Size tracking for Launcher
  private launcherPosition: { x: number; y: number } | null = null
  private launcherSize: { width: number; height: number } | null = null
  private overlayBounds: Electron.Rectangle | null = null
  // Track current window mode (persists even when overlay is hidden via Cmd+B)
  private currentWindowMode: 'launcher' | 'overlay' = 'launcher'

  private appState: AppState
  private contentProtection: boolean = false
  private opacityTimeout: NodeJS.Timeout | null = null

  // Constants
  private static readonly OVERLAY_DEFAULT_WIDTH = 600;
  private static readonly OVERLAY_MIN_HEIGHT = 216;
  private static readonly OVERLAY_DEFAULT_TOP_RATIO = 0.035;

  // Movement variables (apply to active window)
  private step: number = 20

  constructor(appState: AppState) {
    this.appState = appState
  }

  private getDisplayWorkArea(bounds?: Electron.Rectangle): Electron.Rectangle {
    if (bounds) {
      return screen.getDisplayMatching(bounds).workArea
    }
    if (this.overlayBounds) {
      return screen.getDisplayMatching(this.overlayBounds).workArea
    }
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return screen.getDisplayMatching(this.overlayWindow.getBounds()).workArea
    }
    return screen.getPrimaryDisplay().workArea
  }

  public setContentProtection(enable: boolean): void {
    this.contentProtection = enable
    this.applyContentProtection(enable)
  }

  private applyContentProtection(enable: boolean): void {
    const windows = [this.launcherWindow, this.overlayWindow]
    windows.forEach(win => {
      if (win && !win.isDestroyed()) {
        win.setContentProtection(enable);
      }
    });
  }

  public setWindowDimensions(width: number, height: number): void {
    const activeWindow = this.getMainWindow();
    if (!activeWindow || activeWindow.isDestroyed()) return

    const [currentX, currentY] = activeWindow.getPosition()
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    const maxAllowedWidth = Math.floor(workArea.width * 0.9)
    const newWidth = Math.min(width, maxAllowedWidth)
    const newHeight = Math.ceil(height)
    const maxX = workArea.width - newWidth
    const newX = Math.min(Math.max(currentX, 0), maxX)

    activeWindow.setBounds({
      x: newX,
      y: currentY,
      width: newWidth,
      height: newHeight
    })

    if (activeWindow === this.launcherWindow) {
      this.launcherSize = { width: newWidth, height: newHeight }
      this.launcherPosition = { x: newX, y: currentY }
    }
  }

  public setOverlayDimensions(width: number, height: number): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return
    console.log('[WindowHelper] setOverlayDimensions:', width, height);

    const currentBounds = this.overlayWindow.getBounds()
    const currentX = currentBounds.x
    const currentY = currentBounds.y
    const workArea = this.getDisplayWorkArea(currentBounds)
    const maxAllowedWidth = Math.floor(workArea.width * 0.9)
    const maxAllowedHeight = Math.floor(workArea.height * 0.9)
    const newWidth = Math.min(Math.max(width, 300), maxAllowedWidth)
    const newHeight = Math.min(Math.max(height, 1), maxAllowedHeight)
    const maxX = workArea.x + workArea.width - newWidth
    const maxY = workArea.y + workArea.height - newHeight
    const newX = Math.min(Math.max(currentX, workArea.x), maxX)
    const newY = Math.min(Math.max(currentY, workArea.y), maxY)

    this.overlayWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
    this.overlayBounds = this.overlayWindow.getBounds()
  }

  public setOverlayDimensionsCentered(width: number, height: number): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return

    const currentBounds = this.overlayWindow.getBounds()
    const currentContentSize = this.overlayWindow.getContentSize()
    const workArea = this.getDisplayWorkArea(currentBounds)
    const maxAllowedWidth = Math.floor(workArea.width * 0.9)
    const maxAllowedHeight = Math.floor(workArea.height * 0.9)
    const newWidth = Math.min(Math.max(width, 300), maxAllowedWidth)
    const newHeight = Math.min(Math.max(height, 1), maxAllowedHeight)

    const widthDelta = newWidth - currentContentSize[0]
    const desiredX = currentBounds.x - Math.floor(widthDelta / 2)

    const maxX = workArea.x + workArea.width - newWidth
    const newX = Math.min(Math.max(desiredX, workArea.x), maxX)
    const maxY = workArea.y + workArea.height - newHeight
    const newY = Math.min(Math.max(currentBounds.y, workArea.y), maxY)

    this.overlayWindow.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
    this.overlayBounds = this.overlayWindow.getBounds()
  }

  public async createWindow(): Promise<void> {
    if (this.launcherWindow !== null) return

    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workArea

    const width = 1200;
    const height = 800;

    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const topMargin = Math.round(workArea.height * 0.05);
    const y = Math.round(workArea.y + topMargin);

    const isMac = process.platform === "darwin";

    // --- 1. Launcher Window Configuration ---
    const launcherSettings: Electron.BrowserWindowConstructorOptions = {
      width: width,
      height: height,
      x: x,
      y: y,
      minWidth: 600,
      minHeight: 400,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        scrollBounce: true,
        webSecurity: !isDev,
        backgroundThrottling: false,
      },
      show: false,
      skipTaskbar: true,
      ...(isMac
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 14 } }
        : { frame: false, titleBarOverlay: false, autoHideMenuBar: true }),
      ...(isMac ? { vibrancy: 'under-window' as const, visualEffectState: 'followWindow' as const } : {}),
      transparent: isMac,
      hasShadow: true,
      backgroundColor: isMac ? "#00000000" : "#1E1E21",
      focusable: true,
      resizable: true,
      movable: true,
      center: true,
      icon: (() => {
        const isMacPlatform = process.platform === "darwin";
        const isWin = process.platform === "win32";
        const mode = this.appState.getDisguise();

        if (mode === 'none') {
          if (isMacPlatform) {
            return app.isPackaged
              ? path.join(process.resourcesPath, "natively.icns")
              : path.resolve(__dirname, "../../assets/natively.icns");
          } else if (isWin) {
            return app.isPackaged
              ? path.join(process.resourcesPath, "assets/icons/win/icon.ico")
              : path.resolve(__dirname, "../../assets/icons/win/icon.ico");
          } else {
            return app.isPackaged
              ? path.join(process.resourcesPath, "icon.png")
              : path.resolve(__dirname, "../../assets/icon.png");
          }
        }

        let iconName = "terminal.png";
        if (mode === 'settings') iconName = "settings.png";
        if (mode === 'activity') iconName = "activity.png";

        const platformDir = isWin ? "win" : "mac";
        return app.isPackaged
          ? path.join(process.resourcesPath, `assets/fakeicon/${platformDir}/${iconName}`)
          : path.resolve(__dirname, `../../assets/fakeicon/${platformDir}/${iconName}`);
      })()
    }

    console.log(`[WindowHelper] Icon Path: ${launcherSettings.icon}`);
    console.log(`[WindowHelper] Start URL: ${startUrl}`);

    try {
      this.launcherWindow = new BrowserWindow(launcherSettings);
      console.log('[WindowHelper] BrowserWindow created successfully');
    } catch (err) {
      console.error('[WindowHelper] Failed to create BrowserWindow:', err);
      return;
    }

    this.launcherWindow.setContentProtection(this.contentProtection);

    // Skip content protection in development mode to avoid black screen / GPU context issues
    if (isDev) {
      console.log('[WindowHelper:launcher] Skipping content protection in dev mode');
      this.launcherWindow.setContentProtection(false);
      // Open DevTools detached for diagnosing renderer/Vite issues
      this.launcherWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Comprehensive renderer error listeners
    this.launcherWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[WindowHelper:launcher] did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    });

    this.launcherWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[WindowHelper:launcher] Renderer process crashed/gone:', details.reason, details.exitCode);
      const launcherWindow = this.launcherWindow;
      if (details.reason !== 'clean-exit' && launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.reload();
      }
    });

    this.launcherWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[Renderer Console:${level}] ${message} (${sourceId}:${line})`);
    });

    // Register ready-to-show BEFORE loading URL
    this.launcherWindow.once('ready-to-show', () => {
      console.log('[WindowHelper:launcher] ready-to-show triggered');
      // Do NOT show yet - wait for did-finish-load or renderer:ready IPC
    });

    // Handle did-finish-load - only show after content is actually loaded
    this.launcherWindow.webContents.once('did-finish-load', () => {
      console.log('[WindowHelper:launcher] did-finish-load triggered, showing window');
      this.switchToLauncher();
      this.isWindowVisible = true;
    });

    // Execute resilient URL load with retry
    const loadSuccess = await loadUrlWithRetry(this.launcherWindow, `${startUrl}?window=launcher`, 'launcher', 10, 500);
    if (!loadSuccess) {
      console.error('[WindowHelper:launcher] Failed to load URL after all retries');
      // Show error page or fallback
    }

    // --- 2. Create Overlay Window (Hidden initially) ---
    const overlayDefaultX = Math.floor(workArea.x + (workArea.width - WindowHelper.OVERLAY_DEFAULT_WIDTH) / 2);
    const overlayDefaultY = Math.floor(workArea.y + workArea.height * WindowHelper.OVERLAY_DEFAULT_TOP_RATIO);

    const overlaySettings: Electron.BrowserWindowConstructorOptions = {
      width: WindowHelper.OVERLAY_DEFAULT_WIDTH,
      height: 1,
      x: overlayDefaultX,
      y: overlayDefaultY,
      minWidth: 300,
      minHeight: 1,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        scrollBounce: true,
        backgroundThrottling: false,
      },
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      alwaysOnTop: true,
      focusable: true,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      hasShadow: false,
      ...(isMac ? { type: 'panel' as const } : {}),
    }

    this.overlayWindow = new BrowserWindow(overlaySettings);
    // Skip content protection in development mode
    if (!isDev) {
      this.overlayWindow.setContentProtection(this.contentProtection);
    } else {
      console.log('[WindowHelper:overlay] Skipping content protection in dev mode');
    }
    // Open DevTools detached for diagnosing renderer/Vite issues
    if (isDev) {
      this.overlayWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Comprehensive renderer error listeners for overlay
    this.overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[WindowHelper:overlay] did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    });

    this.overlayWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[WindowHelper:overlay] Renderer process crashed/gone:', details.reason, details.exitCode);
      const overlayWindow = this.overlayWindow;
      if (details.reason !== 'clean-exit' && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.reload();
      }
    });

    this.overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[Renderer Console:${level}] ${message} (${sourceId}:${line})`);
    });

    if (process.platform === 'darwin') {
      try {
        const { StealthKeyboardManager } = require('./services/StealthKeyboardManager');
        StealthKeyboardManager.getInstance().setOverlayWindow(this.overlayWindow);
      } catch (e) {
        console.error('[WindowHelper] failed to register overlay with StealthKeyboardManager:', e);
      }
    }

    if (process.platform === "darwin") {
      this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      this.overlayWindow.setHiddenInMissionControl(true);
      this.overlayWindow.setAlwaysOnTop(true, "floating");

      this.overlayWindow.once('ready-to-show', () => {
        if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
        try {
          const { loadNativeModule } = require('./audio/nativeModuleLoader');
          const native = loadNativeModule();
          if (native && typeof native.applyStealthToWindow === 'function') {
            native.applyStealthToWindow(this.overlayWindow.getNativeWindowHandle());
            console.log('[WindowHelper] Applied stealth NSPanel attributes to overlay');
          } else {
            console.warn('[WindowHelper] applyStealthToWindow unavailable');
          }
        } catch (e) {
          console.error('[WindowHelper] Failed to apply stealth attributes:', e);
        }
      });
    } else if (process.platform === "win32") {
      this.overlayWindow.setAlwaysOnTop(true, "screen-saver");
    }

    this.overlayWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[WindowHelper:overlay] did-fail-load: code=${errorCode} desc=${errorDescription} url=${validatedURL}`);
    });

    // Handle overlay window ready-to-show and did-finish-load
    this.overlayWindow.once('ready-to-show', () => {
      console.log('[WindowHelper:overlay] ready-to-show triggered');
      // Do NOT show yet - wait for did-finish-load
    });

    this.overlayWindow.webContents.once('did-finish-load', () => {
      console.log('[WindowHelper:overlay] did-finish-load triggered');
      // Overlay is shown explicitly when needed, not on load
    });

    // Handle renderer process crashes for overlay
    this.overlayWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error('[WindowHelper:overlay] Renderer crashed:', details.reason);
      const overlayWindow = this.overlayWindow;
      if (details.reason !== 'clean-exit' && overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.reload();
      }
    });

    this.overlayWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[Renderer Console:${level}] ${message} (${sourceId}:${line})`);
    });

    // Load overlay with retry
    await loadUrlWithRetry(this.overlayWindow, `${startUrl}?window=overlay`, 'overlay', 10, 500);

    this.setupWindowListeners();
  }

  private setupWindowListeners(): void {
    if (!this.launcherWindow) return

    this.launcherWindow.on('system-context-menu', (e, point) => {
      e.preventDefault();
      if (!this.appState.getUndetectable()) {
        this.showContextMenu(this.launcherWindow!, point);
      }
    });

    this.launcherWindow.on("move", () => {
      if (this.launcherWindow) {
        const bounds = this.launcherWindow.getBounds()
        this.launcherPosition = { x: bounds.x, y: bounds.y }
        this.appState.settingsWindowHelper.reposition(bounds)
      }
    })

    this.launcherWindow.on("resize", () => {
      if (this.launcherWindow) {
        const bounds = this.launcherWindow.getBounds()
        this.launcherSize = { width: bounds.width, height: bounds.height }
        this.appState.settingsWindowHelper.reposition(bounds)
      }
    })

    if (process.platform !== 'darwin') {
      this.launcherWindow.on('close', (e) => {
        if (!this.appState.isQuitting()) {
          e.preventDefault();
          this.launcherWindow?.hide();
          this.isWindowVisible = false;
        }
      });

      this.launcherWindow.on('maximize', () => {
        this.launcherWindow?.webContents.send('window-maximized-changed', true);
      });
      this.launcherWindow.on('unmaximize', () => {
        this.launcherWindow?.webContents.send('window-maximized-changed', false);
      });
    }

    this.launcherWindow.on("closed", () => {
      this.launcherWindow = null
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.close()
      }
      this.overlayWindow = null
      this.isWindowVisible = false
    })

    if (this.overlayWindow) {
      this.overlayWindow.on("move", () => {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          this.overlayBounds = this.overlayWindow.getBounds()
        }
      })

      this.overlayWindow.on("resize", () => {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          this.overlayBounds = this.overlayWindow.getBounds()
        }
      })

      this.overlayWindow.on('system-context-menu', (e, point) => {
        e.preventDefault();
        if (!this.appState.getUndetectable()) {
          this.showContextMenu(this.overlayWindow!, point);
        }
      });

      if (process.platform === 'win32') {
        this.overlayWindow.on('blur', () => {
          if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;
          if (!this.overlayWindow.isVisible()) return;
          this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        });
      }

      this.overlayWindow.on('close', (e) => {
        if (this.overlayWindow?.isVisible()) {
          e.preventDefault();
          if (this.appState.getIsMeetingActive()) {
            this.hideOverlay();
          } else {
            this.switchToLauncher();
          }
        }
      })
    }
  }

  public getMainWindow(): BrowserWindow | null {
    if (this.currentWindowMode === 'overlay' && this.overlayWindow) {
      return this.overlayWindow;
    }
    return this.launcherWindow;
  }

  public getLauncherWindow(): BrowserWindow | null { return this.launcherWindow }
  public getOverlayWindow(): BrowserWindow | null { return this.overlayWindow }
  public getCurrentWindowMode(): 'launcher' | 'overlay' { return this.currentWindowMode }

  public resetOverlayPosition(): void {
    this.overlayBounds = null;
    console.log('[WindowHelper] Overlay position reset to default for next meeting.');
  }

  public getLastOverlayBounds(): Electron.Rectangle | null {
    if (this.overlayBounds) return { ...this.overlayBounds };
    return null;
  }

  public getLastOverlayDisplayId(): number | null {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return null;
    const bounds = this.overlayWindow.getBounds();
    return screen.getDisplayMatching(bounds).id;
  }

  public isVisible(): boolean {
    return this.isWindowVisible
  }

  public isMainWindowMaximized(): boolean {
    const win = this.launcherWindow;
    return !!win && !win.isDestroyed() && win.isMaximized();
  }

  public hideMainWindow(): void {
    this.launcherWindow?.setOpacity(0);
    this.overlayWindow?.setOpacity(0);
    this.launcherWindow?.hide()
    this.overlayWindow?.hide()
    this.isWindowVisible = false
  }

  public syncOverlayInteractionPolicy(): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    const passthrough = this.appState.getOverlayMousePassthrough();
    if (passthrough) {
      this.overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      console.log('[WindowHelper] Overlay mouse passthrough ON');
    } else {
      this.overlayWindow.setIgnoreMouseEvents(false);
      this.overlayWindow.setFocusable(true);
      console.log('[WindowHelper] Overlay mouse passthrough OFF');
    }
  }

  public showOverlay(): void {
    if (!this.overlayWindow || this.overlayWindow.isDestroyed()) return;

    this.overlayWindow.setOpacity(1);

    if (process.platform === 'win32') {
      this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    if (this.appState.getOverlayMousePassthrough()) {
      this.overlayWindow.showInactive();
    } else {
      this.overlayWindow.showInactive();
      this.overlayWindow.focus();
    }
  }

  public hideOverlay(): void {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  public showMainWindow(inactive?: boolean): void {
    if (this.currentWindowMode === 'overlay') {
      this.switchToOverlay(inactive);
    } else {
      this.switchToLauncher(inactive);
    }
  }

  public toggleMainWindow(): void {
    if (this.isWindowVisible) {
      this.hideMainWindow()
    } else {
      this.showMainWindow(true)
    }
  }

  public toggleOverlayWindow(): void {
    this.toggleMainWindow();
  }

  public centerAndShowWindow(): void {
    if (this.currentWindowMode === 'overlay') {
      this.switchToOverlay();
    } else {
      this.switchToLauncher();
      this.launcherWindow?.center();
    }
  }

  public switchToOverlay(inactive?: boolean): void {
    console.log(`[WindowHelper] Switching to OVERLAY (inactive: ${!!inactive})`);
    this.currentWindowMode = 'overlay';
    KeybindManager.getInstance().setMode('overlay');

    this.overlayWindow?.webContents.send('ensure-expanded');

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      const currentBounds = this.overlayWindow.getBounds();
      const savedBounds = this.overlayBounds
        ? {
            ...this.overlayBounds,
            height: Math.max(this.overlayBounds.height, WindowHelper.OVERLAY_MIN_HEIGHT)
          }
        : null;
      const workArea = this.getDisplayWorkArea(savedBounds ?? currentBounds);
      const maxAllowedWidth = Math.floor(workArea.width * 0.9);
      const maxAllowedHeight = Math.floor(workArea.height * 0.9);
      const targetBounds = savedBounds
        ? {
            x: Math.min(Math.max(savedBounds.x, workArea.x), workArea.x + workArea.width - Math.min(savedBounds.width, maxAllowedWidth)),
            y: Math.min(Math.max(savedBounds.y, workArea.y), workArea.y + workArea.height - Math.min(savedBounds.height, maxAllowedHeight)),
            width: Math.min(savedBounds.width, maxAllowedWidth),
            height: Math.min(savedBounds.height, maxAllowedHeight)
          }
        : {
            x: Math.floor(workArea.x + (workArea.width - WindowHelper.OVERLAY_DEFAULT_WIDTH) / 2),
            y: Math.floor(workArea.y + workArea.height * WindowHelper.OVERLAY_DEFAULT_TOP_RATIO),
            width: WindowHelper.OVERLAY_DEFAULT_WIDTH,
            height: Math.max(Math.min(currentBounds.height, maxAllowedHeight), WindowHelper.OVERLAY_MIN_HEIGHT)
          };

      this.overlayWindow.setBounds(targetBounds);
      this.overlayBounds = this.overlayWindow.getBounds();

      if (process.platform === 'win32' && this.contentProtection) {
        this.overlayWindow.setOpacity(0);
        if (inactive) this.overlayWindow.showInactive(); else this.overlayWindow.show();
        this.overlayWindow.setContentProtection(true);

        if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
        this.opacityTimeout = setTimeout(() => {
          if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
            this.overlayWindow.setOpacity(1);
            this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
            if (!inactive) this.overlayWindow.focus();
          }
        }, 60);
      } else {
        this.overlayWindow.setOpacity(1);
        this.overlayWindow.setContentProtection(this.contentProtection);
        if (process.platform === 'win32') {
          this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
        }
        if (inactive) this.overlayWindow.showInactive(); else this.overlayWindow.show();
        if (!inactive) this.overlayWindow.focus();
      }
      this.isWindowVisible = true;
    }

    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide();
    }
  }

  public switchToLauncher(inactive?: boolean): void {
    console.log(`[WindowHelper] Switching to LAUNCHER (inactive: ${!!inactive})`);
    this.currentWindowMode = 'launcher';
    KeybindManager.getInstance().setMode('launcher');

    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      if (process.platform === 'win32' && this.contentProtection) {
        this.launcherWindow.setOpacity(0);
        if (inactive) this.launcherWindow.showInactive(); else this.launcherWindow.show();
        this.launcherWindow.setContentProtection(true);

        if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
        this.opacityTimeout = setTimeout(() => {
          if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
            this.launcherWindow.setOpacity(1);
            if (!inactive) this.launcherWindow.focus();
          }
        }, 60);
      } else {
        this.launcherWindow.setOpacity(1);
    // Skip content protection in development mode to avoid black screen / GPU context issues
    if (!isDev) {
      this.launcherWindow.setContentProtection(this.contentProtection);
    } else {
      console.log('[WindowHelper:launcher] Skipping content protection in dev mode');
    }
    // Open DevTools detached for diagnosing renderer/Vite issues
    if (isDev) {
      this.launcherWindow.webContents.openDevTools({ mode: 'detach' });
    }
        if (inactive) this.launcherWindow.showInactive(); else this.launcherWindow.show();
        if (!inactive) this.launcherWindow.focus();
      }
      this.isWindowVisible = true;
    }

    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.hide();
    }
  }

  public setWindowMode(mode: 'launcher' | 'overlay', inactive?: boolean): void {
    if (mode === 'launcher') {
      this.switchToLauncher(inactive);
    } else {
      this.switchToOverlay(inactive);
    }
  }

  private moveActiveWindow(dx: number, dy: number): void {
    const win = this.getMainWindow();
    if (!win) return;

    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  }

  public moveWindowRight(): void { this.moveActiveWindow(this.step, 0) }
  public moveWindowLeft(): void { this.moveActiveWindow(-this.step, 0) }
  public moveWindowDown(): void { this.moveActiveWindow(0, this.step) }
  public moveWindowUp(): void { this.moveActiveWindow(0, -this.step) }

  private showContextMenu(win: BrowserWindow, point: { x: number; y: number }): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Developer Console',
        click: () => { win.webContents.toggleDevTools(); }
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { type: 'separator' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: win, x: point.x, y: point.y });
  }

  public minimizeWindow(): void {
    const win = this.launcherWindow;
    if (!win || win.isDestroyed()) return;
    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    win.minimize();
  }

  public maximizeWindow(): void {
    const win = this.launcherWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }

  public closeWindow(): void {
    const win = this.launcherWindow;
    if (!win || win.isDestroyed()) return;
    if (this.opacityTimeout) clearTimeout(this.opacityTimeout);
    win.close();
  }
}