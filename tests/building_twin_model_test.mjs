import {
  BUILDING_TWIN_CONFIG,
  projectBuildingCurrents,
  heatpumpProjectedCurrentA,
  wallboxProjectedCurrentA,
} from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps === 3, 'Branch A must represent 3 heat pumps.');
assert(BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay === 2, 'Each Branch-B relay must represent 2 wallboxes.');
assert(JSON.stringify(BUILDING_TWIN_CONFIG.baseCurrentA) === JSON.stringify({ a: 0, b: 0, c: 0 }), 'Artificial base current must be zero.');
assert(!('projectionGain' in BUILDING_TWIN_CONFIG), 'Per-phase 800/400/230 projection gain must not exist.');

const idle = projectBuildingCurrents({ heatpumpLevel: 0, wallboxMask: 0, batteryCharging: false });
assert(idle.a === 0 && idle.b === 0 && idle.c === 0, `All devices OFF must project 0/0/0 A, got ${JSON.stringify(idle)}`);

const hpOn = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 0, batteryCharging: false });
assert(hpOn.a === 35 && hpOn.b === 0 && hpOn.c === 0, `Branch-A full load must be 35/0/0 A, got ${JSON.stringify(hpOn)}`);
assert(heatpumpProjectedCurrentA(5) === 35, 'Heatpump level 5 must map to the aggregate 35 A device-model current.');

const relay0 = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 1, batteryCharging: false });
assert(relay0.b === 32, `One Branch-B relay must represent two 16 A wallboxes, got ${JSON.stringify(relay0)}`);
assert(wallboxProjectedCurrentA(3) === 64, 'Both Branch-B relays must represent four 16 A wallboxes = 64 A.');

const unknown = projectBuildingCurrents({ heatpumpLevel: null, wallboxMask: 0, batteryCharging: false });
assert(unknown.a === null && unknown.b === null && unknown.c === null, 'Unknown actuator state must keep projected current unavailable.');

console.log('building_twin_model_test: PASS');
