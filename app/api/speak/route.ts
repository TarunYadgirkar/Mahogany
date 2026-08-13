/**
 * Text to speech for the clients that have no agent attached — the page panel and the extension.
 *
 * The voice call gets its speech from ElevenLabs directly; these two only ever had text. Routing the
 * synthesis through the server keeps the ElevenLabs key server-side, which matters more here than
 * usual: an extension ships its whole bundle to whoever installs it.
 *
 * No key configured is not an error worth failing on — the clients fall back to the browser's own
 * speech synthesis, which is worse but still speaks.
 */
import { authorized, fail, preflight } from '@/lib/http';
import { stripVoiceTags } from '@/lib/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';
const MAX_CHARS = 1200;

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req)) return fail('unauthorized', 401);

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return fail('no elevenlabs key configured', 503);

  let body: { text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail('body is not valid JSON');
  }

  // Tags are instructions to an agent, not words. Unstripped, the browser reads "<Branch>" aloud.
  const text = stripVoiceTags((body.text ?? '').trim()).slice(0, MAX_CHARS);
  if (!text) return fail('nothing to speak');

  const voiceId = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const model = process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5';

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(20_000),
        headers: { 'xi-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }),
      },
    );

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      return fail(`elevenlabs ${res.status}: ${detail.slice(0, 160)}`, 502);
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'speech failed', 502);
  }
}
