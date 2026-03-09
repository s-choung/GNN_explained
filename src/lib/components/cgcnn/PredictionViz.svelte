<script lang="ts">
	interface Props {
		property: string;
		value: number;
		unit: string;
		hiddenDim: number;
	}

	let { property, value, unit, hiddenDim }: Props = $props();
</script>

<div class="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-slate-800 to-emerald-900/20 p-6">
	<h3 class="mb-4 text-sm font-semibold text-slate-300 uppercase tracking-wider">
		Prediction
	</h3>

	<!-- FC layer diagram -->
	<div class="mb-4 flex items-center gap-3 text-xs text-slate-400">
		<div class="rounded border border-slate-600 px-3 py-2 text-center">
			<div class="text-slate-500">input</div>
			<div class="text-slate-300 font-mono">64</div>
		</div>
		<svg width="30" height="16">
			<path d="M2 8 L28 8 M22 3 L28 8 L22 13" fill="none" stroke="#64748b" stroke-width="1.5" />
		</svg>
		<div class="rounded border border-slate-600 px-3 py-2 text-center">
			<div class="text-slate-500">FC + softplus</div>
			<div class="text-slate-300 font-mono">{hiddenDim}</div>
		</div>
		<svg width="30" height="16">
			<path d="M2 8 L28 8 M22 3 L28 8 L22 13" fill="none" stroke="#64748b" stroke-width="1.5" />
		</svg>
		<div class="rounded border border-emerald-500/40 px-3 py-2 text-center bg-emerald-500/10">
			<div class="text-emerald-400">output</div>
			<div class="text-emerald-300 font-mono">1</div>
		</div>
	</div>

	<!-- Final prediction -->
	<div class="flex items-baseline gap-3">
		<span class="text-sm text-slate-400">{property}:</span>
		<span class="text-3xl font-bold text-emerald-400 font-mono">{value.toFixed(3)}</span>
		<span class="text-sm text-slate-500">{unit}</span>
	</div>
</div>
