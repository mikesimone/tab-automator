import fs from 'node:fs';
import path from 'node:path';
import { launch as rawLaunch, sleep, TMP } from './lib.mjs';

import crypto from 'node:crypto';
import { EXT } from './lib.mjs';

// An unpacked extension's id is the first 16 bytes of sha256(path), written with the letters a-p.
export const EXT_ID = [...crypto.createHash('sha256').update(fs.realpathSync(EXT)).digest('hex').slice(0, 32)]
	.map((c) => String.fromCharCode(97 + parseInt(c, 16)))
	.join('');

export const SITES = {
	github: 'https://github.com/mikesimone/tab-automator',
	issues: 'https://github.com/mikesimone/tab-automator/issues',
	pulls: 'https://github.com/mikesimone/tab-automator/pulls',
	google: 'https://www.google.com/',
	claude: 'https://claude.com/',
	hn: 'https://news.ycombinator.com/',
	wiki: 'https://en.wikipedia.org/wiki/Web_browser',
	bbc: 'https://www.bbc.com/news',
	youtube: 'https://www.youtube.com/',
	docs: 'https://developer.chrome.com/docs/extensions/reference/api/tabGroups',
	store: 'https://chromewebstore.google.com/detail/tab-automator/mookagdegldeclccpbjgpbdacipiehff',
};

const ZW = '​';

const rule = (id, name, fragment, tab = {}) => ({
	id,
	name,
	detection: 'CONTAINS',
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

export const GROUPS = [
	{ id: 'g-dev', title: 'Dev' + ZW, color: 'pink', collapsed: false },
	{ id: 'g-ai', title: 'AI' + ZW, color: 'purple', collapsed: false },
	{ id: 'g-docs', title: 'Docs' + ZW, color: 'cyan', collapsed: false },
	{ id: 'g-read', title: 'Reading' + ZW, color: 'green', collapsed: false },
];

export const RULES = [
	rule('r-google', 'Google', 'www.google.com', { title: 'Google', icon: '🔎', pinned: true }),
	rule('r-claude', 'Claude', 'claude.', { title: 'Claude', group_id: 'g-ai' }),
	rule('r-github', 'GitHub', 'github.com', { title: '{title}', icon: '🐙', group_id: 'g-dev' }),
	rule('r-docs', 'Chrome docs', 'developer.chrome.com', { title: '[Docs] {title}', icon: '📚', group_id: 'g-docs' }),
	rule('r-wiki', 'Wikipedia', 'wikipedia.org', { title: '{title}', icon: '📖', group_id: 'g-read' }),
	rule('r-bbc', 'BBC News', 'bbc.com', { title: 'BBC News', icon: '📰', group_id: 'g-read' }),
	rule('r-yt', 'YouTube', 'youtube.com', { title: '{title} (muted)', icon: '🎬', muted: true }),
];

export function config(overrides = {}) {
	return {
		rules: overrides.rules ?? RULES,
		groups: GROUPS,
		settings: {
			enable_new_version_notification: false,
			theme: 'amethyst',
			lightweight_mode_enabled: false,
			lightweight_mode_patterns: [],
			lightweight_mode_apply_to_rules: true,
			lightweight_mode_apply_to_tab_hive: true,
			auto_close_enabled: false,
			auto_close_timeout: 30,
			tab_hive_reject_list: [],
			debug_mode: false,
			auto_backup_enabled: false,
			sync_enabled: false,
		},
	};
}

/** Launches the real browser with the extension's toolbar icon pinned, and closes the blank starter tab. */
export async function launch(opts = {}) {
	const dir = fs.mkdtempSync(path.join(TMP, 'profileP-'));
	fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
	fs.writeFileSync(
		path.join(dir, 'Default', 'Preferences'),
		JSON.stringify({ extensions: { pinned_extensions: [EXT_ID] }, browser: { has_seen_welcome_page: true } })
	);
	return rawLaunch({ ...opts, userDataDir: dir });
}

export async function seed(sw, cfg) {
	await sw.evaluate(async (c) => {
		await chrome.storage.local.remove('tab_modifier_compressed');
		await chrome.storage.local.set({ tab_modifier: c });
	}, cfg);
	await sleep(400);
}

export async function clearRules(sw) {
	await sw.evaluate(async () => {
		await chrome.storage.local.remove(['tab_modifier', 'tab_modifier_compressed']);
	});
	await sleep(300);
}

/** Opens every URL in its own tab (loading in parallel) and waits for the pages to settle. */
export async function openAll(ctx, urls, settle = 9000) {
	const pages = [];
	for (const u of urls) {
		const p = await ctx.newPage();
		p.goto(u, { waitUntil: 'domcontentloaded', timeout: 40000 }).catch((e) => console.log('goto', u, String(e).slice(0, 70)));
		pages.push(p);
		await sleep(250);
	}
	await sleep(settle);
	return pages;
}

export async function closeBlankTabs(sw) {
	await sw.evaluate(async () => {
		const tabs = await chrome.tabs.query({});
		const blanks = tabs.filter((t) => t.url === 'about:blank' || t.url === 'chrome://newtab/').map((t) => t.id);
		if (blanks.length) await chrome.tabs.remove(blanks);
	});
	await sleep(500);
}

export async function reloadAll(sw) {
	await sw.evaluate(async () => {
		const tabs = await chrome.tabs.query({});
		for (const t of tabs) if (t.url?.startsWith('http')) chrome.tabs.reload(t.id);
	});
}

export async function activate(sw, urlPart) {
	await sw.evaluate(async (part) => {
		const tab = (await chrome.tabs.query({})).find((t) => t.url?.includes(part));
		if (tab) {
			await chrome.tabs.update(tab.id, { active: true });
			await chrome.windows.update(tab.windowId, { focused: true });
		}
	}, urlPart);
	await sleep(800);
}

export async function dumpTabs(sw) {
	const rows = await sw.evaluate(async () => {
		const groups = new Map((await chrome.tabGroups.query({})).map((g) => [g.id, g]));
		return (await chrome.tabs.query({})).map((t) => ({
			win: t.windowId,
			idx: t.index,
			pinned: t.pinned,
			muted: t.mutedInfo?.muted,
			group: t.groupId === -1 ? '-' : groups.get(t.groupId)?.title?.replace('​', '') + '/' + groups.get(t.groupId)?.color,
			title: (t.title || '').slice(0, 42),
		}));
	});
	console.log(rows.map((r) => `${r.win}:${r.idx} ${r.pinned ? 'PIN' : '   '} ${r.muted ? 'MUTED' : '     '} ${String(r.group).padEnd(14)} ${r.title}`).join('\n'));
	return rows;
}

/** Some pages set their icon late; reload any tab whose rule icon didn't stick and give it another go. */
export async function ensureIcons(sw, rounds = 2) {
	for (let i = 0; i < rounds; i++) {
		const stale = await sw.evaluate(async (rules) => {
			const tabs = await chrome.tabs.query({});
			const out = [];
			for (const t of tabs) {
				const r = rules.find((x) => x.icon && t.url?.includes(x.url_fragment));
				if (r && !(t.favIconUrl || '').startsWith('data:image/svg') && !t.pinned) out.push(t.id);
				else if (r && t.pinned && !(t.favIconUrl || '').startsWith('data:image/svg')) out.push(t.id);
			}
			for (const id of out) chrome.tabs.reload(id);
			return out.length;
		}, RULES.map((r) => ({ icon: r.tab.icon, url_fragment: r.url_fragment })));
		if (!stale) return;
		console.log('retrying icons on', stale, 'tabs');
		await sleep(10000);
	}
}

export async function windows(sw) {
	return sw.evaluate(async () => (await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] })).map((w) => ({ id: w.id, left: w.left, top: w.top, tabs: w.tabs.map((t) => (t.url || '').slice(0, 40)) })));
}

export async function place(sw, id, left, top = 0, width = 1280, height = 800) {
	await sw.evaluate(async ([i, l, t, w, h]) => chrome.windows.update(i, { left: l, top: t, width: w, height: h, state: 'normal', focused: true }), [id, left, top, width, height]);
	await sleep(900);
}

/** Makes the tab whose URL contains `part` the active one in its window, without moving focus away. */
export async function show(sw, part) {
	await sw.evaluate(async (p) => {
		const tab = (await chrome.tabs.query({})).find((t) => t.url?.includes(p));
		if (tab) await chrome.tabs.update(tab.id, { active: true });
	}, part);
	await sleep(700);
}

export async function groupTabs(sw, urlParts, title, color) {
	return sw.evaluate(async ([parts, t, c]) => {
		const all = await chrome.tabs.query({});
		const ids = parts.map((p) => all.find((x) => x.url?.includes(p))?.id).filter(Boolean);
		const gid = await chrome.tabs.group({ tabIds: ids });
		await chrome.tabGroups.update(gid, { title: t, color: c });
		return gid;
	}, [urlParts, title, color]);
}

/** claude.ai sometimes shows a "Just a moment..." security check; reload it until the real page is up. */
export async function settleClaude(sw, rounds = 4) {
	for (let i = 0; i < rounds; i++) {
		const title = await sw.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('claude.'))?.title ?? '');
		if (!/moment|checking|verify/i.test(title)) return;
		console.log('claude check page, reloading');
		await sw.evaluate(async () => {
			const t = (await chrome.tabs.query({})).find((x) => x.url?.includes('claude.'));
			if (t) chrome.tabs.reload(t.id);
		});
		await sleep(9000);
	}
}
