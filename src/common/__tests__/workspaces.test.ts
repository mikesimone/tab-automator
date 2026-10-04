import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_closeWorkspace,
	_listTargetWindows,
	_listWorkspaces,
	_moveTabOrWorkspaceToNewWindow,
	_moveWorkspaceToNewWindow,
	_moveWorkspaceToWindow,
	_workspaceTitle,
} from '../workspaces';

const ZWSP = '​';

const mockChrome = {
	tabGroups: {
		query: vi.fn(),
		move: vi.fn(),
		update: vi.fn(),
	},
	tabs: {
		query: vi.fn(),
		remove: vi.fn(),
	},
	windows: {
		create: vi.fn(),
		update: vi.fn(),
		getAll: vi.fn(),
	},
};

describe('workspaces', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(globalThis as any).chrome = mockChrome;
	});

	it('hides the invisible suffix the extension adds to group names', () => {
		expect(_workspaceTitle(`Demo${ZWSP}`)).toBe('Demo');
		expect(_workspaceTitle('')).toBe('Untitled group');
		expect(_workspaceTitle(undefined)).toBe('Untitled group');
	});

	it('lists open groups with their tab counts', async () => {
		mockChrome.tabGroups.query.mockResolvedValue([
			{ id: 1, windowId: 10, title: `Demo${ZWSP}`, color: 'blue', collapsed: false },
			{ id: 2, windowId: 11, title: 'Docs', color: 'red', collapsed: true },
		]);
		mockChrome.tabs.query.mockResolvedValue([
			{ id: 100, groupId: 1 },
			{ id: 101, groupId: 1 },
			{ id: 102, groupId: 2 },
			{ id: 103, groupId: -1 },
		]);

		expect(await _listWorkspaces()).toEqual([
			{ id: 1, windowId: 10, title: 'Demo', color: 'blue', collapsed: false, tabCount: 2 },
			{ id: 2, windowId: 11, title: 'Docs', color: 'red', collapsed: true, tabCount: 1 },
		]);
	});

	it('moves a group into a new window and then closes the blank tab Chrome opened', async () => {
		mockChrome.windows.create.mockResolvedValue({ id: 50, tabs: [{ id: 900 }] });

		const windowId = await _moveWorkspaceToNewWindow(7);

		expect(windowId).toBe(50);
		expect(mockChrome.windows.create).toHaveBeenCalledWith({ focused: true });
		expect(mockChrome.tabGroups.move).toHaveBeenCalledWith(7, { windowId: 50, index: -1 });
		expect(mockChrome.tabGroups.update).toHaveBeenCalledWith(7, { collapsed: false });
		expect(mockChrome.tabs.remove).toHaveBeenCalledWith([900]);

		const moved = mockChrome.tabGroups.move.mock.invocationCallOrder[0];
		const removed = mockChrome.tabs.remove.mock.invocationCallOrder[0];
		expect(moved).toBeLessThan(removed);
	});

	it('moves a group to an existing window and focuses it', async () => {
		await _moveWorkspaceToWindow(7, 22);

		expect(mockChrome.tabGroups.move).toHaveBeenCalledWith(7, { windowId: 22, index: -1 });
		expect(mockChrome.windows.update).toHaveBeenCalledWith(22, { focused: true });
	});

	it('closes every tab in a group', async () => {
		mockChrome.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);

		expect(await _closeWorkspace(7)).toBe(2);
		expect(mockChrome.tabs.query).toHaveBeenCalledWith({ groupId: 7 });
		expect(mockChrome.tabs.remove).toHaveBeenCalledWith([1, 2]);
	});

	it('shortcut moves the whole group when the tab is grouped', async () => {
		mockChrome.windows.create.mockResolvedValue({ id: 50, tabs: [{ id: 900 }] });

		await _moveTabOrWorkspaceToNewWindow({ id: 5, groupId: 7 } as chrome.tabs.Tab);

		expect(mockChrome.tabGroups.move).toHaveBeenCalledWith(7, { windowId: 50, index: -1 });
	});

	it('shortcut moves just the tab when it is not in a group', async () => {
		await _moveTabOrWorkspaceToNewWindow({ id: 5, groupId: -1 } as chrome.tabs.Tab);

		expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 5, focused: true });
		expect(mockChrome.tabGroups.move).not.toHaveBeenCalled();
	});

	it('lists only other normal windows as move targets, described by what is in them', async () => {
		mockChrome.windows.getAll.mockResolvedValue([
			{ id: 10, type: 'normal', tabs: [{ active: true, title: 'Mine' }] },
			{
				id: 11,
				type: 'normal',
				tabs: [
					{ active: false, title: 'a' },
					{ active: true, title: 'Project board' },
				],
			},
			{ id: 12, type: 'popup', tabs: [{ active: true, title: 'Popup' }] },
		]);

		expect(await _listTargetWindows(10)).toEqual([{ id: 11, label: '"Project board" (2 tabs)' }]);
	});
});
