<template>
	<div class="collapse collapse-arrow bg-base-200 mb-4">
		<input v-model="isOpen" type="checkbox" aria-label="Show URL tester" />
		<div class="collapse-title font-bold">Test a URL</div>
		<div class="collapse-content">
			<p class="text-sm text-base-content/70 mb-3">
				Paste a URL to see which rule would apply to it. Rules are checked from top to bottom and
				the first enabled match wins.
			</p>

			<input
				v-model="testUrl"
				type="text"
				class="input input-bordered input-sm w-full"
				placeholder="https://example.com/some/page"
				spellcheck="false"
			/>

			<div v-if="testUrl.trim()" class="mt-4 flex flex-col gap-2">
				<div v-if="paused" class="alert alert-warning text-sm py-2">
					Rules are paused, so none of these apply right now.
				</div>

				<div v-if="matches.length === 0" class="text-sm text-base-content/70">
					No rule matches this URL. The tab stays as it is.
				</div>

				<div
					v-for="result in matches"
					:key="result.rule.id"
					class="rounded-box border p-3 text-sm"
					:class="result.status === 'winner' ? 'border-primary bg-base-100' : 'border-base-300'"
				>
					<div class="flex items-center gap-2 flex-wrap">
						<span class="font-bold">#{{ result.position }} {{ result.rule.name }}</span>
						<span v-if="result.status === 'winner'" class="badge badge-primary badge-sm"
							>Applies</span
						>
						<span v-else-if="result.status === 'shadowed'" class="badge badge-ghost badge-sm"
							>Matches, but never reached</span
						>
						<span v-else class="badge badge-ghost badge-sm">Disabled</span>
					</div>

					<p class="text-base-content/70 mt-1">
						{{ result.rule.detection }}: <code>{{ result.rule.url_fragment }}</code>
					</p>

					<p v-if="result.status === 'shadowed' && outcome.winner" class="mt-1">
						The rule above ({{ outcome.winner.name }}) takes this URL first. Drag this rule above it
						to change that.
					</p>

					<ul v-if="result.status === 'winner'" class="mt-2 flex flex-wrap gap-1">
						<li
							v-for="effect in describeEffects(result.rule)"
							:key="effect"
							class="badge badge-outline"
						>
							{{ effect }}
						</li>
						<li v-if="describeEffects(result.rule).length === 0" class="text-base-content/70">
							This rule doesn't change anything yet.
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRulesStore } from '../../../../../stores/rules.store.ts';
import type { Rule } from '../../../../../common/types.ts';
import { _testUrlAgainstRules } from '../../../../../common/ruleMatching.ts';
import { usePaused } from '../../../../../common/usePaused.ts';

const rulesStore = useRulesStore();
const { paused } = usePaused();

const isOpen = ref(false);
const testUrl = ref('');

const outcome = computed(() => _testUrlAgainstRules(rulesStore.rules, testUrl.value.trim()));

const matches = computed(() =>
	outcome.value.results.filter((result) => result.status !== 'no-match')
);

const describeEffects = (rule: Rule): string[] => {
	const effects: string[] = [];
	const tab = rule.tab;

	if (tab.title) effects.push(`Title: ${tab.title}`);
	if (tab.icon) effects.push('Custom icon');
	if (tab.pinned) effects.push('Pinned');
	if (tab.muted) effects.push('Muted');
	if (tab.protected) effects.push('Protected from closing');
	if (tab.unique) effects.push('Unique tab');
	if (tab.auto_refresh?.enabled) effects.push('Auto-refresh');

	const group = rulesStore.groups.find((candidate) => candidate.id === tab.group_id);
	if (group) effects.push(`Group: ${group.title.split('​').join('')}`);

	return effects;
};
</script>
