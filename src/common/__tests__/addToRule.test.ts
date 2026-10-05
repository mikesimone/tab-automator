import { describe, expect, it } from 'vitest';
import {
	RULE_SPLIT_LENGTH,
	_escapeRegex,
	_planAddToRule,
	_readableTargetForUrl,
	_registrableDomain,
	_ruleFragmentAsRegex,
} from '../addToRule';
import { _ruleMatchesUrl } from '../ruleMatching';
import { _getDefaultRule } from '../storage';
import type { Rule } from '../types';

const makeRule = (detection: string, url_fragment: string, id = 'r1', name = 'Test'): Rule => ({
	..._getDefaultRule(name, '', url_fragment),
	id,
	name,
	detection,
	url_fragment,
});

// A long site-list rule like the ones people build up by hand (over 700 characters).
const LONG_SITE_LIST = Array.from({ length: 45 }, (_, i) => `site${i}example\\.com`).join('|');

describe('_readableTargetForUrl', () => {
	const url = 'https://mail.google.com/mail/u/0/?tab=rm#inbox';

	it('keeps the exact site name for "Exact site name"', () => {
		expect(_readableTargetForUrl(url, 'host')).toBe('mail.google.com');
		expect(_readableTargetForUrl('https://www.example.com/', 'host')).toBe('www.example.com');
	});

	it('widens to the registered domain for "Whole domain"', () => {
		expect(_readableTargetForUrl(url, 'domain')).toBe('google.com');
		expect(_readableTargetForUrl('https://www.bbc.co.uk/news', 'domain')).toBe('bbc.co.uk');
	});

	it('uses the site and path for "Full URL", without www or a trailing slash', () => {
		expect(_readableTargetForUrl('https://www.github.com/mikesimone/', 'address')).toBe(
			'github.com/mikesimone'
		);
		expect(_readableTargetForUrl('https://www.youtube.com/watch?v=abc#t=5', 'address')).toBe(
			'youtube.com/watch?v=abc'
		);
	});

	it('keeps the port for local servers', () => {
		expect(_readableTargetForUrl('http://sixofone:8188/queue', 'host')).toBe('sixofone:8188');
		expect(_readableTargetForUrl('http://sixofone:8188/queue', 'domain')).toBe('sixofone:8188');
		expect(_readableTargetForUrl('http://192.168.1.5:8080/', 'domain')).toBe('192.168.1.5:8080');
	});

	it('returns null for things that are not web addresses', () => {
		expect(_readableTargetForUrl('not a url', 'host')).toBeNull();
		expect(_readableTargetForUrl('about:blank', 'host')).toBeNull();
	});
});

describe('_registrableDomain', () => {
	it.each([
		['mail.google.com', 'google.com'],
		['google.com', 'google.com'],
		['a.b.c.example.org', 'example.org'],
		['www.bbc.co.uk', 'bbc.co.uk'],
		['shop.example.com.au', 'example.com.au'],
		['mikesimone.github.io', 'mikesimone.github.io'],
		['docs.mikesimone.github.io', 'mikesimone.github.io'],
		['news.ycombinator.com', 'ycombinator.com'],
	])('%s -> %s', (host, domain) => {
		expect(_registrableDomain(host)).toBe(domain);
	});
});

describe('the three choices match what they promise', () => {
	const page = 'https://mail.google.com/mail/u/0/';

	it('Exact site name: this site only', () => {
		const rule = makeRule('REGEX', '');
		const plan = _planAddToRule([rule], 'r1', page, 'host');
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(_ruleMatchesUrl(plan.rule, 'https://mail.google.com/x')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://docs.google.com/x')).toBe(false);
	});

	it('Whole domain: every part of the site', () => {
		const rule = makeRule('REGEX', '');
		const plan = _planAddToRule([rule], 'r1', page, 'domain');
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(_ruleMatchesUrl(plan.rule, 'https://docs.google.com/x')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://google.com/')).toBe(true);
	});

	it('Full URL: this page and below, not the rest of the site', () => {
		const rule = makeRule('REGEX', '');
		const plan = _planAddToRule([rule], 'r1', 'https://github.com/mikesimone', 'address');
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(_ruleMatchesUrl(plan.rule, 'https://github.com/mikesimone/tab-automator')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://github.com/')).toBe(false);
		expect(_ruleMatchesUrl(plan.rule, 'https://github.com/someoneelse')).toBe(false);
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

describe('_planAddToRule', () => {
	it('appends to a regex rule with |', () => {
		const rule = makeRule('REGEX', 'claude\\.ai\\/|chatgpt\\.com\\/');
		const plan = _planAddToRule([rule], 'r1', 'https://gemini.google.com/app', 'host');

		expect(plan.ok && plan.kind).toBe('appended');
		if (!plan.ok || plan.kind !== 'appended') return;
		expect(plan.rule.url_fragment).toBe('claude\\.ai\\/|chatgpt\\.com\\/|gemini\\.google\\.com');
		expect(plan.convertedToRegex).toBe(false);
		expect(_ruleMatchesUrl(plan.rule, 'https://gemini.google.com/app')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://claude.ai/new')).toBe(true);
	});

	it('does not change the rules it was given', () => {
		const rule = makeRule('REGEX', 'a\\.com');
		_planAddToRule([rule], 'r1', 'https://b.com/', 'host');
		expect(rule.url_fragment).toBe('a\\.com');
	});

	it('switches a Contains rule to Regex without losing what it matched', () => {
		const rule = makeRule('CONTAINS', 'https://www.facebook.com/');
		const plan = _planAddToRule([rule], 'r1', 'https://www.instagram.com/reels/', 'domain');

		expect(plan.ok && plan.kind).toBe('appended');
		if (!plan.ok || plan.kind !== 'appended') return;
		expect(plan.convertedToRegex).toBe(true);
		expect(plan.rule.detection).toBe('REGEX');
		expect(_ruleMatchesUrl(plan.rule, 'https://www.facebook.com/groups/1')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://www.instagram.com/reels/')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://m.facebook.com/')).toBe(false);
	});

	it('refuses a duplicate', () => {
		const rule = makeRule('REGEX', 'a\\.com|example\\.com');
		const plan = _planAddToRule([rule], 'r1', 'https://www.example.com/x', 'domain');
		expect(plan).toEqual({
			ok: false,
			reason: 'already_there',
			piece: 'example\\.com',
			ruleName: 'Test',
		});
	});

	it('does not leave a double | when the rule ends with one', () => {
		const rule = makeRule('REGEX', 'a\\.com|');
		const plan = _planAddToRule([rule], 'r1', 'https://b.com/', 'host');
		expect(plan.ok && plan.rule.url_fragment).toBe('a\\.com|b\\.com');
	});

	it('uses just the new site when the rule had no pattern', () => {
		const rule = makeRule('CONTAINS', '');
		const plan = _planAddToRule([rule], 'r1', 'https://b.com/', 'host');
		expect(plan.ok && plan.rule.url_fragment).toBe('b\\.com');
	});

	it('works on long site-list rules', () => {
		expect(LONG_SITE_LIST.length).toBeGreaterThan(700);
		const rule = makeRule('REGEX', LONG_SITE_LIST);
		const plan = _planAddToRule([rule], 'r1', 'https://newsite.net/watch/1', 'domain');

		expect(plan.ok && plan.kind).toBe('appended');
		if (!plan.ok) return;
		expect(plan.rule.url_fragment.endsWith('|newsite\\.net')).toBe(true);
		expect(_ruleMatchesUrl(plan.rule, 'https://site42example.com/')).toBe(true);
	});

	it('reports pages without a site name and missing rules', () => {
		const rule = makeRule('REGEX', 'a\\.com');
		expect(_planAddToRule([rule], 'r1', 'about:blank', 'host')).toMatchObject({
			ok: false,
			reason: 'no_host',
		});
		expect(_planAddToRule([rule], 'gone', 'https://b.com/', 'host')).toMatchObject({
			ok: false,
			reason: 'no_rule',
		});
	});
});

describe('starting a new rule once a rule is full', () => {
	const full = 'x'.repeat(RULE_SPLIT_LENGTH - 5);
	const other = makeRule('REGEX', 'other\\.com', 'o1', 'Other');

	it('creates "Name (2)" right below the full rule, with the same tab settings', () => {
		const rule = makeRule('REGEX', full, 'r1', 'Leaked');
		rule.tab.title = 'LEAKED: {title}';
		const plan = _planAddToRule([rule, other], 'r1', 'https://newsite.net/', 'host');

		expect(plan.ok && plan.kind).toBe('new_rule');
		if (!plan.ok || plan.kind !== 'new_rule') return;
		expect(plan.rule.name).toBe('Leaked (2)');
		expect(plan.rule.id).not.toBe('r1');
		expect(plan.rule.detection).toBe('REGEX');
		expect(plan.rule.url_fragment).toBe('newsite\\.net');
		expect(plan.rule.tab.title).toBe('LEAKED: {title}');
		expect(plan.insertAfterId).toBe('r1');
		expect(plan.fullRuleName).toBe('Leaked');

		plan.rule.tab.title = 'changed';
		expect(rule.tab.title).toBe('LEAKED: {title}');
	});

	it('adds to the existing continuation rule while it has room', () => {
		const rule = makeRule('REGEX', full, 'r1', 'Leaked');
		const second = makeRule('REGEX', 'a\\.com', 'r2', 'Leaked (2)');
		const plan = _planAddToRule([rule, second, other], 'r1', 'https://b.com/', 'host');

		expect(plan.ok && plan.kind).toBe('appended');
		if (!plan.ok) return;
		expect(plan.rule.id).toBe('r2');
		expect(plan.rule.url_fragment).toBe('a\\.com|b\\.com');
	});

	it('goes below the last continuation rule when they are all full', () => {
		const rule = makeRule('REGEX', full, 'r1', 'Leaked');
		const second = makeRule('REGEX', full, 'r2', 'Leaked (2)');
		const plan = _planAddToRule([rule, second, other], 'r2', 'https://b.com/', 'host');

		expect(plan.ok && plan.kind).toBe('new_rule');
		if (!plan.ok || plan.kind !== 'new_rule') return;
		expect(plan.rule.name).toBe('Leaked (3)');
		expect(plan.insertAfterId).toBe('r2');
	});

	it('refuses a site that is already in a continuation rule', () => {
		const rule = makeRule('REGEX', full, 'r1', 'Leaked');
		const second = makeRule('REGEX', 'b\\.com', 'r2', 'Leaked (2)');
		const plan = _planAddToRule([rule, second], 'r1', 'https://b.com/', 'host');
		expect(plan).toMatchObject({ ok: false, reason: 'already_there', ruleName: 'Leaked (2)' });
	});

	it('never lets a rule grow past the limit', () => {
		const rule = makeRule('REGEX', 'a'.repeat(RULE_SPLIT_LENGTH - 3), 'r1', 'Leaked');
		const plan = _planAddToRule([rule], 'r1', 'https://example.com/', 'host');
		expect(plan.ok && plan.kind).toBe('new_rule');
	});
});
