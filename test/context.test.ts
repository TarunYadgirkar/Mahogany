import { describe, expect, it } from 'vitest';
import { anchorCarriedThrough, assemblePath } from '../lib/context';
import type { Branch, Turn } from '../lib/types';

const turn = (role: Turn['role'], text: string): Turn => ({ role, text, at: '2026-08-13T00:00:00Z' });

function branch(over: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    userId: 'u',
    sessionId: 's',
    parentId: null,
    depth: 0,
    title: 'Main thread',
    question: '',
    brief: null,
    routing: null,
    turns: [],
    status: 'active',
    insight: null,
    createdAt: '2026-08-13T00:00:00Z',
    updatedAt: '2026-08-13T00:00:00Z',
    ...over,
  };
}

describe('anchorCarriedThrough', () => {
  it('accepts a rephrasing that keeps every entity token', () => {
    expect(
      anchorCarriedThrough('Free Ventures closes September 11', [
        'Free Ventures applications close on September 11.',
      ]),
    ).toBe(true);
  });

  it('rejects an anchor whose entities were dropped', () => {
    expect(anchorCarriedThrough('Free Ventures closes September 11', ['It closes soon.'])).toBe(false);
  });

  it('only looks at the top fact', () => {
    // The next composition's anchor IS facts[0], so an entity buried further down still breaks
    // the chain one level deeper.
    expect(
      anchorCarriedThrough('Free Ventures closes September 11', [
        'The deadline is tight.',
        'Free Ventures closes September 11.',
      ]),
    ).toBe(false);
  });

  it('compares verbatim when the anchor has no entity tokens', () => {
    expect(anchorCarriedThrough('the deadline is soon', ['the deadline is soon'])).toBe(true);
    expect(anchorCarriedThrough('the deadline is soon', ['something else'])).toBe(false);
  });
});

describe('assemblePath', () => {
  it('is just the transcript at the trunk', () => {
    const path = assemblePath(null, [turn('user', 'we need a vector store')]);
    expect(path.depth).toBe(0);
    expect(path.anchorFact).toBeUndefined();
    expect(path.markdown).toContain('we need a vector store');
  });

  it('inherits the parent brief instead of re-walking its transcript', () => {
    const parent = branch({
      depth: 1,
      turns: [turn('user', 'a very long parent exchange that should not be re-derived')],
      insight: 'Managed vector search wins here.',
      brief: {
        markdown: '# Branch brief\n\n## Relevant facts\n- Atlas is already provisioned.',
        facts: ['Atlas is already provisioned.'],
        recalled: [],
        excludedNote: 'Excluded: the deployment debate.',
        coverage: 0.9,
        availableTokens: 5000,
        briefTokens: 200,
        prunedPct: 96,
      },
    });

    const path = assemblePath(parent, [turn('user', 'what about cost?')]);

    expect(path.depth).toBe(2);
    expect(path.anchorFact).toBe('Atlas is already provisioned.');
    expect(path.markdown).toContain('Inherited context');
    expect(path.markdown).toContain('Managed vector search wins here.');
    expect(path.markdown).toContain('what about cost?');
  });
});
