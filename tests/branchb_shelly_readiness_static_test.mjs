import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const espService = fs.readFileSync(new URL('../server/EspService.js', import.meta.url), 'utf8');
const wallboxService = fs.readFileSync(new URL('../server/WallboxService.js', import.meta.url), 'utf8');

const requiredDashboard = [
  'BRANCH_B_STATUS_FRESH_MS = 3000',
  '_.wallbox.r0Update',
  '_.wallbox.r1Update',
  'startupRequestReceived(_.wallbox.r0Update)',
  'startupRequestReceived(_.wallbox.r1Update)',
  'Branch B · Shelly R0/R1',
];
for (const marker of requiredDashboard) {
  if (!dashboard.includes(marker)) throw new Error(`Missing direct-Shelly Branch-B readiness marker: ${marker}`);
}

for (const legacy of [
  'branchBState',
  "EspService.on?.('branchB'",
  "EspService.on?.('branchB_ack'",
  'realFeedback.branchB',
  'BranchBService',
]) {
  if (dashboard.includes(legacy)) throw new Error(`Legacy ESP32 Branch-B frontend path remains: ${legacy}`);
}

for (const legacy of [
  'senergate/sys/request/branchB/status',
  'senergate/state/branchB/status',
  'senergate/state/branchB/ack',
  'senergate/config/branchB/compat_safety_bypass',
  'wallbox/relay/',
]) {
  if (espService.includes(legacy)) throw new Error(`Legacy ESP32 Branch-B backend path remains: ${legacy}`);
}

if (!wallboxService.includes("branch-b-shelly/status/#")) throw new Error('WallboxService must subscribe to direct Shelly Branch-B status.');
if (!wallboxService.includes("branch-b-shelly/command/switch:0")) throw new Error('WallboxService must request/control Shelly relay 0.');
if (!wallboxService.includes("branch-b-shelly/command/switch:1")) throw new Error('WallboxService must request/control Shelly relay 1.');

console.log('branchb_shelly_readiness_static_test: PASS');
