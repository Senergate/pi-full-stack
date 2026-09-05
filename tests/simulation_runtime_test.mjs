import SimulationRuntime from '../client/src/SimulationRuntime.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let latestEnergy = null;
let latestBattery = null;
const wallboxStates = new Map();

const onEnergy = data => { latestEnergy = data; };
const onBattery = data => { latestBattery = data; };
const onWallbox = data => { wallboxStates.set(data.id, data.output); };

SimulationRuntime.EnergyMeterService.on('data', onEnergy);
SimulationRuntime.BatteryService.on('data', onBattery);
SimulationRuntime.WallboxService.on('data', onWallbox);
SimulationRuntime.start();

assert(latestEnergy?.simulation_mode === true, 'Simulation data must be explicitly labelled.');
assert(SimulationRuntime.getSnapshot().transport === 'local_only_no_mqtt', 'Simulation transport must be local-only.');

SimulationRuntime.setScenario('balanced');
let snap = SimulationRuntime.getSnapshot();
assert(snap.projectedCurrentsA.a === 35 && snap.projectedCurrentsA.b === 35 && snap.projectedCurrentsA.c === 35,
  'Balanced scenario must start at 35/35/35 A projected.');

SimulationRuntime.BatteryService.set(true);
snap = SimulationRuntime.getSnapshot();
assert(latestBattery?.output === true, 'Battery charging=true must produce local output=true.');
assert(snap.projectedCurrentsA.c === 55, 'Battery charging must add 20 A to virtual L3.');

SimulationRuntime.WallboxService.set(0, true);
snap = SimulationRuntime.getSnapshot();
assert(wallboxStates.get(0) === true, 'Wallbox R0 must update locally.');
assert(snap.projectedCurrentsA.b === 51, 'Wallbox R0 must add 16 A to virtual L2.');

SimulationRuntime.EspService.heatpump({ mode: 'start', level: 2, target_hz: 20 }); // level 2 of 5 => +14 A
snap = SimulationRuntime.getSnapshot();
assert(snap.heatpumpLevel === 2, 'Heatpump level 2 must map to level 2.');
assert(snap.projectedCurrentsA.a === 49, 'Heatpump level 2 must add 14 A to virtual L1.');


SimulationRuntime.setScenario('ai_vuf_over_2');
snap = SimulationRuntime.getSnapshot();
assert(snap.heatpumpLevel === 5, 'AI test scenario must preload heatpump level 5.');
assert(snap.wallbox.r0 === true && snap.wallbox.r1 === false, 'AI test scenario must preload wallbox level 1.');
assert(snap.projectedCurrentsA.a === 295 && snap.projectedCurrentsA.b === 100 && snap.projectedCurrentsA.c === 100,
  'AI test scenario must start at 295/100/100 A projected.');

SimulationRuntime.dropPhase('c');
assert(latestEnergy?.c_current === null, 'Dropped L3 must publish c_current=null, never 0 A.');
assert(latestEnergy?.c_pf === null && latestEnergy?.c_voltage === null, 'Dropped L3 must invalidate related inputs.');

SimulationRuntime.restorePhase('c');
assert(latestEnergy?.c_current !== null, 'Restored L3 must publish data again.');

SimulationRuntime.reset();
snap = SimulationRuntime.getSnapshot();
assert(snap.batteryCharging === false, 'Reset must switch local battery charging off.');
assert(snap.wallbox.r0 === false && snap.wallbox.r1 === false, 'Reset must clear local wallbox relays.');

SimulationRuntime.stop();
SimulationRuntime.EnergyMeterService.off('data', onEnergy);
SimulationRuntime.BatteryService.off('data', onBattery);
SimulationRuntime.WallboxService.off('data', onWallbox);

console.log('simulation runtime tests: PASS');
console.log('transport =', snap.transport);
console.log('fault injection = null -> NO DATA input path');
console.log('no real MQTT/Socket.IO actuator transport is imported by SimulationRuntime');
