/**
 * Minimal Board Tab - New Tab Board Orchestrator
 * Pure vanilla ES2022 module. Zero dependencies.
 */

import {
  initStoreIfNeeded,
  deleteCard,
  undoLastAction,
  saveCard,
  CONTEXT_ID,
} from './lib/store.js';

performance.mark('mbt_init_start');

// State cache for current view
let currentMeta = null;
let currentLayout = null;
let currentCards = null;
let toastTimeout = null;

const boardContainer = document.getElementById('board-container');
const workspaceSwitcher = document.getElementById('workspace-switcher');
const toastContainer = document.getElementById('toast-container');
const settingsBtn = document.getElementById('settings-btn');
const addColumnBtn = document.getElementById('add-column-btn');

/**
 * Creates an image or letter-tile fallback element for a card's favicon.
 */
function createFaviconElement(url, host) {
  if (!url) {
    const tile = document.createElement('span');
    tile.className = 'card-tile-fallback';
    tile.textContent = '📄';
    return tile;
  }

  const img = document.createElement('img');
  img.className = 'card-favicon';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';

  // Use Chromium's internal local _favicon API
  const extensionId = chrome.runtime.id;
  img.src = `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;

  img.onerror = () => {
    // Replace failed image with crisp single-letter tile
    const tile = document.createElement('span');
    tile.className = 'card-tile-fallback';
    tile.textContent = host ? host.charAt(0).toUpperCase() : '?';
    if (img.parentNode) {
      img.parentNode.replaceChild(tile, img);
    }
  };

  return img;
}

/**
 * Displays a non-blocking toast message with an optional Undo action.
 * @param {string} message
 * @param {boolean} [showUndo=false]
 * @param {number} [durationMs=4000]
 */
function showToast(message, showUndo = false, durationMs = 4000) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  toastContainer.innerHTML = '';

  const toast = document.createElement('div');
  toast.className = 'toast';

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  if (showUndo) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'toast-undo-btn';
    undoBtn.textContent = 'Undo';
    undoBtn.addEventListener('click', async () => {
      await undoLastAction();
      toast.remove();
    });
    toast.appendChild(undoBtn);
  }

  toastContainer.appendChild(toast);

  toastTimeout = setTimeout(() => {
    toast.remove();
    toastTimeout = null;
  }, durationMs);
}

/**
 * Renders the top workspace switcher pills.
 */
function renderWorkspaceTabs(meta) {
  workspaceSwitcher.innerHTML = '';
  const workspaces = meta.workspaces || [];

  for (const ws of workspaces) {
    const tabBtn = document.createElement('button');
    tabBtn.className = `ws-tab ${ws.id === meta.activeWorkspaceId ? 'active' : ''}`;
    tabBtn.dataset.wsId = ws.id;

    const icon = document.createElement('span');
    icon.textContent = ws.icon || '⚡';
    tabBtn.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = ws.name;
    tabBtn.appendChild(name);

    tabBtn.addEventListener('click', async () => {
      if (ws.id === meta.activeWorkspaceId) return;
      meta.activeWorkspaceId = ws.id;
      await chrome.storage.local.set({ meta });
    });

    workspaceSwitcher.appendChild(tabBtn);
  }
}

/**
 * Builds a single card DOM element.
 */
function createCardElement(card, workspaceId) {
  const cardEl = document.createElement('article');
  cardEl.className = 'card';
  cardEl.dataset.cardId = card.id;
  cardEl.tabIndex = 0;

  const main = document.createElement('div');
  main.className = 'card-main';

  // Favicon
  const faviconEl = createFaviconElement(card.url, card.host);
  main.appendChild(faviconEl);

  // Content
  const content = document.createElement('div');
  content.className = 'card-content';

  const titleLink = document.createElement('a');
  titleLink.className = 'card-title';
  titleLink.textContent = card.title || card.host || card.url || 'Untitled';
  titleLink.title = card.title || '';
  if (card.url) {
    titleLink.href = card.url;
    titleLink.target = currentMeta?.settings?.openLinksInNewTab !== false ? '_blank' : '_self';
    titleLink.rel = 'noopener noreferrer';
  }
  content.appendChild(titleLink);

  const metaRow = document.createElement('div');
  metaRow.className = 'card-meta';

  if (card.host) {
    const hostSpan = document.createElement('span');
    hostSpan.className = 'card-host';
    hostSpan.textContent = card.host;
    metaRow.appendChild(hostSpan);
  }

  content.appendChild(metaRow);

  if (card.body || card.note) {
    const notePreview = document.createElement('div');
    notePreview.className = 'card-note-preview';
    notePreview.textContent = card.body || card.note;
    content.appendChild(notePreview);
  }

  main.appendChild(content);
  cardEl.appendChild(main);

  // Hover Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  // Copy URL
  if (card.url) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'card-action-btn';
    copyBtn.title = 'Copy URL';
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(card.url);
      showToast('URL copied to clipboard');
    });
    actions.appendChild(copyBtn);
  }

  // Delete Card (with Undo)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'card-action-btn delete-btn';
  deleteBtn.title = 'Delete card (Delete)';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await deleteCard(card.id, workspaceId);
    showToast('Bookmark deleted', true, 4000);
  });
  actions.appendChild(deleteBtn);

  cardEl.appendChild(actions);

  // Card click navigation
  cardEl.addEventListener('click', (e) => {
    if (e.target.closest('.card-action-btn')) return;
    if (card.url) {
      if (e.ctrlKey || e.metaKey || currentMeta?.settings?.openLinksInNewTab !== false) {
        window.open(card.url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = card.url;
      }
    }
  });

  return cardEl;
}

/**
 * Builds a column DOM element with its cards.
 */
function createColumnElement(col, cardsMap, workspaceId) {
  const colEl = document.createElement('section');
  colEl.className = 'column';
  colEl.dataset.colId = col.id;

  // Header
  const header = document.createElement('header');
  header.className = 'column-header';

  const left = document.createElement('div');
  left.className = 'col-header-left';

  const emoji = document.createElement('span');
  emoji.className = 'col-emoji';
  emoji.textContent = col.emoji || '📌';
  left.appendChild(emoji);

  const title = document.createElement('h2');
  title.className = 'col-title';
  title.textContent = col.title;
  left.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'col-badge';
  badge.textContent = String(col.cardIds?.length || 0);
  left.appendChild(badge);

  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'col-header-right';

  // Add Link button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-icon';
  addBtn.title = 'Add Link to this column';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', async () => {
    const url = prompt('Enter link URL:');
    if (!url) return;
    try {
      await saveCard({
        cardData: {
          title: url,
          url,
          nurl: url.toLowerCase(),
          host: new URL(url).hostname.replace(/^www\./i, ''),
        },
        workspaceId,
        targetColumnId: col.id,
        prepend: false,
      });
    } catch {
      showToast('Invalid URL', false);
    }
  });
  right.appendChild(addBtn);

  header.appendChild(right);
  colEl.appendChild(header);

  // Cards List
  const list = document.createElement('div');
  list.className = 'cards-list';

  const cardIds = col.cardIds || [];
  if (cardIds.length === 0) {
    const emptyHint = document.createElement('div');
    emptyHint.className = 'empty-column-hint';
    if (col.system === 'inbox') {
      emptyHint.innerHTML = 'Press <kbd>Alt+Shift+S</kbd> on any tab to save here.';
    } else {
      emptyHint.textContent = 'No cards yet. Drop tabs or click + above.';
    }
    list.appendChild(emptyHint);
  } else {
    for (const cardId of cardIds) {
      const card = cardsMap[cardId];
      if (card) {
        list.appendChild(createCardElement(card, workspaceId));
      }
    }
  }

  colEl.appendChild(list);
  return colEl;
}

/**
 * Renders the entire kanban board for the active workspace.
 */
function renderBoard(layout, cardsMap, workspaceId) {
  const fragment = document.createDocumentFragment();
  const columnOrder = layout.columnOrder || [];

  for (const colId of columnOrder) {
    const col = layout.columns[colId];
    if (col) {
      fragment.appendChild(createColumnElement(col, cardsMap, workspaceId));
    }
  }

  boardContainer.innerHTML = '';
  boardContainer.appendChild(fragment);
}

/**
 * Loads and renders the board from storage shards.
 */
async function loadAndRender() {
  await initStoreIfNeeded();

  const metaShard = await new Promise((res) => chrome.storage.local.get('meta', res));
  currentMeta = metaShard.meta;
  const activeWsId = currentMeta.activeWorkspaceId || 'ws_default';

  renderWorkspaceTabs(currentMeta);

  const wsShards = await new Promise((res) =>
    chrome.storage.local.get([`ws:${activeWsId}`, `cards:${activeWsId}`], res)
  );

  currentLayout = wsShards[`ws:${activeWsId}`];
  currentCards = wsShards[`cards:${activeWsId}`] || {};

  if (currentLayout) {
    renderBoard(currentLayout, currentCards, activeWsId);
  }

  performance.mark('mbt_init_end');
  performance.measure('mbt_board_first_paint', 'mbt_init_start', 'mbt_init_end');
}

/**
 * Reactive updates via chrome.storage.onChanged.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  // Ignore echo events written by this context
  if (changes.meta?.newValue?.lastWriter === CONTEXT_ID) {
    return;
  }

  const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
  const wsKey = `ws:${activeWsId}`;
  const cardsKey = `cards:${activeWsId}`;

  // If meta changed (e.g. active workspace or workspaces list)
  if (changes.meta) {
    currentMeta = changes.meta.newValue;
    renderWorkspaceTabs(currentMeta);
  }

  // If active workspace's layout or cards changed
  if (changes[wsKey] || changes[cardsKey] || changes.meta) {
    loadAndRender();
  }
});

// Settings & Options trigger
settingsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

// Add column trigger
addColumnBtn.addEventListener('click', async () => {
  const title = prompt('Enter new column title:');
  if (!title) return;

  const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
  const wsKey = `ws:${activeWsId}`;
  const colId = `col_${Date.now()}`;

  const shards = await new Promise((res) => chrome.storage.local.get(wsKey, res));
  const layout = shards[wsKey];
  if (!layout) return;

  layout.columnOrder.push(colId);
  layout.columns[colId] = {
    id: colId,
    title,
    color: '#3b82f6',
    emoji: '📌',
    collapsed: false,
    sort: 'manual',
    cardIds: [],
  };

  await chrome.storage.local.set({ [wsKey]: layout });
  showToast(`Column "${title}" created`);
});

// Keyboard shortcuts for New Tab page
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  // Search trigger: / or Ctrl/Cmd+K
  if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    document.getElementById('search-trigger-btn').click();
  }

  // Workspace cycling: [ and ]
  if (e.key === '[' || e.key === ']') {
    const workspaces = currentMeta?.workspaces || [];
    if (workspaces.length <= 1) return;
    const currentIdx = workspaces.findIndex((w) => w.id === currentMeta.activeWorkspaceId);
    let nextIdx = e.key === ']' ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx >= workspaces.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = workspaces.length - 1;
    const nextWs = workspaces[nextIdx];
    currentMeta.activeWorkspaceId = nextWs.id;
    chrome.storage.local.set({ meta: currentMeta });
  }

  // New column shortcut: Shift+N
  if (e.shiftKey && e.key === 'N') {
    e.preventDefault();
    addColumnBtn.click();
  }
});

// Initial boot
loadAndRender();
