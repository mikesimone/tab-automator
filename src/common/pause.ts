/**
 * "Pause all rules" is a per-device switch, kept outside the synced and exported config so that
 * pausing on one computer never pauses another, and never ends up in a backup.
 */
export const PAUSE_STORAGE_KEY = 'tab_automator_paused';

export async function _isPaused(): Promise<boolean> {
	try {
		const result = await chrome.storage.local.get(PAUSE_STORAGE_KEY);
		return result?.[PAUSE_STORAGE_KEY] === true;
	} catch {
		return false;
	}
}

export async function _setPaused(paused: boolean): Promise<void> {
	await chrome.storage.local.set({ [PAUSE_STORAGE_KEY]: paused });
}

export async function _applyPausedBadge(paused: boolean): Promise<void> {
	try {
		await chrome.action.setBadgeText({ text: paused ? '⏸' : '' });

		if (paused) {
			await chrome.action.setBadgeBackgroundColor({ color: '#a78bba' });
		}
	} catch {
		// The badge is cosmetic.
	}
}
