<template>
	<div class="container mx-auto max-w-5xl p-4">
		<div class="card bg-base-200 mb-4">
			<div class="card-body">
				<h2 class="card-title">Presenting or demoing?</h2>
				<p class="text-sm opacity-80">
					Put the tabs you want to show in a tab group, then move that group to a new window. Your
					audience only sees those tabs, and everything else stays in your other window. Press
					Alt+Shift+M on any tab to move its group (or just the tab, if it isn't in a group) to a
					new window.
				</p>
			</div>
		</div>

		<div class="card bg-base-200">
			<div class="card-body">
				<div class="flex items-center justify-between">
					<h2 class="card-title">Workspaces</h2>
					<RefreshButton @on-refresh-click="refresh" />
				</div>

				<p v-if="loaded && workspaces.length === 0" class="text-sm opacity-80">
					No tab groups are open. Right-click a tab and choose Add tab to new group, or give a rule
					a group so the tabs it matches gather together by themselves.
				</p>

				<div v-else class="overflow-x-auto">
					<table class="table">
						<thead>
							<tr>
								<th scope="col">Group</th>
								<th scope="col">Tabs</th>
								<th scope="col">Where</th>
								<th scope="col" class="text-right">Actions</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="workspace in workspaces" :key="workspace.id">
								<td>
									<div class="flex items-center gap-2">
										<ColorVisualizer :color="_chromeGroupColor(workspace.color)" />
										{{ workspace.title }}
									</div>
								</td>
								<td>{{ workspace.tabCount }}</td>
								<td>
									{{ workspace.windowId === currentWindowId ? 'This window' : 'Another window' }}
								</td>
								<td>
									<div class="flex justify-end items-center gap-2 flex-wrap">
										<button class="btn btn-xs btn-primary" @click="moveToNewWindow(workspace)">
											New window
										</button>
										<select
											class="select select-xs select-bordered max-w-40"
											aria-label="Move to another window"
											:disabled="(targetWindows[workspace.id] ?? []).length === 0"
											@change="(event) => moveToWindow(workspace, event)"
										>
											<option value="" selected disabled>Move to…</option>
											<option
												v-for="target in targetWindows[workspace.id] ?? []"
												:key="target.id"
												:value="target.id"
											>
												{{ target.label }}
											</option>
										</select>
										<button class="btn btn-xs btn-outline" @click="saveAsSession(workspace)">
											Save as session
										</button>
										<button class="btn btn-xs btn-outline btn-error" @click="closeTabs(workspace)">
											Close tabs
										</button>
									</div>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { inject, onMounted, onUnmounted, ref } from 'vue';
import RefreshButton from '../../../global/RefreshButton.vue';
import ColorVisualizer from './TabGroups/ColorVisualizer.vue';
import { GLOBAL_EVENTS } from '../../../../common/types.ts';
import { _chromeGroupColor } from '../../../../common/helpers.ts';
import {
	_closeWorkspace,
	_listTargetWindows,
	_listWorkspaces,
	_moveWorkspaceToNewWindow,
	_moveWorkspaceToWindow,
	TargetWindow,
	Workspace,
} from '../../../../common/workspaces.ts';
import { _addSession, _captureSession } from '../../../../common/sessions.ts';

const emitter: any = inject('emitter');

const workspaces = ref<Workspace[]>([]);
const targetWindows = ref<Record<number, TargetWindow[]>>({});
const currentWindowId = ref<number | undefined>();
const loaded = ref(false);

const toast = (type: 'success' | 'error' | 'info', message: string) => {
	emitter.emit(GLOBAL_EVENTS.SHOW_TOAST, { type, message });
};

const refresh = async () => {
	currentWindowId.value = (await chrome.windows.getCurrent()).id;
	workspaces.value = await _listWorkspaces();

	const targets: Record<number, TargetWindow[]> = {};
	for (const workspace of workspaces.value) {
		targets[workspace.id] = await _listTargetWindows(workspace.windowId);
	}
	targetWindows.value = targets;
	loaded.value = true;
};

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const refreshSoon = () => {
	clearTimeout(refreshTimer);
	refreshTimer = setTimeout(() => void refresh(), 250);
};

const run = async (action: () => Promise<void>, failure: string) => {
	try {
		await action();
	} catch (error) {
		console.error(failure, error);
		toast('error', failure);
	}
	await refresh();
};

const moveToNewWindow = (workspace: Workspace) =>
	run(async () => {
		await _moveWorkspaceToNewWindow(workspace.id);
		toast('success', `Moved "${workspace.title}" to a new window.`);
	}, 'Could not move that group to a new window.');

const moveToWindow = (workspace: Workspace, event: Event) => {
	const select = event.target as HTMLSelectElement;
	const windowId = Number(select.value);
	select.value = '';

	return run(async () => {
		await _moveWorkspaceToWindow(workspace.id, windowId);
		toast('success', `Moved "${workspace.title}".`);
	}, 'Could not move that group to the other window.');
};

const saveAsSession = (workspace: Workspace) =>
	run(async () => {
		const session = await _captureSession(workspace.title, { groupId: workspace.id });

		if (session.tab_count === 0) {
			toast('info', 'Nothing to save: only web pages (http and https) can be saved.');
			return;
		}

		await _addSession(session);
		toast(
			'success',
			`Saved "${session.name}" with ${session.tab_count} tabs. Find it under Sessions.`
		);
	}, 'Could not save that group as a session.');

const closeTabs = (workspace: Workspace) => {
	if (!confirm(`Close all ${workspace.tabCount} tabs in "${workspace.title}"?`)) {
		return Promise.resolve();
	}

	return run(async () => {
		await _closeWorkspace(workspace.id);
	}, 'Could not close those tabs.');
};

onMounted(async () => {
	await refresh();

	chrome.tabGroups.onCreated.addListener(refreshSoon);
	chrome.tabGroups.onRemoved.addListener(refreshSoon);
	chrome.tabGroups.onUpdated.addListener(refreshSoon);
	chrome.tabGroups.onMoved.addListener(refreshSoon);
	chrome.tabs.onAttached.addListener(refreshSoon);
	chrome.tabs.onDetached.addListener(refreshSoon);
	chrome.tabs.onRemoved.addListener(refreshSoon);
});

onUnmounted(() => {
	clearTimeout(refreshTimer);
	chrome.tabGroups.onCreated.removeListener(refreshSoon);
	chrome.tabGroups.onRemoved.removeListener(refreshSoon);
	chrome.tabGroups.onUpdated.removeListener(refreshSoon);
	chrome.tabGroups.onMoved.removeListener(refreshSoon);
	chrome.tabs.onAttached.removeListener(refreshSoon);
	chrome.tabs.onDetached.removeListener(refreshSoon);
	chrome.tabs.onRemoved.removeListener(refreshSoon);
});
</script>
