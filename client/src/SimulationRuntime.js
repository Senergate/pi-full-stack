/*
 * Senergate local Digital-Twin runtime
 * ------------------------------------
 * No Socket.IO, no MQTT, no real actuator side effects.
 */

import {
  BUILDING_TWIN_CONFIG,
  projectBuildingCurrents,
  wallboxMaskFromRelays,
} from './BuildingTwinModel.js';

const CURRENT_ZERO_OFFSET_A = { a: 0.24, b: 0.19, c: 0.13 };
// Simulation emits a small sensor-like current with one COMMON scale only.
// The building projection itself comes from BuildingTwinModel.js.
const SIM_SENSOR_BUILDING_SCALE = 400;

const HEATPUMP_LEVELS = BUILDING_TWIN_CONFIG.heatpumpLevels;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });

const createEmitter = () => {
  const listeners = new Map();
  return {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) listener(payload);
    },
  };
};

const energyEmitter = createEmitter();
const wallboxEmitter = createEmitter();
const batteryEmitter = createEmitter();
const branchAEmitter = createEmitter();
const branchBEmitter = createEmitter();

const scenarios = {
  demo_idle: {
    baseProjectedA: { ...BUILDING_TWIN_CONFIG.baseCurrentA },
    devices: { heatpumpLevel: 0, wallbox: { r0: false, r1: false }, batteryCharging: false },
  },
  balanced: {
    baseProjectedA: { a: 35, b: 35, c: 35 },
    devices: { heatpumpLevel: 0, wallbox: { r0: false, r1: false }, batteryCharging: false },
  },
  l1_overload: {
    baseProjectedA: { a: 70, b: 28, c: 42 },
    devices: { heatpumpLevel: 0, wallbox: { r0: false, r1: false }, batteryCharging: false },
  },
  l2_overload: {
    baseProjectedA: { a: 34, b: 72, c: 40 },
    devices: { heatpumpLevel: 0, wallbox: { r0: false, r1: false }, batteryCharging: false },
  },
  ai_vuf_over_2: {
    // Reproducible demo: Branch A full load pushes the building-scale VUF over 2%.
    // Branch B relay 0/1 then represent 2/4 wallboxes and can compensate on L2.
    baseProjectedA: { ...BUILDING_TWIN_CONFIG.baseCurrentA },
    devices: { heatpumpLevel: 5, wallbox: { r0: false, r1: false }, batteryCharging: false },
  },
};

const state = {
  running: false,
  timer: null,
  scenario: 'demo_idle',
  baseProjectedA: { ...scenarios.demo_idle.baseProjectedA },
  phaseAvailable: { a: true, b: true, c: true },
  heatpumpLevel: 0,
  wallbox: { r0: false, r1: false },
  batteryCharging: false,
};

const finiteNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clampInt = (value, min, max) => {
  const n = finiteNumber(value);
  return n === null ? min : Math.max(min, Math.min(max, Math.round(n)));
};

const levelToHz = level => HEATPUMP_LEVEL_TO_HZ[clampInt(level, 0, HEATPUMP_LEVELS)] ?? 0;

const normalizeHeatpumpCommand = command => {
  if (command === null || command === undefined || typeof command !== 'object' || Array.isArray(command)) {
    return { accepted: false, reason: 'legacy_normalized_load_rejected', simulation: true };
  }

  const mode = String(command.mode ?? '').toLowerCase();
  const level = clampInt(command.level, 0, HEATPUMP_LEVELS);
  const targetHz = finiteNumber(command.target_hz ?? command.targetHz) ?? levelToHz(level);

  if (mode === 'stop') return { accepted: true, mode, level: 0, target_hz: 0, simulation: true };
  if (mode === 'zero_hold') return { accepted: true, mode, level: 0, target_hz: 0, simulation: true };

  if (mode === 'start') {
    if (level < 1 || level > HEATPUMP_LEVELS) return { accepted: false, reason: 'invalid_heatpump_level', simulation: true };
    if (!Number.isFinite(targetHz) || targetHz <= 2 || targetHz > 50) return { accepted: false, reason: 'invalid_target_hz', simulation: true };
    return { accepted: true, mode, level, target_hz: targetHz, simulation: true };
  }

  return { accepted: false, reason: 'invalid_heatpump_mode', simulation: true };
};

const projectedCurrents = () => projectBuildingCurrents({
  baseCurrentA: state.baseProjectedA,
  heatpumpLevel: state.heatpumpLevel,
  wallboxMask: wallboxMaskFromRelays(state.wallbox.r0, state.wallbox.r1),
  batteryCharging: state.batteryCharging,
});

const rawEnergyPayload = () => {
  const projected = projectedCurrents();
  const measured = {
    a: projected.a / SIM_SENSOR_BUILDING_SCALE,
    b: projected.b / SIM_SENSOR_BUILDING_SCALE,
    c: projected.c / SIM_SENSOR_BUILDING_SCALE,
  };

  const currentFor = phase => state.phaseAvailable[phase] ? measured[phase] + CURRENT_ZERO_OFFSET_A[phase] : null;
  const availableValue = (phase, value) => state.phaseAvailable[phase] ? value : null;

  return {
    source_type: 'simulated_sensor',
    simulation_mode: true,
    simulation_scenario: state.scenario,
    ts_pi: Date.now() / 1000,
    a_current: currentFor('a'),
    b_current: currentFor('b'),
    c_current: currentFor('c'),
    a_pf: availableValue('a', 0.96),
    b_pf: availableValue('b', 0.98),
    c_pf: availableValue('c', 0.97),
    a_voltage: availableValue('a', 230.4),
    b_voltage: availableValue('b', 229.8),
    c_voltage: availableValue('c', 230.1),
  };
};

const heatpumpStatusPayload = () => {
  const hz = levelToHz(state.heatpumpLevel);
  return {
    simulation: true,
    state: state.heatpumpLevel > 0 ? 'RUNNING' : 'STOP',
    heatpump_level: state.heatpumpLevel,
    target_frequency_hz: hz,
    actual_output_frequency_hz: hz,
  };
};

const emitEnergy = () => energyEmitter.emit('data', rawEnergyPayload());
const emitHeatpumpStatus = () => branchAEmitter.emit('branchA', heatpumpStatusPayload());
const emitBranchBStatus = () => branchBEmitter.emit('branchB', {
  simulation: true,
  state: 'ACTIVE',
  relay0: state.wallbox.r0,
  relay1: state.wallbox.r1,
});

const emitDeviceState = () => {
  wallboxEmitter.emit('data', { id: 0, output: state.wallbox.r0, simulation: true });
  wallboxEmitter.emit('data', { id: 1, output: state.wallbox.r1, simulation: true });
  batteryEmitter.emit('data', { id: 0, output: state.batteryCharging, simulation: true });
  emitHeatpumpStatus();
  emitBranchBStatus();
};

const emitAll = () => {
  emitDeviceState();
  emitEnergy();
};

const scheduleClosedLoopUpdate = () => {
  setTimeout(() => {
    if (state.running) emitEnergy();
  }, 150);
};

const applyScenario = name => {
  const scenario = scenarios[name];
  if (!scenario) return false;

  state.scenario = name;
  state.baseProjectedA = { ...scenario.baseProjectedA };
  state.phaseAvailable = { a: true, b: true, c: true };
  state.heatpumpLevel = scenario.devices.heatpumpLevel;
  state.wallbox = { ...scenario.devices.wallbox };
  state.batteryCharging = scenario.devices.batteryCharging;
  emitAll();
  return true;
};

const SimulationRuntime = {
  EnergyMeterService: { on: energyEmitter.on, off: energyEmitter.off, requestUpdate: emitEnergy },

  WallboxService: {
    on: wallboxEmitter.on,
    off: wallboxEmitter.off,
    requestUpdate: emitDeviceState,
    set(id, output) {
      const next = output === true;
      if (id === 0) state.wallbox.r0 = next;
      else if (id === 1) state.wallbox.r1 = next;
      else return { accepted: false, reason: 'invalid_relay_id', simulation: true };
      wallboxEmitter.emit('data', { id, output: next, simulation: true });
      emitBranchBStatus();
      scheduleClosedLoopUpdate();
      return { accepted: true, id, state: next, simulation: true };
    },
  },

  BatteryService: {
    on: batteryEmitter.on,
    off: batteryEmitter.off,
    requestUpdate: emitDeviceState,
    set(charging) {
      state.batteryCharging = charging === true;
      batteryEmitter.emit('data', { id: 0, output: state.batteryCharging, simulation: true });
      scheduleClosedLoopUpdate();
      return { accepted: true, charging: state.batteryCharging, simulation: true };
    },
  },

  EspService: {
    on: branchAEmitter.on,
    off: branchAEmitter.off,
    heatpump(command) {
      const normalized = normalizeHeatpumpCommand(command);
      if (!normalized.accepted) return normalized;
      state.heatpumpLevel = normalized.mode === 'start' ? normalized.level : 0;
      emitHeatpumpStatus();
      scheduleClosedLoopUpdate();
      return { ...normalized, heatpumpLevel: state.heatpumpLevel };
    },
    requestUpdate() {
      emitHeatpumpStatus();
      return { accepted: true, simulation: true };
    },
  },

  BranchBService: {
    on: branchBEmitter.on,
    off: branchBEmitter.off,
  },

  start() {
    if (state.running) { emitAll(); return; }
    state.running = true;
    emitAll();
    state.timer = setInterval(emitEnergy, 1000);
  },

  stop() {
    state.running = false;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  },

  setScenario: applyScenario,

  dropPhase(phase) {
    if (!Object.hasOwn(state.phaseAvailable, phase)) return false;
    state.phaseAvailable[phase] = false;
    emitEnergy();
    return true;
  },

  restorePhase(phase) {
    if (!Object.hasOwn(state.phaseAvailable, phase)) return false;
    state.phaseAvailable[phase] = true;
    emitEnergy();
    return true;
  },

  reset() { applyScenario('demo_idle'); },

  resetAllOff() { return applyScenario('demo_idle'); },

  shutdown() {
    applyScenario('demo_idle');
    this.stop();
  },

  getSnapshot() {
    return JSON.parse(JSON.stringify({
      scenario: state.scenario,
      phaseAvailable: state.phaseAvailable,
      heatpumpLevel: state.heatpumpLevel,
      wallbox: state.wallbox,
      batteryCharging: state.batteryCharging,
      projectedCurrentsA: projectedCurrents(),
      equivalentDevices: {
        branchAHeatpumps: BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps,
        branchBWallboxesPerRelay: BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay,
      },
      transport: 'local_only_no_mqtt',
    }));
  },
};

export default SimulationRuntime;
