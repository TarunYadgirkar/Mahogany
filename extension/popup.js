import { callTool, health, pageContext, saveSettings, settings, speechUrl } from './shared.js';

const el = (id) => document.getElementById(id);

/**
 * Listeners bind before anything is awaited. The first version read the page selection first and
 * attached them afterwards, so any rejection up there — a restricted tab, an injection Chrome
 * refused — left every button dead with no error anywhere. Silent dead buttons are the worst
 * possible failure for a tool you reach for mid-thought.
 */
function bind() {
  el('branch').addEventListener('click', () => void run('fork'));
  el('merge').addEventListener('click', () => void run('merge'));
  el('save').addEventListener('click', () => void save());
  el('test').addEventListener('click', () => void test());
  // Branching from a page is more convincing when the tree is on screen moving as you do it.
  el('tree').addEventListener('click', () => {
    void (async () => {
      const { baseUrl } = await settings();
      await chrome.tabs.create({ url: baseUrl });
    })();
  });
}

function setStatus(message) {
  el('status').textContent = message;
}

function showError(message) {
  el('err').textContent = message;
  el('err').classList.remove('hidden');
}

function clearOutput() {
  el('err').classList.add('hidden');
  el('out').classList.add('hidden');
}

function showResult(json) {
  el('speak').textContent = json.speak ?? '(no answer returned)';
  const bits = [];
  if (json.provider) bits.push(json.provider);
  if (typeof json.recalled === 'number') bits.push(`${json.recalled} recalled`);
  if (json.mock) bits.push('mock');
  if (json.reason) bits.push(json.reason);
  el('meta').textContent = bits.join(' · ');
  el('out').classList.remove('hidden');
}

/** ElevenLabs when the server has a key, the browser's voice when it does not. */
async function say(text) {
  const url = await speechUrl(text);
  if (url) {
    try {
      await new Audio(url).play();
      return;
    } catch {
      // Autoplay can still refuse inside a popup; fall through to the local voice.
    }
  }
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

async function run(action) {
  const text = el('question').value.trim();
  if (action === 'fork' && text.length < 4) {
    showError('Highlight something on the page, or type a question first.');
    return;
  }

  clearOutput();
  el('branch').disabled = true;
  el('merge').disabled = true;
  setStatus(action === 'fork' ? 'branching…' : 'merging…');

  try {
    const body = action === 'fork' ? { question: text } : text ? { insight: text } : {};
    const json = await callTool(action, body);
    showResult(json);
    setStatus(action === 'fork' ? 'branched — check the tree page' : 'merged into memory');
    if (action === 'fork') el('question').value = '';
    if (json.speak) void say(json.speak);
  } catch (err) {
    showError(err.message);
    setStatus('failed');
  } finally {
    el('branch').disabled = false;
    el('merge').disabled = false;
  }
}

async function save() {
  await saveSettings({
    baseUrl: el('baseUrl').value.trim(),
    secret: el('secret').value,
    session: el('session').value.trim() || 'extension',
  });
  el('save').textContent = 'Saved';
  setTimeout(() => (el('save').textContent = 'Save'), 1200);
  void test();
}

/** Answers the two questions a dead button raises: right URL, right secret. */
async function test() {
  clearOutput();
  setStatus('testing…');
  try {
    const result = await health();
    setStatus(
      result.reachable
        ? `connected · atlas ${result.atlas} · secret ${result.secretAccepted ? 'accepted' : 'REJECTED'}`
        : 'cannot reach the server',
    );
    if (!result.reachable) showError(result.detail ?? 'no response from the base URL');
    else if (!result.secretAccepted) showError('The server rejected the secret — check TOOL_SECRET.');
  } catch (err) {
    setStatus('test failed');
    showError(err.message);
  }
}

async function loadSettings() {
  const current = await settings();
  el('baseUrl').value = current.baseUrl;
  el('secret').value = current.secret;
  el('session').value = current.session;
  return current;
}

async function loadSelection() {
  const context = await pageContext();
  if (context.selection) {
    el('question').value = context.selection;
    el('source').textContent = context.title ? `from “${context.title}”` : 'from this page';
    el('source').classList.remove('hidden');
    return true;
  }
  if (context.blocked) {
    el('source').textContent = 'Chrome blocks reading this page — type the question instead.';
    el('source').classList.remove('hidden');
  }
  return false;
}

bind();

void (async () => {
  let base = '(unset)';
  try {
    base = (await loadSettings()).baseUrl;
  } catch (err) {
    showError(`settings unavailable: ${err.message}`);
  }

  let captured = false;
  try {
    captured = await loadSelection();
  } catch (err) {
    // Never fatal — typing always works, and the buttons are already live.
    el('source').textContent = `could not read the page: ${err.message}`;
    el('source').classList.remove('hidden');
  }

  setStatus(`${base.replace(/^https?:\/\//, '')} · ${captured ? 'selection captured' : 'no selection'}`);
  el('question').focus();
})();
