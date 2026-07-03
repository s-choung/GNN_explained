<script lang="ts">
	import type { CgcnnData } from '$lib/stores/modelData';

	interface Props {
		data: CgcnnData;
		structureId: string;
		imgBase: string;
	}

	let { data, structureId, imgBase }: Props = $props();

	const descriptions: Record<string, string> = {
		sto: '입방 페로브스카이트: 모서리를 공유하는 TiO₆ 팔면체와 A-site 자리에 놓인 Sr.',
		nacl: '암염 구조: 서로 맞물린 두 개의 fcc 격자로, 각 이온은 팔면체 배위를 이룹니다.',
		si: '다이아몬드 입방: 모든 Si가 이웃 네 개와 사면체로 결합합니다.',
		fe: '체심입방 철: 체대각선을 따라 최근접 이웃이 8개입니다.'
	};

	const description = $derived(descriptions[structureId] ?? '');
</script>

<article class="article">
	<div class="article-divider"></div>

	<section class="section">
		<h2>CGCNN이란?</h2>
		<p>
			Crystal Graph Convolutional Neural Network(CGCNN)은 결정 구조로부터 물성을 곧바로
			예측합니다. 결정을 그래프로 나타내는데, 원자는 노드가 되고 원자 사이의 연결은 엣지가
			됩니다. 그리고 message passing으로 국소적인 화학 환경을 학습합니다. 위 그림은 이 개념을
			그린 삽화가 아닙니다. <strong>{data.crystal.formula}</strong>에 대해 브라우저에서 실시간으로
			돌아가는 실제 계산입니다.
		</p>
	</section>

	<section class="section">
		<h2>1 &middot; 결정에서 그래프로</h2>
		<figure class="figure">
			<img src={`${imgBase}/${structureId}-supercell.webp`} alt={`${data.crystal.name} 2×2×2 슈퍼셀의 ball-and-stick 렌더링`} loading="lazy" />
			<figcaption>
				{data.crystal.formula} ({data.crystal.space_group}), 2&times;2&times;2 슈퍼셀.
				{description} Blender로 렌더링.
			</figcaption>
		</figure>
		<p>
			결정은 무한히 반복되는 패턴입니다. 모델이 볼 수 있는 것은 모두 단위 셀 하나 안에
			있습니다. {data.crystal.formula}의 경우 a = {data.crystal.lattice.a} &#8491;인
			{data.crystal.space_group} 셀 안의 원자 {data.crystal.atoms.length}개입니다. 패턴이
			반복되므로 이웃은 주기 경계 조건으로 찾습니다. 셀 가장자리의 원자는 바로 옆 셀 복제본의
			원자와 결합합니다. 위 Input 패널의 유령 원자(ghost atom)가 바로 그 주기적 이미지입니다.
		</p>
	</section>

	<section class="section">
		<h2>2 &middot; 그래프 구성하기</h2>
		<p>
			두 원자는 cutoff 반지름보다 가까이 있을 때 연결됩니다. 지금 cutoff는
			<strong>r = {data.graph.cutoff_radius.toFixed(1)} &#8491;</strong>이고, 이 값에서 원자마다
			이웃이 약 <strong>{data.graph.num_neighbors}개</strong>입니다 (원래 CGCNN처럼 최대 12개로
			제한). 위의 cutoff 슬라이더를 움직이면 이웃 목록, 모든 feature map, 최종 예측이 바뀌는 것을
			볼 수 있습니다. 슬라이더를 한 칸 옮길 때마다 전체 pipeline이 다시 계산됩니다.
		</p>
		<p>
			각 엣지도 feature를 지닙니다. 원자 사이 거리 d<sub>ij</sub>를 {data.cgcnn.nbr_fea_len}개의
			Gaussian 기저로 펼친 값입니다 (중심 0&#8211;8 &#8491;, 간격 0.2 &#8491;). 이 매끄러운
			인코딩 덕분에 네트워크는 원본 좌표를 전혀 보지 않고도 1.95 &#8491; Ti&#8211;O 결합과
			2.76 &#8491; Sr&#8211;O 접촉을 구분합니다. 각 원자는 {data.cgcnn.embedding.input_dim}차원
			one-hot 원소 벡터로 시작해, 학습된 embedding을 거쳐 {data.cgcnn.embedding.output_dim}차원으로
			사영됩니다.
		</p>
	</section>

	<section class="section">
		<h2>3 &middot; 메시지 패싱</h2>
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
			convolution 한 번은 이웃끼리 소식을 한 차례 주고받는 것입니다. 결합된 원자쌍마다 네트워크는
			중심 원자의 feature h<sub>i</sub>, 이웃의 feature h<sub>j</sub>, 엣지 feature
			e<sub>ij</sub>를 이어 붙인 뒤 결과를 두 갈래로 나눕니다. 하나는 이 이웃이 얼마나 중요한지
			정하는 sigmoid <em>filter</em>이고 (attention의 사촌 격인 학습된 게이트), 다른 하나는 실제
			메시지를 담은 softplus <em>core</em>입니다. 둘의 곱을 이웃에 대해 합산해 h<sub>i</sub>에
			더합니다. 위의 <strong>메시지 패싱 재생</strong>을 누르면 세 홉이 차례로 진행되는 것을 볼 수
			있습니다. 홉 1이 지나면 원자는 자신의 결합을 알고, 홉 3이 지나면 그 인지 범위가 배위 껍질
			세 겹 바깥까지 퍼집니다.
		</p>
	</section>

	<section class="section">
		<h2>4 &middot; 풀링: 결정마다 벡터 하나</h2>
		<p>
			결정마다 원자 수가 다르고 ({data.crystal.formula}는 {data.crystal.atoms.length}개이며, 위의
			결정 칩을 바꿔 비교해 보세요), 형성 에너지 같은 물성은 재료 전체에 대한 값 하나입니다. mean
			pooling은 원자 feature를 평균 내어 {data.cgcnn.atom_fea_len}차원 결정 벡터 하나로 만듭니다.
			평균은 원자 순서를 무시하므로 예측은 순서 불변(permutation invariant)입니다. 원자에 번호를
			다시 매겨도 결과는 그대로입니다. Pool 패널의 백분율은 지금 각 원자의 feature 벡터가 얼마나
			강하게 기여하는지 보여줍니다.
		</p>
	</section>

	<section class="section">
		<h2>5 &middot; 예측</h2>
		<p>
			작은 fully connected head ({data.cgcnn.atom_fea_len} &rarr;
			{data.cgcnn.h_fea_len} &rarr; 1)가 결정 벡터를 목표 물성으로 매핑합니다.
			여기서는 {data.crystal.formula}에 대해 <strong>{data.cgcnn.prediction.value.toFixed(3)}
			{data.cgcnn.prediction.unit}</strong>를 내놓습니다.
		</p>
		<p class="note">
			솔직히 짚어 두자면, 이 사이트는 고정된 무작위 "demo weight"로 돌아갑니다. 그래서 숫자 자체는
			의미가 없습니다. 진짜인 것은 그 앞단 전부입니다. 주기적 이웃 탐색, Gaussian 엣지 feature,
			그리고 컨트롤로 직접 흔들어 볼 수 있는 게이팅된 메시지 패싱 동역학이죠. 학습을 마친 CGCNN은
			형성 에너지에서 평균 절대 오차 약 0.04 eV/atom에 도달합니다.
		</p>
	</section>

	<section class="section">
		<h2>참고 문헌</h2>
		<p class="refs">
			T. Xie &amp; J. C. Grossman,
			<a href="https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.120.145301" target="_blank" rel="noopener">
				Crystal Graph Convolutional Neural Networks for an Accurate and Interpretable
				Prediction of Material Properties</a>, Phys. Rev. Lett. 120, 145301 (2018).
			<br />
			인터랙션 디자인은
			<a href="https://poloclub.github.io/transformer-explainer/" target="_blank" rel="noopener">Transformer
			Explainer</a> (PoloClub, Georgia Tech)에서 영감을 받았습니다.
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
		font-size: 13.5px;
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
		font-size: 13.5px;
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
		font-size: 13.5px;
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
