import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

for (const required of [
  'classifyBranchAAckForCommand',
  'classifyBranchAStatusForCommand',
  'shouldCompleteBranchACommand',
  'preCommandLastCmdId',
  'preCommandAckId',
  'ackCmdId: null',
]) {
  if (!text.includes(required)) throw new Error(`Missing Branch-A correlation element: ${required}`);
}
if (text.includes("['STOP', 'STOPPED', 'READY', 'SAFE_MODE', 'FAULT', 'ERROR', 'ZERO_HOLD'].includes(interpreted.state)")) {
  throw new Error('Old unconditional terminal-state command clearing must be removed.');
}
console.log('branchA_correlation_static_test: PASS');
