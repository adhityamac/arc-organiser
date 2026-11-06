import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNetscapeBookmarks,
  validateBackupJson,
  mergeBackupData,
  importNetscapeFolders,
} from '../lib/merge.js';

describe('lib/merge.js', () => {
  describe('parseNetscapeBookmarks', () => {
    it('parses folders and anchor tags from Netscape HTML', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <TITLE>Bookmarks</TITLE>
        <H1>Bookmarks</H1>
        <DL><p>
          <DT><H3 ADD_DATE="1600000000">Dev Tools</H3>
          <DL><p>
            <DT><A HREF="https://github.com">GitHub</A>
            <DT><A HREF="https://stackoverflow.com">Stack Overflow</A>
          </DL><p>
          <DT><H3>News</H3>
          <DL><p>
            <DT><A HREF="https://news.ycombinator.com">Hacker News</A>
          </DL><p>
        </DL><p>
      `;

      const folders = parseNetscapeBookmarks(html);
      assert.equal(folders.length, 2);
      assert.equal(folders[0].folder, 'Dev Tools');
      assert.equal(folders[0].links.length, 2);
      assert.equal(folders[0].links[0].url, 'https://github.com');
      assert.equal(folders[1].folder, 'News');
      assert.equal(folders[1].links[0].url, 'https://news.ycombinator.com');
    });

    it('ignores invalid or javascript: bookmark URLs', () => {
      const html = `<DT><A HREF="javascript:alert(1)">Bookmarklet</A>`;
      const folders = parseNetscapeBookmarks(html);
      assert.equal(folders.length, 0);
    });
  });

  describe('validateBackupJson', () => {
    it('validates proper backup structure and rejects malformed objects', () => {
      assert.equal(validateBackupJson(null).valid, false);
      assert.equal(validateBackupJson({}).valid, false);
      assert.equal(validateBackupJson({ meta: {} }).valid, false);
      assert.equal(validateBackupJson({ meta: { workspaces: [] } }).valid, true);
    });
  });

  describe('mergeBackupData', () => {
    it('merges new cards and skips duplicate URLs in merge mode', () => {
      const currentShards = {
        meta: { workspaces: [{ id: 'ws_default', name: 'Default' }] },
        'ws:ws_default': {
          columnOrder: ['col_inbox'],
          columns: {
            col_inbox: { id: 'col_inbox', title: 'Inbox', cardIds: ['c1'] },
          },
        },
        'cards:ws_default': {
          c1: { id: 'c1', title: 'Existing', url: 'https://example.com', nurl: 'https://example.com' },
        },
      };

      const importData = {
        meta: { workspaces: [{ id: 'ws_default', name: 'Default' }] },
        'ws:ws_default': {
          columnOrder: ['col_inbox'],
          columns: {
            col_inbox: { id: 'col_inbox', title: 'Inbox', cardIds: ['imp1', 'imp2'] },
          },
        },
        'cards:ws_default': {
          imp1: { id: 'imp1', title: 'Existing Again', url: 'https://example.com', nurl: 'https://example.com' },
          imp2: { id: 'imp2', title: 'New Card', url: 'https://newsite.org', nurl: 'https://newsite.org' },
        },
      };

      const { mergedShards, stats } = mergeBackupData(currentShards, importData, 'merge');
      assert.equal(stats.duplicatesSkipped, 1);
      assert.equal(stats.cardsAdded, 1);
      assert.equal(mergedShards['ws:ws_default'].columns.col_inbox.cardIds.length, 2);
    });

    it('completely overwrites shards in overwrite mode', () => {
      const currentShards = {
        meta: { workspaces: [{ id: 'ws_old', name: 'Old' }] },
      };
      const importData = {
        meta: { workspaces: [{ id: 'ws_new', name: 'New' }] },
        'ws:ws_new': { columnOrder: [], columns: {} },
        'cards:ws_new': {},
      };

      const { mergedShards, stats } = mergeBackupData(currentShards, importData, 'overwrite');
      assert.equal(stats.workspacesAdded, 1);
      assert.equal(mergedShards.meta.workspaces[0].name, 'New');
    });
  });

  describe('importNetscapeFolders', () => {
    it('creates columns and cards from parsed folders', () => {
      const folders = [
        {
          folder: 'Design',
          links: [
            { title: 'Figma', url: 'https://figma.com' },
            { title: 'Dribbble', url: 'https://dribbble.com' },
          ],
        },
      ];

      const currentShards = {};
      const { updatedShards, importedCount } = importNetscapeFolders(folders, 'ws_default', currentShards);

      assert.equal(importedCount, 2);
      const layout = updatedShards['ws:ws_default'];
      assert.equal(layout.columnOrder.length, 1);
      const col = layout.columns[layout.columnOrder[0]];
      assert.equal(col.title, 'Design');
      assert.equal(col.cardIds.length, 2);

      const cards = updatedShards['cards:ws_default'];
      assert.equal(Object.keys(cards).length, 2);
    });
  });
});
