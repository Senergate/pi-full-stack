import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
if (!text.includes('COMMAND_PENDING_TIMEOUT_MS = 3000')) throw new Error('3 s command pending timeout missing.');
if (!text.includes('expirePendingCommands()')) throw new Error('Pending expiration is not evaluated.');
if (!text.includes('execution was NOT assumed successful')) throw new Error('Timeout must not be treated as execution success.');
console.log('pending_timeout_static_test: PASS');
