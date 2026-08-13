/** The tree, for the first paint. Change streams take over from there. */
import { tree } from '@/lib/branches';
import { json, preflight, userIdFrom } from '@/lib/http';
import { insights } from '@/lib/mongo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') ?? userIdFrom(req);
  const sessionId = url.searchParams.get('sessionId') ?? undefined;

  const [nodes, memory] = await Promise.all([
    tree(userId, sessionId),
    (await insights())
      .find({ userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(30)
      .toArray(),
  ]);

  return json({ ok: true, branches: nodes, insights: memory });
}
