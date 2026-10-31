import type { Rule } from './types.ts';
import { _isRegexPatternSafe } from './regex-safety.ts';
import { _isSubsumedBy } from './ruleMatching.ts';
import { _regexSamples } from './regexSamples.ts';

/**
 * Rule check: finds rules that another rule hides, and works out an order that puts the more
 * specific rules first, like a firewall. Rules are compared by trying example addresses: ones made
 * up from each rule's own pattern, plus real ones (open tabs, bookmarks) passed in by the caller.
 * Plain-text rules (contains / starts / ends / exact) are compared exactly where that is possible.
 */

const isRegex = (rule: Rule) => rule.detection === 'REGEX' || rule.detection === 'REGEXP';
const isEnabled = (rule: Rule) => rule.is_enabled !== false;

type Matcher = (url: string) => boolean;

/** Same results as _ruleMatchesUrl, but compiles a regex once instead of on every call. */
export function _compileRuleMatcher(rule: Rule): Matcher {
	const fragment = rule.url_fragment ?? '';

	switch (rule.detection ?? 'CONTAINS') {
		case 'CONTAINS':
			return (url) => url.includes(fragment);
		case 'STARTS':
		case 'STARTS_WITH':
			return (url) => url.startsWith(fragment);
		case 'ENDS':
		case 'ENDS_WITH':
			return (url) => url.endsWith(fragment);
		case 'EXACT':
			return (url) => url === fragment;
		case 'REGEX':
		case 'REGEXP': {
			if (!_isRegexPatternSafe(fragment)) return () => false;
			try {
				// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
				// Safe: checked by _isRegexPatternSafe() just above, as at runtime.
				const regex = new RegExp(fragment);
				return (url) => regex.test(url);
			} catch {
				return () => false;
			}
		}
		default:
			return () => false;
	}
}

const CHECK_PATH = 'tab-automator-check';
const looksLikeUrl = (text: string) => /^[a-z][a-z0-9+.-]*:/i.test(text);

/** A made-up piece of a URL turned into a few whole addresses. */
function _wrap(piece: string): string[] {
	if (looksLikeUrl(piece)) {
		return [piece, piece.endsWith('/') ? piece + CHECK_PATH : piece + '/' + CHECK_PATH];
	}
	if (piece.startsWith('/') || piece.startsWith('?') || piece.startsWith('#')) {
		return [`https://example.com${piece}`, `https://example.com/${CHECK_PATH}${piece}`];
	}
	const withSlash = piece.includes('/') ? piece : piece + '/';
	return [
		`https://${withSlash}`,
		`https://${withSlash}${withSlash.endsWith('/') ? '' : '/'}${CHECK_PATH}`,
		`https://www.${withSlash}`,
		`http://${withSlash}`,
	];
}

/** Made-up addresses this rule matches. Empty when none could be made (unusual regex). */
export function _ruleSampleUrls(
	rule: Rule,
	matches: Matcher = _compileRuleMatcher(rule)
): string[] {
	const fragment = rule.url_fragment ?? '';
	const pieces = isRegex(rule) ? _regexSamples(fragment) : fragment ? [fragment] : ['example.com/'];

	const urls = new Set<string>();
	for (const piece of pieces) {
		for (const url of _wrap(piece)) {
			if (matches(url)) urls.add(url);
		}
		if (matches(piece)) urls.add(piece);
	}
	return [...urls];
}

export type RuleCheckFinding =
	| {
			kind: 'hidden';
			rule: Rule;
			/** Earlier rules that take this rule's pages. */
			takenBy: Rule[];
			/** True when worked out exactly; false when based on example addresses. */
			certain: boolean;
			/** True when the earlier rule covers exactly the same pages (a duplicate). */
			duplicate: boolean;
	  }
	| { kind: 'partly-hidden'; rule: Rule; takenBy: Rule; examples: string[] }
	| { kind: 'blocked-regex'; rule: Rule }
	| { kind: 'unchecked'; rule: Rule };

/** A rule moved up from `from` to `to` (0-based), now just above `above`. */
/** Up to three example addresses for people to read: one per site, real ones first. */
function _pickExamples(urls: string[], realUrls: string[]): string[] {
	const real = new Set(realUrls);
	const host = (url: string) => {
		try {
			return new URL(url).host.replace(/^www\./, '');
		} catch {
			return url;
		}
	};
	const sorted = [...urls].sort((x, y) => Number(real.has(y)) - Number(real.has(x)));
	const seen = new Set<string>();
	const out: string[] = [];
	for (const url of sorted) {
		if (url.includes(CHECK_PATH) && !real.has(url)) continue;
		if (url.startsWith('http://') && !real.has(url)) continue;
		if (seen.has(host(url))) continue;
		seen.add(host(url));
		out.push(url);
		if (out.length === 3) break;
	}
	return out.length > 0 ? out : urls.slice(0, 1);
}

export type RuleMove = { rule: Rule; from: number; to: number; above: Rule };

export type RuleCheckReport = {
	findings: RuleCheckFinding[];
	/** Rules in the suggested order, or null when the current order is already fine. */
	suggestedOrder: Rule[] | null;
	moves: RuleMove[];
	/** Pairs that should swap but can't without changing other rules too; left alone. */
	cantReorder: { specific: Rule; general: Rule }[];
};

type Info = { rule: Rule; index: number; matches: Matcher; samples: string[]; urls: string[] };

/**
 * Checks the rule list. `realUrls` are addresses to also try, such as open tabs and bookmarks.
 */
export function _checkRules(rules: Rule[], realUrls: string[] = []): RuleCheckReport {
	const infos: Info[] = rules.map((rule, index) => {
		const matches = _compileRuleMatcher(rule);
		const samples = _ruleSampleUrls(rule, matches);
		const real = realUrls.filter(matches);
		return { rule, index, matches, samples, urls: [...new Set([...samples, ...real])] };
	});

	const active = infos.filter((info) => isEnabled(info.rule));
	const findings: RuleCheckFinding[] = [];

	// B's pages all match A. Exact for two plain-text rules, otherwise by examples.
	const coverCache = new Map<string, boolean>();
	const covers = (a: Info, b: Info): boolean => {
		const key = `${a.index}>${b.index}`;
		let result = coverCache.get(key);
		if (result === undefined) {
			result =
				!isRegex(a.rule) && !isRegex(b.rule) && !!a.rule.url_fragment && !!b.rule.url_fragment
					? _isSubsumedBy(a.rule, b.rule)
					: b.urls.length > 0 && b.urls.every(a.matches);
			coverCache.set(key, result);
		}
		return result;
	};
	const overlapExamples = (a: Info, b: Info): string[] =>
		[...new Set([...a.urls, ...b.urls])].filter((url) => a.matches(url) && b.matches(url));

	for (const info of infos) {
		const { rule } = info;
		if (!isEnabled(rule)) continue;
		if (isRegex(rule) && !_isRegexPatternSafe(rule.url_fragment ?? '')) {
			findings.push({ kind: 'blocked-regex', rule });
			continue;
		}
		if (info.urls.length === 0) findings.push({ kind: 'unchecked', rule });
	}

	// Hidden and partly hidden rules, in list order.
	for (const b of active) {
		if (b.urls.length === 0) continue;
		const earlier = active.filter((a) => a.index < b.index);

		const exact = earlier.find(
			(a) =>
				!isRegex(a.rule) &&
				!isRegex(b.rule) &&
				!!a.rule.url_fragment &&
				!!b.rule.url_fragment &&
				_isSubsumedBy(a.rule, b.rule)
		);
		if (exact) {
			findings.push({
				kind: 'hidden',
				rule: b.rule,
				takenBy: [exact.rule],
				certain: true,
				duplicate: _isSubsumedBy(b.rule, exact.rule),
			});
			continue;
		}

		const winners = b.urls.map((url) => earlier.find((a) => a.matches(url)));
		if (winners.every(Boolean)) {
			const takenBy = [...new Set(winners.map((w) => w!.rule))];
			const single = takenBy.length === 1 ? infos.find((i) => i.rule === takenBy[0])! : null;
			findings.push({
				kind: 'hidden',
				rule: b.rule,
				takenBy,
				// Plain-text rules hidden only by examples aren't proven: their examples are few.
				certain: false,
				duplicate: !!single && covers(b, single),
			});
			continue;
		}

		// Partly hidden: an earlier rule takes some pages. When the earlier rule is the more
		// specific one, that's the usual "exception first" setup, so it isn't reported.
		for (const a of earlier) {
			if (covers(b, a)) continue;
			const shared = overlapExamples(a, b).filter(
				(url) => earlier.find((e) => e.matches(url)) === a
			);
			if (shared.length > 0) {
				findings.push({
					kind: 'partly-hidden',
					rule: b.rule,
					takenBy: a.rule,
					examples: _pickExamples(shared, realUrls),
				});
			}
		}
	}

	const { order, cantReorder } = _suggestOrder(infos, active, covers, overlapExamples);
	const changed = order.some((info, i) => info !== infos[i]);
	const moves: RuleMove[] = changed
		? order
				.map((info, to) => {
					const above = order.slice(to + 1).find((other) => other.index < info.index);
					return above ? { rule: info.rule, from: info.index, to, above: above.rule } : null;
				})
				.filter((move): move is RuleMove => move !== null)
		: [];

	return {
		findings,
		suggestedOrder: changed ? order.map((info) => info.rule) : null,
		moves,
		cantReorder,
	};
}

/**
 * Most specific first: when B's pages are a subset of A's, B goes above A. Rules that share some
 * pages without one containing the other keep their order, so nothing changes for those pages.
 * A swap that would break that is skipped and reported instead.
 */
function _suggestOrder(
	infos: Info[],
	active: Info[],
	covers: (a: Info, b: Info) => boolean,
	overlapExamples: (a: Info, b: Info) => string[]
): { order: Info[]; cantReorder: { specific: Rule; general: Rule }[] } {
	const n = infos.length;
	const before: Set<number>[] = infos.map(() => new Set()); // before[j] = rules that must come before j
	const cantReorder: { specific: Rule; general: Rule }[] = [];
	const wanted: [number, number][] = []; // [specific, general]: specific must move above general

	for (const a of active) {
		for (const b of active) {
			if (a.index >= b.index) continue;
			const aCoversB = covers(a, b);
			const bCoversA = covers(b, a);
			if (aCoversB && !bCoversA) {
				wanted.push([b.index, a.index]);
			} else if (bCoversA || overlapExamples(a, b).length > 0) {
				// Already specific-first, duplicates, or sharing some pages: keep this pair's order,
				// so the shared pages keep going to the same rule.
				before[b.index].add(a.index);
			}
		}
	}

	// Add each wanted swap unless it would create a loop with the rules already set.
	const reaches = (from: number, to: number): boolean => {
		const seen = new Set<number>();
		const stack = [from];
		while (stack.length) {
			const node = stack.pop()!;
			if (node === to) return true;
			if (seen.has(node)) continue;
			seen.add(node);
			// Edges point from a rule to the rules that must come before it.
			for (const prev of before[node]) stack.push(prev);
		}
		return false;
	};

	for (const [specific, general] of wanted) {
		// "specific before general" means general depends on specific. Looping if specific
		// already (indirectly) has to come after general.
		if (reaches(specific, general)) {
			cantReorder.push({ specific: infos[specific].rule, general: infos[general].rule });
		} else {
			before[general].add(specific);
		}
	}

	// Keep the current order, except that a rule pulls the rules it needs above it just before
	// it is placed. That moves each specific rule to right above the general one, and no further.
	const placed = new Set<number>();
	const visiting = new Set<number>();
	const order: Info[] = [];
	let loop = false;
	const visit = (i: number) => {
		if (placed.has(i)) return;
		if (visiting.has(i)) {
			loop = true; // Shouldn't happen, as loops are refused above.
			return;
		}
		visiting.add(i);
		for (const prev of [...before[i]].sort((x, y) => x - y)) visit(prev);
		visiting.delete(i);
		placed.add(i);
		order.push(infos[i]);
	};
	for (let i = 0; i < n; i++) visit(i);
	if (loop) return { order: infos, cantReorder };

	return { order, cantReorder };
}
