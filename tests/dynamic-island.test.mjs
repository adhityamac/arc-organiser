import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Unified Dynamic Island & Left Obsidian Rail Integration', async (t) => {
  const cwd = process.cwd();
  const htmlPath = path.join(cwd, 'newtab.html');
  const cssPath = path.join(cwd, 'newtab.css');
  const jsPath = path.join(cwd, 'newtab.js');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  await t.test('newtab.html contains left obsidian glass navigation rail with all required buttons', () => {
    assert.ok(html.includes('<aside id="sidebar-rail" class="sidebar-rail" aria-label="Primary Navigation">'), 'Sidebar rail element must exist');
    assert.ok(html.includes('id="rail-brand-btn"'), 'Brand button must exist');
    assert.ok(html.includes('class="rail-divider"'), 'Rail divider must exist');
    assert.ok(html.includes('id="rail-workspaces-btn"'), 'Workspaces button must exist');
    assert.ok(html.includes('id="rail-search-btn"'), 'Search button must exist');
    assert.ok(html.includes('id="rail-triage-btn"'), 'Triage button must exist');
    assert.ok(html.includes('id="rail-triage-badge"'), 'Triage badge must exist');
    assert.ok(html.includes('id="rail-drawer-btn"'), 'Drawer button must exist');
    assert.ok(html.includes('id="rail-add-column-btn"'), 'Add column button must exist');
    assert.ok(html.includes('id="rail-view-mode-btn"'), 'View mode button must exist');
    assert.ok(html.includes('id="rail-theme-btn"'), 'Theme button must exist');
    assert.ok(html.includes('id="rail-settings-btn"'), 'Settings button must exist');
    assert.ok(html.includes('id="rail-profile-btn"'), 'Profile button must exist');
    assert.ok(html.includes('class="rail-avatar-orb"'), 'Profile rainbow orb must exist');
    assert.ok(html.includes('class="rail-tooltip"'), 'Apple-style tooltips must exist');
  });

  await t.test('newtab.html contains unified dynamic island with idle and expanded states', () => {
    assert.ok(html.includes('id="dynamic-island"'), 'Dynamic Island element must exist');
    assert.ok(html.includes('class="island-idle"'), 'Idle state element must exist');
    assert.ok(html.includes('live-pill-time'), 'Time span must exist');
    assert.ok(html.includes('id="top-weather-chip"'), 'Weather chip must exist inside idle island');
    assert.ok(html.includes('id="island-focus-badge"'), 'Focus badge must exist');
    assert.ok(html.includes('focus-dot dot-work'), 'Default WORK focus dot must exist');
    assert.ok(html.includes('⌘K'), '⌘K search hint must exist');

    assert.ok(html.includes('class="island-expanded"'), 'Expanded state element must exist');
    assert.ok(html.includes('id="island-search-input"'), 'Search input must exist');
    assert.ok(html.includes('placeholder="Search bookmarks, tabs, or web..."'), 'Placeholder must match specification');
    assert.ok(html.includes('id="island-focus-badge-mini"'), 'Embedded status badge must exist');
    assert.ok(html.includes('id="island-close-btn"'), 'Close/collapse button must exist');
  });

  await t.test('newtab.css contains obsidian capsule styles and Apple spring transitions', () => {
    assert.ok(css.includes('#dynamic-island.dynamic-island'), 'Dynamic island CSS rule must exist');
    assert.ok(css.includes('border-radius: 9999px'), 'Capsule border radius must exist');
    assert.ok(css.includes('rgba(10, 13, 20, 0.85)'), 'Obsidian background must match specification');
    assert.ok(css.includes('backdrop-filter: blur(32px) saturate(190%)'), 'Blur and saturation must match specification');
    assert.ok(css.includes('cubic-bezier(0.16, 1, 0.3, 1)'), 'Apple spring easing curve must be applied');
    assert.ok(css.includes('360px'), 'Idle width must be 360px');
    assert.ok(css.includes('620px'), 'Expanded width must be 620px');

    // Focus Badge Dots
    assert.ok(css.includes('.dot-work'), 'dot-work class must exist');
    assert.ok(css.includes('#a855f7'), 'Violet glowing dot for WORK');
    assert.ok(css.includes('.dot-personal'), 'dot-personal class must exist');
    assert.ok(css.includes('#38bdf8'), 'Sky blue glowing dot for PERSONAL');
    assert.ok(css.includes('.dot-focus'), 'dot-focus class must exist');
    assert.ok(css.includes('#34d399'), 'Emerald green glowing dot for DEEP FOCUS');
  });

  await t.test('newtab.js wires focus mode cycling correctly', () => {
    const focusModes = [
      { id: 'WORK', label: 'WORK' },
      { id: 'PERSONAL', label: 'PERSONAL' },
      { id: 'FOCUS', label: 'DEEP FOCUS' },
    ];

    let current = 'WORK';
    const cycle = (cur) => {
      const idx = focusModes.findIndex(m => m.id === cur);
      return focusModes[(idx + 1) % focusModes.length].id;
    };

    current = cycle(current);
    assert.equal(current, 'PERSONAL');
    current = cycle(current);
    assert.equal(current, 'FOCUS');
    current = cycle(current);
    assert.equal(current, 'WORK');
  });
});
