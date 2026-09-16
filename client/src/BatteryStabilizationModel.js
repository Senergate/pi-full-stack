/*
 * Battery stabilization evaluator.
 *
 * A Battery start is considered stable only when all of the following hold:
 *   - minimum settling time elapsed,
 *   - enough consecutive small-delta updates were observed,
 *   - those updates span a minimum stable duration,
 *   - the current slope over the stable suffix is small enough.
 *
 * This prevents a burst of high-rate nearly-identical samples from being
 * mistaken for a physically settled charger.
 */

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const updateBatteryStabilizationWindow = ({
  samples = [],
  startedAtMs,
  nowMs,
  currentA,
  minSettleMs,
  stableDeltaA,
  stableSamples,
  stableDurationMs,
  stableSlopeAperS,
  maxWindowSamples = 16,
} = {}) => {
  const startedAt = finiteOrNull(startedAtMs);
  const now = finiteOrNull(nowMs);
  const current = finiteOrNull(currentA);
  if (startedAt === null || now === null || current === null) {
    return {
      samples: Array.isArray(samples) ? samples.slice(-maxWindowSamples) : [],
      stableCount: 0,
      stableDurationMs: 0,
      slopeAperS: null,
      stableReady: false,
    };
  }

  const next = [...(Array.isArray(samples) ? samples : []), { t: now, currentA: current }]
    .filter(sample => Number.isFinite(sample?.t) && Number.isFinite(sample?.currentA))
    .slice(-maxWindowSamples);

  const elapsed = Math.max(0, now - startedAt);
  if (elapsed < Math.max(0, Number(minSettleMs) || 0) || next.length < 2) {
    return { samples: next, stableCount: 0, stableDurationMs: 0, slopeAperS: null, stableReady: false };
  }

  const deltaLimit = Math.max(0, Number(stableDeltaA) || 0);
  const minUpdates = Math.max(1, Math.round(Number(stableSamples) || 1));
  const minDuration = Math.max(0, Number(stableDurationMs) || 0);
  const slopeLimit = Math.max(0, Number(stableSlopeAperS) || 0);

  // Only samples acquired after the minimum settling interval are eligible
  // for a HIGH-confidence decision. Stable-looking samples from the initial
  // charger ramp must not be counted retroactively once minSettleMs elapses.
  const eligibleFrom = startedAt + Math.max(0, Number(minSettleMs) || 0);
  const eligible = next.filter(sample => sample.t >= eligibleFrom);
  if (eligible.length < 2) {
    return { samples: next, stableCount: 0, stableDurationMs: 0, slopeAperS: null, stableReady: false };
  }

  // Find the longest eligible suffix in which every adjacent update remains
  // within the configured delta band.
  let firstIndex = eligible.length - 1;
  for (let i = eligible.length - 1; i > 0; i -= 1) {
    const delta = Math.abs(eligible[i].currentA - eligible[i - 1].currentA);
    if (delta > deltaLimit) break;
    firstIndex = i - 1;
  }

  const suffix = eligible.slice(firstIndex);
  const stableCount = Math.max(0, suffix.length - 1); // number of stable updates
  const duration = suffix.length >= 2 ? Math.max(0, suffix[suffix.length - 1].t - suffix[0].t) : 0;
  const dtS = duration / 1000;
  const slope = dtS > 0
    ? Math.abs(suffix[suffix.length - 1].currentA - suffix[0].currentA) / dtS
    : null;

  const stableReady = stableCount >= minUpdates &&
    duration >= minDuration &&
    slope !== null &&
    slope <= slopeLimit;

  return {
    samples: next,
    stableCount,
    stableDurationMs: duration,
    slopeAperS: slope,
    stableReady,
  };
};

export default { updateBatteryStabilizationWindow };
