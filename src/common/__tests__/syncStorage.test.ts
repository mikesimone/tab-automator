import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	_joinSync,
	_mergeConfigs,
	_pushToSync,
	_pullFromSyncIfNewer,
	LOCAL_SYNC_FIRST_SEEN_KEY,
	LOCAL_SYNC_HASH_KEY,
	LOCAL_SYNC_JOINED_KEY,
	SYNC_JOIN_WAIT_MS,
} from '../syncStorage';
import {
	_getDefaultRule,
	_loadFromStorage,
	STORAGE_KEY_COMPRESSED,
	STORAGE_KEY_METADATA,
	STORAGE_KEY_CHUNK_PREFIX,
} from '../storage';
import { compressToUTF16 } from 'lz-string';
import { TabModifierSettings } from '../types';

// One group, so the config isn't blank: blank configs are never pushed (see the join tests).
function makeConfig(overrides: Partial<TabModifierSettings['settings']> = {}): TabModifierSettings {
	return {
		rules: [],
		groups: [{ id: 'g0', title: 'Base', color: 'grey', collapsed: false }],
		settings: {
			enable_new_version_notification: false,
			theme: 'tabee',
			lightweight_mode_enabled: false,
			lightweight_mode_patterns: [],
			lightweight_mode_apply_to_rules: true,
			lightweight_mode_apply_to_tab_hive: true,
			auto_close_enabled: false,
			auto_close_timeout: 30,
			tab_hive_reject_list: [],
			debug_mode: false,
			auto_backup_enabled: false,
			sync_enabled: true,
			...overrides,
		},
	};
}

function makeStorageArea(store: Record<string, any>) {
	return {
		get: vi.fn((keys: string[] | null, callback: (items: any) => void) => {
			if (keys === null) {
				callback({ ...store });
				return;
			}
			const result: Record<string, any> = {};
			(Array.isArray(keys) ? keys : [keys]).forEach((key) => {
				if (key in store) result[key] = store[key];
			});
			callback(result);
		}),
		set: vi.fn((items: Record<string, any>, callback?: () => void) => {
			Object.assign(store, items);
			callback?.();
		}),
		remove: vi.fn((keys: string | string[], callback?: () => void) => {
			(Array.isArray(keys) ? keys : [keys]).forEach((key) => delete store[key]);
			callback?.();
		}),
	};
}

let localStore: Record<string, any>;
let syncStore: Record<string, any>;
let syncArea: ReturnType<typeof makeStorageArea> & { QUOTA_BYTES: number; MAX_ITEMS: number };

describe('syncStorage', () => {
	beforeEach(() => {
		// Most tests are about a device that already joined sync; the join tests clear this.
		localStore = { [LOCAL_SYNC_JOINED_KEY]: true };
		syncStore = {};
		syncArea = Object.assign(makeStorageArea(syncStore), {
			QUOTA_BYTES: 102400,
			MAX_ITEMS: 512,
		});

		// @ts-expect-error - global is from vitest setup; see storage.test.ts for the same pattern
		global.chrome = {
			runtime: { lastError: null },
			storage: {
				local: makeStorageArea(localStore),
				sync: syncArea,
			},
		};
	});

	describe('_pushToSync', () => {
		it('returns "disabled" and writes nothing when sync is off', async () => {
			const result = await _pushToSync(makeConfig({ sync_enabled: false }));

			expect(result).toBe('disabled');
			expect(Object.keys(syncStore)).toHaveLength(0);
		});

		it('writes chunked config + metadata to sync on first push', async () => {
			const config = makeConfig();
			config.rules.push({
				id: 'r1',
				is_enabled: true,
				name: 'Test rule',
				detection: 'CONTAINS',
				url_fragment: 'example.com',
				tab: {
					title: 'Example',
					icon: null,
					pinned: false,
					protected: false,
					unique: false,
					muted: false,
					title_matcher: null,
					url_matcher: null,
					group_id: null,
				},
			});

			const result = await _pushToSync(config);

			expect(result).toBe('ok');
			expect(syncStore[STORAGE_KEY_METADATA]).toBeDefined();
			expect(syncStore[STORAGE_KEY_METADATA].chunkCount).toBeGreaterThan(0);
			expect(syncStore[`${STORAGE_KEY_CHUNK_PREFIX}0`]).toBeTypeOf('string');
			expect(localStore[LOCAL_SYNC_HASH_KEY]).toBe(syncStore[STORAGE_KEY_METADATA].hash);
		});

		it('is a no-op ("unchanged") when pushing identical content twice', async () => {
			const config = makeConfig();

			await _pushToSync(config);
			const setCallsAfterFirst = syncArea.set.mock.calls.length;

			const result = await _pushToSync(config);

			expect(result).toBe('unchanged');
			expect(syncArea.set.mock.calls.length).toBe(setCallsAfterFirst);
		});

		it('cleans up stale chunk keys when a new push has fewer chunks than the last', async () => {
			const big = makeConfig();
			for (let i = 0; i < 200; i++) {
				big.rules.push({
					id: `r${i}`,
					is_enabled: true,
					name: `Rule number ${i} with a fairly long descriptive name to bulk up size`,
					detection: 'CONTAINS',
					url_fragment: `example${i}.com/some/long/path/fragment`,
					tab: {
						title: `Title for rule ${i}`,
						icon: null,
						pinned: false,
						protected: false,
						unique: false,
						muted: false,
						title_matcher: null,
						url_matcher: null,
						group_id: null,
					},
				});
			}

			await _pushToSync(big);
			const previousChunkCount = syncStore[STORAGE_KEY_METADATA].chunkCount;
			expect(previousChunkCount).toBeGreaterThan(1);

			await _pushToSync(makeConfig());

			expect(syncStore[STORAGE_KEY_METADATA].chunkCount).toBe(1);
			expect(syncStore[`${STORAGE_KEY_CHUNK_PREFIX}${previousChunkCount - 1}`]).toBeUndefined();
		});

		it('returns "too-large" and writes nothing when the config exceeds the sync quota', async () => {
			syncArea.QUOTA_BYTES = 100; // tiny quota, easy to exceed

			const result = await _pushToSync(makeConfig());

			expect(result).toBe('too-large');
			expect(Object.keys(syncStore)).toHaveLength(0);
		});
	});

	describe('_pullFromSyncIfNewer', () => {
		it('returns "no-data" when sync has nothing stored', async () => {
			const result = await _pullFromSyncIfNewer();

			expect(result.status).toBe('no-data');
		});

		it('returns "unchanged" when the remote hash matches what we last saw', async () => {
			await _pushToSync(makeConfig());

			const result = await _pullFromSyncIfNewer();

			expect(result.status).toBe('unchanged');
		});

		it('returns "updated" with decompressed data when sync has content we have not seen', async () => {
			const config = makeConfig();
			config.rules.push({
				id: 'remote-rule',
				is_enabled: true,
				name: 'From another device',
				detection: 'CONTAINS',
				url_fragment: 'example.com',
				tab: {
					title: 'Example',
					icon: null,
					pinned: false,
					protected: false,
					unique: false,
					muted: false,
					title_matcher: null,
					url_matcher: null,
					group_id: null,
				},
			});
			await _pushToSync(config);

			// Simulate a fresh device/service-worker restart that never pushed
			// or pulled anything yet.
			delete localStore[LOCAL_SYNC_HASH_KEY];

			const result = await _pullFromSyncIfNewer();

			expect(result.status).toBe('updated');
			if (result.status === 'updated') {
				expect(result.data.rules).toHaveLength(1);
				expect(result.data.rules[0].id).toBe('remote-rule');
			}
			// Pulling should also remember the hash, so a follow-up push of the
			// same data doesn't ping-pong back to sync.
			expect(localStore[LOCAL_SYNC_HASH_KEY]).toBe(syncStore[STORAGE_KEY_METADATA].hash);
		});
	});

	describe('a new device joining sync', () => {
		const ruleNamed = (name: string, fragment: string) => {
			const rule = _getDefaultRule(name, '', fragment);
			rule.id = `id-${name}`;
			return rule;
		};
		const accountRules = () => {
			const config = makeConfig();
			config.rules = [ruleNamed('Mail', 'mail.example.com'), ruleNamed('Docs', 'docs.example.com')];
			return config;
		};
		beforeEach(() => {
			delete localStore[LOCAL_SYNC_JOINED_KEY];
		});

		it('never pushes a blank config, even after joining', async () => {
			localStore[LOCAL_SYNC_JOINED_KEY] = true;
			const blank = makeConfig();
			blank.groups = [];

			expect(await _pushToSync(blank)).toBe('empty');
			expect(Object.keys(syncStore)).toHaveLength(0);
		});

		it('takes the rules already in the account instead of overwriting them', async () => {
			// The account has two rules, written by another computer.
			localStore[LOCAL_SYNC_JOINED_KEY] = true;
			await _pushToSync(accountRules());
			const accountHash = syncStore[STORAGE_KEY_METADATA].hash;
			for (const key of Object.keys(localStore)) delete localStore[key];

			// New computer: someone makes one rule before sync caught up.
			const local = makeConfig();
			local.rules = [ruleNamed('Mine', 'mine.example.com')];
			localStore[STORAGE_KEY_COMPRESSED] = compressToUTF16(JSON.stringify(local));

			const result = await _pushToSync(local);

			expect(result).toBe('adopted');
			const saved = await _loadFromStorage(chrome.storage.local, 'local');
			expect(saved?.rules.map((r) => r.name)).toEqual(['Mail', 'Docs', 'Mine']);
			// The account now has all three, not just the new computer's one.
			const account = await _loadFromStorage(chrome.storage.sync, 'sync');
			expect(account?.rules.map((r) => r.name)).toEqual(['Mail', 'Docs', 'Mine']);
			expect(syncStore[STORAGE_KEY_METADATA].hash).not.toBe(accountHash);
			expect(localStore[LOCAL_SYNC_JOINED_KEY]).toBe(true);
		});

		it('waits instead of pushing while the account may still be downloading', async () => {
			const local = makeConfig();
			local.rules = [ruleNamed('Mine', 'mine.example.com')];

			expect(await _pushToSync(local)).toBe('waiting');
			expect(Object.keys(syncStore)).toHaveLength(0);
			expect(localStore[LOCAL_SYNC_FIRST_SEEN_KEY]).toBeTypeOf('number');
		});

		it('joins and pushes once the wait is over and the account is still empty', async () => {
			const local = makeConfig();
			local.rules = [ruleNamed('Mine', 'mine.example.com')];
			localStore[STORAGE_KEY_COMPRESSED] = compressToUTF16(JSON.stringify(local));
			localStore[LOCAL_SYNC_FIRST_SEEN_KEY] = Date.now() - SYNC_JOIN_WAIT_MS - 1;

			expect(await _joinSync()).toBe('joined');
			const account = await _loadFromStorage(chrome.storage.sync, 'sync');
			expect(account?.rules.map((r) => r.name)).toEqual(['Mine']);
		});

		it('fills an empty new device from the account', async () => {
			localStore[LOCAL_SYNC_JOINED_KEY] = true;
			await _pushToSync(accountRules());
			for (const key of Object.keys(localStore)) delete localStore[key];

			expect(await _joinSync()).toBe('adopted');
			const saved = await _loadFromStorage(chrome.storage.local, 'local');
			expect(saved?.rules.map((r) => r.name)).toEqual(['Mail', 'Docs']);
			expect(saved?.settings.sync_enabled).toBe(true);
		});

		it('leaves a device alone that has its own rules and turned sync off', async () => {
			localStore[LOCAL_SYNC_JOINED_KEY] = true;
			await _pushToSync(accountRules());
			for (const key of Object.keys(localStore)) delete localStore[key];
			const local = makeConfig({ sync_enabled: false });
			local.rules = [ruleNamed('Mine', 'mine.example.com')];
			localStore[STORAGE_KEY_COMPRESSED] = compressToUTF16(JSON.stringify(local));

			expect(await _joinSync()).toBe('disabled');
			const saved = await _loadFromStorage(chrome.storage.local, 'local');
			expect(saved?.rules.map((r) => r.name)).toEqual(['Mine']);
		});

		it('never applies a blank config found in the account', async () => {
			const blank = makeConfig();
			blank.groups = [];
			syncStore[STORAGE_KEY_COMPRESSED] = compressToUTF16(JSON.stringify(blank));

			expect((await _pullFromSyncIfNewer()).status).toBe('no-data');
		});

		it('merges without duplicating rules both sides have', () => {
			const remote = accountRules();
			const local = makeConfig({ sync_enabled: false });
			const copy = ruleNamed('Mail', 'mail.example.com');
			copy.id = 'different-id';
			local.rules = [copy, ruleNamed('Mine', 'mine.example.com')];
			local.groups = [{ id: 'g-local', title: 'Local', color: 'red', collapsed: false }];

			const merged = _mergeConfigs(remote, local);
			expect(merged.rules.map((r) => r.name)).toEqual(['Mail', 'Docs', 'Mine']);
			expect(merged.groups.map((g) => g.id)).toEqual(['g0', 'g-local']);
			expect(merged.settings.sync_enabled).toBe(true);
		});
	});
});
