import { TabModifierSettings } from './types.ts';
import { debugLog } from './debugLog.ts';

/** Shown to people in the UI; the real name has the date and time filled in. */
export const BACKUP_FILENAME_PATTERN = 'tab_automator_config_{datetime}.json';

/** One auto-backup file is kept per day; this many days are kept before the oldest is deleted. */
export const AUTO_BACKUP_KEEP_FILES = 7;

const AUTO_BACKUP_STATE_KEY = 'tab_automator_auto_backup_state';

type AutoBackupFile = { day: string; filename: string; downloadId?: number };
type AutoBackupState = { files: AutoBackupFile[] };

const _pad = (value: number): string => String(value).padStart(2, '0');

/** Local time, filesystem-safe and sortable: 2026-09-30_14-05-33 */
export function _formatBackupTimestamp(date: Date): string {
	const day = `${date.getFullYear()}-${_pad(date.getMonth() + 1)}-${_pad(date.getDate())}`;
	const time = `${_pad(date.getHours())}-${_pad(date.getMinutes())}-${_pad(date.getSeconds())}`;

	return `${day}_${time}`;
}

export function _backupFilename(date: Date = new Date()): string {
	return `tab_automator_config_${_formatBackupTimestamp(date)}.json`;
}

const _dayKey = (date: Date): string => _formatBackupTimestamp(date).split('_')[0];

function _toBase64Utf8(input: string): string {
	const bytes = new TextEncoder().encode(input);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function _readState(): Promise<AutoBackupState> {
	try {
		const result = await chrome.storage.local.get(AUTO_BACKUP_STATE_KEY);
		const state = result?.[AUTO_BACKUP_STATE_KEY];

		return Array.isArray(state?.files) ? state : { files: [] };
	} catch {
		return { files: [] };
	}
}

async function _writeState(state: AutoBackupState): Promise<void> {
	try {
		await chrome.storage.local.set({ [AUTO_BACKUP_STATE_KEY]: state });
	} catch {
		// Losing the bookkeeping only means an extra file next time.
	}
}

async function _deleteOldBackup(file: AutoBackupFile): Promise<void> {
	if (file.downloadId === undefined) return;

	try {
		await chrome.downloads.removeFile(file.downloadId);
	} catch {
		// Already deleted or moved by the user.
	}

	try {
		await chrome.downloads.erase({ id: file.downloadId });
	} catch {
		// Not in the download history any more.
	}
}

/**
 * Write a copy of the current config to Downloads, if auto-backup is enabled.
 *
 * The first backup of each day gets a timestamped name (tab_automator_config_{datetime}.json) and
 * later changes that day overwrite that same file, so Downloads never fills with one file per
 * edit. Files older than AUTO_BACKUP_KEEP_FILES days are deleted.
 *
 * Deliberately NOT debounced with setTimeout: this is called from
 * _setStorage(), which also runs inside the background service worker
 * (MV3), where a detached timer can simply never fire if the worker is
 * suspended before it elapses. Awaiting inline keeps this work inside the
 * same promise chain the caller already awaits, which keeps the worker
 * alive until it's done.
 */
export async function _autoBackupConfig(tabModifier: TabModifierSettings): Promise<void> {
	if (!tabModifier.settings?.auto_backup_enabled) {
		return;
	}

	if (typeof chrome === 'undefined' || !chrome.downloads?.download) {
		// No downloads API available (e.g. unit tests) - silently no-op.
		return;
	}

	try {
		const now = new Date();
		const state = await _readState();
		const today = _dayKey(now);
		const last = state.files[state.files.length - 1];
		const file: AutoBackupFile =
			last?.day === today ? last : { day: today, filename: _backupFilename(now) };

		const json = JSON.stringify(tabModifier, null, 4);
		const dataUrl = `data:application/json;base64,${_toBase64Utf8(json)}`;

		file.downloadId = await chrome.downloads.download({
			url: dataUrl,
			filename: file.filename,
			saveAs: false,
			conflictAction: 'overwrite',
		});

		if (file !== last) {
			state.files.push(file);
		}

		while (state.files.length > AUTO_BACKUP_KEEP_FILES) {
			await _deleteOldBackup(state.files.shift() as AutoBackupFile);
		}

		await _writeState(state);

		debugLog('[Tab Automator] Auto-backup written to Downloads/' + file.filename);
	} catch (error) {
		// Never let a backup failure block the actual config save.
		console.error('[Tab Automator] Auto-backup to Downloads failed:', error);
	}
}
