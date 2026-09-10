import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../client/src/App.js', import.meta.url), 'utf8');
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const appVue = fs.readFileSync(new URL('../client/src/App.vue', import.meta.url), 'utf8');

assert(!app.includes("mode: 'simulation'"));
assert(!app.includes('setMode:'));
assert(!dash.includes("import SimulationRuntime"));
assert(!dash.includes('setRuntimeMode'));
assert(!dash.includes('AI TEST > 2%'));
assert(dash.includes('heatpump: { level: null'));
assert(dash.includes('wallbox: { load: null, r0: null, r1: null }'));
assert(dash.includes('battery: { charging: null }'));
assert(dash.includes('await shutdownRealDevices()'));
assert(dash.includes("source_type: 'digital_twin_from_real_state'"));
assert(appVue.includes('<SimpleDashboard />'));
console.log('real_hardware_startup_static_test: PASS');
