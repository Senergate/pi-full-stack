import fs from 'node:fs';

const card = fs.readFileSync(new URL('../client/src/components/CurrentCard.vue', import.meta.url), 'utf8');
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

if (!card.includes('SHELLY · MEASURED')) throw new Error('CurrentCard must visibly separate Shelly measured currents.');
if (!card.includes('BUILDING TWIN · MODELED · 0–100 A')) throw new Error('CurrentCard must label the modeled 0–100 A section.');
if (!card.includes('formatMeasuredCurrent')) throw new Error('Measured current formatting missing.');
if (!dash.includes(':measured-currents="displayMeasuredCurrents"')) throw new Error('Dashboard must pass measured currents separately.');
if (!dash.includes('max: 100')) throw new Error('Building-Twin y-axis must be 0–100 A.');

console.log('current_card_measured_modeled_static_test: PASS');
