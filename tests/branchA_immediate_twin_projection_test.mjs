import {
  heatpumpCommandToTwinLevel,
} from '../client/src/HeatpumpStatusAdapter.js';
import {
  projectBuildingCurrents,
} from '../client/src/BuildingTwinModel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const level3 = heatpumpCommandToTwinLevel({ mode: 'start', level: 3, target_hz: 30 });
assert(level3 === 3, `start,30 must project twin level 3 immediately, got ${level3}`);
assert(projectBuildingCurrents({ heatpumpLevel: level3, wallboxMask: 0, batteryCharging: false }).a === 36,
  'Level 3 must immediately model 36 A on L1 in the 60 A building-equivalent model.');

const level5 = heatpumpCommandToTwinLevel({ mode: 'start', target_hz: 50 });
assert(level5 === 5, `start,50 must infer twin level 5, got ${level5}`);
assert(heatpumpCommandToTwinLevel({ mode: 'zero_hold', level: 0, target_hz: 0 }) === 0,
  'ZERO_HOLD must immediately model 0 A.');
assert(heatpumpCommandToTwinLevel({ mode: 'stop', level: 0, target_hz: 0 }) === 0,
  'STOP must immediately model 0 A.');

console.log('branchA_immediate_twin_projection_test: PASS');
