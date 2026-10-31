<template>
	<div class="collapse collapse-arrow bg-base-200 mb-4">
		<input v-model="isOpen" type="checkbox" aria-label="Show rule check" />
		<div class="collapse-title font-bold">
			Check rules
			<span v-if="isOpen && report && problemCount > 0" class="badge badge-warning badge-sm ml-2">
				{{ problemCount }}
			</span>
		</div>
		<div class="collapse-content text-sm">
			<p class="text-base-content/70 mb-3">
				Finds rules that never apply, or only sometimes, because a rule above them takes their pages
				first. Like a firewall, the more specific rule should be on top. Checked with examples made
				from your rules plus your open tabs and bookmarks.
			</p>

			<div v-if="undoOrder" class="alert alert-success py-2 mb-3">
				<span>Rules reordered: the more specific rules are now on top.</span>
				<button class="btn btn-xs" @click="undo">Undo</button>
			</div>

			<template v-if="report">
				<p v-if="problemCount === 0 && !report.suggestedOrder" class="text-success">
					✅ All clear. Every rule gets the pages you'd expect.
				</p>

				<div
					v-if="report.suggestedOrder"
					class="rounded-box border border-primary bg-base-100 p-3 mb-3"
				>
					<p class="font-bold">Suggested fix: put the specific rules on top</p>
					<ul class="list-disc ml-5 my-2">
						<li v-for="move in report.moves" :key="move.rule.id">
							Move <b>{{ move.rule.name }}</b> from #{{ move.from + 1 }} to #{{ move.to + 1 }},
							above
							<b>{{ move.above.name }}</b>
						</li>
					</ul>
					<p class="text-base-content/70 mb-2">
						Pages those rules share go to the more specific rule. Nothing else changes hands. You
						can undo it right after.
					</p>
					<button class="btn btn-sm btn-primary" @click="applyOrder">Reorder rules</button>
				</div>

				<div class="flex flex-col gap-2">
					<div
						v-for="(finding, i) in report.findings"
						:key="finding.kind + finding.rule.id + i"
						class="rounded-box border border-base-300 p-3"
					>
						<template v-if="finding.kind === 'hidden'">
							<p>
								⚠️ <b>#{{ position(finding.rule) }} {{ finding.rule.name }}</b>
								{{ finding.certain ? 'never applies' : 'probably never applies' }}.
								<template v-if="finding.duplicate">
									It covers the same pages as <b>{{ finding.takenBy[0].name }}</b> above it, so one
									of them can go. Merge their settings, then delete or turn off one.
								</template>
								<template v-else>
									{{ joinNames(finding.takenBy) }} above it
									{{ finding.takenBy.length > 1 ? 'take' : 'takes' }} all of its pages first.
									<span v-if="isMoved(finding.rule)">The suggested fix moves it up.</span>
								</template>
							</p>
						</template>

						<template v-else-if="finding.kind === 'partly-hidden'">
							<p>
								↪️ Some pages of <b>#{{ position(finding.rule) }} {{ finding.rule.name }}</b> go to
								<b>#{{ position(finding.takenBy) }} {{ finding.takenBy.name }}</b> instead, because
								it is higher up. If that's not what you want, drag
								<b>{{ finding.rule.name }}</b> above it.
							</p>
							<ul class="mt-1 text-base-content/70">
								<li v-for="url in finding.examples" :key="url" class="break-all">
									<code>{{ url }}</code>
								</li>
							</ul>
						</template>

						<template v-else-if="finding.kind === 'blocked-regex'">
							<p>
								⛔ <b>#{{ position(finding.rule) }} {{ finding.rule.name }}</b> never applies: its
								Regex is blocked because it could freeze the browser (or isn't valid). Simplify it,
								for example by removing a repeat inside a repeat like <code>(a+)+</code>.
							</p>
						</template>

						<template v-else>
							<p class="text-base-content/70">
								❔ <b>#{{ position(finding.rule) }} {{ finding.rule.name }}</b> couldn't be checked:
								its Regex uses features this check doesn't understand, and none of your open tabs or
								bookmarks match it.
							</p>
						</template>
					</div>

					<div
						v-for="pair in report.cantReorder"
						:key="'cant' + pair.specific.id + pair.general.id"
						class="rounded-box border border-base-300 p-3"
					>
						<p>
							✋ <b>{{ pair.specific.name }}</b> is more specific than <b>{{ pair.general.name }}</b
							>, but moving it above would also change which rule gets pages shared with another
							rule in between, so it's left for you to sort out.
						</p>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRulesStore } from '../../../../../stores/rules.store.ts';
import type { Rule } from '../../../../../common/types.ts';
import { _checkRules, RuleCheckReport } from '../../../../../common/ruleCheck.ts';

const rulesStore = useRulesStore();

const isOpen = ref(false);
const realUrls = ref<string[]>([]);
// Rule ids in the order before the last reorder, for Undo.
const undoOrder = ref<string[] | null>(null);

// Only worked out while the panel is open.
const report = computed<RuleCheckReport | null>(() =>
	isOpen.value ? _checkRules(rulesStore.rules, realUrls.value) : null
);

const problemCount = computed(
	() => (report.value?.findings.length ?? 0) + (report.value?.cantReorder.length ?? 0)
);

const position = (rule: Rule) => rulesStore.rules.findIndex((r) => r.id === rule.id) + 1;
const isMoved = (rule: Rule) => !!report.value?.moves.some((m) => m.rule.id === rule.id);
const joinNames = (rules: Rule[]) => rules.map((r) => `'${r.name}'`).join(', ');

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;
const flatten = (nodes: BookmarkNode[], out: string[]) => {
	for (const node of nodes) {
		if (node.url) out.push(node.url);
		if (node.children) flatten(node.children, out);
	}
	return out;
};

async function loadRealUrls() {
	const urls = new Set<string>();
	try {
		for (const tab of await chrome.tabs.query({})) if (tab.url) urls.add(tab.url);
	} catch {
		// Without tabs the check still works from the rules alone.
	}
	try {
		for (const url of flatten(await chrome.bookmarks.getTree(), [])) urls.add(url);
	} catch {
		// Same for bookmarks.
	}
	realUrls.value = [...urls].filter((url) => /^(https?|file):/.test(url)).slice(0, 5000);
}

watch(isOpen, (open) => {
	if (open) void loadRealUrls();
});

async function applyOrder() {
	const order = report.value?.suggestedOrder;
	if (!order) return;
	undoOrder.value = rulesStore.rules.map((r) => r.id);
	rulesStore.rules = [...order];
	await rulesStore.save();
}

async function undo() {
	if (!undoOrder.value) return;
	// Put the rules back in their old order, keeping any edits made since. New rules stay last.
	const oldIndex = new Map(undoOrder.value.map((id, i) => [id, i]));
	const rank = (rule: Rule) => oldIndex.get(rule.id) ?? Number.MAX_SAFE_INTEGER;
	rulesStore.rules = [...rulesStore.rules].sort((a, b) => rank(a) - rank(b));
	undoOrder.value = null;
	await rulesStore.save();
}
</script>
