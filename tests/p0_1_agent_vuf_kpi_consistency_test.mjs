import fs from 'node:fs';
import path from 'node:path';
import SimulationRuntime from '../client/src/SimulationRuntime.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const root = path.resolve(import.meta.dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'client/src/components/SimpleDashboard.vue'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'client/src/components/AgentCard.vue'), 'utf8');

assert(dashboard.includes(':vuf="currentVuf"'), 'AgentCard must receive total currentVuf.');
assert(!dashboard.includes('<AgentCard\n        :vuf="loadImpactVuf"'), 'AgentCard must not receive loadImpactVuf.');

const predictorStart = dashboard.indexOf('const predictVufForDeviceState = candidate => {');
const predictorEnd = dashboard.indexOf('\nconst applyAgentDeviceState = state => {', predictorStart);
assert(predictorStart >= 0 && predictorEnd > predictorStart, 'predictVufForDeviceState block not found');
const predictorBlock = dashboard.slice(predictorStart, predictorEnd);
assert(predictorBlock.includes('return numberOrNull(result?.vufPercent);'), 'Candidate prediction must return total estimated VUF.');
assert(!predictorBlock.includes('Math.max(0, total - baseline)'), 'Candidate prediction must not compare load-impact delta against total VUF.');
assert(agent.includes('total estimated VUF'), 'Agent wording must identify the KPI as total estimated VUF.');

// Reproduce why this consistency matters: the existing AI demo has total > 2%,
// while the old scalar load-impact value is just below the same threshold.
const OFFSETS = { a: 0.24, b: 0.19, c: 0.13 };
const PROJECTION = { a: 800, b: 400, c: 230 };
let energy = null;
const onEnergy = data => { energy = data; };
SimulationRuntime.EnergyMeterService.on('data', onEnergy);
SimulationRuntime.start();
SimulationRuntime.setScenario('ai_vuf_over_2');

const currents = {
  a: Math.max(0, energy.a_current - OFFSETS.a) * PROJECTION.a,
  b: Math.max(0, energy.b_current - OFFSETS.b) * PROJECTION.b,
  c: Math.max(0, energy.c_current - OFFSETS.c) * PROJECTION.c,
};
const common = {
  powerFactors: { a: energy.a_pf, b: energy.b_pf, c: energy.c_pf },
  sourceVoltages: { a: energy.a_voltage + 1.0, b: energy.b_voltage - 1.0, c: energy.c_voltage + 0.5 },
  sourceAngles: { a: 0, b: -120.2, c: 119.8 },
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
  neutralResistance: 0.06,
  neutralReactance: 0.02,
};
const total = PhasorCalculator.analyzeVUF({ currents, ...common }).vufPercent;
const baseline = PhasorCalculator.analyzeVUF({ currents: { a: 0, b: 0, c: 0 }, ...common }).vufPercent;
const oldLoadImpact = Math.max(0, total - baseline);
assert(total > 2, `demo total VUF must exceed 2%, got ${total}`);
assert(oldLoadImpact < 2, `old loadImpact value is expected below 2% to expose the former mismatch, got ${oldLoadImpact}`);

SimulationRuntime.stop();
SimulationRuntime.EnergyMeterService.off('data', onEnergy);

console.log('p0_1_agent_vuf_kpi_consistency_test: PASS');
console.log(`total=${total.toFixed(6)}% oldLoadImpact=${oldLoadImpact.toFixed(6)}%`);
