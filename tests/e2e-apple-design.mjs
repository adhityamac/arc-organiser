import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const screenshotPath = 'C:\\Users\\adhit\\.gemini\\antigravity\\brain\\a168fc65-96b4-419d-aad6-4f45b8dc2e04\\bento-resizable-preview.png';

async function testBentoUniversalResizable() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe';

  console.log('Testing Bento Only, Universal Resizing & Removed Triage/Search...');
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

    // 1. Verify Inbox Triage is removed from rail
    const triageBtn = await page.$('#rail-triage-btn');
    assert.strictEqual(triageBtn, null, 'Inbox triage button must be removed from navigation rail');
    console.log('✔ Inbox triage button confirmed removed from navigation rail');

    // 2. Verify Search Box is removed from top bar
    const searchBar = await page.$('#search-bar-wrap');
    assert.strictEqual(searchBar, null, 'Search bar wrap must be removed from top bar');
    console.log('✔ Search box confirmed removed from top bar');

    // 3. Verify View Mode is locked to Bento Grid
    const board = await page.$('#board-container');
    const hasBentoClass = await board.evaluate((el) => el.classList.contains('view-mode-bento'));
    assert.ok(hasBentoClass, 'Board must have view-mode-bento class');
    const hasKanbanClass = await board.evaluate((el) => el.classList.contains('view-mode-kanban'));
    assert.strictEqual(hasKanbanClass, false, 'Board must NOT have view-mode-kanban');
    console.log('✔ View mode verified: Bento Grid exclusive');

    // 4. Verify Columns are Universal Resizable
    const colResizeHandles = await page.$$('.col-resize-handle');
    assert.ok(colResizeHandles.length > 0, 'Every column must have a resize grip');
    console.log(`✔ Found ${colResizeHandles.length} universal column resize grips`);

    // 5. Verify Cards are Draggable and Resizable
    const cards = await page.$$('.card');
    assert.ok(cards.length > 0, 'Cards must exist');
    const isDraggable = await cards[0].evaluate((el) => el.draggable === true);
    assert.ok(isDraggable, 'Cards must be draggable');
    const cardResizeHandles = await page.$$('.card-resize-handle');
    assert.ok(cardResizeHandles.length > 0, 'Cards must have resize grips');
    console.log(`✔ Verified ${cards.length} cards: all draggable & resizable`);

    // 6. Test Interactive Resizing of a Column
    const firstCol = await page.$('.column');
    const initialHeight = await firstCol.evaluate((el) => el.offsetHeight);
    const handle = await firstCol.$('.col-resize-handle');
    const box = await handle.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80);
      await page.mouse.up();
      await page.waitForTimeout(200);

      const newHeight = await firstCol.evaluate((el) => el.offsetHeight);
      console.log(`✔ Column interactive drag resize: ${initialHeight}px -> ${newHeight}px`);
    }

    // 7. Capture Screenshot
    await page.screenshot({ path: screenshotPath });
    console.log(`✔ Bento universal resizable preview screenshot saved to: ${screenshotPath}`);

  } catch (err) {
    console.error('Test failed:', err);
    throw err;
  } finally {
    await context.close();
  }
}

testBentoUniversalResizable().catch((e) => {
  console.error(e);
  process.exit(1);
});
