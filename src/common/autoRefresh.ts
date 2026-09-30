import { AutoRefresh, Rule } from './types.ts';

// Chrome won't fire extension alarms more often than every 30 seconds.
export const AUTO_REFRESH_MIN_INTERVAL_SECONDS = 30;
export const AUTO_REFRESH_MAX_INTERVAL_SECONDS = 24 * 60 * 60;
// When a refresh is due but a condition blocks it, check again after this long.
export const AUTO_REFRESH_RETRY_SECONDS = 30;
export const AUTO_REFRESH_ALARM_PREFIX = 'tab-automator-auto-refresh:';

export function _getDefaultAutoRefresh(): AutoRefresh {
	return {
		enabled: false,
		interval_seconds: 5 * 60,
		only_when_tab_inactive: false,
		only_when_window_unfocused: false,
		skip_if_playing_audio: true,
		skip_if_editing: true,
		bypass_cache: false,
	};
}

export function _clampAutoRefreshInterval(seconds: unknown): number {
	const value = Number(seconds);

	if (!Number.isFinite(value)) {
		return _getDefaultAutoRefresh().interval_seconds;
	}

	return Math.min(
		AUTO_REFRESH_MAX_INTERVAL_SECONDS,
		Math.max(AUTO_REFRESH_MIN_INTERVAL_SECONDS, Math.round(value))
	);
}

/**
 * Returns the rule's auto-refresh settings with every field filled in,
 * or null when auto-refresh is off. Rules without the field (older exports)
 * count as off.
 */
export function _getAutoRefresh(rule: Rule | undefined | null): AutoRefresh | null {
	const raw = rule?.tab?.auto_refresh;

	if (!raw || typeof raw !== 'object' || raw.enabled !== true) {
		return null;
	}

	const defaults = _getDefaultAutoRefresh();

	return {
		enabled: true,
		interval_seconds: _clampAutoRefreshInterval(raw.interval_seconds),
		only_when_tab_inactive: raw.only_when_tab_inactive ?? defaults.only_when_tab_inactive,
		only_when_window_unfocused:
			raw.only_when_window_unfocused ?? defaults.only_when_window_unfocused,
		skip_if_playing_audio: raw.skip_if_playing_audio ?? defaults.skip_if_playing_audio,
		skip_if_editing: raw.skip_if_editing ?? defaults.skip_if_editing,
		bypass_cache: raw.bypass_cache ?? defaults.bypass_cache,
	};
}

export type AutoRefreshTabState = {
	tabActive: boolean;
	windowFocused: boolean;
	audible: boolean;
	discarded: boolean;
	loading: boolean;
	editing: boolean;
};

/**
 * Returns why a due refresh should wait, or null if the tab can refresh now.
 */
export function _getAutoRefreshBlocker(
	settings: AutoRefresh,
	state: AutoRefreshTabState
): string | null {
	if (state.discarded) return 'tab is discarded';
	if (state.loading) return 'tab is still loading';
	if (settings.only_when_tab_inactive && state.tabActive) return 'tab is active';
	if (settings.only_when_window_unfocused && state.windowFocused) return 'window is focused';
	if (settings.skip_if_playing_audio && state.audible) return 'tab is playing audio';
	if (settings.skip_if_editing && state.editing) return 'page has unsaved input';

	return null;
}

export function _getAutoRefreshAlarmName(tabId: number): string {
	return `${AUTO_REFRESH_ALARM_PREFIX}${tabId}`;
}

export function _getTabIdFromAutoRefreshAlarm(alarmName: string): number | null {
	if (!alarmName.startsWith(AUTO_REFRESH_ALARM_PREFIX)) {
		return null;
	}

	const tabId = Number(alarmName.slice(AUTO_REFRESH_ALARM_PREFIX.length));

	return Number.isInteger(tabId) ? tabId : null;
}

/**
 * Splits a number of seconds into the largest unit that divides it evenly,
 * for showing in the rule form.
 */
export function _splitAutoRefreshInterval(seconds: number): {
	value: number;
	unit: 'seconds' | 'minutes' | 'hours';
} {
	if (seconds % 3600 === 0) return { value: seconds / 3600, unit: 'hours' };
	if (seconds % 60 === 0) return { value: seconds / 60, unit: 'minutes' };

	return { value: seconds, unit: 'seconds' };
}
