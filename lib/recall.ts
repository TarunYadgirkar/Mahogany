/**
 * Cross-session recall — the reason Mahogany exists.
 *
 * Every insight ever merged lives in `insights` with `text` indexed by Atlas Automated Embedding.
 * We store plain text and query with plain text; Atlas embeds both sides with Voyage in-database.
 * No embedding pipeline, no separate vector store — which is the only reason cross-conversation
 * recall fits in an afternoon.
 *
 * This is what lets a brand-new call start warm.
 */
import { INSIGHT_VECTOR_INDEX, insights } from './mongo';
import type { InsightDoc, RecalledInsight } from './types';

/** Below this a "match" is noise dressed as memory. Tune by eye on seeded data. */
const MIN_SCORE = Number(process.env.RECALL_MIN_SCORE ?? 0.55);

export async function recallInsights(params: {
  userId: string;
  query: string;
  /** The branch being forked from — its own insight is already in the path, so exclude it. */
  excludeBranchId?: string;
  limit?: number;
}): Promise<RecalledInsight[]> {
  const limit = params.limit ?? 4;
  if (!params.query.trim()) return [];

  const filter: Record<string, unknown> = { userId: params.userId };
  if (params.excludeBranchId) filter.sourceBranchId = { $ne: params.excludeBranchId };

  try {
    const results = await (await insights())
      .aggregate<InsightDoc & { score: number }>([
        {
          $vectorSearch: {
            index: INSIGHT_VECTOR_INDEX,
            path: 'text',
            // Automated Embedding: a plain string here, not a vector. Atlas embeds the query.
            query: params.query,
            filter,
            numCandidates: 100,
            limit: limit * 3,
          },
        },
        { $addFields: { score: { $meta: 'vectorSearchScore' } } },
        { $match: { score: { $gte: MIN_SCORE } } },
        { $limit: limit },
      ])
      .toArray();

    return results.map((doc) => ({
      id: doc.id,
      text: doc.text,
      score: Math.round(doc.score * 100) / 100,
      sourceBranchId: doc.sourceBranchId,
      sourceTitle: doc.sourceTitle,
      createdAt: doc.createdAt,
    }));
  } catch (err) {
    // A missing or still-building index must not take the compile down. The brief is still useful
    // without recall — it just is not the demo. Surfaced as empty, logged loudly.
    console.error('[recall] vector search failed, continuing without recall:', err);
    return [];
  }
}
