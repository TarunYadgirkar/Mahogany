/**
 * Everything that can silently break before a demo, in one response. Check this first, always.
 */
import { json, preflight } from '@/lib/http';
import { branches, db, insights, INSIGHT_VECTOR_INDEX, outcomes } from '@/lib/mongo';
import { MODELS, providerConfigured } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function GET(): Promise<Response> {
  const out: Record<string, unknown> = {
    providers: {
      fireworks: providerConfigured('fireworks'),
      openrouter: providerConfigured('openrouter'),
    },
    models: MODELS.map((m) => `${m.provider}:${m.tier}:${m.id}`),
    toolSecret: Boolean(process.env.TOOL_SECRET),
  };

  try {
    await (await db()).command({ ping: 1 });
    out.atlas = 'connected';
  } catch (err) {
    out.atlas = `unreachable: ${err instanceof Error ? err.message : String(err)}`;
    return json({ ok: false, ...out }, 503);
  }

  try {
    const col = await insights();
    const list = (await col.listSearchIndexes().toArray()) as {
      name: string;
      status?: string;
      queryable?: boolean;
    }[];
    const idx = list.find((i) => i.name === INSIGHT_VECTOR_INDEX);
    out.vectorIndex = idx
      ? { name: idx.name, status: idx.status, queryable: idx.queryable }
      : 'MISSING — run npm run atlas:setup';

    out.counts = {
      insights: await col.countDocuments(),
      branches: await (await branches()).countDocuments(),
      outcomes: await (await outcomes()).countDocuments(),
    };
  } catch (err) {
    out.vectorIndex = `check failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const ok =
    out.atlas === 'connected' &&
    typeof out.vectorIndex === 'object' &&
    (out.vectorIndex as { queryable?: boolean }).queryable === true;

  return json({ ok, ...out }, ok ? 200 : 200);
}
