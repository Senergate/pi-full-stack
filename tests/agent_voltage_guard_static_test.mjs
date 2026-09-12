import fs from 'node:fs';
const agent = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
if (!agent.includes('if (!result.voltageSafe)')) throw new Error('AI must reject voltage-unsafe candidates.');
if (!agent.includes('207–253 V')) throw new Error('AI voltage guard range must be visible/documented.');
if (!agent.includes('results.sort((a, b) => a.vuf - b.vuf)')) throw new Error('VUF must remain the primary candidate optimization KPI.');
if (!dash.includes("voltageLimits: { min: 207, max: 253 }")) throw new Error('Predictor voltage limits missing.');
console.log('agent_voltage_guard_static_test: PASS');
