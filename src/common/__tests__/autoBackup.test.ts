import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_autoBackupConfig,
	_backupFilename,
	_formatBackupTimestamp,
	AUTO_BACKUP_KEEP_FILES,
} from '../autoBackup';
import { TabModifierSettings } from '../types';

function makeConfig(autoBackupEnabled: boolean): TabModifierSettings {
	return {
		rules: [],
		groups: [],
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
			auto_backup_enabled: autoBackupEnabled,
			sync_enabled: false,
		},
	};
}

describe('backup filenames', () => {
	it('uses a local, filesystem-safe, sortable timestamp', () => {
		const date = new Date(2026, 8, 30, 14, 5, 33);

		expect(_formatBackupTimestamp(date)).toBe('2026-09-30_14-05-33');
		expect(_backupFilename(date)).toBe('tab_automator_config_2026-09-30_14-05-33.json');
	});

	it('zero-pads single digit parts', () => {
		expect(_backupFilename(new Date(2026, 0, 2, 3, 4, 5))).toBe(
			'tab_automator_config_2026-01-02_03-04-05.json'
		);
	});
});

describe('autoBackup', () => {
	let storage: Record<string, unknown>;
	let nextDownloadId: number;

	const chromeMock = () => (globalThis as any).chrome;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 8, 30, 14, 5, 33));

		storage = {};
		nextDownloadId = 1;

		(globalThis as any).chrome = {
			downloads: {
				download: vi.fn(async () => nextDownloadId++),
				removeFile: vi.fn(async () => undefined),
				erase: vi.fn(async () => []),
			},
			storage: {
				local: {
					get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
					set: vi.fn(async (items: Record<string, unknown>) => Object.assign(storage, items)),
				},
			},
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does nothing when auto-backup is disabled', async () => {
		await _autoBackupConfig(makeConfig(false));

		expect(chromeMock().downloads.download).not.toHaveBeenCalled();
	});

	it('does nothing when chrome.downloads is unavailable', async () => {
		(globalThis as any).chrome = {};

		await expect(_autoBackupConfig(makeConfig(true))).resolves.not.toThrow();
	});

	it('downloads a JSON backup named with the date and time', async () => {
		await _autoBackupConfig(makeConfig(true));

		expect(chromeMock().downloads.download).toHaveBeenCalledTimes(1);
		const [options] = chromeMock().downloads.download.mock.calls[0];

		expect(options.filename).toBe('tab_automator_config_2026-09-30_14-05-33.json');
		expect(options.conflictAction).toBe('overwrite');
		expect(options.saveAs).toBe(false);
		expect(options.url).toMatch(/^data:application\/json;base64,/);

		const base64 = options.url.split(',')[1];
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		const decoded = JSON.parse(new TextDecoder().decode(bytes));
		expect(decoded.settings.auto_backup_enabled).toBe(true);
	});

	it('overwrites the same file for every change on the same day', async () => {
		await _autoBackupConfig(makeConfig(true));

		vi.setSystemTime(new Date(2026, 8, 30, 18, 45, 10));
		await _autoBackupConfig(makeConfig(true));

		const filenames = chromeMock().downloads.download.mock.calls.map(([o]: any[]) => o.filename);

		expect(filenames).toEqual([
			'tab_automator_config_2026-09-30_14-05-33.json',
			'tab_automator_config_2026-09-30_14-05-33.json',
		]);
		expect(chromeMock().downloads.removeFile).not.toHaveBeenCalled();
	});

	it('starts a new file on the next day', async () => {
		await _autoBackupConfig(makeConfig(true));

		vi.setSystemTime(new Date(2026, 9, 1, 9, 0, 0));
		await _autoBackupConfig(makeConfig(true));

		const filenames = chromeMock().downloads.download.mock.calls.map(([o]: any[]) => o.filename);

		expect(filenames[1]).toBe('tab_automator_config_2026-10-01_09-00-00.json');
	});

	it('deletes the oldest backup once more than the allowed number exist', async () => {
		for (let day = 0; day <= AUTO_BACKUP_KEEP_FILES; day++) {
			vi.setSystemTime(new Date(2026, 8, 1 + day, 12, 0, 0));
			await _autoBackupConfig(makeConfig(true));
		}

		// Eight days of backups: the first download (id 1) is the one that goes.
		expect(chromeMock().downloads.removeFile).toHaveBeenCalledTimes(1);
		expect(chromeMock().downloads.removeFile).toHaveBeenCalledWith(1);
		expect(chromeMock().downloads.erase).toHaveBeenCalledWith({ id: 1 });
	});

	it('keeps backing up when cleaning up an old file fails', async () => {
		chromeMock().downloads.removeFile = vi.fn(async () => {
			throw new Error('file is gone');
		});

		for (let day = 0; day <= AUTO_BACKUP_KEEP_FILES; day++) {
			vi.setSystemTime(new Date(2026, 8, 1 + day, 12, 0, 0));
			await expect(_autoBackupConfig(makeConfig(true))).resolves.not.toThrow();
		}

		expect(chromeMock().downloads.download).toHaveBeenCalledTimes(AUTO_BACKUP_KEEP_FILES + 1);
	});

	it('swallows errors from the downloads API instead of throwing', async () => {
		chromeMock().downloads.download = vi.fn(() => {
			throw new Error('boom');
		});

		await expect(_autoBackupConfig(makeConfig(true))).resolves.not.toThrow();
	});
});
