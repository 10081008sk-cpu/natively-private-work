# MODULE 02A — Active STT Provider Verification

**Target:** `E:\Project\natively-cluely-ai-assistant-main\natively-cluely-ai-assistant-main`
**Package:** `natively` v2.6.0
**Audit type:** Read-only runtime/configuration verification + source trace
**Runtime executed:** Yes, only a read-only Electron `safeStorage` decryption of the non-secret provider fields; **no meeting, audio capture, model load, build, or source change** was performed during this audit.
**Source files modified:** None.
**Secrets exposed:** None. Only the provider name, language, and boolean “key present" flags were printed. No API key, token, service-account path, or transcript was read or printed.

> **Important scope note:** This report distinguishes:
> 1. provider implementation exists;
> 2. provider is preloaded;
> 3. provider is initialized;
> 4. provider is selected;
> 5. provider receives audio;
> 6. provider emits transcript events.
>
> The persisted provider is confirmed. The audio routing is confirmed from the live code path and runtime logs. **Actual transcript generation in the inspected log is not confirmed** — the existing diagnostics UI is the correct way to verify that last step during a real meeting.

---

## 1. Verdict

| Question | Answer |
|---|---|
| **Persisted `CredentialsManager.sttProvider`** | **`sherpa`** |
| **Persisted `sttLanguage`** | **`auto`** |
| **Selected provider for microphone (normal mode)** | **Sherpa-ONNX** (`googleSTT_User`, `SherpaSTT` channel `'mic'`) |
| **Selected provider for system audio (normal mode)** | **Sherpa-ONNX** (`googleSTT`, `SherpaSTT` channel `'system'`) |
| **Both channels same provider?** | **Yes** — both are created by the same `createSTTProvider()` using the same `CredentialsManager.getSttProvider()` value. For Sherpa, both adapters share one `SherpaAutoService` recognizer, with separate per-channel Silero VAD state. |
| **Current effective channel behavior** | **Mock Interview Mode is enabled in `settings.json`**. Therefore: microphone → **interviewer Sherpa** (`googleSTT`); system audio capture is **not started**; user STT (`googleSTT_User`) is **not started**. |
| **Actual fallback** | If Sherpa initialization fails, the provider falls back to **Web Speech** (`WebSpeechSTT`), not Local Whisper and not Google. Current runtime logs show Sherpa initialized successfully, so the fallback is not active. |
| **Does Sherpa initialize when another provider is selected?** | **No** in the active path. `SherpaSTT` is lazy-required only in the `sherpa` branch of `createSTTProvider()`; `SherpaAutoService` is imported by `ipcHandlers` but its constructor is lazy and does not initialize the model. The diagnostics endpoint calls `getDiagnostics()` only, not `ensureInitialized()`. |
| **Are Local Whisper workers created when Sherpa is selected?** | **No** in the active path. The Local Whisper startup preload is gated on `sttProvider === 'local-whisper'`; `createSTTProvider()` only requires `LocalWhisperSTT` in the `local-whisper` branch; no `LocalWhisperSTT`/`WhisperWorker` log exists in the current runtime log. |
| **Does Sherpa actually generate transcripts right now?** | **Not confirmed from the inspected log.** The code path is live and receives mic audio, but `SherpaAutoService` does not log per-segment activity. The Settings diagnostics `Segments decoded` and `Last transcription` fields are the runtime proof. |

---

## 2. Persisted Provider — Actual Value

### 2.1 Where the value is stored

`CredentialsManager` stores the provider in:

```
%APPDATA%\natively\credentials.enc
```

Source: `electron/services/CredentialsManager.ts:10` (`CREDENTIALS_PATH`) and `:562-596` (`loadCredentials`).

The file is encrypted with Electron `safeStorage` (`:545-559`). It is **not** a readable JSON file.

### 2.2 How it was inspected safely

A temporary, read-only Electron script was run outside the repository:

- set `app.setPath('userData', '%APPDATA%/natively')`;
- read `credentials.enc`;
- call `safeStorage.decryptString()`;
- `JSON.parse` the result;
- print **only**:

```json
{
  "encryptionAvailable": true,
  "sttProvider": "sherpa",
  "sttLanguage": "auto",
  "hasNativelyApiKey": false,
  "hasGoogleServiceAccountPath": false,
  "hasGroqSttApiKey": false,
  "hasOpenAiSttApiKey": false,
  "hasDeepgramApiKey": false,
  "hasElevenLabsApiKey": false,
  "hasSonioxApiKey": false,
  "hasAzureApiKey": false,
  "hasIbmWatsonApiKey": false,
  "hasSpeechmaticsApiKey": false,
  "hasCustomSttApiKey": false,
  "customSttEndpointSet": false,
  "customSttModel": null,
  "openAiSttBaseUrlSet": false,
  "groqSttModel": null
}
```

The temporary script was deleted after use. No credential value was printed, copied, or persisted.

**Why `%APPDATA%\natively` is the active profile:** the runtime log's `[Main] Mock Interview Mode active...` line matches `natively\settings.json` (`mockInterviewMode: true`); `%APPDATA%\RuntimeBroker` is an older profile from June and has no current `settings.json`. The app loaded encrypted credentials at `16:43:38`, then prewarmed the provider at `16:43:57`, so this is the live configuration.

### 2.3 Current non-secret settings that affect channel behavior

From `%APPDATA%\natively\settings.json`:

```json
{
  "noiseCancellationEnabled": true,
  "mockInterviewMode": true,
  "onlyInterviewerMode": false,
  "meetingRetention": "never"
}
```

**`mockInterviewMode: true` is critical for this audit.** It changes which channel receives audio, even though the selected provider is Sherpa for both configured instances.

### 2.4 `getSttProvider()` semantics

`electron/services/CredentialsManager.ts:119-131`:

```ts
const provider = this.credentials.sttProvider || 'none';
if (provider === 'none' && this.credentials.nativelyApiKey) {
  this.credentials.sttProvider = 'natively';
  this.saveCredentials();
  return 'natively';
}
return provider;
```

- If `sttProvider` is missing or empty → `'none'`.
- If it is `'none'` and a Natively key exists → self-heals to `'natively'`.
- Current persisted value is `'sherpa'`; no self-heal applies.

---

## 3. Code Trace — Provider Selection

### 3.1 `createSTTProvider()` is called once per channel

`electron/main.ts:1106-1251`:

```ts
private createSTTProvider(speaker: 'interviewer' | 'user'): STTProvider | null {
  const sttProvider = CredentialsManager.getInstance().getSttProvider();
  const sttLanguage = CredentialsManager.getInstance().getSttLanguage();
  ...
}
```

`setupSystemAudioPipeline()` calls it twice (`main.ts:1798-1836`):

- `createSTTProvider('interviewer')` → `this.googleSTT`
- `createSTTProvider('user')` → `this.googleSTT_User`

Both calls read the same persisted provider. Therefore, **both channels use the same provider** unless a provider-specific per-channel model override exists. Per-channel model overrides exist only for `local-whisper`; Sherpa uses one shared recognizer.

### 3.2 The `sherpa` branch

`electron/main.ts:1211-1222`:

```ts
} else if (sttProvider === 'sherpa') {
  try {
    const { SherpaSTT: SherpaSTTProvider } = require('./audio/SherpaSTT');
    stt = new SherpaSTTProvider(speaker === 'interviewer' ? 'system' : 'mic');
    console.log(`[Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for ${speaker}`);
  } catch (error: any) {
    console.warn(`[Main] Sherpa STT unavailable for ${speaker}; falling back to Web Speech:`, error?.message || error);
    stt = new WebSpeechSTT(`main_${speaker}`);
    effectiveSttProvider = 'web-speech';
  }
}
```

- `SherpaSTT` channel is `'system'` for `speaker === 'interviewer'`, `'mic'` for user.
- The constructor calls `sherpaAutoService.ensureInitialized()` (`SherpaSTT.ts:28-41`). If the model is unavailable, it throws; the catch creates `WebSpeechSTT`.
- No Local Whisper path is involved.

### 3.3 Normal-mode channel routing

`wireSystemCapture()` (`main.ts:1442-1609`) writes system audio to `this.googleSTT` (`:1591-1596`):

```ts
if (this._noiseCancellationEnabled && this._sysNoiseSuppressor) {
  const processed = this._sysNoiseSuppressor.processBuffer(chunk);
  this.googleSTT.write(processed);
} else {
  this.googleSTT.write(chunk);
}
```

`wireMicCapture()` (`main.ts:1612-1737`) writes microphone audio to `this.googleSTT_User` unless mock/Only Interviewer modes intervene (`:1721-1723`):

```ts
if (!this._onlyInterviewerMode) {
  this.googleSTT_User?.write(processedChunk);
}
```

Thus, in normal mode:

- system audio → `googleSTT` (interviewer) → Sherpa channel `'system'`
- microphone → `googleSTT_User` (user) → Sherpa channel `'mic'`

Both are Sherpa.

### 3.4 Current Mock Interview Mode routing

`startMeeting()` (`main.ts:2905-2911`):

```ts
if (this._mockInterviewMode) {
  console.log('[Main] Mock Interview Mode active — skipping system audio capture, routing mic to interviewer STT.');
  this.microphoneCapture?.start();
  this.googleSTT?.start();
  // Do NOT start system audio capture or user STT channel
  // User STT is deliberately not started — mic is routed to interviewer STT
} else {
  // Start System Audio
  this.systemAudioCapture?.start();
  this.googleSTT?.start();
  // Start Microphone
  this.microphoneCapture?.start();
  this.googleSTT_User?.start();
}
```

`wireMicCapture()` mock branch (`main.ts:1710-1716`):

```ts
if (this._mockInterviewMode) {
  this.googleSTT?.write(processedChunk);
  return;
}
```

Therefore, with the current saved settings:

- **Microphone** → `googleSTT` (interviewer Sherpa) → `SherpaSTT` channel `'system'` (by design, in mock mode).
- **System audio** → **not captured**; `systemAudioCapture` is constructed but `.start()` is not called.
- **`googleSTT_User`** (user Sherpa) → **constructed/prewarmed but not started**, so it receives no audio.
- There is no second provider involved.

### 3.5 Why the log says “User STT rate locked" despite mock mode

`wireMicCapture()` always locks the **user** STT sample rate on the first mic chunk (`main.ts:1670-1676`), before the mock-mode branch:

```ts
if (!this._micSttRateApplied && this.googleSTT_User && this.microphoneCapture === capture) {
  const rate = capture.getSampleRate();
  this.googleSTT_User.setSampleRate(rate);
  this.googleSTT_User.setAudioChannelCount?.(1);
  this._micSttRateApplied = true;
  console.log(`${prefix}User STT rate locked from first mic chunk: ${rate}Hz`);
}
```

In mock mode, this sets the rate on `googleSTT_User` even though that instance never starts. The **interviewer** `googleSTT` (which actually receives the mic) does not get its sample rate set from the mic in mock mode. Its `SherpaSTT` default is `48000` (`SherpaSTT.ts:24`), and the logged mic rate is 48 kHz (`21309`), so the current run is coherent. If the mic were 44.1 kHz, the interviewer Sherpa adapter would still assume 48 kHz. This is an observation, not the main provider verdict.

---

## 4. Lifecycle Distinction

| Stage | Sherpa — current state | Evidence |
|---|---|---|
| **Implementation exists** | `SherpaSTT.ts` + `src/main/services/SherpaAutoService.ts` + model files | Files and model directory present |
| **Preloaded** | **Yes.** `prewarmSttProviders()` constructs both Sherpa adapters at startup. | `main.ts:4525-4527`; logs `Pre-warming interviewer...`, `Using SherpaSTT... interviewer`, `Pre-warming user...`, `Using SherpaSTT... user` |
| **Initialized** | **Yes.** `SherpaAutoService` loaded the multilingual recognizer. | Logs: `[SherpaAuto] Multilingual recognizer ready (...)` |
| **Selected** | **Yes.** Persisted `sttProvider = 'sherpa'`. | `credentials.enc` decrypted safely |
| **Receives microphone audio** | **Yes, in the current mock-mode run**, via `googleSTT` (interviewer Sherpa). | `main.ts:2906-2911`, `1710-1716`; logs `Mock Interview Mode active...`, mic chunk logs |
| **Receives system audio** | **No.** Mock Interview Mode skips `systemAudioCapture.start()`. | `main.ts:2905-2911`; log has `SystemAudioCapture Initialized (lazy)` but no `Starting native capture` |
| **Emits transcript events** | **Not confirmed from logs.** The code path is live, but no per-segment Sherpa log exists. | `SherpaSTT.write` → `SherpaAutoService.processChunk` → `drainSegments` → `decodeSegment` → `emitTranscript`; no runtime segment log in `natively_debug.log` |

### 4.1 What “preloaded” means here

`prewarmSttProviders()` (`main.ts:1868-1878`) constructs both provider objects at app startup via `setImmediate` (`main.ts:4525-4527`). For Sherpa, construction is **not** lightweight: `SherpaSTT` constructor calls `sherpaAutoService.ensureInitialized()` (`SherpaSTT.ts:28-41`), which calls `SherpaAutoService.init()` synchronously (`SherpaAutoService.ts:59-65, 160-203`). The runtime log confirms a **~12-second** gap:

```
2026-11-10T16:39:20.224Z [Main] Pre-warming interviewer STT provider...
2026-11-10T16:39:32.256Z [SherpaAuto] Multilingual recognizer ready (...)
2026-11-10T16:39:32.256Z [Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for interviewer
2026-11-10T16:39:32.258Z [Main] Pre-warming user STT provider...
2026-11-10T16:39:32.259Z [Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for user
```

A second startup shows the same pattern:

```
2026-11-10T16:43:57.823Z [Main] Pre-warming interviewer STT provider...
2026-11-10T16:44:10.763Z [SherpaAuto] Multilingual recognizer ready (...)
```

That is ~12.03 s and ~12.94 s respectively. This is preloading/initialization, not proof of transcript generation.

### 4.2 What “selected” means here

`CredentialsManager.getSttProvider()` returns the persisted value; `createSTTProvider()` uses it for both channels. The current UI would show `Sherpa-ONNX` as the Speech Provider. The value is not inferred from imports or model presence; it was read from the encrypted credentials store.

---

## 5. Runtime Log Evidence

Log file: `C:\Users\Sanket-PC\Documents\natively_debug.log`
The log contains no transcript text in the lines below; only provider/status/channel messages.

### 5.1 Sherpa preload and initialization

```
21063  2026-11-10T16:39:20.224Z [LOG] [Main] Pre-warming interviewer STT provider...
21064  2026-11-10T16:39:32.256Z [LOG] [SherpaAuto] Multilingual recognizer ready (E:\...\resources\models\sherpa-multilingual-auto)
21065  2026-11-10T16:39:32.256Z [LOG] [Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for interviewer
21066  2026-11-10T16:39:32.258Z [LOG] [Main] Pre-warming user STT provider...
21067  2026-11-10T16:39:32.259Z [LOG] [Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for user
```

Repeat after restart:

```
21213  2026-11-10T16:43:57.823Z [LOG] [Main] Pre-warming interviewer STT provider...
21214  2026-11-10T16:44:10.763Z [LOG] [SherpaAuto] Multilingual recognizer ready (E:\...\resources\models\sherpa-multilingual-auto)
21215  2026-11-10T16:44:10.763Z [LOG] [Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for interviewer
21216  2026-11-10T16:44:10.764Z [LOG] [Main] Pre-warming user STT provider...
21217  2026-11-10T16:44:10.765Z [LOG] [Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for user
```

### 5.2 Meeting start under current settings

```
21295  2026-11-10T16:45:13.179Z [LOG] [SystemAudioCapture] Initialized (lazy). Device ID: default
21296  2026-11-10T16:45:13.180Z [LOG] [Main] SystemAudioCapture initialized.
21298  2026-11-10T16:45:13.182Z [LOG] [Main] Initializing MicrophoneCapture...
21299  2026-11-10T16:45:13.183Z [LOG] [MicrophoneCapture] Initialized wrapper. Device ID: default
21301  2026-11-10T16:45:14.271Z [LOG] [Main] MicrophoneCapture initialized.
21303  2026-11-10T16:45:14.273Z [LOG] [Main] Mock Interview Mode active — skipping system audio capture, routing mic to interviewer STT.
21304  2026-11-10T16:45:14.275Z [LOG] [MicrophoneCapture] Starting native capture...
21306  2026-11-10T16:45:14.293Z [LOG] [DefaultOutputWatcher] Started. Initial default output: {0.0.0.00000000}.{...}
21307  2026-11-10T16:45:14.294Z [LOG] [Main] Audio pipeline started successfully.
21309  2026-11-10T16:45:14.499Z [LOG] [Main] (Reconfigured) User STT rate locked from first mic chunk: 48000Hz
21310  2026-11-10T16:45:15.283Z [LOG] [MicrophoneCapture] Emitting chunk: 5760 bytes to JS
```

Interpretation:

- `SystemAudioCapture` was **constructed** (`Initialized (lazy)`) but no `Starting native capture...` line appears.
- `MicrophoneCapture` **started** and emitted chunks.
- `Mock Interview Mode` explicitly says system audio is skipped and mic is routed to interviewer STT.
- `User STT rate locked` refers to `googleSTT_User` (which is not started); the actual microphone consumer is `googleSTT` (interviewer).

### 5.3 No Local Whisper evidence

The entire inspected log has **no** lines containing:

- `LocalWhisperSTT`
- `WhisperWorker`
- `ModelPreloader`
- `Preloading local Whisper model`
- `Using LocalWhisperSTT`

This is consistent with the code path: Local Whisper is only constructed when `sttProvider === 'local-whisper'`.

### 5.4 No Sherpa segment/transcript evidence

The log contains only Sherpa **initialization** messages. `SherpaAutoService` does not log `chunksReceived`, `segmentsDecoded`, or `lastText`; those are exposed through diagnostics. Therefore:

- **Audio reaching Sherpa** is supported by the mock-mode + mic-chunk logs and the `wireMicCapture` code path.
- **Sherpa producing a transcript** is **not proven by this log**. It must be verified via the diagnostics fields or a live transcript.

---

## 6. Fallback Analysis

### 6.1 What happens if Sherpa fails

`main.ts:1211-1222` catches any exception from `new SherpaSTTProvider(...)` and creates `WebSpeechSTT`. The effective provider is set to `'web-speech'`.

Typical trigger:

- model directory missing or incomplete (`SherpaAutoService.resolveModelDir()` fails);
- `sherpa-onnx-node` unavailable;
- native recognizer construction fails.

Current runtime log shows `[SherpaAuto] Multilingual recognizer ready`, so **no fallback occurred**.

### 6.2 What happens if the model is missing later

`SherpaAutoService.ensureInitialized()` (`:59-65`) sets `initialized=true` before `init()`. If `init()` fails, `recognizer` stays null and `initialized` stays true, so future `ensureInitialized()` calls return false without retrying. The provider falls back to Web Speech until the app is restarted. This is a known Module 2 finding; it is not active now because the model is ready.

### 6.3 Fallback is not Local Whisper

There is no Sherpa→Local Whisper fallback in `createSTTProvider()`. A Sherpa failure goes to **Web Speech**. Local Whisper is a separately selected provider.

### 6.4 Fallback is not Google

The `_safeGoogleSTT()` fallback is used for `natively`/`deepgram`/`soniox`/`elevenlabs`/`openai` key failures, and for unknown/`speechmatics` providers. The `sherpa` branch does not use it.

---

## 7. Does Sherpa Initialize When Another Provider Is Selected?

**No, not through the active startup path.**

Evidence:

- `SherpaSTT` is lazy-required only inside the `sttProvider === 'sherpa'` branch (`main.ts:1211-1218`).
- `prewarmSttProviders()` constructs only the currently selected provider (`main.ts:1868-1878`); for `local-whisper`, it constructs `LocalWhisperSTT`; for cloud, it constructs cloud clients; it does not construct Sherpa.
- `SherpaAutoService` is imported by `ipcHandlers.ts:15`, but its constructor is deliberately lazy (`SherpaAutoService.ts:48-53`); the module-level singleton at `:361-363` only constructs the object, not the recognizer.
- `get-stt-pipeline-diagnostics` calls `sherpaAutoService.getDiagnostics()` (`ipcHandlers.ts:317-324`), which reads fields only; it does not call `ensureInitialized()`.

Caveat: if another part of the app directly constructed `SherpaSTT` (none found) or called `ensureInitialized()`, that would initialize it. The active provider factory does not.

**Native-addon nuance:** `ipcHandlers.ts:15` imports `sherpaAutoService` for diagnostics, and `SherpaAutoService.ts:7-12` imports `sherpa-onnx-node` at module load. That can load the native addon/library at startup even when another provider is selected. It does **not** load the Sherpa model or create a recognizer; `ensureInitialized()` is only called from `SherpaSTT`'s constructor.

**Current exception:** the selected provider **is** `sherpa`, so full Sherpa model initialization is expected and observed.

---

## 8. Are Local Whisper Workers Created When Sherpa Is Selected?

**No, not in the active path.**

Evidence:

1. The only `new LocalWhisperSTT` in the active source is `main.ts:1240`, inside the `sttProvider === 'local-whisper'` branch (`:1224-1246`).
2. The startup model preloader is gated on `getSttProvider() === 'local-whisper'` (`main.ts:391-404`).
3. `LocalWhisperSTT.start()` is the only place that calls `spawnWorker()` (`LocalWhisperSTT.ts:222-229`); that instance is never created for Sherpa.
4. `LocalWhisperModelPanel` does not call `localWhisperPreload`; it only lists models, saves model IDs, and starts a **download** worker when the user explicitly clicks Download (`LocalWhisperModelPanel.tsx:179-196`). A download worker is not an STT worker.
5. The inspected runtime log contains no `LocalWhisperSTT`, `WhisperWorker`, or `ModelPreloader` lines.

Therefore, with `sttProvider='sherpa'`, **no Local Whisper STT worker is created or receives audio**.

---

## 9. How to Verify During a Real Meeting

### 9.1 Settings → Audio → Speech Pipeline Diagnostics (best method)

`SettingsOverlay.tsx:1565-1599` displays:

| Field | Source | What it proves |
|---|---|---|
| **STT provider** | `appState.getAudioPipelineDiagnostics().sttProvider` | Set in `setupSystemAudioPipeline()` from the selected provider; during a meeting it should read `sherpa`. |
| **Sherpa model** | `pipelineDiag.sherpa.ready` | `SherpaAutoService` recognizer loaded. |
| **Audio chunks received** | `pipelineDiag.sherpa.chunksReceived` | Sherpa's `processChunk()` was called. This proves audio reached Sherpa, not just that the model exists. |
| **Segments decoded** | `pipelineDiag.sherpa.segmentsDecoded` | Silero VAD produced complete segments and the recognizer decoded them. This is the key proof of **transcript generation**. |
| **Last transcription** | `pipelineDiag.sherpa.lastText` | Non-empty text proves a transcript was emitted. |
| **Microphone** | `pipelineDiag.microphone.capturing` + rate | Mic capture is live. |
| **System audio (loopback)** | `pipelineDiag.systemAudio.capturing` + rate | Whether system capture is live; in current mock mode this should show **Stopped**. |

`ipcHandlers.ts:317-324` returns `{ ...appState.getAudioPipelineDiagnostics(), sherpa }`, where `sherpa` is `sherpaAutoService.getDiagnostics()` (`SherpaAutoService.ts:67-76`). The diagnostics are polled while the Audio tab is open (`SettingsOverlay.tsx:576+`).

Because the current `settings.json` has `meetingRetention: "never"`, the meeting transcript is **not persisted to the database**; do not expect to verify this run from the Meetings list or `natively.db`. The diagnostics are the correct live proof.

**Interpretation:**

- `STT provider = sherpa`, `Audio chunks received > 0`, `Segments decoded > 0`, `Last transcription ≠ "—"` → Sherpa is receiving audio and producing transcripts.
- `Audio chunks received = 0` during a live meeting → audio is not reaching Sherpa (check mock mode, capture start, or channel routing).
- `Audio chunks received > 0` but `Segments decoded = 0` → Rust/Silero VAD is not producing speech segments (short speech, silence, or VAD gate).
- `System audio = Stopped` with `mockInterviewMode=true` is expected.

### 9.2 Log-based verification

The provider-selection lines are in:

`C:\Users\Sanket-PC\Documents\natively_debug.log`

Useful non-secret lines:

```text
[Main] Pre-warming interviewer STT provider...
[SherpaAuto] Multilingual recognizer ready (...)
[Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for interviewer
[Main] Using SherpaSTT adapter (Sherpa-ONNX + Silero VAD) for user
[Main] Mock Interview Mode active — skipping system audio capture, routing mic to interviewer STT.
[MicrophoneCapture] Starting native capture...
[MicrophoneCapture] Emitting chunk: ... bytes to JS
```

There is **no** Sherpa per-segment log. The log can confirm selection/wiring, but not transcript generation.

### 9.3 Settings UI provider display

Settings → Audio → **Speech Provider** shows the selected provider from `getStoredCredentials().sttProvider`. With the current credentials it should display **Sherpa-ONNX** (the UI option at `SettingsOverlay.tsx:1440`). If it displays something else, the persisted provider differs from the one read in this audit.

### 9.4 Safe manual check of the encrypted store

A normal user cannot read `credentials.enc` directly. The safest UI-only check is:

1. Open Settings → Audio.
2. Look at **Speech Provider** (should be `Sherpa-ONNX`).
3. Start a meeting.
4. While the meeting is active, open Settings → Audio → **Speech Pipeline Diagnostics**.
5. Confirm `STT provider = sherpa`, then watch `Audio chunks received`, `Segments decoded`, and `Last transcription`.

Do not attempt to decrypt or edit `credentials.enc` manually.

---

## 10. Observations and Risks Relevant to Provider Verification

These do not change the provider verdict but affect interpretation:

1. **Mock Interview Mode changes channel ownership.** With `mockInterviewMode=true`, the microphone is deliberately routed to the **interviewer** `googleSTT` (Sherpa channel `'system'`), and the user `googleSTT_User` is never started. A user checking “is the mic using user or interviewer STT?” must account for this.
2. **System audio is not captured in the current configuration.** The log shows `SystemAudioCapture Initialized (lazy)` but no `Starting native capture...`. If the user expects system audio, they must disable Mock Interview Mode and restart the meeting.
3. **The “User STT rate locked” log is misleading in mock mode.** It locks `googleSTT_User`’s rate even though that instance does not start; the actual mic consumer is `googleSTT`. Current mic rate is 48 kHz, matching `SherpaSTT`’s default, but a 44.1 kHz mic would be misdeclared for interviewer Sherpa in mock mode.
4. **Sherpa preload costs ~12 s on this machine.** The log shows `Pre-warming...` → `SherpaAuto ready` after ~12 s, twice. This is initialization, not proof of transcription; it also blocks the main process in the current implementation.
5. **`sttLanguage = "auto"` does not reach Sherpa.** `SherpaSTT.setRecognitionLanguage()` is a no-op (`SherpaSTT.ts:89-95`); `SherpaAutoService` uses Whisper `language: ''` (`:185`). The persisted `auto` is therefore consistent with Sherpa’s actual behavior but is not a provider constraint. Hindi/Marathi selection is not available in the UI in any case.
6. **No Local Whisper worker exists for this provider.** This is expected and confirmed by both code and logs.
7. **Transcript generation is not confirmed from the available log.** The code path is wired, but `SherpaAutoService` deliberately does not log per-chunk/per-segment events. Use diagnostics for the final proof.
8. **Fallback is Web Speech, not Local Whisper.** If Sherpa fails, the app does not silently switch to Local Whisper. It switches to `web-speech`, which uses a hidden browser window and OS/browser speech recognition.

---

## 11. Final Conclusion

### Actual selected provider
**Sherpa-ONNX** (`sherpa`), persisted in `%APPDATA%\natively\credentials.enc`.

### Actual provider receiving microphone audio (current saved settings)
**Sherpa-ONNX interviewer instance** (`googleSTT`, `SherpaSTT` channel `'system'`), because `mockInterviewMode=true` routes mic audio to the interviewer channel. The `googleSTT_User` user instance is prewarmed but **not started**.

### Actual provider receiving system audio (current saved settings)
**None.** `systemAudioCapture` is constructed but `.start()` is not called because Mock Interview Mode is enabled. If Mock Interview Mode is disabled, system audio would go to the same **Sherpa-ONNX interviewer instance** (`googleSTT`).

### Actual fallback
**Web Speech** (`WebSpeechSTT`) if Sherpa initialization/construction fails. **Not** Local Whisper, **not** Google. Current logs show Sherpa initialized successfully, so no fallback is active.

### Is Local Whisper active?
**No.** No Local Whisper STT instance or worker is created for `sttProvider='sherpa'`; no Local Whisper log lines exist.

### Is transcript generation confirmed?
**Selection and audio routing: yes. Transcript generation: not from the inspected log.** The `SherpaAutoService` code path is live and receives mic audio in the current mock-mode run, but the log contains no segment/transcript evidence. Verify with Settings → Audio → **Speech Pipeline Diagnostics** (`Audio chunks received`, `Segments decoded`, `Last transcription`).

---

## Appendix — Exact Source References

| Item | File | Lines |
|---|---|---|
| Credentials path | `electron/services/CredentialsManager.ts` | 10 |
| `getSttProvider()` | `electron/services/CredentialsManager.ts` | 119-131 |
| Encrypted save/load | `electron/services/CredentialsManager.ts` | 545-596 |
| Provider factory | `electron/main.ts` | 1106-1251 |
| `sherpa` branch + Web Speech fallback | `electron/main.ts` | 1211-1222 |
| Both channels created | `electron/main.ts` | 1798-1836 |
| System audio → `googleSTT` | `electron/main.ts` | 1591-1596 |
| Mic → `googleSTT_User` (normal) | `electron/main.ts` | 1721-1723 |
| Mic → `googleSTT` (mock) | `electron/main.ts` | 1710-1716 |
| Mock start branch | `electron/main.ts` | 2905-2911 |
| Prewarm construction | `electron/main.ts` | 1868-1878 |
| Prewarm startup call | `electron/main.ts` | 4525-4527 |
| Local Whisper preload gate | `electron/main.ts` | 391-404 |
| Local Whisper provider branch | `electron/main.ts` | 1224-1246 |
| `SherpaSTT` constructor / ensureInitialized | `electron/audio/SherpaSTT.ts` | 28-41 |
| `SherpaSTT` channel routing / write | `electron/audio/SherpaSTT.ts` | 67-77 |
| `SherpaSTT` language no-op | `electron/audio/SherpaSTT.ts` | 89-95 |
| `SherpaSTT` transcript emit | `electron/audio/SherpaSTT.ts` | 106-116 |
| `SherpaAutoService` lazy constructor | `src/main/services/SherpaAutoService.ts` | 48-53 |
| `ensureInitialized` | `src/main/services/SherpaAutoService.ts` | 59-65 |
| `init` / recognizer | `src/main/services/SherpaAutoService.ts` | 160-203 |
| Silero VAD config | `src/main/services/SherpaAutoService.ts` | 206-225 |
| `processChunk` / `flush` / `decodeSegment` | `src/main/services/SherpaAutoService.ts` | 241-354 |
| Diagnostics endpoint | `electron/ipcHandlers.ts` | 317-324 |
| Diagnostics fields | `electron/main.ts` | 733-748 |
| Diagnostics UI | `src/components/SettingsOverlay.tsx` | 1565-1599 |
| Current settings file | `%APPDATA%\natively\settings.json` | `mockInterviewMode`, `noiseCancellationEnabled`, `onlyInterviewerMode`, `meetingRetention` |
| Current runtime log | `C:\Users\Sanket-PC\Documents\natively_debug.log` | lines 21063-21067, 21213-21217, 21295-21310 |

---

**End of Module 02A report. No source, configuration, model, or UI file was modified. The only runtime action was a read-only decryption of non-secret provider fields.**
