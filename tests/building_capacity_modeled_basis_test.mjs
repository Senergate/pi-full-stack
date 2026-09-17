import assert from 'node:assert/strict';
import { computeCapacityStatus } from '../client/src/CapacitySupervisor.js';

const status = computeCapacityStatus({
  policy: {
    siteMaxTotalPowerW: 2000,
    siteMaxCurrentL1A: 10,
    siteMaxCurrentL2A: 10,
    siteMaxCurrentL3A: 10,
    warningRatio: 0.8,
    preLimitRatio: 0.9,
    criticalRatio: 0.95,
    hardRatio: 1,
  },
  measuredCurrents: { a: 0.26, b: 0, c: 0 },
  measuredTotalPowerW: 54,
  modeledCurrents: { a: 10, b: 3.2, c: 4.1 },
  modeledTotalPowerW: 1420,
  dataFresh: true,
});

assert.equal(status.usageRatio, 1);
assert.equal(status.limitingMetric.key, 'A_CURRENT');
assert.equal(status.limitingMetric.measured, 0.26);
assert.equal(status.limitingMetric.modeled, 10);
assert.equal(status.state.key, 'hard');

const noLimits = computeCapacityStatus({
  policy: { siteMaxTotalPowerW: 0, siteMaxCurrentL1A: 0, siteMaxCurrentL2A: 0, siteMaxCurrentL3A: 0 },
  measuredCurrents: { a: 0.26, b: 0, c: 0 },
  measuredTotalPowerW: 54,
  modeledCurrents: { a: 7.5, b: 3.2, c: 4.1 },
  modeledTotalPowerW: 1420,
  dataFresh: true,
});
assert.equal(noLimits.usageRatio, null);
assert.equal(noLimits.metrics[0].ratio, null);
assert.equal(noLimits.metrics[1].ratio, null);
assert.equal(noLimits.state.key, 'not-configured');
console.log('building_capacity_modeled_basis_test PASS');
