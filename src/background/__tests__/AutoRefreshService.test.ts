import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoRefreshService } from '../AutoRefreshService';
import { _getDefaultRule, _getDefaultTabModifierSettings } from '../../common/storage';
import { _getDefaultAutoRefresh } from '../../common/autoRefresh';
import { TabModifierSettings } from '../../common/types';

const mockChrome = {
	alarms: {
		create: vi.fn(),
		clear: vi.fn(),
		getAll: vi.fn(),
	},
	tabs: {
		get: vi.fn(),
		query: vi.fn(),
		reload: vi.fn(),
		sendMessage: vi.fn(),
	},
	windows: {
		get: vi.fn(),
	},
};

(globalThis as any).chrome = mockChrome;

function makeConfig(autoRefresh: Record<string, unknown> | null): TabModifierSettings {
	const config = _getDefaultTabModifierSettings();
	const rule = _getDefaultRule('Dashboard', '', 'dashboard.example.com');
	if (autoRefresh) {
		rule.tab.auto_refresh = { ..._getDefaultAutoRefresh(), enabled: true, ...autoRefresh };
	}
	config.rules = [rule];
	return config;
}

const dashboardTab = {
	id: 7,
	windowId: 1,
	url: 'https://dashboard.example.com/',
	active: false,
	audible: false,
	discarded: false,
	status: 'complete',
} as chrome.tabs.Tab;

describe('AutoRefreshService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockChrome.alarms.getAll.mockResolvedValue([]);
		mockChrome.tabs.sendMessage.mockResolvedValue({ editing: false });
		mockChrome.windows.get.mockResolvedValue({ focused: false });
	});

	it('schedules an alarm when a matching page finishes loading', async () => {
		const config = makeConfig({ interval_seconds: 120 });
		const service = new AutoRefreshService(async () => config);

		await service.onTabUpdated(dashboardTab, config.rules[0], { status: 'complete' });

		expect(mockChrome.alarms.create).toHaveBeenCalledWith('tab-automator-auto-refresh:7', {
			delayInMinutes: 2,
		});
	});

	it('clears the alarm when the tab no longer matches a refreshing rule', async () => {
		const config = makeConfig(null);
		const service = new AutoRefreshService(async () => config);

		await service.onTabUpdated(dashboardTab, config.rules[0], { status: 'complete' });

		expect(mockChrome.alarms.create).not.toHaveBeenCalled();
		expect(mockChrome.alarms.clear).toHaveBeenCalledWith('tab-automator-auto-refresh:7');
	});

	it('reloads the tab when the alarm fires and nothing blocks it', async () => {
		const config = makeConfig({ bypass_cache: true });
		const service = new AutoRefreshService(async () => config);
		mockChrome.tabs.get.mockResolvedValue(dashboardTab);

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).toHaveBeenCalledWith(7, { bypassCache: true });
	});

	it('postpones by 30 seconds while the tab is active and the rule wants inactive tabs only', async () => {
		const config = makeConfig({ only_when_tab_inactive: true });
		const service = new AutoRefreshService(async () => config);
		mockChrome.tabs.get.mockResolvedValue({ ...dashboardTab, active: true });

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
		expect(mockChrome.alarms.create).toHaveBeenCalledWith('tab-automator-auto-refresh:7', {
			delayInMinutes: 0.5,
		});
	});

	it('postpones while the window is focused when the rule asks for unfocused windows', async () => {
		const config = makeConfig({ only_when_window_unfocused: true });
		const service = new AutoRefreshService(async () => config);
		mockChrome.tabs.get.mockResolvedValue(dashboardTab);
		mockChrome.windows.get.mockResolvedValue({ focused: true });

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
	});

	it('postpones when the page reports typed input', async () => {
		const config = makeConfig({});
		const service = new AutoRefreshService(async () => config);
		mockChrome.tabs.get.mockResolvedValue(dashboardTab);
		mockChrome.tabs.sendMessage.mockResolvedValue({ editing: true });

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
	});

	it('treats a page without the content script as having no typed input', async () => {
		const config = makeConfig({});
		const service = new AutoRefreshService(async () => config);
		mockChrome.tabs.get.mockResolvedValue(dashboardTab);
		mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).toHaveBeenCalled();
	});

	it('does nothing when the rule was turned off after the alarm was set', async () => {
		const config = makeConfig(null);
		const service = new AutoRefreshService(async () => config);
		mockChrome.tabs.get.mockResolvedValue(dashboardTab);

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
		expect(mockChrome.alarms.create).not.toHaveBeenCalled();
	});

	it('does nothing when the tab was closed', async () => {
		const service = new AutoRefreshService(async () => makeConfig({}));
		mockChrome.tabs.get.mockRejectedValue(new Error('No tab with id: 7'));

		await service.handleAlarm({ name: 'tab-automator-auto-refresh:7' } as chrome.alarms.Alarm);

		expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
	});

	describe('syncAllTabs', () => {
		it('skips the tab scan entirely when no rule uses auto-refresh', async () => {
			const service = new AutoRefreshService(async () => makeConfig(null));

			await service.syncAllTabs();

			expect(mockChrome.tabs.query).not.toHaveBeenCalled();
		});

		it('adds missing alarms and removes stale ones', async () => {
			const service = new AutoRefreshService(async () => makeConfig({ interval_seconds: 60 }));
			mockChrome.tabs.query.mockResolvedValue([
				dashboardTab,
				{ ...dashboardTab, id: 8, url: 'https://other.example.com/' },
			]);
			mockChrome.alarms.getAll.mockResolvedValue([
				{ name: 'tab-automator-auto-refresh:8', scheduledTime: Date.now() + 1000 },
				{ name: 'tabee-auto-close-checker', scheduledTime: Date.now() + 1000 },
			]);

			await service.syncAllTabs();

			expect(mockChrome.alarms.create).toHaveBeenCalledWith('tab-automator-auto-refresh:7', {
				delayInMinutes: 1,
			});
			expect(mockChrome.alarms.clear).toHaveBeenCalledWith('tab-automator-auto-refresh:8');
			expect(mockChrome.alarms.clear).not.toHaveBeenCalledWith('tabee-auto-close-checker');
		});

		it('keeps an existing alarm that is within the interval', async () => {
			const service = new AutoRefreshService(async () => makeConfig({ interval_seconds: 600 }));
			mockChrome.tabs.query.mockResolvedValue([dashboardTab]);
			mockChrome.alarms.getAll.mockResolvedValue([
				{ name: 'tab-automator-auto-refresh:7', scheduledTime: Date.now() + 60_000 },
			]);

			await service.syncAllTabs();

			expect(mockChrome.alarms.create).not.toHaveBeenCalled();
			expect(mockChrome.alarms.clear).not.toHaveBeenCalled();
		});

		it('respects lightweight mode exclusions', async () => {
			const config = makeConfig({});
			config.settings.lightweight_mode_enabled = true;
			config.settings.lightweight_mode_patterns = [
				{ id: 'p', pattern: 'dashboard.example.com', type: 'domain', enabled: true },
			];
			const service = new AutoRefreshService(async () => config);
			mockChrome.tabs.query.mockResolvedValue([dashboardTab]);

			await service.syncAllTabs();

			expect(mockChrome.alarms.create).not.toHaveBeenCalled();
		});
	});
});
