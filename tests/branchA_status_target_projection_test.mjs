import { deriveHeatpumpStatus } from '../client/src/HeatpumpStatusAdapter.js';
import { projectBuildingCurrents } from '../client/src/BuildingTwinModel.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Regression from the real dashboard: start,50 was accepted, but the ESP32
// status could still report STARTING + LFRD/RFRD=0. The Digital Twin must show
// the active command trajectory without pretending physical execution finished.
const startingFromCommand = deriveHeatpumpStatus({
  state: 'STARTING',
  target_frequency_hz: 0,
  actual_output_frequency_hz: 0,
  lfrd_reg8602: 0,
  rfrd_reg8604: 0,
}, { mode: 'start', level: 5, target_hz: 50 });

assert(startingFromCommand.mode === 'start', 'STARTING must retain start mode.');
assert(startingFromCommand.confirmedLevel === 0,
  `STARTING actual=0 must not be treated as physically executed level 5, got ${JSON.stringify(startingFromCommand)}`);
assert(startingFromCommand.twinLevel === 5,
  `STARTING with active start,50 must project twin level 5, got ${JSON.stringify(startingFromCommand)}`);
assert(startingFromCommand.effectiveTargetHz === 50, 'Pi5 command fallback must expose effective target 50 Hz.');
assert(startingFromCommand.effectiveTargetSource === 'pi5_command', 'Fallback source must be explicit.');

const currents = projectBuildingCurrents({
  heatpumpLevel: startingFromCommand.twinLevel,
  wallboxMask: 3,
  batteryCharging: true,
});
assert(currents.a === 60 && currents.b === 64 && currents.c === 40,
  `start,50 + wallbox mask3 + battery must project 60/64/40 A, got ${JSON.stringify(currents)}`);

// Once actual/RFRD reaches the drive speed, execution confirmation catches up.
const runningActual = deriveHeatpumpStatus({
  state: 'RUNNING',
  target_frequency_hz: 0,
  actual_output_frequency_hz: 50,
  lfrd_reg8602: 0,
  rfrd_reg8604: 500,
}, { mode: 'start', level: 5, target_hz: 50 });
assert(runningActual.confirmedLevel === 5, 'RUNNING actual 50 Hz must confirm level 5.');
assert(runningActual.twinLevel === 5, 'RUNNING actual 50 Hz must project level 5.');

// P03 invariant: actual feedback has priority for execution confirmation.
const runningLagging = deriveHeatpumpStatus({
  state: 'RUNNING',
  target_frequency_hz: 50,
  actual_output_frequency_hz: 30,
});
assert(runningLagging.confirmedLevel === 3, 'RUNNING execution confirmation must follow actual 30 Hz.');
assert(runningLagging.twinLevel === 3, 'RUNNING Building Twin should follow actual frequency once it is >2 Hz.');

const stoppedWithStaleFeedback = deriveHeatpumpStatus({
  state: 'STOP',
  target_frequency_hz: 50,
  actual_output_frequency_hz: 50,
}, { mode: 'start', level: 5, target_hz: 50 });
assert(stoppedWithStaleFeedback.confirmedLevel === 0 && stoppedWithStaleFeedback.twinLevel === 0,
  'STOP must override stale target/actual/command feedback.');
assert(stoppedWithStaleFeedback.mode === 'stop', 'STOP must remain distinct from ZERO_HOLD.');

const zeroHold = deriveHeatpumpStatus({
  state: 'ZERO_HOLD',
  target_frequency_hz: 0,
  actual_output_frequency_hz: 20,
});
assert(zeroHold.confirmedLevel === 0 && zeroHold.twinLevel === 0,
  'ZERO_HOLD must project zero even while RFRD is still ramping down.');
assert(zeroHold.mode === 'zero_hold', 'ZERO_HOLD mode must not collapse to STOP.');

console.log('branchA_status_target_projection_test: PASS');
