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
  strategy: 'current_v151',

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
  siteMaxPhaseCurrentA: 0,

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

export const cloneControlPolicyDefaults = strategy => ({
  ...CONTROL_POLICY_DEFAULTS,
  strategy: strategy ?? CONTROL_POLICY_DEFAULTS.strategy,
});

export default CONTROL_POLICY_DEFAULTS;
