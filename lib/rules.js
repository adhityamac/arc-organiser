/**
 * Minimal Board Tab - Deterministic Auto-Sort Rules Engine
 * Pure ES module. Evaluates pattern rules against cards to assign target columns and tags.
 */

/**
 * Checks if a card matches a single rule definition.
 * Rule match criteria:
 * - host: exact or suffix match (e.g. 'github.com')
 * - urlContains: substring match on URL
 * - titleContains: substring match on title
 * - tag: card has tag
 *
 * @param {object} card
 * @param {object} rule
 * @returns {boolean}
 */
export function matchesRule(card, rule) {
  if (!rule || !rule.match) return false;
  const match = rule.match;

  // Match Host
  if (match.host) {
    const cardHost = (card.host || '').toLowerCase();
    const reqHost = match.host.toLowerCase().trim();
    if (!cardHost.endsWith(reqHost)) return false;
  }

  // Match URL contains
  if (match.urlContains) {
    const cardUrl = (card.url || '').toLowerCase();
    const sub = match.urlContains.toLowerCase().trim();
    if (!cardUrl.includes(sub)) return false;
  }

  // Match Title contains
  if (match.titleContains) {
    const cardTitle = (card.title || '').toLowerCase();
    const sub = match.titleContains.toLowerCase().trim();
    if (!cardTitle.includes(sub)) return false;
  }

  // Match Tag
  if (match.tag) {
    const cardTags = (card.tags || []).map((t) => t.toLowerCase());
    const reqTag = match.tag.toLowerCase().trim();
    if (!cardTags.includes(reqTag)) return false;
  }

  return true;
}

/**
 * Evaluates ordered rules against a card.
 * First matching rule wins.
 *
 * @param {object} card
 * @param {Array<object>} rules
 * @param {Record<string, object>} columnsMap - Available columns in workspace
 * @returns {{ targetColumnId: string | null, addTags: string[], matchedRule: object | null }}
 */
export function evaluateRules(card, rules = [], columnsMap = {}) {
  if (!rules || rules.length === 0) {
    return { targetColumnId: null, addTags: [], matchedRule: null };
  }

  for (const rule of rules) {
    if (matchesRule(card, rule)) {
      let targetColumnId = null;

      // Validate target column exists if specified
      if (rule.toColumn) {
        if (columnsMap[rule.toColumn]) {
          targetColumnId = rule.toColumn;
        } else {
          // Look up by column title
          const found = Object.values(columnsMap).find(
            (c) => c.title.toLowerCase() === rule.toColumn.toLowerCase()
          );
          if (found) targetColumnId = found.id;
        }
      }

      const addTags = Array.isArray(rule.addTags)
        ? rule.addTags.map((t) => t.toLowerCase().trim()).filter(Boolean)
        : [];

      return {
        targetColumnId,
        addTags,
        matchedRule: rule,
      };
    }
  }

  return { targetColumnId: null, addTags: [], matchedRule: null };
}

/**
 * Applies rules to a card, updating its column assignment and tags in-place.
 *
 * @param {object} card
 * @param {Array<object>} rules
 * @param {Record<string, object>} columnsMap
 * @returns {{ changed: boolean, targetColumnId: string | null, addedTags: string[] }}
 */
export function applyRules(card, rules = [], columnsMap = {}) {
  const { targetColumnId, addTags } = evaluateRules(card, rules, columnsMap);
  let changed = false;

  if (addTags.length > 0) {
    const existingTags = new Set(card.tags || []);
    for (const tag of addTags) {
      if (!existingTags.has(tag)) {
        existingTags.add(tag);
        changed = true;
      }
    }
    card.tags = Array.from(existingTags);
  }

  return {
    changed,
    targetColumnId,
    addedTags: addTags,
  };
}
