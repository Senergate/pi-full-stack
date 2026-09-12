/*
 * Senergate REAL-HARDWARE building-scale equivalent-device model
 * ----------------------------------------------------------------
 * Measurement truth and model truth are deliberately separated:
 *   - Shelly currents remain physical prototype measurements.
 *   - Building-Twin currents are derived only from confirmed actuator states.
 *   - No per-phase measured-current gain is used.
 *
 * Prototype equivalence:
 *   Branch A: 1 ATV12 + motor  -> 2 equivalent heat-pump modules
 *   Branch B: 1 relay/resistor -> 2 equivalent wallboxes
 *             2 relays         -> 4 equivalent wallboxes
 *
 * The current values below are DEMO DEVICE-MODEL assumptions. They are not
 * measured site currents and should later be replaced by nameplate/validated
 * load curves when those are available.
 */

export const BUILDING_TWIN_CONFIG = Object.freeze({
  baseCurrentA: Object.freeze({ a: 0, b: 0, c: 0 }),

  branchAEquivalentHeatpumps: 2,
  heatpumpLevels: 5,
  // Aggregate building-scale contribution of the 2 equivalent heat-pump modules.
  heatpumpAggregateMaxCurrentA: 60,

  branchBEquivalentWallboxesPerRelay: 2,
  // Single-phase modeled current per equivalent wallbox.
  wallboxCurrentPerDeviceA: 16,

  // Independent modeled contribution for the current battery prototype state.
  batteryChargeCurrentA: 40,

  provenance: 'demo_equivalent_device_model_v3_60_64_40',
});

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
};

export const wallboxMaskFromRelays = (r0, r1) =>
  (r0 === true ? 1 : 0) | (r1 === true ? 2 : 0);

export const heatpumpProjectedCurrentA = level => {
  const safeLevel = clampInt(level, 0, BUILDING_TWIN_CONFIG.heatpumpLevels);
  return safeLevel * (
    BUILDING_TWIN_CONFIG.heatpumpAggregateMaxCurrentA /
    BUILDING_TWIN_CONFIG.heatpumpLevels
  );
};

export const wallboxProjectedCurrentA = mask => {
  const safeMask = clampInt(mask, 0, 3);
  const activeRelays = ((safeMask & 1) ? 1 : 0) + ((safeMask & 2) ? 1 : 0);
  const equivalentWallboxes =
    activeRelays * BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay;
  return equivalentWallboxes * BUILDING_TWIN_CONFIG.wallboxCurrentPerDeviceA;
};

export const batteryProjectedCurrentA = charging =>
  charging === true ? BUILDING_TWIN_CONFIG.batteryChargeCurrentA : 0;

export const projectBuildingCurrents = ({
  heatpumpLevel,
  wallboxMask,
  batteryCharging,
} = {}) => {
  const hpKnown = heatpumpLevel !== null && heatpumpLevel !== undefined;
  const wbKnown = wallboxMask !== null && wallboxMask !== undefined;
  const batteryKnown = batteryCharging !== null && batteryCharging !== undefined;

  if (!hpKnown || !wbKnown || !batteryKnown) {
    return { a: null, b: null, c: null };
  }

  return {
    a: BUILDING_TWIN_CONFIG.baseCurrentA.a + heatpumpProjectedCurrentA(heatpumpLevel),
    b: BUILDING_TWIN_CONFIG.baseCurrentA.b + wallboxProjectedCurrentA(wallboxMask),
    c: BUILDING_TWIN_CONFIG.baseCurrentA.c + batteryProjectedCurrentA(batteryCharging),
  };
};

export default {
  BUILDING_TWIN_CONFIG,
  wallboxMaskFromRelays,
  heatpumpProjectedCurrentA,
  wallboxProjectedCurrentA,
  batteryProjectedCurrentA,
  projectBuildingCurrents,
};
