import test from 'node:test';
import assert from 'node:assert/strict';
import { WALLPAPER_PRESETS } from '../lib/ui/wallpaper-modal.js';

test('WALLPAPER_PRESETS metadata catalog', async (t) => {
  await t.test('catalog contains live shaders and gradients without hardcoded external vector files', () => {
    assert.ok(WALLPAPER_PRESETS.length >= 4, 'Must include live and gradient presets');
    for (const p of WALLPAPER_PRESETS) {
      assert.ok(p.id, 'Preset must have an id');
      assert.notEqual(p.type, 'vector', 'No vector SVG dependencies allowed');
      assert.ok(p.name && p.name.length > 0, 'Must have a title');
      assert.ok(p.desc && p.desc.length > 0, 'Must have a description');
    }
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
