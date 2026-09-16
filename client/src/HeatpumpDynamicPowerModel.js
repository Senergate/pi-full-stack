/*
 * Dynamic Heatpump P/Q adapter for the current physical state.
 *
 * Candidate prediction remains level/profile based. The current-state feeder/
 * VUF model follows the same live Shelly phase-A current already used by the
 * Current Card. If a calibrated OFF-state P/Q baseline is available,
 * SimpleDashboard may provide a measured incremental P/Q value directly;
 * otherwise this adapter scales the full Heatpump P+jQ operating point with
 * the live prototype current ratio.
 */

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const HEATPUMP_PHYSICAL_ACTIVE_THRESHOLD_A = 0.02;

export const heatpumpPhysicalActiveForMeasurement = ({
  currentA,
  fallbackActive = false,
  thresholdA = HEATPUMP_PHYSICAL_ACTIVE_THRESHOLD_A,
} = {}) => {
  const measured = finiteOrNull(currentA);
  const threshold = finiteOrNull(thresholdA);

  if (measured !== null && threshold !== null && threshold >= 0) {
    return measured > threshold;
  }
  return fallbackActive === true;
};

const powerPair = value => ({
  p: Number.isFinite(Number(value?.p)) ? Number(value.p) : 0,
  q: Number.isFinite(Number(value?.q)) ? Number(value.q) : 0,
});

export const heatpumpPowerForCurrent = ({
  fullPower,
  fallbackPower,
  currentA,
  referenceMaxA = 0.26,
  active = true,
} = {}) => {
  if (!active) return { p: 0, q: 0, ratio: 0, source: 'heatpump_off' };

  const reference = finiteOrNull(referenceMaxA);
  const measured = finiteOrNull(currentA);
  const fallback = powerPair(fallbackPower);
  if (!(reference > 0)) return { ...fallback, ratio: null, source: 'invalid_reference_fallback' };
  if (measured === null) return { ...fallback, ratio: null, source: 'missing_live_current_fallback' };

  const ratio = Math.max(0, Math.min(1, measured / reference));
  const full = powerPair(fullPower);
  return {
    p: full.p * ratio,
    q: full.q * ratio,
    ratio,
    source: 'live_shelly_current_scaled_heatpump_pq',
  };
};

export const applyHeatpumpPowerToModel = (model, power) => {
  if (!model || !power) return model;
  return {
    ...model,
    powers: {
      ...model.powers,
      a: { p: power.p, q: power.q },
    },
    assets: {
      ...model.assets,
      heatpump: {
        ...(model.assets?.heatpump ?? {}),
        p: power.p,
        q: power.q,
        dynamicRatio: power.ratio,
        dynamicSource: power.source,
      },
    },
  };
};

export default {
  HEATPUMP_PHYSICAL_ACTIVE_THRESHOLD_A,
  heatpumpPhysicalActiveForMeasurement,
  heatpumpPowerForCurrent,
  applyHeatpumpPowerToModel,
};
