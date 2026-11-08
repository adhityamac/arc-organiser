/**
 * wallpaper-modal.js
 * Wallpaper Gallery, Live Shaders, Video Loops & Media Customizer.
 */

import { saveBlob, getBlob } from '../db.js';
import { transaction } from '../store.js';

let activeModalEl = null;
let lastFocusedElement = null;
let boundEscHandler = null;

export const WALLPAPER_PRESETS = [
  // Live Procedural Shaders
  { id: 'live:aurora', name: 'Aurora Borealis', type: 'live', desc: 'Undulating luminous curtains of teal, emerald & indigo' },
  { id: 'live:cosmos', name: 'Starry Cosmos', type: 'live', desc: 'Drifting starfield, deep nebula & occasional shooting stars' },
  { id: 'live:bokeh', name: 'Floating Bokeh', type: 'live', desc: 'Soft ethereal glowing orbs with mouse parallax' },
  { id: 'live:waves', name: 'Fluid Waves', type: 'live', desc: 'Harmonic rhythmic silk wave gradients' },

  // Vector Art
  { id: 'preset:mountain', name: 'Alpine Solitude', type: 'vector', file: 'wallpapers/mountain.svg', desc: 'Minimalist vector mountain ridges under starry skies' },
  { id: 'preset:forest', name: 'Misty Pine Forest', type: 'vector', file: 'wallpapers/forest.svg', desc: 'Atmospheric evergreen silhouettes in quiet fog' },
  { id: 'preset:inkwash', name: 'Inkwash Landscape', type: 'vector', file: 'wallpapers/inkwash.svg', desc: 'Traditional sumi-e minimalist mountain brushwork' },

  // Gradients
  { id: 'gradient-aurora', name: 'Midnight Aurora', type: 'gradient', desc: 'Deep violet to slate radial gradient' },
  { id: 'gradient-dusk', name: 'Twilight Dusk', type: 'gradient', desc: 'Indigo & twilight blue diagonal gradient' },
  { id: 'gradient-forest', name: 'Deep Pines', type: 'gradient', desc: 'Emerald forest to midnight teal gradient' },
  { id: 'gradient-editorial', name: 'Clean Paper', type: 'gradient', desc: 'Warm minimalist gallery paper gradient' },
  { id: 'none', name: 'Pure Obsidian', type: 'none', desc: 'Zero wallpaper, minimalist deep dark surface' },
];

/**
 * Closes the active Wallpaper Modal and restores focus.
 */
export function closeWallpaperModal() {
  if (boundEscHandler) {
    document.removeEventListener('keydown', boundEscHandler);
    boundEscHandler = null;
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
 * Opens the Wallpaper Gallery and Customizer Modal.
 */
export async function openWallpaperModal({ meta, activeWorkspaceId, onApplyWallpaper, showToast }) {
  closeWallpaperModal();
  lastFocusedElement = document.activeElement;

  const currentSettings = meta.settings || {};
  const currentWs = (meta.workspaces || []).find((w) => w.id === activeWorkspaceId);
  const isWsOverridden = Boolean(currentWs?.wallpaper);

  let selectedWallpaper = isWsOverridden ? currentWs.wallpaper : (currentSettings.wallpaper || 'preset:mountain');
  let selectedDim = isWsOverridden ? (currentWs.wallpaperDim ?? 15) : (currentSettings.wallpaperDim ?? 15);
  let selectedBlur = isWsOverridden ? (currentWs.wallpaperBlur ?? 0) : (currentSettings.wallpaperBlur ?? 0);
  let selectedEcoMode = Boolean(currentSettings.wallpaperEcoMode);
  let applyToWorkspaceOnly = isWsOverridden;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop wallpaper-modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Wallpaper & Atmosphere Gallery');

  const container = document.createElement('div');
  container.className = 'modal-container wallpaper-modal-container';
  container.style.maxWidth = '680px';
  container.style.width = '92%';
  container.style.maxHeight = '88vh';
  container.style.display = 'flex';
  container.style.flexDirection = 'column';

  // Header
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <div>
      <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        <span>Wallpaper & Atmosphere</span>
      </h3>
      <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 2px;">
        Choose interactive live shaders, vector art, or upload your own video & images
      </div>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-icon modal-close-btn';
  closeBtn.setAttribute('aria-label', 'Close wallpaper modal');
  closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  closeBtn.addEventListener('click', closeWallpaperModal);
  header.appendChild(closeBtn);
  container.appendChild(header);

  // Body (Scrollable Gallery)
  const body = document.createElement('div');
  body.className = 'modal-body wallpaper-modal-body';
  body.style.overflowY = 'auto';
  body.style.padding = '16px 20px';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '20px';

  // Section 1: Atmosphere Sliders (Dim & Blur & Eco Mode)
  const controlsCard = document.createElement('div');
  controlsCard.className = 'wp-controls-card';
  controlsCard.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 12px 16px; display: flex; flex-direction: column; gap: 10px;';

  controlsCard.innerHTML = `
    <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 140px;">
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 500; margin-bottom: 4px;">
          <span>Atmosphere Dim</span>
          <span id="wp-dim-val">${selectedDim}%</span>
        </div>
        <input type="range" id="wp-dim-slider" min="0" max="90" value="${selectedDim}" style="width: 100%;" aria-label="Wallpaper dim percentage">
      </div>
      <div style="flex: 1; min-width: 140px;">
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 500; margin-bottom: 4px;">
          <span>Backdrop Blur</span>
          <span id="wp-blur-val">${selectedBlur}px</span>
        </div>
        <input type="range" id="wp-blur-slider" min="0" max="30" value="${selectedBlur}" style="width: 100%;" aria-label="Wallpaper blur radius">
      </div>
    </div>
    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border-subtle); font-size: 11.5px;">
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="wp-eco-checkbox" ${selectedEcoMode ? 'checked' : ''}>
        <span>Eco Power Guard (Cap live shaders at 30 FPS for battery saving)</span>
      </label>
      <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none;">
        <input type="checkbox" id="wp-ws-override" ${applyToWorkspaceOnly ? 'checked' : ''}>
        <span>Apply only to <strong>${escapeText(currentWs?.name || 'Workspace')}</strong></span>
      </label>
    </div>
  `;
  body.appendChild(controlsCard);

  // Helper for applying live preview immediately
  const triggerLivePreview = (wpId, dim, blur, eco) => {
    if (onApplyWallpaper) {
      onApplyWallpaper({
        wallpaper: wpId,
        wallpaperDim: dim,
        wallpaperBlur: blur,
        wallpaperEcoMode: eco,
      });
    }
  };

  // Wire sliders
  const dimSlider = controlsCard.querySelector('#wp-dim-slider');
  const dimVal = controlsCard.querySelector('#wp-dim-val');
  dimSlider.addEventListener('input', () => {
    selectedDim = parseInt(dimSlider.value, 10);
    dimVal.textContent = `${selectedDim}%`;
    triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
  });

  const blurSlider = controlsCard.querySelector('#wp-blur-slider');
  const blurVal = controlsCard.querySelector('#wp-blur-val');
  blurSlider.addEventListener('input', () => {
    selectedBlur = parseInt(blurSlider.value, 10);
    blurVal.textContent = `${selectedBlur}px`;
    triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
  });

  const ecoCheckbox = controlsCard.querySelector('#wp-eco-checkbox');
  ecoCheckbox.addEventListener('change', () => {
    selectedEcoMode = ecoCheckbox.checked;
    triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
  });

  const wsOverrideCheckbox = controlsCard.querySelector('#wp-ws-override');
  wsOverrideCheckbox.addEventListener('change', () => {
    applyToWorkspaceOnly = wsOverrideCheckbox.checked;
  });

  // Section 2: Preset Tiles Categorized
  const categories = [
    { title: '✨ Live Interactive Shaders', type: 'live' },
    { title: '🎨 Curated Vector Art', type: 'vector' },
    { title: '🌌 Subtle Gradients & Obsidian', type: ['gradient', 'none'] },
  ];

  for (const cat of categories) {
    const sectionEl = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px;';
    titleEl.textContent = cat.title;
    sectionEl.appendChild(titleEl);

    const grid = document.createElement('div');
    grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 10px;';

    const items = WALLPAPER_PRESETS.filter((p) =>
      Array.isArray(cat.type) ? cat.type.includes(p.type) : p.type === cat.type
    );

    for (const item of items) {
      const tile = document.createElement('button');
      tile.className = `wp-tile ${selectedWallpaper === item.id ? 'active' : ''}`;
      tile.dataset.id = item.id;
      tile.style.cssText = `
        position: relative;
        height: 76px;
        border-radius: var(--radius-md);
        border: 2px solid ${selectedWallpaper === item.id ? 'var(--accent-primary)' : 'var(--border-subtle)'};
        background: rgba(255, 255, 255, 0.04);
        overflow: hidden;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        padding: 8px;
        text-align: left;
        transition: all 160ms var(--ease-spring);
      `;

      // Visual Thumbnail Representation
      let previewBg = '';
      if (item.type === 'live') {
        if (item.id === 'live:aurora') previewBg = 'linear-gradient(135deg, #064e3b 0%, #06b6d4 50%, #4338ca 100%)';
        else if (item.id === 'live:cosmos') previewBg = 'radial-gradient(circle, #312e81 0%, #0f172a 70%, #030712 100%)';
        else if (item.id === 'live:bokeh') previewBg = 'radial-gradient(circle at 70% 30%, #ec4899 0%, #8b5cf6 50%, #0f172a 100%)';
        else previewBg = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)';
      } else if (item.type === 'vector') {
        previewBg = `url('${item.file}') center/cover no-repeat`;
      } else if (item.id === 'gradient-aurora') {
        previewBg = 'radial-gradient(circle at 20% 20%, #1e1b4b 0%, #0f172a 50%, #020617 100%)';
      } else if (item.id === 'gradient-dusk') {
        previewBg = 'linear-gradient(135deg, #2e1065 0%, #172554 50%, #020617 100%)';
      } else if (item.id === 'gradient-forest') {
        previewBg = 'radial-gradient(circle at 80% 20%, #064e3b 0%, #0f172a 60%, #020617 100%)';
      } else if (item.id === 'gradient-editorial') {
        previewBg = 'linear-gradient(180deg, #fdfbf7 0%, #f1efe7 100%)';
      } else {
        previewBg = '#090a0f';
      }

      const thumbLayer = document.createElement('div');
      thumbLayer.style.cssText = `position: absolute; inset: 0; background: ${previewBg}; opacity: 0.85;`;
      tile.appendChild(thumbLayer);

      // Badge for LIVE or SVG
      if (item.type === 'live' || item.type === 'vector') {
        const badge = document.createElement('span');
        badge.style.cssText = 'position: absolute; top: 6px; right: 6px; font-size: 8.5px; font-weight: 700; padding: 2px 5px; border-radius: 4px; background: rgba(0,0,0,0.6); color: #fff; backdrop-filter: blur(4px); letter-spacing: 0.04em;';
        badge.textContent = item.type.toUpperCase();
        tile.appendChild(badge);
      }

      // Title overlay
      const titleSpan = document.createElement('span');
      titleSpan.style.cssText = 'position: relative; z-index: 1; font-size: 11.5px; font-weight: 600; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.8);';
      titleSpan.textContent = item.name;
      tile.appendChild(titleSpan);

      tile.addEventListener('click', () => {
        selectedWallpaper = item.id;
        body.querySelectorAll('.wp-tile').forEach((t) => {
          const isActive = t.dataset.id === item.id;
          t.style.borderColor = isActive ? 'var(--accent-primary)' : 'var(--border-subtle)';
        });
        triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
      });

      grid.appendChild(tile);
    }

    sectionEl.appendChild(grid);
    body.appendChild(sectionEl);
  }

  // Section 3: Custom Media (Video Loop, GIF, Image, URL)
  const customSection = document.createElement('div');
  customSection.innerHTML = `
    <div style="font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px;">
      🎬 Custom Media & Live Video Upload
    </div>
  `;

  const customCard = document.createElement('div');
  customCard.style.cssText = 'background: rgba(255, 255, 255, 0.04); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;';

  // Upload Zone
  const uploadRow = document.createElement('div');
  uploadRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 12px;';
  uploadRow.innerHTML = `
    <div>
      <div style="font-size: 12px; font-weight: 600;">Upload Video or Image File</div>
      <div style="font-size: 11px; color: var(--text-muted);">Supports MP4, WebM, animated GIF, WebP, PNG, JPG (up to 50MB)</div>
    </div>
    <input type="file" id="custom-media-input" accept="video/mp4,video/webm,image/gif,image/webp,image/png,image/jpeg" style="display: none;">
    <button id="choose-file-btn" class="btn-subtle" style="white-space: nowrap; padding: 6px 14px; font-size: 11.5px;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right: 4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Choose File
    </button>
  `;
  customCard.appendChild(uploadRow);

  // Direct URL Input
  const urlRow = document.createElement('div');
  urlRow.style.cssText = 'display: flex; gap: 8px; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 10px;';
  urlRow.innerHTML = `
    <input type="url" id="custom-url-input" class="modal-input" placeholder="Or paste external video / image URL (https://...)" style="flex: 1; font-size: 11.5px;" value="${selectedWallpaper.startsWith('url:') ? selectedWallpaper.slice(4) : ''}">
    <button id="apply-url-btn" class="btn-subtle" style="padding: 6px 14px; font-size: 11.5px; white-space: nowrap;">Apply URL</button>
  `;
  customCard.appendChild(urlRow);

  customSection.appendChild(customCard);
  body.appendChild(customSection);

  // File Upload Handler
  const fileInput = customCard.querySelector('#custom-media-input');
  const chooseBtn = customCard.querySelector('#choose-file-btn');
  chooseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 52428800) {
      alert('File exceeds 50MB limit. Please choose a smaller video or image to preserve browser memory.');
      return;
    }

    chooseBtn.disabled = true;
    chooseBtn.textContent = 'Saving...';

    try {
      await saveBlob('wallpaper_custom', file);
      selectedWallpaper = file.type.startsWith('video/') ? 'custom:video' : 'custom:image';
      triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
      if (showToast) showToast('Custom live wallpaper loaded successfully!');
    } catch (err) {
      console.error('Error saving wallpaper blob:', err);
      alert('Failed to save media file to browser storage.');
    } finally {
      chooseBtn.disabled = false;
      chooseBtn.textContent = 'Choose File';
    }
  });

  // URL Apply Handler
  const urlInput = customCard.querySelector('#custom-url-input');
  const applyUrlBtn = customCard.querySelector('#apply-url-btn');
  applyUrlBtn.addEventListener('click', () => {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) return;
    selectedWallpaper = `url:${rawUrl}`;
    triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
    if (showToast) showToast('Streaming wallpaper URL applied!');
  });

  container.appendChild(body);

  // Footer (Save / Done)
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-subtle';
  resetBtn.textContent = 'Reset to Default';
  resetBtn.addEventListener('click', () => {
    selectedWallpaper = 'preset:mountain';
    selectedDim = 15;
    selectedBlur = 0;
    dimSlider.value = 15;
    dimVal.textContent = '15%';
    blurSlider.value = 0;
    blurVal.textContent = '0px';
    triggerLivePreview(selectedWallpaper, selectedDim, selectedBlur, selectedEcoMode);
  });
  footer.appendChild(resetBtn);

  const rightActions = document.createElement('div');
  rightActions.style.display = 'flex';
  rightActions.style.gap = '8px';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-subtle';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    // Revert back to original
    triggerLivePreview(
      isWsOverridden ? currentWs.wallpaper : (currentSettings.wallpaper || 'preset:mountain'),
      isWsOverridden ? currentWs.wallpaperDim : (currentSettings.wallpaperDim ?? 15),
      isWsOverridden ? currentWs.wallpaperBlur : (currentSettings.wallpaperBlur ?? 0),
      currentSettings.wallpaperEcoMode
    );
    closeWallpaperModal();
  });
  rightActions.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.textContent = 'Save Atmosphere';
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    if (applyToWorkspaceOnly && activeWorkspaceId) {
      // Save override to active workspace
      const wsKey = `ws:${activeWorkspaceId}`;
      await transaction(['meta', wsKey], (shards) => {
        const metaObj = shards.meta;
        const targetWs = (metaObj.workspaces || []).find((w) => w.id === activeWorkspaceId);
        if (targetWs) {
          targetWs.wallpaper = selectedWallpaper;
          targetWs.wallpaperDim = selectedDim;
          targetWs.wallpaperBlur = selectedBlur;
        }
        return { meta: metaObj };
      });
    } else {
      // Save globally and clear workspace override if any
      await transaction(['meta'], (shards) => {
        const metaObj = shards.meta;
        metaObj.settings = metaObj.settings || {};
        metaObj.settings.wallpaper = selectedWallpaper;
        metaObj.settings.wallpaperDim = selectedDim;
        metaObj.settings.wallpaperBlur = selectedBlur;
        metaObj.settings.wallpaperEcoMode = selectedEcoMode;

        // If the user chose global, remove workspace-specific override
        const targetWs = (metaObj.workspaces || []).find((w) => w.id === activeWorkspaceId);
        if (targetWs && targetWs.wallpaper) {
          delete targetWs.wallpaper;
          delete targetWs.wallpaperDim;
          delete targetWs.wallpaperBlur;
        }

        return { meta: metaObj };
      });
    }

    closeWallpaperModal();
    if (showToast) showToast('Atmosphere settings saved!');
  });
  rightActions.appendChild(saveBtn);
  footer.appendChild(rightActions);
  container.appendChild(footer);

  backdrop.appendChild(container);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeWallpaperModal();
  });

  boundEscHandler = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeWallpaperModal();
    }
  };
  document.addEventListener('keydown', boundEscHandler);

  document.body.appendChild(backdrop);
  activeModalEl = backdrop;
}

function escapeText(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}
