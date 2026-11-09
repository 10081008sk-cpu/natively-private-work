/**
 * Filters common Whisper hallucinations.
 * Returns empty string if hallucination, otherwise returns trimmed text.
 */
const EXACT_BLOCKS = new Set([
  '[music]', '[applause]', '[inaudible]', '[blank_audio]', '[silence]',
  '(music)', '(upbeat music)', '(sad music)', '(dramatic music)',
  '(laughing)', '(laughter)', '(laughs)', '(chuckles)',
  '(clicks)', '(clicking)', '(clapping)',
  '(gunshot)', '(explosion)', '(funky music)',
  '(speaking in foreign language)', '(foreign language)',
  'thank you for watching', 'thanks for watching',
  'you', 'bye', '...', '.', '[music]',
  'happy new year', 'subscribe', 'like and subscribe',
]);

// Matches tokens wrapped in square brackets e.g. [BLANK_AUDIO], [Noise]
const BRACKET_TOKEN_RE = /^\[.*\]$/;

// Matches tokens wrapped in parentheses e.g. (upbeat music), (laughing)
const PAREN_TOKEN_RE = /^\(.*\)$/;

// Matches lines that are mostly non-Latin/non-Devanagari scripts
const FOREIGN_SCRIPT_RE = /[\u0600-\u06FF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF]/;

export function filterHallucination(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 2) return '';
  const lower = trimmed.toLowerCase();
  if (EXACT_BLOCKS.has(lower)) return '';
  if (BRACKET_TOKEN_RE.test(trimmed)) return '';
  if (PAREN_TOKEN_RE.test(trimmed)) return '';
  if (FOREIGN_SCRIPT_RE.test(trimmed)) return '';
  return trimmed;
}
