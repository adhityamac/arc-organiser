/**
 * Minimal Board Tab - Open-Tab Drawer Sidebar
 * Real-time list of open browser tabs grouped by window with drag-to-board,
 * instant save, and save & close capabilities.
 */

import { saveCard } from '../store.js';
import { isValidUrl, normalizeUrl, extractHost } from '../url.js';

let drawerContainerEl = null;
let isOpen = false;
let boundTabsListener = null;

/**
 * Toggles visibility of the Open-Tab Drawer.
 */
export function toggleTabDrawer(getActiveWorkspaceId, showToast, onSaved) {
  if (isOpen) {
    closeTabDrawer();
  } else {
    openTabDrawer(getActiveWorkspaceId, showToast, onSaved);
  }
}

export function closeTabDrawer() {
  if (drawerContainerEl) {
    drawerContainerEl.remove();
    drawerContainerEl = null;
  }
  if (boundTabsListener) {
    chrome.tabs.onCreated.removeListener(boundTabsListener);
    chrome.tabs.onRemoved.removeListener(boundTabsListener);
    chrome.tabs.onUpdated.removeListener(boundTabsListener);
    boundTabsListener = null;
  }
  isOpen = false;
}

export async function openTabDrawer(getActiveWorkspaceId, showToast, onSaved) {
  closeTabDrawer();
  isOpen = true;

  drawerContainerEl = document.createElement('aside');
  drawerContainerEl.className = 'tab-drawer-sidebar';
  drawerContainerEl.setAttribute('role', 'complementary');
  drawerContainerEl.setAttribute('aria-label', 'Open Tabs Drawer');

  const header = document.createElement('div');
  header.className = 'drawer-header';

  const title = document.createElement('h3');
  title.className = 'drawer-title';
  title.textContent = 'Open Tabs';
  header.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-icon';
  closeBtn.textContent = '×';
  closeBtn.title = 'Close Drawer (t or Esc)';
  closeBtn.addEventListener('click', closeTabDrawer);
  header.appendChild(closeBtn);

  drawerContainerEl.appendChild(header);

  const tabsList = document.createElement('div');
  tabsList.className = 'drawer-tabs-list';
  drawerContainerEl.appendChild(tabsList);

  document.body.appendChild(drawerContainerEl);

  async function renderTabs() {
    tabsList.innerHTML = '';
    const allTabs = await chrome.tabs.query({});
    const windowsMap = new Map();

    for (const tab of allTabs) {
      if (!windowsMap.has(tab.windowId)) {
        windowsMap.set(tab.windowId, []);
      }
      windowsMap.get(tab.windowId).push(tab);
    }

    let winIndex = 1;
    for (const [windowId, tabs] of windowsMap.entries()) {
      const winHeader = document.createElement('div');
      winHeader.className = 'drawer-window-header';
      winHeader.textContent = `Window ${winIndex++} (${tabs.length} tabs)`;
      tabsList.appendChild(winHeader);

      for (const tab of tabs) {
        if (!tab.url || !isValidUrl(tab.url)) continue;

        const host = extractHost(tab.url);
        const item = document.createElement('div');
        item.className = 'drawer-tab-item';
        item.draggable = true;

        // Set drag data so tab can be dropped directly onto any column
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/uri-list', tab.url);
          e.dataTransfer.setData('text/plain', tab.url);
          e.dataTransfer.effectAllowed = 'copy';
        });

        // Tab Info
        const info = document.createElement('div');
        info.className = 'drawer-tab-info';

        const tabTitle = document.createElement('div');
        tabTitle.className = 'drawer-tab-title';
        tabTitle.textContent = tab.title || host;
        tabTitle.title = tab.title || tab.url;
        info.appendChild(tabTitle);

        const tabHost = document.createElement('div');
        tabHost.className = 'drawer-tab-host';
        tabHost.textContent = host;
        info.appendChild(tabHost);

        item.appendChild(info);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'drawer-tab-actions';

        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-subtle';
        saveBtn.style.padding = '3px 8px';
        saveBtn.style.fontSize = '11px';
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
          const wsId = getActiveWorkspaceId();
          const nurl = normalizeUrl(tab.url);
          await saveCard({
            cardData: {
              title: tab.title || host,
              url: tab.url,
              nurl,
              host,
            },
            workspaceId: wsId,
            prepend: true,
          });
          showToast(`Saved to Inbox`);
          if (onSaved) onSaved();
        });
        actions.appendChild(saveBtn);

        const saveCloseBtn = document.createElement('button');
        saveCloseBtn.className = 'btn-subtle';
        saveCloseBtn.style.padding = '3px 8px';
        saveCloseBtn.style.fontSize = '11px';
        saveCloseBtn.textContent = 'Save & Close';
        saveCloseBtn.addEventListener('click', async () => {
          const wsId = getActiveWorkspaceId();
          const nurl = normalizeUrl(tab.url);
          await saveCard({
            cardData: {
              title: tab.title || host,
              url: tab.url,
              nurl,
              host,
            },
            workspaceId: wsId,
            prepend: true,
          });
          if (tab.id) await chrome.tabs.remove(tab.id);
          showToast(`Saved & closed`);
          if (onSaved) onSaved();
          renderTabs();
        });
        actions.appendChild(saveCloseBtn);

        item.appendChild(actions);
        tabsList.appendChild(item);
      }
    }
  }

  await renderTabs();

  // Listen to tab events for real-time reactivity
  boundTabsListener = () => {
    if (isOpen) renderTabs();
  };
  chrome.tabs.onCreated.addListener(boundTabsListener);
  chrome.tabs.onRemoved.addListener(boundTabsListener);
  chrome.tabs.onUpdated.addListener(boundTabsListener);
}
