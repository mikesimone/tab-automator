<template>
	<div class="divider text-xs opacity-70 my-3">Or add to an existing rule</div>

	<div class="flex flex-col gap-2">
		<select v-model="selectedRuleId" class="select select-xs select-bordered w-full">
			<option disabled value="">Choose a rule…</option>
			<option v-for="rule in rulesStore.rules" :key="rule.id" :value="rule.id">
				{{ rule.name }}{{ rule.is_enabled === false ? ' (off)' : '' }}
			</option>
		</select>

		<div class="flex flex-col gap-1">
			<label
				v-for="option in ADD_TO_RULE_SCOPES"
				:key="option.value"
				class="label cursor-pointer justify-start items-start gap-2 p-0"
			>
				<input v-model="scope" :value="option.value" class="radio radio-xs mt-0.5" type="radio" />
				<span class="flex flex-col">
					<span class="label-text text-xs">{{ option.label }}</span>
					<span class="text-[11px] opacity-60">{{ option.help }}</span>
				</span>
			</label>
		</div>

		<p v-if="readableTarget" class="text-xs opacity-80 break-all">
			For this page, that adds
			<code class="bg-base-200 px-1 rounded">{{ readableTarget }}</code>
		</p>

		<p v-if="selectedRule && !isRegexRule" class="text-xs opacity-80">
			“{{ selectedRule.name }}” doesn't use Regex yet, so it will be switched to Regex. It keeps
			matching the same pages it does now.
		</p>

		<p v-if="error" class="text-xs text-error">{{ error }}</p>

		<div class="flex justify-end">
			<button
				:disabled="!selectedRule || !readableTarget"
				class="btn btn-sm btn-outline btn-primary"
				@click="add"
			>
				Add to rule
			</button>
		</div>
	</div>
</template>
<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRulesStore } from '../stores/rules.store.ts';
import type { Rule } from '../common/types.ts';
import {
	ADD_TO_RULE_SCOPES,
	AddToRuleScope,
	RULE_SPLIT_LENGTH,
	_planAddToRule,
	_readableTargetForUrl,
} from '../common/addToRule.ts';

const props = defineProps<{ url: string }>();
const emit = defineEmits<{ added: [rule: Rule, message: string] }>();

const rulesStore = useRulesStore();

const LAST_RULE_KEY = 'tab_automator_add_to_rule_last_rule';
const LAST_SCOPE_KEY = 'tab_automator_add_to_rule_last_scope';

const readSaved = (key: string): string => {
	try {
		return localStorage.getItem(key) ?? '';
	} catch {
		return '';
	}
};

const save = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Remembering the last choice is only a convenience.
	}
};

const savedRuleId = readSaved(LAST_RULE_KEY);
const savedScope = readSaved(LAST_SCOPE_KEY) as AddToRuleScope;

const selectedRuleId = ref(rulesStore.rules.some((r) => r.id === savedRuleId) ? savedRuleId : '');
const scope = ref<AddToRuleScope>(
	ADD_TO_RULE_SCOPES.some((s) => s.value === savedScope) ? savedScope : 'host'
);
const error = ref('');

const selectedRule = computed(() => rulesStore.rules.find((r) => r.id === selectedRuleId.value));
const isRegexRule = computed(() => {
	const detection = selectedRule.value?.detection;
	return detection === 'REGEX' || detection === 'REGEXP';
});
const readableTarget = computed(() => _readableTargetForUrl(props.url, scope.value));

watch([selectedRuleId, scope], () => {
	error.value = '';
});

const add = async () => {
	// Reload first: the rules may have been edited elsewhere (Options page, another device) since
	// this panel opened, and saving a stale copy would undo those edits.
	await rulesStore.init();

	const plan = _planAddToRule(rulesStore.rules, selectedRuleId.value, props.url, scope.value);

	if (!plan.ok) {
		error.value = {
			no_host: "This page doesn't have a site name that can be added.",
			no_rule: 'That rule no longer exists.',
			already_there: `That's already in “${plan.ruleName}”.`,
			unsafe: "That address can't be added safely, so nothing was changed.",
		}[plan.reason];
		return;
	}

	let message: string;
	if (plan.kind === 'appended') {
		await rulesStore.updateRule(plan.rule);
		message = `Added this page to “${plan.rule.name}”.`;
	} else {
		const index = rulesStore.rules.findIndex((r) => r.id === plan.insertAfterId);
		rulesStore.rules.splice(index + 1, 0, plan.rule);
		await rulesStore.save();
		message = `“${plan.fullRuleName}” is full (over ${RULE_SPLIT_LENGTH.toLocaleString('en-US')} characters), so this page went into a new rule, “${plan.rule.name}”, right below it with the same settings.`;
	}

	save(LAST_RULE_KEY, selectedRuleId.value);
	save(LAST_SCOPE_KEY, scope.value);

	emit('added', plan.rule, message);
};
</script>
