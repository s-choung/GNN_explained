<script lang="ts">
	import { onMount } from 'svelte';
	import { modelData } from '$lib/stores/modelData';
	import type { CgcnnData } from '$lib/stores/modelData';
	import { theme } from '$lib/stores/theme';
	import { base } from '$app/paths';
	import ArchitectureDiagram from '$lib/components/ArchitectureDiagram.svelte';
	import SankeyDiagram from '$lib/components/SankeyDiagram.svelte';

	let data: CgcnnData | null = $state(null);
	let loaded = $state(false);
	let currentTheme = $state<'dark' | 'light'>('dark');
	let activeModel = $state('cgcnn');
	let activeView = $state<'architecture' | 'sankey'>('architecture');

	const models = [
		{ id: 'cgcnn', label: 'CGCNN', enabled: true },
		{ id: 'nequip', label: 'NequIP', enabled: false },
		{ id: 'mace', label: 'MACE', enabled: false },
		{ id: 'equiformer', label: 'Equiformer', enabled: false },
	];

	theme.subscribe((v) => { currentTheme = v; });

	onMount(async () => {
		theme.init();
		const res = await fetch(`${base}/data/cgcnn_placeholder.json`);
		const json: CgcnnData = await res.json();
		data = json;
		modelData.set(json);
		requestAnimationFrame(() => { loaded = true; });
	});
</script>

<div class="page-root">
	<!-- Header -->
	<header class="header">
		<div class="mx-auto px-6 py-2.5">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<h1 class="text-base font-bold tracking-tight" style="font-family:'JetBrains Mono',monospace; color: var(--text)">
						GNN<span style="color: var(--accent)">_</span>Explainer
					</h1>
				</div>
				<div class="flex items-center gap-3">
					{#if data}
						<div class="flex items-center gap-2 rounded-md px-3 py-1" style="border: 1px solid var(--border); background: var(--surface2)">
							{#each [...new Set(data.crystal.atoms.map(a => a.element))] as el}
								<span class="flex items-center gap-1 text-[11px]">
									<span class="w-1.5 h-1.5 rounded-full" style="background:{data.crystal.atoms.find(a => a.element === el)?.color}"></span>
									<span style="color: var(--text2)">{el}</span>
								</span>
							{/each}
							<span style="color: var(--text5)">|</span>
							<span class="text-xs font-bold" style="color: var(--text)">{data.crystal.formula}</span>
						</div>
					{/if}
					<!-- Theme toggle -->
					<button class="theme-btn" onclick={() => theme.toggle()} title="Toggle light/dark mode">
						{#if currentTheme === 'dark'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
							</svg>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
							</svg>
						{/if}
					</button>
				</div>
			</div>
		</div>
	</header>

	{#if data}
		<main class="main-content">
			<!-- Model selector + View toggle bar -->
			<div class="toolbar">
				<!-- Model tabs -->
				<div class="model-tabs">
					{#each models as model}
						{#if model.enabled}
							<button class="model-tab" class:model-tab-active={activeModel === model.id}
								onclick={() => { activeModel = model.id; }}>
								{model.label}
							</button>
						{:else}
							<button class="model-tab model-tab-disabled" disabled title="Coming soon">
								{model.label}
								<span class="coming-soon">soon</span>
							</button>
						{/if}
					{/each}
				</div>

				<!-- View toggle -->
				<div class="view-toggle">
					<button class="view-btn" class:view-btn-active={activeView === 'architecture'}
						onclick={() => { activeView = 'architecture'; }}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
						</svg>
						Architecture
					</button>
					<button class="view-btn" class:view-btn-active={activeView === 'sankey'}
						onclick={() => { activeView = 'sankey'; }}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M3 3v18M21 3v18M3 12h18M3 6h9M12 6v12M3 18h9"/>
						</svg>
						Sankey
					</button>
				</div>
			</div>

			<!-- Subtle instruction -->
			<div class="px-6 py-1 text-center">
				<p class="text-[10px]" style="color: var(--text3)">
					{#if activeView === 'architecture'}
						Click layers to inspect &middot; Hover atoms for cross-highlighting
					{:else}
						Hover nodes to trace data flow through the network
					{/if}
				</p>
			</div>

			<!-- Main content -->
			<div class="page-enter" class:page-visible={loaded}>
				{#if activeView === 'architecture'}
					<ArchitectureDiagram {data} />
				{:else}
					<SankeyDiagram {data} />
				{/if}
			</div>
		</main>

		<!-- Footer -->
		<footer class="footer">
			<p class="text-[10px]" style="color: var(--text4)">
				Made by <span class="font-medium" style="color: var(--text2)">Seokhyun Choung</span>
			</p>
			<p class="text-[9px]" style="color: var(--text5)">
				Inspired by <a href="https://poloclub.github.io/transformer-explainer/" class="footer-link" target="_blank" rel="noopener">Transformer Explainer</a> (PoloClub)
				&middot; CGCNN: Xie &amp; Grossman, PRL 2018
			</p>
		</footer>
	{:else}
		<div class="flex h-[80vh] items-center justify-center">
			<div class="text-center">
				<div class="loader"></div>
				<p class="mt-4 text-xs" style="color: var(--text3)">Loading model...</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.page-root {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		transition: background 0.3s;
	}
	.header {
		position: sticky;
		top: 0;
		z-index: 50;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--bg) 95%, transparent);
		backdrop-filter: blur(12px);
	}
	.main-content {
		flex: 1;
	}

	/* ===== TOOLBAR ===== */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 8px 24px;
		flex-wrap: wrap;
	}
	.model-tabs {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 8px;
		background: var(--surface2);
		border: 1px solid var(--border);
	}
	.model-tab {
		font: 600 11px/1 'JetBrains Mono', monospace;
		padding: 6px 14px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: var(--text3);
		cursor: pointer;
		transition: all 0.2s;
		letter-spacing: 0.3px;
	}
	.model-tab:hover:not(:disabled) {
		color: var(--text);
		background: var(--layer-bg);
	}
	.model-tab-active {
		background: var(--accent) !important;
		color: #0f172a !important;
	}
	.model-tab-disabled {
		opacity: 0.45;
		cursor: not-allowed !important;
		position: relative;
	}
	.coming-soon {
		font-size: 7px;
		font-weight: 400;
		color: var(--text4);
		margin-left: 3px;
		font-style: italic;
		letter-spacing: 0;
	}

	/* ===== VIEW TOGGLE ===== */
	.view-toggle {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 8px;
		background: var(--surface2);
		border: 1px solid var(--border);
	}
	.view-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		font: 500 10px/1 'JetBrains Mono', monospace;
		padding: 5px 10px;
		border-radius: 5px;
		border: none;
		background: transparent;
		color: var(--text3);
		cursor: pointer;
		transition: all 0.2s;
	}
	.view-btn:hover {
		color: var(--text);
		background: var(--layer-bg);
	}
	.view-btn-active {
		background: var(--layer-hover-bg) !important;
		color: var(--accent) !important;
		box-shadow: 0 1px 4px rgba(0,0,0,0.1);
	}

	.footer {
		border-top: 1px solid var(--border);
		padding: 12px 24px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: auto;
	}
	.footer-link {
		color: var(--text3);
		transition: color 0.2s;
	}
	.footer-link:hover {
		color: var(--accent);
	}
	.theme-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--surface2);
		color: var(--text2);
		cursor: pointer;
		transition: all 0.2s;
	}
	.theme-btn:hover {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--layer-bg);
	}
	.page-enter {
		opacity: 0;
		transform: translateY(8px);
		transition: all 0.6s ease-out;
	}
	.page-visible {
		opacity: 1;
		transform: translateY(0);
	}
	.loader {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin: 0 auto;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
