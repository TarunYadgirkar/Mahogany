/**
 * Clear the branch tree between run-throughs, from whichever client is in front of you.
 *
 * `npm run atlas:reset` does the same thing from a terminal, which is no help when the laptop is
 * already mirrored to a projector and a rehearsal just left four test branches on screen.
 *
 * Branches only. Insights and routing outcomes are the seeded memory the whole reveal depends on,
 * and re-seeding them means waiting on Atlas to embed again — never worth it mid-demo.
 */
import { branches } from '@/lib/mongo';
import { authorized, fail, json, preflight, userIdFrom } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail('unauthorized', 401);

  const userId = userIdFrom(req);

  try {
    const result = await (await branches()).deleteMany({ userId });
    return json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'reset failed', 500);
  }
}
