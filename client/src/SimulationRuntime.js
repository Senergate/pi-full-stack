/*
 * Senergate local Digital-Twin runtime
 * ------------------------------------
 * This module deliberately has NO dependency on App.js, Socket.IO, MQTT or
 * any server-side service. In SIMULATION mode every actuator command ends
 * here and only updates local model state.
 */

const CURRENT_ZERO_OFFSET_A = { a: 0.24, b: 0.19, c: 0.13 };
const CURRENT_PROJECTION_FACTOR = { a: 800, b: 400, c: 230 };

const HEATPUMP_MAX_CURRENT_A = 35;
const HEATPUMP_LEVELS = 5;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });
const WALLBOX_R0_CURRENT_A = 16;
const WALLBOX_R1_CURRENT_A = 16;
const BATTERY_CHARGE_CURRENT_A = 20;

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

/*
 * Scenario values are BUILDING-SCALE projected base currents.
 * They are Digital-Twin parameters, not measured building currents.
 *
 * ai_vuf_over_2 is intentionally fixed and reproducible. With the dashboard's
 * "Typical feeder / MODELED" grid preset it starts at roughly 2.2...2.4 %
 * Estimated VUF, depending on the current source-voltage/PF assumptions.
 * The preset also starts controllable devices in a state that lets the agent
 * demonstrate the complete reduction -> compensation closed loop.
 */
const scenarios = {
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
    // Base + devices => L1/L2/L3 = 295/100/100 A at scenario start.
    baseProjectedA: { a: 260, b: 84, c: 100 },
    devices: { heatpumpLevel: 5, wallbox: { r0: true, r1: false }, batteryCharging: false },
  },
};

const state = {
  running: false,
  timer: null,
  scenario: 'l1_overload',
  baseProjectedA: { ...scenarios.l1_overload.baseProjectedA },
  phaseAvailable: { a: true, b: true, c: true },
  heatpumpLevel: 0,
  wallbox: { r0: false, r1: false },
  batteryCharging: false,
};

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
};

const projectedCurrents = () => ({
  a:
    state.baseProjectedA.a +
    state.heatpumpLevel * (HEATPUMP_MAX_CURRENT_A / HEATPUMP_LEVELS),
  b:
    state.baseProjectedA.b +
    (state.wallbox.r0 ? WALLBOX_R0_CURRENT_A : 0) +
    (state.wallbox.r1 ? WALLBOX_R1_CURRENT_A : 0),
  c:
    state.baseProjectedA.c +
    (state.batteryCharging ? BATTERY_CHARGE_CURRENT_A : 0),
});

const finiteNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const levelToHz = level => HEATPUMP_LEVEL_TO_HZ[clampInt(level, 0, HEATPUMP_LEVELS)] ?? 0;

const hzToLevel = hz => {
  const parsed = finiteNumber(hz);
  if (parsed === null || parsed <= 2) return 0;
  return clampInt(Math.round(parsed / 10), 1, HEATPUMP_LEVELS);
};

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

const heatpumpStatusPayload = () => {
  const targetHz = levelToHz(state.heatpumpLevel);
  return {
    simulation: true,
    state: state.heatpumpLevel > 0 ? 'RUNNING' : 'STOP',
    heatpump_level: state.heatpumpLevel,
    target_frequency_hz: targetHz,
    actual_output_frequency_hz: targetHz,
  };
};

const emitHeatpumpStatus = () => branchAEmitter.emit('branchA', heatpumpStatusPayload());

const rawEnergyPayload = () => {
  const projected = projectedCurrents();
  const measured = {
    a: projected.a / CURRENT_PROJECTION_FACTOR.a,
    b: projected.b / CURRENT_PROJECTION_FACTOR.b,
    c: projected.c / CURRENT_PROJECTION_FACTOR.c,
  };

  const currentFor = phase =>
    state.phaseAvailable[phase]
      ? measured[phase] + CURRENT_ZERO_OFFSET_A[phase]
      : null;

  const availableValue = (phase, value) =>
    state.phaseAvailable[phase] ? value : null;

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

const emitEnergy = () => energyEmitter.emit('data', rawEnergyPayload());

const emitDeviceState = () => {
  wallboxEmitter.emit('data', { id: 0, output: state.wallbox.r0, simulation: true });
  wallboxEmitter.emit('data', { id: 1, output: state.wallbox.r1, simulation: true });
  batteryEmitter.emit('data', { output: state.batteryCharging, simulation: true });
  emitHeatpumpStatus();
};

const emitAll = () => {
  emitDeviceState();
  emitEnergy();
};

const scheduleClosedLoopUpdate = () => {
  // A small local delay makes the software twin behave more like a physical
  // command -> plant -> measurement loop without contacting any real device.
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
  EnergyMeterService: {
    on: energyEmitter.on,
    off: energyEmitter.off,
    requestUpdate: emitEnergy,
  },

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
      scheduleClosedLoopUpdate();
      return { accepted: true, simulation: true };
    },
  },

  BatteryService: {
    on: batteryEmitter.on,
    off: batteryEmitter.off,
    requestUpdate: emitDeviceState,
    set(charging) {
      state.batteryCharging = charging === true;
      batteryEmitter.emit('data', { output: state.batteryCharging, simulation: true });
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

      if (normalized.mode === 'start') {
        state.heatpumpLevel = normalized.level ?? hzToLevel(normalized.target_hz);
      } else {
        state.heatpumpLevel = 0;
      }

      emitHeatpumpStatus();
      scheduleClosedLoopUpdate();
      return {
        ...normalized,
        heatpumpLevel: state.heatpumpLevel,
      };
    },

    requestUpdate() {
      emitAll();
      return { accepted: true, simulation: true };
    },
  },

  start() {
    if (state.running) {
      emitAll();
      return;
    }
    state.running = true;
    emitAll();
    state.timer = setInterval(emitEnergy, 1000);
  },

  stop() {
    state.running = false;
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
  },

  setScenario(name) {
    return applyScenario(name);
  },

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

  reset() {
    applyScenario('l1_overload');
  },

  getSnapshot() {
    return JSON.parse(JSON.stringify({
      scenario: state.scenario,
      phaseAvailable: state.phaseAvailable,
      heatpumpLevel: state.heatpumpLevel,
      wallbox: state.wallbox,
      batteryCharging: state.batteryCharging,
      projectedCurrentsA: projectedCurrents(),
      transport: 'local_only_no_mqtt',
    }));
  },
};

export default SimulationRuntime;
