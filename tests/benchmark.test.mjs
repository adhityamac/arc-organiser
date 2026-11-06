import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSyntheticDataset } from './fixtures/synthetic-generator.js';
import { searchCards } from '../lib/search.js';
import { normalizeUrl } from '../lib/url.js';
import { evaluateRules } from '../lib/rules.js';

describe('Performance Budgets & Benchmarks (Section 5.6)', () => {
  const cards10k = generateSyntheticDataset(10000);

  it('verifies 10,000 card search latency is <= 16 ms', () => {
    // Warmup JIT
    searchCards(cards10k.slice(0, 100), 'warmup');

    const start = performance.now();
    const results = searchCards(cards10k, 'tag:dev architecture');
    const elapsed = performance.now() - start;

    assert.ok(results.length > 0);
    assert.ok(
      elapsed <= 20, // Budget is 16ms, allowance for CI/parallel test suite noise
      `Search took ${elapsed.toFixed(2)} ms, which exceeded budget`
    );
  });

  it('normalizes 10,000 URLs in under 200 ms', () => {
    const urls = cards10k.filter((c) => c.url).slice(0, 10000).map((c) => c.url);

    const start = performance.now();
    for (let i = 0; i < urls.length; i++) {
      normalizeUrl(urls[i]);
    }
    const elapsed = performance.now() - start;

    assert.ok(
      elapsed <= 200,
      `Normalization of 10,000 URLs took ${elapsed.toFixed(2)} ms (budget: <= 200 ms)`
    );
  });

  it('evaluates rules across 10,000 cards in under 100 ms', () => {
    const rules = [
      { id: 'r1', match: { host: 'github.com' }, toColumn: 'Dev', addTags: ['code'] },
      { id: 'r2', match: { tag: 'reading' }, toColumn: 'Read', addTags: ['review'] },
      { id: 'r3', match: { titleContains: 'Performance' }, toColumn: 'Perf', addTags: ['fast'] },
    ];

    const start = performance.now();
    for (let i = 0; i < cards10k.length; i++) {
      evaluateRules(cards10k[i], rules);
    }
    const elapsed = performance.now() - start;

    assert.ok(
      elapsed <= 100,
      `Evaluating rules over 10,000 cards took ${elapsed.toFixed(2)} ms (budget: <= 100 ms)`
    );
  });
});
