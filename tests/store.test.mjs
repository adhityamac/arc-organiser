import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initStoreIfNeeded,
  migrateV1toV2,
  transaction,
  findDuplicate,
  saveCard,
  deleteCard,
  undoLastAction,
  createDefaultMeta,
} from '../lib/store.js';

// In-memory mock storage adapter mimicking chrome.storage.local
function createMockStorage(initialData = {}) {
  const store = { ...initialData };
  return {
    store,
    get: async (keys) => {
      if (typeof keys === 'string') {
        return { [keys]: store[keys] ? JSON.parse(JSON.stringify(store[keys])) : undefined };
      }
      if (Array.isArray(keys)) {
        const res = {};
        for (const k of keys) {
          if (store[k] !== undefined) {
            res[k] = JSON.parse(JSON.stringify(store[k]));
          }
        }
        return res;
      }
      return JSON.parse(JSON.stringify(store));
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) {
        store[k] = JSON.parse(JSON.stringify(v));
      }
    },
    remove: async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) {
        delete store[k];
      }
    },
    clear: async () => {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    },
  };
}

describe('lib/store.js', () => {
  let storage;

  beforeEach(() => {
    storage = createMockStorage();
  });

  describe('initStoreIfNeeded', () => {
    it('creates default meta, layout shard, cards shard, and trash when empty', async () => {
      const initialized = await initStoreIfNeeded(storage);
      assert.equal(initialized, true);
      assert.ok(storage.store.meta);
      assert.equal(storage.store.meta.schemaVersion, 2);
      assert.equal(storage.store.meta.activeWorkspaceId, 'ws_default');
      assert.ok(storage.store['ws:ws_default']);
      assert.deepEqual(storage.store['ws:ws_default'].columnOrder, ['col_inbox', 'col_dev', 'col_read']);
      assert.deepEqual(storage.store['cards:ws_default'], {});
      assert.deepEqual(storage.store.trash, []);
    });

    it('does not overwrite existing initialized store', async () => {
      await initStoreIfNeeded(storage);
      storage.store.meta.rev = 42;
      const initializedAgain = await initStoreIfNeeded(storage);
      assert.equal(initializedAgain, false);
      assert.equal(storage.store.meta.rev, 42);
    });
  });

  describe('migrateV1toV2', () => {
    it('migrates monolithic v1 appState into sharded v2 format and drops appState', async () => {
      const v1AppState = {
        activeWorkspaceId: 'ws_work',
        workspaces: [{ id: 'ws_work', name: 'Work', icon: '💼', order: 0 }],
        columns: [
          { id: 'col_1', workspaceId: 'ws_work', title: 'Inbox', system: 'inbox' },
          { id: 'col_2', workspaceId: 'ws_work', title: 'Project X' },
        ],
        bookmarks: [
          {
            id: 'b1',
            columnId: 'col_1',
            title: 'Docs',
            url: 'https://docs.google.com',
            nurl: 'https://docs.google.com',
          },
          {
            id: 'b2',
            columnId: 'col_2',
            title: 'Repo',
            url: 'https://github.com/org/repo',
            nurl: 'https://github.com/org/repo',
          },
        ],
        trash: [],
      };

      await storage.set({ appState: v1AppState });
      const migrated = await initStoreIfNeeded(storage);
      assert.equal(migrated, true);

      // Verify appState is removed
      assert.equal(storage.store.appState, undefined);

      // Verify sharded output
      assert.ok(storage.store.meta);
      assert.equal(storage.store.meta.schemaVersion, 2);
      assert.equal(storage.store.meta.activeWorkspaceId, 'ws_work');

      const layout = storage.store['ws:ws_work'];
      assert.ok(layout);
      assert.deepEqual(layout.columnOrder, ['col_1', 'col_2']);
      assert.deepEqual(layout.columns.col_1.cardIds, ['b1']);
      assert.deepEqual(layout.columns.col_2.cardIds, ['b2']);

      const cards = storage.store['cards:ws_work'];
      assert.ok(cards.b1);
      assert.equal(cards.b1.title, 'Docs');
      assert.ok(cards.b2);
      assert.equal(cards.b2.title, 'Repo');
    });
  });

  describe('transaction & revision bumping', () => {
    it('increments meta.rev and records lastWriter on mutations', async () => {
      await initStoreIfNeeded(storage);
      const initialRev = storage.store.meta.rev;

      const result = await transaction(
        ['ws:ws_default'],
        (shards) => {
          shards['ws:ws_default'].columns.col_inbox.title = 'Incoming';
          return { 'ws:ws_default': shards['ws:ws_default'] };
        },
        storage
      );

      assert.equal(result.meta.rev, initialRev + 1);
      assert.ok(result.meta.lastWriter);
      assert.equal(storage.store['ws:ws_default'].columns.col_inbox.title, 'Incoming');
    });

    it('returns empty updatedKeys if mutator returns empty object', async () => {
      await initStoreIfNeeded(storage);
      const initialRev = storage.store.meta.rev;

      const result = await transaction(['ws:ws_default'], () => ({}), storage);
      assert.deepEqual(result.updatedKeys, []);
      assert.equal(storage.store.meta.rev, initialRev);
    });
  });

  describe('saveCard & findDuplicate', () => {
    it('saves a new card and prepends to the Inbox column', async () => {
      await initStoreIfNeeded(storage);

      await saveCard({
        cardData: {
          title: 'V8 Engine',
          url: 'https://v8.dev',
          nurl: 'https://v8.dev',
          host: 'v8.dev',
        },
        workspaceId: 'ws_default',
        adapter: storage,
      });

      const layout = storage.store['ws:ws_default'];
      const inboxCardIds = layout.columns.col_inbox.cardIds;
      assert.equal(inboxCardIds.length, 1);

      const cardId = inboxCardIds[0];
      const card = storage.store['cards:ws_default'][cardId];
      assert.equal(card.title, 'V8 Engine');
      assert.equal(card.nurl, 'https://v8.dev');
      assert.equal(card.host, 'v8.dev');
    });

    it('finds duplicate by normalized URL in workspace scope', async () => {
      await initStoreIfNeeded(storage);

      await saveCard({
        cardData: {
          id: 'card_test_1',
          title: 'MDN Web Docs',
          url: 'https://developer.mozilla.org/en-US/',
          nurl: 'https://developer.mozilla.org/en-US',
          host: 'developer.mozilla.org',
        },
        workspaceId: 'ws_default',
        adapter: storage,
      });

      const dupe = await findDuplicate('https://developer.mozilla.org/en-US', 'workspace', 'ws_default', storage);
      assert.ok(dupe);
      assert.equal(dupe.card.id, 'card_test_1');
      assert.equal(dupe.columnId, 'col_inbox');

      const nonDupe = await findDuplicate('https://other.com', 'workspace', 'ws_default', storage);
      assert.equal(nonDupe, null);
    });
  });

  describe('deleteCard & undoLastAction', () => {
    it('deletes a card, moves it to trash, and allows undoing deletion', async () => {
      await initStoreIfNeeded(storage);

      await saveCard({
        cardData: {
          id: 'card_to_del',
          title: 'Temporary Card',
          url: 'https://temp.com',
          nurl: 'https://temp.com',
        },
        workspaceId: 'ws_default',
        adapter: storage,
      });

      assert.equal(storage.store['ws:ws_default'].columns.col_inbox.cardIds.includes('card_to_del'), true);

      // Delete card
      await deleteCard('card_to_del', 'ws_default', storage);

      assert.equal(storage.store['ws:ws_default'].columns.col_inbox.cardIds.includes('card_to_del'), false);
      assert.equal(storage.store['cards:ws_default']['card_to_del'], undefined);
      assert.equal(storage.store.trash.length, 1);
      assert.equal(storage.store.trash[0].card.id, 'card_to_del');

      // Undo delete
      const undoResult = await undoLastAction(storage);
      assert.ok(undoResult);
      assert.equal(undoResult.undone, true);
      assert.equal(undoResult.cardId, 'card_to_del');

      // Verify card is restored
      assert.ok(storage.store['cards:ws_default']['card_to_del']);
      assert.equal(storage.store['ws:ws_default'].columns.col_inbox.cardIds.includes('card_to_del'), true);
      assert.equal(storage.store.trash.length, 0);
    });
  });
});
