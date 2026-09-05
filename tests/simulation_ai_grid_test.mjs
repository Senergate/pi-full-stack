import SimulationRuntime from '../client/src/SimulationRuntime.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const OFFSETS = { a: 0.24, b: 0.19, c: 0.13 };
const PROJECTION = { a: 800, b: 400, c: 230 };

let latestEnergy = null;
const onEnergy = data => { latestEnergy = data; };
SimulationRuntime.EnergyMeterService.on('data', onEnergy);
SimulationRuntime.start();
SimulationRuntime.setScenario('ai_vuf_over_2');

const snap = SimulationRuntime.getSnapshot();
assert(snap.heatpumpLevel === 5, 'AI test must start heatpump at level 5.');
assert(snap.wallbox.r0 === true && snap.wallbox.r1 === false, 'AI test must start wallbox at level 1.');
assert(snap.batteryCharging === false, 'AI test must start battery charging OFF.');
assert(
  snap.projectedCurrentsA.a === 295 && snap.projectedCurrentsA.b === 100 && snap.projectedCurrentsA.c === 100,
  `AI test must start at 295/100/100 A, got ${JSON.stringify(snap.projectedCurrentsA)}`
);

const projected = {
  a: Math.max(0, latestEnergy.a_current - OFFSETS.a) * PROJECTION.a,
  b: Math.max(0, latestEnergy.b_current - OFFSETS.b) * PROJECTION.b,
  c: Math.max(0, latestEnergy.c_current - OFFSETS.c) * PROJECTION.c,
};

const common = {
  powerFactors: { a: latestEnergy.a_pf, b: latestEnergy.b_pf, c: latestEnergy.c_pf },
  sourceVoltages: {
    a: latestEnergy.a_voltage + 1.0,
    b: latestEnergy.b_voltage - 1.0,
    c: latestEnergy.c_voltage + 0.5,
  },
  sourceAngles: { a: 0, b: -120.2, c: 119.8 },
  neutralResistance: 0.06,
  neutralReactance: 0.02,
};

const typical = PhasorCalculator.analyzeVUF({
  currents: projected,
  ...common,
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
});
assert(typical.vufPercent > 2, `AI test VUF must exceed 2%, got ${typical.vufPercent}`);
assert(typical.neutralVoltageDrop, 'Neutral impedance model must return neutral voltage displacement.');

const stiff = PhasorCalculator.analyzeVUF({
  currents: projected,
  ...common,
  neutralResistance: 0.02,
  neutralReactance: 0.005,
  resistance: { a: 0.03, b: 0.03, c: 0.03 },
  reactance: { a: 0.01, b: 0.01, c: 0.01 },
});

const weak = PhasorCalculator.analyzeVUF({
  currents: projected,
  ...common,
  neutralResistance: 0.10,
  neutralReactance: 0.03,
  resistance: { a: 0.12, b: 0.12, c: 0.12 },
  reactance: { a: 0.05, b: 0.05, c: 0.05 },
});
assert(stiff.vufPercent < typical.vufPercent, 'Stiff grid should produce lower Estimated VUF than typical grid.');
assert(weak.vufPercent > typical.vufPercent, 'Weak grid should produce higher Estimated VUF than typical grid.');

SimulationRuntime.EspService.heatpump(0.8); // 5 -> 4
const reduced = SimulationRuntime.getSnapshot().projectedCurrentsA;
const reducedVuf = PhasorCalculator.analyzeVUF({
  currents: reduced,
  ...common,
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
});
assert(reducedVuf.vufPercent < typical.vufPercent, 'Heatpump one-step reduction should improve VUF in AI test scenario.');

SimulationRuntime.EspService.heatpump(0.6); // 4 -> 3
const reduced2 = SimulationRuntime.getSnapshot().projectedCurrentsA;
const reduced2Vuf = PhasorCalculator.analyzeVUF({
  currents: reduced2,
  ...common,
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
});
assert(reduced2Vuf.vufPercent > 2, 'After two allowed heatpump reductions VUF should still be slightly above 2%.');

SimulationRuntime.BatteryService.set(true); // compensation on L3
const compensated = SimulationRuntime.getSnapshot().projectedCurrentsA;
const compensatedVuf = PhasorCalculator.analyzeVUF({
  currents: compensated,
  ...common,
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
});
assert(compensatedVuf.vufPercent < 2, 'Battery compensation should bring the AI test scenario below 2%.');

SimulationRuntime.stop();
SimulationRuntime.EnergyMeterService.off('data', onEnergy);

console.log('simulation AI + grid tests: PASS');
console.log(`stiff VUF   = ${stiff.vufPercent.toFixed(3)} %`);
console.log(`typical VUF = ${typical.vufPercent.toFixed(3)} %`);
console.log(`weak VUF    = ${weak.vufPercent.toFixed(3)} %`);
console.log(`after HP 5->4 VUF = ${reducedVuf.vufPercent.toFixed(3)} %`);
console.log(`after HP 4->3 VUF = ${reduced2Vuf.vufPercent.toFixed(3)} %`);
console.log(`after Battery compensation VUF = ${compensatedVuf.vufPercent.toFixed(3)} %`);
