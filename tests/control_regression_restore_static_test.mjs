import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../client/src/BuildingTwinModel.js', import.meta.url), 'utf8');

if (!dashboard.includes('measurementFresh.value && branchAReady.value && _.electricalModel.calibration?.running !== true')) {
  throw new Error('General control gate must preserve measurementFresh && branchAReady and add only the explicit calibration lock.');
}
if (dashboard.includes("_.startup.phase === 'ready' && measurementFresh.value && branchAReady.value && branchBReady.value")) {
  throw new Error('Branch B/startup must not globally block all device controls.');
}
if (!dashboard.includes('if (_.wallbox.r0 !== targetR0) runtime.WallboxService.set(0, targetR0)')) {
  throw new Error('Wallbox command must preserve confirmed state and only command changed relay 0.');
}
if (!dashboard.includes('if (_.wallbox.r1 !== targetR1) runtime.WallboxService.set(1, targetR1)')) {
  throw new Error('Wallbox command must preserve confirmed state and only command changed relay 1.');
}
if (!model.includes('baseCurrentA: Object.freeze({ a: 0, b: 0, c: 0 })')) {
  throw new Error('Artificial non-zero building base current must be removed.');
}
if (!model.includes('baseCurrentA: Object.freeze({ a: 0, b: 0, c: 0 })') || !model.includes('projectBuildingCurrents')) {
  throw new Error('OFF state must be represented by zero-base equivalent-device projection.');
}

console.log('control_regression_restore_static_test: PASS');
