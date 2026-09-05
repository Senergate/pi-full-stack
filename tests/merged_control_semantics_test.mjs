import SimulationRuntime from '../client/src/SimulationRuntime.js';
import EspService from '../server/EspService.js';
import PhasorCalculator from '../client/src/components/PhasorCalculator.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Server-side Branch-A compatibility path must preserve STOP vs ZERO_HOLD.
const mqttCalls = [];
EspService.server = {
  services: new Map([
    ['MqttService', {
      bus: {
        publish(topic, payload) { mqttCalls.push([topic, payload]); },
        subscribe() {},
        on() {},
      },
    }],
  ]),
};
await EspService.heatpump(0, 'stop');
await EspService.heatpump(0, 'zero_hold');
await EspService.heatpump(0.6, 'start');
assert(mqttCalls[0]?.[1] === 'stop,0', `OFF/STOP must publish stop,0, got ${mqttCalls[0]?.[1]}`);
assert(mqttCalls[1]?.[1] === 'start,0', `ZERO_HOLD must publish start,0, got ${mqttCalls[1]?.[1]}`);
assert(mqttCalls[2]?.[1] === 'start,6', `load=0.6 must publish start,6 with legacy normalized API, got ${mqttCalls[2]?.[1]}`);

// Simulation path accepts the same mode argument without MQTT side effects.
SimulationRuntime.start();
SimulationRuntime.EspService.heatpump(0.8, 'start');
assert(SimulationRuntime.getSnapshot().heatpumpLevel === 4, 'Simulation heatpump 0.8/start must map to level 4.');
SimulationRuntime.EspService.heatpump(0, 'zero_hold');
assert(SimulationRuntime.getSnapshot().heatpumpLevel === 0, 'Simulation zero_hold must place heatpump at level 0.');
SimulationRuntime.stop();

// Non-ideal source angles must be used as voltage references for current phasors.
const result = PhasorCalculator.analyzeVUF({
  currents: { a: 10, b: 10, c: 10 },
  powerFactors: { a: 1, b: 1, c: 1 },
  sourceVoltages: { a: 230, b: 230, c: 230 },
  sourceAngles: { a: 0, b: -120.2, c: 119.8 },
  resistance: { a: 0.05, b: 0.05, c: 0.05 },
  reactance: { a: 0.02, b: 0.02, c: 0.02 },
});
const angleOf = v => (Math.atan2(v.im, v.re) * 180) / Math.PI;
assert(Math.abs(angleOf(result.currentPhasors.b) - (-120.2)) < 1e-9, 'Current phasor B must follow source angle B when PF=1.');
assert(Math.abs(angleOf(result.currentPhasors.c) - 119.8) < 1e-9, 'Current phasor C must follow source angle C when PF=1.');

console.log('merged control semantics tests: PASS');
