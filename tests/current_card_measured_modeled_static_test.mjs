import fs from 'node:fs';
const card = fs.readFileSync(new URL('../client/src/components/CurrentCard.vue', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

if (!card.includes('SHELLY · MEASURED')) throw new Error('CurrentCard must display Shelly measured currents.');
if (!card.includes('BUILDING TWIN · MODELED')) throw new Error('CurrentCard must label modeled bars separately.');
if (!card.includes('measuredCurrents')) throw new Error('CurrentCard measuredCurrents prop missing.');
if (!dashboard.includes(':measured-currents="displayMeasuredCurrents"')) throw new Error('Dashboard must pass measured currents to CurrentCard.');
console.log('current_card_measured_modeled_static_test: PASS');
