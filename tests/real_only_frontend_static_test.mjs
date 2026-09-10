import fs from 'node:fs';
const app = fs.readFileSync(new URL('../client/src/App.js', import.meta.url), 'utf8');
const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
if (/SimulationRuntime|setRuntimeMode|isSimulation|SIMULATION/.test(dash)) throw new Error('Simulation UI/runtime code must be removed.');
if (!app.includes("const SOCKET_URL = 'http://10.20.0.200:4000'")) throw new Error('Real Socket.IO URL missing.');
if (!dash.includes('REAL HARDWARE')) throw new Error('REAL HARDWARE label missing.');
console.log('real_only_frontend_static_test: PASS');
