/*
 * Senergate Capacity Supervisor + operator adjustability rules.
 *
 * Capacity Usage is an engineering utilization KPI:
 *   max(P/Pmax, IL1/IL1max, IL2/IL2max, IL3/IL3max)
 * 100% is the configured project hard limit, not a universal statutory value.
 */

export const positiveNumberOrZero = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export const clampAdjustabilityPercent = value => {
  const numeric = Number(value);
  return Math.max(1, Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : 1)));
};

export const heatpumpAdjustabilityRule = value => {
  const percent = clampAdjustabilityPercent(value);
  const locked = percent >= 100;
  return {
    percent,
    locked,
    minLevel: locked ? null : Math.ceil(percent / 20),
  };
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

export const computeCapacityStatus = ({
  policy = {},
  measuredCurrents = {},
  measuredTotalPowerW = null,
} = {}) => {
  const metrics = [];
  const powerLimit = positiveNumberOrZero(policy.siteMaxTotalPowerW);
  const totalPower = Number(measuredTotalPowerW);

  if (powerLimit > 0 && Number.isFinite(totalPower)) {
    metrics.push({
      key: 'TOTAL_POWER',
      label: 'Total Power',
      actual: totalPower,
      limit: powerLimit,
      unit: 'W',
      ratio: totalPower / powerLimit,
      source: 'Site / DSO / TAB / installation configuration',
    });
  }

  for (const [phase, label] of [['a', 'L1 Current'], ['b', 'L2 Current'], ['c', 'L3 Current']]) {
    const limit = phaseCurrentLimitA(policy, phase);
    const actual = Number(measuredCurrents?.[phase]);
    if (limit > 0 && Number.isFinite(actual)) {
      metrics.push({
        key: `${phase.toUpperCase()}_CURRENT`,
        label,
        actual,
        limit,
        unit: 'A',
        ratio: actual / limit,
        source: 'Site / protection / cable / TAB configuration',
      });
    }
  }

  const limitingMetric = metrics.length > 0
    ? [...metrics].sort((a, b) => b.ratio - a.ratio)[0]
    : null;
  const usageRatio = limitingMetric?.ratio ?? null;
  const remainingRatio = usageRatio === null ? null : Math.max(0, 1 - usageRatio);

  const warning = Number.isFinite(Number(policy.warningRatio)) ? Number(policy.warningRatio) : 0.80;
  const preLimit = Number.isFinite(Number(policy.preLimitRatio)) ? Number(policy.preLimitRatio) : 0.90;
  const critical = Number.isFinite(Number(policy.criticalRatio)) ? Number(policy.criticalRatio) : 0.95;
  const hard = Number.isFinite(Number(policy.hardRatio)) ? Number(policy.hardRatio) : 1.00;

  let state = { key: 'disabled', label: 'DISABLED' };
  if (usageRatio !== null) {
    if (usageRatio >= hard) state = { key: 'hard', label: 'HARD LIMIT' };
    else if (usageRatio >= critical) state = { key: 'critical', label: 'CRITICAL' };
    else if (usageRatio >= preLimit) state = { key: 'prelimit', label: 'PRE-LIMIT' };
    else if (usageRatio >= warning) state = { key: 'warning', label: 'WARNING' };
    else state = { key: 'normal', label: 'NORMAL' };
  }

  return {
    enabled: metrics.length > 0,
    metrics,
    limitingMetric,
    usageRatio,
    remainingRatio,
    state,
  };
};

export default {
  positiveNumberOrZero,
  clampAdjustabilityPercent,
  heatpumpAdjustabilityRule,
  wallboxAdjustabilityRule,
  phaseCurrentLimitA,
  computeCapacityStatus,
};
