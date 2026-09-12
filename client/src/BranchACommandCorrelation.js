/*
 * Branch-A command/status correlation helpers.
 *
 * The ESP32 compatibility path generates cmd_id in the form
 * "compat-vfd-<received_ms>" and exposes it through ACK.cmd_id and
 * STATUS.last_cmd_id.  The frontend must not let an older periodic READY/STOP
 * status overwrite the trajectory of a newer operator command.
 */

const normalizeText = value => String(value ?? '').trim();
const normalizeUpper = value => normalizeText(value).toUpperCase();
const normalizeLower = value => normalizeText(value).toLowerCase();

export const BRANCHA_SAFETY_STATES = Object.freeze(['SAFE_MODE', 'FAULT', 'ERROR']);
export const BRANCHA_START_TRANSIENT_IDLE_STATES = Object.freeze(['READY', 'STOP', 'STOPPED']);

export const branchAStatusState = payload => normalizeUpper(
  payload?.state ?? payload?.drive_state ?? payload?.safety?.state
);

export const branchAStatusCmdId = payload => normalizeText(
  payload?.last_cmd_id ?? payload?.lastCmdId
);

export const branchAAckCmdId = payload => normalizeText(payload?.cmd_id ?? payload?.cmdId);
export const branchAAckStatus = payload => normalizeLower(payload?.ack_status ?? payload?.status);

export const isBranchASafetyState = state => BRANCHA_SAFETY_STATES.includes(normalizeUpper(state));

export const isAckStaleForCommand = (commanded, ackPayload) => {
  if (!commanded) return true;
  const ackCmdId = branchAAckCmdId(ackPayload);
  if (!ackCmdId) return true;

  const alreadyBound = normalizeText(commanded.ackCmdId);
  if (alreadyBound) return ackCmdId !== alreadyBound;

  const beforeStatusCmdId = normalizeText(commanded.preCommandLastCmdId);
  const beforeAckCmdId = normalizeText(commanded.preCommandAckId);
  return ackCmdId === beforeStatusCmdId || ackCmdId === beforeAckCmdId;
};

export const classifyBranchAAckForCommand = (commanded, ackPayload) => {
  if (!commanded) return { applies: false, accepted: false, reason: 'no_active_command', cmdId: '' };

  const cmdId = branchAAckCmdId(ackPayload);
  if (!cmdId) return { applies: false, accepted: false, reason: 'ack_without_cmd_id', cmdId: '' };
  if (isAckStaleForCommand(commanded, ackPayload)) {
    return { applies: false, accepted: false, reason: 'stale_or_unrelated_ack', cmdId };
  }

  const status = branchAAckStatus(ackPayload);
  return {
    applies: true,
    accepted: status === 'accepted',
    reason: status || 'unknown_ack_status',
    cmdId,
  };
};

export const classifyBranchAStatusForCommand = (commanded, statusPayload) => {
  const state = branchAStatusState(statusPayload);
  const statusCmdId = branchAStatusCmdId(statusPayload);

  // Safety is always authoritative, even when command correlation is missing.
  if (isBranchASafetyState(state)) {
    return { applies: true, safety: true, correlated: false, preserveTrajectory: false, reason: 'safety_state', state, statusCmdId };
  }

  if (!commanded) {
    return { applies: true, safety: false, correlated: false, preserveTrajectory: false, reason: 'no_active_command', state, statusCmdId };
  }

  const expectedCmdId = normalizeText(commanded.ackCmdId);
  if (!expectedCmdId) {
    return { applies: false, safety: false, correlated: false, preserveTrajectory: true, reason: 'awaiting_ack_correlation', state, statusCmdId };
  }

  if (!statusCmdId || statusCmdId !== expectedCmdId) {
    return { applies: false, safety: false, correlated: false, preserveTrajectory: true, reason: 'stale_or_unrelated_status', state, statusCmdId };
  }

  // ACK may update last_cmd_id before the Modbus start sequence has changed the
  // local state from READY/STOP to STARTING.  For a START command that transient
  // state is correlated but must not erase the command trajectory.
  if (
    normalizeLower(commanded.mode) === 'start' &&
    BRANCHA_START_TRANSIENT_IDLE_STATES.includes(state)
  ) {
    return { applies: false, safety: false, correlated: true, preserveTrajectory: true, reason: 'start_accepted_not_active_yet', state, statusCmdId };
  }

  return { applies: true, safety: false, correlated: true, preserveTrajectory: false, reason: 'correlated_status', state, statusCmdId };
};

export const shouldCompleteBranchACommand = (commanded, statusPayload, confirmedLevel) => {
  if (!commanded) return false;
  const state = branchAStatusState(statusPayload);
  const mode = normalizeLower(commanded.mode);

  if (isBranchASafetyState(state)) return true;
  if (mode === 'stop') return ['STOP', 'STOPPED', 'READY'].includes(state);
  if (mode === 'zero_hold') return state === 'ZERO_HOLD';
  if (mode === 'start') {
    const targetLevel = Number(commanded.level);
    const actualLevel = Number(confirmedLevel);
    return state === 'RUNNING' && Number.isFinite(targetLevel) && Number.isFinite(actualLevel) && actualLevel === targetLevel;
  }
  return false;
};

export default {
  branchAStatusState,
  branchAStatusCmdId,
  branchAAckCmdId,
  branchAAckStatus,
  isBranchASafetyState,
  classifyBranchAAckForCommand,
  classifyBranchAStatusForCommand,
  shouldCompleteBranchACommand,
};
