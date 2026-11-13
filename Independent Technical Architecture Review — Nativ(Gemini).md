### **1\. Executive Summary**

Both submitted documents—the **Original Cloud STT/LLM Architecture Research Report** (natively\_cloud\_stt\_llm\_architecture\_research (1).md, hereafter **Report 1**) and the **Independent Technical Validation Report** (natively\_cloud\_architecture\_technical\_validation (1).md, hereafter **Report 2**)—propose a sound macro-architecture: a provider-adapter pattern inside the Electron Main process with local Sherpa-ONNX as the ultimate STT fallback and the existing Custom/Manual LLM as the final LLM fallback. However, **neither document is safe to use as an implementation specification without critical architectural and code-level corrections.**

* **Report 1 (Original Research Report)** provides a solid product scope and migration roadmap, but its TypeScript contracts and failover pseudocode in Section 13 contain **severe concurrency, streaming, and state-machine defects**. Specifically, its STT loop couples audio capture consumption to network writes (causing upstream audio buffer drops during network stalls), never consumes session.events (missing all asynchronous stream errors), fails to update health state or exclude failed providers before re-selecting (causing infinite retry loops on a dead provider), ignores manual selection mode, and risks returning a cloud provider instead of sherpa-local when .at(-1)\! is evaluated.  
* **Report 2 (Independent Technical Validation Report)** accurately identifies almost all of Report 1’s pseudocode flaws and introduces necessary systems-engineering primitives: decoupled producer/consumer buffering, epoch-fenced attempt ownership, and concurrent writer/reader/watchdog supervision. However, Report 2 **introduces new regressions, requirement violations, and over-engineering**:  
  1. It unilaterally changes your product requirements by removing Kaggle from configurable default production profiles rather than giving the user selectable provider profiles.  
  2. It contains a self-contradictory routing bug in its own sttCandidates() pseudocode where manually selecting local sherpa with recovery fallback enabled causes Natively to route audio to **cloud providers first** (\[...clouds, sherpa\]), which it admits in a prose note underneath the code block rather than fixing the code.  
  3. It replaces typed LLM chat messages with readonly unknown\[\] in LlmSnapshot and strips language-detection events from SttEvent.  
  4. It mandates a 60-second sample-exact overlap splicer (wordRanges?: Range\[\]) that breaks down on REST/batch Custom STT endpoints and streaming providers that do not emit sample-accurate word timestamps.

**Core Verdict:** Adopt the **non-destructive adapter scope and user-facing feature set of Report 1**, backed by the **decoupled ring buffer, epoch fencing, and 3-task (writer/reader/watchdog) concurrency supervisor of Report 2**, governed by the **corrected interfaces, VAD-anchored utterance reconciliation, and configurable profile architecture specified in Sections 13 and 14 of this review**.

### **2\. Overall Trust Assessment of Each Report**

| Dimension | Report 1: natively\_cloud\_stt\_llm\_architecture\_research (1).md | Report 2: natively\_cloud\_architecture\_technical\_validation (1).md |
| :---- | :---- | :---- |
| **Overall Trust Rating** | **High for Product Scope & Cloud Quotas; Low for Code/Pseudocode.** | **High for Concurrency & Defect Detection; Medium for Product Alignment.** |
| **Technical Accuracy** | Accurately cites Oracle Always Free Ampere A1 allocations (1,500 OCPU hrs / 9,000 GB hrs \= 2 OCPUs / 12 GB RAM) and Electron 45/46 safeStorage deprecations. | Accurately diagnoses 23 specific bugs in Report 1's pseudocode, safeStorage async return objects, and cURL command-injection vectors. |
| **Feasibility** | Over-optimistic about seamless zero-loss stream switching using simple chunk sequence numbers. | Over-engineered around sub-utterance sample-range splicing across heterogeneous cloud APIs. |
| **Completeness** | Covers UI settings, migration stages, test matrices, and provider comparisons well. | Covers failure modes, backpressure, memory sizing, and security boundaries thoroughly, but omits language-detected events and typed LLM message schemas. |
| **Risk to Existing App** | Low architectural risk if audited first, but high runtime hang/deadlock risk if Section 13 pseudocode is copied. | Moderate product friction if its strict defaults override user-selected Kaggle/Custom workflows. |

### **3\. Confirmed Technically Correct Statements**

The following statements in the reports have been independently verified against official vendor documentation and systems engineering principles:

> 1. **Oracle Cloud Always Free Ampere A1 Compute Limits**  
   * **Report Reference:** Report 1, Section 1 (Executive summary) & Section 7 (Oracle Cloud feasibility assessment); Report 2, Section 3 (Kaggle reliability and production policy).  
   * **Classification:** **Verified Official Fact.**  
   * **Verification:** Oracle Cloud Infrastructure (OCI) Always Free provides **1,500 OCPU hours and 9,000 GB hours per month** for Arm-based VM.Standard.A1.Flex shapes (equivalent to **2 OCPUs and 12 GB RAM** running 24/7), up to **200 GB of total Block Volume storage** (with a minimum 47 GB boot volume per instance), and **20 GB of Object Storage**. Always Free does not include GPU shapes, and Oracle explicitly documents reclamation of idle Always Free compute instances.  
> 2. **Kaggle Notebook Execution Limits, Quotas, and Ephemerality**  
   * **Report Reference:** Report 1, Section 1 & Section 6 (Kaggle feasibility assessment); Report 2, Section 3 (Kaggle reliability and production policy).  
   * **Classification:** **Verified Official Fact.**  
   * **Verification:** Kaggle Notebooks enforce a **12-hour maximum execution limit** for CPU and GPU sessions (9 hours for TPU), a **20 GB limit** on /kaggle/working, and a **weekly GPU quota (\~30 hours/week)** subject to dynamic queue availability. Kaggle is an interactive data-science platform, not a persistent SLA-backed inference host.  
> 3. **Electron safeStorage Asynchronous API & Windows DPAPI Threat Model**  
   * **Report Reference:** Report 1, Section 2 (Mandatory Custom/Manual LLM audit checklist), Section 14, & Section 16 (Security considerations); Report 2, Section 8 (Security validation).  
   * **Classification:** **Verified Official Fact.**  
   * **Verification:** Official Electron safeStorage documentation confirms that synchronous methods (encryptString, decryptString, isEncryptionAvailable) are deprecated and scheduled for removal in Electron 46 in favor of encryptStringAsync, decryptStringAsync, and isAsyncEncryptionAvailable. Furthermore, decryptStringAsync resolves to an object containing { result: string; shouldReEncrypt: boolean }. On Windows, DPAPI encrypts secrets using the current Windows user credential, protecting secrets against other users on the machine but **not** against other processes running as the same logged-in Windows user.  
> 4. **Separation of WASAPI Loopback (system) and Microphone (microphone) Audio Streams**  
   * **Report Reference:** Report 1, Section 11 (Audio capture and streaming architecture); Report 2, Section 4 & Section 10\.  
   * **Classification:** **Technically Reasoned Recommendation / Fact.**  
   * **Verification:** Mixing loopback and microphone audio into a single waveform before STT destroys speaker attribution (Interviewer vs. Candidate), causes acoustic phase cancellation/echo when speakers bleed into the mic, and degrades recognition accuracy during overlapping speech.  
> 5. **Non-Concatenation of Partial LLM Streams Across Failover**  
   * **Report Reference:** Report 1, Section 1 & Section 9 (Interrupted streaming recovery); Report 2, Section 2 & Section 6 (LLM compatibility and recovery).  
   * **Classification:** **Technically Reasoned Recommendation.**  
   * **Verification:** Different LLM providers/models use incompatible tokenizers, reasoning prefixes, and markdown structures; appending tokens from Provider B onto an interrupted stream from Provider A produces garbled, corrupted output.  
> 6. **Node.js Asynchronous I/O vs. Worker Threads for Network Streaming**  
   * **Report Reference:** Report 1, Section 3 (Architectural decisions) & Section 11 (Latency strategy).  
   * **Classification:** **Verified Official Fact.**  
   * **Verification:** Official Node.js worker\_threads documentation states that Workers are useful for CPU-intensive JavaScript operations, whereas Node.js’s built-in asynchronous I/O is more efficient than Workers for network and disk I/O.

### **4\. Incorrect or Technically Misleading Statements**

Every defect identified below includes the exact report name, section heading, technical problem, impact, and required correction.

#### **Defect 4.1: Infinite Provider Reselection Loop on STT Failure**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 13 (TypeScript interfaces and example contracts → STT selection and failover pseudocode)  
* **Technical Problem:** In runSttWithFailover, when session.sendAudio(chunk) throws an error and failoverOrchestrator.onSttFailure(active, error) returns a truthy decision, the catch block immediately executes active \= await selectSttProvider(providers, context) without recording the failure in health or excluding the failed provider ID from the current failover episode. Inside selectSttProvider, provider.healthCheck() is invoked. Because an HTTP /health endpoint often returns 200 OK even when the streaming WebSocket endpoint is failing or rate-limited, selectSttProvider returns the exact same broken provider again.  
* **Impact:** Infinite retry loop on the primary failed provider; failover never advances to Oracle, Custom STT, or local Sherpa.  
* **Correction:** Track attemptedInEpisode: Set\<ProviderId\> per recovery episode and record the failure in the health/circuit-breaker store before selecting the next provider.

#### **Defect 4.2: Blind eligible.at(-1)\! Can Select a Cloud Provider Instead of Local Sherpa**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 13 (TypeScript interfaces and example contracts → STT selection and failover pseudocode)  
* **Technical Problem:** selectSttProvider filters all candidates—including sherpa-local—through .filter(p \=\> p.descriptor.enabled) and .filter(p \=\> health.isEligible(p.descriptor.id)), sorts by priority, loops through provider.healthCheck(), and if none pass, executes return eligible.at(-1)\!; // Sherpa must be the final local fallback. If sherpa-local has a lower numeric priority value than a cloud provider, or is filtered out by generic health.isEligible(), eligible.at(-1)\! returns a **cloud provider** that just failed its health check.  
* **Impact:** Breaks the offline/degraded-mode guarantee and routes audio to an unhealthy cloud provider when all providers fail health checks.  
* **Correction:** Partition cloud candidates from sherpa-local explicitly. Never sort sherpa-local inside the cloud priority array; always append sherpa-local explicitly as the final fallback candidate.

#### **Defect 4.3: Blocking Audio Capture Iterator on Network I/O and Health Polling**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 13 (TypeScript interfaces and example contracts → STT selection and failover pseudocode)  
* **Technical Problem:** runSttWithFailover consumes for await (const chunk of audio) and inside the loop body awaits session.sendAudio(chunk), sequential provider.healthCheck() calls across every candidate inside selectSttProvider, active.startSession(), and replay loops.  
* **Impact:** When a cloud socket stalls (e.g., for 2–5 seconds before TCP timeout), the for await (const chunk of audio) loop is paused at await session.sendAudio(chunk). New audio frames from WASAPI loopback and microphone cannot even enter buffer.append(chunk) and are dropped or overflow the upstream OS capture queue.  
* **Correction:** Decouple capture from network transmission. A non-blocking producer appends every captured frame directly into a bounded in-memory AudioRingBuffer, while the STT consumer reads independently via a cursor. Furthermore, never poll healthCheck() synchronously across all providers on the hot path during session startup or failover.

#### **Defect 4.4: SttSession.events Stream Never Consumed in runSttWithFailover**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 13 (TypeScript interfaces and example contracts → STT selection and failover pseudocode)  
* **Technical Problem:** runSttWithFailover only catches synchronous/promise rejections from session.sendAudio(chunk). It never iterates session.events. In WebSocket and HTTP streaming protocols, writing bytes to the local socket buffer often succeeds while the remote server sends an error frame on the read stream, stops emitting transcripts, or closes the connection asynchronously.  
* **Impact:** Unhandled stream errors, silent transcription hangs, and failure to trigger failover when a provider stops returning transcripts.  
* **Correction:** Supervise three concurrent tasks per attempt (writer, reader over session.events, and an active-speech watchdog) linked to a shared per-attempt AbortController.

#### **Defect 4.5: Manual STT Selection Mode Ignored in selectSttProvider**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 13 (STT selection and failover pseudocode) vs. Section 14 (Provider configuration schema)  
* **Technical Problem:** Section 14 defines stt.mode: 'automatic' \| 'manual' and selectedProviderId?: ProviderId, but selectSttProvider in Section 13 completely ignores mode and selectedProviderId, filtering only by participatesInAutomaticFailover.  
* **Impact:** A user who manually selects a Custom STT provider (which has participatesInAutomaticFailover: false) can never use it because selectSttProvider filters it out.  
* **Correction:** Branch explicitly on policy.mode \=== 'manual' vs. 'automatic' in the candidate resolver.

#### **Defect 4.6: Compile-Time Interface Contradiction on LlmProvider (.id vs. .descriptor.id)**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 9 (LLM adapter contract) vs. Section 13 (LLM selection and interrupted-stream recovery pseudocode)  
* **Technical Problem:** Section 9 defines interface LlmProvider { readonly id: LlmProviderId; readonly kind: ... } with top-level id and kind properties. Section 13 then accesses provider.descriptor.enabled, provider.descriptor.id, and provider.descriptor.priority on LlmProvider.  
* **Impact:** Fails TypeScript compilation (Property 'descriptor' does not exist on type 'LlmProvider') and throws a TypeError at runtime.  
* **Correction:** Standardize both SttProvider and LlmProvider to expose readonly descriptor: ProviderDescriptor.

#### **Defect 4.7: Unhandled error Event in LLM Streaming Loop**

* **Report Name:** Report 1 (natively\_cloud\_stt\_llm\_architecture\_research (1).md)  
* **Section Heading:** Section 13 (LLM selection and interrupted-stream recovery pseudocode)  
* **Technical Problem:** LlmStreamEvent in Section 9 includes type: 'status' \| 'token' \| 'usage' \| 'completed' \| 'error'. However, generateAnswerWithFailover in Section 13 only checks if (event.type \=== 'token') and if (event.type \=== 'completed'). If an adapter yields { type: 'error', error } instead of throwing, the loop ignores it, exits normally, and throws a generic 'LLM stream ended without completion' error, discarding the structured error details (such as 401 Unauthorized or Retry-After headers).  
* **Impact:** Loss of error classification for circuit breaking and diagnostics.  
* **Correction:** Explicitly check if (event.type \=== 'error') throw event.error; inside the for await loop.

#### **Defect 4.8: Manual Local Sherpa Selection Routes Audio to Cloud Providers in Report 2’s Code Block**

* **Report Name:** Report 2 (natively\_cloud\_architecture\_technical\_validation (1).md)  
* **Section Heading:** Section 4 (Corrected internal TypeScript contracts → Selection invariants)  
* **Technical Problem:** In sttCandidates, when policy.mode \=== 'manual' and policy.allowManualRecoveryFallback \=== true, if the user manually selects local sherpa, the code block executes:  
  TypeScript  
  return uniqueById(\[  
    ...(selected.descriptor.id \=== sherpa.descriptor.id ? \[\] : \[selected\]),  
    ...clouds, sherpa  
  \]);

  Because selected.descriptor.id \=== sherpa.descriptor.id is true, the spread evaluates to \[\], and the function returns \[...clouds, sherpa\]\! Report 2 noticed this bug after writing the code block and added a prose note below it (*"REC correction to the sketch above: implement the explicit early return if (selected.id \=== sherpa.id) return \[sherpa\]..."*), which itself uses selected.id instead of selected.descriptor.id\!  
* **Impact:** If implemented as written in the code block, a user manually choosing offline local Sherpa with recovery fallback enabled will have their interview audio streamed to cloud providers first.  
* **Correction:** Put the explicit early return if (selected.descriptor.id \=== sherpa.descriptor.id) return \[sherpa\]; directly inside the manual branch before constructing any cloud fallback list (see Section 14).

#### **Defect 4.9: Erasing Typed LLM Messages (readonly unknown\[\]) and Removing Language-Detected STT Events**

* **Report Name:** Report 2 (natively\_cloud\_architecture\_technical\_validation (1).md)  
* **Section Heading:** Section 4 (Corrected internal TypeScript contracts)  
* **Technical Problem:**  
  1. Report 2 replaces messages: LlmChatMessage\[\] with messages: readonly unknown\[\] inside LlmSnapshot.  
  2. Report 2 removes the language-detected event and language metadata from SttEvent (receipt \| hypothesis \| error \| ended).  
* **Impact:**  
  1. Using readonly unknown\[\] breaks compile-time type safety across all LLM adapters and prevents inspecting message parts for embedded images during multimodal failover.  
  2. Stripping language metadata from SttEvent prevents the UI from showing which language (en, hi, mr) was detected during Auto Detect mode.  
* **Correction:** Restore strongly typed LlmChatMessage unions and include detectedLanguage?: Language and { type: 'language-detected' } in SttStreamEvent (see Section 14).

### **5\. Questionable or Unsupported Claims**

> 1. **Unconditional "No speech is lost or duplicated" Guarantee (Report 1, Section 1 & Section 10\)**  
   * **Report Reference:** Report 1, Section 1 (Executive summary) & Section 10 (STT failover design).  
   * **Analysis:** Report 1 claims that by buffering and replaying unacknowledged chunks with sequence numbers, *"no speech is lost or duplicated"*. As Report 2 rightly notes, this is an unsupported absolute claim:  
     * Cloud STT engines do not segment words along arbitrary 100 ms transport chunk sequence numbers (sequenceNumber).  
     * If Provider A transcribes the first 2.5 seconds of a 4-second sentence and dies, replaying only the remaining 1.5 seconds of raw audio to Provider B gives Provider B clipped acoustic context at the beginning of a word, causing recognition errors or missing words.  
     * Conversely, replaying with a 750 ms overlap (as Report 2 suggests) without word-level timestamps causes boundary words to be transcribed twice.  
   * **Technically Sound Solution:** Use **local Silero VAD utterance boundaries (utteranceId)** as the unit of atomic commit and replay. Since Natively runs local VAD on the audio stream anyway, every speech segment between silence boundaries gets a unique utteranceId. If a cloud provider fails mid-utterance, discard its uncommitted partial hypothesis for that utteranceId and replay the **entire uncommitted utterance from its start sample** to the fallback provider.  
> 2. **Sample-Exact Sub-Utterance Word-Range Trimming Across Arbitrary Providers (Report 2, Section 3 & Section 5\)**  
   * **Report Reference:** Report 2, Section 3 (Failure and recovery sequence) & Section 5 (Corrected supervised STT flow).  
   * **Analysis:** Report 2 proposes replaying audio from lastCanonicalCommit \- 750ms and trimming overlapping words using wordRanges?: Range\[\] mapped to exact PCM sample indices. While valid for local engines that expose exact frame timestamps, **many cloud and Custom STT endpoints (especially REST /v1/audio/transcriptions or standard WebSocket endpoints) do not return sample-accurate word timestamps**, and acoustic models shift word timestamps by 50–200 ms when leading context changes. Relying on sample-range word splicing as the primary reconciliation mechanism introduces unnecessary complexity and edge-case bugs; **VAD utterance-boundary replay** is simpler, deterministic, and works identically on both streaming and REST batch providers.  
> 3. **Kaggle Interactive Idle Timeout: 60 Minutes vs. 20 Minutes (Report 1, Section 6 vs. Report 2, Section 3\)**  
   * **Report Reference:** Report 1, Section 1, 4, & 6 (claims 60-minute idle timeout) vs. Report 2, Section 3 (claims 20-minute editor inactivity timeout).  
   * **Verification Against Official Kaggle Docs:** Both numbers appear on different official Kaggle documentation pages\!  
     * \[https\://www\.kaggle.com/docs/notebooks\](https\://www\.kaggle.com/docs/notebooks) states that interactive notebook sessions terminate after **20 minutes** of editor inactivity.  
     * \[https\://www\.kaggle.com/docs/efficient-gpu-usage\](https\://www\.kaggle.com/docs/efficient-gpu-usage) (an older guide still live on Kaggle’s site) states *"Interactive sessions remain active until they reach the 60 minute idle timeout limit"*.  
     * Furthermore, traffic arriving over an external reverse tunnel (cloudflared / ngrok) inside the container does **not** register as browser UI activity in Kaggle’s frontend editor, unless the notebook is executed via **"Save & Run All" (Commit / Background Session)**, which runs up to 12 hours without requiring an open browser tab.

### **6\. Unverified Claims Requiring Source-Code or Runtime Testing**

Because the actual Natively source code was not provided for this review, the following assumptions and claims in the reports are **Unverified** and require direct codebase inspection or runtime benchmarking:

| Area | Claim / Reference in Reports | What Must Be Verified in Codebase / Runtime |
| :---- | :---- | :---- |
| **Runtime & Build Versions** | Report 1, Sec 2 assumes Electron 45.2.x, Node.js 22, React 19, TypeScript 5.9.x, Vite 5\. | Inspect package.json and package-lock.json to confirm exact installed Electron version and @types/electron signatures for safeStorage.decryptStringAsync. |
| **Existing Custom LLM & cURL Implementation** | Report 1, Sec 2 & 9; Report 2, Sec 6\. | Inspect the existing Custom LLM handler to verify how cURL templates are parsed, how variables (prompt, system prompt, base64 images) are injected, how SSE streams are parsed, and how configs are persisted on disk/SQLite/localStorage. |
| **Native Audio Capture Format** | Report 1, Sec 2 & 11; Report 2, Sec 9\. | Verify whether WASAPI loopback and microphone capture emit 16 kHz mono pcm\_s16le directly or 48 kHz stereo pcm\_f32le. |
| **Local Sherpa-ONNX Model Capabilities** | Report 1, Sec 2 & 4; Report 2, Sec 7 & 12\. | Inspect which Sherpa-ONNX model files are downloaded/loaded (zipformer-en vs. whisper-onnx vs. sense-voice). **Crucial:** If the installed Sherpa model is an English-only streaming transducer, it cannot transcribe Hindi (hi) or Marathi (mr) at all\! |
| **Oracle Ampere A1 (2 OCPU / 12 GB RAM) Real-Time Factor (RTF)** | Report 1, Sec 7; Report 2, Sec 3 & 9\. | Benchmark actual CPU inference speed on an OCI VM.Standard.A1.Flex (2 OCPU, 12 GB RAM) in Mumbai/Hyderabad region for your target STT model (e.g., faster-whisper-small int8) and small LLM (e.g., Qwen2.5-3B / Llama-3.2-3B Q4\_K\_M). |
| **Whisper Dependency Sharing** | Report 1, Sec 18 (Stage 6); Report 2, Sec 10\. | Verify whether any scripts, VAD models, or native binaries used by local Whisper are shared with Sherpa-ONNX before deleting Whisper code in the final stage. |

### **7\. Detailed Contradiction Comparison**

| \# | Contradiction Topic | Report 1 Position | Report 2 Position | Technically Stronger Position & Rationale |
| :---- | :---- | :---- | :---- | :---- |
| **1** | **Role of Kaggle in Provider Profiles** | Recommends Kaggle \-\> Oracle \-\> Custom \-\> Sherpa (STT) and Kaggle \-\> Oracle \-\> Custom (LLM) as the baseline chain. | Excludes Kaggle from default production settings (Oracle \-\> Custom \-\> Sherpa); restricts Kaggle to an explicit per-session temporary toggle. | **Hybrid Configurable Profile Architecture (Requirement 2A):** Your requirement states both Kaggle and Oracle must remain configurable provider profiles in Natively settings and the user must be able to choose which profile to use. Report 2 is right that probing an offline Kaggle endpoint on every session wastes 1.5s if the user didn't start a notebook, but wrong to remove it as a first-class selectable profile. **Resolution:** Provide explicit selectable **Provider Profiles** (Kaggle Primary, Oracle Primary, Custom Order, Local Only) plus a fast 1.5s circuit breaker that immediately trips if Kaggle is unreachable so subsequent utterances incur 0 ms delay. |
| **2** | **Priority Configuration Schema** | Includes both priority?: number on CustomSttConfig / ProviderDescriptor AND priority: ProviderId\[\] in ProviderRegistryConfig. | Rejects dual representation; mandates a single ordered array cloudOrder: ProviderId\[\]. | **Report 2 for storage normalization \+ Report 1 for UI controls (Requirement 2B.3):** Storing both an array of IDs and independent priority: number fields on objects creates synchronization bugs if they drift. **Resolution:** Persist priorityOrder: ProviderId\[\] as the single source of truth in the config store, while exposing numeric priority rank / up-down reordering controls in the UI that deterministically mutate priorityOrder. |
| **3** | **Manual Selection Failure Behavior** | Ignores manual mode in selectSttProvider. | Defaults to strict manual failure (allowManualRecoveryFallback: false), with an optional boolean to fall back to the full cloud+Sherpa chain. | **Extended 3-Option Policy (Requirement 2B.5):** Requirement 2B.5 mandates *"Configurable behavior when manually selected Custom STT fails."* A boolean is insufficient because a user manually testing a Custom STT provider may want it to fall back **only to local Sherpa** (for privacy/cost) rather than triggering other cloud providers, or fail fast, or use the full auto chain. **Resolution:** Use a 3-way enum: 'strict-error' \| 'fallback-sherpa-only' \| 'fallback-auto-chain'. |
| **4** | **Transcript Deduplication Strategy** | Suppresses duplicates when segmentId and normalized text/time range match an already accepted final result. | Rejects text-based deduplication because natural speech contains repeated words ("yes, yes"); relies on attempt epoch ownership and sample ranges. | **Report 2 (Modified with VAD Utterance IDs):** Normalizing and comparing text strings deletes legitimate repeated phrases. Using attemptEpoch \+ utteranceId guarantees that only the active provider attempt can commit a final transcript for a given utterance. |
| **5** | **LLM Context Rebuilding on Failover** | Calls request \= rebuildCanonicalLlmContext(request) in the catch block before trying the next LLM provider. | Freezes an immutable LlmSnapshot once before the retry loop and passes the identical snapshot to all fallback providers. | **Report 2:** If the user or interviewer speaks while Provider 1 is timing out, rebuilding the prompt mid-retry changes the question sent to Provider 2 and risks injecting incomplete state. Freezing an immutable LlmRequestSnapshot per generation trigger ensures deterministic fallback. |
| **6** | **Interrupted LLM Draft Replacement Timing** | Replaces the incomplete draft once the fallback provider produces its first valid token or reaches a minimum progress threshold. | Keeps the interrupted draft visible alongside an isolated replacement draft, replacing by default only after full completion (with first-token switch as opt-in). | **Report 1’s First-Valid-Token Switch (with Isolated Buffers from Report 2):** In a live interview overlay with tight screen real estate, displaying two simultaneous answers (one broken half-answer \+ one streaming replacement) clutters the stealth overlay. Buffer tokens in an isolated AttemptDraft (Report 2), and swap the visible UI draft as soon as the replacement provider emits its **first non-empty content token** (Report 1), while never committing to canonical history until completed. |
| **7** | **Custom STT Streaming vs. Batch Ingestion** | Assumes all SttProvider implementations open a persistent SttSession that accepts continuous sendAudio(chunk) calls. | Distinguishes ingest: 'live-stream' \| 'bounded-upload' in SttCapabilities, noting upload APIs cannot emit true live partials. | **Report 2:** Essential distinction for Requirement 2B. Many popular STT APIs (OpenAI /v1/audio/transcriptions, Groq Whisper REST) are bounded-upload REST endpoints, not WebSockets. |

### **8\. Kaggle and Oracle Feasibility Assessment**

Per **Requirement 2A**, both **Kaggle** and **Oracle Cloud** must remain configurable provider profiles in Natively settings so you can choose which profile to run. Below is the realistic engineering evaluation of all four STT/LLM tiers without assuming either cloud service is permanently available or unconditionally free:

| Evaluation Dimension | Kaggle Notebooks (Configurable Profile) | Oracle Cloud Always Free (Configurable Profile) | Custom Provider (STT / LLM) | Local Sherpa-ONNX (Final STT Fallback) |
| :---- | :---- | :---- | :---- | :---- |
| **Availability & Reliability** | **Low / Ephemeral.** Designed for interactive sessions or batch runs, not 24/7 hosting. Sessions can disconnect or be preempted at any time. | **Moderate–High (Conditional).** Persistent Linux VM, but subject to initial regional capacity availability ("Out of Host Capacity" errors) and idle reclamation. | **Provider-Dependent.** High for managed commercial clouds (OpenAI, Deepgram, Groq); variable for self-hosted endpoints. | **Very High (Offline).** Zero network dependency; works during total internet outages. |
| **Quotas & Execution Limits** | **12h max session runtime** (CPU/GPU); **\~30 hrs/week GPU quota**; 20 GB /kaggle/working disk. | **1,500 OCPU hrs \+ 9,000 GB hrs/month** on Ampere A1 (VM.Standard.A1.Flex \= **2 OCPUs, 12 GB RAM** 24/7) \+ 2 AMD E2.1.Micro VMs \+ 200 GB Block Storage \+ 10 TB/mo egress. | Determined by user’s API plan / rate limits (RPM, TPM, daily audio minutes). | Unlimited. |
| **Idle Timeouts & Reclamation** | **20 min editor inactivity** (or 60 min compute idle). Note: "Save & Run All" background sessions bypass browser editor idle timeouts up to the 12h cap. | **Idle Reclamation Policy:** Oracle reclaims Always Free compute instances if during a 7-day period the 95th percentile CPU, network, and memory (for A1) usage stays below 15–20%. | None for commercial SaaS APIs; serverless GPUs (Modal/RunPod) have cold-start spin-down timeouts. | None. |
| **GPU Availability** | **Free NVIDIA P100 (16 GB VRAM) or Dual T4 (2×15 GB VRAM)** within the 30 hr/wk quota, subject to queueing during peak demand. | **Zero Free GPUs.** Always Free is strictly CPU-only. Paid GPU shapes require account upgrade \+ manual service-limit approval (Contact Us). | Depends on provider (e.g., Groq/OpenAI/Deepgram run on fast cloud GPUs/LPUs). | None (CPU inference on local machine). |
| **CPU-Only Feasibility** | Poor for LLMs; unnecessary on Kaggle since GPU accelerators are free within quota. | **Good for STT, Limited for LLM:** 2 Ampere A1 Arm64 cores can run faster-whisper-base/small (int8) or sherpa-onnx server at \~0.3–0.6x RTF, OR a small 1.5B–3B Q4\_K\_M LLM at \~8–14 tok/s. **Cannot run heavy STT \+ LLM concurrently without CPU saturation.** | N/A (remote managed compute). | **High for STT:** Int8 quantized ONNX models run efficiently on desktop CPUs. |
| **Network Latency (from India)** | **150–350 ms RTT** (Kaggle VMs run in US/Taiwan GCP data centers \+ outbound reverse tunnel hop via Cloudflare Tunnel / ngrok). | **15–45 ms RTT** when provisioned in OCI **India West (Mumbai)** or **India South (Hyderabad)** home regions. | **20–250 ms RTT** depending on provider edge location. | **\< 5 ms** (local memory/IPC). |
| **Deployment & Maintenance Complexity** | **High per-session overhead:** Requires starting the notebook, running the FastAPI/vLLM/Whisper server cell, establishing an authenticated tunnel (cloudflared / ngrok), and verifying the URL before an interview. | **Moderate one-time setup, low ongoing:** Provision Arm64 Ubuntu VM, configure OCI Security Lists \+ ufw, set up Caddy/Nginx auto-TLS, deploy Docker container, and ensure baseline utilization to prevent idle reclamation. | **Very Low:** Enter endpoint URL, auth key, and model name in Natively settings. | **Low:** Bundled or downloaded once locally. |
| **Authentication & Security** | Notebooks lack native API gateway auth. **Must** wrap the notebook’s FastAPI/WebSocket server in custom Bearer token validation over an HTTPS/WSS tunnel. | Public VM IP requires TLS (HTTPS/WSS), strict Bearer token middleware, request size caps, and firewall rules; never embed OCI tenancy admin keys in the desktop client. | Standard Bearer token / custom header over HTTPS/WSS. | Local machine memory only. |
| **Actual Ongoing Cost** | **INR 0** (Permanently Free within weekly quota; no credit card required, only phone verification). | **INR 0 (Conditional Always Free)** if kept strictly within 2 A1 OCPUs / 12 GB RAM / 200 GB Block Storage in Home Region. | Free tier (rate-limited) or Paid per minute/token depending on vendor. | **INR 0**. |

### **9\. Custom STT and Custom LLM Architecture Assessment**

#### **A. Custom STT Architecture & Streaming vs. Batch Distinction (Requirement 2B)**

A critical architectural gap in Report 1 (and only partially addressed in Report 2’s capability flags) is how Natively can support **arbitrary external Custom STT providers** when external STT APIs fall into two fundamentally incompatible transport paradigms:

| Feature | Paradigm 1: Real-Time Streaming STT (websocket-stream) | Paradigm 2: REST / Batch Utterance STT (rest-utterance-upload) |
| :---- | :---- | :---- |
| **Representative Providers** | Deepgram Live WS (wss://\[api.deepgram.com/v1/listen\](https\://api.deepgram.com/v1/listen)), OpenAI Realtime WS, Azure Speech WS, self-hosted WhisperLiveKit / sherpa-onnx-ws-server on Kaggle/Oracle. | OpenAI Audio API (POST /v1/audio/transcriptions), Groq Whisper API (POST /openai/v1/audio/transcriptions), Sarvam AI REST STT, local whisper.cpp HTTP server. |
| **Wire Transport** | Persistent bidirectional WebSocket (wss://) or gRPC stream. | Stateless HTTP POST (multipart/form-data or binary body) per utterance. |
| **Audio Payload Requirement** | Continuous small chunks (e.g., 20–100 ms of raw pcm\_s16le or Opus frames) streamed in real time as the person speaks. | A complete, self-contained audio file (e.g., WAV with a valid 44-byte RIFF/WAVE header containing total byte length, or complete WebM/OGG container) per request. |
| **Partial (Interim) Transcripts** | **Yes:** Server pushes incremental partial hypotheses every 100–300 ms while speech is ongoing, followed by final on endpointing. | **No:** Server only returns a single final transcript after the entire audio segment has been uploaded and processed. |
| **Endpointing / Segmentation** | Handled remotely by the server’s VAD/endpointing (or client Finalize control message). | **Must be segmented locally by Natively’s Silero VAD** before uploading. |

**How Natively Must Support Both Seamlessly:**  
Do not force REST STT endpoints into a fake continuous byte stream, and do not reject REST STT endpoints (since Groq Whisper and OpenAI /v1/audio/transcriptions are the most common OpenAI-compatible Custom STT APIs\!). Instead, implement two standard built-in protocol adapters behind the SttSession interface:

> 1. **WebSocketStreamSttAdapter (ingestionMode: 'websocket-stream'):** Streams AudioFrame chunks continuously every 80–100 ms over wss:// and maps server interim/final JSON messages to partial and final SttStreamEvents.  
> 2. **VadChunkedRestSttAdapter (ingestionMode: 'rest-utterance-upload'):** Accumulates AudioFrame PCM bytes in memory while local Silero VAD reports isVoiced \=== true. While buffering active speech, it emits a local synthetic partial status ("Listening..."). As soon as local VAD detects utterance end (isUtteranceEnd \=== true, e.g., \~500 ms of silence, or a 15-second max utterance cap to prevent unbounded delay), the adapter prepends a 44-byte WAV header in memory (zero disk writes) and sends a single HTTP POST (multipart/form-data with file, model, language, response\_format: "json"), emitting the returned text as a final SttStreamEvent for that utteranceId.

**Verification of the 5 Mandatory Custom STT Controls:**

> 1. **Manual provider selection:** Supported via sttPolicy.mode \= 'manual' and sttPolicy.selectedManualProviderId.  
> 2. **Automatic failover participation when enabled:** Supported when sttPolicy.mode \= 'automatic' and customProvider.participatesInAutoFailover \=== true.  
> 3. **Configurable priority:** Every provider has a user-reorderable rank in sttPolicy.priorityOrder: ProviderId\[\] (allowing Custom STT to be placed before Kaggle, between Kaggle and Oracle, or after Oracle, with local Sherpa always locked last).  
> 4. **Configurable participation in automatic failover:** Controlled by an explicit participatesInAutoFailover: boolean toggle on each Custom STT profile, completely decoupled from whether the profile is enabled for manual selection.  
> 5. **Configurable behavior when manually selected Custom STT fails:** Controlled by sttPolicy.manualFailurePolicy: 'strict-error' \| 'fallback-sherpa-only' \| 'fallback-auto-chain'.

#### **B. Existing Custom LLM and cURL Preservation & Security Assessment (Requirement 2C)**

> 1. **Non-Destructive Preservation Strategy:**  
   * Natively’s existing Custom LLM and cURL configuration engine must be **wrapped, not replaced**, via an ExistingCustomLlmAdapter implementing LlmProvider.  
   * All existing saved configurations, endpoint URLs (whether base URLs or full /v1/chat/completions paths), authentication headers, model strings, SSE streaming parsers, multimodal image inputs, AbortSignal cancellation, and cURL template variables must continue functioning identically.  
> 2. **Security Audit of cURL Configuration, SSRF, and Secret Handling:**  
   * **Arbitrary Command Execution (RCE) Prevention:** A user-supplied cURL configuration string must **never** be executed by spawning curl, cmd.exe, powershell.exe, or /bin/sh via child\_process.exec or spawn. Doing so allows shell metacharacters (&, ;, \|, \`, \$(), \>) or curl flags (-o, \-K, \--trace) to execute arbitrary code or overwrite system files. The cURL string must be parsed **strictly as inert text** by an in-memory lexer/tokenizer into { url, method, headers, bodyTemplate } and executed via Node/Electron’s native fetch API.  
   * **Local File Read Exfiltration (@file) Prevention:** In standard curl, \-d @C:\\Users\\...\\secrets.txt or \-F "file=@..." reads a file from disk and uploads it to the remote server. The cURL template parser must reject any @filepath file-read syntax and only allow explicit in-memory Natively template variables (e.g., {{prompt}}, {{messages}}, {{image\_base64}}).  
   * **SSRF & Cross-Origin Redirect Credential Theft:**  
     * When dispatching requests to a Custom STT or LLM endpoint, configure fetch with redirect: 'manual' (or 'error'). If a 301/302/307/308 redirect is followed, **never** forward Authorization or custom API-key headers if the redirect target’s origin (protocol \+ host \+ port) differs from the configured endpoint origin.  
     * Block credentials embedded in URL userinfo (\[https\://user:pass@example.com\](https\://user:pass@example.com)).  
     * Block cloud metadata IPs (169.254.169.254, \[fd00:ec2::254\]). Allow localhost / 127.0.0.1 / private LAN IPs (192.168.x.x, 10.x.x.x) only when explicitly configured by the user (e.g., for local Ollama or LAN inference servers).  
     * Reject \-k / \--insecure TLS certificate verification bypasses on remote internet endpoints.

### **10\. Language Support Assessment (English, Hindi, Marathi & Code-Switching)**

Per **Requirement 2D**, language support must be evaluated at the **specific acoustic/language model level**, distinguishing four separate technical tasks:

| Linguistic Task | Technical Requirement | Model-Specific Verification (en, hi, mr) |
| :---- | :---- | :---- |
| **1\. Language Identification (LID)** | Automatically classifying the spoken language from audio without a user hint. | **Whisper (large-v3, large-v3-turbo, small, base):** Predicts a language token (\<\|en\|\>, \<\|hi\|\>, \<\|mr\|\>) from the initial audio window. **Known Limitation:** Because Marathi (mr) and Hindi (hi) both use Devanagari script and share significant Sanskrit-derived vocabulary, smaller Whisper models (tiny, base, small) frequently misclassify short (\< 2.5s) Marathi utterances as Hindi (hi). Restricting candidate LID tokens solely to \['en', 'hi', 'mr'\] (ignoring the other 96 Whisper languages) eliminates false detections of Welsh, Arabic, or Urdu\! |
| **2\. Single-Language Multilingual Transcription** | Transcribing English, Hindi, or Marathi when the user sets an explicit language override. | **User Language Override ('en' \| 'hi' \| 'mr'):** When the user explicitly selects Marathi (mr) or Hindi (hi), passing language: 'mr' forces Whisper’s decoder token \<\|mr\|\>\<\|transcribe\|\>, dramatically improving Marathi accuracy and preventing Hindi drift. |
| **3\. Mixed-Language / Intra-Sentence Code-Switching** | Transcribing utterances that blend Hindi+English (*Hinglish*) or Marathi+English (*Minglish*) within a single sentence. | **Model Reality:** Standard Whisper models force a single language tag per segment. Without prompting, \<\|hi\|\> or \<\|mr\|\> often transliterates English technical terms (like *"Spring Boot microservices"*, *"React state"*, *"Kubernetes pod"*) into Devanagari script, or \<\|en\|\> mangles Hindi/Marathi clauses into English phonetic hallucinations. **Verified Mitigation:** Passing a bilingual initial\_prompt (for Whisper/Groq/OpenAI) or using models specifically trained on Indian code-switching (e.g., **OpenAI gpt-4o-transcribe / gpt-4o-mini-transcribe**, **Sarvam AI saaras/saarika**, **Deepgram Nova-2/3**, or **Whisper-large-v3-turbo with bilingual prompt conditioning**) preserves English technical terms alongside Hindi/Marathi conversational phrasing. |
| **4\. Mid-Session Language Switching** | Switching between pure English and Hindi/Marathi across turns in the same interview session. | **Requirement:** Auto Detect must evaluate language **per utterance** (or pass multi-language hints \['en', 'hi', 'mr'\]), not lock a single detected language during the initial WebSocket handshake for the entire 60-minute session. |

#### **Critical Finding on Local Sherpa-ONNX Language Support**

Both reports assume sherpa-local serves as a universal final fallback, with Report 2 briefly noting in Section 12 that Sherpa model language support must be confirmed. Here is the concrete model reality for **Sherpa-ONNX**:

* **Streaming Zipformer Transducers (sherpa-onnx-streaming-zipformer-en-\*):** Support **English (en) ONLY**. They have an English token vocabulary and **cannot output Hindi or Marathi under any circumstances**.  
* **Whisper ONNX Models in Sherpa (sherpa-onnx-whisper-tiny/base/small):** Support en, hi, and mr (99 languages), **but** they operate via offline/chunked VAD windows (not frame-by-frame streaming partials), and tiny/base have high word error rates on Marathi.  
* **SenseVoice (sherpa-onnx-sense-voice-zh-en-ja-ko-yue):** Supports only Chinese, English, Japanese, Korean, and Cantonese—**not** Hindi or Marathi.  
* **Architectural Requirement:** sherpa-local’s SttCapabilities.supportedLanguages must be populated from the **actual installed local model’s manifest**. If the installed local model only supports \['en'\] and the user selects 'hi' or 'mr', Natively must warn the user in Settings and in the status indicator that offline local fallback only supports English unless a multilingual local model is installed.

### **11\. Audio Streaming, Reliability and Failover Assessment**

Critically examining **Requirement 2E** across the entire lifecycle of an audio frame:

#### **1\. Capture Continuity, Dual Streams & Acoustic Bleed**

* **Independent Source Pipelines:** System loopback (system) and Microphone (microphone) must be captured into two separate AudioRingBuffer instances, with independent monotonic sample counters (startSample, endSample), independent Silero VAD states, and independent STT sessions.  
* **Format Normalization at Capture Boundary:** Normalize captured audio to **16 kHz, 16-bit mono PCM (pcm\_s16le)** once before writing into the AudioRingBuffer. At 16 kHz mono PCM16, 1 second \= 32 KB, so a **60-second buffer per source takes only 1.92 MB of RAM** (3.84 MB total for both sources).

#### **2\. Preventing Audio Loss During Failover or Network Interruption**

* **Why Report 1 Loses Audio:** In Report 1, session.sendAudio(chunk) resolves as soon as bytes are copied into the local OS TCP/WebSocket send buffer—long before the remote STT server receives, processes, or commits a transcript for those bytes. If the connection drops 2 seconds later, all frames written during those 2 seconds are lost unless retained until transcript commit.  
* **How to Guarantee Zero Unaccounted Frame Loss Within the 60s Buffer:**  
  1. **Three Distinct Watermarks per Source:**  
     * capturedSample: Latest sample written by WASAPI/mic capture into the Ring Buffer.  
     * sentSample: Latest sample written to the current provider attempt’s socket.  
     * committedSample: End sample of the last **canonically committed final utterance** (or confirmed silence interval).  
  2. **Eviction Rule:** Ring buffer memory is only eligible for overwrite behind committedSample.  
  3. **Failover Replay Rule:** When Provider 1 fails, stalls, or disconnects while capturedSample \> committedSample, Provider 2 opens a new session with its read cursor positioned at committedSample (the exact start of the uncommitted utterance). Provider 2 immediately drains the buffered frames from committedSample to capturedSample and continues reading live frames seamlessly.

#### **3\. Backpressure & Slow-Network Handling**

* **WebSocket Backpressure:** Before calling ws.send(frame.pcm16Bytes), check ws.bufferedAmount. If ws.bufferedAmount \> 256 \* 1024 (8 seconds of unsent audio backed up in the socket buffer), abort the current provider attempt immediately as a transport stall and fail over to the next candidate rather than allowing unbounded memory growth.  
* **Replay Catch-Up Cap:** If a network outage lasts 30 seconds while the user speaks continuously, replaying 30 seconds of backlog into a slow CPU fallback provider (RTF ≈ 0.8) would take 24 seconds just to catch up, delaying all live speech. Enforce a **MAX\_REPLAY\_BACKLOG\_MS \= 12\_000 (12 seconds)**: if uncommitted voiced backlog exceeds 12 seconds on failover, emit an explicit \[Transcript gap: X.Xs during provider switch\] marker for the older audio and replay from the start of the most recent utterance within the 12-second window.

#### **4\. Preventing Duplicate Transcripts, Race Conditions & Zombie Providers**

* **Monotonic Attempt Epochs:** Every STT session attempt receives a strictly increasing integer epoch (1, 2, 3...).  
* **Pre-Abort Invalidation:** Before calling abortController.abort() or session.dispose() on a failing provider, update reconciler.activeEpoch \= nextEpoch synchronously.  
* **Gate Check on Every Event:** The first line of the event reader checks if (event.attemptEpoch \!== reconciler.activeEpoch) continue;. Even if a "zombie" WebSocket from Provider 1 flushes a delayed final event 100 ms after failover to Provider 2 begins, that event carries attemptEpoch: 1 and is deterministically dropped.  
* **Utterance-Keyed Atomic Replacement:** Partials and finals are indexed by (source, utteranceId) rather than fragile text-string matching.

#### **5\. Session Shutdown & Resource Cleanup**

* **Distinguish Graceful Stop vs. Hard Cancel:**  
  * **Graceful Stop (User stops recording / finishes speaking):** Stop capture producer, send finishGracefully() (EOF frame) to the active STT provider, wait up to a bounded **1,500 ms flush deadline** for the final utterance transcript to arrive, commit it, and then call dispose() and zero out the Ring Buffer.  
  * **Hard Cancel / Window Close / Emergency Stop:** Immediately abort the parent AbortController, skip the flush wait, call dispose() with a 500 ms timeout, remove all event listeners, and zero out the Ring Buffer (buffer.fill(0)).

### **12\. Security, Privacy, Latency and Cost Assessment**

#### **A. Mandatory Privacy Controls (Requirement 2G)**

> 1. **Explicit Active Cloud Audio Transmission Indicator:**  
   * Your privacy requirement states: *"cloud audio transmission must be clearly indicated during an active session. Raw audio should not be stored by default."*  
   * **Implementation Requirement:** The STT Supervisor must maintain an authoritative ActivePrivacyTransmissionState pushed over IPC to the Renderer whenever a session starts, fails over, or stops:  
     * When streaming to **Kaggle, Oracle, or Custom STT**: Display a prominent badge in the active session bar: **☁️ Cloud Audio Active: \[Provider Name\]**.  
     * When running on **Local Sherpa-ONNX**: Display **🔒 Local Offline Audio (Sherpa)**.  
     * When **Idle / Stopped**: Display **⏸️ Audio Capture Inactive**.  
> 2. **Zero Default Raw Audio Retention:**  
   * Raw audio frames must never be written to disk (no temporary .wav files in os.tmpdir(), no SQLite blobs, no debug dumps) by default.  
   * For REST/batch Custom STT adapters (VadChunkedRestSttAdapter), construct the 44-byte RIFF/WAV header and Blob/Uint8Array payload **entirely in volatile RAM** and let it be garbage-collected / zeroed immediately after the HTTP request finishes.  
   * When stopSession() is called, explicitly zero out the backing Uint8Array of the AudioRingBuffer (ringBuffer.clearAndZeroMemory()).  
> 3. **Log Redaction:**  
   * Application logs must never record raw audio bytes, transcript text, LLM prompts/responses, API keys, Authorization headers, or signed tunnel URLs. Log only providerId, attemptEpoch, latencyMs, and error.category.

#### **B. Electron Security, IPC Validation & Secret Storage**

> 1. **safeStorage Defensive Wrapper:**  
   * Store all API keys, Bearer tokens, and tunnel credentials in the Main process using Electron’s safeStorage.  
   * Because Electron 45/46 deprecates sync methods and decryptStringAsync returns { result: string; shouldReEncrypt: boolean } in modern Electron, use a defensive wrapper:  
     TypeScript  
     async function decryptSecretSafely(encryptedBase64: string): Promise\<string\> {  
       if (\!(await safeStorage.isAsyncEncryptionAvailable())) {  
         throw new Error('OS secure storage (DPAPI) is unavailable; refusing plaintext fallback.');  
       }  
       const buffer \= Buffer.from(encryptedBase64, 'base64');  
       const decrypted \= await safeStorage.decryptStringAsync(buffer);  
       // Handle both object return ({ result, shouldReEncrypt }) and legacy string return  
       return typeof decrypted \=== 'string' ? decrypted : decrypted.result;  
     }

> 2. **Strict IPC Validation & Context Isolation:**  
   * Keep contextIsolation: true, sandbox: true, and nodeIntegration: false on all BrowserWindows.  
   * Validate event.senderFrame origin on every ipcMain.handle call.  
   * Never pass raw IpcMainInvokeEvent or IpcRendererEvent objects across contextBridge.  
   * Settings read IPC (settings:get-providers) must return only secretConfigured: boolean and a masked preview ("•••9f2a"), never the decrypted secret.

#### **C. Strict 5-Category Cost & Free-Tier Separation (Requirement 2G)**

No service should ever be described simply as "free" without stating its exact operational category and conditions:

| Cost Category | Services in Scope | Exact Conditions, Quotas & Financial Risks |
| :---- | :---- | :---- |
| **1\. Permanently Free (Local Execution)** | • **Sherpa-ONNX Local STT** • **Local Ollama / Llama.cpp** | **INR 0 forever**. Runs on local hardware. Zero network latency, zero cloud billing risk, 100% private. Constrained by local CPU cores and RAM. |
| **2\. Permanently Free Tier with Hard Quotas (No Billing Card)** | • **Kaggle Notebooks** | **INR 0**. Requires phone-verified Kaggle account. **Quotas:** \~30 hrs/week GPU (T4×2 or P100), max 12 hrs per session, 20–60 min interactive idle timeout. Cannot be billed for overages because no credit card is attached. Not suitable for 24/7 unattended uptime. |
| **3\. Conditional "Always Free" Cloud Resources** | • **Oracle Cloud (OCI) Always Free (VM.Standard.A1.Flex, E2.1.Micro, 200 GB Block Storage)** | **INR 0 only if all conditions are met:** 1\. Requires credit/debit card identity verification at signup. 2\. Must be created in your designated **Home Region**. 3\. Total Ampere A1 usage across all instances must not exceed **1,500 OCPU hours and 9,000 GB hours/month** (2 OCPUs \+ 12 GB RAM 24/7). 4\. **Idle Reclamation Risk:** Oracle reclaims Always Free VMs if CPU/network/RAM utilization stays below 15–20% over 7 days. 5\. **No Free GPUs**. If upgraded to a Pay-As-You-Go (PAYG) account, exceeding the free OCPU/GB/Storage cap incurs standard commercial billing. |
| **4\. Temporary Trials & Promotional Credits** | • **Oracle 30-Day Free Trial** (\$300 credit) • **Deepgram Signup Credit** (\$200) • **GCP / Azure / RunPod / Modal Trial Credits** | **Time-limited or balance-limited promotional offers**. Once the trial period expires or credits are exhausted, instances are either disabled/deleted (OCI Free Tier accounts have over-limit A1 shapes disabled and deleted after 30 days) or billed to your card. **Never treat trial credits as a permanent free architecture.** |
| **5\. Commercial Rate-Limited Free API Tiers & Paid Services** | • **Rate-Limited Free APIs:** Groq Cloud Free Tier, Google AI Studio Free Tier, OpenRouter :free models. • **Paid-Only APIs:** OpenAI API, Anthropic API, paid GPU VMs. | **Rate-Limited Free APIs:** Cost INR 0 within strict RPM (Requests Per Minute), RPD (Requests Per Day), and audio-seconds/hour quotas; frequently permit provider model training/logging on free-tier traffic. **Paid APIs:** Billed per audio minute (e.g., $0.0036–$0.006/min for STT) or per million tokens. |

### **13\. Corrected Architecture Recommendations**

To satisfy all requirements in Section 2 while resolving every technical defect in Reports 1 and 2:

Plaintext  
\+-----------------------------------------------------------------------------------+  
\|                        ELECTRON RENDERER (React \+ Redux)                          \|  
\|  • Provider Profile Selector: \[Kaggle Primary \| Oracle Primary \| Custom \| Local\]  \|  
\|  • Active Privacy Indicator:  \[☁️ Cloud Audio: Oracle\] vs \[🔒 Local: Sherpa\]      \|  
\|  • Transcript View (Partials \+ Finals) & Isolated LLM Draft Streaming View        \|  
\+-----------------------------------------\|-----------------------------------------+  
                                          \| Narrow, sender-validated contextBridge IPC  
                                          \| (Secrets never returned to Renderer)  
\+-----------------------------------------v-----------------------------------------+  
\|                           ELECTRON MAIN / UTILITY PROCESS                         \|  
\|                                                                                   \|  
\|  1\. AUDIO CAPTURE & VAD PRODUCER (Non-blocking, decoupled from network)           \|  
\|     \[WASAPI Loopback ('system')\] \---\> \[16kHz Mono Downsampler \+ Silero VAD\]       \|  
\|     \[Microphone ('microphone')\]  \---\> \[16kHz Mono Downsampler \+ Silero VAD\]       \|  
\|                                               \|                                   \|  
\|                                               v                                   \|  
\|     \[In-Memory AudioRingBuffer (60s cap / 1.92 MB per source; zeroed on stop)\]    \|  
\|     Tracks: capturedSample \| sentSample \| committedSample \| utteranceId           \|  
\|                                               \|                                   \|  
\|  2\. STT SUPERVISOR (Per Source: Concurrent Writer \+ Reader \+ Voiced Watchdog)     \|  
\|     Epoch-Fenced Ownership (e1, e2...) \+ Utterance-Anchored Replay                \|  
\|        \|                   \|                        \|                   \|         \|  
\|        v                   v                        v                   v         \|  
\|  \[Kaggle Adapter\]   \[Oracle Adapter\]   \[Custom STT Adapters\]    \[Sherpa Local\]    \|  
\|  (WS or REST)       (WS or REST)       (WS Stream OR VAD-REST)  (Always Final)    \|  
\|                                                                                   \|  
\|  3\. LLM FAILOVER ORCHESTRATOR (Immutable LlmRequestSnapshot per turn)             \|  
\|     Isolated AttemptDraftBuffer \-\> First-Token UI Swap \-\> Atomic Final Commit     \|  
\|        \|                         \|                              \|                 \|  
\|        v                         v                              v                 \|  
\|  \[Kaggle LLM Adapter\]   \[Oracle LLM Adapter\]   \[Existing Custom/cURL LLM Wrapper\] \|  
\+-----------------------------------------------------------------------------------+

> 1. **Preserve Both Kaggle and Oracle as First-Class User-Selectable Profiles:**  
   * Do not hard-disable Kaggle as Report 2 proposes, and do not hang on Kaggle when inactive as Report 1 risks.  
   * Give the user explicit selectable profiles (Kaggle \-\> Oracle \-\> Custom \-\> Sherpa, Oracle \-\> Custom \-\> Sherpa, Custom Priority Order, Local Sherpa Only), backed by a **1,500 ms connection/readiness timeout** and a **session circuit breaker**. If Kaggle is selected as \#1 in the active profile but the notebook isn't running, the first connect attempt fails in ≤ 1.5s, opens Kaggle’s circuit for a cooldown window (with a manual "Retry Kaggle" button in UI), and routes all audio to Oracle/Custom/Sherpa with zero ongoing latency penalty.  
> 2. **Use Local Silero VAD Utterance Boundaries (utteranceId) for Both Failover Replay and REST Custom STT:**  
   * Every speech segment bounded by local VAD gets a monotonic utteranceId and startSample / endSample.  
   * If a streaming provider fails mid-utterance, replay from that utterance’s startSample to the fallback provider and overwrite the uncommitted partial for utteranceId.  
   * If a Custom STT provider is a REST/batch endpoint (rest-utterance-upload), buffer the frames for utteranceId until VAD marks isUtteranceEnd, wrap them in an in-memory WAV header, and POST the complete utterance.  
> 3. **Wrap Existing Custom LLM & cURL Non-Destructively:**  
   * Keep the existing Custom LLM configuration schema, cURL template variables, and SSE parser intact inside ExistingCustomLlmAdapter, adding only pure-parser sanitization (no shell execution, no @file uploads, no cross-origin redirect auth leaks) and safeStorage encryption.

### **14\. Corrected TypeScript Interfaces and Pseudocode**

The following TypeScript contracts and orchestration logic directly replace the flawed interfaces and pseudocode in **Report 1 (Sections 5, 9, 13, 14\)** and **Report 2 (Sections 4, 5, 6\)**.

#### **A. Corrected TypeScript Contracts**

TypeScript  
// \============================================================================  
// 1\. IDENTIFIERS, PRIVACY STATE & CONFIGURABLE PROFILES  
// \============================================================================

export type ProviderId \= string; // e.g., 'kaggle-stt', 'oracle-stt', 'custom-stt-1', 'sherpa-local'  
export type AudioSourceId \= 'system' \| 'microphone';  
export type HostingEnvironment \= 'kaggle' \| 'oracle' \| 'custom-cloud' \| 'local';  
export type SupportedLanguage \= 'en' \| 'hi' \| 'mr';  
export type LanguageSelection \= 'auto' \| SupportedLanguage;

export type SttProfileId \=  
  \| 'kaggle-primary'   // Kaggle \-\> Oracle \-\> Opted-in Custom \-\> Sherpa  
  \| 'oracle-primary'   // Oracle \-\> Opted-in Custom \-\> Sherpa  
  \| 'custom-order'     // User-ordered cloud list \-\> Sherpa  
  \| 'local-only';      // Sherpa only (100% offline)

export type ManualSttFailureBehavior \=  
  \| 'strict-error'         // Stop & surface error; never switch silently  
  \| 'fallback-sherpa-only' // Fall back strictly to local offline Sherpa  
  \| 'fallback-auto-chain'; // Fall back through enabled automatic failover chain

export interface ActivePrivacyIndicatorState {  
  readonly transmissionMode: 'idle' \| 'local-only' \| 'cloud-active';  
  readonly activeProviderId?: ProviderId;  
  readonly activeProviderName?: string;  
  readonly hosting?: HostingEnvironment;  
  readonly endpointHostname?: string;  
}

export interface ProviderDescriptor {  
  readonly id: ProviderId;  
  readonly displayName: string;  
  readonly hosting: HostingEnvironment;  
  readonly enabled: boolean;  
  readonly participatesInAutoFailover: boolean;  
}

export interface SttSelectionPolicy {  
  readonly mode: 'automatic' \| 'manual';  
  readonly activeProfile: SttProfileId;  
  readonly selectedManualProviderId?: ProviderId;  
  readonly manualFailureBehavior: ManualSttFailureBehavior;  
  /\*\* Single canonical source of truth for cloud priority order; 'sherpa-local' is always appended last \*/  
  readonly cloudPriorityOrder: readonly ProviderId\[\];  
  readonly language: LanguageSelection;  
  readonly expectedLanguages: readonly SupportedLanguage\[\];  
}

// \============================================================================  
// 2\. AUDIO FRAMES & VAD-SEGMENTED RING BUFFER CONTRACTS  
// \============================================================================

export interface AudioFormatTuple {  
  readonly container: 'raw' \| 'wav' \| 'webm' \| 'ogg';  
  readonly encoding: 'pcm\_s16le' \| 'pcm\_f32le' \| 'opus';  
  readonly sampleRateHz: 16000 \| 24000 \| 48000;  
  readonly channels: 1 \| 2;  
}

export interface CapturedAudioFrame {  
  readonly sessionId: string;  
  readonly source: AudioSourceId;  
  readonly seq: number;  
  readonly utteranceId: string;     // Assigned by local Silero VAD segmenter  
  readonly isVoiced: boolean;       // True when local VAD detects speech  
  readonly isUtteranceEnd: boolean; // True on speech-to-silence endpoint transition  
  readonly startSample: number;     // Monotonic per-source sample index at 16kHz  
  readonly endSample: number;       // Exclusive  
  readonly sampleRateHz: 16000;  
  readonly pcm16Bytes: Uint8Array;  // Normalized 16kHz mono PCM16 in volatile RAM  
}

export interface AttemptContext {  
  readonly attemptId: string;  
  readonly epoch: number;  
  readonly providerId: ProviderId;  
  readonly signal: AbortSignal;  
}

// \============================================================================  
// 3\. STT CAPABILITIES, EVENTS & SESSION CONTRACTS  
// \============================================================================

export interface SttCapabilities {  
  readonly ingestionMode: 'websocket-stream' \| 'rest-utterance-upload';  
  readonly acceptedFormats: readonly AudioFormatTuple\[\];  
  readonly supportedLanguages: readonly SupportedLanguage\[\];  
  readonly autoLanguageDetection: 'none' \| 'session' \| 'utterance';  
  readonly codeSwitching: 'verified' \| 'prompt-assisted' \| 'unsupported';  
  readonly emitsPartials: boolean;  
}

export type ProviderErrorCategory \=  
  \| 'auth'  
  \| 'quota-or-rate-limit'  
  \| 'connect-timeout'  
  \| 'voiced-stall-timeout'  
  \| 'transport'  
  \| 'protocol'  
  \| 'unsupported-capability'  
  \| 'cancelled';

export interface ProviderError {  
  readonly category: ProviderErrorCategory;  
  readonly tripCircuitImmediately: boolean;  
  readonly retryAfterMs?: number;  
  readonly safeMessage: string; // Redacted; safe for UI & logs  
}

export type SttStreamEvent \=  
  \| {  
      type: 'ready';  
      providerId: ProviderId;  
      attemptEpoch: number;  
    }  
  \| {  
      type: 'partial';  
      providerId: ProviderId;  
      attemptEpoch: number;  
      source: AudioSourceId;  
      utteranceId: string;  
      text: string;  
      detectedLanguage?: SupportedLanguage;  
    }  
  \| {  
      type: 'final';  
      providerId: ProviderId;  
      attemptEpoch: number;  
      source: AudioSourceId;  
      utteranceId: string;  
      text: string;  
      startSample: number;  
      endSample: number;  
      detectedLanguage?: SupportedLanguage;  
      confidence?: number;  
    }  
  \| {  
      type: 'language-detected';  
      providerId: ProviderId;  
      attemptEpoch: number;  
      language: SupportedLanguage;  
    }  
  \| {  
      type: 'error';  
      providerId: ProviderId;  
      attemptEpoch: number;  
      error: ProviderError;  
    }  
  \| {  
      type: 'ended';  
      providerId: ProviderId;  
      attemptEpoch: number;  
      expected: boolean;  
    };

export interface SttSession {  
  readonly events: AsyncIterable\<SttStreamEvent\>;  
  sendFrame(frame: CapturedAudioFrame): Promise\<void\>;  
  finishGracefully(): Promise\<void\>;  
  dispose(): Promise\<void\>;  
}

export interface SttProvider {  
  readonly descriptor: ProviderDescriptor;  
  readonly capabilities: SttCapabilities;  
  openSession(  
    options: {  
      sessionId: string;  
      source: AudioSourceId;  
      language: LanguageSelection;  
      expectedLanguages: readonly SupportedLanguage\[\];  
    },  
    attempt: AttemptContext  
  ): Promise\<SttSession\>;  
}

// \============================================================================  
// 4\. STRONGLY TYPED LLM SNAPSHOT & PROVIDER CONTRACTS  
// \============================================================================

export type LlmContentPart \=  
  \| { readonly type: 'text'; readonly text: string }  
  \| {  
      readonly type: 'image';  
      readonly mimeType: 'image/png' \| 'image/jpeg' \| 'image/webp';  
      readonly base64Data: string;  
    };

export interface LlmChatMessage {  
  readonly role: 'system' \| 'user' \| 'assistant';  
  readonly content: string \| readonly LlmContentPart\[\];  
}

export interface LlmRequestSnapshot {  
  readonly requestId: string;  
  readonly sessionId: string;  
  readonly contextVersion: number;  
  readonly systemPrompt: string;  
  readonly messages: readonly LlmChatMessage\[\];  
  readonly requiresImageSupport: boolean;  
  readonly modelOverride?: string;  
  readonly temperature?: number;  
  readonly topP?: number;  
  readonly maxOutputTokens?: number;  
}

export interface LlmCapabilities {  
  readonly streaming: boolean;  
  readonly supportsImageInput: boolean;  
  readonly maxContextTokens?: number;  
}

export type LlmStreamEvent \=  
  \| { readonly type: 'delta'; readonly textDelta: string }  
  \| { readonly type: 'completed'; readonly finishReason: 'stop' \| 'length' \| 'other' }  
  \| { readonly type: 'error'; readonly error: ProviderError };

export interface LlmProvider {  
  readonly descriptor: ProviderDescriptor;  
  readonly capabilities: LlmCapabilities;  
  generateStream(  
    snapshot: LlmRequestSnapshot,  
    attempt: AttemptContext  
  ): AsyncIterable\<LlmStreamEvent\>;  
}

#### **B. Corrected STT Candidate Resolver (Fixes Report 1 & Report 2 Selection Bugs)**

TypeScript  
export function resolveOrderedSttCandidates(  
  policy: SttSelectionPolicy,  
  registry: {  
    getStt(id: ProviderId): SttProvider \| undefined;  
    getLocalSherpa(): SttProvider;  
  },  
  healthStore: {  
    isEligibleForAttempt(id: ProviderId): boolean;  
  },  
  attemptedInEpisode: ReadonlySet\<ProviderId\>  
): SttProvider\[\] {  
  const sherpa \= registry.getLocalSherpa();

  const supportsRequestedLanguage \= (provider: SttProvider): boolean \=\> {  
    if (policy.language \=== 'auto') return true;  
    return provider.capabilities.supportedLanguages.includes(policy.language);  
  };

  // 1\. Local-Only Profile strictly returns Sherpa  
  if (policy.activeProfile \=== 'local-only') {  
    return attemptedInEpisode.has(sherpa.descriptor.id) ? \[\] : \[sherpa\];  
  }

  // 2\. Determine baseline cloud order from active profile  
  let baseCloudOrder: readonly ProviderId\[\] \= policy.cloudPriorityOrder;  
  if (policy.activeProfile \=== 'kaggle-primary') {  
    baseCloudOrder \= \[  
      'kaggle-stt',  
      'oracle-stt',  
      ...policy.cloudPriorityOrder.filter((id) \=\> id \!== 'kaggle-stt' && id \!== 'oracle-stt'),  
    \];  
  } else if (policy.activeProfile \=== 'oracle-primary') {  
    baseCloudOrder \= \[  
      'oracle-stt',  
      ...policy.cloudPriorityOrder.filter((id) \=\> id \!== 'kaggle-stt' && id \!== 'oracle-stt'),  
    \];  
  }

  const eligibleClouds \= baseCloudOrder  
    .map((id) \=\> registry.getStt(id))  
    .filter((p): p is SttProvider \=\> Boolean(p))  
    .filter((p) \=\> p.descriptor.id \!== sherpa.descriptor.id)  
    .filter((p) \=\> p.descriptor.enabled && p.descriptor.participatesInAutoFailover)  
    .filter((p) \=\> \!attemptedInEpisode.has(p.descriptor.id))  
    .filter((p) \=\> healthStore.isEligibleForAttempt(p.descriptor.id))  
    .filter(supportsRequestedLanguage);

  // 3\. Manual Selection Mode  
  if (policy.mode \=== 'manual') {  
    const manual \= policy.selectedManualProviderId  
      ? registry.getStt(policy.selectedManualProviderId)  
      : undefined;

    if (\!manual \|\| \!manual.descriptor.enabled) {  
      throw new Error('Manually selected STT provider is missing or disabled.');  
    }

    // Explicit early return if user manually chose local Sherpa (Fixes Report 2 Sec 4 bug)  
    if (manual.descriptor.id \=== sherpa.descriptor.id) {  
      return attemptedInEpisode.has(sherpa.descriptor.id) ? \[\] : \[sherpa\];  
    }

    const firstChoice \= attemptedInEpisode.has(manual.descriptor.id) ? \[\] : \[manual\];

    if (policy.manualFailureBehavior \=== 'strict-error') {  
      return firstChoice;  
    }  
    if (policy.manualFailureBehavior \=== 'fallback-sherpa-only') {  
      const localTail \= attemptedInEpisode.has(sherpa.descriptor.id) ? \[\] : \[sherpa\];  
      return \[...firstChoice, ...localTail\];  
    }  
    // 'fallback-auto-chain'  
    const remainingClouds \= eligibleClouds.filter(  
      (c) \=\> c.descriptor.id \!== manual.descriptor.id  
    );  
    const localTail \= attemptedInEpisode.has(sherpa.descriptor.id) ? \[\] : \[sherpa\];  
    return \[...firstChoice, ...remainingClouds, ...localTail\];  
  }

  // 4\. Automatic Mode: Eligible Cloud Providers \-\> Local Sherpa Always Appended Last  
  const sherpaFallback \= attemptedInEpisode.has(sherpa.descriptor.id) ? \[\] : \[sherpa\];  
  return \[...eligibleClouds, ...sherpaFallback\];  
}

#### **C. Corrected LLM Failover with Immutable Snapshot & Isolated Drafts**

TypeScript  
export async function executeLlmWithFailover(  
  snapshot: LlmRequestSnapshot, // Frozen once per request; never mutated across retries  
  candidates: readonly LlmProvider\[\],  
  healthStore: HealthStore,  
  uiDrafts: {  
    renderStreamingDraft(info: {  
      requestId: string;  
      providerId: ProviderId;  
      text: string;  
      status: 'streaming' \| 'interrupted';  
    }): void;  
    commitFinalAnswer(info: {  
      requestId: string;  
      providerId: ProviderId;  
      text: string;  
    }): void;  
  },  
  parentSignal: AbortSignal  
): Promise\<void\> {  
  let attemptEpoch \= 0;  
  let activeEpoch \= 0;  
  const committedRequests \= new Set\<string\>();

  for (const provider of candidates) {  
    parentSignal.throwIfAborted();

    // Never silently drop images on a text-only fallback provider  
    if (snapshot.requiresImageSupport && \!provider.capabilities.supportsImageInput) {  
      continue;  
    }  
    if (\!healthStore.isEligibleForAttempt(provider.descriptor.id)) {  
      continue;  
    }

    const attemptAbort \= new AbortController();  
    const onParentAbort \= () \=\> attemptAbort.abort(parentSignal.reason);  
    parentSignal.addEventListener('abort', onParentAbort, { once: true });

    const attempt: AttemptContext \= {  
      attemptId: crypto.randomUUID(),  
      epoch: \++attemptEpoch,  
      providerId: provider.descriptor.id,  
      signal: attemptAbort.signal,  
    };  
    activeEpoch \= attempt.epoch;

    // Isolated token accumulator for this specific attempt only  
    const attemptChunks: string\[\] \= \[\];  
    let completedValidly \= false;

    try {  
      for await (const event of withTokenTimeouts(  
        provider.generateStream(snapshot, attempt),  
        { firstTokenMs: 4500, interTokenMs: 8000, signal: attempt.signal }  
      )) {  
        if (attempt.epoch \!== activeEpoch) break;

        if (event.type \=== 'error') {  
          throw event.error;  
        }  
        if (event.type \=== 'delta') {  
          if (event.textDelta.length \> 0) {  
            attemptChunks.push(event.textDelta);  
            // Replaces any prior interrupted draft cleanly only once valid tokens arrive  
            uiDrafts.renderStreamingDraft({  
              requestId: snapshot.requestId,  
              providerId: provider.descriptor.id,  
              text: attemptChunks.join(''),  
              status: 'streaming',  
            });  
          }  
        }  
        if (event.type \=== 'completed') {  
          const finalOutput \= attemptChunks.join('').trim();  
          if (finalOutput.length \=== 0) {  
            throw {  
              category: 'protocol',  
              tripCircuitImmediately: false,  
              safeMessage: 'LLM stream completed with empty response body',  
            } satisfies ProviderError;  
          }  
          completedValidly \= true;  
          break;  
        }  
      }

      if (\!completedValidly) {  
        throw {  
          category: 'transport',  
          tripCircuitImmediately: false,  
          safeMessage: 'LLM stream terminated prematurely before completion event',  
        } satisfies ProviderError;  
      }

      // Atomic commit check prevents duplicate final answers  
      if (attempt.epoch \=== activeEpoch && \!committedRequests.has(snapshot.requestId)) {  
        committedRequests.add(snapshot.requestId);  
        healthStore.recordSuccess(provider.descriptor.id);  
        uiDrafts.commitFinalAnswer({  
          requestId: snapshot.requestId,  
          providerId: provider.descriptor.id,  
          text: attemptChunks.join(''),  
        });  
        return;  
      }  
    } catch (error) {  
      if (parentSignal.aborted) throw parentSignal.reason;

      healthStore.recordFailure(provider.descriptor.id, error);

      if (attemptChunks.length \> 0) {  
        // Mark current draft interrupted; next provider starts with a clean empty array  
        uiDrafts.renderStreamingDraft({  
          requestId: snapshot.requestId,  
          providerId: provider.descriptor.id,  
          text: attemptChunks.join(''),  
          status: 'interrupted',  
        });  
      }  
    } finally {  
      if (activeEpoch \=== attempt.epoch) {  
        activeEpoch \= \-1; // Invalidate before aborting  
      }  
      attemptAbort.abort();  
      parentSignal.removeEventListener('abort', onParentAbort);  
    }  
  }

  throw new Error('All eligible LLM providers failed to complete the response.');  
}

### **15\. Official Documentation and Direct Source URLs**

> 1. **Oracle Cloud Infrastructure Always Free Resources & Idle Reclamation Rules:**  
   * \[https\://docs.oracle.com/iaas/Content/FreeTier/freetier\_topic-Always\_Free\_Resources.htm\](https\://docs.oracle.com/iaas/Content/FreeTier/freetier\_topic-Always\_Free\_Resources.htm)  
   * \[https\://www\.oracle.com/in/cloud/free/\](https\://www\.oracle.com/in/cloud/free/)  
> 2. **Kaggle Notebooks Documentation, Session Limits, Idle Timeouts & GPU Quotas:**  
   * \[https\://www\.kaggle.com/docs/notebooks\](https\://www\.kaggle.com/docs/notebooks)  
   * \[https\://www\.kaggle.com/docs/efficient-gpu-usage\](https\://www\.kaggle.com/docs/efficient-gpu-usage)  
> 3. **Electron Security, Context Isolation, IPC & safeStorage API:**  
   * \[https\://www\.electronjs.org/docs/latest/api/safe-storage\](https\://www\.electronjs.org/docs/latest/api/safe-storage)  
   * \[https\://www\.electronjs.org/docs/latest/tutorial/security\](https\://www\.electronjs.org/docs/latest/tutorial/security)  
   * \[https\://www\.electronjs.org/docs/latest/tutorial/context-isolation\](https\://www\.electronjs.org/docs/latest/tutorial/context-isolation)  
   * \[https\://www\.electronjs.org/docs/latest/tutorial/ipc\](https\://www\.electronjs.org/docs/latest/tutorial/ipc)  
> 4. **Node.js Worker Threads & AbortController / AbortSignal Globals:**  
   * \[https\://nodejs.org/api/worker\_threads.html\](https\://nodejs.org/api/worker\_threads.html)  
   * \[https\://nodejs.org/api/globals.html\#class-abortcontroller\](https\://nodejs.org/api/globals.html\#class-abortcontroller)  
> 5. **OpenAI Speech-to-Text (Batch REST vs. Realtime WebSocket) & Language Hints:**  
   * \[https\://platform.openai.com/docs/guides/speech-to-text\](https\://platform.openai.com/docs/guides/speech-to-text)  
   * \[https\://platform.openai.com/docs/guides/realtime-transcription\](https\://platform.openai.com/docs/guides/realtime-transcription)  
> 6. **Sherpa-ONNX Official Pre-trained Models & Language Support Matrix:**  
   * \[https\://k2-fsa.github.io/sherpa/onnx/pretrained\_models/index.html\](https\://k2-fsa.github.io/sherpa/onnx/pretrained\_models/index.html)

### **16\. Questions That the Application Owner Must Answer**

Before proceeding to implementation, please answer these 8 architectural and product questions:

> 1. **Local Sherpa-ONNX Model Selection for Hindi & Marathi:**  
   * Which specific Sherpa-ONNX model is currently installed in Natively? If it is an English-only streaming Zipformer model, do you want to bundle/download a multilingual Sherpa-ONNX Whisper model (whisper-small / whisper-base int8) so local fallback supports Hindi and Marathi, or keep local Sherpa English-only and warn the user when Hindi/Marathi is selected offline?  
> 2. **Oracle Always Free Workload Allocation (STT vs. LLM):**  
   * Because an Oracle Always Free VM.Standard.A1.Flex instance has 2 Arm OCPUs and 12 GB RAM, running both real-time STT and a local CPU LLM simultaneously will cause severe CPU contention. Should the Oracle VM be dedicated primarily to **persistent streaming STT**, while LLM requests route to Kaggle (when active) or Custom LLM APIs?  
> 3. **Manual Custom STT Failure Default:**  
   * When a manually selected Custom STT provider fails mid-session, which of the three configurable behaviors should be the **default** out of the box:  
     * 'fallback-sherpa-only' (fall back strictly to offline local Sherpa),  
     * 'fallback-auto-chain' (fall back to the automatic cloud \+ Sherpa chain), or  
     * 'strict-error' (stop transcription and alert the user)?  
> 4. **Target Custom STT Providers for Phase 1:**  
   * Which external STT providers do you plan to use first via Custom STT (e.g., Groq Whisper REST API, OpenAI /v1/audio/transcriptions, Deepgram WebSocket, Sarvam AI)?  
> 5. **Preferred Tunneling Mechanism for Kaggle Notebooks:**  
   * For your Kaggle Notebook server script, do you prefer **Cloudflare Tunnel (cloudflared)** or **ngrok** (with a free static domain \+ Bearer token header enforcement)?  
> 6. **Multimodal (Image/Screenshot) Fallback Behavior:**  
   * When an LLM prompt contains a screenshot/image and the primary vision LLM fails, if the next provider in the chain is text-only, should Natively **skip** the text-only provider to reach a vision-capable Custom LLM, or run local OCR on the screenshot and pass the extracted text to the text-only model?  
> 7. **Acoustic Echo Handling in "Both" Audio Mode:**  
   * Will Natively primarily be used with headphones/earphones, or must "Both" mode suppress acoustic bleed when interviewer audio from laptop speakers leaks into the open microphone?  
> 8. **Interrupted LLM Draft UI Replacement Timing:**  
   * When a streaming LLM response fails halfway through and the fallback LLM starts generating, do you prefer replacing the broken partial text in the overlay **as soon as the fallback emits its first valid token** (Report 1), or keeping the broken partial text visible until the fallback **completes its entire answer** (Report 2)?

### **17\. Final List of Blockers and Issues That Must Be Resolved Before Implementation**

Implementation must not modify existing Natively session, audio, or LLM files until these 10 blockers are resolved:

> 1. **BLOCKER 1 — Source-Code Audit of Existing Custom LLM, cURL Parser & IPC Channels:** Inspect the actual Natively codebase to document the exact schema of saved Custom LLM configs, cURL variable placeholders, SSE stream handling, and IPC channel names so ExistingCustomLlmAdapter wraps them with zero regressions.  
> 2. **BLOCKER 2 — Verify Installed Electron Binary & safeStorage.decryptStringAsync Signature:** Confirm the exact Electron version in package.json and test the decryptSecretSafely helper against existing saved secrets.  
> 3. **BLOCKER 3 — Replace Report 1’s Synchronous STT Loop with the Decoupled Ring-Buffer Supervisor:** Never await network writes or health checks inside the audio capture loop; capture must write non-blockingly into the 16 kHz mono AudioRingBuffer.  
> 4. **BLOCKER 4 — Fix Candidate Resolver Logic:** Replace Report 1’s infinite-reselection loop and Report 2’s manual-Sherpa cloud leak with resolveOrderedSttCandidates (Section 14.B).  
> 5. **BLOCKER 5 — Implement Both WebSocketStreamSttAdapter and VadChunkedRestSttAdapter:** Ensure Custom STT supports both persistent WebSocket streaming APIs and VAD-chunked REST upload APIs (with in-memory WAV framing and zero disk writes).  
> 6. **BLOCKER 6 — Couple STT Stall Watchdog Strictly to Local VAD Voiced State:** Prevent false-positive failovers during natural interview silence by running the stall timer only when uncommittedVoicedAudioAgeMs \> 0\.  
> 7. **BLOCKER 7 — Enforce Epoch-Fenced Utterance Reconciliation & Immutable LLM Snapshots:** Use monotonic attemptEpoch gates on both STT and LLM streams so delayed packets from a dead provider can never contaminate canonical transcripts or concatenate LLM answers.  
> 8. **BLOCKER 8 — Harden cURL Parser Against Shell Execution, File Reads & Redirect Leaks:** Ensure cURL import uses a pure string tokenizer into native fetch (never child\_process), rejects @file uploads, and strips Authorization headers on cross-origin redirects.  
> 9. **BLOCKER 9 — Wire the Mandatory Active Cloud Audio Transmission Indicator:** Connect ActivePrivacyIndicatorState (idle \| local-only \| cloud-active) to the UI and zero out the AudioRingBuffer (fill(0)) on session termination.  
> 10. **BLOCKER 10 — Audit Local Sherpa-ONNX Model Files for Hindi & Marathi:** Verify the language vocabulary of the installed local Sherpa-ONNX model before enabling hi and mr fallback claims.