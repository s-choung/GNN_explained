// Live CGCNN engine: real neighbor search, gaussian edge features and a
// gated graph-conv forward pass computed in the browser.
// Weights are FIXED pseudo-random ("demo weights") — the dynamics are real,
// the prediction is untrained.

import type { CgcnnData } from '../stores/modelData';
import { getCrystal, type CrystalDef } from './structures';
import { elementColors } from '../utils/colorScales';

export const ATOM_FEA_LEN = 64;
export const NBR_FEA_LEN = 41;
export const NUM_CONV = 3;
export const H_FEA_LEN = 128;
export const ONE_HOT_LEN = 92;
export const MAX_NBR = 12;
const GAUSS_STEP = 0.2;

// ---------- seeded RNG + demo weights ----------

function mulberry32(seed: number) {
	let t = seed >>> 0;
	return () => {
		t += 0x6d2b79f5;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

function randMatrix(rows: number, cols: number, rng: () => number): number[][] {
	const scale = 1 / Math.sqrt(cols);
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => (rng() * 2 - 1) * scale)
	);
}

function randVector(n: number, rng: () => number): number[] {
	return Array.from({ length: n }, () => (rng() * 2 - 1) * 0.1);
}

const rng = mulberry32(42);
const W_EMB = randMatrix(ATOM_FEA_LEN, ONE_HOT_LEN, rng);
const Z_LEN = 2 * ATOM_FEA_LEN + NBR_FEA_LEN;
const CONV_W = Array.from({ length: NUM_CONV }, () => ({
	wf: randMatrix(ATOM_FEA_LEN, Z_LEN, rng),
	bf: randVector(ATOM_FEA_LEN, rng),
	ws: randMatrix(ATOM_FEA_LEN, Z_LEN, rng),
	bs: randVector(ATOM_FEA_LEN, rng)
}));
const W_FC1 = randMatrix(H_FEA_LEN, ATOM_FEA_LEN, rng);
const B_FC1 = randVector(H_FEA_LEN, rng);
const W_FC2 = randMatrix(1, H_FEA_LEN, rng);
const B_FC2 = randVector(1, rng);

// ---------- math helpers ----------

function matVec(W: number[][], x: number[], b?: number[]): number[] {
	return W.map((row, i) => {
		let s = b ? b[i] : 0;
		for (let j = 0; j < row.length; j++) s += row[j] * x[j];
		return s;
	});
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const softplus = (x: number) => (x > 20 ? x : Math.log1p(Math.exp(x)));

// ---------- geometry ----------

export interface NeighborEntry {
	center: number;
	neighbor: number;
	distance: number;
}

/** PBC neighbor search within cutoff on an orthogonal cell. Sorted, capped at MAX_NBR per center. */
export function neighborList(crystal: CrystalDef, cutoff: number): NeighborEntry[][] {
	const { a, b, c } = crystal.lattice;
	const na = Math.ceil(cutoff / a);
	const nb = Math.ceil(cutoff / b);
	const nc = Math.ceil(cutoff / c);
	const lists: NeighborEntry[][] = crystal.atoms.map(() => []);

	crystal.atoms.forEach((ai, i) => {
		crystal.atoms.forEach((aj, j) => {
			for (let sa = -na; sa <= na; sa++)
				for (let sb = -nb; sb <= nb; sb++)
					for (let sc = -nc; sc <= nc; sc++) {
						if (i === j && sa === 0 && sb === 0 && sc === 0) continue;
						const dx = aj.coords[0] + sa * a - ai.coords[0];
						const dy = aj.coords[1] + sb * b - ai.coords[1];
						const dz = aj.coords[2] + sc * c - ai.coords[2];
						const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
						if (d <= cutoff) lists[i].push({ center: i, neighbor: j, distance: d });
					}
		});
	});

	return lists.map((l) => l.sort((x, y) => x.distance - y.distance).slice(0, MAX_NBR));
}

/** 41-dim gaussian expansion of a distance (centers 0..8 A, step 0.2). */
export function gaussianExpand(d: number): number[] {
	const sigma = 0.25;
	return Array.from({ length: NBR_FEA_LEN }, (_, k) => {
		const mu = k * GAUSS_STEP;
		const t = (d - mu) / sigma;
		return Math.exp(-0.5 * t * t);
	});
}

/** In-cell bonds for the mini-graph drawing: nearest-neighbor shell, relaxed if too sparse. */
export function bonds(crystal: CrystalDef, cutoff: number) {
	const pairs: { source: number; target: number; distance: number }[] = [];
	let dmin = Infinity;
	for (let i = 0; i < crystal.atoms.length; i++)
		for (let j = i + 1; j < crystal.atoms.length; j++) {
			const pi = crystal.atoms[i].coords;
			const pj = crystal.atoms[j].coords;
			const d = Math.hypot(pi[0] - pj[0], pi[1] - pj[1], pi[2] - pj[2]);
			pairs.push({ source: i, target: j, distance: d });
			dmin = Math.min(dmin, d);
		}
	const pick = (f: number) =>
		pairs.filter((p) => p.distance <= Math.min(cutoff, dmin * f));
	let sel = pick(1.2);
	if (sel.length < crystal.atoms.length - 1) sel = pick(1.5);
	return sel;
}

// ---------- forward pass ----------

export interface CgcnnResult {
	embedded: number[][];
	convOutputs: number[][][];
	gateValues: number[][][];
	crystalFeature: number[];
	contributions: number[];
	hidden: number[];
	prediction: number;
}

export function runCgcnn(crystal: CrystalDef, cutoff: number): CgcnnResult {
	const nbrs = neighborList(crystal, cutoff);
	const nbrFeas = nbrs.map((l) => l.map((e) => gaussianExpand(e.distance)));

	// one-hot(Z) -> embedding
	let h = crystal.atoms.map((atom) => {
		const x = new Array(ONE_HOT_LEN).fill(0);
		x[Math.min(atom.atomic_num, ONE_HOT_LEN) - 1] = 1;
		return matVec(W_EMB, x).map(Math.tanh);
	});
	const embedded = h;

	const convOutputs: number[][][] = [];
	const gateValues: number[][][] = [];

	for (let t = 0; t < NUM_CONV; t++) {
		const { wf, bf, ws, bs } = CONV_W[t];
		const gates: number[][] = [];
		const next = h.map((hi, i) => {
			const msg = new Array(ATOM_FEA_LEN).fill(0);
			const gateMean = new Array(ATOM_FEA_LEN).fill(0);
			nbrs[i].forEach((e, k) => {
				const z = [...hi, ...h[e.neighbor], ...nbrFeas[i][k]];
				const filt = matVec(wf, z, bf).map(sigmoid);
				const core = matVec(ws, z, bs).map(softplus);
				for (let m = 0; m < ATOM_FEA_LEN; m++) {
					msg[m] += filt[m] * core[m];
					gateMean[m] += filt[m];
				}
			});
			const n = Math.max(1, nbrs[i].length);
			gates.push(gateMean.slice(0, 8).map((g) => g / n));
			return hi.map((v, m) => Math.tanh(v + msg[m] / n));
		});
		h = next;
		convOutputs.push(h);
		gateValues.push(gates);
	}

	// mean pool
	const crystalFeature = Array.from({ length: ATOM_FEA_LEN }, (_, m) =>
		h.reduce((s, hi) => s + hi[m], 0) / h.length
	);
	const norms = h.map((hi) => Math.hypot(...hi));
	const normSum = norms.reduce((s, v) => s + v, 0);
	const contributions = norms.map((v) => v / normSum);

	// FC head
	const hidden = matVec(W_FC1, crystalFeature, B_FC1).map(softplus);
	const y = matVec(W_FC2, hidden, B_FC2)[0];
	const prediction = -2.5 + 2 * Math.tanh(y);

	return { embedded, convOutputs, gateValues, crystalFeature, contributions, hidden, prediction };
}

// ---------- adapter to the UI data shape ----------

export function buildCgcnnData(structureId: string, cutoff: number): CgcnnData {
	const crystal = getCrystal(structureId);
	const nbrs = neighborList(crystal, cutoff);
	const result = runCgcnn(crystal, cutoff);

	return {
		crystal: {
			name: crystal.name,
			formula: crystal.formula,
			space_group: crystal.space_group,
			lattice: crystal.lattice,
			atoms: crystal.atoms.map((atom, i) => ({
				element: atom.element,
				index: i,
				atomic_num: atom.atomic_num,
				coords: atom.coords,
				color: elementColors[atom.element] || '#8f8f8f'
			})),
			bonds: bonds(crystal, cutoff)
		},
		graph: {
			num_nodes: crystal.atoms.length,
			num_neighbors: Math.round(nbrs.reduce((s, l) => s + l.length, 0) / nbrs.length),
			cutoff_radius: cutoff,
			neighbor_list: nbrs.map((l, i) => ({
				center: i,
				neighbors: l.map((e) => e.neighbor),
				distances: l.map((e) => Math.round(e.distance * 100) / 100)
			}))
		},
		cgcnn: {
			atom_fea_len: ATOM_FEA_LEN,
			nbr_fea_len: NBR_FEA_LEN,
			num_conv: NUM_CONV,
			h_fea_len: H_FEA_LEN,
			embedding: {
				description: `Linear projection from ${ONE_HOT_LEN}-dim one-hot atom features to ${ATOM_FEA_LEN}-dim hidden features`,
				input_dim: ONE_HOT_LEN,
				output_dim: ATOM_FEA_LEN,
				atom_features: result.embedded
			},
			conv_layers: result.convOutputs.map((out, t) => ({
				layer_index: t,
				description: 'Graph convolution with gated aggregation',
				output_features: out,
				gate_values: result.gateValues[t]
			})),
			pooling: {
				description: 'Mean pooling over atom features',
				crystal_feature: result.crystalFeature,
				per_atom_contribution: result.contributions
			},
			fc_layers: {
				description: 'Fully connected head',
				hidden_output: result.hidden
			},
			prediction: {
				property: 'Formation Energy (demo weights)',
				value: result.prediction,
				unit: 'eV/atom'
			}
		}
	};
}
