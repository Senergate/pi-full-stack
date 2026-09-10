import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
if (!text.includes('heatpump: 12000')) throw new Error('Heatpump confirmation timeout must be 12 s.');
if (!text.includes('wallbox: 3000')) throw new Error('Wallbox confirmation timeout must be 3 s.');
if (!text.includes('batteryCharging: 3000')) throw new Error('Battery confirmation timeout must be 3 s.');
if (!text.includes('expirePendingCommands()')) throw new Error('Pending timeout evaluator missing.');
if (!text.includes('execution was NOT assumed successful')) throw new Error('Timeout must not imply execution success.');
console.log('pending_timeout_per_device_static_test: PASS');
