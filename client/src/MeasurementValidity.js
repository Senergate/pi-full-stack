/*
 * Measurement validity helpers used by the frontstage and AI controller.
 * They deliberately keep "unknown" separate from zero.
 */

export const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const computeCompleteThreePhaseLoadPowerW = measured => {
  const values = ['a_act_power', 'b_act_power', 'c_act_power']
    .map(key => finiteOrNull(measured?.[key]));

  // Never report a partial L1+L2 sum as total building power.
  if (values.some(value => value === null)) return null;
  return values.reduce((sum, value) => sum + Math.max(0, value), 0);
};

export const computeBatteryDeltaCurrentA = ({
  charging,
  rawPhaseCurrentA,
  baselinePhaseCurrentA,
} = {}) => {
  if (charging !== true) return 0;

  const raw = finiteOrNull(rawPhaseCurrentA);
  const baseline = finiteOrNull(baselinePhaseCurrentA);
  if (raw === null || baseline === null) return null;

  return Math.max(0, raw - baseline);
};

export const classifyBatteryEffectiveness = ({
  charging,
  deltaCurrentA,
  minimumEffectiveA = 0.10,
} = {}) => {
  if (charging !== true) return { key: 'not_applicable', label: 'N/A' };

  const current = finiteOrNull(deltaCurrentA);
  if (current === null) return { key: 'unknown', label: 'UNKNOWN' };

  const threshold = Math.max(0, finiteOrNull(minimumEffectiveA) ?? 0.10);
  return current >= threshold
    ? { key: 'effective', label: 'EFFECTIVE' }
    : { key: 'ineffective', label: 'INEFFECTIVE' };
};

export default {
  finiteOrNull,
  computeCompleteThreePhaseLoadPowerW,
  computeBatteryDeltaCurrentA,
  classifyBatteryEffectiveness,
};
