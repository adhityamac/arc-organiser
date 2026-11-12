import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const artifactDir = 'C:\\Users\\adhit\\.gemini\\antigravity\\brain\\ce9f44f1-2027-4dcc-ad15-9ad00ef91e78';

if (!fs.existsSync(artifactDir)) {
  try {
    fs.mkdirSync(artifactDir, { recursive: true });
  } catch {}
}

async function saveScreenshot(page, filename) {
  try {
    await page.screenshot({ path: path.join(artifactDir, filename), fullPage: false });
  } catch (e) {
    console.warn(`Could not save screenshot:`, e.message);
  }
}

async function runBrowserTest() {
  console.log('Launching Real Chromium Browser with Extension loaded...');
  
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-gpu',
    ],
    viewport: { width: 1440, height: 900 },
  });

  try {
    let extId = '';
    const swPromise = new Promise((resolve) => {
      context.on('serviceworker', (sw) => {
        const id = sw.url().split('/')[2];
        if (id) resolve(id);
      });
    });

    const page = await context.newPage();
    const consoleLogs = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
      console.log(`[BROWSER DEVTOOLS ${msg.type().toUpperCase()}]:`, msg.text());
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
      console.error('[BROWSER DEVTOOLS ERROR]:', err);
    });

    // Check existing service workers or wait for event
    const existing = context.serviceWorkers();
    if (existing.length > 0) {
      extId = existing[0].url().split('/')[2];
    } else {
      extId = await Promise.race([
        swPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for extension service worker')), 10000))
      ]);
    }

    console.log('✔ Connected to Extension ID:', extId);

    // Navigate to newtab.html
    const targetUrl = `chrome-extension://${extId}/newtab.html`;
    console.log('Navigating to live extension tab:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // 1. Verify Hero Atmosphere Elements
    const heroClock = await page.$('#hero-clock');
    const heroDate = await page.$('#hero-date');
    const heroWeatherSub = await page.$('#hero-weather-sub');
    const clockText = heroClock ? (await heroClock.innerText()).trim() : '';
    const dateText = heroDate ? (await heroDate.innerText()).trim() : '';
    console.log(`✔ Hero Clock: "${clockText}", Hero Date: "${dateText}"`);

    if (!clockText || !dateText) {
      pageErrors.push('Hero clock or date text is empty');
    }

    // 2. Verify Material You Organic Widgets Shelf
    const widgetShelf = await page.$('#widget-shelf');
    const cloverWidget = await page.$('#clover-capture-widget');
    const pebbleWidget = await page.$('#pebble-weather-widget');
    const cloverCenter = await page.$('#clover-btn-center');
    const cloverTask = await page.$('#clover-btn-task');
    const cloverDrawer = await page.$('#clover-btn-drawer');
    const cloverNote = await page.$('#clover-btn-note');
    const cloverWindow = await page.$('#clover-btn-window');

    const widgetsFound = {
      widgetShelf: !!widgetShelf,
      cloverWidget: !!cloverWidget,
      pebbleWidget: !!pebbleWidget,
      cloverCenter: !!cloverCenter,
      cloverTask: !!cloverTask,
      cloverDrawer: !!cloverDrawer,
      cloverNote: !!cloverNote,
      cloverWindow: !!cloverWindow,
    };
    console.log('✔ Widgets verification:', widgetsFound);

    // 3. Capture Dark Mode Screenshot (with Hero atmosphere)
    await saveScreenshot(page, 'newtab-hero-dark.png');
    await saveScreenshot(page, 'newtab-preview-dark.png');
    console.log('✔ Captured dark mode hero screenshots');

    // 4. Test Integrated Top Search Bar
    const topSearchInput = await page.$('#top-search-input');
    if (topSearchInput) {
      console.log('✔ Testing #top-search-input interaction...');
      await topSearchInput.click();
      await topSearchInput.fill('work');
      await page.waitForTimeout(400);

      // Verify clear button is visible
      const clearBtn = await page.$('#top-search-clear-btn');
      const isClearVisible = clearBtn ? await clearBtn.isVisible() : false;
      console.log('Clear button visible after typing:', isClearVisible);

      await saveScreenshot(page, 'newtab-top-search.png');
      console.log('✔ Captured top search screenshot');

      // Click clear button
      if (clearBtn && isClearVisible) {
        await clearBtn.click();
        await page.waitForTimeout(300);
      }
    } else {
      pageErrors.push('Missing #top-search-input');
    }

    // 5. Test Rail Workspaces Tab Switch
    const railWorkspaces = await page.$('#rail-workspaces');
    if (railWorkspaces) {
      let wsButtons = await page.$$('#rail-workspaces .rail-ws-btn');
      console.log(`✔ Found ${wsButtons.length} workspace buttons in left rail`);
      if (wsButtons.length > 1) {
        await wsButtons[1].click();
        await page.waitForTimeout(500);
        console.log('✔ Switched to workspace 2');

        // Re-query buttons after DOM re-render
        wsButtons = await page.$$('#rail-workspaces .rail-ws-btn');
        if (wsButtons.length > 0) {
          await wsButtons[0].click();
          await page.waitForTimeout(500);
          console.log('✔ Switched back to workspace 1');
        }
      }
    } else {
      pageErrors.push('Missing #rail-workspaces in sidebar rail');
    }

    // 6. Test Light Mode Toggle via Rail Theme Button
    const themeBtn = await page.$('#rail-theme-btn');
    if (themeBtn) {
      await themeBtn.click();
      await page.waitForTimeout(600);
      await saveScreenshot(page, 'newtab-hero-light.png');
      await saveScreenshot(page, 'newtab-preview-light.png');
      console.log('✔ Captured light mode hero screenshots');

      // Toggle back to dark
      await themeBtn.click();
      await page.waitForTimeout(400);
    }

    // 7. Verify DOM Elements & Cleanup
    const verification = {
      heroClockExists: !!heroClock,
      heroDateExists: !!heroDate,
      cloverCaptureWidgetExists: !!cloverWidget,
      pebbleWeatherWidgetExists: !!pebbleWidget,
      topSearchInputExists: (await page.$('#top-search-input')) !== null,
      railWorkspacesExists: (await page.$('#rail-workspaces')) !== null,
      sidebarRailExists: (await page.$('#sidebar-rail')) !== null,
      boardContainerExists: (await page.$('#board-container')) !== null,
      floatingFabGone: (await page.$('.floating-fab-container')) === null,
      bottomDockGone: (await page.$('#bottom-dock')) === null,
      palettePickerPopoverGone: (await page.$('#palette-picker-popover')) === null,
      dynamicIslandGone: (await page.$('#dynamic-island')) === null,
      consoleErrorsCount: pageErrors.length,
    };

    console.log('================ DEVTOOLS VERIFICATION REPORT ================');
    console.log(JSON.stringify(verification, null, 2));

    const failedChecks = Object.entries(verification)
      .filter(([k, v]) => k === 'consoleErrorsCount' ? v > 0 : v !== true);

    if (failedChecks.length > 0) {
      console.error('FAIL: Verification checks failed:', failedChecks);
      process.exit(1);
    }

    if (pageErrors.length > 0) {
      console.error('FAIL: Page encountered runtime errors:', pageErrors);
      process.exit(1);
    }

    console.log('SUCCESS: All browser tests and DevTools checks passed with 0 errors!');
  } finally {
    await context.close();
  }
}

runBrowserTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
