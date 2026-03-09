import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'dark' | 'light';

function createThemeStore() {
	const initial: Theme = browser
		? (localStorage.getItem('gnn-theme') as Theme) || 'dark'
		: 'dark';

	const { subscribe, set, update } = writable<Theme>(initial);

	return {
		subscribe,
		toggle() {
			update((current) => {
				const next: Theme = current === 'dark' ? 'light' : 'dark';
				if (browser) {
					localStorage.setItem('gnn-theme', next);
					document.documentElement.setAttribute('data-theme', next);
				}
				return next;
			});
		},
		init() {
			if (browser) {
				const saved = localStorage.getItem('gnn-theme') as Theme | null;
				const theme = saved || 'dark';
				set(theme);
				document.documentElement.setAttribute('data-theme', theme);
			}
		}
	};
}

export const theme = createThemeStore();
