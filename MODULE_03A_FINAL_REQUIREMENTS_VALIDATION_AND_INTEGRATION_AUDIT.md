# MODULE 03A — FINAL REQUIREMENTS VALIDATION & INTEGRATION AUDIT

**Project:** Natively v2.6.0
**Audit type:** Read-only source validation, no code changes
**Audit date:** 2026-11-11

---

## 0. Scope statement and how to read this report

This audit re-verifies every approved requirement against the current source tree. Nothing was modified, installed, renamed or deleted. Previous Module 01 / 02 / 02A / 03 reports were **not** treated as authoritative: where they existed as files only `MODULE_03_SETTINGS_AND_FEATURE_WIRING_AUDIT.md` was present in the repository, so Module 01 / 02 / 02A findings were re-derived from source rather than copied.

Status vocabulary used throughout:

| Status | Meaning |
| --- | --- |
| **PASS** | Source trace covers the whole path and matches the requirement. |
| **PARTIAL** | The path exists but a required branch, guard, or state transition is missing or bypassable. |
| **FAIL** | The required behaviour is absent, contradicted, or routed to the wrong handler. |
| **NOT VERIFIED** | Could not be established statically and was not exercised at runtime in this environment. |

Runtime figures are never inferred from source. Section G separates what was inspected from what was executed.

---

## A. Environment and project inventory

### A.1 Actual project root

| Item | Value |
| --- | --- |
| Workspace root | `E:\Project\natively-cluely-ai-assistant-main` |
| **Actual application root** | `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main` |
| `package.json` version | `2.6.0` |
| Electron main entry (`main`) | `dist-electron/electron/main.js` (built from `electron/main.ts`) |
| Repository metadata | **Not available** — no `.git` directory at the app root (`fatal: not a git repository`). Commit hash and branch cannot be reported. |

Note: the outer workspace folder also contains `tsc-output.txt`, `.freebuff`, `.kilo` and the nested app folder. All findings below refer to the nested app root.

### A.2 Versions (declared vs. installed)

| Component | Declared | Installed in `node_modules` |
| --- | --- | --- |
| Node.js | — | **v24.22.1** (environment) |
| npm | — | **11.19.1** |
| Electron | `^45.2.3` | **45.2.3** |
| React / React-DOM | `^19.2.6` | **19.3.1** |
| TypeScript | `^5.6.3` | **5.9.3** |
| Vite | `^5.4.21` | **5.4.21** |
| `sherpa-onnx-node` | `^2.0.1` | **2.0.1** |
| `whisper-node` | `^1.1.1` | declared (dependency) |
| `@huggingface/transformers` | `^4.3.2` | declared (used by Local Whisper) |
| `better-sqlite3` / `sqlite3` / `sqlite-vec` | `^13.0.3` / `^6.0.1` / alpha | declared |
| Electron-builder | `^25.1.0` | declared |
| Playwright | `^1.59.1` | declared (e2e only) |

**IDE and coding-AI/model versions:** not exposed to this session and deliberately not guessed. They are unrelated to the LLM configured inside Natively, which is resolved at runtime by `CredentialsManager` / `LLMHelper` (see Section C.8).

### A.3 Key source modules discovered

| Concern | Files |
| --- | --- |
| Main process entry / AppState | `electron/main.ts` (4,789 lines) |
| IPC surface | `electron/ipcHandlers.ts` (4,701 lines) |
| Preload bridge | `electron/preload.ts` (1,537 lines) |
| Window management | `electron/WindowHelper.ts` (887), `electron/WindowManager.ts` (476 – unrelated/secondary), `SettingsWindowHelper.ts`, `ModelSelectorWindowHelper.ts`, `CropperWindowHelper.ts` |
| Shortcuts | `electron/services/KeybindManager.ts` (518), `src/hooks/useShortcuts.ts`, `src/utils/keyboardUtils.ts` |
| Audio capture | `electron/audio/SystemAudioCapture.ts`, `MicrophoneCapture.ts`, `AudioDevices.ts`, `noiseSuppressor.ts` |
| STT providers | `electron/audio/{SherpaSTT,LocalWhisperSTT,GoogleSTT,RestSTT,DeepgramStreamingSTT,SonioxStreamingSTT,ElevenLabsStreamingSTT,OpenAIStreamingSTT,NativelyProSTT,WebSpeechSTT}.ts` |
| Sherpa engine | `src/main/services/SherpaAutoService.ts`, model at `resources/models/sherpa-multilingual-auto/` |
| Answer generation | `electron/IntelligenceEngine.ts` (1,209), `IntelligenceManager.ts`, `SessionTracker.ts`, `llm/WhatToAnswerLLM.ts`, `llm/AnswerLLM.ts`, `llm/prompts.ts`, `LLMHelper.ts` |
| Settings / credentials | `electron/services/SettingsManager.ts`, `CredentialsManager.ts`, `electron/db/DatabaseManager.ts` |
| Renderer shell | `src/App.tsx`, `src/components/Launcher.tsx` (1,207), `src/components/NativelyInterface.tsx` (1,801), `src/components/SettingsOverlay.tsx` (1,623), `src/components/KnowledgeBaseTab.tsx` |

### A.4 Scripts that matter for validation

`npm run build` (clean + tsc + vite), `npm run build:electron`, `npm run typecheck:electron`, `npm run electron:dev`, `npm run app:dev`, `npm run test` (`node --test` over `electron/services/__tests__` and `electron/llm/__tests__`), `npm run test:modes`, `npm run test:e2e` (Playwright).

### A.5 Executed checks in this audit

| Check | Result |
| --- | --- |
| `npm run typecheck:electron` (`tsc -p electron/tsconfig.json --noEmit`) | **PASS, exit code 0**, no diagnostics |
| `git log` | Not available (no repository metadata) |
| Application launch / runtime interaction | **Not executed** — this audit is static; launching the Electron GUI and exercising capture was out of scope for a read-only pass |
| Unit test suites | **Not executed** (they require `build:electron` first and are not read-only in the strict sense) |

---

## B. Approved requirements compliance matrix

### B.1 Window and session requirements

| # | Requirement | Current implementation (evidence) | Status | Required correction |
| --- | --- | --- | --- | --- |
| 2.1 | Launch shows Start Natively launcher; no automatic session, no audio capture, no overlay shown, no duplicate windows | `WindowHelper.createWindow()` creates only the launcher, `show:false`, then `switchToLauncher()` on `did-finish-load`. Overlay is created **hidden** by `ensureOverlayWindow()`. Audio pipeline is lazy — `setupSystemAudioPipeline()` is documented as not called at boot (`main.ts` constructor) and only invoked from `startMeeting`. Settings/ModelSelector/Cropper windows are created on demand. | **PASS** (with note) | Note: the overlay renderer is still loaded at boot (hidden), costing a second renderer process on an 8 GB machine. See D-19. |
| 2.2 | Before Start, Ctrl+B hides/shows the launcher; must not create/show overlay, must not start session/audio | `KeybindManager.shouldRegister('general:toggle-visibility')` returns `this.sessionActive`, and `sessionActive` is only set true in `startMeeting` and false in `endMeeting`/`forceEndMeeting`. So the accelerator is **not registered** before a session. `AppState.toggleAssistantOverlay()` is additionally inert when `!isMeetingActive`. | **FAIL** | Register the visibility accelerator in idle launcher mode and route it to launcher show/hide (launcher-only path) without touching session/audio state. |
| 2.3 | Start Natively: session starts, overlay shown immediately, launcher hidden | `main.ts startMeeting()` explicitly does `this.windowHelper.switchToLauncher(false)` and comments “Start Natively must NOT reveal the assistant overlay… Ctrl+B is what reveals the assistant.” It then prepares the overlay hidden. `App.tsx handleStartMeeting` deliberately performs **no** follow-up `setWindowMode`. | **FAIL** | Start must end in overlay mode with the launcher hidden (single controller call), while still returning the IPC response before slow audio init. |
| 2.4 | Ctrl+B during session hides/shows the whole overlay; must not expand/collapse, return to launcher, stop session, or duplicate the window | Two independent handlers exist: (a) global accelerator → `AppState.toggleAssistantOverlay()` which, when the overlay is visible, calls `hideOverlay()` **and** `switchToLauncher(true)`; (b) renderer `keydown` → `api.toggleWindow()` → IPC `toggle-window` → `AppState.toggleMainWindow()`, which in overlay mode calls `show(); focus(); webContents.send('toggle-expand')` — i.e. **expand/collapse**. | **FAIL** | Single authoritative hide/show path. Overlay hide must not switch to launcher; renderer-level handling of the same chord must be removed or made a no-op. |
| 2.5 | Home/logo switches to launcher, keeps session/audio/transcription running, hides overlay, retargets Ctrl+B to launcher, does not auto-return to overlay | `NativelyInterface.tsx` `TopPill onLogoClick={() => api.setWindowMode?.('launcher')}` → preload `setWindowMode` → IPC `set-window-mode` → `WindowHelper.setWindowMode('launcher')` → `switchToLauncher()`: shows launcher, hides overlay, sets `currentWindowMode='launcher'`, `KeybindManager.setMode('launcher')`. **No session teardown, no `endMeeting` call.** | **PASS** | None. Preserve exactly; only the Ctrl+B idle-gating fix (2.2) must not break re-entry from launcher during a session. |
| 2.6 | Stop stops mic, system audio, STT, session processing; cleans resources; returns to idle launcher; next Start is clean | `endMeeting()`: synchronous `setWindowMode('launcher')`, `systemAudioCapture.stop()`, `microphoneCapture.stop()`, `stopDefaultOutputWatcher()`, `googleSTT.finalize()`, `googleSTT_User.finalize()`; background `_pendingTeardown` waits 250 ms, stops STT, stops intelligence/RAG, and calls `destroyOverlayWindow()`. `forceEndMeeting()` does the full synchronous teardown + destroy. `startMeeting()` awaits `_pendingTeardown` and re-creates the overlay. | **PASS** (with race notes) | Race notes: the overlay is destroyed inside a background promise (D-24); `_isDraining` keeps accepting finals for the grace window by design. |
| 2.7 | One central visibility controller, no second window manager | `WindowHelper` is the only visibility controller (`launcherWindow`, `overlayWindow`, `currentWindowMode`, `isWindowVisible`). Overlay creation is guarded by `_overlayCreating` so concurrent callers share one promise. `WindowManager.ts` exists but is not the overlay controller. | **PARTIAL** | The controller is central, but control **input** is not: the renderer also owns a visibility path (`toggle-window`), and mode is mutated from three places (startMeeting, endMeeting, renderer IPC). Consolidate behind one AppState method. |

### B.2 Answer-generation requirements

| # | Requirement | Current implementation (evidence) | Status | Required correction |
| --- | --- | --- | --- | --- |
| 3.1 | Path A manual chat: existing textbox, Enter **and** Send button, loads/errors, reaches chat handler | Input `value={inputValue}` with `onChange`; `onKeyDown` submits on Enter (Shift+Enter = newline, Ctrl/Cmd+Shift+Enter = coding help); Send button `onClick={handleManualSubmit} disabled={!canSend}`. Both call `handleManualSubmit()` which pushes the user bubble + streaming bubble, sets `isProcessing`, and awaits `api.streamGeminiChat(...)`. Preload exposes `streamGeminiChat` → IPC `gemini-chat-stream` → `LLMHelper.streamChat` with stream-id supersede guard and token/done/error events. | **PASS** | None. Preserve UI and both submission paths verbatim. |
| 3.2 | Path B button: existing What to Answer control wired to latest interviewer question | Action bar entry `[Pencil, 'What to answer?', () => handleWhatToSay()]`; `handleWhatToSay` calls `api.generateWhatToSay(undefined, images?, {promptInstruction})` → preload → IPC `generate-what-to-say` → `IntelligenceManager.runWhatShouldISay` → `IntelligenceEngine.runWhatShouldISay` → `WhatToAnswerLLM.generateStream`. The question is **inferred from session transcript context**; no explicit “latest interviewer question” object is passed. | **PARTIAL** | Works, but the interviewer-question selection is implicit (whole transcript + `prepareTranscriptForWhatToAnswer`). Add explicit latest-interviewer-turn pinning at the shared-pipeline boundary, without changing the trigger. |
| 3.2 | Path B shortcut Ctrl+1 registered and equivalent to the button | `KeybindManager` default `chat:whatToAnswer` = `CommandOrControl+1`, `isGlobal: true`. `shouldRegister` returns true only when `activeMode === 'overlay'`, so it is **not bound while the launcher is active** (including during a live session after Home). When bound, the handler sends `global-shortcut {action:'whatToAnswer'}` to all windows → `NativelyInterface` `onGlobalShortcut` → same `handleWhatToSay`. | **PARTIAL** | Define intended scope (overlay-only vs. also launcher during a session), then register accordingly and remove duplicate renderer chord handling (D-16). |
| 3.3 | Path C automatic answer: detect completed interviewer questions, gate on setting, no fragments, no candidate speech, respect modes, no duplicates | `IntelligenceEngine.handleSuggestionTrigger()` implements final-trigger handling with an 8 s identical-question suppression and a 3 s cooldown, and `maybeSpeculate()` reacts to interviewer **interim** text. **No caller of `handleSuggestionTrigger` exists anywhere in the main process.** Speculative results are returned without emitting `suggested_answer`/tokens to the UI. No `autoAnswer` setting exists (grep for `autoAnswer|auto-answer` finds only an unmatched shortcut id). | **FAIL** | Wire a single automatic trigger on interviewer **final** segments, gated by an explicit Auto Answer setting, and surface the generated answer through the existing suggested-answer events. |
| 3.4 | What to Answer and Auto Answer share one pipeline | Both routes (manual IPC, intended auto trigger) converge on `IntelligenceEngine.runWhatShouldISay` → `WhatToAnswerLLM.generateStream`, which owns transcript truncation, mode suffix, intent/temporal context, `PromptAssembler`, provider/model selection through `LLMHelper.streamChat`, streaming and sanity check. | **PASS** (architecture) | Preserve. Route Path C through `handleSuggestionTrigger` → `runWhatShouldISay`, not a second implementation. |
| 3.5 | Duplicate-generation protection for the same question, near-simultaneous manual+auto, without blocking a genuinely new question | Auto path: `lastFinalTrigger` 8 s text dedupe, `speculativeText` Jaccard reuse, `currentGenerationId` abort of superseded streams. Manual path: `runWhatShouldISay` early-returns `null` when `Date.now() - lastTriggerTime < triggerCooldown` (3000 ms) unless images/speculative/skip; the IPC handler then returns `{answer:null}` and the renderer clears the streaming bubble with no message. No question-identity check on the manual path. | **PARTIAL** | Add question-identity + in-flight coordination shared by both triggers; never return a silent `null` to a manual click (surface a message or wait). |
| 3.6 | Trigger without a captured interviewer question: no irrelevant answer, clear message, app stays usable | No guard in `runWhatShouldISay` for empty/absent interviewer context. With no transcript the prompt still runs; short/empty outputs are replaced by “Could you repeat that?…” and a non-answer sentinel returns `null` (handled as a cleared bubble). There is no user-facing “no interviewer question captured yet” message. | **FAIL** | Add an explicit precondition at the shared-pipeline boundary and a renderer message; keep the session untouched. |

### B.3 Audio / STT requirements

| # | Requirement | Current implementation (evidence) | Status | Required correction |
| --- | --- | --- | --- | --- |
| 4.1 | Provider selection traced UI → persistence → IPC → factory → active service → transcript | `SettingsOverlay` provider cards → setters → `set-stt-provider` IPC → `CredentialsManager.setSttProvider` → `AppState.reconfigureSttProvider()` → `setupSystemAudioPipeline()` → `createSTTProvider(speaker)` → `stt.on('transcript')` → `intelligenceManager.handleTranscript` + renderer `native-audio-transcript` broadcast. Active provider is cached in `AppState.sttProvider` at pipeline setup. | **PASS** (path) | Diagnostics must report the provider actually instantiated, including silent fallbacks (D-17). |
| 4.2 | Sherpa-ONNX model selection, init/prewarm, ORT config, VAD, sample rate, chunk delivery, decoder, events, errors, cleanup, repeat cycles, main-thread blocking | `SherpaAutoService`: lazy `ensureInitialized()`, model dir resolution for dev/packaged, Whisper int8 encoder/decoder + tokens + `silero_vad.onnx` present in `resources/models/sherpa-multilingual-auto`; `numThreads: 2`, `provider: 'cpu'`, greedy search; per-channel VAD; `processChunk`/`flush`/`reset`. `SherpaSTT` resamples Int16LE → Float32 16 kHz, emits **final-only** transcript segments, rate-limited error emission. Decoding is synchronous inside the capture `data` callback on the main process. | **PARTIAL** | Decode is on the main thread (D-18); model load happens on first session from HDD; no decoder-level cancellation. |
| 4.3 | Language: auto detect, English, Hindi, Marathi — UI, persistence, IPC, actual recognizer | `electon/config/languages.ts RECOGNITION_LANGUAGES` contains `auto`, English variants, Indonesian/Russian/Spanish/French/German/Italian/Portuguese/Japanese/Korean/Chinese/Turkish/Ukrainian. **No Hindi or Marathi.** `AppState.setRecognitionLanguage` coerces `'auto'` → `'english-us'` for every provider except `natively`. `SherpaSTT.setRecognitionLanguage()` is an empty method and `SherpaAutoService` hardcodes `language: ''`. | **FAIL** | Add Hindi/Marathi options end-to-end and implement a real language setter for Sherpa (or explicitly document auto-detect-only and remove the lie in the UI). |
| 4.4 | Normal Interview: system audio = interviewer, mic = candidate, distinguishable | Two STT instances are created per speaker: `createSTTProvider('interviewer')` wired to `SystemAudioCapture`, `createSTTProvider('user')` wired to `MicrophoneCapture`; transcript segments carry `speaker`, which `IntelligenceEngine.handleTranscript` uses. | **PASS** | None. |
| 4.5 | Mock Interview: mic = interviewer, no system audio, correct instance gets rate + speech-ended | Routing is correct at write time (`wireMicCapture` sends mock-mode chunks to `googleSTT` and starts only `microphoneCapture` + `googleSTT` in `startMeeting`). **But** the first-chunk sample-rate lock and `speech_ended` are applied to `googleSTT_User`, which is null/unstarted in mock mode. | **FAIL** | Route rate + speech-ended to the logical interviewer instance under mock routing. |
| 4.6 | Only Interviewer: only interviewer speech used, rule applies to logical source, survives restart | `wireMicCapture` drops mic chunks when `_onlyInterviewerMode` (after the mock branch, so mock wins if both true). Persistence: each toggle is written independently to `SettingsManager`; the setters only clear the counterpart **in memory**, so both keys can be `true` on disk and are both loaded in the `AppState` constructor. | **PARTIAL** | Normalise mutual exclusion at persistence load and on write; apply gating to the logical interviewer channel rather than a fixed physical source. |
| 4.7 | Sherpa init failure: strict mode (error, no auto-switch, retry) **or** fallback mode (notify, never silent) | `createSTTProvider` wraps `new SherpaSTTProvider(...)` in try/catch and **silently** constructs `WebSpeechSTT` on failure. No `sherpaFallback` / `strictSherpa` / fallback-policy setting exists anywhere (grep returns nothing). No notification is broadcast for the switch. `SherpaAutoService.ensureInitialized()` latches `initialized = true` before `init()`, so a failed init is permanent until process restart. | **FAIL** | Add the configurable policy, broadcast a visible notice on fallback, and make init retryable (reset latch on retry). |
| 4.8 | Local Whisper / legacy inventory before removal | Local Whisper is still an **active** branch (`createSTTProvider` → `LocalWhisperSTT`, per-channel model overrides), a real settings panel (`WhisperSettings` rendered inside the Audio tab), a preload/IPC surface, a model dir (`resources/models/Xenova`), worker scripts in `electron/audio/whisper/`, a downloader (`scripts/download-models.js`) and a boot preloader gated on the selected provider. Legacy backups: `LocalWhisperSTT - Backup.ts`, `LocalWhisperSTT - backup2.ts`, `MicrophoneCapture -Backup.ts`. | **PASS** (inventory) | Do not delete now. Removal is only safe as the coordinated set listed in Section J.4. |

## C. Architecture and data-flow maps

### C.1 Window / session lifecycle (as implemented)

```
app.whenReady()
  └─ initializeApp()
       ├─ configure audio/GPU, single-instance lock
       └─ AppState.createWindow()
            └─ WindowHelper.createWindow()
                 ├─ launcherWindow = new BrowserWindow(show:false, ?window=launcher)
                 │     └─ did-finish-load → switchToLauncher(false) → isWindowVisible = true
                 └─ ensureOverlayWindow()   (show:false, ?window=overlay, loaded now)

Launcher “Start Natively” (App.tsx handleStartMeeting)
  └─ electronAPI.startMeeting({audio, doNotPersist})
       └─ AppState.startMeeting()
            ├─ idempotency guard (isMeetingActive || _sessionState==='starting')
            ├─ await _pendingTeardown (previous Stop)
            ├─ _sessionState='starting', new _sessionId
            ├─ resetOverlayPosition()
            ├─ windowHelper.switchToLauncher(false)      ← current behaviour (D-01)
            ├─ ensureOverlayWindow()                     ← prepared hidden
            ├─ KeybindManager.setSessionActive(true)     ← Ctrl+B becomes live
            ├─ isMeetingActive=true, _sessionState='active', broadcast meeting-state-changed
            ├─ session-reset sent to both windows
            └─ setTimeout(0): reconfigureAudio?/setupSystemAudioPipeline()
                 ├─ mock: mic.start() + interviewerSTT.start()   (no system audio)
                 └─ normal: systemAudio.start()+interviewerSTT.start()
                            mic.start()+userSTT.start()
                            rag.startLiveIndexing()

Overlay “Stop” (App.tsx handleEndMeeting)
  └─ electronAPI.endMeeting()
       └─ AppState.endMeeting()
            ├─ isMeetingActive=false, _isDraining=true, _sessionState='stopping'
            ├─ KeybindManager.setSessionActive(false)    ← Ctrl+B inert
            ├─ broadcast meeting-state-changed
            ├─ windowHelper.setWindowMode('launcher')    ← hides overlay immediately
            ├─ captures .stop() (JS-side flag first, native teardown deferred)
            ├─ STT .finalize() (trailing finals accepted for ~250 ms)
            └─ _pendingTeardown (background):
                 ├─ revert default model + model-changed broadcast
                 ├─ 250 ms drain → STT .stop() → intelligenceManager.stopMeeting()
                 ├─ rag.stopLiveIndexing()/deleteMeetingData()
                 └─ windowHelper.destroyOverlayWindow()  ← overlay destroyed (D-24)

Home/logo (overlay header)
  └─ TopPill onLogoClick → electronAPI.setWindowMode('launcher')
       └─ IPC set-window-mode → WindowHelper.setWindowMode('launcher')
            └─ switchToLauncher(): launcher.show(), overlay.hide(),
               currentWindowMode='launcher', KeybindManager.setMode('launcher')
            (session, captures, STT keep running — no endMeeting)
```

### C.2 Ctrl+B routing (two competing paths)

```
Path 1 — OS global accelerator (authoritative)
KeybindManager DEFAULT 'general:toggle-visibility' = CommandOrControl+B, isGlobal
  └─ registered only when sessionActive (shouldRegister)
       └─ callback → AppState.toggleAssistantOverlay()
            ├─ !isMeetingActive → return (inert)
            ├─ overlay missing/destroyed → ensureOverlayWindow() → switchToOverlay()
            ├─ overlay visible → hideOverlay() THEN switchToLauncher(true)   ← D-02
            └─ overlay hidden  → switchToOverlay(cid)
                 └─ KeybindManager.setMode('overlay'); launcher.hide()

Path 2 — renderer keydown (duplicate)
NativelyInterface window keydown: if isShortcutPressed(e,'toggleVisibility')
  └─ api.toggleWindow() → IPC 'toggle-window' → AppState.toggleMainWindow()
       ├─ mode==='launcher' → windowHelper.toggleMainWindow()  (hide/show launcher)
       └─ mode==='overlay'  → overlay.show(); focus(); send('toggle-expand')  ← D-04
```

Consequence when the overlay has OS focus: the renderer handler runs **and** the global accelerator fires, producing `toggle-expand` and hide/show work in the same chord. The observable symptom is exactly the reported one: Ctrl+B sometimes collapses/expands instead of hiding, sometimes hides and drops the user back on the launcher.

### C.3 Home/logo routing

```
TopPill.onLogoClick
  → preload.setWindowMode('launcher')
  → ipcHandlers 'set-window-mode'  (handler body: setWindowMode only; no session calls)
  → WindowHelper.setWindowMode('launcher')
  → WindowHelper.switchToLauncher()
       launcher.restore()/show()/focus(), content-protection ramp
       overlay.hide()
       currentWindowMode='launcher'; KeybindManager.setMode('launcher')
  (isMeetingActive unchanged; captures/STT untouched)
```

This path satisfies 2.5. The only gap is that `KeybindManager.setMode('launcher')` also unregisters `chat:*` accelerators, so Ctrl+1 is unavailable while the launcher is up during a live session (D-15).

### C.4 Audio capture and source routing

```
Normal Interview
  SystemAudioCapture ──data──▶ (noise suppressor?) ──▶ interviewerSTT.write()
        │ sample_rate_changed ─▶ interviewerSTT.setSampleRate()
        └ speech_ended ────────▶ interviewerSTT.notifySpeechEnded()
  MicrophoneCapture ──data──▶ noise suppressor ──▶ [mock? interviewerSTT : (!onlyInterviewer ? userSTT)]
        │ first chunk ───────▶ userSTT.setSampleRate(capture.getSampleRate())   ← wrong instance in mock (D-06)
        ├ sample_rate_changed ▶ userSTT.setSampleRate()                         ← same (D-06)
        └ speech_ended ───────▶ !onlyInterviewer && userSTT.notifySpeechEnded()← same (D-07)

Mock Interview
  microphoneCapture.start(); interviewerSTT.start()
  systemAudioCapture NOT created/started for this session
  mic data ─▶ interviewerSTT.write()  (returns before the onlyInterviewer gate)

Only Interviewer
  mic data dropped before userSTT.write(); mic hardware stays open for
  level metering + zero-fill watchdogs
```

### C.5 STT provider selection and initialization

```
SettingsOverlay provider cards
  → credential setters (per provider) → CredentialsManager (disk, keytar/encrypted store)
  → IPC 'set-stt-provider'
       ├─ CredentialsManager.setSttProvider(provider)
       ├─ await AppState.reconfigureSttProvider()
       └─ broadcast 'credentials-changed'

AppState.setupSystemAudioPipeline()
  ├─ this.sttProvider = CredentialsManager.getSttProvider()   (cached)
  ├─ if !systemAudioCapture → new SystemAudioCapture + wireSystemCapture
  ├─ if !microphoneCapture → new MicrophoneCapture + wireMicCapture
  └─ createSTTProvider('interviewer' | 'user')
       ├─ 'none'          → null (capture continues, no transcription)
       ├─ 'natively'      → NativelyProSTT(key, 'system'|'mic') | Google fallback
       ├─ 'deepgram'      → DeepgramStreamingSTT | Google fallback
       ├─ 'soniox'        → SonioxStreamingSTT  | Google fallback
       ├─ 'elevenlabs'    → ElevenLabsStreamingSTT | Google fallback
       ├─ azure/ibm/custom/groq/openai → RestSTT(key, model, region) | WebSpeech fallback
       ├─ 'sherpa'        → try SherpaSTT(channel) catch → WebSpeechSTT (silent, D-10)
       ├─ 'local-whisper' → LocalWhisperSTT(model[, per-channel model])
       └─ unknown         → Google or null
     └─ stt.setRecognitionLanguage(sttLanguage)
     └─ stt.on('transcript' | 'error' | 'status-ish')
```

### C.6 Transcript generation and fan-out

```
stt.on('transcript', {text,isFinal,confidence})
  ├─ accept only if isMeetingActive || _isDraining
  ├─ intelligenceManager.handleTranscript({speaker,text,timestamp,final,confidence})
  │    ├─ session.handleTranscript (rolling context, question detection)
  │    ├─ interviewer interim → maybeSpeculate (debounced speculative LLM)
  │    ├─ final → detectAndEmitDynamicActions
  │    └─ user refinement → runFollowUp
  ├─ final → ragManager.feedLiveTranscript
  ├─ broadcast 'native-audio-transcript' to launcher + overlay
  └─ interviewer final → knowledgeOrchestrator.feedInterviewerUtterance
```

### C.7 Manual Chat Submission (Path A)

```
Textbox value/onChange
  ├─ Enter (no shift) ─────────┐
  └─ Send button onClick ──────┤
                               ▼
handleManualSubmit()
  ├─ sanitizeInput, attach pending screenshot context
  ├─ push user bubble + streaming bubble; setIsProcessing(true)
  └─ api.streamGeminiChat(text, paths, context)
       └─ IPC 'gemini-chat-stream'
            ├─ LLMHelper.setModel(...) resolved provider/model
            ├─ stream id supersede guard (_chatStreamId)
            ├─ token events → renderer streamChunk
            └─ done / error → endStream()
```

### C.8 What to Answer (Path B)

```
UI “What to answer?” button              Ctrl+1 (global, overlay mode only)
        │                                        │
        ▼                                        ▼
handleWhatToSay() (guard: isProcessingRef)   onGlobalShortcut{whatToAnswer} → same handler
  └─ api.generateWhatToSay(undefined, images?, {promptInstruction})
       └─ IPC 'generate-what-to-say'
            ├─ validate image paths (≤5, userData-scoped)
            ├─ optional ScreenUnderstandingService (vision-first)
            ├─ optional Knowledge Base matches appended to promptInstruction
            └─ intelligenceManager.runWhatShouldISay(question=undefined, 0.8, images, opts)
                 └─ IntelligenceEngine.runWhatShouldISay
                      ├─ cooldown gate (3 s) → may return null silently (D-11)
                      ├─ abort previous assist token
                      ├─ session.getContext(180) + last interim injection
                      ├─ prepareTranscriptForWhatToAnswer(…, 12)
                      ├─ buildTemporalContext + classifyIntent(lastInterviewerTurn)
                      ├─ ++currentGenerationId, stream = WhatToAnswerLLM.generateStream(...)
                      └─ emit 'suggested_answer_token' / 'suggested_answer'
```

### C.9 Auto Answer (Path C — intended vs. actual)

```
INTENDED
  interviewer final transcript → handleSuggestionTrigger(trigger)
     → dedupe (8 s same text) → planSuggestionTrigger → runWhatShouldISay → shared pipeline

ACTUAL
  interviewer interim → maybeSpeculate()
     (min confidence .75, min words, question signal, debounce, 3 s cooldown)
     → runWhatShouldISay(text, …, {speculative:true})
     → returns text to a promise nobody consumes; NO suggested_answer emission
  handleSuggestionTrigger()  → defined in IntelligenceEngine + delegated in IntelligenceManager
                             → NO CALLER anywhere in the main process
  Auto Answer setting        → does not exist
```

### C.10 Settings persistence and IPC

```
SettingsManager (electron-store style key/value, userData)
  ├─ boot-critical keys read in AppState constructor
  │    (isUndetectable, disguiseMode, verboseLogging, onlyInterviewerMode,
  │     noiseCancellationEnabled, mockInterviewMode, groqFastTextMode, codex*)
CredentialsManager (API keys, STT provider, STT language, AI response language,
                    custom STT config, regions)
KeybindManager (userData/keybinds.json; overrides + migrations + conflict swap)
Renderer SettingsOverlay
  ├─ reads via preload getters (get-stt-provider / get-stt-language / get-credentials…)
  ├─ writes via preload setters → IPC → manager → broadcast 'credentials-changed'
  └─ overlay opacity: renderer localStorage ('natively_overlay_opacity') +
     IPC 'set-overlay-opacity' (handler exists) — splits state across two owners
```

## D. Previous audit reconciliation

Only `MODULE_03_SETTINGS_AND_FEATURE_WIRING_AUDIT.md` exists in the tree. Module 01, 02 and 02A reports are **not present**, so their findings are re-derived from source here rather than quoted. Every row below was rechecked against current code; “Requires runtime verification” means static evidence is insufficient and no runtime test was performed.

### D.1 Module 01 — window and session lifecycle

| Prior finding (re-derived) | Current evidence | Classification |
| --- | --- | --- |
| Ctrl+B was gated so that it was inert on the launcher | `shouldRegister` returns `sessionActive`; `setSessionActive` only from start/stop. Confirmed still true | **Confirmed defect** (D-03); note this now *conflicts with the approved 2.2*, so the gate itself must change |
| Ctrl+B in overlay expanded/collapsed instead of hiding | `toggleAssistantOverlay` hides **and** returns to launcher; renderer path still sends `toggle-expand`. Both defects coexist | **Confirmed defect** (D-02, D-04) |
| Start did not reveal the overlay | Explicit `switchToLauncher(false)` in `startMeeting` with an explanatory comment | **Confirmed defect** (D-01) — previously classified as intentional; the approved requirement reverses that intent |
| Home/logo returned to launcher without stopping the session | `setWindowMode('launcher')` only; no teardown | **Not reproducible** as a defect — behaves as required |
| Overlay could be recreated twice | `_overlayCreating` promise sharing + single `overlayWindow` field | **Fixed since previous audit** |
| Destroyed-window references | All call sites guard with `isDestroyed()`; `destroyOverlayWindow` nulls the field first | **Fixed since previous audit** |
| Launcher + overlay visible together at Start | Cannot both be visible: `switchToLauncher` hides overlay; `switchToOverlay` hides launcher | **Not reproducible** |
| Duplicate launcher windows | `createWindow()` early-returns when `launcherWindow !== null` | **Not reproducible** |
| Stale overlay after Stop | `destroyOverlayWindow()` in teardown; `startMeeting` calls `ensureOverlayWindow()` | **Fixed since previous audit** (residual race D-24) |

### D.2 Module 02 — audio and STT

| Prior finding (re-derived) | Current evidence | Classification |
| --- | --- | --- |
| Mock Interview routes mic to the interviewer channel | `wireMicCapture` mock branch → `googleSTT.write()`; `startMeeting` starts only mic + interviewer STT | **Fixed since previous audit** |
| Mock Interview sample rate applied to the wrong instance | First-chunk lock and `sample_rate_changed` still target `googleSTT_User` | **Confirmed defect** (D-06) |
| Mock Interview `speech_ended` sent to the wrong instance | `capture.on('speech_ended')` → `googleSTT_User.notifySpeechEnded()` | **Confirmed defect** (D-07) |
| Only Interviewer mode dropped mic audio | Gating exists before `googleSTT_User.write` | **Fixed since previous audit** (persistence gap remains, D-13) |
| Both audio modes can be enabled at once | Setters clear the counterpart in memory; IPC persists each independently; constructor loads both | **Confirmed defect** (D-13) |
| `none` provider silently overridden | `createSTTProvider` returns `null` immediately for `'none'` and the pipeline tolerates null | **Fixed since previous audit** |
| Sherpa model missing in a packaged build | Model dir resolution covers dev + packaged paths; files present in `resources/models/sherpa-multilingual-auto` | **Not reproducible** in this workspace |
| Sherpa decodes on the main thread | `SherpaSTT.write` → `sherpaAutoService.processChunk` (synchronous VAD + recognizer decode) invoked from the capture callback | **Confirmed defect** (D-18) |
| Sherpa failure leaves a sticky state | `ensureInitialized()` sets `initialized = true` before `init()`; retry is impossible until restart | **Confirmed defect** — part of D-10 |

### D.3 Module 02A — active-provider verification

| Prior finding (re-derived) | Current evidence | Classification |
| --- | --- | --- |
| Settings dropdown does not prove the runtime provider | `AppState.sttProvider` is cached at pipeline construction; `createSTTProvider` may silently substitute Google/WebSpeech | **Confirmed risk** (D-17) |
| Diagnostics can report a stale provider | `getAudioPipelineDiagnostics()` returns the cached string and `sttConnected: !!this.googleSTT` (instance existence, not connection) | **Confirmed defect** (D-17) |
| Active provider only observable from logs | `get-stt-pipeline-diagnostics` IPC exists; sherpa diagnostics are real, generic `sttProvider` is a cache | **PARTIAL** — needs an instantaneous probe |

### D.4 Module 03 — the 27 recheck items

| # | Item | Current evidence | Classification |
| --- | --- | --- | --- |
| 1 | Knowledge Base tab UI/backend | `SettingsOverlay` renders `KnowledgeBaseTab` for `activeTab==='knowledge'`; component calls `knowledgeBaseGetSettings/AddDocument`; preload exposes all five channels; IPC handlers delegate to `KnowledgeBaseService` | **Fixed since previous audit** (C-1) — static PASS |
| 2 | Custom STT config and preload exposure | Backend `set-custom-stt-config` exists and is wired into `RestSTT`; **preload has no `customStt` surface** (grep: zero matches) | **Confirmed defect** (D-14) |
| 3 | Legacy Whisper settings vs. active Local Whisper | `WhisperSettings` is rendered in the Audio tab; Local Whisper is a live provider branch with per-channel models | **Confirmed** — they are the same runtime; the “legacy vs active” split no longer holds |
| 4 | Mock Interview sample rate | See D.2 | **Confirmed defect** (D-06) |
| 5 | Mock Interview speech-ended | See D.2 | **Confirmed defect** (D-07) |
| 6 | Only Interviewer / Mock persistence | Independent keys, both loaded at boot | **Confirmed defect** (D-13) |
| 7 | STT diagnostic state after reconfiguration | Provider cache refreshed only when the pipeline is rebuilt; `sttConnected` misleading | **PARTIAL** (D-17) |
| 8 | `none` provider behaviour | Returns `null`, capture continues, transcription disabled | **Fixed since previous audit** |
| 9 | Natively API key save changing provider/model | Handler snapshots `prevSttProvider`, saves the key, re-syncs the **default model** into `LLMHelper`, broadcasts `model-changed`, and reconfigures STT if `setNativelyApiKey` promoted the provider | **PARTIAL / requires runtime verification** — the model re-sync is unconditional, so a user-pinned model can be replaced |
| 10 | Hindi and Marathi | Absent from `RECOGNITION_LANGUAGES` and from the UI group list | **Confirmed defect** (D-08) |
| 11 | Sherpa language setter | `SherpaSTT.setRecognitionLanguage()` is empty; recognizer built with `language: ''` | **Confirmed defect** (D-09) |
| 12 | Auto Detect coercion | `key === 'auto' && provider !== 'natively'` → `'english-us'` | **Confirmed defect** (D-09) |
| 13 | Auto Answer shortcut registration | `useShortcuts` maps `chat:auto-answer-mode`; `KeybindManager` has no such id | **Confirmed defect** (D-20) |
| 14 | Shorten and recap shortcuts | `useShortcuts` maps `chat:shorten` / `chat:recap`; `KeybindManager` has neither (and migrates `chat:recap` → `chat:dynamicAction4`) | **Confirmed defect** (D-20) |
| 15 | Code Execution settings vs. executor | `ExecutionEnginesSettings` renders; `AppState` pushes `codexCli*` settings into `LLMHelper.setCodexCliConfig` at boot | **PARTIAL / requires runtime verification** — Codex path wired; other engines not confirmed |
| 16 | Azure / IBM persistence and reconfiguration | Key setters persist and broadcast; regions are read in `createSTTProvider` | **PARTIAL** — region input UI presence not fully confirmed (item 17) |
| 17 | Azure/IBM regions and custom STT fields | Custom STT state exists in `SettingsOverlay` (endpoint/model/payloadType/responsePath/apiKeyHeader); `azureRegion` restored from credentials | **PARTIAL** — UI fields exist for custom STT; region field visibility not verified |
| 18 | Google Cloud STT credentials | `googleServiceAccountPath` is loaded and shown as a “Saved” badge; provider test calls `testSttConnection` | **PARTIAL** — no file-picker flow confirmed in the reviewed region |
| 19 | Masked API key handling | Input placeholders use `••••••••••••`; `set-custom-stt-config` refuses to overwrite keys beginning with `sk-...` | **PARTIAL** — masking is a placeholder convention, and the `sk-...` guard only protects that exact prefix |
| 20 | Fast Response Mode sources of truth | `groqFastTextMode` restored in the constructor into `LLMHelper`; no renderer control found by grep | **Confirmed** as single backend source; UI reachability **requires runtime verification** |
| 21 | Overlay opacity persistence | Renderer `localStorage` + broadcast listener; IPC `set-overlay-opacity` exists | **PARTIAL** — two owners; persistence is renderer-local |
| 22 | Dead components (`Sidebar.tsx`) | `src/components/settings/Sidebar.tsx` exists; no import found in the tab renderer (only the inline sidebar markup in `SettingsOverlay`) | **Confirmed** dead file (low) |
| 23 | TTS availability/integration | ElevenLabs SDKs are dependencies and ElevenLabs **STT** is wired; no TTS surface found in renderer code reviewed | **Confirmed** — no user-facing TTS integration |
| 24 | Textbox manual submission | Both Enter and Send call `handleManualSubmit` → `gemini-chat-stream` | **Not reproducible** as a defect (PASS) |
| 25 | What to Answer button + shortcut | Button present and wired; Ctrl+1 registered only in overlay mode | **PARTIAL** (D-15) |
| 26 | Home/logo action and session continuity | `set-window-mode('launcher')`, no teardown | **Not reproducible** (PASS) |
| 27 | Ctrl+B in launcher and overlay stages | Launcher stage: unregistered. Overlay stage: hides + returns to launcher; renderer path expands | **Confirmed defects** (D-02, D-03, D-04) |

### D.5 Module 03 confirmed-bug register (C-1 … C-21)

| ID | Previous claim | Current classification |
| --- | --- | --- |
| C-1 | Knowledge Base bound to placeholder state | **Fixed** |
| C-2 | Custom STT save is a no-op | **Partially fixed** — backend implemented, preload still missing (D-14) |
| C-3 | STT panel has no runtime effect | **Fixed** — settings feed `CredentialsManager` → factory |
| C-4 | Mock Interview rate + speech-ended misrouting | **Confirmed** (D-06, D-07) |
| C-5 | Both audio modes persisted true | **Confirmed** (D-13) |
| C-6 | Stale STT provider in diagnostics | **Confirmed** (D-17) |
| C-7 | `none` overridden | **Fixed** |
| C-8 | Natively key save rewrites provider/model | **Partially fixed** — provider change is now detected and reconfigured; model re-sync remains |
| C-9 | Hindi/Marathi not selectable | **Confirmed** (D-08) |
| C-10 | Sherpa ignores language | **Confirmed** (D-09) |
| C-11 | Auto Detect coerced to en-US | **Confirmed** (D-09) |
| C-12 | Auto-answer shortcut registered in UI only | **Confirmed** (D-20) |
| C-13 | `shorten` / `recap` keybind rows dead | **Confirmed** (D-20) |
| C-14 | Code execution engines never reach executor | **Unchanged / requires runtime verification** |
| C-15 | Azure/IBM saves do not rebroadcast | **Incorrect previous finding** — setters broadcast `credentials-changed` |
| C-16 | Azure/IBM regions and custom STT fields have no UI | **Partially incorrect** — custom STT fields are present; region field unconfirmed |
| C-17 | Google Cloud STT has no credential picker | **Unchanged / requires runtime verification** |
| C-18 | Masked keys re-injected then re-tested | **Confirmed risk** — placeholder masking + `sk-...` prefix guard only |
| C-19 | Fast Response Mode dual source of truth | **Partially fixed** — backend-only restore confirmed; UI unverified |
| C-20 | Overlay opacity not persisted by main | **Partially fixed** — IPC handler exists; renderer still owns localStorage |
| C-21 | `Sidebar.tsx` dead code | **Confirmed** |

### D.6 Module 03 suspected issues (S-1 … S-9)

| ID | Classification |
| --- | --- |
| S-1 Provider key save may not refresh every engine path | **Confirmed risk** — some setters reconfigure STT, others only broadcast |
| S-2 `set-undetectable` debounce drops rapid toggles | **Unchanged / requires runtime verification** |
| S-3 `registerGlobalShortcuts()` calls `unregisterAll()` each time | **Confirmed** — momentary unregistered window on every mode/session change; mitigated by `revalidateShortcuts()` health check |
| S-4 Dead duplicate logic in `shouldRegister` | **Confirmed** — the later `return true` for `general:toggle-visibility` is unreachable |
| S-5 `setOpenAtLogin` may not reflect OS value | **Unchanged / requires runtime verification** |
| S-6 Preload type surface drifted | **Confirmed** — `syncOverlayInteractionPolicy`/custom-STT mismatch between types and implementation |
| S-7 Interface-style and autoScroll rely on synthetic `storage` event | **Unchanged / requires runtime verification** |
| S-8 Engine pre-warm may use stale credentials | **Partially fixed** — Local Whisper preload checks the cached model only |
| S-9 Visibility gating vs. launcher | **Confirmed and escalated** — now a requirement conflict (D-03) rather than a preference |

## E. Defect register

Severity follows the approved definitions (Critical = session/audio/core app unusable; High = a major approved feature does not work; Medium = inconsistent or significant integration problem; Low = minor/non-blocking). Nothing here is rated Critical: the application starts, captures audio, transcribes and answers manually.

### D-01 — Start Natively does not display the assistant overlay

- **Severity:** High
- **Impact:** The approved Start workflow never reaches the overlay. After clicking Start, the user stays on the launcher showing “Meeting ongoing”, must discover that Ctrl+B reveals the assistant, and Ctrl+B is the only way in.
- **Root cause:** `startMeeting()` calls `switchToLauncher(false)` and deliberately prepares the overlay hidden. This encodes the opposite of requirement 2.3.
- **Files/functions:** `electron/main.ts` — `AppState.startMeeting()` (window-swap block, ~2829-2834); `src/App.tsx` — `handleStartMeeting()` relies on main and performs no swap.
- **Dependencies:** KeybindManager session gating, `WindowHelper.ensureOverlayWindow`, `switchToOverlay` (overlay must exist and be loaded before reveal).
- **Verification:** Static: read `startMeeting` and confirm no `setWindowMode('overlay')` anywhere in the start path. Runtime: click Start in a built app and observe the launcher.
- **Recommended correction:** Replace the launcher swap with a single `WindowHelper.setWindowMode('overlay')` after the IPC response is scheduled (`setTimeout(0)` already exists), keeping audio init async. Do not reveal before the overlay window exists.

### D-02 — Ctrl+B in the overlay returns the user to the launcher

- **Severity:** High
- **Impact:** The overlay hide is not a pure hide; the launcher is brought back on top, which requirement 2.4 forbids (“must not return to the launcher”).
- **Root cause:** `toggleAssistantOverlay()` calls `hideOverlay(cid)` **and** `switchToLauncher(true)` in the “overlay visible” branch.
- **Files/functions:** `electron/main.ts` — `toggleAssistantOverlay()` (~3639-3646).
- **Dependencies:** `WindowHelper.hideOverlay`, `switchToLauncher`, `isWindowVisible` bookkeeping.
- **Verification:** Static branch read. Runtime: launch, start, press Ctrl+B twice and observe which window appears.
- **Recommended correction:** Hide the overlay only; leave the launcher hidden. Keep `currentWindowMode='overlay'` so Ctrl+B restores the same overlay. Launcher return belongs to the Home action only.

### D-03 — Ctrl+B is not registered before a session

- **Severity:** High
- **Impact:** Requirement 2.2 (hide/show the launcher before Start) cannot work; the chord is silently dead until a session starts.
- **Root cause:** `KeybindManager.shouldRegister('general:toggle-visibility')` returns `this.sessionActive`, which is false in idle launcher mode; `AppState.toggleAssistantOverlay()` is separately inert when `!isMeetingActive`.
- **Files/functions:** `electron/services/KeybindManager.ts` — `shouldRegister`, `setSessionActive`, `registerGlobalShortcuts`; `electron/main.ts` — shortcut callback branch for `general:toggle-visibility`.
- **Dependencies:** Session state, `WindowHelper.isVisible`, Mac menu accelerator.
- **Verification:** Static: confirm both gates. Runtime: press Ctrl+B on the idle launcher.
- **Recommended correction:** Split the accelerator into two behaviours behind one handler: no session → launcher visibility toggle; session → overlay visibility toggle. Keep the accelerator registered in both states.

### D-04 — Duplicate Ctrl+B handling expands instead of hiding

- **Severity:** High
- **Impact:** When the overlay has focus, the renderer handler runs `toggle-expand` while the OS accelerator runs the hide/show path. The user sees the overlay collapse/expand, or a double toggle that appears to do nothing, and the outcome depends on timing — exactly the reported symptom.
- **Root cause:** `NativelyInterface` handles `toggleVisibility` in a window `keydown` listener and calls `api.toggleWindow()`; `AppState.toggleMainWindow()` treats overlay mode as “show + focus + send toggle-expand” rather than hide.
- **Files/functions:** `src/components/NativelyInterface.tsx` (~1176-1192), `electron/preload.ts` (`toggleWindow`), `electron/ipcHandlers.ts` (`toggle-window`, line 290), `electron/main.ts` `AppState.toggleMainWindow()` (~3569-3592).
- **Dependencies:** `useShortcuts` key map, global accelerator registration, focus state of the overlay.
- **Verification:** Static: two independent handlers for one chord. Runtime: focus the overlay, press Ctrl+B, observe expand vs. hide.
- **Recommended correction:** Make main the only owner of `general:toggle-visibility`. Remove the renderer chord (or route it to the same IPC hide/show), and stop treating `toggleMainWindow` overlay mode as expand — expansion belongs to the pill/`ensure-expanded` path.

### D-05 — Automatic Answer (Path C) has no trigger and no setting

- **Severity:** High
- **Impact:** The approved automatic answer feature does not exist in the running app. Interviewer finals never produce an answer on their own, and there is no Auto Answer control to enable or disable.
- **Root cause:** `handleSuggestionTrigger()` (engine + manager) has no caller. The only automatic path is `maybeSpeculate()` on interviewer **interim** text, whose result is returned but never emitted to the UI; it is also gated to `activeMode === 'idle' | 'assist'`. No `autoAnswer` key exists in `SettingsManager` or the UI.
- **Files/functions:** `electron/IntelligenceEngine.ts` — `handleSuggestionTrigger`, `maybeSpeculate`, `runWhatShouldISay`; `electron/IntelligenceManager.ts` — `handleSuggestionTrigger` (delegation only); `electron/main.ts` — transcript wiring.
- **Dependencies:** Transcript `final` flag, speaker identity, cooldown/dedupe state, suggested-answer IPC events.
- **Verification:** Static: repository-wide grep for callers. Runtime: speak an interviewer question and observe that nothing is generated without Ctrl+1.
- **Recommended correction:** Call `intelligenceManager.handleSuggestionTrigger()` on interviewer **final** segments (with completion heuristics, not on every final), gate on the new Auto Answer setting, and emit the shared pipeline’s answer through the existing events. Do not duplicate generation logic.

### D-06 — Mock Interview applies the microphone sample rate to the wrong STT instance

- **Severity:** High
- **Impact:** In Mock Interview the interviewer channel can decode 44.1 kHz audio as if it were 48 kHz (or the provider default), producing garbled or empty transcripts for the exact feature the mode exists to enable.
- **Root cause:** `wireMicCapture` always uses `googleSTT_User` for the first-chunk rate lock and `sample_rate_changed`, but in mock mode the audio is written to `googleSTT` (interviewer).
- **Files/functions:** `electron/main.ts` — `wireMicCapture()` (~1660-1730), mic recovery path (~2620-2640) repeats the same assumption.
- **Dependencies:** `MicrophoneCapture.getSampleRate()`, provider `setSampleRate` implementations.
- **Verification:** Static: compare write target and rate target in each branch. Runtime: mock mode on a 44.1 kHz device, compare transcript quality with normal mode.
- **Recommended correction:** Resolve the target instance once per chunk (`mock ? googleSTT : googleSTT_User`) and use it for write, rate, channel count and speech-ended. Apply the same fix in the recovery path.

### D-07 — Mock Interview routes `speech_ended` to the inactive user STT

- **Severity:** High
- **Impact:** Providers that need an end-of-speech signal to flush a final segment never receive it in mock mode, so interviewer questions can remain interim or be delayed until timeout.
- **Root cause:** `capture.on('speech_ended')` calls `googleSTT_User.notifySpeechEnded()` behind the `_onlyInterviewerMode` check, without considering `_mockInterviewMode`.
- **Files/functions:** `electron/main.ts` — `wireMicCapture()` speech-ended block (~1730-1740); recovery wiring (~2630-2640).
- **Dependencies:** Same target-instance resolution as D-06.
- **Verification:** Static. Runtime: mock mode with a provider that emits finals only on speech end.
- **Recommended correction:** Same single target-instance fix; the gate should be “is this audio reaching the logical interviewer channel?” rather than a fixed instance.

### D-08 — Hindi and Marathi are not selectable

- **Severity:** High
- **Impact:** Two of the three approved language overrides cannot be chosen anywhere; the requirement set is unmet regardless of engine.
- **Root cause:** `RECOGNITION_LANGUAGES` has no Hindi/Marathi entries, so neither the group list nor the variant list can render them; the AI response language list is likewise missing both.
- **Files/functions:** `electron/config/languages.ts` (`RECOGNITION_LANGUAGES`, `AI_RESPONSE_LANGUAGES`); `src/components/SettingsOverlay.tsx` language selectors (~1376-1420).
- **Dependencies:** Provider language plumbing (D-09) — adding the option without a working setter would be cosmetic.
- **Verification:** Static: option tables. Runtime: open Audio tab and search the dropdown.
- **Recommended correction:** Add `hindi` (`hi-IN`) and `marathi` (`mr-IN`) with correct BCP-47 tags, and only expose them for providers that can honour them (see D-09).

### D-09 — The Sherpa language setter is a no-op and Auto Detect is coerced to en-US

- **Severity:** High
- **Impact:** Selecting English/Hindi/Marathi has no effect on the primary local engine; “Auto Detect” is silently rewritten to English (US) for every provider except Natively. The UI promises behaviour the recognizer does not perform.
- **Root cause:** `SherpaSTT.setRecognitionLanguage()` is empty and `SherpaAutoService` constructs the recognizer with `language: ''` (auto). `AppState.setRecognitionLanguage()` maps `'auto'` → `'english-us'` whenever the provider is not `natively`.
- **Files/functions:** `electron/audio/SherpaSTT.ts` (`setRecognitionLanguage`), `src/main/services/SherpaAutoService.ts` (`init`), `electron/main.ts` `AppState.setRecognitionLanguage()` (~3385-3400).
- **Dependencies:** `sherpa-onnx-node` Whisper config supports a language field; changing it requires rebuilding the recognizer (expensive) or a second recognizer.
- **Verification:** Static: empty setter + hardcoded `language`. Runtime: select Hindi and transcribe Hindi speech.
- **Recommended correction:** Add a real language application path (recreate the recognizer on change, outside the audio hot path) and keep `auto` as `auto` for engines that support detection instead of coercing at the setter.

### D-10 — Sherpa initialization failure falls back silently and cannot be retried

- **Severity:** High
- **Impact:** A missing/broken model or native addon silently switches transcription to Web Speech, with no notice, no policy choice, and no way to recover without restarting the app. If Web Speech is also unavailable the user gets an empty transcript with no explanation.
- **Root cause:** `createSTTProvider` catches the Sherpa constructor error and constructs `WebSpeechSTT` with only a console warning; `SherpaAutoService.ensureInitialized()` latches `initialized = true` **before** `init()`, so a later retry short-circuits and never re-attempts.
- **Files/functions:** `electron/main.ts` — `createSTTProvider()` sherpa branch (~1211-1222); `src/main/services/SherpaAutoService.ts` — `ensureInitialized`, `init`, `getInitError`.
- **Dependencies:** Settings storage for the policy, renderer notification channel, `get-stt-pipeline-diagnostics`.
- **Verification:** Static: catch block + latch order. Runtime: rename the model directory, start a session, observe silent fallback and that re-selecting Sherpa does not re-initialize.
- **Recommended correction:** Add a persisted `sttInitFailurePolicy` (`strict` | `fallback`). Strict: broadcast a terminal error, stop transcription, offer Retry. Fallback: switch only after the failure, broadcast a visible notice, and if fallback also fails broadcast a clear error. Reset the `initialized` latch (or add `reinitialize()`) so Retry works.

### D-11 — Manual What to Answer can silently do nothing inside the cooldown

- **Severity:** Medium
- **Impact:** Clicking “What to answer?” within ~3 s of a previous generation returns `null`; the renderer removes the streaming bubble and shows no message, so the user believes the button is broken.
- **Root cause:** `runWhatShouldISay` early-returns `null` when `!hasImages && !isSpeculative && !skipCooldown && now - lastTriggerTime < triggerCooldown` (3000 ms). The IPC handler maps that to `answer:null`, and `handleWhatToSay` treats a falsy answer as “just stop streaming”.
- **Files/functions:** `electron/IntelligenceEngine.ts` (`runWhatShouldISay`, `triggerCooldown`), `electron/ipcHandlers.ts` (`generate-what-to-say`), `src/components/NativelyInterface.tsx` (`handleWhatToSay` finally block).
- **Dependencies:** Cooldown state shared with the (future) auto path.
- **Verification:** Static: early return path. Runtime: press Ctrl+1 twice within 3 s.
- **Recommended correction:** Treat an explicit user trigger as intent: queue it, or return a distinguishable status (`{status:'cooldown'}`) that the renderer surfaces, and reserve the cooldown for automatic triggers.

### D-12 — No “no interviewer question captured” guard or message

- **Severity:** Medium
- **Impact:** Triggering What to Answer before any interviewer speech produces a generic or irrelevant answer instead of a clear message, which the requirements explicitly forbid.
- **Root cause:** Neither the IPC handler nor the engine checks for the existence of an interviewer turn; the prompt runs on whatever context exists. The only fallbacks are short-answer substitution and the non-answer sentinel.
- **Files/functions:** `electron/IntelligenceEngine.ts` (`runWhatShouldISay`), `electron/ipcHandlers.ts` (`generate-what-to-say`), `src/components/NativelyInterface.tsx` (`handleWhatToSay`).
- **Dependencies:** `SessionTracker.getLastInterviewerTurn()` (already available).
- **Verification:** Static: no guard. Runtime: start a session with silence and press Ctrl+1.
- **Recommended correction:** Precondition at the shared boundary: no interviewer turn → return `{status:'no_question'}`; renderer shows a dismissible system message and leaves the session untouched. Keep the check in the backend so both triggers get it.

### D-13 — Only Interviewer and Mock Interview can both persist as enabled

- **Severity:** Medium
- **Impact:** After a restart the two mutually exclusive modes can both be `true`; routing then silently prefers Mock Interview (its branch returns before the Only Interviewer gate), which contradicts what the settings file says.
- **Root cause:** IPC setters persist each key independently; `setOnlyInterviewerMode` / `setMockInterviewMode` only clear the counterpart in memory. The constructor loads both keys without normalization.
- **Files/functions:** `electron/ipcHandlers.ts` (~2667-2700), `electron/main.ts` (`setOnlyInterviewerMode`, `setMockInterviewMode`, constructor), `electron/services/SettingsManager.ts`.
- **Dependencies:** Audio routing branch order (D-06/D-07 fix will touch the same code).
- **Verification:** Static: setters vs. persistence. Runtime: enable each in turn, restart, inspect settings + routing.
- **Recommended correction:** Persist the pair atomically (enabling one writes `false` for the other) and normalize on load with a deterministic precedence rule.

### D-14 — Custom STT configuration is not exposed through preload

- **Severity:** Medium
- **Impact:** The Custom STT provider can be selected and tested, but its endpoint/model/header configuration has no bridge, so the runtime falls back to empty values and `RestSTT` cannot work as configured.
- **Root cause:** `set-custom-stt-config` exists in `ipcHandlers.ts`; `preload.ts` contains no `customStt`/`CustomStt` member (grep: zero matches).
- **Files/functions:** `electron/preload.ts`, `electron/ipcHandlers.ts` (`set-custom-stt-config`), `src/components/SettingsOverlay.tsx` (custom STT state).
- **Dependencies:** Preload type interface, settings save flow.
- **Verification:** Static: handler without bridge. Runtime: configure Custom STT and inspect persisted credentials.
- **Recommended correction:** Expose the config channel in preload with a typed signature, and keep the existing masked-key guard.

### D-15 — Ctrl+1 is unavailable while the launcher is active during a session

- **Severity:** Medium
- **Impact:** After Home, the approved What to Answer shortcut stops working even though the session is live; the user must return to the overlay first.
- **Root cause:** `shouldRegister` returns true for chat actions only when `activeMode === 'overlay'`; Home sets mode to `launcher`.
- **Files/functions:** `electron/services/KeybindManager.ts` (`shouldRegister`, `setMode`), `electron/main.ts` (`switchToLauncher`).
- **Dependencies:** Intended semantics of “global shortcut while hidden”.
- **Verification:** Static. Runtime: session → Home → Ctrl+1.
- **Recommended correction:** Decide explicitly: either register chat actions in launcher mode while `sessionActive`, or document overlay-only scope and reflect it in Settings. Do not leave the chord silently dead.

### D-16 — Chat shortcuts are handled twice when the overlay is focused

- **Severity:** Medium
- **Impact:** Ctrl+1 and the other chat chords can fire the renderer handler and the global accelerator for one press; the second invocation is dropped by `isProcessingRef`, so a deliberate repeated press can be lost.
- **Root cause:** Renderer `keydown` map plus OS-global accelerators for the same actions; no de-duplication by event source.
- **Files/functions:** `src/components/NativelyInterface.tsx` (keydown map), `electron/main.ts` (shortcut callback → `global-shortcut` broadcast), `electron/services/KeybindManager.ts`.
- **Dependencies:** D-04 fix must be designed together with this.
- **Verification:** Static: two handlers, one chord. Runtime: count generations per single press in logs.
- **Recommended correction:** One owner per action. Since the requirements specify global shortcuts, keep OS registration authoritative and make the renderer path a no-op when the global one is registered (or remove the renderer chord entirely).

### D-17 — Audio diagnostics report cached/misleading STT state

- **Severity:** Medium
- **Impact:** Settings → Audio can show a provider that is not actually instantiated (silent provider fallback) and `sttConnected` is true whenever an object exists, so users and support cannot tell whether transcription is really running.
- **Root cause:** `sttProvider` is a cache written in `setupSystemAudioPipeline`; `sttConnected: !!this.googleSTT` reports instance existence. Silent fallbacks assign a local `effectiveSttProvider` that is never persisted.
- **Files/functions:** `electron/main.ts` (`getAudioPipelineDiagnostics`, `createSTTProvider`), `electron/ipcHandlers.ts` (`get-stt-pipeline-diagnostics`), `src/components/SettingsOverlay.tsx` (diagnostics block).
- **Dependencies:** D-10 (fallback reporting).
- **Verification:** Static. Runtime: select Sherpa with a broken model and read the diagnostics panel.
- **Recommended correction:** Report the constructor name of the live instance per channel plus a real connection state from provider events; include `fallbackFrom`/`fallbackReason`.

### D-18 — Sherpa decoding runs synchronously on the Electron main thread

- **Severity:** Medium
- **Impact:** On the stated i5-6200U (2C/4T, 8 GB, HDD), Whisper base int8 decode competes with IPC, window management and the renderer bridge on the same process. Expect main-thread stalls during speech, sluggish Ctrl+B/Stop response, and long first-session model load from disk.
- **Root cause:** `SherpaSTT.write()` is called from the capture `data` listener and synchronously runs VAD + `recognizer.decode` inside `SherpaAutoService.processChunk`. `numThreads: 2` also consumes both physical cores.
- **Files/functions:** `electron/audio/SherpaSTT.ts` (`write`), `src/main/services/SherpaAutoService.ts` (`processChunk`, `drainSegments`, `decodeSegment`, `init`), `electron/main.ts` (`wireSystemCapture`, `wireMicCapture`).
- **Dependencies:** Native addon thread-safety, existing worker infrastructure (`worker-script/`, `electron/audio/whisper/`).
- **Verification:** Static: synchronous call on the capture callback. Runtime: measure main-process responsiveness during decode (not performed here).
- **Recommended correction:** Move VAD/decode to a worker thread (or a utility process) with a bounded queue and drop-oldest backpressure; keep the main thread to Buffer hand-off. Measure before/after on the target hardware; do not restructure without measurements.

### D-19 — The overlay renderer is loaded at boot while hidden

- **Severity:** Low
- **Impact:** Two renderers are resident from launch on an 8 GB machine; startup is heavier than necessary, and the overlay loads the full app bundle before any session exists.
- **Root cause:** `createWindow()` calls `ensureOverlayWindow()` unconditionally after the launcher loads.
- **Files/functions:** `electron/WindowHelper.ts` (`createWindow`, `ensureOverlayWindow`).
- **Dependencies:** D-01 (Start needs a fast reveal); lazy creation must not reintroduce the reveal delay.
- **Verification:** Static. Runtime: count renderer processes at idle.
- **Recommended correction:** Create the overlay lazily on the first Start/reveal, and keep the creation promise so Start can await it without a visible delay.

### D-20 — Keybind id drift: auto-answer, shorten and recap rows are dead

- **Severity:** Low
- **Impact:** Those rows can be edited in the shortcut UI but never bind anything; `chat:recap` is even migrated to `chat:dynamicAction4`, so a user's recap binding silently becomes a different action.
- **Root cause:** `useShortcuts` maps ids that `KeybindManager.DEFAULT_KEYBINDS` does not define.
- **Files/functions:** `src/hooks/useShortcuts.ts` (map + update switch), `electron/services/KeybindManager.ts` (defaults, `ID_MIGRATIONS`).
- **Dependencies:** D-05 adds the Auto Answer setting, which is the natural moment to decide its shortcut.
- **Verification:** Static: id sets differ. Runtime: rebind and press.
- **Recommended correction:** Either add the ids with real handlers or remove the rows; do not keep editable-but-inert shortcuts.

### D-21 — Dead duplicate condition in `shouldRegister`

- **Severity:** Low
- **Impact:** No user-visible effect today, but the unreachable `return true` for `general:toggle-visibility` makes the gating look configurable when it is not, and will mislead the D-03 fix.
- **Root cause:** Early return on `sessionActive` precedes a later branch returning `true` for the same id.
- **Files/functions:** `electron/services/KeybindManager.ts` (`shouldRegister`).
- **Verification:** Static.
- **Recommended correction:** Remove the dead branch as part of the D-03 change and express the two states explicitly.

### D-22 — Saving the Natively API key unconditionally re-syncs the model

- **Severity:** Medium (requires runtime verification)
- **Impact:** A user who pinned a specific chat model can have it replaced by the effective default merely by saving a Natively key; the UI receives `model-changed`.
- **Root cause:** `set-natively-api-key` always calls `llmHelper.setModel(cm.getDefaultModel(), providers)` and broadcasts, independent of whether the key affected the default.
- **Files/functions:** `electron/ipcHandlers.ts` (`set-natively-api-key`), `electron/services/CredentialsManager.ts` (`setNativelyApiKey`).
- **Verification:** Static: unconditional call. Runtime: pin a model, save a key, observe the model chip.
- **Recommended correction:** Only re-sync when the effective default actually changed, and never override an explicit user model choice.

### D-23 — Masked-key handling can re-inject placeholders

- **Severity:** Low (requires runtime verification)
- **Impact:** A masked value could be written back as a literal key for providers without the `sk-...` guard, producing authentication failures that look like provider outages.
- **Root cause:** Masking is a UI placeholder convention; only custom STT has a prefix guard.
- **Files/functions:** `src/components/SettingsOverlay.tsx`, `src/components/settings/ProviderCard.tsx`, `electron/ipcHandlers.ts` (custom STT guard).
- **Verification:** Static. Runtime: save twice and inspect stored credentials.
- **Recommended correction:** Never send a masked value from the renderer; treat “unchanged” as an explicit signal.

### D-24 — Overlay destruction happens inside background teardown

- **Severity:** Low
- **Impact:** A very fast Stop → Start can race overlay destruction against the new session’s reveal; the code mitigates this with `_pendingTeardown` + `_overlayCreating`, but the ordering is implicit.
- **Root cause:** `destroyOverlayWindow()` runs after the 250 ms drain inside `_pendingTeardown`, while `startMeeting` may already be awaiting that promise and calling `ensureOverlayWindow()`. The teardown does not check `endedSessionId` before destroying.
- **Files/functions:** `electron/main.ts` (`endMeeting` background block), `electron/WindowHelper.ts` (`destroyOverlayWindow`).
- **Verification:** Static. Runtime: rapid Stop/Start loop, watch for a missing overlay or a destructions log after a new session id.
- **Recommended correction:** Guard destruction by session id and perform it synchronously before the background drain, or make `ensureOverlayWindow` idempotent against an in-flight destroy.

### D-25 — Overlay opacity has two owners

- **Severity:** Low
- **Impact:** Persistence lives in renderer `localStorage` while an IPC handler also applies opacity; clearing site data or using a second window can desynchronise the setting.
- **Root cause:** Split ownership.
- **Files/functions:** `src/App.tsx` (opacity state/listeners), `electron/ipcHandlers.ts` (`set-overlay-opacity`), `electron/preload.ts`.
- **Verification:** Static.
- **Recommended correction:** Persist through `SettingsManager` and treat the renderer as a view; keep the existing control unchanged.

## F. UI preservation register

### F.1 Elements that must remain unchanged

| Area | Element | State |
| --- | --- | --- |
| Overlay | Text input (placeholder “Enter a technology or topic…”) | Present, wired (Path A) — **preserve verbatim** |
| Overlay | Send button (circular arrow, `disabled={!canSend}`) | Present, wired — **preserve position/function** |
| Overlay | Enter / Shift+Enter / Ctrl+Shift+Enter handling | Present, wired |
| Overlay | “What to answer?” action (Pencil) | Present, wired (Path B) — **do not duplicate** |
| Overlay | Model selector chip, Settings (sliders) button | Present, wired |
| Overlay | TopPill (expand toggle, Home/logo, quit), WindowControls | Present; Home wired to launcher |
| Overlay | Dynamic action bar, notices (stealth, STT warnings, vision status) | Present |
| Launcher | Start Natively / “Meeting ongoing” CTA pill | Present; CTA reopens overlay when a session is live |
| Settings | 12 tabs: General, Natively API, Natively Pro, AI Providers, Calendar, Knowledge Base, Audio, Keybinds, Code Execution, Phone Mirror, Setup & Help, About | Present |
| Settings → Audio | Provider cards (none/google/groq/openai/deepgram/elevenlabs/azure/ibmwatson/soniox/local-whisper/sherpa/custom), key fields, Test, diagnostics, speech-recognition language, AI response language, Only Interviewer, Noise Cancellation, Mock Interview, Whisper model panel | Present |
| Settings → Knowledge Base | `KnowledgeBaseTab` with real IPC | Present and wired |

### F.2 Controls that are present but disconnected or duplicated

| Control | Problem | Defect |
| --- | --- | --- |
| Custom STT configuration fields | Backend exists, no preload bridge | D-14 |
| Auto Answer shortcut row | No backend id, no runtime feature | D-05, D-20 |
| Shorten / Recap shortcut rows | No backend id (recap migrates to dynamicAction4) | D-20 |
| Hindi / Marathi | Not offered at all | D-08 |
| Ctrl+B semantics in overlay | Two handlers, one expands | D-04 |
| Overlay opacity | Two owners | D-25 |
| `src/components/settings/Sidebar.tsx` | Dead file, no imports | C-21 |
| STT diagnostics panel | Shows cached provider / misleading connection flag | D-17 |

No element in this register is to be removed, renamed, repositioned or redesigned during the repair pass. The only UI **additions** the approved requirements justify are: an Auto Answer toggle (D-05), Hindi/Marathi options (D-08), and a failure-policy selector with a Sherpa Retry affordance (D-10).

## G. Runtime verification matrix

| Verification | Method | Result |
| --- | --- | --- |
| Electron TypeScript compiles | `npm run typecheck:electron` | **PASS — executed, exit 0, no output** |
| Window creation, single launcher/overlay | Source inspection | Verified by source |
| Start/Stop lifecycle ordering | Source inspection | Verified by source |
| Ctrl+B registration states | Source inspection | Verified by source (defects confirmed) |
| Start reveals overlay | Source inspection | Verified by source (defect confirmed) |
| Home keeps session | Source inspection | Verified by source |
| Textbox Enter + Send path | Source inspection | Verified by source (end-to-end not executed) |
| What to Answer button path | Source inspection | Verified by source |
| Ctrl+1 registration scope | Source inspection | Verified by source |
| Auto Answer trigger | Repository-wide search | Verified by source (no caller — defect confirmed) |
| Cooldown / dedupe behaviour | Source inspection | Verified by source |
| Sherpa model files present | Directory listing | Verified: encoder, decoder, tokens, VAD all present |
| Sherpa language application | Source inspection | Verified by source (no-op) |
| Mock Interview routing (write target) | Source inspection | Verified by source |
| Mock Interview rate/speech-ended | Source inspection | Verified by source (wrong instance) |
| Only Interviewer gating | Source inspection | Verified by source |
| Persistence of audio modes | Source inspection | Verified by source |
| Provider fallback behaviour | Source inspection | Verified by source (silent) |
| Audio at 44.1 / 48 kHz | — | **Not verified — no runtime capture performed** |
| Actual transcription quality | — | **Not verified** |
| Actual LLM answer latency | — | **Not verified** |
| Duplicate-window behaviour under rapid Start/Ctrl+B | — | **Not verified** (code guards inspected only) |
| Unit tests (`npm run test`) | — | **Not run** (requires `build:electron`; treated as out of scope for a read-only pass) |
| Playwright e2e | — | **Not run** (requires a built app and a display) |

## H. Test and verification plan (to execute before and after repair)

No code changes are required to run these; they are the acceptance criteria for the repair pass. Items marked **(static)** can be checked from source; the rest require the packaged/dev app.

### H.1 Window lifecycle (20 steps)

1. Launch the app. 2. Verify the idle launcher is shown, no session, no capture indicator. 3. Press Ctrl+B before Start. 4. Verify the launcher hides and reappears on the second press, and that no overlay appears and no audio starts. 5. Click Start Natively. 6. Verify the overlay appears and the launcher hides. 7. Press Ctrl+B. 8. Verify the entire overlay hides (no pill, no resize handles, no floating controls) and the launcher does **not** appear. 9. Press Ctrl+B again. 10. Verify the same overlay returns with content intact and no duplicate window in the task manager/window list. 11. Click Home/logo. 12. Verify the launcher appears and the session stays active. 13. Verify transcription still advances in the launcher’s live view. 14. Press Ctrl+B while the launcher is visible. 15. Verify only visibility changes and the overlay opens on the same session. 16. Click the “Meeting ongoing” pill; verify the overlay returns. 17. Stop the session. 18. Verify captures/STT stop, the transcript drain completes, the launcher returns to “Start Natively”. 19. Start again. 20. Verify a clean session (no stale transcript, no duplicated listeners, overlay re-created once).

**Rapid-sequence variants:** Start → Stop → Start within 1 s; Start → Ctrl+B ×5; Stop then Ctrl+B immediately (must be inert).

### H.2 Answer generation

1. Type a question, submit with Enter. 2. Type another, submit with the Send button. 3. Verify both produce independent streams, correct loading state, and no duplicated user bubbles. 4. Capture/allow an interviewer question. 5. Trigger What to Answer with the button. 6. Trigger it with Ctrl+1. 7. Verify both use the latest interviewer question. 8. Verify Ctrl+1 within 3 s of a previous answer produces feedback, not silence. 9. Enable Auto Answer, let a complete interviewer question finish. 10. Verify one automatic answer appears. 11. Verify an incomplete fragment produces none. 12. Verify candidate speech produces none. 13. Trigger manual + automatic nearly simultaneously; verify one generation and no duplicated bubbles. 14. Trigger What to Answer with no interviewer speech; verify a clear message and no answer.

### H.3 Audio / STT matrix

| Scenario | Expected |
| --- | --- |
| Normal Interview | interviewer = system audio, candidate = mic; both labelled |
| Mock Interview | mic audio reaches the interviewer channel; no system capture; correct sample rate and speech-ended |
| Only Interviewer | candidate speech absent from answer context; interviewer unaffected |
| Mode switch + restart | persisted mode honoured; never both enabled |
| Auto language | language detected, not coerced to en-US |
| English / Hindi / Marathi override | recognizer actually uses the selection |
| Sherpa missing model, strict policy | clear error, transcription stopped, no provider switch, Retry available |
| Sherpa missing model, fallback policy | visible notice, Web Speech active, no silent switch |
| Sherpa retry after restoring model | succeeds without app restart |
| Fallback also unavailable | understandable terminal error |
| Repeated Start/Stop ×10 | no leaks, no duplicate STT sockets, stable memory |
| 44.1 kHz and 48 kHz devices | correct transcripts on both mic and system channels |

### H.4 Static checks to keep green

`npm run typecheck:electron` (exit 0 today), `npm run build:electron`, and the existing `electron/services/__tests__` + `electron/llm/__tests__` suites after `build:electron`.

## I. Coordinated repair plan

Seven modules. Each is independently testable and touches a bounded file set. No unrelated refactoring is included.

### R1 — Single visibility controller (window/session correctness)

- **Defects:** D-01, D-02, D-03, D-04, D-21, D-24
- **Objective:** One authoritative path for Start, Ctrl+B, Home and Stop; overlay reveal on Start; pure hide on Ctrl+B.
- **Files:** `electron/main.ts` (`startMeeting`, `toggleAssistantOverlay`, `toggleMainWindow`, `endMeeting` destroy guard), `electron/services/KeybindManager.ts` (`shouldRegister`, session/mode gating), `electron/ipcHandlers.ts` (`toggle-window`, `set-window-mode`), `src/components/NativelyInterface.tsx` (remove duplicate chord handler).
- **Dependencies:** None. Must land first.
- **Risks:** Remove the renderer chord without leaving the user without Ctrl+B inside the overlay if the OS registration fails (keep the registration-failed notice); do not break the 60 ms opacity ramp used for Windows content protection; preserve the IPC-response-before-audio-init ordering.
- **Tests:** H.1 steps 1-20 plus rapid sequences.
- **Expected result:** Start → overlay; Ctrl+B toggles only the overlay; Home → launcher; Stop → idle launcher; exactly one overlay instance.

### R2 — Audio routing correctness (Mock / Only Interviewer)

- **Defects:** D-06, D-07, D-13
- **Objective:** Resolve the logical interviewer channel once per chunk and use it for write, rate, channel count and speech-ended; make the two modes mutually exclusive in persistence.
- **Files:** `electron/main.ts` (`wireMicCapture`, mic recovery wiring, setters, constructor normalization), `electron/ipcHandlers.ts` (mode IPC), `electron/services/SettingsManager.ts` (atomic pair).
- **Dependencies:** R1 optional; independent but both touch `main.ts`, so sequence after R1.
- **Risks:** Breaking normal-mode routing for candidate speech; changing recovery semantics; persisted settings migration for existing users.
- **Tests:** H.3 Mock Interview, Only Interviewer, restart persistence, 44.1/48 kHz.
- **Expected result:** Correct rate and finals in mock mode; no candidate audio in interviewer context; one mode at a time.

### R3 — Language support

- **Defects:** D-08, D-09
- **Objective:** Real auto-detect, English, Hindi, Marathi across UI → settings → provider → recognizer.
- **Files:** `electron/config/languages.ts`, `src/components/SettingsOverlay.tsx` (Audio tab options), `electron/main.ts` (`setRecognitionLanguage`), `electron/audio/SherpaSTT.ts`, `src/main/services/SherpaAutoService.ts`.
- **Dependencies:** R2 (same audio wiring) recommended first; R5 shares the Sherpa lifecycle.
- **Risks:** Rebuilding the recognizer on language change is expensive (HDD); doing it on the audio thread would stall. Provider-specific capability differences must not be advertised falsely.
- **Tests:** H.3 language rows for every provider that offers the option.
- **Expected result:** Selecting a language changes recognition; `auto` stays `auto` where supported; unsupported combinations are not offered.

### R4 — Sherpa failure policy and recoverable init

- **Defects:** D-10, D-17 (reporting half)
- **Objective:** Strict vs. fallback policies, visible notification, retry that works, diagnostics that report the real instance.
- **Files:** `electron/main.ts` (`createSTTProvider`, diagnostics), `src/main/services/SherpaAutoService.ts` (`ensureInitialized`/`reinitialize`), `electron/services/SettingsManager.ts`, `src/components/SettingsOverlay.tsx` (Audio tab policy + Retry), `electron/preload.ts` if a new channel is added.
- **Dependencies:** R3 (both touch Sherpa init).
- **Risks:** A retry that blocks the main thread; duplicate STT instances if retry runs during an active session; policy default choice for existing installs.
- **Tests:** H.3 Sherpa rows + fallback-failure row.
- **Expected result:** No silent switch, one clear message, retry without restart, accurate diagnostics.

### R5 — Automatic Answer through the shared pipeline

- **Defects:** D-05, D-11, D-12, D-16, D-20
- **Objective:** A real automatic trigger on completed interviewer questions, one shared pipeline with manual What to Answer, honest no-question and cooldown feedback, no duplicate generation.
- **Files:** `electron/IntelligenceEngine.ts` (trigger wiring, dedupe by question identity, cooldown semantics), `electron/IntelligenceManager.ts`, `electron/main.ts` (transcript → trigger call, respecting speaker/routing), `electron/ipcHandlers.ts` (`generate-what-to-say` statuses), `src/components/NativelyInterface.tsx` (messages for `no_question`/`cooldown`, Auto Answer control placement decision), settings storage for the Auto Answer toggle.
- **Dependencies:** R2 (speaker routing must be trustworthy before auto-generation is enabled), R1 (the overlay must be visible when an automatic answer arrives).
- **Risks:** Regressing the manual path; generating on fragments; double answers when manual and auto overlap; firing while the session is stopping (`_isDraining`); cost of automatic LLM calls on slow hardware.
- **Tests:** H.2 steps 4-14.
- **Expected result:** One answer per completed interviewer question when enabled; none for fragments/candidate speech; manual and automatic coordinate; every manual trigger produces feedback.

### R6 — Settings surface gaps (preload, persistence, diagnostics)

- **Defects:** D-14, D-17, D-22, D-23, D-25, C-21 (defer removal)
- **Objective:** Close bridge gaps and remove ambiguous state without touching layout.
- **Files:** `electron/preload.ts` (+ type surface), `electron/ipcHandlers.ts`, `electron/main.ts` (diagnostics), `electron/services/SettingsManager.ts` (opacity), `src/components/SettingsOverlay.tsx` (only wiring, no layout change).
- **Dependencies:** R4 for diagnostics fields; otherwise independent.
- **Risks:** Preload signature drift breaking the renderer build; changing persisted key names; the type surface is shared across many components.
- **Tests:** Type-check, custom STT save/read round-trip, diagnostics after each provider selection, model pin survives a key save.
- **Expected result:** Every settings control that appears writes something the runtime reads; diagnostics reflect reality.

### R7 — Performance on the target machine (evidence-gated)

- **Defects:** D-18, D-19
- **Objective:** Keep the main process responsive during Sherpa decoding and reduce idle memory, **only after measuring**.
- **Files:** `electron/audio/SherpaSTT.ts`, `src/main/services/SherpaAutoService.ts`, a worker entry (existing `worker-script/` or `electron/audio/whisper/` pattern), `electron/WindowHelper.ts` (lazy overlay).
- **Dependencies:** R3/R4 (Sherpa lifecycle must be stable first).
- **Risks:** Native addon thread-safety, dropped audio under backpressure, start latency if the overlay becomes lazy. Do not attempt without before/after measurements on the i5-6200U.
- **Tests:** Session with continuous speech; measure main-thread stall (event-loop delay), Stop/Ctrl+B latency, idle renderer count.
- **Expected result:** No visible UI stalls during decode; lower idle footprint; unchanged transcription quality.

## J. Repair order and dependencies

Safest sequence, chosen so that no two modules fight over the same behaviour at the same time:

```
Checkpoint (git init/commit or archive — repository currently has no .git)
  └─ R1  window/session controller            [main.ts, KeybindManager, renderer chord]
       └─ verify H.1 in full, including rapid sequences
  └─ R2  audio routing (mock / only-interviewer) [main.ts, ipcHandlers, SettingsManager]
       └─ verify H.3 mode rows + restart persistence
  └─ R4  Sherpa failure policy + retry        [main.ts, SherpaAutoService, settings UI]
       └─ R3  language support                 [languages.ts, Sherpa, settings UI]
            └─ verify H.3 language rows
  └─ R5  automatic answer + shared pipeline   [IntelligenceEngine/Manager, ipc, overlay UI]
       └─ verify H.2 in full
  └─ R6  preload / persistence / diagnostics gaps
  └─ R7  performance work — only with measurements
```

Why this order:

- **R1 first** because every later runtime test needs deterministic window behaviour; without it, testers cannot tell a bug from the known Ctrl+B symptom.
- **R2 before R5** because automatic answers are only trustworthy once speaker routing (mock/only-interviewer) is correct; otherwise auto-generation could answer the candidate’s own words.
- **R4 before R3** because language selection is meaningless for Sherpa while its initialization can silently fall back; and both rebuild the recognizer.
- **R5 after R1/R2** for the same reason, and because the no-question message needs a visible overlay.
- **R6 last among functional work** so it does not churn preload types while functional modules are editing IPC.
- **R7 strictly last**, and only if measurements justify it; it is the only module that changes threading.

File-conflict map (for sequencing): `electron/main.ts` is touched by R1, R2, R4, R5, R6; `electron/ipcHandlers.ts` by R1, R2, R5, R6; `KeybindManager.ts` only by R1; `NativelyInterface.tsx` by R1 and R5 (different regions — chord handler vs. system messages); `SettingsOverlay.tsx` by R3, R4, R6 (different tabs, same file).

## K. Final recommendations

### K.1 What must be fixed

1. **Window lifecycle (R1).** Start must reveal the overlay; Ctrl+B must be a pure overlay hide/show, registered in both idle and session states; only one handler may own the chord. This is the difference between the approved workflow and the current one.
2. **Automatic Answer (R5).** The feature is not wired at all today. Without a trigger, a setting, and the no-question message, three approved requirements (3.3, 3.5, 3.6) remain unmet even though the shared pipeline already exists and is good.
3. **Mock Interview routing (R2).** Sample rate and speech-ended go to the wrong STT instance, which undermines the mode’s entire purpose.
4. **Language support (R3).** Hindi and Marathi do not exist in the option table, Sherpa ignores the setter, and Auto Detect is coerced to English. Two of the three approved languages are unreachable.
5. **Sherpa failure policy (R4).** Silent fallback plus a permanent init latch violates the approved “never switch silently” rule and removes the recovery path.

### K.2 What should be preserved

- The entire Settings surface (12 tabs, all controls, labels, descriptions, layout) — no redesign.
- The overlay textbox, Enter handling and Send button exactly as they are; they are correct and are Path A.
- The single “What to answer?” control (no duplicate button).
- The Home/logo → launcher behaviour, which already keeps the session alive.
- `WindowHelper` as the single window owner; the fix is to remove the competing renderer path, not to add a manager.
- `WhatToAnswerLLM` / `IntelligenceEngine.runWhatShouldISay` as the one shared answer pipeline; Path C must reuse it, not fork it.
- The `_pendingTeardown` / `_isDraining` teardown design; it solves real Stop-click latency and trailing-final loss.

### K.3 What should be deferred

- Moving Sherpa to a worker thread (R7) until measured stall data exists.
- Lazy overlay creation (D-19) until R1 lands, so Start latency is not traded blindly.
- Any change to adaptive/speculative inference behaviour beyond gating it behind the automatic-answer design.
- Code Execution engine wiring (C-14) — unverified and outside the approved requirement set.
- Google credential-picker work (C-17) — unverified; do not “fix” what may already work.

### K.4 What can eventually be removed safely (after the repair pass)

Only as a **set**, and only when the Local Whisper provider is formally retired:

| Layer | Artefact |
| --- | --- |
| Runtime | `createSTTProvider` `local-whisper` branch, `LocalWhisperSTT` import, the `setImmediate` model preloader in the `AppState` constructor |
| Audio module | `electron/audio/LocalWhisperSTT.ts` + `LocalWhisperSTT - Backup.ts` + `LocalWhisperSTT - backup2.ts`, `electron/audio/MicrophoneCapture -Backup.ts`, `electron/audio/whisper/*` |
| Dependencies | `@huggingface/transformers`, `whisper-node` — **after** confirming no other importer (Sherpa uses `sherpa-onnx-node`, not transformers) |
| Models | `resources/models/Xenova/**`, downloader entries in `scripts/download-models.js` |
| Settings/UI | `src/components/settings/WhisperSettings.tsx` and its slot in the Audio tab, `localWhisper*` keys in `SettingsManager`/`CredentialsManager`, preload/IPC model-management channels |
| Build | `asarUnpack` entry for `whisper-node`, any packaged model resources |

Shared and **not** removable with it: `electron/audio/whisper/audioResampler.ts` (imported by `SherpaSTT`), the generic `STTProvider` type, the `audio/whisper/modelManager` helpers if referenced elsewhere.

Also safe to remove now, independently: `src/components/settings/Sidebar.tsx` (no importers), `electron/LLMHelper.ts.orig`, `electron/WindowHelper.ts.bak`, `src/components/NativelyInterface.tsx.orig`, `src/components/NativelyInterface.tsx.broken-backup`, `electron_backup_safe/**` and the stray `vite.config.mts.timestamp-*.mjs` files — but do this in a separate, reviewable change, not inside the functional repair pass.

### K.5 What needs runtime testing

Everything in Section H except the type-check: window lifecycle, Ctrl+B in both stages, Start/Home/Stop continuity, Enter vs. Send, Ctrl+1 vs. button, automatic answer, duplicate suppression, no-question message, Mock Interview at 44.1/48 kHz, Only Interviewer, all three language paths, both Sherpa failure policies, retry, repeated Start/Stop, and main-thread responsiveness during decode.

### K.6 Readiness for a coordinated repair pass

**Yes, conditionally.** The project is ready for one coordinated pass because:

- The codebase is coherent and currently compiles cleanly (`typecheck:electron` exit 0).
- The shared answer pipeline, window helper, provider factory and settings persistence all exist and are the right places to correct — the required work is wiring and gating, not architecture.
- The defects are concentrated in five files (`main.ts`, `KeybindManager.ts`, `IntelligenceEngine.ts`, `NativelyInterface.tsx`, `SettingsOverlay.tsx`) plus two small ones (`languages.ts`, `preload.ts`).

Conditions:

1. **Create a source checkpoint first.** The tree has **no `.git`**, so a repair pass would currently be unrecoverable. Initialise version control or archive the folder before R1.
2. Capture a baseline runtime log (launch, Start, Ctrl+B, Home, Stop) so the post-repair comparison is evidence-based, not impressionistic.
3. Accept the severity ordering: R1/R2/R4/R3/R5 are the approved-feature work; R6 and R7 are follow-ups.
4. Do not combine this pass with the Local Whisper removal or the UI additions beyond the three justified controls (Auto Answer toggle, Hindi/Marathi options, failure policy + Retry).

---

*End of Module 03A audit. No source file was modified; the only file created is this report. Awaiting approval before any implementation begins.*

