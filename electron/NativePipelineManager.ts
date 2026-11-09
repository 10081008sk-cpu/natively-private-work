import { EmbeddingEngine } from './onnx/EmbeddingEngine';
import { IntentClassifier } from './IntentClassifier';
import { ConversationStateManager } from './ConversationStateManager';
import { SilenceDetector } from './SilenceDetector';
import { SpeakerDiarization } from './SpeakerDiarization';

export interface PipelineConfig {
  enableEmbedding?: boolean;
  enableDiarization?: boolean;
  enableSilenceDetection?: boolean;
  enableIntentClassification?: boolean;
  maxHistoryLength?: number;
}

const PROGRAMMING_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'go', 'rust',
  'ruby', 'php', 'swift', 'kotlin', 'scala', 'perl', 'r', 'dart',
];

export class NativePipelineManager {
  private static instance: NativePipelineManager | null = null;

  private embeddingEngine: EmbeddingEngine;
  private intentClassifier: IntentClassifier;
  private conversationState: ConversationStateManager;
  private silenceDetector: SilenceDetector;
  private speakerDiarization: SpeakerDiarization;
  private abortController: AbortController | null = null;
  private awaitingLanguage = false;
  private cachedQuery: string | null = null;
  private config: Required<PipelineConfig>;

  private constructor(config?: PipelineConfig) {
    this.embeddingEngine = new EmbeddingEngine();
    this.intentClassifier = IntentClassifier.getInstance();
    this.conversationState = new ConversationStateManager();
    this.silenceDetector = new SilenceDetector();
    this.speakerDiarization = new SpeakerDiarization();
    this.config = {
      enableEmbedding: config?.enableEmbedding ?? true,
      enableDiarization: config?.enableDiarization ?? true,
      enableSilenceDetection: config?.enableSilenceDetection ?? true,
      enableIntentClassification: config?.enableIntentClassification ?? true,
      maxHistoryLength: config?.maxHistoryLength ?? 50,
    };
  }

  static getInstance(config?: PipelineConfig): NativePipelineManager {
    if (!NativePipelineManager.instance) {
      NativePipelineManager.instance = new NativePipelineManager(config);
    }
    return NativePipelineManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.config.enableDiarization) {
      this.speakerDiarization.reset();
    }
    if (this.config.enableSilenceDetection) {
      this.silenceDetector.reset();
    }
  }

  processAudioChunk(
    chunk: Buffer,
    sourceType: 'desktopCapturer' | 'microphone'
  ): void {
    if (this.config.enableDiarization) {
      this.speakerDiarization.routeSource({
        sourceType,
        sourceId: undefined,
        deviceId: undefined,
        speaker: sourceType === 'desktopCapturer' ? 'INTERVIEWER' : 'CANDIDATE',
      });
      const speaker = sourceType === 'desktopCapturer' ? 'INTERVIEWER' : 'CANDIDATE';
      this.speakerDiarization.updateSpeakingState(speaker, true);
    }

    if (this.config.enableSilenceDetection) {
      const speaker = sourceType === 'desktopCapturer' ? 'INTERVIEWER' : 'CANDIDATE';
      const isSilence = chunk.length === 0 || chunk.every((b) => b === 0);
      this.silenceDetector.feedAudio(isSilence, speaker);
    }
  }

  async processTranscript(
    text: string,
    speaker: string,
    isFinal: boolean,
    _confidence?: number
  ): Promise<void> {
    const gate = this.speakerDiarization.enforceCandidateGate(speaker, text);
    if (gate.blocked) {
      return;
    }

    const silenceResult = this.silenceDetector.feedTranscript(text, speaker, isFinal);
    if (silenceResult.filtered) {
      return;
    }

    let category = 'general';
    let isAllowed = false;
    let confidence = 0;

    if (this.config.enableIntentClassification) {
      const classification = await this.intentClassifier.classify(text);
      category = classification.category;
      isAllowed = classification.isAllowed;
      confidence = classification.confidence;
    }

    this.handleClarificationMerge(text, speaker, category);

    if (silenceResult.isComplete && speaker === 'INTERVIEWER' && isAllowed) {
      await this.generateAnswer(text, category);
    }

    this.conversationState.addInteraction({
      id: `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      speaker: speaker as 'INTERVIEWER' | 'CANDIDATE',
      text: silenceResult.text || text,
      category,
      confidence,
      timestamp: Date.now(),
    });
  }

  private handleClarificationMerge(text: string, speaker: string, category: string): void {
    if (speaker !== 'INTERVIEWER') return;

    if (category === 'CODING' && !this.hasLanguageKeyword(text)) {
      this.awaitingLanguage = true;
      this.cachedQuery = text;
      return;
    }

    if (this.awaitingLanguage && this.hasLanguageKeyword(text)) {
      const completePrompt = this.cachedQuery + ' in ' + text;
      this.cachedQuery = completePrompt;
      this.awaitingLanguage = false;
    }
  }

  private hasLanguageKeyword(text: string): boolean {
    const lower = text.toLowerCase();
    return PROGRAMMING_LANGUAGES.some((lang) => lower.includes(lang));
  }

  cancelActiveStream(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  clearAwaitingLanguage(): void {
    this.awaitingLanguage = false;
    this.cachedQuery = null;
  }

  getConversationHistory(): { speaker: string; text: string; category?: string; timestamp: number }[] {
    return this.conversationState.getRecentInteractions().map((entry) => ({
      speaker: entry.speaker,
      text: entry.text,
      category: entry.category,
      timestamp: entry.timestamp,
    }));
  }

  async generateAnswer(question: string, category: string): Promise<{ success: boolean }> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!signal.aborted) {
          resolve();
        }
      }, 100);

      if (signal.aborted) {
        clearTimeout(timer);
      }
    });

    if (signal.aborted) {
      this.abortController = null;
      return { success: false };
    }

    this.abortController = null;
    return { success: true };
  }

  shutdown(): void {
    this.cancelActiveStream();
    this.silenceDetector.reset();
    this.speakerDiarization.reset();
    this.conversationState.clear();
    this.awaitingLanguage = false;
    this.cachedQuery = null;
  }
}

export const nativePipelineManager = NativePipelineManager.getInstance();
export default NativePipelineManager;
