/**
 * Shared by the popup and the context menu. Both talk to the same routes the voice agent calls —
 * the extension is another client of the loop, not a second implementation of it.
 */

const DEFAULTS = {
  baseUrl: 'https://mahogany-taruns-projects-248def65.vercel.app',
  secret: '',
  session: 'extension',
};

export async function settings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

/**
 * `action` is 'fork' | 'merge' | 'return'. Returns the parsed body on success and throws with a
 * message worth showing a human — a 401 here is always the secret, and saying so saves a hunt.
 */
export async function callTool(action, body) {
  const { baseUrl, secret, session } = await settings();

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tools/${action}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-mahogany-secret': secret } : {}),
    },
    body: JSON.stringify({ session_id: session, ...body }),
  });

  let json = {};
  try {
    json = await res.json();
  } catch {
    // Non-JSON means we hit something that is not the app — a Vercel auth wall, or a wrong base URL.
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Rejected: the secret does not match TOOL_SECRET.');
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}
