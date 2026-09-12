import PhasorCalculator from '../client/src/components/PhasorCalculator.js';
import {
  DEFAULT_ELECTRICAL_PROFILES,
  modelBuildingPowers,
} from '../client/src/ElectricalProfileModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const feeder = {
  resistance: { a: 0.26, b: 0.26, c: 0.26 },
  reactance: { a: 0.091, b: 0.091, c: 0.091 },
  neutralResistance: 0.03,
  neutralReactance: 0.01,
};

const analyze = state => {
  const model = modelBuildingPowers({
    profiles: DEFAULT_ELECTRICAL_PROFILES,
    ...state,
    phaseVoltages: { a: 230, b: 230, c: 230 },
  });
  return PhasorCalculator.analyzeVUFIncrementalPQ({
    powers: model.powers,
    baselineVoltages: { a: 230, b: 230, c: 230 },
    baselineAngles: { a: 0, b: -120, c: 120 },
    ...feeder,
    voltageLimits: { min: 207, max: 253 },
  });
};

const idle = analyze({ heatpumpLevel: 0, wallboxMask: 0, batteryCharging: false });
const severe = analyze({ heatpumpLevel: 0, wallboxMask: 3, batteryCharging: false });
const compensated = analyze({ heatpumpLevel: 5, wallboxMask: 3, batteryCharging: true });

assert(Math.abs(idle.vufPercent) < 1e-9, `Ideal OFF baseline should be ~0% VUF, got ${idle.vufPercent}`);
assert(Number.isFinite(severe.vufPercent), `Weak-Grid Demo VUF must remain calculable, got ${severe.vufPercent}`);
assert(severe.voltageSafe === true, `Demo >2.5% point must remain inside 207–253 V guard, got ${JSON.stringify(severe.loadVoltageMagnitudes)}`);
assert(compensated.vufPercent < severe.vufPercent, 'Adding L1/L3 flexible capacity should reduce the severe L2-only VUF scenario.');

console.log('real_hardware_vuf_demo_test: PASS');
console.log(`severe WB-only VUF=${severe.vufPercent.toFixed(3)}%, voltages=${JSON.stringify(severe.loadVoltageMagnitudes)}`);
console.log(`all-max VUF=${compensated.vufPercent.toFixed(3)}%`);
