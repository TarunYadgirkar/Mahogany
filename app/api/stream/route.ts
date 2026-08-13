/**
 * Live tree updates over SSE, driven by MongoDB change streams.
 *
 * Nobody polls. The tree on the projector moves because Atlas told it to — a branch sprouts the
 * moment the fork document lands, an insight flies home the moment the merge does. This is the
 * visual the room remembers, and it is genuinely load-bearing rather than decoration.
 */
import { branches, insights } from '@/lib/mongo';
import { userIdFrom } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const userId = new URL(req.url).searchParams.get('userId') ?? userIdFrom(req);
  const encoder = new TextEncoder();

  const branchCol = await branches();
  const insightCol = await insights();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send('ready', { ok: true });

      // Change streams need a replica set. Atlas is one; a standalone local mongod is not, so this
      // throws there — degrade to a quiet stream rather than 500ing the page's EventSource.
      const watchers: { close: () => Promise<void> }[] = [];
      try {
        const bs = branchCol.watch([{ $match: { 'fullDocument.userId': userId } }], {
          fullDocument: 'updateLookup',
        });
        const is = insightCol.watch([{ $match: { 'fullDocument.userId': userId } }], {
          fullDocument: 'updateLookup',
        });
        watchers.push(bs, is);

        // Closing a watcher on abort makes its in-flight iterator throw. Unhandled, that is an
        // unhandledRejection on every page close — noise in dev, and a process Node is entitled to
        // kill in production. Once `closed`, that throw is simply how the stream ends.
        const stopped = (event: string, err: unknown) => {
          if (closed) return;
          console.error(`[stream] ${event} watcher stopped:`, err);
          send('degraded', { reason: `${event} watcher stopped` });
        };

        void (async () => {
          try {
            for await (const change of bs) {
              const doc = 'fullDocument' in change ? change.fullDocument : null;
              if (doc) send('branch', { ...doc, _id: undefined });
            }
          } catch (err) {
            stopped('branch', err);
          }
        })();

        void (async () => {
          try {
            for await (const change of is) {
              const doc = 'fullDocument' in change ? change.fullDocument : null;
              if (doc) send('insight', { ...doc, _id: undefined });
            }
          } catch (err) {
            stopped('insight', err);
          }
        })();
      } catch (err) {
        console.error('[stream] change streams unavailable:', err);
        send('degraded', { reason: 'change streams unavailable' });
      }

      // Keeps proxies from closing an idle connection mid-demo.
      const beat = setInterval(() => send('ping', { t: Date.now() }), 20_000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(beat);
        for (const w of watchers) void w.close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
