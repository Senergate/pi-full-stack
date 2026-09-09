import fs from 'node:fs';
import SimulationRuntime from '../client/src/SimulationRuntime.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const agent = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

assert(agent.includes('const RELEASE_VUF = 1.9;'), 'P0-3 release hysteresis must be 1.90%');
assert(agent.includes('const TRIGGER_CONFIRM_MS = 1000;'), 'P0-3 trigger confirmation must be 1 s');
assert(agent.includes('const SETTLE_TIME_MS = 10000;'), 'P0-3 settle time must be 10 s');
assert(agent.includes('const MIN_IMPROVEMENT = 0.10;'), 'P0-3 min improvement must be 0.10 percentage points');
assert(agent.includes('const buildDeltaPatch = (actual, desired)'), 'AI execution must build a delta patch');
assert(agent.includes("emit('apply-state', deltaPatch)"), 'AI must emit the delta patch, not the full predicted state');
assert(!agent.includes("emit('apply-state', { ...action.state })"), 'full-state AI execution regression detected');
assert(agent.includes("emit('heatpump-stop')"), 'manual STOP must use an explicit event');
assert(agent.includes('>STOP</button>'), 'manual heatpump button must be labeled STOP');

const mapping = dashboard.slice(dashboard.indexOf('const levelToHeatpumpCommand'), dashboard.indexOf('const sendHeatpumpCommand'));
assert(mapping.includes("forcedMode === 'stop'"), 'manual STOP mapping missing');
assert(mapping.includes("forcedMode === 'zero_hold' || safeLevel === 0"), 'level 0 must default to ZERO_HOLD');
assert(dashboard.includes('@heatpump-stop="requestHeatpumpStop"'), 'SimpleDashboard must wire the explicit STOP event');

SimulationRuntime.start();
let result = SimulationRuntime.EspService.heatpump({ mode: 'zero_hold', level: 0, target_hz: 0 });
assert(result.accepted === true, 'simulation ZERO_HOLD command rejected');
let snapshot = SimulationRuntime.getSnapshot();
assert(snapshot.heatpumpLevel === 0, 'ZERO_HOLD must keep heatpump level 0');
assert(snapshot.heatpumpMode === 'zero_hold', 'simulation must preserve ZERO_HOLD mode separately from STOP');

result = SimulationRuntime.EspService.heatpump({ mode: 'stop', level: 0, target_hz: 0 });
assert(result.accepted === true, 'simulation STOP command rejected');
snapshot = SimulationRuntime.getSnapshot();
assert(snapshot.heatpumpLevel === 0, 'STOP must keep heatpump level 0');
assert(snapshot.heatpumpMode === 'stop', 'simulation must preserve STOP mode separately from ZERO_HOLD');
SimulationRuntime.stop();

console.log('p03_ai_delta_zero_hold_test: PASS');
