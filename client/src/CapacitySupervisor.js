import { resolveControlPolicyThresholds } from './ControlPolicyConfig.js';

/*
 * Senergate Capacity Supervisor + operator adjustability rules.
 *
 * Capacity Usage is an engineering utilization KPI:
 *   max(P/Pmax, IL1/IL1max, IL2/IL2max, IL3/IL3max)
 * 100% is the configured project hard limit, not a universal statutory value.
 *
 * IMPORTANT UI/runtime contract:
 * - Prototype MEASURED values remain visible as physical-reference data.
 * - Capacity Usage is calculated from Building-Twin MODELED values, not from
 *   the small prototype currents. This makes configured building limits (for
 *   example L1 max = 10 A) compare against the simulated building L1 current.
 * - A limit of 0 disables only that capacity constraint; it never hides either
 *   MEASURED or MODELED values.
 * - Partial limit configuration is allowed. Only metrics with a positive limit
 *   and a finite modeled value participate in Capacity Usage / Headroom.
 */

export const positiveNumberOrZero = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const finiteNumberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const clampAdjustabilityPercent = value => {
  const numeric = Number(value);
  return Math.max(1, Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : 1)));
};

export const heatpumpAdjustabilityRule = value => {
  const percent = clampAdjustabilityPercent(value);
  // Operator rule: >90 means the Heatpump is completely locked for AI.
  // 81..90 still maps to Level 5, which also means no downward room when the
  // executed state is already L5, but remains semantically distinct from LOCKED.
  const locked = percent >= 91;
  const minLevel = locked
    ? null
    : percent <= 20
      ? 1
      : percent <= 40
        ? 2
        : percent <= 60
          ? 3
          : percent <= 80
            ? 4
            : 5;
  return { percent, locked, minLevel };
};

export const wallboxAdjustabilityRule = value => {
  const percent = clampAdjustabilityPercent(value);
  const locked = percent >= 91;
  return {
    percent,
    locked,
    minLevel: locked ? null : (percent <= 30 ? 1 : 2),
  };
};

export const phaseCurrentLimitA = (policy, phase) => {
  const key = phase === 'a'
    ? 'siteMaxCurrentL1A'
    : phase === 'b'
      ? 'siteMaxCurrentL2A'
      : 'siteMaxCurrentL3A';
  const specific = positiveNumberOrZero(policy?.[key]);
  if (specific > 0) return specific;
  return positiveNumberOrZero(policy?.siteMaxPhaseCurrentA);
};

const buildMetric = ({ key, label, measured, modeled, limit, unit, source, dataFresh = true }) => {
  const safeMeasured = finiteNumberOrNull(measured);
  const safeModeled = finiteNumberOrNull(modeled);
  const safeLimit = positiveNumberOrZero(limit) || null;
  const ratio = dataFresh && safeModeled !== null && safeLimit !== null
    ? safeModeled / safeLimit
    : null;

  return {
    key,
    label,
    measured: safeMeasured,
    modeled: safeModeled,
    // Backward-compatible alias. Capacity semantics now define `actual` as the
    // Building-Twin value used by the capacity denominator comparison.
    actual: safeModeled,
    limit: safeLimit,
    unit,
    ratio,
    configured: safeLimit !== null,
    live: dataFresh && safeModeled !== null,
    lastKnown: safeMeasured !== null || safeModeled !== null,
    fresh: dataFresh === true,
    source,
  };
};

export const computeCapacityStatus = ({
  policy = {},
  measuredCurrents = {},
  measuredTotalPowerW = null,
  modeledCurrents = null,
  modeledTotalPowerW = null,
  dataFresh = true,
} = {}) => {
  // Compatibility for unit tests / older callers: when no explicit modeled
  // source is supplied, fall back to measured values. The production dashboard
  // always supplies Building-Twin modeled values.
  const effectiveModeledCurrents = modeledCurrents ?? measuredCurrents;
  const effectiveModeledPowerW = modeledTotalPowerW ?? measuredTotalPowerW;
  // Keep a stable four-row metric set for the UI regardless of limit state.
  const metrics = [
    buildMetric({
      key: 'TOTAL_POWER',
      label: 'Total Power',
      measured: measuredTotalPowerW,
      modeled: effectiveModeledPowerW,
      limit: positiveNumberOrZero(policy.siteMaxTotalPowerW),
      unit: 'W',
      source: 'Site / DSO / TAB / installation configuration',
      dataFresh,
    }),
    buildMetric({
      key: 'A_CURRENT',
      label: 'L1 Current',
      measured: measuredCurrents?.a,
      modeled: effectiveModeledCurrents?.a,
      limit: phaseCurrentLimitA(policy, 'a'),
      unit: 'A',
      source: 'Site / protection / cable / TAB configuration',
      dataFresh,
    }),
    buildMetric({
      key: 'B_CURRENT',
      label: 'L2 Current',
      measured: measuredCurrents?.b,
      modeled: effectiveModeledCurrents?.b,
      limit: phaseCurrentLimitA(policy, 'b'),
      unit: 'A',
      source: 'Site / protection / cable / TAB configuration',
      dataFresh,
    }),
    buildMetric({
      key: 'C_CURRENT',
      label: 'L3 Current',
      measured: measuredCurrents?.c,
      modeled: effectiveModeledCurrents?.c,
      limit: phaseCurrentLimitA(policy, 'c'),
      unit: 'A',
      source: 'Site / protection / cable / TAB configuration',
      dataFresh,
    }),
  ];

  const configuredMetrics = metrics.filter(metric => metric.configured);
  const activeMetrics = metrics.filter(metric => Number.isFinite(metric.ratio));
  const limitingMetric = activeMetrics.length > 0
    ? [...activeMetrics].sort((a, b) => b.ratio - a.ratio)[0]
    : null;

  const usageRatio = limitingMetric?.ratio ?? null;
  const remainingRatio = usageRatio === null ? null : Math.max(0, 1 - usageRatio);

  const thresholdResolution = resolveControlPolicyThresholds(policy);
  const warning = thresholdResolution.values.warningRatio;
  const preLimit = thresholdResolution.values.preLimitRatio;
  const critical = thresholdResolution.values.criticalRatio;
  const hard = thresholdResolution.values.hardRatio;

  const anyMeasurement = metrics.some(metric => metric.lastKnown);

  let state;
  if (dataFresh !== true && anyMeasurement) {
    state = { key: 'stale', label: 'STALE DATA' };
  } else if (configuredMetrics.length === 0) {
    state = { key: 'not-configured', label: 'LIMITS NOT CONFIGURED' };
  } else if (activeMetrics.length === 0) {
    state = { key: 'waiting', label: 'WAITING DATA' };
  } else if (usageRatio >= hard) {
    state = { key: 'hard', label: 'HARD LIMIT' };
  } else if (usageRatio >= critical) {
    state = { key: 'critical', label: 'CRITICAL' };
  } else if (usageRatio >= preLimit) {
    state = { key: 'prelimit', label: 'PRE-LIMIT' };
  } else if (usageRatio >= warning) {
    state = { key: 'warning', label: 'WARNING' };
  } else {
    state = { key: 'normal', label: 'NORMAL' };
  }

  return {
    // enabled means at least one actual hard limit is configured. This keeps the
    // pre-existing Capacity guard disabled when all limits are zero.
    enabled: configuredMetrics.length > 0,
    fullyConfigured: configuredMetrics.length === metrics.length,
    configuredMetricCount: configuredMetrics.length,
    activeMetricCount: activeMetrics.length,
    metrics,
    activeMetrics,
    limitingMetric,
    usageRatio,
    remainingRatio,
    state,
    dataFresh: dataFresh === true,
    thresholdConfigurationValid: thresholdResolution.valid,
    thresholdErrors: thresholdResolution.errors,
  };
};

export default {
  positiveNumberOrZero,
  finiteNumberOrNull,
  clampAdjustabilityPercent,
  heatpumpAdjustabilityRule,
  wallboxAdjustabilityRule,
  phaseCurrentLimitA,
  computeCapacityStatus,
};
