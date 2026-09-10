import {
  BUILDING_TWIN_CONFIG,
  projectBuildingCurrents,
  wallboxProjectedCurrentA,
} from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps === 3, 'Branch A must represent 3 heat pumps.');
assert(BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay === 2, 'Each Branch-B relay must represent 2 wallboxes.');

const hpFull = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 0, batteryCharging: false });
assert(hpFull.a === 295 && hpFull.b === 100 && hpFull.c === 100,
  `HP full-load demo must be 295/100/100 A, got ${JSON.stringify(hpFull)}`);

assert(wallboxProjectedCurrentA(1) === 32, 'One relay must represent 2 x 16 A = 32 A wallbox current.');
assert(wallboxProjectedCurrentA(3) === 64, 'Two relays must represent 4 x 16 A = 64 A wallbox current.');

const twoWallboxes = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 1, batteryCharging: false });
const fourWallboxes = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 3, batteryCharging: false });
assert(twoWallboxes.b === 132, 'One relay must move L2 to 132 A.');
assert(fourWallboxes.b === 164, 'Two relays must move L2 to 164 A.');

console.log('building_twin_model_test: PASS');
