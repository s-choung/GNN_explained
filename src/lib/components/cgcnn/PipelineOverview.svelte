<script lang="ts">
	import { expandedSection } from '$lib/stores/modelData';

	const stages = [
		{ id: 'input', label: 'Crystal\nStructure', icon: '🔷', color: 'sky' },
		{ id: 'graph', label: 'Graph\nConstruction', icon: '🔗', color: 'violet' },
		{ id: 'embedding', label: 'Atom\nEmbedding', icon: '📊', color: 'amber' },
		{ id: 'conv', label: 'Graph\nConvolution', icon: '🔄', color: 'blue' },
		{ id: 'pooling', label: 'Pooling', icon: '📉', color: 'emerald' },
		{ id: 'prediction', label: 'Prediction', icon: '🎯', color: 'green' }
	];

	function scrollToSection(id: string) {
		expandedSection.set(id);
		const el = document.getElementById(`section-${id}`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
	<h3 class="mb-4 text-sm font-semibold text-slate-300 uppercase tracking-wider">
		CGCNN Inference Pipeline
	</h3>
	<div class="flex items-center gap-1 overflow-x-auto pb-2">
		{#each stages as stage, i}
			<button
				class="flex flex-col items-center gap-1 rounded-lg px-3 py-2 text-center transition-all hover:bg-slate-700/50 shrink-0
					{$expandedSection === stage.id ? 'bg-slate-700 ring-1 ring-sky-500/50' : ''}"
				onclick={() => scrollToSection(stage.id)}
			>
				<span class="text-lg">{stage.icon}</span>
				<span class="text-xs text-slate-400 whitespace-pre-line leading-tight">{stage.label}</span>
			</button>
			{#if i < stages.length - 1}
				<svg width="24" height="16" class="text-slate-600 shrink-0">
					<path d="M2 8 L20 8 M14 3 L20 8 L14 13" fill="none" stroke="currentColor" stroke-width="1.5" />
				</svg>
			{/if}
		{/each}
	</div>
</div>
