/**
 * Minimal Board Tab - Synthetic Dataset Generator
 * Generates test fixtures for 1k, 5k, and 10k cards for performance budgets.
 */

export function generateSyntheticDataset(cardCount = 10000) {
  const hosts = [
    'github.com',
    'news.ycombinator.com',
    'developer.mozilla.org',
    'reddit.com',
    'stackoverflow.com',
    'wikipedia.org',
    'nytimes.com',
    'figma.com',
    'youtube.com',
    'medium.com',
  ];

  const tagsList = ['dev', 'news', 'tools', 'reading', 'design', 'architecture', 'crypto', 'ai', 'css', 'v8'];
  const cards = [];

  const now = Date.now();

  for (let i = 0; i < cardCount; i++) {
    const host = hosts[i % hosts.length];
    const tag = tagsList[i % tagsList.length];
    const isNote = i % 25 === 0;

    cards.push({
      id: `card_syn_${i}`,
      type: isNote ? 'note' : 'link',
      title: `Resource #${i}: Deep Dive into High Performance Architecture and Tooling`,
      url: isNote ? null : `https://${host}/article/${i}?utm_source=synthetic&ref=test`,
      nurl: isNote ? null : `https://${host}/article/${i}`,
      host: isNote ? '' : host,
      note: `Detailed engineering summary and benchmark notes for item ${i}. Includes code snippets.`,
      tags: [tag, 'synthetic'],
      pinned: i % 100 === 0,
      createdAt: now - (i * 360000),
      updatedAt: now - (i * 180000),
      lastOpenedAt: i % 2 === 0 ? now - (i * 90000) : null,
      openCount: i % 15,
    });
  }

  return cards;
}
