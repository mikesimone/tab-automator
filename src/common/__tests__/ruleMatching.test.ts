import { describe, expect, it } from 'vitest';
import { _findShadowedRules, _ruleMatchesUrl, _testUrlAgainstRules } from '../ruleMatching';
import { _getDefaultRule } from '../storage';
import { Rule } from '../types';

function rule(
	id: string,
	detection: string,
	fragment: string,
	overrides: Partial<Rule> = {}
): Rule {
	return {
		..._getDefaultRule(id, '', fragment),
		id,
		detection,
		...overrides,
	};
}

describe('_ruleMatchesUrl', () => {
	const url = 'https://app.example.com/dashboard?tab=1';

	it.each([
		['CONTAINS', 'example.com', true],
		['CONTAINS', 'other.com', false],
		['STARTS_WITH', 'https://app.', true],
		['STARTS', 'http://', false],
		['ENDS_WITH', 'tab=1', true],
		['ENDS', 'tab=2', false],
		['EXACT', url, true],
		['EXACT', 'https://app.example.com', false],
		['REGEX', 'dashboard\\?tab=\\d', true],
		['REGEXP', '^https://other', false],
		['NOPE', 'example', false],
	])('%s %s -> %s', (detection, fragment, expected) => {
		expect(_ruleMatchesUrl(rule('r', detection, fragment), url)).toBe(expected);
	});

	it('treats a missing detection type as CONTAINS', () => {
		const r = rule('r', 'CONTAINS', 'example');
		delete (r as any).detection;

		expect(_ruleMatchesUrl(r, url)).toBe(true);
	});
});

describe('_testUrlAgainstRules', () => {
	it('picks the first enabled match and marks later matches as shadowed', () => {
		const rules = [
			rule('a', 'CONTAINS', 'nothing-here'),
			rule('b', 'CONTAINS', 'example'),
			rule('c', 'CONTAINS', 'example.com'),
		];

		const outcome = _testUrlAgainstRules(rules, 'https://example.com/');

		expect(outcome.winner?.id).toBe('b');
		expect(outcome.results.map((r) => [r.rule.id, r.position, r.status])).toEqual([
			['a', 1, 'no-match'],
			['b', 2, 'winner'],
			['c', 3, 'shadowed'],
		]);
	});

	it('skips disabled rules but still reports them', () => {
		const rules = [
			rule('a', 'CONTAINS', 'example', { is_enabled: false }),
			rule('b', 'CONTAINS', 'example'),
		];

		const outcome = _testUrlAgainstRules(rules, 'https://example.com/');

		expect(outcome.winner?.id).toBe('b');
		expect(outcome.results[0].status).toBe('disabled');
	});

	it('has no winner when nothing matches', () => {
		const outcome = _testUrlAgainstRules([rule('a', 'CONTAINS', 'zzz')], 'https://example.com/');

		expect(outcome.winner).toBeUndefined();
	});
});

describe('_findShadowedRules', () => {
	it('flags a rule whose URLs an earlier CONTAINS rule already catches', () => {
		const rules = [
			rule('a', 'CONTAINS', 'example.com'),
			rule('b', 'STARTS_WITH', 'https://example.com/x'),
		];

		expect(_findShadowedRules(rules).get('b')?.id).toBe('a');
	});

	it('only looks at earlier rules', () => {
		const rules = [
			rule('b', 'STARTS_WITH', 'https://example.com/x'),
			rule('a', 'CONTAINS', 'example.com'),
		];

		expect(_findShadowedRules(rules).size).toBe(0);
	});

	it('does not flag a more specific rule placed before a general one', () => {
		const rules = [
			rule('a', 'CONTAINS', 'example.com/admin'),
			rule('b', 'CONTAINS', 'example.com'),
		];

		expect(_findShadowedRules(rules).size).toBe(0);
	});

	it('ignores disabled rules on either side', () => {
		const rules = [
			rule('a', 'CONTAINS', 'example', { is_enabled: false }),
			rule('b', 'CONTAINS', 'example.com'),
			rule('c', 'CONTAINS', 'example.org', { is_enabled: false }),
			rule('d', 'CONTAINS', 'example.org/x'),
		];

		expect(_findShadowedRules(rules).size).toBe(0);
	});

	it('handles STARTS, ENDS and EXACT earlier rules', () => {
		const rules = [
			rule('s', 'STARTS_WITH', 'https://a.com'),
			rule('s2', 'EXACT', 'https://a.com/page'),
			rule('e', 'ENDS_WITH', '.pdf'),
			rule('e2', 'ENDS_WITH', 'report.pdf'),
			rule('x', 'EXACT', 'https://b.com'),
			rule('x2', 'EXACT', 'https://b.com'),
		];

		const shadowed = _findShadowedRules(rules);

		expect([...shadowed.keys()].sort()).toEqual(['e2', 's2', 'x2']);
	});

	it('never reports regex rules', () => {
		const rules = [rule('a', 'REGEX', '.*'), rule('b', 'REGEX', 'example')];

		expect(_findShadowedRules(rules).size).toBe(0);
	});
});
