import { deriveHeatpumpStatus } from '../client/src/HeatpumpStatusAdapter.js';
import { projectBuildingCurrents } from '../client/src/BuildingTwinModel.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const grid = {
  powerFactors: { a: 0.96, b: 0.98, c: 0.97 },
  sourceVoltages: { a: 230, b: 230, c: 230 },
  sourceAngles: { a: 0, b: -120.2, c: 119.8 },
  resistance: { a: 0.40, b: 0.40, c: 0.40 },
  reactance: { a: 0.15, b: 0.15, c: 0.15 },
  neutralResistance: 0.30,
  neutralReactance: 0.10,
};

const before = projectBuildingCurrents({ heatpumpLevel: 0, wallboxMask: 0, batteryCharging: false });
const beforeResult = PhasorCalculator.analyzeVUF({ currents: before, ...grid });

const status = deriveHeatpumpStatus({
  state: 'STARTING',
  target_frequency_hz: 40,
  actual_output_frequency_hz: 0,
  lfrd_reg8602: 400,
  rfrd_reg8604: 0,
});
const after = projectBuildingCurrents({ heatpumpLevel: status.modelLevel, wallboxMask: 0, batteryCharging: false });
const afterResult = PhasorCalculator.analyzeVUF({ currents: after, ...grid });

assert(status.modelLevel === 4, 'Branch-A STARTING target 40 must become model level 4.');
assert(after.a === 28, `L1 modeled current must become 28 A, got ${after.a}`);
assert(afterResult.vufPercent !== beforeResult.vufPercent, 'VUF must change after Branch-A target changes.');
assert(afterResult.loadVoltageMagnitudes.a !== beforeResult.loadVoltageMagnitudes.a, 'Voltage phasor magnitude must change after Branch-A target changes.');

console.log('heatpump_phasor_vuf_update_test: PASS');
console.log(`before L1=${before.a}A, VUF=${beforeResult.vufPercent.toFixed(3)}%`);
console.log(`after L1=${after.a}A, VUF=${afterResult.vufPercent.toFixed(3)}%`);
