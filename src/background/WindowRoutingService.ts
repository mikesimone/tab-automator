import type { Rule } from '../common/types';

const RULE_WINDOWS_KEY = 'tab_automator_rule_windows';

type RuleWindows = Record<string, number>;

/**
 * Keeps the tabs of a rule with "Own window" switched on together in one window.
 *
 * The first matching tab either adopts the window it is alone in, or is moved into a new window.
 * Later matches are moved into that window. The rule-to-window mapping lives in session storage, so
 * a browser restart simply starts fresh.
 */
export class WindowRoutingService {
	private queue: Promise<unknown> = Promise.resolve();

	/**
	 * Moves the tab into its rule's window if needed and returns the tab as it is afterwards.
	 * Calls are run one at a time so two tabs loading together can't each create a new window.
	 */
	routeTab(rule: Rule | undefined, tab: chrome.tabs.Tab): Promise<chrome.tabs.Tab> {
		const run = this.queue.then(() => this.route(rule, tab));

		this.queue = run.catch(() => undefined);

		return run;
	}

	private async route(rule: Rule | undefined, tab: chrome.tabs.Tab): Promise<chrome.tabs.Tab> {
		if (!rule?.tab?.dedicated_window || tab.id === undefined || tab.windowId === undefined) {
			return tab;
		}

		// Pinned tabs stay put, and so do tabs in popups or app windows.
		if (tab.pinned) return tab;

		try {
			const current = await chrome.windows.get(tab.windowId);
			if (current.type !== 'normal') return tab;

			const mapping = await this.getMapping();
			let targetId: number | undefined = mapping[rule.id];

			if (targetId !== undefined && !(await this.isUsableWindow(targetId))) {
				targetId = undefined;
			}

			if (targetId === tab.windowId) return tab;

			if (targetId === undefined) {
				const siblings = await chrome.tabs.query({ windowId: tab.windowId });

				if (siblings.length === 1) {
					mapping[rule.id] = tab.windowId;
					await this.setMapping(mapping);
					return tab;
				}

				const created = await chrome.windows.create({ tabId: tab.id, focused: false });
				mapping[rule.id] = created.id as number;
				await this.setMapping(mapping);
			} else {
				await chrome.tabs.move(tab.id, { windowId: targetId, index: -1 });
			}

			return await chrome.tabs.get(tab.id);
		} catch (error) {
			console.log('[Tab Automator] Could not move tab to its own window:', error);
			return tab;
		}
	}

	private async isUsableWindow(windowId: number): Promise<boolean> {
		try {
			return (await chrome.windows.get(windowId)).type === 'normal';
		} catch {
			return false;
		}
	}

	private async getMapping(): Promise<RuleWindows> {
		try {
			const result = await chrome.storage.session.get(RULE_WINDOWS_KEY);
			return { ...(result?.[RULE_WINDOWS_KEY] ?? {}) };
		} catch {
			return {};
		}
	}

	private async setMapping(mapping: RuleWindows): Promise<void> {
		try {
			await chrome.storage.session.set({ [RULE_WINDOWS_KEY]: mapping });
		} catch {
			// Without the mapping the next match just creates another window.
		}
	}
}
