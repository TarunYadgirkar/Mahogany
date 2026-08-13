/**
 * Token estimation. Deliberately an estimate, not a tokenizer — the panel shows economics, it does
 * not bill anyone, and shipping tiktoken into a Chrome bundle costs more than the precision is worth.
 * ~3.6 chars/token tracks Claude-family English prose closely enough for a percentage.
 */
const CHARS_PER_TOKEN = 3.6;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / CHARS_PER_TOKEN));
}

/** How much of the parent got thrown away. The headline number in the demo. */
export function prunedPct(available: number, kept: number): number {
  if (available <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(((available - kept) / available) * 100)));
}
