import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

if (dashboard.includes('CURRENT_PROJECTION_FACTOR')) {
  throw new Error('Legacy per-phase 800/400/230 projection must not exist in SimpleDashboard.vue.');
}
if (!dashboard.includes('await shutdownRuntimeDevices(outgoingRuntime)')) {
  throw new Error('Mode switch must shut down outgoing devices before switching.');
}
if (!dashboard.includes('clearRuntimeData();')) {
  throw new Error('Mode switch must clear outgoing UI/runtime data.');
}
if (dashboard.indexOf('await shutdownRuntimeDevices(outgoingRuntime)') > dashboard.indexOf('App.setMode(mode)')) {
  throw new Error('Outgoing shutdown must happen before App.setMode(mode).');
}
if (!dashboard.includes('payloadMatchesActiveMode')) {
  throw new Error('Callbacks must reject stale events from the inactive runtime.');
}
if (!dashboard.includes(':key="App._.mode"')) {
  throw new Error('AgentCard must remount on mode change so AI/pending state is not shared.');
}

console.log('runtime_mode_isolation_static_test: PASS');
