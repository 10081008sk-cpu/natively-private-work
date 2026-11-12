# MODULE 04B — LAZY OVERLAY LIFECYCLE IMPACT AUDIT

**Requirement under audit (approved Option B):** *The assistant overlay `BrowserWindow` must only be created after the user clicks **Start Natively**.*

**Target:** `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main`
**Method:** independent, read-only re-inspection of the current working tree.
**Date:** 2026-11-12 (session clock `Thu Nov 12 2026 20:24 IST`)
**Constraint compliance:** no source file, configuration file, dependency, package, UI asset or existing report was created, edited, moved or deleted inside the source tree. Nothing was built, launched or instrumented. This Markdown file is the only artifact produced by this module.

### Evidence tags used throughout

| Tag | Meaning |
|---|---|
| **[S]** | Directly read in the current source file at the cited line. |
| **[S-C]** | Deterministic consequence of cited source (control flow / ordering); not observed at runtime. |
| **[B]** | Verified in the checked-in build output (`dist-electron/`) rather than only in TS source. |
| **[NV]** | Cannot be settled statically — OS behaviour, real focus/timing/compositor effects. |
| **[R]** | Runtime observation. **No `[R]` evidence exists in this report; the application was never started.** |

---

## 1. Source snapshot verification

### 1.1 Root, package and toolchain

| Item | Value | Evidence |
|---|---|---|
| Actual project root | `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main` (Git Bash: `/e/Project/natively-cluely-ai-assistant-main/natively-cluely-ai-assistant-main`) | `pwd` |
| Package name | `natively` | `package.json` |
| Application version | **2.6.0** | `package.json` `version` — also matches `release/Natively-Setup-2.6.0.exe.blockmap` |
| Electron | declared `^45.2.3`, installed **45.2.3**, locked **45.2.3** | `package.json`; `node_modules/electron/package.json`; `package-lock.json` |
| React | declared `^19.2.6`, installed **19.3.1**, locked **19.3.1** | same three sources |
| React DOM | declared `^19.2.6`, installed **19.3.1**, locked **19.3.1** | same three sources |
| TypeScript | declared `^5.6.3`, installed **5.9.3**, locked **5.9.3** | same three sources |
| Vite | declared `^5.4.21`, installed **5.4.21**, locked **5.4.21** | same three sources |
| `@vitejs/plugin-react` | declared `^4.7.0`, installed **4.7.0** | same |
| electron-builder | declared `^25.1.0`, installed **25.1.0** | same |
| `electron-vite` | **ABSENT** (not used) | `package.json` |
| Electron entry | `main` = `dist-electron/electron/main.js` | `package.json` |
| Vite config file | `vite.config.mts` (**not** `vite.config.ts`) | directory listing |
| Git repository | **None.** `ls -d .git` → `No such file or directory`; `git rev-parse --is-inside-work-tree` → `fatal: not a git repository (or any of the parent directories): .git` | terminal output |
| Branch / commit / dirty state | **Not available — not invented.** No Git metadata exists in this tree. | as above |

> Declared ranges and installed/locked versions differ for React (19.2.6 → 19.3.1) and TypeScript (5.6.3 → 5.9.3). Any statement about "the React/TS version" must therefore name which of the three it means. **[S]**

### 1.2 Lockfiles

| File | SHA-256 | Notes |
|---|---|---|
| `package.json` | `3e6a5d03cc7cfa37b7034e18a4f5ab417f11b3ed0560a502213a92dfa1b36e5f` | mtime 2026-11-10 15:26 |
| `package-lock.json` | `bd11056f9180932f08cecb0e84e6adb2d99cec7dcc5f25281bf47873110df4c7` | `lockfileVersion: 3`, root `version: 2.6.0`; mtime 2026-11-10 15:26 |
| `renderer/package-lock.json` | `0a9291052507d6c3e3321b907582d3a9bc6854131d1ec1763f8dfd27942081b7` | **Not part of the live overlay path** — the shipped renderer is top-level `src/` (see §2.4) |
| `native-module/package-lock.json` | `fe475de1e181f686f42d2f8217213e156847ab6faec91f26e2196c29b08f5c11` | Rust/native helper package |
| `native-module/Cargo.lock` | present | — |

### 1.3 SHA-256 of the critical window-lifecycle files

Computed with `sha256sum` in the project root. The `*` printed by Git Bash is the binary-mode marker, not part of the digest.

| File | Lines | SHA-256 | mtime |
|---|---|---|---|
| `electron/main.ts` | 4 788 | `c3464d94f08ddb733a19d178ba47cb91600896055c94e00ade1c28dc28d99de8` | 2026-11-10 21:43 |
| `electron/WindowHelper.ts` | 887 | `c115c23694071ef9f0447bba68904b84204e6529d73536df2ff7d5d091ac1356` | 2026-11-10 21:46 |
| `electron/ipcHandlers.ts` | 4 701 | `260cb234a9747d2f53d09827c11c87b67fb0f60df0b1fbb9042e64f478cdec17` | 2026-11-10 20:43 |
| `electron/preload.ts` | 1 537 | `e77b2422daa87ece21c825ba5f98d7fe0e7f2f88988e9076900fb14d20fd7d3a` | 2026-11-10 20:36 |
| `electron/services/KeybindManager.ts` | 518 | `f193ff2a7f254145c99171130ec25179a09467a21e32ab2f4208ebcb2297be5b` | 2026-11-10 20:30 |
| `src/App.tsx` | 815 | `1147a75578762a672a0d2e655f020d51fd92b156227fd0acd158cd37b87db3df` | 2026-11-08 17:00 |
| `src/components/Launcher.tsx` | 1 207 | `50cf2c6a766901c0719f8390a455ce4058a84693d8fb60149841369384d15147` | 2026-05-17 20:12 |
| `src/components/NativelyInterface.tsx` | 1 800 | `6284922a9d2ecb9d2dfd7c11cf8994b28129f343434528098ea5e375e4d8450c` | 2026-11-10 21:47 |
| `electron/WindowManager.ts` | 476 | `f94bffeabbe27a208eb1ee14d9e5fc95d34bcedfd0dac1a4f761cdd870ad84b1` | dead code — see §2.1 |
| `index.html` | 25 | `ab64c967de9b1d98fd9ff3ee5f0777801e2692fdea2b0ce4365009113971adb2` | — |
| `electron/tsconfig.json` | — | `54f78e8085aeac92357d84f55217ea4f76efe90afad142935894af1d4e56415b` | — |

### 1.4 Same working copy as Modules 01–04A?

* **Modules 03 / 03A / 04 / 04A reports exist inside this tree**: `MODULE_03_SETTINGS_AND_FEATURE_WIRING_AUDIT.md`, `MODULE_03A_FINAL_REQUIREMENTS_VALIDATION_AND_INTEGRATION_AUDIT.md`, `MODULE_04_WINDOW_SHORTCUT_SESSION_AUDIT.md`, `MODULE_04A_INDEPENDENT_EVIDENCE_VERIFICATION.md`. `find . -maxdepth 3 -iname "*MODULE_0*"` returned only these four — **no Module 01 or Module 02 report exists in this tree**, so continuity for 01/02 cannot be established from the repository alone. **[S]**
* **Continuity with Module 04A is proven for the nine files it hashed.** §A.2 of `MODULE_04A_INDEPENDENT_EVIDENCE_VERIFICATION.md` records digests for `electron/main.ts`, `electron/WindowHelper.ts`, `electron/services/KeybindManager.ts`, `electron/preload.ts`, `electron/ipcHandlers.ts`, `src/App.tsx`, `src/components/Launcher.tsx`, `src/components/NativelyInterface.tsx`, `src/components/ui/TopPill.tsx` (`aba3efbe5a6d85f762b6e781dd99bbe5f64918387cf923b4c7ab49ad32a99ea5`). All nine recomputed values in this module are **byte-identical**. → This is the same working copy for the window-lifecycle surface, unchanged between the 04A run (dated 2026-11-12) and this run. **[S]**
* **No modification by this module.** Every digest above is reproduced from the untouched tree.

### 1.5 Source vs. build output

`dist-electron/electron/main.js` and `dist-electron/electron/WindowHelper.js` (both 2026-11-10 22:12) are **newer** than every `.ts`/`.tsx` file under `electron/` and `src/` (`find electron src -type f -name "*.ts*" -newer dist-electron/electron/main.js` → empty). The build therefore corresponds to this source snapshot.

Confirmation that the eager boot-time creation exists in the shipped JS, not only in TS: `dist-electron/electron/main.js` contains `await this.ensureOverlayWindow();` at bundled line **176247**, `ensureOverlayWindow(cid)` at **176257**, and the Start-time call `void this.windowHelper.ensureOverlayWindow().catch(...)` at **318937** — i.e. exactly three live call sites, matching TS. **[B]**

---

## 2. Overlay creation trace

### 2.1 Every `new BrowserWindow` in the live tree

| Location | Window | Created when | Overlay? |
|---|---|---|---|
| `electron/WindowHelper.ts:272` | `launcherWindow` | `createWindow()` at launch | no |
| **`electron/WindowHelper.ts:386`** | **`overlayWindow` — the assistant overlay** | `ensureOverlayWindow()` | **yes — the only one** |
| `electron/SettingsWindowHelper.ts:208` | settings popup | lazily on first open | no |
| `electron/ModelSelectorWindowHelper.ts:178` | model dropdown | lazily on first open | no |
| `electron/CropperWindowHelper.ts:437` | region cropper | lazily on first selective screenshot | no |
| `electron/audio/WebSpeechSTT.ts:119` | hidden data-URL STT host | inside `WebSpeechSTT.start()` (`:42–46`), i.e. session time only | no (adjacent) |
| `electron/services/ErrorNotificationService.ts:95` | toast window | reachable only via `EnterpriseArchitecture` / `main/GlobalErrorHandler`, neither imported by `electron/main.ts` or `electron/ipcHandlers.ts` | no — dead |
| `electron/WindowManager.ts:82` | generic | reachable only via `EnterpriseArchitecture.ts:109/1419`, not imported by the live main process | no — dead |

**Conclusion [S-C]:** there is exactly **one** assistant-overlay constructor in live code (`WindowHelper.ts:386`), reached only through `ensureOverlayWindow()`. `main.ts:3596–3599` states the same intent: *"There is exactly one overlay BrowserWindow (`WindowHelper.overlayWindow`); no secondary 'assistant' window is created."*

### 2.2 Every `ensureOverlayWindow()` call site — the complete set

| # | Call site | Caller chain | Purpose | Timing | Can it run **before** Start? |
|---|---|---|---|---|---|
| **C1** | `WindowHelper.ts:327` — `await this.ensureOverlayWindow();` inside `createWindow()` (begins `:192`, right after the launcher load `:320`, before `setupWindowListeners()` `:329`) | `initializeApp()` → `appState.createWindow()` (`main.ts:4520`, **not awaited**) → `AppState.createWindow()` (`main.ts:3556–3558`, also **not awaited**) | Boot prewarm: create the hidden overlay so the first Ctrl+B is instant | Every launch, immediately after the launcher begins loading; also macOS `activate` with no window (`main.ts:4702`) | **YES — the only violation of Option B** |
| **C2** | `main.ts:2833` — `void this.windowHelper.ensureOverlayWindow().catch(...)` in `startMeeting()`, after `resetOverlayPosition()` `:2826` and `switchToLauncher(false)` `:2832`, before `setSessionActive(true)` `:2836` and `isMeetingActive = true` `:2838` | Launcher CTA (`Launcher.tsx:777`) → `App.handleStartMeeting` (`App.tsx:401`) → `start-meeting` (`ipcHandlers.ts:2706`) → `AppState.startMeeting` | Prepare the hidden overlay for the session | Start only (also calendar auto-start `main.ts:4654–4663`) | No — it *is* the Start path |
| **C3** | `main.ts:3623` — `void this.windowHelper.ensureOverlayWindow(cid).then(...)` in `toggleAssistantOverlay()` | Global Ctrl+B (`KeybindManager.ts:15`, gated by `shouldRegister` `:99–101`) → `onShortcutTriggered` → `main.ts:482–485` → `toggleAssistantOverlay` (`:3600`) → recreate branch `:3620` | Re-create the overlay that Stop destroyed | Guarded by `if (!this.isMeetingActive) return` (`main.ts:3612–3615`) | No |

Non-creation references: `WindowHelper.ts:83` (comment), `:443–444` (doc comment), `main.ts:3622/3624/3625/3633` (log strings inside C3).

### 2.3 `createWindow()` / equivalent overlay initialization

```
WindowHelper.ts:192  public async createWindow(): Promise<void> {
              :193    if (this.launcherWindow !== null) return        // one-shot guard
              :272      this.launcherWindow = new BrowserWindow(launcherSettings);
              :313-317  launcher did-finish-load -> switchToLauncher(); isWindowVisible = true
              :320      const loadSuccess = await loadUrlWithRetry(launcherWindow, `?window=launcher`, 10, 500)
              :326-327  // --- 2. Create Overlay Window (Hidden initially) ---
                        await this.ensureOverlayWindow();             <-- C1, the Option B violation
              :329      this.setupWindowListeners();
              :330  }
```

* `AppState.createWindow()` `main.ts:3556–3558` returns `void` and does **not** await `WindowHelper.createWindow()`. Consequence **[S-C]**: neither the launcher load nor C1 is on the boot critical path, and `initializeApp` continues to `prewarmSttProviders()` (`:4525–4531`) while C1 may still be in flight.
* Call sites: `main.ts:4520` (boot), `main.ts:4702` (macOS `activate`). `main.ts:4432–4438` (`second-instance`) uses `centerAndShowWindow()` and never creates.

### 2.4 Renderer loading and mounting path

```
WindowHelper.ts:422   loadUrlWithRetry(overlayWindow, `${startUrl}?window=overlay`, 'overlay', 10, 500)
   startUrl          WindowHelper.ts:12-14   dev  -> http://localhost:5180   prod -> file://<root>/dist/index.html
index.html:23          <script type="module" src="/src/main.tsx">
src/main.tsx:59-65     ReactDOM.createRoot(#root).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary>)
src/App.tsx:41       isOverlayWindow = searchParams.get('window') === 'overlay'
src/App.tsx:43       isDefault       = none of the five window params present (dev fallback -> treated as overlay)
src/App.tsx:46-56    isCropperWindow -> lazy <Cropper/> (not the overlay)
src/App.tsx:482-508  isOverlayWindow || isDefault -> <NativelyInterface .../>   [overlay document]
src/App.tsx:510-545  else -> <Launcher onStartMeeting={handleStartMeeting} ...>  [launcher document]
```

* Overlay and launcher documents are **two renderer processes of one bundle**, distinguished only by the `?window=` query. **[S]**
* `React.StrictMode` (`src/main.tsx:60`) double-invokes mount effects in dev, so the subscription map is installed → torn down → re-installed under `npm run app:dev`; production does not. **[S-C]**
* The overlay preload is `path.join(__dirname, "preload.js")` (`WindowHelper.ts:369`) → `electron/preload.ts`. `electron/preload/index.ts` is referenced by no window; only `ErrorNotificationService.ts:108` uses `preload/notification-preload.js`, and `electron/preload/` holds just `index.ts`. **[S]**
* The live transcript consumer is `NativelyInterface`'s `onNativeAudioTranscript` (`:992–1001`). `src/components/SuggestionOverlay.tsx` and `src/_pages/*` also subscribe but are unreferenced dead code (`grep -rn "_pages/" src` → none; `SuggestionOverlay` imported nowhere). **[S]**

### 2.5 Overlay destruction and recreation path

| # | Location | Trigger | Behaviour |
|---|---|---|---|
| D1 | `main.ts:3115`, in the `_pendingTeardown` `finally` (`:3095–3120`), guarded by `if (!this.isMeetingActive && this._sessionId === endedSessionId)` (`:3114`) | Stop (`end-meeting` `ipcHandlers.ts:2716`) | **Deferred** destroy — ≥ ~250 ms after the click (drain `:3057`), after model revert, STT stop, meeting save, RAG work |
| D2 | `main.ts:3173` in `forceEndMeeting()` (`:3132–3180`) | Live toggle off (`force-end-meeting` `ipcHandlers.ts:2726`) | Immediate destroy |
| D3 | `WindowHelper.ts:513–518` launcher `"closed"` → `overlayWindow.close()` then `= null` | Launcher really closing | App-shutdown path |
| R1 | C3 (`main.ts:3623`) | Ctrl+B after D1/D2 | Recreation |
| R2 | C2 (`main.ts:2833`) | next Start | Recreation |

`destroyOverlayWindow()` `:446–458` nulls the field at `:448` **before** `removeAllListeners('close')` `:452` + `destroy()` `:453`, and does **not** clear `_overlayCreating` (`:332`) nor reset `currentWindowMode` (`:65`) or `overlayBounds` (`:66`). See §5.6, §5.9.

---

## 3. Startup side effects — what begins before Start Natively

### 3.1 Overlay-specific resources (the subject of Option B)

| Resource | Starts before Start today? | Evidence |
|---|---|---|
| Overlay `BrowserWindow` (+ its renderer process, transparent always-on-top layer) | **YES** | C1: `main.ts:4520` → `WindowHelper.ts:327` → `:386` |
| Overlay renderer document (`NativelyInterface`, 1 800 lines incl. Prism / KaTeX / framer-motion) | **YES** — load begins at C1 | `WindowHelper.ts:422`; `App.tsx:482–508` |
| ~50 overlay IPC event subscriptions (`onNativeAudioTranscript`, `onIntelligence*`, `onSuggestion*`, `onGlobalShortcut`, `onSessionReset`, `onVisionPipelineResult`, `onLiveInterview*`, `onStealthKeyCaptured`, …) | **YES** — installed at overlay mount | `NativelyInterface.tsx:971–1125` via `useIpc` (`:240–246`) |
| Overlay DOM listeners (`keydown`/`keyup`/`blur`, capture-phase `keydown`, `mousedown`, `storage`, `resize`, two rAF scroll loops) | **YES** | `NativelyInterface.tsx:615–658`, `:1129–1219`, `:1221+` |
| Overlay-level `App.tsx` mount work: `analytics.initAnalytics()` (`:65`) + `trackAssistantStart()` (`:71–73`), `beforeunload → trackAssistantStop()` (`:76–85`), license / plan / profile / credential IPC reads (`:206–231`), **30 s trial polling `setInterval`** (`:234–271`), Ollama-pull / warning / trial / license listeners (`:274–330`) | **YES** — the `useEffect(…, [])` at `App.tsx:201–336` is **not window-scoped**, so it also runs in the overlay document | [S] |
| Overlay `setModel()` on mount (writes the LLM model and broadcasts `model-changed` to every window) | **YES** | `NativelyInterface.tsx:665–676` |
| Shell-size IPC writes (`update-content-dimensions[-centered]` → `setOverlayDimensions*` on the real window) | **YES** (rAF + a 600 ms timer) | `NativelyInterface.tsx:592–610`; `ipcHandlers.ts:155–196` |
| `overlayBounds` position memory | **YES** (populated by the write above) | `WindowHelper.ts:528–538`, `:578–581` |
| macOS-only `StealthKeyboardManager.setOverlayWindow(win)` binding | **YES** | `WindowHelper.ts:393–400` |

### 3.2 Application-wide resources that start before Start (not overlay lifecycle)

| Resource | Timing | Evidence | Depends on the overlay window? |
|---|---|---|---|
| Launcher window + renderer | boot | `WindowHelper.ts:272`, `:320` | no |
| IPC handler registration | boot, **before** any window (`main.ts:4489`) | `initializeIpcHandlers(appState)` | no |
| Single-instance lock, disguise/AUMID, GPU switches | pre-`whenReady` / early | `main.ts:4385–4403`, `:4425`, `:4492` | no |
| Settings / Credentials / Modes / Database / Theme / Keybind managers, RAG init, Ollama bootstrap, intent-classifier warm-up, auto-updater | `AppState` constructor `:341–692` (`initializeRAGManager()` `:673`, `bootstrapOllamaEmbeddings()` `:676`, `warmupIntentClassifier()` `:682`, `setupAutoUpdater()` `:692`) | none |
| **STT provider *object* prewarm** (interviewer + user) | boot, `setImmediate` after `createWindow()` | `main.ts:4522–4531` → `prewarmSttProviders()` `:1868–1885` → `createSTTProvider()` `:1106` | no — plain JS objects, documented as constructor-only at `:1856–1867`; sockets open only in `start()`. `WebSpeechSTT` (the one STT class that owns a hidden window) creates it only in `start()` (`WebSpeechSTT.ts:42–46`), so no window appears at boot from this path |
| Local-Whisper model preload (ONNX worker) | boot, `setImmediate` in the constructor | `main.ts:391–410`; worker created in `electron/audio/whisper/modelPreloader.ts` | no |
| **Audio capture** (`MicrophoneCapture`, `SystemAudioCapture`) | **NO — built at Start only** | fields null `main.ts:1071–1072`; `setupSystemAudioPipeline()` `:1740` reached only from `:2344` and `:2903`; the boot call is deliberately commented out at `main.ts:687–689` ("LAZY INIT: Do not setup pipeline here to prevent launch volume surge") | no |
| Audio processing / noise suppressors | JS objects at boot; rebuilt per Stop | `main.ts:1089–1090`, `:3105–3106` | no |
| Default-output polling timer | **NO — Start only** | `setInterval` `main.ts:2500` inside `startDefaultOutputWatcher()` (`:2484`), called at `:2932`, stopped at `:3016` / `:3145` | no |
| Keybind health-check `setInterval` (10 s, `unref`ed) | boot | `KeybindManager.ts:74`, `:358–365` | no |
| Background answer generation (`IntelligenceManager` / `IntelligenceEngine`, RAG, `ai-engine` `ai:get-answer`) | objects at boot; **work only while transcript flows** | transcript gate `main.ts:1255–1261`; `registerAIHandlers()` `:4534` (`electron/ai-engine.ts:19–30` registers one `ipcMain.handle`) | no |
| Boot-time meeting recovery + retention cleanup (can issue LLM work before any Start) | boot | `main.ts:4673–4684` | no |
| Telemetry `app_start`, install ping, PhoneMirror auto-start, CalendarManager, Ollama manager, powerMonitor resume/suspend, macOS screen-permission prompt | boot | `main.ts:4444–4467`, `:4497–4516`, `:4533–4572`, `:4583–4672` | no |

### 3.3 Dependency reasoning — what must move, and what must not

Option B constrains **one** thing: the creation of `WindowHelper.overlayWindow`. Everything else follows only where a real dependency exists.

1. **Creation is already idempotent and joinable.** `ensureOverlayWindow()` short-circuits on a live window (`:343–346`) and on an in-flight creation (`:348–351`). Deleting C1 therefore leaves exactly two creation paths (C2 Start, C3 Ctrl-B-while-active), both already session-gated. **No new creation API is needed.** **[S-C]**
2. **Renderer mount, its ~50 subscriptions, its DOM listeners, its trial poll and its `setModel()` write are consequences of the window, not independent services.** They move automatically with C1's removal and cannot be reached earlier, because the document does not exist. **[S-C]**
3. **STT object prewarm, Whisper preload, RAG / Ollama / telemetry / timers have no dependency on the overlay window.** `setupSystemAudioPipeline()` (`:1792–1830`) and Start's deferred block (`:2888–2948`) use `this.googleSTT` only as an STT sink. Moving them into the Start path would lengthen the Start critical path without serving the requirement. **Recommendation: leave them at boot** — Option B is not a "defer every service" mandate. **[S-C]**
4. **The overlay document is the only UI for a live session.** Everything that must work with no overlay (Settings, model selector, cropper, launcher meeting list) already resolves through `getMainWindow()`, which falls back to the launcher whenever `overlayWindow` is null (`WindowHelper.ts:567–572`). The only pre-Start capability genuinely at risk is *overlay-revealing* behaviour — §5.5, §5.7. **[S-C]**
5. **The hotkey half of the gate already exists.** `KeybindManager.shouldRegister` (`:99–101`) registers Ctrl+B only while `sessionActive`, set at `main.ts:2836` and cleared at `:2992` / `:3176`. No Option B change is required there. **[S]**

---

## 4. Proposed Option B lifecycle (design only — no code written)

### 4.1 Target state machine

`AppState._sessionState` (`main.ts:333`, values `idle | starting | active | stopping`) is already the authoritative lifecycle. Option B adds one invariant on top of it:

> **INV-1 — `overlayWindow !== null` ⟺ `_sessionState ∈ {starting, active, stopping}`.**
> Equivalently: no overlay exists in `idle`, and an overlay exists for the whole life of a session (visible or hidden).

Supporting invariants, all reachable with the existing primitives:

| Invariant | Enforcement point |
|---|---|
| **INV-2** Creation is requested from exactly one place per session and is idempotent | `ensureOverlayWindow()` `:343–351` (alive-check + in-flight join) already gives this |
| **INV-3** Every path that can make `overlayWindow` null must also make `currentWindowMode` `'launcher'` | `destroyOverlayWindow()` `:446` leaves `currentWindowMode` untouched → must be extended (§6.2) |
| **INV-4** No reveal path may hide the launcher unless an overlay is actually usable | `switchToOverlay()` `:697–786` violates this today at `:783–785` → must be fixed **with** Option B, not after |
| **INV-5** An in-flight creation must be invalidated by a teardown, never reused by the next session | `_overlayCreating` `:332`/`:436` is not cleared by `destroyOverlayWindow()` → must be |

### 4.2 Application launch (target)

1. `initializeApp()` pre-`whenReady` configuration, single-instance lock, managers, IPC registration, disguise — unchanged.
2. `appState.createWindow()` (`main.ts:4520`) → `WindowHelper.createWindow()`: launcher `:272`, launcher load `:320`, `setupWindowListeners()` `:329`. **The `ensureOverlayWindow()` at `:327` is no longer present** (§6.2 gives its disposition).
3. The launcher shows itself via its own `did-finish-load` → `switchToLauncher()` + `isWindowVisible = true` (`WindowHelper.ts:313–317`).
4. Observable state: exactly **one** `BrowserWindow` for the assistant UI; `getOverlayWindow() === null`; `currentWindowMode === 'launcher'`; `_sessionState === 'idle'`; no `?window=overlay` document → no overlay subscriptions, no `trackAssistantStart()`, no overlay-driven `setModel()`, no overlay-driven trial poll.
5. Unchanged at boot: STT object prewarm, Whisper preload, RAG/Ollama, telemetry, Keybind health-check timer, tray (`main.ts:4541`).
6. Ctrl+B is not registered before Start — already true (`KeybindManager.ts:99–101`) — so no hotkey can demand the window early.

### 4.3 Start Natively (target)

Order is the current one (`main.ts:2826–2840`), with creation made **deterministic** rather than best-effort:

```
2826  resetOverlayPosition()                  // fresh centred placement           [unchanged]
2832  switchToLauncher(false)                 // launcher stays visible; do NOT reveal the overlay [unchanged]
      ── ensureOverlayWindow() ──             // C2: the single creation point for the session
2836  KeybindManager.setSessionActive(true)   // Ctrl+B becomes live only once a session exists
2838  isMeetingActive = true
2839  _sessionState = 'active'
2840  broadcastMeetingState()
2881  send 'session-reset' to overlay + launcher
2888  setTimeout(0) → setupSystemAudioPipeline() → capture.start() → stt.start() → RAG live index → output watcher
```

* "Create exactly once" is already guaranteed within a session by INV-2. Across sessions it is guaranteed because `startMeeting()` awaits `_pendingTeardown` (`main.ts:2766–2774`) **before** C2, so the previous D1 destroy (`:3115`) has already run. **[S-C]**
* **Initialization-failure handling (new requirement):** a rejected creation (§5.1) or a failed renderer load (§5.2) must **not** leave the session marked `active` with no usable window. Safe shape: attempt creation → on rejection or `loadOk === false`, run the existing complete synchronous teardown (`forceEndMeeting()` `main.ts:3132–3180` is the only path that both stops audio/STT **and** destroys the overlay immediately), surface feedback through the existing broadcast helper (`main.ts:697–701`, channels already used: `meeting-audio-error` `:2789`, `audio-capture-failed` `:1807`), and land in `idle` with no window.
* Creation must stay **after** the fallible permission checks (`ensureMacMicrophoneAccess` `:2786`, macOS screen-capture status `:2806`) so a rejected Start never leaves a window behind (§5.3).

### 4.4 Home (logo)

Unchanged: `NativelyInterface.tsx:1399` `onLogoClick={() => api.setWindowMode?.('launcher')}` → `ipcHandlers.ts:197–200` → `WindowHelper.setWindowMode('launcher')` `:826–832` → `switchToLauncher()` `:788–824`: restore/show the launcher (`:795`), hide the overlay (`:821–823`), `currentWindowMode='launcher'`, `isWindowVisible=true`. **No teardown, no re-creation**; session and audio keep running — exactly Option B's "preserve the existing active session and overlay instance".

### 4.5 Meeting Ongoing

Unchanged in intent: `Launcher.tsx:767–779` → `setWindowMode('overlay', true)` → `switchToOverlay(true)`. Under INV-1 the window necessarily exists during a session, so the "no usable overlay" branch (`:779–781`) becomes unreachable **provided §5.5/§5.6 are handled**. `switchToOverlay` only calls `setBounds`/`setOpacity`/`show*`/`focus` — it never calls `ensureOverlayWindow()` nor touches the pipeline, which satisfies "restore, do not recreate, do not restart audio/STT".

### 4.6 Stop

Unchanged sequence (`main.ts:2951–3125`): synchronous `isMeetingActive=false` `:2988`, `_isDraining=true` `:2989`, `_sessionState='stopping'` `:2990`, `setSessionActive(false)` `:2992`, `broadcastMeetingState()` `:2993`; `setWindowMode('launcher')` (`:3004`) **before** the blocking native stops; captures `.stop()` (`:3011–3012`); output watcher stop (`:3016`); STT `finalize()` (`:3020–3021`); then the background drain → STT `stop()` `:3060–3061`, capture `destroy()`/null `:3095–3098`, suppressor rebuild `:3105–3106`, and finally `destroyOverlayWindow()` + `_sessionState='idle'` + `_sessionId=null` + broadcast (`:3110–3119`). Option B changes only the **meaning** of that last destroy: it becomes the thing that re-establishes INV-1 rather than a leak fix.

### 4.7 Repeated Start/Stop

| Concern | Current guarantee | Residual gap for Option B |
|---|---|---|
| Stale `BrowserWindow` reference | `destroyOverlayWindow()` nulls the field (`:448`) | No `'closed'` listener on the overlay (`:525–565` attaches move / resize / `system-context-menu` / win32 `blur` / `close` only) → an *externally* closed overlay leaves a destroyed non-null field (§5.8) |
| Duplicate windows | alive-check `:343` + in-flight join `:348`; C2 runs only after `_pendingTeardown` (`main.ts:2766`) | `_overlayCreating` is not invalidated by teardown → a new session can join a promise that already finished against a dead window (§5.6) |
| Duplicate renderer listeners | `useIpc` returns per-subscription unsubscribers (`NativelyInterface.tsx:242–243`), torn down with the document | none (fresh process per creation) |
| Duplicate main-process listeners | `setupOverlayWindowListeners()` once per window (`:429–431`); `googleSTT?.removeAllListeners()` `:3100–3104`; `win.removeAllListeners('close')` `:452` | `webContents.on('did-fail-load')`/`'render-process-gone'` (`:410`, `:414`) are per-window → fine |
| Duplicate workers / recognizers / capture | existence guards in `setupSystemAudioPipeline()` `:1750`, `:1786`, `:1798`, `:1818`; capture + STT nulled at `:3095–3106` | none specific to Option B |
| `overlayBounds` leaking across sessions | nulled by `resetOverlayPosition()` `:578–581` on every Start (`main.ts:2826`) | none — **do not** move `:2826` below `switchToOverlay` |

---

## 5. Failure and race-condition analysis

### 5.1 Overlay creation failure (`new BrowserWindow` throws — `WindowHelper.ts:386`)

**[S]** The throw happens inside the `ensureOverlayWindow` IIFE (`:353`), so it becomes a rejected promise. It is caught at C2 (`main.ts:2833–2835`) and at C3 (`main.ts:3632–3634`) — **both only `console.error`**. `this.overlayWindow` keeps its previous value (`null`) because the assignment never completes; `_overlayCreating` is cleared by the `finally` (`:435–437`).
**[S-C] Impact under Option B:** the session is already marked `isMeetingActive=true` / `active` (`:2838–2839`) — and, unlike today, there is no earlier C1 attempt to fall back on, so a launch-time failure that today only costs warmth now costs the whole session. The user gets audio + transcript + "Meeting ongoing" with no way to reach the assistant: Ctrl+B enters `toggleAssistantOverlay` → `getOverlayWindow()` null (`:3617`) → recreate branch (`:3620`) → probably the same failure → log only.
**Recommended transition:** treat creation failure as *session-start failure* — roll back to `idle` through the force-end path, destroy any partial window object, broadcast state, and surface a user-visible error rather than a log line.

### 5.2 Renderer load failure (`loadUrlWithRetry` → `false`, `WindowHelper.ts:422`)

**[S]** On `false`, `setupOverlayWindowListeners()` is **skipped** (`:429–432`) but the `BrowserWindow` itself **stays alive**, still `height: 1` (`:361`) and `show: false` (`:373`). `_overlayCreating` is cleared and `ensureOverlayWindow()` resolves *successfully* (`:434` logs "creation complete") — the failure is never propagated to C2/C3.
**[S-C] Consequences:** (a) a **partially initialised resource**: no `move`/`resize` listener (so `overlayBounds` never updates), no `system-context-menu`, no win32 `blur` re-assert of `screen-saver` z-order (`:547–552`), and no `close` policy (`:555–564`); (b) `destroyOverlayWindow()` still cleans it up, so nothing survives Stop; (c) Ctrl+B reveals a **blank transparent window** (the alive-check at `:704` passes, the `else` at `:779` is not taken).
**Dev vs prod [S-C]:** the retry classifier (`:33–41`) only treats `ERR_FAILED`, `ERR_CONNECTION_REFUSED`, `ERR_CONNECTION_RESET`, `ERR_NAME_NOT_RESOLVED`, `ERR_INTERNET_DISCONNECTED` as transient. `ERR_ABORTED` (raised when the window is destroyed mid-load → see §5.6) and prod's `ERR_FILE_NOT_FOUND` (missing `dist/`) are **non-transient** → immediate `false`, no retries. Also note `loadUrlWithRetry` returns `false` immediately if `win.isDestroyed()` at `:26`.
**Recommended transition:** propagate load failure to the caller (reject, or resolve with a status) so §5.1's rollback can fire; stop logging "creation complete" for `loadOk === false`.

### 5.3 Start clicked repeatedly

**[S]** Guard `main.ts:2754–2758`: `if (this.isMeetingActive || this._sessionState === 'starting') return` (with a warning). `_sessionState='starting'` is set at `:2760` **before** the awaited `_pendingTeardown` (`:2766`) and the awaited `ensureMacMicrophoneAccess` (`:2786`), so overlapping clicks cannot double-boot; creation is additionally protected by `:343–351`.
**[S-C] Residual:** on the permission-denied path (`:2786–2795`) state rolls back to `idle` and an error is thrown, but **no overlay cleanup runs** — safe only because C2 sits after that check. Keep it that way, or add cleanup.
**Verdict: already safe; preserve the ordering.**

### 5.4 Stop clicked while startup is still in progress

**[S]** `isMeetingActive` becomes true only at `:2838`, after the awaits; `endMeeting()` early-returns at `:2954–2957` when `!isMeetingActive && !_isDraining`. A Stop arriving during `'starting'` is therefore **silently ignored** and the session completes its activation anyway.
**[S-C] Related guard:** the deferred audio block re-checks `if (!this.isMeetingActive) return` (`:2889–2895`, "BUG-02 fix"), so a Stop *after* `:2838` but *before* the `setTimeout(0)` callback prevents the audio pipeline — while C2 (`:2833`) has already been dispatched and is **not** re-checked. Result: an overlay can be created for a session that was cancelled before audio ever ran, and only the later D1 destroys it.
**Recommended transition:** `'stopping'`/`'idle'` must cancel a pending creation, not merely hide it (see §5.6).

### 5.5 "Meeting Ongoing" clicked while overlay creation is incomplete

**[S]** `Launcher.tsx:774` → `ipcHandlers.ts:197–200` → `switchToOverlay()` `:697`. The function sets `currentWindowMode='overlay'` (`:699`) and `KeybindManager.setMode('overlay')` (`:700`) **before** any usability test, sends `ensure-expanded` at `:702` (only `?.`-guarded, not `isDestroyed()`-guarded), takes the "no usable overlay — cannot show" branch (`:779–781`) — and then **hides the launcher unconditionally at `:783–785`**.
**[S-C] Net effect:** the user is left on an empty desktop with a live session and hotkey mode `'overlay'`, until Ctrl+B (C3) or another launcher reveal path. This is a **pre-existing** defect (Module 04A finding 20: "`switchToOverlay` changes mode and hides the launcher before confirming the overlay is usable"), but Option B **materially raises its likelihood**: creation now begins exactly when the user is most likely to click, instead of having been warm for seconds.
**Recommended transition (must ship with Option B):** in `switchToOverlay`, (i) test usability first; (ii) if creation is in flight, await it or no-op — never hide the launcher; (iii) set `currentWindowMode`/KeybindManager mode only when the window is usable; (iv) move the launcher hide inside the success branch (INV-4).

### 5.6 Stop followed immediately by Start (and Stop during an in-flight creation)

**[S]** Two mechanisms already help: `startMeeting()` awaits `_pendingTeardown` (`:2766–2774`) before touching anything, and D1's destroy is guarded by `this._sessionId === endedSessionId` (`:3114`) so a fresh session's window is never destroyed by a stale drain.
**[S-C] Gap that Option B exposes:** `destroyOverlayWindow()` (`:446–458`) does not clear `_overlayCreating`. Sequence: Start (C2 dispatches creation, awaits `loadURL`) → Stop before the load resolves → D1 nulls the field and destroys the window → new Start → `ensureOverlayWindow()` sees `overlayWindow === null` but `_overlayCreating` non-null → **returns the stale promise at `:348–351` and never creates a window for the new session**. When the stale promise settles it reads `this.overlayWindow` at `:425–427` (the *new* session's `null`), may skip `setupOverlayWindowListeners()` at `:429`, and clears `_overlayCreating` at `:436`. The new session therefore runs with **no overlay**, and any earlier "Meeting Ongoing" click hits §5.5.
**Recommended transition:** make teardown authoritative over creation — clear/replace `_overlayCreating` inside `destroyOverlayWindow()`, and have the creation closure capture its own `win` locally and refuse to publish it if a teardown happened during its `await`.

### 5.7 Idle-state paths that assume a warm overlay

**[S]** Three paths can demand the overlay while `_sessionState === 'idle'`:

1. **Global screenshot/chat shortcuts** — `main.ts:475–480`: for any id in `screenshotOrChatActions`, if `getCurrentWindowMode() === 'launcher'` it calls `switchToOverlay(true)`. Those ids are registered in launcher mode (`KeybindManager.ts:105–118` registers `general:take-screenshot`, `general:selective-screenshot`, `general:capture-and-process`, all `window:move-*`, `general:toggle-mouse-passthrough`), and Ctrl+1 (`chat:whatToAnswer`, `KeybindManager.ts:24`) is in the same list.
2. **`showMainWindow()` / `toggleMainWindow()` / `centerAndShowWindow()`** — `WindowHelper.ts:668–695`; each routes to `switchToOverlay` when `currentWindowMode === 'overlay'`. Reachable from `second-instance` (`main.ts:4432–4438`) and `activate` (`main.ts:4690–4710`).
3. **`hideMainWindow()`** — `WindowHelper.ts:603–609`: `this.overlayWindow?.setOpacity(0)` / `.hide()`; null-safe, but **not** destroyed-safe if the field ever holds a closed-but-non-null window (§5.8).

**[S-C] Option B impact:** path (1) is the important one. Today it silently upgrades the user into overlay mode against a warm window. With lazy creation it can flip `currentWindowMode='overlay'` + `KeybindManager.setMode('overlay')` and hide the launcher with **nothing to show**, and it strands the many window-targeted sends those shortcuts rely on, which resolve through `getMainWindow()` or `getOverlayWindow()` (`main.ts:543`, `:1288–1289`, `:2685–2688`, `:3586–3592`, `:4355–4357`) against a surface the user cannot see.
**Recommended transition:** make those branches visibility-driven and session-aware — reveal/create only while a session is active, otherwise deliver into the launcher or no-op, and never leave `currentWindowMode='overlay'` while `overlayWindow === null` (INV-3).

### 5.8 Overlay unexpectedly destroyed while the session is active

**[S]** The overlay has **no `'closed'` and no `'unresponsive'` listener** (`setupOverlayWindowListeners` `:525–565` lists only move, resize, `system-context-menu`, win32 `blur`, `close`). Its only crash handling is `render-process-gone` → `overlayWindow.reload()` (`:414–420`). The `close` handler (`:555–564`) preventDefaults **only while `isVisible()`**; a *hidden* overlay that receives `close()` closes for real, Electron fires `'closed'`, and the field keeps a destroyed object.
**[S-C] Downstream damage of a destroyed-but-non-null field:** `getMainWindow()` `:568` returns it (that test is truthiness, not `isDestroyed()`); `switchToOverlay` `:702` then throws on `webContents.send`; `toggleAssistantOverlay` `:3618` throws while building its own diagnostic string (`getOpacity()` / `getBounds()` on a destroyed window) **before** reaching the correct `isDestroyed()` branch at `:3620`; `hideMainWindow` `:605–607` throws on `setOpacity`. `ensureOverlayWindow` `:343` is the only accessor that handles the case correctly.
**Recommended transition:** add `overlayWindow.on('closed', …)` that nulls the field and `_overlayCreating`; make every accessor `isDestroyed()`-safe; guard `main.ts:3618`'s diagnostics; and decide the session policy explicitly — either re-create (C3 already does this) or downgrade to the launcher with a user-visible banner.

### 5.9 Cross-cutting state that must stay consistent (all **[S]** today)

| State | Written by | **Not** written by | Risk under Option B |
|---|---|---|---|
| `WindowHelper.currentWindowMode` `:68` | `switchToOverlay` `:699`, `switchToLauncher` `:790` | `destroyOverlayWindow` `:446`, `hideOverlay` `:655`, `showOverlay` `:625` | INV-3 violation → `getMainWindow()` `:567–572`, `second-instance`, `activate`, `hideMainWindow` mis-route |
| `WindowHelper.isWindowVisible` `:62` | `:316`, `:449`, `:467`, `:608`, `:756`, `:818` | `showOverlay` / `hideOverlay` | already stale (Module 04A D.1); Option B adds no new writer |
| `KeybindManager.activeMode` `:65` | `setMode` from `:700` / `:791` | teardown | mirrors `currentWindowMode` ⇒ same fix window |
| `WindowHelper.overlayBounds` `:66` | `:166`, `:189`, `:530`, `:536`, `:761`; nulled by `resetOverlayPosition` `:579` | `destroyOverlayWindow` | Stale bounds survive Stop→Start only if `main.ts:2826` were reordered below `switchToOverlay` — do not reorder |
| `AppState._sessionState` / `_sessionId` | `main.ts:2760`, `:2839`, `:2978–2979`, `:3116–3117`, `:3174–3175` | — | already the right authority for INV-1 |

---

## 6. Dependency and implementation map

> Design map only. **No replacement code was written and no file was modified.**

### 6.1 Files Option B actually requires to change

| # | File | Why | Size of change |
|---|---|---|---|
| **F1** | **`electron/WindowHelper.ts`** | Owns the only overlay constructor. `:327` is the **only line in the whole tree that creates the overlay before Start**; `:446–458`, `:697–786`, `:340–440`, `:525–565` must be hardened for INV-3/INV-4/INV-5 and §5.8 | Small but load-bearing: one removal + four guards |
| **F2** | **`electron/main.ts`** | `startMeeting` `:2826–2840` (verify creation, failure rollback), `toggleAssistantOverlay` `:3617–3620` (destroyed-reference safety incl. the unsafe diagnostics at `:3618`), idle shortcut branch `:475–480` (session gate) | Medium — ordering + error paths |

Everything else is verified as **not requiring** change for Option B (§6.2, last rows).

### 6.2 Precise units affected

| Unit | Current behaviour | Option B disposition |
|---|---|---|
| `WindowHelper.createWindow()` `:192–330` | creates + loads the launcher, **then `await this.ensureOverlayWindow()` `:327`**, then `setupWindowListeners()` `:329` | **Remove the `:327` eager call.** Keep `:329` — it is launcher-only (`:463–521`). Do not delete the function: the launcher half is required |
| `WindowHelper.ensureOverlayWindow()` `:340–440` | correct idempotency `:343–351`; silent partial init when `loadOk === false` (`:429–432`); always logs "creation complete" | **Reuse as-is — the single creation primitive.** Two additions only: (a) surface `loadOk === false` to the caller, (b) capture `win` locally and honour a teardown that happened during the `await` |
| `WindowHelper.destroyOverlayWindow()` `:446–458` | nulls field, `removeAllListeners('close')`, `destroy()` | **Reuse — do not duplicate.** Add: clear `_overlayCreating` (INV-5) and force `currentWindowMode='launcher'` + `KeybindManager.setMode('launcher')` (INV-3) |
| `WindowHelper.switchToOverlay()` `:697–786` | flips mode `:699–700`, unguarded `webContents.send` `:702`, usability branch `:704`/`:779`, **unconditional launcher hide `:783–785`** | Must be reordered so usability is tested first and the launcher hide happens only in the success branch (INV-4). **This is the change that makes Option B safe rather than merely nominally compliant** |
| `WindowHelper.setupOverlayWindowListeners()` `:525–565` | per-window listeners; no `'closed'` / `'unresponsive'` | Add them per §5.8 |
| `WindowHelper.getMainWindow()` `:567–572` / `hideMainWindow()` `:603–609` / `showOverlay()` `:625` / `hideOverlay()` `:655` / `syncOverlayInteractionPolicy()` `:611` / `setOverlayDimensions*` `:148`/`:169` / `applyContentProtection()` `:113–121` / `getLastOverlayDisplayId()` `:588` | already null-tolerant; `:702`, `:605–607` are not destroyed-tolerant | Close the destroyed-reference gaps only |
| `AppState.startMeeting()` `main.ts:2753–2949` | C2 dispatched fire-and-forget `:2833`; state marked active `:2838–2839` | Keep creation **after** the permission checks (`:2786`, `:2806`) as today; verify the outcome and roll back on failure (§5.1/§5.2) |
| `AppState.endMeeting()` `main.ts:2951–3125` | D1 at `:3115` inside `_pendingTeardown`, guarded `:3114` | **Unchanged** — it already satisfies "Stop destroys the overlay" |
| `AppState.forceEndMeeting()` `main.ts:3132–3180` | synchronous `destroyOverlayWindow()` `:3173` | **Unchanged**; reuse as the rollback path for a failed Start (§5.1) |
| `AppState.toggleAssistantOverlay()` `main.ts:3600–3660` | session-gated `:3612`; recreate `:3620–3636`; diagnostics `:3618` unsafe for destroyed refs | Reuse the recreate branch — it is already Option B's "create on demand". Fix `:3618` only |
| `AppState.createWindow()` `main.ts:3556–3558` | non-awaiting wrapper | Unchanged (F1 removes the eager inner call) |
| Shortcut branch `main.ts:475–480` | `switchToOverlay(true)` for any screenshot/chat action | Needs the session/usability gate (§5.7) |
| `KeybindManager.setSessionActive` `:88–93` / `shouldRegister` `:99–101` | Ctrl+B registered only during a session | **Unchanged — reuse.** (The unreachable duplicate branch at `:105` was already reported in Module 04A finding 2) |
| `ipcHandlers.ts:197–200` (`set-window-mode`), `:304`/`:308` (`show-overlay`/`hide-overlay`), `:155–196` (`update-content-dimensions*`), `:2706`/`:2716`/`:2726` (meeting lifecycle) | all null-safe via `getOverlayWindow()` / `webContents.id` comparison | **No change required.** No IPC handler creates the overlay, so Option B adds **no new IPC surface** |
| `preload.ts` (`setWindowMode` `:896`, `showOverlay` `:600`, `hideOverlay` `:601`, `getMeetingActive` `:602`) | — | **No change required** |
| `src/App.tsx` (routing `:39–43`, overlay render `:482–508`, `handleStartMeeting` `:384–416`, `handleEndMeeting` `:418–448`) | — | **No change required** — routing is by URL query, which is unchanged; the overlay document merely starts existing later |
| `src/components/Launcher.tsx` (CTA `:765–800`; Start `:777`, Meeting Ongoing `:774`) | — | **No change required**; whether to show an "initialising" affordance is a §5.5 UX decision, not a lifecycle necessity |
| `src/components/NativelyInterface.tsx` (subscriptions `:971–1125`, mount `setModel()` `:665–676`, size report `:592–610`, logo → launcher `:1399`) | — | **No change required** — all of it moves to Start-time automatically |
| `electron/WindowManager.ts`, `electron/EnterpriseArchitecture.ts`, `electron/services/ErrorNotificationService.ts`, `electron/main/GlobalErrorHandler.ts`, `electron/sidecar/sidecarIntegration.ts`, `src/_pages/*`, `src/components/SuggestionOverlay.tsx`, `renderer/src/*`, `electron_backup_safe/`, `clean_build/`, `main/` | not reachable from the live main process, or referenced by no importer | **Out of scope — do not "fix" them for Option B** |

### 6.3 Existing functions to reuse (do not reinvent)

`WindowHelper.ensureOverlayWindow()` `:340` (the only creation primitive) · `WindowHelper.destroyOverlayWindow()` `:446` (the only teardown primitive) · `switchToLauncher` `:788` / `switchToOverlay` `:697` / `setWindowMode` `:826` (the only mode transitions) · `resetOverlayPosition` `:578` + `overlayBounds` memory · `AppState.forceEndMeeting()` `main.ts:3132` (complete synchronous rollback) · `broadcast()` `main.ts:697`, `broadcastMeetingState()` `:717`, `_broadcastToAllWindows()` `:4353` (status surface) · `loadUrlWithRetry()` `WindowHelper.ts:18–58` · `KeybindManager.setSessionActive()` `:88` · `_sessionState` / `_sessionId` / `_pendingTeardown`.

### 6.4 Logic that must **not** be duplicated

| Do not duplicate | Because |
|---|---|
| A second overlay `new BrowserWindow(...)` (e.g. inline in `startMeeting`) | `main.ts:3596–3599` documents the single-overlay invariant; a second constructor defeats the alive-check `:343` and the C3 recreate path |
| A second boot-time "prepare overlay" hook (a new prewarm, an `app.whenReady` post-create, or a launcher `did-finish-load` trigger) | re-introduces the exact Option B violation. Note `WindowHelper.ts:313–317` already fires `switchToLauncher()` on launcher load — nothing should be added there |
| A parallel teardown (`win.close()` from an IPC handler, or a `destroy()` inline in `endMeeting` next to `:3115`) | `destroyOverlayWindow()` deliberately `removeAllListeners('close')` `:452` to bypass the hide-instead-of-close policy `:555–564`; a second path can strand the field non-null |
| Re-attaching `did-fail-load` / `render-process-gone` / window listeners per show operation | `setupOverlayWindowListeners()` is correctly per-window (`:429`); moving it into `showOverlay`/`switchToOverlay` yields N listeners per window per session |
| A second renderer-side subscription path or a "session started" re-subscribe inside `NativelyInterface` | `useIpc` `:240–246` already owns mount/unmount; a manual re-subscribe doubles handlers |
| A new `ensure-overlay` IPC channel invoked from the launcher | the launcher already reaches creation correctly via Start (`ipcHandlers.ts:2706` → C2); a new channel widens surface without solving INV-5 |
| Moving `prewarmSttProviders()` `main.ts:4527` / Whisper preload `:391` into `startMeeting` | no dependency on the overlay window (§3.3) and it adds latency to the Start critical path |

### 6.5 Risks to adjacent subsystems

| Subsystem | Risk under Option B | Evidence / mitigation |
|---|---|---|
| **Settings** | Settings/model-selector windows parent to `getMainWindow()` (`SettingsWindowHelper.ts:101–104`, `ModelSelectorWindowHelper.ts:56–61`), and macOS behaviour keys off `isOverlay` (`ModelSelectorWindowHelper.ts:57–74`). Pre-Start that is the launcher → dropdown loses `alwaysOnTop` / `setVisibleOnAllWorkspaces`: the *correct* idle behaviour, but a visible change from today | **[S]** both call sites already null-guard. Test T-04 |
| **Settings → resize** | `SettingsWindowHelper.setWindowDimensions` `:304–320` writes bounds to `getMainWindow()`, i.e. the launcher pre-Start / post-Stop | Pre-existing; unchanged once INV-3 keeps the mode honest |
| **IPC** | `update-content-dimensions` compares `webContents.id` against a possibly-null `overlayWin` (`ipcHandlers.ts:161–176`, `:190–196`) — safe; no handler creates the overlay | **[S]** no change |
| **Audio / STT** | Start-time creation now competes with the deferred pipeline init (`main.ts:2888–2948`); the 5–7 s macOS SCK/CoreAudio init is documented at `:2827` and `:2884–2887` | Keep creation **before** the `setTimeout(0)` (today's order) so the window is warm when audio lands. Tests T-02, T-09 |
| **Existing UI** | Things that silently no-op without an overlay: `showOverlay` `:625–631`, `hideOverlay` `:655`, `syncOverlayInteractionPolicy` `:611`, `setOverlayDimensions*`, `applyContentProtection` `:113–121`, `getLastOverlayDisplayId` `:588`, disguise writes `main.ts:4303`/`:4317–4321` | All null-guarded **[S]**; the un-guarded ones are §5.7 path (1) and `main.ts:3618` |
| **Stealth / disguise** | `applyInitialDisguise()` runs **before** `createWindow()` (`main.ts:4492` vs `:4520`) and only touches the overlay via `?.setIcon` / `setTitle`; the overlay constructor (`WindowHelper.ts:359–384`) sets **no `icon` and no title**, and content protection is applied at `:387–388` only | Real gap: a Start-created overlay must re-inherit disguise icon/title and current `contentProtection`/passthrough state. Test T-10 |
| **Mouse passthrough** | `overlayMousePassthrough` is in-memory (`main.ts:4151`) and reset at Stop (`:2977–2979`) while the overlay still exists (destroy happens later at `:3115`) → ordering stays correct | **[S]** no change needed |
| **Telemetry / analytics** | `trackAssistantStart()` / `trackAssistantStop()` (`App.tsx:58–89`) become **per session** instead of per launch; every Stop→destroy now emits an assistant-stop event | Behaviour change, not a defect — flag to analytics consumers (§7.1 item 6, §8 q.1) |
| **macOS only** | `StealthKeyboardManager.setOverlayWindow()` `:393–400`, `type:'panel'` `:383`, `setVisibleOnAllWorkspaces` `:402–405` | Out of Windows scope; effects **[NV]** |

### 6.6 Recommended implementation order

1. **Hardening first (no behaviour change):** `destroyOverlayWindow()` clears `_overlayCreating` and forces mode→launcher (INV-3/INV-5); `switchToOverlay()` reordered so it never hides the launcher without a usable overlay (INV-4); overlay `'closed'` listener added; missing `isDestroyed()` guards closed (`main.ts:3618`, `WindowHelper.ts:702`, `:603–609`).
2. **Then remove the eager creation:** delete the `ensureOverlayWindow()` call at `WindowHelper.ts:327`, leaving `:329`. This single removal is what *achieves* Option B — and it must land **after** step 1, otherwise §5.5/§5.6 become the primary user path.
3. **Then close the idle loopholes:** session-gate `main.ts:475–480`; make `showMainWindow` / `centerAndShowWindow` / `toggleMainWindow` (`WindowHelper.ts:668–695`) mode-honest under INV-3.
4. **Then failure semantics:** propagate `loadOk === false` out of `ensureOverlayWindow`; on creation/load failure at Start, roll back through the existing force-end path and emit a user-visible channel.
5. **Then re-verify** §7's matrix on Windows, and only then consider optional polish (the deferred `switchToLauncher` at `main.ts:2832`, the `height: 1` birth size at `WindowHelper.ts:361`).

---

## 7. Verification plan (Windows test matrix)

Environments: Windows, both `npm run app:dev` (Vite on 5180, `startUrl = http://localhost:5180`, `webSecurity: !isDev` off, DevTools detached) and an installed 2.6.0 build (`file://<root>/dist/index.html`). Both are required — the retry classifier in `WindowHelper.ts:33–41` behaves materially differently between them. Observability: main-process console, `BrowserWindow.getAllWindows().length`, the cid-tagged `WindowHelper` logs (`:85–93`, `:341–347`, `:434`, `:627`, `:657`, `:779`), Task Manager renderer-process count, and `get-stt-pipeline-diagnostics` (`ipcHandlers.ts:317–327`).

| ID | Scenario | Steps | Pass criteria | Anchors |
|---|---|---|---|---|
| **T-01** | Initial launch | Start the app; wait 60 s; touch nothing | Exactly **one** window; `getOverlayWindow() === null`; **no** `?window=overlay` renderer present; no `trackAssistantStart`; no `ensureOverlayWindow: creating overlay` log line; Ctrl+B does nothing; STT diagnostics show `capturing:false`, `sttConnected:true` (prewarm only) | `WindowHelper.ts:327` removed; `main.ts:4522–4531`; `KeybindManager.ts:99–101` |
| **T-02** | Start & first creation | Click Start Natively | Exactly one `creating overlay` log; window count → 2; launcher **stays visible**; overlay **stays hidden**; pill → "Meeting ongoing"; overlay size reaches ≈600×≥216 via the renderer's first `update-content-dimensions`; no audio before the `setTimeout(0)` block | `main.ts:2826–2840`, `:2888`; `WindowHelper.ts:359–384`, `:422` |
| **T-03** | Ctrl+B hide/show | During a session: Ctrl+B reveal → Ctrl+B hide → ×10 | First Ctrl+B reveals promptly **even when pressed <1 s after Start** (the §5.5 timing question); hide leaves the window alive (count stays 2) and only hides it; transcript keeps arriving while hidden; `currentWindowMode` returns to `launcher` on the hide path | `main.ts:3600–3660`; `WindowHelper.ts:655–666`, `:788–825` |
| **T-04** | Home & Meeting Ongoing | Reveal → click logo/Home → click "Meeting ongoing" → ×5 | Home keeps session alive and the same overlay instance (count 2, **no** new `creating overlay` log); Meeting Ongoing restores it without calling `ensureOverlayWindow` or `setupSystemAudioPipeline`; `sttConnected` stays `true`; settings/model-selector parenting stays correct | `NativelyInterface.tsx:1399`; `Launcher.tsx:767–779`; `ipcHandlers.ts:197–200`; `ModelSelectorWindowHelper.ts:56–74` |
| **T-05** | Ctrl+1 visibility conditions | (a) idle launcher, press Ctrl+1 globally; (b) session active, overlay hidden; (c) session active, overlay revealed | (a) must **not** blank the desktop and must not leave `currentWindowMode='overlay'` with `overlayWindow===null` (§5.7); (b)/(c) answers must land on a **visible** surface | `main.ts:475–480`; `KeybindManager.ts:24`, `:105–118`; `NativelyInterface.tsx:689–712` |
| **T-06** | Stop & destruction | Stop from the revealed overlay, then from the hidden overlay | Immediate launcher swap (`main.ts:3004`); window count → 1 within ~1 s; `Assistant overlay destroyed` log; `meeting-state-changed` reaches `idle`; captures + STT nulled; no transcript IPC after destroy | `main.ts:2951–3125`, `:3110–3119` |
| **T-07** | Failed creation & retry | Force failure: (i) dev with the Vite server stopped **before** Start; (ii) prod with `dist/index.html` renamed | Overlay must **not** remain as a live-but-blank window (§5.2); a second Start must succeed; no unhandled rejection; a user-visible error rather than log-only (§5.1) | `WindowHelper.ts:18–58`, `:422–432`; `main.ts:2833–2835` |
| **T-08** | Repeated lifecycle | Start→(Ctrl+B)→Stop ×20; then Start→Stop→**immediate** Start ×10 | Window count is 1 after every Stop and 2 after every Start; no accumulating renderer processes; exactly one `creating overlay` per Start; each utterance appears **once** (no doubled `native-audio-transcript` handling); overlay centred each session | `main.ts:2766`, `:3114`; `WindowHelper.ts:343–351`, `:578` |
| **T-09** | Stop during in-flight creation → Start | Start, Stop within ~300 ms, Start again immediately | The third Start must produce a live overlay; no `reusing in-flight creation promise` log for the new session (§5.6) | `WindowHelper.ts:332`, `:348–351`, `:435–437`, `:446–458` |
| **T-10** | Disguise / stealth inheritance | Set a disguise mode, Start, Ctrl+B | A Start-created overlay carries disguise icon + title, content protection (`WindowHelper.ts:387–388`), `screen-saver` z-order (`:406–407`) and the current passthrough policy (`:611–622`) | `main.ts:4303`, `:4317–4321`, `:4492` vs `:4520` |
| **T-11** | External close / crash | While the overlay is **hidden** in a session, `window.close()` it from devtools; separately kill its renderer from Task Manager | No `Object has been destroyed` throw (§5.8); `render-process-gone` reloads (`:414–420`); after an external close, Ctrl+B or Meeting Ongoing must recover deterministically instead of stranding the desktop | `WindowHelper.ts:525–565`, `:568`, `:702`; `main.ts:3618` |
| **T-12** | Quit paths with no overlay | Idle → quit via tray / close; and session-active → quit | `window-all-closed` (`main.ts:4712`) and the launcher `close` interception (`WindowHelper.ts:497–504`) behave as today; the launcher `"closed"` handler tolerates `overlayWindow === null` | `WindowHelper.ts:513–520` |
| **T-13** | Failure feedback after Option B | Combine T-07 with Ctrl+B and "Meeting ongoing" | After a failed creation the pill must not stay green with no reachable assistant; Stop must return cleanly to `idle` | §5.1, §5.5 |

### 7.1 Source-verified conclusions (no runtime needed)

1. Exactly **one** code location creates the overlay before Start: `electron/WindowHelper.ts:327`, reached from `main.ts:4520` through two non-awaited wrappers. **[S]** + **[B]**
2. Exactly **three** live `ensureOverlayWindow()` call sites (C1/C2/C3, §2.2); two are already session-gated. **[S]**, corroborated in `dist-electron/electron/main.js:176247 / 318937 / 319495`. **[B]**
3. `ensureOverlayWindow()` is already idempotent and concurrency-joining, so Start→Ctrl+B cannot produce two windows. **[S]** `WindowHelper.ts:343–351`
4. Stop already **destroys** rather than hides (`main.ts:3110–3119`, `:3173`), and Start already awaits the previous teardown (`:2766–2774`) — so "create exactly once per session" and "return to the idle launcher" are **already implemented**. **[S]**
5. No audio capture, no output-watcher timer, no STT socket and no LLM answer generation begins at boot (`main.ts:687–689`, `:1071–1076`, `:1255–1261`, `:2500`/`:2932`). Only STT/Whisper **objects and a cached model** are warmed (`:391–410`, `:4522–4531`), and those have no dependency on the overlay window. **[S]**
6. The overlay renderer's boot-time work (≈50 subscriptions, DOM key listeners, 30 s trial poll, `setModel()` broadcast, size writes) is a consequence of the window and disappears when `:327` is removed — **no renderer file needs editing**. **[S-C]**
7. No IPC channel, preload API or renderer file must be added for Option B. **[S-C]** from §2.2 / §6.2.
8. `switchToOverlay()` changes mode and hides the launcher before proving the overlay is usable (`WindowHelper.ts:699–702`, `:779–785`), and `main.ts:475–480` can invoke it with no session: **pre-existing** defects that lazy creation makes reachable. **[S]**
9. `destroyOverlayWindow()` leaves `_overlayCreating` and `currentWindowMode` untouched (`:446–458`) — a provable stale-promise and stale-mode hazard. **[S]**
10. The overlay has no `'closed'` / `'unresponsive'` listener (`:525–565`), so several accessors can throw on a destroyed-but-non-null reference (`:568`, `:605–607`, `:702`; `main.ts:3618`). **[S]**
11. The requirement is met by **one removal plus ordering discipline**, not by a new lifecycle subsystem: every other Option B behaviour (background Start, hidden reveal, Home persistence, Meeting Ongoing restore, Stop teardown, recreate on demand) already exists in source. **[S-C]**

### 7.2 Runtime-only questions (must be measured, never asserted)

* Wall-clock cost of creation + `?window=overlay` load on a cold Windows start (process spawn, Vite module graph, Prism/KaTeX parse) → decides whether Ctrl+B immediately after Start feels delayed. **[NV]**
* Whether `loadUrlWithRetry`'s first attempt usually lands before the user can click "Meeting Ongoing" — i.e. the real width of the §5.5 window. **[NV]**
* Visual artefacts of a `height: 1` → ≥216 px → content-height transition on a `transparent: true` frameless window, including the 60 ms content-protection opacity ramp (`WindowHelper.ts:735–745`); the project's Windows black-screen history makes this non-theoretical. **[NV]**
* Whether GPU-disabled mode (`main.ts:4385–4403`) makes per-session renderer creation/destruction perceptible, and whether 20 cycles of a screen-saver-level transparent always-on-top window leak DWM/GPU resources. **[NV]**
* Actual `globalShortcut` registration latency around `setSessionActive(true)` (`main.ts:2836`). **[NV]**
* Focus/stealth behaviour after the §5.7 branch change — Module 04A D.2 already rules out `isFocused()` as a gate, so the replacement discriminator needs measurement. **[NV]**
* Whether mid-session `render-process-gone` → `reload()` restores transcript/answer state or drops in-flight tokens. **[NV]**

---

## 8. Unresolved questions

1. **Is Option B "no window before Start", or "no window and no window-adjacent work before Start"?** The renderer side effects vanish either way, but the intended treatment of `main.ts:4527` STT prewarm and `:391` Whisper preload is not stated. This module recommends **leaving both at boot** (§3.3); needs product confirmation.
2. **Must Start *await* creation before returning success?** Today `start-meeting` resolves while creation is still in flight (`main.ts:2833` is `void`-dispatched; `ipcHandlers.ts:2706–2714` resolves right after `startMeeting`). Option B's "handle initialization failures without leaving partially initialized resources" implies awaiting at least the window construction; whether the **load** must also be awaited (adding a dev-server round trip to CTA latency) is a decision, not a fact. **[NV]**
3. **What must idle-state shortcuts do with no overlay?** §5.7 lists three behaviours that assume a warm overlay (Ctrl+1…7 + screenshots, `second-instance`, `activate`). Option B needs one explicit answer per action (reveal+create / route to launcher / no-op).
4. **Is `height: 1` (`WindowHelper.ts:361`, `minHeight: 1` `:365`) still acceptable** when creation is user-triggered, or should the window be born at `OVERLAY_MIN_HEIGHT` (216, `:76`) to avoid a visible birth size?
5. **Deferred destroy vs. "Stop destroys the overlay"** — D1 runs ≥ ~250 ms plus RAG/summary work after the click (`main.ts:3057–3119`). If Option B acceptance measures "window gone immediately after Stop", either the placement moves earlier or the acceptance wording changes. Its *intent* (trailing STT finals + meeting save with no live renderer) is statically evident; its real duration is **[NV]**.
6. **Do Settings / model-selector / cropper need the overlay as parent for correct Windows z-order?** `ModelSelectorWindowHelper.ts:80+` special-cases the overlay; a launcher-parented dropdown during a session with the overlay hidden is unmeasured. **[NV]**
7. **Modules 01/02 continuity** cannot be established from this tree: no such report exists here and there is no Git metadata (§1.4). Only 03, 03A, 04 and 04A are verifiable in-tree, and 04A's nine digests match exactly.
8. **Is the `?window=` fallback still wanted?** `App.tsx:43`/`:482` route an unparameterized load to the full overlay UI — a second silent route to that document even under Option B.
9. **`src/App.tsx:201–336` is not window-scoped.** Under Option B its 30 s trial poll and license reads become per-session for the overlay; whether that is desirable versus launcher-only is an unasked product question this module flags, not answers.

---

## 9. Bottom line

* **The gap is one line.** `electron/WindowHelper.ts:327` is the only thing in the live tree that creates the assistant overlay before Start Natively. Everything else Option B asks for — create-once at Start, keep the session across Home / Meeting Ongoing, destroy at Stop, recreate on demand — is **already implemented** by C2/C3/D1/D2 plus `main.ts:2766`, `:2826–2840` and `:3110–3119`. **[S]**
* **The work is not the removal, it is the ordering of the guards.** Removing `:327` without first fixing `switchToOverlay()`'s unconditional launcher hide (`WindowHelper.ts:783–785`), the idle shortcut branch (`main.ts:475–480`), `_overlayCreating` not being invalidated by teardown (`:446–458`) and the silent partial-init on load failure (`:429–432`) turns today's rare edge cases into the primary user path. §6.6 sequences exactly that. **[S-C]**
* **Nothing else must be moved.** STT object prewarm, Whisper preload, RAG/Ollama/telemetry/timers are app-wide and overlay-independent (§3.2, §3.3, §6.4).
* **No runtime claim appears anywhere in this document.** Every "confirmed" statement is source- or build-output-derived; every timing, focus, compositor and per-cycle-leak question is listed as runtime-only in §7.2.

*No source, configuration, dependency, package, UI or existing report was modified by this module.*

