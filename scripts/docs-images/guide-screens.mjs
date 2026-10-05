// Screenshots for the user guide (docs/guide/images). Runs a real, headed Chromium with the built
// extension and made-up "Acme" sample data served from a local web server, so it needs a display
// (e.g. `xvfb-run -a node scripts/docs-images/guide-screens.mjs`) but no internet.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const EXT = process.env.TA_DIST || new URL('../../dist', import.meta.url).pathname;
const OUT = process.env.SHOT_OUT || new URL('../../docs/guide/images', import.meta.url).pathname;
const CHROME = process.env.TA_CHROME || undefined;
const TMP = process.env.TA_TMP || '/tmp/ta-docs-images';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join(TMP, 'profileG-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLES = {
	'app.example.net/overview': 'Acme Dashboard · Overview',
	'mail.example.com/inbox': 'Inbox (3) · Acme Mail',
	'news.example.org/world': 'World news · Example News',
	'recipes.example.com/soup': 'Tomato soup · Recipes',
	'deals.example.net/today': "Today's deals · Example Deals",
};
const server = http.createServer((req, res) => {
	const key = `${(req.headers.host || '').split(':')[0]}${req.url}`;
	res.setHeader('content-type', 'text/html');
	res.end(
		`<!doctype html><title>${TITLES[key] ?? key}</title><body style="font:16px sans-serif;padding:2em">${TITLES[key] ?? key}</body>`
	);
});
// Port 80, so the addresses in the shots read like normal web addresses.
await new Promise((r) => server.listen(80, '127.0.0.1', r));
const site = (hostPath) => `http://${hostPath}`;

const mkRule = (id, name, detection, fragment, tab = {}) => ({
	id,
	name,
	detection,
	url_fragment: fragment,
	is_enabled: true,
	tab: {
		title: '',
		icon: null,
		muted: false,
		pinned: false,
		protected: false,
		unique: false,
		group_id: null,
		title_matcher: null,
		url_matcher: null,
		dedicated_window: false,
		...tab,
	},
});
const config = {
	rules: [
		mkRule('r1', 'Acme Mail', 'CONTAINS', 'mail.example.com', {
			title: '📬 {title}',
			pinned: true,
			unique: true,
		}),
		mkRule('r2', 'Acme Dashboard', 'CONTAINS', 'app.example.net', {
			title: '[WORK] {title}',
			group_id: 'g1',
			auto_refresh: {
				enabled: true,
				interval_seconds: 300,
				only_when_tab_inactive: true,
				only_when_window_unfocused: false,
				skip_if_playing_audio: true,
				skip_if_editing: true,
				bypass_cache: false,
			},
		}),
		mkRule(
			'r4',
			'Shopping sites',
			'REGEX',
			Array.from({ length: 60 }, (_, i) => `shop${i}\\.example\\.com`).join('|'),
			{ title: '🛒 {title}' }
		),
		mkRule('r3', 'News sites', 'REGEX', 'news\\.example\\.org|bbc\\.com|cnn\\.com', {
			title: '📰 {title}',
			group_id: 'g2',
			muted: true,
		}),
	],
	groups: [
		{ id: 'g1', title: 'Work', color: 'purple', collapsed: false },
		{ id: 'g2', title: 'Reading', color: 'cyan', collapsed: false },
	],
	settings: {
		enable_new_version_notification: false,
		theme: 'amethyst',
		lightweight_mode_enabled: true,
		lightweight_mode_patterns: [
			{ id: 'l1', pattern: 'maps.google.com', type: 'domain', enabled: true },
		],
		lightweight_mode_apply_to_rules: true,
		lightweight_mode_apply_to_tab_hive: true,
		auto_close_enabled: true,
		auto_close_timeout: 120,
		tab_hive_reject_list: ['mail.example.com'],
		debug_mode: false,
		auto_backup_enabled: true,
		sync_enabled: false,
	},
};
const now = Date.now();
const closedTabs = [
	['Tomato soup · Recipes', 'https://recipes.example.com/soup', 12],
	['Flight prices to Denver', 'https://travel.example.com/flights/den', 45],
	['Quarterly Reports · Acme', 'https://app.example.net/reports', 130],
	['How to fold a fitted sheet', 'https://howto.example.com/fitted-sheet', 300],
].map(([title, url, minutesAgo], i) => ({
	id: `c${i}`,
	title,
	url,
	urlHash: `h${i}`,
	closedAt: now - minutesAgo * 60000,
}));

const ctx = await chromium.launchPersistentContext(userDataDir, {
	executablePath: CHROME,
	headless: false,
	args: [
		`--disable-extensions-except=${EXT}`,
		`--load-extension=${EXT}`,
		'--host-resolver-rules=MAP *.example.com 127.0.0.1, MAP *.example.net 127.0.0.1, MAP *.example.org 127.0.0.1',
		'--force-device-scale-factor=1',
		'--no-first-run',
		'--lang=en-US',
	],
	viewport: { width: 1280, height: 800 },
});

// Side panel shots stop just below the last thing on screen instead of showing empty space.
const savePanel = async (page, name) => {
	const bottom = await page.evaluate(() =>
		Math.max(
			...[...document.querySelectorAll('button, input, select, p, label, a, h1, h2, h3, li, code')]
				.filter((el) => el.offsetParent !== null)
				.map((el) => el.getBoundingClientRect().bottom)
		)
	);
	await save(page, name, { clip: { x: 0, y: 0, width: 400, height: Math.ceil(bottom) + 16 } });
};

const save = async (page, name, opts = {}) => {
	await page.mouse.move(2, 2);
	await sleep(300);
	await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
	console.log('saved', name);
};

try {
	let [sw] = ctx.serviceWorkers();
	if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
	const extId = sw.url().split('/')[2];
	await sw.evaluate(
		async ([cfg, closed]) => {
			await chrome.storage.local.remove('tab_modifier_compressed');
			await chrome.storage.local.set({ tab_modifier: cfg, closed_tabs: closed });
		},
		[config, closedTabs]
	);
	await sleep(800);

	// ---------- Side panel (what the toolbar button opens) ----------
	const target = await ctx.newPage();
	await target.goto(site('recipes.example.com/soup'));
	await target.bringToFront();
	await sleep(500);

	await sw.evaluate(async (url) => {
		await chrome.windows.create({ url, focused: false, width: 420, height: 900 });
	}, `chrome-extension://${extId}/src/sidepanel.html`);
	let panel;
	for (let i = 0; i < 40 && !panel; i++) {
		panel = ctx.pages().find((p) => p.url().includes('sidepanel.html'));
		await sleep(250);
	}
	await panel.setViewportSize({ width: 400, height: 1000 });
	await sleep(1500);
	await panel.reload();
	await sleep(1500);

	await savePanel(panel, 'panel-new-rule');

	await panel.locator('select').last().selectOption('r3');
	await panel.getByLabel('Whole domain').check();
	await sleep(300);
	await savePanel(panel, 'panel-add-to-existing');

	// The rest of the form appears once a name and address are filled in.
	await panel.reload();
	await sleep(1500);
	await panel.fill('input[placeholder="e.g. Pinned GMail"]', 'Recipes');
	await panel.fill('input[placeholder="e.g mail.google.com"]', 'recipes.example.com');
	await panel.fill('input[placeholder="e.g. Hey {title}"]', '🍲 {title}');
	await sleep(400);
	const formBottom = await panel.evaluate(
		() =>
			[...document.querySelectorAll('button')]
				.find((b) => b.textContent.trim() === 'Save')
				.getBoundingClientRect().bottom
	);
	await save(panel, 'panel-first-rule', {
		clip: { x: 0, y: 0, width: 400, height: Math.ceil(formBottom) + 16 },
	});

	// Adding to a rule that is full starts a continuation rule.
	await target.goto(site('deals.example.net/today'));
	await target.bringToFront();
	await sleep(2000);
	await panel.locator('select').last().selectOption('r4');
	await panel.getByLabel('Exact site name').check();
	await panel.getByRole('button', { name: 'Add to rule' }).click();
	await sleep(2500);
	await save(panel, 'panel-rule-continued', { clip: { x: 0, y: 0, width: 400, height: 420 } });

	await target.goto(site('mail.example.com/inbox'));
	await target.bringToFront();
	await sleep(2000);
	await savePanel(panel, 'panel-edit-rule');

	await panel.getByText('Tab Hive').first().click();
	await sleep(1000);
	await savePanel(panel, 'panel-tab-hive');
	await panel.close();

	// ---------- Options page ----------
	const page = await ctx.newPage();
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(`chrome-extension://${extId}/src/options.html`);
	await page.waitForSelector('text=Acme Dashboard');
	const nav = async (label) => {
		await page.locator('.drawer-side').locator(`text=${label}`).first().click();
		await sleep(600);
	};
	await nav('Rules');
	await save(page, 'options-rules');

	// The rule editor, whole, in a tall window so nothing scrolls.
	await page.setViewportSize({ width: 1280, height: 1500 });
	await page.locator('tr:has-text("Acme Dashboard") td').nth(2).click();
	await page.waitForSelector('dialog[open]');
	await page
		.locator('dialog[open] summary:has-text("Advanced")')
		.click()
		.catch(() => {});
	await sleep(800);
	await page.mouse.move(2, 2);
	await page
		.locator('dialog[open] .modal-box')
		.screenshot({ path: path.join(OUT, 'rule-editor.png') });
	console.log('saved rule-editor');

	// Just the Auto-refresh box, for the Auto-refresh page.
	const box = await page.evaluate(() => {
		const hard = [...document.querySelectorAll('dialog[open] span')].find((el) =>
			el.textContent.includes('Hard refresh')
		);
		let node = hard;
		while (node && !node.textContent.includes('Auto-refresh')) node = node.parentElement;
		const r = node.getBoundingClientRect();
		return { x: r.x, y: r.y, width: r.width, height: r.height };
	});
	await save(page, 'rule-editor-auto-refresh', { clip: box });
	await page.keyboard.press('Escape');
	await sleep(400);
	await page.setViewportSize({ width: 1280, height: 800 });

	await nav('Groups');
	await save(page, 'options-groups');

	await nav('Tab Hive');
	await page
		.getByText('Settings & Reject List')
		.first()
		.click()
		.catch(() => {});
	await sleep(600);
	await save(page, 'options-tab-hive-settings');

	await nav('Settings');
	await page.setViewportSize({ width: 1280, height: 1600 });
	await sleep(800);
	for (const [title, name] of [
		['General', 'settings-general'],
		['Tab Management', 'settings-tab-management'],
		['Backup', 'settings-backup'],
		['Sync Across Devices', 'settings-sync'],
	]) {
		await page
			.locator(`.card:has(h2.card-title:text-is("${title}"))`)
			.screenshot({ path: path.join(OUT, `${name}.png`) });
		console.log('saved', name);
	}
	await page.setViewportSize({ width: 1280, height: 800 });
} finally {
	await ctx.close();
	server.close();
}
