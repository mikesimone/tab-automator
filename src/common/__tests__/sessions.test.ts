import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	_addSession,
	_buildSession,
	_captureSession,
	_defaultSessionName,
	_deleteSession,
	_isRestorableUrl,
	_loadSessions,
	_renameSession,
	_restoreSession,
	Session,
} from '../sessions';

const tab = (overrides: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
	({ index: 0, groupId: -1, pinned: false, title: 'T', ...overrides }) as chrome.tabs.Tab;

describe('_isRestorableUrl', () => {
	it.each([
		['https://example.com/', true],
		['http://localhost:3000', true],
		['chrome://extensions', false],
		['chrome-extension://abc/options.html', false],
		['about:blank', false],
		['file:///tmp/a.html', false],
		['', false],
		[undefined, false],
	])('%s -> %s', (url, expected) => {
		expect(_isRestorableUrl(url)).toBe(expected);
	});
});

describe('_buildSession', () => {
	const groups = new Map([
		[5, { title: 'Demo', color: 'blue', collapsed: false }],
		[6, { title: 'Docs', color: 'red', collapsed: true }],
	]);

	it('keeps tab order, groups, pinned state and skips pages that cannot be reopened', () => {
		const session = _buildSession(
			'  Review  ',
			[
				{
					tabs: [
						tab({ index: 2, url: 'https://b.com', title: 'B', groupId: 5 }),
						tab({ index: 0, url: 'https://a.com', title: 'A', pinned: true }),
						tab({ index: 1, url: 'chrome://settings', title: 'Settings' }),
						tab({ index: 3, url: 'https://c.com', title: 'C', groupId: 5 }),
						tab({ index: 4, url: 'https://d.com', title: 'D', groupId: 6 }),
					],
				},
			],
			groups,
			1000
		);

		expect(session.name).toBe('Review');
		expect(session.created_at).toBe(1000);
		expect(session.tab_count).toBe(4);
		expect(session.windows).toHaveLength(1);
		expect(session.windows[0].groups).toEqual([
			{ title: 'Demo', color: 'blue', collapsed: false },
			{ title: 'Docs', color: 'red', collapsed: true },
		]);
		expect(session.windows[0].tabs).toEqual([
			{ url: 'https://a.com', title: 'A', pinned: true, group: null },
			{ url: 'https://b.com', title: 'B', pinned: false, group: 0 },
			{ url: 'https://c.com', title: 'C', pinned: false, group: 0 },
			{ url: 'https://d.com', title: 'D', pinned: false, group: 1 },
		]);
	});

	it('never puts a pinned tab in a group', () => {
		const session = _buildSession(
			'x',
			[{ tabs: [tab({ url: 'https://a.com', pinned: true, groupId: 5 })] }],
			groups
		);

		expect(session.windows[0].tabs[0].group).toBeNull();
		expect(session.windows[0].groups).toEqual([]);
	});

	it('drops windows with nothing restorable and falls back to a dated name', () => {
		const session = _buildSession(
			'   ',
			[{ tabs: [tab({ url: 'chrome://newtab' })] }, { tabs: [tab({ url: 'https://a.com' })] }],
			groups,
			new Date(2026, 9, 4, 9, 5).getTime()
		);

		expect(session.windows).toHaveLength(1);
		expect(session.name).toBe('Session 2026-10-04 09:05');
		expect(_defaultSessionName(new Date(2026, 0, 2, 3, 4))).toBe('Session 2026-01-02 03:04');
	});

	it('uses a tab that is still loading by its pending address', () => {
		const session = _buildSession(
			'x',
			[{ tabs: [tab({ url: '', pendingUrl: 'https://loading.example/' })] }],
			groups
		);

		expect(session.windows[0].tabs[0].url).toBe('https://loading.example/');
	});
});

describe('session storage and capture', () => {
	let store: Record<string, unknown>;
	const mockChrome: any = {};

	beforeEach(() => {
		store = {};
		mockChrome.storage = {
			local: {
				get: vi.fn(async (key: string) => ({ [key]: store[key] })),
				set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
			},
		};
		mockChrome.tabGroups = {
			query: vi.fn(async () => [{ id: 5, title: 'Demo', color: 'blue', collapsed: false }]),
		};
		mockChrome.windows = {
			getAll: vi.fn(),
			get: vi.fn(),
		};
		mockChrome.tabs = { query: vi.fn() };
		(globalThis as any).chrome = mockChrome;
	});

	const session = (id: string, name: string): Session => ({
		id,
		name,
		created_at: 1,
		windows: [],
		tab_count: 0,
	});

	it('adds newest first, renames (ignoring blank names) and deletes', async () => {
		await _addSession(session('a', 'First'));
		await _addSession(session('b', 'Second'));
		expect((await _loadSessions()).map((s) => s.id)).toEqual(['b', 'a']);

		await _renameSession('a', '  Renamed ');
		await _renameSession('b', '   ');
		expect((await _loadSessions()).map((s) => s.name)).toEqual(['Second', 'Renamed']);

		await _deleteSession('b');
		expect((await _loadSessions()).map((s) => s.id)).toEqual(['a']);
	});

	it('starts empty when nothing was ever saved', async () => {
		expect(await _loadSessions()).toEqual([]);
	});

	it('captures every normal window for the "all" scope', async () => {
		mockChrome.windows.getAll.mockResolvedValue([
			{ id: 1, type: 'normal', tabs: [tab({ url: 'https://a.com' })] },
			{ id: 2, type: 'popup', tabs: [tab({ url: 'https://popup.com' })] },
			{ id: 3, type: 'normal', tabs: [tab({ url: 'https://b.com', groupId: 5 })] },
		]);

		const captured = await _captureSession('All', 'all');

		expect(captured.windows).toHaveLength(2);
		expect(captured.tab_count).toBe(2);
		expect(captured.windows[1].groups[0].title).toBe('Demo');
	});

	it('captures one window for the window scope', async () => {
		mockChrome.windows.get.mockResolvedValue({
			id: 9,
			tabs: [tab({ url: 'https://a.com' }), tab({ index: 1, url: 'https://b.com' })],
		});

		const captured = await _captureSession('One', { windowId: 9 });

		expect(mockChrome.windows.get).toHaveBeenCalledWith(9, { populate: true });
		expect(captured.windows).toHaveLength(1);
		expect(captured.tab_count).toBe(2);
	});

	it('captures just the tabs of a group for the workspace scope', async () => {
		mockChrome.tabs.query.mockResolvedValue([tab({ url: 'https://a.com', groupId: 5 })]);

		const captured = await _captureSession('Group', { groupId: 5 });

		expect(mockChrome.tabs.query).toHaveBeenCalledWith({ groupId: 5 });
		expect(captured.windows[0].groups).toEqual([
			{ title: 'Demo', color: 'blue', collapsed: false },
		]);
	});
});

describe('_restoreSession', () => {
	const saved: Session = {
		id: 's',
		name: 'Saved',
		created_at: 1,
		tab_count: 3,
		windows: [
			{
				groups: [{ title: 'Demo', color: 'blue', collapsed: true }],
				tabs: [
					{ url: 'https://pinned.com', title: 'P', pinned: true, group: null },
					{ url: 'https://a.com', title: 'A', pinned: false, group: 0 },
					{ url: 'https://b.com', title: 'B', pinned: false, group: 0 },
				],
			},
		],
	};

	const mockChrome: any = {};

	beforeEach(() => {
		mockChrome.windows = {
			create: vi.fn(async () => ({
				id: 77,
				tabs: [
					{ id: 1, index: 0 },
					{ id: 2, index: 1 },
					{ id: 3, index: 2 },
				],
			})),
			update: vi.fn(),
			getCurrent: vi.fn(async () => ({ id: 5 })),
		};
		mockChrome.tabs = {
			update: vi.fn(),
			group: vi.fn(async () => 300),
			create: vi.fn(),
			query: vi.fn(),
		};
		mockChrome.tabGroups = { update: vi.fn() };
		(globalThis as any).chrome = mockChrome;
	});

	it('opens a new window, pins, regroups and focuses it', async () => {
		const result = await _restoreSession(saved, 'new-window');

		expect(mockChrome.windows.create).toHaveBeenCalledWith({
			url: ['https://pinned.com', 'https://a.com', 'https://b.com'],
			focused: false,
		});
		expect(mockChrome.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
		expect(mockChrome.tabs.group).toHaveBeenCalledWith({
			tabIds: [2, 3],
			createProperties: { windowId: 77 },
		});
		expect(mockChrome.tabGroups.update).toHaveBeenCalledWith(300, {
			title: 'Demo',
			color: 'blue',
			collapsed: true,
		});
		expect(mockChrome.windows.update).toHaveBeenCalledWith(77, { focused: true });
		expect(result).toEqual({ windows: 1, tabs: 3 });
	});

	it('adds the tabs to the current window without opening another', async () => {
		let nextId = 10;
		mockChrome.tabs.create.mockImplementation(async () => ({ id: nextId++ }));

		const result = await _restoreSession(saved, 'current-window');

		expect(mockChrome.windows.create).not.toHaveBeenCalled();
		expect(mockChrome.tabs.create).toHaveBeenCalledTimes(3);
		expect(mockChrome.tabs.create).toHaveBeenCalledWith({
			windowId: 5,
			url: 'https://a.com',
			active: false,
		});
		expect(mockChrome.tabs.group).toHaveBeenCalledWith({
			tabIds: [11, 12],
			createProperties: { windowId: 5 },
		});
		expect(result).toEqual({ windows: 1, tabs: 3 });
	});

	it('falls back to asking Chrome for the new window tabs when create does not return them', async () => {
		mockChrome.windows.create.mockResolvedValue({ id: 77 });
		mockChrome.tabs.query.mockResolvedValue([
			{ id: 3, index: 2 },
			{ id: 1, index: 0 },
			{ id: 2, index: 1 },
		]);

		await _restoreSession(saved, 'new-window');

		expect(mockChrome.tabs.update).toHaveBeenCalledWith(1, { pinned: true });
		expect(mockChrome.tabs.group).toHaveBeenCalledWith({
			tabIds: [2, 3],
			createProperties: { windowId: 77 },
		});
	});
});
