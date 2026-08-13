/**
 * Response helpers. ElevenLabs calls these routes server-to-server, so CORS is not strictly
 * required — but the tree page and any local testing hit them from a browser, and a missing CORS
 * header presents as an opaque network error that looks nothing like a CORS problem.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-mahogany-user,x-mahogany-secret',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export function fail(message: string, status = 400): Response {
  console.error(`[api ${status}] ${message}`);
  return json({ ok: false, error: message }, status);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Shared-secret check for the ElevenLabs webhook tools. These routes mutate the tree, so leaving
 * them open on a public URL means anyone can fork and merge into your demo mid-presentation.
 * Unset secret = open, which is fine locally and is reported by /api/health.
 */
export function authorized(req: Request): boolean {
  const expected = process.env.TOOL_SECRET;
  if (!expected) return true;
  const got =
    req.headers.get('x-mahogany-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return got === expected;
}

/** The user this call belongs to. Single-tenant demo: one id, from env, overridable per request. */
export function userIdFrom(req: Request): string {
  const header = req.headers.get('x-mahogany-user');
  if (header && /^[\w-]{3,64}$/.test(header)) return header;
  return process.env.DEMO_USER_ID ?? 'demo-user';
}
