import { _generateRandomId } from './helpers.ts';
import { NO_GROUP } from './workspaces.ts';

/**
 * Sessions are named snapshots of open tabs (their addresses, titles, pinned state and groups) that
 * can be reopened later, in a new window or the current one. They live in local storage only, apart
 * from the rules config, so they are never synced or included in backups.
 */

export type SessionGroup = {
	title: string;
	color: string;
	collapsed: boolean;
};

export type SessionTab = {
	url: string;
	title: string;
	pinned: boolean;
	/** Index into the window's groups, or null when the tab is not in a group. */
	group: number | null;
};

export type SessionWindow = {
	tabs: SessionTab[];
	groups: SessionGroup[];
};

export type Session = {
	id: string;
	name: string;
	created_at: number;
	windows: SessionWindow[];
	tab_count: number;
};

export type SessionScope = 'all' | { windowId: number } | { groupId: number };

export type RestoreTarget = 'new-window' | 'current-window';

const STORAGE_KEY = 'tab_automator_sessions';

type SnapshotWindow = { tabs: chrome.tabs.Tab[] };
type GroupInfo = { title?: string; color: string; collapsed: boolean };

export function _isRestorableUrl(url: string | undefined): url is string {
	return !!url && /^https?:\/\//i.test(url);
}

export function _defaultSessionName(now: Date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, '0');

	return `Session ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/**
 * Turns live windows into a saved session. Tabs that cannot be reopened later (browser pages, other
 * extensions' pages) are left out, and a window with nothing left is dropped.
 */
export function _buildSession(
	name: string,
	windows: SnapshotWindow[],
	groups: Map<number, GroupInfo>,
	now: number = Date.now()
): Session {
	const sessionWindows: SessionWindow[] = [];

	for (const snapshot of windows) {
		const groupIndexById = new Map<number, number>();
		const sessionGroups: SessionGroup[] = [];
		const tabs: SessionTab[] = [];

		const ordered = [...snapshot.tabs].sort((a, b) => a.index - b.index);

		for (const tab of ordered) {
			const url = tab.url || tab.pendingUrl;

			if (!_isRestorableUrl(url)) {
				continue;
			}

			let groupIndex: number | null = null;

			if (tab.groupId !== undefined && tab.groupId !== NO_GROUP && !tab.pinned) {
				const info = groups.get(tab.groupId);

				if (info) {
					if (!groupIndexById.has(tab.groupId)) {
						groupIndexById.set(tab.groupId, sessionGroups.length);
						sessionGroups.push({
							title: info.title ?? '',
							color: info.color,
							collapsed: info.collapsed,
						});
					}

					groupIndex = groupIndexById.get(tab.groupId) as number;
				}
			}

			tabs.push({ url, title: tab.title ?? url, pinned: !!tab.pinned, group: groupIndex });
		}

		if (tabs.length > 0) {
			sessionWindows.push({ tabs, groups: sessionGroups });
		}
	}

	return {
		id: _generateRandomId(),
		name: name.trim() || _defaultSessionName(new Date(now)),
		created_at: now,
		windows: sessionWindows,
		tab_count: sessionWindows.reduce((total, win) => total + win.tabs.length, 0),
	};
}

/** Reads the open windows and groups that a scope refers to and builds a session from them. */
export async function _captureSession(name: string, scope: SessionScope): Promise<Session> {
	const groupList = await chrome.tabGroups.query({});
	const groups = new Map<number, GroupInfo>(groupList.map((group) => [group.id, group]));

	let windows: SnapshotWindow[];

	if (scope === 'all') {
		const all = await chrome.windows.getAll({ populate: true });
		windows = all.filter((win) => win.type === 'normal').map((win) => ({ tabs: win.tabs ?? [] }));
	} else if ('windowId' in scope) {
		const win = await chrome.windows.get(scope.windowId, { populate: true });
		windows = [{ tabs: win.tabs ?? [] }];
	} else {
		windows = [{ tabs: await chrome.tabs.query({ groupId: scope.groupId }) }];
	}

	return _buildSession(name, windows, groups);
}

export async function _loadSessions(): Promise<Session[]> {
	try {
		const result = await chrome.storage.local.get(STORAGE_KEY);
		const sessions = result?.[STORAGE_KEY];

		return Array.isArray(sessions) ? sessions : [];
	} catch {
		return [];
	}
}

async function _storeSessions(sessions: Session[]): Promise<void> {
	await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
}

/** Newest first. */
export async function _addSession(session: Session): Promise<void> {
	await _storeSessions([session, ...(await _loadSessions())]);
}

export async function _renameSession(id: string, name: string): Promise<void> {
	const trimmed = name.trim();

	if (!trimmed) return;

	const sessions = await _loadSessions();
	await _storeSessions(sessions.map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
}

export async function _deleteSession(id: string): Promise<void> {
	const sessions = await _loadSessions();
	await _storeSessions(sessions.filter((s) => s.id !== id));
}

/** Puts one saved window's tabs back: pinned tabs first, then groups with their name and colour. */
async function _openWindowTabs(
	saved: SessionWindow,
	windowId: number | undefined
): Promise<{ windowId: number; tabIds: number[] }> {
	const urls = saved.tabs.map((tab) => tab.url);
	let tabIds: number[];
	let targetWindowId = windowId as number;

	if (windowId === undefined) {
		const created = await chrome.windows.create({ url: urls, focused: false });
		targetWindowId = created.id as number;

		let tabs = created.tabs ?? [];
		if (tabs.length !== urls.length) {
			tabs = await chrome.tabs.query({ windowId: targetWindowId });
		}

		tabIds = [...tabs].sort((a, b) => a.index - b.index).map((tab) => tab.id as number);
	} else {
		tabIds = [];

		for (const url of urls) {
			const tab = await chrome.tabs.create({ windowId, url, active: false });
			tabIds.push(tab.id as number);
		}
	}

	for (let i = 0; i < saved.tabs.length; i++) {
		if (saved.tabs[i].pinned) {
			await chrome.tabs.update(tabIds[i], { pinned: true });
		}
	}

	for (let g = 0; g < saved.groups.length; g++) {
		const memberIds = saved.tabs
			.map((tab, i) => (tab.group === g && !tab.pinned ? tabIds[i] : undefined))
			.filter((id): id is number => id !== undefined);

		if (memberIds.length === 0) continue;

		const groupId = await chrome.tabs.group({
			tabIds: memberIds,
			createProperties: { windowId: targetWindowId },
		});

		await chrome.tabGroups.update(groupId, {
			title: saved.groups[g].title,
			color: saved.groups[g].color as chrome.tabGroups.ColorEnum,
			collapsed: saved.groups[g].collapsed,
		});
	}

	return { windowId: targetWindowId, tabIds };
}

/**
 * Reopens a session. "new-window" gives each saved window its own new window; "current-window" adds
 * every saved tab to the window the user is in.
 */
export async function _restoreSession(
	session: Session,
	target: RestoreTarget
): Promise<{ windows: number; tabs: number }> {
	let currentWindowId: number | undefined;

	if (target === 'current-window') {
		currentWindowId = (await chrome.windows.getCurrent()).id;
	}

	let tabs = 0;
	let firstWindowId: number | undefined;

	for (const saved of session.windows) {
		const opened = await _openWindowTabs(saved, currentWindowId);

		tabs += opened.tabIds.length;
		firstWindowId ??= opened.windowId;
	}

	if (target === 'new-window' && firstWindowId !== undefined) {
		await chrome.windows.update(firstWindowId, { focused: true });
	}

	return { windows: target === 'new-window' ? session.windows.length : 1, tabs };
}
