<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { hoveredAtom } from '$lib/stores/modelData';
	import { featureColorScale } from '$lib/utils/colorScales';

	interface Props {
		features: number[][];
		labels: string[];
		title: string;
		maxCols?: number;
	}

	let { features, labels, title, maxCols = 16 }: Props = $props();

	let svgEl: SVGSVGElement;
	const cellSize = 18;
	const labelWidth = 50;
	const gap = 1;

	let displayCols = $derived(Math.min(features[0]?.length ?? 0, maxCols));
	let svgWidth = $derived(labelWidth + displayCols * (cellSize + gap) + 20);
	let svgHeight = $derived(features.length * (cellSize + gap) + 30);

	onMount(() => {
		renderHeatmap();
	});

	$effect(() => {
		features;
		renderHeatmap();
	});

	function renderHeatmap() {
		if (!svgEl || !features.length) return;

		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();

		const g = svg.append('g').attr('transform', `translate(${labelWidth}, 20)`);

		// column indices
		for (let j = 0; j < displayCols; j++) {
			g.append('text')
				.attr('x', j * (cellSize + gap) + cellSize / 2)
				.attr('y', -5)
				.attr('text-anchor', 'middle')
				.attr('fill', '#64748b')
				.attr('font-size', '7px')
				.text(j);
		}

		features.forEach((row, i) => {
			// row label
			g.append('text')
				.attr('x', -8)
				.attr('y', i * (cellSize + gap) + cellSize / 2 + 4)
				.attr('text-anchor', 'end')
				.attr('fill', '#94a3b8')
				.attr('font-size', '11px')
				.attr('font-weight', '600')
				.text(labels[i]);

			// cells
			for (let j = 0; j < displayCols; j++) {
				const val = row[j];
				g.append('rect')
					.attr('x', j * (cellSize + gap))
					.attr('y', i * (cellSize + gap))
					.attr('width', cellSize)
					.attr('height', cellSize)
					.attr('rx', 2)
					.attr('fill', featureColorScale(val))
					.attr('stroke', 'none')
					.attr('opacity', 0.9)
					.on('mouseenter', function () {
						d3.select(this).attr('stroke', '#38bdf8').attr('stroke-width', 1.5);
						hoveredAtom.set(i);
					})
					.on('mouseleave', function () {
						d3.select(this).attr('stroke', 'none');
						hoveredAtom.set(null);
					})
					.append('title')
					.text(`${labels[i]}[${j}] = ${val.toFixed(3)}`);
			}
		});

		// truncation indicator
		if ((features[0]?.length ?? 0) > maxCols) {
			g.append('text')
				.attr('x', displayCols * (cellSize + gap) + 4)
				.attr('y', (features.length * (cellSize + gap)) / 2 + 4)
				.attr('fill', '#64748b')
				.attr('font-size', '11px')
				.text(`... ${features[0].length - maxCols} more`);
		}
	}
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
	<h3 class="mb-3 text-sm font-semibold text-slate-300 uppercase tracking-wider">{title}</h3>
	<div class="overflow-x-auto">
		<svg bind:this={svgEl} width={svgWidth} height={svgHeight}></svg>
	</div>
	<div class="mt-2 flex items-center gap-2 text-xs text-slate-500">
		<div
			class="h-3 w-24 rounded"
			style="background: linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)"
		></div>
		<span>-1</span>
		<span class="ml-auto">+1</span>
	</div>
</div>
