/**
 * What the router has learned. Rendered on the live page as a table.
 *
 * This is the panel to point at when someone asks whether the memory actually does anything: it is
 * a list of routes ranked by outcomes, computed by an aggregation, and it is what picks the model
 * on the next question.
 */
import { json, preflight, userIdFrom } from '@/lib/http';
import { evidenceTable } from '@/lib/outcomes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function GET(req: Request): Promise<Response> {
  const userId = new URL(req.url).searchParams.get('userId') ?? userIdFrom(req);
  return json({ ok: true, evidence: await evidenceTable(userId) });
}
