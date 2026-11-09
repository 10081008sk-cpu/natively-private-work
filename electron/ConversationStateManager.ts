interface InteractionEntry {
  id: string;
  speaker: 'INTERVIEWER' | 'CANDIDATE';
  text: string;
  category?: string;
  confidence?: number;
  timestamp: number;
  embedding?: Float32Array;
}

const MAX_MEMORY = 5;

const PRONOUN_SET = new Set([
  'it', 'its', 'this', 'that', 'they', 'them', 'those', 'these', 'the',
]);

const FOLLOW_UP_PHRASES = [
  'what about',
  'explain more',
  'elaborate',
  'drawbacks',
  'advantages',
  'pros',
  'cons',
  'how about',
  'what are',
];

class ConversationStateManager {
  private interactions: InteractionEntry[] = [];

  addInteraction(entry: InteractionEntry): void {
    this.interactions.push(entry);
    if (this.interactions.length > MAX_MEMORY) {
      this.interactions = this.interactions.slice(-MAX_MEMORY);
    }
  }

  getRecentInteractions(count?: number): InteractionEntry[] {
    if (count === undefined || count >= this.interactions.length) {
      return [...this.interactions];
    }
    return this.interactions.slice(-count);
  }

  containsPronouns(text: string): boolean {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);
    return words.some((w) => PRONOUN_SET.has(w));
  }

  detectFollowUp(text: string): { isFollowUp: boolean; referencedInteraction?: string } {
    if (this.interactions.length === 0) {
      return { isFollowUp: false };
    }

    const lower = text.toLowerCase();
    const hasPronouns = this.containsPronouns(text);
    const hasPhrase = FOLLOW_UP_PHRASES.some((phrase) => lower.includes(phrase));

    if (hasPronouns || hasPhrase) {
      const last = this.interactions[this.interactions.length - 1];
      return { isFollowUp: true, referencedInteraction: last.id };
    }

    return { isFollowUp: false };
  }

  buildContextualPrompt(text: string): { prompt: string; merged: boolean } {
    const followUp = this.detectFollowUp(text);

    if (!followUp.isFollowUp || !followUp.referencedInteraction) {
      return { prompt: text, merged: false };
    }

    const ref = this.interactions.find(
      (e) => e.id === followUp.referencedInteraction
    );

    if (!ref) {
      return { prompt: text, merged: false };
    }

    const prefix = `[Context: ${ref.speaker} said "${ref.text}"]`;
    const prompt = `${prefix}\n${text}`;

    return { prompt, merged: true };
  }

  clear(): void {
    this.interactions = [];
  }
}

export { ConversationStateManager };
export const conversationStateManager = new ConversationStateManager();
export default ConversationStateManager;
