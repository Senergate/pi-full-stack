import fs from 'node:fs';

const model = fs.readFileSync(new URL('../client/src/BuildingTwinModel.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');

if (/projectionGain/.test(model) || /CURRENT_PROJECTION_FACTOR/.test(dashboard)) {
  throw new Error('Legacy measured-current projection gains must be removed.');
}
if (!model.includes('heatpumpAggregateMaxCurrentA: 40')) throw new Error('Equivalent heat-pump aggregate current missing.');
if (!model.includes('branchAEquivalentHeatpumps: 2')) throw new Error('Branch-A 2-module mapping missing.');
if (!model.includes('batteryChargeCurrentA: 40')) throw new Error('40 A battery equivalent missing.');
if (!model.includes('branchBEquivalentWallboxesPerRelay: 2')) throw new Error('Branch-B equivalent-device mapping missing.');
if (!dashboard.includes('max: 100')) throw new Error('Building-Twin current chart must use 0–100 A range.');
if (!dashboard.includes("preset: 'demo'")) throw new Error('Demo feeder must be the default modeled feeder.');
if (!dashboard.includes("rPhase: 0.40") || !dashboard.includes("rNeutral: 0.30")) throw new Error('Demo feeder impedance parameters missing.');
if (!dashboard.includes('const controlReady = computed(() => measurementFresh.value && branchAReady.value)')) {
  throw new Error('Control regression guard was lost.');
}
if (!dashboard.includes('projectBuildingCurrents({')) throw new Error('Dashboard and predictor must use shared equivalent-device model.');

console.log('equivalent_device_no_gain_static_test: PASS');
