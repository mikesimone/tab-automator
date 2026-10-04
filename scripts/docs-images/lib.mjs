import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const EXT = (process.env.TA_DIST || new URL('../../dist', import.meta.url).pathname);
export const TMP = (process.env.TA_TMP || '/tmp/ta-docs-images');
export const RAW = path.join(TMP, 'raw');
export const DISPLAY = ':99';
const CHROME = (process.env.TA_CHROME || '/home/msimone/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');

fs.mkdirSync(RAW, { recursive: true });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A real, headed Chromium window on the private virtual display, with the extension loaded. */
export async function launch({ width = 1280, height = 800, x = 0, y = 0, scale = 1, userDataDir: given } = {}) {
	const userDataDir = given ?? fs.mkdtempSync(path.join(TMP, 'profileX-'));
	const ctx = await chromium.launchPersistentContext(userDataDir, {
		executablePath: CHROME,
		headless: false,
		viewport: null,
		env: { ...process.env, DISPLAY },
		args: [
			`--disable-extensions-except=${EXT}`,
			`--load-extension=${EXT}`,
			`--window-position=${x},${y}`,
			`--window-size=${width},${height}`,
			`--force-device-scale-factor=${scale}`,
			'--force-dark-mode',
			'--enable-features=WebUIDarkMode',
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-infobars',
			'--hide-crash-restore-bubble',
			'--disable-search-engine-choice-screen',
			'--lang=en-US',
		],
	});
	let [sw] = ctx.serviceWorkers();
	if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20000 });
	const extId = sw.url().split('/')[2];
	return { ctx, sw, extId };
}

/** Grabs a rectangle of the virtual screen as a 24-bit PNG. */
export function shot(name, { x = 0, y = 0, w = 1280, h = 800 } = {}) {
	const out = path.join(RAW, `${name}.png`);
	execFileSync('import', ['-display', DISPLAY, '-window', 'root', '-crop', `${w}x${h}+${x}+${y}`, '+repage', out]);
	execFileSync('python3', ['-c', `from PIL import Image; p='${out}'; Image.open(p).convert('RGB').save(p,'PNG',optimize=True)`]);
	console.log('shot', name);
	return out;
}
