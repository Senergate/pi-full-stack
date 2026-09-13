import fs from 'node:fs';
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const adapter = fs.readFileSync(new URL('../client/src/HeatpumpStatusAdapter.js', import.meta.url), 'utf8');

if (!dashboard.includes("deriveHeatpumpStatus, heatpumpCommandToTwinLevel") || !dashboard.includes("from '../HeatpumpStatusAdapter.js'")) {
  throw new Error('SimpleDashboard must use HeatpumpStatusAdapter.');
}
if (!dashboard.includes('const commanded = _.heatpump.commanded;') || !dashboard.includes('const interpreted = deriveHeatpumpStatus(payload, commanded);')) {
  throw new Error('Branch-A status handler must pass the active Pi5 command into the state-aware adapter.');
}
if (!dashboard.includes('_.heatpump.twinLevel = interpreted.twinLevel')) {
  throw new Error('Building Twin must receive the state-aware twin level.');
}
if (!dashboard.includes('_.heatpump.level = interpreted.confirmedLevel')) {
  throw new Error('Execution state must remain separate from Building-Twin projection.');
}
if (!adapter.includes("state === 'STARTING'")) {
  throw new Error('Adapter must handle STARTING explicitly.');
}
if (!adapter.includes("state === 'RUNNING'")) {
  throw new Error('Adapter must handle RUNNING explicitly.');
}
if (!adapter.includes("effectiveTargetSource = 'pi5_command'")) {
  throw new Error('STARTING must support Pi5 command fallback when LFRD/RFRD still read zero.');
}
console.log('branchA_status_adapter_static_test: PASS');
