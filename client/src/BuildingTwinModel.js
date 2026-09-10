/*
 * Senergate building-scale Digital Twin mapping for REAL HARDWARE.
 *
 * Measurement truth stays in the Shelly/Pico layer. This module maps the
 * confirmed real actuator state to a documented building-scale equivalent:
 *   Branch A: 1 ATV12 + motor  -> 3 equivalent heat pumps
 *   Branch B: 1 relay/resistor -> 2 equivalent wallboxes
 *             2 relays         -> 4 equivalent wallboxes
 *
 * The resulting currents are MODELED / ESTIMATED and must never be labelled
 * as measured PCC current.
 */

export const BUILDING_TWIN_CONFIG = Object.freeze({
  baseCurrentA: Object.freeze({ a: 240, b: 100, c: 100 }),

  branchAEquivalentHeatpumps: 3,
  branchAAggregateMaxCurrentA: 35,
  heatpumpLevels: 5,

  branchBEquivalentWallboxesPerRelay: 2,
  wallboxCurrentPerDeviceA: 16,

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
  const loadRatio = safeLevel / BUILDING_TWIN_CONFIG.heatpumpLevels;
  return BUILDING_TWIN_CONFIG.branchAAggregateMaxCurrentA * loadRatio;
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
