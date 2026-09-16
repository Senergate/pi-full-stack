/*
 * Dynamic Wallbox P/Q adapter for the current physical state.
 *
 * Candidate prediction remains mask based in ElectricalProfileModel. For the
 * current state, however, the feeder/VUF model follows the same live Shelly
 * phase-B current that drives the Building-Twin current card. This keeps VUF
 * synchronized with the measured 0.14 / 0.30 / 0.42 A prototype behaviour.
 */

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};


export const WALLBOX_PHYSICAL_ACTIVE_THRESHOLD_A = 0.02;

export const wallboxPhysicalActiveForMeasurement = ({
  currentA,
  fallbackActive = false,
  thresholdA = WALLBOX_PHYSICAL_ACTIVE_THRESHOLD_A,
} = {}) => {
  const measured = finiteOrNull(currentA);
  const threshold = finiteOrNull(thresholdA);

  // When a fresh Shelly current is available, physical activity is derived
  // from the measurement itself rather than from the command/relay-confirmed
  // state. This keeps the current-state VUF synchronized with the same sample
  // already shown in the Phase Currents card. The confirmed relay mask remains
  // the source of truth for AI command completion and candidate generation.
  if (measured !== null && threshold !== null && threshold >= 0) {
    return measured > threshold;
  }

  // If measurement is temporarily unavailable, preserve the former behavior
  // by falling back to the confirmed logical state instead of inventing OFF.
  return fallbackActive === true;
};

const powerPair = value => ({
  p: Number.isFinite(Number(value?.p)) ? Number(value.p) : 0,
  q: Number.isFinite(Number(value?.q)) ? Number(value.q) : 0,
});

export const wallboxPowerForCurrent = ({
  fullPower,
  fallbackPower,
  currentA,
  referenceMaxA = 0.42,
  active = true,
} = {}) => {
  if (!active) return { p: 0, q: 0, ratio: 0, source: 'wallbox_off' };

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
    source: 'live_shelly_current_scaled_wallbox_pq',
  };
};

export const applyWallboxPowerToModel = (model, power) => {
  if (!model || !power) return model;
  return {
    ...model,
    powers: {
      ...model.powers,
      b: { p: power.p, q: power.q },
    },
    assets: {
      ...model.assets,
      wallbox: {
        ...(model.assets?.wallbox ?? {}),
        p: power.p,
        q: power.q,
        dynamicRatio: power.ratio,
        dynamicSource: power.source,
      },
    },
  };
};

export default {
  WALLBOX_PHYSICAL_ACTIVE_THRESHOLD_A,
  wallboxPhysicalActiveForMeasurement,
  wallboxPowerForCurrent,
  applyWallboxPowerToModel,
};
