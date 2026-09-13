import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

if (!text.includes('const refreshHardwareStatePreservingState = async () =>')) {
  throw new Error('Missing state-preserving RECHECK path.');
}
if (!text.includes('if (boundRuntime && _.startup.completedAt !== null)')) {
  throw new Error('RECHECK must select preserving refresh after first READY snapshot.');
}
if (!text.includes('await refreshHardwareStatePreservingState();')) {
  throw new Error('RECHECK does not use preserving refresh.');
}
if (!text.includes('requestInitialHardwareState = async ({ resetState = true } = {})')) {
  throw new Error('Cold-start reset must be explicit.');
}
if (!text.includes('if (resetState) {\n    markRealStateWaiting();')) {
  throw new Error('markRealStateWaiting must only run for cold start.');
}

const refreshStart = text.indexOf('const refreshHardwareStatePreservingState = async () =>');
const refreshEnd = text.indexOf('const retryInitialization = async () =>', refreshStart);
const refreshBlock = text.slice(refreshStart, refreshEnd);
if (refreshBlock.includes('markRealStateWaiting()')) {
  throw new Error('Preserving RECHECK must not clear known hardware state.');
}
if (refreshBlock.includes('_.heatpump.twinLevel = null')) {
  throw new Error('Preserving RECHECK must not clear twin level.');
}

console.log('recheck_preserve_state_static_test: PASS');
