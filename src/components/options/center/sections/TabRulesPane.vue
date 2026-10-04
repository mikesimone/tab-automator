<template>
	<div>
		<div class="container mx-auto max-w-5xl px-4 pt-4 flex items-center justify-between gap-2">
			<div class="flex gap-2">
				<button class="btn btn-xs btn-outline" @click="rulePackModal?.open('import')">
					Import rules
				</button>
				<button
					v-if="rulesStore.rules.length > 0"
					class="btn btn-xs btn-outline"
					@click="rulePackModal?.open('export')"
				>
					Export rules
				</button>
			</div>

			<label
				v-if="rulesStore.rules.length > 0"
				class="label cursor-pointer gap-2 tooltip tooltip-left"
				data-tip="Stops every rule from applying until you resume. Shortcut: Alt+Shift+P"
			>
				<span class="label-text text-xs">Pause all rules</span>
				<input
					type="checkbox"
					class="toggle toggle-xs toggle-primary"
					:checked="paused"
					@change="(event) => setPaused((event.target as HTMLInputElement).checked)"
				/>
			</label>
		</div>

		<div v-if="paused && rulesStore.rules.length > 0" class="container mx-auto max-w-5xl px-4 pt-2">
			<div class="alert alert-warning text-sm py-2">
				<span>
					Rules are paused: nothing is renamed, grouped, pinned or refreshed. Tabs you already
					changed keep their look until they reload.
				</span>
				<button class="btn btn-xs" @click="setPaused(false)">Resume</button>
			</div>
		</div>

		<EmptyRules v-if="rulesStore.rules.length === 0" />

		<div v-else class="container mx-auto max-w-5xl p-4">
			<RuleTester />

			<div class="card bg-base-200">
				<div class="card-body">
					<!-- Show message when search has no results -->
					<div
						v-if="rulesStore.filteredRules.length === 0 && rulesStore.searchQuery"
						class="text-center py-8 text-base-content/60"
					>
						<p>No rules found matching "{{ rulesStore.searchQuery }}"</p>
					</div>
					<TableRules v-else :rules="rulesStore.filteredRules" :groups="rulesStore.groups" />
				</div>
			</div>

			<Disclaimer :tips="rulesTips" />
		</div>

		<RulePackModal ref="rulePackModal" />

		<dialog ref="addRuleModal" class="modal">
			<div class="modal-box w-11/12 max-w-4xl">
				<RuleForm v-if="isRuleFormModalOpened" @on-save="refreshRules" />
			</div>
		</dialog>
	</div>
</template>

<script lang="ts" setup>
import { useRulesStore } from '../../../../stores/rules.store.ts';
import EmptyRules from './TabRules/EmptyRules.vue';
import { inject, onMounted, onUnmounted, ref } from 'vue';
import TableRules from './TabRules/TableRules.vue';
import { GLOBAL_EVENTS, RuleModalParams } from '../../../../common/types.ts';
import RuleForm from './TabRules/RuleForm.vue';
import Disclaimer from '../../../global/Disclaimer.vue';
import RuleTester from './TabRules/RuleTester.vue';
import RulePackModal from './TabRules/RulePackModal.vue';
import { usePaused } from '../../../../common/usePaused.ts';

const rulesStore = useRulesStore();
rulesStore.init();

const { paused, setPaused } = usePaused();
const rulePackModal = ref<InstanceType<typeof RulePackModal> | null>(null);

const addRuleModal = ref<HTMLDialogElement | null>(null);
const isRuleFormModalOpened = ref(false);

const emitter: any = inject('emitter');

const refreshRules = async () => {
	await rulesStore.init();
};

const rulesTips = [
	{
		id: 1,
		icon: '💡',
		text: 'You can backup and import your rules in',
		linkText: 'Settings',
		action: 'navigate-settings',
	},
	{
		id: 2,
		icon: '🎯',
		text: 'Rules are applied in order - drag to reorder them',
	},
	{
		id: 3,
		icon: '⚡',
		text: 'Use RegEx detection for advanced URL matching',
	},
	{
		id: 4,
		icon: '🔍',
		text: 'Right-click any page to quickly rename its tab',
	},
];

onMounted(() => {
	emitter.on(GLOBAL_EVENTS.OPEN_ADD_RULE_MODAL, openAddRuleModal);
	emitter.on(GLOBAL_EVENTS.CLOSE_ADD_RULE_MODAL, closeAddRuleModal);

	if (!addRuleModal.value) {
		return;
	}

	addRuleModal.value.addEventListener('close', () => {
		closeAddRuleModal();
	});
});

onUnmounted(() => {
	emitter.off(GLOBAL_EVENTS.OPEN_ADD_RULE_MODAL);
	emitter.off(GLOBAL_EVENTS.CLOSE_ADD_RULE_MODAL);
});

const openAddRuleModal = (params?: RuleModalParams) => {
	if (!addRuleModal.value) {
		return;
	}

	// Reset current rule
	rulesStore.setCurrentRule();

	if (params?.rule) {
		rulesStore.setCurrentRule(params.rule);
	}

	// mount RuleForm component
	isRuleFormModalOpened.value = true;

	addRuleModal.value.showModal();
};

const closeAddRuleModal = () => {
	isRuleFormModalOpened.value = false;

	if (!addRuleModal.value) {
		return;
	}

	addRuleModal.value.close();
};
</script>
<style scoped></style>
