/**
 * The learning substrate.
 *
 * Every routed call writes one document here: what kind of question it was, which provider and
 * model answered, how long it took, what it cost, and — the signal that matters — whether the user
 * kept the conclusion. `bestRouteFor` aggregates that history in the database and returns the
 * route with the best evidence.
 *
 * This collection is the difference between "we store chat history in MongoDB" and "what we stored
 * changes what happens next".
 */
import { outcomes } from './mongo';
import type { ProviderName, QuestionKind, RoutingOutcome, Tier } from './types';

/** Below this many samples, one lucky run would flip the route. Trust the classifier instead. */
export const MIN_SAMPLES = Number(process.env.ROUTING_MIN_SAMPLES ?? 2);

export interface RouteEvidence {
  provider: ProviderName;
  model: string;
  tier: Tier;
  samples: number;
  successRate: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  score: number;
}

export async function record(outcome: Omit<RoutingOutcome, 'createdAt'>): Promise<void> {
  try {
    await (await outcomes()).insertOne({ ...outcome, createdAt: new Date().toISOString() });
  } catch (err) {
    // Losing one training example is survivable; failing the user's request over it is not.
    console.error('[outcomes] failed to record:', err);
  }
}

/** Mark every outcome on a branch as merged. Called when the user keeps the conclusion. */
export async function markMerged(branchId: string): Promise<void> {
  try {
    await (await outcomes()).updateMany({ branchId }, { $set: { merged: true } });
  } catch (err) {
    console.error('[outcomes] failed to mark merged:', err);
  }
}

export async function markCorrected(branchId: string): Promise<void> {
  try {
    await (await outcomes()).updateMany({ branchId }, { $set: { userCorrected: true } });
  } catch (err) {
    console.error('[outcomes] failed to mark corrected:', err);
  }
}

/**
 * Which route has actually earned this kind of question, for this user.
 *
 * Scoring is success-first with cost as the tiebreak, because a cheap wrong answer is worthless
 * and an expensive right one is merely expensive. A route the user corrected is penalised harder
 * than one that simply was not merged — an explicit correction is a stronger negative than silence.
 */
export async function bestRouteFor(
  userId: string,
  kind: QuestionKind,
): Promise<RouteEvidence | null> {
  try {
    const rows = await (await outcomes())
      .aggregate<RouteEvidence>([
        { $match: { userId, questionKind: kind } },
        {
          $group: {
            _id: { provider: '$provider', model: '$model', tier: '$tier' },
            samples: { $sum: 1 },
            merged: { $sum: { $cond: ['$merged', 1, 0] } },
            corrected: { $sum: { $cond: ['$userCorrected', 1, 0] } },
            avgLatencyMs: { $avg: '$latencyMs' },
            avgCostUsd: { $avg: '$costUsd' },
          },
        },
        { $match: { samples: { $gte: MIN_SAMPLES } } },
        {
          $project: {
            _id: 0,
            provider: '$_id.provider',
            model: '$_id.model',
            tier: '$_id.tier',
            samples: 1,
            avgLatencyMs: { $round: ['$avgLatencyMs', 0] },
            avgCostUsd: 1,
            successRate: { $divide: ['$merged', '$samples'] },
            // Corrections subtract from the score; cost breaks ties between equally good routes.
            score: {
              $subtract: [
                {
                  $subtract: [
                    { $divide: ['$merged', '$samples'] },
                    { $multiply: [{ $divide: ['$corrected', '$samples'] }, 0.5] },
                  ],
                },
                { $multiply: ['$avgCostUsd', 2] },
              ],
            },
          },
        },
        { $sort: { score: -1, avgLatencyMs: 1 } },
        { $limit: 1 },
      ])
      .toArray();

    return rows[0] ?? null;
  } catch (err) {
    console.error('[outcomes] evidence lookup failed, falling back to the classifier:', err);
    return null;
  }
}

/** Everything learned so far, for the stage panel. Ordered by how much evidence backs it. */
export async function evidenceTable(userId: string): Promise<
  (RouteEvidence & { questionKind: QuestionKind })[]
> {
  try {
    return await (await outcomes())
      .aggregate<RouteEvidence & { questionKind: QuestionKind }>([
        { $match: { userId } },
        {
          $group: {
            _id: { kind: '$questionKind', provider: '$provider', model: '$model', tier: '$tier' },
            samples: { $sum: 1 },
            merged: { $sum: { $cond: ['$merged', 1, 0] } },
            avgLatencyMs: { $avg: '$latencyMs' },
            avgCostUsd: { $avg: '$costUsd' },
          },
        },
        {
          $project: {
            _id: 0,
            questionKind: '$_id.kind',
            provider: '$_id.provider',
            model: '$_id.model',
            tier: '$_id.tier',
            samples: 1,
            avgLatencyMs: { $round: ['$avgLatencyMs', 0] },
            avgCostUsd: 1,
            successRate: { $divide: ['$merged', '$samples'] },
            score: { $divide: ['$merged', '$samples'] },
          },
        },
        { $sort: { samples: -1 } },
        { $limit: 20 },
      ])
      .toArray();
  } catch {
    return [];
  }
}
