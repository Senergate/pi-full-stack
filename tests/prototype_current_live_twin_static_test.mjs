import fs from 'node:fs';
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../client/src/PrototypeCurrentTwinModel.js', import.meta.url), 'utf8');

if (!dash.includes("projectLiveScaledBuildingCurrents")) throw new Error('Dashboard must use live-scaled current model.');
if (!dash.includes('measuredCurrents: measuredCurrents.value')) throw new Error('Live Shelly currents must feed modeled current display.');
if (!model.includes('battery: 1.30')) throw new Error('Battery predicted max reference must be 1.30 A.');
if (!model.includes('Math.min(1, prototypeCurrent / referenceMax)')) throw new Error('Modeled current must saturate at configured maximum.');
if (!model.includes('0.09, 0.16, 0.21, 0.24, 0.26')) throw new Error('Heatpump real-current curve documentation missing.');
if (!model.includes('0.14, 0.30, 0.42')) throw new Error('Wallbox real-current curve documentation missing.');

console.log('prototype_current_live_twin_static_test: PASS');
