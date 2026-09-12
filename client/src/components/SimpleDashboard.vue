<script setup>
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';

import App from '../App.js';
import { buildBuildingComplexPowers, BUILDING_CAPACITY } from '../BuildingElectricalModel.js';
import { analyzeIncrementalVuf, DEFAULT_VOLTAGE_LIMITS } from '../IncrementalVufModel.js';
import PhasorCalculator from './PhasorCalculator.js';
import VufCard from './VufCard.vue';
import CurrentCard from './CurrentCard.vue';
import PhasorCard from './PhasorCard.vue';
import AgentCard from './AgentCard.vue';

const FRONTEND_BUILD_VERSION = 'v1.5-pq-calibrated-vuf-demo';
const HEATPUMP_LEVELS = 5;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });
const CURRENT_ZERO_OFFSET_A = Object.freeze({ a: 0.24, b: 0.19, c: 0.13 });
const IDEAL_PHASE_ANGLES = Object.freeze({ a: 0, b: -120, c: 120 });

const GRID_IMPEDANCE_PRESETS = Object.freeze({
  stiff: { label: 'Stiff LV Grid', rPhase: 0.03, xPhase: 0.01, rNeutral: 0.02, xNeutral: 0.005 },
  typical: { label: 'Typical Building Feeder', rPhase: 0.08, xPhase: 0.03, rNeutral: 0.06, xNeutral: 0.02 },
  weak: { label: 'Weak Feeder', rPhase: 0.12, xPhase: 0.05, rNeutral: 0.10, xNeutral: 0.03 },
  demo: {
    label: 'Demo Weak Grid · VUF >2.5% reachable',
    // Tuned only as an explicit MODELED demo feeder. With a single full L2
    // equivalent load (64 A, near-unity PF), this produces roughly 2.5% VUF
    // while keeping the projected phase voltages above 207 V in the reference
    // 230 V baseline case. It is NOT a site-calibrated impedance.
    rPhase: 0.22,
    xPhase: 0.15,
    rNeutral: 0.02,
    xNeutral: 0.0,
  },
});

const _ = reactive({
  heatpump: { level: null, mode: null, commanded: null, twinLevel: null, generation: 0 },
  wallbox: { load: null, r0: null, r1: null, commandedMask: null },
  battery: { charging: null, commandedCharging: null },
  energy_meter: { timedelta: null, lastUpdate: null, raw: {}, measured: {} },
  grid: { preset: 'demo', ...GRID_IMPEDANCE_PRESETS.demo, provenance: 'modeled_demo_not_site_calibrated' },
  calibration: { model: null, status: null, progress: null, loading: false },
  agent: { enabled: false },
  feedback: {
    branchA: { payload: null, ack: null, lastUpdate: null },
    wallbox: { lastUpdate: null },
    battery: { lastUpdate: null },
  },
});

let animationFrame = null;
let servicesWatchStop = null;
let bound = false;

const numberOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
};
const boolOrNull = value => {
  if ([true, 1, '1', 'true', 'on', 'ON'].includes(value)) return true;
  if ([false, 0, '0', 'false', 'off', 'OFF'].includes(value)) return false;
  return null;
};
const finiteNonNegative = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const firstNumber = (...values) => {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n !== null) return n;
  }
  return null;
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);
const formatNullableNumber = (value, digits = 3, suffix = '') => {
  const n = numberOrNull(value);
  return n === null ? '--' : `${n.toFixed(digits)}${suffix}`;
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
  if (forcedMode === 'stop') return { mode: 'stop', level: 0, target_hz: 0 };
  if (forcedMode === 'zero_hold' || safeLevel === 0) return { mode: 'zero_hold', level: 0, target_hz: 0 };
  return { mode: 'start', level: safeLevel, target_hz: levelToTargetHz(safeLevel) };
};

const sendHeatpumpCommand = command => {
  const generation = ++_.heatpump.generation;
  const previous = { commanded: _.heatpump.commanded, twinLevel: _.heatpump.twinLevel };
  const mode = String(command?.mode ?? '').toLowerCase();
  _.heatpump.commanded = { ...command, generation, ts: Date.now() };
  _.heatpump.twinLevel = mode === 'start' ? clampInt(command.level, 1, 5) : 0;

  if (!App.EspService?.heatpump) {
    _.heatpump.commanded = previous.commanded;
    _.heatpump.twinLevel = previous.twinLevel;
    return Promise.resolve({ accepted: false, reason: 'EspService unavailable' });
  }

  return Promise.resolve(App.EspService.heatpump(command))
    .then(result => {
      if (generation === _.heatpump.generation && result?.accepted === false) {
        _.heatpump.commanded = previous.commanded;
        _.heatpump.twinLevel = previous.twinLevel;
      }
      return result;
    })
    .catch(error => {
      if (generation === _.heatpump.generation) {
        _.heatpump.commanded = previous.commanded;
        _.heatpump.twinLevel = previous.twinLevel;
      }
      console.error('Heatpump RPC failed; command-trajectory projection rolled back.', error);
      return { accepted: false, reason: 'rpc_failed' };
    });
};

const measuredCurrents = computed(() => ({
  a: numberOrNull(_.energy_meter.measured.a_current),
  b: numberOrNull(_.energy_meter.measured.b_current),
  c: numberOrNull(_.energy_meter.measured.c_current),
}));
const measuredVoltages = computed(() => ({
  a: numberOrNull(_.energy_meter.measured.a_voltage),
  b: numberOrNull(_.energy_meter.measured.b_voltage),
  c: numberOrNull(_.energy_meter.measured.c_voltage),
}));

const calibrationBaselineVoltages = computed(() => {
  const baseline = _.calibration.model?.baseline?.voltageMagnitudes;
  if (!baseline) return null;
  const result = { a: numberOrNull(baseline.a), b: numberOrNull(baseline.b), c: numberOrNull(baseline.c) };
  return Object.values(result).every(value => value !== null) ? result : null;
});
const modelBaselineVoltages = computed(() => calibrationBaselineVoltages.value ?? measuredVoltages.value);
const baselineSourceLabel = computed(() => calibrationBaselineVoltages.value ? 'CALIBRATED PCC BASELINE' : 'LIVE SHELLY PCC FALLBACK');

const phaseResistance = computed(() => {
  const v = finiteNonNegative(_.grid.rPhase); return { a: v, b: v, c: v };
});
const phaseReactance = computed(() => {
  const v = finiteNonNegative(_.grid.xPhase); return { a: v, b: v, c: v };
});
const phaseImpedanceMagnitude = computed(() => {
  const r = finiteNonNegative(_.grid.rPhase); const x = finiteNonNegative(_.grid.xPhase);
  return r === null || x === null ? null : Math.hypot(r, x);
});
const neutralImpedanceMagnitude = computed(() => {
  const r = finiteNonNegative(_.grid.rNeutral); const x = finiteNonNegative(_.grid.xNeutral);
  return r === null || x === null ? null : Math.hypot(r, x);
});
const setGridPreset = key => {
  const preset = GRID_IMPEDANCE_PRESETS[key];
  if (!preset) return;
  _.grid.preset = key;
  Object.assign(_.grid, preset);
  _.grid.provenance = key === 'demo' ? 'modeled_demo_not_site_calibrated' : 'modeled_not_site_calibrated';
};
const markGridCustom = () => { _.grid.preset = 'custom'; _.grid.provenance = 'modeled_custom_not_site_calibrated'; };
const gridPresetLabel = computed(() => GRID_IMPEDANCE_PRESETS[_.grid.preset]?.label ?? 'Custom MODELED Grid');

const confirmedWallboxMask = computed(() => {
  if (_.wallbox.r0 === null || _.wallbox.r1 === null) return null;
  return (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
});
const modeledHeatpumpLevel = computed(() => _.heatpump.twinLevel ?? _.heatpump.level);
const modeledWallboxMask = computed(() => _.wallbox.commandedMask ?? confirmedWallboxMask.value);
const modeledBatteryCharging = computed(() => _.battery.commandedCharging ?? _.battery.charging);

const buildingModelReady = computed(() =>
  [modeledHeatpumpLevel.value, modeledWallboxMask.value, modeledBatteryCharging.value].every(value => value !== null && value !== undefined)
);

const buildingElectricalState = computed(() => {
  if (!buildingModelReady.value) return null;
  return buildBuildingComplexPowers({
    heatpumpLevel: modeledHeatpumpLevel.value,
    wallboxMask: modeledWallboxMask.value,
    batteryCharging: modeledBatteryCharging.value === true,
    calibration: _.calibration.model,
    voltageV: BUILDING_CAPACITY.referenceVoltageV,
  });
});

const calculateScenario = deviceState => {
  const baseline = modelBaselineVoltages.value;
  if (!baseline || Object.values(baseline).some(value => value === null)) return null;
  const electrical = buildBuildingComplexPowers({
    heatpumpLevel: deviceState.heatpump,
    wallboxMask: deviceState.wallbox,
    batteryCharging: deviceState.batteryCharging === true,
    calibration: _.calibration.model,
    voltageV: BUILDING_CAPACITY.referenceVoltageV,
  });
  return analyzeIncrementalVuf({
    phasePowers: electrical.phasePowers,
    baselineVoltages: baseline,
    baselineAngles: IDEAL_PHASE_ANGLES,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
    voltageLimits: DEFAULT_VOLTAGE_LIMITS,
  });
};

const vufResult = computed(() => {
  if (!buildingElectricalState.value) return null;
  const baseline = modelBaselineVoltages.value;
  if (!baseline || Object.values(baseline).some(value => value === null)) return null;
  return analyzeIncrementalVuf({
    phasePowers: buildingElectricalState.value.phasePowers,
    baselineVoltages: baseline,
    baselineAngles: IDEAL_PHASE_ANGLES,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
    voltageLimits: DEFAULT_VOLTAGE_LIMITS,
  });
});
const currentVuf = computed(() => numberOrNull(vufResult.value?.vufPercent));
const baselineVuf = computed(() => numberOrNull(vufResult.value?.baselineVufPercent));
const loadImpactVuf = computed(() => numberOrNull(vufResult.value?.scenarioDeltaVufPercent));
const projectedCurrents = computed(() => ({
  a: numberOrNull(vufResult.value?.currentMagnitudes?.a),
  b: numberOrNull(vufResult.value?.currentMagnitudes?.b),
  c: numberOrNull(vufResult.value?.currentMagnitudes?.c),
}));
const loadVoltagesForPhasor = computed(() => ({
  a: numberOrNull(vufResult.value?.voltageMagnitudes?.a ?? modelBaselineVoltages.value?.a),
  b: numberOrNull(vufResult.value?.voltageMagnitudes?.b ?? modelBaselineVoltages.value?.b),
  c: numberOrNull(vufResult.value?.voltageMagnitudes?.c ?? modelBaselineVoltages.value?.c),
}));
const loadAnglesForPhasor = computed(() => ({
  a: numberOrNull(vufResult.value?.voltageAngles?.a) ?? 0,
  b: numberOrNull(vufResult.value?.voltageAngles?.b) ?? -120,
  c: numberOrNull(vufResult.value?.voltageAngles?.c) ?? 120,
}));
const neutralVoltageDropMagnitude = computed(() => {
  const value = vufResult.value?.neutralVoltageDrop;
  return value && Number.isFinite(value.re) && Number.isFinite(value.im) ? Math.hypot(value.re, value.im) : null;
});
const currentSourceLabel = computed(() => {
  const source = buildingElectricalState.value?.source === 'calibrated_pq_building_model'
    ? 'CALIBRATED P/Q BUILDING MODEL'
    : 'P/Q BUILDING MODEL · FALLBACK PROFILE';
  const pending = _.heatpump.commanded || _.wallbox.commandedMask !== null || _.battery.commandedCharging !== null;
  return pending ? `${source} · COMMAND TRAJECTORY` : `${source} · EXECUTION STATE`;
});
const currentYRange = computed(() => ({ min: 0, max: 100 }));

const measurementFresh = computed(() => _.energy_meter.timedelta !== null && _.energy_meter.timedelta < 3);
const branchAReady = computed(() => {
  const payload = _.feedback.branchA.payload;
  if (!payload) return false;
  const state = String(payload.state ?? payload.drive_state ?? payload.safety?.state ?? '').toUpperCase();
  if (['SAFE_MODE', 'FAULT', 'ERROR'].includes(state)) return false;
  return _.feedback.branchA.lastUpdate !== null && performance.now() - _.feedback.branchA.lastUpdate < 4000;
});
const wallboxReady = computed(() => confirmedWallboxMask.value !== null && _.feedback.wallbox.lastUpdate !== null && performance.now() - _.feedback.wallbox.lastUpdate < 6000);
const batteryReady = computed(() => _.battery.charging !== null && _.feedback.battery.lastUpdate !== null && performance.now() - _.feedback.battery.lastUpdate < 6000);
const controlReady = computed(() => measurementFresh.value && branchAReady.value && wallboxReady.value && batteryReady.value && currentVuf.value !== null);
const controlBlockedReason = computed(() => {
  const reasons = [];
  if (!measurementFresh.value) reasons.push('Shelly measurement stale/unavailable');
  if (!branchAReady.value) reasons.push('Branch A status not ready');
  if (!wallboxReady.value) reasons.push('Branch B Shelly relay status not ready');
  if (!batteryReady.value) reasons.push('Battery Shelly status not ready');
  if (currentVuf.value === null) reasons.push('Estimated VUF unavailable');
  return reasons.join(' · ');
});
const startupStatus = computed(() => ({
  shelly: measurementFresh.value,
  branchA: branchAReady.value,
  wallbox: wallboxReady.value,
  battery: batteryReady.value,
  calibration: _.calibration.model?.baseline ? true : false,
}));

const agentDeviceStates = computed(() => ({
  heatpump: _.heatpump.level,
  heatpumpMode: _.heatpump.mode,
  wallbox: confirmedWallboxMask.value,
  batteryCharging: _.battery.charging,
}));
const commandFeedback = computed(() => ({
  branchA: { ack: _.feedback.branchA.ack, status: _.feedback.branchA.payload, commanded: _.heatpump.commanded, fresh: branchAReady.value },
  branchB: { status: { r0: _.wallbox.r0, r1: _.wallbox.r1 }, fresh: wallboxReady.value },
}));

const predictVufForDeviceState = candidate => {
  const result = calculateScenario(candidate);
  if (!result || result.vufPercent === null) return null;
  return {
    vuf: result.vufPercent,
    voltageValid: result.voltageValid,
    voltages: result.voltageMagnitudes,
    minVoltage: result.minVoltage,
    maxVoltage: result.maxVoltage,
  };
};

const applyAgentDeviceState = state => {
  if (own(state, 'heatpump')) sendHeatpumpCommand(levelToHeatpumpCommand(clampInt(state.heatpump, 0, 5)));
  if (own(state, 'wallbox')) {
    const mask = clampInt(state.wallbox, 0, 3);
    _.wallbox.commandedMask = mask;
    App.WallboxService?.set?.(0, (mask & 1) !== 0);
    App.WallboxService?.set?.(1, (mask & 2) !== 0);
  }
  if (own(state, 'batteryCharging')) {
    _.battery.commandedCharging = state.batteryCharging === true;
    App.BatteryService?.set?.(_.battery.commandedCharging);
  }
};
const onAgentEnabledChange = enabled => { _.agent.enabled = enabled; };
const requestHeatpumpStop = () => sendHeatpumpCommand(levelToHeatpumpCommand(0, 'stop'));
const requestHeatpumpZeroHold = () => sendHeatpumpCommand(levelToHeatpumpCommand(0, 'zero_hold'));

const calibrateCurrent = (value, offset) => {
  const n = numberOrNull(value); return n === null ? null : Math.max(0, n - offset);
};
const onEnergyMeter = payload => {
  const raw = { ...payload };
  const measured = {
    ...raw,
    a_current: calibrateCurrent(raw.a_current, CURRENT_ZERO_OFFSET_A.a),
    b_current: calibrateCurrent(raw.b_current, CURRENT_ZERO_OFFSET_A.b),
    c_current: calibrateCurrent(raw.c_current, CURRENT_ZERO_OFFSET_A.c),
    a_voltage: numberOrNull(raw.a_voltage), b_voltage: numberOrNull(raw.b_voltage), c_voltage: numberOrNull(raw.c_voltage),
    a_act_power: numberOrNull(raw.a_act_power), b_act_power: numberOrNull(raw.b_act_power), c_act_power: numberOrNull(raw.c_act_power),
    a_aprt_power: numberOrNull(raw.a_aprt_power), b_aprt_power: numberOrNull(raw.b_aprt_power), c_aprt_power: numberOrNull(raw.c_aprt_power),
    a_pf: numberOrNull(raw.a_pf), b_pf: numberOrNull(raw.b_pf), c_pf: numberOrNull(raw.c_pf),
    source_type: 'measured',
  };
  Object.assign(_.energy_meter.raw, raw);
  Object.assign(_.energy_meter.measured, measured);
  _.energy_meter.lastUpdate = performance.now();
};
const onBranchAAck = payload => { _.feedback.branchA.ack = payload; };
const onBranchAStatus = payload => {
  _.feedback.branchA.payload = payload;
  _.feedback.branchA.lastUpdate = performance.now();
  const state = String(payload?.state ?? payload?.drive_state ?? payload?.safety?.state ?? '').toUpperCase();
  const explicitLevel = firstNumber(payload?.heatpump_level, payload?.level, payload?.vfd?.heatpump_level);
  const frequencyHz = firstNumber(payload?.actual_output_frequency_hz, payload?.target_frequency_hz, payload?.target_hz, payload?.frequency_hz, payload?.vfd?.actual_output_frequency_hz, payload?.vfd?.target_frequency_hz);
  const rawLfrd = firstNumber(payload?.lfrd_reg8602, payload?.lfrd, payload?.vfd?.lfrd_reg8602);

  let level = null;
  let mode = _.heatpump.mode;
  if (['SAFE_MODE', 'FAULT', 'ERROR', 'STOP', 'STOPPED', 'READY'].includes(state)) { level = 0; mode = 'stop'; }
  else if (['ZERO_HOLD', 'RAMPING_TO_ZERO_HOLD'].includes(state)) { level = 0; mode = 'zero_hold'; }
  else {
    if (['RUNNING', 'STARTING'].includes(state)) mode = 'start';
    level = explicitLevel !== null ? clampInt(explicitLevel, 0, 5) : frequencyHzToLevel(frequencyHz ?? (rawLfrd === null ? null : rawLfrd / 10));
  }
  if (level !== null) _.heatpump.level = level;
  _.heatpump.mode = mode;
  if (level !== null) {
    const commandLevel = numberOrNull(_.heatpump.commanded?.level);
    const commandMode = String(_.heatpump.commanded?.mode ?? '');
    const confirmed = commandMode === 'start' ? level === commandLevel : (commandMode === 'stop' ? mode === 'stop' : commandMode === 'zero_hold' ? mode === 'zero_hold' : false);
    if (confirmed) _.heatpump.commanded = null;
    if (!_.heatpump.commanded) _.heatpump.twinLevel = level;
  }
};

const pickBool = (...values) => {
  for (const value of values) { const parsed = boolOrNull(value); if (parsed !== null) return parsed; }
  return null;
};
const readRelay = (payload, index) => {
  const root = payload ?? {}; const relays = root.relays ?? {}; const relayArray = Array.isArray(root.relay) ? root.relay : [];
  if (index === 0) return pickBool(root.r0, root.relay0, root.relay_0, relays.r0, relays.relay0, relays.relay_0, own(root, 'relay1') && own(root, 'relay2') ? root.relay1 : undefined, relayArray[0]);
  return pickBool(root.r1, root.relay_1, root.relay2, relays.r1, relays.relay_1, relays.relay2, own(root, 'relay0') ? root.relay1 : undefined, relayArray[1]);
};
const onWallbox = data => {
  const output = boolOrNull(data?.output);
  if (data?.id === 0 && output !== null) _.wallbox.r0 = output;
  if (data?.id === 1 && output !== null) _.wallbox.r1 = output;
  _.feedback.wallbox.lastUpdate = performance.now();
  const actual = confirmedWallboxMask.value;
  if (actual !== null && _.wallbox.commandedMask === actual) _.wallbox.commandedMask = null;
};
const onBattery = data => {
  const output = boolOrNull(data?.output);
  if (output !== null) _.battery.charging = output;
  _.feedback.battery.lastUpdate = performance.now();
  if (output !== null && _.battery.commandedCharging === output) _.battery.commandedCharging = null;
};

const loadCalibrationModel = async () => {
  if (!App.ElectricalCalibrationService?.getModel) return;
  _.calibration.loading = true;
  try {
    _.calibration.model = await App.ElectricalCalibrationService.getModel();
    _.calibration.status = await App.ElectricalCalibrationService.getStatus?.();
  } catch (error) {
    console.warn('Electrical calibration model unavailable; fallback device P/Q profiles remain active.', error);
  } finally { _.calibration.loading = false; }
};
const onCalibrationProgress = payload => {
  _.calibration.progress = payload;
  if (['calibration_complete', 'baseline_job_complete'].includes(payload?.stage)) loadCalibrationModel();
};
const startBaselineCapture = async () => {
  if (!App.ElectricalCalibrationService?.startBaselineCapture) return;
  if (!window.confirm('Capture a 10 s PCC baseline now? Ensure controllable devices are OFF / ZERO before continuing.')) return;
  await App.ElectricalCalibrationService.startBaselineCapture('CAPTURE_PCC_BASELINE', 10000);
};
const startAutoCalibration = async () => {
  if (!App.ElectricalCalibrationService?.startRecommendedCalibration) return;
  if (!window.confirm('This calibration will physically switch Heat Pump, both Wallbox relays and Battery through multiple states for about 2–3 minutes. Continue?')) return;
  await App.ElectricalCalibrationService.startRecommendedCalibration('CALIBRATE_REAL_HARDWARE', { settleMs: 6000, captureMs: 10000 });
};

const bindRuntime = () => {
  if (bound || !App._.servicesReady) return;
  if (!App.EnergyMeterService || !App.WallboxService || !App.BatteryService || !App.EspService) return;
  bound = true;
  App.EnergyMeterService.on('data', onEnergyMeter);
  App.WallboxService.on('data', onWallbox);
  App.BatteryService.on('data', onBattery);
  App.EspService.on?.('branchA', onBranchAStatus);
  App.EspService.on?.('branchA_ack', onBranchAAck);
  App.ElectricalCalibrationService?.on?.('progress', onCalibrationProgress);
  App.EnergyMeterService.requestUpdate?.();
  App.WallboxService.requestUpdate?.();
  App.BatteryService.requestUpdate?.();
  App.EspService.requestUpdate?.();
  loadCalibrationModel();
};
const unbindRuntime = () => {
  if (!bound) return;
  App.EnergyMeterService?.off?.('data', onEnergyMeter);
  App.WallboxService?.off?.('data', onWallbox);
  App.BatteryService?.off?.('data', onBattery);
  App.EspService?.off?.('branchA', onBranchAStatus);
  App.EspService?.off?.('branchA_ack', onBranchAAck);
  App.ElectricalCalibrationService?.off?.('progress', onCalibrationProgress);
  bound = false;
};
const animate = () => {
  if (_.energy_meter.lastUpdate) _.energy_meter.timedelta = (performance.now() - _.energy_meter.lastUpdate) / 1000;
  animationFrame = requestAnimationFrame(animate);
};

onMounted(() => {
  console.info(`[Senergate] Frontend ${FRONTEND_BUILD_VERSION}`);
  App.setMode('real');
  bindRuntime();
  servicesWatchStop = watch(() => App._.servicesReady, ready => { if (ready) bindRuntime(); else unbindRuntime(); });
  animationFrame = requestAnimationFrame(animate);
});
onUnmounted(() => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  servicesWatchStop?.();
  unbindRuntime();
});
</script>

<template>
  <div class="dashboard">
    <header class="topbar">
      <div>
        <h1>SENERGATE</h1>
        <p>Smart Energy Gateway · REAL HARDWARE</p>
      </div>
      <div class="runtime-switch">
        <span class="runtime-fixed">REAL HARDWARE</span>
        <span class="runtime-version">{{ FRONTEND_BUILD_VERSION }}</span>
        <span class="runtime-status" :class="App._.connected ? 'online' : 'offline'">{{ App._.connected ? 'Pi5 CONNECTED' : 'Pi5 DISCONNECTED' }}</span>
      </div>
    </header>

    <div class="startup-panel">
      <strong>Startup initialization / 首次进入初始化检查</strong>
      <div class="startup-chips">
        <span :class="{ ok: startupStatus.shelly }">Shelly {{ startupStatus.shelly ? '✓' : '…' }}</span>
        <span :class="{ ok: startupStatus.branchA }">Branch A {{ startupStatus.branchA ? '✓' : '…' }}</span>
        <span :class="{ ok: startupStatus.wallbox }">Branch B · Shelly {{ startupStatus.wallbox ? '✓' : '…' }}</span>
        <span :class="{ ok: startupStatus.battery }">Battery {{ startupStatus.battery ? '✓' : '…' }}</span>
        <span :class="{ ok: startupStatus.calibration }">P/Q calibration {{ startupStatus.calibration ? '✓' : 'fallback' }}</span>
      </div>
    </div>

    <div class="grid-impedance-panel">
      <div class="grid-panel-head">
        <div>
          <strong>Senergate Grid Impedance / Netzimpedanz / 电网阻抗</strong>
          <p>Estimated VUF remains a MODELED building-scale indicator. The Demo Weak Grid is deliberately non-site-calibrated and allows a VUF above 2.5% in strongly unbalanced scenarios; AI candidates are nevertheless rejected outside 207–253 V.</p>
        </div>
        <span class="grid-provenance">{{ _.grid.provenance.toUpperCase() }}</span>
      </div>

      <div class="grid-preset-actions">
        <span>Grid scenario:</span>
        <button v-for="key in ['stiff','typical','weak','demo']" :key="key" type="button" :class="{ selected: _.grid.preset === key }" @click="setGridPreset(key)">{{ key === 'demo' ? 'Demo Weak Grid' : GRID_IMPEDANCE_PRESETS[key].label }}</button>
        <span class="grid-name">{{ gridPresetLabel }}</span>
      </div>

      <div class="grid-parameter-grid">
        <label><span>R<sub>phase</sub> [Ω]</span><input v-model.number="_.grid.rPhase" type="number" min="0" max="1" step="0.005" @input="markGridCustom" /></label>
        <label><span>X<sub>phase</sub> [Ω]</span><input v-model.number="_.grid.xPhase" type="number" min="0" max="1" step="0.005" @input="markGridCustom" /></label>
        <label><span>R<sub>N</sub> [Ω]</span><input v-model.number="_.grid.rNeutral" type="number" min="0" max="1" step="0.005" @input="markGridCustom" /></label>
        <label><span>X<sub>N</sub> [Ω]</span><input v-model.number="_.grid.xNeutral" type="number" min="0" max="1" step="0.005" @input="markGridCustom" /></label>
      </div>

      <div class="grid-derived">
        <span>|Z<sub>phase</sub>| = {{ formatNullableNumber(phaseImpedanceMagnitude, 3, ' Ω') }}</span>
        <span>|Z<sub>N</sub>| = {{ formatNullableNumber(neutralImpedanceMagnitude, 3, ' Ω') }}</span>
        <span>|V<sub>N</sub>| = {{ neutralVoltageDropMagnitude !== null ? `${neutralVoltageDropMagnitude.toFixed(2)} V` : '--' }}</span>
        <span>Baseline: {{ baselineSourceLabel }}</span>
        <span>Model: V<sub>PCC,proj</sub> = V<sub>PCC,baseline</sub> − Z·ΔI − Z<sub>N</sub>·ΔI<sub>N</sub></span>
        <span>Branch A: 2 HP modules · max 40 A</span>
        <span>Branch B: 4 Wallboxes · max 64 A</span>
        <span>Battery: building equivalent · max 40 A</span>
      </div>

      <div class="calibration-actions">
        <button type="button" :disabled="!App.ElectricalCalibrationService" @click="startBaselineCapture">CAPTURE 10 s BASELINE</button>
        <button type="button" class="calibrate" :disabled="!App.ElectricalCalibrationService" @click="startAutoCalibration">RUN P/Q CALIBRATION</button>
        <span>{{ _.calibration.progress?.stage ?? (_.calibration.model?.baseline ? 'calibration model loaded' : 'fallback P/Q profiles active') }}</span>
      </div>
    </div>

    <div class="overview-grid">
      <CurrentCard :measured-currents="measuredCurrents" :currents="projectedCurrents" :y-range="currentYRange" :source-label="currentSourceLabel" />
      <PhasorCard :voltages="loadVoltagesForPhasor" :angles="loadAnglesForPhasor" />
      <VufCard :vuf="currentVuf" :baseline-vuf="baselineVuf" :load-impact-vuf="loadImpactVuf" />
    </div>

    <div class="agent-section">
      <AgentCard
        :vuf="currentVuf"
        :device-states="agentDeviceStates"
        :predict-vuf="predictVufForDeviceState"
        :control-ready="controlReady"
        :control-blocked-reason="controlBlockedReason"
        :command-feedback="commandFeedback"
        @apply-state="applyAgentDeviceState"
        @heatpump-stop="requestHeatpumpStop"
        @heatpump-zero-hold="requestHeatpumpZeroHold"
        @enabled-change="onAgentEnabledChange"
      />
    </div>

    <div class="footer-meta">
      <span>MEASURED: Shelly U/I/P/S/PF · MODELED: building P/Q/current · ESTIMATED: projected voltage/VUF</span>
      <span>Measurement age: {{ _.energy_meter.timedelta !== null ? `${_.energy_meter.timedelta.toFixed(1)} s` : '--' }} · Voltage guard: 207–253 V</span>
    </div>
  </div>
</template>

<style scoped>
.dashboard{max-width:1540px;margin:0 auto;padding:20px;color:#eaf6ff}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:12px 20px;border:1px solid #1b3a4e;border-radius:20px;background:rgba(7,19,31,.82);box-shadow:0 20px 60px rgba(0,0,0,.25)}.topbar h1{margin:0;font-size:28px;letter-spacing:.28em}.topbar p{margin:4px 0 0;color:#83a7bd;font-size:10px;letter-spacing:.12em}.runtime-switch{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.runtime-fixed,.runtime-version,.runtime-status{padding:6px 9px;border:1px solid #284b60;border-radius:999px;font-size:9px}.runtime-fixed{border-color:#58e7ff;background:#103044}.runtime-version{color:#88a9ba}.runtime-status.online{color:#8ff1c3;border-color:#2b6f62}.runtime-status.offline{color:#ff8c97;border-color:#6b3740}
.startup-panel,.grid-impedance-panel{margin-top:14px;padding:14px 16px;border:1px solid #3a5364;border-radius:16px;background:#0b1822}.startup-panel strong,.grid-panel-head strong{font-size:12px}.startup-chips{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.startup-chips span{padding:5px 8px;border:1px solid #44515b;border-radius:999px;color:#9aaab4;font-size:9px}.startup-chips span.ok{color:#8ff1c3;border-color:#2b6f62}.grid-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.grid-panel-head p{max-width:980px;margin:4px 0 0;color:#89a8b9;font-size:10px;line-height:1.5}.grid-provenance{padding:5px 8px;border:1px solid #665c2d;border-radius:999px;color:#ffe795;font-size:9px}.grid-preset-actions,.grid-derived,.calibration-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px;color:#789aac;font-size:10px}.grid-preset-actions button,.calibration-actions button{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:10px}.grid-preset-actions button.selected,.calibration-actions button.calibrate{border-color:#58e7ff;color:#eaf6ff}.grid-name{margin-left:auto;color:#b9d6e5}.grid-parameter-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-top:12px}.grid-parameter-grid label{display:grid;gap:5px;color:#9db7c5;font-size:10px}.grid-parameter-grid input{width:100%;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#eaf6ff}.grid-derived span{padding:5px 7px;border:1px solid #1f3b4d;border-radius:8px;background:#081721}.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px;align-items:stretch}.overview-grid>*{min-width:0}.agent-section{margin-top:14px}.footer-meta{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding:0 4px;color:#6f91a3;font-size:10px}
@media(max-width:1100px){.overview-grid{grid-template-columns:1fr}.grid-parameter-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.grid-name{margin-left:0}}@media(max-width:700px){.dashboard{padding:10px}.topbar,.footer-meta,.grid-panel-head{flex-direction:column;align-items:flex-start}.runtime-switch{justify-content:flex-start}.grid-parameter-grid{grid-template-columns:1fr}}
</style>
