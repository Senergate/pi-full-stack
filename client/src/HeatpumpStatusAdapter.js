/*
 * Branch-A status adapter.
 *
 * target_frequency_hz / LFRD = confirmed Branch-A setpoint and therefore the
 * source for the Building-Twin equivalent-device state.
 * actual_output_frequency_hz / RFRD = delayed physical drive feedback used for
 * diagnostics. It is only a fallback if target information is absent.
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

export const deriveHeatpumpStatus = payload => {
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

  if (['STOP', 'STOPPED', 'READY', 'SAFE_MODE', 'FAULT', 'ERROR', 'ZERO_HOLD'].includes(state)) {
    return { state, modelLevel: 0, targetHz, actualHz };
  }

  if (explicitLevel !== null) {
    return {
      state,
      modelLevel: clampInt(explicitLevel, 0, HEATPUMP_LEVELS),
      targetHz,
      actualHz,
    };
  }

  return {
    state,
    modelLevel: frequencyHzToHeatpumpLevel(targetHz ?? actualHz),
    targetHz,
    actualHz,
  };
};

export default {
  frequencyHzToHeatpumpLevel,
  deriveHeatpumpStatus,
};
