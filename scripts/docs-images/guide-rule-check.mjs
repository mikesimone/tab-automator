// Screenshot of the Check rules panel for the user guide (docs/guide/images/rule-check.png), and a
// live check that its Reorder button really reorders the rules. Same setup as guide-screens.mjs:
// `npm run build`, then `xvfb-run -a node scripts/docs-images/guide-rule-check.mjs`.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const EXT = process.env.TA_DIST || new URL('../../dist', import.meta.url).pathname;
const OUT = process.env.SHOT_OUT || new URL('../../docs/guide/images', import.meta.url).pathname;
const TMP = process.env.TA_TMP || '/tmp/ta-docs-images';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(TMP, 'profileC-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mkRule = (id, name, detection, fragment, enabled = true) => ({
	id,
	name,
	detection,
	url_fragment: fragment,
	is_enabled: enabled,
	tab: {
		title: `[${name}] {title}`,
		icon: null,
		muted: false,
		pinned: false,
		protected: false,
		unique: false,
		group_id: null,
		title_matcher: null,
		url_matcher: null,
	},
});

const rules = [
	mkRule('r1', 'All Acme sites', 'CONTAINS', 'example.com'),
	mkRule('r2', 'News', 'CONTAINS', 'news.example.org'),
	mkRule('r3', 'Acme Mail', 'CONTAINS', 'mail.example.com'),
	mkRule(
		'r4',
		'Work apps',
		'REGEX',
		'app\\.example\\.net|calendar\\.example\\.com|chat\\.example\\.org'
	),
	mkRule('r5', 'News again', 'CONTAINS', 'news.example.org'),
];
const config = {
	rules,
	groups: [],
	settings: {
		enable_new_version_notification: false,
		theme: 'amethyst',
		lightweight_mode_enabled: false,
		lightweight_mode_patterns: [],
	},
};

const ctx = await chromium.launchPersistentContext(userDataDir, {
	headless: false,
	args: [
		`--disable-extensions-except=${EXT}`,
		`--load-extension=${EXT}`,
		'--force-device-scale-factor=1',
		'--no-first-run',
		'--lang=en-US',
	],
	viewport: { width: 1280, height: 1400 },
});

try {
	let [sw] = ctx.serviceWorkers();
	if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
	const extId = sw.url().split('/')[2];
	await sw.evaluate(async (cfg) => {
		await chrome.storage.local.remove('tab_modifier_compressed');
		await chrome.storage.local.set({ tab_modifier: cfg });
	}, config);
	await sleep(800);

	const page = await ctx.newPage();
	await page.goto(`chrome-extension://${extId}/src/options.html`);
	await page.waitForSelector('text=Acme Mail');
	await page.locator('.drawer-side').locator('text=Rules').first().click();
	await sleep(600);

	const panel = page.locator('.collapse:has(.collapse-title:has-text("Check rules"))');
	await panel.locator('input[type=checkbox]').first().check();
	await page.waitForSelector('text=Suggested fix');
	await sleep(500);
	await page.mouse.move(2, 2);
	await panel.screenshot({ path: path.join(OUT, 'rule-check.png') });
	console.log('saved rule-check');
	console.log('PANEL TEXT:\n' + (await panel.innerText()));

	// Rule names in table order, as saved: reload so the page reads them back from storage.
	const names = rules.map((r) => r.name).sort((a, b) => b.length - a.length);
	const savedOrder = async () => {
		await page.reload();
		await page.locator('.drawer-side').locator('text=Rules').first().click();
		await page.waitForSelector('tbody tr');
		const rows = await page.locator('tbody tr').allInnerTexts();
		return rows.map((row) => names.find((n) => row.includes(n)) ?? row);
	};
	const openCheck = async () => {
		await panel.locator('input[type=checkbox]').first().check();
		await sleep(500);
	};

	await panel.locator('button:has-text("Reorder rules")').click();
	await page.waitForSelector('text=Rules reordered');
	console.log('PANEL AFTER REORDER:\n' + (await panel.innerText()));
	await panel.locator('button:has-text("Undo")').click();
	await sleep(500);
	console.log('SAVED ORDER AFTER UNDO:', JSON.stringify(await savedOrder()));

	await openCheck();
	await panel.locator('button:has-text("Reorder rules")').click();
	await page.waitForSelector('text=Rules reordered');
	await sleep(500);
	console.log('SAVED ORDER AFTER REORDER:', JSON.stringify(await savedOrder()));
} finally {
	await ctx.close();
}
