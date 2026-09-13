import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const agent = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');

if (!dashboard.includes("if (forcedMode === 'zero_hold' || safeLevel === 0) return { mode: 'zero_hold'")) {
  throw new Error('AI/level 0 must map to ZERO_HOLD, not STOP.');
}
if (!dashboard.includes("if (forcedMode === 'stop') return { mode: 'stop'")) {
  throw new Error('STOP must remain an explicit forced mode.');
}
if (!dashboard.includes('@heatpump-stop="requestHeatpumpStop"')) {
  throw new Error('SimpleDashboard must wire explicit STOP from AgentCard.');
}
if (!dashboard.includes('heatpumpMode: heatpumpMode.value')) {
  throw new Error('Agent device state must include heatpumpMode.');
}
if (!agent.includes('STOP</button>') || !agent.includes('ZERO HOLD</button>')) {
  throw new Error('Heatpump UI must expose separate STOP and ZERO HOLD actions.');
}
if (!agent.includes("markPending(patch, { heatpumpMode: device === 'heatpump' ? (patch.heatpump === 0 ? 'zero_hold' : 'start') : null })")) {
  throw new Error('Manual level commands must preserve P03 heatpump mode semantics.');
}

console.log('p03_branchA_semantics_restore_test: PASS');
