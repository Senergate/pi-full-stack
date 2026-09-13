import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');

if (text.includes('COMMAND_PENDING_TIMEOUT_MS')) {
  throw new Error('Fixed short command timeout must not be used for Branch-A VFD execution.');
}
if (text.includes('expirePendingCommands')) {
  throw new Error('Old fixed pending-expiration path must be removed.');
}
if (!text.includes('pendingHeatpumpMode')) {
  throw new Error('Pending Heatpump confirmation must track STOP/ZERO_HOLD/START mode.');
}
if (!text.includes('modeMatches')) {
  throw new Error('Pending Heatpump must require mode + level confirmation.');
}
if (!text.includes("emit('heatpump-stop')")) {
  throw new Error('Manual STOP must remain an explicit Branch-A action.');
}
console.log('pending_timeout_static_test: PASS');
