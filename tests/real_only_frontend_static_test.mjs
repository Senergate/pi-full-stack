import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '..', 'client', 'src');
const app = fs.readFileSync(path.join(src, 'App.js'), 'utf8');
const appVue = fs.readFileSync(path.join(src, 'App.vue'), 'utf8');
const dashboard = fs.readFileSync(path.join(src, 'components', 'SimpleDashboard.vue'), 'utf8');

for (const [name, text] of [['App.js', app], ['App.vue', appVue], ['SimpleDashboard.vue', dashboard]]) {
  if (/SimulationRuntime|App\._\.mode|setMode\(|setRuntimeMode|setSimulationScenario|AI TEST > 2%|LOCAL ONLY · NO MQTT ACTUATION/.test(text)) {
    throw new Error(`${name} still contains active Simulation/runtime-switch code.`);
  }
}

if (!app.includes("const SOCKET_URL = 'http://10.20.0.200:4000'")) {
  throw new Error('Real-hardware Socket.IO URL must be explicit.');
}
if (!appVue.includes('<SimpleDashboard />')) {
  throw new Error('Dashboard must be rendered directly in real-only mode.');
}
if (!dashboard.includes('REAL HARDWARE')) {
  throw new Error('Dashboard must explicitly identify REAL HARDWARE.');
}
if (dashboard.includes('CURRENT_PROJECTION_FACTOR')) {
  throw new Error('Legacy per-phase 800/400/230 projection must not exist.');
}

console.log('real_only_frontend_static_test: PASS');
