import { deriveHeatpumpStatus } from '../client/src/HeatpumpStatusAdapter.js';
import { projectBuildingCurrents } from '../client/src/BuildingTwinModel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const starting = deriveHeatpumpStatus({
  state: 'STARTING',
  target_frequency_hz: 40,
  actual_output_frequency_hz: 0,
  lfrd_reg8602: 400,
  rfrd_reg8604: 0,
});

assert(starting.modelLevel === 4,
  `STARTING target=40/actual=0 must map to model level 4, got ${JSON.stringify(starting)}`);
assert(starting.targetHz === 40, 'target frequency must remain 40 Hz.');
assert(starting.actualHz === 0, 'actual frequency must remain available separately as 0 Hz.');

const currents = projectBuildingCurrents({
  heatpumpLevel: starting.modelLevel,
  wallboxMask: 1,
  batteryCharging: true,
});
assert(currents.a === 28 && currents.b === 32 && currents.c === 20,
  `Level 4 + R0 + battery must project 28/32/20 A, got ${JSON.stringify(currents)}`);

const running = deriveHeatpumpStatus({
  state: 'RUNNING',
  target_frequency_hz: 40,
  actual_output_frequency_hz: 30,
});
assert(running.modelLevel === 4,
  'RUNNING Building-Twin model must follow confirmed 40 Hz target, not delayed 30 Hz actual feedback.');

const stoppedWithStaleFeedback = deriveHeatpumpStatus({
  state: 'STOP',
  target_frequency_hz: 40,
  actual_output_frequency_hz: 40,
});
assert(stoppedWithStaleFeedback.modelLevel === 0,
  'STOP state must override stale target/actual frequency and project zero heatpump current.');

const zeroHold = deriveHeatpumpStatus({
  state: 'ZERO_HOLD',
  target_frequency_hz: 0,
  actual_output_frequency_hz: 20,
});
assert(zeroHold.modelLevel === 0,
  'ZERO_HOLD must project level 0 even while actual frequency is still ramping down.');

const actualFallback = deriveHeatpumpStatus({
  state: 'RUNNING',
  actual_output_frequency_hz: 30,
});
assert(actualFallback.modelLevel === 3,
  'Actual frequency may be used only when target/LFRD information is unavailable.');

console.log('branchA_status_target_projection_test: PASS');
