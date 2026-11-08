/**
 * Sharded Storage Engine & Concurrency Manager for Minimal Board Tab.
 * Pure ES module.
 *
 * Sharding model:
 * - 'meta': Global settings, workspaces tree, active workspace ID, rules, saved views, revision, lastWriter ID
 * - 'ws:<workspaceId>': Column layouts and ordered card IDs for a workspace
 * - 'cards:<workspaceId>': Card content map { [cardId]: Card } for a workspace
 * - 'trash': Deleted items archive with retention timestamps
 */

const LOCK_NAME = 'minimal_board_store_lock';
const CURRENT_SCHEMA_VERSION = 2;

// In browser context, generate or retain context ID to ignore echoes
export const CONTEXT_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/**
 * Returns default metadata state.
 */
export function createDefaultMeta() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rev: 1,
    lastWriter: CONTEXT_ID,
    activeWorkspaceId: 'ws_default',
    workspaces: [
      {
        id: 'ws_default',
        parentId: null,
        name: 'Default',
        icon: '⚡',
        order: 0,
      },
    ],
    settings: {
      theme: 'dark', // 'dark' | 'light' | 'auto'
      accent: '#536b44',
      cardDensity: 'comfortable', // 'comfortable' | 'compact'
      viewMode: 'bento', // 'bento' | 'kanban' | 'list'
      closeTabOnQuickSave: false,
      openLinksInNewTab: true,
      dedupeScope: 'workspace', // 'inbox' | 'workspace' | 'all'
      stripTrackingParams: true,
      faviconSource: 'browser', // 'browser' | 'google' | 'none'
      includePinnedInSession: false,
      toolbarClickAction: 'save-tab', // 'save-tab' | 'save-window' | 'open-board'
      trashRetentionDays: 30,
      staleAfterDays: 14,
      widgets: ['clock', 'weather', 'focus-today', 'pomodoro', 'calendar'],
      wallpaper: 'preset:mountain',
      wallpaperDim: 15,
      wallpaperBlur: 0,
    },
    rules: [],
    savedViews: [],
    lastAction: null,
  };
}

/**
 * Returns default layout shard for the default workspace.
 */
export function createDefaultWorkspaceLayout(wsId = 'ws_default') {
  return {
    columnOrder: ['col_inbox', 'col_dev', 'col_read'],
    columns: {
      col_inbox: {
        id: 'col_inbox',
        title: 'Inbox',
        color: '#3b82f6',
        emoji: '📥',
        collapsed: false,
        sort: 'manual',
        system: 'inbox',
        cardIds: [],
      },
      col_dev: {
        id: 'col_dev',
        title: 'Dev',
        color: '#10b981',
        emoji: '💻',
        collapsed: false,
        sort: 'manual',
        cardIds: [],
      },
      col_read: {
        id: 'col_read',
        title: 'Read',
        color: '#8b5cf6',
        emoji: '📖',
        collapsed: false,
        sort: 'manual',
        cardIds: [],
      },
    },
  };
}

/**
 * Resolves standard chrome.storage.local or fallback adapter.
 */
function getStorage(adapter) {
  if (adapter) return adapter;
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return {
      get: (keys) =>
        new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
      set: (items) =>
        new Promise((resolve) => chrome.storage.local.set(items, resolve)),
      remove: (keys) =>
        new Promise((resolve) => chrome.storage.local.remove(keys, resolve)),
      clear: () =>
        new Promise((resolve) => chrome.storage.local.clear(resolve)),
    };
  }
  throw new Error('No storage adapter provided and chrome.storage.local is unavailable.');
}

/**
 * Executes a function under Web Locks concurrency guarantee.
 * Falls back to direct execution if navigator.locks is unavailable (e.g. standard Node test).
 */
export async function withLock(lockName, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return await navigator.locks.request(lockName, fn);
  }
  // Standalone / Node environment: execute directly
  return await fn();
}

/**
 * Atomic transaction runner across sharded storage.
 * Locks the store, fetches requested keys (and always 'meta'), passes them to mutatorFn,
 * increments meta.rev, updates meta.lastWriter, and persists changes atomically.
 *
 * @param {string[]} requiredKeys - Keys required for reading and updating (e.g. ['ws:ws_default', 'cards:ws_default'])
 * @param {(shards: Record<string, any>, meta: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>} mutatorFn
 * @param {object} [adapter]
 * @returns {Promise<{ updatedKeys: string[], meta: object }>}
 */
export async function transaction(requiredKeys, mutatorFn, adapter = null) {
  const storage = getStorage(adapter);
  const keysToFetch = Array.from(new Set(['meta', ...requiredKeys]));

  return await withLock(LOCK_NAME, async () => {
    const rawData = await storage.get(keysToFetch);

    // Initialize meta if missing
    let meta = rawData.meta;
    if (!meta) {
      meta = createDefaultMeta();
    } else {
      meta = { ...meta };
    }

    const shards = { ...rawData, meta };
    const changedShards = await mutatorFn(shards, meta);

    if (!changedShards || Object.keys(changedShards).length === 0) {
      return { updatedKeys: [], meta };
    }

    // Bump revision and set writer context
    meta.rev = (meta.rev || 0) + 1;
    meta.lastWriter = CONTEXT_ID;
    changedShards.meta = meta;

    await storage.set(changedShards);
    return {
      updatedKeys: Object.keys(changedShards),
      meta,
    };
  });
}

/**
 * Initializes default store shards if they don't exist, and runs any needed migrations.
 * @param {object} [adapter]
 * @returns {Promise<boolean>} true if initialized or migrated
 */
export async function initStoreIfNeeded(adapter = null) {
  const storage = getStorage(adapter);
  const existing = await storage.get(['meta', 'appState']);

  // Handle migration from legacy v1 appState if present
  if (existing.appState && (!existing.meta || existing.meta.schemaVersion < 2)) {
    await migrateV1toV2(existing.appState, adapter);
    return true;
  }

  if (!existing.meta) {
    const defaultMeta = createDefaultMeta();
    const defaultLayout = createDefaultWorkspaceLayout('ws_default');
    const initialShards = {
      meta: defaultMeta,
      'ws:ws_default': defaultLayout,
      'cards:ws_default': {},
      trash: [],
    };
    await storage.set(initialShards);
    return true;
  }

  // Ensure meta.settings.widgets is updated if existing store has old legacy list or missing markmez widgets
  const allMarkmezWidgets = ['clock', 'weather', 'focus-today', 'pomodoro', 'calendar'];
  const userWidgets = existing.meta?.settings?.widgets;
  const hasAnyNewWidget =
    Array.isArray(userWidgets) &&
    userWidgets.some((w) => ['weather', 'focus-today', 'pomodoro', 'calendar'].includes(w));

  if (!Array.isArray(userWidgets) || userWidgets.length === 0 || !hasAnyNewWidget) {
    existing.meta.settings = existing.meta.settings || {};
    existing.meta.settings.widgets = allMarkmezWidgets;
    await storage.set({ meta: existing.meta });
    return true;
  }

  return false;
}

/**
 * Migrates monolithic v1 appState into v2 sharded format.
 */
export async function migrateV1toV2(v1State, adapter = null) {
  const storage = getStorage(adapter);
  const meta = createDefaultMeta();
  meta.schemaVersion = 2;
  meta.rev = 1;
  meta.lastWriter = CONTEXT_ID;

  const shardsToSave = { meta };
  const wsList = Array.isArray(v1State.workspaces) && v1State.workspaces.length > 0
    ? v1State.workspaces
    : [{ id: 'ws_default', name: 'Default', icon: '⚡', order: 0 }];

  meta.workspaces = wsList.map((ws, idx) => ({
    id: ws.id || `ws_${idx}`,
    parentId: ws.parentId || null,
    name: ws.name || 'Workspace',
    icon: ws.icon || '⚡',
    order: ws.order ?? idx,
  }));
  meta.activeWorkspaceId = v1State.activeWorkspaceId || meta.workspaces[0].id;

  for (const ws of meta.workspaces) {
    const wsId = ws.id;
    const v1Cols = v1State.columns ? v1State.columns.filter((c) => c.workspaceId === wsId) : [];
    const layout = {
      columnOrder: [],
      columns: {},
    };
    const cardsMap = {};

    if (v1Cols.length > 0) {
      for (const col of v1Cols) {
        layout.columnOrder.push(col.id);
        const cardIds = [];
        const colBookmarks = v1State.bookmarks
          ? v1State.bookmarks.filter((b) => b.columnId === col.id)
          : [];
        for (const bm of colBookmarks) {
          const cardId = bm.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          cardIds.push(cardId);
          cardsMap[cardId] = {
            id: cardId,
            type: bm.type || 'link',
            title: bm.title || '',
            url: bm.url || '',
            nurl: bm.nurl || (bm.url ? bm.url.toLowerCase() : ''),
            host: bm.host || '',
            body: bm.body || '',
            note: bm.note || '',
            tags: bm.tags || [],
            pinned: !!bm.pinned,
            color: bm.color || null,
            createdAt: bm.createdAt || Date.now(),
            updatedAt: bm.updatedAt || Date.now(),
            lastOpenedAt: bm.lastOpenedAt || null,
            openCount: bm.openCount || 0,
          };
        }
        layout.columns[col.id] = {
          id: col.id,
          title: col.title || 'Column',
          color: col.color || '#3b82f6',
          emoji: col.emoji || '📌',
          collapsed: !!col.collapsed,
          sort: col.sort || 'manual',
          system: col.system || (col.title.toLowerCase() === 'inbox' ? 'inbox' : undefined),
          cardIds,
        };
      }
    } else {
      const defaultLayout = createDefaultWorkspaceLayout(wsId);
      layout.columnOrder = defaultLayout.columnOrder;
      layout.columns = defaultLayout.columns;
    }

    shardsToSave[`ws:${wsId}`] = layout;
    shardsToSave[`cards:${wsId}`] = cardsMap;
  }

  shardsToSave.trash = Array.isArray(v1State.trash) ? v1State.trash : [];
  await storage.set(shardsToSave);
  // Remove deprecated monolithic key
  await storage.remove('appState');
  return shardsToSave;
}

/**
 * Searches for an existing card matching normalized URL according to dedupe scope.
 * Scope:
 * - 'inbox': Check only Inbox column of active workspace
 * - 'workspace': Check all columns of active workspace (default)
 * - 'all': Check all columns across all workspaces
 *
 * @param {string} nurl - Normalized URL to match
 * @param {'inbox' | 'workspace' | 'all'} scope
 * @param {string} activeWorkspaceId
 * @param {object} [adapter]
 * @returns {Promise<{ card: object, workspaceId: string, columnId: string } | null>}
 */
export async function findDuplicate(nurl, scope = 'workspace', activeWorkspaceId = 'ws_default', adapter = null) {
  const storage = getStorage(adapter);
  if (!nurl) return null;

  if (scope === 'inbox' || scope === 'workspace') {
    const shards = await storage.get([`ws:${activeWorkspaceId}`, `cards:${activeWorkspaceId}`]);
    const layout = shards[`ws:${activeWorkspaceId}`];
    const cards = shards[`cards:${activeWorkspaceId}`] || {};
    if (!layout || !layout.columns) return null;

    if (scope === 'inbox') {
      const inboxCol = Object.values(layout.columns).find((c) => c.system === 'inbox') || layout.columns.col_inbox;
      if (!inboxCol) return null;
      for (const cardId of inboxCol.cardIds) {
        const card = cards[cardId];
        if (card && card.nurl === nurl) {
          return { card, workspaceId: activeWorkspaceId, columnId: inboxCol.id };
        }
      }
      return null;
    }

    // scope === 'workspace'
    for (const [colId, col] of Object.entries(layout.columns)) {
      for (const cardId of col.cardIds) {
        const card = cards[cardId];
        if (card && card.nurl === nurl) {
          return { card, workspaceId: activeWorkspaceId, columnId: colId };
        }
      }
    }
    return null;
  }

  // scope === 'all': Search across all workspaces defined in meta
  const metaShard = await storage.get('meta');
  const meta = metaShard.meta || createDefaultMeta();
  for (const ws of meta.workspaces) {
    const shards = await storage.get([`ws:${ws.id}`, `cards:${ws.id}`]);
    const layout = shards[`ws:${ws.id}`];
    const cards = shards[`cards:${ws.id}`] || {};
    if (layout && layout.columns) {
      for (const [colId, col] of Object.entries(layout.columns)) {
        for (const cardId of col.cardIds) {
          const card = cards[cardId];
          if (card && card.nurl === nurl) {
            return { card, workspaceId: ws.id, columnId: colId };
          }
        }
      }
    }
  }
  return null;
}

/**
 * Inserts or moves a card in a column.
 * If targetColumnId is null, defaults to the workspace's Inbox column.
 */
export async function saveCard({
  cardData,
  workspaceId = 'ws_default',
  targetColumnId = null,
  prepend = true,
  adapter = null,
}) {
  const wsKey = `ws:${workspaceId}`;
  const cardsKey = `cards:${workspaceId}`;

  return await transaction([wsKey, cardsKey], (shards, meta) => {
    const layout = shards[wsKey] || createDefaultWorkspaceLayout(workspaceId);
    const cards = shards[cardsKey] || {};

    let colId = targetColumnId;
    if (!colId) {
      // Find system inbox or first column
      const inboxCol = Object.values(layout.columns).find((c) => c.system === 'inbox');
      colId = inboxCol ? inboxCol.id : layout.columnOrder[0];
    }

    const column = layout.columns[colId];
    if (!column) {
      throw new Error(`Target column not found: ${colId}`);
    }

    const cardId = cardData.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const fullCard = {
      id: cardId,
      type: cardData.type || 'link',
      title: cardData.title || '',
      url: cardData.url || '',
      nurl: cardData.nurl || '',
      host: cardData.host || '',
      body: cardData.body || '',
      note: cardData.note || '',
      tags: Array.isArray(cardData.tags) ? cardData.tags : [],
      pinned: !!cardData.pinned,
      color: cardData.color || null,
      createdAt: cardData.createdAt || now,
      updatedAt: now,
      lastOpenedAt: cardData.lastOpenedAt || null,
      openCount: cardData.openCount || 0,
    };

    cards[cardId] = fullCard;

    // Remove cardId from existing position if already present in column
    column.cardIds = column.cardIds.filter((id) => id !== cardId);

    if (prepend) {
      column.cardIds.unshift(cardId);
    } else {
      column.cardIds.push(cardId);
    }

    meta.lastAction = {
      type: 'save-card',
      cardId,
      workspaceId,
      columnId: colId,
      at: now,
    };

    return {
      [wsKey]: layout,
      [cardsKey]: cards,
    };
  }, adapter);
}

/**
 * Deletes a card and moves it to trash with 30-day retention metadata.
 */
export async function deleteCard(cardId, workspaceId = 'ws_default', adapter = null) {
  const wsKey = `ws:${workspaceId}`;
  const cardsKey = `cards:${workspaceId}`;

  return await transaction([wsKey, cardsKey, 'trash'], (shards, meta) => {
    const layout = shards[wsKey];
    const cards = shards[cardsKey] || {};
    const trash = shards.trash || [];

    if (!layout || !cards[cardId]) return {};

    const cardToDelete = cards[cardId];
    let foundColumnId = null;
    let foundIndex = -1;

    for (const [colId, col] of Object.entries(layout.columns)) {
      const idx = col.cardIds.indexOf(cardId);
      if (idx !== -1) {
        foundColumnId = colId;
        foundIndex = idx;
        col.cardIds.splice(idx, 1);
        break;
      }
    }

    delete cards[cardId];

    // Push into trash
    trash.unshift({
      card: cardToDelete,
      workspaceId,
      columnId: foundColumnId,
      index: foundIndex,
      deletedAt: Date.now(),
    });

    // Prune items older than trashRetentionDays (default 30)
    const retentionMs = (meta.settings?.trashRetentionDays || 30) * 86400000;
    const now = Date.now();
    const prunedTrash = trash.filter((item) => now - item.deletedAt <= retentionMs);

    meta.lastAction = {
      type: 'delete-card',
      cardId,
      workspaceId,
      columnId: foundColumnId,
      index: foundIndex,
      at: now,
    };

    return {
      [wsKey]: layout,
      [cardsKey]: cards,
      trash: prunedTrash,
    };
  }, adapter);
}

/**
 * Reverts the last capture or delete action.
 */
export async function undoLastAction(adapter = null) {
  const storage = getStorage(adapter);
  const metaShard = await storage.get('meta');
  const meta = metaShard.meta;
  if (!meta || !meta.lastAction) return null;

  const action = meta.lastAction;
  const now = Date.now();
  // Action undo expires after 10 minutes (600,000 ms)
  if (now - action.at > 600000) {
    return null;
  }

  if (action.type === 'save-card' || action.type === 'quick-save') {
    // Undo save by deleting the created card
    const cardId = action.cardId || (action.ids && action.ids[0]);
    if (cardId) {
      await deleteCard(cardId, action.workspaceId, adapter);
      await transaction([], (shards, m) => {
        m.lastAction = null;
        return {};
      }, adapter);
      return { undone: true, type: action.type, cardId };
    }
  }

  if (action.type === 'delete-card') {
    // Undo delete by restoring card from trash
    const wsKey = `ws:${action.workspaceId}`;
    const cardsKey = `cards:${action.workspaceId}`;

    await transaction([wsKey, cardsKey, 'trash'], (shards, m) => {
      const layout = shards[wsKey];
      const cards = shards[cardsKey] || {};
      const trash = shards.trash || [];

      const trashIdx = trash.findIndex((t) => t.card && t.card.id === action.cardId);
      if (trashIdx === -1) return {};

      const [restoredItem] = trash.splice(trashIdx, 1);
      cards[action.cardId] = restoredItem.card;

      const column = layout.columns[action.columnId];
      if (column) {
        const insertIdx = Math.min(action.index, column.cardIds.length);
        column.cardIds.splice(insertIdx, 0, action.cardId);
      }

      m.lastAction = null;
      return {
        [wsKey]: layout,
        [cardsKey]: cards,
        trash,
      };
    }, adapter);

    return { undone: true, type: 'delete-card', cardId: action.cardId };
  }

  return null;
}
