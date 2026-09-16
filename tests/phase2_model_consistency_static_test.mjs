import fs from 'node:fs';
import assert from 'node:assert/strict';

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const agent = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const cfg = fs.readFileSync(new URL('../client/src/ControlPolicyConfig.js', import.meta.url), 'utf8');

assert.match(dash, /v1\.5\.1-ai-b-phase2-model-consistency-fix/);
assert.match(dash, /HeatpumpDynamicPowerModel/);
assert.match(dash, /heatpumpLiveBuildingPower/);
assert.match(dash, /applyHeatpumpPowerToModel\(model, heatpumpLiveBuildingPower\.value\)/);
assert.match(dash, /let model = buildingPowerModel\.value;/);
assert.match(dash, /Counterfactual freeze/);
assert.match(cfg, /batteryStableDurationMs:\s*1000/);
assert.match(cfg, /batteryStableSlopeAperS:\s*0\.02/);
assert.match(agent, /updateBatteryStabilizationWindow/);
assert.match(agent, /batteryStabilizationConfidence/);
assert.match(agent, /HIGH confidence/);
assert.match(agent, /LOW confidence/);

console.log('phase2_model_consistency_static_test: PASS');
