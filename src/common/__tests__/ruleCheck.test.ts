import { describe, expect, it } from 'vitest';
import { _checkRules, _ruleSampleUrls } from '../ruleCheck';
import { _regexSamples } from '../regexSamples';
import { _getDefaultRule } from '../storage';
import { _findRuleForUrl } from '../storage';
import type { Rule } from '../types';

let nextId = 0;
function rule(name: string, detection: string, fragment: string, enabled = true): Rule {
	const r = _getDefaultRule(name, '', fragment);
	r.id = `r${nextId++}`;
	r.detection = detection;
	r.is_enabled = enabled;
	return r;
}

const names = (rules: Rule[] | null) => rules?.map((r) => r.name);

describe('_regexSamples', () => {
	it('gives every alternative of a site list', () => {
		expect(_regexSamples('mail\\.google\\.com|github\\.com\\/mikesimone|bbc\\.co\\.uk')).toEqual([
			'mail.google.com',
			'github.com/mikesimone',
			'bbc.co.uk',
		]);
	});

	it('handles groups, optional parts, classes and quantifiers', () => {
		const samples = _regexSamples('^https?://(www\\.)?(foo|bar)\\.com/[a-z]+$');
		expect(samples.length).toBeGreaterThan(0);
		for (const sample of samples) {
			expect(new RegExp('^https?://(www\\.)?(foo|bar)\\.com/[a-z]+$').test(sample)).toBe(true);
		}
		expect(samples.some((s) => s.includes('foo'))).toBe(true);
		expect(samples.some((s) => s.includes('bar'))).toBe(true);
	});

	it('gives up on lookarounds and backreferences', () => {
		expect(_regexSamples('foo(?!bar)')).toEqual([]);
		expect(_regexSamples('(a)\\1')).toEqual([]);
	});
});

describe('_ruleSampleUrls', () => {
	it('only returns addresses the rule itself matches', () => {
		const r = rule('Ends', 'ENDS', '/inbox');
		const urls = _ruleSampleUrls(r);
		expect(urls.length).toBeGreaterThan(0);
		expect(urls.every((u) => u.endsWith('/inbox'))).toBe(true);
	});
});

describe('_checkRules', () => {
	it('reports nothing for rules that never share pages', () => {
		const report = _checkRules([
			rule('Mail', 'CONTAINS', 'mail.google.com'),
			rule('GitHub', 'CONTAINS', 'github.com'),
		]);
		expect(report.findings).toEqual([]);
		expect(report.suggestedOrder).toBeNull();
	});

	it('finds a specific rule hidden below a general one and moves it up', () => {
		const rules = [
			rule('Google', 'CONTAINS', 'google.com'),
			rule('Other', 'CONTAINS', 'example.org'),
			rule('Mail', 'CONTAINS', 'mail.google.com'),
		];
		const report = _checkRules(rules);

		expect(report.findings).toContainEqual(
			expect.objectContaining({ kind: 'hidden', rule: rules[2], certain: true, duplicate: false })
		);
		expect(names(report.suggestedOrder)).toEqual(['Mail', 'Google', 'Other']);
		expect(report.moves.map((m) => [m.rule.name, m.from, m.to, m.above.name])).toEqual([
			['Mail', 2, 0, 'Google'],
		]);
	});

	it('sees regex site lists hidden by a broader rule', () => {
		const rules = [
			rule('All Google', 'CONTAINS', 'google.com'),
			rule('Work', 'REGEX', 'mail\\.google\\.com|docs\\.google\\.com'),
		];
		const report = _checkRules(rules);

		expect(report.findings).toContainEqual(
			expect.objectContaining({ kind: 'hidden', rule: rules[1], certain: false })
		);
		expect(names(report.suggestedOrder)).toEqual(['Work', 'All Google']);
	});

	it('reports a regex rule that only partly overlaps, and leaves the order alone', () => {
		const rules = [
			rule('Google', 'CONTAINS', 'google.com'),
			rule('Work', 'REGEX', 'mail\\.google\\.com|slack\\.com'),
		];
		const report = _checkRules(rules);

		const partly = report.findings.find((f) => f.kind === 'partly-hidden');
		expect(partly).toMatchObject({ rule: rules[1], takenBy: rules[0] });
		expect(partly && 'examples' in partly && partly.examples[0]).toContain('mail.google.com');
		expect(report.suggestedOrder).toBeNull();
	});

	it('does not complain about a specific exception placed above a general rule', () => {
		const report = _checkRules([
			rule('Mail', 'CONTAINS', 'mail.google.com'),
			rule('Google', 'CONTAINS', 'google.com'),
		]);
		expect(report.findings).toEqual([]);
		expect(report.suggestedOrder).toBeNull();
	});

	it('calls out duplicates without moving them', () => {
		const rules = [rule('A', 'CONTAINS', 'github.com'), rule('B', 'CONTAINS', 'github.com')];
		const report = _checkRules(rules);
		expect(report.findings).toContainEqual(
			expect.objectContaining({ kind: 'hidden', rule: rules[1], duplicate: true })
		);
		expect(report.suggestedOrder).toBeNull();
	});

	it('ignores disabled rules, and leaves them where they are', () => {
		const rules = [
			rule('Google', 'CONTAINS', 'google.com'),
			rule('Off', 'CONTAINS', 'google.com', false),
			rule('Mail', 'CONTAINS', 'mail.google.com'),
		];
		const report = _checkRules(rules);
		expect(report.findings.map((f) => f.rule.name)).toEqual(['Mail']);
		expect(names(report.suggestedOrder)).toEqual(['Mail', 'Google', 'Off']);
	});

	it('flags a regex that is blocked as unsafe, since it never applies', () => {
		const rules = [rule('Bad', 'REGEX', '(a+)+$')];
		expect(_checkRules(rules).findings).toEqual([{ kind: 'blocked-regex', rule: rules[0] }]);
	});

	it('uses real addresses to spot overlaps the patterns alone miss', () => {
		const rules = [rule('Mail', 'CONTAINS', 'mail'), rule('Google', 'CONTAINS', 'google')];
		expect(_checkRules(rules).findings).toEqual([]);

		const report = _checkRules(rules, ['https://mail.google.com/mail/u/0/']);
		expect(report.findings).toEqual([
			expect.objectContaining({
				kind: 'partly-hidden',
				rule: rules[1],
				takenBy: rules[0],
				examples: ['https://mail.google.com/mail/u/0/'],
			}),
		]);
	});

	it('will not reorder when that would change which rule gets shared pages', () => {
		// Mail is inside Google, but Mailish shares pages with Mail and sits between them.
		const rules = [
			rule('Google', 'CONTAINS', 'google.com'),
			rule('Mailish', 'REGEX', 'mail\\.google\\.com\\/x|zzz\\.net'),
			rule('Mail', 'CONTAINS', 'mail.google.com'),
		];
		const report = _checkRules(rules, ['https://zzz.net/']);

		expect(report.suggestedOrder).toBeNull();
		expect(report.cantReorder).toEqual([{ specific: rules[2], general: rules[0] }]);
	});

	it('the suggested order only moves pages from a general rule to a more specific one', () => {
		const rules = [
			rule('GitHub', 'CONTAINS', 'github.com'),
			rule('Google', 'CONTAINS', 'google.com'),
			rule('Mine', 'STARTS', 'https://github.com/mikesimone'),
			rule('Docs', 'REGEX', 'docs\\.google\\.com|sheets\\.google\\.com'),
			rule('News', 'CONTAINS', 'news.ycombinator.com'),
		];
		const urls = [
			'https://github.com/',
			'https://github.com/mikesimone/tab-automator',
			'https://docs.google.com/document/d/1',
			'https://www.google.com/search?q=x',
			'https://news.ycombinator.com/',
		];
		const report = _checkRules(rules, urls);
		const order = report.suggestedOrder!;
		const winner = (list: Rule[], u: string) => _findRuleForUrl(list, u)?.name;

		expect(urls.map((u) => winner(order, u))).toEqual(['GitHub', 'Mine', 'Docs', 'Google', 'News']);
		expect(report.cantReorder).toEqual([]);
	});
});
