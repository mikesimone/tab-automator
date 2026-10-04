/**
 * A workspace is an open tab group. These helpers list them across windows and move them between
 * windows as a unit, so a presenter can pull just the tabs they want to show into their own window.
 */

export type Workspace = {
	id: number;
	windowId: number;
	title: string;
	color: string;
	collapsed: boolean;
	tabCount: number;
};

export type TargetWindow = {
	id: number;
	label: string;
};

const INVISIBLE_CHAR = '​';

export const NO_GROUP = -1;

export function _workspaceTitle(title: string | undefined): string {
	const clean = (title ?? '').split(INVISIBLE_CHAR).join('').trim();

	return clean || 'Untitled group';
}

export async function _listWorkspaces(): Promise<Workspace[]> {
	const [groups, tabs] = await Promise.all([chrome.tabGroups.query({}), chrome.tabs.query({})]);

	const counts = new Map<number, number>();
	for (const tab of tabs) {
		if (tab.groupId !== undefined && tab.groupId !== NO_GROUP) {
			counts.set(tab.groupId, (counts.get(tab.groupId) ?? 0) + 1);
		}
	}

	return groups.map((group) => ({
		id: group.id,
		windowId: group.windowId,
		title: _workspaceTitle(group.title),
		color: group.color,
		collapsed: group.collapsed,
		tabCount: counts.get(group.id) ?? 0,
	}));
}

/** Normal browser windows a workspace can be moved to, described by what is in them. */
export async function _listTargetWindows(excludeWindowId?: number): Promise<TargetWindow[]> {
	const windows = await chrome.windows.getAll({ populate: true });

	return windows
		.filter((win) => win.type === 'normal' && win.id !== undefined && win.id !== excludeWindowId)
		.map((win, index) => {
			const active = win.tabs?.find((tab) => tab.active);
			const count = win.tabs?.length ?? 0;
			const where = active?.title ? `"${active.title.slice(0, 40)}"` : `Window ${index + 1}`;

			return { id: win.id as number, label: `${where} (${count} ${count === 1 ? 'tab' : 'tabs'})` };
		});
}

/**
 * Moves a workspace into a brand new window. The group keeps its name, colour and tabs, and the
 * blank tab Chrome opens with the new window is closed once the group has arrived.
 */
export async function _moveWorkspaceToNewWindow(groupId: number): Promise<number> {
	const window = await chrome.windows.create({ focused: true });
	const windowId = window.id as number;
	const blankTabIds = (window.tabs ?? [])
		.map((tab) => tab.id)
		.filter((id): id is number => id !== undefined);

	await chrome.tabGroups.move(groupId, { windowId, index: -1 });
	await chrome.tabGroups.update(groupId, { collapsed: false });

	if (blankTabIds.length > 0) {
		await chrome.tabs.remove(blankTabIds);
	}

	return windowId;
}

export async function _moveWorkspaceToWindow(groupId: number, windowId: number): Promise<void> {
	await chrome.tabGroups.move(groupId, { windowId, index: -1 });
	await chrome.windows.update(windowId, { focused: true });
}

export async function _closeWorkspace(groupId: number): Promise<number> {
	const tabs = await chrome.tabs.query({ groupId });
	const tabIds = tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined);

	if (tabIds.length > 0) {
		await chrome.tabs.remove(tabIds);
	}

	return tabIds.length;
}

/**
 * What the "move to new window" shortcut does: the whole group when the tab is in one, otherwise
 * just the tab.
 */
export async function _moveTabOrWorkspaceToNewWindow(tab: chrome.tabs.Tab): Promise<void> {
	if (tab.groupId !== undefined && tab.groupId !== NO_GROUP) {
		await _moveWorkspaceToNewWindow(tab.groupId);
		return;
	}

	if (tab.id !== undefined) {
		await chrome.windows.create({ tabId: tab.id, focused: true });
	}
}
