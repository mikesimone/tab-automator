import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _applyPausedBadge, _isPaused, _setPaused, PAUSE_STORAGE_KEY } from '../pause';
import { _getDefaultRule, _getRuleFromUrl, _setStorage } from '../storage';
import { _getDefaultTabModifierSettings } from '../storage';

const store: Record<string, unknown> = {};

const mockChrome = {
	runtime: {},
	storage: {
		local: {
			get: vi.fn((keys: string | string[], callback?: (items: any) => void) => {
				const list = Array.isArray(keys) ? keys : [keys];
				const items = Object.fromEntries(list.map((key) => [key, store[key]]));
				if (callback) {
					callback(items);
					return undefined;
				}
				return Promise.resolve(items);
			}),
			set: vi.fn(async (items: Record<string, unknown>) => {
				Object.assign(store, items);
			}),
		},
		sync: {
			get: vi.fn((_keys: unknown, callback: (items: any) => void) => callback({})),
			set: vi.fn(async () => undefined),
			remove: vi.fn(async () => undefined),
		},
	},
	action: {
		setBadgeText: vi.fn(),
		setBadgeBackgroundColor: vi.fn(),
	},
};

describe('pause', () => {
	beforeEach(() => {
		for (const key of Object.keys(store)) delete store[key];
		vi.clearAllMocks();
		(globalThis as any).chrome = mockChrome;
	});

	it('is not paused by default', async () => {
		expect(await _isPaused()).toBe(false);
	});

	it('remembers being paused and resumed', async () => {
		await _setPaused(true);
		expect(await _isPaused()).toBe(true);

		await _setPaused(false);
		expect(await _isPaused()).toBe(false);
	});

	it('is stored outside the synced and exported config', async () => {
		await _setPaused(true);

		expect(Object.keys(store)).toEqual([PAUSE_STORAGE_KEY]);
	});

	it('shows and clears the toolbar badge', async () => {
		await _applyPausedBadge(true);
		expect(mockChrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '⏸' });

		await _applyPausedBadge(false);
		expect(mockChrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: '' });
	});

	it('stops _getRuleFromUrl from returning rules while paused', async () => {
		const config = _getDefaultTabModifierSettings();
		config.rules.push(_getDefaultRule('Example', 'Example', 'example.com'));
		await _setStorage(config);

		expect((await _getRuleFromUrl('https://example.com/'))?.name).toBe('Example');

		await _setPaused(true);
		expect(await _getRuleFromUrl('https://example.com/')).toBeUndefined();

		await _setPaused(false);
		expect((await _getRuleFromUrl('https://example.com/'))?.name).toBe('Example');
	});
});
