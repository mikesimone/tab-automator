/**
 * Makes a handful of example strings that a regex matches, so rules can be compared by trying
 * each other's examples. Every alternative (a|b|c) shows up in at least one example. Deterministic:
 * the same pattern always gives the same examples.
 *
 * Only the common subset of regex syntax is understood. Lookarounds, backreferences and other
 * rarities make it give up and return [], because a wrong example is worse than none.
 */

type Node =
	| { kind: 'alt'; options: Node[] }
	| { kind: 'seq'; items: { node: Node; min: number; max: number }[] }
	| { kind: 'text'; value: string };

class Unsupported extends Error {}

const ESCAPES: Record<string, string> = {
	d: '0',
	D: 'a',
	w: 'a',
	W: '-',
	s: ' ',
	S: 'a',
	t: '\t',
	n: '\n',
	r: '\r',
	f: '\f',
	v: '\v',
	b: '',
	B: '',
};

// Characters tried, in order, as the stand-in for a character class or a dot.
const CLASS_CANDIDATES = 'axz09-._/:?=&%~AZ';

function _parse(pattern: string): Node {
	let pos = 0;

	const peek = () => pattern[pos];

	function parseAlt(): Node {
		const options = [parseSeq()];
		while (peek() === '|') {
			pos++;
			options.push(parseSeq());
		}
		return options.length === 1 ? options[0] : { kind: 'alt', options };
	}

	function parseSeq(): Node {
		const items: { node: Node; min: number; max: number }[] = [];

		while (pos < pattern.length && peek() !== '|' && peek() !== ')') {
			const node = parseAtom();
			const [min, max] = parseQuantifier();
			items.push({ node, min, max });
		}

		return { kind: 'seq', items };
	}

	function parseQuantifier(): [number, number] {
		let min = 1;
		let max = 1;
		const c = peek();

		if (c === '?') {
			min = 0;
			pos++;
		} else if (c === '*') {
			min = 0;
			max = Infinity;
			pos++;
		} else if (c === '+') {
			max = Infinity;
			pos++;
		} else if (c === '{') {
			const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(pos));
			if (!match) return [1, 1]; // A literal "{"; parseAtom handles it next time round.
			min = Number(match[1]);
			max = match[2] === undefined ? min : match[3] ? Number(match[3]) : Infinity;
			pos += match[0].length;
		} else {
			return [1, 1];
		}

		if (peek() === '?') pos++; // Lazy makes no difference to what can match.
		return [min, max];
	}

	function parseEscape(): string {
		const c = pattern[pos++];
		if (c === undefined) throw new Unsupported('trailing backslash');
		if (c in ESCAPES) return ESCAPES[c];
		if (/[1-9]/.test(c) || c === 'k') throw new Unsupported('backreference');
		if (c === 'x') {
			const hex = pattern.slice(pos, pos + 2);
			pos += 2;
			return String.fromCharCode(parseInt(hex, 16));
		}
		if (c === 'u') {
			const hex = pattern.slice(pos, pos + 4);
			pos += 4;
			return String.fromCharCode(parseInt(hex, 16));
		}
		if (c === 'c' || c === 'p' || c === 'P' || c === '0') throw new Unsupported(`\\${c}`);
		return c;
	}

	function parseClass(): string {
		pos++; // [
		const negated = peek() === '^';
		if (negated) pos++;

		const singles: string[] = [];
		const ranges: [string, string][] = [];
		let first = true;

		while (pos < pattern.length && (peek() !== ']' || first)) {
			first = false;
			let c = pattern[pos++];
			if (c === '\\') {
				const e = pattern[pos];
				if (e === 'd') ranges.push(['0', '9']);
				else if (e === 'w') ranges.push(['a', 'z'], ['A', 'Z'], ['0', '9'], ['_', '_']);
				else if (e === 's') singles.push(' ');
				if ('dws'.includes(e)) {
					pos++;
					continue;
				}
				if ('DWS'.includes(e)) throw new Unsupported('negated class escape in class');
				c = parseEscape();
			}
			if (peek() === '-' && pattern[pos + 1] !== ']' && pos + 1 < pattern.length) {
				pos++;
				let end = pattern[pos++];
				if (end === '\\') end = parseEscape();
				ranges.push([c, end]);
			} else {
				singles.push(c);
			}
		}

		if (peek() !== ']') throw new Unsupported('unterminated class');
		pos++;

		const inClass = (ch: string) =>
			singles.includes(ch) || ranges.some(([lo, hi]) => ch >= lo && ch <= hi);

		if (!negated) {
			// Prefer something URL-ish from the class, else its first member.
			const pick = [...CLASS_CANDIDATES].find(inClass) ?? singles[0] ?? ranges[0]?.[0];
			if (pick === undefined) throw new Unsupported('empty class');
			return pick;
		}

		const pick = [...CLASS_CANDIDATES].find((ch) => !inClass(ch));
		if (pick === undefined) throw new Unsupported('negated class excludes every candidate');
		return pick;
	}

	function parseAtom(): Node {
		const c = peek();

		if (c === '(') {
			pos++;
			if (peek() === '?') {
				const next = pattern[pos + 1];
				if (next === ':') {
					pos += 2;
				} else if (next === '<' && /[A-Za-z]/.test(pattern[pos + 2] ?? '')) {
					const close = pattern.indexOf('>', pos);
					if (close < 0) throw new Unsupported('bad group name');
					pos = close + 1;
				} else {
					throw new Unsupported('lookaround');
				}
			}
			const inner = parseAlt();
			if (peek() !== ')') throw new Unsupported('unbalanced group');
			pos++;
			return inner;
		}

		if (c === '[') return { kind: 'text', value: parseClass() };

		pos++;
		if (c === '\\') return { kind: 'text', value: parseEscape() };
		if (c === '.') return { kind: 'text', value: 'a' };
		if (c === '^' || c === '$') return { kind: 'text', value: '' };
		if (c === '*' || c === '+' || c === '?') throw new Unsupported('dangling quantifier');
		return { kind: 'text', value: c };
	}

	const tree = parseAlt();
	if (pos !== pattern.length) throw new Unsupported('unbalanced group');
	return tree;
}

/**
 * Example strings for a node. Instead of every combination (which explodes), example k uses
 * choice k of every part (or the part's last choice when it has fewer), so each choice appears.
 */
function _examples(node: Node, limit: number): string[] {
	if (node.kind === 'text') return [node.value];

	if (node.kind === 'alt') {
		const out: string[] = [];
		for (const option of node.options) {
			for (const example of _examples(option, limit)) {
				if (out.length >= limit) return out;
				if (!out.includes(example)) out.push(example);
			}
		}
		return out;
	}

	const parts = node.items.map(({ node: inner, min, max }) => {
		const base = _examples(inner, limit);
		const counts = min === 0 ? [1, 0] : [min];
		if (max > min && min > 0) counts.push(min + 1);
		const choices: string[] = [];
		for (const count of counts) {
			for (const example of base) {
				const repeated = example.repeat(Math.min(count, 64));
				if (!choices.includes(repeated)) choices.push(repeated);
			}
		}
		return choices;
	});

	const width = Math.min(limit, Math.max(1, ...parts.map((p) => p.length)));
	const out: string[] = [];
	for (let k = 0; k < width; k++) {
		const example = parts.map((choices) => choices[Math.min(k, choices.length - 1)]).join('');
		if (!out.includes(example)) out.push(example);
	}
	return out;
}

/** Up to `limit` strings the pattern should match, or [] when the pattern can't be sampled. */
export function _regexSamples(pattern: string, limit = 200): string[] {
	try {
		return _examples(_parse(pattern), limit);
	} catch {
		return [];
	}
}
