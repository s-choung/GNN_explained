import { writable, derived } from 'svelte/store';

export interface Atom {
	element: string;
	index: number;
	atomic_num: number;
	coords: [number, number, number];
	color: string;
}

export interface Bond {
	source: number;
	target: number;
	distance: number;
}

export interface ConvLayer {
	layer_index: number;
	description: string;
	output_features: number[][];
	gate_values: number[][];
}

export interface CgcnnData {
	crystal: {
		name: string;
		formula: string;
		space_group: string;
		lattice: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
		atoms: Atom[];
		bonds: Bond[];
	};
	graph: {
		num_nodes: number;
		num_neighbors: number;
		cutoff_radius: number;
		neighbor_list: { center: number; neighbors: number[]; distances: number[] }[];
	};
	cgcnn: {
		atom_fea_len: number;
		nbr_fea_len: number;
		num_conv: number;
		h_fea_len: number;
		embedding: {
			description: string;
			input_dim: number;
			output_dim: number;
			atom_features: number[][];
		};
		conv_layers: ConvLayer[];
		pooling: {
			description: string;
			crystal_feature: number[];
			per_atom_contribution: number[];
		};
		fc_layers: {
			description: string;
			hidden_output: number[];
		};
		prediction: {
			property: string;
			value: number;
			unit: string;
		};
	};
}

export const modelData = writable<CgcnnData | null>(null);
export const hoveredAtom = writable<number | null>(null);
export const selectedConvLayer = writable<number>(0);
export const expandedSection = writable<string | null>(null);
export const animationProgress = writable<number>(0);

export const atoms = derived(modelData, ($data) => $data?.crystal.atoms ?? []);
export const bonds = derived(modelData, ($data) => $data?.crystal.bonds ?? []);
export const prediction = derived(modelData, ($data) => $data?.cgcnn.prediction ?? null);
