import assert from 'node:assert/strict';
import { computeCapacityStatus, finiteNumberOrNull } from '../client/src/CapacitySupervisor.js';

assert.equal(finiteNumberOrNull(null), null, 'null measurement must not become numeric zero.');

const stale = computeCapacityStatus({
  policy: {
    siteMaxTotalPowerW: 2000,
    siteMaxCurrentL1A: 9,
    siteMaxCurrentL2A: 9,
    siteMaxCurrentL3A: 9,
    warningRatio: 0.8,
    preLimitRatio: 0.9,
    criticalRatio: 0.95,
    hardRatio: 1,
    vufEnterPct: 2.0,
    vufExitPct: 1.7,
  },
  measuredTotalPowerW: 1000,
  measuredCurrents: { a: 2, b: 3, c: 4 },
  dataFresh: false,
});

assert.equal(stale.state.key, 'stale');
assert.equal(stale.usageRatio, null, 'Stale measurements must not produce Capacity Usage.');
assert.equal(stale.remainingRatio, null, 'Stale measurements must not produce Headroom.');
assert.equal(stale.metrics[0].actual, 1000, 'Last-known actual value should remain visible.');
assert.equal(stale.metrics[0].live, false);
assert.equal(stale.metrics[0].lastKnown, true);
console.log('capacity_stale_data_test: PASS');
