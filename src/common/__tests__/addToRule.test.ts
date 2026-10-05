import { describe, expect, it } from 'vitest';
import { _addUrlToRule, _escapeRegex, _patternForUrl, _ruleFragmentAsRegex } from '../addToRule';
import { _ruleMatchesUrl } from '../ruleMatching';
import { _getDefaultRule } from '../storage';
import type { Rule } from '../types';

const makeRule = (detection: string, url_fragment: string): Rule => ({
	..._getDefaultRule('Test', '', url_fragment),
	id: 'r1',
	detection,
	url_fragment,
});

// A long site-list rule like the ones people build up by hand (over 700 characters).
const LONG_SITE_LIST = Array.from({ length: 60 }, (_, i) => `site${i}example\\.com`).join('|');

describe('_patternForUrl', () => {
	const url = 'https://www.Example.com/videos/123?sort=new#top';

	it('uses only the domain, without www, for "Just the domain"', () => {
		expect(_patternForUrl(url, 'domain')).toBe('example\\.com');
	});

	it('adds the path but not the query for "Domain and path"', () => {
		expect(_patternForUrl(url, 'domain_path')).toBe('example\\.com\\/videos\\/123');
	});

	it('leaves the path off when the page is the site root', () => {
		expect(_patternForUrl('https://example.com/', 'domain_path')).toBe('example\\.com');
	});

	it('keeps the port, so local servers stay distinct', () => {
		expect(_patternForUrl('http://sixofone:8188/queue', 'domain')).toBe('sixofone:8188');
	});

	it('escapes the whole address for "Whole URL"', () => {
		const pattern = _patternForUrl(url, 'url')!;
		expect(new RegExp(pattern).test(url)).toBe(true);
		expect(new RegExp(pattern).test('https://www.Example.com/videos/1234')).toBe(false);
	});

	it('returns null for things that are not URLs', () => {
		expect(_patternForUrl('not a url', 'domain')).toBeNull();
	});
});

describe('_escapeRegex', () => {
	it('escapes every regex special character', () => {
		const text = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o/p';
		expect(new RegExp(`^${_escapeRegex(text)}$`).test(text)).toBe(true);
	});
});

describe('_ruleFragmentAsRegex keeps matching the same URLs', () => {
	const urls = [
		'https://www.facebook.com/',
		'https://www.facebook.com/groups/1',
		'https://m.facebook.com/',
		'https://example.com/?next=https://www.facebook.com/',
	];

	for (const detection of ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH', 'EXACT']) {
		it(`for ${detection}`, () => {
			const rule = makeRule(detection, 'https://www.facebook.com/');
			const asRegex = makeRule('REGEX', _ruleFragmentAsRegex(rule));

			for (const url of urls) {
				expect(_ruleMatchesUrl(asRegex, url)).toBe(_ruleMatchesUrl(rule, url));
			}
		});
	}
});

describe('_addUrlToRule', () => {
	it('appends the domain to a regex rule with |', () => {
		const rule = makeRule('REGEX', 'claude\\.ai\\/|chatgpt\\.com\\/');
		const result = _addUrlToRule(rule, 'https://gemini.google.com/app', 'domain');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rule.url_fragment).toBe('claude\\.ai\\/|chatgpt\\.com\\/|gemini\\.google\\.com');
		expect(result.rule.detection).toBe('REGEX');
		expect(result.convertedToRegex).toBe(false);
		expect(_ruleMatchesUrl(result.rule, 'https://gemini.google.com/app')).toBe(true);
		expect(_ruleMatchesUrl(result.rule, 'https://claude.ai/new')).toBe(true);
	});

	it('does not change the rule it was given', () => {
		const rule = makeRule('REGEX', 'a\\.com');
		_addUrlToRule(rule, 'https://b.com/', 'domain');
		expect(rule.url_fragment).toBe('a\\.com');
	});

	it('switches a Contains rule to Regex without losing what it matched', () => {
		const rule = makeRule('CONTAINS', 'https://www.facebook.com/');
		const result = _addUrlToRule(rule, 'https://www.instagram.com/reels/', 'domain');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.convertedToRegex).toBe(true);
		expect(result.rule.detection).toBe('REGEX');
		expect(_ruleMatchesUrl(result.rule, 'https://www.facebook.com/groups/1')).toBe(true);
		expect(_ruleMatchesUrl(result.rule, 'https://www.instagram.com/reels/')).toBe(true);
		expect(_ruleMatchesUrl(result.rule, 'https://m.facebook.com/')).toBe(false);
	});

	it('refuses a duplicate', () => {
		const rule = makeRule('REGEX', 'a\\.com|example\\.com');
		const result = _addUrlToRule(rule, 'https://www.example.com/x', 'domain');
		expect(result).toEqual({ ok: false, reason: 'already_there', piece: 'example\\.com' });
	});

	it('does not leave a double | when the rule ends with one', () => {
		const rule = makeRule('REGEX', 'a\\.com|');
		const result = _addUrlToRule(rule, 'https://b.com/', 'domain');
		expect(result.ok && result.rule.url_fragment).toBe('a\\.com|b\\.com');
	});

	it('uses just the new site when the rule had no pattern', () => {
		const rule = makeRule('CONTAINS', '');
		const result = _addUrlToRule(rule, 'https://b.com/', 'domain');
		expect(result.ok && result.rule.url_fragment).toBe('b\\.com');
	});

	it('works on long site-list rules', () => {
		expect(LONG_SITE_LIST.length).toBeGreaterThan(700);
		const rule = makeRule('REGEX', LONG_SITE_LIST);
		const result = _addUrlToRule(rule, 'https://newsite.net/watch/1', 'domain');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.rule.url_fragment.endsWith('|newsite\\.net')).toBe(true);
		expect(_ruleMatchesUrl(result.rule, 'https://newsite.net/watch/1')).toBe(true);
		expect(_ruleMatchesUrl(result.rule, 'https://site42example.com/')).toBe(true);
	});

	it('refuses to grow a rule past the pattern length limit', () => {
		const rule = makeRule('REGEX', 'a'.repeat(3995));
		const result = _addUrlToRule(rule, 'https://example.com/', 'domain');
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe('unsafe');
	});

	it('reports pages without a domain', () => {
		const rule = makeRule('REGEX', 'a\\.com');
		const result = _addUrlToRule(rule, 'about:blank', 'domain');
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason).toBe('no_host');
	});
});
