/**
 * The tree store. Every mutation here is a document write, which is what makes the tree survive a
 * dropped call, a server restart, and a completely new session — and what gives the change stream
 * something to animate.
 */
import { branches, insights } from './mongo';
import { markMerged } from './outcomes';
import type { Branch, Brief, InsightDoc, QuestionKind, Routing, Turn } from './types';

function now(): string {
  return new Date().toISOString();
}

export function newTurn(role: Turn['role'], text: string): Turn {
  return { role, text, at: now() };
}

/** The trunk of a session. Created lazily on the first turn so an empty call leaves no litter. */
export async function ensureTrunk(params: {
  userId: string;
  sessionId: string;
  title?: string;
}): Promise<Branch> {
  const col = await branches();
  const existing = await col.findOne(
    { userId: params.userId, sessionId: params.sessionId, parentId: null },
    { projection: { _id: 0 } },
  );
  if (existing) return existing;

  const trunk: Branch = {
    id: crypto.randomUUID(),
    userId: params.userId,
    sessionId: params.sessionId,
    parentId: null,
    depth: 0,
    title: params.title ?? 'Main thread',
    question: '',
    brief: null,
    routing: null,
    turns: [],
    status: 'active',
    insight: null,
    createdAt: now(),
    updatedAt: now(),
  };
  await col.insertOne({ ...trunk });
  return trunk;
}

export async function get(userId: string, id: string): Promise<Branch | null> {
  return (await branches()).findOne({ userId, id }, { projection: { _id: 0 } });
}

/**
 * The branch a session is currently speaking into: the deepest active branch, falling back to the
 * trunk. Voice has no cursor to click, so "where am I" has to be derivable from stored state.
 */
export async function activeBranch(userId: string, sessionId: string): Promise<Branch | null> {
  const col = await branches();
  const active = await col
    .find({ userId, sessionId, status: 'active' }, { projection: { _id: 0 } })
    .sort({ depth: -1, createdAt: -1 })
    .limit(1)
    .toArray();
  return active[0] ?? null;
}

export async function fork(params: {
  userId: string;
  sessionId: string;
  parent: Branch;
  question: string;
  brief: Brief;
  routing: Routing;
}): Promise<Branch> {
  const branch: Branch = {
    id: crypto.randomUUID(),
    userId: params.userId,
    sessionId: params.sessionId,
    parentId: params.parent.id,
    depth: params.parent.depth + 1,
    title: params.question.slice(0, 80),
    question: params.question,
    brief: params.brief,
    routing: params.routing,
    turns: [],
    status: 'active',
    insight: null,
    createdAt: now(),
    updatedAt: now(),
  };

  const col = await branches();
  // The parent pauses while the branch is live. Two active siblings would make `activeBranch`
  // ambiguous, and in a voice session there is no way for the user to disambiguate.
  await col.updateOne(
    { userId: params.userId, id: params.parent.id },
    { $set: { status: 'paused', updatedAt: now() } },
  );
  await col.insertOne({ ...branch });
  return branch;
}

export async function appendTurn(
  userId: string,
  branchId: string,
  turn: Turn,
): Promise<void> {
  await (await branches()).updateOne(
    { userId, id: branchId },
    { $push: { turns: turn }, $set: { updatedAt: now() } },
  );
}

/**
 * Merge: one distilled line goes to the parent and to long-term memory, the branch closes, the
 * parent resumes. Writing the insight is what makes every future branch able to recall it.
 */
export async function merge(params: {
  userId: string;
  branch: Branch;
  insight: string;
}): Promise<InsightDoc> {
  const col = await branches();
  const stamp = now();

  const doc: InsightDoc = {
    id: crypto.randomUUID(),
    userId: params.userId,
    text: params.insight,
    sourceBranchId: params.branch.id,
    sourceTitle: params.branch.title,
    questionKind: (params.branch.routing?.questionKind ?? 'factual') as QuestionKind,
    createdAt: stamp,
  };

  await (await insights()).insertOne({ ...doc });
  await col.updateOne(
    { userId: params.userId, id: params.branch.id },
    { $set: { insight: params.insight, status: 'merged', updatedAt: stamp } },
  );

  if (params.branch.parentId) {
    await col.updateOne(
      { userId: params.userId, id: params.branch.parentId },
      { $set: { status: 'active', updatedAt: stamp } },
    );
  }

  // A conclusion the user chose to keep is the strongest positive signal the router gets.
  await markMerged(params.branch.id);
  return doc;
}

export async function abandon(userId: string, branch: Branch): Promise<void> {
  const col = await branches();
  await col.updateOne(
    { userId, id: branch.id },
    { $set: { status: 'abandoned', updatedAt: now() } },
  );
  if (branch.parentId) {
    await col.updateOne(
      { userId, id: branch.parentId },
      { $set: { status: 'active', updatedAt: now() } },
    );
  }
}

export async function tree(userId: string, sessionId?: string): Promise<Branch[]> {
  const filter: Record<string, unknown> = { userId };
  if (sessionId) filter.sessionId = sessionId;
  return (await branches())
    .find(filter, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray();
}
