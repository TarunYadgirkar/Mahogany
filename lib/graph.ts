/**
 * The branch loop, as a LangGraph.
 *
 * recall → compile → evaluate → (escalate ⟲) → route → answer → record
 *
 * Two reasons this is a graph and not a function. First, the escalate edge is a real cycle: a
 * brief that reports low coverage goes back through the compiler on a stronger model before
 * anything answers from it. Second, every step is checkpointed to MongoDB keyed by branch id, so
 * a dropped call or a restarted server resumes the branch instead of losing it — which in a live
 * voice demo is the difference between recovering and starting over.
 *
 * The nodes are thin. All the actual behavior lives in compiler.ts, router.ts, and outcomes.ts, so
 * if LangGraph ever fights you, `runBranch` can be replaced by calling those four functions in
 * order and nothing else changes. See AGENTS.md.
 */
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';

import { assemblePath } from './context';
import { compileBrief, COVERAGE_FLOOR } from './compiler';
import { client, DB_NAME } from './mongo';
import { record } from './outcomes';
import { complete, modelById } from './providers';
import { recallInsights } from './recall';
import { route } from './router';
import type { Branch, Brief, RecalledInsight, Routing, Turn } from './types';

const ANSWER_SYSTEM = [
  'You are answering one focused side question inside a longer spoken conversation.',
  'You have been given a compiled brief — it is all the context you get, and it is deliberate.',
  'Answer from the brief. Be direct and short enough to be spoken aloud: two or three sentences.',
  'If the brief genuinely lacks what you need, say exactly what is missing rather than guessing.',
  'Do not restate the brief back to the user. They already know it.',
].join(' ');

const BranchState = Annotation.Root({
  userId: Annotation<string>,
  branchId: Annotation<string>,
  question: Annotation<string>,
  selection: Annotation<string>,
  turns: Annotation<Turn[]>({ reducer: (_, b) => b, default: () => [] }),
  parent: Annotation<Branch | null>({ reducer: (_, b) => b, default: () => null }),

  recalled: Annotation<RecalledInsight[]>({ reducer: (_, b) => b, default: () => [] }),
  brief: Annotation<Brief | null>({ reducer: (_, b) => b, default: () => null }),
  routing: Annotation<Routing | null>({ reducer: (_, b) => b, default: () => null }),
  answer: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),

  escalated: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  mock: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  costUsd: Annotation<number>({ reducer: (a, b) => (a ?? 0) + b, default: () => 0 }),
  latencyMs: Annotation<number>({ reducer: (a, b) => (a ?? 0) + b, default: () => 0 }),
});

type State = typeof BranchState.State;

async function recallNode(state: State): Promise<Partial<State>> {
  const recalled = await recallInsights({
    userId: state.userId,
    query: `${state.selection}\n${state.question}`,
    ...(state.parent ? { excludeBranchId: state.parent.id } : {}),
  });
  return { recalled };
}

async function compileNode(state: State): Promise<Partial<State>> {
  const path = assemblePath(state.parent, state.turns);
  const result = await compileBrief({
    path,
    selection: state.selection || state.question,
    question: state.question,
    recalled: state.recalled,
    escalated: state.escalated,
  });
  return {
    brief: result.brief,
    mock: result.mock,
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
  };
}

/**
 * A thin brief is usually a context problem, not a model problem — but here the context is already
 * the minimum by construction, so the one lever left is compiling harder. One retry, then ship it
 * and let the brief admit its gaps. A brief that says what it is missing beats one that fabricates.
 */
function evaluateEdge(state: State): 'escalate' | 'route' {
  if (state.mock) return 'route';
  if ((state.brief?.coverage ?? 1) >= COVERAGE_FLOOR) return 'route';
  if (state.escalated) {
    console.warn('[graph] coverage still low after escalation — shipping the brief as-is');
    return 'route';
  }
  return 'escalate';
}

function escalateNode(): Partial<State> {
  return { escalated: true };
}

async function routeNode(state: State): Promise<Partial<State>> {
  if (!state.brief) return {};
  const routing = await route({
    userId: state.userId,
    question: state.question,
    brief: state.brief,
  });
  return { routing };
}

async function answerNode(state: State): Promise<Partial<State>> {
  if (!state.brief || !state.routing) return {};
  const spec = modelById(state.routing.model);

  const result = await complete({
    ...(spec ? { model: spec } : {}),
    maxTokens: 400,
    temperature: 0.4,
    messages: [
      { role: 'system', content: ANSWER_SYSTEM },
      { role: 'user', content: state.brief.markdown },
    ],
  });

  return {
    answer: result.text.trim(),
    costUsd: result.costUsd,
    latencyMs: result.latencyMs,
    mock: state.mock || result.mock,
  };
}

async function recordNode(state: State): Promise<Partial<State>> {
  if (!state.routing || !state.brief) return {};
  await record({
    userId: state.userId,
    branchId: state.branchId,
    questionKind: state.routing.questionKind,
    provider: state.routing.provider,
    model: state.routing.model,
    tier: state.routing.tier,
    briefTokens: state.brief.briefTokens,
    latencyMs: state.latencyMs,
    costUsd: state.costUsd,
    // Merge has not happened yet — it flips to true when the user keeps the conclusion.
    merged: false,
    regenerated: false,
    userCorrected: false,
    escalated: state.escalated,
  });
  return {};
}

const workflow = new StateGraph(BranchState)
  .addNode('recall', recallNode)
  .addNode('compile', compileNode)
  .addNode('escalate', escalateNode)
  .addNode('route', routeNode)
  // Named "respond", not "answer": LangGraph forbids a node sharing a name with a state channel,
  // and `answer` is where the text lands.
  .addNode('respond', answerNode)
  .addNode('record', recordNode)
  .addEdge(START, 'recall')
  .addEdge('recall', 'compile')
  .addConditionalEdges('compile', evaluateEdge, { escalate: 'escalate', route: 'route' })
  .addEdge('escalate', 'compile')
  .addEdge('route', 'respond')
  .addEdge('respond', 'record')
  .addEdge('record', END);

let compiled: ReturnType<typeof workflow.compile> | null = null;

async function graph() {
  if (compiled) return compiled;
  try {
    const checkpointer = new MongoDBSaver({ client: await client(), dbName: DB_NAME });
    compiled = workflow.compile({ checkpointer });
  } catch (err) {
    // Checkpointing is resilience, not correctness. Losing it must not lose the branch.
    console.error('[graph] checkpointer unavailable, running without persistence:', err);
    compiled = workflow.compile();
  }
  return compiled;
}

export interface BranchRun {
  brief: Brief;
  routing: Routing;
  answer: string;
  mock: boolean;
  costUsd: number;
  latencyMs: number;
  escalated: boolean;
}

/**
 * Run one branch end to end. `branchId` is the checkpoint thread id, so re-invoking with the same
 * id resumes rather than restarts.
 */
export async function runBranch(params: {
  userId: string;
  branchId: string;
  question: string;
  selection?: string;
  turns: Turn[];
  parent: Branch | null;
}): Promise<BranchRun> {
  const app = await graph();

  const final = (await app.invoke(
    {
      userId: params.userId,
      branchId: params.branchId,
      question: params.question,
      selection: params.selection ?? params.question,
      turns: params.turns,
      parent: params.parent,
    },
    { configurable: { thread_id: params.branchId } },
  )) as State;

  if (!final.brief || !final.routing) {
    throw new Error('branch run produced no brief — check provider configuration');
  }

  return {
    brief: final.brief,
    routing: final.routing,
    answer: final.answer,
    mock: final.mock,
    costUsd: final.costUsd,
    latencyMs: final.latencyMs,
    escalated: final.escalated,
  };
}
