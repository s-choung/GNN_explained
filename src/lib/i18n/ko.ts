// Korean strings: UI chrome + guided walkthrough steps.
// Mirrors ./en.ts exactly — same shapes, same dynamic interpolation.
import type { TourStep, UIStrings } from './en';

export const UI_KO: UIStrings = {
	instruction: '레이어를 클릭해 살펴보세요 · 원자나 흐름에 마우스를 올려 따라가 보세요 · 모든 것이 실시간으로 다시 계산됩니다',
	walkthrough: '워크스루',
	play: '메시지 패싱 재생',
	hop: (n) => `홉 ${n} / 3`,
	done: '완료',
	crystal: '결정',
	cutoff: '컷오프',
	back: '← 이전',
	next: '다음 →',
	finish: '끝내기',
	stepOf: (i, n) => `${i} / ${n}`
};

export const TOUR_STEPS_KO: TourStep[] = [
	{
		stage: 'input',
		title: '입력 결정',
		body: (d) =>
			`모든 과정은 ${d.crystal.name}의 단위 셀 하나에서 시작합니다. ${d.crystal.space_group} 셀 안에 원자 ${d.crystal.atoms.length}개가 들어 있습니다. 결정은 모든 방향으로 무한히 반복되므로, 이웃 원자는 주기 경계 조건(periodic boundary conditions)으로 찾습니다.`
	},
	{
		stage: 'graph',
		title: '그래프 만들기',
		body: (d) =>
			`원자는 노드가 됩니다. cutoff(r = ${d.graph.cutoff_radius.toFixed(1)} Å)보다 가까운 두 원자는 주기 경계 조건 아래에서 연결됩니다. 지금은 원자마다 이웃이 약 ${d.graph.num_neighbors}개입니다.`
	},
	{
		stage: 'embed',
		title: '원자 임베딩',
		body: (d) =>
			`각 원소는 ${d.cgcnn.embedding.input_dim}차원 one-hot 벡터이고, 학습된 linear layer가 이를 ${d.cgcnn.embedding.output_dim}차원으로 사영합니다. 색색의 막대는 원자별 실제 feature 값입니다.`
	},
	{
		stage: 'conv0',
		title: '메시지 패싱 — 홉 1',
		body: () =>
			`각 원자는 자신의 feature를 이웃의 feature, 결합 feature와 이어 붙인 뒤, sigmoid filter로 메시지를 게이팅하고 합산합니다. 한 홉을 거치면 원자는 자신의 첫 배위 껍질(coordination shell)을 알게 됩니다.`
	},
	{
		stage: 'conv1',
		title: '메시지 패싱 — 홉 2',
		body: () =>
			`같은 convolution이 새로운 weight로 반복됩니다. 이제 정보가 결합 두 개 너머까지 흐릅니다. 이웃의 이웃이 각 원자의 표현을 빚기 시작합니다.`
	},
	{
		stage: 'conv2',
		title: '메시지 패싱 — 홉 3',
		body: () =>
			`세 번째 홉을 지나면 각 원자는 세 껍질 바깥까지의 화학적 환경을 모읍니다. 각 레이어 아래의 작은 막대는 실시간 sigmoid gate 값을 보여줍니다.`
	},
	{
		stage: 'pool',
		title: '하나의 벡터로 풀링',
		body: (d) =>
			`mean pooling은 원자 벡터 ${d.crystal.atoms.length}개를 평균 내어 ${d.cgcnn.atom_fea_len}차원 결정 descriptor 하나로 만듭니다. 평균은 원자 순서를 무시하므로 예측은 순서 불변(permutation invariant)입니다.`
	},
	{
		stage: 'fc',
		title: '예측 헤드',
		body: (d) =>
			`작은 fully connected network(${d.cgcnn.atom_fea_len} → ${d.cgcnn.h_fea_len} → 1)가 결정 descriptor를 목표 물성으로 매핑합니다.`
	},
	{
		stage: 'energy',
		title: '형성 에너지',
		body: (d) =>
			`모델은 ${d.cgcnn.prediction.value.toFixed(3)} ${d.cgcnn.prediction.unit}를 내놓습니다 (demo weight — 학습되지 않음). 결정 칩이나 cutoff 슬라이더를 움직여 보세요. 이 값이 즉시 다시 계산됩니다.`
	}
];
