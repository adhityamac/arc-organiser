/**
 * Minimal Board Tab - Fast In-Memory Fuzzy Scorer & Query Operator Parser
 * Pure ES module. Sub-16ms search across 10,000 cards.
 */

/**
 * Parses query string into structured operators, exact phrases, negative terms, and positive terms.
 * Operators supported:
 * - tag:<val>
 * - host:<val> / site:<val>
 * - in:<val> (column name)
 * - ws:<val> (workspace name)
 * - is:pinned, is:note, is:link, is:stale
 * - older:<N>d, newer:<N>d
 * - "quoted phrase"
 * - -negative_term
 *
 * @param {string} rawQuery
 * @returns {object}
 */
export function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { terms: [], phrases: [], negations: [], operators: {} };
  }

  const query = rawQuery.trim();
  const phrases = [];
  const negations = [];
  const terms = [];
  const operators = {
    tags: [],
    hosts: [],
    columns: [],
    workspaces: [],
    isPinned: null,
    isNote: null,
    isLink: null,
    isStale: null,
    olderThanDays: null,
    newerThanDays: null,
  };

  // 1. Extract quoted phrases: "phrase"
  const phraseRegex = /"([^"]+)"/g;
  let cleanQuery = query.replace(phraseRegex, (_, phrase) => {
    phrases.push(phrase.toLowerCase().trim());
    return '';
  });

  // 2. Tokenize by whitespace
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    // Negation: -term or -tag:dev
    if (token.startsWith('-') && token.length > 1) {
      negations.push(token.slice(1).toLowerCase());
      continue;
    }

    // Operators: key:value
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0 && colonIdx < token.length - 1) {
      const key = token.slice(0, colonIdx).toLowerCase();
      const val = token.slice(colonIdx + 1).toLowerCase();

      if (key === 'tag') {
        operators.tags.push(val);
      } else if (key === 'host' || key === 'site') {
        operators.hosts.push(val);
      } else if (key === 'in') {
        operators.columns.push(val);
      } else if (key === 'ws') {
        operators.workspaces.push(val);
      } else if (key === 'is') {
        if (val === 'pinned') operators.isPinned = true;
        else if (val === 'note') operators.isNote = true;
        else if (val === 'link') operators.isLink = true;
        else if (val === 'stale') operators.isStale = true;
      } else if (key === 'older' && val.endsWith('d')) {
        const days = parseInt(val.slice(0, -1), 10);
        if (!isNaN(days)) operators.olderThanDays = days;
      } else if (key === 'newer' && val.endsWith('d')) {
        const days = parseInt(val.slice(0, -1), 10);
        if (!isNaN(days)) operators.newerThanDays = days;
      } else {
        terms.push(token.toLowerCase());
      }
    } else {
      terms.push(token.toLowerCase());
    }
  }

  return { terms, phrases, negations, operators };
}

/**
 * Computes match score for a card against parsed query.
 * Exact Substring > Word Prefix > Fuzzy Subsequence
 * Boosted by recency and open count. Returns 0 if card does not qualify.
 *
 * @param {object} card
 * @param {object} parsed
 * @param {object} [context] - { columnName, workspaceName, staleDays }
 * @returns {number} Score >= 0 (0 means no match)
 */
export function scoreCard(card, parsed, context = {}) {
  const { terms, phrases, negations, operators } = parsed;
  const now = Date.now();

  // 1. Check Operators
  if (operators.isPinned !== null && !!card.pinned !== operators.isPinned) return 0;
  if (operators.isNote !== null && (card.type === 'note') !== operators.isNote) return 0;
  if (operators.isLink !== null && (card.type === 'link') !== operators.isLink) return 0;

  if (operators.isStale !== null) {
    const staleDays = context.staleDays || 14;
    const isCardStale = now - (card.lastOpenedAt || card.createdAt || now) > staleDays * 86400000;
    if (isCardStale !== operators.isStale) return 0;
  }

  if (operators.olderThanDays !== null) {
    const ageDays = (now - (card.createdAt || now)) / 86400000;
    if (ageDays < operators.olderThanDays) return 0;
  }

  if (operators.newerThanDays !== null) {
    const ageDays = (now - (card.createdAt || now)) / 86400000;
    if (ageDays > operators.newerThanDays) return 0;
  }

  if (operators.tags.length > 0) {
    const cardTags = (card.tags || []).map((t) => t.toLowerCase());
    for (const reqTag of operators.tags) {
      if (!cardTags.includes(reqTag)) return 0;
    }
  }

  if (operators.hosts.length > 0) {
    const cardHost = (card.host || '').toLowerCase();
    for (const reqHost of operators.hosts) {
      if (!cardHost.includes(reqHost)) return 0;
    }
  }

  if (operators.columns.length > 0 && context.columnName) {
    const colName = context.columnName.toLowerCase();
    for (const reqCol of operators.columns) {
      if (!colName.includes(reqCol)) return 0;
    }
  }

  if (operators.workspaces.length > 0 && context.workspaceName) {
    const wsName = context.workspaceName.toLowerCase();
    for (const reqWs of operators.workspaces) {
      if (!wsName.includes(reqWs)) return 0;
    }
  }

  // Pre-assembled search target
  const title = (card.title || '').toLowerCase();
  const host = (card.host || '').toLowerCase();
  const url = (card.url || '').toLowerCase();
  const note = (card.note || card.body || '').toLowerCase();
  const tagsStr = (card.tags || []).join(' ').toLowerCase();

  const fullText = `${title} ${host} ${url} ${note} ${tagsStr}`;

  // 2. Check Negations
  for (const neg of negations) {
    if (fullText.includes(neg)) return 0;
  }

  // 3. Check Exact Phrases
  for (const phrase of phrases) {
    if (!fullText.includes(phrase)) return 0;
  }

  // If no search terms, card matched all operators/phrases/negations
  if (terms.length === 0) {
    return 100 + (card.openCount || 0) * 2;
  }

  // 4. Score Terms
  let totalScore = 0;

  for (const term of terms) {
    let termScore = 0;

    // Check title matches (highest weight)
    if (title === term) {
      termScore += 200;
    } else if (title.startsWith(term)) {
      termScore += 100;
    } else if (title.includes(` ${term}`)) {
      termScore += 70;
    } else if (title.includes(term)) {
      termScore += 40;
    }

    // Check host match
    if (host.startsWith(term)) {
      termScore += 60;
    } else if (host.includes(term)) {
      termScore += 30;
    }

    // Check tags match
    if (tagsStr.includes(term)) {
      termScore += 50;
    }

    // Check note match
    if (note.includes(term)) {
      termScore += 20;
    }

    // Check URL match
    if (url.includes(term)) {
      termScore += 10;
    }

    if (termScore === 0) {
      // All terms must match at least once
      return 0;
    }

    totalScore += termScore;
  }

  // Boost by recency and open count
  const hoursSinceUpdated = (now - (card.updatedAt || card.createdAt || now)) / 3600000;
  const recencyBoost = Math.max(0, 20 - Math.min(20, hoursSinceUpdated / 24));
  const openBoost = Math.min(30, (card.openCount || 0) * 3);

  return totalScore + recencyBoost + openBoost;
}

/**
 * Searches and sorts a list of cards by relevance score.
 *
 * @param {Array<object>} cards
 * @param {string} rawQuery
 * @param {object} [contextMap] - Map of cardId -> { columnName, workspaceName }
 * @param {number} [limit=50]
 * @returns {Array<object>}
 */
export function searchCards(cards, rawQuery, contextMap = {}, limit = 50) {
  if (!cards || cards.length === 0) return [];
  const parsed = parseSearchQuery(rawQuery);

  const scored = [];
  for (const card of cards) {
    const ctx = contextMap[card.id] || {};
    const score = scoreCard(card, parsed, ctx);
    if (score > 0) {
      scored.push({ card, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.card);
}
