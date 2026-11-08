import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');
const screenshotPath = 'C:\\Users\\adhit\\.gemini\\antigravity\\brain\\a168fc65-96b4-419d-aad6-4f45b8dc2e04\\apple-design-preview.png';

async function testAppleDesign() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\157.0.4341.42\\msedge.exe';

  console.log('Testing Apple Design & Fluid UI with Playwright...');
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

    // 1. Verify Apple Workspace Segmented Control & Sliding Pill
    const sliderPill = await page.$('.ws-slider-pill');
    assert.ok(sliderPill, 'Sliding spring pill indicator must exist');
    console.log('✔ Workspace sliding pill indicator rendered');

    // 2. Verify Dock-Style Navigation Rail
    const rail = await page.$('.sidebar-rail');
    assert.ok(rail, 'Sidebar rail must exist');
    const railButtons = await page.$$('.rail-btn');
    assert.ok(railButtons.length >= 6, 'Must render rail action buttons');
    console.log(`✔ Dock-style rail active with ${railButtons.length} action buttons`);

    // 3. Verify Bento Frosted Platters & Cards
    const columns = await page.$$('.column');
    assert.ok(columns.length > 0, 'Must have rendered columns');
    console.log(`✔ Rendered ${columns.length} Bento frosted platters`);

    // 4. Test Card Right-Click to Summon macOS Frosted Context Menu
    const firstCard = await page.$('.card');
    if (firstCard) {
      console.log('Testing macOS context menu right-click on bookmark card...');
      await firstCard.click({ button: 'right' });
      await page.waitForTimeout(300);

      const contextMenu = await page.$('#macos-context-menu');
      const isVisible = await contextMenu.evaluate((el) => el.style.display !== 'none');
      assert.ok(isVisible, 'macOS context menu must appear on right-click');
      const menuItems = await page.$$('#macos-context-menu .macos-menu-item');
      console.log(`✔ macOS frosted glass context menu popped up with ${menuItems.length} actions!`);

      // Dismiss menu
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 5. Capture Preview Screenshot
    await page.screenshot({ path: screenshotPath });
    console.log(`✔ Apple Design preview screenshot saved to: ${screenshotPath}`);

  } catch (err) {
    console.error('Test failed:', err);
    throw err;
  } finally {
    await context.close();
  }
}

testAppleDesign().catch((e) => {
  console.error(e);
  process.exit(1);
});
