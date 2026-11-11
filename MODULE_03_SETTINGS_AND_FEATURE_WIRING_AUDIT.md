# MODULE 03 — COMPLETE SETTINGS AND FEATURE WIRING AUDIT

**Project:** Natively AI Interview Assistant
**Audit type:** Read-only static investigation (no code, UI, dependency, or configuration changes made)
**Report date:** 2026-11-11
**Report file:** `MODULE_03_SETTINGS_AND_FEATURE_WIRING_AUDIT.md`

---

## Verification Limitation (read this first)

Every finding below is derived from **static source inspection only**. The application was **not launched**, no Settings tab was clicked, no IPC call was executed, and no provider was contacted. Therefore:

- "Works" means *the code path is present and internally consistent*, not that it was observed working at runtime.
- Anything that depends on OS permissions, network responses, native modules, or Electron window behaviour is explicitly labelled **not runtime-verified**.
- Claims are split into **Confirmed** (direct code evidence, reproducible by reading the cited lines) and **Suspected** (inference that requires runtime confirmation).

No API key values were read or reproduced. Only key *presence* flags and mask formats were inspected.

---

## 1. Actual Project Identification

| Item | Value | Evidence |
|---|---|---|
| Project root | `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main` | confirmed directory listing |
| Application directory | Repository root (single-package Electron app; renderer in `src/`, main process in `electron/`) | `package.json`, `vite.config.mts` |
| Package name / version | `natively` / **2.6.0** | `package.json:2-3` |
| Electron entry | `dist-electron/electron/main.js` | `package.json:5` |
| Electron version | **45.2.3** installed (declared `^45.2.3`) | `node_modules/electron/package.json` |
| React | **19.3.1** installed (declared `^19.2.6`) | `node_modules/react/package.json` |
| TypeScript | **5.9.3** installed (declared `^5.6.3`) | `node_modules/typescript/package.json` |
| Vite | **5.4.21** | `node_modules/vite/package.json` |
| Node.js on audit host | v24.22.1 | `node -v` |
| State management | React local state + `electron-store` only in `DonationManager` | `electron/DonationManager.ts:1` |
| Git branch / commit / status | **Unavailable — no `.git` directory** in this copy | `git status` → `fatal: not a git repository` |

### 1.1 Configuration and persistence services (discovered)

| Service | Path | Stores | Format |
|---|---|---|---|
| `SettingsManager` | `electron/services/SettingsManager.ts` | boot-critical non-secret flags | `%AppData%/<app>/settings.json` (atomic write, `:179-188`) |
| `CredentialsManager` | `electron/services/CredentialsManager.ts` | API keys, provider/model/language choices | `credentials.enc` via `safeStorage` (`:14`, `:466-486`) |
| `KeybindManager` | `electron/services/KeybindManager.ts` | shortcut overrides | `keybinds.json` (`:126`, `:196-210`) |
| `ThemeManager` | `electron/ThemeManager.ts` | theme mode | `theme-config.json` (`:19`) |
| `KnowledgeBaseService` | `electron/services/KnowledgeBaseService.ts` | KB files, chunks, enabled, threshold | `knowledge-base/index.json` (`:52-55`) |
| Renderer `localStorage` | multiple components | UI-only preferences | device IDs, opacity, transcript visibility, fast-mode mirror |
| Premium DB | `premium/electron/knowledge/*`, `DatabaseManager` | modes, knowledge documents, meetings | SQLite |

### 1.2 Settings components and dependencies

| Component | Lines | Role |
|---|---|---|
| `src/components/SettingsOverlay.tsx` | 1624 | Hosts all 12 tabs, General + Audio + Keybinds + Calendar inline, owns most settings handlers |
| `src/components/settings/AIProvidersSettings.tsx` | 1047 | AI providers, keys, default model, fast mode, Codex CLI, Ollama, custom cURL |
| `src/components/settings/NativelyApiSettings.tsx` | 857 | Natively API key, trial, usage |
| `src/components/settings/NativelyProSettings.tsx` | 366 | Pro/account |
| `src/components/settings/WhisperSettings.tsx` | 270 | "STT Settings" panel — **not wired to runtime** (see Bug C-3) |
| `src/components/settings/ExecutionEnginesSettings.tsx` | 322 | Judge0 / custom code engines |
| `src/components/settings/PhoneMirrorSettings.tsx` | 266 | Phone mirror |
| `src/components/settings/HelpSettings.tsx` | 1790 | Static setup help + external links |
| `src/components/KnowledgeBaseTab.tsx` | ~430 | Knowledge Base UI |
| `src/components/LocalWhisperModelPanel.tsx` | — | Real local Whisper model picker |
| `src/components/ui/KeyRecorder.tsx` | 108 | Shortcut capture widget |
| `src/hooks/useShortcuts.ts` | 274 | Shortcut state + accelerator mapping |
| `src/components/settings/Sidebar.tsx` | 49 | **Legacy/unused** 4-tab sidebar (SettingsOverlay renders its own inline sidebar) |
| `src/components/settings/ModesSettings.tsx` | 11 | Re-export stub for private `premium/` implementation |

### 1.3 IPC and preload surface

- Main-process IPC registration: `electron/ipcHandlers.ts` (4701 lines) + `electron/main.ts` (4789 lines).
- Preload bridge: `electron/preload.ts` (~87 KB), a single `electronAPI` object plus a parallel TypeScript interface.
- Settings-related channels discovered: **45+** (`get-/set-` prefix family, `theme:*`, `keybinds:*`, `knowledge-base:*`, `phone-mirror:*`, `audio/test`, `stt-*`).

---

## 2. Complete Settings Inventory

### 2.1 Tabs actually rendered

From `src/components/SettingsOverlay.tsx:829-842`:

| # | Tab id | Label | Icon | Rendered at |
|---|---|---|---|---|
| 1 | `general` | General | Monitor | `:869-1214` |
| 2 | `natively-api` | Natively API | logo | `:1222` |
| 3 | `natively-pro` | Natively Pro | logo | `:1223` |
| 4 | `ai-providers` | AI Providers | FlaskConical | `:1216-1220` |
| 5 | `calendar` | Calendar | Calendar | `:1226-1300` |
| 6 | `knowledge` | Knowledge Base | CheckCircle | `:1224` |
| 7 | `audio` | Audio | Mic | `:1321-1604` |
| 8 | `keybinds` | Keybinds | Keyboard | `:1302-1318` |
| 9 | `code-execution` | Code Execution | Terminal | `:1607` |
| 10 | `phone-mirror` | Phone Mirror | Smartphone | `:1608` |
| 11 | `help` | Setup & Help | HelpCircle | `:1609` |
| 12 | `about` | About | Info | `:1610` |

> The requested tabs "Speech-to-Text", "Answer Generation", "Text-to-Speech", "Meeting/Transcript", "Hotkeys", "Appearance" are **not separate tabs**. They are folded into General / Audio / Keybinds, or (TTS) do not exist at all. See §7.

### 2.2 General tab controls

| Control | Type | Handler → channel | Evidence |
|---|---|---|---|
| Undetectable / Detectable | toggle | `setUndetectable` | `:884-891` |
| Mouse Passthrough | toggle | `setOverlayMousePassthrough` | `:905-911` |
| Open Natively on Login | toggle | `setOpenAtLogin` | `:944-949` |
| Verbose Debug Logging | toggle + toast | `setVerboseLogging` | `:970-981` |
| Interviewer Transcript | toggle | `localStorage['natively_interviewer_transcript']` | `:1005-1011` |
| Theme | dropdown (system/light/dark) | `setThemeMode` | `:1034-1058` |
| Meeting Interface Style | dropdown (Classic/Liquid Glass) | `setMeetingInterfaceTheme` (localStorage) | `:1087-1118` |
| Disguise Mode | select (none/terminal/settings/activity) | `setDisguise` | `:1125-1148` |
| Screen Understanding | select (vision_first/vision_only/private_vision) | `setScreenUnderstandingMode` | `:1151-1168` |
| Prefer direct vision for technical interviews | checkbox | `setTechnicalInterviewVisionFirst` | `:1169-1181` |
| Meeting Data Retention | select (forever/7d/30d/never) | `setMeetingRetention` | `:1186-1201` |
| Automatically scroll to latest answer | checkbox | `localStorage['natively_auto_scroll']` | `:1205-1213` |
| Provider Data Scopes (6) | checkboxes | `setProviderDataScopes` | `:1222-1263` |
| Interface Opacity | range 0.35–1.0 | `setOverlayOpacity` + localStorage | `:1190-1212` |

### 2.3 Audio tab controls

| Control | Type | Handler → channel | Evidence |
|---|---|---|---|
| Only Interviewer Mode | toggle | `setOnlyInterviewerMode` | `:1329-1337` |
| Noise Cancellation | toggle | `setNoiseCancellationEnabled` | `:1339-1347` |
| Mock Interview Mode | toggle | `setMockInterviewMode` | `:1349-1357` |
| Speech Recognition Language (group) | select | local state only, derives variant list | `:1378-1384` |
| Speech Recognition Language (variant) | select | `setRecognitionLanguage` | `:1385-1396` |
| AI Response Language | select | `setAiResponseLanguage` | `:1405-1416` |
| Speech Provider | `ProviderSelect` (12 entries) | `setSttProvider` | `:1430-1455` |
| Provider API key + Save/Remove/Test | password input + buttons | `testSttConnection` then setter | `:1458-1500` |
| OpenAI-compatible STT Base URL | url input + Save | `setOpenAiSttBaseUrl` | `:1481-1504` |
| Local Whisper model panel | panel | `LocalWhisperModelPanel` | `:1508` |
| Custom STT (endpoint + key + Save) | 2 inputs | `setCustomSttConfig` (missing in preload) | `:1511-1529` |
| Input Device | custom select | localStorage only | `:1537-1547` |
| Mic level meter | bar | `startAudioTest` / `onAudioTestLevel` | `:1548-1551`, `:555-574` |
| Output Device | custom select | localStorage only | `:1552-1562` |
| Speech Pipeline Diagnostics | read-only table | `getSttPipelineDiagnostics` (2 s poll) | `:1565-1595`, `:578-588` |
| "Speech-to-Text (STT) Settings" panel (engine mode, model size, custom model path, endpoint) | full panel | **localStorage only** | `:1603` + `WhisperSettings.tsx:89-101` |

### 2.4 AI Providers tab controls

| Control | Type | Handler → channel | Evidence |
|---|---|---|---|
| Default Model for Chat | model dropdown | `setDefaultModel` | `AIProvidersSettings.tsx:400-470` |
| Fast Response Mode | toggle | `setGroqFastTextMode` + localStorage mirror | `:487-527` |
| Gemini / Groq / OpenAI / Claude cards | key input, Save, Remove, Test, preferred model | `set*ApiKey`, `testLlmConnection`, `setProviderPreferredModel` | `:600-676`, `ProviderCard.tsx:99-135` |
| Codex CLI enable / path / timeout / normal model / fast model / Test | inputs + toggle | `setCodexCliConfig`, `testCodexCli` | `:700-800` |
| Ollama detection / refresh / auto-fix / model list | buttons | `ensureOllamaRunning`, `getAvailableOllamaModels`, `forceRestartOllama` | `:230-300`, `:802-860` |
| Custom Providers (cURL) list/add/edit/delete | form | `saveCustomProvider`, `getCustomProviders`, `deleteCustomProvider` | `:862-1040` |

### 2.5 Remaining tabs

| Tab | Controls | Backend |
|---|---|---|
| Natively API | key save/clear, plan usage, trial modal | `setNativelyApiKey`, `getNativelyUsage` |
| Natively Pro | account/plan | premium module |
| Calendar | Connect / Disconnect / Refresh / event list | `calendarConnect`, `calendarDisconnect`, `calendarRefresh`, `getUpcomingEvents` |
| Knowledge Base | enable toggle, threshold slider, drag/drop upload, file list, remove, clear all, advanced info | `knowledge-base:*` |
| Keybinds | one `KeyRecorder` per entry in `shortcuts` + Restore Defaults | `getKeybinds`, `setKeybind`, `resetKeybinds` |
| Code Execution | Judge0 base URL/token/enabled, custom engines, Test | `getExecutionEngines`, `setExecutionEngines`, `testExecutionEngine` |
| Phone Mirror | enable, LAN exposure, rotate token, QR, disable | `phoneMirror*` |
| Setup & Help | static instructions + `openExternal` links | `openExternal` only |
| About | version/build info | static |

---

## 3. Setting-to-Runtime Wiring Matrix

Legend — **Works?**: `OK` = code path complete; `Partial` = some consumers wired but a defect exists; `UI-only` = persisted or held but never consumed; `Broken` = intended path is unreachable; `Absent` = no implementation.

| Setting | UI location | Default | Persistence location | Runtime consumer | Works? | Evidence |
|---|---|---|---|---|---|---|
| Undetectable | General | `true` (seeded on first boot) | `settings.json:isUndetectable` | `WindowHelper.setContentProtection` on all windows | OK | `main.ts:341-349`, `4033-4057` |
| Mouse passthrough | General | `false` | in-memory `AppState` | window interaction policy | Partial (not persisted across restart) | `ipcHandlers.ts:703-715`, `main.ts` toggle |
| Open at login | General | OS value | OS login items | `app.setLoginItemSettings` | OK | `ipcHandlers.ts:721-734` |
| Verbose logging | General | `false` | `settings.json:verboseLogging` | `setVerboseLoggingFlag`, pipeline logs | OK | `main.ts:352-353`, `ipcHandlers.ts:735-743` |
| Interviewer transcript | General | `true` | `localStorage` | NativelyInterface render gate | OK (renderer-only) | `SettingsOverlay.tsx:1005-1011` |
| Theme | General | `system` | `theme-config.json` | `nativeTheme`, `data-theme` attribute | OK | `ThemeManager.ts:60-96`, `ipcHandlers.ts:3324-3340` |
| Meeting Interface Style | General | `default` | `localStorage` | overlay appearance | OK (renderer-only) | `src/lib/meetingInterfaceTheme.ts` |
| Disguise mode | General | `none` | `settings.json:disguiseMode` | window title/identity | OK | `main.ts:350`, `4370` |
| Screen Understanding mode | General | `vision_first` | `settings.json` | `ScreenUnderstandingService.understand` | OK | `ipcHandlers.ts:785-800`, `2894-2900`, `ScreenUnderstandingService.ts:136` |
| Technical interview vision-first | General | `true` | `settings.json` | `ScreenUnderstandingService` branch | OK | `ScreenUnderstandingService.ts:276` |
| Meeting retention | General | `forever` | `settings.json` | `MeetingPersistence`, `IntelligenceManager` | OK | `MeetingPersistence.ts:46`, `IntelligenceManager.ts:241` |
| Auto-scroll | General | `false` | `localStorage` | answer list scroll | OK (renderer-only) | `SettingsOverlay.tsx:1205-1213` |
| Provider data scopes (6) | General | all `true` (`!== false`) | `settings.json` | LLM outbound filter, RAG, KB search, persistence | OK | `LLMHelper.ts:101-120`, `ProviderRouter.ts:22-27`, `ipcHandlers.ts:41-46` |
| Interface opacity | General | theme default | `localStorage` | overlay CSS variable | Partial (main does not persist) | `ipcHandlers.ts:3948-3957`, `SettingsOverlay.tsx:1198-1212`, `App.tsx:348-357` |
| Only Interviewer Mode | Audio | `false` | `settings.json` | mic chunk gate before STT | OK (single flag) | `main.ts:355`, `1721-1724` |
| Noise Cancellation | Audio | `false` | `settings.json` | JS suppressor + native DSP atomic | OK | `main.ts:356-361`, `3434-3460` |
| Mock Interview Mode | Audio | `false` | `settings.json` | mic → interviewer STT, system audio skipped | Partial (rate + speech-ended misrouted) | `main.ts:362`, `1712-1737`, `2906-2915` |
| Recognition language | Audio | `english-us` | `credentials.enc:sttLanguage` | `stt.setRecognitionLanguage` | Partial (Sherpa no-op, `auto` coerced) | `main.ts:3388-3401`, `SherpaSTT.ts:89-90` |
| AI response language | Audio | `auto` | `credentials.enc` | `LLMHelper` prompt language | OK | `ipcHandlers.ts:124-143`, `LLMHelper.ts:363-365` |
| STT provider | Audio | `sherpa` in UI; `none` in store | `credentials.enc:sttProvider` | `createSTTProvider` | Partial (self-heal + stale diagnostics) | `main.ts:1107-1250`, `CredentialsManager.ts:119-131` |
| STT provider keys | Audio | empty | `credentials.enc` | `createSTTProvider` | OK (masked-preview caveat) | `main.ts:1134-1209` |
| OpenAI STT base URL | Audio | `api.openai.com` | `credentials.enc` | `OpenAIStreamingSTT` | OK (reconfigures live) | `main.ts:1170-1181`, `ipcHandlers.ts:1792-1807` |
| Custom STT endpoint/model/payload/header | Audio | empty | `credentials.enc` | `RestSTT('custom-stt')` | **Broken** (preload method absent; UI incomplete) | `SettingsOverlay.tsx:767-792`, `preload.ts` (0 matches), `ipcHandlers.ts:1719` |
| Local Whisper model | Audio | `Xenova/whisper-tiny.en` | `settings.json:localWhisperModel` | `LocalWhisperSTT` | OK (separate panel) | `main.ts:1224-1242` |
| "STT Settings" (engine mode / model size / custom path / endpoint) | Audio (bottom) | `base.en` | `localStorage['natively_whisper_config']` | **none** | **UI-only** | `WhisperSettings.tsx:89-101` (no other reader) |
| Input device | Audio | OS default | `localStorage['preferredInputDeviceId']` | `reconfigureAudio` / `MicrophoneCapture` | OK | `SettingsOverlay.tsx:1537-1547` |
| Output device | Audio | OS default | `localStorage['preferredOutputDeviceId']` | `SystemAudioCapture` | OK | `SettingsOverlay.tsx:1552-1562` |
| Default model | AI Providers | `gemini-3.1-flash-lite-preview` | `credentials.enc:defaultModel` | `LLMHelper.setModel` | OK | `ipcHandlers.ts:2571-2600`, `LLMHelper.ts:431-470` |
| Fast Response Mode | AI Providers | `false` | `settings.json:groqFastTextMode` **and** `localStorage` | `LLMHelper.setGroqFastTextMode` | Partial (two sources of truth) | `ipcHandlers.ts:2404-2431`, `main.ts:651-654`, `AIProvidersSettings.tsx:305` |
| Provider API keys | AI Providers | empty | `credentials.enc` | per-provider SDK clients | OK | `ipcHandlers.ts:1004-1092` |
| Preferred model per provider | AI Providers | none | `credentials.enc:*PreferredModel` | shown in default-model list | OK | `ProviderCard.tsx:131-134`, `CredentialsManager.ts:426-436` |
| Codex CLI (enable/path/model/fast/timeout) | AI Providers | disabled | `settings.json:codexCli*` | `CodexCliService` in `LLMHelper` | OK | `ipcHandlers.ts:2433-2488`, `main.ts:655-662` |
| Ollama models | AI Providers | none | none (discovered live) | `setModel('ollama-…')` | OK | `LLMHelper.ts:440-447` |
| Custom cURL providers | AI Providers | empty | `credentials.enc:customProviders` | `LLMHelper.setModel` custom branch | OK | `CredentialsManager.ts:438-456` |
| Knowledge Base enabled + threshold | Knowledge Base | `false` / `0.8` | `knowledge-base/index.json` | `KnowledgeBaseService.search` → prompt injection | **Broken at UI** (props are placeholders) | `App.tsx:551-568`, `KnowledgeBaseTab.tsx:36-58` |
| Knowledge Base files | Knowledge Base | empty | `knowledge-base/index.json` | search chunks | **Broken at UI** (list never refreshes) | same |
| Keybinds | Keybinds | `DEFAULT_KEYBINDS` | `keybinds.json` | `globalShortcut` | Partial (phantom rows) | `KeybindManager.ts:10-49`, `useShortcuts.ts:31-72` |
| Code execution engines | Code Execution | Judge0 localhost:2358 | `settings.json:executionEngines` | **none** | **UI-only** | `ipcHandlers.ts:2490-2537`; `new CodeExecutor()` at `4560` |
| Phone mirror | Phone Mirror | disabled | `settings.json:phoneMirror*` | `PhoneMirrorService` | OK (not runtime-verified) | `PhoneMirrorSettings.tsx:26-73`, `main.ts:4573-4579` |
| Calendar | Calendar | disconnected | Google OAuth token store | `CalendarManager` | OK (not runtime-verified) | `SettingsOverlay.tsx:1226-1300` |

---

## 4. Feature Functionality Matrix

| Feature | UI exists | Backend exists | Runtime connected | Persistence works | Status | Evidence |
|---|---|---|---|---|---|---|
| Settings shell + 12 tabs | Yes | n/a | Yes | n/a | Working (static) | `SettingsOverlay.tsx:818-1610` |
| AI provider key CRUD + test | Yes | Yes | Yes | Yes | Working | `ipcHandlers.ts:1004-1092`, `2321-2402` |
| Default model selection | Yes | Yes | Yes | Yes | Working | `ipcHandlers.ts:2571-2600` |
| Custom cURL provider | Yes | Yes | Yes | Yes | Working | `CredentialsManager.ts:438-470` |
| Ollama discovery / auto-fix | Yes | Yes | Yes | n/a | Working (not runtime-verified) | `ipcHandlers.ts:927-1000` |
| Codex CLI | Yes | Yes | Yes | Yes | Working (not runtime-verified) | `CodexCliService`, `LLMHelper.ts:352-360` |
| STT provider selection | Yes | Yes | Yes | Yes | Partial — resets/overrides possible | `main.ts:1107-1250` |
| STT cloud key CRUD | Yes | Yes | Yes | Yes | Partial — masked value round-trip | `ipcHandlers.ts:1636-1643` |
| Custom STT | Yes | Yes | **No** | No | Broken | `preload.ts` missing `setCustomSttConfig` |
| Local Whisper model panel | Yes | Yes | Yes | Yes | Working | `main.ts:1224-1242` |
| Legacy "STT Settings" panel | Yes | No | No | localStorage only | UI-only | `WhisperSettings.tsx` |
| Speech recognition language | Yes | Yes | Partial | Yes | Partial — Sherpa/`auto` ignore it | `SherpaSTT.ts:89-90`, `main.ts:3394` |
| AI response language | Yes | Yes | Yes | Yes | Working | `ipcHandlers.ts:124-143` |
| Audio device selection | Yes | Yes | Yes | Yes (localStorage) | Working | `ipcHandlers.ts:2649-2666` |
| Only Interviewer Mode | Yes | Yes | Yes | Yes | Working | `main.ts:1721-1724` |
| Mock Interview Mode | Yes | Yes | Partial | Yes | Partial — audio routing defects | `main.ts:1712-1737` |
| Noise cancellation | Yes | Yes | Yes | Yes | Working | `main.ts:3434-3460` |
| Automatic answer generation | **No settings control** | Yes | Yes (always on during session) | n/a | Partial — always-on, no toggle | `IntelligenceEngine.ts:204-260`, `410` |
| Manual answer generation | Yes (overlay input) | Yes | Yes | n/a | Working (via `gemini-chat-stream`) | `NativelyInterface.tsx:881-923` |
| `submit-manual-question` IPC | No | Yes | **No** | n/a | Unused backend path | `ipcHandlers.ts:3168-3177`; only declared in preload |
| Screenshot capture | Yes | Yes | Yes | n/a | Working (not runtime-verified) | `ipcHandlers.ts:214-262` |
| Selective screenshot | Yes | Yes | Yes | n/a | Working (not runtime-verified) | `ipcHandlers.ts:250-262` |
| Vision / screenshot answering | Yes | Yes | Yes | n/a | Working | `ipcHandlers.ts:2829-2905` |
| Knowledge Base backend | Yes | Yes | Yes | Yes | Working | `KnowledgeBaseService.ts` |
| Knowledge Base UI state | Yes | Yes | **No** | Backend yes, UI no | Broken (placeholder props) | `App.tsx:551-568` |
| Context injection from KB | n/a | Yes | Yes | n/a | Working — gated by `reference_files` | `ipcHandlers.ts:41-46`, `2938-2952` |
| Keybinds editor | Yes | Yes | Partial | Partial | Partial — phantom entries | `KeybindManager.ts:10-49` |
| `Ctrl+B` overlay toggle | n/a | Yes | Yes (session only) | Yes | Working by design | `KeybindManager.ts:92-96` |
| "Auto Answer" shortcut | Yes (row) | **No** | No | No | Broken (never registered) | `useShortcuts.ts:42`, `KeybindManager.ts:10-49` |
| Screenshot shortcuts (`Ctrl+H`, `Ctrl+Shift+H`) | n/a | Yes | Yes | Yes | Working | `KeybindManager.ts:17-18`, `main.ts:485-505` |
| Home / "go home" shortcut | **No** | No | No | No | Absent | no `Home` accelerator anywhere |
| Stop meeting | Yes (launcher/overlay) | Yes | Yes | n/a | Working | `NativelyInterface.tsx:1518`, `ipcHandlers.ts:2715-2735` |
| Text-to-Speech | **No tab/control** | **No** | No | No | Absent | no TTS code paths found |
| Calendar integration | Yes | Yes | Yes | OAuth | Working (not runtime-verified) | `ipcHandlers.ts:3358-3412` |
| Phone Mirror | Yes | Yes | Yes | Yes | Working (not runtime-verified) | `PhoneMirrorSettings.tsx` |
| Code execution engines | Yes | Store only | **No** | Yes (store) | UI-only | `ipcHandlers.ts:2490-2537` |
| Meeting history / transcripts | Yes (launcher) | Yes (SQLite) | Yes | Yes | Working | `DatabaseManager`, `ipcHandlers.ts:2736-2750` |
| Copy answer / clipboard | Yes (overlay) | renderer | Yes | n/a | Working | `NativelyInterface` action handlers |
| Theme switching | Yes | Yes | Yes | Yes | Working | `ThemeManager.ts` |
| Overlay opacity | Yes | Partial | Yes | localStorage | Partial | `ipcHandlers.ts:3948-3957` |
| Undetectable / content protection | Yes | Yes | Yes | Yes | Working | `main.ts:4033-4057` |
| Disguise mode | Yes | Yes | Yes | Yes | Working | `main.ts:350`, `4370` |
| Meeting retention | Yes | Yes | Yes | Yes | Working | `MeetingPersistence.ts:46` |
| Provider data scopes | Yes | Yes | Yes | Yes | Working | `LLMHelper.ts:101-120` |

---

## 5. Confirmed Bugs

Only defects with direct code evidence. Each is reproducible by reading the cited lines.

### C-1 — Knowledge Base tab is bound to hardcoded placeholder state (P1)

`src/App.tsx:551-568` renders:

```tsx
<SettingsOverlay
  onSettingsChange={async (settings) => {
    // Placeholder: will be integrated with actual settings logic
    console.log('Settings changed:', settings);
  }}
  currentSettings={{ enabled: false, confidenceThreshold: 0.75, files: [] }}
/>
```

`KnowledgeBaseTab` is fully controlled: it loads real settings from IPC and then calls `onSettingsChange(...)` (`KnowledgeBaseTab.tsx:38-47`), but that callback is the placeholder above. Consequently:

- the enable toggle never changes visually (`handleToggleEnabled` at `:151-155` sets parent state that is discarded);
- the threshold slider is pinned at `0.75`, while the service default is `0.8` and the value actually used by `search()` comes from `knowledge-base/index.json`;
- uploaded files never appear (`onSettingsChange({files: ...})` discarded), so the list, counts and "Clear All" remain empty.

Backend is intact: `knowledge-base:*` handlers at `ipcHandlers.ts:4679-4700`.

### C-2 — Custom STT "Save" is a silent no-op (P1)

`SettingsOverlay.tsx:770` calls `window.electronAPI?.setCustomSttConfig?.(...)`. `electron/preload.ts` contains **zero** occurrences of `setCustomSttConfig` or `custom-stt` (verified by exhaustive grep). Because the call uses optional chaining, the button appears to work and produces no error. The IPC handler exists (`ipcHandlers.ts:1719-1745`) but is unreachable from the renderer.

Also incomplete: the panel renders only Endpoint and API Key (`:1511-1529`) although `customSttModel`, `customSttPayloadType`, `customSttResponsePath`, `customSttApiKeyHeader` are loaded (`:487-495`) and sent by the handler.

### C-3 — "Speech-to-Text (STT) Settings" panel has no runtime effect (P2)

`WhisperSettings.tsx:89-101` reads/writes `localStorage['natively_whisper_config']`. An exhaustive grep shows **only `WhisperSettings.tsx` itself** reads that key. The local engine actually selected at runtime uses `SettingsManager.get('localWhisperModel')` (`main.ts:1230-1236`), which is written by `LocalWhisperModelPanel`, a different component.

Additionally, its "Download Model" button downloads **whisper.cpp GGML** presets via `whisper-node` (`ipcHandlers.ts:4568-4589`), while the active local-whisper runtime is `@huggingface/transformers` ONNX (`LocalWhisperSTT.ts:135`, default `Xenova/whisper-tiny.en`). The downloaded artifacts are for a different engine.

### C-4 — Mock Interview Mode misroutes sample-rate and speech-ended events (P1)

In `main.ts:1712-1717`, mic audio is correctly diverted to the interviewer STT:

```ts
if (this._mockInterviewMode) {
  this.googleSTT?.write(processedChunk);
  return;
}
```

But the same handler's sibling events ignore the mode:

- `sample_rate_changed` → `this.googleSTT_User?.setSampleRate(rate)` (`:1729-1732`)
- `speech_ended` → `this.googleSTT_User?.notifySpeechEnded?.()` gated only on `!onlyInterviewerMode` (`:1734-1737`)

So in Mock mode the interviewer STT receives audio at the wrong assumed rate and never receives end-of-utterance, while the idle user STT receives both. Expect duplicated/garbled finals and delayed VAD closes.

### C-5 — Only Interviewer Mode and Mock Interview Mode can both be persisted `true` (P1)

`main.ts:3406-3432`:

```ts
public setOnlyInterviewerMode(enabled) {
  this._onlyInterviewerMode = enabled;
  if (enabled) this._mockInterviewMode = false;   // memory only
}
public setMockInterviewMode(enabled) {
  this._mockInterviewMode = enabled;
  if (enabled) this._onlyInterviewerMode = false; // memory only
}
```

Neither setter calls `SettingsManager.set` for the flag it just cleared. `SettingsManager` therefore still holds the previous value, and the constructor (`:355`, `:362`) restores **both** on next launch. With both true, `wireMicCapture` takes the mock branch (mic → interviewer) while the rest of the pipeline still treats `onlyInterviewerMode` as authoritative.

### C-6 — Audio diagnostics report a stale STT provider (P2)

`reconfigureSttProvider()` (`main.ts:2272-2340`) destroys and recreates providers and broadcasts `stt-config-changed`, but never assigns `this.sttProvider`. `getAudioPipelineDiagnostics()` returns `this.sttProvider` (`:744`), and the Audio tab renders it as "STT provider" (`SettingsOverlay.tsx:1571`). Changing provider while no meeting is active therefore shows the old provider until the next meeting start.

### C-7 — Selecting STT provider "none" is silently overridden when a Natively key exists (P2)

`CredentialsManager.getSttProvider()` (`:119-131`) self-heals `'none'` → `'natively'` whenever `nativelyApiKey` is set, and rewrites `credentials.enc`. The Audio tab offers no "none" option in its list, but `setSttProvider('none')` is a valid IPC value and `createSTTProvider` explicitly supports it (`main.ts:1113-1116`). A user cannot persist "no STT" while a Natively key exists.

### C-8 — Saving the Natively API key silently rewrites STT provider and default model (P2)

Two independent paths do this:

1. `CredentialsManager.setNativelyApiKey` (`:395-412`) promotes `defaultModel` and promotes `sttProvider` when it is `none` **or `google`**.
2. `NativelyApiSettings.handleSave` (`:298-302`) additionally calls `setDefaultModel('natively')` and `setSttProvider('natively')` unconditionally.

Path 2 overrides an explicit user choice made in Audio (e.g. Deepgram) and in AI Providers (e.g. Claude). No confirmation is shown.

### C-9 — Hindi and Marathi are not selectable anywhere (P1 requirement gap)

`electron/config/languages.ts`:

- `RECOGNITION_LANGUAGES` (`:55-75`): English variants, Indonesian, Russian, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, Turkish, Ukrainian. **No Hindi, no Marathi.**
- `AI_RESPONSE_LANGUAGES` (`:77-93`): same omission.

The approved requirement (English / Hindi / Marathi manual selection) is unimplemented at the data layer, not merely in the UI.

### C-10 — Sherpa ignores the selected recognition language (P1)

`electron/audio/SherpaSTT.ts:89-90`:

```ts
setRecognitionLanguage(_language: string): void {
  // Whisper multilingual runs with language: '' (auto-detect).
}
```

`AppState.setRecognitionLanguage` calls it (`main.ts:3399-3400`) for the primary local engine. The parameter is discarded.

### C-11 — "Auto Detect" is coerced to en-US for every provider except Natively (P1)

`main.ts:3394-3395`:

```ts
const effectiveKey = (key === 'auto' && sttProvider !== 'natively') ? 'english-us' : key;
```

Choosing "Auto Detect" therefore forces en-US for Sherpa, Google, Groq, OpenAI, Deepgram, ElevenLabs, Azure, IBM, Soniox and custom STT — even where the underlying model supports auto-detection.

### C-12 — The automatic-answer shortcut is registered in the UI but never exists in the keybind system (P1)

- `useShortcuts.ts:42` and `:72` define `autoAnswerMode: [mod, 'f']`.
- `KeybindManager.DEFAULT_KEYBINDS` (`:10-49`) contains **no** `chat:auto-answer-mode` entry.
- `main.ts` `onShortcutTriggered` (`:452-620`) contains **no** branch for it.
- The Keybinds tab renders every key in `shortcuts` (`SettingsOverlay.tsx:1306-1314`), so the row is visible.
- `updateShortcut` maps it to `chat:auto-answer-mode` (`useShortcuts.ts:200`), and `KeybindManager.setKeybind` returns early for unknown ids (`:238`).

Result: the row is editable, never registered, never persisted.

### C-13 — `shorten` and `recap` keybind rows are dead (P2)

`ShortcutConfig` declares `shorten` and `recap` (`useShortcuts.ts:12-13`), defaulted to `[]` (`:45-46`). `DEFAULT_KEYBINDS` no longer contains them, and `KeybindManager.load()` migrates persisted `chat:recap` → `chat:dynamicAction4` (`:150-157`). `updateShortcut` still maps to `chat:shorten` / `chat:recap` (`:203-204`), which `setKeybind` rejects. The UI renders both rows as empty and unsettable.

### C-14 — "Code Execution" engines never reach the executor (P2)

`get/set-execution-engines` persist into `settings.json` (`ipcHandlers.ts:2490-2537`). The only production construction of the executor is:

```ts
const executor = new CodeExecutor();   // ipcHandlers.ts:4560
```

`LiveInterviewService` passes `config?.engineConfig` from its own constructor argument (`LiveInterviewService.ts:91`), not from `SettingsManager`. No code reads `settings.get('executionEngines')` outside the two IPC handlers (verified by grep). The tab is write-only.

### C-15 — Azure / IBM Watson key saves neither rebroadcast nor reconfigure (P2)

Compare `set-azure-api-key` (`ipcHandlers.ts:1852-1861`) and `set-ibmwatson-api-key` (`:1878-1887`) — no `BrowserWindow…send('credentials-changed')` and no `appState.reconfigureSttProvider()` — with `set-deepgram-api-key` (`:1809-1821`), `set-elevenlabs-api-key` (`:1838-1850`) and `set-soniox-api-key` (`:1889-1901`), which do both. Saving an Azure key mid-session has no effect until the provider is reselected or the app restarts.

### C-16 — Azure / IBM regions and several Custom STT fields have no UI (P2)

`sttAzureRegion` is loaded and only ever passed to `testSttConnection` (`SettingsOverlay.tsx:685`); there is no region input and `setAzureRegion` is never called from the renderer. Same for IBM region. `customSttModel`, `customSttPayloadType`, `customSttResponsePath`, `customSttApiKeyHeader` are loaded but have no controls.

### C-17 — Google Cloud STT has no credential picker (P2)

`_safeGoogleSTT` requires `process.env.GOOGLE_APPLICATION_CREDENTIALS` (`main.ts:1097-1104`). `googleServiceAccountPath` is loaded from credentials and shown as a "Saved" badge (`SettingsOverlay.tsx:455`, `:1436`), but the Audio tab renders no file picker and no IPC call to `updateGoogleCredentials` was found in the renderer. Selecting Google without a pre-set env var silently drops STT (`createSTTProvider` → `null`).

### C-18 — Stored STT keys are re-injected as mask strings and then re-tested (P2)

`get-stored-credentials` returns masks such as `sk-...abcd` (`ipcHandlers.ts:1636-1643`). `SettingsOverlay` stores these into `sttKeys` (`:487-495`). `handleTestSttConnection` (`:738-760`) and `handleSttKeySubmit` (`:674-687`) send that mask to `test-stt-connection`. The provider rejects it, so "Test Connection" fails against a key that is actually valid, and Save aborts with a misleading error.

For Custom STT the handler guards the mask (`ipcHandlers.ts:1726-1729`), but the whole call is unreachable anyway (C-2).

### C-19 — Fast Response Mode has two independent sources of truth (P2)

- `SettingsManager.groqFastTextMode` written by `set-groq-fast-text-mode` (`ipcHandlers.ts:2414-2431`), restored at `main.ts:651-654`.
- `localStorage['natively_groq_fast_text']` written by `AIProvidersSettings.tsx:305` and read as the initial value by `SettingsPopup.tsx:13-15`.

`SettingsPopup` never reconciles with main, so the popup toggle can display a different state from the live `LLMHelper` flag (e.g. after `AIProvidersSettings`' enforcement effect at `:167-176` force-disables fast mode).

### C-20 — Overlay opacity is not persisted by the main process (P3)

`set-overlay-opacity` clamps and broadcasts only (`ipcHandlers.ts:3948-3957`). Persistence happens solely in the renderer on `pointerup` (`SettingsOverlay.tsx:664`). If the pointer is released outside the slider or the window closes mid-drag, the new value is lost. The slider also uses `defaultValue` (`:1205`), so an externally broadcast change does not move the thumb.

### C-21 — `Sidebar.tsx` is dead code with a conflicting tab model (P3)

`src/components/settings/Sidebar.tsx:8` types `activeTab` as `'general' | 'natively-api' | 'ai-providers' | 'about'` and is imported by nothing. `SettingsOverlay` renders its own 12-tab inline sidebar. This is a legacy duplicate that will mislead future maintenance.

---

## 6. Suspected Issues

These need runtime confirmation.

### S-1 — Provider key save may not refresh all engine paths

`set-gemini-api-key` calls `setApiKey`, `resetEngine()` and `initializeLLMs()` (`ipcHandlers.ts:1004-1022`). The Groq/OpenAI/Claude handlers were not traced to the same depth. If they only call `llmHelper.set*ApiKey`, a running IntelligenceEngine stream may keep a stale client until the next request. **Suspected** — needs a live provider swap test.

### S-2 — `set-undetectable` debounce can drop a rapid toggle

`_debouncedSetUndetectable` runs after 300 ms and ignores `false` while `_isInitializing` (`main.ts:4038-4044`). The UI sets its own state optimistically (`SettingsOverlay.tsx:884-891`). A rapid on→off during startup could leave the toggle visually off while the window stays protected. **Suspected.**

### S-3 — `KeybindManager.registerGlobalShortcuts()` calls `globalShortcut.unregisterAll()` on every registration

`:293`. Every `setSessionActive`, `setMode`, `setKeybind` and reset therefore creates a window where **all** shortcuts are unregistered. A keypress in that window is lost. Also, a shortcut owned by another app is silently skipped with only a renderer notice for the specific id. **Suspected** usability issue, not a crash.

### S-4 — `shouldRegister('general:toggle-visibility')` has dead duplicate logic

`:92-96` returns `this.sessionActive`; `:100` (`if (actionId === 'general:toggle-visibility') return true;`) is unreachable because of the earlier return. If the intention was "launcher mode also allows it", that intent is not implemented. **Confirmed dead code**, behavioural impact depends on Module 01 requirements.

### S-5 — `setOpenAtLogin` may not reflect the OS value

The getter reads `app.getLoginItemSettings().openAtLogin` (`ipcHandlers.ts:730-733`) while the setter passes an explicit `path` (`:721-729`). On Windows, `getLoginItemSettings()` only reports the current executable's entry when the same arguments are supplied. **Suspected** mismatch on packaged builds.

### S-6 — `preload.ts` type surface has drifted from the implementation

`preload.ts:77` declares `getStoredCredentials` without many fields the renderer reads (`hasCustomSttKey`, `customStt*`, `hasTavilyKey`, `geminiPreferredModel`, …). All call sites use `any`, so TypeScript cannot catch the missing `setCustomSttConfig` (C-2). **Confirmed drift; impact is type-safety, not runtime by itself.**

### S-7 — `Meeting Interface Style` and `autoScroll` rely on a synthetic `storage` event

`SettingsOverlay.tsx:1010`, `:1211` dispatch `window.dispatchEvent(new Event('storage'))` after writing localStorage. That works within the same window but does not notify other windows (the overlay lives in a different BrowserWindow). If the overlay is a separate window, the change may not apply live. **Suspected.**

### S-8 — Engine pre-warm may construct providers with stale credentials

`prewarmSttProviders()` (`main.ts:1505-1527`) builds both providers at launch. If the user changes provider or key before the first meeting, `reconfigureSttProvider` recreates them only while `isMeetingActive`. Outside a meeting, the null/garbage instance may persist until `setupSystemAudioPipeline` runs at meeting start. **Suspected** — the guards in `setupSystemAudioPipeline` only recreate when the field is null.

### S-9 — `general:toggle-visibility` gating vs. the launcher

Because `shouldRegister` returns `sessionActive` for `general:toggle-visibility`, `Ctrl+B` is inert before a session starts and after it ends. The Settings UI still shows the shortcut as active. This matches the stated Module 01 intent in comments (`KeybindManager.ts:81-85`) but conflicts with a user expectation that the hotkey works on the launcher. **Confirmed behaviour, requirement-dependent.**

---

## 7. Duplicate and Conflicting Configuration

| Setting | Sources of truth | Which one currently controls behaviour | Risk |
|---|---|---|---|
| STT provider | `credentials.enc:sttProvider`; Audio tab state; NativelyApiSettings side-effect; `getSttProvider()` self-heal | `credentials.enc`, mutated by `getSttProvider()` on read and by `setNativelyApiKey` | **High** — two tabs can change it, and `none` is not persistable with a Natively key (C-7, C-8) |
| STT provider selector placement | AI Providers tab; Audio tab | **Audio tab only** — the duplicate selector reported in earlier modules is resolved | Low (good) |
| Default model | `credentials.enc:defaultModel`; NativelyApiSettings side-effect; Codex fast mode override at request time | `credentials.enc`, then `LLMHelper.groqFastTextMode` / Codex fast model wins at call time | Medium |
| Fast Response Mode | `settings.json:groqFastTextMode`; `localStorage['natively_groq_fast_text']`; `LLMHelper` in-memory flag | `LLMHelper` in memory; persisted copy restored at boot | Medium (C-19) |
| Local Whisper model | `settings.json:localWhisperModel` + per-channel overrides; `localStorage['natively_whisper_config'].selectedModel` | `settings.json` | Medium (C-3) |
| Local Whisper engine | `whisper-node` GGML download; `@huggingface/transformers` ONNX runtime | HF Transformers ONNX | Medium — download artifacts unused |
| Knowledge Base enabled | `knowledge-base/index.json:enabled`; `settings.json:knowledgeMode` (premium orchestrator, `ipcHandlers.ts:3697`) | `KnowledgeBaseService.index.enabled` for `search()`; `knowledgeMode` for premium orchestrator | **High** — two independent enable flags, and the UI drives neither (C-1) |
| Knowledge Base threshold | `knowledge-base/index.json` (0.8 default); `App.tsx` hardcoded 0.75 passed to UI | `index.json` | High — UI displays a value that is not the active one |
| Shortcut definitions | `useShortcuts.ShortcutConfig`; `KeybindManager.DEFAULT_KEYBINDS`; `keybinds.json` | `KeybindManager` for registration; `useShortcuts` for display | **High** — phantom rows (C-12, C-13) |
| Theme | `theme-config.json`; `localStorage['natively_resolved_theme']` cache | `ThemeManager`; cache only prevents flash | Low |
| Overlay opacity | `localStorage`; main-process broadcast state | renderer localStorage | Low–Medium (C-20) |
| Meeting retention | `settings.json:meetingRetention` | single source, two consumers | Low |
| Provider data scopes | `settings.json:providerDataScopes` | single source, many consumers | Low |
| Execution engines | `settings.json:executionEngines`; default constant in IPC | none at runtime | Medium (C-14) |
| Custom provider shape | `CustomProvider` (`id,name,curlCommand`) vs `CurlProvider` (`+responsePath`) | `curlProviders` used by `LLMHelper`; `customProviders` used by the Settings UI | Medium — two lists, `responsePath` only on one |
| `Sidebar.tsx` tab taxonomy | Legacy 4 tabs vs actual 12 | SettingsOverlay | Low (dead code) |

---

## 8. Missing or Incomplete Implementations

| # | Missing / incomplete | Impact | Evidence |
|---|---|---|---|
| M-1 | Hindi and Marathi language options | Approved requirement unmet | `languages.ts:55-93` |
| M-2 | Language selection honoured by Sherpa | Primary local engine always auto-detects | `SherpaSTT.ts:89-90` |
| M-3 | `auto` language honoured by non-Natively providers | "Auto Detect" is a lie for 10 providers | `main.ts:3394-3395` |
| M-4 | Any Settings control for automatic vs manual answer generation | Automatic generation is always on; no user control | no such setting in `SettingsOverlay.tsx` |
| M-5 | `chat:auto-answer-mode` registration and handler | Shortcut row exists but can never fire | `useShortcuts.ts:42`; `KeybindManager.ts:10-49`; `main.ts:452-620` |
| M-6 | `setCustomSttConfig` in preload | Custom STT entirely unusable | `preload.ts` grep = 0 |
| M-7 | Custom STT model / payload / response path / header inputs | Features exist in backend, unreachable | `SettingsOverlay.tsx:1511-1529` |
| M-8 | Azure / IBM region inputs | Region stuck at `eastus` / `us-south` | `SettingsOverlay.tsx` (no control) |
| M-9 | Google service-account picker | Google STT cannot be configured in-app | `main.ts:1097-1104` |
| M-10 | Knowledge Base UI state binding | Backend works, UI does not | `App.tsx:551-568` |
| M-11 | Knowledge Base single enable flag | Two flags, ambiguous ownership | `SettingsManager.ts:21`; `KnowledgeBaseService.ts:57-62` |
| M-12 | Execution engine config consumption | Code Execution tab has no effect | `ipcHandlers.ts:4560` |
| M-13 | Text-to-Speech | Feature absent (only marketing copy) | no TTS code paths; `NativelyApiSettings.tsx:529` |
| M-14 | "Home" shortcut | Requested control absent | no `Home` accelerator |
| M-15 | Startup-failure fallback policy (A: error + stop, B: Web Speech + notify) | Partially exists, not user-configurable | `main.ts:1211-1219` (Sherpa → WebSpeech), `:1203-1209` (Rest → WebSpeech) |
| M-16 | Provider-switch recovery for Azure/IBM keys | Silent no-op until restart | `ipcHandlers.ts:1852-1901` |
| M-17 | Legacy engine decommissioning plan | Sherpa + Local Whisper + Web Speech + whisper-node all still present | `main.ts:1211-1242`; `WhisperSettings.tsx` |

### 8.1 Approved fallback behaviour — feasibility

The requirement allows either **(A)** show an error and stop, or **(B)** fall back to Web Speech with a clear notice.

Current implementation is **silently B for some paths, A for others**:

- Sherpa missing model/addon → `WebSpeechSTT` (`main.ts:1211-1219`).
- Cloud provider with no key → `WebSpeechSTT` for groq/azure/ibm/custom (`:1203-1209`); return `null` (no STT) for deepgram/soniox/elevenlabs/openai/natively/google (`:1134-1181`).
- `audio-capture-failed` is broadcast when a provider returns `null` (`:1770-1791`), so A is partially surfaced.
- No single `sttFallbackPolicy` setting exists.

Both behaviours are implementable on this architecture with existing broadcasts (`stt-status`, `audio-capture-failed`, `stt-config-changed`); only a new enum setting and a branch in `createSTTProvider` would be needed. This is a design note, not an implementation performed here.

---

## 9. Cross-Module Dependencies

### 9.1 Module 01 — window/session lifecycle

| Dependency | Effect on Settings |
|---|---|
| `AppState` constructor order | Loads `isUndetectable`, `disguiseMode`, `verboseLogging`, audio modes, fast mode, Codex config (`main.ts:341-362`, `:649-670`). Any Settings value read earlier than this falls back to a default. |
| `SettingsManager` requires `app.whenReady()` | Throws if constructed before ready (`SettingsManager.ts:96-99`). IPC handlers must not run pre-ready. |
| Window mode (launcher ↔ overlay) | `KeybindManager.setMode` re-registers all shortcuts (`:74-79`); `Ctrl+B` is only alive during a session (`:92-96`). |
| Settings window is a separate BrowserWindow | `localStorage`-only settings (theme style, auto-scroll, opacity) do not propagate to the overlay window without the synthetic `storage` event, which does not cross windows. |
| `setContentProtection` | Undetectable toggle must apply to Settings, Model Selector, Cropper and Main windows (`main.ts:4050-4054`); a missing helper leaves a leak. |

### 9.2 Module 02 — audio / STT

| Dependency | Effect |
|---|---|
| `createSTTProvider` reads `credentials.enc` only | Settings persisted anywhere else (localStorage) never reaches STT. |
| `reconfigureSttProvider` only rebuilds when `isMeetingActive` | Provider changes made before a meeting take effect at `setupSystemAudioPipeline`; changes made mid-meeting rebuild captures and STT. |
| `this.sttProvider` cached | Diagnostics and error payloads use the cached value; stale after a no-meeting change (C-6). |
| Mock/OnlyInterviewer flags | Mutually exclusive in memory only (C-5). |
| Sample-rate contract | `setSampleRate` is pushed on first chunk (`:1700-1707`, `:1656-1662`); mock mode breaks the pairing (C-4). |
| Sherpa service | `sherpaAutoService.getDiagnostics()` powers the Audio diagnostics table (`ipcHandlers.ts:317-326`). |

### 9.3 Module 02A — active-provider verification

| Dependency | Effect |
|---|---|
| `LLMHelper.currentModelId` / `useOllama` / `customProvider` | The "active provider" is only knowable from `LLMHelper`; there is no IPC that reports the resolved provider+model to Settings. The UI's "Default Model" is not proof of the model actually used when Fast Mode or Codex fast model overrides it. |
| `get-current-llm-config` | Exists (`ipcHandlers.ts:913`); returns config snapshot. Not consumed by any Settings component (verified). |
| Provider data scopes | Enforced inside `LLMHelper.assertOutboundScopes` (`:119-121`); a provider switch does not re-validate existing scopes. |
| Vision availability | `CredentialsManager.anyVisionProviderConfigured()` gates `vision_only` / `private_vision`; Ollama/Codex local detection reads `ollamaBaseUrl`/`codexCliPath` from credentials, which the Settings UI never writes. |

### 9.4 Module 03 — settings (this module)

Settings is the **only** writer of `settings.json` and the primary writer of `credentials.enc`. Two cross-module hazards follow:

1. Any module that reads a setting before `AppState` finishes constructing gets a default (startup race).
2. Any module that caches a settings-derived value (`this.sttProvider`, `this._onlyInterviewerMode`, `llmHelper.currentModelId`) must be invalidated by the setter; three of them are not.

---

## 10. Recommended Repair Priority

Ordered by severity; no UI redesign is proposed. Each item is a wiring fix, not a redesign.

### P0 — Startup, stability, data loss, security

| ID | Item | Why P0 |
|---|---|---|
| P0-1 | Fix Known C-1 and C-2 root causes only if they cause silent data loss | Custom STT config is silently discarded today; KB settings are silently discarded. No crash, but user-entered configuration is lost without feedback. |
| P0-2 | Ensure `getStoredCredentials` never returns usable-looking mask strings to inputs that can submit them (C-18) | Prevents a user-triggered overwrite/validation failure against a valid key. |

### P1 — Core interview, audio, STT, answer generation

| ID | Item |
|---|---|
| P1-1 | C-4 Mock Interview rate + speech-ended routing |
| P1-2 | C-5 mutual-exclusion persistence |
| P1-3 | C-10 Sherpa language no-op |
| P1-4 | C-11 `auto` coercion |
| P1-5 | C-9 Hindi/Marathi language options |
| P1-6 | C-12 automatic-answer shortcut registration (and the missing auto/manual toggle) |
| P1-7 | C-2/M-6 Custom STT preload method |
| P1-8 | C-1 Knowledge Base UI state binding (blocker for the feature as shipped) |

### P2 — Settings, provider configuration, feature reliability

| ID | Item |
|---|---|
| P2-1 | C-3 dead "STT Settings" panel; align with `LocalWhisperModelPanel` or mark read-only |
| P2-2 | C-6 stale provider in diagnostics |
| P2-3 | C-7 `none` self-heal override |
| P2-4 | C-8 Natively-key side effects on STT/model |
| P2-5 | C-13 dead `shorten`/`recap` rows |
| P2-6 | C-14 execution engines not consumed |
| P2-7 | C-15 Azure/IBM key propagation |
| P2-8 | C-16 missing region/Custom-STT inputs |
| P2-9 | C-17 Google credential picker |
| P2-10 | C-19 fast-mode dual source |
| P2-11 | M-11 single KB enable flag |
| P2-12 | M-15 explicit fallback policy setting |

### P3 — Secondary features, polish, optimization

| ID | Item |
|---|---|
| P3-1 | C-20 opacity persistence |
| P3-2 | C-21 delete `Sidebar.tsx` dead code |
| P3-3 | S-4 dead branch in `shouldRegister` |
| P3-4 | S-3 shortcut unregister gap |
| P3-5 | Remove or archive `.orig`, `.broken-backup`, `electron_backup_safe/`, `clean_build/`, stale `vite.config.mts.timestamp-*` files |
| P3-6 | Align preload TypeScript surface with implementation (S-6) |
| P3-7 | Retire `whisper-node` only after the whisper.cpp download path and `LocalWhisperSTT` backup files are confirmed unused |

> The previously reported duplicate STT provider selector is **resolved** in this codebase: `AIProvidersSettings.tsx` contains no STT provider UI. The residual ownership problem is the Natively-API side effect (C-8), not a duplicated selector.

---

## 11. Evidence Index

### 11.1 Project and build

| Claim | File:line |
|---|---|
| Version 2.6.0, main entry | `package.json:2-5` |
| Electron 45.2.3 / React 19.3.1 / TS 5.9.3 / Vite 5.4.21 | `node_modules/*/package.json` |
| No git repository | `git status` → fatal |
| Vite dev port 5180 | `vite.config.mts:39-41` |
| CSP restricts connect-src to Google/Groq/GA | `index.html:10` |

### 11.2 Settings UI

| Claim | File:line |
|---|---|
| 12 tabs | `SettingsOverlay.tsx:829-842` |
| Settings load on open | `SettingsOverlay.tsx:449-522` |
| IPC event subscriptions | `SettingsOverlay.tsx:494-517` |
| Audio diagnostics poll (2 s) | `SettingsOverlay.tsx:578-588` |
| `$` language loaders | `SettingsOverlay.tsx:608-618` |
| STT provider change | `SettingsOverlay.tsx:664-671` |
| STT key submit (mask round-trip) | `SettingsOverlay.tsx:674-713` |
| STT key test | `SettingsOverlay.tsx:738-760` |
| Custom STT save (missing preload) | `SettingsOverlay.tsx:767-792` |
| Opacity slider | `SettingsOverlay.tsx:1198-1212` |
| Keybind rows render all keys | `SettingsOverlay.tsx:1302-1318` |
| Audio mode toggles | `SettingsOverlay.tsx:1329-1357` |
| Provider list (12) | `SettingsOverlay.tsx:1430-1455` |
| Custom STT panel (2 fields) | `SettingsOverlay.tsx:1511-1529` |
| WhisperSettings mounted | `SettingsOverlay.tsx:1596-1603` |
| Knowledge Base expects props | `KnowledgeBaseTab.tsx:36-58` |
| App passes placeholders | `App.tsx:551-568` |

### 11.3 Persistence

| Claim | File:line |
|---|---|
| `settings.json` path + atomic write | `SettingsManager.ts:96-101`, `179-188` |
| Legacy screen-mode migration | `SettingsManager.ts:161-178` |
| `credentials.enc` + safeStorage | `CredentialsManager.ts:14`, `466-486` |
| `getSttProvider` self-heal | `CredentialsManager.ts:119-131` |
| `setNativelyApiKey` auto-promotion | `CredentialsManager.ts:395-420` |
| Keybinds load/merge/conflict | `KeybindManager.ts:136-196` |
| Keybind save | `KeybindManager.ts:196-210` |
| Theme config | `ThemeManager.ts:19`, `49-58` |

### 11.4 IPC / preload

| Claim | File:line |
|---|---|
| `set-stt-provider` → reconfigure + broadcast | `ipcHandlers.ts:1699-1717` |
| `set-custom-stt-config` (unreachable) | `ipcHandlers.ts:1719-1745` |
| Masked credential payload | `ipcHandlers.ts:1589-1652` |
| Azure / IBM key handlers (no reconfigure) | `ipcHandlers.ts:1852-1901` |
| Fast text mode | `ipcHandlers.ts:2404-2431` |
| Execution engines | `ipcHandlers.ts:2490-2537` |
| Default model | `ipcHandlers.ts:2571-2600` |
| Audio mode handlers | `ipcHandlers.ts:2667-2695` |
| Knowledge base IPC | `ipcHandlers.ts:4679-4700` |
| Overlay opacity (no persist) | `ipcHandlers.ts:3948-3957` |
| `new CodeExecutor()` with no config | `ipcHandlers.ts:4560` |
| Preload STT provider methods | `preload.ts:707-708` |
| Preload audio mode methods | `preload.ts:1105-1110` |
| Preload settings getters | `preload.ts:1390-1415` |
| Preload KB methods | `preload.ts:592-596` |
| **No** `setCustomSttConfig` | `preload.ts` (0 matches) |

### 11.5 Audio / STT

| Claim | File:line |
|---|---|
| Provider construction | `main.ts:1107-1250` |
| `none` → null | `main.ts:1113-1116` |
| Sherpa → Web Speech fallback | `main.ts:1211-1219` |
| Local Whisper model from SettingsManager | `main.ts:1224-1242` |
| Diagnostics snapshot | `main.ts:734-749` |
| Mock mode skips system audio | `main.ts:2906-2915` |
| Mock mic routing | `main.ts:1712-1717` |
| Sample-rate misroute | `main.ts:1729-1732` |
| Speech-ended misroute | `main.ts:1734-1737` |
| Mutual exclusion (memory only) | `main.ts:3406-3432` |
| Language setter + auto coercion | `main.ts:3388-3401` |
| Language detected only for NativelyProSTT | `main.ts:1350-1360` |
| Sherpa language no-op | `SherpaSTT.ts:89-90` |
| Sherpa auto-detect model load | `src/main/services/SherpaAutoService.ts:174-178` |
| Local Whisper uses HF Transformers | `LocalWhisperSTT.ts:135` |
| Language catalogue (no hi/mr) | `languages.ts:55-93` |

### 11.6 Answer generation

| Claim | File:line |
|---|---|
| Auto trigger on final interviewer segment | `IntelligenceEngine.ts:236-260`, `410` |
| Question-signal heuristic | `IntelligenceEngine.ts:204-207` |
| Speculative inference + cooldown | `IntelligenceEngine.ts:210-235` |
| `generate-what-to-say` + vision | `ipcHandlers.ts:2829-2975` |
| KB prompt injection | `ipcHandlers.ts:2938-2952` |
| `submit-manual-question` (unused by renderer) | `ipcHandlers.ts:3168-3177` |
| Overlay manual submit uses chat stream | `NativelyInterface.tsx:881-923` |
| `generateWhatToSay` used by overlay actions | `NativelyInterface.tsx:787` |
| Fast-mode / Codex overrides | `LLMHelper.ts:431-470`, `496-511` |

### 11.7 Knowledge Base

| Claim | File:line |
|---|---|
| Index defaults (enabled false, 0.8) | `KnowledgeBaseService.ts:57-62` |
| Accepted extensions / limits | `KnowledgeBaseService.ts:44-50` |
| `updateSettings` clamp 0.5–0.95 | `KnowledgeBaseService.ts:84-104` |
| `search` early-returns when disabled | `KnowledgeBaseService.ts:232-236` |
| Token-overlap confidence | `KnowledgeBaseService.ts:240-262` |
| `reference_files` scope gate | `ipcHandlers.ts:41-46` |
| Two enable flags | `SettingsManager.ts:21`, `ipcHandlers.ts:3697`, `KnowledgeBaseService.ts:57-62` |

### 11.8 Shortcuts

| Claim | File:line |
|---|---|
| Backend defaults (no auto-answer/recap/shorten) | `KeybindManager.ts:10-49` |
| Registration gate | `KeybindManager.ts:88-110` |
| `unregisterAll` on every re-register | `KeybindManager.ts:293` |
| Health check + revalidate | `KeybindManager.ts:318-390` |
| Registration-failed event | `KeybindManager.ts:300-310` |
| UI defaults incl. `autoAnswerMode: Ctrl+F` | `useShortcuts.ts:31-72` |
| Frontend→backend mapping | `useShortcuts.ts:186-225` |
| Unknown id rejected | `KeybindManager.ts:236-240` |
| Shortcut dispatch in main | `main.ts:452-620` |
| Recovery/ignore text mismatch on update | `main.ts:576-600` |

### 11.9 Features

| Claim | File:line |
|---|---|
| Screenshot IPC | `ipcHandlers.ts:214-262` |
| Global screenshot shortcut routing | `main.ts:479-505` |
| Screenshot attach in overlay | `NativelyInterface.tsx:1070-1073` |
| Calendar IPC | `ipcHandlers.ts:3358-3412` |
| Phone mirror settings | `PhoneMirrorSettings.tsx:26-73` |
| Phone mirror auto-start | `main.ts:4573-4579` |
| Execution engine UI | `ExecutionEnginesSettings.tsx:38-56` |
| No TTS code paths | grep: 0 `speechSynthesis` / `new Audio(` / `playAudio` |
| TTS marketing copy only | `NativelyApiSettings.tsx:529` |

### 11.10 Dead / legacy artifacts observed

| Artifact | Note |
|---|---|
| `src/components/settings/Sidebar.tsx` | unused 4-tab sidebar |
| `src/components/NativelyInterface.tsx.orig` (112 KB), `.broken-backup` (260 KB) | stale copies |
| `electron/audio/LocalWhisperSTT - Backup.ts`, `- backup2.ts` | duplicate engines |
| `electron/audio/whisper/whisperWorker - Backup*.ts` (3 files) | duplicate workers |
| `electron/LLMHelper.ts.orig` (131 KB) | stale copy |
| `electron/WindowHelper.ts.bak` | stale copy |
| `electron_backup_safe/`, `clean_build/`, `dist/`, `release/` | build/backup trees inside source root |
| ~90 `vite.config.mts.timestamp-*.mjs` files | Vite temp artifacts (17 KB each) |

---

## 12. Answers to the Module 03 Questions

1. **Are all Settings tabs functional?** Ten of twelve are wired to real IPC. The Knowledge Base tab renders but is bound to placeholder props (C-1). The Code Execution tab persists but has no runtime consumer (C-14).
2. **Is every setting consumed?** No. Definitively unconsumed: the entire `WhisperSettings` localStorage config (C-3) and `executionEngines` (C-14). Partially consumed: `meetingInterfaceTheme`, `autoScroll` (same-window only), overlay opacity (renderer-persisted).
3. **Do defaults override saved values?** Yes in three places: `getSttProvider()` self-heal (C-7), `setNativelyApiKey` promotion (C-8), and the `0.75` hardcoded threshold shown by the KB UI while the service uses `0.8` (C-1).
4. **Is the STT selector duplicated?** No longer. `AIProvidersSettings.tsx` has no STT UI. The remaining conflict is the Natively API tab mutating the STT provider (C-8).
5. **Do selected models get used?** Normally yes via `LLMHelper.setModel`. Fast Response Mode and Codex fast model override the selection at request time without any UI indication that the "default model" is bypassed.
6. **Are language choices honoured?** No for Sherpa (C-10); no for `auto` on 10 providers (C-11); Hindi and Marathi are unavailable (C-9).
7. **Does Mock Interview work?** Partially. The mic→interviewer routing exists, but rate/end-of-speech events target the wrong STT instance (C-4), and the flag can conflict with Only Interviewer Mode after restart (C-5).
8. **Is Text-to-Speech present?** No. There is no TTS implementation, tab, or control in this codebase.
9. **Are keyboard shortcuts reliable?** Mostly, with three defects: the auto-answer row is phantom (C-12), `shorten`/`recap` rows are dead (C-13), and every re-registration unregisters all shortcuts first (S-3).
10. **Does the Knowledge Base affect answers?** The backend does (`search()` → prompt injection at `ipcHandlers.ts:2938-2952`, gated by `reference_files`). The UI cannot currently enable it or add files because of C-1.

---

## 13. Explicit Non-Actions

In accordance with the audit brief, none of the following were performed:

- No source file was modified, renamed, moved, or deleted.
- No UI element was redesigned, reordered, or removed.
- No bug was fixed.
- No dependency was installed, removed, or upgraded.
- No configuration file (`settings.json`, `credentials.enc`, `keybinds.json`, `index.json`) was written.
- No application process was started; no runtime verification was claimed.
- Module 04 was not started.

---

**End of report.**
