<script lang="ts">
	import type { CgcnnData } from '$lib/stores/modelData';
	import { getCrystal } from '$lib/cgcnn/structures';

	interface Props {
		data: CgcnnData;
		structureId: string;
		imgBase: string;
	}

	let { data, structureId, imgBase }: Props = $props();

	const crystalDef = $derived(getCrystal(structureId));
</script>

<article class="article">
	<div class="article-divider"></div>

	<section class="section">
		<h2>What is CGCNN?</h2>
		<p>
			The Crystal Graph Convolutional Neural Network (CGCNN) predicts material properties
			directly from a crystal structure. It represents the crystal as a graph — atoms become
			nodes, interatomic connections become edges — and learns local chemical environments
			through message passing. The diagram above is not a picture of this idea: it is the
			actual computation, running live in your browser on
			<strong>{data.crystal.formula}</strong>.
		</p>
	</section>

	<section class="section">
		<h2>1 &middot; From crystal to graph</h2>
		<figure class="figure">
			<img src={`${imgBase}/${structureId}-supercell.webp`} alt={`Ball-and-stick rendering of a ${data.crystal.name} 2×2×2 supercell`} loading="lazy" />
			<figcaption>
				{data.crystal.formula} ({data.crystal.space_group}), 2&times;2&times;2 supercell.
				{crystalDef.description} Rendered with Blender.
			</figcaption>
		</figure>
		<p>
			A crystal is an infinitely repeating pattern. Everything the model is allowed to see
			lives in one unit cell — for {data.crystal.formula} that is
			{data.crystal.atoms.length} atoms in a {data.crystal.space_group} cell with
			a = {data.crystal.lattice.a} &#8491;. Because the pattern repeats, neighbors are found
			under periodic boundary conditions: an atom at the cell edge bonds to atoms in the
			next copy of the cell. The ghost atoms in the Input panel above show exactly those
			periodic images.
		</p>
	</section>

	<section class="section">
		<h2>2 &middot; Building the graph</h2>
		<p>
			Two atoms are connected when they sit closer than a cutoff radius. Right now the
			cutoff is <strong>r = {data.graph.cutoff_radius.toFixed(1)} &#8491;</strong>, which
			gives each atom about <strong>{data.graph.num_neighbors} neighbors</strong> (capped
			at 12, as in the original CGCNN). Drag the cutoff slider above and watch the
			neighbor lists, every feature map and the final prediction change — the whole
			pipeline recomputes on each tick.
		</p>
		<p>
			Each edge also carries a feature: the interatomic distance d<sub>ij</sub> expanded on
			a basis of {data.cgcnn.nbr_fea_len} Gaussians (centers 0&#8211;8 &#8491;, step 0.2 &#8491;).
			This smooth encoding lets the network distinguish a 1.95 &#8491; Ti&#8211;O bond from a
			2.76 &#8491; Sr&#8211;O contact without ever seeing raw coordinates. Each atom starts as
			a {data.cgcnn.embedding.input_dim}-dim one-hot element vector, projected to
			{data.cgcnn.embedding.output_dim} dimensions by a learned embedding.
		</p>
	</section>

	<section class="section">
		<h2>3 &middot; Message passing</h2>
		<div class="formula">
			<span class="chip">h<sub>i</sub></span>
			<span class="sep">||</span>
			<span class="chip">h<sub>j</sub></span>
			<span class="sep">||</span>
			<span class="chip">e<sub>ij</sub></span>
			<span class="sep">&rarr;</span>
			<span class="chip">FC</span>
			<span class="sep">&rarr;</span>
			<span class="chip">&sigma;(filter)</span>
			<span class="sep">&odot;</span>
			<span class="chip">softplus(core)</span>
			<span class="sep">&rarr;</span>
			<span class="chip">&Sigma;<sub>j</sub></span>
		</div>
		<p>
			One convolution is one round of neighborhood gossip. For every bonded pair, the
			network concatenates the center atom's features h<sub>i</sub>, the neighbor's
			features h<sub>j</sub> and the edge features e<sub>ij</sub>, then splits the result
			into two halves: a sigmoid <em>filter</em> that decides how much this neighbor
			matters (a learned gate, cousin of attention) and a softplus <em>core</em> carrying
			the actual message. Their product is summed over neighbors and added to
			h<sub>i</sub>. Press <strong>Play message passing</strong> above to watch the three
			hops in sequence — after hop 1 an atom knows its bonds, after hop 3 its awareness
			has spread three coordination shells outward.
		</p>
	</section>

	<section class="section">
		<h2>4 &middot; Pooling: one vector per crystal</h2>
		<p>
			Crystals have different atom counts ({data.crystal.formula} has
			{data.crystal.atoms.length}; switch the crystal chips above to compare), and a
			property like formation energy is a single number for the whole material. Mean
			pooling averages the atom features into one {data.cgcnn.atom_fea_len}-dim crystal
			vector. Because averaging ignores atom order, the prediction is permutation
			invariant — relabel the atoms and nothing changes. The percentages in the Pool
			panel show how strongly each atom's feature vector contributes right now.
		</p>
	</section>

	<section class="section">
		<h2>5 &middot; Prediction</h2>
		<p>
			A small fully connected head ({data.cgcnn.atom_fea_len} &rarr;
			{data.cgcnn.h_fea_len} &rarr; 1) maps the crystal vector to the target property.
			Here it reads <strong>{data.cgcnn.prediction.value.toFixed(3)}
			{data.cgcnn.prediction.unit}</strong> for {data.crystal.formula}.
		</p>
		<p class="note">
			Honest caveat: this site runs fixed random "demo weights", so the number itself is
			meaningless — what is real is everything upstream: the periodic neighbor search,
			the Gaussian edge features and the gated message-passing dynamics you can perturb
			with the controls. A trained CGCNN reaches ~0.04 eV/atom mean absolute error on
			formation energies.
		</p>
	</section>

	<section class="section">
		<h2>References</h2>
		<p class="refs">
			T. Xie &amp; J. C. Grossman,
			<a href="https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.120.145301" target="_blank" rel="noopener">
				Crystal Graph Convolutional Neural Networks for an Accurate and Interpretable
				Prediction of Material Properties</a>, Phys. Rev. Lett. 120, 145301 (2018).
			<br />
			Interaction design inspired by
			<a href="https://poloclub.github.io/transformer-explainer/" target="_blank" rel="noopener">Transformer
			Explainer</a> (PoloClub, Georgia Tech).
		</p>
	</section>
</article>

<style>
	.article {
		max-width: 720px;
		margin: 24px auto 0;
		padding: 0 24px 32px;
	}
	.article-divider {
		height: 1px;
		background: var(--border);
		margin-bottom: 64px;
	}
	.section {
		margin-bottom: 64px;
	}
	.section h2 {
		font-size: 22px;
		font-weight: 600;
		line-height: 1.26;
		color: var(--text);
		margin-bottom: 16px;
		letter-spacing: -0.01em;
	}
	.section p {
		font-size: 16px;
		line-height: 1.65;
		color: var(--text);
		margin-bottom: 14px;
	}
	.section p:last-child {
		margin-bottom: 0;
	}
	.section strong {
		font-weight: 600;
	}
	.section sub {
		font-size: 0.72em;
		line-height: 0;
	}
	.note {
		color: var(--text2);
	}
	.figure {
		margin: 0 0 20px;
	}
	.figure img {
		width: 100%;
		border-radius: var(--radius-card);
		display: block;
	}
	.figure figcaption {
		font-size: 15px;
		line-height: 1.5;
		color: var(--text2);
		text-align: center;
		margin-top: 10px;
	}
	.formula {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 18px;
	}
	.chip {
		display: inline-block;
		padding: 5px 12px;
		border-radius: var(--radius-pill);
		font-size: 15px;
		font-weight: 500;
		line-height: 1.2;
		background: var(--chip-bg);
		color: var(--text);
	}
	.chip sub {
		font-size: 0.72em;
		line-height: 0;
	}
	.sep {
		color: var(--text5);
		font-size: 15px;
	}
	.refs {
		color: var(--text2);
	}
	.refs a {
		color: var(--text);
	}
	.refs a:hover {
		text-decoration: underline;
	}
</style>
