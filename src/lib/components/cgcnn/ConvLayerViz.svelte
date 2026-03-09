<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import type { ConvLayer, Atom } from '$lib/stores/modelData';
	import { hoveredAtom } from '$lib/stores/modelData';
	import { gateColorScale } from '$lib/utils/colorScales';

	interface Props {
		layer: ConvLayer;
		atoms: Atom[];
		isExpanded: boolean;
		onToggle: () => void;
	}

	let { layer, atoms, isExpanded, onToggle }: Props = $props();
	let gateSvg = $state<SVGSVGElement>();

	const barWidth = 60;
	const barHeight = 14;

	onMount(() => {
		if (isExpanded) renderGates();
	});

	$effect(() => {
		if (isExpanded && gateSvg) renderGates();
	});

	function renderGates() {
		if (!gateSvg) return;
		const svg = d3.select(gateSvg);
		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', 'translate(60, 10)');

		layer.gate_values.forEach((row, i) => {
			g.append('text')
				.attr('x', -8)
				.attr('y', i * (barHeight + 4) + barHeight / 2 + 4)
				.attr('text-anchor', 'end')
				.attr('fill', '#94a3b8')
				.attr('font-size', '10px')
				.text(atoms[i]?.element ?? `#${i}`);

			row.forEach((val, j) => {
				g.append('rect')
					.attr('x', j * (barWidth / row.length + 1))
					.attr('y', i * (barHeight + 4))
					.attr('width', barWidth / row.length - 1)
					.attr('height', barHeight)
					.attr('rx', 1)
					.attr('fill', gateColorScale(val))
					.attr('opacity', 0.85)
					.append('title')
					.text(`gate[${i}][${j}] = ${val.toFixed(3)}`);
			});
		});
	}
</script>

<div class="rounded-lg border border-slate-600 bg-slate-800/80 transition-all duration-300">
	<button
		class="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-700/50 transition-colors"
		onclick={onToggle}
	>
		<div class="flex items-center gap-3">
			<div class="flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/20 text-sky-400 text-xs font-bold">
				{layer.layer_index + 1}
			</div>
			<div>
				<span class="text-sm font-medium text-slate-200">Conv Layer {layer.layer_index + 1}</span>
				<span class="ml-2 text-xs text-slate-500">{layer.description}</span>
			</div>
		</div>
		<svg
			class="h-4 w-4 text-slate-400 transition-transform duration-200"
			class:rotate-180={isExpanded}
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</button>

	{#if isExpanded}
		<div class="border-t border-slate-700 px-4 py-4 space-y-4">
			<!-- Operation diagram -->
			<div class="flex items-center gap-2 text-xs text-slate-400 overflow-x-auto pb-2">
				<div class="flex flex-col items-center gap-1 shrink-0">
					<div class="rounded bg-pink-500/20 px-2 py-1 text-pink-300">atom_i</div>
				</div>
				<span class="text-slate-600 shrink-0">+</span>
				<div class="flex flex-col items-center gap-1 shrink-0">
					<div class="rounded bg-blue-500/20 px-2 py-1 text-blue-300">nbr_j</div>
				</div>
				<span class="text-slate-600 shrink-0">+</span>
				<div class="flex flex-col items-center gap-1 shrink-0">
					<div class="rounded bg-amber-500/20 px-2 py-1 text-amber-300">bond_ij</div>
				</div>
				<span class="text-slate-600 shrink-0">&rarr;</span>
				<div class="rounded bg-slate-600 px-2 py-1 text-slate-300 shrink-0">concat</div>
				<span class="text-slate-600 shrink-0">&rarr;</span>
				<div class="rounded bg-slate-600 px-2 py-1 text-slate-300 shrink-0">FC + BN</div>
				<span class="text-slate-600 shrink-0">&rarr;</span>
				<div class="flex gap-1 shrink-0">
					<div class="rounded bg-orange-500/20 px-2 py-1 text-orange-300">&sigma;</div>
					<span class="text-slate-600">&odot;</span>
					<div class="rounded bg-green-500/20 px-2 py-1 text-green-300">softplus</div>
				</div>
				<span class="text-slate-600 shrink-0">&rarr;</span>
				<div class="rounded bg-purple-500/20 px-2 py-1 text-purple-300 shrink-0">&Sigma; agg</div>
				<span class="text-slate-600 shrink-0">&rarr;</span>
				<div class="rounded bg-cyan-500/20 px-2 py-1 text-cyan-300 shrink-0">BN + softplus</div>
			</div>

			<!-- Gate values heatmap -->
			<div>
				<p class="mb-2 text-xs font-medium text-slate-400">Gate Values (sigmoid output)</p>
				<svg bind:this={gateSvg} width={200} height={layer.gate_values.length * 18 + 20}></svg>
				<div class="mt-1 flex items-center gap-2 text-xs text-slate-500">
					<div
						class="h-2 w-16 rounded"
						style="background: linear-gradient(to right, #fef9c3, #ea580c)"
					></div>
					<span>0 &rarr; 1 (gate strength)</span>
				</div>
			</div>
		</div>
	{/if}
</div>
