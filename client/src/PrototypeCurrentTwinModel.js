/*
 * Senergate live current display model
 * -------------------------------------------------
 * Purpose:
 *   Keep the existing v1.5.1 P/Q -> feeder -> VUF control behaviour unchanged,
 *   while making the BUILDING TWIN current bars reflect the measured prototype
 *   current curves and follow live Shelly-current changes synchronously.
 *
 * User-confirmed prototype measurements (±0.01 A):
 *   Heatpump L1..L5 : 0.09, 0.16, 0.21, 0.24, 0.26 A
 *   Wallbox mask1..3: 0.14, 0.30, 0.42 A
 *
 * Battery:
 *   Battery scaling/saturation reference maximum: 1.30 A.
 *   If the live measured battery current exceeds 1.30 A, the modeled building
 *   current saturates at the existing configured maximum (40 A).
 */

import { BUILDING_TWIN_CONFIG } from './BuildingTwinModel.js';
import { BATTERY_CONTROL_INTERNALS, PROTOTYPE_CURRENT_CURVES_A } from './ControlPolicyConfig.js';

export const PROTOTYPE_CURRENT_REFERENCE_MAX_A = Object.freeze({
  heatpump: 0.26,
  wallbox: 0.42,
  battery: BATTERY_CONTROL_INTERNALS.referenceMaxA,
});

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const scalePrototypeCurrentToBuilding = ({
  measuredA,
  fallbackPrototypeA,
  prototypeMaxA,
  buildingMaxA,
  active,
}) => {
  if (!active) return 0;

  const live = finiteOrNull(measuredA);
  const fallback = finiteOrNull(fallbackPrototypeA);
  const prototypeCurrent = Math.max(0, live ?? fallback ?? 0);
  const referenceMax = Math.max(0, finiteOrNull(prototypeMaxA) ?? 0);
  const buildingMax = Math.max(0, finiteOrNull(buildingMaxA) ?? 0);

  if (!(referenceMax > 0) || !(buildingMax > 0)) return 0;

  // Live current changes immediately change the displayed Twin current.
  // Saturation prevents the modeled current from exceeding its existing
  // building-equivalent maximum. This is explicitly required for Battery.
  return buildingMax * Math.min(1, prototypeCurrent / referenceMax);
};

export const projectLiveScaledBuildingCurrents = ({
  measuredCurrents = { a: null, b: null, c: null },
  heatpumpLevel,
  wallboxMask,
  batteryCharging,
} = {}) => {
  const hpLevel = finiteOrNull(heatpumpLevel);
  const wbMask = finiteOrNull(wallboxMask);
  const batteryKnown = batteryCharging !== null && batteryCharging !== undefined;

  if (hpLevel === null || wbMask === null || !batteryKnown) {
    return { a: null, b: null, c: null };
  }

  const hpState = Math.max(0, Math.min(5, Math.round(hpLevel)));
  const wbState = Math.max(0, Math.min(3, Math.round(wbMask)));
  const batteryOn = batteryCharging === true;

  return {
    a: scalePrototypeCurrentToBuilding({
      measuredA: measuredCurrents?.a,
      fallbackPrototypeA: PROTOTYPE_CURRENT_CURVES_A.heatpump?.[hpState] ?? 0,
      prototypeMaxA: PROTOTYPE_CURRENT_REFERENCE_MAX_A.heatpump,
      buildingMaxA: BUILDING_TWIN_CONFIG.heatpumpAggregateMaxCurrentA,
      active: hpState > 0,
    }),
    b: scalePrototypeCurrentToBuilding({
      measuredA: measuredCurrents?.b,
      fallbackPrototypeA: PROTOTYPE_CURRENT_CURVES_A.wallbox?.[wbState] ?? 0,
      prototypeMaxA: PROTOTYPE_CURRENT_REFERENCE_MAX_A.wallbox,
      buildingMaxA:
        BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay *
        2 *
        BUILDING_TWIN_CONFIG.wallboxCurrentPerDeviceA,
      active: wbState > 0,
    }),
    c: scalePrototypeCurrentToBuilding({
      measuredA: measuredCurrents?.c,
      // If Shelly is temporarily unavailable while charging is known ON,
      // preserve the former maximum behavior instead of dropping to zero.
      fallbackPrototypeA: batteryOn ? PROTOTYPE_CURRENT_REFERENCE_MAX_A.battery : 0,
      prototypeMaxA: PROTOTYPE_CURRENT_REFERENCE_MAX_A.battery,
      buildingMaxA: BUILDING_TWIN_CONFIG.batteryChargeCurrentA,
      active: batteryOn,
    }),
  };
};

export default {
  PROTOTYPE_CURRENT_REFERENCE_MAX_A,
  scalePrototypeCurrentToBuilding,
  projectLiveScaledBuildingCurrents,
};
