<script lang="ts">
	import { onMount } from 'svelte';
	import { modelData } from '$lib/stores/modelData';
	import { theme } from '$lib/stores/theme';
	import { base } from '$app/paths';
	import { crystals } from '$lib/cgcnn/structures';
	import { buildCgcnnData } from '$lib/cgcnn/engine';
	import { TOUR_STEPS_EN, UI_EN } from '$lib/i18n/en';
	import { TOUR_STEPS_KO, UI_KO } from '$lib/i18n/ko';
	import ArchitectureDiagram from '$lib/components/ArchitectureDiagram.svelte';
	import ExplainerArticle from '$lib/components/ExplainerArticle.svelte';
	import ExplainerArticleKo from '$lib/components/ExplainerArticleKo.svelte';

	let loaded = $state(false);
	let currentTheme = $state<'dark' | 'light'>('light');
	let activeModel = $state('cgcnn');
	let lang = $state<'en' | 'ko'>('en');

	// Playable state: everything below recomputes the live CGCNN forward pass
	let structureId = $state('sto');
	let cutoff = $state(4.0);
	let playStep = $state(-1); // -1 idle · 0..2 conv hop being animated · 3 done
	let playTimer: ReturnType<typeof setInterval> | null = null;

	const data = $derived(buildCgcnnData(structureId, cutoff));
	const T = $derived(lang === 'ko' ? UI_KO : UI_EN);
	const tourSteps = $derived(lang === 'ko' ? TOUR_STEPS_KO : TOUR_STEPS_EN);

	const models = [
		{ id: 'cgcnn', label: 'CGCNN', enabled: true },
		{ id: 'nequip', label: 'NequIP', enabled: false },
		{ id: 'mace', label: 'MACE', enabled: false },
		{ id: 'equiformer', label: 'Equiformer', enabled: false },
	];

	theme.subscribe((v) => { currentTheme = v; });

	$effect(() => {
		modelData.set(data);
	});

	onMount(() => {
		theme.init();
		const savedLang = localStorage.getItem('gnn-lang');
		if (savedLang === 'ko' || savedLang === 'en') lang = savedLang;
		requestAnimationFrame(() => { loaded = true; });
		return () => { if (playTimer) clearInterval(playTimer); };
	});

	function toggleLang() {
		lang = lang === 'en' ? 'ko' : 'en';
		localStorage.setItem('gnn-lang', lang);
	}

	function playMessagePassing() {
		if (playTimer) return;
		playStep = 0;
		playTimer = setInterval(() => {
			playStep += 1;
			if (playStep >= 3) {
				if (playTimer) clearInterval(playTimer);
				playTimer = null;
				setTimeout(() => { playStep = -1; }, 1400);
			}
		}, 1100);
	}

	// ===== Guided walkthrough (Transformer-Explainer-style Next stepping) =====
	let tourIdx = $state(-1);
	const tourStage = $derived(tourIdx >= 0 ? tourSteps[tourIdx].stage : null);

	function startTour() {
		if (playTimer) { clearInterval(playTimer); playTimer = null; }
		playStep = -1;
		tourIdx = 0;
	}
	function nextTour() {
		tourIdx = tourIdx >= tourSteps.length - 1 ? -1 : tourIdx + 1;
	}
	function prevTour() {
		if (tourIdx > 0) tourIdx -= 1;
	}
	function exitTour() {
		tourIdx = -1;
	}
</script>

<div class="page-root">
	<!-- Header -->
	<header class="header">
		<div class="header-inner">
			<h1 class="brand">GNN Explainer</h1>
			<div class="header-right">
				<div class="legend-pill">
					{#each [...new Set(data.crystal.atoms.map(a => a.element))] as el}
						<span class="legend-item">
							<span class="legend-dot" style="background:{data.crystal.atoms.find(a => a.element === el)?.color}"></span>
							<span class="legend-el">{el}</span>
						</span>
					{/each}
					<span class="legend-sep">&middot;</span>
					<span class="legend-formula">{data.crystal.formula}</span>
				</div>
				<!-- Language toggle -->
				<button class="lang-btn" onclick={toggleLang} title="Switch language">
					{lang === 'en' ? '한국어' : 'EN'}
				</button>
				<!-- Theme toggle -->
				<button class="theme-btn" onclick={() => theme.toggle()} title="Toggle light/dark mode" aria-label="Toggle light/dark mode">
					{#if currentTheme === 'dark'}
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
						</svg>
					{:else}
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
						</svg>
					{/if}
				</button>
			</div>
		</div>
	</header>

	<main class="main-content">
		<!-- Model selector -->
		<div class="toolbar">
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
		</div>

		<!-- Playable controls -->
		<div class="controls">
			<div class="control-group">
				<span class="control-label">{T.crystal}</span>
				{#each crystals as c}
					<button class="struct-chip" class:struct-chip-active={structureId === c.id}
						onclick={() => { structureId = c.id; }} title={c.description}>
						{c.formula}
					</button>
				{/each}
			</div>

			<div class="control-group">
				<label class="control-label" for="cutoff-slider">{T.cutoff}</label>
				<input id="cutoff-slider" class="cutoff-slider" type="range"
					min="2" max="6" step="0.1" bind:value={cutoff} />
				<span class="cutoff-value">r = {cutoff.toFixed(1)} &#8491;</span>
			</div>

			<button class="tour-start" onclick={startTour} disabled={tourIdx >= 0}>
				&#9654;&#xFE0E; {T.walkthrough}
			</button>

			<button class="play-btn" onclick={playMessagePassing} disabled={playStep >= 0 || tourIdx >= 0}>
				{#if playStep >= 0 && playStep < 3}
					{T.hop(playStep + 1)}
				{:else if playStep === 3}
					{T.done}
				{:else}
					{T.play}
				{/if}
			</button>
		</div>

		<!-- Walkthrough card -->
		{#if tourIdx >= 0}
			<div class="tour-card">
				<div class="tour-head">
					<span class="tour-count">{T.stepOf(tourIdx + 1, tourSteps.length)}</span>
					<span class="tour-title">{tourSteps[tourIdx].title}</span>
					<button class="tour-exit" onclick={exitTour} aria-label="Exit walkthrough">&#10005;</button>
				</div>
				<p class="tour-body">{tourSteps[tourIdx].body(data)}</p>
				<div class="tour-nav">
					<button class="tour-back" onclick={prevTour} disabled={tourIdx === 0}>{T.back}</button>
					<div class="tour-dots">
						{#each tourSteps as _, i}
							<span class="tour-dot" class:tour-dot-active={i === tourIdx}></span>
						{/each}
					</div>
					<button class="tour-next" onclick={nextTour}>
						{tourIdx === tourSteps.length - 1 ? T.finish : T.next}
					</button>
				</div>
			</div>
		{/if}

		<!-- Subtle instruction -->
		<div class="instruction">{T.instruction}</div>

		<!-- Main content -->
		<div class="page-enter" class:page-visible={loaded}>
			<ArchitectureDiagram {data} {structureId} imgBase={`${base}/img`} {playStep} {tourStage} {lang} />
		</div>

		<!-- Article -->
		{#if lang === 'ko'}
			<ExplainerArticleKo {data} {structureId} imgBase={`${base}/img`} />
		{:else}
			<ExplainerArticle {data} {structureId} imgBase={`${base}/img`} />
		{/if}
	</main>

	<!-- Footer -->
	<footer class="footer">
		<p class="footer-line">
			Made by <span class="footer-name">Seokhyun Choung</span>
		</p>
		<p class="footer-line footer-line-sub">
			Inspired by <a href="https://poloclub.github.io/transformer-explainer/" class="footer-link" target="_blank" rel="noopener">Transformer Explainer</a> (PoloClub)
			&middot; CGCNN: Xie &amp; Grossman, PRL 2018
		</p>
	</footer>
</div>

<style>
	.page-root {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		transition: background 0.3s;
	}

	/* ===== HEADER ===== */
	.header {
		position: sticky;
		top: 0;
		z-index: 50;
		border-bottom: 1px solid var(--border);
		background: var(--bg);
	}
	.header-inner {
		max-width: 1200px;
		margin: 0 auto;
		height: 64px;
		padding: 0 24px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.brand {
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--text);
	}
	.header-right {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.legend-pill {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 16px;
		border-radius: var(--radius-pill);
		background: var(--surface2);
	}
	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}
	.legend-el {
		font-size: 15px;
		font-weight: 500;
		color: var(--text2);
	}
	.legend-sep {
		color: var(--text5);
		font-size: 15px;
	}
	.legend-formula {
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
	}
	.lang-btn {
		font-size: 14px;
		font-weight: 500;
		line-height: 1;
		padding: 9px 14px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border2);
		background: transparent;
		color: var(--text);
		cursor: pointer;
		transition: background 0.2s;
	}
	.lang-btn:hover {
		background: var(--surface2);
	}
	.theme-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border2);
		background: transparent;
		color: var(--text);
		cursor: pointer;
		transition: background 0.2s;
	}
	.theme-btn:hover {
		background: var(--surface2);
	}

	.main-content {
		flex: 1;
	}

	/* ===== TOOLBAR ===== */
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: 24px 24px 8px;
		flex-wrap: wrap;
	}
	.model-tabs {
		display: flex;
		gap: 6px;
	}
	.model-tab {
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		padding: 9px 16px;
		border-radius: var(--radius-soft);
		border: none;
		background: var(--surface2);
		color: var(--text);
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}
	.model-tab:hover:not(:disabled):not(.model-tab-active) {
		background: var(--layer-hover-bg);
	}
	.model-tab-active {
		background: var(--accent);
		color: var(--bg);
	}
	.model-tab-disabled {
		color: var(--text5);
		cursor: not-allowed;
	}
	.coming-soon {
		font-size: 14px;
		font-weight: 400;
		color: var(--text5);
		margin-left: 4px;
	}

	/* ===== PLAYABLE CONTROLS ===== */
	.controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 24px;
		padding: 10px 24px 4px;
		flex-wrap: wrap;
	}
	.control-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.control-label {
		font-size: 14px;
		font-weight: 500;
		color: var(--text2);
		letter-spacing: 0.011em;
		text-transform: uppercase;
	}
	.struct-chip {
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		padding: 8px 14px;
		border-radius: var(--radius-soft);
		border: none;
		background: var(--surface2);
		color: var(--text);
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}
	.struct-chip:hover:not(.struct-chip-active) {
		background: var(--layer-hover-bg);
	}
	.struct-chip-active {
		background: var(--accent);
		color: var(--bg);
	}
	.cutoff-slider {
		appearance: none;
		-webkit-appearance: none;
		width: 140px;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--surface);
		outline: none;
		cursor: pointer;
	}
	.cutoff-slider::-webkit-slider-thumb {
		appearance: none;
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--accent);
		cursor: grab;
	}
	.cutoff-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border: none;
		border-radius: 50%;
		background: var(--accent);
		cursor: grab;
	}
	.cutoff-value {
		font-size: 15px;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		min-width: 76px;
	}
	.play-btn,
	.tour-start {
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		padding: 10px 18px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--accent);
		color: var(--bg);
		cursor: pointer;
		box-shadow: var(--shadow-sm);
		transition: opacity 0.2s;
	}
	.play-btn {
		background: var(--surface2);
		color: var(--text);
		box-shadow: none;
		min-width: 180px;
	}
	.play-btn:disabled,
	.tour-start:disabled {
		opacity: 0.55;
		cursor: default;
	}

	/* ===== WALKTHROUGH CARD ===== */
	.tour-card {
		max-width: 720px;
		margin: 14px auto 0;
		padding: 18px 22px;
		border-radius: var(--radius-card);
		background: var(--detail-bg);
		text-align: left;
	}
	.tour-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}
	.tour-count {
		font-size: 15px;
		color: var(--text2);
		font-variant-numeric: tabular-nums;
	}
	.tour-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text);
		flex: 1;
	}
	.tour-exit {
		border: none;
		background: transparent;
		color: var(--text2);
		font-size: 15px;
		cursor: pointer;
		padding: 4px 9px;
		border-radius: var(--radius-pill);
	}
	.tour-exit:hover {
		background: var(--chip-bg);
		color: var(--text);
	}
	.tour-body {
		font-size: 16px;
		line-height: 1.6;
		color: var(--text);
		margin-bottom: 14px;
	}
	.tour-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.tour-back {
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		padding: 9px 16px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border2);
		background: transparent;
		color: var(--text);
		cursor: pointer;
		transition: background 0.2s;
	}
	.tour-back:hover:not(:disabled) {
		background: var(--surface2);
	}
	.tour-back:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.tour-next {
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		padding: 10px 18px;
		border-radius: var(--radius-pill);
		border: none;
		background: var(--accent);
		color: var(--bg);
		cursor: pointer;
		box-shadow: var(--shadow-sm);
	}
	.tour-dots {
		display: flex;
		gap: 5px;
	}
	.tour-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--surface);
	}
	.tour-dot-active {
		background: var(--accent);
	}

	/* ===== INSTRUCTION ===== */
	.instruction {
		padding: 6px 24px;
		text-align: center;
		font-size: 15px;
		color: var(--text2);
	}

	/* ===== FOOTER ===== */
	.footer {
		border-top: 1px solid var(--border);
		padding: 20px 24px;
		text-align: center;
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: auto;
	}
	.footer-line {
		font-size: 15px;
		color: var(--text2);
	}
	.footer-line-sub {
		color: var(--text2);
	}
	.footer-name {
		font-weight: 500;
		color: var(--text);
	}
	.footer-link {
		color: var(--text);
		transition: color 0.2s;
	}
	.footer-link:hover {
		text-decoration: underline;
	}

	/* ===== TRANSITIONS ===== */
	.page-enter {
		opacity: 0;
		transform: translateY(8px);
		transition: all 0.6s ease-out;
	}
	.page-visible {
		opacity: 1;
		transform: translateY(0);
	}
</style>
