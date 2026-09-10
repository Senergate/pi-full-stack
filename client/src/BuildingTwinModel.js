/*
 * Senergate building-scale Digital Twin mapping
 * ---------------------------------------------
 * The physical prototype uses small loads. This model maps real/simulated
 * actuator states to an explicit building-scale equivalent. Shelly currents
 * remain measurement truth and are never multiplied by per-phase factors.
 */

export const BUILDING_TWIN_CONFIG = Object.freeze({
  // Non-controllable building background used by the reproducible demo.
  // It is a MODELED scenario value, not a Shelly measurement.
  baseCurrentA: Object.freeze({ a: 260, b: 100, c: 100 }),

  // Branch A: one ATV12 + motor on the prototype represents three heat pumps.
  branchAEquivalentHeatpumps: 3,
  branchAAggregateMaxCurrentA: 35,
  heatpumpLevels: 5,

  // Branch B: each physical relay/resistor represents two wallboxes.
  // Two relays therefore represent four wallboxes in total.
  branchBEquivalentWallboxesPerRelay: 2,
  wallboxCurrentPerDeviceA: 16,

  // Existing Branch-C/battery model is kept as an independent controllable load.
  batteryChargeCurrentA: 20,
});

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
};

export const wallboxMaskFromRelays = (r0, r1) =>
  (r0 === true ? 1 : 0) | (r1 === true ? 2 : 0);

export const heatpumpProjectedCurrentA = level => {
  const safeLevel = clampInt(level, 0, BUILDING_TWIN_CONFIG.heatpumpLevels);
  const perDeviceAtFullLoad =
    BUILDING_TWIN_CONFIG.branchAAggregateMaxCurrentA /
    BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps;
  const loadRatio = safeLevel / BUILDING_TWIN_CONFIG.heatpumpLevels;
  return BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps * perDeviceAtFullLoad * loadRatio;
};

export const wallboxProjectedCurrentA = mask => {
  const safeMask = clampInt(mask, 0, 3);
  const activeRelays = ((safeMask & 1) ? 1 : 0) + ((safeMask & 2) ? 1 : 0);
  const equivalentDevices =
    activeRelays * BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay;
  return equivalentDevices * BUILDING_TWIN_CONFIG.wallboxCurrentPerDeviceA;
};

export const batteryProjectedCurrentA = charging =>
  charging === true ? BUILDING_TWIN_CONFIG.batteryChargeCurrentA : 0;

export const projectBuildingCurrents = ({
  heatpumpLevel = 0,
  wallboxMask = 0,
  batteryCharging = false,
  baseCurrentA = BUILDING_TWIN_CONFIG.baseCurrentA,
} = {}) => ({
  a: Number(baseCurrentA.a) + heatpumpProjectedCurrentA(heatpumpLevel),
  b: Number(baseCurrentA.b) + wallboxProjectedCurrentA(wallboxMask),
  c: Number(baseCurrentA.c) + batteryProjectedCurrentA(batteryCharging),
});

export default {
  BUILDING_TWIN_CONFIG,
  wallboxMaskFromRelays,
  heatpumpProjectedCurrentA,
  wallboxProjectedCurrentA,
  batteryProjectedCurrentA,
  projectBuildingCurrents,
};
