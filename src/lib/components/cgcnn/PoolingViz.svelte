<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import type { Atom } from '$lib/stores/modelData';

	interface Props {
		perAtomContribution: number[];
		crystalFeature: number[];
		atoms: Atom[];
	}

	let { perAtomContribution, crystalFeature, atoms }: Props = $props();

	let barSvg: SVGSVGElement;
	const barWidth = 400;
	const barHeight = 180;

	onMount(() => {
		renderBars();
	});

	function renderBars() {
		if (!barSvg) return;

		const svg = d3.select(barSvg);
		svg.selectAll('*').remove();

		const margin = { top: 20, right: 20, bottom: 30, left: 50 };
		const w = barWidth - margin.left - margin.right;
		const h = barHeight - margin.top - margin.bottom;

		const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

		const x = d3
			.scaleBand()
			.domain(atoms.map((a) => `${a.element}#${a.index}`))
			.range([0, w])
			.padding(0.3);

		const y = d3
			.scaleLinear()
			.domain([0, d3.max(perAtomContribution) ?? 0.3])
			.nice()
			.range([h, 0]);

		// bars
		g.selectAll('rect')
			.data(perAtomContribution)
			.join('rect')
			.attr('x', (_, i) => x(`${atoms[i].element}#${atoms[i].index}`) ?? 0)
			.attr('y', (d) => y(d))
			.attr('width', x.bandwidth())
			.attr('height', (d) => h - y(d))
			.attr('rx', 3)
			.attr('fill', (_, i) => atoms[i].color)
			.attr('opacity', 0.8);

		// value labels
		g.selectAll('.val-label')
			.data(perAtomContribution)
			.join('text')
			.attr('class', 'val-label')
			.attr('x', (_, i) => (x(`${atoms[i].element}#${atoms[i].index}`) ?? 0) + x.bandwidth() / 2)
			.attr('y', (d) => y(d) - 5)
			.attr('text-anchor', 'middle')
			.attr('fill', '#cbd5e1')
			.attr('font-size', '10px')
			.text((d) => d.toFixed(3));

		// axes
		g.append('g')
			.attr('transform', `translate(0,${h})`)
			.call(d3.axisBottom(x))
			.selectAll('text')
			.attr('fill', '#94a3b8')
			.attr('font-size', '10px');

		g.append('g')
			.call(d3.axisLeft(y).ticks(4))
			.selectAll('text')
			.attr('fill', '#94a3b8')
			.attr('font-size', '10px');

		g.selectAll('.domain, .tick line').attr('stroke', '#475569');
	}
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
	<h3 class="mb-1 text-sm font-semibold text-slate-300 uppercase tracking-wider">
		Pooling & Readout
	</h3>
	<p class="mb-3 text-xs text-slate-500">
		Mean pooling aggregates atom-level features into a single crystal-level representation
	</p>

	<div class="flex flex-col lg:flex-row gap-4">
		<!-- Per-atom contribution bar chart -->
		<div>
			<p class="mb-1 text-xs font-medium text-slate-400">Per-Atom Contribution</p>
			<svg bind:this={barSvg} width={barWidth} height={barHeight}></svg>
		</div>

		<!-- Pooling arrow -->
		<div class="flex items-center justify-center">
			<div class="flex flex-col items-center gap-1">
				<div class="rounded bg-emerald-500/20 px-3 py-1 text-emerald-300 text-xs font-medium">
					mean( )
				</div>
				<svg width="40" height="20" class="text-emerald-400">
					<path d="M5 10 L35 10 M28 4 L35 10 L28 16" fill="none" stroke="currentColor" stroke-width="2" />
				</svg>
			</div>
		</div>

		<!-- Crystal feature preview -->
		<div class="flex flex-col justify-center">
			<p class="mb-1 text-xs font-medium text-slate-400">Crystal Feature (64-dim)</p>
			<div class="flex flex-wrap gap-[1px] max-w-[200px]">
				{#each crystalFeature.slice(0, 32) as val}
					<div
						class="h-3 w-3 rounded-[1px]"
						style="background-color: {val > 0 ? `rgba(56, 189, 248, ${Math.abs(val)})` : `rgba(248, 113, 113, ${Math.abs(val)})`}"
						title={val.toFixed(3)}
					></div>
				{/each}
				<span class="text-xs text-slate-500 mt-1">... +32 more</span>
			</div>
		</div>
	</div>
</div>
