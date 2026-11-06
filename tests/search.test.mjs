import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery, scoreCard, searchCards } from '../lib/search.js';

describe('lib/search.js', () => {
  describe('parseSearchQuery', () => {
    it('parses operators, terms, phrases, and negations correctly', () => {
      const q = 'tag:dev host:github.com "open source" -archived is:pinned in:code';
      const parsed = parseSearchQuery(q);

      assert.deepEqual(parsed.operators.tags, ['dev']);
      assert.deepEqual(parsed.operators.hosts, ['github.com']);
      assert.deepEqual(parsed.operators.columns, ['code']);
      assert.equal(parsed.operators.isPinned, true);
      assert.deepEqual(parsed.phrases, ['open source']);
      assert.deepEqual(parsed.negations, ['archived']);
    });

    it('handles empty query gracefully', () => {
      const parsed = parseSearchQuery('');
      assert.deepEqual(parsed.terms, []);
      assert.deepEqual(parsed.phrases, []);
      assert.deepEqual(parsed.negations, []);
    });
  });

  describe('scoreCard & searchCards', () => {
    const cards = [
      {
        id: '1',
        type: 'link',
        title: 'React Documentation',
        url: 'https://react.dev',
        host: 'react.dev',
        tags: ['frontend', 'react'],
        pinned: true,
      },
      {
        id: '2',
        type: 'link',
        title: 'Vue Guide',
        url: 'https://vuejs.org',
        host: 'vuejs.org',
        tags: ['frontend', 'vue'],
        pinned: false,
      },
      {
        id: '3',
        type: 'note',
        title: 'Architectural Decisions',
        body: 'Notes on database sharding and locks',
        tags: ['architecture'],
        pinned: false,
      },
    ];

    it('filters cards by query term', () => {
      const results = searchCards(cards, 'react');
      assert.equal(results.length, 1);
      assert.equal(results[0].id, '1');
    });

    it('filters cards with operator is:pinned', () => {
      const results = searchCards(cards, 'is:pinned');
      assert.equal(results.length, 1);
      assert.equal(results[0].id, '1');
    });

    it('filters cards with operator is:note', () => {
      const results = searchCards(cards, 'is:note');
      assert.equal(results.length, 1);
      assert.equal(results[0].id, '3');
    });

    it('honors negations', () => {
      const results = searchCards(cards, 'frontend -vue');
      assert.equal(results.length, 1);
      assert.equal(results[0].id, '1');
    });
  });

  describe('performance budget: 10,000 cards search', () => {
    it('executes search over 10,000 cards in less than 16 ms', () => {
      const syntheticCards = [];
      const hosts = ['github.com', 'news.ycombinator.com', 'google.com', 'reddit.com', 'stackoverflow.com'];
      const tags = ['dev', 'news', 'tools', 'reading', 'design'];

      for (let i = 0; i < 10000; i++) {
        syntheticCards.push({
          id: `card_${i}`,
          type: i % 20 === 0 ? 'note' : 'link',
          title: `Resource ${i} on Web Development and Performance`,
          url: `https://${hosts[i % hosts.length]}/item/${i}`,
          host: hosts[i % hosts.length],
          note: `Summary notes for item ${i}`,
          tags: [tags[i % tags.length]],
          pinned: i % 50 === 0,
          createdAt: Date.now() - (i * 3600000),
          updatedAt: Date.now() - (i * 1800000),
          openCount: i % 10,
        });
      }

      const start = performance.now();
      const results = searchCards(syntheticCards, 'tag:dev performance');
      const elapsed = performance.now() - start;

      assert.ok(results.length > 0);
      assert.ok(elapsed <= 16, `Search took ${elapsed.toFixed(2)}ms (budget: <= 16ms)`);
    });
  });
});
