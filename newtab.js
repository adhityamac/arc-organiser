/**
 * Minimal Board Tab - New Tab Board Orchestrator
 * Pure vanilla ES2022 module. Zero dependencies.
 */

import {
  initStoreIfNeeded,
  deleteCard,
  undoLastAction,
  saveCard,
  transaction,
  CONTEXT_ID,
} from './lib/store.js';
import { initDragAndDrop, handleKeyboardReorder } from './lib/dnd.js';
import {
  openCardEditModal,
  openAddLinkModal,
  openAddNoteModal,
  openColumnSettingsModal,
  openMoveModal,
} from './lib/ui/modal.js';
import { renderMarkdownLite } from './lib/ui/markdown.js';
import { openCommandPalette } from './lib/ui/palette.js';
import { toggleTabDrawer } from './lib/ui/drawer.js';
import { mountWidgets } from './lib/ui/widgets.js';
import { openTriageMode } from './lib/ui/triage.js';
import { getBlob } from './lib/db.js';

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
const searchTriggerBtn = document.getElementById('search-trigger-btn');
const drawerToggleBtn = document.getElementById('drawer-toggle-btn');
const widgetsContainer = document.getElementById('widgets-container');
const wallpaperLayer = document.getElementById('wallpaper-layer');
const triageTriggerBtn = document.getElementById('triage-trigger-btn');
const viewModeBtn = document.getElementById('view-mode-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');

function triggerSearchPalette() {
  openCommandPalette({
    cards: Object.values(currentCards || {}),
    meta: currentMeta,
    onNavigate: loadAndRender,
    showToast,
  });
}

function triggerTriage() {
  const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
  openTriageMode({
    workspaceId: activeWsId,
    layout: currentLayout,
    cards: currentCards,
    onComplete: loadAndRender,
    showToast,
  });
}

if (triageTriggerBtn) {
  triageTriggerBtn.addEventListener('click', triggerTriage);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  if (themeToggleBtn) {
    if (theme === 'light') {
      themeToggleBtn.innerHTML = `<svg class="theme-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
      themeToggleBtn.title = 'Switch to Dark Theme';
    } else {
      themeToggleBtn.innerHTML = `<svg class="theme-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
      themeToggleBtn.title = 'Switch to Light Theme';
    }
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', async () => {
    const currentTheme = currentMeta?.settings?.theme || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.theme = nextTheme;
    applyTheme(nextTheme);
    await chrome.storage.local.set({ meta: currentMeta });
  });
}

function applyViewMode(mode) {
  if (mode === 'list') {
    boardContainer.classList.add('view-mode-list');
    if (viewModeBtn) {
      viewModeBtn.innerHTML = `<svg class="view-mode-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
      viewModeBtn.title = 'Switch to Board View';
    }
  } else {
    boardContainer.classList.remove('view-mode-list');
    if (viewModeBtn) {
      viewModeBtn.innerHTML = `<svg class="view-mode-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
      viewModeBtn.title = 'Switch to List View';
    }
  }
}

if (viewModeBtn) {
  viewModeBtn.addEventListener('click', async () => {
    const currentMode = currentMeta?.settings?.viewMode || 'board';
    const nextMode = currentMode === 'board' ? 'list' : 'board';
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.viewMode = nextMode;
    applyViewMode(nextMode);
    await chrome.storage.local.set({ meta: currentMeta });
  });
}

async function applyWallpaper(settings) {
  if (!wallpaperLayer) return;
  const wp = settings?.wallpaper;
  const dim = settings?.wallpaperDim ?? 40;
  const blur = settings?.wallpaperBlur ?? 0;

  wallpaperLayer.style.opacity = `${(100 - dim) / 100}`;
  wallpaperLayer.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';

  if (!wp || wp === 'none') {
    wallpaperLayer.style.backgroundImage = 'none';
  } else if (wp.startsWith('gradient:')) {
    const gradients = {
      'gradient:sunset': 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #701a75 100%)',
      'gradient:space': 'linear-gradient(135deg, #09090b 0%, #172554 50%, #030712 100%)',
      'gradient:nordic': 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      'gradient:violet': 'linear-gradient(135deg, #2e1065 0%, #3b0764 50%, #0f172a 100%)',
    };
    wallpaperLayer.style.backgroundImage = gradients[wp] || 'none';
  } else if (wp === 'custom') {
    try {
      const blob = await getBlob('wallpaper_custom');
      if (blob) {
        wallpaperLayer.style.backgroundImage = `url(${URL.createObjectURL(blob)})`;
      }
    } catch {
      wallpaperLayer.style.backgroundImage = 'none';
    }
  }
}

searchTriggerBtn.addEventListener('click', triggerSearchPalette);

if (drawerToggleBtn) {
  drawerToggleBtn.addEventListener('click', () => {
    toggleTabDrawer(
      () => currentMeta?.activeWorkspaceId || 'ws_default',
      showToast,
      loadAndRender
    );
  });
}

/**
 * Creates an image or letter-tile fallback element for a card's favicon,
 * framed within an Apple/Linear style squircle badge.
 */
function createFaviconElement(url, host) {
  const wrap = document.createElement('div');
  wrap.className = 'card-favicon-wrap';

  if (!url) {
    const tile = document.createElement('span');
    tile.className = 'card-tile-fallback';
    tile.textContent = '📄';
    wrap.appendChild(tile);
    return wrap;
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

  wrap.appendChild(img);
  return wrap;
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
  cardEl.draggable = true;
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
    notePreview.innerHTML = renderMarkdownLite(card.body || card.note);
    content.appendChild(notePreview);
  }

  // Tag pills
  if (Array.isArray(card.tags) && card.tags.length > 0) {
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'card-tags';
    for (const tag of card.tags) {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = `#${tag}`;
      tagsContainer.appendChild(pill);
    }
    content.appendChild(tagsContainer);
  }

  main.appendChild(content);
  cardEl.appendChild(main);

  // Hover Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  // Edit Card
  const editBtn = document.createElement('button');
  editBtn.className = 'card-action-btn';
  editBtn.title = 'Edit card (e)';
  editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openCardEditModal({
      card,
      workspaceId,
      layout: currentLayout,
      meta: currentMeta,
      onSave: loadAndRender,
    });
  });
  actions.appendChild(editBtn);

  // Copy URL
  if (card.url) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'card-action-btn';
    copyBtn.title = 'Copy URL';
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
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
  deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
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

  const handle = document.createElement('span');
  handle.className = 'col-drag-handle';
  handle.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`;
  handle.draggable = true;
  handle.title = 'Drag to reorder column';
  left.appendChild(handle);

  const emoji = document.createElement('span');
  emoji.className = 'col-emoji';
  emoji.textContent = col.emoji || '📌';
  left.appendChild(emoji);

  const title = document.createElement('h2');
  title.className = 'col-title';
  title.textContent = col.title;
  title.title = 'Double-click to rename';

  // Inline rename (FR-2.2)
  title.addEventListener('dblclick', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'col-title-inline-edit';
    input.value = col.title;
    title.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newTitle = input.value.trim() || col.title;
      const wsKey = `ws:${workspaceId}`;
      await transaction([wsKey], (shards) => {
        const l = shards[wsKey];
        if (l.columns[col.id]) l.columns[col.id].title = newTitle;
        return { [wsKey]: l };
      });
      loadAndRender();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        committed = true;
        input.replaceWith(title);
      }
    });
  });

  left.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'col-badge';
  badge.textContent = String(col.cardIds?.length || 0);
  left.appendChild(badge);

  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'col-header-right';

  // Add Note button (FR-4.5)
  const noteBtn = document.createElement('button');
  noteBtn.className = 'btn-icon';
  noteBtn.title = 'Add Note to this column';
  noteBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
  noteBtn.addEventListener('click', () => {
    openAddNoteModal({ workspaceId, columnId: col.id, onAdded: loadAndRender });
  });
  right.appendChild(noteBtn);

  // Add Link button (FR-4.3)
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-icon';
  addBtn.title = 'Add Link(s) to this column';
  addBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  addBtn.addEventListener('click', () => {
    openAddLinkModal({ workspaceId, columnId: col.id, onAdded: loadAndRender });
  });
  right.appendChild(addBtn);

  // Column Options button (FR-2.2, FR-2.5)
  const colOptionsBtn = document.createElement('button');
  colOptionsBtn.className = 'btn-icon';
  colOptionsBtn.title = 'Column options & actions';
  colOptionsBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
  colOptionsBtn.addEventListener('click', () => {
    openColumnSettingsModal({
      col,
      workspaceId,
      layout: currentLayout,
      onUpdate: loadAndRender,
    });
  });
  right.appendChild(colOptionsBtn);

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

  applyTheme(currentMeta.settings?.theme || 'dark');
  applyViewMode(currentMeta.settings?.viewMode || 'board');
  applyWallpaper(currentMeta.settings);

  if (currentLayout) {
    renderBoard(currentLayout, currentCards, activeWsId);
  }

  // Mount widgets asynchronously (FR-7.3)
  setTimeout(() => {
    mountWidgets(widgetsContainer, {
      meta: currentMeta,
      cards: currentCards,
      layout: currentLayout,
      onTriggerTriage: triggerTriage,
      onSaveSettings: async (key, val) => {
        currentMeta.settings = currentMeta.settings || {};
        currentMeta.settings[key] = val;
        await chrome.storage.local.set({ meta: currentMeta });
      },
    });
  }, 30);

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
    triggerSearchPalette();
  }

  // Triage review shortcut: 'r' (FR-8.1)
  if (e.key === 'r' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    triggerTriage();
  }

  // Toggle Tab Drawer: 't' (FR-5.9)
  if (e.key === 't' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    toggleTabDrawer(
      () => currentMeta?.activeWorkspaceId || 'ws_default',
      showToast,
      loadAndRender
    );
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

  // Edit card shortcut: 'e' on focused card
  if (e.key === 'e' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const focusedCard = document.activeElement?.closest('.card');
    if (focusedCard) {
      const cardId = focusedCard.dataset.cardId;
      const card = currentCards && currentCards[cardId];
      if (card) {
        e.preventDefault();
        openCardEditModal({
          card,
          workspaceId: currentMeta?.activeWorkspaceId || 'ws_default',
          layout: currentLayout,
          meta: currentMeta,
          onSave: loadAndRender,
        });
      }
    }
  }

  // Keyboard reordering alternative (Alt+Arrows, m)
  handleKeyboardReorder(
    e,
    currentMeta?.activeWorkspaceId || 'ws_default',
    showToast,
    (cardId, wsId) => openMoveModal(cardId, wsId, currentLayout, currentMeta, loadAndRender)
  );
});

// Initialize Drag and Drop engine
initDragAndDrop(
  boardContainer,
  () => currentMeta?.activeWorkspaceId || 'ws_default',
  showToast
);

// Initial boot
loadAndRender();
