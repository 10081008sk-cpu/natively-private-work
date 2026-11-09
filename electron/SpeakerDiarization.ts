// SpeakerDiarization.ts
// Multi-speaker diarization gates and explicit hardware routing for the native pipeline.
// Routes Chromium desktopCapturer (system audio) as INTERVIEWER and microphone as CANDIDATE,
// enforces the invariant that candidate speech never triggers AI response streams.

export interface AudioSourceConfig {
  sourceType: 'desktopCapturer' | 'microphone';
  sourceId?: string;
  deviceId?: string;
  speaker: 'INTERVIEWER' | 'CANDIDATE';
}

export interface DiarizationState {
  interviewerSpeaking: boolean;
  candidateSpeaking: boolean;
  lastActiveSpeaker: 'INTERVIEWER' | 'CANDIDATE' | null;
  interviewerUtterances: number;
  candidateUtterances: number;
}

export class SpeakerDiarization {
  private interviewerSpeaking = false;
  private candidateSpeaking = false;
  private lastActiveSpeaker: 'INTERVIEWER' | 'CANDIDATE' | null = null;
  private interviewerUtterances = 0;
  private candidateUtterances = 0;

  routeSource(config: AudioSourceConfig): AudioSourceConfig {
    if (config.sourceType === 'desktopCapturer') {
      config.speaker = 'INTERVIEWER';
    } else if (config.sourceType === 'microphone') {
      config.speaker = 'CANDIDATE';
    }
    return config;
  }

  enforceCandidateGate(speaker: string, text: string): { blocked: boolean; reason?: string } {
    if (speaker === 'CANDIDATE') {
      return { blocked: true, reason: 'CANDIDATE_GATE' };
    }
    return { blocked: false };
  }

  getDiarizationState(): DiarizationState {
    return {
      interviewerSpeaking: this.interviewerSpeaking,
      candidateSpeaking: this.candidateSpeaking,
      lastActiveSpeaker: this.lastActiveSpeaker,
      interviewerUtterances: this.interviewerUtterances,
      candidateUtterances: this.candidateUtterances,
    };
  }

  updateSpeakingState(speaker: 'INTERVIEWER' | 'CANDIDATE', isSpeaking: boolean): void {
    if (speaker === 'INTERVIEWER') {
      this.interviewerSpeaking = isSpeaking;
    } else {
      this.candidateSpeaking = isSpeaking;
    }

    if (isSpeaking) {
      this.lastActiveSpeaker = speaker;
      if (speaker === 'INTERVIEWER') {
        this.interviewerUtterances++;
      } else {
        this.candidateUtterances++;
      }
    }
  }

  reset(): void {
    this.interviewerSpeaking = false;
    this.candidateSpeaking = false;
    this.lastActiveSpeaker = null;
    this.interviewerUtterances = 0;
    this.candidateUtterances = 0;
  }
}

export const speakerDiarization = new SpeakerDiarization();
