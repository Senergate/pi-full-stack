/*
 * Senergate AI-control configuration.
 *
 * IMPORTANT:
 * - Site power/current limits default to 0 = DISABLED.  The project knowledge
 *   base does not define one universal legal maximum total building power or
 *   one universal legal L1/L2/L3 current.  Those values are connection/TAB,
 *   protective-device and site specific.
 * - 4.6 kVA / ~20 A is kept as a German VDE-AR-N 4100 symmetry reference for
 *   single-phase controlled assets.  It is NOT a total phase-load hard limit.
 * - Soft thresholds are engineering parameters and may later be optimized
 *   offline from logged outcomes, but hard limits must never be learned away.
 */

export const CONTROL_POLICY_DEFAULTS = Object.freeze({
  strategy: 'battery_priority_capacity_monotonic_downshift_v3',

  // VUF-only first implementation. CUF/Schieflast control is intentionally
  // deferred to a later architecture revision.
  vufEnterPct: 2.0,
  vufExitPct: 1.7,

  // User-confirmed Battery Effective Threshold.
  batteryEffectiveMinA: 0.10,

  // Soft headroom thresholds. They are inactive until a site hard limit is set.
  warningRatio: 0.80,
  preLimitRatio: 0.90,
  criticalRatio: 0.95,
  hardRatio: 1.00,

  // 0 = disabled. Must be filled from the actual DSO/TAB / main protection /
  // connection agreement. Keeping 0 preserves the original program behaviour.
  siteMaxTotalPowerW: 0,
  siteMaxCurrentL1A: 0,
  siteMaxCurrentL2A: 0,
  siteMaxCurrentL3A: 0,

  // Backward-compatible common phase limit. New code prefers the individual
  // L1/L2/L3 limits above. It remains 0 by default and is not shown in the UI.
  siteMaxPhaseCurrentA: 0,

  // Operator-defined intervention depth. These are operational constraints,
  // not electrical hard limits and not AI-learnable parameters.
  // Heatpump: 1-20=>min L1, 21-40=>L2, 41-60=>L3, 61-80=>L4,
  // 81-90=>L5, 91-100=>locked. 50 preserves the previous effective min L3.
  // Automatic AI control is monotonic downshift-only: it may never increase
  // Heatpump or Wallbox level. Manual/operator commands remain bidirectional.
  heatpumpAdjustability: 50,
  // Wallbox: 1-30=>min L1, 31-90=>min L2, 91-100=>locked.
  // 30 is the most permissive setting under the new no-auto-OFF rule.
  wallboxAdjustability: 30,

  // Regulatory/reference values for display/documentation only.
  deSinglePhaseSymmetryReferenceVA: 4600,
  deSinglePhaseSymmetryReferenceA: 20,
  voltageGuardMinV: 207,
  voltageGuardMaxV: 253,

  // Internal Senergate prototype engineering baseline from the architecture
  // guide; NOT a universal legal limit and not enforced by default.
  prototypeEngineeringPowerLimitW: 2000,
  prototypeEngineeringCurrentGuideA: 9,

  // Recommended post-confirmation settling windows.
  batterySettleMs: 3000,
  wallboxSettleMs: 2000,
  heatpumpSettleMs: 5000,

  minVufImprovementPct: 0.01,
});

// Real prototype current measurements supplied on 2026-09-15 (±0.01 A).
// These are used only for action-relief ranking in the recommended controller;
// they do not replace calibrated P/Q profiles.
export const PROTOTYPE_CURRENT_CURVES_A = Object.freeze({
  heatpump: Object.freeze({ 0: 0.00, 1: 0.09, 2: 0.16, 3: 0.21, 4: 0.24, 5: 0.26 }),
  wallbox: Object.freeze({ 0: 0.00, 1: 0.14, 2: 0.30, 3: 0.42 }),
});

export const ADAPTIVE_PARAMETER_KEYS = Object.freeze([
  'vufEnterPct',
  'vufExitPct',
  'batteryEffectiveMinA',
  'warningRatio',
  'preLimitRatio',
  'criticalRatio',
  'batterySettleMs',
  'wallboxSettleMs',
  'heatpumpSettleMs',
  'minVufImprovementPct',
]);

export const CONTROL_THRESHOLD_KEYS = Object.freeze([
  'vufEnterPct',
  'vufExitPct',
  'warningRatio',
  'preLimitRatio',
  'criticalRatio',
  'hardRatio',
]);

const finiteThreshold = (policy, key, fallback) => {
  const numeric = Number(policy?.[key]);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export const validateControlPolicyThresholds = (policy = {}) => {
  const values = {
    vufEnterPct: finiteThreshold(policy, 'vufEnterPct', CONTROL_POLICY_DEFAULTS.vufEnterPct),
    vufExitPct: finiteThreshold(policy, 'vufExitPct', CONTROL_POLICY_DEFAULTS.vufExitPct),
    warningRatio: finiteThreshold(policy, 'warningRatio', CONTROL_POLICY_DEFAULTS.warningRatio),
    preLimitRatio: finiteThreshold(policy, 'preLimitRatio', CONTROL_POLICY_DEFAULTS.preLimitRatio),
    criticalRatio: finiteThreshold(policy, 'criticalRatio', CONTROL_POLICY_DEFAULTS.criticalRatio),
    hardRatio: finiteThreshold(policy, 'hardRatio', CONTROL_POLICY_DEFAULTS.hardRatio),
  };

  const errors = [];
  if (!(values.vufEnterPct > 0)) errors.push('VUF Enter must be > 0.');
  if (!(values.vufExitPct >= 0 && values.vufExitPct < values.vufEnterPct)) {
    errors.push('VUF Exit must be >= 0 and strictly below VUF Enter.');
  }
  if (!(values.warningRatio > 0 && values.warningRatio < values.preLimitRatio)) {
    errors.push('Capacity Warning must be > 0 and below Pre-Limit.');
  }
  if (!(values.preLimitRatio < values.criticalRatio)) {
    errors.push('Capacity Pre-Limit must be below Critical.');
  }
  if (!(values.criticalRatio < values.hardRatio)) {
    errors.push('Capacity Critical must be below Hard.');
  }
  if (!(values.hardRatio === 1.0)) {
    errors.push('Capacity Hard is fixed at 100%.');
  }

  return { valid: errors.length === 0, values, errors };
};

export const resolveControlPolicyThresholds = (policy = {}) => {
  const validation = validateControlPolicyThresholds(policy);
  if (validation.valid) return { ...validation, usedDefaults: false };

  return {
    valid: false,
    usedDefaults: true,
    errors: validation.errors,
    values: {
      vufEnterPct: CONTROL_POLICY_DEFAULTS.vufEnterPct,
      vufExitPct: CONTROL_POLICY_DEFAULTS.vufExitPct,
      warningRatio: CONTROL_POLICY_DEFAULTS.warningRatio,
      preLimitRatio: CONTROL_POLICY_DEFAULTS.preLimitRatio,
      criticalRatio: CONTROL_POLICY_DEFAULTS.criticalRatio,
      hardRatio: CONTROL_POLICY_DEFAULTS.hardRatio,
    },
  };
};

export const cloneControlPolicyDefaults = strategy => ({
  ...CONTROL_POLICY_DEFAULTS,
  strategy: strategy ?? CONTROL_POLICY_DEFAULTS.strategy,
});

export default CONTROL_POLICY_DEFAULTS;
