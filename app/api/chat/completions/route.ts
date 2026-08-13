/**
 * The ElevenLabs custom-LLM endpoint. This is where Mahogany becomes the agent's brain.
 *
 * ElevenLabs speaks the OpenAI chat-completions shape, so pointing its agent here means every spoken
 * turn runs through the branch loop instead of a stock model: intent detection, recall, compiled
 * brief, evidence-based routing, answer. The agent keeps doing what it is good at — turn-taking,
 * transcription, and voice — and the thinking happens here.
 *
 * Webhook tools (/api/tools/*) give the agent an explicit way to fork and merge. This endpoint also
 * detects those intents itself, so the demo survives the agent declining to call a tool, which it
 * will do at least once on stage.
 */
import { handleUtterance } from '@/lib/conversation';
import { authorized, preflight, userIdFrom } from '@/lib/http';
import { speakAs } from '@/lib/voice';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function OPTIONS(): Response {
  return preflight();
}

interface ChatBody {
  messages?: { role: string; content: unknown }[];
  stream?: boolean;
  user?: string;
  /** ElevenLabs can attach dynamic variables to the request body; we look for a session id there. */
  mahogany_session?: string;
  conversation_id?: string;
}

export async function POST(req: Request): Promise<Response> {
  // This route spends provider credits and forks the tree through intent detection, so on a public
  // URL it needs the same gate as /api/tools/*. ElevenLabs sends its custom-LLM API key as a bearer
  // token, which `authorized` accepts — set that field to TOOL_SECRET. Unset secret stays open.
  if (!authorized(req)) return new Response('unauthorized', { status: 401 });

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response('body is not valid JSON', { status: 400 });
  }

  const userId = userIdFrom(req);
  const sessionId =
    body.mahogany_session ??
    body.conversation_id ??
    body.user ??
    req.headers.get('x-mahogany-session') ??
    'live-session';

  const utterance = lastUserText(body.messages ?? []);
  if (!utterance) {
    return body.stream === false
      ? json(completion('I did not catch that.'))
      : stream('I did not catch that.');
  }

  let say: string;
  try {
    const result = await handleUtterance({ userId, sessionId, utterance });
    // Depth decides the voice, so descending into a branch and merging back are both audible.
    say = speakAs(result.say, result.branch.depth);
    console.log(
      `[voice] ${result.event} · ${result.branch.title.slice(0, 40)}` +
        (result.detail
          ? ` · ${result.detail.prunedPct}% pruned · ${result.detail.recalled} recalled · ${result.detail.provider}`
          : ''),
    );
  } catch (err) {
    // Never hang the call. A spoken apology beats dead air, and the error is in the logs.
    console.error('[voice] turn failed:', err);
    say = 'Something went wrong on my side just then. Say that again?';
  }

  return body.stream === false ? json(completion(say)) : stream(say);
}

function lastUserText(messages: { role: string; content: unknown }[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  if (!last) return '';
  if (typeof last.content === 'string') return last.content.trim();
  // Some clients send content as an array of parts.
  if (Array.isArray(last.content)) {
    return last.content
      .map((p) => (typeof p === 'object' && p && 'text' in p ? String((p as { text: unknown }).text) : ''))
      .join(' ')
      .trim();
  }
  return '';
}

function completion(text: string) {
  return {
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'mahogany',
    choices: [
      { index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/**
 * The answer is already fully formed by the time we get here, so this chunks it rather than
 * streaming token-by-token. ElevenLabs starts speaking on the first chunk, so sentence-sized
 * pieces get audio moving without the complexity of streaming through the whole graph.
 */
function stream(text: string): Response {
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();

  const chunk = (delta: Record<string, unknown>, finish: string | null = null) =>
    `data: ${JSON.stringify({
      id,
      object: 'chat.completion.chunk',
      created,
      model: 'mahogany',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  const pieces = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];

  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(chunk({ role: 'assistant', content: '' })));
      for (const piece of pieces) {
        if (piece) controller.enqueue(encoder.encode(chunk({ content: piece })));
      }
      controller.enqueue(encoder.encode(chunk({}, 'stop')));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
