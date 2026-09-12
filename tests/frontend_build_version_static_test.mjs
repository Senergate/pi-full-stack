import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
if (!text.includes("v1.5.2-branchAB-vuf23")) throw new Error('Expected visible v1.5.2 Branch-A/B VUF build version.');
if (!text.includes('heatpumpCommandToTwinLevel(command)')) throw new Error('Heatpump command must update Building-Twin trajectory immediately.');
if (!text.includes('_.heatpump.twinLevel = twinLevel')) throw new Error('Immediate twinLevel update missing.');
if (!text.includes('Building-Twin command projection rolled back')) throw new Error('RPC rejection/failure rollback missing.');
console.log('frontend_build_version_static_test: PASS');
