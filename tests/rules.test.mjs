import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesRule, evaluateRules, applyRules } from '../lib/rules.js';

describe('lib/rules.js', () => {
  const columns = {
    col_dev: { id: 'col_dev', title: 'Dev' },
    col_read: { id: 'col_read', title: 'Reading' },
  };

  describe('matchesRule', () => {
    it('matches by host suffix', () => {
      const rule = { match: { host: 'github.com' } };
      assert.equal(matchesRule({ host: 'github.com' }, rule), true);
      assert.equal(matchesRule({ host: 'gist.github.com' }, rule), true);
      assert.equal(matchesRule({ host: 'gitlab.com' }, rule), false);
    });

    it('matches by urlContains', () => {
      const rule = { match: { urlContains: '/pull/' } };
      assert.equal(matchesRule({ url: 'https://github.com/org/repo/pull/42' }, rule), true);
      assert.equal(matchesRule({ url: 'https://github.com/org/repo/issues/42' }, rule), false);
    });

    it('matches by titleContains', () => {
      const rule = { match: { titleContains: 'documentation' } };
      assert.equal(matchesRule({ title: 'V8 Engine Documentation' }, rule), true);
      assert.equal(matchesRule({ title: 'Tutorial Part 1' }, rule), false);
    });

    it('matches by tag', () => {
      const rule = { match: { tag: 'urgent' } };
      assert.equal(matchesRule({ tags: ['work', 'urgent'] }, rule), true);
      assert.equal(matchesRule({ tags: ['work'] }, rule), false);
    });

    it('requires all defined criteria to match (AND semantics)', () => {
      const rule = { match: { host: 'github.com', titleContains: 'React' } };
      assert.equal(matchesRule({ host: 'github.com', title: 'React Core' }, rule), true);
      assert.equal(matchesRule({ host: 'github.com', title: 'Vue Core' }, rule), false);
      assert.equal(matchesRule({ host: 'reddit.com', title: 'React Discussion' }, rule), false);
    });
  });

  describe('evaluateRules & applyRules', () => {
    const rules = [
      {
        id: 'r1',
        match: { host: 'github.com' },
        toColumn: 'col_dev',
        addTags: ['code', 'repo'],
      },
      {
        id: 'r2',
        match: { host: 'medium.com' },
        toColumn: 'Reading',
        addTags: ['article'],
      },
    ];

    it('returns first matching rule and resolves column by ID or Title', () => {
      const card = { host: 'github.com', url: 'https://github.com/torvalds/linux', tags: [] };
      const evalResult = evaluateRules(card, rules, columns);

      assert.equal(evalResult.targetColumnId, 'col_dev');
      assert.deepEqual(evalResult.addTags, ['code', 'repo']);

      const card2 = { host: 'medium.com', url: 'https://medium.com/post', tags: [] };
      const evalResult2 = evaluateRules(card2, rules, columns);
      assert.equal(evalResult2.targetColumnId, 'col_read');
    });

    it('applies rules and updates card tags in place', () => {
      const card = { host: 'github.com', tags: ['starred'] };
      const res = applyRules(card, rules, columns);

      assert.equal(res.changed, true);
      assert.equal(res.targetColumnId, 'col_dev');
      assert.ok(card.tags.includes('starred'));
      assert.ok(card.tags.includes('code'));
      assert.ok(card.tags.includes('repo'));
    });
  });
});
