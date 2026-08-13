/**
 * ElevenLabs webhook tool: recall.
 *
 * Lets the agent ask memory a direct question — "have we decided this before?" — without forking.
 * Useful mid-sentence, and it makes the recall step demonstrable on its own rather than only as a
 * side effect of compiling a brief.
 */
import { authorized, fail, json, preflight, userIdFrom } from '@/lib/http';
import { recallInsights } from '@/lib/recall';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail('unauthorized', 401);

  let body: { query?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('body is not valid JSON');
  }

  const query = (body.query ?? '').trim();
  if (!query) return fail('query is required');

  const found = await recallInsights({ userId: userIdFrom(req), query, limit: 3 });

  return json({
    ok: true,
    count: found.length,
    speak: found.length
      ? `We settled this before: ${found.map((f) => f.text).join(' ')}`
      : 'Nothing in memory about that yet.',
    insights: found,
  });
}
