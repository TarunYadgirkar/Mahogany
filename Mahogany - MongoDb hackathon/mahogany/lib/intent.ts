/**
 * Branch intent from spoken language.
 *
 * Voice is the only interface where branching is already natural — people say "hold on, side
 * question" without being taught. These patterns catch that so the loop works even when the
 * ElevenLabs agent does not fire its webhook tool, which in a live demo it eventually will not.
 *
 * Deliberately regex, not a model call. An intent classifier that costs 400ms and can hallucinate
 * is the wrong thing to put between someone speaking and the branch appearing on screen.
 */
export type Intent =
  | { kind: 'fork'; question: string }
  | { kind: 'merge'; insight: string | null }
  | { kind: 'abandon' }
  | { kind: 'continue' };

const FORK_PATTERNS = [
  /\b(?:hold on|hang on|wait|quick|real quick)?,?\s*side ?(?:question|note|thought)\b[:,-]?\s*(.*)/i,
  /\b(?:let me|can i|i want to) (?:ask|branch)(?: something)?(?: on the side| separately)?\b[:,-]?\s*(.*)/i,
  /\bbranch (?:off|on|here)\b[:,-]?\s*(.*)/i,
  /\btangent\b[:,-]?\s*(.*)/i,
  /\bunrelated (?:question|but)\b[:,-]?\s*(.*)/i,
];

const MERGE_PATTERNS = [
  /\b(?:merge|keep|save) (?:that|this|it)\b(?: and)?(?: (?:go|come) back| return)?[:,-]?\s*(.*)/i,
  /\bthat'?s (?:useful|good|it)[,.]? (?:merge|keep|save) (?:it|that)\b[:,-]?\s*(.*)/i,
  /\bremember (?:that|this)\b[:,-]?\s*(.*)/i,
  /\b(?:go|take me) back to (?:the )?(?:main|trunk|original)\b[:,-]?\s*(.*)/i,
];

const ABANDON_PATTERNS = [
  /\b(?:never ?mind|forget (?:it|that)|drop (?:it|that)|abandon (?:this|that|the branch))\b/i,
  /\bthat was a dead end\b/i,
];

export function detectIntent(utterance: string): Intent {
  const text = utterance.trim();
  if (!text) return { kind: 'continue' };

  for (const p of ABANDON_PATTERNS) {
    if (p.test(text)) return { kind: 'abandon' };
  }

  for (const p of MERGE_PATTERNS) {
    const m = p.exec(text);
    if (m) {
      const trailing = (m[1] ?? '').trim();
      return { kind: 'merge', insight: trailing.length > 12 ? trailing : null };
    }
  }

  for (const p of FORK_PATTERNS) {
    const m = p.exec(text);
    if (m) {
      const question = (m[1] ?? '').trim();
      // "Hold on, side question—" with nothing after it is a preamble, not a question. Treat the
      // whole utterance as the question so the branch still has something to compile against.
      return { kind: 'fork', question: question.length > 3 ? question : text };
    }
  }

  return { kind: 'continue' };
}
