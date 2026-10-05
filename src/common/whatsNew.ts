export type ReleaseNote = {
	version: string;
	features: { emoji: string; title: string; description: string }[];
};

// Newest first. Add an entry here for every release that users should hear about.
export const RELEASES: ReleaseNote[] = [
	{
		version: '1.6.0',
		features: [
			{
				emoji: '➕',
				title: 'Add a site to an existing rule from the toolbar',
				description:
					"On a page that no rule covers yet, click the Tab Automator icon. Below the new-rule form there is now Or add to an existing rule: pick the rule, then choose Just the domain, Domain and path, or Whole URL. The page is added to the end of the rule's pattern (as |example\\.com) and the tab reloads with the rule applied. Rules that don't use Regex yet are switched to Regex and keep matching the same pages.",
			},
			{
				emoji: '📏',
				title: 'Long site-list rules work everywhere',
				description:
					'Regex rules longer than 200 characters were ignored when setting tab titles and icons, and anything over 1,000 characters was ignored completely. Both limits are now 4,000 characters.',
			},
		],
	},
	{
		version: '1.5.0',
		features: [
			{
				emoji: '🪟',
				title: 'Workspaces: move a group of tabs to its own window',
				description:
					"Presenting or doing a demo? Put the tabs you want to show in a tab group, then open Workspaces and choose New window. Your audience sees only those tabs, and all your other tabs stay in your original window, out of sight. You can also move a group to any window you already have open. No clicking around: press Alt+Shift+M on any tab to move its whole group (or just that tab, if it isn't in a group) to a new window.",
			},
			{
				emoji: '💾',
				title: 'Sessions',
				description:
					'Save a window, all your windows, or a single workspace under a name, then bring it back later in a new window or the one you are in. Pinned tabs, groups and their colours come back too. Find it under Sessions.',
			},
			{
				emoji: '🏠',
				title: 'Own window for a rule',
				description:
					'Switch on Own window in a rule and every tab it matches is gathered into one window of its own, so your dashboards, docs or a client project always live together.',
			},
			{
				emoji: '💜',
				title: 'Amethyst theme',
				description:
					'A new default look: pastel purple and pink on a deep amethyst background, with a dusty rose instead of red for warnings. There is a light version too. If you are already using another theme it stays as it is; switch in Settings → Theme.',
			},
			{
				emoji: '↗️',
				title: 'Move to new window from the right-click menu',
				description: 'Right-click any page and choose Move tab or group to new window.',
			},
		],
	},
	{
		version: '1.4.0',
		features: [
			{
				emoji: '🧪',
				title: 'Test a URL',
				description:
					'On the Rules page, open Test a URL and paste an address to see which rule would apply and what it would do. Rules that can never apply, because an earlier rule already catches the same URLs, now show a warning.',
			},
			{
				emoji: '⏸',
				title: 'Pause all rules',
				description:
					'Turn off every rule at once with the Pause all rules switch on the Rules page, or press Alt+Shift+P. The toolbar icon shows ⏸ while paused. It only affects this computer.',
			},
			{
				emoji: '📦',
				title: 'Share rules',
				description:
					'Export rules turns the ones you pick into a file you can send to someone, and Import rules adds a shared file to your list after showing what is inside. Imported rules go after your own, so they never take priority over them.',
			},
			{
				emoji: '🗂️',
				title: 'Dated backup files',
				description:
					'Backups and exports are now named tab_automator_config_{datetime}.json. Auto-backup keeps one file per day, overwrites it as you make changes, and deletes files older than 7 days.',
			},
		],
	},
	{
		version: '1.3.0',
		features: [
			{
				emoji: '🔄',
				title: 'Auto-refresh',
				description:
					"Reload tabs on a timer: every 30 seconds, 1 minute, 5 minutes, 1 hour, 1 day, or a custom interval. Set it in a rule's Auto-refresh section to cover every matching tab, or right-click any page and choose Auto-refresh this tab. It never reloads the tab you're looking at unless you ask it to, and it waits while a tab plays audio, while you've typed something into the page, or while you're offline. Tabs that auto-refresh show ↻ on the toolbar icon.",
			},
			{
				emoji: '⏸',
				title: 'Pause auto-refresh on one tab',
				description:
					'Right-click a page, then Auto-refresh this tab, then Pause on this tab. It stays paused until you resume it or close the tab, even if a rule covers it.',
			},
			{
				emoji: '✨',
				title: "What's new",
				description: 'This page. It lists what changed in each version.',
			},
		],
	},
	{
		version: '1.2.0',
		features: [
			{
				emoji: '💾',
				title: 'Auto-backup',
				description:
					'Settings → Auto-Backup on Every Change saves a copy of your whole configuration to your Downloads folder whenever you change something.',
			},
			{
				emoji: '☁️',
				title: 'Sync across devices',
				description:
					'Settings → Sync Across Devices keeps your rules and groups the same on every computer signed in to your browser account.',
			},
		],
	},
];

const SEEN_VERSION_KEY = 'whats_new_seen_version';

export async function _hasUnseenWhatsNew(): Promise<boolean> {
	try {
		const result = await chrome.storage.local.get(SEEN_VERSION_KEY);
		return result[SEEN_VERSION_KEY] !== RELEASES[0].version;
	} catch {
		return false;
	}
}

export async function _markWhatsNewSeen(): Promise<void> {
	try {
		await chrome.storage.local.set({ [SEEN_VERSION_KEY]: RELEASES[0].version });
	} catch {
		// Not being able to remember this only means the "new!" badge shows again.
	}
}

export const WHATS_NEW_HASH = '#whats-new';

/**
 * After an update, open the Options page on What's new, once per release
 * that has notes. Silent updates with no new notes don't open anything.
 */
export async function _openWhatsNewAfterUpdate(previousVersion: string | undefined): Promise<void> {
	const latest = RELEASES[0].version;

	if (previousVersion === latest || !(await _hasUnseenWhatsNew())) {
		return;
	}

	await chrome.tabs.create({
		url: chrome.runtime.getURL(`src/options.html${WHATS_NEW_HASH}`),
	});
}
