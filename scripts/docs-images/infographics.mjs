import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';

const DIR = new URL('../..', import.meta.url).pathname + 'docs/images';
const browser = await chromium.launch({
	executablePath: (process.env.TA_CHROME || '/home/msimone/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),
	headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
for (const [src, out] of [
	['shortcuts.html', '19-keyboard-shortcuts.png'],
	['how-rules-match.html', '20-how-rules-are-matched.png'],
]) {
	await page.goto(`file://${DIR}/source/${src}`);
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${DIR}/${out}` });
	execFileSync('python3', ['-c', `from PIL import Image; p='${DIR}/${out}'; im=Image.open(p).convert('RGB'); im.save(p,'PNG',optimize=True); print('${out}', im.size)`], { stdio: 'inherit' });
}
await browser.close();
