// English strings: UI chrome + guided walkthrough steps.
// Korean counterpart lives in ./ko.ts with the exact same shapes.
import type { CgcnnData } from '../stores/modelData';

export interface TourStep {
	stage: string;
	title: string;
	body: (d: CgcnnData) => string;
}

export interface UIStrings {
	instruction: string;
	walkthrough: string;
	play: string;
	hop: (n: number) => string;
	done: string;
	crystal: string;
	cutoff: string;
	back: string;
	next: string;
	finish: string;
	stepOf: (i: number, n: number) => string;
}

export const UI_EN: UIStrings = {
	instruction: 'Click layers to inspect · Hover atoms or flows to trace them · Everything recomputes live',
	walkthrough: 'Walkthrough',
	play: 'Play message passing',
	hop: (n) => `Hop ${n} / 3`,
	done: 'Done',
	crystal: 'Crystal',
	cutoff: 'Cutoff',
	back: '← Back',
	next: 'Next →',
	finish: 'Finish',
	stepOf: (i, n) => `${i} / ${n}`
};

export const TOUR_STEPS_EN: TourStep[] = [
	{
		stage: 'input',
		title: 'The input crystal',
		body: (d) =>
			`Everything starts from one unit cell of ${d.crystal.name}: ${d.crystal.atoms.length} atoms in a ${d.crystal.space_group} cell. The crystal repeats forever in every direction, so neighbors are found under periodic boundary conditions.`
	},
	{
		stage: 'graph',
		title: 'Build the graph',
		body: (d) =>
			`Atoms become nodes. Any two atoms closer than the cutoff (r = ${d.graph.cutoff_radius.toFixed(1)} Å) are connected, searched under periodic boundary conditions — right now each atom has about ${d.graph.num_neighbors} neighbors.`
	},
	{
		stage: 'embed',
		title: 'Embed each atom',
		body: (d) =>
			`Each element is a ${d.cgcnn.embedding.input_dim}-dim one-hot vector, projected to ${d.cgcnn.embedding.output_dim} dimensions by a learned linear layer. The colored strips are the actual feature values, atom by atom.`
	},
	{
		stage: 'conv0',
		title: 'Message passing — hop 1',
		body: () =>
			`Every atom concatenates its features with each neighbor's features and the bond feature, gates the message with a sigmoid filter, and sums. After one hop, an atom knows its first coordination shell.`
	},
	{
		stage: 'conv1',
		title: 'Message passing — hop 2',
		body: () =>
			`The same convolution repeats with new weights. Information now flows two bonds away — neighbors of neighbors start shaping each atom's representation.`
	},
	{
		stage: 'conv2',
		title: 'Message passing — hop 3',
		body: () =>
			`After the third hop each atom has aggregated its chemical environment three shells out. The small bars under each layer show the live sigmoid gate values.`
	},
	{
		stage: 'pool',
		title: 'Pool to one vector',
		body: (d) =>
			`Mean pooling averages the ${d.crystal.atoms.length} atom vectors into a single ${d.cgcnn.atom_fea_len}-dim crystal descriptor. Averaging ignores atom order, so the prediction is permutation invariant.`
	},
	{
		stage: 'fc',
		title: 'The prediction head',
		body: (d) =>
			`A small fully connected network (${d.cgcnn.atom_fea_len} → ${d.cgcnn.h_fea_len} → 1) maps the crystal descriptor to the target property.`
	},
	{
		stage: 'energy',
		title: 'Formation energy',
		body: (d) =>
			`The model reads ${d.cgcnn.prediction.value.toFixed(3)} ${d.cgcnn.prediction.unit} (demo weights — untrained). Try the crystal chips or the cutoff slider: this number recomputes instantly.`
	}
];
