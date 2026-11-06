/**
 * Options, Backups, and Portability Controller for Minimal Board Tab.
 */

import { initStoreIfNeeded, transaction } from './lib/store.js';
import {
  parseNetscapeBookmarks,
  validateBackupJson,
  mergeBackupData,
  importNetscapeFolders,
} from './lib/merge.js';
import { saveSnapshot, listSnapshots, getSnapshot } from './lib/db.js';

// DOM Hooks
const closeTabOnQuickSaveEl = document.getElementById('closeTabOnQuickSave');
const openLinksInNewTabEl = document.getElementById('openLinksInNewTab');
const dedupeScopeEl = document.getElementById('dedupeScope');
const stripTrackingParamsEl = document.getElementById('stripTrackingParams');
const toolbarClickActionEl = document.getElementById('toolbarClickAction');
const trashRetentionDaysEl = document.getElementById('trashRetentionDays');
const staleAfterDaysEl = document.getElementById('staleAfterDays');
const storageFootprintDisplay = document.getElementById('storageFootprintDisplay');

const exportBackupBtn = document.getElementById('exportBackupBtn');
const importJsonBtn = document.getElementById('importJsonBtn');
const importJsonInput = document.getElementById('importJsonInput');
const importHtmlBtn = document.getElementById('importHtmlBtn');
const importHtmlInput = document.getElementById('importHtmlInput');
const importNativeBookmarksBtn = document.getElementById('importNativeBookmarksBtn');

const snapshotsList = document.getElementById('snapshotsList');
const trashList = document.getElementById('trashList');
const emptyTrashBtn = document.getElementById('emptyTrashBtn');

async function loadSettings() {
  await initStoreIfNeeded();
  const shards = await new Promise((res) => chrome.storage.local.get(null, res));
  const meta = shards.meta || {};
  const settings = meta.settings || {};

  closeTabOnQuickSaveEl.checked = !!settings.closeTabOnQuickSave;
  openLinksInNewTabEl.checked = settings.openLinksInNewTab !== false;
  dedupeScopeEl.value = settings.dedupeScope || 'workspace';
  stripTrackingParamsEl.checked = settings.stripTrackingParams !== false;
  toolbarClickActionEl.value = settings.toolbarClickAction || 'save-tab';
  trashRetentionDaysEl.value = settings.trashRetentionDays || 30;
  staleAfterDaysEl.value = settings.staleAfterDays || 14;

  updateStorageMeter();
  renderSnapshots();
  renderTrash(shards.trash || []);
}

function updateStorageMeter() {
  if (chrome.storage.local.getBytesInUse) {
    chrome.storage.local.getBytesInUse((bytes) => {
      const kb = (bytes / 1024).toFixed(1);
      storageFootprintDisplay.textContent = `${kb} KB used`;
    });
  } else {
    storageFootprintDisplay.textContent = 'Supported in browser';
  }
}

async function saveSetting(key, value) {
  await transaction([], (shards, meta) => {
    meta.settings = meta.settings || {};
    meta.settings[key] = value;
    return {};
  });
}

// Settings Listeners
closeTabOnQuickSaveEl.addEventListener('change', () =>
  saveSetting('closeTabOnQuickSave', closeTabOnQuickSaveEl.checked)
);
openLinksInNewTabEl.addEventListener('change', () =>
  saveSetting('openLinksInNewTab', openLinksInNewTabEl.checked)
);
dedupeScopeEl.addEventListener('change', () =>
  saveSetting('dedupeScope', dedupeScopeEl.value)
);
stripTrackingParamsEl.addEventListener('change', () =>
  saveSetting('stripTrackingParams', stripTrackingParamsEl.checked)
);
toolbarClickActionEl.addEventListener('change', () =>
  saveSetting('toolbarClickAction', toolbarClickActionEl.value)
);
trashRetentionDaysEl.addEventListener('change', () => {
  const val = parseInt(trashRetentionDaysEl.value, 10);
  if (!isNaN(val) && val > 0) saveSetting('trashRetentionDays', val);
});
staleAfterDaysEl.addEventListener('change', () => {
  const val = parseInt(staleAfterDaysEl.value, 10);
  if (!isNaN(val) && val > 0) saveSetting('staleAfterDays', val);
});

// 1. Export JSON Backup (FR-6.1)
exportBackupBtn.addEventListener('click', async () => {
  const allShards = await new Promise((res) => chrome.storage.local.get(null, res));
  const jsonStr = JSON.stringify(allShards, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = `minimal-board-backup-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// 2. Import JSON Backup (FR-6.2)
importJsonBtn.addEventListener('click', () => importJsonInput.click());

importJsonInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const parsed = JSON.parse(evt.target.result);
      const validation = validateBackupJson(parsed);
      if (!validation.valid) {
        alert(`Invalid backup file: ${validation.error}`);
        return;
      }

      const modeChoice = confirm(
        "Click [OK] to MERGE this backup with your existing boards.\nClick [Cancel] to OVERWRITE existing boards with this backup."
      ) ? 'merge' : 'overwrite';

      const currentShards = await new Promise((res) => chrome.storage.local.get(null, res));

      // Always snapshot before overwrite
      if (modeChoice === 'overwrite') {
        await saveSnapshot(currentShards, 'pre-overwrite');
        await chrome.storage.local.clear();
      }

      const { mergedShards, stats } = mergeBackupData(currentShards, parsed, modeChoice);
      await chrome.storage.local.set(mergedShards);

      alert(
        `Import completed successfully!\n` +
        `• Workspaces added: ${stats.workspacesAdded}\n` +
        `• Columns added: ${stats.columnsAdded}\n` +
        `• Cards added: ${stats.cardsAdded}\n` +
        `• Duplicates skipped: ${stats.duplicatesSkipped}`
      );
      loadSettings();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
});

// 3. Import Browser HTML Bookmarks (FR-6.3)
importHtmlBtn.addEventListener('click', () => importHtmlInput.click());

importHtmlInput.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const htmlText = evt.target.result;
      const folders = parseNetscapeBookmarks(htmlText);
      if (folders.length === 0) {
        alert('No valid bookmarks found in this HTML file.');
        return;
      }

      const currentShards = await new Promise((res) => chrome.storage.local.get(null, res));
      const activeWsId = currentShards.meta?.activeWorkspaceId || 'ws_default';

      const { updatedShards, importedCount } = importNetscapeFolders(folders, activeWsId, currentShards);
      await chrome.storage.local.set(updatedShards);

      alert(`Successfully imported ${importedCount} bookmarks into ${folders.length} columns!`);
      loadSettings();
    } catch (err) {
      alert(`HTML bookmark import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
});

// 4. Import Native Browser Bookmarks (chrome.bookmarks)
importNativeBookmarksBtn.addEventListener('click', async () => {
  if (!chrome.bookmarks) {
    chrome.permissions.request({ permissions: ['bookmarks'] }, async (granted) => {
      if (granted) runNativeBookmarkImport();
      else alert('Bookmarks permission was denied.');
    });
  } else {
    runNativeBookmarkImport();
  }
});

async function runNativeBookmarkImport() {
  const tree = await chrome.bookmarks.getTree();
  if (!tree || tree.length === 0) return;

  const folders = [];

  function walk(node, folderName) {
    if (node.children) {
      const nextFolder = node.title || folderName || 'Bookmarks';
      for (const child of node.children) {
        walk(child, nextFolder);
      }
    } else if (node.url) {
      let folderObj = folders.find((f) => f.folder === folderName);
      if (!folderObj) {
        folderObj = { folder: folderName || 'Bookmarks', links: [] };
        folders.push(folderObj);
      }
      folderObj.links.push({
        title: node.title || node.url,
        url: node.url,
      });
    }
  }

  walk(tree[0], 'Browser Bookmarks');

  if (folders.length === 0) {
    alert('No bookmarks found to import.');
    return;
  }

  const currentShards = await new Promise((res) => chrome.storage.local.get(null, res));
  const activeWsId = currentShards.meta?.activeWorkspaceId || 'ws_default';

  const { updatedShards, importedCount } = importNetscapeFolders(folders, activeWsId, currentShards);
  await chrome.storage.local.set(updatedShards);

  alert(`Successfully imported ${importedCount} bookmarks into ${folders.length} columns!`);
  loadSettings();
}

// 5. Render Snapshots (FR-6.6)
async function renderSnapshots() {
  try {
    const list = await listSnapshots();
    snapshotsList.innerHTML = '';

    if (list.length === 0) {
      snapshotsList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No snapshots recorded yet.</div>';
      return;
    }

    for (const snap of list) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '6px 10px';
      row.style.background = 'var(--bg-app)';
      row.style.borderRadius = '6px';
      row.style.fontSize = '12px';

      const info = document.createElement('div');
      info.textContent = `${new Date(snap.createdAt).toLocaleString()} · ${snap.reason}`;
      row.appendChild(info);

      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn';
      restoreBtn.style.padding = '3px 8px';
      restoreBtn.style.fontSize = '11px';
      restoreBtn.textContent = 'Restore';
      restoreBtn.addEventListener('click', async () => {
        if (!confirm(`Restore snapshot from ${new Date(snap.createdAt).toLocaleString()}? This will overwrite current boards.`)) return;
        const data = await getSnapshot(snap.id);
        if (data) {
          await chrome.storage.local.clear();
          await chrome.storage.local.set(data);
          alert('Snapshot restored successfully!');
          loadSettings();
        }
      });
      row.appendChild(restoreBtn);

      snapshotsList.appendChild(row);
    }
  } catch {
    snapshotsList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">IndexedDB snapshots unavailable in this view.</div>';
  }
}

// 6. Trash Management (FR-4.4)
function renderTrash(trashItems) {
  trashList.innerHTML = '';
  if (trashItems.length === 0) {
    trashList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">Trash is empty.</div>';
    return;
  }

  for (const item of trashItems) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '6px 10px';
    row.style.background = 'var(--bg-app)';
    row.style.borderRadius = '6px';
    row.style.fontSize = '12px';

    const title = document.createElement('div');
    title.textContent = item.card?.title || 'Deleted Item';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    title.style.whiteSpace = 'nowrap';
    title.style.flex = '1';
    title.style.paddingRight = '12px';
    row.appendChild(title);

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn';
    restoreBtn.style.padding = '2px 8px';
    restoreBtn.style.fontSize = '11px';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', async () => {
      const wsKey = `ws:${item.workspaceId}`;
      const cardsKey = `cards:${item.workspaceId}`;

      await transaction([wsKey, cardsKey, 'trash'], (shards) => {
        const layout = shards[wsKey];
        const cards = shards[cardsKey] || {};
        const trash = shards.trash || [];

        const idx = trash.findIndex((t) => t.card?.id === item.card?.id);
        if (idx !== -1) {
          trash.splice(idx, 1);
          cards[item.card.id] = item.card;
          const col = layout?.columns[item.columnId] || Object.values(layout?.columns || {})[0];
          if (col) col.cardIds.unshift(item.card.id);
        }

        return { [wsKey]: layout, [cardsKey]: cards, trash };
      });

      loadSettings();
    });
    row.appendChild(restoreBtn);

    trashList.appendChild(row);
  }
}

emptyTrashBtn.addEventListener('click', async () => {
  if (!confirm('Permanently purge all items from trash? This cannot be undone.')) return;
  await chrome.storage.local.set({ trash: [] });
  loadSettings();
});

loadSettings();
