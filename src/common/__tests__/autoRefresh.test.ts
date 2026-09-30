import { describe, expect, it } from 'vitest';
import {
	_clampAutoRefreshInterval,
	_getAutoRefresh,
	_getAutoRefreshAlarmName,
	_getAutoRefreshBlocker,
	_getDefaultAutoRefresh,
	_getTabIdFromAutoRefreshAlarm,
	_splitAutoRefreshInterval,
} from '../autoRefresh';
import { _getDefaultRule } from '../storage';
import { Rule } from '../types';

const idleState = {
	tabActive: false,
	windowFocused: false,
	audible: false,
	discarded: false,
	loading: false,
	editing: false,
};

describe('_getAutoRefresh', () => {
	it('treats a rule exported before auto-refresh existed as off', () => {
		// Shape of a rule from an older JSON export: no auto_refresh key at all.
		const legacy = JSON.parse(
			JSON.stringify({
				id: 'abc',
				name: 'Old rule',
				detection: 'CONTAINS',
				url_fragment: 'example.com',
				is_enabled: true,
				tab: {
					title: 'x',
					icon: null,
					pinned: false,
					protected: false,
					unique: false,
					muted: false,
					title_matcher: null,
					url_matcher: null,
				},
			})
		) as Rule;

		expect(_getAutoRefresh(legacy)).toBeNull();
	});

	it('treats null, disabled or malformed settings as off', () => {
		const rule = _getDefaultRule('r', 't', 'example.com');
		expect(_getAutoRefresh(rule)).toBeNull();

		rule.tab.auto_refresh = null;
		expect(_getAutoRefresh(rule)).toBeNull();

		rule.tab.auto_refresh = { ..._getDefaultAutoRefresh(), enabled: false };
		expect(_getAutoRefresh(rule)).toBeNull();

		(rule.tab as any).auto_refresh = 'yes';
		expect(_getAutoRefresh(rule)).toBeNull();

		expect(_getAutoRefresh(undefined)).toBeNull();
	});

	it('fills in missing fields and clamps the interval', () => {
		const rule = _getDefaultRule('r', 't', 'example.com');
		(rule.tab as any).auto_refresh = { enabled: true, interval_seconds: 5 };

		expect(_getAutoRefresh(rule)).toEqual({
			..._getDefaultAutoRefresh(),
			enabled: true,
			interval_seconds: 30,
		});
	});
});

describe('_clampAutoRefreshInterval', () => {
	it('keeps the interval between 30 seconds and 24 hours', () => {
		expect(_clampAutoRefreshInterval(1)).toBe(30);
		expect(_clampAutoRefreshInterval(90)).toBe(90);
		expect(_clampAutoRefreshInterval(10 ** 9)).toBe(86400);
		expect(_clampAutoRefreshInterval('abc')).toBe(300);
		expect(_clampAutoRefreshInterval(undefined)).toBe(300);
	});
});

describe('_getAutoRefreshBlocker', () => {
	const settings = { ..._getDefaultAutoRefresh(), enabled: true };

	it('allows a refresh when nothing blocks it', () => {
		expect(_getAutoRefreshBlocker(settings, idleState)).toBeNull();
	});

	it('refreshes an active tab unless limited to inactive tabs', () => {
		const state = { ...idleState, tabActive: true };
		expect(_getAutoRefreshBlocker(settings, state)).toBeNull();
		expect(
			_getAutoRefreshBlocker({ ...settings, only_when_tab_inactive: true }, state)
		).not.toBeNull();
	});

	it('waits for the window to lose focus when asked to', () => {
		const state = { ...idleState, windowFocused: true };
		expect(_getAutoRefreshBlocker(settings, state)).toBeNull();
		expect(
			_getAutoRefreshBlocker({ ...settings, only_when_window_unfocused: true }, state)
		).not.toBeNull();
	});

	it('waits for audio and typed input by default, and can be told not to', () => {
		expect(_getAutoRefreshBlocker(settings, { ...idleState, audible: true })).not.toBeNull();
		expect(_getAutoRefreshBlocker(settings, { ...idleState, editing: true })).not.toBeNull();
		expect(
			_getAutoRefreshBlocker(
				{ ...settings, skip_if_playing_audio: false, skip_if_editing: false },
				{ ...idleState, audible: true, editing: true }
			)
		).toBeNull();
	});

	it('never reloads discarded or loading tabs', () => {
		expect(_getAutoRefreshBlocker(settings, { ...idleState, discarded: true })).not.toBeNull();
		expect(_getAutoRefreshBlocker(settings, { ...idleState, loading: true })).not.toBeNull();
	});
});

describe('alarm names and interval display', () => {
	it('round-trips the tab id through the alarm name', () => {
		expect(_getTabIdFromAutoRefreshAlarm(_getAutoRefreshAlarmName(42))).toBe(42);
		expect(_getTabIdFromAutoRefreshAlarm('tabee-auto-close-checker')).toBeNull();
	});

	it('shows the interval in the largest even unit', () => {
		expect(_splitAutoRefreshInterval(7200)).toEqual({ value: 2, unit: 'hours' });
		expect(_splitAutoRefreshInterval(300)).toEqual({ value: 5, unit: 'minutes' });
		expect(_splitAutoRefreshInterval(45)).toEqual({ value: 45, unit: 'seconds' });
	});
});
