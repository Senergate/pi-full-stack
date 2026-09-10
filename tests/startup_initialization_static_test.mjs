import fs from 'node:fs';
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

const required = [
  "phase: 'connecting'",
  'requestInitialHardwareState',
  'startupChecklist',
  'App.MqttService?.status?.()',
  'App.EnergyMeterService?.requestUpdate?.()',
  'App.WallboxService?.requestUpdate?.()',
  'App.BatteryService?.requestUpdate?.()',
  'App.EspService?.requestUpdate?.()',
  'STARTUP_TIMEOUT_MS = 6000',
  "Controls remain blocked",
  'Browser startup does not send automatic STOP',
];
for (const marker of required) {
  if (!dashboard.includes(marker)) throw new Error(`Missing startup initialization marker: ${marker}`);
}

if (!dashboard.includes('heatpump: { level: null')) throw new Error('Heatpump must start UNKNOWN, not OFF.');
if (!dashboard.includes('wallbox: { load: null, r0: null, r1: null')) throw new Error('Wallbox must start UNKNOWN, not OFF.');
if (!dashboard.includes('battery: { charging: null')) throw new Error('Battery must start UNKNOWN, not OFF.');
if (!dashboard.includes("_.startup.phase === 'ready'")) throw new Error('Control gate must require completed startup initialization.');


if (!dashboard.includes('if (n === null) return null;')) {
  throw new Error('Missing Branch-A frequency must remain UNKNOWN; it must not be converted to level 0/OFF.');
}
if (!dashboard.includes('branchB: startupRequestReceived(_.realFeedback.branchB.lastUpdate) && branchBReady.value')) {
  throw new Error('Startup Branch-B checklist must use the same readiness gate as runtime control.');
}

console.log('startup_initialization_static_test: PASS');
