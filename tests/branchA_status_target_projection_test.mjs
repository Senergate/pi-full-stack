import { deriveHeatpumpStatus } from '../client/src/HeatpumpStatusAdapter.js';
import { projectBuildingCurrents } from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const starting = deriveHeatpumpStatus({
  state: 'STARTING',
  lfrd_reg8602: 400,
  rfrd_reg8604: 0,
  target_frequency_hz: 40,
  actual_output_frequency_hz: 0,
});
assert(starting.modelLevel === 4, `STARTING target 40 / actual 0 must be level 4: ${JSON.stringify(starting)}`);
assert(starting.targetHz === 40 && starting.actualHz === 0, 'Target and actual frequency must remain separate.');

const currents = projectBuildingCurrents({ heatpumpLevel: starting.modelLevel, wallboxMask: 3, batteryCharging: false });
assert(currents.a === 28 && currents.b === 64 && currents.c === 0, `Expected 28/64/0 A, got ${JSON.stringify(currents)}`);

const stopped = deriveHeatpumpStatus({ state: 'STOP', target_frequency_hz: 40, actual_output_frequency_hz: 40 });
assert(stopped.modelLevel === 0, 'STOP must override stale frequency feedback.');

const zeroHold = deriveHeatpumpStatus({ state: 'ZERO_HOLD', target_frequency_hz: 0, actual_output_frequency_hz: 20 });
assert(zeroHold.modelLevel === 0, 'ZERO_HOLD must project 0 A even while actual frequency ramps down.');

console.log('branchA_status_target_projection_test: PASS');
