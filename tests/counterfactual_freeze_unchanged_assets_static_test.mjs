import fs from 'node:fs';
import assert from 'node:assert/strict';

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const predictorStart = dash.indexOf('const predictVufForDeviceState = candidate =>');
const predictorEnd = dash.indexOf('const applyAgentDeviceState = state =>');
assert.ok(predictorStart >= 0 && predictorEnd > predictorStart);
const predictor = dash.slice(predictorStart, predictorEnd);

assert.match(predictor, /let model = buildingPowerModel\.value;/,
  'counterfactual must start from current live physical P\/Q');
assert.doesNotMatch(predictor, /let model = modelBuildingPowers\(/,
  'predictor must not rebuild all assets from profiles');
assert.match(predictor, /candidateState\.heatpump !== Number\(current\.heatpumpLevel\)/);
assert.match(predictor, /candidateState\.wallbox !== Number\(current\.wallboxMask\)/);
assert.match(predictor, /candidateState\.batteryCharging !== \(current\.batteryCharging === true\)/);
assert.match(predictor, /applyCounterfactualProfilePower\(model, 'heatpump'/);
assert.match(predictor, /applyCounterfactualProfilePower\(model, 'wallbox'/);
assert.match(predictor, /batteryPredictedOnCurrentA/);

console.log('counterfactual_freeze_unchanged_assets_static_test: PASS');
