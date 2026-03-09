<script lang="ts">
	import type { CgcnnData } from '$lib/stores/modelData';

	interface Props {
		data: CgcnnData;
	}

	let { data }: Props = $props();

	let hoveredNode = $state<string | null>(null);

	// ========== LAYOUT CONSTANTS ==========
	const W = 1200;
	const H = 400;
	const PAD_TOP = 50;
	const PAD_BOTTOM = 30;
	const PAD_LEFT = 40;
	const PAD_RIGHT = 40;
	const USABLE_H = H - PAD_TOP - PAD_BOTTOM;
	const USABLE_W = W - PAD_LEFT - PAD_RIGHT;

	const NUM_ATOMS = data.crystal.atoms.length; // 5
	const NODE_GAP = 6;

	// Dimension values for proportional heights
	const DIM_INPUT = data.cgcnn.embedding.input_dim; // 92
	const DIM_EMBED = data.cgcnn.embedding.output_dim; // 64
	const DIM_CONV = data.cgcnn.atom_fea_len; // 64
	const DIM_POOL = DIM_CONV; // 64
	const DIM_FC = data.cgcnn.h_fea_len; // 128
	const DIM_OUT = 1;

	// Column definitions
	const columns = [
		{ id: 'input', label: 'Input', dim: DIM_INPUT, count: NUM_ATOMS },
		{ id: 'embed', label: 'Embed', dim: DIM_EMBED, count: NUM_ATOMS },
		{ id: 'conv0', label: 'Conv1', dim: DIM_CONV, count: NUM_ATOMS },
		{ id: 'conv1', label: 'Conv2', dim: DIM_CONV, count: NUM_ATOMS },
		{ id: 'conv2', label: 'Conv3', dim: DIM_CONV, count: NUM_ATOMS },
		{ id: 'pool', label: 'Pool', dim: DIM_POOL, count: 1 },
		{ id: 'fc', label: 'FC', dim: DIM_FC, count: 1 },
		{ id: 'output', label: 'Output', dim: DIM_OUT, count: 1 },
	];

	// Column x positions
	const colXs = columns.map((_, i) => PAD_LEFT + (i / (columns.length - 1)) * USABLE_W);
	const NODE_WIDTH = 28;

	// Compute max total height reference for scaling
	const MAX_DIM = DIM_FC; // 128 is the tallest single node
	// Scale: total available height for nodes in a column
	const TOTAL_NODE_AREA = USABLE_H - 20;

	// Compute node height from dimension - scale relative to max
	function nodeHeight(dim: number, count: number): number {
		if (count === 1) {
			// Single node columns - scale proportionally but cap
			const h = (dim / MAX_DIM) * (TOTAL_NODE_AREA * 0.85);
			return Math.max(12, Math.min(h, TOTAL_NODE_AREA * 0.85));
		}
		// Multi-node columns: distribute proportionally
		const totalH = (dim / MAX_DIM) * (TOTAL_NODE_AREA * 0.7);
		const perNode = Math.max(10, totalH);
		return perNode;
	}

	interface NodeRect {
		id: string;
		col: number;
		row: number;
		x: number;
		y: number;
		w: number;
		h: number;
		color: string;
		label: string;
		dimLabel: string;
		atomIdx: number;
	}

	// Build node rectangles
	function buildNodes(): NodeRect[] {
		const nodes: NodeRect[] = [];
		columns.forEach((col, ci) => {
			const cx = colXs[ci];
			if (col.count > 1) {
				// Multi-atom column
				const perNodeH = nodeHeight(col.dim, col.count);
				const totalH = perNodeH * col.count + NODE_GAP * (col.count - 1);
				const startY = PAD_TOP + (USABLE_H - totalH) / 2;
				for (let ai = 0; ai < col.count; ai++) {
					const atom = data.crystal.atoms[ai];
					nodes.push({
						id: `${col.id}-${ai}`,
						col: ci,
						row: ai,
						x: cx - NODE_WIDTH / 2,
						y: startY + ai * (perNodeH + NODE_GAP),
						w: NODE_WIDTH,
						h: perNodeH,
						color: atom.color,
						label: atom.element,
						dimLabel: `${col.dim}d`,
						atomIdx: ai,
					});
				}
			} else {
				// Single-node column
				const h = nodeHeight(col.dim, 1);
				const y = PAD_TOP + (USABLE_H - h) / 2;
				let color = 'var(--accent)';
				let label = col.label;
				let dimLabel = `${col.dim}d`;
				if (col.id === 'pool') {
					color = 'var(--energy)';
					label = 'mean';
					dimLabel = `${col.dim}d`;
				} else if (col.id === 'fc') {
					color = '#3b82f6';
					label = 'FC';
					dimLabel = `${col.dim}d`;
				} else if (col.id === 'output') {
					color = 'var(--energy)';
					label = 'E';
					dimLabel = `${col.dim}d`;
				}
				nodes.push({
					id: `${col.id}-0`,
					col: ci,
					row: 0,
					x: cx - NODE_WIDTH / 2,
					y,
					w: NODE_WIDTH,
					h,
					color,
					label,
					dimLabel,
					atomIdx: -1,
				});
			}
		});
		return nodes;
	}

	const allNodes = buildNodes();

	function getNode(colId: string, row: number): NodeRect {
		return allNodes.find((n) => n.id === `${colId}-${row}`)!;
	}

	// ========== LINK PATHS ==========
	interface Link {
		id: string;
		path: string;
		sourceNode: string;
		targetNode: string;
		color: string;
		width: number;
		atomIdx: number; // -1 for non-atom links
	}

	function bezierLink(
		sx: number, sy: number,
		tx: number, ty: number
	): string {
		const mx = (sx + tx) / 2;
		return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
	}

	function buildLinks(): Link[] {
		const links: Link[] = [];

		// 1) Input -> Embed: straight 1:1 atom mapping
		for (let ai = 0; ai < NUM_ATOMS; ai++) {
			const src = getNode('input', ai);
			const tgt = getNode('embed', ai);
			const atom = data.crystal.atoms[ai];
			links.push({
				id: `input-embed-${ai}`,
				path: bezierLink(
					src.x + src.w, src.y + src.h / 2,
					tgt.x, tgt.y + tgt.h / 2
				),
				sourceNode: src.id,
				targetNode: tgt.id,
				color: atom.color,
				width: 2.5,
				atomIdx: ai,
			});
		}

		// 2) Embed -> Conv0, Conv0 -> Conv1, Conv1 -> Conv2: message passing
		const convCols = ['embed', 'conv0', 'conv1', 'conv2'];
		for (let ci = 0; ci < convCols.length - 1; ci++) {
			const srcCol = convCols[ci];
			const tgtCol = convCols[ci + 1];

			for (let ai = 0; ai < NUM_ATOMS; ai++) {
				const tgt = getNode(tgtCol, ai);
				const neighborEntry = data.graph.neighbor_list.find(
					(nl) => nl.center === ai
				);

				// Self-connection
				const selfSrc = getNode(srcCol, ai);
				links.push({
					id: `${srcCol}-${tgtCol}-self-${ai}`,
					path: bezierLink(
						selfSrc.x + selfSrc.w, selfSrc.y + selfSrc.h / 2,
						tgt.x, tgt.y + tgt.h / 2
					),
					sourceNode: selfSrc.id,
					targetNode: tgt.id,
					color: data.crystal.atoms[ai].color,
					width: 2,
					atomIdx: ai,
				});

				// Neighbor connections (deduplicated)
				if (neighborEntry) {
					const uniqueNbrs = [...new Set(neighborEntry.neighbors)].filter(
						(n) => n !== ai
					);
					uniqueNbrs.forEach((nbrIdx) => {
						const nbrSrc = getNode(srcCol, nbrIdx);
						links.push({
							id: `${srcCol}-${tgtCol}-nbr-${nbrIdx}-to-${ai}`,
							path: bezierLink(
								nbrSrc.x + nbrSrc.w,
								nbrSrc.y + nbrSrc.h / 2,
								tgt.x,
								tgt.y + tgt.h / 2
							),
							sourceNode: nbrSrc.id,
							targetNode: tgt.id,
							color: data.crystal.atoms[nbrIdx].color,
							width: 0.8,
							atomIdx: nbrIdx,
						});
					});
				}
			}
		}

		// 3) Conv2 -> Pool: all 5 atoms merge into 1
		for (let ai = 0; ai < NUM_ATOMS; ai++) {
			const src = getNode('conv2', ai);
			const tgt = getNode('pool', 0);
			const atom = data.crystal.atoms[ai];
			// Distribute target y across the pool node proportionally
			const tgtY = tgt.y + (tgt.h / (NUM_ATOMS + 1)) * (ai + 1);
			links.push({
				id: `conv2-pool-${ai}`,
				path: bezierLink(
					src.x + src.w, src.y + src.h / 2,
					tgt.x, tgtY
				),
				sourceNode: src.id,
				targetNode: tgt.id,
				color: atom.color,
				width: 2,
				atomIdx: ai,
			});
		}

		// 4) Pool -> FC
		const poolN = getNode('pool', 0);
		const fcN = getNode('fc', 0);
		links.push({
			id: 'pool-fc',
			path: bezierLink(
				poolN.x + poolN.w, poolN.y + poolN.h / 2,
				fcN.x, fcN.y + fcN.h / 2
			),
			sourceNode: poolN.id,
			targetNode: fcN.id,
			color: 'var(--accent)',
			width: 3,
			atomIdx: -1,
		});

		// 5) FC -> Output
		const outN = getNode('output', 0);
		links.push({
			id: 'fc-output',
			path: bezierLink(
				fcN.x + fcN.w, fcN.y + fcN.h / 2,
				outN.x, outN.y + outN.h / 2
			),
			sourceNode: fcN.id,
			targetNode: outN.id,
			color: 'var(--energy)',
			width: 2,
			atomIdx: -1,
		});

		return links;
	}

	const allLinks = buildLinks();

	// ========== COLUMN LABELS ==========
	const columnLabels = [
		{ x: colXs[0], label: 'Input' },
		{ x: colXs[1], label: 'Embed' },
		{ x: (colXs[2] + colXs[4]) / 2, label: 'Conv \u00d73' },
		{ x: colXs[5], label: 'Pool' },
		{ x: colXs[6], label: 'FC' },
		{ x: colXs[7], label: 'Output' },
	];

	// ========== HOVER LOGIC ==========
	// Determine which links to highlight based on hovered node
	function isLinkHighlighted(link: Link): boolean {
		if (!hoveredNode) return false;
		const hNode = allNodes.find((n) => n.id === hoveredNode);
		if (!hNode) return false;

		// If hovering a multi-atom node, highlight all links with same atomIdx
		if (hNode.atomIdx >= 0) {
			// Highlight if the link is connected to this atom flow
			if (link.atomIdx === hNode.atomIdx) return true;
			// Also highlight pool-fc and fc-output if any atom is hovered
			if (link.atomIdx === -1) return true;
			return false;
		}
		// If hovering pool/fc/output, highlight all links
		return true;
	}

	function isNodeHighlighted(node: NodeRect): boolean {
		if (!hoveredNode) return false;
		const hNode = allNodes.find((n) => n.id === hoveredNode);
		if (!hNode) return false;
		if (hNode.atomIdx >= 0) {
			// Same atom or single-node
			return node.atomIdx === hNode.atomIdx || node.atomIdx === -1;
		}
		// Single node hover -> highlight all
		return true;
	}

	function linkOpacity(link: Link): number {
		if (!hoveredNode) return 0.35;
		return isLinkHighlighted(link) ? 0.7 : 0.06;
	}

	function nodeOpacity(node: NodeRect): number {
		if (!hoveredNode) return 1;
		return isNodeHighlighted(node) ? 1 : 0.25;
	}

	// Particle animation paths (subset for perf)
	interface Particle {
		path: string;
		color: string;
		dur: string;
		delay: string;
	}

	function buildParticles(): Particle[] {
		const particles: Particle[] = [];
		// One particle per atom through the full pipeline
		for (let ai = 0; ai < NUM_ATOMS; ai++) {
			const atom = data.crystal.atoms[ai];
			// Input -> Embed
			const n0 = getNode('input', ai);
			const n1 = getNode('embed', ai);
			particles.push({
				path: bezierLink(n0.x + n0.w, n0.y + n0.h/2, n1.x, n1.y + n1.h/2),
				color: atom.color,
				dur: '2.5s',
				delay: `${ai * 0.3}s`,
			});

			// Through conv layers (self paths)
			const convNodes = ['embed', 'conv0', 'conv1', 'conv2'];
			for (let ci = 0; ci < convNodes.length - 1; ci++) {
				const s = getNode(convNodes[ci], ai);
				const t = getNode(convNodes[ci + 1], ai);
				particles.push({
					path: bezierLink(s.x + s.w, s.y + s.h/2, t.x, t.y + t.h/2),
					color: atom.color,
					dur: '2s',
					delay: `${ai * 0.3 + (ci + 1) * 0.6}s`,
				});
			}

			// Conv2 -> Pool
			const cs = getNode('conv2', ai);
			const pt = getNode('pool', 0);
			const ptY = pt.y + (pt.h / (NUM_ATOMS + 1)) * (ai + 1);
			particles.push({
				path: bezierLink(cs.x + cs.w, cs.y + cs.h/2, pt.x, ptY),
				color: atom.color,
				dur: '2s',
				delay: `${ai * 0.3 + 2.4}s`,
			});
		}

		// Pool -> FC
		const pn = getNode('pool', 0);
		const fn = getNode('fc', 0);
		particles.push({
			path: bezierLink(pn.x + pn.w, pn.y + pn.h/2, fn.x, fn.y + fn.h/2),
			color: '#38bdf8',
			dur: '2s',
			delay: '3.5s',
		});

		// FC -> Output
		const on = getNode('output', 0);
		particles.push({
			path: bezierLink(fn.x + fn.w, fn.y + fn.h/2, on.x, on.y + on.h/2),
			color: '#34d399',
			dur: '1.5s',
			delay: '4s',
		});

		return particles;
	}

	const allParticles = buildParticles();

	// Conv bracket positions
	const convBracketX1 = colXs[2] - 20;
	const convBracketX2 = colXs[4] + 20;
	const bracketY1 = PAD_TOP - 5;
	const bracketY2 = H - PAD_BOTTOM + 5;
</script>

<div class="arch-scaler">
<div class="arch-inner">
	<div class="nn-frame">
		<div class="nn-title">CrystalGraphConvNet &mdash; Sankey View</div>

		<div class="sankey-body">
			<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" class="sankey-svg">
				<defs>
					<!-- Glow filter for output node -->
					<filter id="glow-energy" x="-50%" y="-50%" width="200%" height="200%">
						<feGaussianBlur stdDeviation="4" result="blur"/>
						<feMerge>
							<feMergeNode in="blur"/>
							<feMergeNode in="SourceGraphic"/>
						</feMerge>
					</filter>
					<!-- Subtle shadow for nodes -->
					<filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
						<feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.3"/>
					</filter>
				</defs>

				<!-- Conv bracket background -->
				<rect
					x={convBracketX1} y={bracketY1}
					width={convBracketX2 - convBracketX1}
					height={bracketY2 - bracketY1}
					rx="8" ry="8"
					fill="var(--conv-bg)"
					stroke="var(--conv-border)"
					stroke-width="1"
					stroke-dasharray="4,3"
					opacity="0.6"
				/>

				<!-- Column labels -->
				{#each columnLabels as cl}
					<text
						x={cl.x} y={PAD_TOP - 20}
						text-anchor="middle"
						class="col-label"
					>{cl.label}</text>
				{/each}

				<!-- Conv sub-labels -->
				{#each [2, 3, 4] as ci}
					<text
						x={colXs[ci]} y={PAD_TOP - 6}
						text-anchor="middle"
						class="conv-sub-label"
					>L{ci - 1}</text>
				{/each}

				<!-- Links layer -->
				<g class="links-layer">
					{#each allLinks as link}
						<path
							d={link.path}
							fill="none"
							stroke={link.color}
							stroke-width={link.width}
							opacity={linkOpacity(link)}
							class="sankey-link"
							class:link-highlighted={hoveredNode && isLinkHighlighted(link)}
						/>
					{/each}
				</g>

				<!-- Animated particles -->
				<g class="particles-layer">
					{#each allParticles as p}
						<circle r="2.5" fill={p.color} opacity="0.8">
							<animateMotion
								dur={p.dur}
								begin={p.delay}
								repeatCount="indefinite"
								path={p.path}
							/>
						</circle>
					{/each}
				</g>

				<!-- Nodes layer -->
				<g class="nodes-layer">
					{#each allNodes as node}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<g
							class="sankey-node"
							opacity={nodeOpacity(node)}
							onmouseenter={() => hoveredNode = node.id}
							onmouseleave={() => hoveredNode = null}
							style="cursor: pointer"
						>
							<!-- Node rectangle -->
							{#if node.id === 'output-0'}
								<!-- Special output node: circular -->
								<circle
									cx={node.x + node.w / 2}
									cy={node.y + node.h / 2}
									r={Math.max(node.h / 2, 14)}
									fill="#064e3b"
									stroke="var(--energy)"
									stroke-width="2"
									filter="url(#glow-energy)"
								/>
								<text
									x={node.x + node.w / 2}
									y={node.y + node.h / 2 - 6}
									text-anchor="middle"
									dominant-baseline="central"
									class="output-E"
								>E</text>
								<text
									x={node.x + node.w / 2}
									y={node.y + node.h / 2 + 8}
									text-anchor="middle"
									dominant-baseline="central"
									class="output-val"
								>{data.cgcnn.prediction.value.toFixed(3)}</text>
								<text
									x={node.x + node.w / 2}
									y={node.y + node.h / 2 + 20}
									text-anchor="middle"
									dominant-baseline="central"
									class="output-unit"
								>{data.cgcnn.prediction.unit}</text>
							{:else}
								<rect
									x={node.x} y={node.y}
									width={node.w} height={node.h}
									rx="4" ry="4"
									fill={node.color}
									opacity="0.85"
									filter="url(#node-shadow)"
								/>
								<!-- Node label -->
								<text
									x={node.x + node.w / 2}
									y={node.y + node.h / 2 + 1}
									text-anchor="middle"
									dominant-baseline="central"
									class="node-label"
									font-size={node.atomIdx >= 0 ? '9' : '8'}
								>{node.label}</text>
								<!-- Dim label below node -->
								<text
									x={node.x + node.w / 2}
									y={node.y + node.h + 11}
									text-anchor="middle"
									class="dim-label"
								>{node.dimLabel}</text>
							{/if}
						</g>
					{/each}
				</g>

				<!-- Energy prediction box at far right -->
				<g class="energy-output">
					<rect
						x={colXs[7] - 32} y={H - PAD_BOTTOM - 8}
						width="64" height="16"
						rx="3" ry="3"
						fill="var(--energy-bg)"
						stroke="var(--energy)"
						stroke-width="0.5"
						opacity="0.8"
					/>
					<text
						x={colXs[7]} y={H - PAD_BOTTOM + 2}
						text-anchor="middle"
						class="energy-label-small"
					>{data.cgcnn.prediction.property}</text>
				</g>
			</svg>
		</div>
	</div>
</div>
</div>

<style>
	/* ===== AUTO-SCALING HORIZONTAL ROOT ===== */
	.arch-scaler {
		width: 100%;
		overflow: hidden;
	}
	.arch-inner {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px 12px;
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

	/* ===== SANKEY BODY ===== */
	.sankey-body {
		padding: 18px 10px 10px;
	}
	.sankey-svg {
		width: 1200px;
		height: 400px;
		display: block;
	}

	/* ===== COLUMN LABELS ===== */
	.col-label {
		font: 600 11px/1 'JetBrains Mono', monospace;
		fill: var(--text2);
		letter-spacing: 0.3px;
	}
	.conv-sub-label {
		font: 500 8px/1 'JetBrains Mono', monospace;
		fill: var(--text4);
	}

	/* ===== LINKS ===== */
	.sankey-link {
		transition: opacity 0.2s ease;
	}
	.link-highlighted {
		stroke-width: 3 !important;
	}

	/* ===== NODES ===== */
	.sankey-node {
		transition: opacity 0.2s ease;
	}
	.node-label {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 700;
		fill: var(--node-label);
		pointer-events: none;
	}
	.dim-label {
		font: 400 7px/1 'JetBrains Mono', monospace;
		fill: var(--text4);
		pointer-events: none;
	}

	/* ===== OUTPUT NODE ===== */
	.output-E {
		font: 800 14px/1 'JetBrains Mono', monospace;
		fill: var(--energy);
	}
	.output-val {
		font: 700 8px/1 'JetBrains Mono', monospace;
		fill: var(--energy);
	}
	.output-unit {
		font: 400 6px/1 'JetBrains Mono', monospace;
		fill: var(--text4);
	}

	/* ===== ENERGY LABEL ===== */
	.energy-label-small {
		font: 400 6px/1 'JetBrains Mono', monospace;
		fill: var(--text4);
	}

	/* ===== PARTICLES ===== */
	.particles-layer circle {
		mix-blend-mode: screen;
	}
</style>
