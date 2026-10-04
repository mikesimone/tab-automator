import { describe, expect, it } from 'vitest';
import {
	_buildRulePack,
	_parseRulePack,
	_prepareRulePackImport,
	RULE_PACK_FORMAT,
} from '../rulePack';
import { _getDefaultRule } from '../storage';
import { Group, Rule } from '../types';

const ZWSP = '​';

function rule(id: string, groupId: string | null = null): Rule {
	const r = _getDefaultRule(`Rule ${id}`, `Title ${id}`, `site-${id}.com`);
	r.id = id;
	r.tab.group_id = groupId;
	return r;
}

const group = (id: string, title: string, color = 'blue'): Group => ({
	id,
	title: title + ZWSP,
	color,
	collapsed: false,
});

describe('_buildRulePack', () => {
	it('carries only the groups the chosen rules use', () => {
		const pack = _buildRulePack(
			[rule('a', 'g1')],
			[group('g1', 'Work'), group('g2', 'Unused')],
			'My pack'
		);

		expect(pack.format).toBe(RULE_PACK_FORMAT);
		expect(pack.name).toBe('My pack');
		expect(pack.rules.map((r) => r.id)).toEqual(['a']);
		expect(pack.groups.map((g) => g.id)).toEqual(['g1']);
	});

	it('does not alias the live rules', () => {
		const original = rule('a');
		const pack = _buildRulePack([original], []);

		pack.rules[0].name = 'changed';

		expect(original.name).toBe('Rule a');
	});
});

describe('_parseRulePack', () => {
	it('reads packs and full config exports', () => {
		const pack = _buildRulePack([rule('a')], []);

		expect(_parseRulePack(pack)?.rules).toHaveLength(1);
		expect(_parseRulePack({ rules: [rule('a')], groups: [], settings: {} })?.rules).toHaveLength(1);
	});

	it('reads a single rule, as produced by Copy to clipboard', () => {
		expect(_parseRulePack(rule('a'))?.rules).toHaveLength(1);
	});

	it('reads a plain list of rules', () => {
		expect(_parseRulePack([rule('a'), rule('b')])?.rules).toHaveLength(2);
	});

	it.each([[null], ['text'], [42], [{ hello: 'world' }]])('rejects %j', (value) => {
		expect(_parseRulePack(value)).toBeNull();
	});
});

describe('_prepareRulePackImport', () => {
	it('gives every imported rule a fresh id and enables it', () => {
		const incoming = { ...rule('a'), is_enabled: undefined } as unknown as Rule;
		const result = _prepareRulePackImport({ rules: [incoming], groups: [] }, []);

		expect(result.rules[0].id).not.toBe('a');
		expect(result.rules[0].is_enabled).toBe(true);
	});

	it('keeps a rule that was disabled in the pack disabled', () => {
		const incoming = { ...rule('a'), is_enabled: false };

		expect(_prepareRulePackImport({ rules: [incoming], groups: [] }, []).rules[0].is_enabled).toBe(
			false
		);
	});

	it('skips and counts malformed rules', () => {
		const result = _prepareRulePackImport(
			{
				rules: [rule('a'), { name: 'broken' } as unknown as Rule, null as unknown as Rule],
				groups: [],
			},
			[]
		);

		expect(result.rules).toHaveLength(1);
		expect(result.skipped).toBe(2);
	});

	it('creates missing groups under new ids and points the rules at them', () => {
		const result = _prepareRulePackImport(
			{ rules: [rule('a', 'remote-g')], groups: [group('remote-g', 'Work', 'red')] },
			[]
		);

		expect(result.groups).toHaveLength(1);
		expect(result.groups[0].id).not.toBe('remote-g');
		expect(result.groups[0].title).toBe('Work' + ZWSP);
		expect(result.rules[0].tab.group_id).toBe(result.groups[0].id);
	});

	it('reuses an existing group with the same title and colour', () => {
		const existing = group('mine', 'Work', 'red');
		const result = _prepareRulePackImport(
			{ rules: [rule('a', 'remote-g')], groups: [group('remote-g', 'Work', 'red')] },
			[existing]
		);

		expect(result.groups).toHaveLength(0);
		expect(result.rules[0].tab.group_id).toBe('mine');
	});

	it('does not reuse a group with a different colour', () => {
		const result = _prepareRulePackImport(
			{ rules: [rule('a', 'remote-g')], groups: [group('remote-g', 'Work', 'red')] },
			[group('mine', 'Work', 'blue')]
		);

		expect(result.groups).toHaveLength(1);
	});

	it('drops a group id it cannot resolve instead of leaving a dangling reference', () => {
		const result = _prepareRulePackImport({ rules: [rule('a', 'unknown')], groups: [] }, []);

		expect(result.rules[0].tab.group_id).toBeNull();
	});

	it('keeps a group id that already exists locally', () => {
		const result = _prepareRulePackImport({ rules: [rule('a', 'mine')], groups: [] }, [
			group('mine', 'Work'),
		]);

		expect(result.rules[0].tab.group_id).toBe('mine');
	});

	it('does not create groups that no imported rule uses', () => {
		const result = _prepareRulePackImport(
			{ rules: [rule('a')], groups: [group('remote-g', 'Work')] },
			[]
		);

		expect(result.groups).toHaveLength(0);
	});
});
