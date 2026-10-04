<template>
	<dialog ref="dialog" class="modal">
		<div class="modal-box w-11/12 max-w-2xl">
			<template v-if="mode === 'export'">
				<h3 class="font-bold text-lg">Export rules</h3>
				<p class="text-sm text-base-content/70">
					Choose the rules to put in a file you can share. Groups they use come along.
				</p>

				<input
					v-model="packName"
					type="text"
					class="input input-bordered input-sm w-full mt-4"
					placeholder="Name for this pack (optional), e.g. Dev, staging and prod badges"
				/>

				<div class="flex items-center justify-between mt-4 mb-1 text-sm">
					<span>{{ selectedExportIds.length }} of {{ rulesStore.rules.length }} selected</span>
					<span class="flex gap-2">
						<button class="btn btn-xs btn-ghost" @click="selectAllExport">All</button>
						<button class="btn btn-xs btn-ghost" @click="selectedExportIds = []">None</button>
					</span>
				</div>

				<ul class="max-h-72 overflow-y-auto flex flex-col gap-1">
					<li v-for="rule in rulesStore.rules" :key="rule.id">
						<label class="label cursor-pointer justify-start gap-3 py-1">
							<input
								v-model="selectedExportIds"
								type="checkbox"
								class="checkbox checkbox-sm checkbox-primary"
								:value="rule.id"
							/>
							<span class="label-text">{{ rule.name }}</span>
						</label>
					</li>
				</ul>

				<div class="modal-action">
					<form method="dialog">
						<button class="btn btn-xs">Close</button>
					</form>
					<button
						class="btn btn-xs btn-outline btn-primary"
						:disabled="selectedExportIds.length === 0"
						@click="exportPack"
					>
						Export {{ selectedExportIds.length }}
						{{ selectedExportIds.length === 1 ? 'rule' : 'rules' }}
					</button>
				</div>
			</template>

			<template v-else>
				<h3 class="font-bold text-lg">Import rules</h3>
				<p class="text-sm text-base-content/70">
					Add rules from a file someone shared with you. They go after your existing rules, so they
					never take priority over what you already have. Only import files you trust: rules can
					rename tabs, close duplicate tabs and block closing them.
				</p>

				<input
					ref="fileInput"
					type="file"
					accept=".json,application/json"
					class="file-input file-input-xs file-input-bordered w-full mt-4"
					@change="onFileChosen"
				/>

				<template v-if="parsed">
					<div class="flex items-center justify-between mt-4 mb-1 text-sm">
						<span>
							{{ selectedImportIndexes.length }} of {{ importableRules.length }} selected
							<template v-if="invalidCount > 0"> ({{ invalidCount }} unreadable skipped)</template>
						</span>
						<span class="flex gap-2">
							<button class="btn btn-xs btn-ghost" @click="selectAllImport">All</button>
							<button class="btn btn-xs btn-ghost" @click="selectedImportIndexes = []">None</button>
						</span>
					</div>

					<ul class="max-h-72 overflow-y-auto flex flex-col gap-1">
						<li v-for="(rule, index) in importableRules" :key="index">
							<label class="label cursor-pointer justify-start gap-3 py-1">
								<input
									v-model="selectedImportIndexes"
									type="checkbox"
									class="checkbox checkbox-sm checkbox-primary"
									:value="index"
								/>
								<span class="label-text">
									{{ rule.name }}
									<span class="text-base-content/60"
										>({{ rule.detection }}: {{ rule.url_fragment }})</span
									>
								</span>
							</label>
						</li>
					</ul>
				</template>

				<div class="modal-action">
					<form method="dialog">
						<button class="btn btn-xs">Close</button>
					</form>
					<button
						class="btn btn-xs btn-outline btn-primary"
						:disabled="selectedImportIndexes.length === 0"
						@click="importPack"
					>
						Add {{ selectedImportIndexes.length }}
						{{ selectedImportIndexes.length === 1 ? 'rule' : 'rules' }}
					</button>
				</div>
			</template>
		</div>
	</dialog>
</template>

<script lang="ts" setup>
import { computed, inject, ref } from 'vue';
import { useRulesStore } from '../../../../../stores/rules.store.ts';
import { GLOBAL_EVENTS, Group, Rule } from '../../../../../common/types.ts';
import { _isValidRule, _parseRulePack } from '../../../../../common/rulePack.ts';
import { _downloadTextFile } from '../../../../../common/download.ts';
import { _formatBackupTimestamp } from '../../../../../common/autoBackup.ts';

const rulesStore = useRulesStore();
const emitter: any = inject('emitter');

const dialog = ref<HTMLDialogElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const mode = ref<'export' | 'import'>('export');

const packName = ref('');
const selectedExportIds = ref<string[]>([]);

const parsed = ref<{ rules: Rule[]; groups: Group[] } | null>(null);
const selectedImportIndexes = ref<number[]>([]);

const importableRules = computed(() => (parsed.value?.rules ?? []).filter(_isValidRule));
const invalidCount = computed(
	() => (parsed.value?.rules.length ?? 0) - importableRules.value.length
);

const toast = (type: 'success' | 'error', message: string) => {
	emitter.emit(GLOBAL_EVENTS.SHOW_TOAST, { type, message });
};

const selectAllExport = () => {
	selectedExportIds.value = rulesStore.rules.map((rule) => rule.id);
};

const selectAllImport = () => {
	selectedImportIndexes.value = importableRules.value.map((_, index) => index);
};

const open = (nextMode: 'export' | 'import') => {
	mode.value = nextMode;
	packName.value = '';
	parsed.value = null;
	selectedImportIndexes.value = [];

	if (fileInput.value) {
		fileInput.value.value = '';
	}

	if (nextMode === 'export') {
		selectAllExport();
	}

	dialog.value?.showModal();
};

const exportPack = () => {
	const name = packName.value.trim();
	const pack = rulesStore.buildRulePack(selectedExportIds.value, name || undefined);
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	const label = slug || _formatBackupTimestamp(new Date());

	_downloadTextFile(`tab_automator_rules_${label}.json`, JSON.stringify(pack, null, 4));
	toast('success', `Exported ${pack.rules.length} ${pack.rules.length === 1 ? 'rule' : 'rules'}.`);
	dialog.value?.close();
};

const onFileChosen = async (event: Event) => {
	const file = (event.target as HTMLInputElement).files?.[0];
	parsed.value = null;
	selectedImportIndexes.value = [];

	if (!file) return;

	try {
		const result = _parseRulePack(JSON.parse(await file.text()));

		if (!result) {
			toast('error', "That file doesn't look like a Tab Automator rules file.");
			return;
		}

		parsed.value = result;
		selectAllImport();
	} catch {
		toast('error', 'Failed to read the file: it is not valid JSON.');
	}
};

const importPack = async () => {
	if (!parsed.value) return;

	const chosen = new Set(selectedImportIndexes.value);
	const rules = importableRules.value.filter((_, index) => chosen.has(index));

	try {
		const result = await rulesStore.addImportedRules({ rules, groups: parsed.value.groups });

		toast(
			'success',
			`Added ${result.rules} ${result.rules === 1 ? 'rule' : 'rules'} at the end of your list. Drag to reorder.`
		);
		dialog.value?.close();
	} catch (error) {
		console.error('Failed to import rules:', error);
		toast('error', 'Failed to import rules.');
	}
};

defineExpose({ open });
</script>
