import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

if (!text.includes("import { deriveHeatpumpStatus } from '../HeatpumpStatusAdapter.js';")) {
  throw new Error('SimpleDashboard must use HeatpumpStatusAdapter.');
}
if (!text.includes('const interpreted = deriveHeatpumpStatus(payload);')) {
  throw new Error('Branch-A status handler must derive model level through adapter.');
}
if (text.includes('payload?.actual_output_frequency_hz,\n    payload?.target_frequency_hz')) {
  throw new Error('Dashboard must not prioritize actual frequency ahead of target frequency.');
}
console.log('branchA_status_adapter_static_test: PASS');
