/**
 * Minimal Board Tab - Native HTML5 Drag and Drop Engine
 * Supports 60fps card moves, column reordering, edge auto-scroll,
 * external URL drops, optimistic UI with rollback, and keyboard alternatives.
 */

import { transaction, saveCard } from './store.js';
import { isValidUrl, normalizeUrl, extractHost } from './url.js';

let dragState = null;
let autoScrollFrame = null;
let cachedCardRects = [];
let indicatorLine = null;

/**
 * Creates and appends the single reusable drop indicator line.
 */
function getOrCreateIndicator() {
  if (!indicatorLine) {
    indicatorLine = document.createElement('div');
    indicatorLine.className = 'drop-indicator-line';
    document.body.appendChild(indicatorLine);
  }
  return indicatorLine;
}

function hideIndicator() {
  if (indicatorLine) {
    indicatorLine.style.display = 'none';
  }
}

/**
 * Caches bounding rects of all visible cards to avoid layout thrashing during dragover.
 */
function cacheCardRectangles(activeColumnEl) {
  cachedCardRects = [];
  if (!activeColumnEl) return;
  const cards = activeColumnEl.querySelectorAll('.card:not(.is-dragging)');
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    cachedCardRects.push({
      element: card,
      cardId: card.dataset.cardId,
      top: rect.top,
      bottom: rect.bottom,
      midY: rect.top + rect.height / 2,
    });
  }
}

/**
 * Auto-scroll engine when cursor approaches edges of board or column.
 */
function handleEdgeAutoScroll(clientX, clientY, boardEl, columnListEl) {
  let scrollX = 0;
  let scrollY = 0;

  // Board horizontal scrolling
  const boardRect = boardEl.getBoundingClientRect();
  const EDGE_THRESHOLD = 60;
  const MAX_SPEED = 14;

  if (clientX < boardRect.left + EDGE_THRESHOLD) {
    const factor = 1 - (clientX - boardRect.left) / EDGE_THRESHOLD;
    scrollX = -Math.round(factor * MAX_SPEED);
  } else if (clientX > boardRect.right - EDGE_THRESHOLD) {
    const factor = 1 - (boardRect.right - clientX) / EDGE_THRESHOLD;
    scrollX = Math.round(factor * MAX_SPEED);
  }

  // Column vertical scrolling
  if (columnListEl) {
    const colRect = columnListEl.getBoundingClientRect();
    if (clientY < colRect.top + EDGE_THRESHOLD) {
      const factor = 1 - (clientY - colRect.top) / EDGE_THRESHOLD;
      scrollY = -Math.round(factor * MAX_SPEED);
    } else if (clientY > colRect.bottom - EDGE_THRESHOLD) {
      const factor = 1 - (colRect.bottom - clientY) / EDGE_THRESHOLD;
      scrollY = Math.round(factor * MAX_SPEED);
    }
  }

  if (scrollX !== 0) boardEl.scrollLeft += scrollX;
  if (scrollY !== 0 && columnListEl) columnListEl.scrollTop += scrollY;
}

/**
 * Initializes the drag-and-drop subsystem on the board.
 *
 * @param {HTMLElement} boardEl - Main board container
 * @param {() => string} getActiveWorkspaceId - Supplier function for active workspace ID
 * @param {(msg: string) => void} showToast - Toast notifier
 */
export function initDragAndDrop(boardElOrOptions, getActiveWorkspaceId, showToast) {
  let boardEl;
  let getWsId;
  let toastFn;

  if (boardElOrOptions && (boardElOrOptions.boardContainer || !boardElOrOptions.addEventListener)) {
    boardEl = boardElOrOptions.boardContainer || document.getElementById('board-container');
    getWsId = boardElOrOptions.getWorkspaceId || boardElOrOptions.getActiveWorkspaceId;
    toastFn = boardElOrOptions.showToast;
  } else {
    boardEl = boardElOrOptions;
    getWsId = getActiveWorkspaceId;
    toastFn = showToast;
  }

  if (!boardEl || typeof boardEl.addEventListener !== 'function') {
    return;
  }

  const indicator = getOrCreateIndicator();

  // 1. Drag Start
  boardEl.addEventListener('dragstart', (e) => {
    const cardEl = e.target.closest('.card');
    const colHeader = e.target.closest('.col-drag-handle');

    if (cardEl) {
      const colEl = cardEl.closest('.column');
      dragState = {
        type: 'card',
        cardId: cardEl.dataset.cardId,
        sourceColId: colEl?.dataset.colId,
        element: cardEl,
        targetColId: colEl?.dataset.colId,
        targetIndex: -1,
      };

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cardEl.dataset.cardId);

      // Delay adding class slightly so drag preview snapshot captures clean element
      requestAnimationFrame(() => {
        cardEl.classList.add('is-dragging');
      });
      return;
    }

    if (colHeader) {
      const colEl = colHeader.closest('.column');
      if (!colEl) return;
      dragState = {
        type: 'column',
        colId: colEl.dataset.colId,
        element: colEl,
        targetIndex: -1,
      };

      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', colEl.dataset.colId);
      requestAnimationFrame(() => {
        colEl.classList.add('is-dragging-column');
      });
    }
  });

  // 2. Drag Over (Rate-limited, zero DOM queries where possible)
  boardEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragState && !e.dataTransfer.types.includes('text/uri-list') && !e.dataTransfer.types.includes('text/plain')) {
      return;
    }

    const targetColumn = e.target.closest('.column:not(.widget-card)');
    const targetCardsList = targetColumn?.querySelector('.cards-list');

    // Edge auto-scrolling
    handleEdgeAutoScroll(e.clientX, e.clientY, boardEl, targetCardsList);

    // If dragging a column
    if (dragState?.type === 'column') {
      e.dataTransfer.dropEffect = 'move';
      if (!targetColumn || targetColumn === dragState.element) {
        hideIndicator();
        return;
      }

      const colRect = targetColumn.getBoundingClientRect();
      const insertBefore = e.clientX < colRect.left + colRect.width / 2;
      indicator.style.display = 'block';
      indicator.style.width = '3px';
      indicator.style.height = `${colRect.height}px`;
      indicator.style.top = `${colRect.top}px`;
      indicator.style.left = `${insertBefore ? colRect.left - 2 : colRect.right}px`;
      return;
    }

    // If dragging a card or external URL
    if (targetColumn && targetCardsList) {
      e.dataTransfer.dropEffect = 'move';
      const colId = targetColumn.dataset.colId;

      // Update cached rects if column changed
      if (dragState && dragState.targetColId !== colId) {
        dragState.targetColId = colId;
        cacheCardRectangles(targetColumn);
      } else if (!dragState && cachedCardRects.length === 0) {
        cacheCardRectangles(targetColumn);
      }

      const clientY = e.clientY;
      let targetSibling = null;
      let insertAfter = false;

      // Find nearest card using pre-cached midpoints
      for (let i = 0; i < cachedCardRects.length; i++) {
        const item = cachedCardRects[i];
        if (clientY < item.midY) {
          targetSibling = item;
          insertAfter = false;
          break;
        } else if (i === cachedCardRects.length - 1) {
          targetSibling = item;
          insertAfter = true;
        }
      }

      indicator.style.display = 'block';
      indicator.style.height = '2px';

      if (targetSibling) {
        const rect = targetSibling.element.getBoundingClientRect();
        indicator.style.width = `${rect.width}px`;
        indicator.style.left = `${rect.left}px`;
        indicator.style.top = `${insertAfter ? rect.bottom + 2 : rect.top - 2}px`;
      } else {
        // Empty column
        const listRect = targetCardsList.getBoundingClientRect();
        indicator.style.width = `${listRect.width - 20}px`;
        indicator.style.left = `${listRect.left + 10}px`;
        indicator.style.top = `${listRect.top + 10}px`;
      }
    } else {
      hideIndicator();
    }
  });

  // 3. Drop
  boardEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    hideIndicator();

    const targetColumn = e.target.closest('.column:not(.widget-card)');
    if (!targetColumn) {
      cleanUpDrag();
      return;
    }

    const targetColId = targetColumn.dataset.colId;
    const targetCardsList = targetColumn.querySelector('.cards-list');
    const wsId = typeof getWsId === 'function' ? getWsId() : (typeof getActiveWorkspaceId === 'function' ? getActiveWorkspaceId() : 'ws_default');
    const wsKey = `ws:${wsId}`;

    // A. Internal Column Reorder
    if (dragState?.type === 'column') {
      const sourceColId = dragState.colId;
      if (sourceColId === targetColId) {
        cleanUpDrag();
        return;
      }

      const columns = Array.from(boardEl.querySelectorAll('.column:not(.widget-card)'));
      const targetIdx = columns.indexOf(targetColumn);

      cleanUpDrag();

      await transaction([wsKey], (shards) => {
        const layout = shards[wsKey];
        if (!layout) return {};
        const oldIdx = layout.columnOrder.indexOf(sourceColId);
        if (oldIdx !== -1) {
          layout.columnOrder.splice(oldIdx, 1);
          layout.columnOrder.splice(targetIdx, 0, sourceColId);
        }
        return { [wsKey]: layout };
      });
      return;
    }

    // B. Internal Card Reorder / Move
    if (dragState?.type === 'card') {
      const cardId = dragState.cardId;
      const sourceColId = dragState.sourceColId;

      // Determine insertion index within target column
      const clientY = e.clientY;
      const otherCards = Array.from(targetCardsList.querySelectorAll('.card:not(.is-dragging)'));
      let targetIndex = otherCards.length;

      for (let i = 0; i < otherCards.length; i++) {
        const rect = otherCards[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          targetIndex = i;
          break;
        }
      }

      cleanUpDrag();

      // Persist transaction
      await transaction([wsKey], (shards) => {
        const layout = shards[wsKey];
        if (!layout) return {};

        const sourceCol = layout.columns[sourceColId];
        const destCol = layout.columns[targetColId];
        if (!sourceCol || !destCol) return {};

        // Remove from source
        sourceCol.cardIds = sourceCol.cardIds.filter((id) => id !== cardId);

        // Insert at target index
        const safeIndex = Math.min(Math.max(0, targetIndex), destCol.cardIds.length);
        destCol.cardIds.splice(safeIndex, 0, cardId);

        return { [wsKey]: layout };
      });
      return;
    }

    // C. External Drop (URL or text dropped from outside browser or address bar)
    const droppedUrl =
      e.dataTransfer.getData('text/uri-list') ||
      e.dataTransfer.getData('text/plain');

    if (droppedUrl && isValidUrl(droppedUrl.trim())) {
      cleanUpDrag();
      const rawUrl = droppedUrl.trim();
      const nurl = normalizeUrl(rawUrl);
      const host = extractHost(rawUrl);

      await saveCard({
        cardData: {
          title: host || rawUrl,
          url: rawUrl,
          nurl,
          host,
        },
        workspaceId: wsId,
        targetColumnId: targetColId,
        prepend: false,
      });
      showToast('Card created from dropped link');
    } else {
      cleanUpDrag();
    }
  });

  // 4. Drag End
  boardEl.addEventListener('dragend', () => {
    cleanUpDrag();
  });

  function cleanUpDrag() {
    hideIndicator();
    if (dragState?.element) {
      dragState.element.classList.remove('is-dragging', 'is-dragging-column');
    }
    dragState = null;
    cachedCardRects = [];
  }
}

/**
 * Handles keyboard accessibility alternative to drag-and-drop (WCAG 2.2 SC 2.5.7).
 * Alt+Up / Alt+Down moves card within column.
 * Alt+Left / Alt+Right moves card across columns.
 * m opens Move-to modal picker.
 *
 * @param {KeyboardEvent} e
 * @param {string} wsId
 * @param {(msg: string) => void} showToast
 * @param {(cardId: string, wsId: string) => void} openMoveModal
 */
export async function handleKeyboardReorder(e, wsId, showToast, openMoveModal) {
  const focusedCard = document.activeElement?.closest('.card');
  if (!focusedCard) return;

  const cardId = focusedCard.dataset.cardId;
  const colEl = focusedCard.closest('.column');
  const colId = colEl?.dataset.colId;
  if (!cardId || !colId) return;

  // Press 'm': open Move-to picker
  if (e.key === 'm' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    if (openMoveModal) {
      openMoveModal(cardId, wsId);
    }
    return;
  }

  // Alt + Arrow keys
  if (e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const wsKey = `ws:${wsId}`;

    await transaction([wsKey], (shards) => {
      const layout = shards[wsKey];
      if (!layout) return {};

      const currentCol = layout.columns[colId];
      if (!currentCol) return {};

      const currentIdx = currentCol.cardIds.indexOf(cardId);
      if (currentIdx === -1) return {};

      if (e.key === 'ArrowUp' && currentIdx > 0) {
        // Swap with above
        currentCol.cardIds[currentIdx] = currentCol.cardIds[currentIdx - 1];
        currentCol.cardIds[currentIdx - 1] = cardId;
        showToast(`Moved card up (position ${currentIdx})`);
      } else if (e.key === 'ArrowDown' && currentIdx < currentCol.cardIds.length - 1) {
        // Swap with below
        currentCol.cardIds[currentIdx] = currentCol.cardIds[currentIdx + 1];
        currentCol.cardIds[currentIdx + 1] = cardId;
        showToast(`Moved card down (position ${currentIdx + 2})`);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const order = layout.columnOrder;
        const colIdx = order.indexOf(colId);
        const targetColIdx = e.key === 'ArrowLeft' ? colIdx - 1 : colIdx + 1;

        if (targetColIdx >= 0 && targetColIdx < order.length) {
          const targetColId = order[targetColIdx];
          const targetCol = layout.columns[targetColId];
          currentCol.cardIds.splice(currentIdx, 1);
          targetCol.cardIds.unshift(cardId);
          showToast(`Moved to "${targetCol.title}"`);
        }
      }

      return { [wsKey]: layout };
    });
  }
}
