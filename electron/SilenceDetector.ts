const SILENCE_THRESHOLD_MS = 1000;

const HALO_PATTERNS = [
  "Thanks for watching",
  "Thank you for watching",
  "Chao",
  "Like and subscribe",
  "Subscribe",
  "Bye",
  "See you",
];

interface UtteranceState {
  isSpeaking: boolean;
  questionComplete: boolean;
  silenceStartTime: number | null;
  lastSpeechTime: number | null;
  currentBuffer: string;
  speaker: string | null;
}

export class SilenceDetector {
  private isSpeaking = false;
  private questionComplete = false;
  private silenceStartTime: number | null = null;
  private lastSpeechTime: number | null = null;
  private currentBuffer = "";
  private speaker: string | null = null;

  feedAudio(isSilence: boolean, speaker: string): UtteranceState {
    const now = Date.now();

    if (!isSilence) {
      this.isSpeaking = true;
      this.speaker = speaker;
      this.lastSpeechTime = now;
      this.silenceStartTime = null;
    } else {
      if (this.isSpeaking && this.silenceStartTime === null) {
        this.silenceStartTime = now;
      }
    }

    if (
      this.isSpeaking &&
      this.silenceStartTime !== null &&
      now - this.silenceStartTime >= SILENCE_THRESHOLD_MS
    ) {
      this.isSpeaking = false;
      this.questionComplete = true;
    }

    return this.getState();
  }

  feedTranscript(
    text: string,
    speaker: string,
    isFinal: boolean
  ): { text: string; isComplete: boolean; filtered: boolean } {
    const filtered = this.isHaloArtifact(text);
    const outputText = filtered ? "" : text;

    if (filtered && isFinal) {
      return { text: outputText, isComplete: false, filtered };
    }

    const isComplete =
      this.questionComplete ||
      (isFinal &&
        this.lastSpeechTime !== null &&
        (this.silenceStartTime === null ||
          Date.now() - this.silenceStartTime >= SILENCE_THRESHOLD_MS));

    return { text: outputText, isComplete, filtered };
  }

  isHaloArtifact(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    return HALO_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
  }

  reset(): void {
    this.isSpeaking = false;
    this.questionComplete = false;
    this.silenceStartTime = null;
    this.lastSpeechTime = null;
    this.currentBuffer = "";
    this.speaker = null;
  }

  private getState(): UtteranceState {
    return {
      isSpeaking: this.isSpeaking,
      questionComplete: this.questionComplete,
      silenceStartTime: this.silenceStartTime,
      lastSpeechTime: this.lastSpeechTime,
      currentBuffer: this.currentBuffer,
      speaker: this.speaker,
    };
  }
}
