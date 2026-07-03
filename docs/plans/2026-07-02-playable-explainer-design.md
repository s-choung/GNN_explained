# Playable CGCNN Explainer — Design

Date: 2026-07-02
Goal: upgrade the static pipeline into a Transformer-Explainer-style playable
explainer, with a proper Blender-rendered SrTiO3 structure and an article
section that explains each stage.

## Why

The current flow renders one hard-coded JSON snapshot. Nothing responds to
user input, so the "explainer" reads as a poster, not a playground.

## Core decision: live forward pass in the browser

Implement the actual CGCNN math in TypeScript and run it on every input
change. Model weights are fixed pseudo-random (seeded), labelled "demo
weights" in the UI — values respond genuinely to structure/parameter changes
even though the prediction itself is untrained.

Compute cost is trivial (<= 8 atoms, 64-dim features, 3 conv layers).

## Components

1. `src/lib/cgcnn/structures.ts`
   - Crystal library: SrTiO3 (perovskite), NaCl (rocksalt), Si (diamond),
     Fe (bcc). Lattice + cartesian coords + element metadata.
   - Formula string with unicode subscripts; element colors extended
     (Na, Cl added to colorScales).

2. `src/lib/cgcnn/engine.ts`
   - PBC neighbor search within cutoff (image shifts -1..1).
   - Gaussian distance expansion (41-dim, dmax 8 A, step 0.2).
   - One-hot(Z) 92-dim atom features -> Linear embed (64) ->
     3x gated graph conv (sigma(Wf z) * softplus(Ws z), z = [hi|hj|eij])
     -> mean pool -> FC 64->128->1.
   - Seeded RNG (mulberry32) weights, ~1/sqrt(fan_in) scale; tanh squash
     for display color domain [-1, 1].
   - Emits the existing `CgcnnData` shape so ArchitectureDiagram /
     SankeyDiagram keep their props unchanged.

3. Controls bar (+page.svelte)
   - Structure chips (soft buttons) — switching recomputes everything.
   - Cutoff radius slider (2.5–6.0 A) — live graph/feature/prediction update.
   - Play button — steps message passing L1 -> L2 -> L3 (conv layers light
     up sequentially; downstream stages dim until reached).

4. Article section (below viz, max-width ~720px)
   - Stages: crystal & unit cell (Blender render), graph construction,
     message passing, pooling, prediction.
   - English prose, OpenAI-style typography (no new colors).

5. Blender assets (`static/img/`)
   - /blender-atom-render: SrTiO3 2x2x2 supercell (TiO6 octahedra visible),
     white background, plus per-element legend spheres (Sr, Ti, O).

## Out of scope (YAGNI)

- Trained weights / real formation energies (would fake precision).
- NequIP / MACE / Equiformer tabs stay "soon".
- 3D interactive viewer (Three.js) — static render + 2D projection suffice.

## Verification

Rebuild + Playwright audit script: overlap/overflow detection across
structures x cutoff extremes x both views x light/dark; visual review of
screenshots; interaction smoke test (slider drag, structure switch, play).
