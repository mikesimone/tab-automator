import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WindowRoutingService } from '../WindowRoutingService';
import { _getDefaultRule } from '../../common/storage';
import { Rule } from '../../common/types';

const store: Record<string, unknown> = {};

const mockChrome = {
	windows: {
		get: vi.fn(),
		create: vi.fn(),
	},
	tabs: {
		query: vi.fn(),
		move: vi.fn(),
		get: vi.fn(),
	},
	storage: {
		session: {
			get: vi.fn(async (key: string) => ({ [key]: store[key] })),
			set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
		},
	},
};

const ownWindowRule = (id = 'r1'): Rule => {
	const rule = _getDefaultRule('Dash', '', 'dash.example.com');
	rule.id = id;
	rule.tab.dedicated_window = true;
	return rule;
};

const tab = (overrides: Partial<chrome.tabs.Tab> = {}) =>
	({ id: 1, windowId: 10, pinned: false, ...overrides }) as chrome.tabs.Tab;

describe('WindowRoutingService', () => {
	let service: WindowRoutingService;

	beforeEach(() => {
		vi.clearAllMocks();
		for (const key of Object.keys(store)) delete store[key];
		(globalThis as any).chrome = mockChrome;
		service = new WindowRoutingService();

		mockChrome.windows.get.mockImplementation(async (id: number) => ({ id, type: 'normal' }));
		mockChrome.windows.create.mockResolvedValue({ id: 99 });
		mockChrome.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);
		mockChrome.tabs.get.mockImplementation(async (id: number) => ({ id, windowId: 99 }));
	});

	it('leaves tabs alone when the rule has no own window', async () => {
		const rule = ownWindowRule();
		rule.tab.dedicated_window = false;

		const result = await service.routeTab(rule, tab());

		expect(result.windowId).toBe(10);
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
		expect(mockChrome.tabs.move).not.toHaveBeenCalled();
	});

	it('leaves tabs alone when no rule matched', async () => {
		await service.routeTab(undefined, tab());

		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});

	it('leaves pinned tabs and tabs outside normal windows alone', async () => {
		await service.routeTab(ownWindowRule(), tab({ pinned: true }));
		expect(mockChrome.windows.create).not.toHaveBeenCalled();

		mockChrome.windows.get.mockResolvedValue({ id: 10, type: 'popup' });
		await service.routeTab(ownWindowRule(), tab());
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});

	it('moves the first match into a new window and remembers it', async () => {
		const result = await service.routeTab(ownWindowRule(), tab());

		expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 1, focused: false });
		expect(result.windowId).toBe(99);
		expect(store['tab_automator_rule_windows']).toEqual({ r1: 99 });
	});

	it('adopts the window a lone matching tab is already in', async () => {
		mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);

		const result = await service.routeTab(ownWindowRule(), tab());

		expect(mockChrome.windows.create).not.toHaveBeenCalled();
		expect(result.windowId).toBe(10);
		expect(store['tab_automator_rule_windows']).toEqual({ r1: 10 });
	});

	it('moves later matches into the remembered window', async () => {
		store['tab_automator_rule_windows'] = { r1: 99 };
		mockChrome.tabs.get.mockResolvedValue({ id: 5, windowId: 99 });

		await service.routeTab(ownWindowRule(), tab({ id: 5, windowId: 10 }));

		expect(mockChrome.tabs.move).toHaveBeenCalledWith(5, { windowId: 99, index: -1 });
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});

	it('does nothing for a tab already in the rule window', async () => {
		store['tab_automator_rule_windows'] = { r1: 10 };

		await service.routeTab(ownWindowRule(), tab());

		expect(mockChrome.tabs.move).not.toHaveBeenCalled();
		expect(mockChrome.windows.create).not.toHaveBeenCalled();
	});

	it('starts a new window when the remembered one was closed', async () => {
		store['tab_automator_rule_windows'] = { r1: 55 };
		mockChrome.windows.get.mockImplementation(async (id: number) => {
			if (id === 55) throw new Error('No window with id: 55');
			return { id, type: 'normal' };
		});

		await service.routeTab(ownWindowRule(), tab());

		expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 1, focused: false });
		expect(store['tab_automator_rule_windows']).toEqual({ r1: 99 });
	});

	it('keeps different rules in different windows', async () => {
		store['tab_automator_rule_windows'] = { r1: 99 };

		await service.routeTab(ownWindowRule('r2'), tab({ id: 7 }));

		expect(mockChrome.windows.create).toHaveBeenCalledWith({ tabId: 7, focused: false });
		expect(store['tab_automator_rule_windows']).toEqual({ r1: 99, r2: 99 });
	});

	it('runs calls one at a time so two tabs cannot each create a window', async () => {
		let created = 0;
		mockChrome.windows.create.mockImplementation(async () => {
			created++;
			await new Promise((resolve) => setTimeout(resolve, 5));
			return { id: 99 };
		});
		mockChrome.tabs.get.mockResolvedValue({ id: 2, windowId: 99 });

		await Promise.all([
			service.routeTab(ownWindowRule(), tab({ id: 1 })),
			service.routeTab(ownWindowRule(), tab({ id: 2 })),
		]);

		expect(created).toBe(1);
		expect(mockChrome.tabs.move).toHaveBeenCalledWith(2, { windowId: 99, index: -1 });
	});

	it('returns the original tab when moving fails', async () => {
		mockChrome.windows.create.mockRejectedValue(new Error('boom'));
		const original = tab();

		expect(await service.routeTab(ownWindowRule(), original)).toBe(original);
	});
});
