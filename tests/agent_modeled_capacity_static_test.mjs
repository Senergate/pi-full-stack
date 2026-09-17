import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
assert.ok(src.includes('modeledCurrents'));
assert.ok(src.includes('modeledTotalPowerW'));
assert.ok(src.includes('props.modeledTotalPowerW / pMax') || src.includes('modeledPower / pMax'));
assert.ok(!src.includes('props.measuredTotalPowerW / pMax'));
assert.ok(!src.includes('Number(props.measuredCurrents?.[phase])'));
console.log('agent_modeled_capacity_static_test PASS');
