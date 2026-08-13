/**
 * ElevenLabs webhook tool: fork_branch.
 *
 * The agent calls this when the user says something like "hold on, side question". Forking is a
 * real action with a real result — a compiled brief, a routing decision, an answer — not a UI
 * animation, which is what separates this from a branching-chat feature.
 */
import { activeBranch, ensureTrunk } from '@/lib/branches';
import { forkBranch } from '@/lib/conversation';
import { authorized, fail, json, preflight, userIdFrom } from '@/lib/http';
import { speakAs } from '@/lib/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail('unauthorized', 401);

  let body: { question?: string; session_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('body is not valid JSON');
  }

  const question = (body.question ?? '').trim();
  if (!question) return fail('question is required');

  const userId = userIdFrom(req);
  const sessionId = body.session_id ?? 'live-session';

  try {
    const trunk = await ensureTrunk({ userId, sessionId });
    const parent = (await activeBranch(userId, sessionId)) ?? trunk;
    const result = await forkBranch({ userId, sessionId, parent, question });

    // The `speak` field is what the agent reads aloud; everything else is for the live tree and
    // for whoever is narrating the numbers on stage.
    return json({
      ok: true,
      speak: speakAs(result.say, result.branch.depth),
      branch_id: result.branch.id,
      depth: result.branch.depth,
      ...result.detail,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'fork failed', 500);
  }
}
