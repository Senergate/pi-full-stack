import assert from 'node:assert/strict';
import { CONTROL_POLICY_DEFAULTS, CONTROL_INPUT_SPECS, BATTERY_CONTROL_INTERNALS } from '../client/src/ControlPolicyConfig.js';
import { validateControlInput, validateControlPolicyRelations } from '../client/src/ControlInputValidation.js';

assert.equal(CONTROL_POLICY_DEFAULTS.batteryPredictedOnCurrentA, 1.04);
assert.equal(CONTROL_INPUT_SPECS.batteryPredictedOnCurrentA.min, 0.10);
assert.equal(CONTROL_INPUT_SPECS.batteryPredictedOnCurrentA.max, 1.30);
assert.equal(BATTERY_CONTROL_INTERNALS.referenceMaxA, 1.30);
assert.equal(BATTERY_CONTROL_INTERNALS.preLimitRatio, 0.90);
assert.equal(BATTERY_CONTROL_INTERNALS.hardRatio, 1.00);

assert.deepEqual(validateControlInput('batteryPredictedOnCurrentA', '1.04').valid, true);
assert.equal(validateControlInput('batteryPredictedOnCurrentA', '1.3').value, 1.3);
assert.equal(validateControlInput('batteryPredictedOnCurrentA', '0.09').valid, false);
assert.match(validateControlInput('batteryPredictedOnCurrentA', '1,04').error, /Use "\." as the decimal separator/);
assert.match(validateControlInput('batteryPredictedOnCurrentA', '1.234').error, /no more than 2 decimal places/);
assert.match(validateControlInput('vufEnterPct', '2e0').error, /digits and "\." only/);
assert.equal(validateControlPolicyRelations({ vufEnterPct: 2, vufExitPct: 1.7, batteryEffectiveMinA: .1, batteryPredictedOnCurrentA: 1.04 }).valid, true);
assert.equal(validateControlPolicyRelations({ vufEnterPct: 1.7, vufExitPct: 1.7 }).valid, false);
assert.equal(validateControlPolicyRelations({ batteryEffectiveMinA: 1.1, batteryPredictedOnCurrentA: 1.0 }, 'batteryEffectiveMinA').valid, false);
console.log('control_policy_validation_test: PASS');
