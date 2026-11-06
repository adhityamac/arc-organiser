/**
 * Minimal Board Tab - Import, Export & Merge Engine
 * Handles full JSON backup export/import, Netscape HTML bookmark parsing,
 * and deterministic entity conflict resolution.
 */

import { isValidUrl, normalizeUrl, extractHost } from './url.js';

/**
 * Parses Netscape bookmark HTML format (used by Chrome, Firefox, Safari, Edge exports).
 *
 * @param {string} htmlText
 * @returns {Array<{ folder: string, links: Array<{ title: string, url: string, addDate?: number }> }>}
 */
export function parseNetscapeBookmarks(htmlText) {
  if (!htmlText || typeof htmlText !== 'string') return [];

  const folders = [];
  let currentFolder = 'Imported Bookmarks';

  // Split lines
  const lines = htmlText.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Match Folder heading: <H3 ...>Folder Title</H3>
    const folderMatch = trimmed.match(/<H3[^>]*>([^<]+)<\/H3>/i);
    if (folderMatch) {
      currentFolder = folderMatch[1].trim() || 'Bookmarks';
      continue;
    }

    // Match Bookmark link: <A HREF="url" ...>Title</A>
    const linkMatch = trimmed.match(/<A\s+HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i);
    if (linkMatch) {
      const url = linkMatch[1].trim();
      const title = linkMatch[2].trim();

      if (isValidUrl(url)) {
        let folderObj = folders.find((f) => f.folder === currentFolder);
        if (!folderObj) {
          folderObj = { folder: currentFolder, links: [] };
          folders.push(folderObj);
        }

        folderObj.links.push({
          title: title || extractHost(url) || url,
          url,
        });
      }
    }
  }

  return folders;
}

/**
 * Validates the structure of an imported JSON backup object.
 * @param {any} data
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBackupJson(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not a valid JSON object.' };
  }
  if (!data.meta || typeof data.meta !== 'object') {
    return { valid: false, error: 'Backup is missing metadata shard.' };
  }
  if (!data.meta.workspaces || !Array.isArray(data.meta.workspaces)) {
    return { valid: false, error: 'Backup is missing workspaces definition.' };
  }
  return { valid: true };
}

/**
 * Merges imported backup data with existing storage shards.
 * Supports 'merge' and 'overwrite' modes.
 *
 * @param {Record<string, any>} currentShards
 * @param {Record<string, any>} importedData
 * @param {'merge' | 'overwrite'} mode
 * @returns {{ mergedShards: Record<string, any>, stats: object }}
 */
export function mergeBackupData(currentShards, importedData, mode = 'merge') {
  const validation = validateBackupJson(importedData);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const stats = {
    workspacesAdded: 0,
    columnsAdded: 0,
    cardsAdded: 0,
    duplicatesSkipped: 0,
  };

  if (mode === 'overwrite') {
    // In overwrite mode, adopt imported data completely while ensuring clean keys
    const mergedShards = { ...importedData };
    if (!mergedShards.trash) mergedShards.trash = [];

    // Count statistics
    for (const ws of importedData.meta.workspaces) {
      stats.workspacesAdded++;
      const layout = importedData[`ws:${ws.id}`];
      if (layout && layout.columns) {
        stats.columnsAdded += Object.keys(layout.columns).length;
      }
      const cards = importedData[`cards:${ws.id}`];
      if (cards) {
        stats.cardsAdded += Object.keys(cards).length;
      }
    }

    return { mergedShards, stats };
  }

  // mode === 'merge'
  const mergedShards = { ...currentShards };
  const currentMeta = mergedShards.meta || { workspaces: [] };
  const existingWsIds = new Set((currentMeta.workspaces || []).map((w) => w.id));

  // Collect all known normalized URLs across current cards to skip duplicates
  const existingNurls = new Set();
  for (const ws of currentMeta.workspaces) {
    const cards = mergedShards[`cards:${ws.id}`] || {};
    for (const card of Object.values(cards)) {
      if (card.nurl) existingNurls.add(card.nurl);
    }
  }

  for (const importWs of importedData.meta.workspaces) {
    let targetWsId = importWs.id;

    if (!existingWsIds.has(targetWsId)) {
      // Add new workspace
      currentMeta.workspaces.push(importWs);
      existingWsIds.add(targetWsId);
      mergedShards[`ws:${targetWsId}`] = { columnOrder: [], columns: {} };
      mergedShards[`cards:${targetWsId}`] = {};
      stats.workspacesAdded++;
    }

    const currentLayout = mergedShards[`ws:${targetWsId}`] || { columnOrder: [], columns: {} };
    const currentCards = mergedShards[`cards:${targetWsId}`] || {};
    const importLayout = importedData[`ws:${importWs.id}`];
    const importCards = importedData[`cards:${importWs.id}`] || {};

    if (importLayout && importLayout.columns) {
      for (const [colId, col] of Object.entries(importLayout.columns)) {
        let targetCol = currentLayout.columns[colId];
        if (!targetCol) {
          targetCol = {
            id: col.id,
            title: col.title,
            color: col.color || '#3b82f6',
            emoji: col.emoji || '📌',
            collapsed: !!col.collapsed,
            sort: col.sort || 'manual',
            system: col.system,
            cardIds: [],
          };
          currentLayout.columns[col.id] = targetCol;
          currentLayout.columnOrder.push(col.id);
          stats.columnsAdded++;
        }

        for (const cardId of col.cardIds || []) {
          const importCard = importCards[cardId];
          if (!importCard) continue;

          const nurl = importCard.nurl || (importCard.url ? normalizeUrl(importCard.url) : '');
          if (nurl && existingNurls.has(nurl)) {
            stats.duplicatesSkipped++;
            continue;
          }

          const newCardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          currentCards[newCardId] = {
            ...importCard,
            id: newCardId,
            nurl,
            createdAt: importCard.createdAt || Date.now(),
            updatedAt: Date.now(),
          };
          targetCol.cardIds.push(newCardId);
          if (nurl) existingNurls.add(nurl);
          stats.cardsAdded++;
        }
      }
    }

    mergedShards[`ws:${targetWsId}`] = currentLayout;
    mergedShards[`cards:${targetWsId}`] = currentCards;
  }

  mergedShards.meta = currentMeta;
  return { mergedShards, stats };
}

/**
 * Converts a set of Netscape bookmark folders into workspace columns and cards.
 *
 * @param {Array<{ folder: string, links: Array<{ title: string, url: string }> }>} folders
 * @param {string} targetWorkspaceId
 * @param {Record<string, any>} currentShards
 * @returns {{ updatedShards: Record<string, any>, importedCount: number }}
 */
export function importNetscapeFolders(folders, targetWorkspaceId, currentShards) {
  const wsKey = `ws:${targetWorkspaceId}`;
  const cardsKey = `cards:${targetWorkspaceId}`;

  const layout = currentShards[wsKey] || { columnOrder: [], columns: {} };
  const cards = currentShards[cardsKey] || {};
  let importedCount = 0;

  for (const folder of folders) {
    const colId = `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cardIds = [];

    for (const link of folder.links) {
      if (!isValidUrl(link.url)) continue;
      const cardId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const host = extractHost(link.url);
      const nurl = normalizeUrl(link.url);

      cards[cardId] = {
        id: cardId,
        type: 'link',
        title: link.title || host || link.url,
        url: link.url,
        nurl,
        host,
        note: '',
        tags: [],
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastOpenedAt: null,
        openCount: 0,
      };
      cardIds.push(cardId);
      importedCount++;
    }

    layout.columnOrder.push(colId);
    layout.columns[colId] = {
      id: colId,
      title: folder.folder,
      color: '#3b82f6',
      emoji: '📁',
      collapsed: false,
      sort: 'manual',
      cardIds,
    };
  }

  return {
    updatedShards: {
      [wsKey]: layout,
      [cardsKey]: cards,
    },
    importedCount,
  };
}
