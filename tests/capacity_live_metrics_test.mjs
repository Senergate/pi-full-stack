import assert from 'node:assert/strict';
import { computeCapacityStatus } from '../client/src/CapacitySupervisor.js';

const live = computeCapacityStatus({
  policy: {
    siteMaxTotalPowerW: 0,
    siteMaxCurrentL1A: 0,
    siteMaxCurrentL2A: 0,
    siteMaxCurrentL3A: 0,
    warningRatio: 0.8,
    preLimitRatio: 0.9,
    criticalRatio: 0.95,
    hardRatio: 1,
  },
  measuredTotalPowerW: 840,
  measuredCurrents: { a: 0.26, b: 0.42, c: 1.04 },
});

assert.equal(live.enabled, false);
assert.equal(live.state.key, 'not-configured');
assert.equal(live.metrics.length, 4);
assert.equal(live.metrics[0].actual, 840);
assert.equal(live.metrics[1].actual, 0.26);
assert.equal(live.metrics[2].actual, 0.42);
assert.equal(live.metrics[3].actual, 1.04);
assert.equal(live.metrics[0].limit, null);
assert.equal(live.metrics[0].ratio, null);
assert.equal(live.usageRatio, null);

const partial = computeCapacityStatus({
  policy: {
    siteMaxTotalPowerW: 2000,
    siteMaxCurrentL1A: 0,
    siteMaxCurrentL2A: 0,
    siteMaxCurrentL3A: 0,
    warningRatio: 0.8,
    preLimitRatio: 0.9,
    criticalRatio: 0.95,
    hardRatio: 1,
  },
  measuredTotalPowerW: 840,
  measuredCurrents: { a: 0.26, b: 0.42, c: 1.04 },
});

assert.equal(partial.enabled, true);
assert.equal(partial.fullyConfigured, false);
assert.equal(partial.configuredMetricCount, 1);
assert.equal(partial.limitingMetric.key, 'TOTAL_POWER');
assert.equal(partial.usageRatio, 0.42);
assert.equal(partial.state.key, 'normal');

const critical = computeCapacityStatus({
  policy: {
    siteMaxTotalPowerW: 2000,
    siteMaxCurrentL1A: 9,
    siteMaxCurrentL2A: 9,
    siteMaxCurrentL3A: 9,
    warningRatio: 0.8,
    preLimitRatio: 0.9,
    criticalRatio: 0.95,
    hardRatio: 1,
  },
  measuredTotalPowerW: 1200,
  measuredCurrents: { a: 4, b: 8.55, c: 5 },
});

assert.equal(critical.fullyConfigured, true);
assert.equal(critical.limitingMetric.key, 'B_CURRENT');
assert.ok(Math.abs(critical.usageRatio - 0.95) < 1e-12);
assert.equal(critical.state.key, 'critical');

console.log('capacity_live_metrics_test: PASS');
