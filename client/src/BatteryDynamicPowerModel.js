/*
 * Battery dynamic power helper.
 *
 * OFF -> ON prediction uses a configurable prototype current (default 1.04 A).
 * Once Battery is physically ON, current-state VUF uses the live measured
 * prototype current and scales the existing battery P+jQ operating point.
 * This keeps the current-state estimate responsive during charger ramp-up.
 */

import { BATTERY_CONTROL_INTERNALS } from './ControlPolicyConfig.js';

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const batteryCurrentRatio = (
  currentA,
  referenceMaxA = BATTERY_CONTROL_INTERNALS.referenceMaxA,
) => {
  const current = finiteOrNull(currentA);
  const reference = finiteOrNull(referenceMaxA);
  if (current === null || !(reference > 0)) return null;
  return Math.max(0, Math.min(1, current / reference));
};

export const scaleComplexPower = (power, ratio) => {
  const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
  return {
    p: (Number(power?.p) || 0) * safeRatio,
    q: (Number(power?.q) || 0) * safeRatio,
  };
};

export const batteryPowerForCurrent = ({
  fullPower,
  currentA,
  referenceMaxA = BATTERY_CONTROL_INTERNALS.referenceMaxA,
  fallbackToFull = true,
} = {}) => {
  const ratio = batteryCurrentRatio(currentA, referenceMaxA);
  if (ratio === null) {
    return fallbackToFull
      ? { p: Number(fullPower?.p) || 0, q: Number(fullPower?.q) || 0, ratio: 1, source: 'full_model_fallback' }
      : { p: 0, q: 0, ratio: 0, source: 'missing_current' };
  }
  return { ...scaleComplexPower(fullPower, ratio), ratio, source: 'current_scaled_pq' };
};

export const applyBatteryPowerToModel = (model, batteryPower) => {
  if (!model || !batteryPower) return model;
  return {
    ...model,
    powers: {
      ...model.powers,
      c: { p: batteryPower.p, q: batteryPower.q },
    },
    assets: {
      ...model.assets,
      battery: {
        ...(model.assets?.battery ?? {}),
        p: batteryPower.p,
        q: batteryPower.q,
        dynamic_ratio: batteryPower.ratio,
        dynamic_source: batteryPower.source,
      },
    },
  };
};

export default {
  batteryCurrentRatio,
  scaleComplexPower,
  batteryPowerForCurrent,
  applyBatteryPowerToModel,
};
