<template>
	<div class="container mx-auto max-w-5xl p-4">
		<div class="card bg-base-200 mb-4">
			<div class="card-body">
				<h2 class="card-title">Save your tabs</h2>
				<p class="text-sm opacity-80">
					A session remembers the pages you have open (and their pinned state and groups) so you can
					bring them back later. Only web pages (http and https) are saved. Sessions stay on this
					computer and aren't included in backups or sync.
				</p>

				<input
					v-model="newName"
					type="text"
					class="input input-bordered input-sm w-full mt-2"
					placeholder="Name (optional), e.g. Quarterly review"
					@keydown.enter="save('window')"
				/>

				<div class="flex gap-2 mt-2">
					<button class="btn btn-sm btn-primary" @click="save('window')">Save this window</button>
					<button class="btn btn-sm btn-outline" @click="save('all')">Save all windows</button>
				</div>
			</div>
		</div>

		<div class="card bg-base-200">
			<div class="card-body">
				<h2 class="card-title">Saved sessions</h2>

				<p v-if="loaded && sessions.length === 0" class="text-sm opacity-80">
					Nothing saved yet. Save a window above, or save a single group from Workspaces.
				</p>

				<div v-for="session in sessions" :key="session.id" class="rounded-box bg-base-100 p-3 mt-2">
					<div class="flex items-center justify-between gap-2 flex-wrap">
						<div>
							<div class="font-bold">{{ session.name }}</div>
							<div class="text-xs opacity-70">
								{{ formatDate(session.created_at) }} · {{ session.tab_count }}
								{{ session.tab_count === 1 ? 'tab' : 'tabs' }} in {{ session.windows.length }}
								{{ session.windows.length === 1 ? 'window' : 'windows' }}
							</div>
						</div>

						<div class="flex gap-2 flex-wrap">
							<button class="btn btn-xs btn-primary" @click="restore(session, 'new-window')">
								Restore in new window
							</button>
							<button class="btn btn-xs btn-outline" @click="restore(session, 'current-window')">
								Restore here
							</button>
							<button class="btn btn-xs btn-outline" @click="rename(session)">Rename</button>
							<button class="btn btn-xs btn-outline btn-error" @click="remove(session)">
								Delete
							</button>
						</div>
					</div>

					<details class="mt-2 text-sm">
						<summary class="cursor-pointer opacity-80">Show tabs</summary>
						<ul class="mt-1 list-disc pl-5 opacity-80">
							<li v-for="(tab, index) in listedTabs(session)" :key="index">{{ tab.title }}</li>
						</ul>
					</details>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { inject, onMounted, ref } from 'vue';
import { GLOBAL_EVENTS } from '../../../../common/types.ts';
import {
	_addSession,
	_captureSession,
	_deleteSession,
	_loadSessions,
	_renameSession,
	_restoreSession,
	RestoreTarget,
	Session,
	SessionTab,
} from '../../../../common/sessions.ts';

const emitter: any = inject('emitter');

const sessions = ref<Session[]>([]);
const newName = ref('');
const loaded = ref(false);

const toast = (type: 'success' | 'error' | 'info', message: string) => {
	emitter.emit(GLOBAL_EVENTS.SHOW_TOAST, { type, message });
};

const refresh = async () => {
	sessions.value = await _loadSessions();
	loaded.value = true;
};

const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString();

const listedTabs = (session: Session): SessionTab[] =>
	session.windows.flatMap((win) => win.tabs).slice(0, 100);

const save = async (scope: 'window' | 'all') => {
	try {
		const captured = await _captureSession(
			newName.value,
			scope === 'all' ? 'all' : { windowId: (await chrome.windows.getCurrent()).id as number }
		);

		if (captured.tab_count === 0) {
			toast('info', 'Nothing to save: only web pages (http and https) can be saved.');
			return;
		}

		await _addSession(captured);
		newName.value = '';
		toast('success', `Saved "${captured.name}" with ${captured.tab_count} tabs.`);
		await refresh();
	} catch (error) {
		console.error('Failed to save session:', error);
		toast('error', 'Could not save the session.');
	}
};

const restore = async (session: Session, target: RestoreTarget) => {
	try {
		const result = await _restoreSession(session, target);
		toast('success', `Restored ${result.tabs} tabs from "${session.name}".`);
	} catch (error) {
		console.error('Failed to restore session:', error);
		toast('error', 'Could not restore the session.');
	}
};

const rename = async (session: Session) => {
	const name = prompt('Rename session', session.name);

	if (name === null) return;

	await _renameSession(session.id, name);
	await refresh();
};

const remove = async (session: Session) => {
	if (!confirm(`Delete the session "${session.name}"?`)) return;

	await _deleteSession(session.id);
	await refresh();
};

onMounted(refresh);
</script>
