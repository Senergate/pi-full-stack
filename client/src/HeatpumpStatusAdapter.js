/*
 * Branch-A status adapter for the REAL-HARDWARE dashboard.
 *
 * Design rules (P03-compatible, state-aware):
 *   1) STOP / READY / SAFE_MODE / FAULT always override stale frequency feedback.
 *   2) ZERO_HOLD is distinct from STOP.
 *   3) During STARTING, the Building Twin may use the active Pi5 command as the
 *      effective target when LFRD/RFRD are still 0. This is a command-state
 *      projection, not physical execution confirmation.
 *   4) During RUNNING, execution level follows actual/RFRD first and only falls
 *      back to target/effective target if actual feedback is unavailable.
 *   5) Confirmation level and Building-Twin level are intentionally separate:
 *      a pending command must not be marked EXECUTED only because the command
 *      target is known.
 */

const HEATPUMP_LEVELS = 5;
const ZERO_HOLD_THRESHOLD_HZ = 2;

const finiteNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const n = finiteNumber(value);
    if (n !== null) return n;
  }
  return null;
};

const clampInt = (value, min, max) => {
  const n = finiteNumber(value);
  return n === null ? null : Math.max(min, Math.min(max, Math.round(n)));
};

export const frequencyHzToHeatpumpLevel = hz => {
  const n = finiteNumber(hz);
  if (n === null) return null;
  if (n <= ZERO_HOLD_THRESHOLD_HZ) return 0;
  return Math.max(1, Math.min(HEATPUMP_LEVELS, Math.round(n / 10)));
};

const commandTargetHz = commanded => {
  if (!commanded || String(commanded.mode ?? '').toLowerCase() !== 'start') return null;
  return firstNumber(commanded.target_hz, commanded.targetHz);
};

const commandLevel = commanded => {
  if (!commanded || String(commanded.mode ?? '').toLowerCase() !== 'start') return null;
  const explicit = clampInt(commanded.level, 1, HEATPUMP_LEVELS);
  if (explicit !== null) return explicit;
  return frequencyHzToHeatpumpLevel(commandTargetHz(commanded));
};

export const heatpumpCommandToTwinLevel = commanded => {
  if (!commanded) return null;
  const mode = String(commanded.mode ?? '').toLowerCase();
  if (mode === 'stop' || mode === 'zero_hold') return 0;
  if (mode !== 'start') return null;
  return commandLevel(commanded);
};

const normalizeModeFromState = state => {
  if (['STOP', 'STOPPED', 'READY', 'SAFE_MODE', 'FAULT', 'ERROR'].includes(state)) return 'stop';
  if (['ZERO_HOLD', 'RAMPING_TO_ZERO_HOLD'].includes(state)) return 'zero_hold';
  if (['STARTING', 'RUNNING'].includes(state)) return 'start';
  return null;
};

export const deriveHeatpumpStatus = (payload, commanded = null) => {
  const state = String(
    payload?.state ?? payload?.drive_state ?? payload?.safety?.state ?? ''
  ).toUpperCase();

  const explicitLevel = firstNumber(
    payload?.heatpump_level,
    payload?.level,
    payload?.vfd?.heatpump_level
  );

  const targetHzDirect = firstNumber(
    payload?.target_frequency_hz,
    payload?.target_hz,
    payload?.frequency_hz,
    payload?.vfd?.target_frequency_hz,
    payload?.vfd?.target_hz
  );

  const rawLfrd = firstNumber(
    payload?.lfrd_reg8602,
    payload?.lfrd,
    payload?.vfd?.lfrd_reg8602
  );

  const targetHz = targetHzDirect ?? (rawLfrd === null ? null : rawLfrd / 10);

  const actualHzDirect = firstNumber(
    payload?.actual_output_frequency_hz,
    payload?.actual_hz,
    payload?.vfd?.actual_output_frequency_hz,
    payload?.vfd?.actual_hz
  );

  const rawRfrd = firstNumber(
    payload?.rfrd_reg8604,
    payload?.rfrd,
    payload?.vfd?.rfrd_reg8604
  );

  const actualHz = actualHzDirect ?? (rawRfrd === null ? null : rawRfrd / 10);

  // Optional future firmware field. Until it exists, the active Pi5 command is
  // used only as a STARTING/RUNNING command-state fallback for the Digital Twin.
  const firmwareEffectiveTargetHz = firstNumber(
    payload?.effective_target_hz,
    payload?.effectiveTargetHz,
    payload?.vfd?.effective_target_hz
  );

  const commandedHz = commandTargetHz(commanded);
  const commandedLevel = commandLevel(commanded);
  const mode = normalizeModeFromState(state);

  // Local/safety state has absolute priority over stale LFRD/RFRD feedback.
  if (mode === 'stop') {
    return {
      state,
      mode,
      confirmedLevel: 0,
      twinLevel: 0,
      targetHz,
      actualHz,
      effectiveTargetHz: 0,
      effectiveTargetSource: 'local_state',
    };
  }

  if (mode === 'zero_hold') {
    return {
      state,
      mode,
      confirmedLevel: 0,
      twinLevel: 0,
      targetHz,
      actualHz,
      effectiveTargetHz: 0,
      effectiveTargetSource: 'local_state',
    };
  }

  const explicitLevelClamped = explicitLevel === null
    ? null
    : clampInt(explicitLevel, 0, HEATPUMP_LEVELS);

  const actualLevel = frequencyHzToHeatpumpLevel(actualHz);
  const targetLevel = frequencyHzToHeatpumpLevel(targetHz);

  // Effective target for the model: firmware field > LFRD target (>2 Hz) >
  // currently issued Pi5 start command. A zero LFRD value during STARTING must
  // not erase a known start,50 command.
  let effectiveTargetHz = firmwareEffectiveTargetHz;
  let effectiveTargetSource = firmwareEffectiveTargetHz !== null ? 'firmware' : null;

  if (effectiveTargetHz === null && targetHz !== null && targetHz > ZERO_HOLD_THRESHOLD_HZ) {
    effectiveTargetHz = targetHz;
    effectiveTargetSource = 'lfrd';
  }

  if (
    effectiveTargetHz === null &&
    ['STARTING', 'RUNNING'].includes(state) &&
    commandedHz !== null &&
    commandedHz > ZERO_HOLD_THRESHOLD_HZ
  ) {
    effectiveTargetHz = commandedHz;
    effectiveTargetSource = 'pi5_command';
  }

  const effectiveLevel = frequencyHzToHeatpumpLevel(effectiveTargetHz);

  // Execution confirmation deliberately mirrors the stable P03 behaviour:
  // actual/RFRD is authoritative when it exists. This prevents a command target
  // from being mistaken for completed physical execution.
  let confirmedLevel = explicitLevelClamped;
  if (confirmedLevel === null) {
    if (actualHz !== null) confirmedLevel = actualLevel;
    else if (targetHz !== null) confirmedLevel = targetLevel;
    else confirmedLevel = null;
  }

  let twinLevel = confirmedLevel;

  if (state === 'STARTING') {
    // During startup the Digital Twin represents the active command trajectory,
    // while confirmedLevel remains tied to real drive feedback.
    twinLevel = effectiveLevel ?? commandedLevel ?? targetLevel ?? actualLevel;
  } else if (state === 'RUNNING') {
    // Once running, actual frequency is preferred. If it is temporarily absent
    // or still at zero while a valid target is active, keep the modeled branch
    // contribution aligned with the active command instead of dropping to 0 A.
    if (actualHz !== null && actualHz > ZERO_HOLD_THRESHOLD_HZ) twinLevel = actualLevel;
    else twinLevel = effectiveLevel ?? targetLevel ?? commandedLevel ?? actualLevel;
  } else if (twinLevel === null) {
    twinLevel = effectiveLevel ?? targetLevel ?? actualLevel ?? commandedLevel;
  }

  return {
    state,
    mode,
    confirmedLevel,
    twinLevel,
    targetHz,
    actualHz,
    effectiveTargetHz,
    effectiveTargetSource,
  };
};

export default {
  frequencyHzToHeatpumpLevel,
  heatpumpCommandToTwinLevel,
  deriveHeatpumpStatus,
};
