/**
 * The spoken loop, one utterance at a time.
 *
 * This is the layer ElevenLabs talks to. It decides whether an utterance forks a branch, merges
 * one back, abandons one, or is just the next turn — then runs the graph and returns something
 * worth saying out loud. The API routes are thin wrappers over these four functions, which is
 * what makes the behavior testable without a microphone.
 */
import * as branchStore from './branches';
import { distill } from './distill';
import { runBranch } from './graph';
import { detectIntent } from './intent';
import { markCorrected } from './outcomes';
import { complete, INTERNAL_MODEL } from './providers';
import type { Branch } from './types';

const TRUNK_SYSTEM = [
  'You are a thinking partner in a spoken conversation. Answer in two or three sentences —',
  'this is read aloud, so no lists, no markdown, no headings.',
  'If the user raises something that deserves its own thread, answer briefly and mention they can',
  'say "side question" to branch it without derailing this one.',
].join(' ');

export interface TurnResult {
  /** What the agent should say. */
  say: string;
  /** What structurally happened — drives the live tree and the stage narration. */
  event: 'forked' | 'merged' | 'abandoned' | 'continued';
  branch: Branch;
  /** Populated on a fork: how the branch was compiled and routed. */
  detail?: {
    prunedPct: number;
    briefTokens: number;
    availableTokens: number;
    recalled: number;
    provider: string;
    model: string;
    reason: string;
    fromEvidence: boolean;
    escalated: boolean;
    costUsd: number;
    latencyMs: number;
    mock: boolean;
  };
}

export async function handleUtterance(params: {
  userId: string;
  sessionId: string;
  utterance: string;
}): Promise<TurnResult> {
  const trunk = await branchStore.ensureTrunk({
    userId: params.userId,
    sessionId: params.sessionId,
  });
  const current = (await branchStore.activeBranch(params.userId, params.sessionId)) ?? trunk;
  const intent = detectIntent(params.utterance);

  await branchStore.appendTurn(
    params.userId,
    current.id,
    branchStore.newTurn('user', params.utterance),
  );
  const withTurn: Branch = {
    ...current,
    turns: [...current.turns, branchStore.newTurn('user', params.utterance)],
  };

  if (intent.kind === 'fork') {
    return forkBranch({ ...params, parent: withTurn, question: intent.question });
  }
  if (intent.kind === 'merge') {
    return mergeBranch({ ...params, branch: withTurn, insight: intent.insight });
  }
  if (intent.kind === 'abandon') {
    return abandonBranch({ ...params, branch: withTurn });
  }
  return continueTurn({ ...params, branch: withTurn });
}

export async function forkBranch(params: {
  userId: string;
  sessionId: string;
  parent: Branch;
  question: string;
}): Promise<TurnResult> {
  const branchId = crypto.randomUUID();

  const run = await runBranch({
    userId: params.userId,
    branchId,
    question: params.question,
    turns: params.parent.turns,
    parent: params.parent,
  });

  const branch = await branchStore.fork({
    userId: params.userId,
    sessionId: params.sessionId,
    parent: params.parent,
    question: params.question,
    brief: run.brief,
    routing: run.routing,
  });

  await branchStore.appendTurn(
    params.userId,
    branch.id,
    branchStore.newTurn('assistant', run.answer),
  );

  return {
    say: run.answer,
    event: 'forked',
    branch: { ...branch, turns: [branchStore.newTurn('assistant', run.answer)] },
    detail: {
      prunedPct: run.brief.prunedPct,
      briefTokens: run.brief.briefTokens,
      availableTokens: run.brief.availableTokens,
      recalled: run.brief.recalled.length,
      provider: run.routing.provider,
      model: run.routing.model,
      reason: run.routing.reason,
      fromEvidence: run.routing.fromEvidence,
      escalated: run.escalated,
      costUsd: run.costUsd,
      latencyMs: run.latencyMs,
      mock: run.mock,
    },
  };
}

export async function mergeBranch(params: {
  userId: string;
  branch: Branch;
  insight: string | null;
}): Promise<TurnResult> {
  // Merging the trunk is meaningless — there is nowhere to merge to. Say so rather than no-op.
  if (!params.branch.parentId) {
    return {
      say: "We're on the main thread, so there's nothing to merge back. Say \"side question\" first and I'll branch.",
      event: 'continued',
      branch: params.branch,
    };
  }

  const insight = params.insight ?? (await distill(params.branch));
  const doc = await branchStore.merge({
    userId: params.userId,
    branch: params.branch,
    insight,
  });

  const parent = await branchStore.get(params.userId, params.branch.parentId);
  return {
    say: `Kept it: ${doc.text} Back to the main thread.`,
    event: 'merged',
    branch: parent ?? params.branch,
  };
}

export async function abandonBranch(params: {
  userId: string;
  branch: Branch;
}): Promise<TurnResult> {
  if (!params.branch.parentId) {
    return { say: 'Nothing to drop — we never left the main thread.', event: 'continued', branch: params.branch };
  }

  // An abandoned branch is a negative signal about the route that produced it.
  await markCorrected(params.branch.id);
  await branchStore.abandon(params.userId, params.branch);

  const parent = await branchStore.get(params.userId, params.branch.parentId);
  return {
    say: 'Dropped that one. Back where we were.',
    event: 'abandoned',
    branch: parent ?? params.branch,
  };
}

async function continueTurn(params: {
  userId: string;
  branch: Branch;
}): Promise<TurnResult> {
  const context = params.branch.brief
    ? `${params.branch.brief.markdown}\n\n## This branch so far\n${renderTurns(params.branch)}`
    : renderTurns(params.branch);

  const result = await complete({
    model: INTERNAL_MODEL,
    maxTokens: 300,
    temperature: 0.5,
    messages: [
      { role: 'system', content: TRUNK_SYSTEM },
      { role: 'user', content: context },
    ],
  });

  const say = result.text.trim() || 'Say that again?';
  await branchStore.appendTurn(
    params.userId,
    params.branch.id,
    branchStore.newTurn('assistant', say),
  );

  return { say, event: 'continued', branch: params.branch };
}

function renderTurns(branch: Branch): string {
  return branch.turns.map((t) => `${t.role}: ${t.text}`).join('\n\n');
}
