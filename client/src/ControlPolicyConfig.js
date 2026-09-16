/*
 * Senergate AI-control configuration.
 *
 * User-editable values are intentionally kept small and explicit:
 *   Site Limits: total power + per-phase current
 *   AI thresholds: VUF enter/exit + Battery predicted/effective current
 *
 * Internal controller constants remain deterministic and are not exposed in
 * the normal UI. Hard safety limits must never be learned away.
 */

export const BATTERY_CONTROL_INTERNALS = Object.freeze({
  referenceMaxA: 1.40,
  preLimitRatio: 0.90,
  hardRatio: 1.00,
  minVufImprovementPct: 0.01,
  batteryMinSettleMs: 3000,
  batteryStableDeltaA: 0.02,
  batteryStableSamples: 3,
  batteryStableDurationMs: 1000,
  batteryStableSlopeAperS: 0.02,
  batteryMaxSettleMs: 10000,
  wallboxSettleMs: 2000,
  heatpumpSettleMs: 5000,
  voltageGuardMinV: 207,
  voltageGuardMaxV: 253,
});

export const CONTROL_POLICY_DEFAULTS = Object.freeze({
  strategy: 'battery_priority_v2_ramping',

  // VUF-only first implementation. CUF/Schieflast control remains deferred.
  vufEnterPct: 2.00,
  vufExitPct: 1.70,

  // Battery OFF -> ON counterfactual uses this conservative steady-state
  // prototype current. It is deliberately separate from referenceMaxA.
  batteryPredictedOnCurrentA: 1.04,

  // Applied only after Battery ramp/stabilization is complete (or times out).
  batteryEffectiveMinA: 0.10,

  // 0 = disabled. Values are site/DSO/TAB/protection specific. Keeping 0
  // preserves the original runtime unless the operator explicitly configures it.
  siteMaxTotalPowerW: 0,
  siteMaxPhaseCurrentA: 0,

  // Regulatory/reference values for display/documentation only.
  deSinglePhaseSymmetryReferenceVA: 4600,
  deSinglePhaseSymmetryReferenceA: 20,

  // Internal Senergate prototype engineering baseline; not universal law.
  prototypeEngineeringPowerLimitW: 2000,
  prototypeEngineeringCurrentGuideA: 9,
});

// Broad technical UI ranges. These are input-validation ranges, NOT legal limits.
export const CONTROL_INPUT_SPECS = Object.freeze({
  siteMaxTotalPowerW: Object.freeze({
    label: 'Maximum total power', min: 0.00, max: 10000000.00, unit: 'W', decimals: 2,
  }),
  siteMaxPhaseCurrentA: Object.freeze({
    label: 'Maximum phase current', min: 0.00, max: 10000.00, unit: 'A', decimals: 2,
  }),
  vufEnterPct: Object.freeze({
    label: 'VUF Enter', min: 0.10, max: 5.00, unit: '%', decimals: 2,
  }),
  vufExitPct: Object.freeze({
    label: 'VUF Exit', min: 0.00, max: 4.99, unit: '%', decimals: 2,
  }),
  batteryPredictedOnCurrentA: Object.freeze({
    label: 'Battery predicted ON current', min: 0.10, max: 1.30, unit: 'A', decimals: 2,
  }),
  batteryEffectiveMinA: Object.freeze({
    label: 'Battery effective minimum', min: 0.00, max: 1.30, unit: 'A', decimals: 2,
  }),
});

// Real prototype current measurements supplied by the user (±0.01 A).
// Used for action-relief ranking and live current display, not as statutory data.
export const PROTOTYPE_CURRENT_CURVES_A = Object.freeze({
  heatpump: Object.freeze({ 0: 0.00, 1: 0.09, 2: 0.16, 3: 0.21, 4: 0.24, 5: 0.26 }),
  wallbox: Object.freeze({ 0: 0.00, 1: 0.14, 2: 0.30, 3: 0.42 }),
});

// Only genuinely adaptive/operational thresholds are listed here. Site limits
// and internal safety/controller constants are intentionally excluded.
export const ADAPTIVE_PARAMETER_KEYS = Object.freeze([
  'vufEnterPct',
  'vufExitPct',
  'batteryPredictedOnCurrentA',
  'batteryEffectiveMinA',
]);

export const cloneControlPolicyDefaults = strategy => ({
  ...CONTROL_POLICY_DEFAULTS,
  strategy: strategy ?? CONTROL_POLICY_DEFAULTS.strategy,
});

export default CONTROL_POLICY_DEFAULTS;
