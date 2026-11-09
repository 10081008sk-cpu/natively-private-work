import { classifyIntent, ConversationIntent } from '../llm/IntentClassifier';

export type DetectedLanguage = 'en' | 'mr' | 'hi';

export interface RoutedTranscript {
  text: string;
  language: DetectedLanguage;
  intent: ConversationIntent;
  confidence: number;
  isQuestion: boolean;
  isCasual: boolean;
}

const CASUAL_PATTERNS: RegExp[] = [
  /^(um|uh|okay|ok|right|yeah|yes|no|hmm|ah|oh|so|well|like|actually|basically|literally|just)$/i,
  /(thanks|thank you|alright|sure|great|good|nice|cool|awesome|perfect)$/i,
  /(how are you|how's it going|nice to meet you|good to see you)/i,
  /(weather|traffic|weekend|how was your)/i,
];

const QUESTION_PATTERNS: RegExp[] = [
  /\?/,
  /^(what|why|how|when|where|who|which|can|could|would|will|do|does|did|is|are|have|has)/i,
  /(tell me|explain|describe|define|walk me through)/i,
];

function detectLanguage(text: string): DetectedLanguage {
  const devanagariRange = /[\u0900-\u097F]/;
  const devanagariCount = (text.match(devanagariRange) || []).length;
  if (devanagariCount === 0) return 'en';

  const mrIndicators = /(आहे|नाही|का\b|मी|तुम्ही|आम्ही|होय|नका|तरी|ती|ते|हा|ही|हे)/;
  const hiIndicators = /(है|हूँ|हो|का\b|की\b|के\b|मैं|तुम|आप|हम|हाँ|नहीं|था|थी|थे|गया|गयी)/;

  const mrScore = (text.match(mrIndicators) || []).length;
  const hiScore = (text.match(hiIndicators) || []).length;

  if (mrScore >= hiScore && mrScore > 0) return 'mr';
  if (hiScore > mrScore) return 'hi';
  return 'en';
}

function isCasualDiscussion(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  if (cleaned.length < 5) return true;
  for (const p of CASUAL_PATTERNS) {
    if (p.test(cleaned)) return true;
  }
  return false;
}

function isDirectQuestion(text: string): boolean {
  for (const p of QUESTION_PATTERNS) {
    if (p.test(text.trim())) return true;
  }
  return false;
}

export async function routeTranscript(
  text: string,
  recentContext: string,
  assistantMessageCount: number,
): Promise<RoutedTranscript> {
  const language = detectLanguage(text);
  const casual = isCasualDiscussion(text);
  const question = isDirectQuestion(text);

  if (casual) {
    return {
      text,
      language,
      intent: 'general',
      confidence: 0.9,
      isQuestion: false,
      isCasual: true,
    };
  }

  const intentResult = await classifyIntent(text, recentContext, assistantMessageCount);

  return {
    text,
    language,
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    isQuestion: question,
    isCasual: false,
  };
}
