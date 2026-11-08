/**
 * Minimal Board Tab - New Tab Board Orchestrator (Markmez Zen Layout)
 * Pure vanilla ES2022 module. Zero dependencies.
 */

import {
  initStoreIfNeeded,
  deleteCard,
  undoLastAction,
  saveCard,
  transaction,
  createDefaultMeta,
  createDefaultWorkspaceLayout,
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
import {
  mountTopBarWidgets,
  createPomodoroCardElement,
  createCalendarCardElement,
} from './lib/ui/widgets.js';
import { openTriageMode } from './lib/ui/triage.js';
import { getBlob } from './lib/db.js';
import { mountLiveWallpaper, unmountLiveWallpaper } from './lib/ui/live-wallpaper.js';
import { openWallpaperModal } from './lib/ui/wallpaper-modal.js';

performance.mark('mbt_init_start');

// State cache for current view
let currentMeta = null;
let currentLayout = null;
let currentCards = null;
let toastTimeout = null;

const boardContainer = document.getElementById('board-container');
const workspaceSwitcher = document.getElementById('workspace-switcher');
const toastContainer = document.getElementById('toast-container');
const wallpaperLayer = document.getElementById('wallpaper-layer');
const topWidgetsContainer = document.getElementById('top-widgets-container');
const mainSearchInput = document.getElementById('main-search-input');
const googleSearchBtn = document.getElementById('google-search-btn');
const floatingMenuBtn = document.getElementById('floating-menu-btn');
const floatingSettingsBtn = document.getElementById('floating-settings-btn');
const floatingWallpaperBtn = document.getElementById('floating-wallpaper-btn');
const quickMenuPopover = document.getElementById('quick-menu-popover');

// Glass UI: Column color palette for subtle tinting
const COLUMN_COLORS = ['pink', 'sage', 'cream', 'amber', 'lavender', 'sky', 'rose', 'mint'];

function triggerWallpaperModal() {
  const activeWs = (currentMeta?.workspaces || []).find((w) => w.id === currentMeta?.activeWorkspaceId);
  openWallpaperModal({
    meta: currentMeta,
    activeWorkspaceId: currentMeta?.activeWorkspaceId,
    onApplyWallpaper: (settings) => applyWallpaper(settings, activeWs),
    showToast,
  });
}

function triggerSearchPalette() {
  openCommandPalette({
    cards: Object.values(currentCards || {}),
    meta: currentMeta,
    onNavigate: loadAndRender,
    showToast,
    onOpenWallpaperModal: triggerWallpaperModal,
    onApplyWallpaper: (settings) => {
      const activeWs = (currentMeta?.workspaces || []).find((w) => w.id === currentMeta?.activeWorkspaceId);
      applyWallpaper(settings, activeWs);
    },
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

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function applyViewMode(mode) {
  if (mode === 'list') {
    boardContainer.classList.add('view-mode-list');
  } else {
    boardContainer.classList.remove('view-mode-list');
  }
}

async function applyWallpaper(settings, activeWs) {
  if (!wallpaperLayer) return;

  const isWsOverridden = Boolean(activeWs?.wallpaper);
  const wp = isWsOverridden ? activeWs.wallpaper : (settings?.wallpaper || 'preset:mountain');
  const dim = isWsOverridden
    ? (activeWs.wallpaperDim ?? 15)
    : (settings?.wallpaperDim ?? (wp === 'preset:forest' ? 15 : 10));
  const blur = isWsOverridden
    ? (activeWs.wallpaperBlur ?? 0)
    : (settings?.wallpaperBlur ?? 0);
  const ecoMode = Boolean(settings?.wallpaperEcoMode);

  wallpaperLayer.style.opacity = `${(100 - dim) / 100}`;
  wallpaperLayer.style.filter = blur > 0 ? `blur(${blur}px)` : 'none';

  // Revoke previous custom object URL to prevent memory leaks
  if (wallpaperLayer._currentObjectUrl) {
    try {
      URL.revokeObjectURL(wallpaperLayer._currentObjectUrl);
    } catch {}
    wallpaperLayer._currentObjectUrl = null;
  }

  // 1. Procedural Live Shaders (Aurora, Cosmos, Bokeh, Waves)
  if (wp && wp.startsWith('live:')) {
    wallpaperLayer.style.backgroundImage = 'none';
    const shaderType = wp.replace('live:', '');
    mountLiveWallpaper(wallpaperLayer, { type: shaderType, ecoMode });
    return;
  }

  // 2. Custom Live Video
  if (wp === 'custom:video') {
    wallpaperLayer.style.backgroundImage = 'none';
    try {
      const blob = await getBlob('wallpaper_custom');
      if (blob) {
        const objUrl = URL.createObjectURL(blob);
        wallpaperLayer._currentObjectUrl = objUrl;
        mountLiveWallpaper(wallpaperLayer, { type: 'video', src: objUrl });
        return;
      }
    } catch (e) {
      console.warn('Failed to load video wallpaper blob', e);
    }
  }

  // 3. Streaming / Direct External URL
  if (wp && wp.startsWith('url:')) {
    const rawUrl = wp.slice(4);
    const isVideo = /\.(mp4|webm|ogv)(\?.*)?$/i.test(rawUrl);
    if (isVideo) {
      wallpaperLayer.style.backgroundImage = 'none';
      mountLiveWallpaper(wallpaperLayer, { type: 'video', src: rawUrl });
      return;
    } else {
      unmountLiveWallpaper();
      wallpaperLayer.style.backgroundImage = `url('${rawUrl}')`;
      wallpaperLayer.style.backgroundSize = 'cover';
      wallpaperLayer.style.backgroundPosition = 'center';
      return;
    }
  }

  // 4. Custom Image / GIF
  if (wp === 'custom:image' || wp === 'custom') {
    try {
      const blob = await getBlob('wallpaper_custom');
      if (blob) {
        if (blob.type && blob.type.startsWith('video/')) {
          wallpaperLayer.style.backgroundImage = 'none';
          const objUrl = URL.createObjectURL(blob);
          wallpaperLayer._currentObjectUrl = objUrl;
          mountLiveWallpaper(wallpaperLayer, { type: 'video', src: objUrl });
          return;
        }
        unmountLiveWallpaper();
        const objUrl = URL.createObjectURL(blob);
        wallpaperLayer._currentObjectUrl = objUrl;
        wallpaperLayer.style.backgroundImage = `url(${objUrl})`;
        wallpaperLayer.style.backgroundSize = 'cover';
        wallpaperLayer.style.backgroundPosition = 'center';
        return;
      }
    } catch {
      wallpaperLayer.style.backgroundImage = 'none';
    }
  }

  // 5. Static Wallpapers & SVG Presets
  unmountLiveWallpaper();

  if (!wp || wp === 'none') {
    wallpaperLayer.style.backgroundImage = 'none';
  } else if (wp === 'preset:mountain') {
    wallpaperLayer.style.backgroundImage = `url('wallpapers/mountain.svg')`;
    wallpaperLayer.style.backgroundSize = 'cover';
    wallpaperLayer.style.backgroundPosition = 'center';
  } else if (wp === 'preset:forest') {
    wallpaperLayer.style.backgroundImage = `url('wallpapers/forest.svg')`;
    wallpaperLayer.style.backgroundSize = 'cover';
    wallpaperLayer.style.backgroundPosition = 'center';
  } else if (wp === 'preset:inkwash') {
    wallpaperLayer.style.backgroundImage = `url('wallpapers/inkwash.svg')`;
    wallpaperLayer.style.backgroundSize = 'cover';
    wallpaperLayer.style.backgroundPosition = 'center';
  } else if (wp.startsWith('gradient:')) {
    const gradients = {
      'gradient:aurora': 'radial-gradient(at 15% 20%, rgba(99, 102, 241, 0.45) 0px, transparent 55%), radial-gradient(at 85% 15%, rgba(236, 72, 153, 0.4) 0px, transparent 55%), radial-gradient(at 50% 90%, rgba(14, 165, 233, 0.35) 0px, transparent 60%), radial-gradient(at 80% 80%, rgba(168, 85, 247, 0.38) 0px, transparent 50%), radial-gradient(at 20% 80%, rgba(16, 185, 129, 0.3) 0px, transparent 50%), linear-gradient(180deg, #0b0f19 0%, #05070d 100%)',
      'gradient:mist': 'radial-gradient(at 80% 25%, rgba(148, 163, 184, 0.35) 0px, transparent 50%), radial-gradient(at 20% 80%, rgba(203, 213, 225, 0.25) 0px, transparent 55%), linear-gradient(180deg, #181d28 0%, #0e121a 100%)',
      'gradient:clouds': 'radial-gradient(at 85% 30%, rgba(254, 215, 170, 0.45) 0px, transparent 50%), radial-gradient(at 20% 60%, rgba(186, 230, 253, 0.5) 0px, transparent 60%), linear-gradient(180deg, #38bdf8 0%, #818cf8 50%, #f472b6 100%)',
      'gradient:sunset': 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #701a75 100%)',
      'gradient:space': 'linear-gradient(135deg, #09090b 0%, #172554 50%, #030712 100%)',
      'gradient:nordic': 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      'gradient:violet': 'linear-gradient(135deg, #2e1065 0%, #3b0764 50%, #0f172a 100%)',
    };
    wallpaperLayer.style.backgroundImage = gradients[wp] || 'none';
  } else if (wp.startsWith('gradient-')) {
    const gradients = {
      'gradient-aurora': 'radial-gradient(circle at 20% 20%, #1e1b4b 0%, #0f172a 50%, #020617 100%)',
      'gradient-dusk': 'linear-gradient(135deg, #2e1065 0%, #172554 50%, #020617 100%)',
      'gradient-forest': 'radial-gradient(circle at 80% 20%, #064e3b 0%, #0f172a 60%, #020617 100%)',
      'gradient-editorial': 'linear-gradient(180deg, #fdfbf7 0%, #f1efe7 100%)',
    };
    wallpaperLayer.style.backgroundImage = gradients[wp] || 'none';
  }
}

// Search Bar Interactions
function handleSearchAction(query) {
  if (!query || !query.trim()) return;
  const q = query.trim();

  // If looks like URL
  if (/^https?:\/\//i.test(q) || (q.includes('.') && !q.includes(' '))) {
    window.location.href = q.startsWith('http') ? q : `https://${q}`;
  } else {
    // Navigate via Google search or open internal palette
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
}

if (mainSearchInput) {
  mainSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSearchAction(mainSearchInput.value);
    } else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      triggerSearchPalette();
    }
  });

  mainSearchInput.addEventListener('click', () => {
    // Focus search input
  });
}

if (googleSearchBtn) {
  googleSearchBtn.addEventListener('click', () => {
    const val = mainSearchInput?.value?.trim();
    if (val) {
      handleSearchAction(val);
    } else {
      triggerSearchPalette();
    }
  });
}

const searchIconSvg = document.querySelector('.search-icon-svg');
if (searchIconSvg) {
  searchIconSvg.style.cursor = 'pointer';
  searchIconSvg.setAttribute('title', 'Search saved bookmarks (Ctrl+K)');
  searchIconSvg.addEventListener('click', triggerSearchPalette);
}

// Floating Circular Buttons (Bottom-Right)
if (floatingSettingsBtn) {
  floatingSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html');
    }
  });
}

if (floatingMenuBtn && quickMenuPopover) {
  floatingMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = quickMenuPopover.style.display !== 'none';
    quickMenuPopover.style.display = isVisible ? 'none' : 'flex';
  });

  document.addEventListener('click', (e) => {
    if (!quickMenuPopover.contains(e.target) && e.target !== floatingMenuBtn) {
      quickMenuPopover.style.display = 'none';
    }
  });

  // Quick Menu Action Bindings
  const menuAddCol = document.getElementById('menu-add-column');
  if (menuAddCol) {
    menuAddCol.addEventListener('click', async () => {
      quickMenuPopover.style.display = 'none';
      const title = prompt('Enter new column title:');
      if (!title || !title.trim()) return;
      const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
      const wsKey = `ws:${activeWsId}`;
      const colId = `col_${Date.now()}`;
      await transaction([wsKey], (shards) => {
        const layout = shards[wsKey];
        layout.columnOrder.push(colId);
        layout.columns[colId] = {
          id: colId,
          title: title.trim(),
          color: '#556b2f',
          emoji: '📌',
          collapsed: false,
          sort: 'manual',
          cardIds: [],
        };
        return { [wsKey]: layout };
      });
      loadAndRender();
    });
  }

  const menuTriage = document.getElementById('menu-triage');
  if (menuTriage) {
    menuTriage.addEventListener('click', () => {
      quickMenuPopover.style.display = 'none';
      triggerTriage();
    });
  }

  const menuDrawer = document.getElementById('menu-tabs-drawer');
  if (menuDrawer) {
    menuDrawer.addEventListener('click', () => {
      quickMenuPopover.style.display = 'none';
      toggleTabDrawer(
        () => currentMeta?.activeWorkspaceId || 'ws_default',
        showToast,
        loadAndRender
      );
    });
  }

  const menuTheme = document.getElementById('menu-theme-toggle');
  if (menuTheme) {
    menuTheme.addEventListener('click', async () => {
      quickMenuPopover.style.display = 'none';
      const currentTheme = currentMeta?.settings?.theme || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      currentMeta.settings = currentMeta.settings || {};
      currentMeta.settings.theme = nextTheme;
      applyTheme(nextTheme);
      await chrome.storage.local.set({ meta: currentMeta });
    });
  }

  if (floatingWallpaperBtn) {
    floatingWallpaperBtn.addEventListener('click', triggerWallpaperModal);
  }

  async function setWallpaperPreset(wp) {
    quickMenuPopover.style.display = 'none';
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.wallpaper = wp;
    const activeWs = (currentMeta.workspaces || []).find((w) => w.id === currentMeta.activeWorkspaceId);
    applyWallpaper(currentMeta.settings, activeWs);
    await chrome.storage.local.set({ meta: currentMeta });
    showToast(`Wallpaper changed to ${wp.replace('preset:', '').replace('live:', 'Live ')}`);
  }

  document.getElementById('menu-wallpaper-gallery')?.addEventListener('click', () => {
    quickMenuPopover.style.display = 'none';
    triggerWallpaperModal();
  });

  document.getElementById('menu-wallpaper-mountain')?.addEventListener('click', () => setWallpaperPreset('preset:mountain'));
  document.getElementById('menu-wallpaper-forest')?.addEventListener('click', () => setWallpaperPreset('preset:forest'));
  document.getElementById('menu-wallpaper-inkwash')?.addEventListener('click', () => setWallpaperPreset('preset:inkwash'));

  document.getElementById('menu-settings')?.addEventListener('click', () => {
    quickMenuPopover.style.display = 'none';
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open('options.html');
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
 * Renders the top workspace switcher pills (Home, Projects, +)
 */
function renderWorkspaceTabs(meta) {
  if (!workspaceSwitcher) return;
  workspaceSwitcher.innerHTML = '';
  let workspaces = meta?.workspaces;
  if (!workspaces || workspaces.length === 0) {
    workspaces = [
      { id: 'ws_default', name: 'Home', icon: '🏠', order: 0 },
      { id: 'ws_projects', name: 'Projects', icon: '💼', order: 1 },
    ];
    if (meta) meta.workspaces = workspaces;
  }

  for (const ws of workspaces) {
    const isActive = ws.id === (meta?.activeWorkspaceId || 'ws_default');
    const tabBtn = document.createElement('button');
    tabBtn.className = `ws-tab ${isActive ? 'active' : ''}`;
    tabBtn.dataset.wsId = ws.id;
    tabBtn.setAttribute('role', 'tab');
    tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tabBtn.setAttribute('aria-label', `Workspace: ${ws.name}`);

    const name = document.createElement('span');
    name.textContent = ws.name || 'Home';
    tabBtn.appendChild(name);

    tabBtn.addEventListener('click', async () => {
      if (ws.id === meta.activeWorkspaceId) return;
      meta.activeWorkspaceId = ws.id;
      await chrome.storage.local.set({ meta });
      loadAndRender();
    });

    workspaceSwitcher.appendChild(tabBtn);
  }

  // "+" Add Workspace Button
  const addWsBtn = document.createElement('button');
  addWsBtn.className = 'ws-tab ws-tab-add';
  addWsBtn.title = 'Create new workspace';
  addWsBtn.setAttribute('aria-label', 'Create new workspace');
  addWsBtn.innerHTML = `+`;
  addWsBtn.addEventListener('click', async () => {
    const name = prompt('Enter new workspace name:');
    if (!name || !name.trim()) return;
    const newWsId = `ws_${Date.now()}`;
    meta.workspaces = meta.workspaces || [];
    meta.workspaces.push({
      id: newWsId,
      parentId: null,
      name: name.trim(),
      icon: '📂',
      order: meta.workspaces.length,
    });
    meta.activeWorkspaceId = newWsId;
    await chrome.storage.local.set({ meta });
    loadAndRender();
  });
  workspaceSwitcher.appendChild(addWsBtn);
}

/**
 * Builds a single bookmark card DOM element.
 */
function createCardElement(card, workspaceId) {
  const cardEl = document.createElement('article');
  cardEl.className = 'card';
  cardEl.dataset.cardId = card.id;
  cardEl.draggable = true;
  cardEl.tabIndex = 0;

  const main = document.createElement('div');
  main.className = 'card-main';

  // Left icon badge
  main.appendChild(createFaviconElement(card.url, card.host));

  // Content block
  const content = document.createElement('div');
  content.className = 'card-content';

  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';

  const titleSpan = document.createElement('span');
  titleSpan.className = 'card-title';
  titleSpan.textContent = card.title || card.host || 'Untitled';
  titleSpan.title = card.title || card.url;
  titleRow.appendChild(titleSpan);

  content.appendChild(titleRow);

  main.appendChild(content);
  cardEl.appendChild(main);

  // Hover Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  // Edit Card
  const editBtn = document.createElement('button');
  editBtn.className = 'card-action-btn';
  editBtn.title = 'Edit card (e)';
  editBtn.setAttribute('aria-label', 'Edit card');
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
    copyBtn.setAttribute('aria-label', 'Copy card URL');
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
  deleteBtn.setAttribute('aria-label', 'Delete card');
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
 * Builds a category column DOM element with its cards.
 */
function createColumnElement(col, cardsMap, workspaceId, layout) {
  const colEl = document.createElement('section');
  colEl.className = 'column';
  colEl.dataset.colId = col.id;

  const colIndex = layout?.columnOrder ? layout.columnOrder.indexOf(col.id) : 0;
  const colColor = col.color_tint || COLUMN_COLORS[(colIndex >= 0 ? colIndex : 0) % COLUMN_COLORS.length];
  colEl.dataset.color = colColor;

  // Header
  const header = document.createElement('header');
  header.className = 'column-header';

  const left = document.createElement('div');
  left.className = 'col-header-left';

  const title = document.createElement('h2');
  title.className = 'col-title';
  title.textContent = col.title;
  title.title = 'Double-click to rename';
  title.tabIndex = 0;
  title.setAttribute('role', 'button');

  // Inline rename
  const startRename = () => {
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
        title.focus();
      }
    });
  };

  title.addEventListener('dblclick', startRename);
  left.appendChild(title);
  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'col-header-right';

  // Add Link button
  const addBtn = document.createElement('button');
  addBtn.className = 'btn-icon';
  addBtn.title = 'Add Link';
  addBtn.setAttribute('aria-label', `Add link to ${col.title}`);
  addBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  addBtn.addEventListener('click', () => {
    openAddLinkModal({ workspaceId, columnId: col.id, onAdded: loadAndRender });
  });
  right.appendChild(addBtn);

  // Column Options button
  const colOptionsBtn = document.createElement('button');
  colOptionsBtn.className = 'btn-icon';
  colOptionsBtn.title = 'Column Options';
  colOptionsBtn.setAttribute('aria-label', `Column options for ${col.title}`);
  colOptionsBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
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
    emptyHint.textContent = 'No bookmarks yet';
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
 * Renders the entire bento board + widgets for the active workspace.
 */
function renderBoard(layout, cardsMap, workspaceId) {
  const fragment = document.createDocumentFragment();
  const columnOrder = layout.columnOrder || [];

  for (const colId of columnOrder) {
    const col = layout.columns[colId];
    if (col) {
      fragment.appendChild(createColumnElement(col, cardsMap, workspaceId, layout));
    }
  }

  // Visual Widget Cards (Pomodoro & Calendar as in Markmez)
  const enabledWidgets = currentMeta?.settings?.widgets || ['clock', 'weather', 'focus-today', 'pomodoro', 'calendar'];

  if (enabledWidgets.includes('pomodoro')) {
    fragment.appendChild(createPomodoroCardElement({ meta: currentMeta, layout, cards: cardsMap }));
  }

  if (enabledWidgets.includes('calendar')) {
    fragment.appendChild(createCalendarCardElement({ meta: currentMeta, layout, cards: cardsMap }));
  }

  boardContainer.innerHTML = '';
  boardContainer.appendChild(fragment);
}

/**
 * Loads and renders the board from storage shards.
 */
async function loadAndRender() {
  try {
    await initStoreIfNeeded();

    const metaShard = await new Promise((res) => chrome.storage.local.get('meta', res));
    currentMeta = metaShard?.meta || createDefaultMeta();
    const activeWsId = currentMeta.activeWorkspaceId || 'ws_default';

    renderWorkspaceTabs(currentMeta);

    const wsShards = await new Promise((res) =>
      chrome.storage.local.get([`ws:${activeWsId}`, `cards:${activeWsId}`], res)
    );

    currentLayout = wsShards?.[`ws:${activeWsId}`];
    if (!currentLayout || !currentLayout.columns || !currentLayout.columnOrder) {
      currentLayout = createDefaultWorkspaceLayout(activeWsId);
      await chrome.storage.local.set({ [`ws:${activeWsId}`]: currentLayout });
    }
    currentCards = wsShards?.[`cards:${activeWsId}`] || {};

    applyTheme(currentMeta.settings?.theme || 'dark');
    applyViewMode(currentMeta.settings?.viewMode || 'board');
    const activeWs = (currentMeta.workspaces || []).find((w) => w.id === activeWsId);
    applyWallpaper(currentMeta.settings, activeWs);

    renderBoard(currentLayout, currentCards, activeWsId);

    // Mount Zen Top-Bar Widgets
    if (topWidgetsContainer) {
      mountTopBarWidgets(topWidgetsContainer, {
        meta: currentMeta,
        onSaveSettings: async (key, val) => {
          currentMeta.settings = currentMeta.settings || {};
          currentMeta.settings[key] = val;
          await chrome.storage.local.set({ meta: currentMeta });
        },
      });
    }

    performance.mark('mbt_init_end');
    performance.measure('mbt_board_first_paint', 'mbt_init_start', 'mbt_init_end');
  } catch (err) {
    console.error('Failed to load and render board:', err);
  }
}

/**
 * Reactive updates via chrome.storage.onChanged.
 */
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;

  if (changes.meta?.newValue?.lastWriter === CONTEXT_ID) {
    return;
  }

  const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
  const wsKey = `ws:${activeWsId}`;
  const cardsKey = `cards:${activeWsId}`;

  if (changes.meta) {
    currentMeta = changes.meta.newValue;
    renderWorkspaceTabs(currentMeta);
  }

  if (changes[wsKey] || changes[cardsKey] || changes.meta) {
    loadAndRender();
  }
});

// Drag and drop initialization
initDragAndDrop({
  boardContainer,
  getWorkspaceId: () => currentMeta?.activeWorkspaceId || 'ws_default',
  onCardsReordered: loadAndRender,
  onColumnsReordered: loadAndRender,
  showToast,
});

// Global Keyboard Navigation (Section 4 & FR-5.1)
window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, [contenteditable="true"]')) {
    return;
  }

  if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
    e.preventDefault();
    triggerSearchPalette();
  } else if (e.key === 'r') {
    e.preventDefault();
    triggerTriage();
  } else if (e.key === 't') {
    e.preventDefault();
    toggleTabDrawer(
      () => currentMeta?.activeWorkspaceId || 'ws_default',
      showToast,
      loadAndRender
    );
  } else if (e.key === 'N' && e.shiftKey) {
    e.preventDefault();
    document.getElementById('menu-add-column')?.click();
  } else if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    e.preventDefault();
    undoLastAction().then(() => showToast('Action undone'));
  }
});

// Initial boot
loadAndRender();
