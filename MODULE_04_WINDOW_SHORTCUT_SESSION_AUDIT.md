# MODULE 04 — WINDOW, SHORTCUT AND SESSION LIFECYCLE AUDIT

**Project:** Natively AI Interview Assistant
**Repository root audited:** `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main`
**Date:** 2026-11-12
**Mode:** READ-ONLY investigation. No source file was modified. No package, setting or configuration was changed. No repair was implemented.

### Evidence legend

| Tag | Meaning |
|---|---|
| **[S]** | Source-code evidence: file, symbol and line read in the current working tree. |
| **[S-C]** | Static consequence: follows deterministically from the source but was not observed in a running app. |
| **[R]** | Runtime evidence. **None was produced** — the application was not launched for this audit. |
| **[NV]** | Cannot be verified statically; needs a running app or platform-specific observation. |

All line numbers refer to the files as they exist in this working tree at the time of the audit.

---

## A. Files and functions inspected

| File | Lines | Symbols read |
|---|---:|---|
| `electron/main.ts` | 4 789 | `AppState` fields (`isMeetingActive` `:286`, `_sessionState` `:317`, `_pendingTeardown` `:301`), `createSTTProvider` `:1106`, `prewarmSttProviders` `:1868`, `startMeeting` `:2753`, `endMeeting` `:2951`, `forceEndMeeting` `:3132`, `broadcast` `:697`, `getIsMeetingActive` `:705`, `broadcastMeetingState` `:717`, `getSessionState` `:729`, `getAudioPipelineDiagnostics` `:734`, `appState.createWindow` `:3556`, `toggleMainWindow` `:3571`, `toggleAssistantOverlay` `:3602`, `restoreWindowsAfterScreenshot` `:3722`, `updateTrayMenu` `:3940`, `initializeApp` `:4377`, shortcut callback registration `:452`, `app.on('activate')` `:4692` |
| `electron/WindowHelper.ts` | 888 | `createWindow` `:192`, `ensureOverlayWindow` `:340`, `destroyOverlayWindow` `:446`, `restoreLauncherWindow` `:461`, `setupOverlayWindowListeners` `:525`, `getMainWindow` `:567`, `hideMainWindow` `:603`, `showOverlay` `:625`, `hideOverlay` `:655`, `showMainWindow` `:668`, `toggleMainWindow` `:676`, `switchToOverlay` `:697`, `switchToLauncher` `:788`, `setWindowMode` `:826` |
| `electron/services/KeybindManager.ts` | 518 | `DEFAULT_KEYBINDS` `:13–60`, `setMode` `:76`, `setSessionActive` `:88`, `shouldRegister` `:99`, `load` `:155`, `setKeybind` `:237`, `registerGlobalShortcuts` `:277`, `revalidateShortcuts` `:321`, `startHealthCheck` `:358`, `updateMenu` `:375` (macOS `Toggle Visibility` item `:425–431`), `setupIpcHandlers` `:501` |
| `electron/preload.ts` | 1 537 | `toggleWindow` `:597`, `showWindow` `:598`, `hideWindow` `:599`, `showOverlay` `:600`, `hideOverlay` `:601`, `getMeetingActive` `:602`, `getSttPipelineDiagnostics` `:603`, `onMeetingStateChanged` `:604–608`, `startMeeting` `:878`, `endMeeting` `:879`, `setWindowMode` `:896`, `onGlobalShortcut` `:1297–1304` |
| `electron/ipcHandlers.ts` | 4 701 | `set-window-mode` `:197–200`, `toggle-window` `:290–292`, `show-window` `:294–297`, `hide-window` `:298–301`, `show-overlay` `:302–305`, `hide-overlay` `:306–309`, `get-meeting-active` `:310–312`, `get-stt-pipeline-diagnostics` `:316–325`, `quit-app` `:588–590`, `start-meeting` `:2706–2714`, `end-meeting` `:2716–2724`, `force-end-meeting` `:2726–2734` |
| `src/App.tsx` | 815 | window routing `:38–46`, `handleStartMeeting` `:381–416`, `handleEndMeeting` `:419–448`, overlay render with `onEndMeeting` `:494–499`, launcher render `:509–560` |
| `src/components/Launcher.tsx` | 1 207 | meeting-active sync `:182–187`, `onMeetingStateChanged` `:189–195`, launcher keydown effect `:217–240`, CTA `Start Natively` / `Meeting ongoing` `:764–840` |
| `src/components/NativelyInterface.tsx` | 1 801 | props `:65–69`, `useIpc` helper `:240–248`, `isExpanded` default `:354`, show/hide effect `:691–711`, `handleWhatToSay` `:759–821`, STT status subscription `:986–990`, `onGlobalShortcut` map `:1091–1105`, overlay keydown `:1175–1207`, `TopPill` wiring `:1394–1400` |
| `src/components/ui/TopPill.tsx` | 107 | logo/Home `:34–45`, Hide chip `:48–66`, Stop button `:78–91` |
| `src/hooks/useShortcuts.ts` | 317 | default shortcut table `:48–93`, keybind hydration `:120–198`, `isShortcutPressed` `:257–310` |
| `electron/SettingsWindowHelper.ts` | 322 | parent assignment `:101–103`, `alwaysOnTop: true` `:190` |
| `electron/ModelSelectorWindowHelper.ts` | 191 | parent assignment `:56–59`, `alwaysOnTop: true` `:147` |
| `src/components/SettingsOverlay.tsx` | — | `getSttPipelineDiagnostics` consumer `:577–585` |

Historical reports cross-checked: `MODULE_01_ELECTRON_WINDOW_LIFECYCLE_AUDIT.md`, `MODULE_02A_ACTIVE_STT_PROVIDER_VERIFICATION.md`, `MODULE_03_SETTINGS_AND_FEATURE_WIRING_AUDIT.md`, `MODULE_03A_FINAL_REQUIREMENTS_VALIDATION_AND_INTEGRATION_AUDIT.md`, plus `MODULE_03A` defect register (D-01…D-04). Where an earlier finding still matched the code it is marked **confirmed**; where the current source differs it is called out explicitly.

---

## B. Actual application/window architecture and ownership

### B.1 Windows

| Window | Created | Owner | Created at boot? | Initial visibility | Destroyed by |
|---|---|---|---|---|---|
| Launcher | `WindowHelper.createWindow` `:192`, `new BrowserWindow(...)` `:272` | `WindowHelper.launcherWindow` (`:60`) | Yes — `initializeApp` → `appState.createWindow()` (`main.ts:4520`) | `show: false` (`:223`), shown on `did-finish-load` (`:313–317`) | `launcherWindow.on('closed')` `:513–517` |
| Assistant overlay | `WindowHelper.ensureOverlayWindow` `:340`, `new BrowserWindow(...)` `:386` | `WindowHelper.overlayWindow` (`:61`) | **Yes** — `createWindow()` calls `ensureOverlayWindow()` at `:327` | `show: false`, `height: 1` (`:369–373`); never shown on load (`:429–432`) | `destroyOverlayWindow()` `:446–459` (Stop / force-stop) |
| Settings popup | `SettingsWindowHelper` | separate helper | Lazily | `show: false` | settings helper |
| Model selector | `ModelSelectorWindowHelper` | separate helper | Lazily | `show: false` | model-selector helper |
| Cropper | `CropperWindowHelper` | separate helper | Lazily | per helper | per helper |

Key fact: the overlay renderer is created and fully loaded **at application launch**, before any session exists (`WindowHelper.ts:327`, `:386`). It is not visible, but it is running: its `App` mounts `NativelyInterface`, calls `analytics.trackAssistantStart()` (`App.tsx:71–73`) and installs the complete `useIpc` subscription map (`NativelyInterface.tsx:240–248`, `:972–1125`).

### B.2 Authoritative state (main process)

| State | Owner | Written by | Meaning / risk |
|---|---|---|---|
| `launcherWindow`, `overlayWindow` | `WindowHelper` | create / destroy | Null and destroyed are distinct states; see D-12. |
| `currentWindowMode: 'launcher' \| 'overlay'` | `WindowHelper` (`:65`) | `switchToOverlay` `:699`, `switchToLauncher` `:790` | Describes the **last chosen surface**, not actual visibility. |
| `isWindowVisible` | `WindowHelper` | `hideMainWindow` `:608`, `switchTo*` `:756`, `:818`, `createWindow` `:316`, `restoreLauncherWindow` `:467` | **Not** written by `showOverlay`/`hideOverlay` (`:625–666`); drifts from the real window state. |
| `isMeetingActive` | `AppState` (`:286`) | `startMeeting` `:2838`, `endMeeting` `:2988`, `forceEndMeeting` `:3139` | Session truth used by the Ctrl+B gate (`:3612`). |
| `_sessionState` | `AppState` (`:317`) | `starting` `:2760`, `active` `:2839`, `stopping` `:2990`, `idle` `:2792`, `:3116`, `:3174` | Broadcast to renderers (`:717–723`) but not rendered as "stopping" anywhere. |
| `_isDraining` | `AppState` (`:293`) | `endMeeting` `:2989`, `:3103` | Keeps trailing STT finals alive during teardown. |
| `sessionActive` | `KeybindManager` (`:69`) | `startMeeting` `:2836`, `endMeeting` `:2992`, `forceEndMeeting` `:3176` | Gate for the global Ctrl+B registration. |
| `activeMode` | `KeybindManager` (`:65`) | `switchToOverlay` / `switchToLauncher` via `setMode` (`:76–82`) | Gate for every chat shortcut, including Ctrl+1. |
| `isExpanded` | overlay renderer (`NativelyInterface.tsx:354`) | Hide/Show chip, `toggle-expand`, `ensure-expanded` | Drives the overlay's own `hideOverlay()` / `showOverlay()` calls (`:691–711`). |

### B.3 Independent owners of visibility and shortcuts

**Visibility controllers (9):**

1. `WindowHelper.switchToOverlay` / `switchToLauncher` — the primitives.
2. `AppState.toggleAssistantOverlay` — Ctrl+B global path (`main.ts:3602`).
3. `AppState.toggleMainWindow` — `toggle-window` IPC, tray item, macOS menu item (`main.ts:3571`).
4. `AppState.showMainWindow` / `hideMainWindow` — `show-window` / `hide-window` IPC (`main.ts:3560–3568`).
5. Overlay Hide chip → `hide-overlay` IPC → `WindowHelper.hideOverlay` (`NativelyInterface.tsx:53` → `TopPill` → `:706`).
6. Overlay `close` listener → `hideOverlay()` or `switchToLauncher()` (`WindowHelper.ts:555–562`).
7. Launcher `close` listener → `hide()` (`WindowHelper.ts:496–502`).
8. `restoreWindowsAfterScreenshot` (`main.ts:3722–3731`).
9. `app.on('activate')` → `toggleMainWindow()` (`main.ts:4700–4707`).

**Shortcut owners (6):**

1. `KeybindManager` `globalShortcut` registrations (`:277–319`).
2. macOS application-menu accelerator `Toggle Visibility` → `toggleMainWindow()` (`KeybindManager.ts:425–431`).
3. Launcher renderer `keydown` → `toggleWindow()` (`Launcher.tsx:217–240`).
4. Overlay renderer `keydown` → `toggleWindow()` and all chat actions (`NativelyInterface.tsx:1175–1207`).
5. Tray menu `Toggle Window` item (`main.ts:3974–3978`).
6. Global-shortcut chat dispatcher that broadcasts `global-shortcut` to **all** windows (`main.ts:589–595`).

There is no single "visibility controller" and no single "shortcut controller" in the current code.

---

## C. Exact call chains for the eight workflows

### C.1 Application launch → launcher creation/display

```
app.whenReady()                                   main.ts:4442
  → initializeApp()                               main.ts:4377
    → appState.createWindow()                     main.ts:4520
      → AppState.createWindow()                   main.ts:3556
        → WindowHelper.createWindow()             WindowHelper.ts:192
          → new BrowserWindow(launcherSettings)   WindowHelper.ts:272   [show:false :223]
          → loadUrlWithRetry(?window=launcher)     WindowHelper.ts:320
          → webContents.once('did-finish-load')   WindowHelper.ts:313
              → this.switchToLauncher()           WindowHelper.ts:315
                  → currentWindowMode='launcher'  WindowHelper.ts:790
                  → KeybindManager.setMode('launcher')  WindowHelper.ts:791
                  → launcher.show()/focus()       WindowHelper.ts:815–816
              → this.isWindowVisible = true       WindowHelper.ts:316
          → await this.ensureOverlayWindow()      WindowHelper.ts:327
              → new BrowserWindow(overlaySettings) WindowHelper.ts:386 [show:false :373]
              → loadUrlWithRetry(?window=overlay)  WindowHelper.ts:422
              → setupOverlayWindowListeners()      WindowHelper.ts:429–432
    → appState.prewarmSttProviders()              main.ts:4525–4530
    → KeybindManager.registerGlobalShortcuts()    main.ts:4545
```

Result **[S-C]**: one visible launcher, one hidden-but-loaded overlay, no session (`isMeetingActive=false`, `_sessionState='idle'`), no audio pipeline (`setupSystemAudioPipeline()` is not called here; the boot call is commented out at `main.ts:689`).

### C.2 Start Natively → session startup → audio/STT → (expected) overlay display

```
Launcher CTA onClick (isMeetingActive === false)      Launcher.tsx:777
  → App.handleStartMeeting()                          App.tsx:381
    → electronAPI.startMeeting({audio,…})             App.tsx:400–404 → preload.ts:878
      → ipcMain 'start-meeting'                       ipcHandlers.ts:2706
        → AppState.startMeeting(metadata)             main.ts:2753
          → guard isMeetingActive || 'starting'       main.ts:2756–2759
          → _sessionState='starting'; new sessionId   main.ts:2760–2761
          → await _pendingTeardown                    main.ts:2769–2779
          → mic / screen-recording permission checks  main.ts:2787–2820
          → windowHelper.resetOverlayPosition()       main.ts:2826
          → windowHelper.switchToLauncher(false)      main.ts:2832   ← launcher kept
          → void ensureOverlayWindow()                main.ts:2833–2835 ← prepared hidden
          → KeybindManager.setSessionActive(true)     main.ts:2836
          → isMeetingActive=true, state='active'      main.ts:2838–2839
          → broadcastMeetingState()                   main.ts:2840
          → webContents.send('session-reset')         main.ts:2881–2882
          → return {success:true}                     ipcHandlers.ts:2709
          └ setTimeout(0)                             main.ts:2888
              → reconfigureAudio()/setupSystemAudioPipeline()  main.ts:2898–2903
              → systemAudioCapture.start() + googleSTT.start() main.ts:2914–2915
              → microphoneCapture.start() + googleSTT_User.start() main.ts:2918–2919
```

Renderer follow-up after success: **none** (`App.tsx:405–409` — comment explicitly says the window swap is main's responsibility and no `setWindowMode` is sent).

Result **[S-C]**: session + audio + STT start, launcher stays visible with "Meeting ongoing", overlay stays hidden. This directly contradicts the approved requirement C (overlay shown, launcher hidden).

### C.3 Ctrl+B → registration → main handler → window visibility

```
globalShortcut.register('CommandOrControl+B', cb)    KeybindManager.ts:286–288
  (only if shouldRegister('general:toggle-visibility') → sessionActive)  :101
  → cb → onShortcutTriggeredCallbacks('general:toggle-visibility')       :287
    → AppState.onShortcutTriggered(actionId)          main.ts:452
      → not in screenshotOrChatActions                main.ts:455–480
      → actionId === 'general:toggle-visibility'      main.ts:482–485
        → AppState.toggleAssistantOverlay()           main.ts:3602
          → if (!isMeetingActive) return              main.ts:3612–3615
          → overlay = getOverlayWindow()              main.ts:3617
          → if missing/destroyed: ensure + switch     main.ts:3620–3635
          → if overlay.isVisible():                   main.ts:3638
               hideOverlay(cid)                       main.ts:3641
               switchToLauncher(true)                 main.ts:3646
                 → launcher.show()/focus()            WindowHelper.ts:815–816
                 → overlay.hide()                     WindowHelper.ts:822
                 → setMode('launcher')                WindowHelper.ts:791
            else:
               switchToOverlay(cid)                   main.ts:3649
                 → setMode('overlay')                 WindowHelper.ts:700
                 → send('ensure-expanded')            WindowHelper.ts:703
                 → show()/focus()                     WindowHelper.ts:753–756
                 → launcher.hide()                    WindowHelper.ts:784
```

Second, competing path when the overlay renderer has focus:

```
window keydown                                 NativelyInterface.tsx:1175
  → p('toggleVisibility')                      :1191
  → api.toggleWindow()                         :1191 → preload.ts:597
    → ipc 'toggle-window'                      ipcHandlers.ts:290
      → AppState.toggleMainWindow()            main.ts:3571
        → mode === 'overlay'                   main.ts:3584
          → overlay.show(); overlay.focus();
          → webContents.send('toggle-expand')  main.ts:3591
            → NativelyInterface setIsExpanded(p => !p)  :972
```

Third path when the launcher has focus:

```
window keydown                                 Launcher.tsx:217–240
  → p('toggleVisibility')                      :219
  → api.toggleWindow()                         :221
    → AppState.toggleMainWindow()              main.ts:3571
      → mode === 'launcher'                    main.ts:3581
        → WindowHelper.toggleMainWindow()      WindowHelper.ts:676
          → isWindowVisible ? hideMainWindow() : showMainWindow(true)
            → hideMainWindow hides launcher AND overlay, opacity 0   :603–609
```

### C.4 Home/logo → renderer → preload → IPC → launcher display

```
TopPill logo button onClick={onLogoClick}        TopPill.tsx:36
  → NativelyInterface onLogoClick                 :1399
  → api.setWindowMode('launcher')                 :1399 → preload.ts:896
    → ipc 'set-window-mode'                       ipcHandlers.ts:197
      → WindowHelper.setWindowMode('launcher')    WindowHelper.ts:~826
        → switchToLauncher(undefined)             WindowHelper.ts:788
          → currentWindowMode='launcher'; setMode('launcher')  :790–791
          → launcher.show()/focus()               :815–816
          → overlay.hide()                        :822
```

No call to `endMeeting`, `forceEndMeeting`, `systemAudioCapture.stop`, `microphoneCapture.stop` or any STT method in this chain **[S]**. Session state is untouched, so the launcher's existing `isMeetingActive=true` still renders "Meeting ongoing" (`Launcher.tsx:790–838`).

### C.5 Meeting Ongoing → click → existing overlay restoration

```
Launcher CTA onClick (isMeetingActive === true)  Launcher.tsx:768–775
  → window.electronAPI.setWindowMode('overlay', true)  :774
    → preload.ts:896 → ipcHandlers.ts:197
      → WindowHelper.switchToOverlay(true)       WindowHelper.ts:697
        → overlay.showInactive() + focus()       :753–754  (or :734–746 with content protection)
        → launcher.hide()                        :784
```

No `ensureOverlayWindow`, no `startMeeting`, no capture/STT call **[S]**. The existing `overlayWindow` instance is reused.

### C.6 Ctrl+1 → registration → visibility/mode checks → generation

```
DEFAULT_KEYBINDS chat:whatToAnswer = CommandOrControl+1   KeybindManager.ts:24
registerGlobalShortcuts()                                 :277
  → shouldRegister('chat:whatToAnswer')
      activeMode === 'overlay' → true                     :102
      launcher mode → false (falls through to :118)       :99–118
  → globalShortcut.register(acc, cb)                      :286–288
    → AppState.onShortcutTriggered('chat:whatToAnswer')   main.ts:452
      → screenshotOrChatActions includes it               :455–474
      → if mode==='launcher' switchToOverlay(true)        :475–480   (normally unreachable)
      → actionMap['chat:whatToAnswer']='whatToAnswer'     :577–588
      → BrowserWindow.getAllWindows().send('global-shortcut',{action})  :589–595
        → overlay preload onGlobalShortcut                preload.ts:1297–1304
        → useIpc map acts.whatToAnswer                    NativelyInterface.tsx:1095
          → handleWhatToSay()                             :759
```

There is **no** `overlay.isVisible()` and **no** `overlay.isFocused()` check anywhere on this path **[S]**. The only gates are `activeMode` (KeybindManager) and `sessionActive`.

Second, competing path when the overlay has focus:

```
overlay keydown → p('whatToAnswer') → handleWhatToSay()   NativelyInterface.tsx:1179
```

Both paths converge on the same function; the `isProcessingRef` guard (`:760`) prevents a duplicate concurrent generation, but not a duplicate invocation.

### C.7 Hide button → visibility handling

```
TopPill Hide chip onClick={onToggle}             TopPill.tsx:53
  → NativelyInterface onToggle                   :1396
  → setIsExpanded(!isExpanded)                   :1396
    → effect                                     :691–711
      → isExpanded === false                     :705
      → setTimeout(() => api.hideOverlay(), 400) :706
        → preload.hideOverlay()                  preload.ts:601
          → ipc 'hide-overlay'                   ipcHandlers.ts:306
            → WindowHelper.hideOverlay()         WindowHelper.ts:655
              → overlay.hide()                   :660
```

No change to `currentWindowMode`, `KeybindManager.activeMode`, `isWindowVisible`, `isMeetingActive`, captures or STT **[S]**.

### C.8 Stop button → shutdown → cleanup → launcher

```
TopPill Stop button onClick={onQuit}             TopPill.tsx:81
  → NativelyInterface onQuit                     :1397
  → onEndMeeting() (prop supplied by App)        :1397
    → App.handleEndMeeting()                     App.tsx:419
      → electronAPI.endMeeting()                 App.tsx:441 → preload.ts:879
        → ipc 'end-meeting'                      ipcHandlers.ts:2716
          → AppState.endMeeting()                main.ts:2951
            → guard !isMeetingActive && !_isDraining  :2954–2957
            → isMeetingActive=false; _isDraining=true; state='stopping'  :2988–2990
            → KeybindManager.setSessionActive(false)  :2992   ← Ctrl+B unregistered
            → broadcastMeetingState()             :2993
            → windowHelper.setWindowMode('launcher')  :3004 ← launcher shown now
            → systemAudioCapture.stop(); microphoneCapture.stop()  :3008–3009
            → googleSTT.finalize(); googleSTT_User.finalize()      :3020–3021
            → _pendingTeardown = (async …)        :3032
                → 250 ms drain                    :3057
                → googleSTT.stop(); googleSTT_User.stop()  :3060–3061
                → intelligenceManager.stopMeeting()        :3065
                → RAG cleanup                              :3068–3085
                → finally: destroy captures, null STT      :3096–3105
                → if (!isMeetingActive && _sessionId===endedSessionId)
                     destroyOverlayWindow()                :3115
                     _sessionState='idle'; _sessionId=null  :3116–3118
```

`endMeeting` returns immediately after scheduling the async teardown (`:3122–3126` comment), so the renderer's Stop action is not blocked.

---

## D. State-transition table

Legend: **L** = launcher window, **O** = overlay window, **A** = audio/STT, **M** = `currentWindowMode` / `KeybindManager.activeMode`, **S** = `isMeetingActive` / `_sessionState`.

| # | State | Entered by | S | A | L | O | M | Notes |
|---|---|---|---|---|---|---|---|---|
| S0 | Idle at launch | app ready | `false` / `idle` | none | visible | hidden (loaded) | launcher / launcher | Overlay renderer is running but not shown (`WindowHelper.ts:327`, `:386`; `show:false` `:373`). |
| S1 | Idle launcher hidden | Ctrl+B in focused launcher (renderer path) | `false` / `idle` | none | **hidden** | hidden (opacity 0) | launcher / launcher | `hideMainWindow` hides both (`:603–609`). Ctrl+B cannot restore (D-03). Recoverable from tray/dock. |
| S2 | Starting | Start click | `false`→`true` / `starting` | not yet | visible | hidden | launcher / launcher | `startMeeting` guard + `setTimeout(0)` audio init. |
| S3 | Active, launcher visible | after `startMeeting` | `true` / `active` | capturing + STT started | **visible** | hidden | launcher / launcher | Requirement C expects overlay here; code keeps launcher (D-01). Ctrl+B registered (`:2836`). |
| S4 | Active, overlay visible | Ctrl+B (S3) or Meeting Ongoing | `true` / `active` | running | hidden | visible | overlay / overlay | Chat shortcuts (Ctrl+1) become registered here. |
| S5 | Active, launcher visible via Ctrl+B | Ctrl+B (S4) | `true` / `active` | running | visible | hidden | launcher / launcher | Not a pure hide: `switchToLauncher(true)` (`main.ts:3646`). Violates required "never switch". |
| S6 | Active, overlay hidden via Hide chip | Hide (S4) | `true` / `active` | running | hidden | **hidden** | **overlay / overlay** | `hideOverlay` only (`:655–664`); mode and Ctrl+1 stay armed (D-06). |
| S7 | Active, launcher after Home | logo click (S4) | `true` / `active` | running | visible | hidden | launcher / launcher | Session untouched; CTA "Meeting ongoing" still true (`Launcher.tsx:768–775`). |
| S8 | Stopping | Stop (S4/S5/S7) | `false` / `stopping` | stopping, 250 ms drain | visible | hidden then destroyed | launcher / launcher | Launcher CTA flips to "Start Natively" immediately (D-07). |
| S9 | Stopped / idle | teardown finally | `false` / `idle` | destroyed | visible | destroyed | launcher / launcher | `destroyOverlayWindow` + `_sessionId=null` (`:3114–3118`). |
| S10 | Force-stopped | Live toggle off | `false` / `idle` | stopped + destroyed | visible | destroyed | launcher / launcher | `forceEndMeeting` (`:3132–3177`). |

**Invariant violations visible in the table**

- S3 has an active session with a visible launcher and no assistant — the only state the approved requirement C forbids.
- S5 and S6 are two different "overlay hidden" states with different shortcut arming; no code derives shortcut state from actual visibility.
- S8 shows a "Start" CTA during teardown.

---

## E. Ctrl+B and Ctrl+1 registration/behaviour matrix

### E.1 Registration matrix

| Stage | `sessionActive` | `activeMode` | Ctrl+B global | Ctrl+1 global | Other Ctrl+B owners |
|---|---|---|---|---|---|
| App launch, no session | `false` | `launcher` | **Not registered** (`KeybindManager.ts:101`) | Not registered (`:102`, falls to `:118`) | Launcher keydown (`Launcher.tsx:219`), macOS menu accelerator (`KeybindManager.ts:425–431`), tray menu click |
| Session started, launcher visible | `true` | `launcher` | Registered (session gate first) | Not registered | same |
| Overlay visible | `true` | `overlay` | Registered | **Registered** | overlay keydown (`NativelyInterface.tsx:1191`), launcher keydown if focused, macOS menu |
| Overlay hidden via Hide chip | `true` | `overlay` | Registered | **Still registered** | same |
| Launcher after Home | `true` | `launcher` | Registered | Not registered | same |
| Stopping | `false` | `launcher` | Unregistered (`main.ts:2992`) | Not registered | launcher keydown still hides the window |
| Stopped | `false` | `launcher` | Unregistered | Not registered | same |

Notes:
- `shouldRegister` contains dead code: line `:105` returns `true` for `general:toggle-visibility` in launcher mode, but line `:101` already returns for that id, so `:105` is unreachable **[S]**.
- Every mode change calls `registerGlobalShortcuts()` → `globalShortcut.unregisterAll()` (`:278`) → re-register. There is a brief window with no shortcuts; the 10 s health check (`:358–370`) can recover dropped registrations, but it uses the same `shouldRegister` gate.
- Repeated registration does **not** create duplicate global handlers because of `unregisterAll()`; duplicate *owners* (matrix columns) are a separate problem (D-05).

### E.2 Behaviour matrix — Ctrl+B

| Stage | Actual result | Required result | Verdict |
|---|---|---|---|
| Launcher focused, no session | Renderer keydown → `toggle-window` → `hideMainWindow()` hides launcher **and** overlay; second press impossible because no window has focus and no global shortcut exists | Launcher hides; second press shows it again | **FAIL** (D-03) |
| Session active, launcher visible (S3/S5/S7) | `toggleAssistantOverlay` → overlay hidden branch → `switchToOverlay` → launcher hidden, overlay shown | Launcher hides/shows; never switches surface | **FAIL** (D-04) |
| Session active, overlay visible (S4) | `hideOverlay()` **and** `switchToLauncher(true)` → launcher shown | Overlay hides; nothing else appears | **FAIL** (D-02) |
| Session active, overlay hidden via Hide chip (S6) | `switchToOverlay` → overlay shown | Overlay shown | PASS (but by mode coincidence, not visibility) |
| Session stopping/stopped | Global shortcut unregistered; launcher keydown can still hide the window | No action, or launcher hide/show only | PARTIAL / FAIL |
| Overlay focused, overlay visible | Global shortcut **and** renderer keydown can both run: `hideOverlay + switchToLauncher` and `toggle-expand` | One deterministic hide | **FAIL** (D-05) |
| Any stage | No session is started or stopped by Ctrl+B | No session change | PASS |
| Any stage | `ensureOverlayWindow` reuse + in-flight promise prevents duplicate overlays | No duplicate windows | PASS (static), **[NV]** under rapid Ctrl+B |

### E.3 Behaviour matrix — Ctrl+1

| Stage | Actual result | Required result | Verdict |
|---|---|---|---|
| App launched, no session | Not registered; overlay renderer not focused; launcher has no Ctrl+1 handler → nothing | No action | **PASS** |
| Active session, overlay visible | Registered → broadcast to all windows → overlay `handleWhatToSay()` | Generate answer | **PASS** |
| Active session, overlay hidden via Ctrl+B (current code shows launcher) | Mode becomes launcher, shortcuts unregistered → nothing | No action | **PASS by accident**, for the wrong reason |
| Active session, overlay hidden via Hide chip (S6) | Mode still `overlay`, shortcut still registered → `handleWhatToSay()` runs in the hidden renderer; `setIsExpanded(true)` then calls `api.showOverlay()` (`:698`) → overlay reappears with an answer | No action while hidden | **FAIL** (D-06) |
| Active session, launcher after Home (S7) | Mode launcher → unregistered → nothing | No action | **PASS** |
| Session stopped / stopping | `sessionActive=false`, mode launcher → unregistered → nothing | No action | **PASS** |
| Overlay visible but focus elsewhere | Mode-only gate; dispatch is broadcast to all windows (`main.ts:589–595`) | Only when overlay is the active working interface | **FAIL** (no focus/visibility check) |
| Dedicated "What to answer?" button | Calls the same `handleWhatToSay()` (`NativelyInterface.tsx:1358`) | Same pipeline | **PASS** |

---

## F. Hide versus Stop

| Aspect | Hide (existing chip) | Ctrl+B (global) | Home / logo | Stop (square button) |
|---|---|---|---|---|
| UI element | `TopPill.tsx:48–66` | OS shortcut | `TopPill.tsx:34–45` | `TopPill.tsx:78–91` |
| Handler | `onToggle` → `setIsExpanded(false)` → `hide-overlay` | `toggleAssistantOverlay` | `set-window-mode('launcher')` | `onEndMeeting` → `end-meeting` |
| Window result | Overlay hidden after 400 ms; launcher stays hidden | Overlay hidden **and launcher shown** | Launcher shown; overlay hidden | Launcher shown synchronously; overlay destroyed later |
| Session | continues | continues | continues | ends |
| Audio capture | continues | continues | continues | `stop()` + `destroy()` |
| STT | continues | continues | continues | `finalize()` → `stop()` → `removeAllListeners()` → `null` |
| Background work (RAG / intelligence) | continues | continues | continues | `stopMeeting`, `stopLiveIndexing`, RAG cleanup |
| `currentWindowMode` after | `overlay` (unchanged) | `launcher` | `launcher` | `launcher` |
| `isWindowVisible` after | unchanged (`true`) | `true` | `true` | `true` |
| Ctrl+1 after | **still armed** | unregistered | unregistered | unregistered |
| Return path | Ctrl+B (if still registered) | Ctrl+B | Meeting Ongoing CTA | Start Natively |
| Drift from requirements | Hide is semantically correct, but state bookkeeping is not (D-08) | Not a pure hide (D-02/D-04) | Correct (PASS) | Correct teardown (PASS), but no stopping UI (D-07) |

Hide and Stop are correctly separated in code; Ctrl+B is currently a third, hybrid behaviour.

---

## G. Defect register

### D-01 — Start Natively never reveals the assistant overlay

- **Severity:** Critical
- **File / function:** `electron/main.ts` → `AppState.startMeeting` (`:2753–2949`); `src/App.tsx` → `handleStartMeeting` (`:381–416`)
- **Current implementation:** after permissions, the method calls `this.windowHelper.switchToLauncher(false)` (`:2832`), prepares the overlay hidden (`:2833–2835`) and updates session state (`:2838–2840`). The comment states the intent explicitly: *"Start Natively must NOT reveal the assistant overlay. The launcher stays visible with 'Meeting ongoing'; Ctrl+B is what reveals the assistant."* The renderer deliberately sends no follow-up `setWindowMode` (`App.tsx:405–409`).
- **Expected behaviour:** Start shows the existing overlay and hides the launcher, so the user is not left on a launcher displaying an ongoing meeting.
- **Evidence:** `main.ts:2828–2840`; `App.tsx:405–409`; `Launcher.tsx:777`.
- **Impact:** The primary Start action ends in the wrong surface. The user must discover Ctrl+B to reach the assistant. Every downstream test that assumes "Start → overlay" fails.
- **Recommended minimal repair:** replace the `switchToLauncher(false)` call with a single `switchToOverlay()` after `ensureOverlayWindow()` resolves (or after the synchronous overlay preparation, given the window already exists), keeping the IPC response before slow audio init. Do not reveal before the overlay exists; keep `resetOverlayPosition()`.
- **Verification:** source-only. **[NV]** actual reveal/timing.

### D-02 — Ctrl+B in the overlay hides it and returns the user to the launcher

- **Severity:** High
- **File / function:** `electron/main.ts` → `AppState.toggleAssistantOverlay` (`:3638–3647`); `electron/WindowHelper.ts` → `switchToLauncher` (`:788–824`)
- **Current implementation:**
  ```ts
  if (overlay.isVisible()) {
    this.windowHelper.hideOverlay(cid);
    // Never strand the user on an empty desktop: bring the launcher back
    this.windowHelper.switchToLauncher(true);
  }
  ```
  (`main.ts:3638–3646`)
- **Expected behaviour:** Ctrl+B on the overlay hides the overlay only; the launcher must not appear; a second press restores the same overlay.
- **Evidence:** `main.ts:3638–3646`; `WindowHelper.ts:817–822` (shows launcher, hides overlay).
- **Impact:** Ctrl+B alternates launcher ↔ overlay instead of toggling visibility. Requirement B is violated and the state machine gains an undocumented S5 state.
- **Recommended minimal repair:** remove the `switchToLauncher(true)` from the hide branch; keep `hideOverlay(cid)`. Launcher return belongs to Home only. Note the coupling with D-06 below before making this change.

### D-03 — Ctrl+B is not registered before a session; the launcher fallback cannot restore the window

- **Severity:** High
- **File / function:** `electron/services/KeybindManager.ts` → `shouldRegister` (`:99–108`); `src/components/Launcher.tsx` → keydown effect (`:217–240`); `electron/WindowHelper.ts` → `hideMainWindow` (`:603–609`)
- **Current implementation:** `if (actionId === 'general:toggle-visibility') return this.sessionActive;` (`:101`). Pre-session, the only Ctrl+B path is the focused launcher's DOM handler, which calls `toggle-window` → `toggleMainWindow` → `WindowHelper.toggleMainWindow` → `hideMainWindow()` hiding both windows. With no window focused and no global registration, the second press cannot arrive.
- **Expected behaviour:** Ctrl+B hides and shows the launcher while no session exists.
- **Evidence:** `KeybindManager.ts:99–107`; `Launcher.tsx:217–222`; `WindowHelper.ts:676–682`, `:603–609`; `main.ts:3581–3583`.
- **Impact:** A user who presses Ctrl+B on the idle launcher loses the window; only the tray (`main.ts:3967–3973`) or dock `activate` (`:4700–4707`) can restore it. Requirement B's launcher row cannot work.
- **Recommended minimal repair:** remove the session gate for `general:toggle-visibility` and make the single main-process handler branch on session state: no session → launcher hide/show; session → overlay hide/show. Do not re-enable the renderer chord.

### D-04 — Ctrl+B on the launcher during a session opens the overlay

- **Severity:** High
- **File / function:** `electron/main.ts` → `toggleAssistantOverlay` (`:3649`) → `WindowHelper.switchToOverlay` (`:697–786`)
- **Current implementation:** when the overlay is not visible and a session is active, Ctrl+B calls `switchToOverlay(cid)`, which hides the launcher (`:784`) and shows the overlay.
- **Expected behaviour:** on the launcher, Ctrl+B hides/shows the launcher; it must never switch surfaces.
- **Evidence:** `main.ts:3648–3650`; `WindowHelper.ts:697–700`, `:784`.
- **Impact:** Same chord, opposite meanings depending on the last surface. Combined with D-02, Ctrl+B is a launcher/overlay switch, not a visibility toggle.
- **Recommended minimal repair:** branch on the currently visible window, not on the overlay's visibility alone: if the launcher is visible → launcher hide/show; if the overlay is visible → overlay hide/show.

### D-05 — Multiple competing Ctrl+B owners, including a renderer path that expands instead of hides

- **Severity:** High
- **File / function:** `KeybindManager.registerGlobalShortcuts` (`:277–319`); `main.ts` `onShortcutTriggered` (`:482–485`); `NativelyInterface.tsx` keydown (`:1191`); `Launcher.tsx` keydown (`:219–221`); `AppState.toggleMainWindow` (`:3571–3593`); `KeybindManager.updateMenu` (`:425–431`)
- **Current implementation:** the same chord can reach (a) the OS global shortcut → `toggleAssistantOverlay`, (b) the overlay DOM handler → `toggle-window` → `send('toggle-expand')` → `setIsExpanded(p => !p)`, (c) the launcher DOM handler → `toggle-window`, and (d) on macOS, the application-menu accelerator `Toggle Visibility` → `toggleMainWindow()`. The overlay path is a collapse/expand, not a hide.
- **Expected behaviour:** one owner per chord; overlay Ctrl+B hides/shows the whole overlay, never resizes it.
- **Evidence:** `main.ts:3584–3592` (`toggle-expand`); `NativelyInterface.tsx:972` (`onToggleExpand`), `:1191`; `Launcher.tsx:219–221`; `KeybindManager.ts:425–431`.
- **Impact:** Reported symptom class: Ctrl+B sometimes collapses the assistant, sometimes hides it and shows the launcher. Impossible to reason about from state alone.
- **Recommended minimal repair:** make the main process the only owner of `general:toggle-visibility`. Remove both renderer chords (or route them to the same IPC that performs a pure hide/show), and drop the `Toggle Visibility` menu accelerator or point it at the same handler. Keep the registration-failure notice.
- **[NV]** whether macOS delivers the chord to both the menu and the global shortcut.

### D-06 — Ctrl+1 is gated by window mode, not by overlay visibility or focus

- **Severity:** High
- **File / function:** `KeybindManager.shouldRegister` (`:99–102`); `main.ts` `onShortcutTriggered` chat branch (`:577–595`); `NativelyInterface.tsx` `onGlobalShortcut` (`:1091–1105`) and show/hide effect (`:691–711`)
- **Current implementation:** `if (this.activeMode === 'overlay') return true;` (`:102`) arms every chat shortcut whenever the mode is overlay, even if the overlay was hidden by the Hide chip (`hideOverlay` never changes the mode). The dispatcher broadcasts `global-shortcut` to all windows (`:589–595`), and the overlay handler has no visibility guard. `handleWhatToSay` calls `setIsExpanded(true)` (`:763`), whose effect calls `api.showOverlay()` (`:698`), so a hidden overlay is revealed.
- **Expected behaviour:** generation only when the session is active **and** the overlay is visible and the active working interface.
- **Evidence:** `KeybindManager.ts:99–102`; `WindowHelper.hideOverlay:655–664` (no mode change); `main.ts:589–595`; `NativelyInterface.tsx:691–700`, `:759–764`, `:1091–1095`.
- **Impact:** Ctrl+1 can generate an answer while the assistant is hidden and can pop the overlay open — a direct violation of the approved Ctrl+1 table. This is also the trap in the D-02 repair: making Ctrl+B a pure hide leaves `activeMode='overlay'`, so Ctrl+1 would then fire while hidden.
- **Recommended minimal repair:** gate the chat actions in the main process on `this.isMeetingActive && overlay.isVisible() && overlay.isFocused()` (or an explicit "working interface" flag set by show/hide), and only then dispatch. Keep the dedicated button path unchanged.

### D-07 — No stopping state in the launcher; the CTA flips to "Start Natively" immediately

- **Severity:** Medium
- **File / function:** `main.ts` `endMeeting` (`:2988–2993`); `preload.onMeetingStateChanged` (`:604–608`); `Launcher.tsx` (`:189–195`, `:764–780`)
- **Current implementation:** Stop sets `isMeetingActive=false` synchronously and broadcasts `{isActive:false, state:'stopping', sessionId}`. The launcher callback destructures only `isActive` (`:192`) and stores a boolean, so `state` is discarded. The CTA renders "Start Natively" as soon as `isActive` is false (`:768–838`).
- **Expected behaviour:** during shutdown show an appropriate stopping state and prevent duplicate actions.
- **Evidence:** `main.ts:2988–2993`, `:717–723`; `preload.ts:604–608`; `Launcher.tsx:192–194`, `:768–779`.
- **Impact:** A user can click Start during the 250 ms+ teardown. `startMeeting` awaits `_pendingTeardown` (`:2769–2779`), so a duplicate session is prevented, but the UI gives no feedback and appears unresponsive.
- **Recommended minimal repair:** consume the existing `state` field in the launcher, render a disabled "Stopping…" CTA while `state === 'stopping'`, and keep the current main-process guard.

### D-08 — Two competing visibility truths (`isWindowVisible` vs `BrowserWindow.isVisible()`)

- **Severity:** Medium
- **File / function:** `WindowHelper.showOverlay` (`:625–653`), `hideOverlay` (`:655–666`), `hideMainWindow` (`:603–609`), `toggleMainWindow` (`:676–682`)
- **Current implementation:** `showOverlay`/`hideOverlay` never write `isWindowVisible`. Only `hideMainWindow` and `switchTo*` do. `toggleMainWindow` decides hide-vs-show from the stale flag.
- **Expected behaviour:** one visibility truth used by every toggle.
- **Evidence:** `WindowHelper.ts:603–609`, `:625–666`, `:676–682`.
- **Impact:** After Hide or after `show-overlay`, `isWindowVisible` reports the previous state. Tray/dock toggles (`main.ts:4705–4706`) and `toggleMainWindow` can therefore hide an already-visible surface or fail to show a hidden one.
- **Recommended minimal repair:** derive `isWindowVisible` from the active `BrowserWindow.isVisible()` inside the primitives, or remove the field and use `getMainWindow()?.isVisible()` everywhere.

### D-09 — `switchToOverlay` changes mode and hides the launcher before proving the overlay exists

- **Severity:** Medium
- **File / function:** `WindowHelper.switchToOverlay` (`:697–786`)
- **Current implementation:** it sets `currentWindowMode='overlay'` and `KeybindManager.setMode('overlay')` (`:699–700`), then checks the overlay. If no usable overlay exists it only logs (`:781–782`) but still hides the launcher (`:783–785`).
- **Expected behaviour:** never leave the user with no visible window and a mode that claims the overlay is active.
- **Evidence:** `WindowHelper.ts:697–703`, `:781–785`; call sites `main.ts:3649`, `:3728`, `:478`.
- **Impact:** If overlay creation failed, was destroyed, or the renderer crashed, Ctrl+B can produce an empty desktop with mode `overlay`, Ctrl+1 armed, and the launcher hidden.
- **Recommended minimal repair:** move the mode assignment and launcher hide below the overlay usability check; return a boolean so `toggleAssistantOverlay` can fall back to the launcher.

### D-10 — Auxiliary always-on-top windows are outside the visibility toggles

- **Severity:** Medium
- **File / function:** `WindowHelper.hideMainWindow` (`:603–609`); `SettingsWindowHelper` (`:101–103`, `:190`); `ModelSelectorWindowHelper` (`:56–59`, `:147`)
- **Current implementation:** `hideMainWindow` hides only `launcherWindow` and `overlayWindow`. The settings popup is a separate `alwaysOnTop` window, given `setParentWindow(mainWin)` when shown; the model selector is likewise separate and `alwaysOnTop`.
- **Expected behaviour:** Ctrl+B must not leave auxiliary windows or controls floating independently.
- **Evidence:** `WindowHelper.ts:603–609`; `SettingsWindowHelper.ts:101–103`, `:190`; `ModelSelectorWindowHelper.ts:56–59`, `:147`.
- **Impact:** A settings popup opened from the overlay can remain visible over the launcher/desktop after Ctrl+B or Stop. Parent-window hide semantics differ by platform.
- **Recommended minimal repair:** have the single visibility controller hide/close the auxiliary helpers explicitly on Ctrl+B and Stop, rather than relying on parent-child behaviour.
- **[NV]** actual Windows/macOS child-window hide behaviour.

### D-11 — Launcher has no session/audio/STT status; the existing diagnostic snapshot is partly misleading

- **Severity:** Medium
- **File / function:** `AppState.getAudioPipelineDiagnostics` (`main.ts:734–750`); `ipcHandlers` `get-stt-pipeline-diagnostics` (`:316–325`); `Launcher.tsx` (no subscriber); `NativelyInterface.tsx` (`:986–990`); `SettingsOverlay.tsx` (`:577–585`)
- **Current implementation:** rich diagnostics already exist — `sessionActive`, `sessionState`, `sttProvider`, `microphone.capturing/sampleRate`, `systemAudio.capturing/sampleRate`, `sttConnected`, plus Sherpa diagnostics. Per-channel `stt-status` events carry `state/provider/error/channel`. Only Settings → Audio and the overlay consume them; the launcher consumes nothing but `meeting-state-changed`.
- **Expected behaviour / investigation answer:** the existing state and IPC are sufficient to display session status, audio capture status, active STT provider, STT state and errors on the launcher. No second status system is needed.
- **Evidence:** `main.ts:734–750`, `:717–723`; `ipcHandlers.ts:316–325`; `preload.ts:603–608`; `NativelyInterface.tsx:986–990`; `Launcher.tsx:182–195` (meeting-active only).
- **Impact / caveat:** `sttConnected: !!this.googleSTT` is `true` immediately after launch because `prewarmSttProviders()` constructs the providers (`main.ts:1868–1884`, called at `:4525–4530`). It is not a "transcription running" indicator. The trustworthy runtime signal is the per-channel `stt-status` stream.
- **Recommended minimal repair:** surface the existing `sessionState`, `sttProvider`, capture booleans and latest `stt-status` per channel on the launcher; relabel or replace `sttConnected` with the last reported channel state.

### D-12 — `getMainWindow()` can return a destroyed overlay

- **Severity:** Low
- **File / function:** `WindowHelper.getMainWindow` (`:567–573`)
- **Current implementation:**
  ```ts
  if (this.currentWindowMode === 'overlay' && this.overlayWindow) return this.overlayWindow;
  return this.launcherWindow;
  ```
  Neither branch checks `isDestroyed()`.
- **Expected behaviour:** callers never receive a destroyed `BrowserWindow`.
- **Evidence:** `WindowHelper.ts:567–573`; consumers include `main.ts:497–519`, `:3216–3290`, `SettingsWindowHelper.ts:305`.
- **Impact:** `destroyOverlayWindow` nulls the field, so the common path is safe; any other destruction (renderer crash + failed reload, external `close`) leaves mode `overlay` returning a dead object. Most consumers guard, but not all.
- **Recommended minimal repair:** add `!win.isDestroyed()` to both branches and fall back to the launcher.

### D-13 — Ctrl+B fires before input guards in both renderers

- **Severity:** Low
- **File / function:** `Launcher.tsx:218–221`; `NativelyInterface.tsx:1190–1191`
- **Current implementation:** the chord is handled before the `isInput` check (`NativelyInterface.tsx:1190`, guard used only for `processScreenshots`).
- **Expected behaviour:** typing Ctrl+B in a text field should not hide the window (or should be explicitly documented).
- **Evidence:** `NativelyInterface.tsx:1190–1191`; `Launcher.tsx:218–221`.
- **Impact:** Accidental window hide while composing text; on Windows Ctrl+B is not a common text shortcut, on macOS Cmd+B is bold in rich editors.
- **Recommended minimal repair:** move the visibility chord behind the existing `isInput` guard, or remove the renderer chord entirely as part of D-05.

---

## H. Requirements compliance matrix

| Requirement | Verdict | Evidence / defect |
|---|---|---|
| A. Launch shows the launcher; no active session | **PASS** | `WindowHelper.ts:272`, `:313–317`; `main.ts:4520`; `isMeetingActive=false` `:286` |
| A. No audio capture at launch | **PASS** | boot `setupSystemAudioPipeline()` commented out `main.ts:689`; only called at `:2344` (active session) and `:2903` |
| A. No active transcription at launch | **PARTIAL** | no capture/STT `start()` at boot, but `prewarmSttProviders()` constructs both providers (`main.ts:1868–1884`, `:4525–4530`) |
| A. Assistant overlay not visible or operating | **PARTIAL** | not visible (`show:false` `WindowHelper.ts:373`), but created and fully running from boot (`:327`, `:386`; `App.tsx:71–73`; `NativelyInterface.tsx:972–1125`) |
| B. Ctrl+B hides/shows the launcher (no session) | **FAIL** | D-03 |
| B. Ctrl+B hides/shows the overlay only | **FAIL** | D-02 |
| B. Ctrl+B never switches launcher ↔ overlay | **FAIL** | D-02, D-04 |
| B. Ctrl+B never starts/stops a session | **PASS** | `toggleAssistantOverlay` has no session calls (`main.ts:3602–3655`) |
| B. Ctrl+B creates no duplicate windows | **PASS (static)** | `ensureOverlayWindow` reuse + in-flight promise (`WindowHelper.ts:340–360`) |
| B. No floating auxiliary windows after Ctrl+B | **NOT VERIFIED / PARTIAL** | D-10 |
| C. Start creates a fresh session and initialises audio/STT | **PASS** | `main.ts:2753–2948` |
| C. Start shows the existing overlay and hides the launcher | **FAIL** | D-01 (`main.ts:2828–2835`) |
| D. Home/logo returns to the launcher, session stays active | **PASS** | `TopPill.tsx:36` → `:1399` → `ipcHandlers.ts:197` → `WindowHelper.ts:788–824` |
| D. Audio capture and transcription continue after Home | **PASS (static)** | no stop/destroy calls in the Home chain |
| D. Launcher shows Meeting Ongoing | **PASS** | `Launcher.tsx:189–195`, `:812–838` |
| D. No new global bare Home shortcut | **PASS** | no `Home` accelerator in `DEFAULT_KEYBINDS`; logo is a click target only |
| E. Meeting Ongoing restores the existing overlay | **PASS** | `Launcher.tsx:774` → `WindowHelper.ts:697` |
| E. No new overlay / no audio or STT restart | **PASS (static)** | chain contains no `ensureOverlayWindow`, capture or STT call |
| E. Start Natively shown when idle | **PASS** | `Launcher.tsx:768–838` |
| E. Stopping state shown; duplicate actions prevented | **FAIL (state) / PASS (guard)** | D-07; main guard `main.ts:2756` |
| F. Hide hides temporarily; session/services continue | **PASS** | `TopPill.tsx:53` → `:706` → `WindowHelper.ts:655–664` |
| F. Stop ends the session, stops audio/STT, cleans up, returns to idle launcher | **PASS** | `main.ts:2951–3128`, `:3113–3118` |
| F. Stop is immediately right of Hide | **PASS** | `TopPill.tsx:48–91` |
| F. Hide, Ctrl+B, Home and Stop not confused | **FAIL** | Ctrl+B is a hybrid of Hide and Home (D-02, D-04, D-05) |
| 3. Ctrl+1 no action with no session | **PASS** | `KeybindManager.ts:99–118` |
| 3. Ctrl+1 generates when overlay visible | **PASS** | `NativelyInterface.tsx:1091–1095`; button uses same handler |
| 3. Ctrl+1 no action when overlay hidden | **FAIL** | D-06 |
| 3. Ctrl+1 no action on launcher / after Home | **PASS** | mode launcher → not registered |
| 3. Ctrl+1 no action after Stop | **PASS** | `sessionActive=false` + mode launcher |
| 3. Ctrl+1 requires the overlay to be the active working interface | **FAIL** | no visibility/focus check (D-06) |
| 3. Existing What to Answer button preserved | **PASS** | `NativelyInterface.tsx:1358`, same `handleWhatToSay` |
| 3. No duplicate registration handlers | **PASS** | `unregisterAll()` before register (`KeybindManager.ts:278`) |
| 4. Existing diagnostics can display session/audio/STT status | **PARTIAL (capability exists, not wired)** | D-11 |

---

## I. Test plan with precise expected results

No test below was executed during this audit. All results are expectations derived from the approved requirements, not observations.

### I.1 Launch and idle

| # | Action | Expected result |
|---|---|---|
| 1 | Launch the app | Launcher appears centred; no assistant overlay; no mic/system-audio indicator; `isMeetingActive=false`; `sessionState='idle'`; `overlay.isVisible()===false`. |
| 2 | Inspect OS window list | Exactly one launcher + one hidden overlay window; no second overlay; no floating pill. |
| 3 | Press Ctrl+B with the launcher focused | Launcher hides. Press Ctrl+B again (global, no session) | Launcher returns, same position. |
| 4 | Press Ctrl+1 | Nothing: no request, no overlay, no visible change. |
| 5 | Inspect diagnostics | No capture objects, no active STT socket; `sttConnected` must not be presented as "running" (see D-11). |

### I.2 Start

| # | Action | Expected result |
|---|---|---|
| 6 | Click Start Natively | Session becomes active; audio/STT start; **overlay becomes visible**; launcher hides; exactly one overlay; no duplicate window. |
| 7 | Press Ctrl+B while the overlay is visible | Overlay hides completely (pill, resize handles, messages). Launcher does **not** appear. Session and audio continue. |
| 8 | Press Ctrl+B again | The same overlay returns, same bounds, transcript intact; no new window. |
| 9 | Repeat 7–8 five times rapidly | No duplicate overlay, no lost window, no mode change to launcher. |
| 10 | Press Ctrl+1 while the overlay is visible | One answer request; button and shortcut both produce the same message flow. |
| 11 | Click Hide | Overlay disappears after the 400 ms delay; launcher stays hidden; mic/system audio keep running. |
| 12 | Press Ctrl+1 while hidden (after Hide) | **No action**; the overlay must not reappear and no answer may be generated. |
| 13 | Press Ctrl+B while hidden (after Hide) | Overlay returns; no new answer. |

### I.3 Home and Meeting Ongoing

| # | Action | Expected result |
|---|---|---|
| 14 | Click the logo/Home on the overlay | Launcher appears, overlay hides, session stays active, transcription continues, CTA reads "Meeting ongoing". |
| 15 | Press Ctrl+1 while the launcher is visible | No action, no answer, no mode switch. |
| 16 | Press Ctrl+B while the launcher is visible | Launcher hides; second press shows it again. The overlay must not open. |
| 17 | Click "Meeting ongoing" | The existing overlay returns; no new window; no audio/STT restart; no session reset. |
| 18 | Verify after 17 | Same session id as before, same transcript, `sessionState='active'`. |

### I.4 Stop

| # | Action | Expected result |
|---|---|---|
| 19 | Click Stop | Launcher returns immediately; CTA shows a stopping state (not "Start Natively"); after teardown CTA becomes "Start Natively"; overlay destroyed; mic/system audio stopped; STT sockets closed. |
| 20 | Click Stop twice quickly | Only one teardown; no error; no second launcher/overlay. |
| 21 | Click Start during the stopping state | Either disabled or queued; no second session and no second overlay before the first teardown completes. |
| 22 | Press Ctrl+B after Stop | No overlay appears; launcher hide/show only. |
| 23 | Press Ctrl+1 after Stop | No action. |
| 24 | Start again | One fresh overlay, clean transcript, no stale listeners, no duplicate window. |

### I.5 Shortcut ownership and races

| # | Action | Expected result |
|---|---|---|
| 25 | Focus the overlay, press Ctrl+B once | Exactly one hide; no `toggle-expand` collapse; no simultaneous launcher show. |
| 26 | Focus a text input in the overlay, press Ctrl+B | No window hide (or an explicitly documented behaviour); text input unaffected. |
| 27 | Disable the global shortcut (OS conflict simulation) | UI surfaces the registration failure; the renderer fallback, if kept, must perform the same hide/show. |
| 28 | Start → Ctrl+B ×5 → Stop → Ctrl+B immediately | No window left orphaned; no duplicate overlay; Stop's Ctrl+B is inert. |
| 29 | Start → Stop → Start within 1 s | One overlay; no stale teardown destroys the new overlay; state ends `active`. |
| 30 | Open Settings from the overlay, then Ctrl+B | No always-on-top settings panel remains floating over the launcher/desktop. |
| 31 | Rapid Start double-click | One session, one audio pipeline, one overlay. |

### I.6 Static checks (safe, non-destructive)

| # | Check | Expected result |
|---|---|---|
| 32 | Count `globalShortcut.register` owners | Only `KeybindManager` (`:286`, `:334`). |
| 33 | Count Ctrl+B DOM handlers | Expected after repair: zero; currently two (`Launcher.tsx:219`, `NativelyInterface.tsx:1191`). |
| 34 | Count `toggleAssistantOverlay` callers | Only the global-shortcut route (`main.ts:485`). |
| 35 | Count overlay creators | Only `WindowHelper.ensureOverlayWindow` (`:340`). |

---

## J. Dependencies and risks for a future coordinated repair

### J.1 Dependency order

1. **Establish one visibility truth first (D-08).** Every later change (pure hide, launcher toggle, stopping UI) reads visibility. Repairing Ctrl+B or Ctrl+1 before this leaves two sources of truth.
2. **Make the main process the single shortcut owner (D-05), then redefine Ctrl+B (D-02/D-03/D-04) as one handler with two branches:** visible launcher → launcher hide/show; visible overlay → overlay hide/show. Remove the renderer chords in the same change, otherwise the old `toggle-expand` path remains reachable.
3. **Add the Ctrl+1 visibility/focus gate (D-06) in the same change as the pure-hide repair.** If Ctrl+B stops switching to the launcher but `activeMode` remains `overlay`, Ctrl+1 becomes armed while the overlay is hidden. Fixing D-02 without D-06 would introduce a new failure.
4. **Fix Start (D-01) after the visibility primitives are deterministic.** The minimal change is to reveal the existing overlay instead of keeping the launcher; it must not create a window or reorder audio init.
5. **Add the stopping UI (D-07)** by consuming the already-broadcast `state` field; no new IPC is needed.
6. **Wire launcher diagnostics (D-11)** using the existing `get-stt-pipeline-diagnostics` / `stt-status` data; do not add a second status manager.
7. **Auxiliary windows (D-10)** last, because it depends on which surface is visible and on platform parent-child behaviour.

### J.2 Risks

- **Removing the renderer chord can leave the overlay without Ctrl+B if OS registration fails.** Keep the registration-failure IPC (`KeybindManager.ts:289–296`) and decide explicitly whether a focused-renderer fallback is allowed; if kept, it must call the same main-process handler, not `toggle-expand`.
- **Windows content-protection opacity ramp.** `switchToOverlay` and `switchToLauncher` use a 60 ms `setOpacity(0)` → `setOpacity(1)` sequence when content protection is on (`WindowHelper.ts:734–746`, `:797–811`). A "pure hide" must not disturb this ramp, and tests must run on Windows with content protection enabled.
- **`showOverlay` uses `showInactive()` then `focus()`** (`:642–645`). Any focus-based Ctrl+1 gate must account for the mouse-passthrough branch, where focus is still requested but passthrough may be enabled (`syncOverlayInteractionPolicy` `:611–623`).
- **Mode is a proxy for surface, not visibility.** `KeybindManager.setMode` is called from `switchToOverlay`/`switchToLauncher`, which are also used by screenshot restore (`main.ts:3728`) and the close handlers (`WindowHelper.ts:555–562`). A repair that assumes "mode overlay == visible" will regress after Hide, screenshot restore, or a close event.
- **Stop and Start overlap.** `endMeeting` flips `isMeetingActive=false` before the 250 ms drain; `startMeeting` awaits `_pendingTeardown` (`:2769–2779`) and the teardown guards overlay destruction with `_sessionId === endedSessionId` (`:3114`). Any new stopping UI must not block this path or reintroduce a destroyed-overlay race.
- **Overlay is created at boot.** Changing Start to reveal it is cheap, but removing the boot creation (to satisfy "not operating") would add first-Start latency and a new failure mode. Treat "not operating" as "not visible, no session, no capture" unless the requirement is tightened.
- **Pre-existing comments encode the opposite requirement.** `main.ts:2828–2831` explicitly documents "Start must NOT reveal the overlay" as "requirement 2". The repair must update that comment and the `App.tsx:405–409` rationale together, or the next reader will reintroduce D-01.
- **No version control was assumed.** The folder contains many backup/timestamp files (`WindowHelper.ts.bak`, `vite.config.mts.timestamp-*.mjs`, `NativelyInterface.tsx.broken-backup`). Confirm the real entry points before editing; none of the backups are imported by the current code paths inspected here.
- **Runtime verification is still outstanding.** All findings are static. Window show/hide timing, macOS menu-vs-global-shortcut precedence, Windows child-window hiding and provider socket behaviour at prewarm require the test plan in section I.

### J.3 Suggested repair batches (for agreement only — nothing implemented)

| Batch | Defects | Files likely touched | Exit criterion |
|---|---|---|---|
| R1 | D-08, D-05, D-02, D-03, D-04, D-06 | `WindowHelper.ts`, `KeybindManager.ts`, `main.ts`, `Launcher.tsx`, `NativelyInterface.tsx` | One Ctrl+B owner; pure launcher/overlay hide-show; Ctrl+1 inert whenever the overlay is not visible/focused. |
| R2 | D-01 | `main.ts` `startMeeting`, `App.tsx` comment only | Start → overlay visible, launcher hidden, audio init still asynchronous. |
| R3 | D-07 | `main.ts` (no change), `Launcher.tsx` | "Stopping…" state; Start disabled until idle. |
| R4 | D-09, D-12, D-10 | `WindowHelper.ts`, auxiliary helpers | No path leaves zero visible windows; no floating panels after Ctrl+B/Stop. |
| R5 | D-11, D-13 | `Launcher.tsx`, `KeybindManager`/renderers | Launcher shows session/capture/STT status from existing state; chord does not fire inside inputs. |

---

## Summary

- The window layer has one creation path but **nine visibility controllers** and **six shortcut owners**.
- Ctrl+B is currently a launcher ↔ overlay switch with a renderer expand/collapse side effect, not a visibility toggle.
- Start deliberately leaves the user on the launcher, directly contradicting the approved Start workflow.
- Ctrl+1 is gated by a mode flag, not by overlay visibility or focus, so it can fire while the assistant is hidden.
- Home, Meeting Ongoing and Stop are wired correctly for session continuity and teardown; the missing piece is a stopping state and accurate visibility bookkeeping.
- All evidence is source-level. No runtime test, build or type-check was performed, and no source file was changed.
