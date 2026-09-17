import fs from 'node:fs';
import assert from 'node:assert/strict';
import { heatpumpAdjustabilityRule, wallboxAdjustabilityRule } from '../client/src/CapacitySupervisor.js';

const agent = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../client/src/ControlPolicyConfig.js', import.meta.url), 'utf8');

assert.match(config, /battery_priority_capacity_monotonic_downshift_v4_headroom_patch/);
assert.deepEqual(heatpumpAdjustabilityRule(90), { percent: 90, locked: false, minLevel: 5 });
assert.deepEqual(heatpumpAdjustabilityRule(91), { percent: 91, locked: true, minLevel: null });
assert.deepEqual(wallboxAdjustabilityRule(90), { percent: 90, locked: false, minLevel: 2 });
assert.deepEqual(wallboxAdjustabilityRule(91), { percent: 91, locked: true, minLevel: null });

const compensation = agent.slice(
  agent.indexOf('const getCompensationCandidates'),
  agent.indexOf('const automaticCandidateRespectsMonotonicRule')
);
assert.doesNotMatch(compensation, /heatpump\s*:/);
assert.doesNotMatch(compensation, /wallbox\s*:/);
assert.match(compensation, /batteryCharging:\s*true/);
assert.match(agent, /candidate\.heatpump > current\.heatpump/);
assert.match(agent, /candidate\.wallbox > current\.wallbox/);
assert.match(agent, /HP\/WB downshift-only/);

console.log('monotonic_downshift_invariant_test: PASS');
