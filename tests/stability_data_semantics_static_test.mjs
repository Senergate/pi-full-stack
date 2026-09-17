import fs from 'node:fs';
import assert from 'node:assert/strict';

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const agent = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const vuf = fs.readFileSync(new URL('../client/src/components/VufCard.vue', import.meta.url), 'utf8');

assert.match(dash, /computeCompleteThreePhaseLoadPowerW/);
assert.match(dash, /computeBatteryDeltaCurrentA/);
assert.match(dash, /dataFresh:\s*measurementFresh\.value/);
assert.match(dash, /LAST KNOWN/);
assert.match(dash, /voltagePredictionState/);
assert.match(dash, /UNKNOWN/);
assert.doesNotMatch(dash, /Math\.max\(0, delta\)/);
assert.match(vuf, /formatSignedVufDeltaPercent/);
assert.match(agent, /classifyBatteryEffectiveness/);
assert.match(agent, /batteryEffectiveness\.value\.key === 'unknown'/);
assert.match(agent, /predictionResult\.voltageSafe === true/);
assert.match(agent, /batteryCharging: false/);
assert.match(agent, /CRITICAL_UNRESOLVED may only be entered/);
assert.match(dash, /battery_priority_capacity_monotonic_downshift_v3|cloneControlPolicyDefaults\(\)/);
console.log('stability_data_semantics_static_test: PASS');
