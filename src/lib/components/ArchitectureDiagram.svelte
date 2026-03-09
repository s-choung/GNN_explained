<script lang="ts">
	import { onMount, tick } from 'svelte';
	import * as d3 from 'd3';
	import type { CgcnnData } from '$lib/stores/modelData';
	import { hoveredAtom } from '$lib/stores/modelData';
	import { featureColorScale, elementColors, elementRadii } from '$lib/utils/colorScales';

	interface Props {
		data: CgcnnData;
	}

	let { data }: Props = $props();

	let hoveredAtomIdx = $state<number | null>(null);
	let expandedStage = $state<string | null>(null);

	hoveredAtom.subscribe((v) => { hoveredAtomIdx = v; });

	function toggleStage(stage: string) {
		expandedStage = expandedStage === stage ? null : stage;
	}

	// ========== CRYSTAL UNIT CELL RENDERER ==========
	// Isometric-ish projection for 3D -> 2D
	function project3D(x: number, y: number, z: number, size: number): [number, number] {
		const scale = size / (data.crystal.lattice.a * 1.8);
		const px = size / 2 + (x - y) * scale * 0.7;
		const py = size * 0.35 + (x + y) * scale * 0.35 - z * scale * 0.65;
		return [px, py];
	}

	function drawUnitCell(svgEl: SVGSVGElement, size: number) {
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		const a = data.crystal.lattice.a;
		const b = data.crystal.lattice.b;
		const c = data.crystal.lattice.c;

		// Unit cell vertices
		const corners = [
			[0,0,0],[a,0,0],[a,b,0],[0,b,0],
			[0,0,c],[a,0,c],[a,b,c],[0,b,c]
		];
		const projected = corners.map(([x,y,z]) => project3D(x, y, z, size));

		// Draw back edges (dashed)
		const backEdges = [[0,3],[3,7],[0,4],[3,2]];
		backEdges.forEach(([i,j]) => {
			svg.append('line')
				.attr('x1', projected[i][0]).attr('y1', projected[i][1])
				.attr('x2', projected[j][0]).attr('y2', projected[j][1])
				.attr('stroke', '#334155').attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
				.attr('stroke-opacity', 0.4);
		});

		// Draw front edges (solid)
		const frontEdges = [[0,1],[1,2],[2,3],[4,5],[5,6],[6,7],[0,4],[1,5],[2,6],[3,7]];
		// Remove duplicates with back
		const solidEdges = [[0,1],[1,2],[4,5],[5,6],[6,7],[1,5],[2,6]];
		solidEdges.forEach(([i,j]) => {
			svg.append('line')
				.attr('x1', projected[i][0]).attr('y1', projected[i][1])
				.attr('x2', projected[j][0]).attr('y2', projected[j][1])
				.attr('stroke', '#475569').attr('stroke-width', 1).attr('stroke-opacity', 0.6);
		});
		// remaining edges
		[[4,7]].forEach(([i,j]) => {
			svg.append('line')
				.attr('x1', projected[i][0]).attr('y1', projected[i][1])
				.attr('x2', projected[j][0]).attr('y2', projected[j][1])
				.attr('stroke', '#334155').attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
				.attr('stroke-opacity', 0.4);
		});

		// Draw periodic images (ghosted atoms at cell edges)
		const periodicImages: { element: string; coords: [number,number,number]; ghost: boolean }[] = [];
		data.crystal.atoms.forEach(atom => {
			periodicImages.push({ element: atom.element, coords: atom.coords as [number,number,number], ghost: false });
		});
		// Add periodic copies at cell boundaries for corner/edge atoms
		data.crystal.atoms.forEach(atom => {
			const [x,y,z] = atom.coords;
			const tol = 0.01;
			const shifts: [number,number,number][] = [];
			if (Math.abs(x) < tol) shifts.push([a, 0, 0]);
			if (Math.abs(y) < tol) shifts.push([0, b, 0]);
			if (Math.abs(z) < tol) shifts.push([0, 0, c]);
			if (Math.abs(x) < tol && Math.abs(y) < tol) shifts.push([a, b, 0]);
			if (Math.abs(x) < tol && Math.abs(z) < tol) shifts.push([a, 0, c]);
			if (Math.abs(y) < tol && Math.abs(z) < tol) shifts.push([0, b, c]);
			if (Math.abs(x) < tol && Math.abs(y) < tol && Math.abs(z) < tol) shifts.push([a, b, c]);
			shifts.forEach(([dx, dy, dz]) => {
				periodicImages.push({
					element: atom.element,
					coords: [x + dx, y + dy, z + dz],
					ghost: true
				});
			});
		});

		// Sort by depth for pseudo-3D
		periodicImages.sort((a, b) => {
			const [,, za] = a.coords;
			const [,, zb] = b.coords;
			return za - zb;
		});

		// Draw atoms
		periodicImages.forEach((img) => {
			const [px, py] = project3D(img.coords[0], img.coords[1], img.coords[2], size);
			const r = ((elementRadii[img.element] || 14) * 0.5);
			const color = elementColors[img.element] || '#94a3b8';

			svg.append('circle')
				.attr('cx', px).attr('cy', py).attr('r', r)
				.attr('fill', color)
				.attr('opacity', img.ghost ? 0.25 : 0.9)
				.attr('stroke', img.ghost ? 'none' : '#0f172a')
				.attr('stroke-width', img.ghost ? 0 : 1);

			if (!img.ghost) {
				svg.append('text')
					.attr('x', px).attr('y', py + 1)
					.attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
					.attr('fill', '#0f172a').attr('font-size', '7px').attr('font-weight', '700')
					.attr('pointer-events', 'none').text(img.element);
			}
		});

		// Axis labels
		const axisLen = 18;
		const origin = project3D(0, 0, 0, size);
		const aEnd = project3D(a * 0.3, 0, 0, size);
		const bEnd = project3D(0, b * 0.3, 0, size);
		const cEnd = project3D(0, 0, c * 0.3, size);

		[{end: aEnd, label: 'a', color: '#ef4444'}, {end: bEnd, label: 'b', color: '#22c55e'}, {end: cEnd, label: 'c', color: '#3b82f6'}].forEach(({end, label, color}) => {
			svg.append('line')
				.attr('x1', origin[0]).attr('y1', origin[1])
				.attr('x2', end[0]).attr('y2', end[1])
				.attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-opacity', 0.5);
			svg.append('text')
				.attr('x', end[0] + (end[0] - origin[0]) * 0.3)
				.attr('y', end[1] + (end[1] - origin[1]) * 0.3)
				.attr('text-anchor', 'middle').attr('fill', color)
				.attr('font-size', '7px').attr('font-weight', '600').attr('opacity', 0.7)
				.text(label);
		});
	}

	// ========== MINI GRAPH RENDERER ==========
	function graphPositions(n: number, cx: number, cy: number, r: number) {
		return Array.from({ length: n }, (_, i) => ({
			x: cx + r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
			y: cy + r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2)
		}));
	}

	function drawMiniGraph(
		svgEl: SVGSVGElement, w: number, h: number,
		features: number[][] | null, showFeatures: boolean = false
	) {
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		const atoms = data.crystal.atoms;
		const bonds = data.crystal.bonds;
		const pos = graphPositions(atoms.length, w / 2, h / 2, Math.min(w, h) * 0.32);

		bonds.forEach((bond) => {
			svg.append('line')
				.attr('x1', pos[bond.source].x).attr('y1', pos[bond.source].y)
				.attr('x2', pos[bond.target].x).attr('y2', pos[bond.target].y)
				.attr('stroke', '#475569').attr('stroke-width', 1.2).attr('stroke-opacity', 0.4);
		});

		atoms.forEach((atom, i) => {
			const p = pos[i];
			const r = (elementRadii[atom.element] || 14) * 0.55;

			if (showFeatures && features?.[i]) {
				const sl = features[i].slice(0, 8);
				const arcAngle = (2 * Math.PI) / sl.length;
				sl.forEach((val, j) => {
					const arc = d3.arc().innerRadius(r + 1.5).outerRadius(r + 5)
						.startAngle(j * arcAngle).endAngle((j + 1) * arcAngle);
					svg.append('path').attr('d', arc as any)
						.attr('transform', `translate(${p.x},${p.y})`)
						.attr('fill', featureColorScale(val)).attr('opacity', 0.85);
				});
			}

			svg.append('circle').attr('cx', p.x).attr('cy', p.y).attr('r', r)
				.attr('fill', elementColors[atom.element] || '#94a3b8')
				.attr('stroke', '#0f172a').attr('stroke-width', 1);

			svg.append('text').attr('x', p.x).attr('y', p.y + 0.5)
				.attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
				.attr('fill', '#0f172a').attr('font-size', '7px').attr('font-weight', '700')
				.attr('pointer-events', 'none').text(atom.element);
		});
	}

	onMount(async () => {
		await tick();
		// Unit cell
		const ucSvg = document.getElementById('svg-unitcell') as SVGSVGElement | null;
		if (ucSvg) drawUnitCell(ucSvg, 140);
		// Graphs
		const graphSvg = document.getElementById('svg-graph') as SVGSVGElement | null;
		if (graphSvg) drawMiniGraph(graphSvg, 100, 100, null, false);
		const embedSvg = document.getElementById('svg-embed') as SVGSVGElement | null;
		if (embedSvg) drawMiniGraph(embedSvg, 100, 100, data.cgcnn.embedding.atom_features, true);
		data.cgcnn.conv_layers.forEach((layer, i) => {
			const svg = document.getElementById(`svg-conv-${i}`) as SVGSVGElement | null;
			if (svg) drawMiniGraph(svg, 80, 80, layer.output_features, true);
		});
	});
</script>

<!-- ======= MAIN ARCHITECTURE ======= -->
<div class="arch-scaler">
<div class="arch-inner">

	<!-- Neural Network outer frame -->
	<div class="nn-frame">
		<div class="nn-title">CrystalGraphConvNet</div>

		<div class="nn-body">

			<!-- INPUT CRYSTAL (proper unit cell) -->
			<div class="layer-group anim-in" style="--delay:0s">
				<button class="layer-box" class:layer-active={expandedStage === 'input'}
					onclick={() => toggleStage('input')}>
					<div class="layer-header">
						<span class="layer-tag tag-input">INPUT</span>
						<span class="layer-name">Crystal Structure</span>
					</div>
					<svg id="svg-unitcell" width="140" height="140"></svg>
					<div class="layer-meta">{data.crystal.formula} &middot; {data.crystal.space_group}</div>
				</button>
				{#if expandedStage === 'input'}
					<div class="detail-panel anim-detail">
						<div class="detail-title">Unit Cell</div>
						<div class="detail-grid">
							<span class="dk">Space Group</span><span class="dv">{data.crystal.space_group}</span>
							<span class="dk">a, b, c</span><span class="dv">{data.crystal.lattice.a}, {data.crystal.lattice.b}, {data.crystal.lattice.c} A</span>
							<span class="dk">Atoms</span><span class="dv">{data.crystal.atoms.length} per cell</span>
						</div>
						<div class="atom-chips">
							{#each data.crystal.atoms as atom}
								<span class="atom-chip" role="button" tabindex="0"
									onmouseenter={() => hoveredAtom.set(atom.index)}
									onmouseleave={() => hoveredAtom.set(null)}>
									<span class="atom-dot" style="background:{atom.color}"></span>
									{atom.element}<sub>{atom.index}</sub>
									<span class="text-slate-600 text-[8px] ml-0.5">({atom.coords.map(c => c.toFixed(2)).join(',')})</span>
								</span>
							{/each}
						</div>
						<p class="detail-note">Ghost atoms show periodic images at cell boundaries</p>
					</div>
				{/if}
			</div>

			<div class="conn"><div class="conn-line"></div><div class="conn-dot"></div></div>

			<!-- GRAPH CONSTRUCTION -->
			<div class="layer-group anim-in" style="--delay:0.08s">
				<button class="layer-box" class:layer-active={expandedStage === 'graph'}
					onclick={() => toggleStage('graph')}>
					<div class="layer-header">
						<span class="layer-tag tag-process">GRAPH</span>
						<span class="layer-name">Build Graph</span>
					</div>
					<svg id="svg-graph" width="100" height="100"></svg>
					<div class="layer-meta">{data.graph.num_nodes}N &middot; {data.crystal.bonds.length}E &middot; r={data.graph.cutoff_radius}A</div>
				</button>
				{#if expandedStage === 'graph'}
					<div class="detail-panel anim-detail">
						<div class="detail-title">Neighbor List</div>
						{#each data.graph.neighbor_list as nl}
							<div class="nbr-row">
								<span class="nbr-c" style="color:{data.crystal.atoms[nl.center].color}">{data.crystal.atoms[nl.center].element}<sub>{nl.center}</sub></span>
								<span class="nbr-a">&rarr;</span>
								<span class="nbr-l">[{nl.neighbors.slice(0,5).map(n => data.crystal.atoms[n].element + n).join(', ')}{nl.neighbors.length > 5 ? '...' : ''}]</span>
							</div>
						{/each}
						<p class="detail-note">d<sub>ij</sub> &rarr; Gaussian expansion ({data.cgcnn.nbr_fea_len}-dim)</p>
					</div>
				{/if}
			</div>

			<div class="conn"><div class="conn-line"></div><div class="conn-dot"></div></div>

			<!-- EMBEDDING -->
			<div class="layer-group anim-in" style="--delay:0.16s">
				<button class="layer-box" class:layer-active={expandedStage === 'embed'}
					onclick={() => toggleStage('embed')}>
					<div class="layer-header">
						<span class="layer-tag tag-layer">LINEAR</span>
						<span class="layer-name">Embedding</span>
					</div>
					<svg id="svg-embed" width="100" height="100"></svg>
					<div class="feat-preview">
						{#each data.crystal.atoms as atom, i}
							<div class="feat-row" class:feat-hl={hoveredAtomIdx === i}
								role="button" tabindex="0"
								onmouseenter={() => hoveredAtom.set(i)}
								onmouseleave={() => hoveredAtom.set(null)}>
								<span class="feat-lbl" style="color:{atom.color}">{atom.element}</span>
								{#each data.cgcnn.embedding.atom_features[i].slice(0, 10) as v}
									<span class="fc" style="background:{featureColorScale(v)}"></span>
								{/each}
							</div>
						{/each}
					</div>
					<div class="layer-meta">{data.cgcnn.embedding.input_dim}&rarr;{data.cgcnn.embedding.output_dim}d</div>
				</button>
				{#if expandedStage === 'embed'}
					<div class="detail-panel anim-detail" style="width:360px">
						<div class="detail-title">Atom Feature Vectors</div>
						<div class="feat-table-wrap">
							<table class="feat-table">
								<thead><tr><th></th>{#each Array(16) as _, j}<th>{j}</th>{/each}</tr></thead>
								<tbody>
									{#each data.crystal.atoms as atom, i}
										<tr class:feat-hl={hoveredAtomIdx === i}
											onmouseenter={() => hoveredAtom.set(i)}
											onmouseleave={() => hoveredAtom.set(null)}>
											<td class="ft-label" style="color:{atom.color}">{atom.element}#{i}</td>
											{#each data.cgcnn.embedding.atom_features[i].slice(0, 16) as v}
												<td><span class="ft-cell" style="background:{featureColorScale(v)}">{v.toFixed(1)}</span></td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>

			<div class="conn"><div class="conn-line"></div><div class="conn-dot"></div></div>

			<!-- CONV LAYERS -->
			<div class="layer-group anim-in" style="--delay:0.24s">
				<button class="layer-box" class:layer-active={expandedStage === 'conv'}
					onclick={() => toggleStage('conv')}>
					<div class="layer-header">
						<span class="layer-tag tag-conv">CONV</span>
						<span class="layer-name">Graph Convolution &times;{data.cgcnn.num_conv}</span>
					</div>
					<div class="conv-stack">
						{#each data.cgcnn.conv_layers as layer, li}
							<div class="conv-unit" style="--delay:{0.3 + li * 0.1}s">
								<div class="conv-lbl">L{li + 1}</div>
								<svg id="svg-conv-{li}" width="80" height="80"></svg>
								<div class="feat-preview feat-sm">
									{#each data.crystal.atoms as atom, ai}
										<div class="feat-row" role="button" tabindex="0"
											onmouseenter={() => hoveredAtom.set(ai)}
											onmouseleave={() => hoveredAtom.set(null)}>
											{#each layer.output_features[ai].slice(0, 6) as v}
												<span class="fc-s" style="background:{featureColorScale(v)}"></span>
											{/each}
										</div>
									{/each}
								</div>
								<div class="gate-bar">
									{#each layer.gate_values[0] as gv}
										<span class="gc" style="opacity:{gv}"></span>
									{/each}
								</div>
							</div>
							{#if li < data.cgcnn.conv_layers.length - 1}
								<div class="conv-conn-wire">
									<svg width="24" height="50" viewBox="0 0 24 50">
										{#each [12, 25, 38] as y1}
											{#each [12, 25, 38] as y2}
												<line x1="0" y1={y1} x2="24" y2={y2} stroke="#1e293b" stroke-width="0.5"/>
											{/each}
										{/each}
										<circle r="2" fill="#38bdf8" opacity="0.7">
											<animateMotion dur="1.5s" repeatCount="indefinite" path="M0,25 L24,25"/>
										</circle>
									</svg>
								</div>
							{/if}
						{/each}
					</div>
					<div class="mp-formula">
						<span class="ob ob-pk">h<sub>i</sub></span>
						<span class="os">||</span>
						<span class="ob ob-bl">h<sub>j</sub></span>
						<span class="os">||</span>
						<span class="ob ob-am">e<sub>ij</sub></span>
						<span class="oa">&rarr;</span>
						<span class="ob ob-sl">FC+BN</span>
						<span class="oa">&rarr;</span>
						<span class="ob ob-or">&sigma;</span>
						<span class="os">&odot;</span>
						<span class="ob ob-gn">sp</span>
						<span class="oa">&rarr;</span>
						<span class="ob ob-pu">&Sigma;</span>
					</div>
				</button>
				{#if expandedStage === 'conv'}
					<div class="detail-panel anim-detail" style="width:380px">
						<div class="detail-title">Message Passing</div>
						<p class="detail-note">Concat atom + neighbor + bond features &rarr; FC &rarr; BN &rarr; split: sigmoid(filter) &odot; softplus(core) &rarr; sum &rarr; BN + softplus</p>
					</div>
				{/if}
			</div>

			<div class="conn"><div class="conn-line"></div><div class="conn-dot"></div></div>

			<!-- POOLING -->
			<div class="layer-group anim-in" style="--delay:0.4s">
				<button class="layer-box" class:layer-active={expandedStage === 'pool'}
					onclick={() => toggleStage('pool')}>
					<div class="layer-header">
						<span class="layer-tag tag-pool">POOL</span>
						<span class="layer-name">Mean Pooling</span>
					</div>
					<div class="pool-viz">
						<div class="pool-atoms">
							{#each data.crystal.atoms as atom, i}
								<div class="pool-atom" style="--d:{i * 0.12}s"
									role="button" tabindex="0"
									onmouseenter={() => hoveredAtom.set(i)}
									onmouseleave={() => hoveredAtom.set(null)}>
									<div class="pool-circle" style="background:{atom.color}; --sz:{18 + data.cgcnn.pooling.per_atom_contribution[i] * 55}px">
										<span class="pool-el">{atom.element}</span>
									</div>
									<span class="pool-pct">{(data.cgcnn.pooling.per_atom_contribution[i] * 100).toFixed(0)}%</span>
								</div>
							{/each}
						</div>
						<svg class="pool-funnel" viewBox="0 0 140 40" width="140" height="40">
							{#each data.crystal.atoms as _, i}
								<line x1={15 + i * 27} y1="2" x2="70" y2="36"
									stroke="#475569" stroke-width="1" stroke-dasharray="3,2" class="f-line" style="--d:{i*0.1}s"/>
								<circle r="1.5" fill="{data.crystal.atoms[i].color}" opacity="0.6">
									<animateMotion dur="{1.5 + i * 0.2}s" repeatCount="indefinite"
										path="M{15 + i * 27},2 L70,36"/>
								</circle>
							{/each}
						</svg>
						<div class="pool-out">
							<div class="pool-out-circle"><span class="pool-out-lbl">mean</span></div>
							<div class="pool-feat">
								{#each data.cgcnn.pooling.crystal_feature.slice(0, 16) as v}
									<span class="fc" style="background:{featureColorScale(v)}"></span>
								{/each}
							</div>
							<div class="layer-meta">64-dim vector</div>
						</div>
					</div>
				</button>
				{#if expandedStage === 'pool'}
					<div class="detail-panel anim-detail">
						<div class="detail-title">Atom Contributions</div>
						{#each data.crystal.atoms as atom, i}
							<div class="pb-row" role="button" tabindex="0"
								onmouseenter={() => hoveredAtom.set(i)}
								onmouseleave={() => hoveredAtom.set(null)}>
								<span class="pb-lbl" style="color:{atom.color}">{atom.element}#{i}</span>
								<div class="pb-track">
									<div class="pb-fill pb-anim" style="width:{data.cgcnn.pooling.per_atom_contribution[i] * 400}%; background:{atom.color}; --d:{i*0.1}s"></div>
								</div>
								<span class="pb-val">{data.cgcnn.pooling.per_atom_contribution[i].toFixed(3)}</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<div class="conn"><div class="conn-line"></div><div class="conn-dot"></div></div>

			<!-- FC LAYERS -->
			<div class="layer-group anim-in" style="--delay:0.48s">
				<button class="layer-box" class:layer-active={expandedStage === 'fc'}
					onclick={() => toggleStage('fc')}>
					<div class="layer-header">
						<span class="layer-tag tag-layer">FC</span>
						<span class="layer-name">Fully Connected</span>
					</div>
					<svg class="nn-svg" width="110" height="100" viewBox="0 0 110 100">
						{#each [18, 33, 48, 63, 78] as y, i}
							<circle cx="12" cy={y} r="3.5" fill="#64748b" class="nn-node" style="--d:{0.5+i*0.04}s"/>
						{/each}
						<text x="12" y="94" text-anchor="middle" fill="#475569" font-size="7">64</text>
						{#each [18, 33, 48, 63, 78] as y1}
							{#each [10, 22, 34, 46, 58, 70, 82] as y2}
								<line x1="16" y1={y1} x2="51" y2={y2} stroke="#1e293b" stroke-width="0.35"/>
							{/each}
						{/each}
						{#each [10, 22, 34, 46, 58, 70, 82] as y, i}
							<circle cx="55" cy={y} r="3" fill="#3b82f6" class="nn-node" style="--d:{0.6+i*0.03}s"/>
						{/each}
						<text x="55" y="94" text-anchor="middle" fill="#475569" font-size="7">128</text>
						{#each [10, 22, 34, 46, 58, 70, 82] as y2}
							<line x1="58" y1={y2} x2="93" y2="46" stroke="#1e293b" stroke-width="0.35"/>
						{/each}
						<circle cx="97" cy="46" r="5.5" fill="#0f172a" stroke="#34d399" stroke-width="1.5" class="nn-out"/>
						<text x="97" y="49" text-anchor="middle" fill="#34d399" font-size="8" font-weight="bold">E</text>
						<circle r="2" fill="#38bdf8" opacity="0.7">
							<animateMotion dur="2s" repeatCount="indefinite" path="M12,48 L55,48 L97,46"/>
						</circle>
					</svg>
					<div class="layer-meta">64&rarr;128&rarr;1</div>
				</button>
				{#if expandedStage === 'fc'}
					<div class="detail-panel anim-detail">
						<div class="detail-title">FC Head</div>
						<div class="fc-flow">
							<span class="ob ob-sl">Linear(64,128)</span>
							<span class="oa">&rarr;</span>
							<span class="ob ob-gn">Softplus</span>
							<span class="oa">&rarr;</span>
							<span class="ob ob-sl">Linear(128,1)</span>
						</div>
					</div>
				{/if}
			</div>

		</div><!-- nn-body -->
	</div><!-- nn-frame -->

	<!-- ===== ENERGY OUTPUT (outside frame) ===== -->
	<div class="energy-conn">
		<svg viewBox="0 0 50 30" width="50" height="30">
			<path d="M0 15 L42 15" stroke="#34d399" stroke-width="2" stroke-dasharray="5,3" class="e-dash"/>
			<polygon points="40,10 50,15 40,20" fill="#34d399" class="e-arr"/>
		</svg>
	</div>

	<div class="energy-block anim-energy">
		<div class="energy-glow"></div>
		<div class="energy-inner">
			<div class="energy-icon">E</div>
			<div class="energy-prop">{data.cgcnn.prediction.property}</div>
			<div class="energy-val">{data.cgcnn.prediction.value.toFixed(3)}</div>
			<div class="energy-unit">{data.cgcnn.prediction.unit}</div>
		</div>
	</div>

</div><!-- arch-inner -->
</div><!-- arch-scaler -->

<style>
	/* ===== AUTO-SCALING HORIZONTAL ROOT ===== */
	.arch-scaler {
		width: 100%;
		overflow: hidden;
	}
	.arch-inner {
		display: flex;
		align-items: center;
		gap: 0;
		padding: 20px 12px;
		justify-content: center;
		width: max-content;
		margin: 0 auto;
		transform-origin: top center;
		scale: var(--arch-scale, 1);
	}
	@media (max-width: 1800px) { .arch-inner { --arch-scale: 0.92; } }
	@media (max-width: 1600px) { .arch-inner { --arch-scale: 0.82; } }
	@media (max-width: 1400px) { .arch-inner { --arch-scale: 0.72; } }
	@media (max-width: 1200px) { .arch-inner { --arch-scale: 0.62; } }
	@media (max-width: 1000px) { .arch-inner { --arch-scale: 0.52; } }
	@media (max-width: 800px)  { .arch-inner { --arch-scale: 0.42; } }

	/* ===== NN FRAME ===== */
	.nn-frame {
		border: 2px solid var(--frame-border);
		border-radius: 14px;
		background: var(--frame-bg);
		position: relative;
		box-shadow: 0 0 30px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.02);
		flex-shrink: 0;
		transition: background 0.3s, border-color 0.3s;
	}
	.nn-title {
		position: absolute; top: -10px; left: 20px;
		background: var(--nn-title-bg); padding: 0 10px;
		font: 700 10px/1 'JetBrains Mono', monospace;
		color: var(--text4); letter-spacing: 0.5px;
		transition: background 0.3s, color 0.3s;
	}
	.nn-body {
		display: flex;
		align-items: flex-start;
		gap: 0;
		padding: 24px 12px 12px;
	}

	/* ===== LAYER GROUP ===== */
	.layer-group {
		display: flex; flex-direction: column; align-items: center; flex-shrink: 0;
	}
	.anim-in { animation: slideIn 0.45s ease-out both; animation-delay: var(--delay); }
	@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

	/* ===== LAYER BOX ===== */
	.layer-box {
		display: flex; flex-direction: column; align-items: center;
		padding: 8px 10px; border-radius: 8px;
		border: 1.5px solid var(--border); background: var(--layer-bg);
		cursor: pointer; transition: all 0.2s;
	}
	.layer-box:hover { border-color: var(--border2); background: var(--layer-hover-bg); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.15); }
	.layer-active { border-color: var(--accent) !important; box-shadow: 0 0 20px rgba(56,189,248,0.12) !important; }

	.layer-header { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
	.layer-tag { font: 700 7px/1 'JetBrains Mono', monospace; padding: 2px 5px; border-radius: 3px; letter-spacing: 0.6px; }
	.tag-input { background: #164e63; color: #67e8f9; }
	.tag-process { background: #3b0764; color: #c084fc; }
	.tag-layer { background: #78350f; color: #fbbf24; }
	.tag-conv { background: #1e3a5f; color: #60a5fa; }
	.tag-pool { background: #064e3b; color: #34d399; }
	.layer-name { font-size: 10px; font-weight: 600; color: var(--text2); }
	.layer-meta { font-size: 8px; color: var(--text5); margin-top: 3px; }

	/* ===== CONNECTIONS ===== */
	.conn { display: flex; align-items: center; flex-shrink: 0; width: 28px; height: 30px; position: relative; }
	.conn-line { width: 100%; height: 2px; background: var(--conn-line); }
	.conn-dot {
		position: absolute; width: 5px; height: 5px; border-radius: 50%;
		background: var(--accent); box-shadow: 0 0 6px var(--accent);
		animation: dotMove 2s ease-in-out infinite;
	}
	@keyframes dotMove { 0%{left:0;opacity:0} 20%{opacity:1} 80%{opacity:1} 100%{left:calc(100% - 5px);opacity:0} }

	/* ===== FEATURES ===== */
	.feat-preview { display: flex; flex-direction: column; gap: 1px; margin-top: 3px; }
	.feat-sm { gap: 0; }
	.feat-row { display: flex; align-items: center; gap: 1px; padding: 1px; border-radius: 2px; transition: background 0.1s; }
	.feat-row:hover, .feat-hl { background: rgba(56,189,248,0.06); }
	.feat-lbl { font-size: 7px; font-weight: 600; width: 12px; text-align: right; margin-right: 1px; }
	.fc { display: inline-block; width: 4px; height: 9px; border-radius: 1px; }
	.fc-s { display: inline-block; width: 3px; height: 6px; border-radius: 0.5px; }

	/* ===== CONV ===== */
	.conv-stack { display: flex; align-items: center; gap: 0; margin-top: 4px; justify-content: center; flex-wrap: wrap; }
	.conv-unit {
		display: flex; flex-direction: column; align-items: center;
		padding: 5px; border: 1px dashed var(--conv-border); border-radius: 6px;
		background: var(--conv-bg);
		animation: slideIn 0.4s ease-out both; animation-delay: var(--delay);
	}
	.conv-lbl { font: 600 7px/1 'JetBrains Mono', monospace; color: #3b82f6; margin-bottom: 2px; }
	.conv-conn-wire { flex-shrink: 0; display: flex; align-items: center; }
	.gate-bar { display: flex; gap: 1px; margin-top: 2px; }
	.gc { display: inline-block; width: 5px; height: 3px; border-radius: 0.5px; background: #fb923c; }

	.mp-formula { display: flex; align-items: center; gap: 2px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }
	.ob { display: inline-block; padding: 1px 4px; border-radius: 2px; font-size: 8px; font-weight: 600; }
	.ob-pk { background: rgba(244,114,182,0.1); color: #f472b6; }
	.ob-bl { background: rgba(96,165,250,0.1); color: #60a5fa; }
	.ob-am { background: rgba(251,191,36,0.1); color: #fbbf24; }
	.ob-sl { background: rgba(100,116,139,0.12); color: var(--text3); }
	.ob-or { background: rgba(251,146,60,0.1); color: #fb923c; }
	.ob-gn { background: rgba(52,211,153,0.1); color: #34d399; }
	.ob-pu { background: rgba(167,139,250,0.1); color: #a78bfa; }
	.os { color: var(--text5); font-size: 8px; }
	.oa { color: var(--text5); font-size: 8px; }

	/* ===== POOLING ===== */
	.pool-viz { display: flex; flex-direction: column; align-items: center; margin-top: 4px; }
	.pool-atoms { display: flex; gap: 5px; align-items: flex-end; }
	.pool-atom { display: flex; flex-direction: column; align-items: center; gap: 1px; animation: pFloat 3s ease-in-out infinite; animation-delay: var(--d); }
	@keyframes pFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
	.pool-circle {
		width: var(--sz); height: var(--sz); border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		box-shadow: 0 2px 6px rgba(0,0,0,0.2); transition: transform 0.2s;
	}
	.pool-circle:hover { transform: scale(1.12); }
	.pool-el { font-size: 7px; font-weight: 700; color: var(--node-label); }
	.pool-pct { font: 400 6px/1 'JetBrains Mono', monospace; color: var(--text4); }
	.pool-funnel { margin-top: 2px; }
	.f-line { animation: fPulse 2s ease-in-out infinite; animation-delay: var(--d); }
	@keyframes fPulse { 0%,100%{opacity:0.2} 50%{opacity:0.6} }
	.pool-out { display: flex; flex-direction: column; align-items: center; gap: 2px; }
	.pool-out-circle {
		width: 28px; height: 28px; border-radius: 50%;
		background: linear-gradient(135deg,#064e3b,#065f46);
		border: 1.5px solid var(--energy);
		display: flex; align-items: center; justify-content: center;
		box-shadow: 0 0 10px rgba(52,211,153,0.15);
		animation: rPulse 2s ease-in-out infinite;
	}
	@keyframes rPulse { 0%,100%{box-shadow:0 0 8px rgba(52,211,153,0.15)} 50%{box-shadow:0 0 16px rgba(52,211,153,0.3)} }
	.pool-out-lbl { font: 700 6px/1 'JetBrains Mono', monospace; color: var(--energy); }
	.pool-feat { display: flex; gap: 1px; }

	/* ===== FC NN ===== */
	.nn-svg { margin-top: 2px; }
	.nn-node { animation: nAppear 0.3s ease-out both; animation-delay: var(--d); }
	@keyframes nAppear { from{r:0;opacity:0} to{opacity:1} }
	.nn-out { animation: oPulse 2s ease-in-out infinite; }
	@keyframes oPulse { 0%,100%{filter:drop-shadow(0 0 3px rgba(52,211,153,0.2))} 50%{filter:drop-shadow(0 0 8px rgba(52,211,153,0.5))} }

	/* ===== ENERGY ===== */
	.energy-conn { flex-shrink: 0; display: flex; align-items: center; }
	.e-dash { animation: eDash 1s linear infinite; }
	@keyframes eDash { to{stroke-dashoffset:-16} }
	.e-arr { animation: eArr 1.5s ease-in-out infinite; }
	@keyframes eArr { 0%,100%{opacity:0.6} 50%{opacity:1} }

	.energy-block {
		position: relative; flex-shrink: 0;
		border: 2px solid var(--energy); border-radius: 14px;
		padding: 16px 20px;
		background: var(--energy-bg);
		text-align: center;
		transition: background 0.3s, border-color 0.3s;
	}
	.anim-energy { animation: ePop 0.5s ease-out 0.7s both; }
	@keyframes ePop { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
	.energy-glow {
		position: absolute; inset: -2px; border-radius: 16px;
		box-shadow: 0 0 24px var(--energy-glow);
		animation: eGlow 3s ease-in-out infinite; pointer-events: none;
	}
	@keyframes eGlow { 0%,100%{box-shadow:0 0 16px rgba(52,211,153,0.08)} 50%{box-shadow:0 0 32px rgba(52,211,153,0.25)} }
	.energy-inner { position: relative; z-index: 1; }
	.energy-icon {
		width: 32px; height: 32px; border-radius: 50%;
		background: linear-gradient(135deg,#34d399,#10b981);
		color: #0f172a; font: 800 16px/32px 'JetBrains Mono', monospace;
		margin: 0 auto 6px; display: flex; align-items: center; justify-content: center;
	}
	.energy-prop { font-size: 8px; color: #6ee7b7; font-weight: 500; margin-bottom: 3px; }
	.energy-val {
		font: 800 24px/1 'JetBrains Mono', monospace; color: var(--energy);
		text-shadow: 0 0 16px var(--energy-glow);
	}
	.energy-unit { font-size: 9px; color: var(--text4); margin-top: 3px; }

	/* ===== DETAIL PANELS ===== */
	.detail-panel {
		margin-top: 6px; padding: 8px 10px; border-radius: 8px;
		border: 1px solid var(--border); background: var(--detail-bg);
		max-width: 280px; max-height: 260px; overflow-y: auto;
		transition: background 0.3s, border-color 0.3s;
	}
	.anim-detail { animation: dSlide 0.2s ease-out; }
	@keyframes dSlide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
	.detail-title { font: 700 9px/1 'JetBrains Mono', monospace; color: var(--text3); margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.4px; }
	.detail-grid { display: grid; grid-template-columns: auto 1fr; gap: 2px 6px; font-size: 9px; }
	.dk { color: var(--text4); } .dv { color: var(--text2); font-family: 'JetBrains Mono', monospace; }
	.detail-note { font-size: 8px; color: var(--text5); margin-top: 5px; line-height: 1.4; }
	.atom-chips { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 5px; }
	.atom-chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 5px; border-radius: 3px; background: var(--chip-bg); font-size: 8px; color: var(--text3); cursor: pointer; transition: background 0.2s; }
	.atom-chip:hover { background: var(--surface); }
	.atom-dot { width: 5px; height: 5px; border-radius: 50%; }
	.nbr-row { font-size: 8px; margin-bottom: 1px; display: flex; align-items: center; gap: 3px; }
	.nbr-c { font: 600 8px/1 'JetBrains Mono', monospace; }
	.nbr-a { color: var(--text5); } .nbr-l { color: var(--text4); font: 400 7px/1 'JetBrains Mono', monospace; }
	.feat-table-wrap { overflow-x: auto; }
	.feat-table { border-collapse: collapse; }
	.feat-table th { font-size: 6px; color: var(--text5); padding: 0 1px; text-align: center; }
	.feat-table td { padding: 0 1px; }
	.ft-label { font: 600 8px/1 'JetBrains Mono', monospace; padding-right: 3px !important; }
	.ft-cell { display: inline-block; width: 16px; height: 12px; border-radius: 1px; font-size: 6px; text-align: center; line-height: 12px; color: #fff; }
	.fc-flow { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }
	.pb-row { display: flex; align-items: center; gap: 4px; cursor: pointer; margin-bottom: 2px; }
	.pb-row:hover { background: rgba(56,189,248,0.04); border-radius: 3px; }
	.pb-lbl { font: 600 8px/1 'JetBrains Mono', monospace; width: 24px; text-align: right; }
	.pb-track { width: 80px; height: 6px; background: var(--bg2); border-radius: 3px; overflow: hidden; }
	.pb-fill { height: 100%; border-radius: 3px; }
	.pb-anim { animation: bGrow 0.5s ease-out both; animation-delay: var(--d); }
	@keyframes bGrow { from{width:0 !important} }
	.pb-val { font: 400 7px/1 'JetBrains Mono', monospace; color: var(--text4); }
</style>
