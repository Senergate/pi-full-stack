import assert from 'node:assert/strict';
import {
  computeCapacityStatus,
  heatpumpAdjustabilityRule,
  wallboxAdjustabilityRule,
} from '../client/src/CapacitySupervisor.js';

assert.deepEqual(heatpumpAdjustabilityRule(1), { percent: 1, locked: false, minLevel: 1 });
assert.deepEqual(heatpumpAdjustabilityRule(20), { percent: 20, locked: false, minLevel: 1 });
assert.deepEqual(heatpumpAdjustabilityRule(21), { percent: 21, locked: false, minLevel: 2 });
assert.deepEqual(heatpumpAdjustabilityRule(80), { percent: 80, locked: false, minLevel: 4 });
assert.deepEqual(heatpumpAdjustabilityRule(81), { percent: 81, locked: false, minLevel: 5 });
assert.deepEqual(heatpumpAdjustabilityRule(90), { percent: 90, locked: false, minLevel: 5 });
assert.deepEqual(heatpumpAdjustabilityRule(91), { percent: 91, locked: true, minLevel: null });
assert.deepEqual(heatpumpAdjustabilityRule(100), { percent: 100, locked: true, minLevel: null });

assert.deepEqual(wallboxAdjustabilityRule(30), { percent: 30, locked: false, minLevel: 1 });
assert.deepEqual(wallboxAdjustabilityRule(31), { percent: 31, locked: false, minLevel: 2 });
assert.deepEqual(wallboxAdjustabilityRule(90), { percent: 90, locked: false, minLevel: 2 });
assert.deepEqual(wallboxAdjustabilityRule(91), { percent: 91, locked: true, minLevel: null });

const status = computeCapacityStatus({
  policy: {
    siteMaxTotalPowerW: 22000,
    siteMaxCurrentL1A: 32,
    siteMaxCurrentL2A: 32,
    siteMaxCurrentL3A: 32,
    warningRatio: 0.80,
    preLimitRatio: 0.90,
    criticalRatio: 0.95,
    hardRatio: 1.00,
  },
  measuredTotalPowerW: 19800,
  measuredCurrents: { a: 25, b: 30.4, c: 20 },
});
assert.equal(status.enabled, true);
assert.equal(status.limitingMetric.key, 'B_CURRENT');
assert.equal(Number(status.usageRatio.toFixed(3)), 0.95);
assert.equal(Number(status.remainingRatio.toFixed(3)), 0.05);
assert.equal(status.state.key, 'critical');

const disabled = computeCapacityStatus({ policy: {}, measuredTotalPowerW: 99999, measuredCurrents: { a: 999 } });
assert.equal(disabled.enabled, false);
assert.equal(disabled.usageRatio, null);
console.log('capacity_supervisor_behavior_test: OK');
