import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const fn = text.slice(text.indexOf('const setDeviceState'), text.indexOf('const requestHeatpumpZeroHold'));
if (!fn.includes("emit('apply-state', patch)")) throw new Error('manual setDeviceState must emit a partial patch only');
if (fn.includes('...normalizedDeviceStates.value')) throw new Error('manual setDeviceState must not clone all actual states; that causes heatpump stop echo');
if (!text.includes('pendingDevices.heatpump') || !text.includes('pendingTargetState.heatpump')) throw new Error('pending display for heatpump is missing');
console.log('agent_manual_patch_static_test: PASS');
