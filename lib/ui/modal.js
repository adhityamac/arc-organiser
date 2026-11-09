/**
 * Minimal Board Tab - Accessible Modal & Dialog Engine
 * Handles Card Editing, Add Link/Note (with multi-URL paste),
 * Column Management & Deletion, and Keyboard "Move-to" Picker.
 */

import { escapeHtml, renderMarkdownLite } from './markdown.js';
import { isValidUrl, normalizeUrl, extractHost } from '../url.js';
import { transaction, saveCard, deleteCard } from '../store.js';

let activeModalEl = null;
let lastFocusedElement = null;
let activeEscHandler = null;

/**
 * Closes the active modal and restores focus.
 */
export function closeModal() {
  if (activeEscHandler) {
    document.removeEventListener('keydown', activeEscHandler);
    activeEscHandler = null;
  }
  if (activeModalEl) {
    activeModalEl.remove();
    activeModalEl = null;
  }
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    try {
      lastFocusedElement.focus();
    } catch {}
    lastFocusedElement = null;
  }
}

/**
 * Creates base modal container with backdrop and Esc listener.
 */
function createModalFrame(title) {
  closeModal();
  lastFocusedElement = document.activeElement;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  const container = document.createElement('div');
  container.className = 'modal-card';

  const header = document.createElement('div');
  header.className = 'modal-header';

  const titleId = 'modal-title-' + Math.random().toString(36).slice(2, 9);
  const titleEl = document.createElement('h3');
  titleEl.className = 'modal-title';
  titleEl.id = titleId;
  titleEl.textContent = title;
  backdrop.setAttribute('aria-labelledby', titleId);
  header.appendChild(titleEl);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-icon modal-close-btn';
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.title = 'Close (Esc)';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  closeBtn.addEventListener('click', closeModal);
  header.appendChild(closeBtn);

  container.appendChild(header);
  backdrop.appendChild(container);

  // Close when clicking outside modal card
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });

  // Focus Trapping and Escape Handler
  activeEscHandler = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = container.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', activeEscHandler);

  document.body.appendChild(backdrop);
  activeModalEl = backdrop;

  return { backdrop, container };
}

/**
 * Modal to edit an existing card (link or note).
 */
export function openCardEditModal({ card, workspaceId, layout, meta, onSave }) {
  const { container } = createModalFrame(card.type === 'note' ? 'Edit Note' : 'Edit Link');

  const body = document.createElement('div');
  body.className = 'modal-body';

  // Title field
  const titleGroup = document.createElement('div');
  titleGroup.className = 'modal-field-group';
  const titleFieldId = 'edit-title-' + Math.random().toString(36).slice(2, 7);
  titleGroup.innerHTML = `<label for="${titleFieldId}" class="modal-label">Title</label>`;
  const titleInput = document.createElement('input');
  titleInput.id = titleFieldId;
  titleInput.type = 'text';
  titleInput.className = 'modal-input';
  titleInput.value = card.title || '';
  titleGroup.appendChild(titleInput);
  body.appendChild(titleGroup);

  // URL field (only for link cards)
  let urlInput = null;
  if (card.type !== 'note') {
    const urlGroup = document.createElement('div');
    urlGroup.className = 'modal-field-group';
    const urlFieldId = 'edit-url-' + Math.random().toString(36).slice(2, 7);
    urlGroup.innerHTML = `<label for="${urlFieldId}" class="modal-label">URL</label>`;
    urlInput = document.createElement('input');
    urlInput.id = urlFieldId;
    urlInput.type = 'url';
    urlInput.autocomplete = 'url';
    urlInput.autocapitalize = 'off';
    urlInput.spellcheck = false;
    urlInput.className = 'modal-input';
    urlInput.value = card.url || '';
    urlGroup.appendChild(urlInput);
    body.appendChild(urlGroup);
  }

  // Note/Body textarea
  const noteGroup = document.createElement('div');
  noteGroup.className = 'modal-field-group';
  const noteFieldId = 'edit-note-' + Math.random().toString(36).slice(2, 7);
  noteGroup.innerHTML = `<label for="${noteFieldId}" class="modal-label">Note / Markdown Body</label>`;
  const noteArea = document.createElement('textarea');
  noteArea.id = noteFieldId;
  noteArea.className = 'modal-textarea';
  noteArea.rows = 4;
  noteArea.value = card.body || card.note || '';
  noteGroup.appendChild(noteArea);
  body.appendChild(noteGroup);

  // Tags input
  const tagsGroup = document.createElement('div');
  tagsGroup.className = 'modal-field-group';
  const tagsFieldId = 'edit-tags-' + Math.random().toString(36).slice(2, 7);
  tagsGroup.innerHTML = `<label for="${tagsFieldId}" class="modal-label">Tags (comma separated)</label>`;
  const tagsInput = document.createElement('input');
  tagsInput.id = tagsFieldId;
  tagsInput.type = 'text';
  tagsInput.className = 'modal-input';
  tagsInput.placeholder = 'e.g. dev, reading, tools';
  tagsInput.value = (card.tags || []).join(', ');
  tagsGroup.appendChild(tagsInput);
  body.appendChild(tagsGroup);

  // Column Selector
  const colGroup = document.createElement('div');
  colGroup.className = 'modal-field-group';
  const colFieldId = 'edit-col-' + Math.random().toString(36).slice(2, 7);
  colGroup.innerHTML = `<label for="${colFieldId}" class="modal-label">Column</label>`;
  const colSelect = document.createElement('select');
  colSelect.id = colFieldId;
  colSelect.className = 'modal-select';

  // Find current column for this card
  let currentColId = null;
  for (const [cId, col] of Object.entries(layout.columns)) {
    if (col.cardIds.includes(card.id)) {
      currentColId = cId;
      break;
    }
  }

  for (const cId of layout.columnOrder) {
    const col = layout.columns[cId];
    if (col) {
      const opt = document.createElement('option');
      opt.value = col.id;
      opt.textContent = `${col.emoji || '📌'} ${col.title}`;
      if (col.id === currentColId) opt.selected = true;
      colSelect.appendChild(opt);
    }
  }
  colGroup.appendChild(colSelect);
  body.appendChild(colGroup);

  // Actions footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-subtle';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  footer.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save Changes (Ctrl+Enter)';

  const doSave = async () => {
    const newTitle = titleInput.value.trim() || 'Untitled';
    const newNote = noteArea.value.trim();
    const rawTags = tagsInput.value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const targetColId = colSelect.value;

    let newUrl = card.url;
    let newNurl = card.nurl;
    let newHost = card.host;

    if (urlInput) {
      const inputUrl = urlInput.value.trim();
      if (inputUrl && isValidUrl(inputUrl)) {
        newUrl = inputUrl;
        newNurl = normalizeUrl(inputUrl);
        newHost = extractHost(inputUrl);
      }
    }

    const wsKey = `ws:${workspaceId}`;
    const cardsKey = `cards:${workspaceId}`;

    await transaction([wsKey, cardsKey], (shards) => {
      const currentLayoutData = shards[wsKey];
      const currentCardsData = shards[cardsKey] || {};

      if (currentCardsData[card.id]) {
        currentCardsData[card.id] = {
          ...currentCardsData[card.id],
          title: newTitle,
          url: newUrl,
          nurl: newNurl,
          host: newHost,
          note: newNote,
          body: card.type === 'note' ? newNote : (currentCardsData[card.id].body || ''),
          tags: rawTags,
          updatedAt: Date.now(),
        };
      }

      // If column changed
      if (currentColId && targetColId && currentColId !== targetColId) {
        const oldCol = currentLayoutData.columns[currentColId];
        const newCol = currentLayoutData.columns[targetColId];
        if (oldCol && newCol) {
          oldCol.cardIds = oldCol.cardIds.filter((id) => id !== card.id);
          newCol.cardIds.unshift(card.id);
        }
      }

      return {
        [wsKey]: currentLayoutData,
        [cardsKey]: currentCardsData,
      };
    });

    closeModal();
    if (onSave) onSave();
  };

  saveBtn.addEventListener('click', doSave);
  footer.appendChild(saveBtn);

  // Ctrl/Cmd + Enter saves
  container.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doSave();
    }
  });

  container.appendChild(body);
  container.appendChild(footer);

  setTimeout(() => titleInput.focus(), 50);
}

/**
 * Modal to add links (supports multi-line paste of multiple URLs).
 */
export function openAddLinkModal({ workspaceId, columnId, onAdded }) {
  const { container } = createModalFrame('Add Link(s)');

  const body = document.createElement('div');
  body.className = 'modal-body';

  const group = document.createElement('div');
  group.className = 'modal-field-group';
  const addLinksId = 'add-links-' + Math.random().toString(36).slice(2, 7);
  group.innerHTML = `
    <label for="${addLinksId}" class="modal-label">URL (Paste one or several URLs, one per line)</label>
  `;
  const textarea = document.createElement('textarea');
  textarea.id = addLinksId;
  textarea.className = 'modal-textarea';
  textarea.rows = 4;
  textarea.placeholder = "https://github.com\nhttps://news.ycombinator.com";
  group.appendChild(textarea);
  body.appendChild(group);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-subtle';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  footer.appendChild(cancelBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary';
  addBtn.textContent = 'Add Links';

  const doAdd = async () => {
    const raw = textarea.value.trim();
    if (!raw) return;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (isValidUrl(line)) {
        const nurl = normalizeUrl(line);
        const host = extractHost(line);
        await saveCard({
          cardData: {
            title: host || line,
            url: line,
            nurl,
            host,
          },
          workspaceId,
          targetColumnId: columnId,
          prepend: false,
        });
      }
    }

    closeModal();
    if (onAdded) onAdded();
  };

  addBtn.addEventListener('click', doAdd);
  footer.appendChild(addBtn);

  container.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doAdd();
    }
  });

  container.appendChild(body);
  container.appendChild(footer);
  setTimeout(() => textarea.focus(), 50);
}

/**
 * Modal to add a markdown Note card.
 */
export function openAddNoteModal({ workspaceId, columnId, onAdded }) {
  const { container } = createModalFrame('Add Note Card');

  const body = document.createElement('div');
  body.className = 'modal-body';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'modal-field-group';
  const addNoteTitleId = 'add-note-title-' + Math.random().toString(36).slice(2, 7);
  titleGroup.innerHTML = `<label for="${addNoteTitleId}" class="modal-label">Title</label>`;
  const titleInput = document.createElement('input');
  titleInput.id = addNoteTitleId;
  titleInput.type = 'text';
  titleInput.className = 'modal-input';
  titleInput.placeholder = 'Note title';
  titleGroup.appendChild(titleInput);
  body.appendChild(titleGroup);

  const noteGroup = document.createElement('div');
  noteGroup.className = 'modal-field-group';
  const addNoteBodyId = 'add-note-body-' + Math.random().toString(36).slice(2, 7);
  noteGroup.innerHTML = `<label for="${addNoteBodyId}" class="modal-label">Note Content (Markdown supported)</label>`;
  const noteArea = document.createElement('textarea');
  noteArea.id = addNoteBodyId;
  noteArea.className = 'modal-textarea';
  noteArea.rows = 5;
  noteArea.placeholder = "Write with **bold**, *italics*, `code`, and bullet lists...";
  noteGroup.appendChild(noteArea);
  body.appendChild(noteGroup);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-subtle';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  footer.appendChild(cancelBtn);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn-primary';
  addBtn.textContent = 'Save Note';

  const doSave = async () => {
    const title = titleInput.value.trim() || 'Note';
    const noteContent = noteArea.value.trim();

    await saveCard({
      cardData: {
        type: 'note',
        title,
        body: noteContent,
        note: noteContent,
      },
      workspaceId,
      targetColumnId: columnId,
      prepend: true,
    });

    closeModal();
    if (onAdded) onAdded();
  };

  addBtn.addEventListener('click', doSave);
  footer.appendChild(addBtn);

  container.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      doSave();
    }
  });

  container.appendChild(body);
  container.appendChild(footer);
  setTimeout(() => titleInput.focus(), 50);
}

/**
 * Column Settings and Deletion Modal (FR-2.2).
 * Allows rename, emoji/color customization, "Open All", and safe delete with "Move to Inbox" or "Trash".
 */
export function openColumnSettingsModal({ col, workspaceId, layout, onUpdate }) {
  const { container } = createModalFrame(`Column: ${col.title}`);

  const body = document.createElement('div');
  body.className = 'modal-body';

  // Title & Emoji
  const titleGroup = document.createElement('div');
  titleGroup.className = 'modal-field-group';
  const colSettingsTitleId = 'col-settings-title-' + Math.random().toString(36).slice(2, 7);
  titleGroup.innerHTML = `<label for="${colSettingsTitleId}" class="modal-label">Column Title</label>`;
  const titleInput = document.createElement('input');
  titleInput.id = colSettingsTitleId;
  titleInput.type = 'text';
  titleInput.className = 'modal-input';
  titleInput.value = col.title;
  titleGroup.appendChild(titleInput);
  body.appendChild(titleGroup);

  const emojiGroup = document.createElement('div');
  emojiGroup.className = 'modal-field-group';
  const colSettingsEmojiId = 'col-settings-emoji-' + Math.random().toString(36).slice(2, 7);
  emojiGroup.innerHTML = `<label for="${colSettingsEmojiId}" class="modal-label">Emoji Icon</label>`;
  const emojiInput = document.createElement('input');
  emojiInput.id = colSettingsEmojiId;
  emojiInput.type = 'text';
  emojiInput.className = 'modal-input';
  emojiInput.style.width = '60px';
  emojiInput.value = col.emoji || '📌';
  emojiGroup.appendChild(emojiInput);
  body.appendChild(emojiGroup);

  // Acrylic Folder Color Tint Swatches
  let selectedColor = col.color_tint || col.color || 'amber';
  const colorGroup = document.createElement('div');
  colorGroup.className = 'modal-field-group';
  colorGroup.innerHTML = `<label class="modal-label">Acrylic Folder Tint</label>`;

  const swatchesWrap = document.createElement('div');
  swatchesWrap.className = 'modal-color-swatches';

  const ACRYLIC_COLORS = [
    { id: 'amber', name: 'Amber', hex: '#f59e0b' },
    { id: 'rose', name: 'Rose', hex: '#f43f5e' },
    { id: 'sage', name: 'Sage', hex: '#6b8a58' },
    { id: 'cream', name: 'Cream', hex: '#f5e6d3' },
    { id: 'lavender', name: 'Lavender', hex: '#a855f7' },
    { id: 'sky', name: 'Sky', hex: '#0ea5e9' },
    { id: 'coral', name: 'Coral', hex: '#fb7185' },
    { id: 'mint', name: 'Mint', hex: '#34d399' },
  ];

  ACRYLIC_COLORS.forEach((c) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = `modal-color-swatch swatch-${c.id}` + (selectedColor === c.id ? ' active' : '');
    swatch.title = c.name;
    swatch.setAttribute('aria-label', `Color ${c.name}`);
    swatch.innerHTML = `<span class="swatch-indicator" style="background-color: ${c.hex}"></span><span class="swatch-name">${c.name}</span>`;
    swatch.addEventListener('click', () => {
      selectedColor = c.id;
      swatchesWrap.querySelectorAll('.modal-color-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
    });
    swatchesWrap.appendChild(swatch);
  });
  colorGroup.appendChild(swatchesWrap);
  body.appendChild(colorGroup);

  // Open All Links Action
  const cardCount = col.cardIds?.length || 0;
  const openAllGroup = document.createElement('div');
  openAllGroup.className = 'modal-field-group';
  const openAllBtn = document.createElement('button');
  openAllBtn.className = 'btn-subtle';
  openAllBtn.textContent = `Open All Links (${cardCount})`;
  openAllBtn.addEventListener('click', async () => {
    if (cardCount > 20 && !confirm(`Open all ${cardCount} tabs?`)) return;
    const cardsKey = `cards:${workspaceId}`;
    const shards = await new Promise((res) => chrome.storage.local.get(cardsKey, res));
    const cards = shards[cardsKey] || {};

    for (const cardId of col.cardIds) {
      const card = cards[cardId];
      if (card && card.url) {
        chrome.tabs.create({ url: card.url, active: false });
      }
    }
    closeModal();
  });
  openAllGroup.appendChild(openAllBtn);
  body.appendChild(openAllGroup);

  // Column Deletion Section (Protected if system inbox)
  if (col.system !== 'inbox') {
    const deleteGroup = document.createElement('div');
    deleteGroup.className = 'modal-field-group';
    deleteGroup.style.marginTop = '24px';
    deleteGroup.style.borderTop = '1px solid var(--border-subtle)';
    deleteGroup.style.paddingTop = '16px';

    const deleteTitle = document.createElement('div');
    deleteTitle.className = 'modal-label';
    deleteTitle.style.color = 'var(--accent-danger)';
    deleteTitle.textContent = 'Danger Zone: Delete Column';
    deleteGroup.appendChild(deleteTitle);

    const deleteActions = document.createElement('div');
    deleteActions.style.display = 'flex';
    deleteActions.style.gap = '8px';
    deleteActions.style.marginTop = '8px';

    // Delete and move cards to Inbox
    const delMoveBtn = document.createElement('button');
    delMoveBtn.className = 'btn-subtle';
    delMoveBtn.style.color = 'var(--accent-danger)';
    delMoveBtn.textContent = 'Move Cards to Inbox & Delete';
    delMoveBtn.addEventListener('click', async () => {
      const wsKey = `ws:${workspaceId}`;
      await transaction([wsKey], (shards) => {
        const l = shards[wsKey];
        const inbox = Object.values(l.columns).find((c) => c.system === 'inbox') || l.columns.col_inbox;
        if (inbox && col.cardIds.length > 0) {
          inbox.cardIds.unshift(...col.cardIds);
        }
        delete l.columns[col.id];
        l.columnOrder = l.columnOrder.filter((id) => id !== col.id);
        return { [wsKey]: l };
      });
      closeModal();
      if (onUpdate) onUpdate();
    });
    deleteActions.appendChild(delMoveBtn);

    // Delete and send all cards to Trash
    const delTrashBtn = document.createElement('button');
    delTrashBtn.className = 'btn-subtle';
    delTrashBtn.style.color = 'var(--accent-danger)';
    delTrashBtn.textContent = 'Send All to Trash & Delete';
    delTrashBtn.addEventListener('click', async () => {
      const wsKey = `ws:${workspaceId}`;
      const cardsKey = `cards:${workspaceId}`;
      await transaction([wsKey, cardsKey, 'trash'], (shards) => {
        const l = shards[wsKey];
        const cards = shards[cardsKey] || {};
        const trash = shards.trash || [];

        for (const cardId of col.cardIds) {
          if (cards[cardId]) {
            trash.unshift({
              card: cards[cardId],
              workspaceId,
              columnId: col.id,
              deletedAt: Date.now(),
            });
            delete cards[cardId];
          }
        }

        delete l.columns[col.id];
        l.columnOrder = l.columnOrder.filter((id) => id !== col.id);
        return { [wsKey]: l, [cardsKey]: cards, trash };
      });
      closeModal();
      if (onUpdate) onUpdate();
    });
    deleteActions.appendChild(delTrashBtn);

    deleteGroup.appendChild(deleteActions);
    body.appendChild(deleteGroup);
  }

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-subtle';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  footer.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save Column';
  saveBtn.addEventListener('click', async () => {
    const newTitle = titleInput.value.trim() || col.title;
    const newEmoji = emojiInput.value.trim() || '📌';
    const wsKey = `ws:${workspaceId}`;

    await transaction([wsKey], (shards) => {
      const l = shards[wsKey];
      if (l.columns[col.id]) {
        l.columns[col.id].title = newTitle;
        l.columns[col.id].emoji = newEmoji;
        l.columns[col.id].color_tint = selectedColor;
        l.columns[col.id].color = selectedColor;
      }
      return { [wsKey]: l };
    });

    closeModal();
    if (onUpdate) onUpdate();
  });
  footer.appendChild(saveBtn);

  container.appendChild(body);
  container.appendChild(footer);
}

/**
 * Lightweight Move-to Picker Modal (triggered by 'm' key on focused card).
 */
export function openMoveModal(cardId, workspaceId, layout, meta, onMoved) {
  const { container } = createModalFrame('Move Card');

  const body = document.createElement('div');
  body.className = 'modal-body';

  const group = document.createElement('div');
  group.className = 'modal-field-group';
  group.innerHTML = `<label class="modal-label">Select Destination Column</label>`;

  const select = document.createElement('select');
  select.className = 'modal-select';

  for (const cId of layout.columnOrder) {
    const col = layout.columns[cId];
    if (col) {
      const opt = document.createElement('option');
      opt.value = col.id;
      opt.textContent = `${col.emoji || '📌'} ${col.title}`;
      select.appendChild(opt);
    }
  }
  group.appendChild(select);
  body.appendChild(group);

  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-subtle';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  footer.appendChild(cancelBtn);

  const moveBtn = document.createElement('button');
  moveBtn.className = 'btn-primary';
  moveBtn.textContent = 'Move';
  moveBtn.addEventListener('click', async () => {
    const targetColId = select.value;
    const wsKey = `ws:${workspaceId}`;

    await transaction([wsKey], (shards) => {
      const l = shards[wsKey];
      for (const col of Object.values(l.columns)) {
        col.cardIds = col.cardIds.filter((id) => id !== cardId);
      }
      if (l.columns[targetColId]) {
        l.columns[targetColId].cardIds.unshift(cardId);
      }
      return { [wsKey]: l };
    });

    closeModal();
    if (onMoved) onMoved();
  });
  footer.appendChild(moveBtn);

  container.appendChild(body);
  container.appendChild(footer);
  setTimeout(() => select.focus(), 50);
}
