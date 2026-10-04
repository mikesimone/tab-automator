export default {
	content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx,html}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ['Quicksand', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			},
		},
	},
	plugins: [require('daisyui')],
	daisyui: {
		themes: [
			'dim',
			'light',
			'dark',
			'cupcake',
			'valentine',
			'halloween',
			{
				// Pastel purple and pink on a near-black amethyst ground, shared with Chatshot.
				// Danger is a dusty rose rather than red.
				amethyst: {
					'color-scheme': 'dark',
					primary: '#c2a0e2',
					'primary-content': '#1c1526',
					secondary: '#ff8fd0',
					'secondary-content': '#1c1526',
					accent: '#a784c6',
					'accent-content': '#1c1526',
					neutral: '#2e2340',
					'neutral-content': '#f1e9fa',
					'base-100': '#1c1526',
					'base-200': '#241b30',
					'base-300': '#160f1e',
					'base-content': '#f1e9fa',
					info: '#7dd6e8',
					'info-content': '#1c1526',
					success: '#a6d2a0',
					'success-content': '#1c1526',
					warning: '#e0b066',
					'warning-content': '#1c1526',
					error: '#e08bb0',
					'error-content': '#1c1526',
				},
			},
			{
				'amethyst-light': {
					'color-scheme': 'light',
					primary: '#a784c6',
					'primary-content': '#fffbff',
					secondary: '#e0559e',
					'secondary-content': '#fffbff',
					accent: '#c2a0e2',
					'accent-content': '#2e1a3d',
					neutral: '#2e1a3d',
					'neutral-content': '#f6f1fb',
					'base-100': '#fffcff',
					'base-200': '#f6f1fb',
					'base-300': '#eadff4',
					'base-content': '#2e1a3d',
					info: '#4fa9c4',
					'info-content': '#ffffff',
					success: '#6fae6a',
					'success-content': '#ffffff',
					warning: '#cf9a45',
					'warning-content': '#2e1a3d',
					error: '#c1567f',
					'error-content': '#ffffff',
				},
			},
			{
				tabee: {
					primary: '#fbbf24', // Amber-400 - Jaune d'abeille
					'primary-content': '#0a0a0a', // Texte foncé sur jaune
					secondary: '#f59e0b', // Amber-500 - Orange miel
					'secondary-content': '#0a0a0a', // Texte foncé sur orange
					accent: '#fde047', // Yellow-300 - Jaune clair
					'accent-content': '#0a0a0a', // Texte foncé
					neutral: '#1f1f1f', // Gris très foncé
					'neutral-content': '#e5e7eb', // Texte clair
					'base-100': '#161616', // Fond presque noir
					'base-200': '#141414', // Fond très sombre
					'base-300': '#121212', // Fond sombre
					'base-content': '#e5e7eb', // Texte principal clair
					info: '#3b82f6', // Bleu info
					'info-content': '#ffffff', // Texte blanc sur bleu
					success: '#10b981', // Vert succès
					'success-content': '#ffffff', // Texte blanc sur vert
					warning: '#f59e0b', // Orange warning (miel)
					'warning-content': '#0a0a0a', // Texte foncé sur orange
					error: '#ef4444', // Rouge erreur
					'error-content': '#ffffff', // Texte blanc sur rouge
				},
			},
		],
		base: true, // applies background color and foreground color for root element by default
		styled: true, // include daisyUI colors and design decisions for all components
		utils: true, // adds responsive and modifier utility classes
		prefix: '', // prefix for daisyUI classnames (components, modifiers and responsive class names. Not colors)
		logs: true, // Shows info about daisyUI version and used config in the console when building your CSS
		themeRoot: ':root', // The element that receives theme color CSS variables
	},
};
