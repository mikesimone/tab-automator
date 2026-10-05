import type { Rule } from './types.ts';
import { _isRegexPatternSafe } from './regex-safety.ts';

/** How much of the current page's address gets added to the rule. */
export type AddToRuleScope = 'domain' | 'domain_path' | 'url';

export const ADD_TO_RULE_SCOPES: { value: AddToRuleScope; label: string }[] = [
	{ value: 'domain', label: 'Just the domain' },
	{ value: 'domain_path', label: 'Domain and path' },
	{ value: 'url', label: 'Whole URL' },
];

export function _escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The regex piece for a URL, e.g. `example\.com` for the domain of https://www.example.com/a.
 * Returns null for addresses that have no host (chrome:// pages and the like still work).
 */
export function _patternForUrl(url: string, scope: AddToRuleScope): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}

	if (scope === 'url') {
		return _escapeRegex(url);
	}

	const host = parsed.host.replace(/^www\./, '');
	if (!host) {
		return null;
	}

	if (scope === 'domain') {
		return _escapeRegex(host);
	}

	const path = parsed.pathname === '/' ? '' : parsed.pathname;
	return _escapeRegex(host + path);
}

/** A rule's URL fragment rewritten as a regex that matches exactly the same URLs. */
export function _ruleFragmentAsRegex(rule: Rule): string {
	const fragment = rule.url_fragment ?? '';

	switch (rule.detection ?? 'CONTAINS') {
		case 'REGEX':
		case 'REGEXP':
			return fragment;
		case 'STARTS':
		case 'STARTS_WITH':
			return fragment ? `^${_escapeRegex(fragment)}` : '';
		case 'ENDS':
		case 'ENDS_WITH':
			return fragment ? `${_escapeRegex(fragment)}$` : '';
		case 'EXACT':
			return fragment ? `^${_escapeRegex(fragment)}$` : '';
		default:
			return _escapeRegex(fragment);
	}
}

export type AddToRuleResult =
	| { ok: true; rule: Rule; piece: string; convertedToRegex: boolean }
	| { ok: false; reason: 'no_host' | 'already_there' | 'unsafe'; piece: string | null };

/**
 * Adds the current page to the end of a rule's URL fragment, as `existing|new`.
 * Rules that don't use regex yet are switched to regex first, keeping what they matched before.
 * Returns a changed copy; the rule passed in is not modified.
 */
export function _addUrlToRule(rule: Rule, url: string, scope: AddToRuleScope): AddToRuleResult {
	const piece = _patternForUrl(url, scope);
	if (!piece) {
		return { ok: false, reason: 'no_host', piece: null };
	}

	const existing = _ruleFragmentAsRegex(rule).replace(/\|+$/, '');
	if (existing.split('|').includes(piece)) {
		return { ok: false, reason: 'already_there', piece };
	}

	const fragment = existing ? `${existing}|${piece}` : piece;
	if (!_isRegexPatternSafe(fragment)) {
		return { ok: false, reason: 'unsafe', piece };
	}

	const detection = rule.detection ?? 'CONTAINS';
	const convertedToRegex = detection !== 'REGEX' && detection !== 'REGEXP';

	return {
		ok: true,
		piece,
		convertedToRegex,
		rule: { ...rule, detection: convertedToRegex ? 'REGEX' : detection, url_fragment: fragment },
	};
}
