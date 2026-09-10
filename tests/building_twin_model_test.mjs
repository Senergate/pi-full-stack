import {
  BUILDING_TWIN_CONFIG,
  projectBuildingCurrents,
  wallboxProjectedCurrentA,
} from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps === 3, 'Branch A must represent 3 heat pumps.');
assert(BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay === 2, 'Each Branch-B relay must represent 2 wallboxes.');

const hpFull = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 0, batteryCharging: false });
assert(hpFull.a === 200 && hpFull.b === 0 && hpFull.c === 0,
  `HP full-load demo must be 200/0/0 A from an all-zero startup, got ${JSON.stringify(hpFull)}`);

assert(wallboxProjectedCurrentA(1) === 40, 'One relay must represent 2 x 20 A = 40 A wallbox current.');
assert(wallboxProjectedCurrentA(3) === 80, 'Two relays must represent 4 x 20 A = 80 A wallbox current.');

const twoWallboxes = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 1, batteryCharging: false });
const fourWallboxes = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 3, batteryCharging: false });
assert(twoWallboxes.b === 40, 'One relay must move L2 from 0 A to 40 A.');
assert(fourWallboxes.b === 80, 'Two relays must move L2 from 0 A to 80 A.');

console.log('building_twin_model_test: PASS');
