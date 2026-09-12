import fs from 'node:fs';
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const phasor = fs.readFileSync(new URL('../client/src/components/PhasorCalculator.js', import.meta.url), 'utf8');
if (!dash.includes('analyzeVUFIncrementalPQ')) throw new Error('Dashboard must use incremental P/Q VUF model.');
if (!dash.includes('baselineVoltagesFromProfiles')) throw new Error('All-OFF PCC baseline model missing.');
if (!dash.includes('V<sub>PCC,proj</sub> = V<sub>PCC,OFF</sub>')) throw new Error('Incremental PCC model formula is not shown.');
if (!phasor.includes('Only the additional controllable building load')) throw new Error('Incremental PCC physical boundary comment missing.');
if (dash.includes('measuredPowerFactors')) throw new Error('Live aggregate Shelly PF must not be mixed into Building-Twin P/Q VUF calculation.');
console.log('incremental_pcc_model_static_test: PASS');
