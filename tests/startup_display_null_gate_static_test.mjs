import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const phasor = fs.readFileSync(new URL('../client/src/components/PhasorCard.vue', import.meta.url), 'utf8');

for (const marker of [
  "const startupDataVisible = computed(() => _.startup.phase === 'ready' && startupAllReady.value)",
  ':currents="displayProjectedCurrents"',
  ':voltages="displayPhasorVoltages"',
  ':vuf="displayCurrentVuf"',
]) {
  if (!dashboard.includes(marker)) throw new Error(`Missing startup display gate: ${marker}`);
}

if (!phasor.includes("if (value === null || value === undefined || value === '') return null")) {
  throw new Error('PhasorCard must preserve null instead of Number(null) coercion.');
}
if (!phasor.includes('v-if="phase.valid"')) {
  throw new Error('PhasorCard must not draw runtime phasors while values are invalid/null.');
}
if (!phasor.includes("return value === null ? '—'")) {
  throw new Error('PhasorCard must render missing voltage as dash.');
}

console.log('startup_display_null_gate_static_test: PASS');
