import SimulationRuntime from '../client/src/SimulationRuntime.js';
import EspService from '../server/EspService.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Server-side command payloads must preserve STOP vs ZERO_HOLD vs START.
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
await EspService.heatpump({ mode: 'stop', level: 0, target_hz: 0 });
await EspService.heatpump({ mode: 'zero_hold', level: 0, target_hz: 0 });
await EspService.heatpump({ mode: 'start', level: 4, target_hz: 40 });
assert(mqttCalls[0]?.[1] === 'stop,0', `expected stop,0, got ${mqttCalls[0]?.[1]}`);
assert(mqttCalls[1]?.[1] === 'start,0', `expected start,0, got ${mqttCalls[1]?.[1]}`);
assert(mqttCalls[2]?.[1] === 'start,40', `expected start,40, got ${mqttCalls[2]?.[1]}`);

// Simulation path keeps mode compatibility and remains local.
SimulationRuntime.start();
SimulationRuntime.EspService.heatpump({ mode: 'start', level: 4, target_hz: 40 });
assert(SimulationRuntime.getSnapshot().heatpumpLevel === 4, '0.8/start must show simulation heatpump level 4/5');
SimulationRuntime.EspService.heatpump({ mode: 'zero_hold', level: 0, target_hz: 0 });
assert(SimulationRuntime.getSnapshot().heatpumpLevel === 0, 'zero_hold must keep simulation heatpump at level 0');
SimulationRuntime.stop();

console.log('real_state_sync_fix_test: PASS');
