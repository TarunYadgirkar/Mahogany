/**
 * ElevenLabs webhook tool: merge_branch.
 *
 * One distilled line goes to the parent and into long-term memory. This route is the write side of
 * "no cold start" — from here on, every future branch in every future session can recall it.
 */
import { activeBranch, get } from '@/lib/branches';
import { mergeBranch } from '@/lib/conversation';
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

  let body: { insight?: string; branch_id?: string; session_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('body is not valid JSON');
  }

  const userId = userIdFrom(req);
  const sessionId = body.session_id ?? 'live-session';

  const branch = body.branch_id
    ? await get(userId, body.branch_id)
    : await activeBranch(userId, sessionId);

  if (!branch) return fail('no active branch to merge', 404);

  try {
    // No insight supplied means the agent wants us to distill it from the branch itself.
    const insight = (body.insight ?? '').trim();
    const result = await mergeBranch({
      userId,
      branch,
      insight: insight.length > 8 ? insight : null,
    });

    return json({
      ok: true,
      speak: speakAs(result.say, result.branch.depth),
      merged: result.event === 'merged',
      back_to: result.branch.title,
      branch_id: result.branch.id,
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'merge failed', 500);
  }
}
