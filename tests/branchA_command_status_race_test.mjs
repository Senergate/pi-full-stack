import {
  classifyBranchAAckForCommand,
  classifyBranchAStatusForCommand,
  shouldCompleteBranchACommand,
} from '../client/src/BranchACommandCorrelation.js';
import {
  deriveHeatpumpStatus,
  heatpumpCommandToTwinLevel,
} from '../client/src/HeatpumpStatusAdapter.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const command = {
  mode: 'start',
  level: 4,
  target_hz: 40,
  generation: 7,
  ackCmdId: null,
  ackStatus: 'awaiting_ack',
  preCommandLastCmdId: 'compat-vfd-1000',
  preCommandAckId: 'compat-vfd-1000',
};

assert(heatpumpCommandToTwinLevel(command) === 4, 'First click start,40 must immediately project twin level 4.');

// Old periodic READY arrives before the ACK for the new command.
let statusClass = classifyBranchAStatusForCommand(command, {
  state: 'READY',
  last_cmd_id: 'compat-vfd-1000',
  target_frequency_hz: 0,
  actual_output_frequency_hz: 0,
});
assert(statusClass.applies === false && statusClass.preserveTrajectory === true,
  'Old READY before ACK must not erase the new command trajectory.');

// A retained/old ACK from the previous command must not bind to the new one.
let ackClass = classifyBranchAAckForCommand(command, {
  cmd_id: 'compat-vfd-1000',
  ack_status: 'accepted',
});
assert(ackClass.applies === false, 'Previous ACK must be ignored for the new command.');

// New ACK binds the ESP-generated compatibility cmd_id.
ackClass = classifyBranchAAckForCommand(command, {
  cmd_id: 'compat-vfd-2000',
  ack_status: 'accepted',
});
assert(ackClass.applies && ackClass.accepted && ackClass.cmdId === 'compat-vfd-2000',
  'New accepted ACK must bind its cmd_id.');
command.ackCmdId = ackClass.cmdId;
command.ackStatus = 'accepted';

// last_cmd_id may already be current while local state is still READY.  For a
// START command that transient state must still preserve the trajectory.
statusClass = classifyBranchAStatusForCommand(command, {
  state: 'READY',
  last_cmd_id: 'compat-vfd-2000',
});
assert(statusClass.applies === false && statusClass.correlated === true,
  'Correlated transient READY after START ACK must not reset twin level.');

// Correlated STARTING is authoritative and uses the command target while RFRD is 0.
const startingPayload = {
  state: 'STARTING',
  last_cmd_id: 'compat-vfd-2000',
  target_frequency_hz: 0,
  actual_output_frequency_hz: 0,
  lfrd_reg8602: 0,
  rfrd_reg8604: 0,
};
statusClass = classifyBranchAStatusForCommand(command, startingPayload);
assert(statusClass.applies === true && statusClass.correlated === true,
  'Current STARTING status must apply.');
const starting = deriveHeatpumpStatus(startingPayload, command);
assert(starting.twinLevel === 4 && starting.confirmedLevel === 0,
  `STARTING must preserve modeled level 4 without faking execution: ${JSON.stringify(starting)}`);
assert(!shouldCompleteBranchACommand(command, startingPayload, starting.confirmedLevel),
  'STARTING must not complete the command.');

// A live RUNNING update may still report the old actual level.  Execution truth
// may update, but the Building-Twin command trajectory must remain at level 4
// until the physical target is confirmed.
const laggingRunningPayload = {
  state: 'RUNNING',
  last_cmd_id: 'compat-vfd-2000',
  target_frequency_hz: 40,
  actual_output_frequency_hz: 20,
};
statusClass = classifyBranchAStatusForCommand(command, laggingRunningPayload);
assert(statusClass.applies === true, 'Correlated lagging RUNNING status must be accepted as execution truth.');
const laggingRunning = deriveHeatpumpStatus(laggingRunningPayload, command);
assert(laggingRunning.confirmedLevel === 2, 'RFRD=20 Hz must remain execution truth level 2.');
assert(!shouldCompleteBranchACommand(command, laggingRunningPayload, laggingRunning.confirmedLevel),
  'Lagging actual frequency must not complete level 4 command.');
assert(heatpumpCommandToTwinLevel(command) === 4,
  'Pending command trajectory must remain level 4 while actual feedback catches up.');

// RUNNING at 40 Hz physically confirms the target and completes lifecycle.
const runningPayload = {
  state: 'RUNNING',
  last_cmd_id: 'compat-vfd-2000',
  target_frequency_hz: 40,
  actual_output_frequency_hz: 40,
};
statusClass = classifyBranchAStatusForCommand(command, runningPayload);
assert(statusClass.applies === true, 'Current RUNNING status must apply.');
const running = deriveHeatpumpStatus(runningPayload, command);
assert(running.confirmedLevel === 4 && running.twinLevel === 4,
  'RUNNING 40 Hz must confirm level 4.');
assert(shouldCompleteBranchACommand(command, runningPayload, running.confirmedLevel),
  'RUNNING at target must complete the active command.');

// Safety is always authoritative even if last_cmd_id does not match.
statusClass = classifyBranchAStatusForCommand(command, {
  state: 'FAULT',
  last_cmd_id: 'some-other-id',
});
assert(statusClass.applies === true && statusClass.safety === true,
  'FAULT must never be filtered by command correlation.');

console.log('branchA_command_status_race_test: PASS');
