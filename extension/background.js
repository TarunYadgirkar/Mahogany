/**
 * Right-click a selection anywhere and branch it without opening the popup. One gesture from reading
 * something to having asked about it.
 *
 * Feedback goes to the toolbar badge as well as a notification. A notification is easy to miss and
 * trivial to have switched off at the OS level, which makes a working branch look like a dead click.
 * The badge cannot be suppressed.
 */
import { callTool } from './shared.js';

const MENU_ID = 'mahogany-branch';

// create() throws if the id already exists, which happens on every extension reload during a demo.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Branch this as a side question',
      contexts: ['selection'],
    });
  });
});

function badge(text, color) {
  void chrome.action.setBadgeText({ text });
  void chrome.action.setBadgeBackgroundColor({ color });
  if (text) setTimeout(() => void chrome.action.setBadgeText({ text: '' }), 6000);
}

function notify(title, message) {
  // Chrome rejects data: URLs for iconUrl, so this points at the bundled icon. Truncated because
  // long bodies get silently dropped rather than wrapped.
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon128.png',
    title,
    message: message.length > 300 ? `${message.slice(0, 297)}…` : message,
  });
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const question = (info.selectionText ?? '').trim();
  if (!question) return;

  badge('…', '#c4703f');

  void (async () => {
    try {
      const json = await callTool('fork', { question });
      badge('✓', '#4a7c59');
      notify('Branched', json.speak ?? 'Done.');
      // Also readable from the service worker console, which is where you look when a badge shows ✗.
      console.log('[mahogany] branched:', json.speak);
    } catch (err) {
      badge('✗', '#d9776a');
      notify('Mahogany failed', err.message);
      console.error('[mahogany] branch failed:', err);
    }
  })();
});
