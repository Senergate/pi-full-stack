<template>
  <section class="current-card">
    <div class="card-header">
      <div>
        <div class="eyebrow">SHELLY · MEASURED + BUILDING TWIN · MODELED</div>
        <h2>Phase Currents</h2>
      </div>
      <span class="badge">{{ yRange.min }}–{{ yRange.max }} A</span>
    </div>

    <div class="measured-strip">
      <div class="measured-copy">
        <strong>SHELLY · MEASURED</strong>
        <small>physical prototype current / 原型实测电流</small>
      </div>
      <div v-for="phase in measuredPhases" :key="`measured-${phase.key}`" class="measured-phase">
        <span>{{ phase.label }}</span>
        <strong>{{ formatMeasuredCurrent(phase.current) }} A</strong>
      </div>
    </div>

    <div class="model-heading">
      <span>{{ sourceLabel }}</span>
      <strong>BUILDING TWIN · MODELED · 0–100 A</strong>
    </div>

    <div class="chart">
      <div class="plot-area">
        <div v-for="tick in ticks" :key="tick.value" class="grid-line" :style="{ bottom: `${tick.position}%` }">
          <span class="tick-label">{{ formatTick(tick.value) }} A</span><div class="line" />
        </div>
        <div class="bars">
          <div v-for="phase in phases" :key="phase.key" class="bar-column">
            <div class="bar-area">
              <div class="bar" :style="{ height: `${phase.height}%`, backgroundColor: phase.color }">
                <span class="bar-value">{{ formatCurrent(phase.current) }} A</span>
              </div>
            </div>
            <div class="phase-label"><span class="phase-dot" :style="{ backgroundColor: phase.color }"/><span>{{ phase.label }}</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  sourceLabel: { type: String, default: 'BUILDING-SCALE DIGITAL TWIN · P/Q MODEL' },
  measuredCurrents: { type: Object, default: () => ({ a: null, b: null, c: null }) },
  currents: { type: Object, required: true },
  yRange: { type: Object, default: () => ({ min: 0, max: 100 }) },
});

const phaseDefinitions = [
  { key: 'a', label: 'I1', color: '#58e7ff' },
  { key: 'b', label: 'I2', color: '#a98bff' },
  { key: 'c', label: 'I3', color: '#42e38c' },
];
const safeMin = computed(() => Number.isFinite(Number(props.yRange?.min)) ? Number(props.yRange.min) : 0);
const safeMax = computed(() => Number.isFinite(Number(props.yRange?.max)) && Number(props.yRange.max) > safeMin.value ? Number(props.yRange.max) : safeMin.value + 100);

const measuredPhases = computed(() => phaseDefinitions.map(def => {
  const n = Number(props.measuredCurrents?.[def.key]);
  return { ...def, current: props.measuredCurrents?.[def.key] === null || props.measuredCurrents?.[def.key] === undefined || !Number.isFinite(n) ? null : n };
}));
const phases = computed(() => phaseDefinitions.map(def => {
  const n = Number(props.currents?.[def.key]);
  const current = props.currents?.[def.key] === null || props.currents?.[def.key] === undefined || !Number.isFinite(n) ? null : n;
  const clamped = current === null ? safeMin.value : Math.max(safeMin.value, Math.min(safeMax.value, current));
  return { ...def, current, height: ((clamped - safeMin.value) / (safeMax.value - safeMin.value)) * 100 };
}));
const ticks = computed(() => Array.from({ length: 5 }, (_, index) => {
  const fraction = index / 4;
  return { value: safeMin.value + fraction * (safeMax.value - safeMin.value), position: fraction * 100 };
}));
const formatMeasuredCurrent = value => Number.isFinite(value) ? value.toFixed(2) : '—';
const formatCurrent = value => !Number.isFinite(value) ? '—' : Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : value.toFixed(1);
const formatTick = value => Math.abs(value - Math.round(value)) < 0.05 ? Math.round(value) : value.toFixed(1);
</script>

<style scoped>
.current-card{--text:#eaf6ff;--muted:#83a7bd;--line:#163448;padding:18px;color:var(--text);border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,rgba(12,30,44,.94),rgba(6,18,28,.94));box-shadow:0 20px 60px rgba(0,0,0,.34)}
.card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.eyebrow{margin-bottom:5px;color:#6f9ab1;font-size:11px;letter-spacing:.14em;text-transform:uppercase}h2{margin:0;font-size:16px}.badge{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:11px}
.measured-strip{display:grid;grid-template-columns:minmax(150px,1.4fr) repeat(3,minmax(60px,.7fr));gap:8px;align-items:stretch;margin-bottom:14px;padding:10px;border:1px solid #245264;border-radius:12px;background:rgba(8,27,37,.72)}.measured-copy{display:grid;align-content:center;gap:2px}.measured-copy strong{color:#8ff1c3;font-size:10px}.measured-copy small{color:#6f91a3;font-size:8px}.measured-phase{display:grid;gap:3px;align-content:center;justify-items:end;padding:7px 8px;border:1px solid #1d4355;border-radius:9px;background:#071721}.measured-phase span{color:#6f91a3;font-size:8px}.measured-phase strong{font-size:12px}
.model-heading{display:flex;justify-content:space-between;gap:8px;margin:0 0 8px;color:#6f91a3;font-size:8px;letter-spacing:.08em;text-transform:uppercase}.model-heading strong{color:#83a7bd;font-size:8px}.chart{height:260px}.plot-area{position:relative;height:100%;margin-left:42px}.grid-line{position:absolute;left:0;right:0;display:flex;align-items:center;pointer-events:none}.tick-label{position:absolute;right:calc(100% + 7px);width:38px;color:#6f91a3;font-size:9px;text-align:right}.line{width:100%;border-top:1px solid rgba(120,160,180,.16)}.bars{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;align-items:end;padding:0 22px}.bar-column{height:100%;display:grid;grid-template-rows:1fr 24px;align-items:end}.bar-area{height:100%;display:flex;align-items:end;justify-content:center}.bar{position:relative;width:70%;min-height:2px;border-radius:8px 8px 3px 3px;transition:height .3s ease}.bar-value{position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;font-size:11px;font-weight:800}.phase-label{display:flex;justify-content:center;align-items:center;gap:6px;color:#9fb9c8;font-size:10px}.phase-dot{width:8px;height:8px;border-radius:50%}
@media(max-width:700px){.measured-strip{grid-template-columns:1fr 1fr}.measured-copy{grid-column:1/-1}.model-heading{flex-direction:column}}
</style>
