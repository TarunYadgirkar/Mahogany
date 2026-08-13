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

/**
 * `?deep=1` asks ElevenLabs whether the key actually works, which "a key is set" does not tell you.
 * A dead key degrades both agent-less clients to the browser voice silently — the exact failure that
 * looks fine until someone is listening. Lists voices rather than synthesising: no credits spent.
 */
async function elevenlabsKeyWorks(): Promise<{ valid: boolean; detail: string }> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { valid: false, detail: 'no key set' };
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { valid: false, detail: `elevenlabs ${res.status}` };
    const body = (await res.json()) as { voices?: unknown[] };
    return { valid: true, detail: `${body.voices?.length ?? 0} voices available` };
  } catch (err) {
    return { valid: false, detail: err instanceof Error ? err.message : 'unreachable' };
  }
}

export async function GET(req: Request): Promise<Response> {
  const deep = new URL(req.url).searchParams.get('deep') === '1';

  const out: Record<string, unknown> = {
    providers: {
      fireworks: providerConfigured('fireworks'),
      openrouter: providerConfigured('openrouter'),
    },
    models: MODELS.map((m) => `${m.provider}:${m.tier}:${m.id}`),
    toolSecret: Boolean(process.env.TOOL_SECRET),
    // Whether /api/speak can use ElevenLabs, or whether the page and the extension are falling back
    // to the browser's voice. Configured-or-not is checkable without the secret; the key is not.
    elevenlabsSpeech: Boolean(process.env.ELEVENLABS_API_KEY),
  };

  if (deep) out.elevenlabsKey = await elevenlabsKeyWorks();

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
