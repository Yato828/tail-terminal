// All listeners register synchronously. No timers or volatile selected context.
const CONTEXT = 'tail.extension.context.v2';
const TTL = 30 * 60 * 1000;
const MAX_TEXT = 16000;
function publicPage(raw) {
  try { const u = new URL(raw); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !['chrome.google.com', 'chromewebstore.google.com'].includes(u.hostname); } catch { return false; }
}
async function saveContext(text, sourceUrl = '') {
  const value = { version: 2, text: String(text || '').slice(0, MAX_TEXT), sourceUrl: publicPage(sourceUrl) ? sourceUrl.slice(0, 2048) : '', at: Date.now() };
  await chrome.storage.session.set({ [CONTEXT]: value });
  return value;
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'tail-analyze-selection', title: 'Analyze selected text / Solana CA in TAIL', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'tail-scan-page', title: 'Scan this page for Solana addresses', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
  });
  void chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});
async function scan(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.active || !publicPage(tab.url)) throw new Error('This page is unsupported. Use a regular HTTP(S) tab and invoke TAIL on that page first.');
  // activeTab is granted by invoking the extension action or context menu.
  const rows = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ text: (document.body?.innerText || '').slice(0, 16000), url: location.href }) });
  const result = rows[0]?.result;
  if (!result || !publicPage(result.url)) throw new Error('No permitted page content was returned.');
  return saveContext(result.text, result.url);
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!['tail-analyze-selection', 'tail-scan-page'].includes(info.menuItemId) || !tab?.id) return;
  // Open synchronously inside the user gesture, before any await/storage read.
  void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const job = info.menuItemId === 'tail-analyze-selection' ? saveContext(info.selectionText, info.pageUrl) : scan(tab.id);
  void job.catch(async error => { await chrome.storage.session.set({ 'tail.extension.error.v2': { message: String(error.message).slice(0, 300), at: Date.now() } }).catch(() => {}); });
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('popup.html'))) return;
  if (message?.type !== 'TAIL_SCAN_ACTIVE_PAGE') return;
  void (async () => {
    try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab?.id) throw new Error('No active page.'); respond({ ok: true, context: await scan(tab.id) }); }
    catch (error) { respond({ ok: false, error: error instanceof Error ? error.message : 'Page access unavailable. Invoke TAIL on this tab before scanning.' }); }
  })();
  return true;
});
// Expiration is checked on reads; worker suspension does not reset the lifetime.
chrome.runtime.onStartup.addListener(() => { void chrome.storage.session.get(CONTEXT).then(data => { const value = data[CONTEXT]; if (value && Date.now() - value.at > TTL) return chrome.storage.session.remove(CONTEXT); }).catch(() => {}); });
