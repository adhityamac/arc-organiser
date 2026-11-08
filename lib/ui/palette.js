/**
 * Minimal Board Tab - Spotlight / Raycast Style Command Palette
 * Pure ES module. Handles card search, command mode (>), and live tab search (@).
 */

import { searchCards } from '../search.js';
import { undoLastAction } from '../store.js';

let activePaletteEl = null;
let lastFocusedElement = null;
let selectedIndex = 0;
let currentResults = [];

export function closePalette() {
  if (activePaletteEl) {
    activePaletteEl.remove();
    activePaletteEl = null;
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    try {
      lastFocusedElement.focus();
    } catch {}
    lastFocusedElement = null;
  }
}

/**
 * Opens the Command Palette modal.
 *
 * @param {object} options
 * @param {Array<object>} options.cards - All cards in current workspace or all workspaces
 * @param {object} options.meta - Metadata containing workspaces and settings
 * @param {Function} options.onNavigate - Callback when switching workspace or opening link
 * @param {Function} options.showToast - Toast notifier
 */
export function openCommandPalette({ cards, meta, onNavigate, showToast }) {
  closePalette();
  lastFocusedElement = document.activeElement;

  const backdrop = document.createElement('div');
  backdrop.className = 'palette-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Command Palette');

  const container = document.createElement('div');
  container.className = 'palette-modal';

  const inputRow = document.createElement('div');
  inputRow.className = 'palette-input-row';

  const icon = document.createElement('span');
  icon.className = 'palette-icon';
  icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
  inputRow.appendChild(icon);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'palette-input';
  input.placeholder = "Type to search cards, '>' for commands, '@' for open tabs...";
  input.setAttribute('aria-label', 'Search cards, commands, and open tabs');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'palette-results-list');
  inputRow.appendChild(input);

  const escHint = document.createElement('kbd');
  escHint.className = 'shortcut-pill';
  escHint.textContent = 'ESC';
  escHint.setAttribute('aria-hidden', 'true');
  inputRow.appendChild(escHint);

  container.appendChild(inputRow);

  const resultsList = document.createElement('div');
  resultsList.id = 'palette-results-list';
  resultsList.className = 'palette-results';
  resultsList.setAttribute('role', 'listbox');
  resultsList.setAttribute('aria-label', 'Search results');
  container.appendChild(resultsList);

  const footer = document.createElement('div');
  footer.className = 'palette-footer';
  footer.innerHTML = `
    <span><kbd>↑</kbd> <kbd>↓</kbd> navigate</span>
    <span><kbd>↵</kbd> select</span>
    <span><kbd>ctrl</kbd>+<kbd>↵</kbd> open all</span>
    <span><kbd>&gt;</kbd> commands</span>
    <span><kbd>@</kbd> tabs</span>
  `;
  container.appendChild(footer);

  backdrop.appendChild(container);
  document.body.appendChild(backdrop);
  activePaletteEl = backdrop;

  input.focus();

  // Backdrop click to close
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closePalette();
  });

  // Render search results or commands
  async function updateResults() {
    const rawVal = input.value.trim();
    resultsList.innerHTML = '';
    selectedIndex = 0;
    currentResults = [];

    // 1. Tab Search Mode: prefix '@'
    if (rawVal.startsWith('@')) {
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
      const tabQuery = rawVal.slice(1).trim().toLowerCase();
      const allTabs = await chrome.tabs.query({});
      const matchedTabs = allTabs.filter(
        (t) =>
          !tabQuery ||
          (t.title && t.title.toLowerCase().includes(tabQuery)) ||
          (t.url && t.url.toLowerCase().includes(tabQuery))
      ).slice(0, 20);

      currentResults = matchedTabs.map((t) => ({
        type: 'tab',
        title: t.title || t.url,
        subtitle: t.url,
        action: async () => {
          await chrome.tabs.update(t.id, { active: true });
          if (t.windowId) await chrome.windows.update(t.windowId, { focused: true });
          closePalette();
        },
      }));
    }
    // 2. Command Mode: prefix '>'
    else if (rawVal.startsWith('>')) {
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;
      const cmdQuery = rawVal.slice(1).trim().toLowerCase();
      const commands = [
        {
          id: 'undo',
          title: 'Undo Last Save or Action',
          subtitle: 'Revert the most recent bookmark save or deletion',
          action: async () => {
            const res = await undoLastAction();
            if (res) showToast('Last action undone');
            else showToast('Nothing to undo');
            closePalette();
          },
        },
        {
          id: 'settings',
          title: 'Open Settings & Options',
          subtitle: 'Configure preferences, shortcuts, and privacy',
          action: () => {
            closePalette();
            if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
            else window.open(chrome.runtime.getURL('options.html'));
          },
        },
        {
          id: 'new-col',
          title: 'Create New Column',
          subtitle: 'Add a new column to the current workspace',
          action: () => {
            closePalette();
            document.getElementById('add-column-btn')?.click();
          },
        },
        {
          id: 'theme-toggle',
          title: 'Toggle Theme (Dark / Light)',
          subtitle: 'Switch application color palette',
          action: async () => {
            const currentTheme = meta.settings?.theme || 'dark';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            meta.settings = meta.settings || {};
            meta.settings.theme = nextTheme;
            await chrome.storage.local.set({ meta });
            showToast(`Theme changed to ${nextTheme}`);
            closePalette();
          },
        },
      ];

      for (const ws of meta.workspaces || []) {
        commands.push({
          id: `ws_${ws.id}`,
          title: `Switch Workspace: ${ws.name}`,
          subtitle: `Jump to the "${ws.name}" board`,
          action: async () => {
            meta.activeWorkspaceId = ws.id;
            await chrome.storage.local.set({ meta });
            closePalette();
          },
        });
      }

      currentResults = commands.filter(
        (c) => !cmdQuery || c.title.toLowerCase().includes(cmdQuery) || c.subtitle.toLowerCase().includes(cmdQuery)
      );
    }
    // 3. Normal Card Search Mode
    else {
      icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
      const matchedCards = searchCards(cards, rawVal, {}, 30);
      currentResults = matchedCards.map((c) => ({
        type: 'card',
        card: c,
        title: c.title || c.host || c.url || 'Untitled',
        subtitle: c.type === 'note' ? (c.body || 'Note Card') : (c.host || c.url),
        action: () => {
          if (c.url) {
            window.open(c.url, '_blank', 'noopener,noreferrer');
          }
          closePalette();
        },
      }));
    }

    renderItems();
  }

  function renderItems() {
    resultsList.innerHTML = '';
    if (currentResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = 'No matching cards, commands, or tabs.';
      resultsList.appendChild(empty);
      return;
    }

    currentResults.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = `palette-item ${idx === selectedIndex ? 'selected' : ''}`;
      el.dataset.index = String(idx);
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');

      const titleEl = document.createElement('div');
      titleEl.className = 'palette-item-title';
      titleEl.textContent = item.title;
      el.appendChild(titleEl);

      if (item.subtitle) {
        const subEl = document.createElement('div');
        subEl.className = 'palette-item-subtitle';
        subEl.textContent = item.subtitle;
        el.appendChild(subEl);
      }

      el.addEventListener('click', () => {
        item.action();
      });

      el.addEventListener('mouseenter', () => {
        selectedIndex = idx;
        highlightSelected();
      });

      resultsList.appendChild(el);
    });
  }

  function highlightSelected() {
    const items = resultsList.querySelectorAll('.palette-item');
    items.forEach((el, idx) => {
      const isSelected = idx === selectedIndex;
      el.classList.toggle('selected', isSelected);
      el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
    const activeItem = items[selectedIndex];
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('input', updateResults);

  // Key navigation
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % Math.max(1, currentResults.length);
      highlightSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentResults.length) % Math.max(1, currentResults.length);
      highlightSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && currentResults.length > 0) {
        // Open all link matches
        const linkResults = currentResults.filter((r) => r.type === 'card' && r.card.url);
        if (linkResults.length > 20 && !confirm(`Open ${linkResults.length} tabs simultaneously?`)) {
          return;
        }
        for (const item of linkResults) {
          chrome.tabs.create({ url: item.card.url, active: false });
        }
        closePalette();
      } else if (currentResults[selectedIndex]) {
        currentResults[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      closePalette();
    }
  });

  updateResults();
}
