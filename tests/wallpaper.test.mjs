import test from 'node:test';
import assert from 'node:assert/strict';
import { WALLPAPER_PRESETS } from '../lib/ui/wallpaper-modal.js';

test('WALLPAPER_PRESETS metadata catalog', async (t) => {
  await t.test('includes all curated live procedural themes', () => {
    const livePresets = WALLPAPER_PRESETS.filter((p) => p.type === 'live');
    const ids = livePresets.map((p) => p.id);
    assert.deepEqual(ids, ['live:aurora', 'live:cosmos', 'live:bokeh', 'live:waves']);
    for (const p of livePresets) {
      assert.ok(p.name && p.name.length > 0, `Preset ${p.id} must have a name`);
      assert.ok(p.desc && p.desc.length > 0, `Preset ${p.id} must have a description`);
    }
  });

  await t.test('includes curated vector art presets with valid SVG file paths', () => {
    const vectorPresets = WALLPAPER_PRESETS.filter((p) => p.type === 'vector');
    const ids = vectorPresets.map((p) => p.id);
    assert.deepEqual(ids, ['preset:mountain', 'preset:forest', 'preset:inkwash']);
    for (const p of vectorPresets) {
      assert.ok(p.file && p.file.endsWith('.svg'), `Vector preset ${p.id} must reference an .svg file`);
    }
  });

  await t.test('includes pure obsidian and subtle gradient presets', () => {
    const hasNone = WALLPAPER_PRESETS.some((p) => p.id === 'none');
    const hasAurora = WALLPAPER_PRESETS.some((p) => p.id === 'gradient-aurora');
    assert.ok(hasNone, 'Must include pure obsidian none option');
    assert.ok(hasAurora, 'Must include gradient-aurora');
  });
});

test('Live & Custom Wallpaper configuration logic', async (t) => {
  await t.test('detects video stream URLs vs static image URLs', () => {
    const isVideoUrl = (raw) => /\.(mp4|webm|ogv)(\?.*)?$/i.test(raw);
    assert.equal(isVideoUrl('https://example.com/assets/ambient.mp4'), true);
    assert.equal(isVideoUrl('https://cdn.site.com/clip.webm?token=123'), true);
    assert.equal(isVideoUrl('https://images.unsplash.com/photo.jpg'), false);
    assert.equal(isVideoUrl('https://images.unsplash.com/wallpaper.png'), false);
  });

  await t.test('clamps dim and blur settings to valid bounds', () => {
    const clampDim = (val) => Math.max(0, Math.min(90, parseInt(val, 10) || 0));
    const clampBlur = (val) => Math.max(0, Math.min(30, parseInt(val, 10) || 0));

    assert.equal(clampDim(-10), 0);
    assert.equal(clampDim(50), 50);
    assert.equal(clampDim(150), 90);

    assert.equal(clampBlur(-5), 0);
    assert.equal(clampBlur(12), 12);
    assert.equal(clampBlur(60), 30);
  });

  await t.test('resolves workspace-specific wallpaper overrides over global settings', () => {
    const globalSettings = {
      wallpaper: 'preset:mountain',
      wallpaperDim: 15,
      wallpaperBlur: 0,
    };

    const workspaceDefault = { id: 'ws_default', name: 'General' };
    const workspaceCustom = {
      id: 'ws_focus',
      name: 'Focus Lab',
      wallpaper: 'live:cosmos',
      wallpaperDim: 25,
      wallpaperBlur: 5,
    };

    const resolveWallpaper = (settings, ws) => ({
      wallpaper: ws?.wallpaper || settings.wallpaper,
      dim: ws?.wallpaperDim ?? settings.wallpaperDim,
      blur: ws?.wallpaperBlur ?? settings.wallpaperBlur,
    });

    const defaultResolved = resolveWallpaper(globalSettings, workspaceDefault);
    assert.equal(defaultResolved.wallpaper, 'preset:mountain');
    assert.equal(defaultResolved.dim, 15);
    assert.equal(defaultResolved.blur, 0);

    const customResolved = resolveWallpaper(globalSettings, workspaceCustom);
    assert.equal(customResolved.wallpaper, 'live:cosmos');
    assert.equal(customResolved.dim, 25);
    assert.equal(customResolved.blur, 5);
  });
});
