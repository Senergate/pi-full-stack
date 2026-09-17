import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const agent = readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const dash = readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

for (const needle of [
  'getHardLimitOverrideCandidates',
  'candidateOverridesOperatorAdjustability',
  "reason: 'hard_limit_operator_override'",
  'current.heatpump > 1',
  'current.wallbox > 1',
  'setHardLimitOverride({ active: true',
  'Building Capacity hard limit has priority over Operator Adjustability',
]) {
  assert.ok(agent.includes(needle), `missing hard-limit override marker: ${needle}`);
}

// Override must remain a downshift-only, one-level fallback and must not add STOP/OFF.
assert.match(agent, /heatpump:\s*current\.heatpump - 1/);
assert.match(agent, /wallbox:\s*current\.wallbox - 1/);
assert.ok(agent.includes('automaticCandidateRespectsMonotonicRule'));
assert.ok(agent.includes('result?.voltageSafe'));

for (const needle of [
  'hardLimitOverride = reactive',
  '@hard-limit-override-change="onHardLimitOverrideChange"',
  'HARD LIMIT OVERRIDE ACTIVE',
  'configuredFloor',
  'effectiveLevel',
]) {
  assert.ok(dash.includes(needle), `missing dashboard override marker: ${needle}`);
}

console.log('hard_limit_operator_override_static_test: PASS');
