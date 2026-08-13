/**
 * Path assembly — how context composes when you branch off a branch.
 *
 * Briefs compose recursively. A branch's brief already distilled everything above it, so the
 * compile input for a fork taken inside a branch is: the parent's brief, plus what the parent
 * merged back, plus the parent's own turns. The full ancestor transcript is deliberately not
 * re-walked. That is the pruning bet.
 *
 * The consequence that matters: referents resolved at depth 1 stay resolved at depth 2, because
 * the resolution travels inside the brief instead of being re-derived from raw text.
 */
import { estimateTokens } from './tokens';
import type { Branch, Turn } from './types';

export interface AssembledPath {
  /** The compile input: inherited brief, inherited insight, then the visible turns. */
  markdown: string;
  tokens: number;
  depth: number;
  /**
   * The inherited brief's top fact — the chain's anchor. Pinned into the compiled output so the
   * entity grounding the chain survives composition. Without it, a depth-2 fork whose question
   * never names the entity compiles to "It closes on the 11th" — a dangling referent that a model
   * reading only the brief cannot resolve.
   */
  anchorFact?: string;
}

export function assemblePath(parent: Branch | null, turns: Turn[]): AssembledPath {
  const transcript = renderTurns(turns);

  if (!parent) {
    return { markdown: `## Conversation\n${transcript}`, tokens: estimateTokens(transcript), depth: 0 };
  }

  const sections: string[] = [];

  if (parent.brief) {
    sections.push(
      `## Inherited context (compiled when this branch was forked)\n${parent.brief.markdown}`,
    );
  }
  if (parent.insight) {
    sections.push(`## Concluded in the parent branch\n- ${parent.insight}`);
  }
  sections.push(`## Conversation\n${renderTurns(parent.turns)}\n\n${transcript}`.trim());

  const markdown = sections.join('\n\n');
  const anchorFact = parent.brief?.facts[0];

  return {
    markdown,
    tokens: estimateTokens(markdown),
    depth: parent.depth + 1,
    ...(anchorFact ? { anchorFact } : {}),
  };
}

/**
 * Has the compiler carried the anchor through in its TOP fact, possibly rephrased?
 *
 * True when every entity-bearing token of the anchor (capitalized words, numbers) appears in
 * facts[0] — "Free Ventures closes September 11" carries "Free Ventures applications close
 * September 11" without matching verbatim. Position 0 matters, not mere presence: the next
 * composition's anchor IS facts[0], so entities scattered further down would satisfy this brief
 * and still break the chain one level deeper. An anchor with no entity tokens compares verbatim.
 */
export function anchorCarriedThrough(anchor: string, facts: string[]): boolean {
  const top = facts[0] ?? '';
  const entityTokens = anchor.match(/\b(?:[A-Z][\w'-]*|\d[\d,.]*)\b/g) ?? [];
  if (!entityTokens.length) return top.trim() === anchor.trim();
  return entityTokens.every((t) => top.includes(t));
}

function renderTurns(turns: Turn[]): string {
  return turns.map((t) => `${t.role}: ${t.text}`).join('\n\n');
}
