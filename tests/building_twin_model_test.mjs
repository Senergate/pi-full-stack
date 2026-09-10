import {
  BUILDING_TWIN_CONFIG,
  projectBuildingCurrents,
  heatpumpProjectedCurrentA,
  wallboxProjectedCurrentA,
} from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps === 3, 'Branch A must represent 3 heat pumps.');
assert(BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay === 2, 'Each Branch-B relay must represent 2 wallboxes.');
assert(JSON.stringify(BUILDING_TWIN_CONFIG.baseCurrentA) === JSON.stringify({ a: 0, b: 0, c: 0 }), 'OFF base current must be 0/0/0 A.');
assert(!('projectionGain' in BUILDING_TWIN_CONFIG), 'Legacy 800/400/230 gains must not exist.');

const idle = projectBuildingCurrents({ heatpumpLevel: 0, wallboxMask: 0, batteryCharging: false });
assert(idle.a === 0 && idle.b === 0 && idle.c === 0, `OFF must be 0/0/0 A, got ${JSON.stringify(idle)}`);

assert(heatpumpProjectedCurrentA(3) === 21, 'Heatpump level 3 must map to 21 A.');
assert(heatpumpProjectedCurrentA(4) === 28, 'Heatpump level 4 must map to 28 A.');
assert(heatpumpProjectedCurrentA(5) === 35, 'Heatpump level 5 must map to 35 A.');
assert(wallboxProjectedCurrentA(1) === 32, 'One relay must represent 2 wallboxes = 32 A.');
assert(wallboxProjectedCurrentA(3) === 64, 'Two relays must represent 4 wallboxes = 64 A.');

const active = projectBuildingCurrents({ heatpumpLevel: 4, wallboxMask: 3, batteryCharging: false });
assert(active.a === 28 && active.b === 64 && active.c === 0, `Expected 28/64/0 A, got ${JSON.stringify(active)}`);

console.log('building_twin_model_test: PASS');
