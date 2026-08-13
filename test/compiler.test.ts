import { describe, expect, it } from 'vitest';
import { parseCompilerOutput } from '../lib/compiler';
import { estimateTokens, prunedPct } from '../lib/tokens';

describe('parseCompilerOutput', () => {
  it('parses a clean response', () => {
    const out = parseCompilerOutput(
      '{"facts":["Atlas is provisioned."],"excludedNote":"Excluded: the CI thread.","coverage":0.9}',
      'vector store',
    );
    expect(out.facts).toEqual(['Atlas is provisioned.']);
    expect(out.coverage).toBe(0.9);
  });

  it('digs the JSON out of a chatty model', () => {
    const out = parseCompilerOutput(
      'Sure! Here you go:\n{"facts":["A."],"excludedNote":"B","coverage":0.8}\nHope that helps.',
      'x',
    );
    expect(out.facts).toEqual(['A.']);
  });

  it('falls back when facts filter to empty', () => {
    // An array of non-strings passes a raw length check but filters to nothing. Without the
    // filter-then-gate order this produces a factless brief and skips the fallback entirely.
    const out = parseCompilerOutput('{"facts":[1,2,3],"excludedNote":"x","coverage":0.9}', 'the deadline');
    expect(out.facts).toEqual(['Topic in focus: the deadline.']);
    expect(out.coverage).toBeLessThan(0.6);
  });

  it('falls back on unparseable output with a coverage low enough to escalate', () => {
    const out = parseCompilerOutput('I cannot do that.', 'the deadline');
    expect(out.facts).toHaveLength(1);
    expect(out.coverage).toBeLessThan(0.6);
  });

  it('defaults coverage when the model omits or corrupts it', () => {
    const out = parseCompilerOutput('{"facts":["A."],"excludedNote":"B","coverage":"high"}', 'x');
    expect(out.coverage).toBeGreaterThan(0.6);
  });
});

describe('token economics', () => {
  it('reports the pruning percentage the demo quotes', () => {
    expect(prunedPct(19400, 740)).toBe(96);
  });

  it('never returns a negative or absurd percentage', () => {
    expect(prunedPct(0, 500)).toBe(0);
    expect(prunedPct(100, 500)).toBe(0);
  });

  it('estimates tokens monotonically', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(360))).toBeGreaterThan(estimateTokens('a'.repeat(36)));
  });
});
