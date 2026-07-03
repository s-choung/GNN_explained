// Engine tests — run via:
//   esbuild tests/engine.test.ts --bundle --format=esm --platform=node --outfile=<tmp>/engine.test.mjs
//   node <tmp>/engine.test.mjs
// Minimal inline assert (avoids @types/node dependency for svelte-check)
const assert = {
	ok(cond: unknown, msg?: string): void {
		if (!cond) throw new Error(msg ?? 'assert.ok failed');
	},
	equal(actual: unknown, expected: unknown, msg?: string): void {
		if (actual !== expected)
			throw new Error(msg ?? `assert.equal failed: ${String(actual)} !== ${String(expected)}`);
	},
	notEqual(actual: unknown, expected: unknown, msg?: string): void {
		if (actual === expected)
			throw new Error(msg ?? `assert.notEqual failed: both ${String(actual)}`);
	}
};

import { crystals, getCrystal } from '../src/lib/cgcnn/structures';
import {
	neighborList,
	gaussianExpand,
	bonds,
	runCgcnn,
	buildCgcnnData,
	NBR_FEA_LEN,
	MAX_NBR
} from '../src/lib/cgcnn/engine';

// ---- structures ----
assert.equal(crystals.length, 4);
for (const c of crystals) {
	assert.ok(c.atoms.length >= 2, `${c.id} has atoms`);
	for (const atom of c.atoms) {
		assert.equal(atom.coords.length, 3);
		assert.ok(atom.atomic_num > 0);
	}
}
assert.equal(getCrystal('sto').atoms.length, 5);
assert.equal(getCrystal('sto').formula, 'SrTiO₃');
assert.equal(getCrystal('fe').atoms.length, 2);

// ---- neighbor list ----
const sto = getCrystal('sto');
const nl25 = neighborList(sto, 2.5);
// Ti (index 1) octahedrally coordinated by 6 O at 1.9525 A
const tiNbrs = nl25[1];
assert.equal(tiNbrs.length, 6, `Ti should have 6 neighbors at r=2.5, got ${tiNbrs.length}`);
for (const e of tiNbrs) {
	assert.ok(Math.abs(e.distance - 1.9525) < 1e-3);
	assert.ok([2, 3, 4].includes(e.neighbor), 'Ti neighbors are O');
}
const nl40 = neighborList(sto, 4.0);
for (const l of nl40) {
	assert.equal(l.length, MAX_NBR, 'capped at 12');
	for (let k = 1; k < l.length; k++) assert.ok(l[k - 1].distance <= l[k].distance, 'sorted');
}
// Fe bcc: 8 nearest at sqrt(3)/2*a = 2.482
const fe = getCrystal('fe');
const feNl = neighborList(fe, 2.6);
assert.equal(feNl[0].length, 8);
assert.ok(Math.abs(feNl[0][0].distance - 2.4824) < 1e-2);

// ---- gaussian expansion ----
const g = gaussianExpand(1.9525);
assert.equal(g.length, NBR_FEA_LEN);
assert.equal(g.indexOf(Math.max(...g)), 10, 'argmax at mu=2.0');

// ---- bonds ----
const stoBonds = bonds(sto, 4.0);
assert.ok(stoBonds.length >= sto.atoms.length - 1, 'graph not too sparse');
for (const b of stoBonds) assert.notEqual(b.source, b.target);
const seen = new Set(stoBonds.map((b) => `${b.source}-${b.target}`));
assert.equal(seen.size, stoBonds.length, 'no duplicate pairs');

// ---- forward pass ----
const r1 = runCgcnn(sto, 4.0);
assert.equal(r1.embedded.length, 5);
assert.equal(r1.embedded[0].length, 64);
assert.equal(r1.convOutputs.length, 3);
for (const layer of r1.convOutputs)
	for (const feat of layer)
		for (const v of feat) assert.ok(v >= -1 && v <= 1 && Number.isFinite(v));
assert.equal(r1.contributions.length, 5);
assert.ok(Math.abs(r1.contributions.reduce((s, v) => s + v, 0) - 1) < 1e-6);
assert.ok(Number.isFinite(r1.prediction));

// determinism
const r2 = runCgcnn(sto, 4.0);
assert.equal(r1.prediction, r2.prediction);

// cutoff sensitivity: different cutoff -> different prediction
const r3 = runCgcnn(sto, 3.0);
assert.notEqual(r1.prediction, r3.prediction);

// ---- adapter ----
const data = buildCgcnnData('sto', 4.0);
assert.equal(data.crystal.atoms.length, 5);
assert.ok(data.crystal.atoms[0].color.startsWith('#'));
assert.equal(data.graph.neighbor_list.length, 5);
assert.equal(data.cgcnn.embedding.atom_features.length, 5);
assert.equal(data.cgcnn.conv_layers.length, 3);
assert.equal(data.cgcnn.conv_layers[0].gate_values.length, 5);
assert.equal(data.cgcnn.conv_layers[0].gate_values[0].length, 8);
assert.equal(data.cgcnn.pooling.per_atom_contribution.length, 5);
assert.equal(data.cgcnn.fc_layers.hidden_output.length, 128);
assert.ok(data.cgcnn.prediction.unit.length > 0);

// all four structures build cleanly at cutoff extremes
for (const c of crystals)
	for (const cut of [2.0, 6.0]) {
		const d = buildCgcnnData(c.id, cut);
		assert.ok(Number.isFinite(d.cgcnn.prediction.value), `${c.id}@${cut}`);
	}

console.log('ok');
