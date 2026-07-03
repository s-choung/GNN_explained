# Playable CGCNN Explainer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the static CGCNN explainer into a playable one: live in-browser forward pass, structure selector, cutoff slider, message-passing step-play, article section with Blender-rendered SrTiO3.

**Architecture:** A pure-TS CGCNN engine (`src/lib/cgcnn/`) computes neighbor lists, features and the forward pass from a small crystal library with seeded demo weights, emitting the existing `CgcnnData` shape. UI components become reactive to `(structure, cutoff)` and a play-step state. An article section explains each stage below the viz.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, d3 (existing), esbuild-bundled node tests (no new deps), Blender io_mesh_atomic for renders.

**Design doc:** `docs/plans/2026-07-02-playable-explainer-design.md`

**Conventions for the implementing engineer:**
- Run all commands from the repo root: `/Users/sean/Library/CloudStorage/GoogleDrive-wjdtjrgus9967@gmail.com/My Drive/Research_2026/playground/15_GNN_explained`
- Google Drive strips exec bits and symlinks in `node_modules/.bin` — never call `.bin` shims. Use:
  - build: `node node_modules/vite/bin/vite.js build`
  - esbuild: `node node_modules/esbuild/lib/main.js` is NOT a CLI; use `node_modules/@esbuild/darwin-arm64/bin/esbuild` (chmod +x if needed)
- Tests: bundle a `*.test.ts` with esbuild, run with node. Helper command shape:
  `node_modules/@esbuild/darwin-arm64/bin/esbuild src/lib/cgcnn/engine.test.ts --bundle --format=esm --outfile=/tmp/engine.test.mjs && node /tmp/engine.test.mjs`
  (Tests use `node:assert/strict`; a test "passes" when the script exits 0 and prints `ok`.)
- OpenAI style rules from the redesign: achromatic UI, pill/6.08px radii, min 13.5px HTML text, no decorative borders, `word-break: keep-all`. Color only for data (atoms, heatmaps).
- Do NOT touch unused legacy components (`CrystalGraph.svelte`, `FeatureHeatmap.svelte`, `cgcnn/*Viz.svelte`).

---

### Task 1: Blender SrTiO3 renders

**Files:**
- Create: `static/img/sto-supercell.png` (hero render)
- Create: `static/img/legend-sr.png`, `static/img/legend-ti.png`, `static/img/legend-o.png`

**Step 1:** Invoke the `/blender-atom-render` skill with a generated POSCAR of a 2x2x2 SrTiO3 supercell (a = 3.905 A, Pm-3m: Sr(0,0,0), Ti(.5,.5,.5), O(.5,.5,0),(.5,0,.5),(0,.5,.5)). White background, angle showing TiO6 octahedra.
**Step 2:** Render single-atom legend spheres for Sr, Ti, O with the site's element colors (Sr `#f472b6`, Ti `#60a5fa`, O `#f87171`) or Blender defaults if the addon dictates colors — then note actual colors for the article captions.
**Step 3:** View PNGs (Read tool) to verify: octahedra visible, no clipping, white bg. Downscale to <=1600px wide if larger (sips).
**Step 4:** Commit `feat: add Blender SrTiO3 renders` (author = user only, no co-author line).

### Task 2: Crystal library

**Files:**
- Create: `src/lib/cgcnn/structures.ts`
- Modify: `src/lib/utils/colorScales.ts` (add Na, Cl colors/radii)
- Test: `src/lib/cgcnn/structures.test.ts`

**Step 1:** Write failing test: 4 structures exist (`sto`, `nacl`, `si`, `fe`); each atom has element/coords/color; `sto` has 5 atoms and formula `SrTiO₃` (unicode subscript); `fe` has 2 atoms.
**Step 2:** Run test (esbuild+node), expect module-not-found failure.
**Step 3:** Implement `structures.ts`:

```ts
export interface CrystalDef {
	id: string; name: string; formula: string; space_group: string;
	lattice: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
	atoms: { element: string; atomic_num: number; coords: [number, number, number] }[]; // cartesian, A
	description: string;
}
```
- STO: a=3.905, atoms Sr(0,0,0) Ti(1.9525,1.9525,1.9525) O(1.9525,1.9525,0) O(1.9525,0,1.9525) O(0,1.9525,1.9525), `Pm-3m`
- NaCl: a=5.6402 conventional cell, 4 Na + 4 Cl, `Fm-3m`
- Si: a=5.4310 diamond cubic, 8 Si, `Fd-3m`
- Fe: a=2.8665 bcc, 2 Fe, `Im-3m`
- Colors come from `elementColors` (add `Na: '#c084fc'`, `Cl: '#4ade80'`; radii Na 16, Cl 14).
**Step 4:** Run test, expect `ok`.
**Step 5:** Commit `feat: add crystal structure library`.

### Task 3: Engine — geometry (PBC neighbors, gaussian expansion, bonds)

**Files:**
- Create: `src/lib/cgcnn/engine.ts`
- Test: `src/lib/cgcnn/engine.test.ts`

**Step 1:** Failing tests:
- `neighborList(sto, 2.5)`: Ti (index 1) has exactly 6 O neighbors, all d=1.9525 (+-1e-3), across periodic images.
- `neighborList(sto, 4.0)`: every atom has >= 12 entries capped at `MAX_NBR = 12`, sorted by distance.
- `gaussianExpand(1.9525)`: length 41, argmax at round(1.9525/0.2)=10.
- `bonds(sto, 4.0)`: contains Ti-O pairs, no self-pairs, each unordered pair once.
**Step 2:** Run, expect failure.
**Step 3:** Implement:
- `neighborList(crystal, cutoff)`: loop atom pairs x image shifts (na,nb,nc in -1..1) on orthorhombic lattice vectors; collect `{center, neighbor, distance, image}` with `distance <= cutoff`, exclude self-image-zero; sort per center by distance; cap 12 (classic CGCNN max_num_nbr).
- `gaussianExpand(d)`: centers 0..8 step 0.2 (41), sigma 0.2: `exp(-((d-mu)^2)/(2*0.2^2))`.
- `bonds(crystal, cutoff)`: unique in-cell pairs (image (0,0,0)) with `d <= min(cutoff, 1.25 * dmin_global)` for the mini-graph drawing.
**Step 4:** Run tests, expect `ok`. **Step 5:** Commit `feat: engine geometry`.

### Task 4: Engine — forward pass + CgcnnData adapter

**Files:**
- Modify: `src/lib/cgcnn/engine.ts`
- Test: `src/lib/cgcnn/engine.test.ts` (extend)

**Step 1:** Failing tests:
- `runCgcnn(sto, 4.0)` returns embedding features 5x64, conv layers 3 each 5x64, all display values within [-1,1], pooling contributions length 5 summing to 1 (+-1e-6), finite scalar prediction.
- Determinism: two runs give identical prediction.
- `buildCgcnnData(sto, 4.0)` matches the `CgcnnData` interface used by components (crystal/graph/cgcnn keys, atoms carry color+index).
**Step 2:** Run, expect failure.
**Step 3:** Implement:
- `mulberry32(seed)` RNG; weight matrices scaled by `1/sqrt(fanIn)`, seed fixed (42).
- Atom feature: one-hot(Z) length 92 (index Z-1, Z<=92).
- Embedding: `W_emb (92x64)`, h = tanh(W x) for display-friendly range.
- Conv layer t: for each center i, z_ij = [h_i | h_j | e_ij] (64+64+41=169); filter = sigmoid(Wf z + bf), core = softplus(Ws z + bs) (both 64-dim); msg = sum_j filter*core; h'_i = tanh(h_i + msg / max(1, nNbr)).
- `gate_values`: mean sigmoid filter per center for first 8 dims (feeds existing gate bar).
- Pool: mean over atoms -> `crystal_feature` (64); `per_atom_contribution[i] = ||h_i|| / sum ||h||`.
- FC: 64 -> softplus(128) -> 1; prediction scaled to plausible range: `-4 + 3*tanh(y)` labelled Formation Energy (demo).
- `buildCgcnnData(structureId, cutoff): CgcnnData` — assembles crystal (colors from elementColors), graph (num_neighbors = mean list length, neighbor_list in the existing `{center, neighbors[], distances[]}` shape), cgcnn block (embedding.atom_features = display features, conv_layers, pooling, prediction, dims 92/64/41/128).
**Step 4:** Run tests, expect `ok`. **Step 5:** Commit `feat: live CGCNN engine`.

### Task 5: Wire live data + controls bar

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/stores/modelData.ts` (only if type import needs moving; keep `CgcnnData` interface as-is)

**Step 1:** Replace `fetch(...json)` in onMount with engine call. State:
```ts
let structureId = $state('sto');
let cutoff = $state(4.0);
let playStep = $state<number>(-1); // -1 idle, 0..2 conv hop, 3 done
const data = $derived(buildCgcnnData(structureId, cutoff));
```
Keep `modelData.set(data)` in an `$effect` for the hover store consumers.
**Step 2:** Controls bar under the toolbar (OpenAI style):
- Structure chips: soft buttons (`--surface2`, 40px radius), active = black pill; labels SrTiO₃ / NaCl / Si / Fe.
- Cutoff slider: native `<input type=range min=2 max=6 step=0.1>` styled achromatic (black thumb, `--surface` track) + value readout `r = 4.0 Å` (13.5px, tabular).
- Play button: black pill `▶ Play message passing`; on click steps playStep 0→1→2→3 with 900ms interval then resets to -1; disabled while playing.
- `demo weights` caption (13.5px, `--text5`→ no, use `--text2`) next to prediction-related controls.
**Step 3:** Pass `{data}` and `{playStep}` to ArchitectureDiagram; `{data}` to SankeyDiagram. Remove the old model-tabs? No — keep model tabs (CGCNN active) as-is.
**Step 4:** Build (`node node_modules/vite/bin/vite.js build`), expect success. **Step 5:** Commit `feat: live controls`.

### Task 6: Reactive diagrams + step-play

**Files:**
- Modify: `src/lib/components/ArchitectureDiagram.svelte`
- Modify: `src/lib/components/SankeyDiagram.svelte`

**Step 1 (Architecture):**
- d3 drawings currently run once in `onMount`; move to `$effect(() => { data; redrawAll(); })` so structure/cutoff changes redraw (unit cell, mini graphs, conv graphs — conv svg ids depend on layer count; keep 3).
- Feature strips/percentages already template-driven → reactive automatically.
- Step-play prop `playStep`: when in 0..2, add `conv-active` class to conv unit `li === playStep` (chalk→black tag inversion + slight scale), dim downstream stages (`pool`, `fc`, energy) with opacity 0.35 until `playStep >= 2`; when -1 all normal. Pure CSS classes, no layout shift (transform/opacity only).
**Step 2 (Sankey):** convert module-level layout consts (`NUM_ATOMS`, `columns`, `colXs`, `allNodes`, `allLinks`, `allParticles`, `columnDimLabels`, bracket, output geometry) into `$derived.by` blocks keyed on `data` so atom-count changes (2/5/8) re-layout. Node color/labels come from `data.crystal.atoms`.
**Step 3:** Build, expect success. Quick dev smoke via preview + browser.
**Step 4:** Commit `feat: reactive diagrams + step play`.

### Task 7: Article section

**Files:**
- Create: `src/lib/components/ExplainerArticle.svelte`
- Modify: `src/routes/+page.svelte` (render below viz)

**Step 1:** Section structure (max-width 720px, centered, 64px+ section gaps, h2 22px/600, body 16px/1.65 `#374151`-not! use `--text` and `--text2` only):
1. *From crystal to graph* — Blender hero image (`{base}/img/sto-supercell.png`, 6.08px radius) + caption; unit cell, periodicity, why PBC matters.
2. *Building the graph* — cutoff radius, neighbor list, gaussian edge features; nudge: "drag the r slider above".
3. *Message passing* — gated conv formula (reuse chip row style), what σ⊙softplus does; nudge: play button.
4. *Pooling* — permutation invariance, mean pool, per-atom contributions.
5. *Prediction* — FC head; honest note that weights here are random demo weights.
6. *Reference* — CGCNN paper (Xie & Grossman, PRL 2018) + Transformer Explainer inspiration links.
**Step 2:** Build, expect success. **Step 3:** Commit `feat: explainer article`.

### Task 8: Audit + fixes

**Files:**
- Modify: scratchpad `audit.mjs` (extend interactions)

**Step 1:** Extend audit: for each structure chip x cutoff {2.0, 6.0}: capture arch view; run overlap+overflow detector. Plus: sankey per structure, play-mode mid-step shot, dark mode, tablet width, article section shots.
**Step 2:** Rebuild, restart preview (stale-server gotcha: must restart after rebuild), run audit; fix any overlap/clipping findings; rerun until 0 issues.
**Step 3:** Read key screenshots visually (Read tool). 
**Step 4:** Final commit `feat: playable CGCNN explainer` (squash-ish message fine).

---

**Verification checklist (end state):**
- [ ] Switching structure re-renders unit cell, graph, features, sankey with correct atom counts
- [ ] Cutoff slider changes edge counts + neighbor list + prediction live
- [ ] Play button animates L1→L2→L3 with downstream dimming, returns to idle
- [ ] Article renders Blender image, no text overlap anywhere, light+dark OK
- [ ] `node node_modules/vite/bin/vite.js build` exits 0; audit reports 0 overlaps/overflow
