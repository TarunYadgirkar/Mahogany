import { callTool, saveSettings, settings } from './shared.js';

const el = (id) => document.getElementById(id);

/**
 * Read whatever the user highlighted on the page. Reaching into the tab beats asking them to retype
 * a sentence they are already looking at — that retype is the whole reason a side question gets
 * skipped instead of asked.
 */
async function selectionFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return '';
  try {
    const [hit] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    });
    return (hit?.result ?? '').trim();
  } catch {
    // Chrome blocks injection on its own pages and the web store. Typing still works.
    return '';
  }
}

function showError(message) {
  el('err').textContent = message;
  el('err').classList.remove('hidden');
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

async function run(action) {
  const text = el('question').value.trim();
  if (action === 'fork' && text.length < 4) {
    showError('Type or select a question first.');
    return;
  }

  el('err').classList.add('hidden');
  el('out').classList.add('hidden');
  el('fork').disabled = true;
  el('merge').disabled = true;

  try {
    const body = action === 'fork' ? { question: text } : text ? { insight: text } : {};
    showResult(await callTool(action, body));
    if (action === 'fork') el('question').value = '';
  } catch (err) {
    showError(err.message);
  } finally {
    el('fork').disabled = false;
    el('merge').disabled = false;
  }
}

(async () => {
  const current = await settings();
  el('baseUrl').value = current.baseUrl;
  el('secret').value = current.secret;
  el('session').value = current.session;

  const selected = await selectionFromPage();
  if (selected) el('question').value = selected;
  el('question').focus();

  el('fork').addEventListener('click', () => void run('fork'));
  el('merge').addEventListener('click', () => void run('merge'));
  el('save').addEventListener('click', async () => {
    await saveSettings({
      baseUrl: el('baseUrl').value.trim(),
      secret: el('secret').value,
      session: el('session').value.trim() || 'extension',
    });
    el('save').textContent = 'Saved';
    setTimeout(() => (el('save').textContent = 'Save'), 1200);
  });
})();
