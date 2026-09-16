import assert from 'node:assert/strict';
import { DEFAULT_ELECTRICAL_PROFILES, modelBuildingPowers } from '../client/src/ElectricalProfileModel.js';
import { wallboxPowerForCurrent } from '../client/src/WallboxDynamicPowerModel.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

const close = (actual, expected, eps = 1e-6) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);

// The fallback candidate model must preserve the measured Wallbox asymmetry:
// mask1 = 0.14/0.42, mask2 = 0.30/0.42, mask3 = 1.0.
const base = { profiles: DEFAULT_ELECTRICAL_PROFILES, heatpumpLevel: 0, batteryCharging: false, phaseVoltages: { a: 230, b: 230, c: 230 } };
const m1 = modelBuildingPowers({ ...base, wallboxMask: 1 });
const m2 = modelBuildingPowers({ ...base, wallboxMask: 2 });
const m3 = modelBuildingPowers({ ...base, wallboxMask: 3 });
assert.ok(m1.powers.b.p < m2.powers.b.p, 'mask1 and mask2 must not have identical fallback P/Q');
close(m1.powers.b.p / m3.powers.b.p, 0.333333, 1e-5);
close(m2.powers.b.p / m3.powers.b.p, 0.714286, 1e-5);

const feeder = {
  baselineVoltages: { a: 230, b: 230, c: 230 },
  baselineAngles: { a: 0, b: -120, c: 120 },
  resistance: { a: 0.26, b: 0.26, c: 0.26 },
  reactance: { a: 0.091, b: 0.091, c: 0.091 },
  neutralResistance: 0.03,
  neutralReactance: 0.01,
  voltageLimits: { min: 207, max: 253 },
};
const vuf1 = PhasorCalculator.analyzeVUFIncrementalPQ({ powers: m1.powers, ...feeder }).vufPercent;
const vuf2 = PhasorCalculator.analyzeVUFIncrementalPQ({ powers: m2.powers, ...feeder }).vufPercent;
assert.notEqual(vuf1, vuf2, 'mask1 and mask2 must produce different predicted VUF values');

// Current-state dynamic P/Q follows the same live current ratios as CurrentCard.
const full = { p: 1000, q: 100 };
const p014 = wallboxPowerForCurrent({ fullPower: full, fallbackPower: { p: 0, q: 0 }, currentA: 0.14, referenceMaxA: 0.42, active: true });
const p030 = wallboxPowerForCurrent({ fullPower: full, fallbackPower: { p: 0, q: 0 }, currentA: 0.30, referenceMaxA: 0.42, active: true });
close(p014.ratio, 1/3, 1e-9);
close(p030.ratio, 5/7, 1e-9);
assert.ok(p030.p > p014.p);

const off = wallboxPowerForCurrent({ fullPower: full, currentA: 0.30, referenceMaxA: 0.42, active: false });
assert.deepEqual({ p: off.p, q: off.q, ratio: off.ratio }, { p: 0, q: 0, ratio: 0 });

const saturated = wallboxPowerForCurrent({ fullPower: full, currentA: 0.50, referenceMaxA: 0.42, active: true });
close(saturated.ratio, 1);
close(saturated.p, 1000);

console.log('wallbox_dynamic_power_model_test: PASS');
