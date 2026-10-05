import type { Rule } from './types.ts';
import { _isRegexPatternSafe } from './regex-safety.ts';
import { _generateRandomId } from './helpers.ts';

/** How much of the current page's address gets added to the rule. */
export type AddToRuleScope = 'host' | 'domain' | 'address';

/**
 * Once a rule's pattern would grow past this many characters, the next site goes into a new rule
 * right below it ("Name (2)", "Name (3)", ...) so each rule stays readable in the editor.
 */
export const RULE_SPLIT_LENGTH = 1000;

export const ADD_TO_RULE_SCOPES: { value: AddToRuleScope; label: string; help: string }[] = [
	{
		value: 'host',
		label: 'Exact site name (FQDN)',
		help: 'Only this exact site name. Example: mail.google.com, but not docs.google.com.',
	},
	{
		value: 'domain',
		label: 'Whole domain (domain + TLD)',
		help: 'The site and everything under it. Example: google.com covers mail.google.com and docs.google.com.',
	},
	{
		value: 'address',
		label: 'Full URL (this page and below)',
		help: 'Only this address and pages under it. Example: github.com/mikesimone, but not the rest of github.com.',
	},
];

// Country-code domains where people register under a second level, e.g. bbc.co.uk.
const SECOND_LEVEL_LABELS = new Set([
	'co',
	'com',
	'net',
	'org',
	'gov',
	'edu',
	'ac',
	'or',
	'ne',
	'go',
	'gob',
	'mil',
	'nic',
	'ltd',
	'plc',
	'sch',
]);

// Hosting services where each subdomain is someone else's site, e.g. mikesimone.github.io.
const SHARED_HOSTING_SUFFIXES = [
	'github.io',
	'gitlab.io',
	'blogspot.com',
	'herokuapp.com',
	'vercel.app',
	'netlify.app',
	'pages.dev',
	'web.app',
	'firebaseapp.com',
	'appspot.com',
	'wordpress.com',
	'tumblr.com',
	'substack.com',
];

export function _escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The domain someone registered, e.g. google.com for mail.google.com and bbc.co.uk for
 * www.bbc.co.uk. A small built-in list rather than the full public suffix list, so a few rare
 * country domains may come out one level too short.
 */
export function _registrableDomain(hostname: string): string {
	const host = hostname.toLowerCase();
	const labels = host.split('.');

	if (labels.length <= 2 || /^[\d.]+$/.test(host) || host.startsWith('[')) {
		return host;
	}

	const lastTwo = labels.slice(-2).join('.');
	const tld = labels[labels.length - 1];
	const second = labels[labels.length - 2];
	const takesThree =
		SHARED_HOSTING_SUFFIXES.includes(lastTwo) ||
		(tld.length === 2 && SECOND_LEVEL_LABELS.has(second));

	return labels.slice(takesThree ? -3 : -2).join('.');
}

/**
 * What gets added, written the way people read it, e.g. `mail.google.com` or
 * `github.com/mikesimone`. Returns null for addresses that have no site name.
 */
export function _readableTargetForUrl(url: string, scope: AddToRuleScope): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}

	const hostname = parsed.hostname.toLowerCase();
	if (!hostname) {
		return null;
	}
	const port = parsed.port ? `:${parsed.port}` : '';

	if (scope === 'host') {
		return hostname + port;
	}

	if (scope === 'domain') {
		// Local names like "sixofone" have no domain to widen to, so keep the port to tell servers apart.
		return hostname.includes('.') && !/^[\d.]+$/.test(hostname)
			? _registrableDomain(hostname)
			: hostname + port;
	}

	const path = parsed.pathname.replace(/\/+$/, '');
	return hostname.replace(/^www\./, '') + port + path + parsed.search;
}

/** The regex piece for a URL, e.g. `mail\.google\.com`. Returns null when there's no site name. */
export function _patternForUrl(url: string, scope: AddToRuleScope): string | null {
	const target = _readableTargetForUrl(url, scope);
	return target ? _escapeRegex(target) : null;
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

/** "Leaked (2)" -> "Leaked". */
export function _baseRuleName(name: string): string {
	return (name ?? '').replace(/\s\(\d+\)$/, '');
}

function _continuationNumber(name: string): number {
	const match = /\s\((\d+)\)$/.exec(name ?? '');
	return match ? Number(match[1]) : 1;
}

/** The rule plus its continuation rules ("Name (2)", "Name (3)", ...), in that order. */
export function _ruleFamily(rules: Rule[], rule: Rule): Rule[] {
	const base = _baseRuleName(rule.name);
	return rules
		.filter((r) => r.id === rule.id || _baseRuleName(r.name) === base)
		.sort((a, b) => _continuationNumber(a.name) - _continuationNumber(b.name));
}

function _appendPiece(rule: Rule, piece: string): { fragment: string; convertedToRegex: boolean } {
	const existing = _ruleFragmentAsRegex(rule).replace(/\|+$/, '');
	const detection = rule.detection ?? 'CONTAINS';
	return {
		fragment: existing ? `${existing}|${piece}` : piece,
		convertedToRegex: detection !== 'REGEX' && detection !== 'REGEXP',
	};
}

export type AddToRulePlan =
	| {
			ok: true;
			kind: 'appended';
			rule: Rule;
			piece: string;
			convertedToRegex: boolean;
	  }
	| {
			ok: true;
			kind: 'new_rule';
			rule: Rule;
			piece: string;
			/** The rule the new one goes right below (the last one of the family). */
			insertAfterId: string;
			/** The rule that was full. */
			fullRuleName: string;
	  }
	| {
			ok: false;
			reason: 'no_host' | 'no_rule' | 'already_there' | 'unsafe';
			piece: string | null;
			ruleName?: string;
	  };

/**
 * Works out how to add the current page to a rule, as `existing|new` at the end of its pattern.
 * Rules that don't use regex yet are switched to regex, keeping what they matched before.
 * When the rule (and any continuation rules after it) would pass RULE_SPLIT_LENGTH, plans a new
 * continuation rule with the same tab settings instead. Nothing passed in is modified.
 */
export function _planAddToRule(
	rules: Rule[],
	ruleId: string,
	url: string,
	scope: AddToRuleScope
): AddToRulePlan {
	const target = rules.find((r) => r.id === ruleId);
	const piece = _patternForUrl(url, scope);

	if (!piece) {
		return { ok: false, reason: 'no_host', piece: null };
	}
	if (!target) {
		return { ok: false, reason: 'no_rule', piece };
	}

	const family = _ruleFamily(rules, target);

	const holder = family.find((r) =>
		_ruleFragmentAsRegex(r).replace(/\|+$/, '').split('|').includes(piece)
	);
	if (holder) {
		return { ok: false, reason: 'already_there', piece, ruleName: holder.name };
	}

	// The chosen rule first, then its continuation rules, so earlier rules fill up first.
	const candidates = [target, ...family.filter((r) => r.id !== target.id)];
	for (const candidate of candidates) {
		const { fragment, convertedToRegex } = _appendPiece(candidate, piece);
		if (fragment.length <= RULE_SPLIT_LENGTH && _isRegexPatternSafe(fragment)) {
			return {
				ok: true,
				kind: 'appended',
				piece,
				convertedToRegex,
				rule: {
					...candidate,
					detection: convertedToRegex ? 'REGEX' : candidate.detection,
					url_fragment: fragment,
				},
			};
		}
	}

	if (!_isRegexPatternSafe(piece)) {
		return { ok: false, reason: 'unsafe', piece };
	}

	const base = _baseRuleName(target.name);
	const nextNumber = Math.max(...family.map((r) => _continuationNumber(r.name))) + 1;
	const last = family.reduce((a, b) =>
		rules.findIndex((r) => r.id === b.id) > rules.findIndex((r) => r.id === a.id) ? b : a
	);

	return {
		ok: true,
		kind: 'new_rule',
		piece,
		insertAfterId: last.id,
		fullRuleName: target.name,
		rule: {
			...(JSON.parse(JSON.stringify(target)) as Rule),
			id: _generateRandomId(),
			name: `${base} (${nextNumber})`,
			detection: 'REGEX',
			url_fragment: piece,
		},
	};
}
