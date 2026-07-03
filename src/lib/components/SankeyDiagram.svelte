<script lang="ts">
	import type { CgcnnData } from '$lib/stores/modelData';

	interface Props {
		data: CgcnnData;
	}

	let { data }: Props = $props();

	let hoveredNode = $state<string | null>(null);

	// Dynamic fit-to-width scaling (replaces fixed breakpoint scales)
	let scalerW = $state(0);
	let innerW = $state(0);
	let innerH = $state(0);
	const archScale = $derived(scalerW > 0 && innerW > 0 ? Math.min(1, scalerW / innerW) : 1);
	const archLeft = $derived(Math.max(0, (scalerW - innerW * archScale) / 2));

	// ========== LAYOUT CONSTANTS ==========
	const W = 1200;
	const H = 400;
	const PAD_TOP = 50;
	const PAD_BOTTOM = 30;
	const PAD_LEFT = 40;
	const PAD_RIGHT = 100;
	const USABLE_H = H - PAD_TOP - PAD_BOTTOM;
	const USABLE_W = W - PAD_LEFT - PAD_RIGHT;
	const NODE_GAP = 6;
	const NODE_WIDTH = 28;
	const TOTAL_NODE_AREA = USABLE_H - 20;

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
		atomIdx: number;
	}

	interface Link {
		id: string;
		path: string;
		sourceNode: string;
		targetNode: string;
		color: string;
		width: number;
		atomIdx: number; // -1 for non-atom links
	}

	interface Particle {
		path: string;
		color: string;
		dur: string;
		delay: string;
	}

	function bezierLink(sx: number, sy: number, tx: number, ty: number): string {
		const mx = (sx + tx) / 2;
		return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
	}

	// ========== LAYOUT (recomputed whenever the live data changes) ==========
	function computeLayout(d: CgcnnData) {
		const numAtoms = d.crystal.atoms.length;
		const DIM_INPUT = d.cgcnn.embedding.input_dim;
		const DIM_EMBED = d.cgcnn.embedding.output_dim;
		const DIM_CONV = d.cgcnn.atom_fea_len;
		const DIM_FC = d.cgcnn.h_fea_len;
		const MAX_DIM = DIM_FC;

		const columns = [
			{ id: 'input', label: 'Input', dim: DIM_INPUT, count: numAtoms },
			{ id: 'embed', label: 'Embed', dim: DIM_EMBED, count: numAtoms },
			{ id: 'conv0', label: 'Conv1', dim: DIM_CONV, count: numAtoms },
			{ id: 'conv1', label: 'Conv2', dim: DIM_CONV, count: numAtoms },
			{ id: 'conv2', label: 'Conv3', dim: DIM_CONV, count: numAtoms },
			{ id: 'pool', label: 'Pool', dim: DIM_CONV, count: 1 },
			{ id: 'fc', label: 'FC', dim: DIM_FC, count: 1 },
			{ id: 'output', label: 'Output', dim: 1, count: 1 },
		];
		const colXs = columns.map((_, i) => PAD_LEFT + (i / (columns.length - 1)) * USABLE_W);

		function nodeHeight(dim: number, count: number): number {
			if (count === 1) {
				const h = (dim / MAX_DIM) * (TOTAL_NODE_AREA * 0.85);
				return Math.max(24, Math.min(h, TOTAL_NODE_AREA * 0.85));
			}
			// Multi-node columns: distribute the column's total height across atoms
			const totalH = (dim / MAX_DIM) * (TOTAL_NODE_AREA * 0.7);
			return Math.max(12, totalH / count);
		}

		const allNodes: NodeRect[] = [];
		columns.forEach((col, ci) => {
			const cx = colXs[ci];
			if (col.count > 1) {
				const perNodeH = nodeHeight(col.dim, col.count);
				const totalH = perNodeH * col.count + NODE_GAP * (col.count - 1);
				const startY = PAD_TOP + (USABLE_H - totalH) / 2;
				for (let ai = 0; ai < col.count; ai++) {
					const atom = d.crystal.atoms[ai];
					allNodes.push({
						id: `${col.id}-${ai}`,
						col: ci,
						row: ai,
						x: cx - NODE_WIDTH / 2,
						y: startY + ai * (perNodeH + NODE_GAP),
						w: NODE_WIDTH,
						h: perNodeH,
						color: atom.color,
						label: atom.element,
						atomIdx: ai,
					});
				}
			} else {
				const h = nodeHeight(col.dim, 1);
				const y = PAD_TOP + (USABLE_H - h) / 2;
				let label = col.label;
				if (col.id === 'pool') label = 'mean';
				else if (col.id === 'output') label = 'E';
				allNodes.push({
					id: `${col.id}-0`,
					col: ci,
					row: 0,
					x: cx - NODE_WIDTH / 2,
					y,
					w: NODE_WIDTH,
					h,
					color: 'var(--accent)',
					label,
					atomIdx: -1,
				});
			}
		});

		const getNode = (colId: string, row: number): NodeRect =>
			allNodes.find((n) => n.id === `${colId}-${row}`)!;

		// One dimension label per column, below the bottom-most node
		const columnDimLabels = columns
			.map((col, ci) => {
				const colNodes = allNodes.filter((n) => n.col === ci);
				const bottom = Math.max(...colNodes.map((n) => n.y + n.h));
				return { id: col.id, x: colXs[ci], y: bottom + 18, label: `${col.dim}d` };
			})
			.filter((l) => l.id !== 'output');

		// ----- links -----
		const allLinks: Link[] = [];

		for (let ai = 0; ai < numAtoms; ai++) {
			const src = getNode('input', ai);
			const tgt = getNode('embed', ai);
			allLinks.push({
				id: `input-embed-${ai}`,
				path: bezierLink(src.x + src.w, src.y + src.h / 2, tgt.x, tgt.y + tgt.h / 2),
				sourceNode: src.id,
				targetNode: tgt.id,
				color: d.crystal.atoms[ai].color,
				width: 2.5,
				atomIdx: ai,
			});
		}

		const convCols = ['embed', 'conv0', 'conv1', 'conv2'];
		for (let ci = 0; ci < convCols.length - 1; ci++) {
			const srcCol = convCols[ci];
			const tgtCol = convCols[ci + 1];
			for (let ai = 0; ai < numAtoms; ai++) {
				const tgt = getNode(tgtCol, ai);
				const neighborEntry = d.graph.neighbor_list.find((nl) => nl.center === ai);

				const selfSrc = getNode(srcCol, ai);
				allLinks.push({
					id: `${srcCol}-${tgtCol}-self-${ai}`,
					path: bezierLink(selfSrc.x + selfSrc.w, selfSrc.y + selfSrc.h / 2, tgt.x, tgt.y + tgt.h / 2),
					sourceNode: selfSrc.id,
					targetNode: tgt.id,
					color: d.crystal.atoms[ai].color,
					width: 2,
					atomIdx: ai,
				});

				if (neighborEntry) {
					const uniqueNbrs = [...new Set(neighborEntry.neighbors)].filter((n) => n !== ai);
					uniqueNbrs.forEach((nbrIdx) => {
						const nbrSrc = getNode(srcCol, nbrIdx);
						allLinks.push({
							id: `${srcCol}-${tgtCol}-nbr-${nbrIdx}-to-${ai}`,
							path: bezierLink(nbrSrc.x + nbrSrc.w, nbrSrc.y + nbrSrc.h / 2, tgt.x, tgt.y + tgt.h / 2),
							sourceNode: nbrSrc.id,
							targetNode: tgt.id,
							color: d.crystal.atoms[nbrIdx].color,
							width: 0.8,
							atomIdx: nbrIdx,
						});
					});
				}
			}
		}

		for (let ai = 0; ai < numAtoms; ai++) {
			const src = getNode('conv2', ai);
			const tgt = getNode('pool', 0);
			const tgtY = tgt.y + (tgt.h / (numAtoms + 1)) * (ai + 1);
			allLinks.push({
				id: `conv2-pool-${ai}`,
				path: bezierLink(src.x + src.w, src.y + src.h / 2, tgt.x, tgtY),
				sourceNode: src.id,
				targetNode: tgt.id,
				color: d.crystal.atoms[ai].color,
				width: 2,
				atomIdx: ai,
			});
		}

		const poolN = getNode('pool', 0);
		const fcN = getNode('fc', 0);
		allLinks.push({
			id: 'pool-fc',
			path: bezierLink(poolN.x + poolN.w, poolN.y + poolN.h / 2, fcN.x, fcN.y + fcN.h / 2),
			sourceNode: poolN.id,
			targetNode: fcN.id,
			color: 'var(--accent)',
			width: 3,
			atomIdx: -1,
		});

		const outN = getNode('output', 0);
		allLinks.push({
			id: 'fc-output',
			path: bezierLink(fcN.x + fcN.w, fcN.y + fcN.h / 2, outN.x, outN.y + outN.h / 2),
			sourceNode: fcN.id,
			targetNode: outN.id,
			color: 'var(--accent)',
			width: 2,
			atomIdx: -1,
		});

		// ----- particles -----
		const allParticles: Particle[] = [];
		for (let ai = 0; ai < numAtoms; ai++) {
			const atom = d.crystal.atoms[ai];
			const n0 = getNode('input', ai);
			const n1 = getNode('embed', ai);
			allParticles.push({
				path: bezierLink(n0.x + n0.w, n0.y + n0.h / 2, n1.x, n1.y + n1.h / 2),
				color: atom.color,
				dur: '2.5s',
				delay: `${ai * 0.3}s`,
			});
			for (let ci = 0; ci < convCols.length - 1; ci++) {
				const s = getNode(convCols[ci], ai);
				const t = getNode(convCols[ci + 1], ai);
				allParticles.push({
					path: bezierLink(s.x + s.w, s.y + s.h / 2, t.x, t.y + t.h / 2),
					color: atom.color,
					dur: '2s',
					delay: `${ai * 0.3 + (ci + 1) * 0.6}s`,
				});
			}
			const cs = getNode('conv2', ai);
			const ptY = poolN.y + (poolN.h / (numAtoms + 1)) * (ai + 1);
			allParticles.push({
				path: bezierLink(cs.x + cs.w, cs.y + cs.h / 2, poolN.x, ptY),
				color: atom.color,
				dur: '2s',
				delay: `${ai * 0.3 + 2.4}s`,
			});
		}
		allParticles.push({
			path: bezierLink(poolN.x + poolN.w, poolN.y + poolN.h / 2, fcN.x, fcN.y + fcN.h / 2),
			color: 'var(--accent)',
			dur: '2s',
			delay: '3.5s',
		});
		allParticles.push({
			path: bezierLink(fcN.x + fcN.w, fcN.y + fcN.h / 2, outN.x, outN.y + outN.h / 2),
			color: 'var(--accent)',
			dur: '1.5s',
			delay: '4s',
		});

		// ----- conv bracket + column labels + output geometry -----
		const convBracketX1 = colXs[2] - 20;
		const convBracketX2 = colXs[4] + 20;
		const bracketY1 = PAD_TOP - 5;
		const convBottom = Math.max(
			...allNodes.filter((n) => n.col >= 2 && n.col <= 4).map((n) => n.y + n.h)
		);
		const bracketY2 = convBottom + 32;

		const columnLabels = [
			{ x: colXs[0], label: 'Input' },
			{ x: colXs[1], label: 'Embed' },
			{ x: (colXs[2] + colXs[4]) / 2, label: 'Conv ×3' },
			{ x: colXs[5], label: 'Pool' },
			{ x: colXs[6], label: 'FC' },
			{ x: colXs[7], label: 'Output' },
		];

		const outCx = outN.x + outN.w / 2;
		const outCy = outN.y + outN.h / 2;
		const outR = Math.max(outN.h / 2, 16);
		const propertyName = d.cgcnn.prediction.property.replace(/\s*\([^)]*\)\s*$/, '');

		return {
			colXs, allNodes, allLinks, allParticles, columnDimLabels, columnLabels,
			convBracketX1, convBracketX2, bracketY1, bracketY2,
			outCx, outCy, outR, propertyName,
		};
	}

	const layout = $derived(computeLayout(data));

	// ========== HOVER LOGIC ==========
	function isLinkHighlighted(link: Link): boolean {
		if (!hoveredNode) return false;
		const hNode = layout.allNodes.find((n) => n.id === hoveredNode);
		if (!hNode) return false;
		if (hNode.atomIdx >= 0) {
			if (link.atomIdx === hNode.atomIdx) return true;
			if (link.atomIdx === -1) return true;
			return false;
		}
		return true;
	}

	function isNodeHighlighted(node: NodeRect): boolean {
		if (!hoveredNode) return false;
		const hNode = layout.allNodes.find((n) => n.id === hoveredNode);
		if (!hNode) return false;
		if (hNode.atomIdx >= 0) {
			return node.atomIdx === hNode.atomIdx || node.atomIdx === -1;
		}
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
</script>

<div class="arch-scaler" bind:clientWidth={scalerW} style={innerH ? `height:${Math.ceil(innerH * archScale)}px` : ''}>
<div class="arch-inner" bind:clientWidth={innerW} bind:clientHeight={innerH}
	style="transform: scale({archScale}); margin-left: {archLeft}px">
	<div class="nn-frame">
		<div class="nn-title">CrystalGraphConvNet &mdash; Sankey View</div>

		<div class="sankey-body">
			<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" class="sankey-svg">
				<!-- Conv bracket background -->
				<rect
					x={layout.convBracketX1} y={layout.bracketY1}
					width={layout.convBracketX2 - layout.convBracketX1}
					height={layout.bracketY2 - layout.bracketY1}
					rx="6.08" ry="6.08"
					fill="var(--conv-bg)"
				/>

				<!-- Column labels -->
				{#each layout.columnLabels as cl}
					<text
						x={cl.x} y={PAD_TOP - 22}
						text-anchor="middle"
						class="col-label"
					>{cl.label}</text>
				{/each}

				<!-- Conv sub-labels -->
				{#each [2, 3, 4] as ci}
					<text
						x={layout.colXs[ci]} y={PAD_TOP - 6}
						text-anchor="middle"
						class="conv-sub-label"
					>L{ci - 1}</text>
				{/each}

				<!-- Links layer -->
				<g class="links-layer">
					{#each layout.allLinks as link (link.id)}
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

				<!-- Animated particles (hidden until their delayed motion starts,
				     otherwise they sit at the svg origin as stray dots) -->
				<g class="particles-layer">
					{#each layout.allParticles as p}
						<circle r="2.5" fill={p.color} opacity="0">
							<set attributeName="opacity" to="0.8" begin={p.delay} />
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
					{#each layout.allNodes as node (node.id)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<g
							class="sankey-node"
							opacity={nodeOpacity(node)}
							onmouseenter={() => hoveredNode = node.id}
							onmouseleave={() => hoveredNode = null}
							style="cursor: pointer"
						>
							{#if node.id === 'output-0'}
								<!-- Special output node: filled circle, labels stacked below -->
								<circle
									cx={layout.outCx}
									cy={layout.outCy}
									r={layout.outR}
									fill="var(--accent)"
								/>
								<text
									x={layout.outCx}
									y={layout.outCy + 1}
									text-anchor="middle"
									dominant-baseline="central"
									class="output-E"
								>E</text>
								<text
									x={layout.outCx}
									y={layout.outCy + layout.outR + 18}
									text-anchor="middle"
									class="output-val"
								>{data.cgcnn.prediction.value.toFixed(3)}</text>
								<text
									x={layout.outCx}
									y={layout.outCy + layout.outR + 34}
									text-anchor="middle"
									class="output-unit"
								>{data.cgcnn.prediction.unit}</text>
								<text
									x={layout.outCx}
									y={layout.outCy + layout.outR + 52}
									text-anchor="middle"
									class="output-prop"
								>{layout.propertyName}</text>
							{:else}
								<rect
									x={node.x} y={node.y}
									width={node.w} height={node.h}
									rx="4" ry="4"
									fill={node.color}
									opacity="0.9"
								/>
								<!-- Node label -->
								{#if node.atomIdx >= 0}
									<text
										x={node.x + node.w / 2}
										y={node.y + node.h / 2 + 1}
										text-anchor="middle"
										dominant-baseline="central"
										class="node-label"
									>{node.label}</text>
								{:else}
									<text
										x={node.x + node.w / 2}
										y={node.y + node.h / 2}
										text-anchor="middle"
										dominant-baseline="central"
										class="node-label-inv"
										transform="rotate(-90 {node.x + node.w / 2} {node.y + node.h / 2})"
									>{node.label}</text>
								{/if}
							{/if}
						</g>
					{/each}
				</g>

				<!-- One dim label per column (below bottom-most node) -->
				{#each layout.columnDimLabels as dl}
					<text
						x={dl.x} y={dl.y}
						text-anchor="middle"
						class="dim-label"
					>{dl.label}</text>
				{/each}
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
		align-items: flex-start;
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
		font-size: 13.5px;
		font-weight: 500;
		line-height: 1;
		color: var(--text2);
		letter-spacing: 0.011em;
		text-transform: uppercase;
		padding-left: 14px;
		margin-bottom: 10px;
	}

	/* ===== SANKEY BODY ===== */
	.sankey-body {
		padding: 0 10px 10px;
	}
	.sankey-svg {
		width: 1200px;
		height: 400px;
		display: block;
	}

	/* ===== COLUMN LABELS ===== */
	.col-label {
		font-size: 13.5px;
		font-weight: 600;
		fill: var(--text);
		letter-spacing: 0.011em;
	}
	.conv-sub-label {
		font-size: 11px;
		font-weight: 500;
		fill: var(--text2);
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
		font-size: 11px;
		font-weight: 600;
		fill: var(--node-label);
		pointer-events: none;
	}
	.node-label-inv {
		font-size: 11px;
		font-weight: 600;
		fill: var(--bg);
		pointer-events: none;
	}
	.dim-label {
		font-size: 13.5px;
		fill: var(--text2);
		pointer-events: none;
		font-variant-numeric: tabular-nums;
	}

	/* ===== OUTPUT NODE ===== */
	.output-E {
		font-size: 13px;
		font-weight: 600;
		fill: var(--bg);
	}
	.output-val {
		font-size: 15px;
		font-weight: 600;
		fill: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.output-unit {
		font-size: 13.5px;
		fill: var(--text2);
	}
	.output-prop {
		font-size: 13.5px;
		fill: var(--text2);
	}
</style>
