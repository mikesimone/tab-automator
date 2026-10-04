import type { Rule } from './types.ts';
import { _safeRegexTestSync } from './regex-safety.ts';

/** Does this rule's URL fragment match the URL? Ignores whether the rule is enabled. */
export function _ruleMatchesUrl(rule: Rule, url: string): boolean {
	const detectionType = rule.detection ?? 'CONTAINS';
	const urlFragment = rule.url_fragment;

	switch (detectionType) {
		case 'CONTAINS':
			return url.includes(urlFragment);
		case 'STARTS':
		case 'STARTS_WITH':
			return url.startsWith(urlFragment);
		case 'ENDS':
		case 'ENDS_WITH':
			return url.endsWith(urlFragment);
		case 'REGEX':
		case 'REGEXP':
			// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
			// Safe: Pattern is validated by _safeRegexTestSync() which checks for ReDoS patterns
			return _safeRegexTestSync(urlFragment, url);
		case 'EXACT':
			return url === urlFragment;
		default:
			return false;
	}
}

export type RuleTestStatus = 'winner' | 'shadowed' | 'disabled' | 'no-match';

export type RuleTestResult = {
	rule: Rule;
	/** Position in the rule list, starting at 1 (rules are applied top to bottom). */
	position: number;
	status: RuleTestStatus;
};

export type RuleTestOutcome = {
	winner?: Rule;
	results: RuleTestResult[];
};

/**
 * Explains which rule applies to a URL: the first enabled match wins, later matches are shadowed.
 */
export function _testUrlAgainstRules(rules: Rule[], url: string): RuleTestOutcome {
	let winner: Rule | undefined;

	const results = rules.map((rule, index): RuleTestResult => {
		const position = index + 1;

		if (!_ruleMatchesUrl(rule, url)) {
			return { rule, position, status: 'no-match' };
		}

		if (rule.is_enabled === false) {
			return { rule, position, status: 'disabled' };
		}

		if (!winner) {
			winner = rule;
			return { rule, position, status: 'winner' };
		}

		return { rule, position, status: 'shadowed' };
	});

	return { winner, results };
}

function _isSubsumedBy(earlier: Rule, later: Rule): boolean {
	const a = earlier.detection ?? 'CONTAINS';
	const b = later.detection ?? 'CONTAINS';
	const fragmentA = earlier.url_fragment;
	const fragmentB = later.url_fragment;

	if (!fragmentA) {
		return false;
	}

	const isStarts = (type: string) => type === 'STARTS' || type === 'STARTS_WITH';
	const isEnds = (type: string) => type === 'ENDS' || type === 'ENDS_WITH';

	if (a === 'CONTAINS') {
		// Any URL matched by the later rule contains its own fragment, which contains the earlier one.
		const isPlainText = b === 'CONTAINS' || b === 'EXACT' || isStarts(b) || isEnds(b);
		return isPlainText && fragmentB.includes(fragmentA);
	}

	if (isStarts(a)) {
		return (isStarts(b) || b === 'EXACT') && fragmentB.startsWith(fragmentA);
	}

	if (isEnds(a)) {
		return (isEnds(b) || b === 'EXACT') && fragmentB.endsWith(fragmentA);
	}

	if (a === 'EXACT') {
		return b === 'EXACT' && fragmentB === fragmentA;
	}

	return false;
}

/**
 * Finds rules that can never apply because an earlier enabled rule already catches every URL they
 * would match. Returns a map of shadowed rule id to the rule shadowing it. Only plain-text
 * detection types are analysed; regex rules are never reported (that can't be decided reliably).
 */
export function _findShadowedRules(rules: Rule[]): Map<string, Rule> {
	const shadowed = new Map<string, Rule>();

	rules.forEach((later, laterIndex) => {
		if (later.is_enabled === false || !later.url_fragment) {
			return;
		}

		for (let i = 0; i < laterIndex; i++) {
			const earlier = rules[i];

			if (earlier.is_enabled === false) {
				continue;
			}

			if (_isSubsumedBy(earlier, later)) {
				shadowed.set(later.id, earlier);
				return;
			}
		}
	});

	return shadowed;
}
