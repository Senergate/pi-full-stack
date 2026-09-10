<script setup>
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';

import App from '../App.js';
import {
  BUILDING_TWIN_CONFIG,
  batteryProjectedCurrentA,
  heatpumpProjectedCurrentA,
  projectBuildingCurrents,
  wallboxMaskFromRelays,
  wallboxProjectedCurrentA,
} from '../BuildingTwinModel.js';
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
 * Grid-Impedance presets are explicit BUILDING-TWIN model parameters.
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

const HEATPUMP_LEVELS = BUILDING_TWIN_CONFIG.heatpumpLevels;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });

// Shelly zero-current calibration remains part of the measured layer.
const CURRENT_ZERO_OFFSET_A = { a: 0.24, b: 0.19, c: 0.13 };

const _ = reactive({
  count: 0,
  heatpump: { level: null, commanded: null },
  wallbox: { load: null, r0: null, r1: null, r0Update: null, r1Update: null },
  battery: { charging: null, lastUpdate: null },
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
  mqtt: { connected: false, lastHeartbeatAt: null },
  startup: {
    phase: 'connecting',
    requestedAt: null,
    completedAt: null,
    timeoutAt: null,
    message: 'Connecting to Pi5…',
  },
  realFeedback: {
    branchA: { payload: null, ack: null, lastUpdate: null, ackUpdate: null },
  },
});

let animationFrame = null;
let unwatchConnection = null;
let unwatchStartupChecklist = null;
let unwatchBranchAState = null;
let boundRuntime = false;
let startupTimer = null;

const currentSourceLabel = computed(() => 'BUILDING-SCALE DIGITAL TWIN · REAL execution state');
const currentYRange = computed(() => ({ min: 0, max: 350 }));
const STARTUP_TIMEOUT_MS = 6000;

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
  if (n === null) return null;
  if (n <= 2) return 0;
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
  return App.EspService.heatpump(command);
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
  _.heatpump.commanded = null;
  _.wallbox.load = null;
  _.wallbox.r0 = null;
  _.wallbox.r1 = null;
  _.wallbox.r0Update = null;
  _.wallbox.r1Update = null;
  _.battery.charging = null;
  _.battery.lastUpdate = null;
  _.realFeedback.branchA = { payload: null, ack: null, lastUpdate: null, ackUpdate: null };
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

const projectedCurrents = computed(() => {
  const heatpumpLevel = numberOrNull(_.heatpump.level);
  if (heatpumpLevel === null || _.wallbox.r0 === null || _.wallbox.r1 === null || _.battery.charging === null) {
    return { a: null, b: null, c: null };
  }

  return projectBuildingCurrents({
    heatpumpLevel,
    wallboxMask: wallboxMaskFromRelays(_.wallbox.r0, _.wallbox.r1),
    batteryCharging: _.battery.charging,
  });
});

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
  // Keep Shelly voltage magnitudes unchanged. Angles and grid impedance below
  // are still model assumptions, therefore the resulting VUF is ESTIMATED.
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
  _.energy_meter.timedelta !== null && _.energy_meter.timedelta < 3
);

const branchAState = computed(() =>
  String(_.realFeedback.branchA.payload?.state ?? _.realFeedback.branchA.payload?.drive_state ?? _.realFeedback.branchA.payload?.safety?.state ?? '').toUpperCase()
);

const branchAReady = computed(() => {
  const state = branchAState.value;
  const validStates = ['READY', 'STOP', 'STOPPED', 'ZERO_HOLD', 'STARTING', 'RUNNING', 'RAMPING_TO_ZERO_HOLD'];
  if (!validStates.includes(state)) return false;
  const last = numberOrNull(_.realFeedback.branchA.lastUpdate);
  return last !== null && performance.now() - last < 3000;
});

const BRANCH_B_STATUS_FRESH_MS = 3000;

const branchBReady = computed(() => {
  // Branch B is NOT an ESP32 device in the current prototype. Its execution
  // truth comes directly from WallboxService/Shelly switch status for both
  // physical resistor channels.
  const now = performance.now();
  const r0Update = numberOrNull(_.wallbox.r0Update);
  const r1Update = numberOrNull(_.wallbox.r1Update);

  const r0Fresh = _.wallbox.r0 !== null && r0Update !== null && now - r0Update < BRANCH_B_STATUS_FRESH_MS;
  const r1Fresh = _.wallbox.r1 !== null && r1Update !== null && now - r1Update < BRANCH_B_STATUS_FRESH_MS;

  return r0Fresh && r1Fresh;
});

const startupRequestReceived = update => {
  const requestedAt = numberOrNull(_.startup.requestedAt);
  const receivedAt = numberOrNull(update);
  return requestedAt !== null && receivedAt !== null && receivedAt >= requestedAt;
};

const startupChecklist = computed(() => ({
  socket: App._.connected === true,
  services: App._.servicesReady === true,
  mqtt: _.mqtt.connected === true,
  measurement: startupRequestReceived(_.energy_meter.lastUpdate),
  branchA: startupRequestReceived(_.realFeedback.branchA.lastUpdate) && branchAReady.value,
  branchB:
    startupRequestReceived(_.wallbox.r0Update) &&
    startupRequestReceived(_.wallbox.r1Update) &&
    branchBReady.value,
  battery: startupRequestReceived(_.battery.lastUpdate) && _.battery.charging !== null,
}));

const startupAllReady = computed(() => Object.values(startupChecklist.value).every(Boolean));

// Runtime values may arrive quickly from MQTT/Shelly/ESP32 during startup, but
// the dashboard must stay visually fail-closed until the complete startup
// checklist has passed. Model configuration values (grid impedance, assumed
// phase angles) are not runtime measurements and remain visible.
const startupDataVisible = computed(() => _.startup.phase === 'ready' && startupAllReady.value);

const startupNullPhases = Object.freeze({ a: null, b: null, c: null });
const displayProjectedCurrents = computed(() =>
  startupDataVisible.value ? projectedCurrents.value : startupNullPhases
);
const displayPhasorVoltages = computed(() =>
  startupDataVisible.value ? loadVoltagesForPhasor.value : startupNullPhases
);
const displayCurrentVuf = computed(() => startupDataVisible.value ? currentVuf.value : null);
const displayBaselineVuf = computed(() => startupDataVisible.value ? baselineVuf.value : null);
const displayLoadImpactVuf = computed(() => startupDataVisible.value ? loadImpactVuf.value : null);

const startupActiveDevices = computed(() => {
  const active = [];
  if ((heatpumpLevel.value ?? 0) > 0 || ['STARTING', 'RUNNING', 'RAMPING_TO_ZERO_HOLD'].includes(branchAState.value)) active.push('Branch A / Heat pump');
  if (_.wallbox.r0 === true) active.push('Branch B Relay 0');
  if (_.wallbox.r1 === true) active.push('Branch B Relay 1');
  if (_.battery.charging === true) active.push('Battery charging');
  return active;
});

const startupStatusLabel = computed(() => {
  if (_.startup.phase === 'ready') return startupActiveDevices.value.length > 0 ? 'READY · ACTIVE DEVICE DETECTED' : 'READY · SAFE IDLE';
  if (_.startup.phase === 'timeout') return 'INITIALIZATION TIMEOUT';
  if (_.startup.phase === 'fault') return 'HARDWARE FAULT / SAFE MODE';
  if (_.startup.phase === 'requesting') return 'CHECKING INITIAL STATE';
  if (_.startup.phase === 'services') return 'LOADING SERVICES';
  return 'CONNECTING';
});

const controlReady = computed(() =>
  _.startup.phase === 'ready' && measurementFresh.value && branchAReady.value && branchBReady.value
);

const controlBlockedReason = computed(() => {
  if (_.startup.phase !== 'ready') return `Startup initialization not complete: ${startupStatusLabel.value}`;
  if (!measurementFresh.value) return 'Measurement data stale or unavailable';
  if (!branchAReady.value) return 'Branch-A status stale or Branch-A is not ready';
  if (!branchBReady.value) return 'Branch-B Shelly relay status stale or relay state is unknown';
  return '';
});


const commandFeedback = computed(() => ({
  branchA: {
    ack: _.realFeedback.branchA.ack,
    status: _.realFeedback.branchA.payload,
    commanded: _.heatpump.commanded,
    fresh: branchAReady.value,
  },
  branchB: {
    ack: null,
    status: branchBReady.value
      ? `Shelly relays confirmed: R0=${_.wallbox.r0 ? 'ON' : 'OFF'}, R1=${_.wallbox.r1 ? 'ON' : 'OFF'}`
      : 'Shelly relay status unknown/stale',
  },
}));

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

const wallboxCurrentForLevel = level => wallboxProjectedCurrentA(level);
const heatpumpCurrentForLevel = level => heatpumpProjectedCurrentA(level);
const batteryCurrentForState = charging => batteryProjectedCurrentA(charging);

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

  return numberOrNull(result?.vufPercent);
};

const applyAgentDeviceState = state => {
  if (!controlReady.value) return;
  const runtime = App;

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

  measured.source_type = 'measured';

  // Building current is not produced by multiplying Shelly current. The actual
  // projected values are computed from confirmed Branch-A/B/Battery state.
  const projected = {
    source_type: 'digital_twin_from_real_state',
    projection_model: 'equivalent_devices_v1',
    base_current_a: { ...BUILDING_TWIN_CONFIG.baseCurrentA },
    branchA_equivalent_heatpumps: BUILDING_TWIN_CONFIG.branchAEquivalentHeatpumps,
    branchB_equivalent_wallboxes_per_relay: BUILDING_TWIN_CONFIG.branchBEquivalentWallboxesPerRelay,
  };

  Object.assign(_.energy_meter.raw, raw);
  Object.assign(_.energy_meter.measured, measured);
  Object.assign(_.energy_meter.projected, projected);
  _.energy_meter.lastUpdate = performance.now();
};

const onBranchAAck = payload => {
  _.realFeedback.branchA.ack = payload;
  _.realFeedback.branchA.ackUpdate = performance.now();
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

const onWallbox = data => {
  const output = boolOrNull(data?.output);
  if (data.id === 0 && output !== null) { _.wallbox.r0 = output; _.wallbox.r0Update = performance.now(); }
  else if (data.id === 1 && output !== null) { _.wallbox.r1 = output; _.wallbox.r1Update = performance.now(); }

  if (_.wallbox.r0 !== null && _.wallbox.r1 !== null) {
    _.wallbox.load = (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
  }
};

const onBattery = data => {
  const output = boolOrNull(data?.output);
  if (output !== null) { _.battery.charging = output; _.battery.lastUpdate = performance.now(); }
};

const toggleWallbox = r => {
  if (!controlReady.value) return;
  if (r === 0) {
    if (_.wallbox.r0 === null) return;
    const state = !_.wallbox.r0;
    _.wallbox.r0 = null;
    App.WallboxService.set(0, state);
    return;
  }

  if (_.wallbox.r1 === null) return;
  const state = !_.wallbox.r1;
  _.wallbox.r1 = null;
  App.WallboxService.set(1, state);
};

const updateHeatpumpLoad = value => {
  if (!controlReady.value) return;
  sendHeatpumpCommand(levelToHeatpumpCommand(clampInt(value, 0, HEATPUMP_LEVELS)));
};

const requestHeatpumpZeroHold = () => {
  if (!controlReady.value) return;
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

const clearStartupTimer = () => {
  if (startupTimer !== null) window.clearTimeout(startupTimer);
  startupTimer = null;
};

const updateStartupPhase = () => {
  if (!App._.connected) {
    clearStartupTimer();
    _.startup.phase = 'connecting';
    _.startup.message = App._.lastError || 'Waiting for Pi5/Socket.IO connection…';
    return;
  }

  if (!App._.servicesReady) {
    _.startup.phase = 'services';
    _.startup.message = 'Connected. Loading Pi5 services…';
    return;
  }

  if (_.startup.requestedAt !== null && !_.mqtt.connected) {
    _.startup.phase = 'requesting';
    _.startup.message = 'Pi5 server connected, but MQTT broker is not ready.';
  }

  const state = branchAState.value;
  if (['SAFE_MODE', 'FAULT', 'ERROR'].includes(state)) {
    clearStartupTimer();
    _.startup.phase = 'fault';
    _.startup.message = `Branch A reports ${state}. Automatic and manual actuation stays blocked.`;
    return;
  }

  if (startupAllReady.value) {
    _.startup.phase = 'ready';
    _.startup.completedAt = performance.now();
    _.startup.message = startupActiveDevices.value.length > 0
      ? `Initialization complete. Existing active hardware detected: ${startupActiveDevices.value.join(', ')}. No automatic STOP was sent.`
      : 'Initialization complete. All required real-hardware states are known.';
    clearStartupTimer();
  }
};

const requestInitialHardwareState = async () => {
  if (!App._.connected || !App._.servicesReady) return;

  clearStartupTimer();
  markRealStateWaiting();
  _.energy_meter.timedelta = null;
  _.energy_meter.lastUpdate = null;
  _.energy_meter.raw = {};
  _.energy_meter.measured = {};
  _.energy_meter.projected = {};
  _.agent.enabled = false;

  _.startup.phase = 'requesting';
  _.startup.message = 'Requesting fresh Shelly measurements, Branch A, Branch-B Shelly relay states and battery status…';
  _.startup.requestedAt = performance.now();
  _.startup.completedAt = null;
  _.startup.timeoutAt = null;

  try {
    const mqttStatus = await App.MqttService?.status?.();
    _.mqtt.connected = mqttStatus?.connected === true;
    _.mqtt.lastHeartbeatAt = mqttStatus?.last_heartbeat_at ?? null;
  } catch {
    _.mqtt.connected = false;
    _.mqtt.lastHeartbeatAt = null;
  }

  await Promise.allSettled([
    App.EnergyMeterService?.requestUpdate?.(),
    App.WallboxService?.requestUpdate?.(),
    App.BatteryService?.requestUpdate?.(),
    App.EspService?.requestUpdate?.(),
  ]);

  // MQTT may connect while the hardware status requests are in flight.
  try {
    const mqttStatus = await App.MqttService?.status?.();
    _.mqtt.connected = mqttStatus?.connected === true;
    _.mqtt.lastHeartbeatAt = mqttStatus?.last_heartbeat_at ?? null;
  } catch {
    // Keep the previous MQTT state; startup will remain fail-closed.
  }

  updateStartupPhase();
  if (startupAllReady.value) return;

  startupTimer = window.setTimeout(() => {
    if (startupAllReady.value) return;
    _.startup.phase = 'timeout';
    _.startup.timeoutAt = performance.now();
    const missing = Object.entries(startupChecklist.value)
      .filter(([, ready]) => !ready)
      .map(([name]) => name)
      .join(', ');
    _.startup.message = `Initialization timed out. Missing/faulted: ${missing || 'unknown'}. Controls remain blocked.`;
  }, STARTUP_TIMEOUT_MS);
};

const unbindRuntime = () => {
  if (!boundRuntime) return;

  App.EnergyMeterService?.off?.('data', onEnergyMeter);
  App.WallboxService?.off?.('data', onWallbox);
  App.BatteryService?.off?.('data', onBattery);
  App.EspService?.off?.('branchA', onBranchAStatus);
  App.EspService?.off?.('branchA_ack', onBranchAAck);
  boundRuntime = false;
};

const bindRuntime = async () => {
  if (!App._.connected || !App._.servicesReady) {
    unbindRuntime();
    markRealStateWaiting();
    updateStartupPhase();
    return;
  }

  if (!App.EnergyMeterService || !App.WallboxService || !App.BatteryService || !App.EspService) {
    _.startup.phase = 'services';
    _.startup.message = 'Required Pi5 services are not available yet.';
    return;
  }

  unbindRuntime();
  App.EnergyMeterService.on('data', onEnergyMeter);
  App.WallboxService.on('data', onWallbox);
  App.BatteryService.on('data', onBattery);
  App.EspService.on?.('branchA', onBranchAStatus);
  App.EspService.on?.('branchA_ack', onBranchAAck);
  boundRuntime = true;

  await requestInitialHardwareState();
};

const retryInitialization = async () => {
  App.ensureConnected();
  if (App._.connected && App._.servicesReady) await bindRuntime();
};

const init = () => {
  selectScenario('realistic');
  App.ensureConnected();
  updateStartupPhase();

  unwatchConnection = watch(
    () => [App._.connected, App._.servicesReady],
    async ([connected, servicesReady], previous = []) => {
      const [previousConnected, previousServicesReady] = previous;
      if (connected && servicesReady && (!previousConnected || !previousServicesReady || !boundRuntime)) {
        await bindRuntime();
      } else if (!connected || !servicesReady) {
        unbindRuntime();
        markRealStateWaiting();
        updateStartupPhase();
      }
    },
    { immediate: true }
  );

  unwatchStartupChecklist = watch(startupChecklist, updateStartupPhase, { deep: true });
  unwatchBranchAState = watch(branchAState, updateStartupPhase);
  animationFrame = requestAnimationFrame(animate);
};

onMounted(init);

onUnmounted(() => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  unwatchConnection?.();
  unwatchConnection = null;
  unwatchStartupChecklist?.();
  unwatchStartupChecklist = null;
  unwatchBranchAState?.();
  unwatchBranchAState = null;
  clearStartupTimer();
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
        <span class="runtime-fixed">REAL HARDWARE</span>
        <span class="runtime-status" :class="App._.connected ? 'online' : 'offline'">
          {{ App._.connected ? 'Pi5 CONNECTED' : 'Pi5 DISCONNECTED' }}
        </span>
      </div>
    </header>

    <div class="startup-panel" :class="_.startup.phase">
      <div class="startup-head">
        <div>
          <strong>Startup Initialization / 首次进入初始化检查</strong>
          <p>{{ _.startup.message }}</p>
        </div>
        <div class="startup-actions">
          <span class="startup-badge">{{ startupStatusLabel }}</span>
          <button type="button" @click="retryInitialization">RECHECK / 重新检查</button>
        </div>
      </div>
      <div class="startup-checks">
        <span :class="{ ok: startupChecklist.socket }">Socket {{ startupChecklist.socket ? '✓' : '…' }}</span>
        <span :class="{ ok: startupChecklist.services }">Services {{ startupChecklist.services ? '✓' : '…' }}</span>
        <span :class="{ ok: startupChecklist.mqtt }">MQTT {{ startupChecklist.mqtt ? '✓' : '…' }}</span>
        <span :class="{ ok: startupChecklist.measurement }">Shelly {{ startupChecklist.measurement ? '✓' : '…' }}</span>
        <span :class="{ ok: startupChecklist.branchA }">Branch A {{ startupChecklist.branchA ? '✓' : '…' }}</span>
        <span :class="{ ok: startupChecklist.branchB }">Branch B · Shelly R0/R1 {{ startupChecklist.branchB ? '✓' : '…' }}</span>
        <span :class="{ ok: startupChecklist.battery }">Battery {{ startupChecklist.battery ? '✓' : '…' }}</span>
      </div>
      <p v-if="startupActiveDevices.length > 0" class="startup-warning">
        Active state found / 检测到设备处于运行状态: {{ startupActiveDevices.join(' · ') }}. Browser startup does not send automatic STOP.
      </p>
    </div>

    <div class="grid-impedance-panel">
      <div class="grid-panel-head">
        <div>
          <strong>Senergate Grid Impedance / Netzimpedanz / 电网阻抗</strong>
          <p>
            MODELED building-scale parameters for REAL HARDWARE. VUF remains ESTIMATED; these are not measured/calibrated site data.
            / REAL HARDWARE 使用的建筑级模型参数；VUF 仍为 ESTIMATED，这些参数不是现场实测/校准值。
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
        <span>Branch A: 1 motor → 3 HP</span>
        <span>Branch B: 1 relay → 2 WB · 2 relays → 4 WB</span>
      </div>
    </div>

    <div class="overview-grid">
      <CurrentCard
        :currents="displayProjectedCurrents"
        :y-range="currentYRange"
        :source-label="currentSourceLabel"
      />

      <PhasorCard
        :voltages="displayPhasorVoltages"
        :angles="_.vuf.sourceAngle"
      />

      <VufCard :vuf="displayCurrentVuf" :baseline-vuf="displayBaselineVuf" :load-impact-vuf="displayLoadImpactVuf" />
    </div>

    <div class="agent-section">
      <AgentCard
        :vuf="displayCurrentVuf"
        :device-states="agentDeviceStates"
        :predict-vuf="predictVufForDeviceState"
        :control-ready="controlReady"
        :control-blocked-reason="controlBlockedReason"
        :command-feedback="commandFeedback"
        @apply-state="applyAgentDeviceState"
        @heatpump-zero-hold="requestHeatpumpZeroHold"
        @enabled-change="onAgentEnabledChange"
      />
    </div>

    <div class="footer-meta">
      <span>
        Data source: REAL HARDWARE · Building Twin ESTIMATED ·
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
.dashboard{max-width:1540px;margin:0 auto;padding:20px;color:#eaf6ff}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:5px 20px;border:1px solid #1b3a4e;border-radius:20px;background:rgba(7,19,31,.82);box-shadow:0 20px 60px rgba(0,0,0,.25)}.topbar h1{margin:0;font-size:18px;letter-spacing:.28em}.topbar p{margin:4px 0 0;color:#83a7bd;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.runtime-switch{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.runtime-label{font-size:9px;color:#6f91a3;letter-spacing:.14em}.runtime-fixed{padding:7px 10px;border:1px solid #58e7ff;border-radius:999px;color:#eaf6ff;background:#103044;font-size:10px;font-weight:700}.runtime-status{padding:6px 9px;border-radius:999px;border:1px solid #284b60;font-size:9px;letter-spacing:.08em}.runtime-status.online{color:#8ff1c3;border-color:#2b6f62}.runtime-status.offline{color:#ff8c97;border-color:#6b3740}.startup-panel{margin-top:14px;padding:14px 16px;border:1px solid #3a5364;border-radius:16px;background:#0b1822}.startup-panel.ready{border-color:#2b6f62}.startup-panel.timeout,.startup-panel.fault{border-color:#6b3740}.startup-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.startup-head strong{font-size:12px}.startup-head p{margin:4px 0 0;color:#89a8b9;font-size:10px;line-height:1.5}.startup-actions{display:flex;align-items:center;gap:8px}.startup-actions button{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:10px}.startup-badge{padding:5px 8px;border:1px solid #665c2d;border-radius:999px;color:#ffe795;font-size:9px;letter-spacing:.08em}.startup-panel.ready .startup-badge{border-color:#2b6f62;color:#8ff1c3}.startup-panel.timeout .startup-badge,.startup-panel.fault .startup-badge{border-color:#6b3740;color:#ff9ba4}.startup-checks{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.startup-checks span{padding:5px 8px;border:1px solid #3b4450;border-radius:999px;color:#8399a7;font-size:9px}.startup-checks span.ok{border-color:#2b6f62;color:#8ff1c3}.startup-warning{margin:10px 0 0;padding:8px 10px;border:1px solid #665c2d;border-radius:10px;color:#ffe795;background:#17170d;font-size:10px;line-height:1.5}.grid-impedance-panel{margin-top:14px;padding:14px 16px;border:1px solid #3a5364;border-radius:16px;background:#0b1822}.grid-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.grid-panel-head strong{font-size:12px}.grid-panel-head p{max-width:950px;margin:4px 0 0;color:#89a8b9;font-size:10px;line-height:1.5}.grid-provenance{padding:5px 8px;border:1px solid #665c2d;border-radius:999px;color:#ffe795;font-size:9px;letter-spacing:.08em}.grid-preset-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px;color:#789aac;font-size:10px}.grid-preset-actions button{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:10px}.grid-preset-actions button.selected{border-color:#58e7ff;color:#eaf6ff}.grid-name{margin-left:auto;color:#b9d6e5}.grid-parameter-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-top:12px}.grid-parameter-grid label{display:grid;gap:5px;color:#9db7c5;font-size:10px}.grid-parameter-grid input{width:100%;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#eaf6ff;font:inherit}.grid-derived{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;color:#7598aa;font-size:10px}.grid-derived span{padding:5px 7px;border:1px solid #1f3b4d;border-radius:8px;background:#081721}.topbar-meta{display:flex;gap:8px;flex-wrap:wrap}.chip{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.chip.measured{border-color:#2b6f62;color:#8ff1c3}.chip.active{border-color:#2b6f62;color:#8ff1c3}.section,.agent-section{margin-top:14px}.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px;align-items:stretch}.overview-grid>*{min-width:0}.footer-meta{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding:0 4px;color:#6f91a3;font-size:10px}.footer-meta button{margin-left:5px;padding:4px 8px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer}.footer-meta button.selected{border-color:#58e7ff;color:#eaf6ff}@media(max-width:1100px){.overview-grid{grid-template-columns:1fr}.startup-head{flex-direction:column}.grid-parameter-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.grid-name{margin-left:0}}@media(max-width:700px){.dashboard{padding:10px}.topbar,.footer-meta,.grid-panel-head{flex-direction:column;align-items:flex-start}.runtime-switch{justify-content:flex-start}.grid-parameter-grid{grid-template-columns:1fr}}
</style>
