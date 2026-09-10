import fs from 'node:fs';
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const esp = fs.readFileSync(new URL('../server/EspService.js', import.meta.url), 'utf8');
const wallbox = fs.readFileSync(new URL('../server/WallboxService.js', import.meta.url), 'utf8');

if (!dashboard.includes('_.wallbox.r0Update') || !dashboard.includes('_.wallbox.r1Update')) throw new Error('Branch-B readiness must use relay timestamps.');
if (dashboard.includes('realFeedback.branchB') || dashboard.includes("EspService.on?.('branchB'")) throw new Error('Legacy ESP32-B frontend path remains.');
if (/senergate\/state\/branchB|senergate\/sys\/request\/branchB|wallbox\/relay\//.test(esp)) throw new Error('Legacy ESP32-B backend path remains.');
if (!wallbox.includes('branch-b-shelly/status/#')) throw new Error('WallboxService must use Shelly status path.');
console.log('branchb_shelly_readiness_static_test: PASS');
