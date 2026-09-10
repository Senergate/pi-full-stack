import {
  BUILDING_TWIN_CONFIG,
  projectBuildingCurrents,
  wallboxProjectedCurrentA,
} from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps === 3, 'Branch A must represent 3 heat pumps.');
assert(BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay === 2, 'Each Branch-B relay must represent 2 wallboxes.');

const idle = projectBuildingCurrents({ heatpumpLevel: 0, wallboxMask: 0, batteryCharging: false });
assert(idle.a === 240 && idle.b === 100 && idle.c === 100, `Unexpected building base ${JSON.stringify(idle)}`);

const hpFull = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 0, batteryCharging: false });
assert(hpFull.a === 275 && hpFull.b === 100 && hpFull.c === 100,
  `Branch-A full demo must be 275/100/100 A, got ${JSON.stringify(hpFull)}`);

assert(wallboxProjectedCurrentA(1) === 32, 'One relay must represent 2 x 16 A = 32 A.');
assert(wallboxProjectedCurrentA(3) === 64, 'Two relays must represent 4 x 16 A = 64 A.');

const fourWallboxes = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 3, batteryCharging: false });
assert(fourWallboxes.b === 164, `Both Branch-B relays must move L2 to 164 A, got ${fourWallboxes.b}`);

console.log('building_twin_model_test: PASS');
