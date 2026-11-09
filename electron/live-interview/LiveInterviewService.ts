import { EventEmitter } from 'events';
import { AudioPipeline } from './AudioPipeline';
import { CodeExecutor, ExecutionEnginesConfig, ExecutionResult } from './CodeExecutor';
import { ResourceMonitor, ResourceSnapshot } from './ResourceMonitor';
import { ComplexityAnalyzer, ComplexityResult } from './ComplexityAnalyzer';
import { LiveTranscriber } from './LiveTranscriber';
import { routeTranscript, RoutedTranscript } from './LanguageRouter';

export interface LiveInterviewConfig {
  engineConfig?: Partial<ExecutionEnginesConfig>;
  resourceMonitorIntervalMs?: number;
  cpuThreshold?: number;
  memoryThresholdMB?: number;
}

export interface TranscriptEvent {
  text: string;
  speaker: string;
  isFinal: boolean;
  timestamp: number;
}

export interface CodeAnalysisEvent {
  originalCode: string;
  language: string;
  explanation: string;
  executionResult: ExecutionResult | null;
  complexity: ComplexityResult;
}

export interface PerformanceAlert {
  cpuPercent: number;
  memoryMB: number;
  message: string;
}

export interface TechnicalQuestionEvent {
  text: string;
  answer: string;
  timestamp: number;
  isTechnical: boolean;
}

const TECHNICAL_TERM_PATTERNS: RegExp[] = [
  /\b(big O|time complexity|space complexity|asymptotic|complexity analysis)\b/i,
  /\b(O\(|Ω\(|Θ\(|big oh|big omega|big theta)\b/i,
  /\b(algorithm|data structure|sorting|searching|traversal|recursion|iteration)\b/i,
  /\b(DFS|BFS|binary search|binary tree|BST|linked list|hash map|hash table|hashmap|hashtable)\b/i,
  /\b(stack|queue|heap|trie|graph|tree|array|tuple|set|map|dictionary|deque)\b/i,
  /\b(dynamic programming|DP|memoization|tabulation|backtracking|greedy algorithm|divide and conquer)\b/i,
  /\b(quick sort|merge sort|bubble sort|insertion sort|selection sort|heap sort|radix sort|counting sort)\b/i,
  /\b(function|class|method|variable|syntax|bug|debug|error|exception|thread|async|await|promise|callback|closure|prototype)\b/i,
  /\b(JavaScript|Python|Java|C\+\+|TypeScript|Go|Rust|Ruby|Swift|Kotlin|PHP|HTML|CSS|SQL|React|Node|Angular|Vue)\b/i,
  /\b(API|REST|GraphQL|HTTP|HTTPS|TCP|IP|DNS|load balancer|microservice|container|Docker|Kubernetes|CI|CD)\b/i,
  /\b(database|index|query|join|normalization|transaction|ACID|CAP theorem|NoSQL|SQL injection|ORM)\b/i,
  /\b(system design|architecture|scalability|latency|throughput|consistency|availability|partition tolerance|eventual consistency)\b/i,
  /\b(parallelism|concurrency|mutex|semaphore|deadlock|race condition|synchronization|lock|atomic|thread safe)\b/i,
  /\b(compile|compiler|interpreter|transpiler|runtime|VM|virtual machine|garbage collection|memory leak|memory management)\b/i,
  /\b(unit test|integration test|end to end test|TDD|testing|assert|mock|stub|spy)\b/i,
  /\b(design pattern|singleton|factory|observer|strategy|decorator|adapter|builder|prototype)\b/i,
];

const TECHNICAL_QUESTION_PATTERNS: RegExp[] = [
  /\b(how does|how would|how do|what is|what are|why is|why does|explain|describe|compare|contrast|difference between|define|list|tell me about)\b/i,
];

const NOISE_PATTERNS: RegExp[] = [
  /^(um|uh|okay|ok|right|yeah|yes|no|hmm|ah|oh|so|well|like|actually|basically|literally|just)$/i,
  /(thanks|thank you|alright|sure|great|good|nice|cool|awesome|perfect)$/i,
];

export class LiveInterviewService extends EventEmitter {
  private _audioPipeline: AudioPipeline;
  private _codeExecutor: CodeExecutor;
  private _resourceMonitor: ResourceMonitor;
  private _complexityAnalyzer: ComplexityAnalyzer;
  private _transcriber: LiveTranscriber;
  private _isActive = false;
  private _lastTechnicalEmitTime = 0;
  private readonly _TECHNICAL_COOLDOWN_MS = 3000;
  private _pendingTechnicalText = '';
  private _assistantMessageCount = 0;
  private _recentContext: string[] = [];
  // Speaker diarization: when true, only process interviewer utterances and
  // silently drop the candidate's own speech segments in live interview mode.
  private _filterOwnVoice = true;

  constructor(config?: LiveInterviewConfig) {
    super();
    this._audioPipeline = new AudioPipeline();
    this._codeExecutor = new CodeExecutor(config?.engineConfig);
    this._resourceMonitor = new ResourceMonitor();
    this._complexityAnalyzer = new ComplexityAnalyzer();
    this._transcriber = new LiveTranscriber();

    if (config?.cpuThreshold !== undefined || config?.memoryThresholdMB !== undefined) {
      this._resourceMonitor.setThresholds(
        config.cpuThreshold ?? 80,
        config.memoryThresholdMB ?? 500,
      );
    }

    this._resourceMonitor.onAlert = (snapshot: ResourceSnapshot) => {
      if (!this._isActive) return;
      const alert: PerformanceAlert = {
        cpuPercent: snapshot.cpuPercent,
        memoryMB: snapshot.memoryMB,
        message: '',
      };
      this.emit('performance-alert', alert);
    };

  }

  processTextTranscript(text: string, speaker: string): void {
    if (!this._isActive) return;

    const cleaned = text.trim();
    if (!cleaned || this._isNoise(cleaned)) return;

    this.emit('transcript', {
      text: cleaned,
      speaker: speaker as 'interviewer' | 'user',
      isFinal: true,
      timestamp: Date.now(),
    });

    if (speaker === 'user') return;

    this._recentContext.push(cleaned);
    if (this._recentContext.length > 20) {
      this._recentContext = this._recentContext.slice(-20);
    }

    if (this._isTechnicalQuestion(cleaned)) {
      this._onTechnicalQuestionDetected(cleaned);
    }
  }

  get isActive(): boolean {
    return this._isActive;
  }

  async start(inputDeviceId?: string): Promise<void> {
    if (this._isActive) return;
    this._isActive = true;

    // Reset language + intent classifier state for fresh session
    this._pendingTechnicalText = '';
    this._assistantMessageCount = 0;
    this._recentContext = [];

    // 🌟 PERMANENT FIX: Connect the local transcriber text events directly to the UI broadcast path
    if (this._transcriber) {
      this._transcriber.on('transcript', (data: { text: string; isFinal: boolean }) => {
        this.processTextTranscript(data.text, 'interviewer');
      });
    }

    await this._transcriber.start().catch((err: Error) => {
      console.error('[LiveInterviewService] Transcriber start failed:', err.message);
    });

    await this._audioPipeline.start(inputDeviceId || 'default');
    this._resourceMonitor.start();

    console.log('[LiveInterviewService] Started — waiting for real audio input');
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this._isActive) return;
    this._isActive = false;

    // Force-stop in reverse order: audio pipeline first (cuts the data source),
    // then transcriber (aborts any in-flight inference),
    // then resource monitor. Do NOT await — use fire-and-forget with synchronous
    // state reset to guarantee the renderer gets 'stopped' immediately.
    this._audioPipeline.removeAllListeners('speech-segment');
    this._audioPipeline.removeAllListeners('speech-detected');
    this._audioPipeline.removeAllListeners('error');
    this._audioPipeline.stop().catch(() => {});

    this._transcriber.removeAllListeners('transcript');
    this._transcriber.removeAllListeners('error');
    this._transcriber.stop().catch(() => {});

    this._resourceMonitor.stop();

    // Purge all text buffers
    this._pendingTechnicalText = '';
    this._assistantMessageCount = 0;
    this._recentContext = [];

    console.log('[LiveInterviewService] Stopped — all pipelines terminated, buffers cleared');
    this.emit('stopped');
  }

  private _isNoise(text: string): boolean {
    const t = text.trim();
    if (!t || t.length < 3) return true;
    for (const p of NOISE_PATTERNS) {
      if (p.test(t)) return true;
    }
    return false;
  }

  private _isTechnicalQuestion(text: string): boolean {
    let score = 0;
    for (const p of TECHNICAL_TERM_PATTERNS) {
      if (p.test(text)) score += 2;
    }
    for (const p of TECHNICAL_QUESTION_PATTERNS) {
      if (p.test(text)) score += 3;
    }
    if (text.length < 8) score -= 1;
    if (text.length > 200) score += 1;
    if (/[?]/.test(text)) score += 1;
    return score >= 3;
  }

  private _onTechnicalQuestionDetected(text: string): void {
    if (!this._isActive) return;
    const now = Date.now();
    if (now - this._lastTechnicalEmitTime < this._TECHNICAL_COOLDOWN_MS) return;
    this._lastTechnicalEmitTime = now;

    this.emit('technical-question', {
      text,
      answer: '',
      timestamp: now,
      isTechnical: true,
    });

    this._routeToGemini(text);
  }

  private async _routeToGemini(text: string): Promise<void> {
    if (!this._isActive) return;
    try {
      const LLMHelper = require('../LLMHelper');
      const llmHelper = LLMHelper.LLMHelper?.getInstance?.();

      if (!llmHelper || !llmHelper.generateContent) {
        console.log('[LiveInterviewService] Gemini not available');
        this._detectCodeInText(text);
        return;
      }

      const technicalPrompt = `You are a technical interview assistant. The following was detected as a technical question or concept from a live interview transcript:

"${text}"

Provide a clear, structured technical answer with:
1. A concise definition or direct answer
2. Key bullet points covering important aspects
3. Code examples if applicable (use markdown code blocks with language identifiers)
4. Time/space complexity analysis if relevant
5. Common pitfalls or edge cases to consider
6. Related concepts the interviewer might ask about next

Format your response using markdown with clear section headers.`;

      console.log("[DEBUG LIVE] --> Transcription payload sent to LLM.");
      const response = await llmHelper.generateContent([
        { role: 'user', parts: [{ text: technicalPrompt }] }
      ]);

      const answerText = typeof response === 'string' ? response : response?.text || '';
      if (answerText) {
        this._assistantMessageCount++;
        this.emit('technical-question', {
          text,
          answer: answerText,
          timestamp: Date.now(),
          isTechnical: true,
        });
        this._detectCodeInText(answerText);
      }
    } catch (err) {
      console.error('[LiveInterviewService] Gemini error:', err);
    }
  }

  private _detectCodeInText(text: string): void {
    if (!this._isActive) return;
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    let hasCode = false;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      hasCode = true;
      const language = match[1] || 'javascript';
      const code = match[2].trim();
      const analysis = this._analyzeCodeSync(code, language);
      this.emit('code-analysis', analysis);
    }
  }

  private _analyzeCodeSync(code: string, language: string): CodeAnalysisEvent {
    const complexity = this._complexityAnalyzer.analyze(code, language);
    return {
      originalCode: code,
      language,
      explanation: '',
      executionResult: null,
      complexity,
    };
  }

  async analyzeCode(code: string, language: string): Promise<CodeAnalysisEvent> {
    let executionResult: ExecutionResult | null = null;
    try {
      executionResult = await this._codeExecutor.execute({ sourceCode: code, language });
    } catch {
      executionResult = null;
    }

    const complexity = this._complexityAnalyzer.analyze(code, language);

    return {
      originalCode: code,
      language,
      explanation: '',
      executionResult,
      complexity,
    };
  }
}
