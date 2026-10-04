import type { Group, Rule } from './types.ts';
import { _clone, _generateRandomId } from './helpers.ts';

export const RULE_PACK_FORMAT = 'tab-automator-rule-pack';

const INVISIBLE_CHAR = '​';

export type RulePack = {
	format: typeof RULE_PACK_FORMAT;
	version: 1;
	name?: string;
	exported_at?: string;
	rules: Rule[];
	groups: Group[];
};

export type RulePackImport = {
	rules: Rule[];
	groups: Group[];
	skipped: number;
};

const _stripInvisible = (title: string): string => title.split(INVISIBLE_CHAR).join('');

export function _isValidRule(value: any): value is Rule {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof value.name === 'string' &&
		typeof value.detection === 'string' &&
		typeof value.url_fragment === 'string' &&
		!!value.tab &&
		typeof value.tab === 'object'
	);
}

/** Builds a shareable pack from the chosen rules, carrying along only the groups they use. */
export function _buildRulePack(rules: Rule[], groups: Group[], name?: string): RulePack {
	const usedGroupIds = new Set(rules.map((rule) => rule.tab?.group_id).filter(Boolean));

	return {
		format: RULE_PACK_FORMAT,
		version: 1,
		...(name ? { name } : {}),
		exported_at: new Date().toISOString(),
		rules: _clone(rules),
		groups: _clone(groups.filter((group) => usedGroupIds.has(group.id))),
	};
}

/**
 * Accepts anything people are likely to share: a rule pack, a full config export, a single rule
 * (what "Copy to clipboard" produces) or a plain list of rules. Returns null when it is none of those.
 */
export function _parseRulePack(data: unknown): { rules: Rule[]; groups: Group[] } | null {
	if (Array.isArray(data)) {
		return { rules: data, groups: [] };
	}

	if (!data || typeof data !== 'object') {
		return null;
	}

	const record = data as Record<string, any>;

	if (Array.isArray(record.rules)) {
		return {
			rules: record.rules,
			groups: Array.isArray(record.groups) ? record.groups : [],
		};
	}

	if (_isValidRule(record)) {
		return { rules: [record], groups: [] };
	}

	return null;
}

/**
 * Turns parsed pack contents into rules and groups that are safe to add to an existing config:
 * every rule gets a fresh id, groups already present (same title and colour) are reused, and
 * anything malformed is skipped and counted.
 */
export function _prepareRulePackImport(
	parsed: { rules: Rule[]; groups: Group[] },
	existingGroups: Group[]
): RulePackImport {
	const groupIdMap = new Map<string, string>();
	const newGroups: Group[] = [];

	for (const group of parsed.groups) {
		if (!group || typeof group.id !== 'string' || typeof group.title !== 'string') {
			continue;
		}

		const title = _stripInvisible(group.title);
		const existing = existingGroups.find(
			(candidate) => _stripInvisible(candidate.title) === title && candidate.color === group.color
		);

		if (existing) {
			groupIdMap.set(group.id, existing.id);
			continue;
		}

		const created: Group = {
			id: _generateRandomId(),
			title: title + INVISIBLE_CHAR,
			color: group.color,
			collapsed: !!group.collapsed,
		};

		groupIdMap.set(group.id, created.id);
		newGroups.push(created);
	}

	const rules: Rule[] = [];
	let skipped = 0;

	for (const candidate of parsed.rules) {
		if (!_isValidRule(candidate)) {
			skipped++;
			continue;
		}

		const rule = _clone(candidate);
		rule.id = _generateRandomId();
		rule.is_enabled = rule.is_enabled !== false;

		const groupId = rule.tab.group_id;
		const knownGroup = groupId && existingGroups.some((group) => group.id === groupId);
		rule.tab.group_id = groupId ? (groupIdMap.get(groupId) ?? (knownGroup ? groupId : null)) : null;

		rules.push(rule);
	}

	const usedGroupIds = new Set(rules.map((rule) => rule.tab.group_id));

	return {
		rules,
		groups: newGroups.filter((group) => usedGroupIds.has(group.id)),
		skipped,
	};
}
