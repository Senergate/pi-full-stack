import PhasorCalculator from '../client/src/components/PhasorCalculator.js';
import BatteryService from '../server/BatteryService.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1) Balanced three-phase input remains valid.
const balanced = PhasorCalculator.analyze(
  { a: 10, b: 10, c: 10 },
  { a: 0, b: -120, c: 120 },
);
assert(
  balanced.cufPercent !== null && Math.abs(balanced.cufPercent) < 1e-9,
  `Balanced input should produce CUF≈0, got ${balanced.cufPercent}`,
);

// 2) Missing current must never become 0 A.
const missingCurrent = PhasorCalculator.analyze(
  { a: 10, b: 10, c: null },
  { a: 0, b: -120, c: 120 },
);
assert(missingCurrent.cufPercent === null, 'Missing current must invalidate CUF.');
assert(Boolean(missingCurrent.error), 'Missing current must return an error.');

// 3) Missing VUF input must fail closed.
const missingVuf = PhasorCalculator.analyzeVUF({
  currents: { a: 10, b: 10, c: null },
  powerFactors: { a: 1, b: 1, c: 1 },
  sourceVoltages: { a: 230, b: 230, c: 230 },
  sourceAngles: { a: 0, b: -120, c: 120 },
  resistance: { a: 0.05, b: 0.05, c: 0.05 },
  reactance: { a: 0.02, b: 0.02, c: 0.02 },
});
assert(missingVuf.vufPercent === null, 'Missing VUF input must not become 0%.');
assert(Boolean(missingVuf.error), 'Missing VUF input must return an error.');

// 4) Physical Branch-C Boolean means charging, not discharging.
const mqttCalls = [];
BatteryService.server = {
  services: new Map([
    ['MqttService', {
      bus: {
        publish(topic, payload) {
          mqttCalls.push([topic, payload]);
        },
      },
    }],
  ]),
};
BatteryService.set(true);
BatteryService.set(false);
assert(mqttCalls[0]?.[1] === 'on', 'charging=true must publish ON.');
assert(mqttCalls[1]?.[1] === 'off', 'charging=false must publish OFF.');

console.log('bugfix3 smoke tests: PASS');
console.log(`balanced CUF = ${balanced.cufPercent}`);
console.log(`missing-current CUF = ${missingCurrent.cufPercent}`);
console.log(`missing-input VUF = ${missingVuf.vufPercent}`);
console.log('battery: charging=true -> on, charging=false -> off');
