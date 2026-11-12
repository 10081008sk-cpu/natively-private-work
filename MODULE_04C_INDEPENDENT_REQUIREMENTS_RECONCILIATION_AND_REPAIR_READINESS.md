# MODULE 04C — INDEPENDENT REQUIREMENTS RECONCILIATION & REPAIR READINESS AUDIT

**Mission:** independent, read-only verification of the current Natively source against the **approved** window-lifecycle, shortcut, STT and answer-generation requirements, plus a repair-readiness verdict.
**Target discovered and verified this run:** `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main`
**Date:** 2026-11-12
**Read-only compliance:** no source, configuration, UI, package, lockfile, report or generated application file was created, modified, moved, formatted, rebuilt or deleted inside the project. The application was **never launched**. This report is the only new file.

### Evidence tags

| Tag | Meaning |
|---|---|
| **[S]** | Read directly in the current source at the cited line. |
| **[S-C]** | Deterministic consequence of cited control flow / ordering; not observed at runtime. |
| **[B]** | Verified in the checked-in build output (`dist/`, `dist-electron/`). |
| **[NV]** | Not settleable statically (OS behaviour, focus, timing, real durations). |
| **[R]** | Runtime observation. **No `[R]` evidence exists anywhere in this report.** |

Verdicts used: `CONFIRMED` · `PARTIALLY CONFIRMED` · `NOT CONFIRMED` · `UNVERIFIED` · `REQUIREMENT CONFLICT`.

---

## 1. Executive summary

1. **The lazy-overlay requirement is one line deep.** Exactly one statement in reachable code creates the assistant overlay before Start Natively: `electron/WindowHelper.ts:327` inside `createWindow()`, reached from `electron/main.ts:4520`. **CONFIRMED.**
2. **The approved requirements contradict the current source in four places that Modules 04/04A documented and Module 04B recommended against.** (a) Start must reveal the overlay and hide the launcher — the source deliberately does the opposite (`main.ts:2828–2840`). (b) Ctrl+B must hide/restore the launcher before any session — the chord is not registered pre-session (`KeybindManager.ts:99–101`). (c) Ctrl+B on the overlay must be a pure visibility toggle — the source also switches to the launcher (`main.ts:3638–3646`). (d) Ctrl+B after Home must stay on the launcher — the source reveals the overlay (`main.ts:3649`). Module 04B's C01/C02 recommendations are overridden; the requirements win.
3. **State is not modelled; it is inferred.** Session state (`main.ts:333`) is real and usable. Interface mode (`WindowHelper.ts:68`) exists but the Ctrl+B handler never consults it and teardown never maintains it. Visibility is one stale boolean (`WindowHelper.ts:62`) plus per-window truth. Overlay creation state has no representation beyond a promise field (`WindowHelper.ts:332`) that teardown never clears. Audio/STT state has none. **CONFIRMED.**
4. **New defect, absent from Modules 04/04A/04B:** all 17 answer/intelligence streams are sent to the **mode-dependent** surface (`main.ts:3216`, `:3256–3365`) while only the overlay document subscribes (`NativelyInterface.tsx:1009–1035`). With the launcher current (after Home — and today, after Start), automatic and speculative answers are delivered to a window that has no handler for them and are silently lost. **CONFIRMED.**
5. **Ctrl+1 is gated by the wrong signal.** Registration depends on `activeMode === 'overlay'` (`KeybindManager.ts:102`), which the Hide chip never changes (`WindowHelper.ts:655–666`); dispatch has no gate at all (`main.ts:588–595`); and the handler chain re-reveals the hidden overlay (`NativelyInterface.tsx:763` → `:698`). A second, un-gated owner exists as an in-window keydown (`NativelyInterface.tsx:1179`). **CONFIRMED.**
6. **Lazy overlay creation buys renderer isolation, not transcription speed.** Both documents load the same 1.57 MB app chunk and 1.24 MB vendor chunk (`dist/assets/…`, **[B]**); only `Cropper` is code-split (`App.tsx:47`). What lazy creation actually removes at idle: one `BrowserWindow`, one renderer process, 50 overlay IPC subscriptions, the overlay's share of the `App.tsx` 30 s trial poll, its mount-time `setModel()` broadcast and its window-resize writes. What remains: STT/Whisper prewarm (approved to stay), RAG/Ollama, telemetry, auto-updater, calendar, the 10 s keybind health check, the launcher's own 60 s poll. **No transcription-latency or LLM-speed improvement may be claimed from it.**
7. **Audio/STT is insulated from window lifecycle** — `WindowHelper.ts` contains **zero** references to capture, STT, intelligence or LLM objects (verified by count). Transcription cannot be stopped or duplicated by Home, Ctrl+B or Meeting Ongoing. **CONFIRMED.**
8. **Two Sherpa requirement gaps exist independently of the overlay work:** a failed recognizer init is never retried (`SherpaAutoService.ts:59–65`, `:199–203`), and manual language override is a documented no-op for Sherpa (`SherpaSTT.ts:89–91`) with **no Hindi or Marathi entries in `electron/config/languages.ts:63–78`**. Silent provider fallback contradicts "no silent provider switching" (`main.ts:1207–1209`, `:1219–1222`). **PARTIALLY CONFIRMED / REQUIREMENT CONFLICT.**
9. **Readiness: READY FOR REPAIR PLAN APPROVAL**, conditional on the approval-gating items in §20. All defects are static-confirmed with exact ranges; the residual unknown set is timing, focus delivery and compositor behaviour, which the §19 test plan measures.

---

## 2. Verified project root, package version and installed toolchain

### 2.1 Root discovery (independent, not inherited from Module 04A)

| Check | Result |
|---|---|
| Harness cwd | `C:\Users\Sanket-PC\.deepai-code\scratch\2026-11-12-module-04b-lazy-overlay-lifecycle-6fe6e087` — an empty scratch dir, **not** the project |
| Candidate roots considered | `natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main`; `natively-cluely-ai-assistant-main-extracted\…`; `Natively-Missing-Files`; `Latest complete Natively source`; `Natively Structure to upload` |
| Contains `package.json` + `electron/` + the Module 04-family reports | **only** `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main` |
| Discriminating fingerprint | `electron/main.ts` here = `c3464d94…`; in the `-extracted` tree = `11f26e68…` — different snapshots, so `-extracted` is the pristine ZIP extraction, not the working copy |
| Git metadata | none in either tree (`ls -d .git` → no such file; `git rev-parse --is-inside-work-tree` → `fatal: not a git repository`). No branch/commit/dirty state exists; none invented |

**Active working root:** `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main` — the same root recorded by Modules 04A/04B. **[S]**
All three referenced reports were located **locally in this root** and read there; the GitHub URLs from the brief were **not fetched** (no network was used), so the "missing report ⇒ clean result" trap does not apply. **[S]**

### 2.2 Toolchain

| Item | Declared (`package.json`) | Installed (`node_modules`) | Locked (`package-lock.json` v3) |
|---|---|---|---|
| name / version | `natively` / **2.6.0** | — | root `version` `2.6.0` |
| Electron | `^45.2.3` | **45.2.3** | 45.2.3 |
| React / React DOM | `^19.2.6` | **19.3.1 / 19.3.1** | 19.3.1 / 19.3.1 |
| TypeScript | `^5.6.3` | **5.9.3** | 5.9.3 |
| Vite | `^5.4.21` | **5.4.21** | 5.4.21 |
| `@vitejs/plugin-react` | `^4.7.0` | 4.7.0 | 4.7.0 |
| electron-builder | `^25.1.0` | 25.1.0 | 25.1.0 |
| `electron-vite` | absent | — | — |
| Electron entry (`main`) | `dist-electron/electron/main.js` | — | — |
| Vite config | **`vite.config.mts`** (no `vite.config.ts` exists) | port `5180`, `strictPort: true` (`:35–37`) | — |

Declared ranges differ from installed React/TypeScript, so any statement about "the" version must name which source it means. Scripts of record: `electron:dev`, `app:dev`, `build`, `build:electron`, `typecheck:electron` (`tsc -p electron/tsconfig.json --noEmit`), `test` (`node --test` over `electron/services/__tests__/**/*.test.mjs`, `electron/llm/__tests__/**/*.test.mjs`), `test:e2e` (Playwright). **[S]**

---

## 3. Source fingerprint and SHA-256 evidence

A manifest of **286** entries (every `*.ts`/`*.tsx` under `electron/` and `src/`, excluding `__tests__`, `*.orig`, `*.bak`, plus `package.json`, `package-lock.json`, `index.html`, `vite.config.mts`, `tsconfig.json`, `electron/tsconfig.json`, `scripts/build-electron.js`) was hashed **before** and **after** inspection.

| Artifact | Value |
|---|---|
| Manifest digest **before** | `e2b688c0a6e65b499e590c97e68f127649450d0cdd977be878349868b03d8f0a` (286 entries) |
| Manifest digest **after** | `e2b688c0a6e65b499e590c97e68f127649450d0cdd977be878349868b03d8f0a` (286 entries) |
| `diff -q before after` | **no output — byte-identical. No source file was modified by this audit.** |

Critical files (each also equals the value recorded in Module 04A §A.2 / Module 04B §1.3):

| File | Lines | SHA-256 |
|---|---|---|
| `electron/main.ts` | 4 788 | `c3464d94f08ddb733a19d178ba47cb91600896055c94e00ade1c28dc28d99de8` |
| `electron/WindowHelper.ts` | 887 | `c115c23694071ef9f0447bba68904b84204e6529d73536df2ff7d5d091ac1356` |
| `electron/ipcHandlers.ts` | 4 701 | `260cb234a9747d2f53d09827c11c87b67fb0f60df0b1fbb9042e64f478cdec17` |
| `electron/preload.ts` | 1 537 | `e77b2422daa87ece21c825ba5f98d7fe0e7f2f88988e9076900fb14d20fd7d3a` |
| `electron/services/KeybindManager.ts` | 518 | `f193ff2a7f254145c99171130ec25179a09467a21e32ab2f4208ebcb2297be5b` |
| `electron/IntelligenceManager.ts` | 320 | `930a68f05f759d774cca2e080e34c11306a0f3620286a6682d3d83c63813f7dd` |
| `src/App.tsx` | 815 | `1147a75578762a672a0d2e655f020d51fd92b156227fd0acd158cd37b87db3df` |
| `src/components/Launcher.tsx` | 1 207 | `50cf2c6a766901c0719f8390a455ce4058a84693d8fb60149841369384d15147` |
| `src/components/NativelyInterface.tsx` | 1 800 | `6284922a9d2ecb9d2dfd7c11cf8994b28129f343434528098ea5e375e4d8450c` |
| `src/hooks/useShortcuts.ts` | 317 | `701dbc869671ee2519540d6b37e269865872eaeb7ceaa45e184a712cf7302dcf` |
| `package.json` / `package-lock.json` | — | `3e6a5d03cc7cfa37b7034e18a4f5ab417f11b3ed0560a502213a92dfa1b36e5f` / `bd11056f9180932f08cecb0e84e6adb2d99cec7dcc5f25281bf47873110df4c7` |

Also hashed and unchanged: `electron/IntelligenceEngine.ts` (1 209), `electron/SessionTracker.ts`, `electron/audio/SherpaSTT.ts`, `src/main/services/SherpaAutoService.ts` (363), `electron/config/languages.ts`, `electron/audio/MicrophoneCapture.ts`, `electron/audio/SystemAudioCapture.ts`, `electron/audio/WebSpeechSTT.ts`, `src/components/SettingsOverlay.tsx`, `src/components/ui/TopPill.tsx`, `src/components/ui/RollingTranscript.tsx`, `src/components/WindowControls.tsx`, `electron/SettingsWindowHelper.ts`, `electron/ModelSelectorWindowHelper.ts`, `electron/CropperWindowHelper.ts`.

Prior-report digests (unchanged during this audit): `MODULE_04…md` `610a2a6f…ec80af05`, `MODULE_04A…md` `f7deb190…fdb2b583`, `MODULE_04B…md` `db514eef…e551a137`, `MODULE_03…md` `2643886f…efd0086f`, `MODULE_03A…md` `bc737d2c…0c5b291a`.

**Build currency [B]:** every `dist-electron/electron/*.js` (2026-11-10 22:12) is newer than every `.ts`/`.tsx` under `electron/` and `src/` (`find … -newer dist-electron/electron/main.js` → empty), so the compiled bundles correspond to this snapshot: `dist-electron/electron/main.js` contains `await this.ensureOverlayWindow();` at bundled line 176247, `ensureOverlayWindow(cid)` at 176257, the Start-time call at 318937. Renderer: `dist/assets/index-BfL4ry0B.js` = 1 572 367 B and `dist/assets/vendor-DPTebTG3.js` = 1 245 456 B, both referenced by `dist/index.html`.

---

## 4. Prior report reconciliation

Every load-bearing claim in the three reports was re-checked against the current source. Nothing was accepted on citation alone.

### 4.1 Module 04 (`MODULE_04_WINDOW_SHORTCUT_SESSION_AUDIT.md`) — defects D-01…D-13

| ID | Claim | Re-verified against source | Verdict here |
|---|---|---|---|
| D-01 | Start never reveals the overlay; comment encodes the opposite intent | `main.ts:2828–2831` comment, `:2832` `switchToLauncher(false)`, `:2833` hidden prepare, `:2838–2840`; `App.tsx:405–409` sends no follow-up switch | **CONFIRMED** — and now a **requirement** (5.3), i.e. promoted from "defect" to "mandated behaviour change" |
| D-02 | Ctrl+B on visible overlay hides it **and** shows launcher | `main.ts:3638–3646` (`hideOverlay` then `switchToLauncher(true)`); `WindowHelper.ts:821–823` hides overlay | **CONFIRMED**; requirement 5.4 makes the launcher-return branch prohibited |
| D-03 | Ctrl+B not registered pre-session; focused-renderer fallback hides both windows and cannot restore | `KeybindManager.ts:99–101` + dead branch `:105`; `Launcher.tsx:219–221` → `toggle-window` → `main.ts:3571–3583` → `WindowHelper.ts:676–682` → `:603–609` | **CONFIRMED**; requirement 5.2 now mandates global registration outside the session (C02) |
| D-04 | Ctrl+B on launcher during session opens overlay | `main.ts:3649` → `WindowHelper.ts:697–700`, `:783–785` | **CONFIRMED**; requirement 5.6 makes this a violation |
| D-05 | Multiple Ctrl+B owners; renderer path expands instead of hiding | `main.ts:482–485`, `main.ts:3584–3593` (`toggle-expand`), `NativelyInterface.tsx:972`, `:1191`; `Launcher.tsx:219–221`; `KeybindManager.ts:401`, `:425–432` (macOS menu → `toggleMainWindow`) | **CONFIRMED owners**; simultaneous delivery per physical press remains **[NV]** (Module 04A F-3 stands) |
| D-06 | Ctrl+1 gated by mode, not visibility; hidden overlay answers and pops open | `KeybindManager.ts:102`; `WindowHelper.ts:655–666` (no mode change); `main.ts:588–595` (broadcast, no gate); `NativelyInterface.tsx:1091–1095` → `:759–764` (`setIsExpanded(true)` `:763`) → `:689–712` (`api.showOverlay()` `:698`) | **CONFIRMED**; requirement 6 is the authoritative table |
| D-07 | Launcher discards `state:'stopping'` | `main.ts:2988–2993`; `preload.ts:604–608`; `Launcher.tsx:191–194` destructures `isActive` only; CTA `:768–838` | **CONFIRMED** (UX only; main-process guard `:2754–2758` is sound) |
| D-08 | Two visibility truths | `WindowHelper.ts:62`, writers `:316`, `:449`, `:467`, `:501`, `:519`, `:608`, `:756`, `:818`; `showOverlay`/`hideOverlay` `:625–666` write neither; read by `:676–682`, `:594–596` | **CONFIRMED** |
| D-09 | `switchToOverlay` flips mode + hides launcher before usability check | `WindowHelper.ts:699–702`, `:779–785` | **CONFIRMED**; requirement 5.3/5.9 now forbid it outright |
| D-10 | Auxiliary windows outside the toggles | `WindowHelper.ts:603–609` covers only launcher+overlay; `SettingsWindowHelper.ts:101–104`; `ModelSelectorWindowHelper.ts:56–61` | **CONFIRMED (static)**; platform child-hide **[NV]** |
| D-11 | Diagnostics exist but launcher not wired; `sttConnected` misleads | `main.ts:734–750`; `ipcHandlers.ts:317–327`; `Launcher.tsx:182–195` | **PARTIALLY CONFIRMED** — and Module 04A F-7 (conditional on provider `none`, `main.ts:1110–1116`) re-verified as correct |
| D-12 | `getMainWindow()` can return a destroyed overlay | `WindowHelper.ts:567–572` — no `isDestroyed()` in either branch | **CONFIRMED** |
| D-13 | Ctrl+B handled before the input guard in both renderers | `NativelyInterface.tsx:1189–1192` (`isInput` computed at `:1189` and used only for `processScreenshots`), `:1191`; `Launcher.tsx:219–221` | **CONFIRMED** |

### 4.2 Module 04A — corrections that still stand, and ones this audit supersedes

| 04A item | Status after re-verification |
|---|---|
| F-1 "created at launch; loaded asynchronously; completion not ordered before Start" | **Stands.** `AppState.createWindow()` does not await (`main.ts:3556–3558`) and `initializeApp` does not await it (`:4520`) |
| F-2 focus must **not** gate Ctrl+1 (Meeting Ongoing uses `showInactive`, `WindowHelper.ts:753–755`; passthrough `:640–646`; stealth is the product) | **Stands and is now ratified by requirement §6** ("Do not require OS keyboard focus if that would break the global shortcut in the transparent overlay"). Module 04's `isFocused()` recommendation is rejected |
| F-4 D-03 overstatement (macOS menu, tray, dock, second-instance can restore) | **Stands**; on Windows the tray exists only when `!isUndetectable()` (`main.ts:4539–4542`, `:3930–3938`), so stealth mode leaves no restore affordance |
| F-6 Ctrl+1 hidden-overlay verdicts are path-specific | **Stands**; this audit adds the Home/Meeting-Ongoing path as a third distinct case |
| F-9 overlay `close` handler + missing `closed` listener | **Stands** (`WindowHelper.ts:555–564`; no `closed`) |
| F-10 restore paths conditional on stealth | **Stands** |
| F-11 Ctrl+1 "pops the overlay open" is a static consequence | **Stands**, re-verified at `:763`→`:698` |
| D.4 "minimum reliable condition = `isMeetingActive && overlay && !isDestroyed && overlay.isVisible()`" | **Adopted** as the Ctrl+1 gate basis (§14) |

### 4.3 Module 04B — what is adopted, and what is overridden (dispositions C01…C07 in §13.2)

| 04B statement | This audit |
|---|---|
| §2.2 exactly three `ensureOverlayWindow()` call sites (C1 boot, C2 Start, C3 Ctrl+B-recreate); one overlay constructor | **Adopted, re-verified** (`WindowHelper.ts:327`, `main.ts:2833`, `main.ts:3623`; ctor `:386`) |
| §4.3 "Start: launcher stays visible; overlay prepared hidden; Ctrl+B reveals" | **OVERRIDDEN (C01)** — requirement 5.3 |
| §3.3(5)/§6.2 "KeybindManager session gate unchanged" | **OVERRIDDEN (C02)** — requirement 5.2 |
| §4.1 INV-1 (overlay ⟺ non-idle session) | **Adopted**, extended to INV-2/INV-4 (§6) |
| §5.1–§5.8 failure/race analysis (creation throw swallowed `:2833–2835`; `loadOk===false` leaves a live blank window `:429–434`; stale `_overlayCreating`; launcher hidden without usable overlay; no `closed` listener) | **Adopted, re-verified line by line**; requirement 5.9 turns them into acceptance criteria |
| §3.2/§3.3 "leave STT prewarm at boot" | **Adopted and now mandated (C04)** — requirement 5.1/§7.1 |
| §7.1 performance framing | **Adopted, sharpened (C07)** with the bundle and subscription counts in §12 |
| Anything implying lazy creation improves transcription or LLM latency | **Not present in 04B**, and explicitly disallowed here |

**Verdict on prior reports:** Module 04 is the most requirement-accurate of the three (its D-01…D-13 map onto the approved rules), Module 04A corrected two of its recommendations (focus, "fully loaded"), and Module 04B — while accurate on mechanics — recommended **against** two approved requirements. The authoritative set is §5–§9 of the current brief.

---

## 5. Approved requirements versus actual source behaviour

### 5.1 Launch

| Requirement | Source behaviour | Verdict |
|---|---|---|
| Launcher shown | `WindowHelper.ts:272` ctor → `:320` load `?window=launcher` → `:313–317` `did-finish-load` → `switchToLauncher()` | **CONFIRMED PASS** |
| No active session | `_sessionState` field `main.ts:334`; `isMeetingActive=false` `:287`; Start only via `:2753` | **CONFIRMED PASS** |
| No audio capture | boot pipeline call commented `:687–689`; captures null `:1071–1072`; `setupSystemAudioPipeline()` reachable only `:2344`, `:2903` | **CONFIRMED PASS** |
| No active transcription | sockets open only in `start()`; transcript intake gated `:1255–1261` | **CONFIRMED PASS** |
| No answer generation | no timer/worker calls the LLM; auto-answer is transcript-driven (`IntelligenceEngine.ts:211–239`) | **CONFIRMED PASS** |
| Overlay **must not** be created | `WindowHelper.ts:327` creates it at boot (`:386`) | **FAIL — F01** |
| Overlay renderer **must not** mount/load | `WindowHelper.ts:422` loads `?window=overlay` at boot → `App.tsx:482–508` mounts `NativelyInterface` → `:971–1125` installs 50 subscriptions | **FAIL — F01** |
| Application services may continue | prewarm `:4522–4531`, Whisper preload `:391–410`, RAG/Ollama `:673–676`, telemetry `:4444–4467`, updater `:692`, health check `KeybindManager.ts:358–365` | **PASS — must remain** (§7.1) |

### 5.2 Ctrl+B before Start (mandatory)

| Requirement | Source behaviour | Verdict |
|---|---|---|
| Chord must work with no session | `shouldRegister('general:toggle-visibility')` returns `this.sessionActive` (`KeybindManager.ts:101`); the launcher-mode branch at `:105` is unreachable dead code; re-registration only happens via `setSessionActive` (`:88–93`) from `main.ts:2836` / `:2992` / `:3176` | **FAIL — F03** |
| Visible launcher → hide | reachable only through the focused-renderer chord (`Launcher.tsx:219–221`) → `toggle-window` (`ipcHandlers.ts:290`) → `main.ts:3571–3583` → `WindowHelper.ts:676–682` → `hideMainWindow()` `:603–609` | **PARTIALLY CONFIRMED** — only while the launcher has focus, and it hides both windows |
| Hidden launcher → show | no global registration; hidden window has no focus so the DOM chord is unreachable; on Windows the tray exists only when `!isUndetectable()` (`main.ts:4539–4542`) | **FAIL — F03** |
| No overlay creation / session / capture from Ctrl+B | `toggleMainWindow` contains none | **PASS** |

### 5.3 Start Natively

| Required order | Source | Verdict |
|---|---|---|
| 1 start session | guards `:2754–2760`; permissions `:2786`; state `:2838–2840` | **PASS** |
| 2 create overlay lazily | `:2833` is already lazy-capable — but boot C1 created it first | **FAIL via F01** |
| 3 load + initialise renderer | `WindowHelper.ts:422`, listeners `:429–431` | mechanism **PASS**, result **PARTIAL** (failure not surfaced → F10) |
| 4 no duplicate STT init | existence guards `main.ts:1750`, `:1786`, `:1798`, `:1818` reuse prewarmed objects | **PASS** |
| 5 show overlay once usable | nothing shows it; `:2828–2831` forbids revealing | **FAIL — F02** |
| 6 hide launcher | `:2832` does the opposite (`switchToLauncher(false)`) | **FAIL — F02** |
| 7 audio/STT begin | deferred block `:2888–2948` | **PASS** |
| never hide the launcher before the overlay is usable | `WindowHelper.ts:783–785` hides it unconditionally | **FAIL — F08** |

### 5.4–5.8 Ctrl+B on overlay, Home, Ctrl+B after Home, Meeting Ongoing, Stop

| Requirement | Source | Verdict |
|---|---|---|
| 5.4 visible overlay → hide only | `main.ts:3641` then `:3646` shows the launcher | **FAIL — F04** |
| 5.4 hidden overlay → same overlay, no new window, no session/audio restart | `main.ts:3649` → `switchToOverlay` (`WindowHelper.ts:697–786`): bounds/opacity/show/focus only | **PASS** |
| 5.4 synchronise auxiliary windows/pills/resize controls | `hideMainWindow`/`hideOverlay` touch launcher + overlay only; the pill chip is expand/collapse (`NativelyInterface.tsx:1396`, `TopPill.tsx:53`, `:76`), reaching window hide only via the 400 ms effect (`NativelyInterface.tsx:705–708`) | **FAIL — F17** |
| 5.4 Ctrl+B is visibility, not expand/collapse | `main.ts:3584–3593` sends `toggle-expand`; renderer `:972` flips `isExpanded` | **FAIL — F07** |
| 5.5 Home → launcher current; session/audio/STT keep running; overlay not destroyed | `NativelyInterface.tsx:1399` → `ipcHandlers.ts:197` → `switchToLauncher` (`:788–824`); `WindowHelper.ts` contains **0** capture/STT/LLM references | **CONFIRMED PASS** |
| 5.6 Ctrl+B after Home toggles the launcher | `main.ts:3649` reveals the overlay; `toggleAssistantOverlay` never consults `getCurrentWindowMode()` (`:3600–3611` logs it only) | **FAIL — F05** |
| 5.6 interface tracked independently of visibility | `currentWindowMode` `:68` is the only such record and is stale after `hideOverlay` | **FAIL — F14** |
| 5.7 Meeting Ongoing restores the existing overlay; no duplicate window/stream/recognizer | `Launcher.tsx:774` → `setWindowMode` → `switchToOverlay`; contains no `ensureOverlayWindow`, capture or STT call | **CONFIRMED PASS** (normal path); unsafe during in-flight creation → F08 |
| 5.8 Stop ends session, stops capture/transcription, destroys overlay, returns to idle launcher | `main.ts:2988–2993`, `:3004`, `:3011–3012`, `:3016`, `:3020–3021`, drain `:3057–3061`, release `:3095–3106`, destroy `:3110–3119` | **CONFIRMED PASS** (destroy is deferred → §20 Q5) |
| 5.8 Stop ≠ Hide | Hide = `hideOverlay` `:655–666` (TopPill chip); Stop = `end-meeting` (`ipcHandlers.ts:2716`) | **PASS** |

### 5.9 Failure and concurrency — evidence

| Case | Source | Verdict |
|---|---|---|
| Window ctor throws | rejection caught, log only (`main.ts:2833–2835`, `:3632–3634`) | **FAIL — F09** |
| Renderer load fails | `WindowHelper.ts:422` → `false`; `:429–432` skips listeners; `:434` still logs "creation complete"; promise resolves | **FAIL — F10** |
| Renderer initialisation fails (React error) | per-window `ErrorBoundary` — overlay `App.tsx:484` (`context="Overlay"`), launcher `:511`; no main-process signal and no `did-finish-load`/crash → readiness feedback | **UNVERIFIED** — no static channel exists |
| Stop during creation | `destroyOverlayWindow` `:446–458` leaves `_overlayCreating` (`:332`) | **FAIL — F09** |
| Start again with an unresolved creation promise | join branch `:348–351` returns the stale promise | **FAIL — F09** |
| Meeting Ongoing during creation | `:779–785` | **FAIL — F08** |
| External overlay close | no `closed` listener (`:525–565`); `close` guard `:555–564` applies only while visible | **FAIL — F11** |
| Destroyed-but-non-null reference | `:568`, `:605–607`, `:702`; `main.ts:3618` | **FAIL — F11** |
| Duplicate Start | `main.ts:2754–2758` (`isMeetingActive \|\| _sessionState==='starting'`) | **PASS** |
| Duplicate Stop | `main.ts:2954–2957`, `_pendingTeardown` `:2766–2774`, `_sessionId` guard `:3114` | **PASS** |
| Startup failure after partial init | no rollback path; nearest complete teardown is `forceEndMeeting` `:3132–3180` | **FAIL — F09/F10** |

---

## 6. Corrected lifecycle and state-transition table

### 6.1 Required states (authoritative; supersedes Modules 04/04A/04B recommendations)

| # | State | Session | Overlay window | Overlay vis | Launcher vis | Current interface | Audio/STT | Ctrl+B does | Ctrl+1 does |
|---|---|---|---|---|---|---|---|---|---|
| L0 | Idle at launch | idle | **absent** | — | yes | launcher | prewarmed objects, no sockets | hide/show **launcher** | nothing |
| L1 | Idle, launcher hidden | idle | absent | — | no | launcher | prewarmed | show launcher | nothing |
| L2 | Starting | starting | creating/loading | no | yes (must stay) | pending | pipeline building | ignore/queue | nothing |
| L3 | Active, overlay current + visible | active | present, ready | yes | **no** | overlay | running | hide overlay only | generate |
| L4 | Active, overlay current + hidden | active | present, ready | no | no | overlay | running | show same overlay | **nothing** |
| L5 | Active, launcher current + visible (after Home) | active | present, hidden | no | yes | **launcher** | running | hide launcher | nothing |
| L6 | Active, launcher current + hidden | active | present, hidden | no | no | launcher | running | show launcher | nothing |
| L7 | Stopping | stopping | present (draining) | last surface | yes (swap `:3004`) | launcher | stopping | launcher toggle | nothing |
| L8 | Idle after Stop | idle | **destroyed/absent** | — | yes | launcher | released | launcher toggle | nothing |
| L9 | Failed start | idle (rolled back) | absent or destroyed | — | **yes (never hidden)** | launcher | no orphan capture/STT | launcher toggle | nothing |

### 6.2 Invariants the repair must hold

* **INV-1** overlay present ⟺ `sessionState ∈ {starting, active, stopping}`; never in `idle`.
* **INV-2** one creation primitive, idempotent, promise-joining, and **generation-stamped** so a teardown invalidates an in-flight creation.
* **INV-3** every path that nulls the overlay also sets the current interface to `launcher`.
* **INV-4** no path hides the launcher unless an overlay is usable in the same operation.
* **INV-5** Ctrl+B never changes the current interface; only Home and Meeting Ongoing do.
* **INV-6** Ctrl+1 requires `sessionState === 'active'` **and** current interface `overlay` **and** `overlay.isVisible()`.
* **INV-7** window operations never call capture/STT/LLM code (already true: 0 references in `WindowHelper.ts`).
* **INV-8** answer/intelligence streams are addressed to the **overlay** surface, not to the mode-dependent "main window" (see F12).

### 6.3 Transitions that must change

| Transition | Today | Required |
|---|---|---|
| launch → L0 | creates the overlay at `WindowHelper.ts:327` | remove that call |
| L0 → L2 → L3 (Start) | `main.ts:2832` shows launcher; `:2833` prepares hidden; no reveal | create → await usable → show overlay + hide launcher; on failure roll back to L9 with the launcher still visible |
| L3 → L4 (Ctrl+B) | `main.ts:3641` + `:3646` (shows launcher) | `hideOverlay` only; interface unchanged |
| L4 → L3 (Ctrl+B) | `main.ts:3649` (reveals overlay **and** hides launcher) | show the same overlay; do not touch mode/launcher beyond the overlay's own visibility |
| L3 → L5 (Home) | `switchToLauncher` ✓ | unchanged |
| L5 → L6 (Ctrl+B) | `main.ts:3649` reveals overlay ✗ | hide launcher |
| L6 → L5 (Ctrl+B) | ✗ | show launcher |
| L5/L6 → L3 (Meeting Ongoing) | `Launcher.tsx:774` ✓ | unchanged + INV-4 guard |
| L3–L6 → L7 → L8 (Stop) | `endMeeting` ✓ (destroy deferred `:3115`) | unchanged, but interface/creation state must be reset explicitly |
| Ctrl+1 in L3 | fires (mode-based registration) ✓ | keep, add the INV-6 gate in the main process |
| Ctrl+1 in L4/L5/L6 | fires ✗ (mode `overlay` after Hide; broadcast un gated `main.ts:588–595`) | no action, no reveal |
| Ctrl+B in L0/L1 | not registered ✗ | registered; launcher hide/show |

### 6.4 State-model verification (brief §11)

| Concept (brief §11) | Equivalent in code | Separated correctly? |
|---|---|---|
| 1 Session state | `_sessionState` `main.ts:334` (`idle/starting/active/stopping`) + `_sessionId` `:336`, `_isDraining` `:292`, `_pendingTeardown` `:302` | **YES — reuse as-is** |
| 2 Current interface | `WindowHelper.currentWindowMode` `:68`, mirrored in `KeybindManager.activeMode` `:65` | **PARTLY** — exists, but never consulted by `toggleAssistantOverlay`, not maintained by `destroyOverlayWindow`, and re-used as a *visibility* proxy by `shouldRegister` |
| 3 Launcher visibility | `launcherWindow.isVisible()` (authoritative) vs `isWindowVisible` `:62` (single shared boolean, stale) | **NO — F14** |
| 4 Overlay visibility | `overlayWindow.isVisible()` ✓, but no field, and `showOverlay`/`hideOverlay` never publish it | **PARTLY** |
| 5 Overlay creation state (absent/creating/loading/ready/failed/destroying) | only `_overlayCreating` `:332` (a promise or null); no `ready`, no `failed`, no generation | **NO — F09/F10** |
| 6 Audio/STT state (prewarming/ready/active/failed/stopping) | implicit: `!!this.googleSTT` (`getAudioPipelineDiagnostics` `:734–750`), capture non-null, `stt-status` events, `SherpaAutoService.ready/initError` `:67–75` | **PARTLY — data exists, no single enum; `sttConnected` is misleading (F15/D-11)** |

**Smallest robust model (no rewrite):** keep `_sessionState`/`_sessionId`; keep `currentWindowMode` and rename its contract to "current interface" (single writer per transition, updated by `destroyOverlayWindow`); delete the boolean `isWindowVisible` as a *decision* input (keep per-window `isVisible()` as the only visibility truth); add **one** overlay creation enum (`absent → creating → ready → failed`, plus a `creationGeneration` counter) to `WindowHelper`; derive audio/STT status from the existing `getAudioPipelineDiagnostics` + `stt-status` rather than a new store. That is 3 existing fields reused, 1 boolean retired from decisions, and 2 new small fields added — no state library, no IPC rewrite.

---

## 7. Mandatory scenario matrix (S01–S25)

No row below is judged by a function name or a comment; each cites the control flow that produces the outcome. All verdicts are static; none is runtime-observed.

| ID | Scenario | Expected (approved) | Actual in current source | Verdict |
|---|---|---|---|---|
| S01 | Application launch | launcher visible, overlay absent | overlay `BrowserWindow` created + loading at `WindowHelper.ts:327`/`:386`/`:422` | **FAIL / REQUIREMENT CONFLICT (F01)** |
| S02 | Ctrl+B before Start | launcher hides | global chord not registered (`KeybindManager.ts:101`); only the focused launcher's DOM chord (`Launcher.tsx:219–221`) → `hideMainWindow()` hides **both** windows (`WindowHelper.ts:603–609`) | **PARTIALLY CONFIRMED (F03)** |
| S03 | Ctrl+B again before Start | launcher restores | no global chord, hidden window has no focus → second press cannot arrive; on Windows with stealth there is no tray (`main.ts:4539–4542`); macOS menu (`KeybindManager.ts:425–432`)/dock/second-instance may restore **[NV]** | **FAIL (F03)** |
| S04 | Start Natively | session starts, overlay appears, launcher hides | `main.ts:2828–2840`: launcher explicitly kept visible, overlay prepared hidden and never revealed; renderer sends no follow-up (`App.tsx:405–409`) | **FAIL (F02)** |
| S05 | Ctrl+B with overlay visible | overlay hides only | `main.ts:3641` hides, then `:3646` `switchToLauncher(true)` shows the launcher | **FAIL (F04)** |
| S06 | Ctrl+B again | same overlay restores | `main.ts:3649` → `switchToOverlay` reuses the instance; correct outcome reached by the wrong mechanism (it also flips mode/launcher each round trip) | **PARTIALLY CONFIRMED (F04/F05)** |
| S07 | Click Home/logo | launcher appears, session continues | `NativelyInterface.tsx:1399` → `ipcHandlers.ts:197` → `switchToLauncher` (`WindowHelper.ts:788–824`); no capture/STT call exists in the chain | **PASS (CONFIRMED)** |
| S08 | Ctrl+B after Home | launcher hides | `main.ts:3649` reveals the **overlay** instead | **FAIL (F05)** |
| S09 | Ctrl+B again after Home | launcher restores, overlay stays hidden | behaviour is now overlay-current; the launcher was hidden by `:784` in S08 | **FAIL (F05)** |
| S10 | Meeting Ongoing | existing overlay restores | `Launcher.tsx:774` → `setWindowMode('overlay', true)` → `switchToOverlay`; no creation call, no audio restart. Unsafe only while creation is in flight (F08) | **PASS (CONFIRMED, normal path)** |
| S11 | Ctrl+1 with overlay visible | What to Answer executes | registered when `activeMode==='overlay'` (`KeybindManager.ts:102`) → `main.ts:575–595` → `global-shortcut` → `onGlobalShortcut` (`NativelyInterface.tsx:1091–1095`) → `handleWhatToSay` (`:759`) → `generate-what-to-say` (`ipcHandlers.ts:2829`) | **PASS (CONFIRMED)** |
| S12 | Ctrl+1 with overlay hidden | no action | (i) the pill's Hide chip (`NativelyInterface.tsx:1396`) collapses, whose effect calls `api.hideOverlay()` (`:705–708`) while `currentWindowMode` stays `overlay` (`WindowHelper.ts:655–666` never changes it) and dispatch is ungated (`main.ts:588–595`) → answer runs **and** `setIsExpanded(true)` (`NativelyInterface.tsx:763`) → effect calls `api.showOverlay()` (`:698`) revealing the overlay; (ii) in-window chord `NativelyInterface.tsx:1179` bypasses every main-process check | **FAIL (F06)** |
| S13 | Ctrl+1 with launcher current | no action | chat ids are not registered in launcher mode (`KeybindManager.ts:102` + `:105–118`) → inert **by accident of mode bookkeeping**; the same press becomes eligible after any Hide (S12) and the DOM handler is always live in the overlay document | **PARTIALLY CONFIRMED (F06)** |
| S14 | Stop | session + audio/STT stop, overlay destroyed | `main.ts:2988–2993`, `:3004`, `:3011–3012`, `:3016`, `:3020–3021`, `:3057–3061`, `:3095–3106`, `:3110–3119`; force path `:3141–3177` | **PASS (CONFIRMED)** — destroy is deferred behind the drain (see §20 Q5) |
| S15 | Start after Stop | clean new session, one overlay | `startMeeting` awaits `_pendingTeardown` (`:2766–2774`) before `ensureOverlayWindow` (`:2833`); alive-check `:343–346`; `_sessionId` guard protects the fresh overlay (`:3114`) | **PASS (CONFIRMED)** — except the Stop-during-creation interleaving (S17) |
| S16 | Overlay load failure | launcher remains usable; error/retry available | `loadUrlWithRetry` returns `false` (`WindowHelper.ts:26`, `:44–48`, `:55`); the window stays alive blank, listeners are skipped (`:429–432`) and the promise still resolves "creation complete" (`:434`); callers only log (`main.ts:2833–2835`) | **FAIL (F10)** |
| S17 | Stop during overlay creation | no stale promise or orphaned resources | `destroyOverlayWindow` (`:446–458`) nulls the field and destroys the window but never clears `_overlayCreating` (`:332`), so the next `ensureOverlayWindow` returns the dead promise (`:348–351`) | **FAIL (F09)** |
| S18 | Duplicate Start | no duplicate windows/resources | `main.ts:2754–2758` early-return; creation idempotency `:343–351`; pipeline guards `:1750/1786/1798/1818` | **PASS (CONFIRMED)** |
| S19 | Duplicate Stop | idempotent cleanup | `main.ts:2954–2957` guard; `_isDraining`; `_pendingTeardown`; `_sessionId === endedSessionId` at `:3114` | **PASS (CONFIRMED)** |
| S20 | Home during active transcription | transcription continues | Home chain reaches only `WindowHelper`; `grep` of capture/STT/LLM identifiers in `WindowHelper.ts` = **0**; capture objects untouched (`main.ts:1071–1072` mutated only by Start/Stop/reconfigure/resume paths) | **PASS (CONFIRMED)** |
| S21 | Ctrl+B during active transcription | transcription continues | hide path = `hideOverlay` (`:655–666`); overlay is hidden, not destroyed; `backgroundThrottling: false` (`:371`) keeps its timers alive; renderer state preserved | **PASS (CONFIRMED)** — outcome right, mechanism wrong (F04) |
| S22 | Meeting Ongoing after Home | no audio/STT restart | `switchToOverlay` performs no session work; `set-window-mode` handler is 3 lines (`ipcHandlers.ts:197–200`) | **PASS (CONFIRMED)** |
| S23 | Manual chat without STT | typed answer still works | `handleManualSubmit` (`NativelyInterface.tsx:881–905`) uses the chat path, independent of `sttProvider`; `createSTTProvider` returns `null` for `'none'` and the pipeline degrades to "audio without transcription" (`main.ts:1110–1116`) without touching chat; STT object null-guards everywhere (`this.googleSTT?.write`) | **PASS (CONFIRMED)** |
| S24 | Mock Interview | mic is interviewer; no system capture | `main.ts:2905–2913` starts only `microphoneCapture` + `googleSTT` and skips system audio/user STT; `wireMicCapture` routes mic chunks to `googleSTT` and returns early (`:1712–1716`) so labels become `'interviewer'` (`createSTTProvider(speaker)` handler `:1254`) | **PASS (CONFIRMED)** — with the Only-Interviewer interaction in F16 |
| S25 | Normal Interview | system = interviewer, mic = candidate | system capture → `createSTTProvider('interviewer')` (`:1798–1805`), mic → `createSTTProvider('user')` (`:1818–1826`); `IntelligenceEngine.handleTranscript` only speculates on `speaker === 'interviewer'` (`:248–256`), so candidate speech cannot trigger interviewer answers | **PASS (CONFIRMED)** |

**Matrix rollup:** PASS **13** (S07, S10, S11, S14, S15, S18, S19, S20, S21, S22, S23, S24, S25 — of which S14 and S21 are "right outcome, defective mechanism": deferred destroy F13 and switch-not-toggle F04), FAIL **9** (S01, S03, S04, S05, S08, S09, S12, S16, S17), PARTIALLY CONFIRMED **3** (S02, S06, S13). §21 restates these counts as the authoritative numbers.

---

## 8. Ctrl+B and Ctrl+1 ownership, registration and execution analysis

### 8.1 `general:toggle-visibility` (Ctrl+B) — four owners found

| # | Owner | Registration / trigger | Handler | Effect today | Requirement status |
|---|---|---|---|---|---|
| O1 | OS global shortcut | `KeybindManager.registerGlobalShortcuts` `:277–300`, gated by `shouldRegister` `:99–101` → registered **only while `sessionActive`** | `onShortcutTriggered` → `main.ts:482–485` → `toggleAssistantOverlay` `:3600–3660` | session-only hide/show of the overlay, always paired with a launcher switch | **FAILS §5.2** — must be registered outside the session too (C02) |
| O2 | Launcher DOM keydown | `Launcher.tsx:217–240` (`isShortcutPressed(e,'toggleVisibility')` `:219`) | `electronAPI.toggleWindow()` → `ipcHandlers.ts:290` → `main.ts:3571–3583` → `WindowHelper.toggleMainWindow` `:676–682` → `hideMainWindow` `:603–609` | hides **both** windows; decision made from the stale `isWindowVisible` | violates §5.2 (restore path) and INV-5 |
| O3 | Overlay DOM keydown | `NativelyInterface.tsx:1191` (evaluated before the `isInput` guard at `:1189–1192`) | same `toggleWindow` IPC, but mode is `overlay` → `main.ts:3584–3593`: `show()`, `focus()`, `send('toggle-expand')` → `onToggleExpand` (`NativelyInterface.tsx:972`) flips `isExpanded` | **expands/collapses**, never hides | violates §5.4 ("visibility toggle, not expand/collapse") |
| O4 | macOS application menu | `KeybindManager.updateMenu` `:401`, item `:425–432` with `accelerator: toggleAccelerator` | `AppState.getInstance().toggleMainWindow()` (same as O3) | third owner of the same chord | macOS only; **[NV]** delivery precedence |
| — | Tray / dock / second instance | `main.ts:3935–3937` tray double-click, `:4690–4710` activate, `:4432–4438` second-instance | `centerAndShowWindow` → `WindowHelper.ts:688–695` | restore paths; exist only when not stealth, and route by mode | relevant to S03 only |

**Single-owner recommendation (minimal):** make **O1 the only owner**; keep the accelerator configurable and keep the registration-failure IPC (`KeybindManager.ts:289–298`) as the safety signal; register `general:toggle-visibility` unconditionally (drop the `sessionActive` term at `:101`, which also makes the dead branch at `:105` reachable again — delete it); branch inside `toggleAssistantOverlay` on `(session state, current interface, that interface's own visibility)` per §6.1; and remove/neutralise O2 and O3 (or re-point them at the same IPC rather than `toggleWindow`).

### 8.2 `chat:whatToAnswer` (Ctrl+1) — registration and execution

| Layer | Source | Gate today | Required gate (INV-6) |
|---|---|---|---|
| Default binding | `KeybindManager.ts:24` `CommandOrControl+1`, `isGlobal: true` | — | unchanged |
| OS registration | `KeybindManager.ts:102` `if (activeMode === 'overlay') return true` | **mode only** — and `hideOverlay` (`WindowHelper.ts:655–666`) never changes mode | registration may stay mode-based **only** if the handler gate below is added |
| Shortcut dispatch | `main.ts:461–474` membership test, `:475–480` `switchToOverlay(true)` when mode is `launcher`, `:575–595` action map + `global-shortcut` **broadcast to every window** | **no session check, no visibility check, no interface check** | `sessionState==='active' && currentInterface==='overlay' && overlay.isVisible()` |
| Overlay reveal side effect | `NativelyInterface.tsx:1091–1105` → `:759–764` (`setIsExpanded(true)` `:763`) → effect `:689–712` → `api.showOverlay()` `:698` | none | must not reveal from a shortcut-triggered answer |
| Competing in-window owner | `NativelyInterface.tsx:1179` `if (p('whatToAnswer')) run(() => h.handleWhatToSay())` | **none** — fires whenever the overlay document has focus, regardless of session | must be gated identically or removed |
| Dedicated button | `NativelyInterface.tsx` What-to-Answer control → same `handleWhatToSay` | — | **must keep working unchanged** |

**Two consequences the repair must respect**

1. Module 04's D-06 `isFocused()` gate is **rejected**: Meeting Ongoing passes `inactive=true` → `showInactive()` (`WindowHelper.ts:753–755`), mouse passthrough deliberately never takes focus (`:640–646`, `:611–623`), Windows foreground-lock can refuse `focus()`, and the content-protection path defers focus by 60 ms (`:735–745`). Module 04A D.2 proved this; requirement §6 ratifies it.
2. Because `switchToLauncher` hides the overlay and `switchToOverlay` hides the launcher, `overlay.isVisible()` alone already implies "overlay is the working surface" for L3–L6 — **except** in L5/L6 where Home made the launcher current and the overlay is hidden; there the mode check is what prevents a Ctrl+B-revealed overlay from silently becoming the interface. Hence the three-part gate in INV-6, evaluated in the **main process**.

---

## 9. Lazy overlay creation impact (what it actually changes)

### 9.1 Work removed from launch by deleting `WindowHelper.ts:327`

| Removed at idle | Evidence |
|---|---|
| 1 assistant `BrowserWindow` (transparent, frameless, always-on-top `screen-saver` level) + its renderer process | `WindowHelper.ts:359–407` |
| The `?window=overlay` document load: 1 572 367 B app chunk + 1 245 456 B vendor chunk + KaTeX fonts/CSS parsed a **second** time | `WindowHelper.ts:12–14`, `:422`; `dist/assets/index-BfL4ry0B.js`, `dist/assets/vendor-DPTebTG3.js` **[B]** |
| 50 overlay IPC event subscriptions (`useIpc` map) plus `App.tsx`-level overlay listeners | `NativelyInterface.tsx:971–1125`, `useIpc` `:240–246`; `App.tsx:348–356`, `:359–367` |
| Overlay DOM listeners and two rAF scroll loops, the 600 ms size-report timer, mount-time `getDefaultModel()` → `setModel()` broadcast, and the initial `update-content-dimensions*` writes | `NativelyInterface.tsx:609–615`, `:615–658`, `:665–676`, `:1129–1219`, `:1221+` |
| The overlay's share of the non-window-scoped `App.tsx` mount effect (license/plan/profile/credential reads + a 30 s trial `setInterval`) | `App.tsx:201–336` (poll at `:234`, `:270`) |
| Analytics `assistant_start` at launch (and, symmetrically, an `assistant_stop` per Stop) | `App.tsx:65–86` |
| macOS `StealthKeyboardManager.setOverlayWindow()` binding at boot | `WindowHelper.ts:393–400` |

### 9.2 Work that stays exactly as today (C04/C07)

STT provider object prewarm (`main.ts:4522–4531` → `prewarmSttProviders()` `:1868–1885`) and local-Whisper model preload (`:391–410`) are **retained at launch by explicit approval**; the deferred repair must not move them. Also unchanged: RAG init and Ollama bootstrap (`:673–676`), `warmupIntentClassifier()` `:682`, auto-updater `:692`, telemetry/install ping (`:4444–4467`, `:4505–4509`), calendar (`:4647–4672`), PhoneMirror (`:4573–4579`), the 10 s keybind health check (`KeybindManager.ts:358–365`), the launcher's 60 s calendar poll (`Launcher.tsx:204`), and the boot-time meeting recovery/retention cleanup (`:4673–4684`).

### 9.3 New cost introduced

First Start now pays for window creation **and** document load that were previously already paid (`WindowHelper.ts:386` + `:422`, up to 10 attempts with exponential back-off `:18–58`). Consequences that the repair must design for, not discover later:

* Meeting Ongoing / Ctrl+B can be pressed while creation is unresolved (F08, S10 edge).
* Stop during creation leaves a stale promise (F09, S17).
* Load failure must be reported and retried instead of yielding a live blank window (F10, S16).
* **Actual first-Start delay is [NV]** — it is the single most important number the test plan must capture (§19).

### 9.4 Claims that must NOT be made

Lazy creation does **not** reduce launcher parse cost (same chunks, §9.1), does **not** reduce transcription latency (capture/STT live entirely in the main process, `WindowHelper.ts` has 0 references to them), does **not** reduce LLM time-to-first-token, and does **not** reduce the number of timers. It isolates one renderer process and its subscriptions. Any "faster because lazy" statement without a measurement is **UNVERIFIED** and out of scope.

---

## 10. STT prewarming and audio-continuity analysis

### 10.1 Prewarming call chain and resource ownership (brief §7.1)

```
main.ts:4520  appState.createWindow()                       (not awaited)
main.ts:4525  setImmediate(...)
main.ts:4527    └─ prewarmSttProviders()                :1868–1885
main.ts:4528        ├─ createSTTProvider('interviewer') :1106–1250   → this.googleSTT (:1075)
main.ts:4530        └─ createSTTProvider('user')        :1106–1250   → this.googleSTT_User (:1076)
                    (per provider: CredentialsManager lookup, setRecognitionLanguage :1251,
                     transcript listener :1254, no socket, no stream)
main.ts:391–410  separate setImmediate: local-whisper model preload (worker) — gated on provider==='local-whisper'
```

Ownership: **the session owns the provider objects**, not the overlay — they live on `AppState` and are destroyed only by the Stop drain (`:3095–3106`) and re-created by `setupSystemAudioPipeline()`'s guards (`:1798`, `:1818`). Because prewarm already filled those fields, Start's pipeline call reuses them (no second recognizer) — **CONFIRMED** by the guard structure. `startMeeting` also awaits the previous teardown before touching anything (`:2766–2774`), so a Start immediately after Stop cannot tear down the new session's sockets (`:2762–2765` comment).

Overlay creation (`WindowHelper.ts:340–440`) contains **no** STT call at all, so the "do not accidentally initialize a second recognizer when creating the overlay" requirement is satisfied by construction, and stays satisfied after F01 is fixed. **[S-C]**

### 10.2 Audio continuity across every window transition (brief §7.2)

| Transition | Reaches capture/STT code? | Verdict |
|---|---|---|
| Home/logo → `switchToLauncher` | no — `WindowHelper.ts` has 0 references to `MicrophoneCapture`, `SystemAudioCapture`, `googleSTT*`, `intelligence*`, `LLM`, `processingHelper` (verified by count) | **CONFIRMED no interruption** |
| Ctrl+B hide/show → `hideOverlay`/`switchToOverlay`/`showOverlay` | no | **CONFIRMED** |
| Meeting Ongoing → `setWindowMode('overlay')` (`ipcHandlers.ts:197–200`) | no | **CONFIRMED** |
| Overlay renderer reload (`render-process-gone` → `overlayWindow.reload()`, `WindowHelper.ts:414–420`) | no audio code, **but** the reload wipes renderer-side state (messages, transcript buffer, in-flight token buffers) while the main process keeps streaming into a document that no longer has handlers attached until re-mount | **PARTIALLY CONFIRMED** — main-process audio unaffected **[S]**; lost-while-reloading IPC is a real gap (see §11.3) |
| Stop → `endMeeting` | yes, by design (`:3011–3021`, `:3057–3106`) | **CONFIRMED intended** |
| Application shutdown → `before-quit` (`:4719–4786`) | stops native tap, Ollama, PhoneMirror, Live Interview; **does not call `endMeeting`** — capture/STT release relies on process teardown | **UNVERIFIED (risk)** — flagged in §18 |

**Paths that can duplicate or strand audio** (all in `main.ts`, none in window code): `reconfigureSttProvider` (`:2307–2357`) re-creates captures and is callable from Settings mid-session; `restartCapturesAfterResume` (`:1909–1960`, powerMonitor `:4560–4570`); the recovery handlers `setupAudioRecoveryHandler` (`:2374`) / `setupMicRecoveryHandler` (`:2581`); and `startAudioTest` (`:2649–2676`), which correctly refuses while a meeting is live (`:2653–2661`). Each has its own stop/null sequencing, which is where duplication would originate — **not** in the overlay repair.

### 10.3 Provider behaviour versus approved rules (brief §7.3)

| Rule | Source | Verdict |
|---|---|---|
| Sherpa-ONNX is the intended primary local provider | `createSTTProvider` `'sherpa'` branch `main.ts:1211–1223`; service `src/main/services/SherpaAutoService.ts`; adapter `electron/audio/SherpaSTT.ts` | **CONFIRMED present** |
| Automatic language detection | multilingual Whisper with `language: ''` (`SherpaAutoService.ts:185`, comment `:174–175`) | **CONFIRMED** |
| Manual override English / Hindi / Marathi | `SherpaSTT.setRecognitionLanguage(_language)` is an intentional no-op (`:89–91`); `RECOGNITION_LANGUAGES` (`electron/config/languages.ts:63–78`) has `auto` + English variants + 11 others but **neither Hindi nor Marathi**; `main.ts:1251`/`:3388–3398` therefore cannot affect Sherpa | **NOT CONFIRMED — requirement gap (F15)** |
| No silent provider switching | documented fallbacks: `'groq/azure/ibmwatson/custom-stt'` without a key → `WebSpeechSTT` (`:1205–1210`); `'sherpa'` failing to load → `WebSpeechSTT` (`:1219–1222`); every cloud provider without a key → `_safeGoogleSTT` → Google or `null` (`:1124`, `:1140`, `:1151`, `:1162`, `:1177`, `:1245`, helper `:1097–1104`) | **REQUIREMENT CONFLICT (F15)** — each emits a `console.warn` and an `audio-capture-failed` banner only for *init failure*, not for *substitution* (`:1807`, `:1827`) |
| Clear initialization/failure status | `get-stt-pipeline-diagnostics` (`ipcHandlers.ts:317–327`) + `getAudioPipelineDiagnostics` (`main.ts:734–750`) + `stt-status` events (`:1344`, `:1359`, `:1370`, `:1387`) + `SherpaAutoService.getDiagnostics()` (`:67–75`) | **PARTIALLY CONFIRMED** — data exists; `sttConnected: !!this.googleSTT` is "object exists", not "running" (Module 04A F-7) |
| Sherpa retry where possible | `ensureInitialized()` sets `initialized = true` **before** `init()` (`:59–65`); on failure `recognizer = null` + `initError` (`:199–203`) → every later call short-circuits and returns `false` **for the process lifetime** | **NOT CONFIRMED — defect (F15)** |
| Manual chat available when STT unavailable | chat path independent of `sttProvider`; `'none'` returns `null` providers and only disables transcription (`:1110–1116`) | **CONFIRMED** |
| Preserve Local Whisper / legacy files | `electron/audio/LocalWhisperSTT.ts`, `electron/audio/whisper/*`, `eng.traineddata`, model files, plus backup files (`LocalWhisperSTT - Backup.ts`, `MicrophoneCapture -Backup.ts`) | **NO REMOVAL RECOMMENDED**; a separate dependency/model inventory is a precondition (brief §7.3) |

---

## 11. Answer-generation and streaming impact

### 11.1 The three approved paths, as they exist

| Path | Entry | Pipeline | Notes |
|---|---|---|---|
| **A. Manual chat** | textbox + Enter (`NativelyInterface.tsx:1743`), Send button (`:1783`), stealth-tap submit (`:1120`) → `handleManualSubmit` (`:881–905`) | invoke → `IntelligenceManager`/`LLMHelper`; results streamed on `intelligence-manual-started` / `intelligence-manual-result` (`main.ts:3342`, `:3349`) | independent of STT **[S]**, requirement 8.A satisfiable |
| **B. What to Answer** | dedicated button → `handleWhatToSay` (`:759`); Ctrl+1 → `global-shortcut` (`:1091–1095`) → same `handleWhatToSay` | `api.generateWhatToSay(undefined, images, opts)` (`:787`) → `generate-what-to-say` (`ipcHandlers.ts:2829`–`:2973`) → `runWhatShouldISay` (`IntelligenceEngine.ts:521`) | button and shortcut already share one handler (requirement 8.B satisfied structurally) |
| **C. Automatic answer** | interviewer **partials** → `maybeSpeculate` (`IntelligenceEngine.ts:211–239`) with confidence/word-count/question-signal gates (`:204–207`, `:219–222`) and cooldown (`:234`); **final** interviewer segments feed `handleTranscript` (`:244–256`) | results on `suggested_answer` / `suggested_answer_token` (`:678`, `:688`) | dedupe = Jaccard + containment vs the speculative text (`:192–201`, `:391–399`, threshold `:114`) |

Requirement 8.C's "generate only after a **complete** interviewer question" is only partly expressible statically: the question-signal heuristic (`:204–207`) accepts partials that merely contain an interrogative word, and `handleSuggestionTrigger` (`:360–412`) — the final-question entry — has **no live caller** in `electron/main.ts`/`ipcHandlers.ts` (only `IntelligenceManager.ts:145–147` re-exports it). **PARTIALLY CONFIRMED — §20 Q8.**

### 11.2 Routing defect that lazy loading makes visible (F12)

`setupIntelligenceEvents` binds `const mainWindow = this.getMainWindow.bind(this)` (`main.ts:3216`) and then delivers **17** streams to that single, mode-dependent window: `intelligence-suggested-answer` `:3259`, `-token` `:3267`, `negotiation-coaching` `:3278`, `refined-answer*` `:3285/:3292`, `recap*` `:3300/:3307`, `clarify*` `:3314/:3321`, `follow-up-questions*` `:3328/:3335`, `manual-started/result` `:3342/:3349`, `mode-changed` `:3357`, `error` `:3365`. Only the **overlay** document subscribes (`NativelyInterface.tsx:1009–1041`); `getMainWindow()` returns the **launcher** whenever `currentWindowMode==='launcher'` (`WindowHelper.ts:567–572`), which is exactly the state after Home (S07) and, today, after Start (F02). Two events (`assist_update` `:3226–3227`, `dynamic_action_emitted` `:3234–3235`) already send to **both** windows — proving the intended pattern exists and the other 15 simply never adopted it. **CONFIRMED.**

### 11.3 Does lazy loading risk lost IPC, duplicate subscriptions or late streaming init? (brief §8)

| Risk | Assessment | Evidence |
|---|---|---|
| Pending messages lost because the document mounts later | **Real but bounded.** All 17 streams are fire-and-forget `webContents.send` with no buffering or replay; anything emitted before `useIpc` installs (`NativelyInterface.tsx:971–1125`, after mount) is dropped. In L2 the session and its pipeline start **before** the overlay is ready, so early transcripts/answers can be missed today too | `main.ts:1288–1289` (transcript fan-out), `:3256–3365`; no queue/replay mechanism found |
| Mitigation already present | Start sends `session-reset` to the overlay **after** creation returns (`main.ts:2881`), and the renderer re-fetches model/mode/modes/flags on mount (`NativelyInterface.tsx:665–676`) — state is pull-based at mount, so steady-state UI recovers; only **transient in-flight streams** are the exposure | **[S]** |
| Duplicate subscriptions | **No.** `useIpc` subscribes once per mount and returns unsubscribers (`:240–246`); each new overlay is a new renderer process; in dev, `React.StrictMode` double-mount is cleaned between passes (`src/main.tsx:60`) | **[S]** |
| Streaming initialisation delay | First-answer stream needs the renderer alive; with lazy creation, a Start→immediate-Ctrl+1 sequence can race mount | **[NV]**, must be measured (T-06) |

**Repair position:** keep the reveal-then-show ordering of §5.3 (overlay `ready` before the session marks itself usable) and, if answers must never be missed while the launcher is current, extend the existing both-windows pattern (`:3226–3227`) to the 15 mode-routed channels rather than inventing a replay buffer.

---

## 12. Performance bottleneck inventory (brief §9)

Counts below are structural facts from this snapshot; **no duration, frame rate or memory figure is claimed**, because nothing was run.

### 12.1 Launcher (L0)

| Aspect | Current state | Evidence | Classification |
|---|---|---|---|
| Startup init cost | `AppState` constructor does settings, 4 window helpers, screenshot/processing helpers, RAG, Ollama bootstrap, intent warm-up, updater, keybinds, stealth IPC; `initializeApp` then runs telemetry, credentials, disguise, tray, shortcuts, powerMonitor, calendar, recovery + retention cleanup | `main.ts:341–692`, `:4442–4684` | Required-while-open (most), **review candidates**: `recoverUnprocessedMeetings()` `:4673` and `runRetentionCleanup()` `:4680` can issue DB/LLM work at launch with no session |
| Renderer complexity | one shared bundle for all 5 documents; `App.tsx` statically imports `NativelyInterface` (1 800 lines) and `Launcher` (1 207 lines) regardless of which renders; only `Cropper` is lazy | `App.tsx:4`, `:6`, `:47`; chunks §3 | **Unnecessary for the launcher** — but fixing it is code-splitting work, **outside this repair** (would touch `vite.config.mts`, `App.tsx`) |
| IPC subscription count | ≈12 in the launcher document: 8 `App.tsx` (`:274`, `:292`, `:297`, `:307`, `:313`, `:323`, `:329`) + 3 `Launcher.tsx` (`:173`, `:191`, `:198`) + 1 `useShortcuts` (`:176`) | [S] | Reasonable |
| Timers/polling | 60 s calendar fetch (`Launcher.tsx:204`); 30 s trial poll **only if a trial token exists** (`App.tsx:258–271`); 500 ms trial countdown while a trial banner is shown (`FreeTrialBanner.tsx:40`, mounted `App.tsx:687–688`); 2 s diagnostics poll **only while Settings Audio tab is open** (`SettingsOverlay.tsx:577–588`); 60 s calendar poll in the same gated pattern (`:619–627`); 10 s keybind health check in main (`KeybindManager.ts:358–365`) | [S] | All gated/interval-bound; none overlay-related |
| Does hidden-overlay work still run? | **Today yes** (the overlay document exists and runs its own copies of `App.tsx` effects + 50 subscriptions). **After F01 is fixed: no** | §9.1 | the actual win |

### 12.2 Overlay (L3–L6)

| Aspect | Current state | Evidence |
|---|---|---|
| Window creation + load | `new BrowserWindow` (`WindowHelper.ts:386`) then `loadUrlWithRetry(…, 10 attempts, exponential back-off)` (`:18–58`, `:422`); initial geometry `height: 1` (`:361`) so the shell is only correct after the renderer reports size (`NativelyInterface.tsx:592–610`) | real duration **[NV]** |
| React mount cost | 19 `useEffect` in `NativelyInterface`, 7 in `App.tsx`; heavy static imports (Prism syntax highlighter, react-markdown + remark/rehype + KaTeX CSS `katex/dist/katex.min.css`, framer-motion) | `NativelyInterface.tsx:1–30`, `:369–381`; effect counts measured |
| Potentially expensive visual layer | glass theme mounts `GlassEffectLayer` inside the overlay shell (`NativelyInterface.tsx:1419`, component `src/components/ui/GlassEffectLayer.tsx` 127 lines, displacement-map helper `src/lib/glassDisplacementMap.ts`) on a `transparent:true` window (`WindowHelper.ts:375`) while hardware acceleration is disabled at startup (`main.ts:4386–4390`) — SVG-filter/compositor cost is a known class; magnitude **[NV]** |
| Re-render behaviour during streaming | tokens are buffered and flushed once per animation frame (`queueToken` `:454–460`, `commitTokens` `:441–453`), so React renders are frame-coalesced by design | [S] — good |
| IPC subscriptions / duplicates | 50 (`useIpc` `:971–1125`) + overlay-scoped opacity/theme (`App.tsx:348–367`); unsubscribed on unmount (`:242–243`) → duplicates only if a *second* document loads, which F01 prevents | [S] |
| Timers/polling inside the overlay | `DynamicActionBar` interval (`:86`), rAF scroll loops (`:1141–1219`, `:1221+`), 600 ms size report (`:610`), 3 s "speaking" clear (`:997`), 5 s perf-alert timer (`:1083`) | all render-local, none audio |
| Cleanup at Stop / destroy | renderer state disappears with the process; main-process listeners are per-window (`WindowHelper.ts:410`, `:414`, `:525–565`) so they die with it — **except** the missing `closed` handler (F11) | [S-C] |
| Start → usable overlay time | **UNVERIFIED [NV]** — the single most important measurement for T-02/T-06 |

### 12.3 Audio / STT

| Aspect | Current state | Evidence |
|---|---|---|
| Where inference runs | **Main process, synchronously on the audio data callback.** `MicrophoneCapture`/`SystemAudioCapture` `'data'` → `stt.write(chunk)` (`main.ts:1714`, `:1723`, and the system-audio equivalents in `wireSystemCapture`) → `SherpaSTT.write()` (`SherpaSTT.ts:67–77`) → `processChunk` (`SherpaAutoService.ts:241–260`) → `drainSegments` → `decodeSegment` → `recognizer.decode(stream)` (`:340–354`, `numThreads: 2`, `provider:'cpu'` `:189–193`) | [S] — this is the biggest main-thread contention candidate, magnitude **[NV]** |
| Audio copies/conversions | Int16 Buffer → Float32 resample per chunk (`SherpaSTT.ts:71` `resampleToF32`); the redundant `Buffer.from` copies were already removed in both captures (`MicrophoneCapture.ts:96–98`) | [S] |
| VAD | in-process Silero VAD per logical channel (`SherpaAutoService.ts:249`, `:253`, VAD comment `:29`) | [S] |
| Recognizer duplication | prevented by `if (!this.googleSTT)` / `if (!this.googleSTT_User)` guards (`main.ts:1798`, `:1818`) and null-after-stop discipline (`:3095–3106`) | [S] |
| Main-thread blocking elsewhere | native capture stops deferred with `setImmediate` and an explanatory comment (`MicrophoneCapture.ts:121–136`; rationale quoted in `main.ts:2996–3003`); macOS monitor stop measured by the code as 30–80 ms, Windows 100–300 ms (**[NV]** for this machine) | [S] |
| IPC frequency | 2 `native-audio-transcript` sends **per segment** (launcher + overlay, `main.ts:1288–1289`); up to 17 intelligence channels per answer, token-level for code-hint/brainstorm/recap/clarify/follow-up (`IntelligenceEngine.ts:1066`, `:1144`) | [S] |
| Independent of overlay visibility? | **YES** — capture → STT → intelligence all live in `main.ts`/`IntelligenceEngine`; the overlay is a display sink only (`WindowHelper.ts` audio-reference count 0) | **CONFIRMED** |

### 12.4 LLM streaming

| Aspect | Current state | Evidence |
|---|---|---|
| Request init delay | `generate-what-to-say` performs screen-context/vision preparation and knowledge-base lookups before the model call (`ipcHandlers.ts:2829–2958`) | [S]; magnitude **[NV]** |
| Event path | engine `emit` → `setupIntelligenceEvents` → `webContents.send` → `useIpc` handler → rAF-batched state update | `main.ts:3216–3365`; `NativelyInterface.tsx:971–1125`, `:441–460` |
| IPC overhead | one send per token on the per-token channels; single send for the completed What-to-Say answer (`IntelligenceEngine.ts:678` then `:688`) | [S] |
| Duplicate-generation prevention | speculative-vs-final similarity (`:192–201`, `:391–399`, threshold `:114`), cooldown `:234`/`:651`, renderer re-entrancy guard `isProcessingRef` (`NativelyInterface.tsx:760`) | [S] |
| Streaming while hidden / launcher current | hidden overlay → continues (document alive, `backgroundThrottling:false` `WindowHelper.ts:371`). Launcher current → **events are routed to the launcher and dropped** (F12) | **CONFIRMED defect** |

### 12.5 Background services inventory (classification per brief §9.5)

| Item | Where | Class |
|---|---|---|
| Keybind health check 10 s | `KeybindManager.ts:358–365` | required while app open |
| Calendar 60 s (launcher), Settings-tab 2 s diagnostics, 500 ms trial tick | `Launcher.tsx:204`; `SettingsOverlay.tsx:586`, `:625`; `FreeTrialBanner.tsx:40` | required only while that UI is open (already gated) |
| Trial poll 30 s | `App.tsx:270` | required while a trial exists — **currently duplicated per document**; becomes overlay-free after F01 |
| Default-output watcher | `main.ts:2500` (started `:2932`, stopped `:3016`/`:3145`) | session-only ✓ correctly scoped |
| Live RAG indexing | `rag/LiveRAGIndexer.ts:54` (started `main.ts:2924`) | session-only ✓ |
| STT keep-alive/safety timers | `DeepgramStreamingSTT.ts:193`, `OpenAIStreamingSTT.ts:604`/`:690`, `SonioxStreamingSTT.ts:384`, `RestSTT.ts:215`/`:281` | session-only, provider-owned ✓ |
| Whisper self-chaining timeout | `LocalWhisperSTT.ts:105` | session-only ✓ |
| Ollama poll, ModelVersionManager discovery, RateLimiter refill, KnowledgeBase cache cleanup | `services/OllamaManager.ts:111`, `services/ModelVersionManager.ts:937`, `services/RateLimiter.ts:40`, `src/main/services/KnowledgeBase.ts:61` | required while app open (or feature-gated) |
| PhoneMirror ping / Live-Interview capture worker | `services/PhoneMirrorService.ts:373`, `live-interview/captureWorker.ts:167` | feature-gated ✓ |
| Auto-updater, install ping, telemetry | `main.ts:692`, `:4502–4503`, `:4444–4684` | required at launch per existing design |
| **Potentially duplicative** | nothing found that duplicates overlay work; the one true duplication is the per-document `App.tsx` effect set while the overlay exists (fixed by F01) | — |

---

## 13. Confirmed defects with exact source evidence

Fields per the brief: ID · Severity · Requirement · File + line range · Method · Current · Expected · Root cause · Evidence · Basis · Minimal change · Other components affected · Regression risk · Test.

---

**F01 — Overlay BrowserWindow and renderer are created and mounted at application launch**
* Severity **Critical** · Requirement §5.1 · Verdict **CONFIRMED**
* File/function: `electron/WindowHelper.ts` → `WindowHelper.createWindow()` `:192–330`, call at `:327`; constructor `:386`; load `:422`
* Current: boot creates the hidden overlay and starts loading `?window=overlay`; `App.tsx:482–508` mounts `NativelyInterface`; `:971–1125` installs 50 IPC subscriptions; `App.tsx:201–336` runs the license/trial effects including a 30 s poll; `NativelyInterface.tsx:665–676` writes the model and broadcasts `model-changed`
* Expected: no overlay window and no overlay document before Start
* Root cause: a boot-time prewarm retained after the hidden-overlay design; reached because `AppState.createWindow()` (`main.ts:3556–3558`) is called un-awaited (`:4520`)
* Evidence: `main.ts:4520`; `WindowHelper.ts:327`/`:386`/`:422`; `App.tsx:41`/`:482`; **[B]** `dist-electron/electron/main.js:176247`
* Basis: source-confirmed
* Minimal change: delete the `ensureOverlayWindow()` call at `WindowHelper.ts:327` only; keep `setupWindowListeners()` (`:329`), which is launcher-only (`:470–522`)
* Also affects: F03/F06 shortcut paths, first-Start latency (§9.3), analytics semantics (`App.tsx:65–86`)
* Regression risk: **high if done alone** — F08/F09/F10 become reachable on the main user path; must land after them
* Test: T-01, T-02, T-14

---

**F02 — Start keeps the launcher visible and never reveals the overlay**
* Severity **Critical** · Requirement §5.3 steps 5–6 · Verdict **REQUIREMENT CONFLICT** (source intent vs approved rule; Module 04B §4.3 endorsed the source — see C01)
* File/function: `electron/main.ts` → `AppState.startMeeting()` `:2753–2949`, block `:2822–2840`
* Current: `:2826` `resetOverlayPosition()`, `:2832` `switchToLauncher(false)`, `:2833` fire-and-forget hidden creation, `:2838–2840` mark active; comment `:2828–2831` states revealing is forbidden; the renderer sends no follow-up switch (`App.tsx:405–409`)
* Expected: session starts → overlay created → loaded → **shown** → launcher hidden (state L3)
* Root cause: an earlier "start in the background" decision hard-coded in both the main process and a renderer comment; the requirement has since changed
* Evidence: `main.ts:2828–2840`; `App.tsx:405–409`; chain `Launcher.tsx:777` → `App.tsx:384–416` → `ipcHandlers.ts:2706`
* Basis: source-confirmed
* Minimal change: await the creation primitive in `startMeeting`, then on success perform exactly one reveal + launcher hide (reuse `switchToOverlay`, `WindowHelper.ts:697`); keep audio init in the existing deferred block (`:2888–2948`) so the IPC response stays fast; update `:2828–2831` and `App.tsx:405–409` together
* Also affects: F08 (hide only when usable), F12 (interface must become `overlay` for answers to route), S04/S05/S13
* Regression risk: medium — the reveal must wait for `ready`, not merely existence, because the window is born `height: 1` (`:361`) and is sized by the renderer
* Test: T-02, T-03, T-06

---

**F03 — Ctrl+B is not registered before a session; the fallback hides the launcher irrecoverably**
* Severity **High** · Requirement §5.2 (mandatory) · Verdict **CONFIRMED** (overrides Module 04B — see C02)
* File/function: `KeybindManager.ts` `shouldRegister` `:99–118` (gate `:101`, unreachable duplicate `:105`), `setSessionActive` `:88–93`, `registerGlobalShortcuts` `:277–300`; `Launcher.tsx:217–240`; `main.ts:3571–3595`; `WindowHelper.ts` `toggleMainWindow` `:676–682`, `hideMainWindow` `:603–609`
* Current: pre-session no OS chord exists; the only route is a DOM chord needing launcher focus, which calls `hideMainWindow()` and hides **both** surfaces; afterwards nothing global can restore it (tray only when `!isUndetectable()`, `main.ts:4539–4542`)
* Expected: Ctrl+B hides/restores the **launcher** with no session, no overlay creation, no capture
* Root cause: the visibility chord was scoped to the session lifetime, and the shared hide primitive acts on both windows
* Evidence: as listed; Module 04A C.2 and F-4 independently agree
* Basis: source-confirmed on Windows; macOS menu/dock recovery **[NV]**
* Minimal change: register `general:toggle-visibility` unconditionally (remove the `sessionActive` term at `:101`, delete the dead branch at `:105`); branch in `toggleAssistantOverlay`: idle → launcher hide/show through a **single-surface** primitive; active → §5.4/§5.6
* Also affects: F05, F14, macOS menu owner (`KeybindManager.ts:425–432`)
* Regression risk: medium — always-on Ctrl+B intersects text editing (D-13); decide the input guard in the same change
* Test: T-01, T-04, T-05

---

**F04 — Ctrl+B on the visible overlay also returns to the launcher**
* Severity **High** · Requirement §5.4 · Verdict **CONFIRMED**
* File/function: `main.ts` → `toggleAssistantOverlay()` `:3600–3660`, hide branch `:3638–3646`; `WindowHelper.switchToLauncher` `:788–824`
* Current: `hideOverlay(cid)` (`:3641`) then `switchToLauncher(true)` (`:3646`) — the toggle is Hide + Home combined; comment `:3643–3644` justifies it as "never strand the user on an empty desktop"
* Expected: hide the overlay only; the next press restores the same overlay; the launcher must not appear
* Root cause: Ctrl+B implemented as a surface switch, not a visibility toggle
* Evidence: `main.ts:3638–3646`; `WindowHelper.ts:813–818` shows the launcher, `:821–823` hides the overlay
* Basis: source-confirmed
* Minimal change: remove the `switchToLauncher(true)` call from the hide branch; keep `hideOverlay`/`showOverlay` as the only primitives used by this branch
* Also affects: F05, F06 (mode must not silently become `launcher`), S05/S06
* Regression risk: medium — with content protection on, re-show must not mis-handle the 60 ms opacity ramp (`WindowHelper.ts:735–745`)
* Test: T-05, T-07

---

**F05 — Ctrl+B after Home opens the overlay instead of toggling the launcher**
* Severity **High** · Requirement §5.6 · Verdict **CONFIRMED**
* File/function: `main.ts` `toggleAssistantOverlay` `:3612–3651` (never reads `getCurrentWindowMode()`; logs it at `:3609`); `WindowHelper.switchToOverlay` `:697–786`
* Current: session active + overlay not visible → `switchToOverlay(cid)` (`:3649`) → interface becomes `overlay` (`:699–700`) and the launcher hides (`:783–785`)
* Expected: with the launcher current, Ctrl+B hides/restores the launcher; only Meeting Ongoing restores the overlay
* Root cause: intended interface inferred from overlay visibility instead of stored; Module 04A D.5 recorded the same missing last-mode fallback
* Evidence: `main.ts:3609`, `:3649`; `WindowHelper.ts:699–700`, `:783–785`; Home `NativelyInterface.tsx:1399`
* Basis: source-confirmed
* Minimal change: dispatch on the stored current interface (INV-5) — `overlay` → overlay hide/show, `launcher` → launcher hide/show; reuse `currentWindowMode` as the store (written at `:699`/`:790`)
* Also affects: F03, F14, Ctrl+1 eligibility (INV-6), S08/S09
* Regression risk: medium — screenshot restore (`main.ts:3722–3731`) uses the same primitives
* Test: T-08

---

**F06 — Ctrl+1 eligibility is derived from window mode, not from session + current interface + actual visibility**
* Severity **High** · Requirement §6 · Verdict **CONFIRMED**
* File/function: `KeybindManager.ts:102`; `main.ts:461–480` (mode-driven `switchToOverlay(true)` at `:478`) and `:575–595` (un gated broadcast to every window); `WindowHelper.hideOverlay` `:655–666`; `NativelyInterface.tsx:1091–1105`, `handleWhatToSay` `:759–764` (`setIsExpanded(true)` `:763`), expand effect `:689–712` (`api.showOverlay()` `:698`)
* Current: (a) the pill Hide chip collapses (`NativelyInterface.tsx:1396`) and the effect calls `hideOverlay()` (`:705–708`) while the mode stays `overlay`, so Ctrl+1 remains armed and the answer runs while hidden; (b) that answer then **re-reveals** the overlay through `:763`→`:698`; (c) in launcher mode `:475–480` may switch surfaces before answering
* Expected: the §6 table exactly — answer only when session active **and** overlay current **and** overlay visible; never a reveal from the shortcut
* Root cause: registration mode used as a stand-in for "the assistant is the working surface"; the broadcast is window-agnostic by design for stealth
* Evidence: `KeybindManager.ts:102`; `WindowHelper.ts:655–666`; `main.ts:588–595`; `NativelyInterface.tsx:763`, `:698`; Module 04A F-11 classifies the reveal as a static consequence, re-verified here
* Basis: source-confirmed **[S-C]**
* Minimal change: one main-process gate before dispatching chat actions — `sessionState==='active' && currentInterface==='overlay' && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()`; **no `isFocused()`** (Module 04A D.2 + requirement §6); keep the button path untouched; suppress reveal-on-answer
* Also affects: F04/F05, F07, S11/S12/S13
* Regression risk: **medium-high** — mouse passthrough and `showInactive()` must satisfy `isVisible()` without focus (`WindowHelper.ts:640–646`, `:753–755`)
* Test: T-09, T-10, T-11

---

**F07 — Multiple competing Ctrl+B / What-to-Answer owners; one Ctrl+B path is expand-collapse**
* Severity **High** · Requirements §5.4, §6 · Verdict **CONFIRMED** (owners) · **UNVERIFIED** (one press reaching two owners simultaneously — Module 04A F-3)
* File/function: `main.ts:482–485`, `:3584–3593` (`toggle-expand` send at `:3591`); `KeybindManager.ts:277–300` and `:425–432` (macOS menu → `toggleMainWindow`); `Launcher.tsx:219–221`; `NativelyInterface.tsx:972`, `:1179`, `:1191`
* Current: four owners, three different effects; `:1179` fires whenever the overlay document has focus, bypassing every main-process gate
* Expected: one owner per chord per behaviour; Ctrl+B never resizes
* Root cause: layered fallbacks for registration failure and stealth, never consolidated
* Basis: source-confirmed
* Minimal change: main process owns `general:toggle-visibility` and the chat actions; renderer chords deleted or re-pointed at the same gated IPC; keep the registration-failure IPC (`KeybindManager.ts:289–298`)
* Also affects: D-13 input-guard decision
* Regression risk: medium — removing DOM chords leaves no Ctrl+B if OS registration fails, which is exactly why the failure signal must stay
* Test: T-04, T-05, T-09, T-17

---

**F08 — `switchToOverlay()` changes the interface and hides the launcher before proving usability**
* Severity **High** · Requirements §5.3, §5.9 · Verdict **CONFIRMED**
* File/function: `WindowHelper.switchToOverlay` `:697–786` — writes at `:699–700`, un-guarded send at `:702`, usability branch `:704` vs `:779–781`, unconditional launcher hide `:783–785`; callers `main.ts:478`, `:3628`, `:3649`, `:3728`; `ipcHandlers.ts:197`
* Current: no usable overlay ⇒ interface flips to `overlay` and the launcher hides anyway ⇒ empty desktop with a live session
* Expected: never hide the launcher unless the overlay is shown in the same operation; return a status so callers can fall back
* Root cause: the primitive mixes intent, eventing and visibility with no precondition or result
* Evidence: `WindowHelper.ts:699–702`, `:779–785`; independently reproduced in Module 04B §5.5/§5.7; Module 04 D-09
* Basis: source-confirmed
* Minimal change: order as *usability check → (await or refuse if in flight) → bounds/opacity/show → interface + `KeybindManager.setMode` write → launcher hide*, returning `boolean`; add `isDestroyed()` to `:702`
* Also affects: F02 (Start relies on this order), F09, F11, F12, S10/S16/S17
* Regression risk: low-medium — three call sites currently depend on the mode side effect
* Test: T-06, T-12, T-13

---

**F09 — No creation generation / cancellation; teardown cannot invalidate an in-flight creation; creation failure is log-only**
* Severity **High** · Requirement §5.9 · Verdict **CONFIRMED**
* File/function: `WindowHelper` `_overlayCreating` `:332`, alive-check `:343–346`, join `:348–351`, IIFE `:353–434`, `finally` `:435–437`, `destroyOverlayWindow` `:446–458`; consumers `main.ts:2833–2835`, `:3620–3636`; throw path `WindowHelper.ts:386`
* Current: Stop during creation destroys the window but leaves the promise; the next Start **joins the stale promise** and creates nothing → session runs with no overlay until Ctrl+B. A constructor throw is swallowed into `console.error` while the session stays `active`
* Expected: no stale promise, no orphaned audio/STT, retry possible, existing session never destroyed by a failed visibility operation
* Root cause: join-optimisation without a generation stamp and without teardown interaction
* Evidence: `WindowHelper.ts:332`/`:348–351`/`:435–437`/`:446–458`; the codebase already uses generation-style guards at `main.ts:3114` (`_sessionId === endedSessionId`) and awaits teardown at `:2766–2774`
* Basis: source-confirmed
* Minimal change (smallest safe, answering §5.9 directly): add an integer **creation generation** to `WindowHelper`, increment it in `destroyOverlayWindow()` and at creation start, capture it in the closure, refuse to publish `this.overlayWindow` if it changed across the `await`, and clear `_overlayCreating` in the teardown primitive. A full cancellation token is **not** required
* Also affects: F10, F02, S16/S17/S18
* Regression risk: medium — rollback must not fight the `_pendingTeardown` await
* Test: T-12, T-13, T-14, T-15

---

**F10 — Renderer load failure yields a live, blank, listener-less window and a promise that still resolves**
* Severity **Medium** (High once F01 lands) · Requirement §5.9 · Verdict **CONFIRMED**
* File/function: `loadUrlWithRetry` `WindowHelper.ts:18–58` (destroyed-window short-circuit `:26`, transient list `:33–41`), call site `:422`, `if (loadOk)` `:429–432`, completion log `:434`
* Current: on `false` the window survives at `height: 1` (`:361`) with `show:false` (`:373`), `setupOverlayWindowListeners()` is skipped (so no move/resize/context-menu/blur/`close` handling), and callers see success; Ctrl+B then reveals a blank transparent surface because the usability check at `:704` only tests existence
* Expected: "ready" must mean *window created **and** document loaded*; failure must be reported and retryable
* Root cause: the success signal is existence, not load outcome; the load result is logged but not propagated
* Evidence: `WindowHelper.ts:422`, `:429–434`; dev vs prod failure classes (`localhost:5180` vs `file://<root>/dist/index.html`, `:12–14`) make `ERR_ABORTED`/`ERR_FILE_NOT_FOUND` non-transient by `:33–41`
* Basis: source-confirmed; **actual occurrence [NV]**
* Minimal change: have `ensureOverlayWindow()` resolve `false`/throw on load failure, treat `ready` as window **and** load success, and destroy the partial window on failure so retry is clean
* Also affects: F08, F09, S16
* Regression risk: low
* Test: T-14

---

**F11 — No `closed` handler for the overlay; destroyed-but-non-null references throw on several accessors**
* Severity **Medium** · Requirement §5.9 · Verdict **CONFIRMED**
* File/function: `WindowHelper.setupOverlayWindowListeners` `:525–565` (listeners: move `:528`, resize `:534`, `system-context-menu` `:540`, win32 blur `:547–552`, close `:555–564` — **no `closed`, no `unresponsive`**); `getMainWindow` `:567–572`; `hideMainWindow` `:603–609`; `switchToOverlay` `:702`; `main.ts:3618` diagnostic block before the `isDestroyed()` branch at `:3620`
* Current: `close()` while hidden is not prevented → Electron fires `closed` → the field keeps a destroyed object; truthiness tests at `:568` then hand a dead window to callers, and `:702`/`:605–607`/`main.ts:3618` call methods that throw
* Expected: destroyed references never escape; an unexpected close during an active session either re-creates or degrades visibly
* Root cause: teardown discipline relies solely on `destroyOverlayWindow()` nulling the field (`:448`)
* Evidence: as listed; Module 04A F-9 and Module 04 D-12 agree
* Basis: source-confirmed; **whether any current path closes a hidden overlay** is **[NV]**
* Minimal change: add `overlayWindow.on('closed', …)` nulling the field (+ F09's generation bump), add `isDestroyed()` to `:568`, `:702`, `:605–607`, and guard `main.ts:3618`
* Also affects: F08, F09, S17, tray/quit paths
* Regression risk: low
* Test: T-16

---

**F12 — Answer/intelligence streams are routed to the mode-dependent window, which is the launcher whenever the launcher is current; only the overlay subscribes**
* Severity **High** · Requirements §5.5, §8, §11 · Verdict **CONFIRMED** — **not present in Modules 04/04A/04B**
* File/function: `main.ts` → `setupIntelligenceEvents()` `:3215–3370`; `const mainWindow = this.getMainWindow.bind(this)` `:3216`; channels `:3259`, `:3267`, `:3278`, `:3285`, `:3292`, `:3300`, `:3307`, `:3314`, `:3321`, `:3328`, `:3335`, `:3342`, `:3349`, `:3357`, `:3365`; `WindowHelper.getMainWindow` `:567–572`; consumers `NativelyInterface.tsx:1009–1041` (overlay only)
* Current: with `currentWindowMode==='launcher'` (after Home; and **after Start today**) every answer, token stream, recap, clarify, follow-up, manual result and error is sent to a document with no handler, so the answer is silently lost. Two channels already do it correctly (`assist_update` `:3226–3227`, `dynamic_action_emitted` `:3234–3235` fan out to launcher **and** overlay)
* Expected: automatic answers must reach the assistant overlay regardless of which surface is current (requirement §9.4: "streaming can continue while the overlay is hidden or launcher is current, where existing design requires it")
* Root cause: "main window" conflates *current interface* with *session UI*, the same category error as C03
* Evidence: `main.ts:3216`, `:3256–3365` vs `:3226–3235`; `NativelyInterface.tsx:1009–1041`; `grep` shows no `onIntelligenceSuggestedAnswer*` consumer outside `NativelyInterface` (`src/_pages/*` are unreferenced dead code)
* Basis: source-confirmed; the audible symptom ("answer never appears after Home") is **[NV]**
* Minimal change: route the 15 mode-routed channels to the **overlay window** (the session UI), matching the existing two-channel pattern; keep launcher fan-out only for channels the launcher actually renders
* Also affects: F02 (Start must make the overlay current anyway), §11.3, S07/S20/S22
* Regression risk: medium — sending to a window that may be mid-reload; must keep the `isDestroyed()` guards
* Test: T-08, T-18, T-19

---

**F13 — The launcher discards the `stopping` state, and overlay destruction is deferred behind the drain**
* Severity **Medium** · Requirements §5.8, §5.9 · Verdict **PARTIALLY CONFIRMED** (behaviour confirmed; "is that acceptable" is a requirement question)
* File/function: `main.ts` `endMeeting` synchronous flip `:2988–2993`; `_pendingTeardown` IIFE `:3041–3121`; 250 ms drain `:3057`; destroy `:3110–3119`; consumer `preload.ts:604–608`; `Launcher.tsx:191–194` destructures `{ isActive }` only; CTA render `:768–838`
* Current: the pill flips to "Start Natively" immediately while `state==='stopping'` is delivered and thrown away; the window is destroyed some hundreds of ms later (after model revert, STT stop, meeting save, RAG embed)
* Expected (brief §5.8): "Destroy/reset the overlay" and "Restore the idle state" — satisfied, but not *immediately* satisfied
* Root cause: the deferral is deliberate — it protects trailing STT finals and the meeting save (`:3046–3061`, `:3110–3113`)
* Evidence: as listed
* Basis: source-confirmed; **measured destroy latency [NV]**
* Minimal change: consume the already-broadcast `state` in the launcher (disabled "Stopping…" CTA); keep the deferral (moving the destroy earlier would drop trailing transcript and is not approved)
* Also affects: S14/S15/S19, duplicate-Start UX
* Regression risk: low (UI only)
* Test: T-12, T-13

---

**F14 — Two visibility truths, and the interface store is not maintained by teardown**
* Severity **Medium** · Requirements §5.6, §11(3)(4) · Verdict **CONFIRMED**
* File/function: `WindowHelper.isWindowVisible` `:62` — written at `:316`, `:449`, `:467`, `:501`, `:519`, `:608`, `:756`, `:818`; **never** written by `showOverlay` `:625–653` or `hideOverlay` `:655–666`; read by `isVisible()` `:594–596`, `toggleMainWindow` `:676–682`, `main.ts:3610`; `currentWindowMode` `:68` never written by `destroyOverlayWindow` `:446–458`
* Current: `isWindowVisible` means "the last switch made something visible", not "a window is visible"; after a Hide it is stale; after teardown the mode can still say `overlay`
* Expected: one visibility truth per surface, and an interface store that survives teardown correctly (brief §5.6 forbids inferring intent from visibility)
* Root cause: a cached boolean predating per-window primitives
* Evidence: line lists above; Module 04A D.1 and Module 04 D-08 agree
* Basis: source-confirmed
* Minimal change: use `launcherWindow.isVisible()` / `overlayWindow.isVisible()` as the only visibility inputs in new logic; keep `isWindowVisible` for legacy callers or retire it from decisions; write `currentWindowMode='launcher'` (+ `KeybindManager.setMode('launcher')`) inside `destroyOverlayWindow()` (INV-3)
* Also affects: F03/F05, F08, second-instance/activate paths (`main.ts:4432–4438`, `:4690–4710`)
* Regression risk: medium — `hideMainWindow`/`toggleMainWindow` are used by tray, menu and screenshot flows
* Test: T-04, T-05, T-08

---

**F15 — Sherpa provider gaps against the approved STT rules (retry, language override, silent switching)**
* Severity **High** (for the STT requirement, independent of the overlay repair) · Requirement §7.3 · Verdict **PARTIALLY CONFIRMED / REQUIREMENT CONFLICT**
* File/function: `src/main/services/SherpaAutoService.ts` `ensureInitialized()` `:59–65`, `init()` `:160–204` (failure `:163–169`, `:199–203`), `getDiagnostics()` `:67–75`; `electron/audio/SherpaSTT.ts` constructor `:28–42` (throws when not ready), `setRecognitionLanguage(_language)` no-op `:89–91`; `main.ts` `createSTTProvider` sherpa branch `:1211–1223` with silent `WebSpeechSTT` fallback `:1219–1222`, key-less cloud fallbacks `:1124`/`:1140`/`:1151`/`:1162`/`:1177`/`:1245` via `_safeGoogleSTT` `:1097–1104`; language plumbing `:1251`, `setRecognitionLanguage()` `:3388–3398`; `electron/config/languages.ts` `RECOGNITION_LANGUAGES` `:63–78`, `AI_RESPONSE_LANGUAGES` `:80+`
* Current: (1) `initialized` is set true **before** `init()`, so after a failed init every later `ensureInitialized()` short-circuits to `false` for the process lifetime — no retry; (2) manual language selection cannot affect Sherpa at all, and the recognised-language list contains neither Hindi nor Marathi; (3) several documented fallbacks switch provider without a dedicated user-visible signal (init *failure* banners exist at `main.ts:1807`/`:1827`, substitution is `console.warn` only)
* Expected: automatic detection ✔ (present, `SherpaAutoService.ts:185`), manual EN/HI/MR ✘, no silent switching ✘, clear status ~, retry where possible ✘, manual chat still available ✔
* Root cause: prewarm-once design + a language list inherited from the cloud-provider era
* Basis: source-confirmed; whether Sherpa is the provider actually selected on this machine is **[NV]** (credential store)
* Minimal change (kept **out** of the overlay repair, listed for a follow-on): reset `initialized` on failure or use an explicit `failed` state with a bounded retry; map the manual language to the recognizer (or hide the control for Sherpa); emit a distinct "provider substituted" status. **No removal of Local Whisper, legacy files or shared dependencies** — the brief requires a separate inventory first
* Also affects: diagnostics surface (`ipcHandlers.ts:317–327`), Settings → Audio
* Regression risk: medium — provider selection touches credential logic
* Test: T-20

---

**F16 — Only-Interviewer mode gates the physical microphone channel, not the logical interviewer**
* Severity **Low** (clarification) · Requirement §7.4 · Verdict **REQUIREMENT CONFLICT / clarification needed**
* File/function: `main.ts` `_onlyInterviewerMode` `:1079`, restored `:355`, setter `:3409`/`:3426`; `wireMicCapture` mock branch `:1712–1716` (returns early) and only-interviewer gate `:1718–1724` + `speech_ended` gate `:1730–1735`; `startMeeting` mock block `:2905–2913`
* Current: Normal mode → mic audio (candidate) is dropped before `googleSTT_User`, system audio remains the interviewer: consistent with the rule **after routing**. Mock mode → the mic is routed to the interviewer STT and returns **before** the gate (`:1715`), so Only-Interviewer is inert; the code comment `:1719–1720` states this is deliberate ("Disable for mock/self-testing mode")
* Expected (brief §7.4): "Only Interviewer Mode applies to the logical interviewer source after routing"
* Root cause: the flag was implemented per physical channel and mock routing was added later
* Basis: source-confirmed
* Minimal change: **none recommended in this repair** — confirm whether Mock + Only-Interviewer must mean "mic must be dropped (i.e. nothing to transcribe)" or "inert"; the approved wording and the implementation differ, so the requirement needs a decision
* Also affects: transcript gating `:1255–1261`, RAG feed `:1272–1278`
* Regression risk: high if changed silently — it alters which audio reaches STT
* Test: T-21 (behaviour documentation)

---

**F17 — Auxiliary windows and pills are outside the visibility toggles**
* Severity **Medium** · Requirement §5.4 ("synchronise auxiliary windows, pills, resize controls") · Verdict **CONFIRMED** (static) — platform hide semantics **[NV]**
* File/function: `WindowHelper.hideMainWindow` `:603–609` (launcher + overlay only), `hideOverlay` `:655–666`; `SettingsWindowHelper.ts` `:101–104` parent link, `:190`, `closeWindow`; `ModelSelectorWindowHelper.ts` `:56–61`, `:113`; `CropperWindowHelper.ts` `:437`; `NativelyInterface.tsx:1392` (`WindowControls`), `:1394–1400` (TopPill)
* Current: hiding the overlay hides the overlay only; a settings popup or model dropdown parented to it behaves per OS rules; the pill/resize controls are inside the overlay document so they follow it automatically
* Expected: Ctrl+B must not leave floating always-on-top panels
* Root cause: auxiliary windows were added independently of the visibility controller
* Basis: source-confirmed that no code hides them; **[NV]** whether `setParentWindow` already hides them on Windows
* Minimal change: one small synchronisation step in the visibility controller (hide/close model-selector and settings when the overlay is hidden or destroyed by Ctrl+B/Stop) — do this **last**
* Also affects: screenshot restore session bookkeeping (`main.ts:3690–3745`)
* Regression risk: medium — closing a settings panel the user opened from the launcher would be a bug
* Test: T-17

---

**F18 — Unreachable classes and backup files must not be treated as implementation**
* Severity **Low** (process safety) · Verdict **CONFIRMED**
* Not reachable from the live main process: `electron/WindowManager.ts` (imported only by `electron/EnterpriseArchitecture.ts:8/109/1419`, which is imported nowhere), `electron/services/ErrorNotificationService.ts` (same), `electron/main/GlobalErrorHandler.ts` (not imported by `main.ts`/`ipcHandlers.ts`), `electron/sidecar/sidecarIntegration.ts` (no importer), `electron/preload/index.ts` (no window references `preload/index.js`; the overlay uses `preload.js`, `WindowHelper.ts:369`), `src/_pages/Queue.tsx`/`Solutions.tsx`/`Debug.tsx` (no importer — `grep -rn "_pages/" src` → none), `src/components/SuggestionOverlay.tsx` (no importer), `renderer/src/*` (separate CRA-style tree, not built by `vite.config.mts`)
* Backup/derivative files present: `electron/WindowHelper.ts.bak`, `electron/LLMHelper.ts.orig`, `electron/audio/LocalWhisperSTT - Backup.ts`, `electron/audio/MicrophoneCapture -Backup.ts`, `electron_backup_safe/`, `clean_build/`, `vite.config.mts.timestamp-*.mjs`, plus `all_project_paths.txt` (16.8 MB), `logs.txt`, `full_app_errors.txt`, `ELECTRON_BLACK_SCREEN_FORENSIC_REPORT.txt`
* Consequence: Module 04's D-12 style conclusions about `getMainWindow()` and any conclusions drawn from `WindowManager.ts` must be scoped to `WindowHelper.ts` only. Nothing in this report relies on an unreachable file
* Test: none — verification only

---

## 13.2 Module 04B corrections C01–C07 — explicit dispositions

| ID | Module 04B position | Disposition under the approved requirements |
|---|---|---|
| **C01** | §4.3: Start shows the launcher, prepares the overlay hidden, reveals only via Ctrl+B (and 04B §9 recommended no change) | **REJECTED / OVERRIDDEN.** Requirement §5.3 mandates: create → load → **show overlay** → hide launcher. 04B's factual trace of today's code was correct; its recommendation is not. F02 is now a defect, not a design. Implementation must show only after `ready` (F08/F10), else the launcher gets hidden against a blank window |
| **C02** | §3.3(5), §6.2: "KeybindManager needs no change; Ctrl+B is already correctly session-gated" | **REJECTED / OVERRIDDEN.** Requirement §5.2 makes pre-session Ctrl+B **mandatory**: unregister the `sessionActive` gate at `KeybindManager.ts:101`, delete the dead duplicate at `:105`, and branch the handler on session state. F03 is the defect |
| **C03** | §4.1 INV-1 (overlay ⟺ non-idle session) and §5.9's state table | **ACCEPTED AND EXTENDED.** Session state, current interface, per-surface visibility and overlay creation state are four **separate** concepts; 04B conflated "which surface is visible" with intent. This report adds INV-2…INV-8 (§6.2) and the creation-generation requirement (F09) |
| **C04** | §3.3(3), §6.4: keep STT/Whisper prewarm at launch | **ACCEPTED and now mandated** by requirements §5.1 and §7.1. Only overlay window + renderer become lazy. No change to `main.ts:4522–4531` or `:391–410` |
| **C05** | §5.1–§5.6: creation throw swallowed, `loadOk===false` partial init, Stop-during-creation stale promise, external close | **ACCEPTED, re-verified line by line** and promoted to acceptance criteria (F09/F10/F11, S16/S17). This report adds the **smallest safe** answer to 04B's open question: a creation **generation counter** + clearing `_overlayCreating` on teardown, not a cancellation-token framework |
| **C06** | §5.7: idle shortcuts (`main.ts:475–480`) can demand the overlay | **ACCEPTED and tightened.** With pre-session Ctrl+B now registered (C02), the idle branch must be provably incapable of creating or revealing an overlay for **any** shortcut, not just Ctrl+B: `switchToOverlay` refuses (F08) and the chat/screenshot branch must gate on session state |
| **C07** | 04B made no latency claims | **ACCEPTED as a standing constraint.** Lazy creation removes one window, one renderer process and ~50 subscriptions plus the overlay's `App.tsx` effect work (§9.1). It does not improve capture-to-transcript latency, LLM time-to-first-token, or the launcher's own chunk parsing, because both documents share the same 1.57 MB + 1.24 MB chunks (§12.1). Heavy Sherpa decode remains on the main process regardless (§12.3) |

---

## 14. Recommended minimal repair architecture

Six coordinated units, ordered so that no unit makes another one's failure mode reachable.

**U1 — Truth layer (no behaviour change).**
1. `destroyOverlayWindow()` (`WindowHelper.ts:446–458`) additionally clears `_overlayCreating` and sets `currentWindowMode='launcher'` + `KeybindManager.setMode('launcher')` (INV-3, INV-5).
2. `switchToOverlay()` (`:697–786`) is reordered to *check usability → act → only then hide the launcher*, and returns a boolean (INV-4, F08). Add `isDestroyed()` at `:702` and in `getMainWindow()` `:567–572` and `hideMainWindow()` `:605–607`.
3. Add `overlayWindow.on('closed', …)` in `setupOverlayWindowListeners()` (F11).
4. Introduce the creation state enum + generation counter in `WindowHelper` (`absent | creating | loading | ready | failed`), publish `ready` only when `loadOk && !isDestroyed`, and have the creation closure refuse to publish across a generation change (F09, F10).
*Exit:* no path can hide the launcher without showing something; no stale promise; no destroyed reference escapes.

**U2 — One shortcut owner, two branches.**
1. `KeybindManager.shouldRegister` (`:99–118`): register `general:toggle-visibility` unconditionally; delete the dead `:105` branch.
2. `toggleAssistantOverlay` (`main.ts:3600–3660`) becomes the single dispatcher over `(sessionState, currentWindowMode, per-surface isVisible())` per §6.1: idle → launcher toggle through a **launcher-only** primitive; session + interface `overlay` → `hideOverlay`/`showOverlay` with **no** launcher switch; session + interface `launcher` → launcher toggle (INV-5, F03/F04/F05).
3. Remove or re-point the renderer chords (`Launcher.tsx:219–221`, `NativelyInterface.tsx:1191`) at the same handler; keep `toggle-expand` (`main.ts:3591`) exclusively for the pill chip and its own binding; retain the registration-failure signal (`KeybindManager.ts:289–298`) (F07).
4. Add a launcher-only hide helper instead of reusing `hideMainWindow()` for Ctrl+B (F14).
*Exit:* S02–S06, S08–S09 satisfiable; one owner per chord.

**U3 — Ctrl+1 gate (same change as U2's step 2).**
1. In the `onShortcutTriggered` chat branch (`main.ts:575–595`) evaluate INV-6 **before** dispatching, and stop relying on mode alone for eligibility; also remove the `switchToOverlay(true)` reveal from the shortcut path for non-screenshot actions (`main.ts:475–480`) (F06, C06).
2. Suppress the reveal-on-answer: the shortcut path must not cause `api.showOverlay()` (`NativelyInterface.tsx:698`) — either guard the expand effect for shortcut-originated answers, or don't set `isExpanded` from the shortcut-invoked handler. **The dedicated What-to-Answer button keeps its current behaviour unchanged** (requirement §8.B).
3. Gate or remove the in-window `p('whatToAnswer')` handler (`:1179`) so it cannot bypass the main-process checks (requirement §6).
4. Do **not** use `isFocused()` anywhere in this gate (Module 04A D.2; requirement §6).
*Exit:* §6 table holds in all five states; hidden overlay never pops open from a hotkey.

**U4 — Lazy creation + Start reveals (the actual requirement change).**
1. Delete `WindowHelper.ts:327` (F01).
2. `startMeeting` (`main.ts:2826–2840`): keep `resetOverlayPosition()` (`:2826`) and the permission checks **before** creation; await creation/ready; on success call the U1-safe `switchToOverlay()` once (which now hides the launcher only after showing); keep session-state writes at `:2838–2840` and the deferred audio block at `:2888–2948` untouched; update the `:2828–2831` comment and `App.tsx:405–409` rationale (F02).
3. Failure path: if creation rejects or load fails, do **not** hide the launcher; tear the partial window down and roll the session back through the existing `forceEndMeeting()` (`:3132–3180`), then report through the existing broadcast channels (`:697–701`; `meeting-audio-error` `:2789` / `audio-capture-failed` `:1807` class). Retry = pressing Start again, which now creates cleanly (F09/F10, §5.3 "handle failure safely").
*Exit:* S01, S04, S15, S16, S17 satisfiable; STT prewarm untouched (C04).

**U5 — Answer routing to the session UI.**
Route the 15 mode-routed intelligence channels (`main.ts:3259–3365`) to the overlay window using the pattern already used at `:3226–3227`/`:3234–3235`, keeping `isDestroyed()` guards (F12, requirement §9.4/§8).
*Exit:* automatic and speculative answers survive Home; no behaviour change when the overlay is current.

**U6 — Polish, only if the earlier units are green.**
"Stopping…" CTA from the existing `state` field (F13); auxiliary-window synchronisation on hide/destroy (F17); `sttConnected` relabelling (D-11). Sherpa retry / language-override / silent-switching (F15) and the Only-Interviewer × Mock clarification (F16) are **separate work items**, not part of this repair.

**Explicitly rejected architectures:** a state-management rewrite or new state library; a general cancellation-token framework (the generation counter is sufficient — F09); any move of STT prewarm into Start (C04); a focus-based gate (Module 04A D.2); code-splitting the renderer to make the launcher lighter (real cost, but it touches `vite.config.mts`/`App.tsx` and is out of scope, §12.1); per-session audio re-initialisation (would duplicate recognizers, §10.1).

---

## 15. Exact source files expected to change

| File | Units | Why |
|---|---|---|
| `electron/WindowHelper.ts` | U1, U3 (helper), U4 | creation/teardown primitives, creation state + generation, `switchToOverlay` ordering, `closed` listener, destroyed-guards, launcher-only hide, **and line `:327` removal** |
| `electron/main.ts` | U2, U3, U4, U5, U6 | `toggleAssistantOverlay` dispatcher, shortcut gate, `startMeeting` reveal + failure rollback, intelligence routing `:3259–3365`, comment updates `:2828–2831` |
| `electron/services/KeybindManager.ts` | U2 | `shouldRegister` `:99–118`; owner consolidation |
| `src/components/NativelyInterface.tsx` | U3 | remove/re-point the Ctrl+B chord (`:1191`) and the What-to-Answer chord (`:1179`); prevent shortcut-triggered reveal (`:698`, `:763`) |
| `src/components/Launcher.tsx` | U2, U6 | remove/re-point its Ctrl+B chord (`:219–221`); consume `state` for a "Stopping…" CTA (`:191–194`, `:768–838`) |
| `src/App.tsx` | U4 (comment/rationale only) | `:405–409` no-longer-accurate comment |

Six files. **No new file is required.** `electron/ipcHandlers.ts` and `electron/preload.ts` need **no change**: `set-window-mode` (`ipcHandlers.ts:197`), `toggle-window` (`:290`), `show-overlay`/`hide-overlay` (`:303`/`:307`) and `start-meeting`/`end-meeting`/`force-end-meeting` (`:2706`/`:2716`/`:2726`) already carry every message the architecture needs — no new IPC channel is introduced.

---

## 16. Exact methods/functions expected to change

| Method / function | File · range | Change | Unit |
|---|---|---|---|
| `WindowHelper.createWindow()` | `:192–330` | remove the eager `await this.ensureOverlayWindow();` (`:327`) only | U4 |
| `WindowHelper.ensureOverlayWindow()` | `:340–440` | creation state + generation; publish `ready`; propagate load failure (`:429–434`) | U1 |
| `WindowHelper.destroyOverlayWindow()` | `:446–458` | clear `_overlayCreating`; set interface `launcher` + `setMode`; bump generation | U1 |
| `WindowHelper.switchToOverlay()` | `:697–786` | usability-first ordering; guarded `ensure-expanded` (`:702`); conditional launcher hide (`:783–785`); return boolean | U1 |
| `WindowHelper.setupOverlayWindowListeners()` | `:525–565` | add `closed` (and `unresponsive`) | U1 |
| `WindowHelper.getMainWindow()` / `hideMainWindow()` | `:567–572` / `:603–609` | `isDestroyed()` checks; add a launcher-only hide path | U1/U2 |
| `AppState.toggleAssistantOverlay()` | `main.ts:3600–3660` | single dispatcher on `(sessionState, interface, visibility)`; drop `switchToLauncher(true)` at `:3646`; drop the reveal-from-launcher at `:3649` when the interface is launcher | U2 |
| `AppState.toggleMainWindow()` | `main.ts:3571–3595` | stop using `toggle-expand` as a visibility proxy | U2 |
| `AppState.onShortcutTriggered` branch | `main.ts:461–480`, `:575–595` | INV-6 gate; no creation/reveal for idle shortcuts (C06) | U3 |
| `AppState.startMeeting()` | `main.ts:2826–2840` | await creation → reveal + hide launcher; failure rollback; comments | U4 |
| `AppState.setupIntelligenceEvents()` | `main.ts:3215–3370` | route 15 channels to the overlay | U5 |
| `KeybindManager.shouldRegister()` | `:99–118` | unconditional toggle-visibility registration; delete `:105` | U2 |
| `NativelyInterface` `handleWhatToSay` + expand effect | `:759–764`, `:689–712` | no `showOverlay()` when the trigger is the shortcut | U3 |
| `NativelyInterface` keydown map | `:1179`, `:1191` | gate or remove the in-window chord | U3 |
| `Launcher` keydown map / CTA | `:219–221`, `:191–194`, `:768–838` | gate/remove chord; consume `state` | U2/U6 |

Unchanged on purpose: `startMeeting`'s permission checks (`:2786`), the deferred audio block (`:2888–2948`), `endMeeting` (`:2951–3125`), `forceEndMeeting` (`:3132–3180`), `setupSystemAudioPipeline` (`:1740–1850`), `prewarmSttProviders` (`:1868–1885`), `createSTTProvider` (`:1106–1250`), `wireMicCapture`/`wireSystemCapture` (`:1612–1738`, `:1442–1610`), `WebSpeechSTT`, `SherpaSTT`, `SherpaAutoService`, `IntelligenceEngine`, `SessionTracker`, all IPC handler bodies, `preload.ts`, `WindowHelper.showOverlay`/`hideOverlay` bodies, `switchToLauncher`, and the Home/Meeting-Ongoing chains.

---

## 17. Files that must NOT change in this repair

| Group | Files | Reason |
|---|---|---|
| STT prewarm / provider construction | `electron/main.ts` `prewarmSttProviders` `:1868–1885`, `createSTTProvider` `:1106–1250`, `:4522–4531`, `:391–410` | requirement §5.1/§7.1 and C04 keep prewarm at launch |
| Sherpa + models + dependencies | `src/main/services/SherpaAutoService.ts`, `electron/audio/SherpaSTT.ts`, `electron/audio/whisper/**`, `electron/audio/LocalWhisperSTT.ts`, `eng.traineddata`, `resources/models/**`, `native-module/**`, `package.json`, `package-lock.json` | requirement §7.3: no deletion without a separate inventory; F15 is follow-on work |
| Audio capture | `electron/audio/MicrophoneCapture.ts`, `electron/audio/SystemAudioCapture.ts`, `wireMicCapture`/`wireSystemCapture` | §7.2 audio continuity; these are correct today |
| Answer pipeline | `electron/IntelligenceEngine.ts`, `electron/IntelligenceManager.ts`, `electron/SessionTracker.ts`, `electron/llm/**`, `electron/ai-engine.ts`, `ipcHandlers.ts` `generate-what-to-say` `:2829+` | requirement §8: preserve all three paths; only the **routing** of results changes (U5) |
| Interview modes | `main.ts:2905–2913`, `:1712–1735`, `:3409`/`:3426` | §7.4 preserve both modes (F16 is a clarification, not a code change here) |
| Renderer UI surface | `src/components/ui/TopPill.tsx`, `WindowControls.tsx`, `RollingTranscript.tsx`, `GlassEffectLayer.tsx`, `dynamic-actions/**`, `SettingsPopup.tsx`, `SettingsOverlay.tsx`, settings sub-pages | no UI redesign approved; F17's synchronisation is main-process side |
| Settings windows | `electron/SettingsWindowHelper.ts`, `ModelSelectorWindowHelper.ts`, `CropperWindowHelper.ts` | reachable and correct; only §17/F17 synchronisation may call their existing hide/close methods |
| Build & config | `vite.config.mts`, `tsconfig.json`, `electron/tsconfig.json`, `scripts/**`, `playwright.config.ts`, `index.html` | no dependency/build change in scope; code-splitting explicitly rejected (§14) |
| Dead / backup / legacy trees | `electron/WindowManager.ts`, `EnterpriseArchitecture.ts`, `services/ErrorNotificationService.ts`, `electron/main/GlobalErrorHandler.ts`, `electron/sidecar/**`, `electron/preload/index.ts`, `src/_pages/**`, `src/components/SuggestionOverlay.tsx`, `renderer/**`, `main/**`, `electron_backup_safe/**`, `clean_build/**`, `*.bak`, `*.orig`, `*Backup.ts`, `vite.config.mts.timestamp-*.mjs` | unreachable (F18) — editing them would add risk with no behavioural effect |
| Existing reports | `MODULE_03…md`, `MODULE_03A…md`, `MODULE_04…md`, `MODULE_04A…md`, `MODULE_04B…md` | digests recorded in §3 must remain unchanged |

---

## 18. Regression risks and mitigation

| # | Risk | Trigger | Mitigation (source-derived) |
|---|---|---|---|
| R1 | Ctrl+B becomes always-registered and fires inside text fields | U2 step 1 | decide the input guard (D-13) in the same change; the overlay chord currently runs before the `isInput` check (`NativelyInterface.tsx:1189–1192`) |
| R2 | Removing renderer chords leaves no Ctrl+B when OS registration fails | U2 step 3 | keep `keybinds:registration-failed` (`KeybindManager.ts:289–298`) and, if a fallback is retained, route it to the same main-process handler |
| R3 | Start reveals a blank or 1-px window | U4 with U1/U3 not landed | reveal only on `creationState==='ready'`; the window is created `height: 1` (`WindowHelper.ts:361`) and sized by the renderer (`NativelyInterface.tsx:592–610`, min 216 at `:76`) |
| R4 | Launcher hidden with no visible surface after a failed creation | U4 error path | `switchToOverlay` returns false → keep launcher visible → roll back via `forceEndMeeting` (`main.ts:3132–3180`) |
| R5 | Ctrl+1 stops working for legitimate passthrough/inactive-overlay cases | U3 gate | gate on `isVisible()` only, never `isFocused()` (`WindowHelper.ts:640–646`, `:753–755`; Module 04A D.2) |
| R6 | The pure-hide Ctrl+B leaves `activeMode='overlay'`, arming Ctrl+1 while hidden (the 04 D-06 trap) | U2 without U3 | ship U2 and U3 in one change; the gate is evaluated in the main process regardless of registration |
| R7 | Answer routing change (U5) delivers to a window mid-reload | `render-process-gone` → `reload()` (`WindowHelper.ts:414–420`) | keep `isDestroyed()` guards; §11.3 documents that no replay exists — measure T-18 |
| R8 | Session destroyed by a visibility operation | U2/U4 ordering | INV-4/INV-5 + generation guard; test T-15 (Stop→Start) and T-12 |
| R9 | Windows content-protection opacity ramp disturbed by pure hide/show | U2 | ramp lives in `switchToOverlay`/`switchToLauncher` (`:735–745`, `:797–811`); pure-hide must use `hideOverlay`/`showOverlay`, not the switch primitives |
| R10 | Stealth: an extra visible surface or a lost restore path | U2 pre-session Ctrl+B | with `isUndetectable` there is no tray (`main.ts:4539–4542`); the newly registered Ctrl+B is the *improvement* — verify L1→L0 restore works (T-04) |
| R11 | Mode/health-check re-registration churn on every Start/Stop | `setSessionActive` (`KeybindManager.ts:88–93`) + `setMode` (`:76–86`) each call `registerGlobalShortcuts()` (`unregisterAll` first) | acceptable today; avoid adding further re-registration triggers |
| R12 | First-Start perceived latency | F01 removal | measure before/after in T-02/T-06; if unacceptable, pre-create on **window focus of the Start CTA** — must be re-approved, as it borders on C01/§5.1 |
| R13 | `sttConnected` misreporting after prewarm | diagnostics `main.ts:747` | relabel (D-11/F-7); don't change provider construction |

---

## 19. Build / typecheck / runtime test plan

**Nothing below was executed in this audit.** Static checks first, then runtime on Windows (both dev and packaged, because the transient-error classifier differs — `WindowHelper.ts:33–41`).

| # | Test | Command / action | Expected after repair |
|---|---|---|---|
| T-00a | Typecheck | `npm run typecheck:electron` | clean, no new errors |
| T-00b | Build | `npm run build:electron` (and `npm run build` for the renderer) | succeeds; `dist-electron/electron/main.js` must contain **no** boot-time `await this.ensureOverlayWindow()` (compare §3 bundled line 176247) |
| T-00c | Unit tests | `npm run test` (node --test over the `__tests__` globs) | existing suite green; add lifecycle tests mirroring `electron/services/__tests__/Mode*` conventions |
| T-00d | E2E | `npm run test:e2e` | existing specs green |
| T-01 | Launch | start app; wait 60 s | `BrowserWindow.getAllWindows()` = 1; `getOverlayWindow()===null`; no `?window=overlay` document; no `assistant_start` analytics; `sessionState='idle'` |
| T-02 | Start | click Start Natively | **one** `creating overlay` log; then overlay visible, launcher hidden, `sessionState='active'`; measure Start-click→`ready` (records the R12 number) |
| T-03 | Start audio | same session | capture + STT started once only (`get-stt-pipeline-diagnostics`: `microphone.capturing`, one recognizer per logical channel, no duplicate `stt` objects) |
| T-04 | Ctrl+B idle | launcher visible → Ctrl+B → Ctrl+B | hides launcher; second press restores it at the same bounds; no window created |
| T-05 | Ctrl+B idle in stealth | `isUndetectable=true`, repeat T-04 | restore path still works with no tray |
| T-06 | Ctrl+B immediately after Start | press within ~150 ms of Start | must not blank the desktop (INV-4); overlay appears when ready |
| T-07 | Ctrl+B on overlay | visible → hidden → visible | pure hide/show; launcher never appears; window count constant; transcript intact |
| T-08 | Home / Meeting Ongoing | Ctrl+B → Home → Meeting Ongoing ×5 | Home: launcher current, session + capture continue; Meeting Ongoing: same overlay instance, no `creating overlay`, no STT restart; automatic answers still arrive (U5) |
| T-09 | Ctrl+1 matrix | execute in L0, L3, L4, L5, L7 | matches requirement §6 exactly; in L4/L5 no request leaves the main process |
| T-10 | Ctrl+1 while hidden by pill | collapse via chip, press Ctrl+1 | no answer, **no reveal** |
| T-11 | Ctrl+1 button parity | click the dedicated button in L3/L4 | button behaviour unchanged and still works while collapsed |
| T-12 | Stop | from visible overlay and from hidden overlay | launcher returns; `state:'stopping'` surfaced; overlay destroyed within the drain; count back to 1; capture/STT released |
| T-13 | Duplicate Stop | double-click Stop | one teardown; no error |
| T-14 | Load-failure + retry | dev: stop the Vite server before Start; packaged: temporarily rename `dist/index.html` | launcher stays visible and usable; error surfaced; second Start creates cleanly; no blank live window |
| T-15 | Stop during creation → immediate Start | Start, Stop <300 ms, Start | the third action yields a live overlay; no `reusing in-flight creation promise` for the new generation |
| T-16 | External close / renderer kill | hidden overlay `window.close()`; kill its renderer | no `Object has been destroyed`; `render-process-gone` reloads; Ctrl+B/Meeting Ongoing recover |
| T-17 | Auxiliary windows | open model selector/settings from the overlay, then Ctrl+B and Stop | no floating always-on-top panel left behind |
| T-18 | Streaming while hidden | start an answer, hide the overlay mid-stream, show again | stream not lost or duplicated; measure whether tokens emitted during the hide were dropped (§11.3) |
| T-19 | Streaming after Home | trigger automatic answer while the launcher is current | answer delivered to the overlay and shown on Meeting Ongoing; nothing throws |
| T-20 | Sherpa status | provider `sherpa`; break the model dir once, restart | initialization failure reported; retry behaviour documented (F15, follow-on) |
| T-21 | Mode matrix | Normal vs Mock × Only-Interviewer on/off | transcript channel routing per §7.4; record the F16 clarification outcome |
| T-22 | 20× session cycle | Start→Ctrl+B→Stop ×20 | window/renderer counts return to baseline each cycle; no duplicated listeners; measure first-Start vs 20th-Start (F09 leak check) |
| T-23 | Regression sweep | screenshots, vision pipeline, recaps/clarify/follow-up, mouse passthrough, disguise switch, settings, keybind rebind, tray/dock, updater | all pre-existing features still reachable (requirement §11 of the brief: preserve features) |

**Acceptance rule:** a scenario may be recorded PASS only with an observed window count, visibility flag and session state in the run log; a function name or a comment is never accepted as evidence (brief §12).

---

## 20. Outstanding questions and unavailable evidence

| # | Question | Why it matters | Type |
|---|---|---|---|
| Q1 | Should Start await the **renderer load** before returning `start-meeting` success, or return success and reveal on `ready`? | decides whether the CTA can be clicked into a half-built surface | requirement decision + **[NV]** timing |
| Q2 | In L4 (overlay current but hidden), should `assist`/`dynamic_action` events still fan out to the **launcher**, as they do today (`main.ts:3226–3235`)? | U5 routing choice; affects F12 completeness | requirement decision |
| Q3 | Is Ctrl+B allowed to fire while the overlay textbox or the launcher chat has focus (D-13)? | mandatory for R1 | requirement decision |
| Q4 | Must an answer triggered while the overlay is hidden be **replayed** on re-show, or is "no answer generated while hidden" (requirement §6) sufficient? | determines whether §11.3's gap needs a buffer at all | requirement decision |
| Q5 | Is the deferred destroy (`main.ts:3115`, after the 250 ms drain + RAG) acceptable for "Stop destroys the overlay", or must the window go immediately? | acceptance wording vs trailing-transcript safety | requirement decision |
| Q6 | Should `prewarmSttProviders` remain unconditional even when `sttProvider==='none'` (`main.ts:1110–1116` returns null)? | prewarm is approved, but its cost varies by provider | **[NV]** |
| Q7 | Actual Start→ready latency and 20-cycle resource behaviour | R12, F09 leak hypothesis | **[NV]** — must be measured |
| Q8 | Is the automatic-answer requirement satisfied by the speculative path only? `handleSuggestionTrigger` (`IntelligenceEngine.ts:360–412`) has **no live caller** outside `IntelligenceManager.ts:145–147`, so "generate only after a complete interviewer question" (`§8.C`) is not wired as the brief words it | could be an intentional design (speculation on partials) or an unfinished path | **UNVERIFIED — needs product confirmation** |
| Q9 | Which STT provider is actually configured on this machine (credential store is runtime state)? Sherpa is described as intended primary; static code cannot prove the selection | gates F15's severity | **[NV]** |
| Q10 | Should Hindi/Marathi be added to `RECOGNITION_LANGUAGES` (`electron/config/languages.ts:63–78`), and how should they map onto Sherpa's `language:''` auto-detect (`SherpaAutoService.ts:185`)? | requirement §7.3 is currently unmet | requirement decision, out of overlay scope |
| Q11 | Does Windows child-window hiding already hide the settings/model-selector with the overlay (F17)? | decides whether U6 step 2 is needed | **[NV]** |
| Q12 | Report provenance: the three GitHub report URLs in the brief were not fetched; local copies were used and hashed. Are the local copies the canonical versions? | traceability only | **UNVERIFIED (external)** |
| Q13 | Are `src/main/services/**` (KnowledgeBase, OrchestratorService, SherpaAutoService, CircuitBreaker…) intentionally shared between main and renderer? | affects any future code-splitting decision | **[NV]** |

**Unavailable evidence classes:** any wall-clock latency, any focus/foreground behaviour, any compositor/transparency artefact, any per-cycle memory leak, real provider/network behaviour, and any macOS menu-vs-global-shortcut precedence. None was observed; the application was never run.

---

## 21. Final repair readiness verdict

### **READY FOR REPAIR PLAN APPROVAL**

Basis: every requirement-relevant control path is located and cited; the defect set is closed under static evidence; the repair decomposes into six ordered units touching **six existing files** with **no new IPC surface, no new file, no dependency change, no UI redesign**; the prewarm/answer/STT subsystems are provably separable from the window subsystem (`WindowHelper.ts` audio/STT reference count 0); and every residual unknown is a measurement or a product decision, not an unexplored area of code (§20).

Conditions on that verdict: (a) the requirement decisions Q1–Q5 and Q10 must be answered **before** implementation is scheduled; (b) U1 must land before U4 (F08/F09/F10 make U4 unsafe alone); (c) F15/F16 are explicitly **out** of this repair; (d) no PASS may be recorded without runtime evidence (§19).

### Counts

| Category | Number | Items |
|---|---|---|
| Findings raised in total | **18** | F01–F18 |
| **CONFIRMED** (exact source evidence, no runtime needed) | **13** | F01, F02, F03, F04, F05, F06, F08, F09, F10, F11, F12, F14, F18 |
| **CONFIRMED with a runtime caveat** | **1** | F07 — owners proven statically; one physical press reaching two owners is **[NV]** |
| **PARTIALLY CONFIRMED** | **3** | F13 (behaviour confirmed, acceptance question open), F15 (some sub-rules met), F17 (static part confirmed, platform hide **[NV]**) |
| **REQUIREMENT CLARIFICATION / CONFLICT** | **4** | F02 (source intent vs §5.3), F03 (source gate vs §5.2), F15 (silent provider switching vs §7.3), F16 (Only-Interviewer × Mock vs §7.4) |
| **NOT CONFIRMED (approved rule unmet by code)** | **2** | F15 sub-items: manual Hindi/Marathi override (`config/languages.ts:63–78` has neither; `SherpaSTT.ts:89–91` no-op) and Sherpa retry (`SherpaAutoService.ts:59–65`) |
| **UNVERIFIED** | **5** | renderer-initialisation failure signalling (§5.9); one-press double delivery (F07); whether any live path closes a hidden overlay (F11); `handleSuggestionTrigger` wiring (Q8); which STT provider is configured on this machine (Q9) |
| Scenario matrix (S01–S25) | 25 rows | **PASS 13** (S07, S10, S11, S14, S15, S18, S19, S20, S21, S22, S23, S24, S25; S14 and S21 are "right outcome, defective mechanism" — F13 and F04), **FAIL 9** (S01, S03, S04, S05, S08, S09, S12, S16, S17), **PARTIALLY CONFIRMED 3** (S02, S06, S13) |

**No source file was modified by this audit** — proved by the identical 286-entry before/after manifest in §3.

---

## 22. Scope guardrails for the next step

1. This audit stops here; per brief §4 rule 12 and §21, **no implementation begins**.
2. The repair plan should be written directly against §14 (units), §15–§16 (files/methods), §18 (risks) and §19 (tests), and must re-state requirements §5.2, §5.3, §5.4, §5.6 as **overrides** of Modules 04B §4.3 and §3.3(5) so no future reader reinstates the old behaviour from the older recommendation or from the `main.ts:2828–2831` comment.
3. Any future claim of the form "faster transcription / faster answers because the overlay is lazy" is unsupported by this evidence base (§9.4, C07).

