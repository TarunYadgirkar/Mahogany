/**
 * ElevenLabs webhook tool: abandon_branch.
 *
 * A dead end is information. Abandoning records a negative signal against the route that produced
 * the branch, so the same question kind gets a different provider next time.
 */
import { activeBranch, get } from '@/lib/branches';
import { abandonBranch } from '@/lib/conversation';
import { authorized, fail, json, preflight, userIdFrom } from '@/lib/http';
import { speakAs } from '@/lib/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail('unauthorized', 401);

  let body: { branch_id?: string; session_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('body is not valid JSON');
  }

  const userId = userIdFrom(req);
  const branch = body.branch_id
    ? await get(userId, body.branch_id)
    : await activeBranch(userId, body.session_id ?? 'live-session');

  if (!branch) return fail('no active branch', 404);

  const result = await abandonBranch({ userId, branch });
  return json({
    ok: true,
    speak: speakAs(result.say, result.branch.depth),
    branch_id: result.branch.id,
  });
}
