/**
 * Minimal Board Tab - Static Self-Contained HTML Workspace Exporter (FR-6.9)
 * Pure ES module. Exports a workspace as a single offline-viewable HTML document.
 */

import { escapeHtml, renderMarkdownLite } from './ui/markdown.js';

/**
 * Generates an offline, standalone, single-file HTML document for a workspace.
 *
 * @param {object} workspace - Workspace definition
 * @param {object} layout - Layout shard containing columns
 * @param {Record<string, object>} cards - Cards map
 * @returns {string} Complete HTML string
 */
export function generateStaticWorkspaceHtml(workspace, layout, cards) {
  const wsName = workspace.name || 'Workspace';
  const columns = layout.columnOrder
    .map((colId) => layout.columns[colId])
    .filter(Boolean);

  let columnsHtml = '';

  for (const col of columns) {
    let cardsHtml = '';
    for (const cardId of col.cardIds || []) {
      const card = cards[cardId];
      if (!card) continue;

      const title = escapeHtml(card.title || card.host || card.url || 'Untitled');
      const host = escapeHtml(card.host || '');
      const url = card.url ? escapeHtml(card.url) : '';
      const noteHtml = card.body || card.note ? `<div class="card-note">${renderMarkdownLite(card.body || card.note)}</div>` : '';
      const tagsHtml = (card.tags || [])
        .map((t) => `<span class="tag-pill">#${escapeHtml(t)}</span>`)
        .join(' ');

      cardsHtml += `
        <article class="card" data-search="${escapeHtml(`${card.title} ${card.host} ${card.note || ''} ${(card.tags || []).join(' ')}`.toLowerCase())}">
          <div class="card-title-row">
            ${url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="card-title">${title}</a>` : `<span class="card-title">${title}</span>`}
          </div>
          ${host ? `<div class="card-host">${host}</div>` : ''}
          ${noteHtml}
          ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
        </article>
      `;
    }

    columnsHtml += `
      <section class="column">
        <header class="column-header">
          <span class="col-emoji">${escapeHtml(col.emoji || '📌')}</span>
          <h2 class="col-title">${escapeHtml(col.title)}</h2>
          <span class="col-badge">${col.cardIds?.length || 0}</span>
        </header>
        <div class="cards-list">
          ${cardsHtml || '<div class="empty-hint">No cards in this column.</div>'}
        </div>
      </section>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(wsName)} · Minimal Board Export</title>
  <style>
    :root {
      --bg-app: #0f0f11;
      --bg-surface: #18181b;
      --bg-card: #222226;
      --border-subtle: #27272a;
      --border-card-hover: #3f3f46;
      --accent-primary: #3b82f6;
      --text-primary: #f4f4f5;
      --text-muted: #a1a1aa;
      --font-stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-app);
      color: var(--text-primary);
      font-family: var(--font-stack);
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    header {
      height: 52px;
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      gap: 16px;
    }
    .brand { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
    .search-input {
      background: var(--bg-app);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      color: var(--text-primary);
      padding: 6px 12px;
      font-size: 12px;
      width: 260px;
      outline: none;
    }
    .search-input:focus { border-color: var(--accent-primary); }
    main {
      flex: 1;
      display: flex;
      overflow-x: auto;
      padding: 16px;
      gap: 16px;
    }
    .column {
      width: 300px;
      min-width: 300px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .column-header {
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .col-title { font-size: 13px; font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .col-badge { font-size: 11px; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 10px; color: var(--text-muted); }
    .cards-list { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
    .card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 10px 12px; }
    .card-title { font-size: 12px; font-weight: 500; color: var(--text-primary); text-decoration: none; display: block; line-height: 1.4; }
    .card-title:hover { color: var(--accent-primary); }
    .card-host { font-size: 11px; color: var(--text-muted); margin-top: 3px; }
    .card-note { font-size: 11px; color: var(--text-muted); margin-top: 4px; line-height: 1.35; }
    .card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
    .tag-pill { font-size: 10px; background: rgba(59, 130, 246, 0.15); color: var(--accent-primary); border-radius: 4px; padding: 1px 5px; }
    .empty-hint { text-align: center; color: var(--text-muted); font-size: 11px; padding: 24px 0; }
  </style>
</head>
<body>
  <header>
    <div class="brand"><span>⚡</span> <span>${escapeHtml(wsName)} · Minimal Board Export</span></div>
    <input type="text" id="filterInput" class="search-input" placeholder="Filter cards...">
  </header>
  <main id="board">
    ${columnsHtml}
  </main>
  <script>
    const filterInput = document.getElementById('filterInput');
    filterInput.addEventListener('input', () => {
      const q = filterInput.value.toLowerCase().trim();
      document.querySelectorAll('.card').forEach((card) => {
        const text = card.dataset.search || '';
        card.style.display = (!q || text.includes(q)) ? 'block' : 'none';
      });
    });
  </script>
</body>
</html>`;
}
