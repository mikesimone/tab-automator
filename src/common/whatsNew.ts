export type ReleaseNote = {
	version: string;
	features: { emoji: string; title: string; description: string }[];
};

// Newest first. Add an entry here for every release that users should hear about.
export const RELEASES: ReleaseNote[] = [
	{
		version: '1.3.0',
		features: [
			{
				emoji: '🔄',
				title: 'Auto-refresh',
				description:
					'Turn on Auto-refresh in any rule to reload matching tabs on a timer, from every 30 seconds up to every 24 hours. You can limit it to tabs you are not looking at, or to windows that are not focused. By default it waits while a tab is playing audio or while you have typed something into the page, so nothing you are doing gets lost. A 🔄 next to a rule in the list shows it auto-refreshes.',
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
