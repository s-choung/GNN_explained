<script lang="ts">
	import * as d3 from 'd3';
	import type { CgcnnData } from '$lib/stores/modelData';
	import { hoveredAtom } from '$lib/stores/modelData';
	import { theme } from '$lib/stores/theme';
	import { featureColorScale, elementColors, elementRadii } from '$lib/utils/colorScales';

	interface Props {
		data: CgcnnData;
		structureId: string;
		imgBase: string;
		playStep?: number; // -1 idle · 0..2 conv hop being animated · 3 done
		tourStage?: string | null; // guided walkthrough stage id, null = tour off
		lang?: 'en' | 'ko';
	}

	let { data, structureId, imgBase, playStep = -1, tourStage = null, lang = 'en' }: Props = $props();

	// Panel strings (diagram labels stay English; explanatory notes are localized)
	const PANEL_EN = {
		unitCell: 'Unit Cell',
		spaceGroup: 'Space Group',
		atoms: 'Atoms',
		perCell: 'per cell',
		ghostNote: 'Ghost atoms show periodic images at cell boundaries',
		neighborList: 'Neighbor List',
		graphNote: (n: number) => `Node positions mirror the real crystal (same projection as the unit cell). dᵢⱼ → Gaussian expansion (${n}-dim)`,
		atomFeatures: 'Atom Feature Vectors',
		embedNote: (n: number) => `Hover a cell to read its value · showing first 16 of ${n} dims`,
		messagePassing: 'Message Passing',
		convNote: 'Each atom concatenates its features with a neighbor’s features and the bond feature, passes them through a linear layer, then splits the result: sigmoid(filter) ⊙ softplus(core), summed over neighbors. The rings around each atom are its live feature values; the bars below are the gate values.',
		contributions: 'Atom Contributions',
		fcHead: 'FC Head'
	};
	const PANEL_KO = {
		unitCell: '단위 셀',
		spaceGroup: '공간군',
		atoms: '원자 수',
		perCell: '개 / 셀',
		ghostNote: '반투명 원자는 셀 경계의 주기적 이미지입니다',
		neighborList: '이웃 리스트',
		graphNote: (n: number) => `노드 위치는 실제 결정 구조를 그대로 투영한 것입니다 (단위 셀과 같은 시점). dᵢⱼ → Gaussian expansion (${n}차원)`,
		atomFeatures: '원자 특징 벡터',
		embedNote: (n: number) => `셀에 마우스를 올리면 값이 보입니다 · ${n}차원 중 앞 16개 표시`,
		messagePassing: '메시지 패싱',
		convNote: '각 원자는 자신의 특징, 이웃의 특징, 결합 특징을 이어 붙여 linear layer에 통과시킨 뒤 둘로 나눕니다: sigmoid(filter) ⊙ softplus(core)를 이웃에 대해 합산합니다. 원자 둘레의 고리는 실시간 특징 값이고, 아래 막대는 gate 값입니다.',
		contributions: '원자별 기여도',
		fcHead: 'FC 헤드'
	};
	const P = $derived(lang === 'ko' ? PANEL_KO : PANEL_EN);

	let currentTheme = $state<'dark' | 'light'>('light');
	theme.subscribe((v) => { currentTheme = v; });

	const dimDownstream = $derived(playStep >= 0 && playStep < 3);

	// ----- guided walkthrough -----
	const STAGE_ORDER = ['input', 'graph', 'embed', 'conv0', 'conv1', 'conv2', 'pool', 'fc', 'energy'];
	const tourIdx = $derived(tourStage ? STAGE_ORDER.indexOf(tourStage) : -1);

	/** During the tour, stages after the current one are dimmed ("data has not arrived yet").
	 *  Outside the tour, the message-passing play dims pool/fc/energy. */
	function stageDimmed(stage: string): boolean {
		if (tourIdx >= 0) return STAGE_ORDER.indexOf(stage) > tourIdx;
		if (stage === 'pool' || stage === 'fc' || stage === 'energy') return dimDownstream;
		return false;
	}
	function convActive(li: number): boolean {
		return playStep === li || tourStage === `conv${li}`;
	}
	function convDimmed(li: number): boolean {
		if (playStep >= 0 && playStep < li) return true;
		return tourIdx >= 0 && STAGE_ORDER.indexOf(`conv${li}`) > tourIdx;
	}

	let hoveredAtomIdx = $state<number | null>(null);
	let expandedStage = $state<string | null>(null);

	// The tour drives the detail panels: open the panel of the stage being explained
	$effect(() => {
		if (!tourStage) {
			expandedStage = null;
			return;
		}
		if (tourStage === 'energy') expandedStage = null;
		else if (tourStage.startsWith('conv')) expandedStage = 'conv';
		else expandedStage = tourStage;
	});

	// Dynamic fit-to-width scaling (replaces fixed breakpoint scales)
	let scalerW = $state(0);
	let innerW = $state(0);
	let innerH = $state(0);
	const archScale = $derived(scalerW > 0 && innerW > 0 ? Math.min(1, scalerW / innerW) : 1);
	const archLeft = $derived(Math.max(0, (scalerW - innerW * archScale) / 2));

	hoveredAtom.subscribe((v) => { hoveredAtomIdx = v; });

	function toggleStage(stage: string) {
		expandedStage = expandedStage === stage ? null : stage;
	}

	// ========== SANKEY-STYLE STAGE CONNECTIONS ==========
	const CONN_W = 44;
	const BOX_H = 360;

	function strandY(i: number): number {
		const n = data.crystal.atoms.length;
		const top = BOX_H * 0.33;
		const bottom = BOX_H * 0.67;
		if (n === 1) return BOX_H / 2;
		return top + (i * (bottom - top)) / (n - 1);
	}
	function strandPath(y1: number, y2: number): string {
		return `M0,${y1} C${CONN_W / 2},${y1} ${CONN_W / 2},${y2} ${CONN_W},${y2}`;
	}
	function strandTargetY(i: number, mode: string): number {
		if (mode === 'merge') return BOX_H / 2;
		if (mode === 'mix') return strandY(data.crystal.atoms.length - 1 - i);
		return strandY(i);
	}
	function strandOpacity(i: number): number {
		if (hoveredAtomIdx == null) return 0.75;
		return hoveredAtomIdx === i ? 0.95 : 0.15;
	}

	// ========== SHARED CABINET PROJECTION ==========
	// (chosen so that high-symmetry sites do not project onto each other)
	function projectRaw(x: number, y: number, z: number): [number, number] {
		return [x + 0.35 * y, 0.35 * y - 0.9 * z];
	}

	// ========== CRYSTAL UNIT CELL RENDERER (inside the Input panel) ==========
	function project3D(x: number, y: number, z: number, size: number): [number, number] {
		const scale = size / (data.crystal.lattice.a * 2.2);
		const [rx, ry] = projectRaw(x, y, z);
		return [size * 0.19 + rx * scale, size * 0.52 + ry * scale];
	}

	function drawUnitCell(svgEl: SVGSVGElement, size: number) {
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		const cs = getComputedStyle(document.documentElement);
		const borderColor = cs.getPropertyValue('--border').trim();
		const border2Color = cs.getPropertyValue('--wire').trim();
		const nodeLabelColor = cs.getPropertyValue('--node-label').trim();
		const axisColor = cs.getPropertyValue('--text5').trim() || '#8f8f8f';
		const a = data.crystal.lattice.a;
		const b = data.crystal.lattice.b;
		const c = data.crystal.lattice.c;

		const corners = [
			[0,0,0],[a,0,0],[a,b,0],[0,b,0],
			[0,0,c],[a,0,c],[a,b,c],[0,b,c]
		];
		const projected = corners.map(([x,y,z]) => project3D(x, y, z, size));

		const backEdges = [[0,3],[3,7],[0,4],[3,2]];
		backEdges.forEach(([i,j]) => {
			svg.append('line')
				.attr('x1', projected[i][0]).attr('y1', projected[i][1])
				.attr('x2', projected[j][0]).attr('y2', projected[j][1])
				.attr('stroke', borderColor).attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
				.attr('stroke-opacity', 0.6);
		});

		const solidEdges = [[0,1],[1,2],[4,5],[5,6],[6,7],[1,5],[2,6]];
		solidEdges.forEach(([i,j]) => {
			svg.append('line')
				.attr('x1', projected[i][0]).attr('y1', projected[i][1])
				.attr('x2', projected[j][0]).attr('y2', projected[j][1])
				.attr('stroke', border2Color).attr('stroke-width', 1).attr('stroke-opacity', 0.8);
		});
		[[4,7]].forEach(([i,j]) => {
			svg.append('line')
				.attr('x1', projected[i][0]).attr('y1', projected[i][1])
				.attr('x2', projected[j][0]).attr('y2', projected[j][1])
				.attr('stroke', borderColor).attr('stroke-width', 1).attr('stroke-dasharray', '3,2')
				.attr('stroke-opacity', 0.6);
		});

		const periodicImages: { element: string; coords: [number,number,number]; ghost: boolean }[] = [];
		data.crystal.atoms.forEach(atom => {
			periodicImages.push({ element: atom.element, coords: atom.coords as [number,number,number], ghost: false });
		});
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

		periodicImages.sort((p, q) => p.coords[2] - q.coords[2]);

		const placedLabels: [number, number][] = [];
		const labelCollides = (x: number, y: number) =>
			placedLabels.some(([lx, ly]) => Math.abs(lx - x) < 22 && Math.abs(ly - y) < 16);

		periodicImages.forEach((img) => {
			const [px, py] = project3D(img.coords[0], img.coords[1], img.coords[2], size);
			const r = ((elementRadii[img.element] || 14) * 0.62);
			const color = elementColors[img.element] || '#8f8f8f';

			svg.append('circle')
				.attr('cx', px).attr('cy', py).attr('r', r)
				.attr('fill', color)
				.attr('opacity', img.ghost ? 0.25 : 0.9)
				.attr('stroke', img.ghost ? 'none' : nodeLabelColor)
				.attr('stroke-width', img.ghost ? 0 : 1);

			if (!img.ghost && !labelCollides(px, py + 1)) {
				svg.append('text')
					.attr('x', px).attr('y', py + 1)
					.attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
					.attr('fill', nodeLabelColor).attr('font-size', '14px').attr('font-weight', '600')
					.attr('pointer-events', 'none').text(img.element);
				placedLabels.push([px, py + 1]);
			}
		});

		const origin = project3D(0, 0, 0, size);
		const aEnd = project3D(a * 0.3, 0, 0, size);
		const bEnd = project3D(0, b * 0.3, 0, size);
		const cEnd = project3D(0, 0, c * 0.3, size);

		[{end: aEnd, label: 'a'}, {end: bEnd, label: 'b'}, {end: cEnd, label: 'c'}].forEach(({end, label}) => {
			svg.append('line')
				.attr('x1', origin[0]).attr('y1', origin[1])
				.attr('x2', end[0]).attr('y2', end[1])
				.attr('stroke', axisColor).attr('stroke-width', 1.5).attr('stroke-opacity', 0.7);
			let lx = end[0] + (end[0] - origin[0]) * 0.3;
			let ly = end[1] + (end[1] - origin[1]) * 0.3;
			if (labelCollides(lx, ly)) {
				lx = end[0] + (end[0] - origin[0]) * 1.1;
				ly = end[1] + (end[1] - origin[1]) * 1.1;
			}
			if (labelCollides(lx, ly)) return;
			svg.append('text')
				.attr('x', lx).attr('y', ly)
				.attr('text-anchor', 'middle').attr('fill', axisColor)
				.attr('font-size', '13px').attr('font-weight', '600').attr('opacity', 0.9)
				.text(label);
			placedLabels.push([lx, ly]);
		});
	}

	// ========== STRUCTURE-PROJECTED GRAPH ==========
	// Nodes sit at the atoms' real (projected) positions, edges are the actual
	// bonds — the graph looks like the crystal instead of an abstract polygon.
	function drawStructureGraph(
		svgEl: SVGSVGElement, w: number, h: number,
		features: number[][] | null, showFeatures: boolean,
		rScale: number, fontPx: number
	) {
		const svg = d3.select(svgEl);
		svg.selectAll('*').remove();
		const cs = getComputedStyle(document.documentElement);
		const wireColor = cs.getPropertyValue('--wire').trim();
		const nodeLabelColor = cs.getPropertyValue('--node-label').trim();
		const atoms = data.crystal.atoms;
		const bondList = data.crystal.bonds;

		const raw = atoms.map((a) => projectRaw(a.coords[0], a.coords[1], a.coords[2]));
		const xs = raw.map((p) => p[0]);
		const ys = raw.map((p) => p[1]);
		const minX = Math.min(...xs), maxX = Math.max(...xs);
		const minY = Math.min(...ys), maxY = Math.max(...ys);
		const pad = showFeatures ? 18 : 20;
		const spanX = Math.max(maxX - minX, 1e-6);
		const spanY = Math.max(maxY - minY, 1e-6);
		const s = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
		const ox = (w - s * spanX) / 2;
		const oy = (h - s * spanY) / 2;
		const pos = raw.map(([x, y]) => ({
			x: ox + (x - minX) * s,
			y: oy + (y - minY) * s
		}));

		// nudge apart nodes that project onto (nearly) the same point
		for (let i = 1; i < pos.length; i++) {
			let guard = 0;
			while (guard++ < 4 && pos.slice(0, i).some((p) => Math.hypot(p.x - pos[i].x, p.y - pos[i].y) < 10)) {
				pos[i].x += 9;
				pos[i].y -= 7;
			}
		}

		bondList.forEach((bond) => {
			svg.append('line')
				.attr('x1', pos[bond.source].x).attr('y1', pos[bond.source].y)
				.attr('x2', pos[bond.target].x).attr('y2', pos[bond.target].y)
				.attr('stroke', wireColor).attr('stroke-width', 1.5).attr('stroke-opacity', 0.8);
		});

		const order = atoms.map((_, i) => i).sort((i, j) => pos[i].y - pos[j].y);
		order.forEach((i) => {
			const atom = atoms[i];
			const p = pos[i];
			const r = (elementRadii[atom.element] || 14) * rScale;

			if (showFeatures && features?.[i]) {
				const sl = features[i].slice(0, 8);
				const arcAngle = (2 * Math.PI) / sl.length;
				sl.forEach((val, j) => {
					const arc = d3.arc().innerRadius(r + 1.5).outerRadius(r + 5.5)
						.startAngle(j * arcAngle).endAngle((j + 1) * arcAngle);
					svg.append('path').attr('d', arc as any)
						.attr('transform', `translate(${p.x},${p.y})`)
						.attr('fill', featureColorScale(val)).attr('opacity', 0.85);
				});
			}

			svg.append('circle').attr('cx', p.x).attr('cy', p.y).attr('r', r)
				.attr('fill', elementColors[atom.element] || '#8f8f8f')
				.attr('stroke', nodeLabelColor).attr('stroke-width', 1);

			svg.append('text').attr('x', p.x).attr('y', p.y + 0.5)
				.attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
				.attr('fill', nodeLabelColor).attr('font-size', `${fontPx}px`).attr('font-weight', '600')
				.attr('pointer-events', 'none').text(atom.element);
		});
	}

	// Redraw all d3 canvases whenever the live data or the theme changes
	$effect(() => {
		void data;
		void currentTheme;
		const graphSvg = document.getElementById('svg-graph') as SVGSVGElement | null;
		if (graphSvg) drawStructureGraph(graphSvg, 185, 185, null, false, 0.85, 15);
		data.cgcnn.conv_layers.forEach((layer, i) => {
			const svg = document.getElementById(`svg-conv-${i}`) as SVGSVGElement | null;
			if (svg) drawStructureGraph(svg, 118, 118, layer.output_features, true, 0.62, 12);
		});
	});

	// The unit cell lives inside the Input detail panel — draw when it opens
	$effect(() => {
		void data;
		void currentTheme;
		if (expandedStage !== 'input') return;
		const ucSvg = document.getElementById('svg-unitcell') as SVGSVGElement | null;
		if (ucSvg) drawUnitCell(ucSvg, 230);
	});
</script>

{#snippet flowConn(stage: string, mode: 'atoms' | 'mix' | 'merge' | 'single')}
	<div class="conn" class:play-dim={stageDimmed(stage)}>
		<svg width={CONN_W} height={BOX_H} viewBox="0 0 {CONN_W} {BOX_H}">
			{#if mode === 'single'}
				<path d={strandPath(BOX_H / 2, BOX_H / 2)} stroke="var(--accent)" stroke-width="2.5" fill="none" opacity="0.7"/>
			{:else}
				{#each data.crystal.atoms as atom, i}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<path
						d={strandPath(strandY(i), strandTargetY(i, mode))}
						stroke={atom.color}
						stroke-width={hoveredAtomIdx === i ? 4 : 2.2}
						fill="none"
						opacity={strandOpacity(i)}
						style="pointer-events: stroke; cursor: pointer"
						onmouseenter={() => hoveredAtom.set(i)}
						onmouseleave={() => hoveredAtom.set(null)}
					/>
				{/each}
			{/if}
		</svg>
	</div>
{/snippet}

<!-- ======= MAIN ARCHITECTURE ======= -->
<div class="arch-scaler" bind:clientWidth={scalerW} style={innerH ? `height:${Math.ceil(innerH * archScale)}px` : ''}>
<div class="arch-inner" bind:clientWidth={innerW} bind:clientHeight={innerH}
	style="transform: scale({archScale}); margin-left: {archLeft}px">

	<!-- Neural Network group -->
	<div class="nn-frame">
		<div class="nn-title">CrystalGraphConvNet</div>

		<div class="nn-body">

			<!-- INPUT CRYSTAL (Blender render) -->
			<div class="layer-group anim-in" class:play-dim={stageDimmed('input')} style="--delay:0s">
				<button class="layer-box" class:layer-active={expandedStage === 'input'}
					class:tour-active={tourStage === 'input'}
					onclick={() => toggleStage('input')}>
					<div class="layer-header">Crystal Structure</div>
					<div class="layer-visual">
						<img class="input-render" src={`${imgBase}/${structureId}-supercell.webp`}
							alt={`${data.crystal.name} supercell`} />
					</div>
					<div class="layer-meta">{data.crystal.formula} &middot; {data.crystal.space_group}</div>
				</button>
			</div>

			{@render flowConn('graph', 'atoms')}

			<!-- GRAPH CONSTRUCTION -->
			<div class="layer-group anim-in" class:play-dim={stageDimmed('graph')} style="--delay:0.08s">
				<button class="layer-box" class:layer-active={expandedStage === 'graph'}
					class:tour-active={tourStage === 'graph'}
					onclick={() => toggleStage('graph')}>
					<div class="layer-header">Build Graph</div>
					<div class="layer-visual">
						<svg id="svg-graph" width="185" height="185"></svg>
					</div>
					<div class="layer-meta">{data.graph.num_nodes} nodes &middot; ~{data.graph.num_neighbors} nbrs &middot; r = {data.graph.cutoff_radius.toFixed(1)}&#8491;</div>
				</button>
			</div>

			{@render flowConn('embed', 'atoms')}

			<!-- EMBEDDING -->
			<div class="layer-group anim-in" class:play-dim={stageDimmed('embed')} style="--delay:0.16s">
				<button class="layer-box" class:layer-active={expandedStage === 'embed'}
					class:tour-active={tourStage === 'embed'}
					onclick={() => toggleStage('embed')}>
					<div class="layer-header">Embedding</div>
					<div class="layer-visual">
						<div class="feat-preview">
							{#each data.crystal.atoms as atom, i}
								<div class="feat-row" class:feat-hl={hoveredAtomIdx === i}
									role="button" tabindex="0"
									onmouseenter={() => hoveredAtom.set(i)}
									onmouseleave={() => hoveredAtom.set(null)}>
									<span class="feat-lbl" style="color:{atom.color}">{atom.element}</span>
									{#each data.cgcnn.embedding.atom_features[i].slice(0, 12) as v}
										<span class="fc" style="background:{featureColorScale(v)}"></span>
									{/each}
								</div>
							{/each}
						</div>
					</div>
					<div class="layer-meta">one-hot {data.cgcnn.embedding.input_dim} &rarr; {data.cgcnn.embedding.output_dim}d</div>
				</button>
			</div>

			{@render flowConn('conv0', 'mix')}

			<!-- CONV LAYERS -->
			<div class="layer-group anim-in" class:play-dim={stageDimmed('conv0')} style="--delay:0.24s">
				<button class="layer-box" class:layer-active={expandedStage === 'conv'}
					class:tour-active={!!tourStage && tourStage.startsWith('conv')}
					onclick={() => toggleStage('conv')}>
					<div class="layer-header">Graph Convolution &times;{data.cgcnn.num_conv}</div>
					<div class="layer-visual">
						<div class="conv-stack">
							{#each data.cgcnn.conv_layers as layer, li}
								<div class="conv-unit"
									class:play-active={convActive(li)}
									class:play-dim={convDimmed(li)}
									style="--delay:{0.3 + li * 0.1}s">
									<div class="conv-lbl">L{li + 1}</div>
									<svg id="svg-conv-{li}" width="118" height="118"></svg>
									<div class="feat-preview feat-sm">
										{#each data.crystal.atoms as atom, ai}
											<div class="feat-row" role="button" tabindex="0"
												onmouseenter={() => hoveredAtom.set(ai)}
												onmouseleave={() => hoveredAtom.set(null)}>
												{#each layer.output_features[ai].slice(0, 8) as v}
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
										<svg width="22" height="60" viewBox="0 0 22 60">
											{#each [15, 30, 45] as y1}
												{#each [15, 30, 45] as y2}
													<line x1="0" y1={y1} x2="22" y2={y2} style="stroke: var(--wire)" stroke-width="0.5"/>
												{/each}
											{/each}
										</svg>
									</div>
								{/if}
							{/each}
						</div>
					</div>
					<div class="layer-meta">gated message passing &middot; {data.cgcnn.atom_fea_len}d</div>
				</button>
			</div>

			{@render flowConn('pool', 'merge')}

			<!-- POOLING -->
			<div class="layer-group anim-in" class:play-dim={stageDimmed('pool')} style="--delay:0.4s">
				<button class="layer-box" class:layer-active={expandedStage === 'pool'}
					class:tour-active={tourStage === 'pool'}
					onclick={() => toggleStage('pool')}>
					<div class="layer-header">Mean Pooling</div>
					<div class="layer-visual">
						<div class="pool-viz">
							<div class="pool-atoms">
								{#each data.crystal.atoms as atom, i}
									<div class="pool-atom" style="--d:{i * 0.12}s"
										role="button" tabindex="0"
										onmouseenter={() => hoveredAtom.set(i)}
										onmouseleave={() => hoveredAtom.set(null)}>
										<div class="pool-circle" style="background:{atom.color}; --sz:{24 + data.cgcnn.pooling.per_atom_contribution[i] * 55 * (data.crystal.atoms.length / 5)}px">
											<span class="pool-el">{atom.element}</span>
										</div>
										<span class="pool-pct">{(data.cgcnn.pooling.per_atom_contribution[i] * 100).toFixed(0)}%</span>
									</div>
								{/each}
							</div>
							<svg class="pool-funnel" viewBox="0 0 220 44" width="220" height="44">
								{#each data.crystal.atoms as _, i}
									<line x1={110 + (i - (data.crystal.atoms.length - 1) / 2) * (190 / Math.max(1, data.crystal.atoms.length - 1))} y1="2" x2="110" y2="40"
										stroke-width="1" stroke-dasharray="3,2" class="f-line" style="stroke: var(--wire); --d:{i*0.1}s"/>
								{/each}
							</svg>
							<div class="pool-out">
								<div class="pool-out-circle"><span class="pool-out-lbl">x&#772;</span></div>
								<div class="pool-feat">
									{#each data.cgcnn.pooling.crystal_feature.slice(0, 16) as v}
										<span class="fc" style="background:{featureColorScale(v)}"></span>
									{/each}
								</div>
							</div>
						</div>
					</div>
					<div class="layer-meta">{data.crystal.atoms.length} atoms &rarr; one {data.cgcnn.atom_fea_len}d vector</div>
				</button>
			</div>

			{@render flowConn('fc', 'single')}

			<!-- FC LAYERS -->
			<div class="layer-group anim-in" class:play-dim={stageDimmed('fc')} style="--delay:0.48s">
				<button class="layer-box" class:layer-active={expandedStage === 'fc'}
					class:tour-active={tourStage === 'fc'}
					onclick={() => toggleStage('fc')}>
					<div class="layer-header">Fully Connected</div>
					<div class="layer-visual">
						<svg class="nn-svg" width="150" height="136" viewBox="0 0 110 100">
							{#each [18, 33, 48, 63, 78] as y, i}
								<circle cx="12" cy={y} r="3.5" class="nn-node" style="fill: var(--text5); --d:{0.5+i*0.04}s"/>
							{/each}
							<text x="12" y="97" text-anchor="middle" style="fill: var(--text2)" font-size="11">64</text>
							{#each [18, 33, 48, 63, 78] as y1}
								{#each [10, 22, 34, 46, 58, 70, 82] as y2}
									<line x1="16" y1={y1} x2="51" y2={y2} style="stroke: var(--wire)" stroke-width="0.35"/>
								{/each}
							{/each}
							{#each [10, 22, 34, 46, 58, 70, 82] as y, i}
								<circle cx="55" cy={y} r="3" class="nn-node" style="fill: var(--text2); --d:{0.6+i*0.03}s"/>
							{/each}
							<text x="55" y="97" text-anchor="middle" style="fill: var(--text2)" font-size="11">128</text>
							{#each [10, 22, 34, 46, 58, 70, 82] as y2}
								<line x1="58" y1={y2} x2="93" y2="46" style="stroke: var(--wire)" stroke-width="0.35"/>
							{/each}
							<circle cx="97" cy="46" r="6" style="stroke: var(--accent); fill: var(--bg)" stroke-width="1.5"/>
							<text x="97" y="49.5" text-anchor="middle" style="fill: var(--accent)" font-size="9.5" font-weight="600">E</text>
						</svg>
					</div>
					<div class="layer-meta">{data.cgcnn.atom_fea_len} &rarr; {data.cgcnn.h_fea_len} &rarr; 1</div>
				</button>
			</div>

		</div><!-- nn-body -->
	</div><!-- nn-frame -->

	<!-- ===== ENERGY OUTPUT ===== -->
	<div class="energy-conn" class:play-dim={stageDimmed('energy')}>
		<svg width="56" height="30" viewBox="0 0 56 30">
			<path d="M0 15 L42 15" style="stroke: var(--accent)" stroke-width="2.5" opacity="0.7"/>
			<polygon points="42,8 56,15 42,22" style="fill: var(--accent)" opacity="0.8"/>
		</svg>
	</div>

	<div class="energy-block anim-energy" class:play-dim={stageDimmed('energy')}
		class:tour-active={tourStage === 'energy'}>
		<div class="energy-inner">
			<div class="energy-icon">E</div>
			<div class="energy-prop">{data.cgcnn.prediction.property.replace(/\s*\([^)]*\)\s*$/, '')}</div>
			<div class="energy-val">{data.cgcnn.prediction.value.toFixed(3)}</div>
			<div class="energy-unit">{data.cgcnn.prediction.unit}</div>
		</div>
	</div>

</div><!-- arch-inner -->
</div><!-- arch-scaler -->

<!-- ===== DETAIL PANEL (full scale, below the diagram) ===== -->
{#if expandedStage}
	<div class="details-wrap">
		<div class="detail-panel anim-detail">
			{#if expandedStage === 'input'}
				<div class="detail-title">{P.unitCell}</div>
				<div class="detail-cols">
					<div class="uc-wrap"><svg id="svg-unitcell" width="230" height="230"></svg></div>
					<div>
						<div class="detail-grid">
							<span class="dk">{P.spaceGroup}</span><span class="dv">{data.crystal.space_group}</span>
							<span class="dk">a, b, c</span><span class="dv">{data.crystal.lattice.a}, {data.crystal.lattice.b}, {data.crystal.lattice.c} &#8491;</span>
							<span class="dk">{P.atoms}</span><span class="dv">{data.crystal.atoms.length} {P.perCell}</span>
						</div>
						<div class="atom-chips">
							{#each data.crystal.atoms as atom}
								<span class="atom-chip" role="button" tabindex="0"
									onmouseenter={() => hoveredAtom.set(atom.index)}
									onmouseleave={() => hoveredAtom.set(null)}>
									<span class="atom-dot" style="background:{atom.color}"></span>
									{atom.element}<sub>{atom.index}</sub>
								</span>
							{/each}
						</div>
						<p class="detail-note">{P.ghostNote}</p>
					</div>
				</div>
			{:else if expandedStage === 'graph'}
				<div class="detail-title">{P.neighborList}</div>
				{#each data.graph.neighbor_list as nl}
					<div class="nbr-row">
						<span class="nbr-c" style="color:{data.crystal.atoms[nl.center].color}">{data.crystal.atoms[nl.center].element}<sub>{nl.center}</sub></span>
						<span class="nbr-a">&rarr;</span>
						<span class="nbr-l">[{nl.neighbors.slice(0,6).map(n => data.crystal.atoms[n].element + n).join(', ')}{nl.neighbors.length > 6 ? '...' : ''}]</span>
					</div>
				{/each}
				<p class="detail-note">{P.graphNote(data.cgcnn.nbr_fea_len)}</p>
			{:else if expandedStage === 'embed'}
				<div class="detail-title">{P.atomFeatures}</div>
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
										<td><span class="ft-cell" title={v.toFixed(2)} style="background:{featureColorScale(v)}"></span></td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="detail-note">{P.embedNote(data.cgcnn.embedding.output_dim)}</p>
			{:else if expandedStage === 'conv'}
				<div class="detail-title">{P.messagePassing}</div>
				<div class="mp-formula">
					<span class="ob">h<sub>i</sub></span>
					<span class="os">||</span>
					<span class="ob">h<sub>j</sub></span>
					<span class="os">||</span>
					<span class="ob">e<sub>ij</sub></span>
					<span class="oa">&rarr;</span>
					<span class="ob">FC+BN</span>
					<span class="oa">&rarr;</span>
					<span class="ob">&sigma;</span>
					<span class="os">&odot;</span>
					<span class="ob">sp</span>
					<span class="oa">&rarr;</span>
					<span class="ob">&Sigma;</span>
				</div>
				<p class="detail-note">{P.convNote}</p>
			{:else if expandedStage === 'pool'}
				<div class="detail-title">{P.contributions}</div>
				{#each data.crystal.atoms as atom, i}
					<div class="pb-row" role="button" tabindex="0"
						onmouseenter={() => hoveredAtom.set(i)}
						onmouseleave={() => hoveredAtom.set(null)}>
						<span class="pb-lbl" style="color:{atom.color}">{atom.element}#{i}</span>
						<div class="pb-track">
							<div class="pb-fill pb-anim" style="width:{data.cgcnn.pooling.per_atom_contribution[i] * 100 * data.crystal.atoms.length}%; background:{atom.color}; --d:{i*0.1}s"></div>
						</div>
						<span class="pb-val">{data.cgcnn.pooling.per_atom_contribution[i].toFixed(3)}</span>
					</div>
				{/each}
			{:else if expandedStage === 'fc'}
				<div class="detail-title">{P.fcHead}</div>
				<div class="fc-flow">
					<span class="ob">Linear(64,128)</span>
					<span class="oa">&rarr;</span>
					<span class="ob">Softplus</span>
					<span class="oa">&rarr;</span>
					<span class="ob">Linear(128,1)</span>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ===== AUTO-SCALING HORIZONTAL ROOT ===== */
	.arch-scaler {
		width: 100%;
		overflow: hidden;
	}
	.arch-inner {
		display: flex;
		align-items: flex-start;
		gap: 0;
		padding: 24px 16px;
		width: max-content;
		transform-origin: top left;
	}

	/* ===== NN GROUP ===== */
	.nn-frame {
		position: relative;
		flex-shrink: 0;
	}
	.nn-title {
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
		color: var(--text2);
		letter-spacing: 0.011em;
		text-transform: uppercase;
		padding-left: 14px;
		margin-bottom: 10px;
	}
	.nn-body {
		display: flex;
		align-items: flex-start;
		gap: 0;
		padding: 0 2px;
	}

	/* ===== LAYER GROUP ===== */
	.layer-group {
		display: flex; flex-direction: column; align-items: center; flex-shrink: 0;
	}
	.anim-in { animation: slideIn 0.45s ease-out both; animation-delay: var(--delay); }
	@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

	/* ===== LAYER BOX (uniform height) ===== */
	.layer-box {
		display: flex; flex-direction: column; align-items: center;
		height: 360px;
		padding: 16px 18px; border-radius: var(--radius-card);
		border: none; background: var(--layer-bg);
		cursor: pointer; transition: background 0.2s, transform 0.2s;
	}
	.layer-box:hover { background: var(--layer-hover-bg); transform: translateY(-1px); }
	.layer-active { background: var(--layer-active-bg); }

	.layer-header {
		font-size: 15px; font-weight: 600; color: var(--text);
		margin-bottom: 6px; white-space: nowrap;
	}
	.layer-visual {
		flex: 1;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
	}
	.layer-meta {
		font-size: 15px; color: var(--text2); margin-top: 6px;
		font-variant-numeric: tabular-nums; white-space: nowrap;
	}
	.input-render {
		width: 210px; height: 210px; object-fit: contain; display: block;
	}

	/* ===== SANKEY CONNECTIONS ===== */
	.conn { display: flex; align-items: center; flex-shrink: 0; }
	.conn svg { display: block; }
	.conn path { transition: opacity 0.2s, stroke-width 0.2s; }

	/* ===== FEATURES ===== */
	.feat-preview { display: flex; flex-direction: column; gap: 2px; }
	.feat-sm { gap: 1px; margin-top: 4px; }
	.feat-row { display: flex; align-items: center; gap: 1px; padding: 1px; border-radius: 2px; transition: background 0.1s; }
	.feat-row:hover, .feat-hl { background: var(--chip-bg); }
	.feat-lbl { font-size: 15px; font-weight: 600; width: 24px; text-align: right; margin-right: 4px; }
	.fc { display: inline-block; width: 10px; height: 16px; border-radius: 1px; }
	.fc-s { display: inline-block; width: 6px; height: 10px; border-radius: 0.5px; }

	/* ===== CONV ===== */
	.conv-stack { display: flex; align-items: center; gap: 0; justify-content: center; }
	.conv-unit {
		display: flex; flex-direction: column; align-items: center;
		padding: 10px; border-radius: var(--radius-card);
		background: var(--conv-bg);
		animation: slideIn 0.4s ease-out both; animation-delay: var(--delay);
		transition: opacity 0.35s, transform 0.35s, background 0.35s;
	}
	.conv-lbl { font-size: 15px; font-weight: 500; line-height: 1; color: var(--text2); margin-bottom: 4px; }
	.conv-conn-wire { flex-shrink: 0; display: flex; align-items: center; }
	.gate-bar { display: flex; gap: 1px; margin-top: 4px; }
	.gc { display: inline-block; width: 8px; height: 6px; border-radius: 0.5px; background: var(--accent); }

	/* ===== STEP-PLAY / WALKTHROUGH =====
	   !important needed: the finished slideIn/ePop keyframes (fill: both)
	   otherwise override opacity/transform on these elements. */
	.play-active {
		background: var(--layer-active-bg);
		transform: scale(1.05) !important;
	}
	.play-dim {
		opacity: 0.18 !important;
	}
	.tour-active {
		background: var(--layer-active-bg);
	}
	.energy-block.tour-active {
		background: var(--layer-active-bg);
	}
	.layer-group, .energy-block, .energy-conn, .conn {
		transition: opacity 0.35s;
	}

	.mp-formula { display: flex; align-items: center; gap: 5px; margin-bottom: 12px; flex-wrap: wrap; }
	.ob {
		display: inline-block; padding: 4px 10px; border-radius: var(--radius-pill);
		font-size: 15px; font-weight: 500; line-height: 1.2;
		background: var(--chip-bg); color: var(--text);
	}
	.ob sub { font-size: 0.72em; line-height: 0; }
	.os { color: var(--text5); font-size: 15px; }
	.oa { color: var(--text5); font-size: 15px; }

	/* ===== POOLING ===== */
	.pool-viz { display: flex; flex-direction: column; align-items: center; }
	.pool-atoms { display: flex; gap: 8px; align-items: flex-end; }
	.pool-atom { display: flex; flex-direction: column; align-items: center; gap: 3px; animation: pFloat 3s ease-in-out infinite; animation-delay: var(--d); }
	@keyframes pFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
	.pool-circle {
		width: var(--sz); height: var(--sz); border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		transition: transform 0.2s;
	}
	.pool-circle:hover { transform: scale(1.12); }
	.pool-el { font-size: 13px; font-weight: 600; color: var(--node-label); }
	.pool-pct { font-size: 15px; color: var(--text2); font-variant-numeric: tabular-nums; }
	.pool-funnel { margin-top: 4px; }
	.f-line { animation: fPulse 2s ease-in-out infinite; animation-delay: var(--d); }
	@keyframes fPulse { 0%,100%{opacity:0.3} 50%{opacity:0.8} }
	.pool-out { display: flex; flex-direction: column; align-items: center; gap: 5px; }
	.pool-out-circle {
		width: 36px; height: 36px; border-radius: 50%;
		background: var(--accent);
		display: flex; align-items: center; justify-content: center;
	}
	.pool-out-lbl { font-size: 16px; font-weight: 600; color: var(--bg); }
	.pool-feat { display: flex; gap: 1px; }

	/* ===== FC NN ===== */
	.nn-node { animation: nAppear 0.3s ease-out both; animation-delay: var(--d); }
	@keyframes nAppear { from{r:0;opacity:0} to{opacity:1} }

	/* ===== ENERGY ===== */
	.energy-conn { flex-shrink: 0; display: flex; align-items: center; height: 360px; margin-top: 25px; }

	.energy-block {
		position: relative; flex-shrink: 0;
		border-radius: var(--radius-card);
		height: 360px; width: 200px;
		box-sizing: border-box;
		padding: 24px 28px;
		background: var(--energy-bg);
		text-align: center;
		margin-top: 25px;
		display: flex; align-items: center; justify-content: center;
		transition: background 0.3s;
	}
	.anim-energy { animation: ePop 0.5s ease-out 0.7s both; }
	@keyframes ePop { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
	.energy-inner { position: relative; z-index: 1; }
	.energy-icon {
		width: 40px; height: 40px; border-radius: 50%;
		background: var(--accent);
		color: var(--bg); font-size: 17px; font-weight: 600;
		margin: 0 auto 10px; display: flex; align-items: center; justify-content: center;
	}
	.energy-prop { font-size: 15px; color: var(--text2); font-weight: 500; margin-bottom: 6px; letter-spacing: 0.011em; }
	.energy-val {
		font-size: 30px; font-weight: 600; line-height: 1.1; color: var(--text);
		font-variant-numeric: tabular-nums; letter-spacing: -0.01em;
	}
	.energy-unit { font-size: 15px; color: var(--text2); margin-top: 6px; }

	/* ===== DETAIL PANEL (rendered at natural scale, below the diagram) ===== */
	.details-wrap {
		display: flex;
		justify-content: center;
		padding: 4px 24px 0;
	}
	.detail-panel {
		padding: 20px 24px; border-radius: var(--radius-card);
		background: var(--detail-bg);
		min-width: 420px; max-width: 760px;
		transition: background 0.3s;
		text-align: left;
	}
	.anim-detail { animation: dSlide 0.2s ease-out; }
	@keyframes dSlide { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
	.detail-title { font-size: 15px; font-weight: 600; line-height: 1; color: var(--text); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.011em; }
	.detail-cols { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
	.uc-wrap { display: flex; justify-content: center; }
	.detail-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; font-size: 15px; }
	.dk { color: var(--text2); } .dv { color: var(--text); font-variant-numeric: tabular-nums; }
	.detail-note { font-size: 15px; color: var(--text2); margin-top: 12px; line-height: 1.55; max-width: 560px; }
	.atom-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 12px; }
	.atom-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: var(--radius-pill); background: var(--chip-bg); font-size: 15px; color: var(--text); cursor: pointer; transition: background 0.2s; }
	.atom-chip:hover { background: var(--layer-hover-bg); }
	.atom-chip sub { font-size: 0.72em; line-height: 0; }
	.atom-dot { width: 8px; height: 8px; border-radius: 50%; }
	.nbr-row { font-size: 15px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
	.nbr-c { font-weight: 600; }
	.nbr-c sub { font-size: 0.72em; line-height: 0; }
	.nbr-a { color: var(--text5); } .nbr-l { color: var(--text2); font-variant-numeric: tabular-nums; }
	.feat-table-wrap { overflow-x: auto; }
	.feat-table { border-collapse: collapse; }
	.feat-table th { font-size: 15px; font-weight: 400; color: var(--text2); padding: 0 3px 4px; text-align: center; }
	.feat-table td { padding: 1.5px; text-align: center; vertical-align: middle; }
	.ft-label { font-size: 15px; font-weight: 600; padding-right: 10px !important; white-space: nowrap; }
	.ft-cell { display: inline-block; width: 28px; height: 21px; border-radius: 2px; }
	.fc-flow { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.pb-row { display: flex; align-items: center; gap: 10px; cursor: pointer; margin-bottom: 6px; border-radius: var(--radius-pill); padding: 3px 6px; }
	.pb-row:hover { background: var(--chip-bg); }
	.pb-lbl { font-size: 15px; font-weight: 600; width: 48px; text-align: right; }
	.pb-track { width: 180px; height: 10px; background: var(--surface); border-radius: var(--radius-pill); overflow: hidden; }
	.pb-fill { height: 100%; border-radius: var(--radius-pill); }
	.pb-anim { animation: bGrow 0.5s ease-out both; animation-delay: var(--d); }
	@keyframes bGrow { from{width:0 !important} }
	.pb-val { font-size: 15px; color: var(--text2); font-variant-numeric: tabular-nums; }
</style>
