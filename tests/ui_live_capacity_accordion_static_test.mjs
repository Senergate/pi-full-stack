import fs from 'node:fs';
import assert from 'node:assert/strict';

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const vuf = fs.readFileSync(new URL('../client/src/components/VufCard.vue', import.meta.url), 'utf8');

assert.match(dash, /gridImpedanceExpanded/);
assert.match(dash, /senergate\.gridImpedanceExpanded/);
assert.match(dash, /advancedControlExpanded/);
assert.match(dash, /senergate\.advancedControlExpanded/);
assert.match(dash, /capacity-live-inline/);
assert.match(dash, /formatCapacityLimit/);
assert.match(dash, /Not configured/);
assert.match(dash, /Partial limit configuration/);
assert.match(dash, /Heatpump adjustability/);
assert.match(dash, /Wallbox adjustability/);
assert.match(dash, /Advanced Control Parameters/);
assert.match(vuf, /points\.length < 1/);
assert.match(vuf, /Math\.max\(plotLeft, mapX\(first\.ts\)\)/);
assert.match(vuf, /constant VUF/i);

console.log('ui_live_capacity_accordion_static_test: PASS');
