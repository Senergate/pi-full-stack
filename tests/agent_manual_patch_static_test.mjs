import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const fn = text.slice(text.indexOf('const setDeviceState'), text.indexOf('const requestHeatpumpStop'));
if (!fn.includes("emit('apply-state', patch)")) throw new Error('manual setDeviceState must emit a partial patch only');
if (fn.includes('...normalizedDeviceStates.value')) throw new Error('manual setDeviceState must not clone all actual states; that causes heatpump stop echo');
if (!text.includes('pendingDevices.heatpump') || !text.includes('pendingTargetState.heatpump')) throw new Error('pending display for heatpump is missing');

const mergedState = text.slice(text.indexOf('const mergedPendingState'), text.indexOf('const formatDeviceLevel'));
if (mergedState.includes('prediction.value?.state')) {
  throw new Error('a prediction must not replace the actual/pending device state shown by the segments');
}
if (!mergedState.includes('pendingDevices.heatpump ? pendingTargetState.heatpump : actual.heatpump')) {
  throw new Error('heatpump segments must show the pending target until execution feedback confirms it');
}

const toggleAuto = text.slice(text.indexOf('const toggleAuto'), text.indexOf("watch(() => props.vuf"));
if (toggleAuto.includes('resetPending')) {
  throw new Error('AI CONTROL ON/OFF must preserve an existing pending command');
}

const evaluateAgent = text.slice(text.indexOf('const evaluateAgent'), text.indexOf('const toggleAuto'));
if (!evaluateAgent.includes('if (hasPendingDevice.value)')) {
  throw new Error('AI evaluation must wait while an existing command is pending');
}

if (!text.includes('<span v-if="hasPendingDevice" class="badge pending-badge">COMMAND PENDING</span>')) {
  throw new Error('COMMAND PENDING badge must remain independently visible');
}
console.log('agent_manual_patch_static_test: PASS');
