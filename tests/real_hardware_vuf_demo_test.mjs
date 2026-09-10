import PhasorCalculator from '../client/src/components/PhasorCalculator.js';
import { projectBuildingCurrents } from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const common = {
  powerFactors: { a: 0.96, b: 0.98, c: 0.97 },
  sourceVoltages: { a: 230, b: 230, c: 230 },
  sourceAngles: { a: 0, b: -120, c: 120 },
  resistance: { a: 0.40, b: 0.40, c: 0.40 },
  reactance: { a: 0.15, b: 0.15, c: 0.15 },
  neutralResistance: 0.30,
  neutralReactance: 0.10,
};

const vuf = currents => PhasorCalculator.analyzeVUF({ currents, ...common }).vufPercent;
const idle = projectBuildingCurrents({ heatpumpLevel: 0, wallboxMask: 0, batteryCharging: false });
const branchA = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 0, batteryCharging: false });
const compensated = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 1, batteryCharging: true });

assert(idle.a === 0 && idle.b === 0 && idle.c === 0, 'Idle projected currents must be zero.');
assert(vuf(branchA) > 2.0, `Demo feeder + equivalent Branch A must demonstrate >2% modeled VUF, got ${vuf(branchA)}`);
assert(vuf(compensated) < 1.0, `Branch B + battery compensation should strongly reduce modeled VUF, got ${vuf(compensated)}`);

console.log('real_hardware_vuf_demo_test: PASS');
console.log(`idle -> ${JSON.stringify(idle)}`);
console.log(`Branch A full -> ${JSON.stringify(branchA)}, VUF=${vuf(branchA).toFixed(3)}%`);
console.log(`Branch B R0 + battery -> ${JSON.stringify(compensated)}, VUF=${vuf(compensated).toFixed(3)}%`);
