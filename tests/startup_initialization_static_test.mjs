import fs from 'node:fs';
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
for (const marker of ["phase: 'connecting'", 'startupCoreReady', 'requestInitialHardwareState', 'STARTUP_TIMEOUT_MS = 6000', 'Browser startup does not send automatic STOP']) {
  if (!dash.includes(marker)) throw new Error(`Missing startup marker: ${marker}`);
}
if (!dash.includes('heatpump: { level: null') || !dash.includes('r0: null, r1: null') || !dash.includes('battery: { charging: null')) throw new Error('Runtime state must start UNKNOWN.');
console.log('startup_initialization_static_test: PASS');
