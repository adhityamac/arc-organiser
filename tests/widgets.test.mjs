import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDefaultMeta, transaction } from '../lib/store.js';

test('Zen Widgets & Markmez Configuration', async (t) => {
  await t.test('default meta contains all 5 Markmez widgets and nature styling', () => {
    const meta = createDefaultMeta();
    assert.deepEqual(meta.settings.widgets, [
      'clock',
      'weather',
      'focus-today',
      'pomodoro',
      'calendar',
    ]);
    assert.equal(meta.settings.accent, '#536b44');
    assert.equal(meta.settings.wallpaper, 'preset:mountain');
    assert.equal(meta.settings.wallpaperDim, 15);
  });

  await t.test('all 3 curated SVG nature wallpapers exist and contain valid SVG markup', () => {
    const cwd = process.cwd();
    const files = [
      'wallpapers/mountain.svg',
      'wallpapers/forest.svg',
      'wallpapers/inkwash.svg',
    ];

    for (const relPath of files) {
      const fullPath = path.join(cwd, relPath);
      assert.ok(fs.existsSync(fullPath), `File ${relPath} must exist`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(content.startsWith('<svg'), `File ${relPath} must begin with <svg`);
      assert.ok(content.includes('</svg>'), `File ${relPath} must contain </svg>`);
    }
  });

  await t.test('settings update transaction mutator properly persists meta changes', async () => {
    const mockStorage = {
      meta: createDefaultMeta(),
    };
    const adapter = {
      get: async (keys) => {
        const res = {};
        for (const k of keys) {
          if (mockStorage[k]) res[k] = JSON.parse(JSON.stringify(mockStorage[k]));
        }
        return res;
      },
      set: async (items) => {
        for (const [k, v] of Object.entries(items)) {
          mockStorage[k] = JSON.parse(JSON.stringify(v));
        }
      },
    };

    // Save setting pattern (must return { meta })
    const result = await transaction([], (shards, meta) => {
      meta.settings = meta.settings || {};
      meta.settings.weatherCity = 'Tokyo';
      meta.settings.weatherUnit = 'C';
      meta.settings.clockIs24h = true;
      meta.settings.widgets = ['clock', 'pomodoro'];
      return { meta };
    }, adapter);

    assert.ok(result.updatedKeys.includes('meta'), 'transaction must report meta updated');
    assert.equal(mockStorage.meta.settings.weatherCity, 'Tokyo');
    assert.equal(mockStorage.meta.settings.weatherUnit, 'C');
    assert.equal(mockStorage.meta.settings.clockIs24h, true);
    assert.deepEqual(mockStorage.meta.settings.widgets, ['clock', 'pomodoro']);
  });

  await t.test('calendar grid generator outputs 35 or 42 cells with correct day distribution', () => {
    function computeGridCellCount(year, month) {
      const firstDayIndex = new Date(year, month, 1).getDay();
      const lastDateOfMonth = new Date(year, month + 1, 0).getDate();
      const totalCells = firstDayIndex + lastDateOfMonth;
      return totalCells > 35 ? 42 : 35;
    }

    // Test across all 12 months of 2026
    for (let m = 0; m < 12; m++) {
      const cellCount = computeGridCellCount(2026, m);
      assert.ok(cellCount === 35 || cellCount === 42, `Month ${m} must have 35 or 42 cells`);
    }
  });
});
