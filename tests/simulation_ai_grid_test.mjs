import SimulationRuntime from '../client/src/SimulationRuntime.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let latestEnergy = null;
const onEnergy = data => { latestEnergy = data; };
SimulationRuntime.EnergyMeterService.on('data', onEnergy);
SimulationRuntime.start();
SimulationRuntime.setScenario('ai_vuf_over_2');

let snap = SimulationRuntime.getSnapshot();
assert(snap.heatpumpLevel === 5, 'AI test must start heatpump at level 5.');
assert(snap.wallbox.r0 === false && snap.wallbox.r1 === false, 'AI test must start with both wallbox relays OFF.');
assert(snap.batteryCharging === false, 'AI test must start battery charging OFF.');
assert(
  snap.projectedCurrentsA.a === 295 && snap.projectedCurrentsA.b === 100 && snap.projectedCurrentsA.c === 100,
  `AI test must start at 295/100/100 A, got ${JSON.stringify(snap.projectedCurrentsA)}`
);

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
  resistance: { a: 0.08, b: 0.08, c: 0.08 },
  reactance: { a: 0.03, b: 0.03, c: 0.03 },
};

const vufFor = currents => PhasorCalculator.analyzeVUF({ currents, ...common }).vufPercent;

const initialVuf = vufFor(snap.projectedCurrentsA);
assert(initialVuf > 2, `Initial building-scale VUF must exceed 2%, got ${initialVuf}`);

SimulationRuntime.WallboxService.set(0, true); // one resistor -> two wallboxes
snap = SimulationRuntime.getSnapshot();
assert(snap.projectedCurrentsA.b === 132, 'First Branch-B relay must represent two wallboxes and move L2 to 132 A.');
const oneRelayVuf = vufFor(snap.projectedCurrentsA);
assert(oneRelayVuf > 2 && oneRelayVuf < initialVuf,
  `First Branch-B relay should improve VUF but remain slightly >2%, got ${oneRelayVuf}`);

SimulationRuntime.WallboxService.set(1, true); // second resistor -> two more wallboxes, four total
snap = SimulationRuntime.getSnapshot();
assert(snap.projectedCurrentsA.b === 164, 'Both Branch-B relays must represent four wallboxes and move L2 to 164 A.');
const twoRelayVuf = vufFor(snap.projectedCurrentsA);
assert(twoRelayVuf < 2, `Four equivalent wallboxes should bring VUF below 2%, got ${twoRelayVuf}`);

SimulationRuntime.shutdown();
snap = SimulationRuntime.getSnapshot();
assert(snap.heatpumpLevel === 0, 'Shutdown must stop simulated Branch A.');
assert(snap.wallbox.r0 === false && snap.wallbox.r1 === false, 'Shutdown must switch both simulated Branch-B relays OFF.');
assert(snap.batteryCharging === false, 'Shutdown must switch simulated battery OFF.');

SimulationRuntime.EnergyMeterService.off('data', onEnergy);

console.log('simulation AI + building-twin tests: PASS');
console.log(`initial VUF = ${initialVuf.toFixed(3)} %`);
console.log(`1 relay / 2 wallboxes VUF = ${oneRelayVuf.toFixed(3)} %`);
console.log(`2 relays / 4 wallboxes VUF = ${twoRelayVuf.toFixed(3)} %`);
