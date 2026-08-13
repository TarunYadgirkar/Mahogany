/**
 * Right-click a selection anywhere and fork it without opening the popup. One gesture from reading
 * something to having asked about it — the popup is for questions you have to phrase yourself.
 */
import { callTool } from './shared.js';

const MENU_ID = 'mahogany-fork';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Fork as a side question in Mahogany',
    contexts: ['selection'],
  });
});

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

  void (async () => {
    try {
      const json = await callTool('fork', { question });
      notify('Forked', json.speak ?? 'Done.');
    } catch (err) {
      notify('Mahogany failed', err.message);
    }
  })();
});
