import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const DIR = new URL('../../docs/store', import.meta.url).pathname;
const browser = await chromium.launch({
	executablePath: (process.env.TA_CHROME || '/home/msimone/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.goto(`file://${DIR}/promo_tile.html`);
await page.waitForLoadState('load');
await page.screenshot({ path: `${DIR}/store_promo_tile_440x280.png` });
await browser.close();

execFileSync('python3', [
	'-c',
	`from PIL import Image; p='${DIR}/store_promo_tile_440x280.png'; im=Image.open(p).convert('RGB'); assert im.size==(440,280); im.save(p,'PNG',optimize=True); print('promo tile', im.size, im.mode)`,
], { stdio: 'inherit' });
