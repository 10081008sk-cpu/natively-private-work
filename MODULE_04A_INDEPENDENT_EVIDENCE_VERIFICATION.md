# MODULE 04A — INDEPENDENT EVIDENCE VERIFICATION

**Subject:** `MODULE_04_WINDOW_SHORTCUT_SESSION_AUDIT.md`
**Method:** independent, read-only re-inspection of the current working tree.
**Date:** 2026-11-12
**Constraint compliance:** no source, configuration, package, setting or existing report was modified; no repair was implemented; no application was launched. This report is the only new file.

### Evidence tags

| Tag | Meaning |
|---|---|
| **[S]** | Directly read in the current source file at the cited line. |
| **[S-C]** | Deterministic consequence of the cited source; not observed at runtime. |
| **[NV]** | Cannot be settled statically (OS behaviour, real key delivery, focus, timing). |
| **[R]** | Runtime observation. **No runtime observation was produced for this report.** |

Where Module 04 and this report disagree, this report states the correction explicitly in section F.

---

## A. Source snapshot identification

### A.1 Project and toolchain

| Item | Value | Evidence |
|---|---|---|
| Actual project root | `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main` (POSIX in Git Bash: `/e/Project/natively-cluely-ai-assistant-main/natively-cluely-ai-assistant-main`) | `pwd` |
| Package name | `natively` | `package.json` |
| Application version | **2.6.0** | `package.json` `version` |
| Electron | **^45.2.3** | `package.json` dependencies |
| React | **^19.2.6** | `package.json` dependencies |
| TypeScript | **^5.6.3** | `package.json` devDependencies |
| Vite | ^5.4.21 | `package.json` devDependencies |
| electron-builder | ^25.1.0 | `package.json` devDependencies |
| Git repository | **None.** `git rev-parse --is-inside-work-tree` returns `fatal: not a git repository (or any of the parent directories): .git` | terminal output |
| Git branch / commit | **Not available**; not invented | terminal output |
| Working tree dirty | **Not applicable** — no Git metadata exists | terminal output |

### A.2 SHA-256 of the nine requested files

Computed with `sha256sum` in the project root. `*` is the binary-mode marker printed by Git Bash; it is not part of the digest.

| File | SHA-256 |
|---|---|
| `electron/main.ts` | `c3464d94f08ddb733a19d178ba47cb91600896055c94e00ade1c28dc28d99de8` |
| `electron/WindowHelper.ts` | `c115c23694071ef9f0447bba68904b84204e6529d73536df2ff7d5d091ac1356` |
| `electron/services/KeybindManager.ts` | `f193ff2a7f254145c99171130ec25179a09467a21e32ab2f4208ebcb2297be5b` |
| `electron/preload.ts` | `e77b2422daa87ece21c825ba5f98d7fe0e7f2f88988e9076900fb14d20fd7d3a` |
| `electron/ipcHandlers.ts` | `260cb234a9747d2f53d09827c11c87b67fb0f60df0b1fbb9042e64f478cdec17` |
| `src/App.tsx` | `1147a75578762a672a0d2e655f020d51fd92b156227fd0acd158cd37b87db3df` |
| `src/components/Launcher.tsx` | `50cf2c6a766901c0719f8390a455ce4058a84693d8fb60149841369384d15147` |
| `src/components/NativelyInterface.tsx` | `6284922a9d2ecb9d2dfd7c11cf8994b28129f343434528098ea5e375e4d8450c` |
| `src/components/ui/TopPill.tsx` | `aba3efbe5a6d85f762b6e781dd99bbe5f64918387cf923b4c7ab49ad32a99ea5` |

---

## B. Verification table for all 15 findings

| # | Finding as stated in Module 04 | Verdict | Core evidence |
|---|---|---|---|
| 1 | Start Natively leaves the launcher visible and the overlay hidden | **CONFIRMED** | `main.ts:2828–2840`; `App.tsx:400–409` |
| 2 | Ctrl+B is not globally registered before a session | **CONFIRMED** | `KeybindManager.ts:101`, `:277–288` |
| 3 | Idle launcher can hide both windows and lose the Ctrl+B path | **CONFIRMED (Windows) / PARTIALLY (macOS)** | `Launcher.tsx:219–221`; `main.ts:3571–3583`; `WindowHelper.ts:603–609, 676–682` |
| 4 | Ctrl+B on the visible overlay hides it **and** shows the launcher | **CONFIRMED** | `main.ts:3638–3646`; `WindowHelper.ts:788–824` |
| 5 | Ctrl+B on the launcher during a session reveals the overlay | **CONFIRMED** | `main.ts:3648–3650`; `WindowHelper.ts:697–700, 782–785` |
| 6 | Multiple Ctrl+B owners exist | **CONFIRMED (owners) / [NV] (both firing)** | `KeybindManager.ts:286–288, 425–431`; `Launcher.tsx:219–221`; `NativelyInterface.tsx:1191` |
| 7 | Overlay renderer chord sends `toggle-expand`, not hide | **CONFIRMED** | `NativelyInterface.tsx:1191`; `main.ts:3584–3592`; `NativelyInterface.tsx:972` |
| 8 | Ctrl+1 can fire while the overlay is hidden by the Hide chip | **CONFIRMED (static)** | `KeybindManager.ts:102`; `main.ts:589–595`; `NativelyInterface.tsx:691–711, 759–764` |
| 9 | Ctrl+1 does nothing while the launcher is current | **CONFIRMED** | `KeybindManager.ts:102–118`; `Launcher.tsx:218–234` |
| 10 | Meeting Ongoing restores the same overlay without restart | **CONFIRMED (normal path)** | `Launcher.tsx:768–779`; `ipcHandlers.ts:197–200`; `WindowHelper.ts:697–756` |
| 11 | Home/logo preserves the session and audio/STT | **CONFIRMED** | `TopPill.tsx:36`; `NativelyInterface.tsx:1399`; `WindowHelper.ts:788–824` |
| 12 | Stop ends the session and cleans up overlay + audio/STT | **CONFIRMED** | `App.tsx:419–448, 495`; `main.ts:2951–3128` |
| 13 | The launcher discards the stopping state | **CONFIRMED** | `main.ts:717–723`; `preload.ts:604–608`; `Launcher.tsx:192–194` |
| 14 | Existing diagnostics are sufficient to show audio/STT status | **PARTIALLY CONFIRMED** | `main.ts:734–750`; `ipcHandlers.ts:316–325`; `preload.ts:841–844` |
| 15 | Overlay window is created and React is mounted at launch | **CONFIRMED (creation + mount); timing caveat** | `main.ts:4520–4530`; `WindowHelper.ts:327, 340, 386, 422`; `App.tsx:482–500`; `main.tsx:64–70` |

---

## C. Evidence for each finding

### C.1 Start leaves the launcher visible and the overlay hidden — CONFIRMED

`electron/main.ts` `AppState.startMeeting` `:2753` (window block `:2822–2841`):

```ts
    // Reset overlay position BEFORE the switch so the new meeting starts in
    // a predictable centered position regardless of where the previous
    // session left it. ...
    this.windowHelper.resetOverlayPosition();

    // ─── START IN THE BACKGROUND (requirement 2) ──────────────────────────
    // Start Natively must NOT reveal the assistant overlay. The launcher stays
    // visible with "Meeting ongoing"; Ctrl+B is what reveals the assistant.
    // The overlay window is prepared hidden so the first Ctrl+B is instant.
    this.windowHelper.switchToLauncher(false);
    void this.windowHelper.ensureOverlayWindow().catch((err: unknown) => {
      console.error('[Main] Failed to prepare the assistant overlay:', err);
    });
    KeybindManager.getInstance().setSessionActive(true);

    this.isMeetingActive = true;
    this._sessionState = 'active';
    this.broadcastMeetingState()
```

`src/App.tsx` `handleStartMeeting` `:381–416` returns without any window request:

```ts
      const result = await window.electronAPI.startMeeting({...});
      if (result.success) {
        analytics.trackMeetingStarted();
        // Window swap happens inside main's startMeeting() now (before the
        // meeting-state broadcast) to avoid a blue→green CTA flash on the
        // launcher. No follow-up setWindowMode IPC needed here.
      }
```

**Chain:** `Launcher` CTA `:777` → `App.handleStartMeeting` `:381` → `preload.startMeeting` `:878` → `ipc 'start-meeting'` `ipcHandlers.ts:2706` → `AppState.startMeeting` `:2753` → `switchToLauncher(false)` `:2832` → `ensureOverlayWindow()` `:2833` → `setSessionActive(true)` `:2836` → `isMeetingActive=true` `:2838`. No `switchToOverlay` occurs (`switchToOverlay` call sites in `main.ts` are `:478`, `:3628`, `:3649`, `:3728` only).

**Counter-evidence checked:** calendar start (`main.ts:4654–4661`) calls `centerAndShowWindow()` first, but the current mode there is launcher and `startMeeting` still ends with `switchToLauncher(false)`. No subscription in `App.tsx` or `Launcher.tsx` calls `setWindowMode` on `meeting-state-changed`. The only `setWindowMode` in `Launcher.tsx` is the Meeting Ongoing CTA `:774`.

---

### C.2 Ctrl+B is not globally registered before a session — CONFIRMED

`electron/services/KeybindManager.ts` `shouldRegister` `:99–118`:

```ts
    private shouldRegister(actionId: string): boolean {
        // The assistant overlay toggle is bound only during an active session.
        if (actionId === 'general:toggle-visibility') return this.sessionActive;
        if (this.activeMode === 'overlay') return true;

        // In launcher mode, register visibility + movement shortcuts
        if (actionId === 'general:toggle-visibility') return true;
        ...
        return false;
    }
```

Because line `:101` returns for that id unconditionally, the later `return true` at `:105` is unreachable. `sessionActive` starts `false` (`:69`) and is set only from `startMeeting` `:2836`, `endMeeting` `:2992`, `forceEndMeeting` `:3176`.

`registerGlobalShortcuts` `:277–319` skips anything for which `shouldRegister` is false (`:282`), after `globalShortcut.unregisterAll()` (`:278`). `revalidateShortcuts` `:321–356` uses the same gate.

**Separate non-global paths that can still act on the chord before a session:**

- macOS application menu: `updateMenu` `:375`, `Toggle Visibility` item `:425–431` with `accelerator: toggleAccelerator || undefined` (default `CommandOrControl+B`, `:15`) → `AppState.getInstance().toggleMainWindow()`.
- Tray menu item `Toggle Window (…)` `main.ts:3974–3978` (click, not a chord).
- Focused launcher DOM keydown `Launcher.tsx:219–221`.

So "not globally registered" is **CONFIRMED**; "Ctrl+B has no path at all" would be **INCORRECT** on macOS.

---

### C.3 Idle launcher hides both windows; the chord path is lost — CONFIRMED (Windows), PARTIALLY (macOS)

`src/components/Launcher.tsx` keydown `:217–240`:

```ts
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isShortcutPressed(e, 'toggleVisibility')) {
                e.preventDefault();
                window.electronAPI.toggleWindow();
            } else if ...
```

`electron/ipcHandlers.ts:290–292` → `AppState.toggleMainWindow` `main.ts:3571–3583`:

```ts
    const mode = this.windowHelper.getCurrentWindowMode();
    if (mode === 'launcher') {
      // In launcher mode, just physically hide/show the window
      this.windowHelper.toggleMainWindow();
    } else { ... }
```

`WindowHelper.toggleMainWindow` `:676–682` and `hideMainWindow` `:603–609`:

```ts
  public hideMainWindow(): void {
    this.launcherWindow?.setOpacity(0);
    this.overlayWindow?.setOpacity(0);
    this.launcherWindow?.hide()
    this.overlayWindow?.hide()
    this.isWindowVisible = false
  }
```

Result: launcher hidden, overlay hidden (opacity 0), `isWindowVisible=false`, mode `launcher`, `sessionActive=false`. No global shortcut exists for the chord (C.2), and a hidden window cannot receive DOM `keydown`.

**Recovery paths that Module 04 mentioned incompletely:**

| Path | Evidence | Condition |
|---|---|---|
| Tray → `Show Natively` | `main.ts:3967–3973`; tray created only when `!getUndetectable()` `:4539–4542` | Hidden in stealth/undetectable mode |
| Dock `activate` | `main.ts:4692–4708` → `toggleMainWindow()` | macOS; dock hidden in stealth (`:4446–4448`) |
| Second launch | `main.ts:4432–4438` → `centerAndShowWindow()` | Single-instance lock `:4417–4427` |
| macOS menu accelerator | `KeybindManager.ts:425–431` | Only while the app is still the active application **[NV]** |

So the *chord* is lost (confirmed); the *window* is not necessarily unrecoverable. On Windows there is no menu accelerator and no dock, leaving only tray (if not stealth) or relaunch.

---

### C.4 Ctrl+B on the overlay hides it and shows the launcher — CONFIRMED

`main.ts` `toggleAssistantOverlay` `:3638–3647`:

```ts
    if (overlay.isVisible()) {
      console.log(`${tag} toggleAssistantOverlay: overlay visible — hiding + returning to launcher (inactive)`)
      ...
      this.windowHelper.hideOverlay(cid);
      ...
      // Never strand the user on an empty desktop: bring the launcher back
      // while the session (and audio capture) keeps running.
      console.log(`${tag} toggleAssistantOverlay: switching launcher back (inactive=true)`)
      this.windowHelper.switchToLauncher(true);
    } else {
      ...
      this.windowHelper.switchToOverlay(cid);
    }
```

`WindowHelper.switchToLauncher` `:788–824` shows the launcher (`:815`), focuses it unless inactive (`:816`), sets `isWindowVisible=true` (`:818`) and hides the overlay (`:822`).

The stated intent ("never strand the user") is a deliberate design choice, not an accident; it is nevertheless incompatible with the approved "visibility only" rule.

---

### C.5 Ctrl+B on the launcher during a session reveals the overlay — CONFIRMED

Same function, hidden branch `main.ts:3648–3650`. `switchToOverlay` `:697–700` sets mode and re-registers shortcuts before doing anything else:

```ts
  public switchToOverlay(inactive?: boolean): void {
    console.log(`[WindowHelper] Switching to OVERLAY (inactive: ${!!inactive})`);
    this.currentWindowMode = 'overlay';
    KeybindManager.getInstance().setMode('overlay');
    this.overlayWindow?.webContents.send('ensure-expanded');
```

and hides the launcher at `:782–785`:

```ts
    } else {
      console.log(`[WindowHelper cid=${this._toggleOpCid}] switchToOverlay: no usable overlay — cannot show`);
    }
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide();
    }
```

When the launcher is visible during a session, `overlay.isVisible()` is false, so this branch always runs: launcher hidden, overlay shown. **CONFIRMED.**

---

### C.6 Multiple Ctrl+B owners — CONFIRMED (owners); simultaneous firing NOT VERIFIED

| # | Owner | Evidence | Action |
|---|---|---|---|
| 1 | OS global shortcut | `KeybindManager.ts:286–288` | `AppState.toggleAssistantOverlay()` `main.ts:485` |
| 2 | macOS application menu | `KeybindManager.ts:425–431` | `AppState.toggleMainWindow()` |
| 3 | Launcher renderer | `Launcher.tsx:219–221` | `toggle-window` IPC |
| 4 | Overlay renderer | `NativelyInterface.tsx:1191` | `toggle-window` IPC |
| 5 | Tray menu (click) | `main.ts:3974–3978` | `toggleMainWindow()` |

Owners 1–4 can all be reachable for the same chord in different focus states. Whether the OS accelerator and the DOM handler both receive the **same physical keypress** is **[NV]**: desktop `globalShortcut` normally consumes the accelerator, but Electron/OS version and focus state can change that. The *code-level duplication* is proven; the *single-press double execution* is not.

---

### C.7 Overlay renderer chord sends `toggle-expand` rather than hiding — CONFIRMED

`NativelyInterface.tsx:1191` → `api.toggleWindow()` (`preload.ts:597`) → `main.ts:3571` `toggleMainWindow` overlay branch `:3584–3592`:

```ts
    } else {
      // In overlay mode, bring the window to the foreground and expand/collapse the UI
      const targetWindow = this.windowHelper.getOverlayWindow();
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.setAlwaysOnTop(true, 'screen-saver');
        targetWindow.show();
        targetWindow.focus();
        targetWindow.webContents.send('toggle-expand');
      }
    }
```

`useIpc` map `NativelyInterface.tsx:972`:

```ts
        onToggleExpand: () => setIsExpanded(p => !p),
```

So the renderer chord, when it reaches the renderer, **shows and focuses the window, then toggles the expand/collapse state** — it never hides the overlay. Note that this path can also reveal a hidden overlay (`targetWindow.show()`), which is a second way the chord can change visibility.

---

### C.8 Ctrl+1 while hidden by the Hide chip — CONFIRMED (static)

Hide chain:

`TopPill.tsx:53` (`onClick={onToggle}`) → `NativelyInterface.tsx:1396` (`setIsExpanded(!isExpanded)`) → effect `:691–711`:

```ts
    useEffect(() => {
        if (!didMountExpandRef.current) { didMountExpandRef.current = true; return; }
        if (isExpanded) {
            ...
            if (isOverlayWindow) {
                api.showOverlay?.();
            } ...
            return;
        }
        if (isOverlayWindow) {
            const t = setTimeout(() => api.hideOverlay?.(), 400);
            return () => clearTimeout(t);
        }
        ...
    }, [isExpanded, api, isOverlayWindow]);
```

`hideOverlay` `WindowHelper.ts:655–664` calls only `overlay.hide()`; it does **not** change `currentWindowMode` or `KeybindManager.activeMode`. Therefore `shouldRegister('chat:whatToAnswer')` still returns true at `KeybindManager.ts:102`.

Ctrl+1 chain:

`KeybindManager.ts:24` (default `CommandOrControl+1`) → register `:286–288` → `main.ts:452` → action map `:577–588` → broadcast `:589–595`:

```ts
          const allWindows = BrowserWindow.getAllWindows();
          allWindows.forEach(win => {
            if (!win.isDestroyed()) {
              win.webContents.send('global-shortcut', { action });
            }
          });
```

→ preload `onGlobalShortcut` `:1298–1304` → `NativelyInterface.tsx:1091–1095`:

```ts
        onGlobalShortcut: ({ action }) => {
            const h = H.current;
            isStealthRef.current = true;
            const acts: Record<string, () => void> = {
                whatToAnswer: () => h.handleWhatToSay(), ...
```

→ `handleWhatToSay` `:759–764`:

```ts
    const handleWhatToSay = async (instr?: string | React.MouseEvent) => {
        if (isProcessingRef.current) { pendingCaptureRef.current = null; return; }
        ...
        const inShot = activeThread === 'screenshot' || isScreenshotAnalysisRef.current;
        setIsExpanded(true);
        setIsProcessing(true);
```

→ `isExpanded` changes `false → true` → effect `:692–700` runs `api.showOverlay?.()`.

`preload.ts:600` `showOverlay: () => invoke("show-overlay")` → `ipcHandlers.ts:302–305` → `WindowHelper.showOverlay` `:625–653` (showInactive, plus focus when not passthrough).

**Result [S-C]:** Ctrl+1 generates an answer in the hidden overlay **and** makes the overlay visible again. The only guard is `isProcessingRef` (`:760`), which prevents overlapping requests, not hidden-window activation. Runtime confirmation is still required because it depends on the global shortcut being armed and the hidden renderer receiving the broadcast (both are structurally true in this code).

---

### C.9 Ctrl+1 while the launcher is current — CONFIRMED no action

- Mode is `launcher` after `switchToLauncher` `:790` (Home, Stop, launcher switch).
- `shouldRegister('chat:whatToAnswer')`: `:101` does not match; `:102` false; `:105–116` do not match; returns false at `:118`.
- The launcher DOM handler handles only `toggleVisibility` and window movement (`Launcher.tsx:218–234`).
- The overlay is hidden and not focused, so its DOM handler is unreachable.

Caveat: this is true only while mode and reality agree. `hideMainWindow` does not update mode, and `switchToOverlay` can leave mode `overlay` with no visible overlay (C.10/D-09), so "launcher visible ⇒ mode launcher" is an emergent property, not a guarded invariant.

---

### C.10 Meeting Ongoing restores the same overlay — CONFIRMED (normal path)

`Launcher.tsx:768–779`:

```ts
                                                if (isMeetingActive) {
                                                    // inactive=true: overlay appears on top but doesn't activate
                                                    // the Natively app or steal OS focus — preserves stealth.
                                                    // setWindowMode (not showWindow) is required because
                                                    // logo-click set currentWindowMode='launcher', so showWindow()
                                                    // would re-show the launcher rather than switch to overlay.
                                                    window.electronAPI?.setWindowMode?.('overlay', true);
```

`preload.ts:896` → `ipcHandlers.ts:197–200` → `WindowHelper.setWindowMode` `:826–832` → `switchToOverlay(true)` `:697`.

No `ensureOverlayWindow`, `startMeeting`, capture or STT call appears in this chain. The **same** `overlayWindow` instance is reused.

Counter-evidence/edge: `switchToOverlay` does not verify the overlay is alive before changing mode; if it is missing, it logs `no usable overlay` and still hides the launcher (`:782–785`). In the normal session it exists; after Stop it is destroyed and `isMeetingActive` is false, so the CTA shows Start instead.

---

### C.11 Home/logo preserves session and audio/STT — CONFIRMED

`TopPill.tsx:34–45` (logo `onClick={onLogoClick}` at `:36`) → `NativelyInterface.tsx:1399`:

```tsx
                                    onLogoClick={() => api.setWindowMode?.('launcher')}
```

→ `preload.ts:896` → `ipcHandlers.ts:197` → `WindowHelper.setWindowMode('launcher')` `:826` → `switchToLauncher` `:788–824` (show launcher, hide overlay).

No `endMeeting`, `forceEndMeeting`, `stop`, `destroy`, `finalize` or STT call exists in this chain. `isMeetingActive` is untouched, and the launcher's existing `isMeetingActive` state remains true, so its CTA still renders "Meeting ongoing" (`Launcher.tsx:805–826`).

---

### C.12 Stop ends the session and cleans up — CONFIRMED

`TopPill.tsx:81` (`onClick={onQuit}`) → `NativelyInterface.tsx:1397`:

```tsx
                                    onQuit={() => (onEndMeeting ? onEndMeeting() : api.quitApp?.())}
```

`App.tsx:495` passes `onEndMeeting={handleEndMeeting}`; `handleEndMeeting` `:419–448` calls `window.electronAPI.endMeeting()` `:441` → `preload.ts:879` → `ipcHandlers.ts:2716` → `AppState.endMeeting` `:2951`.

Key teardown evidence:

```ts
    this.isMeetingActive = false;
    this._isDraining = true;
    this._sessionState = 'stopping';
    ...
    KeybindManager.getInstance().setSessionActive(false);
    this.broadcastMeetingState();
    ...
    this.windowHelper.setWindowMode('launcher');
    ...
    this.systemAudioCapture?.stop();
    this.microphoneCapture?.stop();
```

(`:2988–3009`), then the async IIFE `:3032` with 250 ms drain `:3057`, `googleSTT.stop()` `:3060`, `intelligenceManager.stopMeeting()` `:3065`, and `finally` `:3096–3105`:

```ts
        this.systemAudioCapture?.destroy();
        this.systemAudioCapture = null;
        this.microphoneCapture?.destroy();
        this.microphoneCapture = null;

        this.googleSTT?.removeAllListeners();
        this.googleSTT = null;
        this.googleSTT_User?.removeAllListeners();
        this.googleSTT_User = null;
```

and `:3114–3118`:

```ts
        if (!this.isMeetingActive && this._sessionId === endedSessionId) {
          this.windowHelper.destroyOverlayWindow();
          this._sessionState = 'idle';
          this._sessionId = null;
          this.broadcastMeetingState();
        }
```

`startMeeting` awaits `_pendingTeardown` (`:2769–2779`), and the `_sessionId === endedSessionId` guard prevents an older teardown from destroying a newer overlay. **CONFIRMED.**

---

### C.13 The launcher discards the stopping state — CONFIRMED

`main.ts:717–723`:

```ts
  private broadcastMeetingState(): void {
    this.broadcast('meeting-state-changed', {
      isActive: this.isMeetingActive,
      state: this._sessionState,
      sessionId: this._sessionId,
    });
  }
```

`preload.ts:604–608` forwards the whole object:

```ts
  onMeetingStateChanged: (callback: (data: { isActive: boolean }) => void) => {
    const subscription = (_: any, data: { isActive: boolean }) => callback(data);
    ipcRenderer.on('meeting-state-changed', subscription);
    ...
```

`Launcher.tsx:192–194` uses only `isActive`:

```tsx
            removeMeetingStateListener = window.electronAPI.onMeetingStateChanged(({ isActive }) => {
                setIsMeetingActive(isActive);
            });
```

`state` and `sessionId` are therefore dropped. At `:2988–2993` the broadcast happens while `state='stopping'`, so the launcher receives the value and discards it; its CTA flips to "Start Natively" at once (`:807–838`).

---

### C.14 Diagnostics are sufficient (with caveats) — PARTIALLY CONFIRMED

`main.ts:734–750`:

```ts
  public getAudioPipelineDiagnostics(): Record<string, any> {
    const mic: any = this.microphoneCapture;
    const sys: any = this.systemAudioCapture;
    ...
    return {
      sessionActive: this.isMeetingActive,
      sessionState: this._sessionState,
      sttProvider: this.sttProvider,
      microphone: { capturing: !!mic, sampleRate: micRate },
      systemAudio: { capturing: !!sys, sampleRate: sysRate },
      sttConnected: !!this.googleSTT,
    };
  }
```

`ipcHandlers.ts:316–325` exposes it as `get-stt-pipeline-diagnostics` (plus Sherpa diagnostics). Per-channel status is broadcast on `stt-status` (`main.ts:1344, 1359, 1370, 1387, 1414`) and exposed to renderers at `preload.ts:841–844` (`onSttStatusChanged`).

What is sufficient: session active/state, provider name, capture object presence and sample rates, STT object presence, plus per-channel `state/provider/error/reconnectAttempts`. That is enough to render session status, audio capture status, active provider, STT state and errors on the launcher without a second status system.

Caveats (why not fully confirmed):

- `sttConnected: !!this.googleSTT` is true after boot prewarm whenever a provider is configured (`prewarmSttProviders` `:1868–1884`, called at `:4525–4530`); it means "object exists", not "connected".
- `microphone.capturing: !!mic` means "capture object exists", not "audio is flowing". Real silence/route failures arrive via `audio-capture-failed` (`main.ts:1591–1616`) and the per-channel `stt-status`.
- The launcher subscribes to none of these today (`Launcher.tsx` has no `getSttPipelineDiagnostics` / `onSttStatusChanged` usage). Only Settings → Audio (`SettingsOverlay.tsx:577–585`) and the overlay (`NativelyInterface.tsx:986–990`) consume them.

---

### C.15 Overlay created and React mounted at launch — CONFIRMED, with a timing caveat

`main.ts:4520` (inside `initializeApp`):

```ts
  appState.createWindow()
```

`WindowHelper.createWindow` `:192`, end of function `:320–330`:

```ts
    const loadSuccess = await loadUrlWithRetry(this.launcherWindow, `${startUrl}?window=launcher`, 'launcher', 10, 500);
    ...
    // --- 2. Create Overlay Window (Hidden initially) ---
    await this.ensureOverlayWindow();

    this.setupWindowListeners();
```

`ensureOverlayWindow` `:340–440`: creates `new BrowserWindow(overlaySettings)` at `:386` with `show: false`, `height: 1` (`:369–373`), then `loadUrlWithRetry(... ?window=overlay ...)` at `:422`, and never shows it on load (`:429–432`).

`src/App.tsx:482–500` routes the overlay document to `NativelyInterface`:

```tsx
  if (isOverlayWindow || isDefault) {
    ...
                <NativelyInterface
                  onEndMeeting={handleEndMeeting}
```

`src/main.tsx` renders into `React.StrictMode`; `NativelyInterface` then installs its `useIpc` subscriptions (`:972–1125`) and other effects.

Caveat: `AppState.createWindow()` (`main.ts:3556–3558`) calls `this.windowHelper.createWindow()` **without awaiting**. The overlay is therefore *created and begins loading during launch*, but "fully loaded before Start" is not guaranteed by code. In practice Start also calls `ensureOverlayWindow()`, which joins the in-flight promise, so no duplicate is created.

Audio/STT at this point: no capture pipeline (`setupSystemAudioPipeline` only at `:2344` and `:2903`; boot call commented at `:689`). STT **objects** are prewarmed. Provider constructors inspected do not open streams: `GoogleSTT` builds a `SpeechClient` only (`GoogleSTT.ts:38–54`), `DeepgramStreamingSTT` stores the key (`DeepgramStreamingSTT.ts:35–38`) and connects only in `start()` (`:71–77`), `OpenAIStreamingSTT` stores config (`:131–145`) and creates the WebSocket in `_connectWs` (`:323`).

---

## D. Shortcut design analysis

### D.1 Can `currentWindowMode` + visibility enforce the approved rules?

**Not as currently written**, but the underlying signals are sufficient.

| Signal | What it actually means | Reliability |
|---|---|---|
| `WindowHelper.currentWindowMode` (`:65`) | Last surface selected by `switchToOverlay`/`switchToLauncher` | Reliable *last choice*, not visibility. Unchanged by `hideOverlay`/`showOverlay`. |
| `WindowHelper.isWindowVisible` | Cached boolean written by `hideMainWindow` `:608`, `switchTo*` `:756/:818`, `createWindow` `:316`, `restoreLauncherWindow` `:467` | **Stale** after `hideOverlay`/`showOverlay` (`:625–666` never write it). |
| `launcherWindow.isVisible()` / `overlayWindow.isVisible()` | Actual Electron window visibility | Authoritative per window; requires null/destroy guards. |
| `KeybindManager.activeMode` | Mirror of `currentWindowMode` via `setMode` (`WindowHelper.ts:700, 791`) | Same semantics and same limits. |

A reliable derivation of "current working interface" is:

1. If `overlay.isVisible()` → overlay is current.
2. Else if `launcher.isVisible()` → launcher is current.
3. Else → the last selected interface (`currentWindowMode`), i.e. the "neither visible" fallback.

Precedence should be explicit (`switchTo*` hides the other window, so "both visible" is not a normal state, but `showOverlay` does not hide the launcher — `:625–653` — so a defensive rule is still needed).

### D.2 Is `BrowserWindow.isFocused()` needed?

**No — and a mandatory focus check would be actively wrong for this app.** Focus is not the same as visibility, and the approved flows can leave the overlay visible without focus:

1. **Meeting Ongoing passes `inactive=true`.** `Launcher.tsx:774` → `switchToOverlay(true)` → `WindowHelper.ts:753–755`:
   ```ts
   if (inactive) this.overlayWindow.showInactive(); else this.overlayWindow.show();
   if (!inactive) this.overlayWindow.focus();
   ```
   The overlay is visible and not focused. A focus gate would disable Ctrl+1 immediately after the approved E workflow.

2. **Mouse passthrough.** `Natural showOverlay` `:640–646`:
   ```ts
   if (this.appState.getOverlayMousePassthrough()) {
     this.overlayWindow.showInactive();
   } else {
     this.overlayWindow.showInactive();
     this.overlayWindow.focus();
   }
   ```
   With passthrough on (`syncOverlayInteractionPolicy` `:611–623` sets `setIgnoreMouseEvents(true, { forward: true })`), the overlay is visible for viewing but deliberately not interactive/focused. Ctrl+1 is a global hotkey and must still work.

3. **Stealth is the product's purpose.** Global shortcuts are registered precisely so the user can act while another app (Zoom, browser) is focused (`KeybindManager.ts:26–31` comments). A focus requirement would make the assistant unusable in the main use case.

4. **`showInactive()` on Windows does not activate**; `focus()` can be refused by foreground-lock rules, and the Windows `blur` handler (`WindowHelper.ts:548–553`) only re-asserts `alwaysOnTop`, not focus. Focus would be flaky even when intended.

5. **Windows content-protection path** defers focus by 60 ms (`WindowHelper.ts:734–746`), so a focus gate would race the ramp.

Conclusion: use visibility + session + last-mode. Focus can be recorded for diagnostics but must not gate Ctrl+1 or Ctrl+B.

### D.3 Ctrl+B requirements against current state

| Approved rule | Current implementation | Reliable with mode+visibility? |
|---|---|---|
| Current interface only | `toggleAssistantOverlay` branches on `overlay.isVisible()` only (`:3638`); visible overlay hides **and** shows the launcher (`:3646`); visible launcher with session shows overlay (`:3649`) | No — both branches can change interface |
| Idle launcher hide/show | Global shortcut absent (`KeybindManager.ts:101`); only focused-renderer chord (`Launcher.tsx:219`) | No |
| Overlay hide/show | Hide branch also shows launcher; Show branch works | No |
| Launcher after Home | Ctrl+B opens the overlay (`:3649`) | No |
| Hidden overlay restores same overlay | Yes, `switchToOverlay` shows the existing overlay; `ensure` only if missing (`:3620–3635`) | Yes, except the extra launcher switch in the Hide direction |
| Never switch interfaces | Violated in both directions (`:3646`, `:3649` → `WindowHelper.ts:784`) | No |
| Never start/stop session | No session calls in the branch; `setSessionActive` is untouched | Yes |

### D.4 Ctrl+1 requirements against current state

| Approved rule | Current gate | Reliable? |
|---|---|---|
| Session active AND overlay actually visible AND current interface | `activeMode === 'overlay'` (`KeybindManager.ts:102`) | No |
| Nothing when hidden by Hide chip | Mode stays `overlay`; hidden renderer still receives broadcast; `handleWhatToSay` runs and `setIsExpanded(true)` shows the overlay | No |
| Nothing when launcher current | Mode `launcher` → not registered | Yes today, by emergent mode/visibility agreement |
| Nothing before Start / after Stop | `sessionActive=false` + launcher mode | Yes |

The minimum reliable condition from existing state is: `isMeetingActive && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()`. Because `switchToLauncher` hides the overlay and `switchToOverlay` hides the launcher, this also encodes "current interface" without focus.

### D.5 Neither launcher nor overlay visible

This state exists today:

| Case | How it arises | Next Ctrl+B today | Required |
|---|---|---|---|
| Idle, launcher hidden | Renderer chord → `hideMainWindow` (`main.ts:3571–3583`, `WindowHelper.ts:603–609`) | **No global shortcut** (`KeybindManager.ts:101`); macOS menu may act **[NV]**; otherwise tray/relaunch | Restore launcher (previously selected) |
| Active session, both hidden briefly | `withScreenshotCaptureSession` → `hideWindowsForScreenshot` (`main.ts:3708–3719`, called `:3768`); restore later `:3722–3731` | `toggleAssistantOverlay` → overlay not visible → `switchToOverlay` regardless of last mode | Restore the previously selected interface |
| Active session, overlay missing | `switchToOverlay` hides the launcher even when it cannot show the overlay (`WindowHelper.ts:782–785`); mode is now `overlay` | `toggleAssistantOverlay` → missing → `ensureOverlayWindow` then `switchToOverlay`; if creation fails, still nothing | Restore the last usable interface (launcher) |

The code has a usable "last selected" record (`currentWindowMode`) but `toggleAssistantOverlay` never consults it; it hardcodes overlay when the session is active and does nothing when idle.

---

## E. Preloaded overlay versus active assistant session

| Question | Answer | Evidence |
|---|---|---|
| Is the overlay `BrowserWindow` created before Start? | **Yes**, during `createWindow()` at app launch | `main.ts:4520`; `WindowHelper.ts:327, 340, 386` |
| Is its renderer loaded before Start? | **Loading starts at launch** (`loadUrlWithRetry`, awaited inside `ensureOverlayWindow`). It is not awaited by `AppState.createWindow` (`main.ts:3556–3558`), so completion is not ordered before any later event. | `WindowHelper.ts:422, 429–432` |
| Is React mounted? | **Yes**, once the document loads: `?window=overlay` → `App` → `NativelyInterface` | `App.tsx:482–500`; `WindowHelper.ts:422` |
| Does `NativelyInterface` mount? | **Yes**; `isExpanded` defaults to `true` (`NativelyInterface.tsx:354`), but `didMountExpandRef` suppresses the first effect run so mounting cannot call `showOverlay` (`:689–692`) | `NativelyInterface.tsx:689–711` |
| Are IPC subscriptions installed? | **Yes** — `useIpc(api, {...})` (`:972–1125`), plus theme/stealth/opacity listeners. In development, `React.StrictMode` (`src/main.tsx`) mounts, unmounts and remounts effects once; the `useIpc` cleanup removes subscriptions, so duplicates are transient and dev-only. Production builds do not double-invoke. | `src/main.tsx`; `NativelyInterface.tsx:240–248` |
| Are audio capture and STT started? | **No.** No capture object exists (`setupSystemAudioPipeline` not called at boot: commented `main.ts:689`; called only at `:2344`, `:2903`). STT **provider objects** are prewarmed (`:1868–1884`, `:4525–4530`), but constructors do not open streams (`GoogleSTT.ts:38–54`; `DeepgramStreamingSTT.ts:35–38`, connect only in `start()` `:71–77`; `OpenAIStreamingSTT.ts:131–145`, WS created in `_connectWs` `:323`). | as cited |
| Can LLM answer generation be triggered before Start? | **Not automatically.** There is no `setInterval`, worker or auto-answer effect in `NativelyInterface` that calls the LLM on mount. Chat actions arrive only through `global-shortcut` events; Ctrl+1 is not registered pre-session, and the pre-session global actions are screenshot-only. The overlay's `onCaptureAndProcess` requires a screenshot event (`:1072`). Explicit user actions (typing in the launcher's chat, settings tests) are separate. | `NativelyInterface.tsx` (no `setInterval`/`Worker`); `KeybindManager.ts:99–118`; `main.ts:489–530` |
| Are timers/background tasks started? | **App-wide ones, yes**; overlay-specific ones, no. Launcher polls calendar every 60 s (`Launcher.tsx:204`); `KeybindManager` health-checks every 10 s (`:358–370`); the `App` mount effect performs license/profile/trial IPC checks in every window, including the overlay (`App.tsx` effects). No overlay render interval exists. | as cited |

**Terminology used in this report:**

- **Preloaded renderer:** the overlay `BrowserWindow` exists, its document has loaded (or is loading), React has mounted `NativelyInterface`, IPC subscriptions are live, and no session/audio exists. It is *not visible*.
- **Active assistant session:** `isMeetingActive === true`, captures and STT are running, and the overlay is the session's UI surface (visible when selected).
- Saying the preloaded overlay is "operating" is misleading: it is executing renderer code and listening, but it is not capturing, transcribing, visible, or generating answers.

---

## F. Contradictions and corrections to Module 04

| # | Module 04 statement | Correction |
|---|---|---|
| F-1 | "The overlay renderer is created and **fully loaded** at application launch" (`MODULE_04`, B.1 key fact) | **Overstated.** The window is created at launch and its load is started/awaited inside `ensureOverlayWindow`, but `AppState.createWindow` does not await `createWindow` (`main.ts:3556–3558`). "Created at launch; loaded asynchronously; not guaranteed complete before Start" is accurate. |
| F-2 | D-06 recommended repair: gate on `overlay.isVisible() && overlay.isFocused()` | **Incorrect recommendation.** Focus is not an approved requirement and would break Meeting Ongoing (`inactive=true` → `showInactive`, `WindowHelper.ts:753–755`), mouse passthrough (`showOverlay` `:640–646`), and the stealth use case. Correct gate: session + `overlay.isVisible()` (+ launcher not visible, if a defensive precedence is desired). |
| F-3 | "Global shortcut **and** renderer keydown can both run" for one Ctrl+B press (E.2, D-05 impact) | **Unverified.** Two code owners are proven; simultaneous delivery of one physical keypress is **[NV]** because OS-level global accelerators normally consume the chord. Module 04 should not have stated the double execution as fact. |
| F-4 | D-03: "the launcher fallback **cannot restore** the window", "second press impossible" | **Partly overstated.** The chord path is indeed lost, but on macOS the application-menu accelerator (`KeybindManager.ts:425–431`) can still toggle while the app remains active; tray (`main.ts:3967–3973`, only when not stealth), dock `activate` `:4692–4708` (macOS, not stealth), and a second launch `:4432–4438` also restore it. |
| F-5 | E.2 verdict "Session stopping/stopped → PARTIAL / FAIL" | **Imprecise.** After Stop the launcher is the current interface, so hiding it is consistent with the approved idle-launcher rule; the defect is that the *global* chord is unregistered and the surviving renderer path cannot restore it (already D-03). Verdict should be "behaviour allowed, restore path missing". |
| F-6 | H: "Ctrl+1 no action when overlay hidden → FAIL" and E.3: "hidden via Ctrl+B → PASS by accident" | **Both true but must be read as path-specific.** After the current global Ctrl+B the mode becomes `launcher`, so Ctrl+1 is unregistered (pass, for the wrong reason). After the Hide chip the mode stays `overlay`, so Ctrl+1 fires (fail). The requirement as a whole is FAIL. |
| F-7 | D-11: `sttConnected` "is true at launch" | **Conditional.** It is true only when a provider is configured; `createSTTProvider` returns `null` for `sttProvider === 'none'` (`main.ts:1110–1116`). It means "object exists", not "connected". |
| F-8 | C.5 chain: Meeting Ongoing "reuses the existing overlay" with no caveat | **Add the edge:** `switchToOverlay` does not call `ensureOverlayWindow` and hides the launcher even when the overlay is missing (`WindowHelper.ts:782–785`). Normal session path is safe; the edge is Module 04's D-09. |
| F-9 | B.1: overlay "Destroyed by `destroyOverlayWindow`" | **Incomplete.** The overlay also has its own `close` handler (`WindowHelper.ts:555–562`) which hides it during a meeting or switches to the launcher when idle; there is no `closed` listener nulling the field, so other destruction paths can leave a stale reference (Module 04 D-12). |
| F-10 | "Recoverable from tray/dock" (state table S1) | **Conditional.** Tray exists only when `!getUndetectable()` (`main.ts:4539–4542`); in stealth both tray and dock are hidden. Add second-instance relaunch `:4432–4438`. |
| F-11 | D-06 impact: Ctrl+1 "can pop the overlay open" | **Structurally correct [S-C]**, but depends on the hidden renderer receiving the broadcast and not already processing (`NativelyInterface.tsx:760`). Mark as static consequence pending runtime confirmation. |
| F-12 | D-08: `isWindowVisible` "reports the previous state" after show/hideOverlay | Minor wording: `showOverlay`/`hideOverlay` **leave the field unchanged**; it is only "previous" if it was correct before. The defect stands. |

Everything else re-checked in Module 04 (Start behaviour, Ctrl+B overlay→launcher, launcher→overlay, duplicate owners, `toggle-expand`, registration gate, Home, Meeting Ongoing, Stop teardown, stopping-state discard) matched the current source.

---

## G. Runtime-only questions still unresolved

None of the following can be settled by source inspection, and none was tested:

1. Whether a registered `globalShortcut` prevents the focused renderer from also receiving the same Ctrl+B keydown, on Windows and on macOS.
2. Whether the macOS application-menu `Toggle Visibility` accelerator still fires after `hideMainWindow`, i.e. whether the app remains the active application with no visible window; and whether the menu and `globalShortcut` double-fire when both exist.
3. Actual overlay focus state after `switchToOverlay(true)` and after `showOverlay()` with mouse passthrough on Windows/macOS.
4. Whether `showInactive()` on Windows leaves the overlay unfocused in every case, and whether `focus()` can be refused by foreground-lock rules.
5. Actual timing between Start's IPC response, overlay load completion and audio pipeline start.
6. Whether `hideOverlay` during a renderer-side streaming answer leaves a visible artifact on the next `showOverlay` (renderer state is preserved because the window is hidden, not destroyed).
7. Whether Settings/ModelSelector windows remain visible over the desktop after Ctrl+B or Stop (parent/child hide semantics differ by platform).
8. Real behaviour of the macOS menu accelerator while the dock is hidden in stealth mode.

---

## H. Findings that are safe to use in a future repair plan

These are directly source-proven and do not depend on unresolved runtime behaviour:

1. **Start path:** `startMeeting` calls `switchToLauncher(false)` and only prepares the overlay hidden; the renderer sends no follow-up window switch. (CONFIRMED, C.1)
2. **Ctrl+B registration:** `general:toggle-visibility` is not registered while `sessionActive` is false; `shouldRegister`'s launcher-mode branch for that id is dead code. (CONFIRMED, C.2)
3. **Idle chord loss:** the focused-launcher chord routes to `hideMainWindow`, which hides both windows; with no global registration and no focus, the chord cannot be pressed again. (CONFIRMED on Windows, C.3)
4. **Ctrl+B overlay→launcher:** `toggleAssistantOverlay` hides the overlay and then calls `switchToLauncher(true)`. (CONFIRMED, C.4)
5. **Ctrl+B launcher→overlay:** the hidden branch unconditionally calls `switchToOverlay`, which hides the launcher. (CONFIRMED, C.5)
6. **Multiple owners:** global shortcut, macOS menu, launcher renderer, overlay renderer (and tray click) all exist. (CONFIRMED owners, C.6)
7. **Overlay renderer chord effect:** `toggleWindow` in overlay mode shows/focuses the window and sends `toggle-expand`; it never hides. (CONFIRMED, C.7)
8. **Ctrl+1 hidden-by-Hide:** `hideOverlay` does not change the shortcut mode, so Ctrl+1 remains registered and the handler sets `isExpanded=true`, which calls `showOverlay`. (CONFIRMED static, C.8)
9. **Ctrl+1 on the launcher:** not registered in launcher mode; launcher renderer has no Ctrl+1 handler. (CONFIRMED, C.9)
10. **Meeting Ongoing:** reuses the overlay via `setWindowMode('overlay', true)`; no session/audio/STT restart. (CONFIRMED normal path, C.10)
11. **Home/logo:** `setWindowMode('launcher')` only; no teardown. (CONFIRMED, C.11)
12. **Stop:** full teardown exists, including capture/STT destruction and deferred overlay destruction; `_pendingTeardown` and the session-id guard prevent cross-session damage. (CONFIRMED, C.12)
13. **Stopping UI gap:** the launcher receives `state` but destructures only `isActive`, so no stopping state is displayed. (CONFIRMED, C.13)
14. **Diagnostics primitives:** `get-stt-pipeline-diagnostics` and per-channel `stt-status` already provide the required data; only launcher wiring is missing. (PARTIAL, C.14)
15. **Preloaded overlay:** created at launch with `show:false`; React mounts `NativelyInterface` and installs IPC; no capture, no STT stream, no automatic LLM call. (CONFIRMED with timing caveat, section E)
16. **Visibility truth split:** `isWindowVisible` is not updated by `showOverlay`/`hideOverlay`, while `BrowserWindow.isVisible()` is authoritative. (CONFIRMED, D.1)
17. **Mode is last-selected, not visibility:** `currentWindowMode` changes only in `switchToOverlay`/`switchToLauncher`. (CONFIRMED, D.1)
18. **Focus is not a valid gate:** the approved Meeting Ongoing path and mouse-passthrough path show the overlay without focus. (CONFIRMED from `switchToOverlay`/`showOverlay`; D.2)
19. **No last-mode fallback:** when neither window is visible, `toggleAssistantOverlay` still forces the overlay (session active) or does nothing (idle), ignoring `currentWindowMode`. (CONFIRMED, D.5)
20. **Overlay-missing hazard:** `switchToOverlay` changes mode and hides the launcher before confirming the overlay is usable. (CONFIRMED, `WindowHelper.ts:697–700, 782–785`)

Items **not** safe to assert without runtime testing: simultaneous global+DOM chord execution, actual focus state, macOS menu behaviour with no visible window, platform child-window hiding, and exact show/hide timing. They are listed in section G and must not be used as proven facts in a repair plan.

---

## Summary of verdicts

- **13 of 15** findings are confirmed by current source (1, 2, 4, 5, 6, 7, 8-static, 9, 10-normal, 11, 12, 13, 15). Two of those carry a qualifier: finding 6's *code-level duplication* is proven but *simultaneous execution per keypress* is **[NV]**, and finding 15's *creation and mount* are proven but *load completion before Start* is not ordered by code.
- **2** are partially confirmed: finding 3 (chord lost on Windows, recovery paths and platform differences) and finding 14 (diagnostics sufficient but coarse; launcher not wired).
- **Module 04 corrections:** remove the `isFocused()` recommendation (F-2), soften "fully loaded" (F-1), qualify "cannot restore" (F-4), and stop presenting simultaneous chord execution as fact (F-3). No finding in Module 04 was found to be wholly incorrect.
- No source file was changed; this report is the only artifact.
