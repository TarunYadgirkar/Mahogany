/**
 * Seed the memory and the routing evidence that make the demo land.
 *
 *   npm run atlas:seed
 *
 * Two things get seeded, and both matter:
 *
 * 1. Insights — the "earlier conversations" a fresh call recalls from. Without them the reveal
 *    (a brand-new session that already knows something) has nothing to reveal.
 * 2. Routing outcomes — enough history that the router has an opinion on the first question. A
 *    router with zero evidence always falls back to the classifier, which makes the learning claim
 *    unprovable in a three-minute demo.
 */
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set');
  process.exit(1);
}

const userId = process.env.DEMO_USER_ID ?? 'demo-user';
const dbName = process.env.MONGODB_DB ?? 'mahogany';

const INSIGHTS = [
  {
    text: 'Ruled out Postgres with pgvector for the ingest service — the target host does not allow installing extensions, so the vector index has to be managed by the database provider.',
    sourceTitle: 'Picking a database',
    questionKind: 'compare',
  },
  {
    text: 'The ingest job must finish inside 60 seconds because it runs on a Vercel serverless function, which is why the batch size is capped at 500 documents.',
    sourceTitle: 'Picking a database',
    questionKind: 'analyze',
  },
  {
    text: 'The team decided to keep everything on one platform rather than bolting on a separate vector store — one connection string, one bill, one thing to page someone about.',
    sourceTitle: 'Architecture review',
    questionKind: 'plan',
  },
];

/**
 * Fireworks wins `factual` (fast, kept every time) and loses `compare` (kept once out of four).
 * That asymmetry is the demo: ask a comparison and watch the router send it to OpenRouter, out
 * loud, because of what is in this collection.
 */
const OUTCOMES = [
  { kind: 'factual', provider: 'fireworks', model: process.env.FW_MODEL_QUICK ?? 'accounts/fireworks/models/llama-v3p1-8b-instruct', tier: 'quick', merged: true, corrected: false, latency: 380, cost: 0.00012, n: 4 },
  { kind: 'compare', provider: 'fireworks', model: process.env.FW_MODEL_QUICK ?? 'accounts/fireworks/models/llama-v3p1-8b-instruct', tier: 'quick', merged: false, corrected: true, latency: 410, cost: 0.00014, n: 3 },
  { kind: 'compare', provider: 'openrouter', model: process.env.OR_MODEL_DEEP ?? 'anthropic/claude-3.5-sonnet', tier: 'deep', merged: true, corrected: false, latency: 2100, cost: 0.0121, n: 3 },
];

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const now = Date.now();

const insightDocs = INSIGHTS.map((s, i) => ({
  id: randomUUID(),
  userId,
  text: s.text,
  sourceBranchId: `seed-branch-${i}`,
  sourceTitle: s.sourceTitle,
  questionKind: s.questionKind,
  createdAt: new Date(now - (i + 1) * 3600_000).toISOString(),
}));

await db.collection('insights').deleteMany({ userId, sourceBranchId: { $regex: '^seed-branch-' } });
await db.collection('insights').insertMany(insightDocs);

const outcomeDocs = OUTCOMES.flatMap((o, oi) =>
  Array.from({ length: o.n }, (_, i) => ({
    userId,
    branchId: `seed-outcome-${oi}-${i}`,
    questionKind: o.kind,
    provider: o.provider,
    model: o.model,
    tier: o.tier,
    briefTokens: 700,
    latencyMs: o.latency,
    costUsd: o.cost,
    merged: o.merged,
    regenerated: false,
    userCorrected: o.corrected,
    escalated: false,
    createdAt: new Date(now - (oi * 10 + i) * 600_000).toISOString(),
  })),
);

await db.collection('routing_outcomes').deleteMany({ userId, branchId: { $regex: '^seed-outcome-' } });
await db.collection('routing_outcomes').insertMany(outcomeDocs);

console.log(`seeded ${insightDocs.length} insights and ${outcomeDocs.length} outcomes for "${userId}"`);
console.log('Atlas is embedding the insights now — give it ~20s before the demo.');

await client.close();
