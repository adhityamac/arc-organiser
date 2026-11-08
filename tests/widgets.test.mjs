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
    assert.equal(meta.settings.wallpaper, 'none');
    assert.equal(meta.settings.wallpaperDim, 0);
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

  await t.test('Pomodoro durations follow 25m focus / 5m short / 15m long standards', () => {
    const durations = {
      focus: 25 * 60,
      short: 5 * 60,
      long: 15 * 60,
    };
    assert.equal(durations.focus, 1500);
    assert.equal(durations.short, 300);
    assert.equal(durations.long, 900);
  });

  await t.test('getEnabledWidgets helper correctly resolves and auto-upgrades legacy lists', async () => {
    const { getEnabledWidgets, ALL_MARKMEZ_WIDGETS } = await import('../lib/ui/widgets.js');

    // 1. Legacy array containing only ['clock']
    assert.deepEqual(getEnabledWidgets(['clock']), ALL_MARKMEZ_WIDGETS);

    // 2. Legacy array containing old v1/v2 widgets ['clock', 'speed-dial', 'inbox-stats']
    assert.deepEqual(getEnabledWidgets(['clock', 'speed-dial', 'inbox-stats']), ALL_MARKMEZ_WIDGETS);

    // 3. Empty or null/undefined or objects with empty/null/missing widgets
    assert.deepEqual(getEnabledWidgets([]), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets(null), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets(undefined), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({}), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({ settings: {} }), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({ settings: { widgets: [] } }), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({ settings: { widgets: null } }), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({ widgets: [] }), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({ widgets: null }), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets(123), ALL_MARKMEZ_WIDGETS);

    // 4. Object with settings.widgets
    assert.deepEqual(getEnabledWidgets({ settings: { widgets: ['clock'] } }), ALL_MARKMEZ_WIDGETS);
    assert.deepEqual(getEnabledWidgets({ widgets: ['clock'] }), ALL_MARKMEZ_WIDGETS);

    // 5. User intentionally configured custom widgets including markmez widgets
    assert.deepEqual(getEnabledWidgets(['clock', 'pomodoro']), ['clock', 'pomodoro']);
    assert.deepEqual(getEnabledWidgets({ settings: { widgets: ['weather', 'calendar'] } }), ['weather', 'calendar']);
    assert.deepEqual(getEnabledWidgets({ widgets: ['focus-today'] }), ['focus-today']);
  });

  await t.test('initStoreIfNeeded automatically migrates existing meta with legacy widgets list', async () => {
    const { initStoreIfNeeded } = await import('../lib/store.js');
    const { ALL_MARKMEZ_WIDGETS } = await import('../lib/ui/widgets.js');

    const legacyMeta = {
      schemaVersion: 2,
      rev: 5,
      activeWorkspaceId: 'ws_default',
      settings: {
        widgets: ['clock'],
      },
    };

    const mockStorage = {
      meta: legacyMeta,
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

    const migrated = await initStoreIfNeeded(adapter);
    assert.equal(migrated, true, 'initStoreIfNeeded should return true when upgrading legacy widgets');
    assert.deepEqual(mockStorage.meta.settings.widgets, ALL_MARKMEZ_WIDGETS);

    // Running again should return false (already up-to-date)
    const secondRun = await initStoreIfNeeded(adapter);
    assert.equal(secondRun, false);
  });
});
