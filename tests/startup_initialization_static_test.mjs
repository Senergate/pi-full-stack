import fs from 'node:fs';
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

const required = [
  "phase: 'connecting'",
  'requestInitialHardwareState',
  'startupChecklist',
  'startupCoreReady',
  'App.MqttService?.status?.()',
  'App.EnergyMeterService?.requestUpdate?.()',
  'App.WallboxService?.requestUpdate?.()',
  'App.BatteryService?.requestUpdate?.()',
  'App.EspService?.requestUpdate?.()',
  'STARTUP_TIMEOUT_MS = 6000',
  'Browser startup does not send automatic STOP',
];
for (const marker of required) {
  if (!dashboard.includes(marker)) throw new Error(`Missing startup initialization marker: ${marker}`);
}

if (!dashboard.includes('heatpump: { level: null')) throw new Error('Heatpump must start UNKNOWN, not OFF.');
if (!dashboard.includes('wallbox: { load: null, r0: null, r1: null')) throw new Error('Wallbox must start UNKNOWN, not OFF.');
if (!dashboard.includes('battery: { charging: null')) throw new Error('Battery must start UNKNOWN, not OFF.');
if (!dashboard.includes('startupChecklist.value.measurement') || !dashboard.includes('startupChecklist.value.branchA')) {
  throw new Error('Core startup must include measurement and Branch A.');
}
if (!dashboard.includes('startupRequestReceived(_.wallbox.r0Update)') || !dashboard.includes('startupRequestReceived(_.wallbox.r1Update)')) {
  throw new Error('Startup must still inspect both Branch-B Shelly relays.');
}

console.log('startup_initialization_static_test: PASS');
