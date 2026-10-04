import { describe, expect, it } from 'vitest';
import { _getThemes } from '../helpers';
import { _getDefaultTabModifierSettings } from '../storage';

describe('themes', () => {
	it('offers the Amethyst themes first, dark then light', () => {
		const values = _getThemes().map((theme) => theme.value);

		expect(values.slice(0, 2)).toEqual(['amethyst', 'amethyst-light']);
	});

	it('keeps the older themes available', () => {
		const values = _getThemes().map((theme) => theme.value);

		expect(values).toEqual(expect.arrayContaining(['tabee', 'dim', 'dark', 'light']));
	});

	it('uses Amethyst for new installs', () => {
		expect(_getDefaultTabModifierSettings().settings.theme).toBe('amethyst');
	});

	it('lists every theme once', () => {
		const values = _getThemes().map((theme) => theme.value);

		expect(new Set(values).size).toBe(values.length);
	});
});
