/*
 * Senergate Capacity Supervisor + operator adjustability rules.
 *
 * Capacity Usage is an engineering utilization KPI:
 *   max(P/Pmax, IL1/IL1max, IL2/IL2max, IL3/IL3max)
 * 100% is the configured project hard limit, not a universal statutory value.
 *
 * IMPORTANT UI/runtime contract:
 * - Live P/L1/L2/L3 values are reported even when the corresponding hard limit
 *   is 0 / not configured.
 * - A limit of 0 disables only that capacity constraint; it must never hide the
 *   underlying measurement.
 * - Partial limit configuration is allowed. Only metrics with a positive limit
 *   and a finite live value participate in Capacity Usage / Headroom.
 */

export const positiveNumberOrZero = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const finiteNumberOrNull = value => {
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

const buildMetric = ({ key, label, actual, limit, unit, source }) => {
  const safeActual = finiteNumberOrNull(actual);
  const safeLimit = positiveNumberOrZero(limit) || null;
  const ratio = safeActual !== null && safeLimit !== null
    ? safeActual / safeLimit
    : null;

  return {
    key,
    label,
    actual: safeActual,
    limit: safeLimit,
    unit,
    ratio,
    configured: safeLimit !== null,
    live: safeActual !== null,
    source,
  };
};

export const computeCapacityStatus = ({
  policy = {},
  measuredCurrents = {},
  measuredTotalPowerW = null,
} = {}) => {
  // Keep a stable four-row metric set for the UI regardless of limit state.
  const metrics = [
    buildMetric({
      key: 'TOTAL_POWER',
      label: 'Total Power',
      actual: measuredTotalPowerW,
      limit: positiveNumberOrZero(policy.siteMaxTotalPowerW),
      unit: 'W',
      source: 'Site / DSO / TAB / installation configuration',
    }),
    buildMetric({
      key: 'A_CURRENT',
      label: 'L1 Current',
      actual: measuredCurrents?.a,
      limit: phaseCurrentLimitA(policy, 'a'),
      unit: 'A',
      source: 'Site / protection / cable / TAB configuration',
    }),
    buildMetric({
      key: 'B_CURRENT',
      label: 'L2 Current',
      actual: measuredCurrents?.b,
      limit: phaseCurrentLimitA(policy, 'b'),
      unit: 'A',
      source: 'Site / protection / cable / TAB configuration',
    }),
    buildMetric({
      key: 'C_CURRENT',
      label: 'L3 Current',
      actual: measuredCurrents?.c,
      limit: phaseCurrentLimitA(policy, 'c'),
      unit: 'A',
      source: 'Site / protection / cable / TAB configuration',
    }),
  ];

  const configuredMetrics = metrics.filter(metric => metric.configured);
  const activeMetrics = metrics.filter(metric => Number.isFinite(metric.ratio));
  const limitingMetric = activeMetrics.length > 0
    ? [...activeMetrics].sort((a, b) => b.ratio - a.ratio)[0]
    : null;

  const usageRatio = limitingMetric?.ratio ?? null;
  const remainingRatio = usageRatio === null ? null : Math.max(0, 1 - usageRatio);

  const warning = Number.isFinite(Number(policy.warningRatio)) ? Number(policy.warningRatio) : 0.80;
  const preLimit = Number.isFinite(Number(policy.preLimitRatio)) ? Number(policy.preLimitRatio) : 0.90;
  const critical = Number.isFinite(Number(policy.criticalRatio)) ? Number(policy.criticalRatio) : 0.95;
  const hard = Number.isFinite(Number(policy.hardRatio)) ? Number(policy.hardRatio) : 1.00;

  let state;
  if (configuredMetrics.length === 0) {
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
