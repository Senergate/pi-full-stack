import assert from 'node:assert/strict';
import {
  WALLBOX_PHYSICAL_ACTIVE_THRESHOLD_A,
  applyWallboxPowerToModel,
  wallboxPhysicalActiveForMeasurement,
  wallboxPowerForCurrent,
} from '../client/src/WallboxDynamicPowerModel.js';
import {
  DEFAULT_ELECTRICAL_PROFILES,
  modelAssetPower,
  modelBuildingPowers,
} from '../client/src/ElectricalProfileModel.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

assert.equal(WALLBOX_PHYSICAL_ACTIVE_THRESHOLD_A, 0.02);
assert.equal(wallboxPhysicalActiveForMeasurement({ currentA: 0.14, fallbackActive: false }), true,
  'live measured current must activate current-state VUF even before logical confirmation');
assert.equal(wallboxPhysicalActiveForMeasurement({ currentA: 0.01, fallbackActive: true }), false,
  'fresh near-zero measurement must represent physical OFF even if logical state is still ON');
assert.equal(wallboxPhysicalActiveForMeasurement({ currentA: null, fallbackActive: true }), true,
  'missing measurement must fall back to confirmed logical state');

const full = { p: 1000, q: 100 };
const live = wallboxPowerForCurrent({
  fullPower: full,
  fallbackPower: { p: 0, q: 0 },
  currentA: 0.14,
  referenceMaxA: 0.42,
  active: wallboxPhysicalActiveForMeasurement({ currentA: 0.14, fallbackActive: false }),
});
assert.ok(Math.abs(live.ratio - (1 / 3)) < 1e-9);
assert.ok(live.p > 0);

// End-to-end current-state check: changing only the live phase-B current must
// change the VUF without waiting for a different confirmed Wallbox mask.
const phaseVoltages = { a: 230, b: 230, c: 230 };
const baseModel = modelBuildingPowers({
  profiles: DEFAULT_ELECTRICAL_PROFILES,
  heatpumpLevel: 4,
  wallboxMask: 1, // intentionally held constant for both measurements
  batteryCharging: false,
  phaseVoltages,
});
const fullWallbox = modelAssetPower({
  profiles: DEFAULT_ELECTRICAL_PROFILES,
  assetName: 'wallbox',
  state: 3,
  voltageV: phaseVoltages.b,
});

const modelForCurrent = currentA => {
  const dynamic = wallboxPowerForCurrent({
    fullPower: fullWallbox,
    fallbackPower: baseModel.powers.b,
    currentA,
    referenceMaxA: 0.42,
    active: wallboxPhysicalActiveForMeasurement({ currentA, fallbackActive: true }),
  });
  return applyWallboxPowerToModel(baseModel, dynamic);
};

const feeder = {
  baselineVoltages: phaseVoltages,
  baselineAngles: { a: 0, b: -120, c: 120 },
  resistance: { a: 0.26, b: 0.26, c: 0.26 },
  reactance: { a: 0.091, b: 0.091, c: 0.091 },
  neutralResistance: 0.03,
  neutralReactance: 0.01,
  voltageLimits: { min: 207, max: 253 },
};

const vuf014 = PhasorCalculator.analyzeVUFIncrementalPQ({ powers: modelForCurrent(0.14).powers, ...feeder }).vufPercent;
const vuf030 = PhasorCalculator.analyzeVUFIncrementalPQ({ powers: modelForCurrent(0.30).powers, ...feeder }).vufPercent;
assert.notEqual(vuf014, vuf030, 'live current 0.14 A -> 0.30 A must update current-state VUF with the same confirmed mask');

console.log('wallbox_live_measurement_vuf_sync_test: PASS');
