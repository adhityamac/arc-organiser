import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..');

async function launchInteractive() {
  console.log('Opening live interactive browser window with extension loaded...');
  
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--start-maximized',
    ],
    viewport: null,
  });

  const swPromise = new Promise((resolve) => {
    context.on('serviceworker', (sw) => {
      const id = sw.url().split('/')[2];
      if (id) resolve(id);
    });
  });

  const page = await context.newPage();
  let extId = '';
  const existing = context.serviceWorkers();
  if (existing.length > 0) {
    extId = existing[0].url().split('/')[2];
  } else {
    extId = await swPromise;
  }

  const newTabUrl = `chrome-extension://${extId}/newtab.html`;
  console.log('Navigating to live extension new tab:', newTabUrl);
  await page.goto(newTabUrl);
  console.log('Browser is running. Keep this session alive.');

  // Keep alive until browser window is closed by user
  await new Promise((resolve) => {
    context.on('close', resolve);
  });
}

launchInteractive().catch(console.error);
