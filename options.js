/**
 * Options controller for Minimal Board Tab.
 */

import { initStoreIfNeeded, transaction } from './lib/store.js';

const closeTabOnQuickSaveEl = document.getElementById('closeTabOnQuickSave');
const openLinksInNewTabEl = document.getElementById('openLinksInNewTab');
const dedupeScopeEl = document.getElementById('dedupeScope');
const stripTrackingParamsEl = document.getElementById('stripTrackingParams');
const toolbarClickActionEl = document.getElementById('toolbarClickAction');
const trashRetentionDaysEl = document.getElementById('trashRetentionDays');
const staleAfterDaysEl = document.getElementById('staleAfterDays');

async function loadSettings() {
  await initStoreIfNeeded();
  const shards = await new Promise((res) => chrome.storage.local.get('meta', res));
  const settings = shards.meta?.settings || {};

  closeTabOnQuickSaveEl.checked = !!settings.closeTabOnQuickSave;
  openLinksInNewTabEl.checked = settings.openLinksInNewTab !== false;
  dedupeScopeEl.value = settings.dedupeScope || 'workspace';
  stripTrackingParamsEl.checked = settings.stripTrackingParams !== false;
  toolbarClickActionEl.value = settings.toolbarClickAction || 'save-tab';
  trashRetentionDaysEl.value = settings.trashRetentionDays || 30;
  staleAfterDaysEl.value = settings.staleAfterDays || 14;
}

async function saveSetting(key, value) {
  await transaction([], (shards, meta) => {
    meta.settings = meta.settings || {};
    meta.settings[key] = value;
    return {};
  });
}

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

loadSettings();
