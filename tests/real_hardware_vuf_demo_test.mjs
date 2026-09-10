import PhasorCalculator from '../client/src/components/PhasorCalculator.js';
import { projectBuildingCurrents } from '../client/src/BuildingTwinModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const common = {
  powerFactors: { a: 0.96, b: 0.98, c: 0.97 },
  sourceVoltages: { a: 230, b: 230, c: 230 },
  sourceAngles: { a: 0, b: -120.2, c: 119.8 },
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
  neutralResistance: 0.06,
  neutralReactance: 0.02,
};

const vuf = currents => PhasorCalculator.analyzeVUF({ currents, ...common }).vufPercent;
const start = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 0, batteryCharging: false });
const oneRelay = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 1, batteryCharging: false });
const twoRelays = projectBuildingCurrents({ heatpumpLevel: 5, wallboxMask: 3, batteryCharging: false });

const startVuf = vuf(start);
const oneRelayVuf = vuf(oneRelay);
const twoRelaysVuf = vuf(twoRelays);

assert(startVuf > 2.0, `Branch-A demo start must exceed 2% VUF, got ${startVuf}`);
assert(oneRelayVuf < startVuf, 'First Branch-B relay must improve VUF.');
assert(twoRelaysVuf < 2.0, `Four equivalent wallboxes must bring nominal demo VUF below 2%, got ${twoRelaysVuf}`);

console.log('real_hardware_vuf_demo_test: PASS');
console.log(`start 275/100/100 A -> ${startVuf.toFixed(3)} %`);
console.log(`relay0 275/132/100 A -> ${oneRelayVuf.toFixed(3)} %`);
console.log(`relay0+1 275/164/100 A -> ${twoRelaysVuf.toFixed(3)} %`);
