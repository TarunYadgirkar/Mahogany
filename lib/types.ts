/** Shared shapes. Keep this file dependency-free — the graph, the API, and the UI all import it. */

export type Tier = 'quick' | 'thoughtful' | 'deep';
export type ProviderName = 'fireworks' | 'openrouter';
export type BranchStatus = 'active' | 'paused' | 'merged' | 'abandoned';

export const QUESTION_KINDS = [
  'factual',
  'compare',
  'analyze',
  'plan',
  'rewrite',
  'code',
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

export const TIER_ORDER: Tier[] = ['quick', 'thoughtful', 'deep'];

export const TIER_LABEL: Record<Tier, string> = {
  quick: 'Quick',
  thoughtful: 'Thoughtful',
  deep: 'Deep',
};

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

/** An insight pulled from a *different* branch or session and folded into this brief. The point. */
export interface RecalledInsight {
  id: string;
  text: string;
  score: number;
  sourceBranchId: string;
  sourceTitle: string;
  createdAt: string;
}

export interface Brief {
  markdown: string;
  facts: string[];
  recalled: RecalledInsight[];
  excludedNote: string;
  /** The compiler's own estimate that these facts suffice. Drives escalation. */
  coverage: number;
  availableTokens: number;
  briefTokens: number;
  prunedPct: number;
}

export interface Routing {
  tier: Tier;
  provider: ProviderName;
  model: string;
  /** Human sentence explaining the pick. Spoken on stage. */
  reason: string;
  /** True when stored outcomes, not the classifier, decided this. */
  fromEvidence: boolean;
  questionKind: QuestionKind;
}

/** A node of the conversation tree. One document in `branches`. */
export interface Branch {
  id: string;
  userId: string;
  sessionId: string;
  parentId: string | null;
  depth: number;
  title: string;
  question: string;
  brief: Brief | null;
  routing: Routing | null;
  turns: Turn[];
  status: BranchStatus;
  insight: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A merged conclusion. One document in `insights`. `text` is what Atlas auto-embeds. */
export interface InsightDoc {
  id: string;
  userId: string;
  text: string;
  sourceBranchId: string;
  sourceTitle: string;
  questionKind: QuestionKind;
  createdAt: string;
}

/**
 * What actually happened on one routed call. This collection is the learning substrate — the
 * router aggregates it to choose between providers next time.
 */
export interface RoutingOutcome {
  userId: string;
  branchId: string;
  questionKind: QuestionKind;
  provider: ProviderName;
  model: string;
  tier: Tier;
  briefTokens: number;
  latencyMs: number;
  costUsd: number;
  /** The strong positive signal: the user kept this conclusion. */
  merged: boolean;
  regenerated: boolean;
  userCorrected: boolean;
  escalated: boolean;
  createdAt: string;
}

/** Events pushed to the live tree over SSE. */
export type TreeEvent =
  | { type: 'branch'; branch: Branch }
  | { type: 'insight'; insight: InsightDoc }
  | { type: 'ready' }
  | { type: 'degraded'; reason: string };
