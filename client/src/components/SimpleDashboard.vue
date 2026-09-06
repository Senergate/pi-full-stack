<script setup>
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';

import App from '../App.js';
import SimulationRuntime from '../SimulationRuntime.js';
import PhasorCalculator from './PhasorCalculator.js';
import VufCard from './VufCard.vue';
import CurrentCard from './CurrentCard.vue';
import PhasorCard from './PhasorCard.vue';
import AgentCard from './AgentCard.vue';

const sourceScenarios = {
  ideal: {
    angle: { a: 0, b: -120, c: 120 },
  },
  realistic: {
    angle: { a: 0, b: -120.2, c: 119.8 },
  },
};

/*
 * Grid-Impedance presets are explicitly MODELED simulation parameters.
 * They are not measured/calibrated values of the real Senergate site.
 * Version 1 exposes Rphase/Xphase/Rneutral/Xneutral as recommended by the
 * Senergate Grid-Impedance implementation guide.
 */
const GRID_IMPEDANCE_PRESETS = {
  stiff: {
    label: 'Stiff LV Grid',
    rPhase: 0.03,
    xPhase: 0.01,
    rNeutral: 0.02,
    xNeutral: 0.005,
  },
  typical: {
    label: 'Typical Building Feeder',
    rPhase: 0.08,
    xPhase: 0.03,
    rNeutral: 0.06,
    xNeutral: 0.02,
  },
  weak: {
    label: 'Weak Feeder',
    rPhase: 0.12,
    xPhase: 0.05,
    rNeutral: 0.10,
    xNeutral: 0.03,
  },
};

const HEATPUMP_MAX_CURRENT = 35;
const WALLBOX_R0_CURRENT = 16;
const WALLBOX_R1_CURRENT = 16;
const BATTERY_CHARGE_CURRENT = 20;
const HEATPUMP_LEVELS = 5;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });

// Shelly zero-current calibration remains part of the measured layer.
const CURRENT_ZERO_OFFSET_A = { a: 0.24, b: 0.19, c: 0.13 };

// Building-scale projection is a Digital-Twin assumption, never a measured value.
const CURRENT_PROJECTION_FACTOR = { a: 800, b: 400, c: 230 };

const _ = reactive({
  count: 0,
  heatpump: { level: 0, commanded: null },
  wallbox: { load: 0, r0: false, r1: false },
  battery: { charging: false },
  energy_meter: {
    timedelta: null,
    lastUpdate: null,
    raw: {},
    measured: {},
    projected: {},
  },
  vuf: {
    scenario: 'realistic',
    sourceAngle: { a: 0, b: -120, c: 120 },
  },
  grid: {
    preset: 'typical',
    rPhase: GRID_IMPEDANCE_PRESETS.typical.rPhase,
    xPhase: GRID_IMPEDANCE_PRESETS.typical.xPhase,
    rNeutral: GRID_IMPEDANCE_PRESETS.typical.rNeutral,
    xNeutral: GRID_IMPEDANCE_PRESETS.typical.xNeutral,
    provenance: 'modeled',
  },
  agent: { enabled: false },
  realFeedback: {
    branchA: { payload: null, lastUpdate: null },
    branchB: { payload: null, lastUpdate: null },
  },
});

let animationFrame = null;
let unwatchRuntimeMode = null;
let boundRuntime = null;

const isSimulation = computed(() => App._.mode === 'simulation');
const currentSourceLabel = computed(() =>
  isSimulation.value
    ? 'DIGITAL TWIN SIMULATED · local sensor model'
    : 'SCALED FROM MEASURED · Digital Twin'
);

const currentYRange = computed(() => ({
  min: 0,
  max: isSimulation.value ? 350 : 100,
}));

const getRuntime = () => isSimulation.value ? SimulationRuntime : App;

const numberOrNull = value => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
};

const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);

const boolOrNull = value => {
  if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'ON') return true;
  if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off' || value === 'OFF') return false;
  return null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const levelToTargetHz = level => HEATPUMP_LEVEL_TO_HZ[clampInt(level, 0, HEATPUMP_LEVELS)] ?? 0;

const frequencyHzToLevel = hz => {
  const n = numberOrNull(hz);
  if (n === null || n <= 2) return 0;
  return clampInt(Math.round(n / 10), 1, HEATPUMP_LEVELS);
};

const levelToHeatpumpCommand = (level, forcedMode = null) => {
  const safeLevel = clampInt(level, 0, HEATPUMP_LEVELS);
  if (forcedMode === 'zero_hold') return { mode: 'zero_hold', level: 0, target_hz: 0 };
  if (forcedMode === 'stop' || safeLevel === 0) return { mode: 'stop', level: 0, target_hz: 0 };
  return { mode: 'start', level: safeLevel, target_hz: levelToTargetHz(safeLevel) };
};

const sendHeatpumpCommand = command => {
  _.heatpump.commanded = { ...command, ts: Date.now() };
  return getRuntime().EspService.heatpump(command);
};

const selectScenario = key => {
  const scenario = sourceScenarios[key];
  if (!scenario) return;
  _.vuf.scenario = key;
  Object.assign(_.vuf.sourceAngle, scenario.angle);
};

const finiteNonNegative = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const formatNullableNumber = (value, digits = 3, suffix = '') => {
  const n = numberOrNull(value);
  return n === null ? '--' : `${n.toFixed(digits)}${suffix}`;
};

const markRealStateWaiting = () => {
  _.heatpump.level = null;
  _.wallbox.load = null;
  _.wallbox.r0 = null;
  _.wallbox.r1 = null;
  _.battery.charging = null;
};

const setGridPreset = key => {
  const preset = GRID_IMPEDANCE_PRESETS[key];
  if (!preset) return;

  _.grid.preset = key;
  _.grid.rPhase = preset.rPhase;
  _.grid.xPhase = preset.xPhase;
  _.grid.rNeutral = preset.rNeutral;
  _.grid.xNeutral = preset.xNeutral;
  _.grid.provenance = 'modeled';
};

const phaseResistance = computed(() => {
  const value = finiteNonNegative(_.grid.rPhase);
  return { a: value, b: value, c: value };
});

const phaseReactance = computed(() => {
  const value = finiteNonNegative(_.grid.xPhase);
  return { a: value, b: value, c: value };
});

const phaseImpedanceMagnitude = computed(() => {
  const r = finiteNonNegative(_.grid.rPhase);
  const x = finiteNonNegative(_.grid.xPhase);
  return r === null || x === null ? null : Math.hypot(r, x);
});

const neutralImpedanceMagnitude = computed(() => {
  const r = finiteNonNegative(_.grid.rNeutral);
  const x = finiteNonNegative(_.grid.xNeutral);
  return r === null || x === null ? null : Math.hypot(r, x);
});

const gridPresetLabel = computed(() =>
  GRID_IMPEDANCE_PRESETS[_.grid.preset]?.label ?? 'Custom MODELED Grid'
);

const markGridCustom = () => {
  _.grid.preset = 'custom';
  _.grid.provenance = 'modeled';
};

const measuredCurrents = computed(() => ({
  a: numberOrNull(_.energy_meter.measured.a_current),
  b: numberOrNull(_.energy_meter.measured.b_current),
  c: numberOrNull(_.energy_meter.measured.c_current),
}));

const projectedCurrents = computed(() => ({
  a: numberOrNull(_.energy_meter.projected.a_current),
  b: numberOrNull(_.energy_meter.projected.b_current),
  c: numberOrNull(_.energy_meter.projected.c_current),
}));

const measuredPowerFactors = computed(() => ({
  a: numberOrNull(_.energy_meter.measured.a_pf),
  b: numberOrNull(_.energy_meter.measured.b_pf),
  c: numberOrNull(_.energy_meter.measured.c_pf),
}));

const measuredVoltages = computed(() => ({
  a: numberOrNull(_.energy_meter.measured.a_voltage),
  b: numberOrNull(_.energy_meter.measured.b_voltage),
  c: numberOrNull(_.energy_meter.measured.c_voltage),
}));

const twinVoltages = computed(() => {
  const measured = measuredVoltages.value;

  if ([measured.a, measured.b, measured.c].some(value => value === null)) {
    return { a: null, b: null, c: null };
  }

  if (_.vuf.scenario === 'realistic') {
    return {
      a: measured.a + 1.0,
      b: measured.b - 1.0,
      c: measured.c + 0.5,
    };
  }

  return { ...measured };
});

const vufResult = computed(() =>
  PhasorCalculator.analyzeVUF({
    currents: projectedCurrents.value,
    powerFactors: measuredPowerFactors.value,
    sourceVoltages: twinVoltages.value,
    sourceAngles: _.vuf.sourceAngle,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
  })
);

const currentVuf = computed(() => numberOrNull(vufResult.value?.vufPercent));

const baselineVufResult = computed(() =>
  PhasorCalculator.analyzeVUF({
    currents: { a: 0, b: 0, c: 0 },
    powerFactors: measuredPowerFactors.value,
    sourceVoltages: twinVoltages.value,
    sourceAngles: _.vuf.sourceAngle,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
  })
);

const baselineVuf = computed(() => numberOrNull(baselineVufResult.value?.vufPercent));

const loadImpactVuf = computed(() => {
  const total = currentVuf.value;
  const baseline = baselineVuf.value;
  if (total === null || baseline === null) return null;
  return Math.max(0, total - baseline);
});

const loadVoltagesForPhasor = computed(() => {
  const values = vufResult.value?.loadVoltageMagnitudes;
  if (!values) return twinVoltages.value;
  return {
    a: numberOrNull(values.a),
    b: numberOrNull(values.b),
    c: numberOrNull(values.c),
  };
});

const measurementFresh = computed(() =>
  isSimulation.value || (_.energy_meter.timedelta !== null && _.energy_meter.timedelta < 3)
);

const branchAReady = computed(() => {
  if (isSimulation.value) return true;
  const payload = _.realFeedback.branchA.payload;
  if (!payload) return false;
  const state = String(payload.state ?? payload.drive_state ?? payload.safety?.state ?? '').toUpperCase();
  if (['SAFE_MODE', 'FAULT', 'ERROR'].includes(state)) return false;
  const last = numberOrNull(_.realFeedback.branchA.lastUpdate);
  return last !== null && performance.now() - last < 3000;
});

const controlReady = computed(() => measurementFresh.value && branchAReady.value);
const controlBlockedReason = computed(() => {
  if (!measurementFresh.value) return 'Measurement data stale or unavailable';
  if (!branchAReady.value) return 'Waiting for Branch-A status or Branch-A is not ready';
  return '';
});

const neutralVoltageDropMagnitude = computed(() => {
  const value = vufResult.value?.neutralVoltageDrop;
  if (!value || !Number.isFinite(value.re) || !Number.isFinite(value.im)) return null;
  return Math.hypot(value.re, value.im);
});

const heatpumpLevel = computed(() => {
  const level = numberOrNull(_.heatpump.level);
  return level === null ? null : clampInt(level, 0, HEATPUMP_LEVELS);
});

const wallboxLevel = computed(() => {
  if (_.wallbox.r0 === null || _.wallbox.r1 === null) return numberOrNull(_.wallbox.load) === null ? null : clampInt(_.wallbox.load, 0, 3);
  return (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
});

const batteryCharging = computed(() => (_.battery.charging === null ? null : _.battery.charging === true));

const agentDeviceStates = computed(() => ({
  heatpump: heatpumpLevel.value,
  wallbox: wallboxLevel.value,
  batteryCharging: batteryCharging.value,
}));

const wallboxCurrentForLevel = level => {
  const normalized = clampInt(level, 0, 3);
  return (
    ((normalized & 1) ? WALLBOX_R0_CURRENT : 0) +
    ((normalized & 2) ? WALLBOX_R1_CURRENT : 0)
  );
};

const heatpumpCurrentForLevel = level =>
  clampInt(level, 0, 5) * (HEATPUMP_MAX_CURRENT / HEATPUMP_LEVELS);

const batteryCurrentForState = charging => charging ? BATTERY_CHARGE_CURRENT : 0;

const predictVufForDeviceState = candidate => {
  const currents = { ...projectedCurrents.value };
  const currentState = agentDeviceStates.value;

  if ([currents.a, currents.b, currents.c].some(value => value === null)) return null;
  if ([currentState.heatpump, currentState.wallbox, currentState.batteryCharging].some(value => value === null)) return null;

  currents.a += heatpumpCurrentForLevel(candidate.heatpump) - heatpumpCurrentForLevel(currentState.heatpump);
  currents.b += wallboxCurrentForLevel(candidate.wallbox) - wallboxCurrentForLevel(currentState.wallbox);
  currents.c += batteryCurrentForState(candidate.batteryCharging) - batteryCurrentForState(currentState.batteryCharging);

  currents.a = Math.max(0, currents.a);
  currents.b = Math.max(0, currents.b);
  currents.c = Math.max(0, currents.c);

  const result = PhasorCalculator.analyzeVUF({
    currents,
    powerFactors: measuredPowerFactors.value,
    sourceVoltages: twinVoltages.value,
    sourceAngles: _.vuf.sourceAngle,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
  });

  const total = numberOrNull(result?.vufPercent);
  const baseline = baselineVuf.value;
  return total === null || baseline === null ? null : Math.max(0, total - baseline);
};

const applyAgentDeviceState = state => {
  const runtime = getRuntime();

  if (own(state, 'heatpump')) {
    const targetHeatpump = clampInt(state.heatpump, 0, HEATPUMP_LEVELS);
    sendHeatpumpCommand(levelToHeatpumpCommand(targetHeatpump));
  }

  if (own(state, 'wallbox')) {
    const targetWallbox = clampInt(state.wallbox, 0, 3);
    const targetR0 = (targetWallbox & 1) !== 0;
    const targetR1 = (targetWallbox & 2) !== 0;

    _.wallbox.r0 = null;
    _.wallbox.r1 = null;
    runtime.WallboxService.set(0, targetR0);
    runtime.WallboxService.set(1, targetR1);
  }

  if (own(state, 'batteryCharging')) {
    runtime.BatteryService.set(state.batteryCharging === true);
  }
};

const onAgentEnabledChange = enabled => {
  _.agent.enabled = enabled;
};

const calibrateCurrent = (value, offset) => {
  const n = numberOrNull(value);
  return n === null ? null : Math.max(0, n - offset);
};

const projectCurrent = (value, factor) => {
  const n = numberOrNull(value);
  return n === null ? null : n * factor;
};

const onEnergyMeter = payload => {
  // Never mutate the Socket.IO/Shelly payload in place. Keep an auditable raw snapshot.
  const raw = { ...payload };

  // Calibrated measured layer: offsets are measurement calibration, not scenario scaling.
  const measured = {
    ...raw,
    a_current: calibrateCurrent(raw.a_current, CURRENT_ZERO_OFFSET_A.a),
    b_current: calibrateCurrent(raw.b_current, CURRENT_ZERO_OFFSET_A.b),
    c_current: calibrateCurrent(raw.c_current, CURRENT_ZERO_OFFSET_A.c),
    a_pf: numberOrNull(raw.a_pf),
    b_pf: numberOrNull(raw.b_pf),
    c_pf: numberOrNull(raw.c_pf),
    a_voltage: numberOrNull(raw.a_voltage),
    b_voltage: numberOrNull(raw.b_voltage),
    c_voltage: numberOrNull(raw.c_voltage),
  };

  // Explicit Digital-Twin projection. These values are SCALED FROM MEASURED.
  const simulatedInput = raw.simulation_mode === true || raw.source_type === 'simulated_sensor';

  measured.source_type = simulatedInput ? 'simulated_sensor' : 'measured';

  const projected = {
    ...measured,
    a_current: projectCurrent(measured.a_current, CURRENT_PROJECTION_FACTOR.a),
    b_current: projectCurrent(measured.b_current, CURRENT_PROJECTION_FACTOR.b),
    c_current: projectCurrent(measured.c_current, CURRENT_PROJECTION_FACTOR.c),
    source_type: simulatedInput ? 'digital_twin_simulated' : 'scaled_from_measured',
    projection_factor: { ...CURRENT_PROJECTION_FACTOR },
  };

  Object.assign(_.energy_meter.raw, raw);
  Object.assign(_.energy_meter.measured, measured);
  Object.assign(_.energy_meter.projected, projected);
  _.energy_meter.lastUpdate = performance.now();
};

const onBranchAStatus = payload => {
  _.realFeedback.branchA.payload = payload;
  _.realFeedback.branchA.lastUpdate = performance.now();

  const state = String(payload?.state ?? payload?.drive_state ?? payload?.safety?.state ?? '').toUpperCase();
  const explicitLevel = firstNumber(payload?.heatpump_level, payload?.level, payload?.vfd?.heatpump_level);
  const frequencyHz = firstNumber(
    payload?.actual_output_frequency_hz,
    payload?.target_frequency_hz,
    payload?.target_hz,
    payload?.frequency_hz,
    payload?.vfd?.actual_output_frequency_hz,
    payload?.vfd?.target_frequency_hz
  );
  const rawLfrd = firstNumber(payload?.lfrd_reg8602, payload?.lfrd, payload?.vfd?.lfrd_reg8602);

  if (['STOP', 'STOPPED', 'READY', 'SAFE_MODE', 'FAULT', 'ERROR'].includes(state)) {
    _.heatpump.level = 0;
    return;
  }

  if (explicitLevel !== null) {
    _.heatpump.level = clampInt(explicitLevel, 0, HEATPUMP_LEVELS);
    return;
  }

  const level = frequencyHzToLevel(frequencyHz ?? (rawLfrd === null ? null : rawLfrd / 10));
  if (level !== null) _.heatpump.level = level;
};

const pickBool = (...values) => {
  for (const value of values) {
    const parsed = boolOrNull(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const readRelay = (payload, index) => {
  const root = payload ?? {};
  const relays = root.relays ?? {};
  const relayArray = Array.isArray(root.relay) ? root.relay : [];

  if (index === 0) {
    return pickBool(root.r0, root.relay0, root.relay_0, relays.r0, relays.relay0, relays.relay_0, own(root, 'relay1') && own(root, 'relay2') ? root.relay1 : undefined, relayArray[0]);
  }

  if (index === 1) {
    return pickBool(root.r1, root.relay_1, root.relay2, relays.r1, relays.relay_1, relays.relay2, own(root, 'relay0') ? root.relay1 : undefined, relayArray[1]);
  }

  return null;
};

const onBranchBStatus = payload => {
  _.realFeedback.branchB.payload = payload;
  _.realFeedback.branchB.lastUpdate = performance.now();
  const r0 = readRelay(payload, 0);
  const r1 = readRelay(payload, 1);
  if (r0 !== null) _.wallbox.r0 = r0;
  if (r1 !== null) _.wallbox.r1 = r1;
  if (_.wallbox.r0 !== null && _.wallbox.r1 !== null) _.wallbox.load = (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
};

const onWallbox = data => {
  const output = boolOrNull(data?.output);
  if (data.id === 0 && output !== null) _.wallbox.r0 = output;
  else if (data.id === 1 && output !== null) _.wallbox.r1 = output;

  if (_.wallbox.r0 !== null && _.wallbox.r1 !== null) {
    _.wallbox.load = (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
  }
};

const onBattery = data => {
  const output = boolOrNull(data?.output);
  if (output !== null) _.battery.charging = output;
};

const toggleWallbox = r => {
  if (r === 0) {
    if (_.wallbox.r0 === null) return;
    const state = !_.wallbox.r0;
    _.wallbox.r0 = null;
    getRuntime().WallboxService.set(0, state);
    return;
  }

  if (_.wallbox.r1 === null) return;
  const state = !_.wallbox.r1;
  _.wallbox.r1 = null;
  getRuntime().WallboxService.set(1, state);
};

const updateHeatpumpLoad = value => {
  sendHeatpumpCommand(levelToHeatpumpCommand(clampInt(value, 0, HEATPUMP_LEVELS)));
};

const requestHeatpumpZeroHold = () => {
  sendHeatpumpCommand(levelToHeatpumpCommand(0, 'zero_hold'));
};

const updateCount = value => {
  _.count = value;
};

const animate = () => {
  const now = performance.now();
  if (_.energy_meter.lastUpdate) {
    _.energy_meter.timedelta = (now - _.energy_meter.lastUpdate) / 1000;
  }
  animationFrame = requestAnimationFrame(animate);
};

const unbindRuntime = () => {
  if (!boundRuntime) return;

  boundRuntime.EnergyMeterService?.off?.('data', onEnergyMeter);
  boundRuntime.WallboxService?.off?.('data', onWallbox);
  boundRuntime.BatteryService?.off?.('data', onBattery);
  boundRuntime.EspService?.off?.('branchA', onBranchAStatus);
  boundRuntime.EspService?.off?.('branchB', onBranchBStatus);
  boundRuntime.BranchBService?.off?.('branchB', onBranchBStatus);

  if (boundRuntime === SimulationRuntime) {
    SimulationRuntime.stop();
  }

  boundRuntime = null;
};

const bindRuntime = () => {
  unbindRuntime();

  const runtime = getRuntime();
  if (!runtime?.EnergyMeterService || !runtime?.WallboxService || !runtime?.BatteryService || !runtime?.EspService) {
    return;
  }

  boundRuntime = runtime;

  runtime.EnergyMeterService.on('data', onEnergyMeter);
  runtime.WallboxService.on('data', onWallbox);
  runtime.BatteryService.on('data', onBattery);
  runtime.EspService?.on?.('branchA', onBranchAStatus);
  runtime.EspService?.on?.('branchB', onBranchBStatus);
  runtime.BranchBService?.on?.('branchB', onBranchBStatus);

  if (runtime === SimulationRuntime) {
    SimulationRuntime.start();
  } else {
    markRealStateWaiting();
  }

  runtime.EnergyMeterService.requestUpdate?.();
  runtime.WallboxService.requestUpdate?.();
  runtime.BatteryService.requestUpdate?.();
  runtime.EspService?.requestUpdate?.();
};

const setRuntimeMode = mode => {
  App.setMode(mode);
};

const setSimulationScenario = name => {
  if (!SimulationRuntime.setScenario(name)) return;

  // Heatpump has no separate status emitter in the current UI contract.
  // Synchronize the visible/controller state with the scenario snapshot so
  // AgentCard evaluates the same plant state that SimulationRuntime uses.
  const snapshot = SimulationRuntime.getSnapshot();
  _.heatpump.level = snapshot.heatpumpLevel;
};

const setAiCriticalScenario = () => {
  // Fixed reproducible test configuration. We do not dynamically tune Z or
  // projection factors merely to cross the 2% line.
  selectScenario('realistic');
  setGridPreset('typical');
  setSimulationScenario('ai_vuf_over_2');
};

const dropSimulationL3 = () => {
  SimulationRuntime.dropPhase('c');
};

const restoreSimulationL3 = () => {
  SimulationRuntime.restorePhase('c');
};

const resetSimulation = () => {
  SimulationRuntime.reset();
  const snapshot = SimulationRuntime.getSnapshot();
  _.heatpump.level = snapshot.heatpumpLevel;
};

const init = () => {
  selectScenario('realistic');
  bindRuntime();

  unwatchRuntimeMode = watch(
    () => App._.mode,
    () => bindRuntime()
  );

  animationFrame = requestAnimationFrame(animate);
};

onMounted(init);

onUnmounted(() => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  unwatchRuntimeMode?.();
  unwatchRuntimeMode = null;
  unbindRuntime();
});
</script>

<template>
  <div class="dashboard">
    <header class="topbar">
      <div>
        <h1 style='font-size:3em;padding:0;line-height: 2em;margin-bottom:-0.4em;'>SENERGATE</h1>
        <p style='font-size:1em;padding-bottom:1em'>Smart Energy Gateway · Frontstage</p>
      </div>

      <div class="runtime-switch">
        <span class="runtime-label">RUN MODE</span>
        <button
          type="button"
          :class="{ selected: isSimulation }"
          @click="setRuntimeMode('simulation')"
        >
          SIMULATION
        </button>
        <button
          type="button"
          :class="{ selected: !isSimulation }"
          @click="setRuntimeMode('real')"
        >
          REAL HARDWARE
        </button>
        <span class="runtime-status" :class="isSimulation ? 'sim' : (App._.connected ? 'online' : 'offline')">
          {{ isSimulation ? 'LOCAL ONLY · NO MQTT ACTUATION' : (App._.connected ? 'Pi5 CONNECTED' : 'Pi5 DISCONNECTED') }}
        </span>
      </div>
    </header>

    <div v-if="isSimulation" class="simulation-test-panel">
      <div>
        <strong>Digital-Twin Test Mode / 数字孪生测试模式</strong>
        <p>
          Alle Bedienaktionen bleiben lokal im Browser. Keine Aktor-Kommandos werden an MQTT, Shelly, ESP32 oder ATV12 gesendet.
          / 所有控制仅作用于本地模型，不会向 MQTT、Shelly、ESP32 或 ATV12 发送执行命令。
        </p>
      </div>
      <div class="simulation-actions">
        <button type="button" @click="setSimulationScenario('balanced')">Balanced</button>
        <button type="button" @click="setSimulationScenario('l1_overload')">L1 Overload</button>
        <button type="button" @click="setSimulationScenario('l2_overload')">L2 Overload</button>
        <button type="button" class="ai-test" @click="setAiCriticalScenario">AI TEST &gt; 2%</button>
        <button type="button" class="fault" @click="dropSimulationL3">Drop L3</button>
        <button type="button" @click="restoreSimulationL3">Restore L3</button>
        <button type="button" @click="resetSimulation">Reset Twin</button>
      </div>
    </div>

    <div v-if="isSimulation" class="grid-impedance-panel">
      <div class="grid-panel-head">
        <div>
          <strong>Senergate Grid Impedance / Netzimpedanz / 电网阻抗</strong>
          <p>
            MODELED simulation parameters. VUF remains ESTIMATED. These values are not measured/calibrated site data.
            / 仅用于模型仿真；VUF 仍为 ESTIMATED，这些参数不是当前现场实测/校准值。
          </p>
        </div>
        <span class="grid-provenance">{{ _.grid.provenance.toUpperCase() }}</span>
      </div>

      <div class="grid-preset-actions">
        <span>Grid scenario:</span>
        <button type="button" :class="{ selected: _.grid.preset === 'stiff' }" @click="setGridPreset('stiff')">Stiff LV</button>
        <button type="button" :class="{ selected: _.grid.preset === 'typical' }" @click="setGridPreset('typical')">Typical Feeder</button>
        <button type="button" :class="{ selected: _.grid.preset === 'weak' }" @click="setGridPreset('weak')">Weak Feeder</button>
        <span class="grid-name">{{ gridPresetLabel }}</span>
      </div>

      <div class="grid-parameter-grid">
        <label>
          <span>R<sub>phase</sub> [Ω]</span>
          <input v-model.number="_.grid.rPhase" type="number" min="0" max="1" step="0.005" @input="markGridCustom" />
        </label>
        <label>
          <span>X<sub>phase</sub> [Ω]</span>
          <input v-model.number="_.grid.xPhase" type="number" min="0" max="1" step="0.005" @input="markGridCustom" />
        </label>
        <label>
          <span>R<sub>N</sub> [Ω]</span>
          <input v-model.number="_.grid.rNeutral" type="number" min="0" max="1" step="0.005" @input="markGridCustom" />
        </label>
        <label>
          <span>X<sub>N</sub> [Ω]</span>
          <input v-model.number="_.grid.xNeutral" type="number" min="0" max="1" step="0.005" @input="markGridCustom" />
        </label>
      </div>

      <div class="grid-derived">
        <span>|Z<sub>phase</sub>| = {{ formatNullableNumber(phaseImpedanceMagnitude, 3, ' Ω') }}</span>
        <span>|Z<sub>N</sub>| = {{ formatNullableNumber(neutralImpedanceMagnitude, 3, ' Ω') }}</span>
        <span>|V<sub>N</sub>| = {{ neutralVoltageDropMagnitude !== null ? `${neutralVoltageDropMagnitude.toFixed(2)} V` : '--' }}</span>
        <span>Model: V<sub>LN</sub> = E − Z<sub>phase</sub>I − Z<sub>N</sub>I<sub>N</sub></span>
      </div>
    </div>

    <div class="overview-grid">
      <CurrentCard
        :currents="projectedCurrents"
        :y-range="currentYRange"
        :source-label="currentSourceLabel"
      />

      <PhasorCard
        :voltages="loadVoltagesForPhasor"
        :angles="_.vuf.sourceAngle"
      />

      <VufCard :vuf="currentVuf" :baseline-vuf="baselineVuf" :load-impact-vuf="loadImpactVuf" />
    </div>

    <div class="agent-section">
      <AgentCard
        :vuf="loadImpactVuf"
        :device-states="agentDeviceStates"
        :predict-vuf="predictVufForDeviceState"
        :control-ready="controlReady"
        :control-blocked-reason="controlBlockedReason"
        @apply-state="applyAgentDeviceState"
        @heatpump-zero-hold="requestHeatpumpZeroHold"
        @enabled-change="onAgentEnabledChange"
      />
    </div>

    <div class="footer-meta">
      <span>
        Data source: {{ isSimulation ? 'DIGITAL TWIN SIMULATED' : 'REAL HARDWARE' }} ·
        Measurement age:
        {{ _.energy_meter.timedelta !== null ? `${_.energy_meter.timedelta.toFixed(1)} s` : '--' }}
      </span>

      <span>
        Source phasor:
        <button type="button" :class="{ selected: _.vuf.scenario === 'ideal' }" @click="selectScenario('ideal')">
          Ideal
        </button>
        <button type="button" :class="{ selected: _.vuf.scenario === 'realistic' }" @click="selectScenario('realistic')">
          Realistic
        </button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.dashboard{max-width:1540px;margin:0 auto;padding:20px;color:#eaf6ff}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:5px 20px;border:1px solid #1b3a4e;border-radius:20px;background:rgba(7,19,31,.82);box-shadow:0 20px 60px rgba(0,0,0,.25)}.topbar h1{margin:0;font-size:18px;letter-spacing:.28em}.topbar p{margin:4px 0 0;color:#83a7bd;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.runtime-switch{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.runtime-label{font-size:9px;color:#6f91a3;letter-spacing:.14em}.runtime-switch button,.simulation-actions button{padding:7px 10px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:10px;font-weight:700}.runtime-switch button.selected{border-color:#58e7ff;color:#eaf6ff;background:#103044}.runtime-status{padding:6px 9px;border-radius:999px;border:1px solid #284b60;font-size:9px;letter-spacing:.08em}.runtime-status.sim{color:#ffc2e5;border-color:#65455c}.runtime-status.online{color:#8ff1c3;border-color:#2b6f62}.runtime-status.offline{color:#ff8c97;border-color:#6b3740}.simulation-test-panel{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:14px;padding:12px 16px;border:1px solid #65455c;border-radius:16px;background:#15121b}.simulation-test-panel strong{font-size:12px}.simulation-test-panel p{max-width:760px;margin:4px 0 0;color:#bca5b6;font-size:10px;line-height:1.5}.simulation-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap}.simulation-actions button.fault{border-color:#6b3740;color:#ff9ba4}.simulation-actions button.ai-test{border-color:#d19c39;color:#ffe7a5;background:#2a2110}.grid-impedance-panel{margin-top:14px;padding:14px 16px;border:1px solid #3a5364;border-radius:16px;background:#0b1822}.grid-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.grid-panel-head strong{font-size:12px}.grid-panel-head p{max-width:950px;margin:4px 0 0;color:#89a8b9;font-size:10px;line-height:1.5}.grid-provenance{padding:5px 8px;border:1px solid #665c2d;border-radius:999px;color:#ffe795;font-size:9px;letter-spacing:.08em}.grid-preset-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px;color:#789aac;font-size:10px}.grid-preset-actions button{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:10px}.grid-preset-actions button.selected{border-color:#58e7ff;color:#eaf6ff}.grid-name{margin-left:auto;color:#b9d6e5}.grid-parameter-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-top:12px}.grid-parameter-grid label{display:grid;gap:5px;color:#9db7c5;font-size:10px}.grid-parameter-grid input{width:100%;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#eaf6ff;font:inherit}.grid-derived{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;color:#7598aa;font-size:10px}.grid-derived span{padding:5px 7px;border:1px solid #1f3b4d;border-radius:8px;background:#081721}.topbar-meta{display:flex;gap:8px;flex-wrap:wrap}.chip{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.chip.measured{border-color:#2b6f62;color:#8ff1c3}.chip.simulated{border-color:#65455c;color:#ffc2e5}.chip.active{border-color:#2b6f62;color:#8ff1c3}.section,.agent-section{margin-top:14px}.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px;align-items:stretch}.overview-grid>*{min-width:0}.footer-meta{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding:0 4px;color:#6f91a3;font-size:10px}.footer-meta button{margin-left:5px;padding:4px 8px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer}.footer-meta button.selected{border-color:#58e7ff;color:#eaf6ff}@media(max-width:1100px){.overview-grid{grid-template-columns:1fr}.simulation-test-panel{align-items:flex-start;flex-direction:column}.simulation-actions{justify-content:flex-start}.grid-parameter-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.grid-name{margin-left:0}}@media(max-width:700px){.dashboard{padding:10px}.topbar,.footer-meta,.grid-panel-head{flex-direction:column;align-items:flex-start}.runtime-switch{justify-content:flex-start}.grid-parameter-grid{grid-template-columns:1fr}}
</style>
