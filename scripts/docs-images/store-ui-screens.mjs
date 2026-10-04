import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const EXT = (process.env.TA_DIST || new URL('../../dist', import.meta.url).pathname);
const OUT = process.env.SHOT_OUT || (process.env.TA_TMP || '/tmp/ta-docs-images') + '/shots';
const CHROME = (process.env.TA_CHROME || '/home/msimone/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const THEME = process.env.THEME || 'dark';
const WHICH = (process.env.SHOTS || 'rules,backup,workspaces,sessions,tools,ownwindow,share').split(',');
fs.mkdirSync(OUT, { recursive: true });
const userDataDir = fs.mkdtempSync(path.join((process.env.TA_TMP || '/tmp/ta-docs-images'), 'profileS-'));

const TITLES = {
	'/demo/overview': 'Acme Dashboard · Overview',
	'/demo/orders': 'Orders · Acme Dashboard',
	'/demo/reports': 'Quarterly Reports · Acme',
	'/docs/start': 'Getting started · Acme Docs',
	'/docs/api': 'API reference · Acme Docs',
	'/research/a': 'Customer interviews · Notes',
	'/research/b': 'Competitor pricing',
	'/research/c': 'Churn analysis · Q3',
	'/research/d': 'Survey results · Draft',
	'/board/1': 'Roadmap board · Acme',
	'/board/2': 'Sprint 42 · Acme',
	'/board/3': 'Backlog · Acme',
};
const server = http.createServer((req, res) => {
	res.setHeader('content-type', 'text/html');
	res.end(`<!doctype html><title>${TITLES[req.url] ?? req.url}</title><body>${req.url}</body>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mkRule = (id, name, detection, fragment, tab = {}) => ({
	id, name, detection, url_fragment: fragment, is_enabled: true,
	tab: { title: '', icon: null, muted: false, pinned: false, protected: false, unique: false, group_id: null, title_matcher: null, url_matcher: null, dedicated_window: false, ...tab },
});
const ZW = '​';
const config = {
	rules: [
		mkRule('r1', 'Acme docs', 'CONTAINS', 'docs.acme.dev', { title: '[Docs] {title}', group_id: 'gd' }),
		mkRule('r6', 'Metrics dashboards', 'CONTAINS', 'grafana.acme.dev', { title: '[Metrics] {title}', dedicated_window: true }),
		mkRule('r2', 'Acme internal', 'CONTAINS', 'acme.dev', { title: '{title} · Acme', group_id: 'ga' }),
		mkRule('r3', 'Acme staging', 'STARTS_WITH', 'https://staging.acme.dev', { title: '[STAGING] {title}', group_id: 'ga' }),
		mkRule('r4', 'GitHub', 'CONTAINS', 'github.com', { title: '{title} | GitHub', group_id: 'gg' }),
		mkRule('r5', 'Team calendar', 'EXACT', 'https://calendar.example.com/', { title: 'Calendar', pinned: true }),
	],
	groups: [
		{ id: 'ga', title: 'Acme' + ZW, color: 'purple', collapsed: false },
		{ id: 'gd', title: 'Docs' + ZW, color: 'cyan', collapsed: false },
		{ id: 'gg', title: 'Dev' + ZW, color: 'pink', collapsed: false },
	],
	settings: {
		enable_new_version_notification: false, theme: THEME, lightweight_mode_enabled: false,
		lightweight_mode_patterns: [], lightweight_mode_apply_to_rules: true, lightweight_mode_apply_to_tab_hive: true,
		auto_close_enabled: false, auto_close_timeout: 30, tab_hive_reject_list: [], debug_mode: false,
		auto_backup_enabled: false, sync_enabled: false,
	},
};

const day = 24 * 3600 * 1000;
const t = (title, url, extra = {}) => ({ title, url, pinned: false, group: null, ...extra });
const sessions = [
	{
		id: 's1', name: 'Quarterly review', created_at: Date.now() - day, tab_count: 8,
		windows: [
			{ groups: [{ title: 'Acme', color: 'purple', collapsed: false }], tabs: [
				t('Team calendar', 'https://calendar.example.com/', { pinned: true }),
				t('Acme Dashboard · Overview', 'https://app.acme.dev/overview', { group: 0 }),
				t('Quarterly Reports · Acme', 'https://app.acme.dev/reports', { group: 0 }),
				t('Orders · Acme Dashboard', 'https://app.acme.dev/orders', { group: 0 }),
			] },
			{ groups: [{ title: 'Docs', color: 'cyan', collapsed: false }], tabs: [
				t('Getting started · Acme Docs', 'https://docs.acme.dev/start', { group: 0 }),
				t('API reference · Acme Docs', 'https://docs.acme.dev/api', { group: 0 }),
				t('Churn analysis · Q3', 'https://notes.example.com/churn'),
				t('Competitor pricing', 'https://notes.example.com/pricing'),
			] },
		],
	},
	{
		id: 's2', name: 'Sprint planning', created_at: Date.now() - 3 * day, tab_count: 5,
		windows: [{ groups: [{ title: 'Dev', color: 'pink', collapsed: false }], tabs: [
			t('Roadmap board · Acme', 'https://board.acme.dev/1', { group: 0 }),
			t('Sprint 42 · Acme', 'https://board.acme.dev/2', { group: 0 }),
			t('Backlog · Acme', 'https://board.acme.dev/3', { group: 0 }),
			t('acme/web: Issues', 'https://github.com/acme/web/issues'),
			t('acme/web: Pull requests', 'https://github.com/acme/web/pulls'),
		] }],
	},
	{
		id: 's3', name: 'Product demo', created_at: Date.now() - 6 * day, tab_count: 3,
		windows: [{ groups: [{ title: 'Product demo', color: 'purple', collapsed: false }], tabs: [
			t('Acme Dashboard · Overview', 'https://app.acme.dev/overview', { group: 0 }),
			t('Orders · Acme Dashboard', 'https://app.acme.dev/orders', { group: 0 }),
			t('Quarterly Reports · Acme', 'https://app.acme.dev/reports', { group: 0 }),
		] }],
	},
];

const ctx = await chromium.launchPersistentContext(userDataDir, {
	executablePath: CHROME,
	headless: true,
	args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--headless=new', '--force-device-scale-factor=1'],
	viewport: { width: 1280, height: 800 },
	deviceScaleFactor: 1,
});

const save = async (page, name) => {
	await page.screenshot({ path: path.join(OUT, `${name}.png`) });
	console.log('saved', name);
};

try {
	let [sw] = ctx.serviceWorkers();
	if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
	const extId = sw.url().split('/')[2];
	await sw.evaluate(async ([cfg, sess]) => {
		await chrome.storage.local.remove('tab_modifier_compressed');
		await chrome.storage.local.set({ tab_modifier: cfg, tab_automator_sessions: sess });
	}, [config, sessions]);

	// Real tab groups in the browser, plus a second window, for the Workspaces page.
	await sw.evaluate(async (base) => {
		const win = (await chrome.windows.getAll({ windowTypes: ['normal'] }))[0];
		const mk = async (p, windowId = win.id) => (await chrome.tabs.create({ windowId, url: base + p, active: false })).id;
		const grp = async (paths, title, color) => {
			const ids = [];
			for (const p of paths) ids.push(await mk(p));
			const g = await chrome.tabs.group({ tabIds: ids });
			await chrome.tabGroups.update(g, { title, color });
		};
		await grp(['/demo/overview', '/demo/orders', '/demo/reports'], 'Product demo', 'purple');
		await grp(['/docs/start', '/docs/api'], 'Docs', 'cyan');
		await grp(['/research/a', '/research/b', '/research/c', '/research/d'], 'Research', 'pink');
		const second = await chrome.windows.create({ url: base + '/board/1', focused: false });
		await chrome.tabs.create({ windowId: second.id, url: base + '/board/2', active: false });
		await chrome.tabs.create({ windowId: second.id, url: base + '/board/3', active: false });
	}, base);
	await sleep(1500);

	const page = await ctx.newPage();
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto(`chrome-extension://${extId}/src/options.html`);
	await page.waitForSelector('text=Acme docs');
	const nav = async (label) => {
		await page.locator('.drawer-side').locator(`text=${label}`).first().click();
		await sleep(500);
	};

	if (WHICH.includes('rules')) {
		await nav('Rules');
		await page.waitForSelector('text=Acme internal');
		await page.mouse.move(5, 5);
		await save(page, 'rules');
	}

	if (WHICH.includes('backup')) {
		await nav('Settings');
		await page.waitForSelector('text=Auto-Backup on Every Change');
		await page.locator('h2:has-text("Backup")').first().evaluate((el) => {
			el.scrollIntoView({ block: 'start' });
			let node = el.parentElement;
			while (node) {
				if (node.scrollTop > 0) { node.scrollTop -= 90; break; }
				node = node.parentElement;
			}
		});
		await sleep(500);
		await page.mouse.move(5, 5);
		await save(page, 'backup');
	}

	if (WHICH.includes('workspaces')) {
		await nav('Workspaces');
		await page.waitForSelector('td:has-text("Product demo")');
		await page.mouse.move(5, 5);
		await save(page, 'workspaces');
	}

	if (WHICH.includes('sessions')) {
		await nav('Sessions');
		await page.waitForSelector('text=Quarterly review');
		await page.locator('details').first().evaluate((el) => (el.open = true));
		await page.mouse.move(5, 5);
		await save(page, 'sessions');
	}

	if (WHICH.includes('tools')) {
		await nav('Rules');
		await page.waitForSelector('text=Acme internal');
		await page.locator('input[aria-label="Show URL tester"]').check();
		await page.fill('input[placeholder="https://example.com/some/page"]', 'https://staging.acme.dev/orders/1042');
		await page.waitForSelector('text=Matches, but never reached');
		await sleep(1200);
		await page.mouse.move(5, 5);
		await save(page, 'rule-tools');
	}

	if (WHICH.includes('ownwindow')) {
		await nav('Rules');
		await page.locator('input[aria-label="Show URL tester"]').uncheck().catch(() => {});
		await sleep(800);
		await page.waitForSelector('text=Metrics dashboards');
		await page.locator('tr:has-text("Metrics dashboards") td').nth(2).click();
		await page.waitForSelector('text=Own window');
		await page.locator('dialog[open] label.swap').first().click();
		await sleep(700);
		await page.locator('text=Own window').first().scrollIntoViewIfNeeded();
		await sleep(400);
		await save(page, 'own-window');
		await page.keyboard.press('Escape');
		await sleep(300);
	}

	if (WHICH.includes('share')) {
		await nav('Rules');
		await page.locator('input[aria-label="Show URL tester"]').uncheck().catch(() => {});
		await sleep(800);
		await page.waitForSelector('text=Acme docs');
		await page.locator('button:has-text("Export rules")').click();
		await page.fill('input[placeholder^="Name for this pack"]', 'Acme environments');
		await page.locator('li:has-text("Team calendar") input').uncheck();
		await page.locator('li:has-text("GitHub") input').uncheck();
		await sleep(400);
		await save(page, 'share-rules');
	}
} finally {
	await ctx.close();
	server.close();
}
