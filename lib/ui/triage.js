/**
 * Minimal Board Tab - Inbox Triage Mode (FR-8.1)
 * Fullscreen single-card review interface designed to clear a backlog in minutes.
 * Keystroke driven: 1-9 (move), o (open), p (pin), t (tag), d (delete), s (skip), u (undo), Esc (exit).
 */

import { transaction, deleteCard, undoLastAction } from '../store.js';

let activeTriageEl = null;
let lastFocusedElement = null;
let triageQueue = [];
let currentIndex = 0;
let triageUndoStack = [];

export function closeTriage() {
  if (activeTriageEl) {
    activeTriageEl.remove();
    activeTriageEl = null;
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    try {
      lastFocusedElement.focus();
    } catch {}
    lastFocusedElement = null;
  }
}

/**
 * Launches full-screen Triage review mode.
 *
 * @param {object} options
 * @param {string} options.workspaceId
 * @param {object} options.layout
 * @param {Record<string, object>} options.cards
 * @param {Function} options.onComplete
 * @param {Function} options.showToast
 */
export function openTriageMode({ workspaceId, layout, cards, onComplete, showToast }) {
  closeTriage();
  lastFocusedElement = document.activeElement;

  // Find system inbox column
  const inboxCol =
    Object.values(layout.columns).find((c) => c.system === 'inbox') ||
    layout.columns.col_inbox;

  if (!inboxCol || !inboxCol.cardIds || inboxCol.cardIds.length === 0) {
    showToast('Inbox is clean! No cards to triage.');
    return;
  }

  // Collect cards oldest first
  const rawCards = inboxCol.cardIds
    .map((id) => cards[id])
    .filter(Boolean);

  rawCards.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  triageQueue = rawCards;
  currentIndex = 0;
  triageUndoStack = [];

  const overlay = document.createElement('div');
  overlay.className = 'triage-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Inbox Triage Mode');

  const container = document.createElement('div');
  container.className = 'triage-card-container';
  overlay.appendChild(container);

  document.body.appendChild(overlay);
  activeTriageEl = overlay;

  // Destination columns legend (columns other than Inbox)
  const destColumns = layout.columnOrder
    .map((id) => layout.columns[id])
    .filter((col) => col && col.id !== inboxCol.id)
    .slice(0, 9); // Numbers 1 to 9

  function renderCurrentCard() {
    if (currentIndex >= triageQueue.length) {
      container.innerHTML = `
        <div class="triage-done">
          <div style="font-size: 40px; margin-bottom: 12px;">🎉</div>
          <h2>Inbox Zero Reached!</h2>
          <p style="color: var(--text-muted); font-size: 13px; margin-top: 6px;">You reviewed all ${triageQueue.length} items.</p>
          <button id="triage-exit-btn" class="btn-primary" style="margin-top: 18px;">Return to Board</button>
        </div>
      `;
      container.querySelector('#triage-exit-btn').addEventListener('click', () => {
        closeTriage();
        if (onComplete) onComplete();
      });
      return;
    }

    const currentCard = triageQueue[currentIndex];
    const remaining = triageQueue.length - currentIndex;

    const progressPercent = Math.round((currentIndex / triageQueue.length) * 100);

    container.innerHTML = `
      <div class="triage-header">
        <div class="triage-header-info">
          <span class="triage-progress">Card ${currentIndex + 1} of ${triageQueue.length} (${remaining} left)</span>
          <div class="triage-progress-bar-track">
            <div class="triage-progress-bar-fill" style="width: ${progressPercent}%;"></div>
          </div>
        </div>
        <button id="triage-close-btn" class="btn-icon" title="Exit Triage (Esc)" aria-label="Exit Triage review">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="triage-card">
        <div class="triage-card-title">${currentCard.title || currentCard.host || currentCard.url}</div>
        ${currentCard.url ? `<div class="triage-card-host">${currentCard.host || currentCard.url}</div>` : ''}
        ${currentCard.body || currentCard.note ? `<div class="triage-card-note">${currentCard.body || currentCard.note}</div>` : ''}
        <div class="triage-card-tags">
          ${(currentCard.tags || []).map((t) => `<span class="tag-pill">#${t}</span>`).join(' ')}
        </div>
      </div>

      <div class="triage-dest-legend">
        ${destColumns.map((c, idx) => `
          <div class="triage-legend-item">
            <kbd>${idx + 1}</kbd> <span>${c.emoji || '📌'} ${c.title}</span>
          </div>
        `).join('')}
      </div>

      <div class="triage-footer-actions">
        <span><kbd>1-9</kbd> move</span>
        <span><kbd>o</kbd> open</span>
        <span><kbd>p</kbd> pin</span>
        <span><kbd>t</kbd> tag</span>
        <span><kbd>d</kbd> delete</span>
        <span><kbd>s</kbd> skip</span>
        <span><kbd>u</kbd> undo</span>
        <span><kbd>ESC</kbd> exit</span>
      </div>
    `;

    container.querySelector('#triage-close-btn').addEventListener('click', () => {
      closeTriage();
      if (onComplete) onComplete();
    });
  }

  async function handleAction(key) {
    if (currentIndex >= triageQueue.length) return;
    const currentCard = triageQueue[currentIndex];

    // Numbers 1 - 9: Move to column
    const num = parseInt(key, 10);
    if (!isNaN(num) && num >= 1 && num <= destColumns.length) {
      const targetCol = destColumns[num - 1];
      const wsKey = `ws:${workspaceId}`;

      await transaction([wsKey], (shards) => {
        const l = shards[wsKey];
        l.columns[inboxCol.id].cardIds = l.columns[inboxCol.id].cardIds.filter((id) => id !== currentCard.id);
        l.columns[targetCol.id].cardIds.unshift(currentCard.id);
        return { [wsKey]: l };
      });

      triageUndoStack.push({ type: 'move', card: currentCard, from: inboxCol.id, to: targetCol.id });
      currentIndex++;
      renderCurrentCard();
      return;
    }

    // 'o': Open link in background tab
    if (key === 'o' && currentCard.url) {
      chrome.tabs.create({ url: currentCard.url, active: false });
      showToast('Opened in background tab');
      return;
    }

    // 'p': Toggle pin
    if (key === 'p') {
      const cardsKey = `cards:${workspaceId}`;
      await transaction([cardsKey], (shards) => {
        const cMap = shards[cardsKey] || {};
        if (cMap[currentCard.id]) {
          cMap[currentCard.id].pinned = !cMap[currentCard.id].pinned;
          currentCard.pinned = cMap[currentCard.id].pinned;
        }
        return { [cardsKey]: cMap };
      });
      showToast(currentCard.pinned ? 'Card pinned' : 'Card unpinned');
      renderCurrentCard();
      return;
    }

    // 't': Quick tag prompt
    if (key === 't') {
      const tagInput = prompt('Enter tags (comma separated):', (currentCard.tags || []).join(', '));
      if (tagInput !== null) {
        const parsedTags = tagInput.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        const cardsKey = `cards:${workspaceId}`;
        await transaction([cardsKey], (shards) => {
          const cMap = shards[cardsKey] || {};
          if (cMap[currentCard.id]) {
            cMap[currentCard.id].tags = parsedTags;
            currentCard.tags = parsedTags;
          }
          return { [cardsKey]: cMap };
        });
        renderCurrentCard();
      }
      return;
    }

    // 'd': Delete card
    if (key === 'd') {
      await deleteCard(currentCard.id, workspaceId);
      triageUndoStack.push({ type: 'delete', card: currentCard });
      currentIndex++;
      renderCurrentCard();
      return;
    }

    // 's': Skip to next card
    if (key === 's') {
      currentIndex++;
      renderCurrentCard();
      return;
    }

    // 'u': Undo last triage action
    if (key === 'u' && triageUndoStack.length > 0) {
      const last = triageUndoStack.pop();
      if (last.type === 'move') {
        const wsKey = `ws:${workspaceId}`;
        await transaction([wsKey], (shards) => {
          const l = shards[wsKey];
          l.columns[last.to].cardIds = l.columns[last.to].cardIds.filter((id) => id !== last.card.id);
          l.columns[last.from].cardIds.unshift(last.card.id);
          return { [wsKey]: l };
        });
      } else if (last.type === 'delete') {
        await undoLastAction();
      }
      currentIndex = Math.max(0, currentIndex - 1);
      renderCurrentCard();
      return;
    }

    // 'Escape': Exit
    if (key === 'Escape') {
      closeTriage();
      if (onComplete) onComplete();
    }
  }

  const keyHandler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    handleAction(e.key);
  };

  overlay.addEventListener('keydown', keyHandler);
  document.addEventListener('keydown', keyHandler);

  renderCurrentCard();
}
