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
  getEnabledWidgets,
  ALL_MARKMEZ_WIDGETS,
  getPomodoroState,
  subscribePomodoro,
  togglePomodoroTimer,
  stopPomodoroTimer,
} from './lib/ui/widgets.js';
import { openTriageMode } from './lib/ui/triage.js';
import { getBlob } from './lib/db.js';
import { mountLiveWallpaper, unmountLiveWallpaper } from './lib/ui/live-wallpaper.js';
import { openWallpaperModal } from './lib/ui/wallpaper-modal.js';
import { normalizeUrl } from './lib/url.js';

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

// Phase 4 Chrome Architecture: Top 3 Floating Glass Pieces
const topChromeContainer = document.getElementById('top-chrome-container');
const topBarLeft = document.getElementById('top-bar-left');
const dynamicLivePill = document.getElementById('dynamic-live-pill');
const topBarRight = document.getElementById('top-bar-right');
const topWeatherChip = document.getElementById('top-weather-chip');
const topSearchBtn = document.getElementById('top-search-btn');
const topThemeBtn = document.getElementById('top-theme-btn');
const topPaletteBtn = document.getElementById('top-palette-btn');
const topSettingsBtn = document.getElementById('top-settings-btn');
const palettePickerPopover = document.getElementById('palette-picker-popover');

// Phase 4 Chrome Architecture: Bottom Floating Glass Dock
const bottomDock = document.getElementById('bottom-dock');
const dockWorkspaces = document.getElementById('dock-workspaces');
const dockAddBookmarkBtn = document.getElementById('dock-add-bookmark-btn');
const dockDrawerBtn = document.getElementById('dock-drawer-btn');
const dockWallpaperBtn = document.getElementById('dock-wallpaper-btn');
const dockAddColumnBtn = document.getElementById('dock-add-column-btn');

// Backward compatibility references
const railBrandBtn = document.getElementById('rail-brand-btn');
const railWorkspacesBtn = document.getElementById('rail-workspaces-btn');
const railSearchBtn = document.getElementById('rail-search-btn');
const railTriageBtn = document.getElementById('rail-triage-btn');
const railDrawerBtn = document.getElementById('rail-drawer-btn');
const railAddColumnBtn = document.getElementById('rail-add-column-btn');
const railViewModeBtn = document.getElementById('rail-view-mode-btn');
const railThemeBtn = document.getElementById('rail-theme-btn');
const railSettingsBtn = document.getElementById('rail-settings-btn');
const railProfileBtn = document.getElementById('rail-profile-btn');
const railTriageBadge = document.getElementById('rail-triage-badge');

// Curated Pastel Themes (Lavender Iris, Matcha Green, Sky Dawn, Coral Blush)
const CURATED_PALETTES = [
  { id: 'lavender', name: 'Lavender Iris', emoji: '🪻', color: '#874a8a' },
  { id: 'matcha', name: 'Matcha Green', emoji: '🍵', color: '#4e7e58' },
  { id: 'sky', name: 'Sky Dawn', emoji: '🌊', color: '#3b789e' },
  { id: 'coral', name: 'Coral Blush', emoji: '🪸', color: '#9c4e4e' },
];

function applyPalette(paletteId, notify = false) {
  const valid = CURATED_PALETTES.some((p) => p.id === paletteId) ? paletteId : 'lavender';
  document.documentElement.dataset.palette = valid;
  try {
    localStorage.setItem('arc_palette', valid);
  } catch {}
  if (currentMeta) {
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.palette = valid;
  }
  if (palettePickerPopover) {
    palettePickerPopover.querySelectorAll('.palette-option-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.palette === valid);
    });
  }
  if (notify) {
    const pal = CURATED_PALETTES.find((p) => p.id === valid);
    showToast(`Palette: ${pal.name} ${pal.emoji}`);
  }
}

// Initial palette application immediately
const savedPalette = (typeof localStorage !== 'undefined' && localStorage.getItem('arc_palette')) || 'lavender';
applyPalette(savedPalette);

// Acrylic UI: 8 vibrant acrylic color palette tints (amber, rose, sage, cream, lavender, sky, coral, mint)
const COLUMN_COLORS = ['amber', 'rose', 'sage', 'cream', 'lavender', 'sky', 'coral', 'mint'];

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
  syncThemeIcons(theme);
}

function syncThemeIcons(theme) {
  const sunIcon = topThemeBtn?.querySelector('.theme-icon-sun');
  const moonIcon = topThemeBtn?.querySelector('.theme-icon-moon');
  if (sunIcon && moonIcon) {
    if (theme === 'dark') {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
      topThemeBtn.title = 'Switch to Light Mode';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
      topThemeBtn.title = 'Switch to Dark Mode';
    }
  }
}

function applyViewMode() {
  if (boardContainer) {
    boardContainer.classList.remove('view-mode-list', 'view-mode-kanban');
    boardContainer.classList.add('view-mode-bento');
  }
  const railTooltip = railViewModeBtn?.querySelector('.rail-tooltip');
  if (railTooltip) railTooltip.textContent = 'Bento Grid';
}
applyViewMode();

async function applyWallpaper(settings, activeWs) {
  if (!wallpaperLayer) return;

  const isWsOverridden = Boolean(activeWs?.wallpaper);
  const wp = isWsOverridden ? activeWs.wallpaper : (settings?.wallpaper || 'none');
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

  if (wp === 'none') {
    wallpaperLayer.style.backgroundImage = 'none';
  } else if (wp && wp.startsWith('preset:')) {
    const file = wp.replace('preset:', '');
    wallpaperLayer.style.backgroundImage = `url('wallpapers/${file}.svg')`;
  } else {
    wallpaperLayer.style.backgroundImage = `url('wallpapers/monochrome.svg')`;
  }
  wallpaperLayer.style.backgroundSize = 'cover';
  wallpaperLayer.style.backgroundPosition = 'center';
}

// Search Bar Interactions & Toggleable Mode (Web vs Cards)
let currentSearchMode = 'web';
const searchModeWebBtn = document.getElementById('search-mode-web');
const searchModeCardsBtn = document.getElementById('search-mode-cards');

function setSearchMode(mode) {
  currentSearchMode = mode;
  if (mode === 'web') {
    searchModeWebBtn?.classList.add('active');
    searchModeWebBtn?.setAttribute('aria-pressed', 'true');
    searchModeCardsBtn?.classList.remove('active');
    searchModeCardsBtn?.setAttribute('aria-pressed', 'false');
    if (mainSearchInput) mainSearchInput.placeholder = 'Search Google or press Tab for cards...';
    clearCardFilter();
  } else {
    searchModeCardsBtn?.classList.add('active');
    searchModeCardsBtn?.setAttribute('aria-pressed', 'true');
    searchModeWebBtn?.classList.remove('active');
    searchModeWebBtn?.setAttribute('aria-pressed', 'false');
    if (mainSearchInput) mainSearchInput.placeholder = 'Filter saved cards...';
    applyCardFilter(mainSearchInput?.value || '');
  }
}

searchModeWebBtn?.addEventListener('click', () => setSearchMode('web'));
searchModeCardsBtn?.addEventListener('click', () => setSearchMode('cards'));

function applyCardFilter(query) {
  const q = (query || '').toLowerCase().trim();
  const allCardEls = document.querySelectorAll('.board-container .card');
  for (const cardEl of allCardEls) {
    if (!q) {
      cardEl.style.display = '';
      cardEl.style.opacity = '';
      continue;
    }
    const title = cardEl.querySelector('.card-title')?.textContent?.toLowerCase() || '';
    const match = title.includes(q);
    cardEl.style.display = match ? '' : 'none';
  }
}

function clearCardFilter() {
  const allCardEls = document.querySelectorAll('.board-container .card');
  for (const cardEl of allCardEls) {
    cardEl.style.display = '';
    cardEl.style.opacity = '';
  }
}

function handleSearchAction(query) {
  if (!query || !query.trim()) return;
  const q = query.trim();

  if (currentSearchMode === 'cards') {
    // If in Cards mode, open first visible match or palette
    const firstMatch = document.querySelector('.board-container .card:not([style*="display: none"])');
    if (firstMatch) {
      firstMatch.click();
    } else {
      triggerSearchPalette();
    }
    return;
  }

  // If looks like URL
  if (/^https?:\/\//i.test(q) || (q.includes('.') && !q.includes(' '))) {
    window.location.href = q.startsWith('http') ? q : `https://${q}`;
  } else {
    // Navigate via Google search
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
}

if (mainSearchInput) {
  mainSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setSearchMode(currentSearchMode === 'web' ? 'cards' : 'web');
    } else if (e.key === 'Enter') {
      handleSearchAction(mainSearchInput.value);
    } else if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      triggerSearchPalette();
    }
  });

  mainSearchInput.addEventListener('input', () => {
    if (currentSearchMode === 'cards') {
      applyCardFilter(mainSearchInput.value);
    }
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

// Unified Apple Dynamic Island Morphing Engine (Image 1)
const dynamicIsland = document.getElementById('dynamic-island');
const islandSearchTrigger = document.getElementById('island-search-trigger');
const islandSearchInput = document.getElementById('island-search-input');
const islandCloseBtn = document.getElementById('island-close-btn');
const islandFocusBadges = document.querySelectorAll('.island-focus-badge');

function expandDynamicIsland() {
  if (!dynamicIsland) return;
  dynamicIsland.classList.add('expanded');
  const idle = dynamicIsland.querySelector('.island-idle');
  const exp = dynamicIsland.querySelector('.island-expanded');
  if (idle) idle.style.display = 'none';
  if (exp) exp.style.display = 'flex';
  if (islandSearchInput) {
    islandSearchInput.focus();
    islandSearchInput.select();
  }
}

function collapseDynamicIsland() {
  if (!dynamicIsland) return;
  dynamicIsland.classList.remove('expanded');
  const idle = dynamicIsland.querySelector('.island-idle');
  const exp = dynamicIsland.querySelector('.island-expanded');
  if (idle) idle.style.display = 'flex';
  if (exp) exp.style.display = 'none';
}

if (islandSearchTrigger) {
  islandSearchTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    expandDynamicIsland();
  });
}

if (dynamicIsland) {
  dynamicIsland.addEventListener('click', (e) => {
    if (!dynamicIsland.classList.contains('expanded') && !e.target.closest('.island-focus-badge')) {
      expandDynamicIsland();
    }
  });
}

if (islandCloseBtn) {
  islandCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    collapseDynamicIsland();
  });
}

if (islandSearchInput) {
  islandSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = islandSearchInput.value.trim();
      if (q) handleSearchAction(q);
    } else if (e.key === 'Escape') {
      collapseDynamicIsland();
    }
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA')) {
    e.preventDefault();
    expandDynamicIsland();
  } else if (e.key === 'Escape' && dynamicIsland?.classList.contains('expanded')) {
    collapseDynamicIsland();
  }
});

document.addEventListener('click', (e) => {
  if (dynamicIsland?.classList.contains('expanded') && !dynamicIsland.contains(e.target)) {
    collapseDynamicIsland();
  }
});

// Focus Mode / Status Cycling (Image 1 style: WORK, PERSONAL, DEEP FOCUS)
const FOCUS_MODES = [
  { id: 'WORK', label: 'WORK', dotClass: 'dot-work', color: '#a855f7' },
  { id: 'PERSONAL', label: 'PERSONAL', dotClass: 'dot-personal', color: '#38bdf8' },
  { id: 'FOCUS', label: 'DEEP FOCUS', dotClass: 'dot-focus', color: '#34d399' },
];

function applyFocusModeUI(modeId) {
  const mode = FOCUS_MODES.find(m => m.id === modeId || m.id.toLowerCase() === String(modeId).toLowerCase()) || FOCUS_MODES[0];
  document.querySelectorAll('.island-focus-badge').forEach((badge) => {
    badge.dataset.focus = mode.id;
    const dot = badge.querySelector('.focus-dot');
    const label = badge.querySelector('.focus-label');
    if (dot) {
      dot.className = `focus-dot ${mode.dotClass}`;
    }
    if (label) {
      label.textContent = mode.label;
    }
  });
}

async function cycleFocusMode() {
  const current = currentMeta?.settings?.focusMode || 'WORK';
  const idx = FOCUS_MODES.findIndex(m => m.id === current || m.id.toLowerCase() === String(current).toLowerCase());
  const next = FOCUS_MODES[(idx + 1) % FOCUS_MODES.length];
  if (currentMeta) {
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.focusMode = next.id;
    await chrome.storage.local.set({ meta: currentMeta });
  }
  applyFocusModeUI(next.id);
  showToast(`Focus Mode: ${next.label}`);
}

islandFocusBadges.forEach((badge) => {
  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleFocusMode();
  });
});

if (floatingMenuBtn && quickMenuPopover) {
  floatingMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = quickMenuPopover.style.display !== 'none';
    quickMenuPopover.style.display = isVisible ? 'none' : 'flex';
  });

  document.addEventListener('click', (e) => {
    if (
      !quickMenuPopover.contains(e.target) &&
      e.target !== floatingMenuBtn &&
      (!railProfileBtn || !railProfileBtn.contains(e.target))
    ) {
      quickMenuPopover.style.display = 'none';
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && quickMenuPopover.style.display !== 'none') {
      quickMenuPopover.style.display = 'none';
      floatingMenuBtn.focus();
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
document.getElementById('menu-import-bookmarks')?.addEventListener('click', async () => {
    quickMenuPopover.style.display = 'none';
    if (!chrome.bookmarks?.getTree) {
      showToast('Chrome bookmarks API unavailable');
      return;
    }
    showToast('Importing bookmarks...');
    try {
      const tree = await chrome.bookmarks.getTree();
      // Import into current workspace
      const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
      let importedCount = 0;
      function walk(nodes) {
        for (const n of nodes) {
          if (n.url && !n.url.startsWith('chrome://')) {
            saveCard({
              title: n.title || 'Bookmark',
              url: n.url,
              workspaceId: activeWsId,
            });
            importedCount++;
          }
          if (n.children) walk(n.children);
        }
      }
      walk(tree);
      setTimeout(() => {
        loadAndRender();
        showToast(`Imported ${importedCount} bookmarks into Inbox`);
      }, 300);
    } catch (e) {
      console.warn('Import failed', e);
      showToast('Could not import bookmarks');
    }
  });

  document.getElementById('menu-restore-starter')?.addEventListener('click', async () => {
    quickMenuPopover.style.display = 'none';
    if (!confirm('Reset current workspace to the curated Markmez categories (Work, AI, Finance, Learn, Entertainment, Social, News)?')) {
      return;
    }
    const activeWsId = currentMeta?.activeWorkspaceId || 'ws_default';
    const starter = getMarkmezStarterData();
    currentLayout = starter.layout;
    currentCards = starter.cards;
    currentMeta = currentMeta || createDefaultMeta();
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.widgets = [...ALL_MARKMEZ_WIDGETS];
    currentMeta.lastWriter = CONTEXT_ID;

    await chrome.storage.local.set({
      meta: currentMeta,
      [`ws:${activeWsId}`]: currentLayout,
      [`cards:${activeWsId}`]: currentCards,
    });
    showToast('Markmez curated categories loaded!');
    loadAndRender();
  });

  document.getElementById('menu-settings')?.addEventListener('click', () => {
    quickMenuPopover.style.display = 'none';
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open('options.html');
  });
}

// Left Sidebar Glass Navigation Rail (Image 2 style) Interactions
if (railBrandBtn) {
  railBrandBtn.addEventListener('click', () => {
    boardContainer?.scrollTo({ left: 0, behavior: 'smooth' });
  });
}

if (railWorkspacesBtn) {
  railWorkspacesBtn.addEventListener('click', async () => {
    let workspaces = currentMeta?.workspaces;
    if (!workspaces || workspaces.length === 0) {
      workspaces = [
        { id: 'ws_default', name: 'Home', icon: '🏠', order: 0 },
        { id: 'ws_projects', name: 'Projects', icon: '💼', order: 1 },
      ];
      if (currentMeta) currentMeta.workspaces = workspaces;
    }
    const currentId = currentMeta?.activeWorkspaceId || 'ws_default';
    const currentIndex = workspaces.findIndex((w) => w.id === currentId);
    const nextIndex = (currentIndex + 1) % workspaces.length;
    const nextWs = workspaces[nextIndex];
    currentMeta.activeWorkspaceId = nextWs.id;
    await chrome.storage.local.set({ meta: currentMeta });
    loadAndRender();
    showToast(`Workspace: ${nextWs.name || 'Workspace'}`);
  });
}

if (railSearchBtn) {
  railSearchBtn.addEventListener('click', () => {
    expandDynamicIsland();
  });
}

if (railTriageBtn) {
  railTriageBtn.addEventListener('click', () => {
    triggerTriage();
  });
}

if (railDrawerBtn) {
  railDrawerBtn.addEventListener('click', () => {
    toggleTabDrawer(
      () => currentMeta?.activeWorkspaceId || 'ws_default',
      showToast,
      loadAndRender
    );
  });
}

async function promptAddColumn(targetWsId) {
  const title = prompt('Enter new collection title:');
  if (!title || !title.trim()) return;
  const activeWsId = targetWsId || currentMeta?.activeWorkspaceId || 'ws_default';
  const wsKey = `ws:${activeWsId}`;
  const colId = `col_${Date.now()}`;
  await transaction([wsKey], (shards) => {
    const layout = shards[wsKey] || createDefaultWorkspaceLayout(activeWsId);
    layout.columnOrder = layout.columnOrder || [];
    layout.columns = layout.columns || {};
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
  showToast(`Collection "${title.trim()}" added`);
}

async function promptAddBookmark(targetWsId) {
  const url = prompt('Enter bookmark URL:');
  if (!url || !url.trim()) return;
  let formattedUrl = url.trim();
  if (/^[\w-]+(\.[\w-]+)+/.test(formattedUrl) && !/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  } else if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://www.google.com/search?q=${encodeURIComponent(formattedUrl)}`;
  }
  let title = formattedUrl;
  try {
    const parsed = new URL(formattedUrl);
    title = parsed.hostname.replace(/^www\./, '');
  } catch {}
  const userTitle = prompt('Enter bookmark title (optional):', title);
  if (userTitle !== null && userTitle.trim()) {
    title = userTitle.trim();
  }
  const activeWsId = targetWsId || currentMeta?.activeWorkspaceId || 'ws_default';
  await saveCard({
    title,
    url: formattedUrl,
    workspaceId: activeWsId,
  });
  showToast(`Bookmark added: ${title}`);
  loadAndRender();
}

// Bottom Dock Interactions
if (dockAddBookmarkBtn) {
  dockAddBookmarkBtn.addEventListener('click', () => promptAddBookmark());
}

if (dockDrawerBtn) {
  dockDrawerBtn.addEventListener('click', () => {
    toggleTabDrawer(
      () => currentMeta?.activeWorkspaceId || 'ws_default',
      showToast,
      loadAndRender
    );
  });
}

if (dockWallpaperBtn) {
  dockWallpaperBtn.addEventListener('click', triggerWallpaperModal);
}

if (dockAddColumnBtn) {
  dockAddColumnBtn.addEventListener('click', () => promptAddColumn());
}

// Top Bar Right Interactions
async function updateWeatherChip() {
  if (!topWeatherChip) return;
  const tempSpan = topWeatherChip.querySelector('.weather-temp');
  const iconSpan = topWeatherChip.querySelector('.weather-icon');

  const city = currentMeta?.settings?.weatherCity || 'New York';
  const unit = currentMeta?.settings?.weatherUnit || 'F';
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (geoData?.results?.[0]) {
      const { latitude, longitude, name } = geoData.results[0];
      const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;
      const wxRes = await fetch(wxUrl);
      const wxData = await wxRes.json();
      if (wxData?.current_weather) {
        let temp = wxData.current_weather.temperature;
        if (unit === 'F') temp = Math.round((temp * 9) / 5 + 32);
        else temp = Math.round(temp);

        const code = wxData.current_weather.weathercode;
        let icon = '☀️';
        if ([1, 2].includes(code)) icon = '⛅';
        else if ([3].includes(code)) icon = '☁️';
        else if ([45, 48].includes(code)) icon = '🌫️';
        else if (code >= 51 && code <= 67) icon = '🌧️';
        else if (code >= 71 && code <= 77) icon = '🌨️';
        else if (code >= 80 && code <= 82) icon = '🌦️';
        else if (code >= 95) icon = '⛈️';

        if (tempSpan) tempSpan.textContent = `${temp}°`;
        if (iconSpan) iconSpan.textContent = icon;
        topWeatherChip.title = `${name}: ${temp}°${unit} (Click to change location)`;
      }
    }
  } catch {
    // Keep fallback
  }
}

if (topWeatherChip) {
  topWeatherChip.addEventListener('click', () => {
    const currentCity = currentMeta?.settings?.weatherCity || 'New York';
    const newCity = prompt('Enter city for weather forecast:', currentCity);
    if (newCity !== null && newCity.trim()) {
      currentMeta.settings = currentMeta.settings || {};
      currentMeta.settings.weatherCity = newCity.trim();
      chrome.storage.local.set({ meta: currentMeta });
      updateWeatherChip();
      showToast(`Weather location set to ${newCity.trim()}`);
    }
  });
}

if (topSearchBtn) {
  topSearchBtn.addEventListener('click', () => expandDynamicIsland());
}

if (topThemeBtn) {
  topThemeBtn.addEventListener('click', async () => {
    const currentTheme = currentMeta?.settings?.theme || document.documentElement.dataset.theme || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.theme = nextTheme;
    applyTheme(nextTheme);
    await chrome.storage.local.set({ meta: currentMeta });
    showToast(`Theme: ${nextTheme === 'dark' ? 'Dark Mode' : 'Light Mode'}`);
  });
}

if (topPaletteBtn && palettePickerPopover) {
  topPaletteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShown = palettePickerPopover.style.display !== 'none';
    palettePickerPopover.style.display = isShown ? 'none' : 'block';
  });

  palettePickerPopover.querySelectorAll('.palette-option-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pal = item.dataset.palette;
      applyPalette(pal, true);
      palettePickerPopover.style.display = 'none';
      if (currentMeta) {
        await chrome.storage.local.set({ meta: currentMeta });
      }
    });
  });

  window.addEventListener('click', (e) => {
    if (!palettePickerPopover.contains(e.target) && e.target !== topPaletteBtn) {
      palettePickerPopover.style.display = 'none';
    }
  });
}

if (topSettingsBtn) {
  topSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!quickMenuPopover) return;
    const isVisible = quickMenuPopover.style.display !== 'none';
    quickMenuPopover.style.display = isVisible ? 'none' : 'flex';
  });
}

const menuPaletteToggle = document.getElementById('menu-palette-toggle');
if (menuPaletteToggle) {
  menuPaletteToggle.addEventListener('click', async () => {
    const currentPal = document.documentElement.dataset.palette || 'lavender';
    const palIdx = CURATED_PALETTES.findIndex((p) => p.id === currentPal);
    const nextPal = CURATED_PALETTES[(palIdx + 1) % CURATED_PALETTES.length].id;
    applyPalette(nextPal, true);
    if (currentMeta) {
      await chrome.storage.local.set({ meta: currentMeta });
    }
  });
}

// Dynamic Live Pill State Controller
let livePillInterval = null;
let currentPomodoroState = { isRunning: false, secondsLeft: 25 * 60, totalSeconds: 25 * 60, mode: 'focus' };
let livePillRestView = 'clock'; // 'clock' | 'timer'

function initDynamicLivePill() {
  if (!dynamicLivePill) return;

  const restWrap = dynamicLivePill.querySelector('.live-pill-rest');
  const activeWrap = dynamicLivePill.querySelector('.live-pill-active');
  const timeSpan = dynamicLivePill.querySelector('.live-pill-time');
  const dateSpan = dynamicLivePill.querySelector('.live-pill-date');
  const digitsSpan = dynamicLivePill.querySelector('.live-pill-digits');
  const modeSpan = dynamicLivePill.querySelector('.live-pill-mode');
  const ringFill = dynamicLivePill.querySelector('.live-ring-fill');
  const toggleBtn = document.getElementById('live-pill-toggle-btn');
  const stopBtn = document.getElementById('live-pill-stop-btn');
  const playIcon = toggleBtn?.querySelector('.icon-play');
  const pauseIcon = toggleBtn?.querySelector('.icon-pause');

  function updateClockDisplay() {
    if (currentPomodoroState.isRunning) return;
    const d = new Date();
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    const weekdayStr = d.toLocaleDateString([], { weekday: 'short' });
    const monthStr = d.toLocaleDateString([], { month: 'short' });
    const dayStr = d.getDate();

    document.querySelectorAll('.live-pill-time').forEach((el) => { el.textContent = timeStr; });
    document.querySelectorAll('.live-pill-date').forEach((el) => { el.textContent = `${weekdayStr}, ${monthStr} ${dayStr}`; });
  }

  function renderPomodoroOnPill(state) {
    currentPomodoroState = state;
    const { isRunning, secondsLeft, totalSeconds, mode } = state;

    if (isRunning) {
      dynamicLivePill.classList.add('is-pomo-active');
      if (restWrap) restWrap.style.display = 'none';
      if (activeWrap) activeWrap.style.display = 'flex';

      const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
      const s = String(secondsLeft % 60).padStart(2, '0');
      if (digitsSpan) digitsSpan.textContent = `${m}:${s}`;
      if (modeSpan) modeSpan.textContent = mode === 'focus' ? 'FOCUS' : (mode === 'short' ? 'SHORT BREAK' : 'LONG BREAK');

      const circumference = 56.55;
      const progressRatio = totalSeconds > 0 ? (secondsLeft / totalSeconds) : 0;
      const strokeOffset = circumference * (1 - progressRatio);
      if (ringFill) {
        ringFill.style.strokeDashoffset = `${strokeOffset}px`;
      }

      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
      if (toggleBtn) toggleBtn.title = 'Pause Timer';
    } else {
      if (livePillRestView === 'timer') {
        dynamicLivePill.classList.add('is-pomo-active');
        if (restWrap) restWrap.style.display = 'none';
        if (activeWrap) activeWrap.style.display = 'flex';

        const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
        const s = String(secondsLeft % 60).padStart(2, '0');
        if (digitsSpan) digitsSpan.textContent = `${m}:${s}`;
        if (modeSpan) modeSpan.textContent = mode === 'focus' ? 'FOCUS' : (mode === 'short' ? 'SHORT BREAK' : 'LONG BREAK');

        if (playIcon) playIcon.style.display = 'block';
        if (pauseIcon) pauseIcon.style.display = 'none';
        if (toggleBtn) toggleBtn.title = 'Start Timer';
      } else {
        dynamicLivePill.classList.remove('is-pomo-active');
        if (restWrap) restWrap.style.display = 'flex';
        if (activeWrap) activeWrap.style.display = 'none';
        updateClockDisplay();
      }
    }
  }

  // Update clock every second
  updateClockDisplay();
  if (livePillInterval) clearInterval(livePillInterval);
  livePillInterval = setInterval(updateClockDisplay, 1000);

  // Subscribe to Pomodoro updates from widgets subsystem
  subscribePomodoro(renderPomodoroOnPill);

  // Toggle play/pause
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePomodoroTimer();
  });

  // Stop/dismiss timer
  stopBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    stopPomodoroTimer();
    livePillRestView = 'clock';
    renderPomodoroOnPill(getPomodoroState());
  });

  // Clicking pill toggles between clock and timer controls
  dynamicLivePill.addEventListener('click', (e) => {
    if (e.target.closest('#live-pill-toggle-btn') || e.target.closest('#live-pill-stop-btn')) {
      return;
    }
    if (currentPomodoroState.isRunning) {
      livePillRestView = livePillRestView === 'clock' ? 'timer' : 'clock';
      if (livePillRestView === 'clock') {
        dynamicLivePill.classList.remove('is-pomo-active');
        if (restWrap) restWrap.style.display = 'flex';
        if (activeWrap) activeWrap.style.display = 'none';
        updateClockDisplay();
      } else {
        renderPomodoroOnPill(currentPomodoroState);
      }
    } else {
      livePillRestView = livePillRestView === 'clock' ? 'timer' : 'clock';
      renderPomodoroOnPill(getPomodoroState());
    }
  });
}

// Bottom Dock Workspaces Renderer
function renderBottomDock(meta) {
  if (!dockWorkspaces) return;
  dockWorkspaces.innerHTML = '';

  const workspaces = meta?.workspaces || [
    { id: 'ws_default', name: 'Home', icon: '🏠' },
    { id: 'ws_work', name: 'Work', icon: '💼' },
    { id: 'ws_projects', name: 'Projects', icon: '🚀' },
  ];
  const activeWsId = meta?.activeWorkspaceId || 'ws_default';

  for (const ws of workspaces) {
    const isActive = ws.id === activeWsId;
    const item = document.createElement('button');
    item.className = `dock-item dock-ws-item ${isActive ? 'active' : ''}`;
    item.dataset.wsId = ws.id;
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    item.setAttribute('aria-label', `Workspace: ${ws.name}`);

    const iconSpan = document.createElement('span');
    iconSpan.className = 'dock-icon dock-ws-icon';
    iconSpan.textContent = ws.icon || '🏠';
    item.appendChild(iconSpan);

    const dot = document.createElement('span');
    dot.className = 'dock-dot';
    dot.setAttribute('aria-hidden', 'true');
    item.appendChild(dot);

    const tooltip = document.createElement('span');
    tooltip.className = 'dock-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = ws.name || 'Workspace';
    item.appendChild(tooltip);

    item.addEventListener('click', async () => {
      if (ws.id === meta.activeWorkspaceId) return;
      meta.activeWorkspaceId = ws.id;
      await chrome.storage.local.set({ meta });
      loadAndRender();
      showToast(`Workspace: ${ws.name}`);
    });

    dockWorkspaces.appendChild(item);
  }
}

if (railAddColumnBtn) {
  railAddColumnBtn.addEventListener('click', () => promptAddColumn());
}

if (railViewModeBtn) {
  railViewModeBtn.addEventListener('click', () => {
    applyViewMode();
    showToast('Bento Grid Layout (Active)');
  });
}

if (railThemeBtn) {
  railThemeBtn.addEventListener('click', async () => {
    const currentTheme = currentMeta?.settings?.theme || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    currentMeta.settings = currentMeta.settings || {};
    currentMeta.settings.theme = nextTheme;
    applyTheme(nextTheme);
    await chrome.storage.local.set({ meta: currentMeta });
  });
}

if (railSettingsBtn) {
  railSettingsBtn.addEventListener('click', () => {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html');
    }
  });
}

if (railProfileBtn) {
  railProfileBtn.addEventListener('click', (e) => {
    if (!quickMenuPopover) return;
    e.stopPropagation();
    const isVisible = quickMenuPopover.style.display !== 'none';
    quickMenuPopover.style.display = isVisible ? 'none' : 'flex';
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

  // Use Chromium's internal local _favicon API, falling back to Google Favicons
  const extensionId = chrome.runtime?.id;
  if (extensionId) {
    img.src = `chrome-extension://${extensionId}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
  } else if (host) {
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  }

  img.onerror = () => {
    if (!img.dataset.triedGoogle && host) {
      img.dataset.triedGoogle = 'true';
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
      return;
    }
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

// ==========================================================================
// macOS Sequoia / Sonoma Frosted Context Menu Engine
// ==========================================================================
let activeContextMenu = null;

function hideMacOsContextMenu() {
  const menu = document.getElementById('macos-context-menu');
  if (menu) {
    menu.style.display = 'none';
    menu.innerHTML = '';
  }
  activeContextMenu = null;
}

function showMacOsContextMenu(x, y, items) {
  const menu = document.getElementById('macos-context-menu');
  if (!menu) return;
  menu.innerHTML = '';

  items.forEach((item) => {
    if (item.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'macos-menu-separator';
      menu.appendChild(sep);
      return;
    }

    const btn = document.createElement('button');
    btn.className = `macos-menu-item ${item.danger ? 'danger' : ''}`;
    btn.setAttribute('role', 'menuitem');

    const left = document.createElement('div');
    left.className = 'macos-menu-item-left';

    if (item.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'macos-menu-icon';
      iconSpan.textContent = item.icon;
      left.appendChild(iconSpan);
    }

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    left.appendChild(labelSpan);
    btn.appendChild(left);

    if (item.shortcut) {
      const kbd = document.createElement('kbd');
      kbd.className = 'macos-menu-kbd';
      kbd.textContent = item.shortcut;
      btn.appendChild(kbd);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideMacOsContextMenu();
      if (typeof item.onClick === 'function') {
        item.onClick();
      }
    });

    menu.appendChild(btn);
  });

  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';

  // Clamp within viewport
  const rect = menu.getBoundingClientRect();
  const pad = 12;
  let posX = x;
  let posY = y;

  if (posX + rect.width > window.innerWidth - pad) {
    posX = Math.max(pad, window.innerWidth - rect.width - pad);
  }
  if (posY + rect.height > window.innerHeight - pad) {
    posY = Math.max(pad, window.innerHeight - rect.height - pad);
  }

  menu.style.left = `${posX}px`;
  menu.style.top = `${posY}px`;
  menu.style.visibility = 'visible';

  activeContextMenu = menu;
}

// Global click & Escape handlers to dismiss context menu
document.addEventListener('click', (e) => {
  if (activeContextMenu && !activeContextMenu.contains(e.target)) {
    hideMacOsContextMenu();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeContextMenu) {
    hideMacOsContextMenu();
  }
});
window.addEventListener('scroll', hideMacOsContextMenu, true);
window.addEventListener('blur', hideMacOsContextMenu);

/**
 * Renders the top workspace switcher pills (Home, Projects, +) with Apple sliding spring pill
 */
function renderWorkspaceTabs(meta) {
  if (!workspaceSwitcher) return;
  workspaceSwitcher.innerHTML = '';

  // 1. Sliding Spring Pill (Apple Segmented Indicator)
  const sliderPill = document.createElement('div');
  sliderPill.className = 'ws-slider-pill';
  sliderPill.id = 'ws-slider-pill';
  sliderPill.setAttribute('aria-hidden', 'true');
  workspaceSwitcher.appendChild(sliderPill);

  let workspaces = meta?.workspaces;
  let didUpdate = false;
  if (!workspaces || workspaces.length === 0) {
    workspaces = [
      { id: 'ws_default', name: 'Home', icon: '🏠', order: 0 },
      { id: 'ws_work', name: 'Work', icon: '💼', order: 1 },
      { id: 'ws_projects', name: 'Projects', icon: '🚀', order: 2 },
    ];
    if (meta) meta.workspaces = workspaces;
    didUpdate = true;
  } else {
    if (workspaces[0] && workspaces[0].name === 'Default') {
      workspaces[0].name = 'Home';
      workspaces[0].icon = '🏠';
      didUpdate = true;
    }
    if (!workspaces.some((w) => w.id === 'ws_work' || w.name === 'Work')) {
      workspaces.splice(1, 0, {
        id: 'ws_work',
        parentId: null,
        name: 'Work',
        icon: '💼',
        order: 1,
      });
      workspaces.forEach((w, idx) => { w.order = idx; });
      didUpdate = true;
    }
    if (!workspaces.some((w) => w.id === 'ws_projects' || w.name === 'Projects')) {
      workspaces.push({
        id: 'ws_projects',
        parentId: null,
        name: 'Projects',
        icon: '🚀',
        order: workspaces.length,
      });
      didUpdate = true;
    }
  }

  if (didUpdate && meta) {
    chrome.storage.local.set({ meta }).catch(() => {});
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

  // Position sliding pill with Apple spring physics
  function updateSliderPill() {
    const activeTab = workspaceSwitcher.querySelector('.ws-tab.active');
    if (activeTab && sliderPill) {
      sliderPill.style.transform = `translateX(${activeTab.offsetLeft}px)`;
      sliderPill.style.width = `${activeTab.offsetWidth}px`;
      sliderPill.style.height = `${activeTab.offsetHeight}px`;
      sliderPill.style.opacity = '1';
    } else if (sliderPill) {
      sliderPill.style.opacity = '0';
    }
  }
  requestAnimationFrame(updateSliderPill);
  window.addEventListener('resize', updateSliderPill, { passive: true });
  renderBottomDock(meta);
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

  // Direct Inline Edit on Double Click or Keyboard (F2 / Enter)
  const startInlineCardEdit = (e) => {
    if (e) e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'card-title-inline-edit';
    input.value = card.title || '';
    input.style.cssText = 'width: 100%; background: rgba(0,0,0,0.4); border: 1px solid var(--accent-primary); border-radius: 6px; color: var(--text-primary); padding: 2px 6px; font-size: 12px; font-family: inherit; outline: none;';
    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newTitle = input.value.trim() || card.title || 'Untitled';
      const cardsKey = `cards:${workspaceId}`;
      await transaction([cardsKey], (shards) => {
        const cMap = shards[cardsKey] || {};
        if (cMap[card.id]) {
          cMap[card.id].title = newTitle;
        }
        return { [cardsKey]: cMap };
      });
      loadAndRender();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        committed = true;
        input.replaceWith(titleSpan);
      }
    });
  };

  cardEl.addEventListener('dblclick', startInlineCardEdit);

  // Keyboard accessibility & quick actions (Delete, Backspace, E, Enter to navigate)
  cardEl.addEventListener('keydown', async (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      cardEl.click();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      await deleteCard(card.id, workspaceId);
      showToast('Bookmark deleted', true, 4000);
    } else if (e.key === 'e' || e.key === 'E' || e.key === 'F2') {
      e.preventDefault();
      startInlineCardEdit(e);
    }
  });

  // Card click navigation
  cardEl.addEventListener('click', (e) => {
    if (e.target.closest('.card-action-btn') || e.target.tagName === 'INPUT') return;
    if (card.url) {
      if (e.ctrlKey || e.metaKey || currentMeta?.settings?.openLinksInNewTab !== false) {
        window.open(card.url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = card.url;
      }
    }
  });

  // macOS Native-Style Frosted Context Menu on Right-Click (WWDC Section 12 & 16)
  cardEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    showMacOsContextMenu(e.clientX, e.clientY, [
      {
        icon: '↗',
        label: 'Open in New Tab',
        shortcut: '⌘↵',
        onClick: () => {
          if (card.url) window.open(card.url, '_blank', 'noopener,noreferrer');
        },
      },
      {
        icon: '📋',
        label: 'Copy URL',
        shortcut: '⌘C',
        onClick: () => {
          if (card.url) {
            navigator.clipboard.writeText(card.url);
            showToast('URL copied to clipboard');
          }
        },
      },
      {
        icon: '✏️',
        label: 'Edit Bookmark...',
        shortcut: 'E',
        onClick: () => {
          openCardEditModal({
            card,
            workspaceId,
            layout: currentLayout,
            meta: currentMeta,
            onSave: loadAndRender,
          });
        },
      },
      { type: 'separator' },
      {
        icon: '🗑️',
        label: 'Delete Bookmark',
        shortcut: '⌫',
        danger: true,
        onClick: async () => {
          await deleteCard(card.id, workspaceId);
          showToast('Bookmark deleted', true, 4000);
        },
      },
    ]);
  });

  // Universal Card Resize Handle (Allows free-form vertical expansion)
  const cardResizeHandle = document.createElement('div');
  cardResizeHandle.className = 'card-resize-handle';
  cardResizeHandle.title = 'Drag to resize card height (Double-click to reset)';
  cardResizeHandle.setAttribute('aria-label', 'Resize card');
  cardResizeHandle.innerHTML = `
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <path d="M7 1L1 7M7 4L4 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  `;

  // Restore saved card size if any
  try {
    const savedCardHeight = localStorage.getItem(`arc_card_height_${card.id}`);
    if (savedCardHeight) {
      cardEl.style.minHeight = `${savedCardHeight}px`;
      if (parseInt(savedCardHeight, 10) > 55) {
        cardEl.classList.add('card-expanded');
      }
    }
  } catch {}

  // Pointer drag resizing for card
  cardResizeHandle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = cardEl.offsetHeight;

    cardResizeHandle.setPointerCapture(e.pointerId);
    cardEl.classList.add('is-resizing');

    function onPointerMove(moveEvent) {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(38, Math.min(360, startHeight + deltaY));
      cardEl.style.minHeight = `${newHeight}px`;
      if (newHeight > 55) {
        cardEl.classList.add('card-expanded');
      } else {
        cardEl.classList.remove('card-expanded');
      }
    }

    function onPointerUp(upEvent) {
      try {
        cardResizeHandle.releasePointerCapture(upEvent.pointerId);
      } catch {}
      cardEl.classList.remove('is-resizing');
      cardResizeHandle.removeEventListener('pointermove', onPointerMove);
      cardResizeHandle.removeEventListener('pointerup', onPointerUp);

      try {
        localStorage.setItem(`arc_card_height_${card.id}`, String(cardEl.offsetHeight));
      } catch {}
    }

    cardResizeHandle.addEventListener('pointermove', onPointerMove);
    cardResizeHandle.addEventListener('pointerup', onPointerUp);
  });

  // Double click to reset card size
  cardResizeHandle.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    cardEl.style.minHeight = '';
    cardEl.classList.remove('card-expanded');
    try {
      localStorage.removeItem(`arc_card_height_${card.id}`);
    } catch {}
    showToast('Card size reset');
  });

  cardEl.appendChild(cardResizeHandle);

  return cardEl;
}

/**
 * Bento Grid tile size spans.
 */
const BENTO_SPANS = ['t-1x2', 't-2x2', 't-1x1', 't-2x1'];

/**
 * Attaches snap-to-bento resizing and cycling logic to a tile (column or widget).
 */
function attachBentoSnapResize(element, storageKey, defaultSpan = 't-1x2') {
  const handle = document.createElement('div');
  handle.className = 'col-resize-handle';
  handle.title = 'Click to cycle size, drag to snap, double-click to reset';
  handle.setAttribute('aria-label', 'Resize tile');
  handle.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M8 2L2 8M9 5L5 9M9 8L8 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  `;

  function getCurrentSpan() {
    for (const s of BENTO_SPANS) {
      if (element.classList.contains(s)) return s;
    }
    return defaultSpan;
  }

  function setSpan(newSpan, save = true) {
    for (const s of BENTO_SPANS) {
      element.classList.remove(s);
    }
    element.classList.add(newSpan);
    element.style.height = '';
    element.style.maxHeight = '';
    element.style.width = '';
    element.style.maxWidth = '';
    if (save && storageKey) {
      try {
        localStorage.setItem(storageKey, newSpan);
      } catch {}
    }
  }

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let hasDragged = false;
  let dragStartSpan = defaultSpan;

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();

    startX = e.clientX;
    startY = e.clientY;
    hasDragged = false;
    isDragging = true;
    dragStartSpan = getCurrentSpan();

    try {
      handle.setPointerCapture(e.pointerId);
    } catch {}
    element.classList.add('is-resizing');

    function onPointerMove(moveEvent) {
      if (!isDragging) return;
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        hasDragged = true;
      }

      // Discrete snap logic (Step 4 of redesign plan):
      // Drag right (> 100px) -> span 2 columns (t-2x2 or t-2x1)
      // Drag down (> 100px) -> span 2 rows (t-1x2 or t-2x2)
      let previewSpan = dragStartSpan;
      const wants2Cols = deltaX > 100;
      const wants1Col = deltaX < -80;
      const wants2Rows = deltaY > 100;
      const wants1Row = deltaY < -80;

      if (wants2Cols && wants2Rows) {
        previewSpan = 't-2x2';
      } else if (wants2Cols) {
        const is2Rows = dragStartSpan === 't-1x2' || dragStartSpan === 't-2x2';
        previewSpan = is2Rows ? 't-2x2' : 't-2x1';
      } else if (wants2Rows) {
        const is2Cols = dragStartSpan === 't-2x1' || dragStartSpan === 't-2x2';
        previewSpan = is2Cols ? 't-2x2' : 't-1x2';
      } else if (wants1Col && wants1Row) {
        previewSpan = 't-1x1';
      } else if (wants1Col) {
        const is2Rows = dragStartSpan === 't-1x2' || dragStartSpan === 't-2x2';
        previewSpan = is2Rows ? 't-1x2' : 't-1x1';
      } else if (wants1Row) {
        const is2Cols = dragStartSpan === 't-2x1' || dragStartSpan === 't-2x2';
        previewSpan = is2Cols ? 't-2x1' : 't-1x1';
      }

      if (previewSpan !== getCurrentSpan()) {
        for (const s of BENTO_SPANS) {
          element.classList.remove(s);
        }
        element.classList.add(previewSpan);
      }
    }

    function onPointerUp(upEvent) {
      if (!isDragging) return;
      isDragging = false;
      try {
        handle.releasePointerCapture(upEvent.pointerId);
      } catch {}
      element.classList.remove('is-resizing');
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);

      if (hasDragged) {
        const finalSpan = getCurrentSpan();
        setSpan(finalSpan, true);
        showToast(`Snapped to ${finalSpan.replace('t-', '')}`);
      } else {
        // Handle click: cycle through [ 't-1x2', 't-2x2', 't-1x1', 't-2x1' ]
        const cur = getCurrentSpan();
        const curIdx = BENTO_SPANS.indexOf(cur);
        const nextSpan = BENTO_SPANS[(curIdx >= 0 ? curIdx + 1 : 0) % BENTO_SPANS.length];
        setSpan(nextSpan, true);
        showToast(`Tile size: ${nextSpan.replace('t-', '')}`);
      }
    }

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
  });

  // Double click resets to default (defaultSpan = 't-1x2' for collections)
  handle.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    e.preventDefault();
    setSpan(defaultSpan, false);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
    showToast(`Tile size reset to ${defaultSpan.replace('t-', '')}`);
  });

  element.appendChild(handle);
}

/**
 * Builds a category collection tile DOM element with standard anatomy (Phase 2: Step 6).
 */
function createColumnElement(col, cardsMap, workspaceId, layout) {
  const colEl = document.createElement('section');
  colEl.className = 'column physical-folder';
  colEl.dataset.colId = col.id;

  const colIndex = layout?.columnOrder ? layout.columnOrder.indexOf(col.id) : 0;
  const colColor = col.color_tint || col.color || COLUMN_COLORS[(colIndex >= 0 ? colIndex : 0) % COLUMN_COLORS.length];
  colEl.dataset.color = colColor;
  if (colColor && colColor.startsWith('#')) {
    const hex = colColor.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      colEl.style.setProperty('--tint-rgb', `${r}, ${g}, ${b}`);
    }
  }

  const cardIds = col.cardIds || [];
  const isColEmpty = cardIds.length === 0;
  if (isColEmpty) {
    colEl.classList.add('is-empty-col');
  }

  // Restore saved tile span or resolve default (t-1x2 for normal, t-1x1 for empty)
  const savedSpan = (() => {
    try {
      return (
        localStorage.getItem(`arc_tile_span_${col.id}`) ||
        (localStorage.getItem(`arc_col_span_${col.id}`) === '2' ? 't-2x2' : null)
      );
    } catch {
      return null;
    }
  })();
  const defaultSpan = isColEmpty ? 't-1x1' : 't-1x2';
  const initialSpan = savedSpan && BENTO_SPANS.includes(savedSpan) ? savedSpan : defaultSpan;
  colEl.classList.add(initialSpan);

  // Header (Title top-left, subtitle line, Add link + and options ⋯ buttons)
  const header = document.createElement('header');
  header.className = 'column-header folder-tab-header';

  const left = document.createElement('div');
  left.className = 'col-header-left';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'col-title-wrap';

  if (colColor) {
    const dot = document.createElement('span');
    dot.className = 'col-color-dot';
    dot.style.background = colColor;
    titleWrap.appendChild(dot);
  }

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
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startRename();
    }
  });
  titleWrap.appendChild(title);
  left.appendChild(titleWrap);

  const subtitle = document.createElement('span');
  subtitle.className = 'col-subtitle';
  subtitle.textContent = `${cardIds.length} bookmark${cardIds.length === 1 ? '' : 's'}`;
  left.appendChild(subtitle);

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

  // macOS Native-Style Column Context Menu on Header Right-Click (WWDC Section 12 & 16)
  header.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    showMacOsContextMenu(e.clientX, e.clientY, [
      {
        icon: '➕',
        label: 'Add Link Here...',
        shortcut: 'A',
        onClick: () => {
          openAddLinkModal({ workspaceId, columnId: col.id, onAdded: loadAndRender });
        },
      },
      {
        icon: '✏️',
        label: 'Rename Column...',
        shortcut: 'R',
        onClick: startRename,
      },
      {
        icon: '⚙️',
        label: 'Column Options...',
        onClick: () => {
          openColumnSettingsModal({
            col,
            workspaceId,
            layout: currentLayout,
            onUpdate: loadAndRender,
          });
        },
      },
      { type: 'separator' },
      {
        icon: '🗑️',
        label: 'Delete Column',
        danger: true,
        onClick: async () => {
          if (!confirm(`Delete column "${col.title}" and its bookmarks?`)) return;
          const wsKey = `ws:${workspaceId}`;
          await transaction([wsKey], (shards) => {
            const l = shards[wsKey];
            if (!l) return {};
            l.columnOrder = (l.columnOrder || []).filter((id) => id !== col.id);
            delete l.columns[col.id];
            return { [wsKey]: l };
          });
          loadAndRender();
          showToast(`Column "${col.title}" deleted`);
        },
      },
    ]);
  });

  colEl.appendChild(header);

  // Body: Flattened cards list inside folder cards sleeve
  const list = document.createElement('div');
  list.className = 'cards-list folder-cards-sleeve';

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

  // Inline Ghost Row inside list (+ Add bookmark)
  const inlineAddRow = document.createElement('div');
  inlineAddRow.className = 'inline-add-row';

  const inlineAddBtn = document.createElement('button');
  inlineAddBtn.className = 'inline-add-btn';
  inlineAddBtn.type = 'button';
  inlineAddBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> <span>Add bookmark</span>`;

  const inlineAddForm = document.createElement('div');
  inlineAddForm.className = 'inline-add-form';
  inlineAddForm.style.display = 'none';

  const inlineAddInput = document.createElement('input');
  inlineAddInput.className = 'inline-add-input';
  inlineAddInput.placeholder = 'Paste URL or name (e.g. github.com)...';

  const inlineAddActions = document.createElement('div');
  inlineAddActions.className = 'inline-add-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'inline-add-cancel';
  cancelBtn.textContent = 'Cancel';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'inline-add-confirm';
  confirmBtn.textContent = 'Add';

  inlineAddActions.appendChild(cancelBtn);
  inlineAddActions.appendChild(confirmBtn);
  inlineAddForm.appendChild(inlineAddInput);
  inlineAddForm.appendChild(inlineAddActions);

  inlineAddRow.appendChild(inlineAddBtn);
  inlineAddRow.appendChild(inlineAddForm);

  const openInlineForm = () => {
    inlineAddBtn.style.display = 'none';
    inlineAddForm.style.display = 'flex';
    inlineAddInput.value = '';
    inlineAddInput.focus();
  };

  const closeInlineForm = () => {
    inlineAddForm.style.display = 'none';
    inlineAddBtn.style.display = 'flex';
  };

  const submitInlineForm = async () => {
    const raw = inlineAddInput.value.trim();
    if (!raw) {
      closeInlineForm();
      return;
    }
    let url = raw;
    let title = raw;
    if (!/^https?:\/\//i.test(url) && (url.includes('.') || !url.includes(' '))) {
      url = `https://${url}`;
    } else if (!/^https?:\/\//i.test(url)) {
      url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
    }
    try {
      const parsed = new URL(url);
      if (title === raw && parsed.hostname) {
        title = parsed.hostname.replace(/^www\./, '');
      }
    } catch {}

    await saveCard({
      title,
      url,
      columnId: col.id,
      workspaceId,
    });
    showToast(`Saved to ${col.title} ↗`);
    loadAndRender();
  };

  inlineAddBtn.addEventListener('click', openInlineForm);
  cancelBtn.addEventListener('click', closeInlineForm);
  confirmBtn.addEventListener('click', submitInlineForm);
  inlineAddInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitInlineForm();
    } else if (e.key === 'Escape') {
      closeInlineForm();
    }
  });

  list.appendChild(inlineAddRow);
  colEl.appendChild(list);

  // Front Acrylic Pocket Lip Element (Phase 1: Physical Acrylic Glass Folder Columns)
  const pocketLip = document.createElement('div');
  pocketLip.className = 'folder-pocket-lip tile-footer';

  const pocketTitleWrap = document.createElement('div');
  pocketTitleWrap.className = 'folder-pocket-title-wrap';

  const pocketTitle = document.createElement('span');
  pocketTitle.className = 'folder-pocket-title';
  pocketTitle.textContent = (col.title || 'UNTITLED').toUpperCase();
  pocketTitle.title = 'Double-click to rename';
  pocketTitle.tabIndex = 0;
  pocketTitle.setAttribute('role', 'button');
  pocketTitle.addEventListener('dblclick', startRename);
  pocketTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      startRename();
    }
  });

  pocketTitleWrap.appendChild(pocketTitle);
  pocketLip.appendChild(pocketTitleWrap);

  const pocketMeta = document.createElement('div');
  pocketMeta.className = 'folder-pocket-meta';

  const faviconStack = document.createElement('div');
  faviconStack.className = 'tile-favicon-stack';

  // Find up to 3 distinct favicons for optimal pocket lip width balance
  const distinctFaviconCards = [];
  const seenHosts = new Set();
  for (const cardId of cardIds) {
    const card = cardsMap[cardId];
    if (card && card.url) {
      let host = card.host;
      if (!host) {
        try {
          host = new URL(card.url).hostname.replace(/^www\./, '');
        } catch {}
      }
      if (host && !seenHosts.has(host)) {
        seenHosts.add(host);
        distinctFaviconCards.push(card);
        if (distinctFaviconCards.length >= 3) break;
      }
    }
  }

  if (distinctFaviconCards.length < 3) {
    for (const cardId of cardIds) {
      const card = cardsMap[cardId];
      if (card && !distinctFaviconCards.includes(card)) {
        distinctFaviconCards.push(card);
        if (distinctFaviconCards.length >= 3) break;
      }
    }
  }

  for (const fCard of distinctFaviconCards) {
    const img = document.createElement('img');
    img.className = 'tile-stack-item';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = fCard.title || fCard.host || '';
    img.title = fCard.title || fCard.host || '';

    const extId = chrome.runtime?.id;
    if (extId && fCard.url) {
      img.src = `chrome-extension://${extId}/_favicon/?pageUrl=${encodeURIComponent(fCard.url)}&size=32`;
    } else if (fCard.host) {
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(fCard.host)}&sz=32`;
    }

    img.onerror = () => {
      const fallback = document.createElement('span');
      fallback.className = 'tile-stack-item tile-stack-fallback';
      fallback.textContent = (fCard.host || fCard.title || '?').charAt(0).toUpperCase();
      fallback.title = fCard.title || fCard.host || '';
      if (img.parentNode) {
        img.parentNode.replaceChild(fallback, img);
      }
    };

    faviconStack.appendChild(img);
  }

  pocketMeta.appendChild(faviconStack);

  const countBadge = document.createElement('span');
  countBadge.className = 'tile-count-badge';
  countBadge.textContent = String(cardIds.length);
  countBadge.title = `${cardIds.length} bookmarks`;
  pocketMeta.appendChild(countBadge);

  const pocketArrow = document.createElement('span');
  pocketArrow.className = 'folder-pocket-arrow';
  pocketArrow.setAttribute('aria-hidden', 'true');
  pocketArrow.textContent = '→';
  pocketMeta.appendChild(pocketArrow);

  pocketLip.appendChild(pocketMeta);

  colEl.appendChild(pocketLip);

  // Snap-to-Bento Resize Handle (Phase 2: Step 4)
  attachBentoSnapResize(colEl, `arc_tile_span_${col.id}`, 't-1x2');

  return colEl;
}

/**
 * Synchronizes the left navigation rail button and badge states.
 */
function syncRailState() {
  if (railViewModeBtn) {
    railViewModeBtn.classList.add('active');
    const railTooltip = railViewModeBtn.querySelector('.rail-tooltip');
    if (railTooltip) {
      railTooltip.textContent = 'Bento Grid';
    }
  }
}

/**
 * Renders the entire bento board + widgets for the active workspace.
 */
function renderBoard(layout, cardsMap, workspaceId) {
  const fragment = document.createDocumentFragment();
  const columnOrder = layout.columnOrder || [];
  const enabledWidgets = getEnabledWidgets(currentMeta);

  const widgetCards = [];
  if (enabledWidgets.includes('pomodoro')) {
    const pCard = createPomodoroCardElement({ meta: currentMeta, layout, cards: cardsMap });
    const savedPomoSpan = (() => {
      try { return localStorage.getItem('arc_tile_span_widget_pomodoro'); } catch { return null; }
    })() || 't-1x1';
    for (const s of BENTO_SPANS) pCard.classList.remove(s);
    pCard.classList.add(savedPomoSpan);
    attachBentoSnapResize(pCard, 'arc_tile_span_widget_pomodoro', 't-1x1');
    widgetCards.push(pCard);
  }
  if (enabledWidgets.includes('calendar')) {
    const cCard = createCalendarCardElement({ meta: currentMeta, layout, cards: cardsMap });
    const savedCalSpan = (() => {
      try { return localStorage.getItem('arc_tile_span_widget_calendar'); } catch { return null; }
    })() || 't-2x1';
    for (const s of BENTO_SPANS) cCard.classList.remove(s);
    cCard.classList.add(savedCalSpan);
    attachBentoSnapResize(cCard, 'arc_tile_span_widget_calendar', 't-2x1');
    widgetCards.push(cCard);
  }

  // Visual Widget Cards (Pomodoro & Calendar as in Markmez)
  // Sit prominently in the main view alongside the first 3 categories (e.g. Work, AI, Finance)
  const splitIndex = 3;
  let colIndex = 0;
  let widgetsAppended = false;

  for (const colId of columnOrder) {
    const col = layout.columns[colId];
    if (col) {
      fragment.appendChild(createColumnElement(col, cardsMap, workspaceId, layout));
      colIndex++;
      if (colIndex === splitIndex) {
        for (const wCard of widgetCards) {
          fragment.appendChild(wCard);
        }
        widgetsAppended = true;
      }
    }
  }

  if (!widgetsAppended) {
    for (const wCard of widgetCards) {
      fragment.appendChild(wCard);
    }
  }

  // Ghost '+' Tile (Step 7 of redesign guide, inspired by Image 2 "Create a room")
  const ghostTile = document.createElement('div');
  ghostTile.className = 'ghost-tile create-room-tile t-1x1 glass';
  ghostTile.setAttribute('role', 'button');
  ghostTile.tabIndex = 0;
  ghostTile.title = 'Create a collection';
  ghostTile.setAttribute('aria-label', 'Create a collection');
  ghostTile.innerHTML = `
    <div class="ghost-tile-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </div>
    <span class="ghost-tile-label">Create a collection</span>
  `;
  const handleGhostCreate = () => promptAddColumn(workspaceId);
  ghostTile.addEventListener('click', handleGhostCreate);
  ghostTile.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleGhostCreate();
    }
  });
  fragment.appendChild(ghostTile);

  boardContainer.innerHTML = '';
  boardContainer.appendChild(fragment);

  syncRailState(layout);
}

/**
 * Returns the curated Markmez starter categories with brand bookmarks and favicons:
 * Work, AI, Finance, Learn, Entertainment, Social, News.
 */
function getMarkmezStarterData() {
  const categories = [
    {
      id: 'col_work',
      title: 'Work',
      color: '#536b44',
      emoji: '💼',
      items: [
        { title: 'Gmail', url: 'https://mail.google.com', host: 'mail.google.com' },
        { title: 'GitHub', url: 'https://github.com', host: 'github.com' },
        { title: 'Notion', url: 'https://www.notion.so', host: 'notion.so' },
        { title: 'Slack', url: 'https://slack.com', host: 'slack.com' },
        { title: 'Figma', url: 'https://www.figma.com', host: 'figma.com' },
      ],
    },
    {
      id: 'col_ai',
      title: 'AI',
      color: '#6366f1',
      emoji: '✨',
      items: [
        { title: 'ChatGPT', url: 'https://chatgpt.com', host: 'chatgpt.com' },
        { title: 'Claude', url: 'https://claude.ai', host: 'claude.ai' },
        { title: 'Perplexity', url: 'https://www.perplexity.ai', host: 'perplexity.ai' },
        { title: 'Midjourney', url: 'https://www.midjourney.com', host: 'midjourney.com' },
      ],
    },
    {
      id: 'col_finance',
      title: 'Finance',
      color: '#10b981',
      emoji: '📈',
      items: [
        { title: 'Stripe', url: 'https://dashboard.stripe.com', host: 'stripe.com' },
        { title: 'Robinhood', url: 'https://robinhood.com', host: 'robinhood.com' },
        { title: 'Bloomberg', url: 'https://www.bloomberg.com', host: 'bloomberg.com' },
        { title: 'CoinMarketCap', url: 'https://coinmarketcap.com', host: 'coinmarketcap.com' },
      ],
    },
    {
      id: 'col_learn',
      title: 'Learn',
      color: '#0ea5e9',
      emoji: '📚',
      items: [
        { title: 'YouTube', url: 'https://www.youtube.com', host: 'youtube.com' },
        { title: 'Coursera', url: 'https://www.coursera.org', host: 'coursera.org' },
        { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', host: 'developer.mozilla.org' },
        { title: 'Wikipedia', url: 'https://www.wikipedia.org', host: 'wikipedia.org' },
      ],
    },
    {
      id: 'col_entertainment',
      title: 'Entertainment',
      color: '#ec4899',
      emoji: '🍿',
      items: [
        { title: 'Netflix', url: 'https://www.netflix.com', host: 'netflix.com' },
        { title: 'Spotify', url: 'https://open.spotify.com', host: 'spotify.com' },
        { title: 'Twitch', url: 'https://www.twitch.tv', host: 'twitch.tv' },
        { title: 'Reddit', url: 'https://www.reddit.com', host: 'reddit.com' },
      ],
    },
    {
      id: 'col_social',
      title: 'Social',
      color: '#f59e0b',
      emoji: '💬',
      items: [
        { title: 'X / Twitter', url: 'https://x.com', host: 'x.com' },
        { title: 'LinkedIn', url: 'https://www.linkedin.com', host: 'linkedin.com' },
        { title: 'Discord', url: 'https://discord.com', host: 'discord.com' },
        { title: 'Threads', url: 'https://www.threads.net', host: 'threads.net' },
      ],
    },
    {
      id: 'col_news',
      title: 'News',
      color: '#64748b',
      emoji: '📰',
      items: [
        { title: 'Hacker News', url: 'https://news.ycombinator.com', host: 'news.ycombinator.com' },
        { title: 'TechCrunch', url: 'https://techcrunch.com', host: 'techcrunch.com' },
        { title: 'The Verge', url: 'https://www.theverge.com', host: 'theverge.com' },
      ],
    },
  ];

  const layout = {
    columnOrder: categories.map((c) => c.id),
    columns: {},
  };
  const cards = {};

  categories.forEach((cat) => {
    const cardIds = [];
    cat.items.forEach((item, idx) => {
      const cardId = `card_starter_${cat.id}_${idx}`;
      cardIds.push(cardId);
      cards[cardId] = {
        id: cardId,
        type: 'link',
        title: item.title,
        url: item.url,
        nurl: normalizeUrl(item.url),
        host: item.host,
        createdAt: Date.now(),
      };
    });

    layout.columns[cat.id] = {
      id: cat.id,
      title: cat.title,
      color: cat.color,
      emoji: cat.emoji,
      collapsed: false,
      sort: 'manual',
      system: cat.id === 'col_work' ? 'inbox' : undefined,
      cardIds,
    };
  });

  return { layout, cards };
}

/**
 * Loads and renders the board from storage shards.
 */
async function loadAndRender() {
  try {
    await initStoreIfNeeded();

    const metaShard = await new Promise((res) => chrome.storage.local.get('meta', res));
    currentMeta = metaShard?.meta || createDefaultMeta();
    currentMeta.settings = currentMeta.settings || {};

    const userWidgets = currentMeta.settings.widgets;
    const hasAnyNewWidget =
      Array.isArray(userWidgets) &&
      userWidgets.some((w) => ['weather', 'focus-today', 'pomodoro', 'calendar'].includes(w));

    if (!Array.isArray(userWidgets) || userWidgets.length === 0 || !hasAnyNewWidget) {
      currentMeta.settings.widgets = [...ALL_MARKMEZ_WIDGETS];
      currentMeta.lastWriter = CONTEXT_ID;
      await chrome.storage.local.set({ meta: currentMeta });
    }

    const activeWsId = currentMeta.activeWorkspaceId || 'ws_default';

    renderWorkspaceTabs(currentMeta);

    const wsShards = await new Promise((res) =>
      chrome.storage.local.get([`ws:${activeWsId}`, `cards:${activeWsId}`], res)
    );

    currentLayout = wsShards?.[`ws:${activeWsId}`];
    currentCards = wsShards?.[`cards:${activeWsId}`] || {};

    // Auto-seed starter pack if ws_default has 0 cards and empty default columns
    if (
      activeWsId === 'ws_default' &&
      Object.keys(currentCards).length === 0 &&
      (!currentLayout ||
        !currentLayout.columnOrder ||
        currentLayout.columnOrder.every(
          (cId) =>
            ['col_inbox', 'col_dev', 'col_read'].includes(cId) &&
            (!currentLayout.columns[cId] || (currentLayout.columns[cId].cardIds || []).length === 0)
        ))
    ) {
      const starter = getMarkmezStarterData();
      currentLayout = starter.layout;
      currentCards = starter.cards;
      await chrome.storage.local.set({
        [`ws:${activeWsId}`]: currentLayout,
        [`cards:${activeWsId}`]: currentCards,
      });
    }

    if (!currentLayout || !currentLayout.columns || !currentLayout.columnOrder) {
      if (activeWsId === 'ws_projects') {
        currentLayout = {
          columnOrder: ['col_active_projects', 'col_backlog_projects', 'col_completed_projects'],
          columns: {
            col_active_projects: {
              id: 'col_active_projects',
              title: 'Active Projects',
              color: '#536b44',
              emoji: '🚀',
              collapsed: false,
              sort: 'manual',
              cardIds: [],
            },
            col_backlog_projects: {
              id: 'col_backlog_projects',
              title: 'Ideas & Backlog',
              color: '#6366f1',
              emoji: '💡',
              collapsed: false,
              sort: 'manual',
              cardIds: [],
            },
            col_completed_projects: {
              id: 'col_completed_projects',
              title: 'Shipped',
              color: '#10b981',
              emoji: '✅',
              collapsed: false,
              sort: 'manual',
              cardIds: [],
            },
          },
        };
      } else {
        currentLayout = createDefaultWorkspaceLayout(activeWsId);
      }
      await chrome.storage.local.set({ [`ws:${activeWsId}`]: currentLayout });
    }

    applyTheme(currentMeta.settings?.theme || 'dark');
    applyPalette(currentMeta.settings?.palette || localStorage.getItem('arc_palette') || 'lavender');
    applyViewMode(currentMeta.settings?.viewMode || 'bento');
    const activeWs = (currentMeta.workspaces || []).find((w) => w.id === activeWsId);
    applyWallpaper(currentMeta.settings, activeWs);

    // Sync chrome states
    updateWeatherChip();
    renderWorkspaceTabs(currentMeta);
    renderBottomDock(currentMeta);

    // Sync rail button states
    syncRailState(currentLayout);

    renderBoard(currentLayout, currentCards, activeWsId);

    // Mount Zen Top-Bar Widgets
    if (topWidgetsContainer) {
      mountTopBarWidgets(topWidgetsContainer, {
        meta: currentMeta,
        onSaveSettings: async (key, val) => {
          currentMeta.settings = currentMeta.settings || {};
          currentMeta.settings[key] = val;
          currentMeta.lastWriter = CONTEXT_ID;
          await chrome.storage.local.set({ meta: currentMeta });
        },
      });
    }

    applyFocusModeUI(currentMeta?.settings?.focusMode || 'WORK');
    if (railTriageBadge) {
      const inboxCol = Object.values(currentLayout?.columns || {}).find(c => c.system === 'inbox' || c.id === 'col_inbox' || c.title?.toLowerCase() === 'inbox');
      railTriageBadge.style.display = (inboxCol?.cardIds?.length > 0) ? 'block' : 'none';
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
    expandDynamicIsland();
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
initDynamicLivePill();
loadAndRender();
