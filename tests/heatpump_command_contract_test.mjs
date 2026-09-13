import EspService, { normalizeHeatpumpCommand } from '../server/EspService.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const cases = [
  [{ mode: 'stop', level: 0, target_hz: 0 }, 'stop,0'],
  [{ mode: 'zero_hold', level: 0, target_hz: 0 }, 'start,0'],
  [{ mode: 'start', level: 1, target_hz: 10 }, 'start,10'],
  [{ mode: 'start', level: 3, target_hz: 30 }, 'start,30'],
  [{ mode: 'start', level: 5, target_hz: 50 }, 'start,50'],
];

for (const [command, payload] of cases) {
  const result = normalizeHeatpumpCommand(command);
  assert(result.accepted === true, `${JSON.stringify(command)} should be accepted`);
  assert(result.payload === payload, `${JSON.stringify(command)} -> ${result.payload}, expected ${payload}`);
}
assert(normalizeHeatpumpCommand(0.8).reason === 'legacy_normalized_load_rejected', 'numeric normalized load must be rejected');

const mqttCalls = [];
EspService.server = { services: new Map([['MqttService', { bus: { publish(topic, payload) { mqttCalls.push([topic, payload]); }, subscribe() {}, on() {} } }]]) };
await EspService.heatpump({ mode: 'stop', level: 0, target_hz: 0 });
await EspService.heatpump({ mode: 'zero_hold', level: 0, target_hz: 0 });
await EspService.heatpump({ mode: 'start', level: 3, target_hz: 30 });
await EspService.heatpump({ mode: 'start', level: 5, target_hz: 50 });
await EspService.heatpump(0.8);
assert(mqttCalls.map(x => x[1]).join('|') === 'stop,0|start,0|start,30|start,50', `unexpected payloads ${JSON.stringify(mqttCalls)}`);

console.log('heatpump_command_contract_test: PASS');
