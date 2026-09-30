import { _findRuleForUrl, _getStorageAsync, _isUrlSkippedBySettings } from '../common/storage';
import {
	AUTO_REFRESH_ALARM_PREFIX,
	AUTO_REFRESH_RETRY_SECONDS,
	_getAutoRefresh,
	_getAutoRefreshAlarmName,
	_getAutoRefreshBlocker,
	_getTabIdFromAutoRefreshAlarm,
} from '../common/autoRefresh';
import { AutoRefresh, Rule, TabModifierSettings } from '../common/types';

type ConfigLoader = () => Promise<TabModifierSettings | undefined>;

/**
 * Reloads tabs whose rule has auto-refresh turned on.
 *
 * Each tab gets its own chrome.alarms alarm, because service worker timers
 * stop when the worker is suspended. The alarm is reset every time the page
 * finishes loading, so the interval always counts from the last load.
 */
export class AutoRefreshService {
	constructor(private readonly loadConfig: ConfigLoader = _getStorageAsync) {}

	/**
	 * Called from tabs.onUpdated once the matching rule is known.
	 */
	async onTabUpdated(
		tab: chrome.tabs.Tab,
		rule: Rule | undefined,
		changeInfo: chrome.tabs.TabChangeInfo
	): Promise<void> {
		if (tab.id === undefined) return;

		const settings = _getAutoRefresh(rule);

		if (!settings) {
			await this.clear(tab.id);
			return;
		}

		if (changeInfo.status === 'complete') {
			await this.schedule(tab.id, settings.interval_seconds);
		}
	}

	async schedule(tabId: number, delaySeconds: number): Promise<void> {
		await chrome.alarms.create(_getAutoRefreshAlarmName(tabId), {
			delayInMinutes: delaySeconds / 60,
		});
	}

	async clear(tabId: number): Promise<void> {
		await chrome.alarms.clear(_getAutoRefreshAlarmName(tabId));
	}

	/**
	 * Brings alarms in line with the current rules: adds alarms for tabs that
	 * now need one and removes the rest. Existing alarms keep their timing
	 * unless the rule's interval got shorter than the time left.
	 */
	async syncAllTabs(): Promise<void> {
		const config = await this.loadConfig();
		const alarms = await chrome.alarms.getAll();
		const alarmsByTab = new Map<number, chrome.alarms.Alarm>();

		for (const alarm of alarms) {
			const tabId = _getTabIdFromAutoRefreshAlarm(alarm.name);
			if (tabId !== null) alarmsByTab.set(tabId, alarm);
		}

		const anyRuleRefreshes = !!config?.rules?.some((rule) => _getAutoRefresh(rule));

		// Common case: nobody uses auto-refresh, so skip looking at every tab.
		if (!anyRuleRefreshes && alarmsByTab.size === 0) return;

		const tabs = anyRuleRefreshes ? await chrome.tabs.query({}) : [];
		const wanted = new Set<number>();

		for (const tab of tabs) {
			if (tab.id === undefined || !tab.url) continue;

			const settings = this.getSettingsForUrl(config, tab.url);
			if (!settings) continue;

			wanted.add(tab.id);

			const existing = alarmsByTab.get(tab.id);
			const maxDelayMs = settings.interval_seconds * 1000;

			if (!existing || existing.scheduledTime - Date.now() > maxDelayMs) {
				await this.schedule(tab.id, settings.interval_seconds);
			}
		}

		for (const tabId of alarmsByTab.keys()) {
			if (!wanted.has(tabId)) await this.clear(tabId);
		}
	}

	isAutoRefreshAlarm(alarm: chrome.alarms.Alarm): boolean {
		return alarm.name.startsWith(AUTO_REFRESH_ALARM_PREFIX);
	}

	async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
		const tabId = _getTabIdFromAutoRefreshAlarm(alarm.name);
		if (tabId === null) return;

		let tab: chrome.tabs.Tab;
		try {
			tab = await chrome.tabs.get(tabId);
		} catch {
			// Tab is gone; the alarm was one-shot, so nothing to clean up.
			return;
		}

		if (!tab.url) return;

		// Re-check the rule: it may have changed or been turned off since scheduling.
		const settings = this.getSettingsForUrl(await this.loadConfig(), tab.url);
		if (!settings) return;

		const blocker = await this.getBlocker(tab, settings);

		if (blocker) {
			console.log(`[Tab Automator] 🔄 Auto-refresh of tab ${tabId} postponed: ${blocker}`);
			await this.schedule(tabId, AUTO_REFRESH_RETRY_SECONDS);
			return;
		}

		console.log(`[Tab Automator] 🔄 Auto-refreshing tab ${tabId}`);
		// The next alarm is scheduled from onUpdated once the reload completes.
		await chrome.tabs.reload(tabId, { bypassCache: settings.bypass_cache });
	}

	private getSettingsForUrl(
		config: TabModifierSettings | undefined,
		url: string
	): AutoRefresh | null {
		if (!config?.rules) return null;
		if (config.settings && _isUrlSkippedBySettings(config.settings, url)) return null;

		return _getAutoRefresh(_findRuleForUrl(config.rules, url));
	}

	private async getBlocker(tab: chrome.tabs.Tab, settings: AutoRefresh): Promise<string | null> {
		let windowFocused = false;
		if (settings.only_when_window_unfocused) {
			try {
				windowFocused = (await chrome.windows.get(tab.windowId)).focused;
			} catch {
				windowFocused = false;
			}
		}

		const editing = settings.skip_if_editing ? await this.hasUnsavedInput(tab.id!) : false;

		return _getAutoRefreshBlocker(settings, {
			tabActive: !!tab.active,
			windowFocused,
			audible: !!tab.audible,
			discarded: !!tab.discarded,
			loading: tab.status === 'loading',
			editing,
		});
	}

	/**
	 * Asks the page's content script whether the user typed something that a
	 * reload would throw away. Pages without the content script count as clean.
	 */
	private async hasUnsavedInput(tabId: number): Promise<boolean> {
		try {
			const response = await chrome.tabs.sendMessage(tabId, { action: 'autoRefreshCheck' });
			return response?.editing === true;
		} catch {
			return false;
		}
	}
}
