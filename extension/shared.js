/**
 * Shared by the popup and the context menu. Both talk to the same routes the voice agent calls —
 * the extension is another client of the loop, not a second implementation of it.
 */

const DEFAULTS = {
  baseUrl: 'https://mahogany-alpha.vercel.app',
  secret: '',
  session: 'extension',
};

/** Pages Chrome refuses to inject into. Worth naming, so the popup can say why instead of failing. */
const BLOCKED = /^(chrome|edge|brave|about|devtools|view-source|chrome-extension|moz-extension):/i;

export async function settings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

function base(url) {
  return url.replace(/\/$/, '');
}

/**
 * What the user is looking at: the highlighted text, plus the page it came from.
 *
 * Reads every frame, not just the top document — a selection inside an iframe is the common case on
 * docs sites and embedded readers, and the top-level `getSelection()` returns empty there. Also
 * handles a selection inside an input or textarea, where `getSelection()` is empty too.
 */
export async function pageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { selection: '', title: '', url: '', blocked: true };

  const url = tab.url ?? '';
  const title = tab.title ?? '';
  if (BLOCKED.test(url) || url.includes('chromewebstore.google.com')) {
    return { selection: '', title, url, blocked: true };
  }

  try {
    const hits = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: () => {
        const el = document.activeElement;
        if (
          el &&
          'selectionStart' in el &&
          typeof el.selectionStart === 'number' &&
          el.selectionStart !== el.selectionEnd
        ) {
          return String(el.value ?? '').slice(el.selectionStart, el.selectionEnd);
        }
        return window.getSelection()?.toString() ?? '';
      },
    });

    const selection = hits.map((h) => (h?.result ?? '').trim()).find(Boolean) ?? '';
    return { selection, title, url, blocked: false };
  } catch (err) {
    return { selection: '', title, url, blocked: true, error: err.message };
  }
}

/**
 * `action` is 'fork' | 'merge' | 'return'. Returns the parsed body on success and throws with a
 * message worth showing a human — a 401 here is always the secret, and saying so saves a hunt.
 */
export async function callTool(action, body) {
  const { baseUrl, secret, session } = await settings();

  let res;
  try {
    res = await fetch(`${base(baseUrl)}/api/tools/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-mahogany-secret': secret } : {}),
      },
      body: JSON.stringify({ session_id: session, ...body }),
    });
  } catch (err) {
    // A blocked host permission and a typo in the URL both land here, and they look identical.
    throw new Error(`Could not reach ${base(baseUrl)} — ${err.message}`);
  }

  let json = {};
  try {
    json = await res.json();
  } catch {
    // Non-JSON means we did not hit the app: a Vercel auth wall, or the wrong base URL.
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('Rejected: the secret does not match TOOL_SECRET.');
    // A merge with nothing open is the single most common confusion: branches belong to a session,
    // so merging from a different session id finds nothing. Say which session, not just "404".
    if (res.status === 404 && action !== 'fork') {
      throw new Error(`Nothing open in session “${session}” — branch something first.`);
    }
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}

/** Clear the branch tree so a rehearsal does not leave nodes on the projector. Keeps memory. */
export async function resetTree() {
  const { baseUrl, secret } = await settings();
  const res = await fetch(`${base(baseUrl)}/api/demo/reset`, {
    method: 'POST',
    headers: secret ? { 'x-mahogany-secret': secret } : {},
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error('Rejected: the secret does not match TOOL_SECRET.');
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}

/**
 * A fresh session id. Branches are scoped to a session, so a new one gives the demo a clean trunk
 * without deleting anything — which is the difference between "clear the stage" and "erase memory".
 */
export async function newSession() {
  const session = `demo-${Date.now().toString(36)}`;
  await saveSettings({ session });
  return session;
}

/**
 * Is the server reachable, and does it accept this secret? `recall` is the probe because it reads
 * without writing and calls no model — a free question with a real answer.
 */
export async function health() {
  const { baseUrl, secret } = await settings();
  const root = base(baseUrl);

  let atlas = 'unknown';
  try {
    const res = await fetch(`${root}/api/health`);
    if (!res.ok) return { reachable: false, detail: `health returned ${res.status}` };
    const json = await res.json();
    atlas = json.atlas ?? 'unknown';
  } catch (err) {
    return { reachable: false, detail: err.message };
  }

  let secretAccepted = false;
  try {
    const res = await fetch(`${root}/api/tools/recall`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-mahogany-secret': secret } : {}),
      },
      body: JSON.stringify({ query: 'connection test' }),
    });
    secretAccepted = res.status !== 401;
  } catch {
    // Reachability is already established; treat a probe failure as an unproven secret.
  }

  return { reachable: true, atlas, secretAccepted };
}

/**
 * Fetch ElevenLabs speech for a line of text. The key stays on the server — an extension bundle is
 * readable by anyone who installs it, so a key in here is a published key.
 *
 * Returns an object URL, or null when speech is unavailable for any reason. Callers fall back to the
 * browser's own voice; the point is that the answer is heard, not that it sounds good.
 */
export async function speechUrl(text) {
  const { baseUrl, secret } = await settings();
  try {
    const res = await fetch(`${base(baseUrl)}/api/speak`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-mahogany-secret': secret } : {}),
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}
