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
import { saveSnapshot, listSnapshots, getSnapshot, saveBlob } from './lib/db.js';

// DOM Hooks
const themeSelect = document.getElementById('themeSelect');
const wallpaperSelect = document.getElementById('wallpaperSelect');
const wallpaperUploadInput = document.getElementById('wallpaperUploadInput');
const uploadWallpaperBtn = document.getElementById('uploadWallpaperBtn');
const wallpaperUrlInput = document.getElementById('wallpaperUrlInput');
const applyWallpaperUrlBtn = document.getElementById('applyWallpaperUrlBtn');
const wallpaperDim = document.getElementById('wallpaperDim');
const wallpaperBlur = document.getElementById('wallpaperBlur');
const wallpaperEcoMode = document.getElementById('wallpaperEcoMode');

// Widgets Configuration Hooks
const widgetWeatherEl = document.getElementById('widgetWeather');
const weatherCityInput = document.getElementById('weatherCityInput');
const weatherUnitSelect = document.getElementById('weatherUnitSelect');
const widgetFocusTodayEl = document.getElementById('widgetFocusToday');
const widgetClockEl = document.getElementById('widgetClock');
const clockFormatSelect = document.getElementById('clockFormatSelect');
const widgetPomodoroEl = document.getElementById('widgetPomodoro');
const widgetCalendarEl = document.getElementById('widgetCalendar');

const closeTabOnQuickSaveEl = document.getElementById('closeTabOnQuickSave');
const openLinksInNewTabEl = document.getElementById('openLinksInNewTab');
const dedupeScopeEl = document.getElementById('dedupeScope');
const stripTrackingParamsEl = document.getElementById('stripTrackingParams');
const toolbarClickActionEl = document.getElementById('toolbarClickAction');
const trashRetentionDaysEl = document.getElementById('trashRetentionDays');
const staleAfterDaysEl = document.getElementById('staleAfterDays');
const storageFootprintDisplay = document.getElementById('storageFootprintDisplay');

const addRuleBtn = document.getElementById('addRuleBtn');
const rulesList = document.getElementById('rulesList');
const scanDuplicatesBtn = document.getElementById('scanDuplicatesBtn');
const duplicatesList = document.getElementById('duplicatesList');

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

  themeSelect.value = settings.theme || 'dark';
  const wp = settings.wallpaper || 'preset:mountain';
  const isUrl = wp.startsWith('url:');
  wallpaperSelect.value = isUrl ? 'custom:url' : wp;
  uploadWallpaperBtn.style.display = (wp === 'custom' || wp === 'custom:image' || wp === 'custom:video') ? 'inline-block' : 'none';
  if (wallpaperUrlInput) {
    wallpaperUrlInput.style.display = isUrl ? 'inline-block' : 'none';
    wallpaperUrlInput.value = isUrl ? wp.slice(4) : '';
  }
  if (applyWallpaperUrlBtn) {
    applyWallpaperUrlBtn.style.display = isUrl ? 'inline-block' : 'none';
  }
  wallpaperDim.value = settings.wallpaperDim ?? 15;
  wallpaperBlur.value = settings.wallpaperBlur ?? 0;
  if (wallpaperEcoMode) wallpaperEcoMode.checked = Boolean(settings.wallpaperEcoMode);

  // Widgets
  const enabledWidgets = settings.widgets || ['clock', 'weather', 'focus-today', 'pomodoro', 'calendar'];
  if (widgetWeatherEl) widgetWeatherEl.checked = enabledWidgets.includes('weather');
  if (widgetFocusTodayEl) widgetFocusTodayEl.checked = enabledWidgets.includes('focus-today');
  if (widgetClockEl) widgetClockEl.checked = enabledWidgets.includes('clock');
  if (widgetPomodoroEl) widgetPomodoroEl.checked = enabledWidgets.includes('pomodoro');
  if (widgetCalendarEl) widgetCalendarEl.checked = enabledWidgets.includes('calendar');

  if (weatherCityInput) weatherCityInput.value = settings.weatherCity || 'New York';
  if (weatherUnitSelect) weatherUnitSelect.value = settings.weatherUnit || 'C';
  if (clockFormatSelect) clockFormatSelect.value = settings.clockIs24h ? '24' : '12';

  closeTabOnQuickSaveEl.checked = !!settings.closeTabOnQuickSave;
  openLinksInNewTabEl.checked = settings.openLinksInNewTab !== false;
  dedupeScopeEl.value = settings.dedupeScope || 'workspace';
  stripTrackingParamsEl.checked = settings.stripTrackingParams !== false;
  toolbarClickActionEl.value = settings.toolbarClickAction || 'save-tab';
  trashRetentionDaysEl.value = settings.trashRetentionDays || 30;
  staleAfterDaysEl.value = settings.staleAfterDays || 14;

  updateStorageMeter();
  renderRules(meta.rules || []);
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
    return { meta };
  });
}

// Personalization Listeners
themeSelect.addEventListener('change', () => saveSetting('theme', themeSelect.value));

wallpaperSelect.addEventListener('change', async () => {
  const val = wallpaperSelect.value;
  const isCustomFile = val === 'custom';
  const isUrl = val === 'custom:url';

  uploadWallpaperBtn.style.display = isCustomFile ? 'inline-block' : 'none';
  if (wallpaperUrlInput) wallpaperUrlInput.style.display = isUrl ? 'inline-block' : 'none';
  if (applyWallpaperUrlBtn) applyWallpaperUrlBtn.style.display = isUrl ? 'inline-block' : 'none';

  if (!isUrl) {
    await saveSetting('wallpaper', val);
  }
  if (isCustomFile) {
    wallpaperUploadInput.click();
  }
});

uploadWallpaperBtn.addEventListener('click', () => wallpaperUploadInput.click());

if (applyWallpaperUrlBtn && wallpaperUrlInput) {
  applyWallpaperUrlBtn.addEventListener('click', async () => {
    const rawUrl = wallpaperUrlInput.value.trim();
    if (!rawUrl) return;
    await saveSetting('wallpaper', `url:${rawUrl}`);
    alert('Custom wallpaper streaming URL saved!');
  });
}

wallpaperUploadInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (file.size > 52428800) {
    alert('File exceeds 50MB limit. Please choose a smaller video or image.');
    return;
  }

  // Handle Video Upload (MP4, WebM)
  if (file.type.startsWith('video/')) {
    try {
      await saveBlob('wallpaper_custom', file);
      await saveSetting('wallpaper', 'custom:video');
      alert('Custom live video wallpaper saved successfully!');
    } catch (err) {
      console.error('Error saving video blob:', err);
      alert('Failed to save video to storage.');
    }
    return;
  }

  // Handle Image Upload
  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = async () => {
      // Downscale to max 2560px on canvas to adhere to memory budget
      const maxDim = 2560;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(async (blob) => {
        if (blob) {
          await saveBlob('wallpaper_custom', blob);
          await saveSetting('wallpaper', 'custom:image');
          alert('Custom wallpaper saved successfully!');
        }
      }, 'image/webp', 0.85);
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
});

wallpaperDim.addEventListener('change', () =>
  saveSetting('wallpaperDim', parseInt(wallpaperDim.value, 10))
);
wallpaperDim.addEventListener('input', () =>
  saveSetting('wallpaperDim', parseInt(wallpaperDim.value, 10))
);

wallpaperBlur.addEventListener('change', () =>
  saveSetting('wallpaperBlur', parseInt(wallpaperBlur.value, 10))
);
wallpaperBlur.addEventListener('input', () =>
  saveSetting('wallpaperBlur', parseInt(wallpaperBlur.value, 10))
);

if (wallpaperEcoMode) {
  wallpaperEcoMode.addEventListener('change', () =>
    saveSetting('wallpaperEcoMode', wallpaperEcoMode.checked)
  );
}

// Widgets Listeners
function saveWidgetsConfig() {
  const widgets = [];
  if (widgetClockEl?.checked) widgets.push('clock');
  if (widgetWeatherEl?.checked) widgets.push('weather');
  if (widgetFocusTodayEl?.checked) widgets.push('focus-today');
  if (widgetPomodoroEl?.checked) widgets.push('pomodoro');
  if (widgetCalendarEl?.checked) widgets.push('calendar');
  saveSetting('widgets', widgets);
}

[widgetWeatherEl, widgetFocusTodayEl, widgetClockEl, widgetPomodoroEl, widgetCalendarEl].forEach((el) => {
  if (el) el.addEventListener('change', saveWidgetsConfig);
});

if (weatherCityInput) {
  weatherCityInput.addEventListener('change', () => {
    saveSetting('weatherCity', weatherCityInput.value.trim() || 'New York');
  });
}

if (weatherUnitSelect) {
  weatherUnitSelect.addEventListener('change', () => {
    saveSetting('weatherUnit', weatherUnitSelect.value);
  });
}

if (clockFormatSelect) {
  clockFormatSelect.addEventListener('change', () => {
    saveSetting('clockIs24h', clockFormatSelect.value === '24');
  });
}

// Capture & Behavior Listeners
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

// --------------------------------------------------------------------------
// Auto-Sort Rules Engine (FR-8.3)
// --------------------------------------------------------------------------
function renderRules(rules) {
  rulesList.innerHTML = '';
  if (rules.length === 0) {
    rulesList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">No auto-sort rules defined yet.</div>';
    return;
  }

  rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.background = 'var(--bg-app)';
    row.style.borderRadius = '6px';
    row.style.fontSize = '12px';

    const desc = [];
    if (rule.match.host) desc.push(`Host ends with "${rule.match.host}"`);
    if (rule.match.urlContains) desc.push(`URL contains "${rule.match.urlContains}"`);
    if (rule.match.titleContains) desc.push(`Title contains "${rule.match.titleContains}"`);
    if (rule.match.tag) desc.push(`Has tag #${rule.match.tag}`);

    const targetDesc = rule.toColumn ? ` → Move to "${rule.toColumn}"` : '';
    const tagsDesc = rule.addTags && rule.addTags.length > 0 ? ` + Tags [${rule.addTags.join(', ')}]` : '';

    const textDiv = document.createElement('div');
    textDiv.innerHTML = `<strong>Rule ${idx + 1}:</strong> If ${desc.join(' AND ')}${targetDesc}${tagsDesc}`;
    row.appendChild(textDiv);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.padding = '2px 8px';
    delBtn.style.fontSize = '11px';
    delBtn.style.background = 'var(--accent-danger)';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      await transaction([], (shards, meta) => {
        meta.rules = (meta.rules || []).filter((r) => r.id !== rule.id);
        return { meta };
      });
      loadSettings();
    });
    row.appendChild(delBtn);

    rulesList.appendChild(row);
  });
}

addRuleBtn.addEventListener('click', async () => {
  const host = prompt('Match domain/host (e.g. github.com) or leave blank:');
  const urlContains = prompt('Match URL contains (e.g. /pull/) or leave blank:');
  const toColumn = prompt('Target Column Name (e.g. Dev) or leave blank:');
  const addTagsStr = prompt('Add tags (comma separated, e.g. dev, git) or leave blank:');

  const match = {};
  if (host && host.trim()) match.host = host.trim().toLowerCase();
  if (urlContains && urlContains.trim()) match.urlContains = urlContains.trim().toLowerCase();

  if (Object.keys(match).length === 0) {
    alert('Please specify at least one match criteria.');
    return;
  }

  const addTags = addTagsStr
    ? addTagsStr.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  const newRule = {
    id: `rule_${Date.now()}`,
    match,
    toColumn: toColumn ? toColumn.trim() : null,
    addTags,
  };

  await transaction([], (shards, meta) => {
    meta.rules = meta.rules || [];
    meta.rules.push(newRule);
    return { meta };
  });

  loadSettings();
});

// --------------------------------------------------------------------------
// Duplicate Finder & Cleaner (FR-8.4)
// --------------------------------------------------------------------------
scanDuplicatesBtn.addEventListener('click', async () => {
  duplicatesList.innerHTML = '<div style="font-size: 12px; color: var(--text-muted);">Scanning all workspaces...</div>';

  const allShards = await new Promise((res) => chrome.storage.local.get(null, res));
  const meta = allShards.meta || { workspaces: [] };
  const urlMap = new Map();

  for (const ws of meta.workspaces) {
    const cards = allShards[`cards:${ws.id}`] || {};
    for (const card of Object.values(cards)) {
      if (!card.nurl) continue;
      if (!urlMap.has(card.nurl)) {
        urlMap.set(card.nurl, []);
      }
      urlMap.get(card.nurl).push({ card, workspaceId: ws.id });
    }
  }

  const duplicateGroups = Array.from(urlMap.entries()).filter(([_, list]) => list.length > 1);

  duplicatesList.innerHTML = '';
  if (duplicateGroups.length === 0) {
    duplicatesList.innerHTML = '<div style="font-size: 12px; color: var(--accent-success);">✅ No duplicates found! All saved URLs are unique.</div>';
    return;
  }

  duplicateGroups.forEach(([nurl, items]) => {
    const groupEl = document.createElement('div');
    groupEl.style.padding = '10px';
    groupEl.style.background = 'var(--bg-app)';
    groupEl.style.borderRadius = '6px';
    groupEl.style.display = 'flex';
    groupEl.style.flexDirection = 'column';
    groupEl.style.gap = '6px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.fontSize = '12px';
    header.innerHTML = `<strong>${nurl}</strong> <span style="color: var(--accent-warning);">${items.length} copies</span>`;
    groupEl.appendChild(header);

    const mergeBtn = document.createElement('button');
    mergeBtn.className = 'btn';
    mergeBtn.style.padding = '3px 8px';
    mergeBtn.style.fontSize = '11px';
    mergeBtn.textContent = 'Merge & Keep Latest';
    mergeBtn.addEventListener('click', async () => {
      // Sort items by updatedAt descending
      items.sort((a, b) => (b.card.updatedAt || 0) - (a.card.updatedAt || 0));
      const keepItem = items[0];
      const toRemove = items.slice(1);

      for (const rem of toRemove) {
        const wsKey = `ws:${rem.workspaceId}`;
        const cardsKey = `cards:${rem.workspaceId}`;
        await transaction([wsKey, cardsKey], (shards) => {
          const l = shards[wsKey];
          const c = shards[cardsKey] || {};
          if (l && l.columns) {
            for (const col of Object.values(l.columns)) {
              col.cardIds = col.cardIds.filter((id) => id !== rem.card.id);
            }
          }
          delete c[rem.card.id];
          return { [wsKey]: l, [cardsKey]: c };
        });
      }

      alert('Duplicates merged successfully!');
      scanDuplicatesBtn.click();
    });

    groupEl.appendChild(mergeBtn);
    duplicatesList.appendChild(groupEl);
  });
});

// --------------------------------------------------------------------------
// Export & Import Handlers
// --------------------------------------------------------------------------
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

// --------------------------------------------------------------------------
// Snapshots & Trash Management
// --------------------------------------------------------------------------
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
