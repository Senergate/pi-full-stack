import assert from 'node:assert/strict';
import {
  classifyBatteryEffectiveness,
  computeBatteryDeltaCurrentA,
  computeCompleteThreePhaseLoadPowerW,
} from '../client/src/MeasurementValidity.js';

assert.equal(computeCompleteThreePhaseLoadPowerW({ a_act_power: 200, b_act_power: 300, c_act_power: 400 }), 900);
assert.equal(computeCompleteThreePhaseLoadPowerW({ a_act_power: 200, b_act_power: 300, c_act_power: null }), null, 'Partial phase power must not be shown as total power.');
assert.equal(computeBatteryDeltaCurrentA({ charging: false, rawPhaseCurrentA: 1.2, baselinePhaseCurrentA: 0.3 }), 0);
assert.equal(computeBatteryDeltaCurrentA({ charging: true, rawPhaseCurrentA: 1.34, baselinePhaseCurrentA: 0.30 }), 1.04);
assert.equal(computeBatteryDeltaCurrentA({ charging: true, rawPhaseCurrentA: 1.34, baselinePhaseCurrentA: null }), null, 'Missing baseline must remain UNKNOWN, not fall back to entire L3 current.');
assert.equal(classifyBatteryEffectiveness({ charging: true, deltaCurrentA: null, minimumEffectiveA: 0.1 }).key, 'unknown');
assert.equal(classifyBatteryEffectiveness({ charging: true, deltaCurrentA: 0.09, minimumEffectiveA: 0.1 }).key, 'ineffective');
assert.equal(classifyBatteryEffectiveness({ charging: true, deltaCurrentA: 0.10, minimumEffectiveA: 0.1 }).key, 'effective');
console.log('measurement_validity_test: PASS');
