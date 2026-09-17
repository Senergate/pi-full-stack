import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agent = readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

for (const needle of [
  'const capacityNeedsAction',
  "selectAndApplyState(false, 'capacity')",
  "selectAndApplyState(true, 'capacity')",
  'capacityRelief',
  'critical_capacity_derating',
  'hard_limit_derating',
  'batteryCapacitySafe',
  'return null;\n  }\n\n  // 2) Battery-first VUF balancing',
]) {
  assert.ok(agent.includes(needle), `missing headroom patch marker: ${needle}`);
}

for (const needle of [
  'const predictedCapacity = computeCapacityStatus({',
  'capacityUsageRatio: predictedCapacity.usageRatio',
  'capacityLimitingMetric: predictedCapacity.limitingMetric?.key ?? null',
]) {
  assert.ok(dash.includes(needle), `missing candidate capacity prediction marker: ${needle}`);
}

assert.match(agent, /currentUsage >= hardRatio\.value/);
assert.match(agent, /result\.capacityUsageRatio < preLimitRatio\.value/);
assert.match(agent, /result\.capacityUsageRatio >= hardRatio\.value/);
assert.match(agent, /watch\(\[\(\) => props\.vuf, capacityUsageRatio\]/);
assert.doesNotMatch(agent, /prototypeReliefA/);

console.log('headroom_minimal_patch_static_test: PASS');
