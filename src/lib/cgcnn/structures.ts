// Crystal structure library for the playable explainer.
// Coordinates are cartesian (angstrom) within one conventional cell.

export interface CrystalDef {
	id: string;
	name: string;
	formula: string;
	space_group: string;
	lattice: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
	atoms: { element: string; atomic_num: number; coords: [number, number, number] }[];
	description: string;
}

function cubic(a: number) {
	return { a, b: a, c: a, alpha: 90, beta: 90, gamma: 90 };
}

const A_STO = 3.905;
const A_NACL = 5.6402;
const A_SI = 5.431;
const A_FE = 2.8665;

export const crystals: CrystalDef[] = [
	{
		id: 'sto',
		name: 'SrTiO3',
		formula: 'SrTiO₃',
		space_group: 'Pm-3m',
		lattice: cubic(A_STO),
		atoms: [
			{ element: 'Sr', atomic_num: 38, coords: [0, 0, 0] },
			{ element: 'Ti', atomic_num: 22, coords: [A_STO / 2, A_STO / 2, A_STO / 2] },
			{ element: 'O', atomic_num: 8, coords: [A_STO / 2, A_STO / 2, 0] },
			{ element: 'O', atomic_num: 8, coords: [A_STO / 2, 0, A_STO / 2] },
			{ element: 'O', atomic_num: 8, coords: [0, A_STO / 2, A_STO / 2] }
		],
		description: 'Cubic perovskite: corner-sharing TiO₆ octahedra with Sr in the A-site cage.'
	},
	{
		id: 'nacl',
		name: 'NaCl',
		formula: 'NaCl',
		space_group: 'Fm-3m',
		lattice: cubic(A_NACL),
		atoms: [
			{ element: 'Na', atomic_num: 11, coords: [0, 0, 0] },
			{ element: 'Na', atomic_num: 11, coords: [A_NACL / 2, A_NACL / 2, 0] },
			{ element: 'Na', atomic_num: 11, coords: [A_NACL / 2, 0, A_NACL / 2] },
			{ element: 'Na', atomic_num: 11, coords: [0, A_NACL / 2, A_NACL / 2] },
			{ element: 'Cl', atomic_num: 17, coords: [A_NACL / 2, 0, 0] },
			{ element: 'Cl', atomic_num: 17, coords: [0, A_NACL / 2, 0] },
			{ element: 'Cl', atomic_num: 17, coords: [0, 0, A_NACL / 2] },
			{ element: 'Cl', atomic_num: 17, coords: [A_NACL / 2, A_NACL / 2, A_NACL / 2] }
		],
		description: 'Rocksalt: two interpenetrating fcc lattices, each ion octahedrally coordinated.'
	},
	{
		id: 'si',
		name: 'Si',
		formula: 'Si',
		space_group: 'Fd-3m',
		lattice: cubic(A_SI),
		atoms: [
			{ element: 'Si', atomic_num: 14, coords: [0, 0, 0] },
			{ element: 'Si', atomic_num: 14, coords: [0, A_SI / 2, A_SI / 2] },
			{ element: 'Si', atomic_num: 14, coords: [A_SI / 2, 0, A_SI / 2] },
			{ element: 'Si', atomic_num: 14, coords: [A_SI / 2, A_SI / 2, 0] },
			{ element: 'Si', atomic_num: 14, coords: [A_SI * 0.25, A_SI * 0.25, A_SI * 0.25] },
			{ element: 'Si', atomic_num: 14, coords: [A_SI * 0.25, A_SI * 0.75, A_SI * 0.75] },
			{ element: 'Si', atomic_num: 14, coords: [A_SI * 0.75, A_SI * 0.25, A_SI * 0.75] },
			{ element: 'Si', atomic_num: 14, coords: [A_SI * 0.75, A_SI * 0.75, A_SI * 0.25] }
		],
		description: 'Diamond cubic: every Si is tetrahedrally bonded to four neighbors.'
	},
	{
		id: 'fe',
		name: 'Fe',
		formula: 'Fe',
		space_group: 'Im-3m',
		lattice: cubic(A_FE),
		atoms: [
			{ element: 'Fe', atomic_num: 26, coords: [0, 0, 0] },
			{ element: 'Fe', atomic_num: 26, coords: [A_FE / 2, A_FE / 2, A_FE / 2] }
		],
		description: 'Body-centered cubic iron: 8 nearest neighbors along the body diagonals.'
	}
];

export function getCrystal(id: string): CrystalDef {
	const c = crystals.find((c) => c.id === id);
	if (!c) throw new Error(`unknown crystal id: ${id}`);
	return c;
}
