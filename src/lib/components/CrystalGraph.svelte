<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { modelData, hoveredAtom } from '$lib/stores/modelData';
	import { elementColors, elementRadii } from '$lib/utils/colorScales';

	let svgEl: SVGSVGElement;
	const width = 500;
	const height = 400;

	interface SimNode extends d3.SimulationNodeDatum {
		index: number;
		element: string;
		atomic_num: number;
		coords: [number, number, number];
		color: string;
	}

	interface SimLink extends d3.SimulationLinkDatum<SimNode> {
		distance: number;
	}

	onMount(() => {
		if (!$modelData) return;

		const { atoms, bonds } = $modelData.crystal;

		const nodes: SimNode[] = atoms.map((a) => ({
			...a,
			x: width / 2 + a.coords[0] * 60 - 60,
			y: height / 2 + a.coords[1] * 60 - 60
		}));

		const links: SimLink[] = bonds.map((b) => ({
			source: b.source,
			target: b.target,
			distance: b.distance
		}));

		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();

		const g = svg.append('g');

		// zoom
		svg.call(
			d3.zoom<SVGSVGElement, unknown>()
				.scaleExtent([0.5, 3])
				.on('zoom', (event) => g.attr('transform', event.transform))
		);

		const simulation = d3
			.forceSimulation(nodes)
			.force(
				'link',
				d3.forceLink<SimNode, SimLink>(links)
					.id((d) => d.index)
					.distance((d) => d.distance * 40)
			)
			.force('charge', d3.forceManyBody().strength(-200))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collision', d3.forceCollide().radius(25));

		// links
		const link = g
			.append('g')
			.selectAll('line')
			.data(links)
			.join('line')
			.attr('stroke', '#475569')
			.attr('stroke-width', 2)
			.attr('stroke-opacity', 0.6);

		// distance labels on links
		const linkLabel = g
			.append('g')
			.selectAll('text')
			.data(links)
			.join('text')
			.attr('fill', '#94a3b8')
			.attr('font-size', '9px')
			.attr('text-anchor', 'middle')
			.text((d) => `${d.distance.toFixed(2)}A`);

		// nodes
		const node = g
			.append('g')
			.selectAll('g')
			.data(nodes)
			.join('g')
			.attr('cursor', 'pointer')
			.call(
				d3.drag<SVGGElement, SimNode>()
					.on('start', (event, d) => {
						if (!event.active) simulation.alphaTarget(0.3).restart();
						d.fx = d.x;
						d.fy = d.y;
					})
					.on('drag', (event, d) => {
						d.fx = event.x;
						d.fy = event.y;
					})
					.on('end', (event, d) => {
						if (!event.active) simulation.alphaTarget(0);
						d.fx = null;
						d.fy = null;
					})
			);

		// node circles
		node
			.append('circle')
			.attr('r', (d) => elementRadii[d.element] || 14)
			.attr('fill', (d) => elementColors[d.element] || '#94a3b8')
			.attr('stroke', '#1e293b')
			.attr('stroke-width', 2)
			.on('mouseenter', (_, d) => hoveredAtom.set(d.index))
			.on('mouseleave', () => hoveredAtom.set(null));

		// node labels
		node
			.append('text')
			.attr('text-anchor', 'middle')
			.attr('dy', '0.35em')
			.attr('fill', '#0f172a')
			.attr('font-size', '11px')
			.attr('font-weight', 'bold')
			.text((d) => d.element);

		// node index
		node
			.append('text')
			.attr('text-anchor', 'middle')
			.attr('dy', (d) => (elementRadii[d.element] || 14) + 14)
			.attr('fill', '#64748b')
			.attr('font-size', '10px')
			.text((d) => `#${d.index}`);

		// highlight hovered atom
		hoveredAtom.subscribe((idx) => {
			node.selectAll('circle').attr('stroke', (d: SimNode) =>
				d.index === idx ? '#38bdf8' : '#1e293b'
			).attr('stroke-width', (d: SimNode) => (d.index === idx ? 3 : 2));
		});

		simulation.on('tick', () => {
			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			linkLabel
				.attr('x', (d: any) => (d.source.x + d.target.x) / 2)
				.attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 6);

			node.attr('transform', (d) => `translate(${d.x},${d.y})`);
		});
	});
</script>

<div class="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
	<h3 class="mb-3 text-sm font-semibold text-slate-300 uppercase tracking-wider">
		Crystal Graph
	</h3>
	<svg bind:this={svgEl} {width} {height} class="w-full" viewBox="0 0 {width} {height}">
	</svg>
	<p class="mt-2 text-xs text-slate-500">Drag nodes to rearrange. Scroll to zoom.</p>
</div>
