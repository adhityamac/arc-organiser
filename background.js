/**
 * Minimal Board Tab - Service Worker (Manifest V3)
 * Handles global shortcuts, active tab capture, deduplication, badges, and context menus.
 */

import { isValidUrl, extractHost, normalizeUrl } from './lib/url.js';
import {
  initStoreIfNeeded,
  findDuplicate,
  saveCard,
  transaction,
} from './lib/store.js';

let badgeTimer = null;

/**
 * Displays a temporary badge on the extension action icon.
 * @param {string} text - e.g. '✓', 'DUP', '✗', or numeric count
 * @param {string} color - Hex color e.g. '#22c55e', '#f59e0b', '#ef4444'
 * @param {number} [durationMs=1500]
 */
function showBadge(text, color, durationMs = 1500) {
  if (badgeTimer) {
    clearTimeout(badgeTimer);
    badgeTimer = null;
  }

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });

  badgeTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    badgeTimer = null;
  }, durationMs);
}

/**
 * Initializes the default store and context menus upon extension install or update.
 */
chrome.runtime.onInstalled.addListener(async () => {
  await initStoreIfNeeded();

  // Create context menus (FR-1.6)
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'mbt-save-page',
      title: 'Save page to Minimal Board',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'mbt-save-link',
      title: 'Save link to Minimal Board',
      contexts: ['link'],
    });

    chrome.contextMenus.create({
      id: 'mbt-save-selection-note',
      title: 'Save selection as note',
      contexts: ['selection'],
    });
  });
});

/**
 * Core Quick-Save function (Alt+Shift+S or action click).
 * Captures active tab, normalizes URL, handles deduplication, and gives badge feedback.
 */
async function handleQuickSave() {
  await initStoreIfNeeded();

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.url) {
    showBadge('✗', '#ef4444');
    return;
  }

  // Reject invalid, local or internal schemes (chrome://, about:, etc.)
  if (!isValidUrl(activeTab.url)) {
    showBadge('✗', '#ef4444');
    return;
  }

  // Reject incognito tabs by default for privacy
  if (activeTab.incognito) {
    showBadge('✗', '#ef4444');
    return;
  }

  const shards = await new Promise((resolve) =>
    chrome.storage.local.get('meta', resolve)
  );
  const meta = shards.meta;
  const settings = meta.settings || {};
  const activeWorkspaceId = meta.activeWorkspaceId || 'ws_default';
  const stripTracking = settings.stripTrackingParams !== false;

  let nurl = '';
  try {
    nurl = normalizeUrl(activeTab.url, { stripTracking });
  } catch {
    showBadge('✗', '#ef4444');
    return;
  }

  const host = extractHost(activeTab.url);

  // Check duplicate status
  const dedupeScope = settings.dedupeScope || 'workspace';
  const existing = await findDuplicate(nurl, dedupeScope, activeWorkspaceId);

  if (existing) {
    // Duplicate detected: move card to top of column, touch updatedAt, show amber DUP badge
    const wsKey = `ws:${existing.workspaceId}`;
    const cardsKey = `cards:${existing.workspaceId}`;

    await transaction([wsKey, cardsKey], (data) => {
      const layout = data[wsKey];
      const cards = data[cardsKey];
      const col = layout.columns[existing.columnId];

      if (col && cards && cards[existing.card.id]) {
        cards[existing.card.id].updatedAt = Date.now();
        col.cardIds = col.cardIds.filter((id) => id !== existing.card.id);
        col.cardIds.unshift(existing.card.id);
      }

      return {
        [wsKey]: layout,
        [cardsKey]: cards,
      };
    });

    showBadge('DUP', '#f59e0b');
  } else {
    // New card: save into Inbox column
    const cardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await saveCard({
      cardData: {
        id: cardId,
        type: 'link',
        title: activeTab.title || host || activeTab.url,
        url: activeTab.url,
        nurl,
        host,
        note: '',
        tags: [],
        pinned: false,
      },
      workspaceId: activeWorkspaceId,
      prepend: true,
    });

    showBadge('✓', '#22c55e');
  }

  // Handle Save & Close mode if enabled
  if (settings.closeTabOnQuickSave && activeTab.id) {
    const tabsInWindow = await chrome.tabs.query({ currentWindow: true });
    // If it is the last tab in the window, open a new tab first so window survives
    if (tabsInWindow.length === 1) {
      await chrome.tabs.create({});
    }
    await chrome.tabs.remove(activeTab.id);
  }
}

/**
 * Saves all unpinned HTTP/HTTPS tabs in the current window into a timestamped Session column (Alt+Shift+A).
 */
async function handleSaveWindowSession() {
  await initStoreIfNeeded();

  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const shards = await new Promise((resolve) =>
    chrome.storage.local.get('meta', resolve)
  );
  const meta = shards.meta;
  const settings = meta.settings || {};
  const activeWorkspaceId = meta.activeWorkspaceId || 'ws_default';
  const includePinned = !!settings.includePinnedInSession;

  const validTabs = allTabs.filter(
    (tab) =>
      tab.url &&
      isValidUrl(tab.url) &&
      !tab.incognito &&
      (includePinned || !tab.pinned)
  );

  if (validTabs.length === 0) {
    showBadge('0', '#ef4444');
    return;
  }

  // Format timestamp: YYYY-MM-DD HH:mm
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sessionColumnTitle = `Session · ${dateStr}`;
  const colId = `col_session_${Date.now()}`;

  const wsKey = `ws:${activeWorkspaceId}`;
  const cardsKey = `cards:${activeWorkspaceId}`;

  await transaction([wsKey, cardsKey], (data) => {
    const layout = data[wsKey];
    const cards = data[cardsKey] || {};

    const cardIds = [];
    const now = Date.now();

    for (const tab of validTabs) {
      const cardId = `card_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const host = extractHost(tab.url);
      const nurl = normalizeUrl(tab.url, {
        stripTracking: settings.stripTrackingParams !== false,
      });

      cards[cardId] = {
        id: cardId,
        type: 'link',
        title: tab.title || host || tab.url,
        url: tab.url,
        nurl,
        host,
        note: '',
        tags: [],
        pinned: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        openCount: 0,
      };
      cardIds.push(cardId);
    }

    layout.columnOrder.push(colId);
    layout.columns[colId] = {
      id: colId,
      title: sessionColumnTitle,
      color: '#3b82f6',
      emoji: '🗂️',
      collapsed: false,
      sort: 'manual',
      cardIds,
    };

    return {
      [wsKey]: layout,
      [cardsKey]: cards,
    };
  });

  showBadge(String(validTabs.length), '#22c55e');
}

/**
 * Opens or focuses the Minimal Board Tab page (Alt+Shift+B).
 */
async function handleOpenBoard() {
  const newTabUrl = chrome.runtime.getURL('newtab.html');
  const existingTabs = await chrome.tabs.query({ url: newTabUrl });

  if (existingTabs.length > 0) {
    const targetTab = existingTabs[0];
    await chrome.tabs.update(targetTab.id, { active: true });
    if (targetTab.windowId) {
      await chrome.windows.update(targetTab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: newTabUrl });
  }
}

/**
 * Command listener for registered keyboard shortcuts.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-save') {
    await handleQuickSave();
  } else if (command === 'save-window') {
    await handleSaveWindowSession();
  } else if (command === 'open-board') {
    await handleOpenBoard();
  }
});

/**
 * Toolbar icon click listener.
 */
chrome.action.onClicked.addListener(async () => {
  const shards = await new Promise((resolve) =>
    chrome.storage.local.get('meta', resolve)
  );
  const action = shards.meta?.settings?.toolbarClickAction || 'save-tab';

  if (action === 'save-window') {
    await handleSaveWindowSession();
  } else if (action === 'open-board') {
    await handleOpenBoard();
  } else {
    // 'save-tab' (default)
    await handleQuickSave();
  }
});

/**
 * Context menu action listener.
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  await initStoreIfNeeded();

  const shards = await new Promise((resolve) =>
    chrome.storage.local.get('meta', resolve)
  );
  const activeWorkspaceId = shards.meta?.activeWorkspaceId || 'ws_default';

  if (info.menuItemId === 'mbt-save-page' && tab && tab.url) {
    await handleQuickSave();
  } else if (info.menuItemId === 'mbt-save-link' && info.linkUrl) {
    if (!isValidUrl(info.linkUrl)) return;
    const nurl = normalizeUrl(info.linkUrl);
    const host = extractHost(info.linkUrl);
    await saveCard({
      cardData: {
        title: host,
        url: info.linkUrl,
        nurl,
        host,
      },
      workspaceId: activeWorkspaceId,
      prepend: true,
    });
    showBadge('✓', '#22c55e');
  } else if (info.menuItemId === 'mbt-save-selection-note' && info.selectionText) {
    await saveCard({
      cardData: {
        type: 'note',
        title: info.selectionText.slice(0, 40) + (info.selectionText.length > 40 ? '…' : ''),
        body: info.selectionText,
      },
      workspaceId: activeWorkspaceId,
      prepend: true,
    });
    showBadge('✓', '#22c55e');
  }
});
