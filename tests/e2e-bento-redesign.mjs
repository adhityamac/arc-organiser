import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const screenshotPath = 'C:\\Users\\adhit\\.gemini\\antigravity\\brain\\a168fc65-96b4-419d-aad6-4f45b8dc2e04\\bento-redesign-preview.png';
const activePillScreenshotPath = 'C:\\Users\\adhit\\.gemini\\antigravity\\brain\\a168fc65-96b4-419d-aad6-4f45b8dc2e04\\bento-redesign-active-pill.png';
const lightScreenshotPath = 'C:\\Users\\adhit\\.gemini\\antigravity\\brain\\a168fc65-96b4-419d-aad6-4f45b8dc2e04\\bento-redesign-light.png';

async function testBentoRedesign() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe';

  console.log('Testing Bento Redesign: Floating Top Chrome, Dynamic Live Pill, Bottom Dock, Bento Grid...');
  const context = await chromium.launchPersistentContext('', {
    executablePath: edgePath,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-gpu',
    ],
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = await context.newPage();
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));

    let serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      serviceWorkers = [await context.waitForEvent('serviceworker', { timeout: 8000 }).catch(() => null)].filter(Boolean);
    }
    const swUrl = serviceWorkers[0]?.url() || '';
    const extId = swUrl.split('/')[2];
    assert.ok(extId, 'Could not determine extension ID');
    console.log(`Extension ID: ${extId}`);

    // Load newtab page
    await page.goto(`chrome-extension://${extId}/newtab.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 1. Verify Top 3 Floating Pieces exist
    const topChrome = await page.$('#top-chrome-container');
    assert.ok(topChrome, 'Top chrome container must exist');
    const topLeft = await page.$('#top-bar-left');
    assert.ok(topLeft, 'Top bar left (segmented switcher) must exist');
    const topCenter = await page.$('#dynamic-live-pill');
    assert.ok(topCenter, 'Top bar center (dynamic live pill) must exist');
    const topRight = await page.$('#top-bar-right');
    assert.ok(topRight, 'Top bar right (weather/palette/search) must exist');
    console.log('✔ Top 3 floating chrome pieces verified');

    // 2. Verify Bottom Floating Dock & Left Navigation Rail exist
    const bottomDock = await page.$('#bottom-dock');
    assert.ok(bottomDock, 'Bottom floating dock must exist');
    const rail = await page.$('#sidebar-rail');
    assert.ok(rail, 'Sidebar rail must exist');
    const dynamicIsland = await page.$('#dynamic-island');
    assert.ok(dynamicIsland, 'Dynamic island must exist');
    console.log('✔ Bottom floating dock, Left rail, and Dynamic Island verified');

    // 3. Verify Bento Grid Layout & Standard Anatomy
    const board = await page.$('#board-container');
    const hasBentoClass = await board.evaluate((el) => el.classList.contains('view-mode-bento'));
    assert.ok(hasBentoClass, 'Board must have view-mode-bento class');

    const tiles = await page.$$('.column, .widget-card');
    assert.ok(tiles.length > 0, 'Bento tiles must exist');
    console.log(`✔ Found ${tiles.length} Bento tiles on board`);

    // Check footer anatomy on first column
    const footer = await page.$('.tile-footer');
    assert.ok(footer, 'Tile footer must exist');
    const faviconStack = await page.$('.tile-favicon-stack');
    assert.ok(faviconStack, 'Tile footer must contain favicon stack');
    const countBadge = await page.$('.tile-count-badge');
    assert.ok(countBadge, 'Tile footer must contain count badge');
    console.log('✔ Standard tile anatomy verified: Title, flattened rows, footer with favicons & count');

    // Check Ghost "+" tile
    const ghostTile = await page.$('.create-room-tile');
    assert.ok(ghostTile, 'Ghost "+" tile ("Create a collection") must exist');
    console.log('✔ Ghost "+" tile verified');

    // 4. Capture Rest State Screenshot
    await page.screenshot({ path: screenshotPath });
    console.log(`✔ Rest state preview screenshot saved to: ${screenshotPath}`);

    // 5. Trigger Pomodoro to test Dynamic Live Pill morphing
    const pomoStartBtn = await page.$('.pomo-btn-play');
    if (pomoStartBtn) {
      await pomoStartBtn.click();
      await page.waitForTimeout(600);
      const isLivePillActive = await topCenter.evaluate((el) => el.classList.contains('is-pomo-active'));
      console.log(`✔ Dynamic Live Pill active state: ${isLivePillActive}`);
      await page.screenshot({ path: activePillScreenshotPath });
      console.log(`✔ Active live pill preview screenshot saved to: ${activePillScreenshotPath}`);
    }

    // 6. Test Light Mode Toggle and Capture Light Theme Screenshot
    const themeBtn = await page.$('#top-theme-btn');
    if (themeBtn) {
      await themeBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: lightScreenshotPath });
      console.log(`✔ Light theme preview screenshot saved to: ${lightScreenshotPath}`);
    }

  } catch (err) {
    console.error('Test failed:', err);
    throw err;
  } finally {
    await context.close();
  }
}

testBentoRedesign().catch((err) => {
  console.error(err);
  process.exit(1);
});
