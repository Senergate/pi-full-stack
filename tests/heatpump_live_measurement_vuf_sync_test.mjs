import assert from 'node:assert/strict';
import {
  HEATPUMP_PHYSICAL_ACTIVE_THRESHOLD_A,
  applyHeatpumpPowerToModel,
  heatpumpPhysicalActiveForMeasurement,
  heatpumpPowerForCurrent,
} from '../client/src/HeatpumpDynamicPowerModel.js';
import {
  DEFAULT_ELECTRICAL_PROFILES,
  modelAssetPower,
  modelBuildingPowers,
} from '../client/src/ElectricalProfileModel.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

assert.equal(HEATPUMP_PHYSICAL_ACTIVE_THRESHOLD_A, 0.02);
assert.equal(heatpumpPhysicalActiveForMeasurement({ currentA: 0.09, fallbackActive: false }), true);
assert.equal(heatpumpPhysicalActiveForMeasurement({ currentA: 0.01, fallbackActive: true }), false);
assert.equal(heatpumpPhysicalActiveForMeasurement({ currentA: null, fallbackActive: true }), true);

const phaseVoltages = { a: 230, b: 230, c: 230 };
const baseModel = modelBuildingPowers({
  profiles: DEFAULT_ELECTRICAL_PROFILES,
  heatpumpLevel: 4, // intentionally held constant
  wallboxMask: 1,
  batteryCharging: false,
  phaseVoltages,
});
const fullHeatpump = modelAssetPower({
  profiles: DEFAULT_ELECTRICAL_PROFILES,
  assetName: 'heatpump',
  state: 5,
  voltageV: phaseVoltages.a,
});

const modelForCurrent = currentA => applyHeatpumpPowerToModel(baseModel, heatpumpPowerForCurrent({
  fullPower: fullHeatpump,
  fallbackPower: baseModel.powers.a,
  currentA,
  referenceMaxA: 0.26,
  active: heatpumpPhysicalActiveForMeasurement({ currentA, fallbackActive: true }),
}));

const feeder = {
  baselineVoltages: phaseVoltages,
  baselineAngles: { a: 0, b: -120, c: 120 },
  resistance: { a: 0.26, b: 0.26, c: 0.26 },
  reactance: { a: 0.091, b: 0.091, c: 0.091 },
  neutralResistance: 0.03,
  neutralReactance: 0.01,
  voltageLimits: { min: 207, max: 253 },
};

const vuf009 = PhasorCalculator.analyzeVUFIncrementalPQ({ powers: modelForCurrent(0.09).powers, ...feeder }).vufPercent;
const vuf024 = PhasorCalculator.analyzeVUFIncrementalPQ({ powers: modelForCurrent(0.24).powers, ...feeder }).vufPercent;
assert.notEqual(vuf009, vuf024, 'live Heatpump current must update current-state VUF while discrete level is unchanged');

console.log('heatpump_live_measurement_vuf_sync_test: PASS');
