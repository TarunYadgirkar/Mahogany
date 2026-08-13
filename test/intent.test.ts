import { describe, expect, it } from 'vitest';
import { detectIntent } from '../lib/intent';

describe('detectIntent', () => {
  it('forks on the phrase people actually say', () => {
    const intent = detectIntent('Hold on, side question — should we cache the embeddings?');
    expect(intent.kind).toBe('fork');
    if (intent.kind === 'fork') expect(intent.question).toContain('cache the embeddings');
  });

  it('keeps the whole utterance when the fork phrase carries no question', () => {
    // "Side question:" with nothing after it is a preamble. Dropping it would leave the compiler
    // with an empty question and a brief about nothing.
    const intent = detectIntent('side question');
    expect(intent.kind).toBe('fork');
    if (intent.kind === 'fork') expect(intent.question.length).toBeGreaterThan(3);
  });

  it('merges and captures a stated conclusion', () => {
    const intent = detectIntent(
      'Merge that and go back: managed vector search wins because we cannot install extensions.',
    );
    expect(intent.kind).toBe('merge');
    if (intent.kind === 'merge') expect(intent.insight).toContain('managed vector search');
  });

  it('merges without an insight when the user just says keep it', () => {
    const intent = detectIntent('keep that');
    expect(intent.kind).toBe('merge');
    if (intent.kind === 'merge') expect(intent.insight).toBeNull();
  });

  it('abandons on a dead end', () => {
    expect(detectIntent('never mind, forget it').kind).toBe('abandon');
  });

  it('treats ordinary conversation as a continuation', () => {
    expect(detectIntent('so what does that mean for the deadline?').kind).toBe('continue');
  });

  it('does not fork on a question that merely contains the word question', () => {
    expect(detectIntent('what was the question you asked earlier?').kind).toBe('continue');
  });
});
