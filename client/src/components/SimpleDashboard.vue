<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';

import App from '../App.js';
import {
  BUILDING_TWIN_CONFIG,
  wallboxMaskFromRelays,
} from '../BuildingTwinModel.js';
import PhasorCalculator from './PhasorCalculator.js';
import VufCard from './VufCard.vue';
import CurrentCard from './CurrentCard.vue';
import PhasorCard from './PhasorCard.vue';
import AgentCard from './AgentCard.vue';
import { deriveHeatpumpStatus, heatpumpCommandToTwinLevel } from '../HeatpumpStatusAdapter.js';
import {
  classifyBranchAAckForCommand,
  classifyBranchAStatusForCommand,
  shouldCompleteBranchACommand,
} from '../BranchACommandCorrelation.js';
import { cloneControlPolicyDefaults, CONTROL_THRESHOLD_KEYS, validateControlPolicyThresholds } from '../ControlPolicyConfig.js';
import { computeCapacityStatus, heatpumpAdjustabilityRule, wallboxAdjustabilityRule } from '../CapacitySupervisor.js';
import { computeBatteryDeltaCurrentA, computeCompleteThreePhaseLoadPowerW } from '../MeasurementValidity.js';
import {
  DEFAULT_ELECTRICAL_PROFILES,
  baselineVoltagesFromProfiles,
  modelBuildingPowers,
  profileSummary,
} from '../ElectricalProfileModel.js';

const sourceScenarios = {
  ideal: {
    angle: { a: 0, b: -120, c: 120 },
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
    provenance: 'generic_reference_only',
  },
  typical: {
    label: 'Typical Building Feeder',
    rPhase: 0.08,
    xPhase: 0.03,
    rNeutral: 0.06,
    xNeutral: 0.02,
    provenance: 'generic_reference_only',
  },
  weak: {
    label: 'Weak Feeder',
    rPhase: 0.12,
    xPhase: 0.05,
    rNeutral: 0.10,
    xNeutral: 0.03,
    provenance: 'generic_reference_only',
  },
  demo: {
    label: 'Weak-Grid Demo · Branch A/B single-max VUF >2.3% target',
    // Explicit DEMO feeder. Together with the building-equivalent asset
    // capacities, Branch A max (60 A) and Branch B max (64 A) can each produce
    // a visible >2.3% modeled VUF while remaining above the 207 V guard.
    rPhase: 0.26,
    xPhase: 0.091,
    rNeutral: 0.03,
    xNeutral: 0.01,
    provenance: 'weak_grid_demo_branch_ab_single_max_vuf_gt_2_3_not_site_calibrated',
  },
};

const FRONTEND_BUILD_VERSION = 'v1.5.1-ai-i-hard-limit-operator-override';
const HEATPUMP_LEVELS = BUILDING_TWIN_CONFIG.heatpumpLevels;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });

// Shelly zero-current calibration remains part of the measured layer.
const CURRENT_ZERO_OFFSET_A = { a: 0.24, b: 0.19, c: 0.13 };

const _ = reactive({
  count: 0,
  heatpump: { level: null, twinLevel: null, mode: null, commanded: null, effectiveTargetHz: null, effectiveTargetSource: null, targetHz: null, actualHz: null, executionState: '' },
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
    scenario: 'ideal',
    sourceAngle: { a: 0, b: -120, c: 120 },
  },
  grid: {
    preset: 'demo',
    rPhase: GRID_IMPEDANCE_PRESETS.demo.rPhase,
    xPhase: GRID_IMPEDANCE_PRESETS.demo.xPhase,
    rNeutral: GRID_IMPEDANCE_PRESETS.demo.rNeutral,
    xNeutral: GRID_IMPEDANCE_PRESETS.demo.xNeutral,
    provenance: GRID_IMPEDANCE_PRESETS.demo.provenance,
  },
  electricalModel: {
    profiles: JSON.parse(JSON.stringify(DEFAULT_ELECTRICAL_PROFILES)),
    calibration: { running: false, progress: { stage: 'idle', index: 0, total: 0, message: '' } },
  },
  agent: { enabled: false, state: 'inactive' },
  controlPolicy: cloneControlPolicyDefaults(),
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
let heatpumpCommandGeneration = 0;

const heatpumpTwinUsesCommandTrajectory = computed(() => {
  const confirmed = numberOrNull(_.heatpump.level);
  const modeled = numberOrNull(_.heatpump.twinLevel);
  const state = String(_.heatpump.executionState ?? '').toUpperCase();
  return _.heatpump.commanded !== null &&
    ['STARTING', 'RUNNING'].includes(state) &&
    modeled !== null && modeled !== confirmed;
});

const currentSourceLabel = computed(() =>
  heatpumpTwinUsesCommandTrajectory.value
    ? 'BUILDING-SCALE DIGITAL TWIN · P/Q COMMAND TRAJECTORY (execution pending)'
    : 'BUILDING-SCALE DIGITAL TWIN · P/Q PROFILE FROM REAL execution state'
);
const currentYRange = computed(() => ({ min: 0, max: 100 }));
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
  if (forcedMode === 'stop') return { mode: 'stop', level: 0, target_hz: 0 };
  if (forcedMode === 'zero_hold' || safeLevel === 0) return { mode: 'zero_hold', level: 0, target_hz: 0 };
  return { mode: 'start', level: safeLevel, target_hz: levelToTargetHz(safeLevel) };
};

const sendHeatpumpCommand = command => {
  const generation = ++heatpumpCommandGeneration;
  const previousCommanded = _.heatpump.commanded ? { ..._.heatpump.commanded } : null;
  const previousTwinLevel = _.heatpump.twinLevel;
  const twinLevel = heatpumpCommandToTwinLevel(command);

  // Building-Twin command trajectory: update immediately when the operator/AI
  // issues a valid command. This is MODELED command state, not physical
  // execution confirmation. confirmedLevel (_.heatpump.level) remains driven
  // only by Branch-A status/RFRD in onBranchAStatus().
  _.heatpump.commanded = {
    ...command,
    ts: Date.now(),
    generation,
    ackCmdId: null,
    ackStatus: 'awaiting_ack',
    preCommandLastCmdId: _.realFeedback.branchA.payload?.last_cmd_id ?? '',
    preCommandAckId: _.realFeedback.branchA.ack?.cmd_id ?? '',
    previousTwinLevel,
  };
  if (twinLevel !== null) _.heatpump.twinLevel = twinLevel;

  return Promise.resolve(App.EspService.heatpump(command))
    .then(result => {
      if (generation !== heatpumpCommandGeneration) return result;

      if (result?.accepted === false) {
        _.heatpump.commanded = previousCommanded;
        _.heatpump.twinLevel = previousTwinLevel;
      }
      return result;
    })
    .catch(error => {
      if (generation === heatpumpCommandGeneration) {
        _.heatpump.commanded = previousCommanded;
        _.heatpump.twinLevel = previousTwinLevel;
      }
      console.error('Heatpump RPC failed; Building-Twin command projection rolled back.', error);
      return {
        accepted: false,
        reason: 'rpc_failed',
        message: error instanceof Error ? error.message : String(error),
      };
    });
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
  _.heatpump.twinLevel = null;
  _.heatpump.mode = null;
  _.heatpump.commanded = null;
  _.heatpump.effectiveTargetHz = null;
  _.heatpump.effectiveTargetSource = null;
  _.heatpump.targetHz = null;
  _.heatpump.actualHz = null;
  _.heatpump.executionState = '';
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
  _.grid.provenance = preset.provenance ?? 'modeled';
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

const calibrationStatusLabel = computed(() => {
  if (_.electricalModel.calibration?.running === true) return 'CALIBRATION RUNNING';
  return electricalProfileSummary.value.calibrated ? 'P/Q PROFILE CALIBRATED' : 'P/Q FALLBACK MODEL';
});

const calibrationProgressText = computed(() => {
  const progress = _.electricalModel.calibration?.progress;
  if (!progress) return '';
  const prefix = progress.total > 0 ? `${progress.index}/${progress.total} · ` : '';
  return `${prefix}${progress.message ?? progress.stage ?? ''}`;
});

const markGridCustom = () => {
  _.grid.preset = 'custom';
  _.grid.provenance = 'modeled';
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

const currentDeviceStateForModel = computed(() => {
  const heatpumpLevel = numberOrNull(_.heatpump.twinLevel);
  const wallboxMask = (_.wallbox.r0 === null || _.wallbox.r1 === null)
    ? null
    : wallboxMaskFromRelays(_.wallbox.r0, _.wallbox.r1);
  const batteryCharging = _.battery.charging;
  return { heatpumpLevel, wallboxMask, batteryCharging };
});

const allControllableDevicesOff = computed(() => {
  const state = currentDeviceStateForModel.value;
  return state.heatpumpLevel === 0 && state.wallboxMask === 0 && state.batteryCharging === false;
});

const activeProfiles = computed(() => _.electricalModel.profiles ?? DEFAULT_ELECTRICAL_PROFILES);
const electricalProfileSummary = computed(() => profileSummary(activeProfiles.value));

const baselineModel = computed(() => {
  // A persisted all-OFF calibration is preferred. Before calibration, live
  // Shelly voltage can be used as a temporary baseline only while every
  // controllable device is actually OFF. Under load we fall back to nominal
  // 230 V rather than subtracting a modeled feeder drop twice from a measured
  // loaded PCC voltage.
  const liveOffFallback = allControllableDevicesOff.value ? measuredVoltages.value : { a: 230, b: 230, c: 230 };
  return baselineVoltagesFromProfiles(activeProfiles.value, liveOffFallback);
});

const buildingPowerModel = computed(() => {
  const state = currentDeviceStateForModel.value;
  return modelBuildingPowers({
    profiles: activeProfiles.value,
    heatpumpLevel: state.heatpumpLevel,
    wallboxMask: state.wallboxMask,
    batteryCharging: state.batteryCharging,
    phaseVoltages: baselineModel.value.voltages,
  });
});

const vufResult = computed(() => {
  const model = buildingPowerModel.value;
  if (!model) return null;

  return PhasorCalculator.analyzeVUFIncrementalPQ({
    powers: model.powers,
    baselineVoltages: baselineModel.value.voltages,
    baselineAngles: sourceScenarios.ideal.angle,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
    voltageLimits: { min: 207, max: 253 },
  });
});

const projectedCurrents = computed(() => {
  const values = vufResult.value?.currentMagnitudes;
  if (!values) return { a: null, b: null, c: null };
  return {
    a: numberOrNull(values.a),
    b: numberOrNull(values.b),
    c: numberOrNull(values.c),
  };
});

const currentVuf = computed(() => numberOrNull(vufResult.value?.vufPercent));
const baselineVuf = computed(() => numberOrNull(vufResult.value?.baselineVufPercent));
const loadImpactVuf = computed(() => numberOrNull(vufResult.value?.scenarioDeltaVufPercent));

const loadVoltagesForPhasor = computed(() => {
  const values = vufResult.value?.loadVoltageMagnitudes;
  if (!values) return baselineModel.value.voltages;
  return {
    a: numberOrNull(values.a),
    b: numberOrNull(values.b),
    c: numberOrNull(values.c),
  };
});

const loadAnglesForPhasor = computed(() => {
  const values = vufResult.value?.loadVoltageAngles;
  if (!values) return { ...sourceScenarios.ideal.angle };
  return {
    a: numberOrNull(values.a),
    b: numberOrNull(values.b),
    c: numberOrNull(values.c),
  };
});

const voltagePredictionState = computed(() => {
  const value = vufResult.value?.voltageSafe;
  if (value === true) return { key: 'safe', label: 'SAFE' };
  if (value === false) return { key: 'unsafe', label: 'VIOLATED' };
  return { key: 'unknown', label: 'UNKNOWN' };
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

const startupCoreReady = computed(() =>
  startupChecklist.value.socket &&
  startupChecklist.value.services &&
  startupChecklist.value.mqtt &&
  startupChecklist.value.measurement &&
  startupChecklist.value.branchA
);

const startupAllReady = computed(() => Object.values(startupChecklist.value).every(Boolean));

// Branch B and Battery are checked and displayed, but they must not hold the
// whole dashboard hostage. The previous working control path only required
// fresh measurement data plus Branch-A readiness for general operation.
const startupDataVisible = computed(() => _.startup.phase === 'ready' && startupCoreReady.value);

const startupNullPhases = Object.freeze({ a: null, b: null, c: null });
const displayMeasuredCurrents = computed(() =>
  startupDataVisible.value ? measuredCurrents.value : startupNullPhases
);
const displayProjectedCurrents = computed(() =>
  startupDataVisible.value ? projectedCurrents.value : startupNullPhases
);
const displayPhasorVoltages = computed(() =>
  startupDataVisible.value ? loadVoltagesForPhasor.value : startupNullPhases
);
const displayPhasorAngles = computed(() =>
  startupDataVisible.value ? loadAnglesForPhasor.value : startupNullPhases
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

const controlReady = computed(() => measurementFresh.value && branchAReady.value && _.electricalModel.calibration?.running !== true);

const controlBlockedReason = computed(() => {
  if (_.electricalModel.calibration?.running === true) return 'Electrical P/Q calibration is running; normal control is temporarily locked.';
  if (!measurementFresh.value) return 'Measurement data stale or unavailable';
  if (!branchAReady.value) return 'Waiting for Branch-A status or Branch-A is not ready';
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

const heatpumpMode = computed(() => {
  const mode = String(_.heatpump.mode ?? '').toLowerCase();
  return ['start', 'stop', 'zero_hold'].includes(mode) ? mode : null;
});

const wallboxLevel = computed(() => {
  if (_.wallbox.r0 === null || _.wallbox.r1 === null) return numberOrNull(_.wallbox.load) === null ? null : clampInt(_.wallbox.load, 0, 3);
  return (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
});

const batteryCharging = computed(() => (_.battery.charging === null ? null : _.battery.charging === true));


const measuredTotalPowerW = computed(() =>
  computeCompleteThreePhaseLoadPowerW(_.energy_meter.measured)
);

const modeledTotalPowerW = computed(() => {
  const powers = buildingPowerModel.value?.powers;
  if (!powers) return null;
  const phasePowers = [powers.a?.p, powers.b?.p, powers.c?.p].map(numberOrNull);
  if (phasePowers.some(value => value === null)) return null;
  return phasePowers.reduce((sum, value) => sum + value, 0);
});

const modeledCapacityCurrents = computed(() => ({
  a: projectedCurrents.value.a,
  b: projectedCurrents.value.b,
  c: projectedCurrents.value.c,
}));

const batteryMeasuredCurrentA = computed(() => computeBatteryDeltaCurrentA({
  charging: batteryCharging.value,
  rawPhaseCurrentA: _.energy_meter.raw?.c_current,
  baselinePhaseCurrentA: activeProfiles.value?.baseline?.measured?.c?.current_a,
}));

const capacityStatus = computed(() => computeCapacityStatus({
  policy: _.controlPolicy,
  measuredCurrents: measuredCurrents.value,
  measuredTotalPowerW: measuredTotalPowerW.value,
  modeledCurrents: modeledCapacityCurrents.value,
  modeledTotalPowerW: modeledTotalPowerW.value,
  dataFresh: measurementFresh.value,
}));

const siteLimitsEnabled = computed(() => capacityStatus.value.enabled);
const capacityLimitsFullyConfigured = computed(() => capacityStatus.value.fullyConfigured);
const capacityConfiguredMetricCount = computed(() => capacityStatus.value.configuredMetricCount);
const capacityMetrics = computed(() => capacityStatus.value.metrics);
const limitingCapacityMetric = computed(() => capacityStatus.value.limitingMetric);
const capacityUsageRatio = computed(() => capacityStatus.value.usageRatio);
const siteHeadroomRatio = capacityUsageRatio;
const remainingHeadroomRatio = computed(() => capacityStatus.value.remainingRatio);
const capacityState = computed(() => capacityStatus.value.state);
const capacityDataFresh = computed(() => capacityStatus.value.dataFresh);
const capacityUsagePercent = computed(() => capacityUsageRatio.value === null ? null : capacityUsageRatio.value * 100);
const remainingHeadroomPercent = computed(() => remainingHeadroomRatio.value === null ? null : remainingHeadroomRatio.value * 100);

const heatpumpAdjustabilityState = computed(() => heatpumpAdjustabilityRule(_.controlPolicy.heatpumpAdjustability));
const wallboxAdjustabilityState = computed(() => wallboxAdjustabilityRule(_.controlPolicy.wallboxAdjustability));
const heatpumpMinAllowedLabel = computed(() => heatpumpAdjustabilityState.value.locked ? 'LOCKED' : `Level ${heatpumpAdjustabilityState.value.minLevel}`);
const wallboxMinAllowedLabel = computed(() => wallboxAdjustabilityState.value.locked ? 'LOCKED' : `Level ${wallboxAdjustabilityState.value.minLevel}`);

const formatCapacityValue = (value, unit) => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '--';
  const numeric = Number(value);
  if (unit === 'W' && Math.abs(numeric) >= 1000) return `${(numeric / 1000).toFixed(2)} kW`;
  if (unit === 'W') return `${numeric.toFixed(0)} W`;
  if (unit === 'A') return `${numeric.toFixed(2)} A`;
  return `${numeric.toFixed(2)} ${unit ?? ''}`.trim();
};

const formatCapacityLimit = (value, unit) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0
    ? formatCapacityValue(value, unit)
    : 'Not configured';

const formatCapacityUsage = ratio =>
  ratio !== null && ratio !== undefined && ratio !== '' && Number.isFinite(Number(ratio))
    ? `${(Number(ratio) * 100).toFixed(1)}%`
    : '--';

const capacityLimitModeLabel = computed(() => {
  if (!siteLimitsEnabled.value) return 'Limits: OFF';
  return capacityLimitsFullyConfigured.value
    ? 'Limits: ON'
    : `Limits: PARTIAL ${capacityConfiguredMetricCount.value}/4`;
});

const capacityPanelExpanded = ref(false);
const gridImpedanceExpanded = ref(true);
const operatorAdjustabilityExpanded = ref(false);
const advancedControlExpanded = ref(false);

const CAPACITY_PANEL_STORAGE_KEY = 'senergate.capacityPanelExpanded';
const GRID_IMPEDANCE_STORAGE_KEY = 'senergate.gridImpedanceExpanded';
const OPERATOR_ADJUSTABILITY_STORAGE_KEY = 'senergate.operatorAdjustabilityExpanded';
const ADVANCED_CONTROL_STORAGE_KEY = 'senergate.advancedControlExpanded';

const adjustabilityDraft = reactive({
  heatpump: _.controlPolicy.heatpumpAdjustability,
  wallbox: _.controlPolicy.wallboxAdjustability,
});
const adjustabilityEditing = ref(null);
const adjustabilityValidationMessage = reactive({ heatpump: '', wallbox: '' });
const hardLimitOverride = reactive({
  active: false,
  asset: null,
  configuredFloor: '--',
  effectiveLevel: '--',
});

const previewAdjustabilityRule = (asset, value) =>
  asset === 'heatpump' ? heatpumpAdjustabilityRule(value) : wallboxAdjustabilityRule(value);

const heatpumpAdjustabilityPreview = computed(() => previewAdjustabilityRule('heatpump', adjustabilityDraft.heatpump));
const wallboxAdjustabilityPreview = computed(() => previewAdjustabilityRule('wallbox', adjustabilityDraft.wallbox));

const adjustabilityPreviewLabel = rule => rule.locked ? 'LOCKED' : `Minimum Level ${rule.minLevel}`;

const commitAdjustability = asset => {
  const key = asset === 'heatpump' ? 'heatpumpAdjustability' : 'wallboxAdjustability';
  const numeric = Number(adjustabilityDraft[asset]);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
    adjustabilityValidationMessage[asset] = 'Valid range: integer 1–100. Previous active value remains unchanged.';
    adjustabilityDraft[asset] = _.controlPolicy[key];
    return false;
  }
  _.controlPolicy[key] = numeric;
  adjustabilityDraft[asset] = numeric;
  adjustabilityValidationMessage[asset] = '';
  return true;
};

const finishAdjustabilityEdit = asset => {
  commitAdjustability(asset);
  adjustabilityEditing.value = null;
};

const handleAdjustabilityKeydown = (event, asset) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  commitAdjustability(asset);
  event.currentTarget?.blur();
};

const thresholdValidationMessage = ref('');
const lastValidThresholds = reactive(Object.fromEntries(
  CONTROL_THRESHOLD_KEYS.map(key => [key, _.controlPolicy[key]])
));
let restoringInvalidThresholds = false;

watch(
  () => CONTROL_THRESHOLD_KEYS.map(key => _.controlPolicy[key]),
  () => {
    if (restoringInvalidThresholds) return;

    const validation = validateControlPolicyThresholds(_.controlPolicy);
    if (validation.valid) {
      for (const key of CONTROL_THRESHOLD_KEYS) lastValidThresholds[key] = _.controlPolicy[key];
      thresholdValidationMessage.value = '';
      return;
    }

    thresholdValidationMessage.value = validation.errors.join(' ');
    restoringInvalidThresholds = true;
    for (const key of CONTROL_THRESHOLD_KEYS) _.controlPolicy[key] = lastValidThresholds[key];
    queueMicrotask(() => { restoringInvalidThresholds = false; });
  },
  { flush: 'sync' }
);

const loadAccordionState = (key, fallback) => {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // localStorage may be unavailable in restricted browser environments.
  }
  return fallback;
};

const persistAccordionState = (key, value) => {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // localStorage may be unavailable in restricted browser environments.
  }
};

onMounted(() => {
  capacityPanelExpanded.value = loadAccordionState(CAPACITY_PANEL_STORAGE_KEY, false);
  // Keep the existing dashboard appearance on first load: Grid Impedance stays
  // open until the operator explicitly collapses it.
  gridImpedanceExpanded.value = loadAccordionState(GRID_IMPEDANCE_STORAGE_KEY, true);
  operatorAdjustabilityExpanded.value = loadAccordionState(OPERATOR_ADJUSTABILITY_STORAGE_KEY, false);
  adjustabilityDraft.heatpump = _.controlPolicy.heatpumpAdjustability;
  adjustabilityDraft.wallbox = _.controlPolicy.wallboxAdjustability;
  advancedControlExpanded.value = loadAccordionState(ADVANCED_CONTROL_STORAGE_KEY, false);
});

watch(capacityPanelExpanded, value => persistAccordionState(CAPACITY_PANEL_STORAGE_KEY, value));
watch(gridImpedanceExpanded, value => persistAccordionState(GRID_IMPEDANCE_STORAGE_KEY, value));
watch(operatorAdjustabilityExpanded, value => persistAccordionState(OPERATOR_ADJUSTABILITY_STORAGE_KEY, value));
watch(advancedControlExpanded, value => persistAccordionState(ADVANCED_CONTROL_STORAGE_KEY, value));

watch(() => _.controlPolicy.heatpumpAdjustability, value => {
  if (adjustabilityEditing.value !== 'heatpump') adjustabilityDraft.heatpump = value;
});
watch(() => _.controlPolicy.wallboxAdjustability, value => {
  if (adjustabilityEditing.value !== 'wallbox') adjustabilityDraft.wallbox = value;
});

const agentDeviceStates = computed(() => ({
  heatpump: heatpumpLevel.value,
  heatpumpMode: heatpumpMode.value,
  wallbox: wallboxLevel.value,
  batteryCharging: batteryCharging.value,
}));

const predictVufForDeviceState = candidate => {
  const model = modelBuildingPowers({
    profiles: activeProfiles.value,
    heatpumpLevel: candidate.heatpump,
    wallboxMask: candidate.wallbox,
    batteryCharging: candidate.batteryCharging,
    phaseVoltages: baselineModel.value.voltages,
  });
  if (!model) return null;

  const result = PhasorCalculator.analyzeVUFIncrementalPQ({
    powers: model.powers,
    baselineVoltages: baselineModel.value.voltages,
    baselineAngles: sourceScenarios.ideal.angle,
    resistance: phaseResistance.value,
    reactance: phaseReactance.value,
    neutralResistance: finiteNonNegative(_.grid.rNeutral),
    neutralReactance: finiteNonNegative(_.grid.xNeutral),
    voltageLimits: { min: 207, max: 253 },
  });

  const vuf = numberOrNull(result?.vufPercent);
  if (vuf === null) return null;

  const predictedModeledCurrents = result?.currentMagnitudes ?? null;
  const phasePowers = [model.powers?.a?.p, model.powers?.b?.p, model.powers?.c?.p].map(numberOrNull);
  const predictedModeledTotalPowerW = phasePowers.some(value => value === null)
    ? null
    : phasePowers.reduce((sum, value) => sum + value, 0);
  const predictedCapacity = computeCapacityStatus({
    policy: _.controlPolicy,
    measuredCurrents: {},
    measuredTotalPowerW: null,
    modeledCurrents: predictedModeledCurrents,
    modeledTotalPowerW: predictedModeledTotalPowerW,
    dataFresh: true,
  });

  return {
    vuf,
    voltageSafe: result?.voltageSafe === true,
    voltages: result?.loadVoltageMagnitudes ?? null,
    capacityUsageRatio: predictedCapacity.usageRatio,
    capacityLimitingMetric: predictedCapacity.limitingMetric?.key ?? null,
  };
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

    // Keep the last confirmed Shelly state visible while a new command is in
    // flight. Do not set r0/r1 to null: that used to invalidate the global
    // control gate until the next Shelly status. For cross-mask transitions
    // (e.g. logical Level 2 / mask 2 -> Level 1 / mask 1), issue OFF operations
    // before ON operations (break-before-make) so a capacity derating action
    // cannot transiently create mask 3 by turning the new relay on first.
    const relayOps = [];
    if (_.wallbox.r0 === true && targetR0 === false) relayOps.push([0, false]);
    if (_.wallbox.r1 === true && targetR1 === false) relayOps.push([1, false]);
    if (_.wallbox.r0 === false && targetR0 === true) relayOps.push([0, true]);
    if (_.wallbox.r1 === false && targetR1 === true) relayOps.push([1, true]);
    for (const [relay, on] of relayOps) runtime.WallboxService.set(relay, on);
  }

  if (own(state, 'batteryCharging')) {
    runtime.BatteryService.set(state.batteryCharging === true);
  }
};

const onAgentEnabledChange = enabled => {
  _.agent.enabled = enabled;
};

const onAgentStateChange = state => {
  _.agent.state = String(state ?? 'inactive');
};

const onHardLimitOverrideChange = payload => {
  hardLimitOverride.active = payload?.active === true;
  hardLimitOverride.asset = hardLimitOverride.active ? (payload?.asset ?? null) : null;
  hardLimitOverride.configuredFloor = hardLimitOverride.active ? String(payload?.configuredFloor ?? '--') : '--';
  hardLimitOverride.effectiveLevel = hardLimitOverride.active ? String(payload?.effectiveLevel ?? '--') : '--';
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
    projection_model: 'pq_profile_scaled_to_building_capacity_v1',
    base_current_a: { ...BUILDING_TWIN_CONFIG.baseCurrentA },
    model_provenance: electricalProfileSummary.value.provenance,
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

  const commanded = _.heatpump.commanded;
  const classification = classifyBranchAAckForCommand(commanded, payload);
  if (!classification.applies || !commanded) return;

  if (!classification.accepted) {
    // The Pi5 RPC only confirms that the MQTT command was published.  The ESP32
    // ACK is the authoritative acceptance result.  Roll back only the currently
    // active generation; a rejected old ACK must never undo a newer command.
    const rollbackLevel = numberOrNull(commanded.previousTwinLevel);
    _.heatpump.twinLevel = rollbackLevel ?? numberOrNull(_.heatpump.level) ?? 0;
    _.heatpump.commanded = null;
    return;
  }

  commanded.ackCmdId = classification.cmdId;
  commanded.ackStatus = 'accepted';
};

const onBranchAStatus = payload => {
  _.realFeedback.branchA.payload = payload;
  _.realFeedback.branchA.lastUpdate = performance.now();

  const commanded = _.heatpump.commanded;
  const correlation = classifyBranchAStatusForCommand(commanded, payload);

  // Ignore an older periodic READY/STOP/status while a newer command is waiting
  // for ACK/status correlation.  Diagnostic payload freshness is still updated
  // above, but the execution/twin state is deliberately preserved.
  if (!correlation.applies) return;

  const interpreted = deriveHeatpumpStatus(payload, commanded);
  const commandComplete = shouldCompleteBranchACommand(commanded, payload, interpreted.confirmedLevel);
  const commandedTwinLevel = commanded ? heatpumpCommandToTwinLevel(commanded) : null;

  _.heatpump.executionState = interpreted.state;
  _.heatpump.mode = interpreted.mode;
  _.heatpump.targetHz = interpreted.targetHz;
  _.heatpump.actualHz = interpreted.actualHz;
  _.heatpump.effectiveTargetHz = interpreted.effectiveTargetHz;
  _.heatpump.effectiveTargetSource = interpreted.effectiveTargetSource;

  // Execution truth follows ESP32/RFRD.  While a correlated command is still
  // executing, the Building Twin keeps the command trajectory that was shown on
  // the first click.  This also covers live RUNNING frequency changes where RFRD
  // may still report the previous level for a short time.
  if (interpreted.confirmedLevel !== null) _.heatpump.level = interpreted.confirmedLevel;
  if (commanded && !commandComplete && commandedTwinLevel !== null && !correlation.safety) {
    _.heatpump.twinLevel = commandedTwinLevel;
  } else if (interpreted.twinLevel !== null) {
    _.heatpump.twinLevel = interpreted.twinLevel;
  }

  if (commandComplete) {
    _.heatpump.commanded = null;
  }
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

const onElectricalModelUpdated = data => {
  if (data?.profiles) _.electricalModel.profiles = data.profiles;
  if (data?.calibration) _.electricalModel.calibration = data.calibration;
};

const onCalibrationProgress = data => {
  const calibration = data?.calibration ?? data;
  if (calibration) _.electricalModel.calibration = {
    ..._.electricalModel.calibration,
    ...calibration,
    progress: calibration.progress ?? _.electricalModel.calibration.progress,
  };
};

const loadElectricalModel = async () => {
  if (!App.ElectricalCalibrationService?.getModel) return;
  try {
    const data = await App.ElectricalCalibrationService.getModel();
    onElectricalModelUpdated(data);
  } catch (err) {
    console.warn('Electrical P/Q profile load failed; fallback model remains active.', err);
  }
};

const runElectricalCalibration = async () => {
  if (!App.ElectricalCalibrationService?.startFullCalibration) return;
  if (_.agent.enabled) {
    window.alert('Disable AI CONTROL before starting real-hardware electrical calibration.');
    return;
  }
  const confirmed = window.confirm(
    'REAL HARDWARE calibration will switch Heat Pump, Wallbox relays and Battery through multiple states for about 2–3 minutes. The sequence ends with all devices OFF. Continue?'
  );
  if (!confirmed) return;

  const result = await App.ElectricalCalibrationService.startFullCalibration({
    confirmation: 'CALIBRATE_REAL_HARDWARE',
  });
  if (result?.accepted !== true) {
    window.alert(`Calibration not started: ${result?.reason ?? 'unknown reason'}`);
    return;
  }
  _.electricalModel.calibration = {
    ..._.electricalModel.calibration,
    running: true,
  };
};

const cancelElectricalCalibration = async () => {
  await App.ElectricalCalibrationService?.cancelCalibration?.();
};

const toggleWallbox = r => {
  if (!controlReady.value) return;
  if (r === 0) {
    if (_.wallbox.r0 === null) return;
    const state = !_.wallbox.r0;
    App.WallboxService.set(0, state);
    return;
  }

  if (_.wallbox.r1 === null) return;
  const state = !_.wallbox.r1;
  App.WallboxService.set(1, state);
};

const updateHeatpumpLoad = value => {
  if (!controlReady.value) return;
  sendHeatpumpCommand(levelToHeatpumpCommand(clampInt(value, 0, HEATPUMP_LEVELS)));
};

const requestHeatpumpStop = () => {
  if (!controlReady.value) return;
  sendHeatpumpCommand(levelToHeatpumpCommand(0, 'stop'));
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

  if (startupCoreReady.value) {
    _.startup.phase = 'ready';
    _.startup.completedAt = performance.now();
    const optionalMissing = [
      !startupChecklist.value.branchB ? 'Branch B' : null,
      !startupChecklist.value.battery ? 'Battery' : null,
    ].filter(Boolean);
    _.startup.message = startupActiveDevices.value.length > 0
      ? `Core initialization complete. Existing active hardware detected: ${startupActiveDevices.value.join(', ')}. No automatic STOP was sent.`
      : optionalMissing.length > 0
        ? `Core initialization complete. Optional status still pending: ${optionalMissing.join(', ')}.`
        : 'Initialization complete. Real-hardware states are known.';
    clearStartupTimer();
  }
};

const requestInitialHardwareState = async ({ resetState = true } = {}) => {
  if (!App._.connected || !App._.servicesReady) return;

  clearStartupTimer();
  if (resetState) {
    markRealStateWaiting();
    _.energy_meter.timedelta = null;
    _.energy_meter.lastUpdate = null;
    _.energy_meter.raw = {};
    _.energy_meter.measured = {};
    _.energy_meter.projected = {};
    _.agent.enabled = false;
  }

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
  if (startupCoreReady.value) return;

  startupTimer = window.setTimeout(() => {
    if (startupCoreReady.value) return;
    _.startup.phase = 'timeout';
    _.startup.timeoutAt = performance.now();
    const required = ['socket', 'services', 'mqtt', 'measurement', 'branchA'];
    const missing = required.filter(name => !startupChecklist.value[name]).join(', ');
    _.startup.message = `Initialization timed out. Missing/faulted core: ${missing || 'unknown'}.`;
  }, STARTUP_TIMEOUT_MS);
};

const unbindRuntime = () => {
  if (!boundRuntime) return;

  App.EnergyMeterService?.off?.('data', onEnergyMeter);
  App.WallboxService?.off?.('data', onWallbox);
  App.BatteryService?.off?.('data', onBattery);
  App.EspService?.off?.('branchA', onBranchAStatus);
  App.EspService?.off?.('branchA_ack', onBranchAAck);
  App.ElectricalCalibrationService?.off?.('updated', onElectricalModelUpdated);
  App.ElectricalCalibrationService?.off?.('progress', onCalibrationProgress);
  boundRuntime = false;
};

const bindRuntime = async () => {
  if (!App._.connected || !App._.servicesReady) {
    unbindRuntime();
    markRealStateWaiting();
    updateStartupPhase();
    return;
  }

  if (!App.EnergyMeterService || !App.WallboxService || !App.BatteryService || !App.EspService || !App.ElectricalCalibrationService) {
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
  App.ElectricalCalibrationService.on?.('updated', onElectricalModelUpdated);
  App.ElectricalCalibrationService.on?.('progress', onCalibrationProgress);
  boundRuntime = true;

  await loadElectricalModel();
  await requestInitialHardwareState();
};

const refreshHardwareStatePreservingState = async () => {
  if (!App._.connected || !App._.servicesReady || !boundRuntime) return false;

  // RECHECK is a refresh, not a cold reset.  Keep the last known execution and
  // Building-Twin state visible while asking every service for fresh truth.
  const previousPhase = _.startup.phase;
  const previousMessage = _.startup.message;
  _.startup.message = 'RECHECK requested. Preserving current states while fresh hardware status is requested…';

  try {
    const mqttStatus = await App.MqttService?.status?.();
    _.mqtt.connected = mqttStatus?.connected === true;
    _.mqtt.lastHeartbeatAt = mqttStatus?.last_heartbeat_at ?? _.mqtt.lastHeartbeatAt;
  } catch {
    // Keep the last known status.  A normal freshness timeout will still expose
    // an unavailable source; RECHECK itself must not manufacture OFF/0 values.
  }

  await Promise.allSettled([
    App.EnergyMeterService?.requestUpdate?.(),
    App.WallboxService?.requestUpdate?.(),
    App.BatteryService?.requestUpdate?.(),
    App.EspService?.requestUpdate?.(),
  ]);

  // Do not rewrite startup.requestedAt: that timestamp belongs to cold-start
  // gating.  Existing data remains visible and new events update atomically.
  _.startup.phase = previousPhase === 'ready' ? 'ready' : previousPhase;
  _.startup.message = previousPhase === 'ready'
    ? 'RECHECK sent. Current state is preserved until fresh hardware status arrives.'
    : previousMessage;
  return true;
};

const retryInitialization = async () => {
  App.ensureConnected();
  if (!App._.connected || !App._.servicesReady) return;

  if (boundRuntime && _.startup.completedAt !== null) {
    await refreshHardwareStatePreservingState();
    return;
  }

  // Initial recovery before the first successful READY snapshot still uses the
  // fail-closed cold-start handshake.
  if (!boundRuntime) await bindRuntime();
  else await requestInitialHardwareState({ resetState: true });
};

const init = () => {
  console.info(`[Senergate] Frontend ${FRONTEND_BUILD_VERSION}`);
  selectScenario('ideal');
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
        <span class="runtime-version">{{ FRONTEND_BUILD_VERSION }}</span>
        <span class="runtime-status" :class="App._.connected ? 'online' : 'offline'">
          {{ App._.connected ? 'Pi5 CONNECTED' : 'Pi5 DISCONNECTED' }}
        </span>
      </div>
    </header>

    <div class="startup-panel" :class="_.startup.phase">
      <div class="startup-head">
        <div>
          <strong>Startup Initialization / Initialisierungsprüfung</strong>
          <p>{{ _.startup.message }}</p>
        </div>
        <div class="startup-actions">
          <span class="startup-badge">{{ startupStatusLabel }}</span>
          <button type="button" @click="retryInitialization">RECHECK / ERNEUT PRÜFEN</button>
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
        Active state found / Aktiver Gerätezustand erkannt: {{ startupActiveDevices.join(' · ') }}. Browser startup does not send automatic STOP.
      </p>
    </div>

    <div class="grid-impedance-panel">
      <div class="grid-panel-head">
        <div>
          <strong>Senergate Grid Impedance / Netzimpedanz</strong>
          <p v-if="gridImpedanceExpanded">
            MODELED building-scale feeder for the incremental P/Q Digital Twin. The Weak-Grid Demo is explicitly non-site-calibrated; Branch A max and Branch B max are designed to create a visible >2.3% modeled VUF without applying a direct VUF multiplier.
            / Gebäudeskaliges Speisemodell für den inkrementellen P/Q Digital Twin. Das Weak-Grid-Demo ist ausdrücklich nicht standortkalibriert; Branch A max. und Branch B max. erzeugen den sichtbaren modellierten VUF ohne direkten VUF-Multiplikator.
          </p>
          <p v-else class="grid-collapsed-summary">
            {{ gridPresetLabel }} · |Zphase| {{ formatNullableNumber(phaseImpedanceMagnitude, 3, ' Ω') }}
          </p>
        </div>
        <div class="grid-head-actions">
          <span class="grid-provenance">{{ _.grid.provenance.toUpperCase() }}</span>
          <button
            type="button"
            class="grid-collapse-toggle"
            :aria-expanded="gridImpedanceExpanded"
            @click="gridImpedanceExpanded = !gridImpedanceExpanded"
          ><span class="accordion-chevron">{{ gridImpedanceExpanded ? '▲' : '▼' }}</span><span>{{ gridImpedanceExpanded ? 'HIDE' : 'SHOW' }}</span></button>
        </div>
      </div>

      <div v-if="gridImpedanceExpanded" class="grid-impedance-details">
        <div class="grid-preset-actions">
          <span>Grid scenario:</span>
          <button type="button" :class="{ selected: _.grid.preset === 'stiff' }" @click="setGridPreset('stiff')">Stiff LV</button>
          <button type="button" :class="{ selected: _.grid.preset === 'typical' }" @click="setGridPreset('typical')">Typical Feeder</button>
          <button type="button" :class="{ selected: _.grid.preset === 'weak' }" @click="setGridPreset('weak')">Weak Feeder</button>
          <button type="button" :class="{ selected: _.grid.preset === 'demo' }" @click="setGridPreset('demo')">Weak-Grid Demo</button>
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
          <span>Incremental model: V<sub>PCC,proj</sub> = V<sub>PCC,OFF</sub> − Z<sub>phase</sub>ΔI − Z<sub>N</sub>ΔI<sub>N</sub></span>
          <span>Branch A: 1 motor → building equivalent · max 60 A</span>
          <span>Branch B: 1 relay → 2 WB · 2 relays → 4 WB · max 64 A</span>
          <span>Battery: building equivalent · max 40 A</span>
        </div>
      </div>

      <div class="control-policy-panel">
        <button
          type="button"
          class="capacity-summary"
          :class="`capacity-${capacityState.key}`"
          :aria-expanded="capacityPanelExpanded"
          @click="capacityPanelExpanded = !capacityPanelExpanded"
        >
          <span class="capacity-summary-title">Capacity</span>
          <strong>{{ capacityUsagePercent !== null ? `${capacityUsagePercent.toFixed(1)}%` : '--' }}</strong>
          <span>Headroom {{ remainingHeadroomPercent !== null ? `${remainingHeadroomPercent.toFixed(1)}%` : '--' }}</span>
          <span>{{ capacityLimitModeLabel }}</span>
          <span class="capacity-live-inline" :class="{ stale: !capacityDataFresh }">
            <template v-if="!capacityDataFresh">LAST KNOWN{{ _.energy_meter.timedelta !== null ? ` ${_.energy_meter.timedelta.toFixed(1)}s` : '' }} · </template>
            REAL P {{ formatCapacityValue(measuredTotalPowerW, 'W') }} ·
            SIM P {{ formatCapacityValue(modeledTotalPowerW, 'W') }} ·
            SIM L1 {{ formatCapacityValue(modeledCapacityCurrents.a, 'A') }} ·
            SIM L2 {{ formatCapacityValue(modeledCapacityCurrents.b, 'A') }} ·
            SIM L3 {{ formatCapacityValue(modeledCapacityCurrents.c, 'A') }}
          </span>
          <span v-if="limitingCapacityMetric">Limit: {{ limitingCapacityMetric.label }}</span>
          <span v-if="hardLimitOverride.active" class="hard-limit-override-inline">⚠ OPERATOR OVERRIDE</span>
          <span class="capacity-state-badge">{{ capacityState.label }}</span>
          <span class="capacity-chevron accordion-chevron">{{ capacityPanelExpanded ? '▲' : '▼' }}</span>
        </button>

        <div v-if="capacityPanelExpanded" class="capacity-details">
          <div v-if="hardLimitOverride.active" class="hard-limit-override-warning">
            <strong>⚠ HARD LIMIT OVERRIDE ACTIVE</strong>
            <span>Building Capacity hard limit has priority over Operator Adjustability / Das Kapazitäts-Hard-Limit hat Vorrang vor der Bedien-Eingriffsgrenze.</span>
            <span>{{ hardLimitOverride.asset === 'heatpump' ? 'Heatpump' : 'Wallbox' }}: configured {{ hardLimitOverride.configuredFloor }} → emergency target {{ hardLimitOverride.effectiveLevel }}. The saved adjustability value is unchanged.</span>
          </div>
          <div class="capacity-kpis">
            <div>
              <span>Capacity Usage</span>
              <strong>{{ capacityUsagePercent !== null ? `${capacityUsagePercent.toFixed(1)}%` : '--' }}</strong>
            </div>
            <div>
              <span>Remaining Headroom</span>
              <strong>{{ remainingHeadroomPercent !== null ? `${remainingHeadroomPercent.toFixed(1)}%` : '--' }}</strong>
            </div>
            <div>
              <span>Limiting Constraint</span>
              <strong>{{ limitingCapacityMetric?.label ?? '--' }}</strong>
            </div>
            <div>
              <span>State</span>
              <strong>{{ capacityState.label }}</strong>
            </div>
          </div>

          <div class="capacity-metric-table">
            <div class="capacity-metric-row capacity-metric-head">
              <span>Metric</span><span>Prototype · MEASURED</span><span>Building Twin · MODELED</span><span>100% Limit</span><span>Usage</span>
            </div>
            <div
              v-for="metric in capacityMetrics"
              :key="metric.key"
              class="capacity-metric-row"
              :class="{ limiting: metric.key === limitingCapacityMetric?.key }"
            >
              <span>{{ metric.label }}</span>
              <span class="capacity-live-value measured-value">
                {{ formatCapacityValue(metric.measured, metric.unit) }}
                <small v-if="!metric.fresh && metric.measured !== null" class="last-known-label">LAST KNOWN</small>
              </span>
              <span class="capacity-live-value modeled-value">
                {{ formatCapacityValue(metric.modeled, metric.unit) }}
                <small>BUILDING TWIN</small>
              </span>
              <span>{{ formatCapacityLimit(metric.limit, metric.unit) }}</span>
              <strong>{{ formatCapacityUsage(metric.ratio) }}</strong>
            </div>
          </div>

          <div v-if="!capacityDataFresh" class="capacity-empty capacity-stale-note">
            Measurement data is stale. Values above are LAST KNOWN only; Capacity Usage/Headroom is suspended until fresh Shelly data returns.
            / Messdaten sind veraltet. Die Werte oben sind nur LAST KNOWN; Capacity Usage/Headroom bleibt bis zu neuen Shelly-Daten ausgesetzt.
          </div>
          <div v-else-if="!siteLimitsEnabled" class="capacity-empty">
            Prototype MEASURED and Building-Twin MODELED values remain visible. Capacity Usage uses MODELED values only; limits are not configured, therefore Usage/Headroom protection is not active.
            / Prototype-Messwerte und Building-Twin-Modellwerte bleiben sichtbar. Capacity Usage verwendet ausschließlich MODELED-Werte; ohne konfigurierte Limits ist der Schutz inaktiv.
          </div>
          <div v-else-if="!capacityLimitsFullyConfigured" class="capacity-empty">
            Partial limit configuration: only configured limits with valid Building-Twin MODELED values participate in Capacity Usage.
            / Teilkonfiguration: Nur konfigurierte Limits mit gültigen Building-Twin-MODELED-Werten gehen in Capacity Usage ein.
          </div>

          <div class="grid-derived capacity-reference-row">
            <span>100% Capacity = configured site hard limit (connection / main protection / cable-device design / local DSO-TAB)</span>
            <span>80/90/95% = Senergate engineering Warning / Pre-Limit / Critical margins</span>
            <span>DE symmetry reference {{ (_.controlPolicy.deSinglePhaseSymmetryReferenceVA / 1000).toFixed(1) }} kVA ≈ {{ _.controlPolicy.deSinglePhaseSymmetryReferenceA }} A @230 V is NOT a total phase-capacity limit</span>
            <span>Prototype internal reference ≤ {{ (_.controlPolicy.prototypeEngineeringPowerLimitW / 1000).toFixed(1) }} kW · &lt;{{ _.controlPolicy.prototypeEngineeringCurrentGuideA }} A; not enforced unless configured as a site limit</span>
          </div>
        </div>

        <button
          type="button"
          class="operator-adjustability-summary"
          :aria-expanded="operatorAdjustabilityExpanded"
          @click="operatorAdjustabilityExpanded = !operatorAdjustabilityExpanded"
        >
          <span>
            <strong>Operator Adjustability / Bedien-Eingriffsgrenze</strong>
            <small>HP {{ _.controlPolicy.heatpumpAdjustability }} → {{ heatpumpMinAllowedLabel }} · WB {{ _.controlPolicy.wallboxAdjustability }} → {{ wallboxMinAllowedLabel }} · AI downshift only</small>
            <small v-if="hardLimitOverride.active" class="hard-limit-override-summary">⚠ HARD LIMIT OVERRIDE · {{ hardLimitOverride.asset === 'heatpump' ? 'HP' : 'WB' }} {{ hardLimitOverride.configuredFloor }} → {{ hardLimitOverride.effectiveLevel }}</small>
          </span>
          <span class="capacity-chevron accordion-chevron">{{ operatorAdjustabilityExpanded ? '▲' : '▼' }}</span>
        </button>

        <div v-if="operatorAdjustabilityExpanded" class="operator-adjustability-details">
          <div v-if="hardLimitOverride.active" class="hard-limit-override-warning">
            <strong>⚠ Operator Adjustability temporarily overridden by Capacity HARD LIMIT</strong>
            <span>Configured values remain unchanged. Automatic protection may downshift {{ hardLimitOverride.asset === 'heatpump' ? 'Heatpump' : 'Wallbox' }} below the configured floor, one level per confirmed control cycle, until Building Capacity is below the hard boundary.</span>
          </div>
          <div class="operator-control-grid">
            <label>
              <span>Heatpump adjustability [1–100]</span>
              <input
                v-model="adjustabilityDraft.heatpump"
                type="number" min="1" max="100" step="1"
                @focus="adjustabilityEditing = 'heatpump'"
                @blur="finishAdjustabilityEdit('heatpump')"
                @keydown="handleAdjustabilityKeydown($event, 'heatpump')"
              />
              <small>Active: {{ heatpumpMinAllowedLabel }} · no auto-upshift</small>
              <small v-if="adjustabilityValidationMessage.heatpump" class="adjustability-error">{{ adjustabilityValidationMessage.heatpump }}</small>
              <div v-if="adjustabilityEditing === 'heatpump'" class="adjustability-helper">
                <strong>Preview: {{ adjustabilityPreviewLabel(heatpumpAdjustabilityPreview) }}</strong>
                <span :class="{ active: heatpumpAdjustabilityPreview.minLevel === 1 && !heatpumpAdjustabilityPreview.locked }">1–20 → Min Level 1</span>
                <span :class="{ active: heatpumpAdjustabilityPreview.minLevel === 2 && !heatpumpAdjustabilityPreview.locked }">21–40 → Min Level 2</span>
                <span :class="{ active: heatpumpAdjustabilityPreview.minLevel === 3 && !heatpumpAdjustabilityPreview.locked }">41–60 → Min Level 3</span>
                <span :class="{ active: heatpumpAdjustabilityPreview.minLevel === 4 && !heatpumpAdjustabilityPreview.locked }">61–80 → Min Level 4</span>
                <span :class="{ active: heatpumpAdjustabilityPreview.minLevel === 5 && !heatpumpAdjustabilityPreview.locked }">81–90 → Min Level 5</span>
                <span :class="{ active: heatpumpAdjustabilityPreview.locked }">91–100 → AI LOCKED</span>
                <small>Preview only while typing. Enter or leave the field to validate and apply. Automatic upshift is never allowed.</small>
              </div>
            </label>

            <label>
              <span>Wallbox adjustability [1–100]</span>
              <input
                v-model="adjustabilityDraft.wallbox"
                type="number" min="1" max="100" step="1"
                @focus="adjustabilityEditing = 'wallbox'"
                @blur="finishAdjustabilityEdit('wallbox')"
                @keydown="handleAdjustabilityKeydown($event, 'wallbox')"
              />
              <small>Active: {{ wallboxMinAllowedLabel }} · no auto-upshift</small>
              <small v-if="adjustabilityValidationMessage.wallbox" class="adjustability-error">{{ adjustabilityValidationMessage.wallbox }}</small>
              <div v-if="adjustabilityEditing === 'wallbox'" class="adjustability-helper">
                <strong>Preview: {{ adjustabilityPreviewLabel(wallboxAdjustabilityPreview) }}</strong>
                <span :class="{ active: wallboxAdjustabilityPreview.minLevel === 1 && !wallboxAdjustabilityPreview.locked }">1–30 → Min Level 1</span>
                <span :class="{ active: wallboxAdjustabilityPreview.minLevel === 2 && !wallboxAdjustabilityPreview.locked }">31–90 → Min Level 2</span>
                <span :class="{ active: wallboxAdjustabilityPreview.locked }">91–100 → AI LOCKED</span>
                <small>Preview only while typing. Enter or leave the field to validate and apply. Automatic upshift is never allowed.</small>
              </div>
            </label>
          </div>
        </div>

        <button
          type="button"
          class="advanced-control-summary"
          :aria-expanded="advancedControlExpanded"
          @click="advancedControlExpanded = !advancedControlExpanded"
        >
          <span>
            <strong>Advanced Control Parameters / Erweiterte Regelparameter</strong>
            <small>Site limits · VUF hysteresis · Battery effectiveness · Capacity margins</small>
          </span>
          <span class="capacity-chevron accordion-chevron">{{ advancedControlExpanded ? '▲' : '▼' }}</span>
        </button>

        <div v-if="advancedControlExpanded" class="advanced-control-details">
          <div class="control-policy-head">
            <div>
              <strong>AI Control Thresholds / Regler-Schwellen</strong>
              <p>
                Building capacity limits use 0 = disabled. Capacity Usage compares Building-Twin MODELED values against configured limits; Prototype MEASURED values remain a separate physical reference.
                / Gebäudekapazitätsgrenzen verwenden 0 = deaktiviert. Capacity Usage vergleicht Building-Twin-MODELED-Werte mit den konfigurierten Limits; Prototype-MEASURED-Werte bleiben eine separate physikalische Referenz.
              </p>
            </div>
            <span class="grid-provenance">{{ _.controlPolicy.strategy.toUpperCase() }}</span>
          </div>

          <div v-if="thresholdValidationMessage" class="control-policy-error">
            {{ thresholdValidationMessage }} · Invalid edit rejected; previous valid thresholds remain active.
          </div>

          <div class="control-policy-grid">
            <label>
              <span>Building max total power [W] · 0=OFF</span>
              <input v-model.number="_.controlPolicy.siteMaxTotalPowerW" type="number" min="0" step="100" />
            </label>
            <label>
              <span>Building max L1 current [A] · 0=OFF</span>
              <input v-model.number="_.controlPolicy.siteMaxCurrentL1A" type="number" min="0" step="0.1" />
            </label>
            <label>
              <span>Building max L2 current [A] · 0=OFF</span>
              <input v-model.number="_.controlPolicy.siteMaxCurrentL2A" type="number" min="0" step="0.1" />
            </label>
            <label>
              <span>Building max L3 current [A] · 0=OFF</span>
              <input v-model.number="_.controlPolicy.siteMaxCurrentL3A" type="number" min="0" step="0.1" />
            </label>
            <label>
              <span>Battery effective min [A]</span>
              <input v-model.number="_.controlPolicy.batteryEffectiveMinA" type="number" min="0" max="5" step="0.01" />
            </label>
            <label>
              <span>VUF enter [%]</span>
              <input v-model.number="_.controlPolicy.vufEnterPct" type="number" min="0" max="10" step="0.1" />
            </label>
            <label>
              <span>VUF exit [%]</span>
              <input v-model.number="_.controlPolicy.vufExitPct" type="number" min="0" max="10" step="0.1" />
            </label>
            <label>
              <span>Warning ratio</span>
              <input v-model.number="_.controlPolicy.warningRatio" type="number" min="0" max="1" step="0.01" />
            </label>
            <label>
              <span>Pre-limit ratio</span>
              <input v-model.number="_.controlPolicy.preLimitRatio" type="number" min="0" max="1" step="0.01" />
            </label>
            <label>
              <span>Critical ratio</span>
              <input v-model.number="_.controlPolicy.criticalRatio" type="number" min="0" max="1" step="0.01" />
            </label>
            <div class="control-policy-readonly">
              <span>Hard ratio · fixed</span>
              <strong>{{ (_.controlPolicy.hardRatio * 100).toFixed(0) }}%</strong>
              <small>Fixed hard boundary; not AI-learnable.</small>
            </div>
          </div>
        </div>

        <div class="grid-derived">
          <span>Capacity data: {{ measurementFresh ? 'LIVE' : 'STALE / LAST KNOWN' }}</span>
          <span>Capacity guard: {{ siteLimitsEnabled ? (capacityLimitsFullyConfigured ? 'CONFIGURED' : 'PARTIAL') : 'LIMITS NOT CONFIGURED' }}</span>
          <span>Measured total P: {{ measuredTotalPowerW !== null ? `${measuredTotalPowerW.toFixed(0)} W` : '--' }}</span>
          <span>L1/L2/L3 live: {{ formatCapacityValue(measuredCurrents.a, 'A') }} / {{ formatCapacityValue(measuredCurrents.b, 'A') }} / {{ formatCapacityValue(measuredCurrents.c, 'A') }}</span>
          <span>Capacity Usage: {{ capacityUsagePercent !== null ? `${capacityUsagePercent.toFixed(1)}%` : '--' }}</span>
          <span>Battery measured ΔI: {{ batteryMeasuredCurrentA !== null ? `${batteryMeasuredCurrentA.toFixed(2)} A` : '--' }}</span>
        </div>
      </div>

      <div class="electrical-profile-row">
        <div class="electrical-profile-info">
          <span class="profile-badge" :class="{ calibrated: electricalProfileSummary.calibrated, running: _.electricalModel.calibration.running }">{{ calibrationStatusLabel }}</span>
          <span>P/Q profile: {{ electricalProfileSummary.provenance }}</span>
          <span>Baseline: {{ baselineModel.source }}</span>
          <span v-if="electricalProfileSummary.generatedAt">Profile time: {{ electricalProfileSummary.generatedAt }}</span>
          <span class="voltage-guard" :class="voltagePredictionState.key">Voltage guard 207–253 V: {{ voltagePredictionState.label }}</span>
        </div>
        <div class="calibration-actions">
          <button
            v-if="!_.electricalModel.calibration.running"
            type="button"
            :disabled="!startupDataVisible || _.agent.enabled"
            @click="runElectricalCalibration"
          >CALIBRATE P/Q · REAL HARDWARE</button>
          <button v-else type="button" class="cancel" @click="cancelElectricalCalibration">CANCEL CALIBRATION</button>
          <small>{{ calibrationProgressText || 'OFF baseline + HP 10/20/30/40/50 Hz + WB masks 1/2/3 + Battery ON' }}</small>
        </div>
      </div>
    </div>

    <div class="overview-grid">
      <CurrentCard
        :measured-currents="displayMeasuredCurrents"
        :currents="displayProjectedCurrents"
        :y-range="currentYRange"
        :source-label="currentSourceLabel"
      />

      <PhasorCard
        :voltages="displayPhasorVoltages"
        :angles="displayPhasorAngles"
      />

      <VufCard :vuf="displayCurrentVuf" :baseline-vuf="displayBaselineVuf" :load-impact-vuf="displayLoadImpactVuf" :critical-unresolved="_.agent.state === 'critical_unresolved'" />
    </div>

    <div class="agent-section">
      <AgentCard
        :vuf="displayCurrentVuf"
        :device-states="agentDeviceStates"
        :predict-vuf="predictVufForDeviceState"
        :control-ready="controlReady"
        :control-blocked-reason="controlBlockedReason"
        :command-feedback="commandFeedback"
        :control-policy="_.controlPolicy"
        :measured-currents="measuredCurrents"
        :measured-total-power-w="measuredTotalPowerW"
        :modeled-currents="modeledCapacityCurrents"
        :modeled-total-power-w="modeledTotalPowerW"
        :battery-measured-current-a="batteryMeasuredCurrentA"
        @apply-state="applyAgentDeviceState"
        @heatpump-zero-hold="requestHeatpumpZeroHold"
        @heatpump-stop="requestHeatpumpStop"
        @enabled-change="onAgentEnabledChange"
        @state-change="onAgentStateChange"
        @hard-limit-override-change="onHardLimitOverrideChange"
      />
    </div>

    <div class="footer-meta">
      <span>
        Data source: REAL HARDWARE · Building Twin ESTIMATED ·
        Measurement age:
        {{ _.energy_meter.timedelta !== null ? `${_.energy_meter.timedelta.toFixed(1)} s` : '--' }}
      </span>

      <span>
        VUF source: ESTIMATED · baseline phase angles assumed 0°/−120°/+120° · displayed phasor angles are calculated from the projected complex voltages.
      </span>
    </div>
  </div>
</template>

<style scoped>
.capacity-summary{width:100%;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;padding:9px 11px;border:1px solid #284b60;border-radius:10px;background:#07131d;color:#b9d6e5;cursor:pointer;text-align:left}.capacity-summary-title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#789aac}.capacity-summary strong{font-size:16px;color:#eaf6ff}.capacity-summary span:not(.capacity-summary-title):not(.capacity-chevron):not(.capacity-state-badge){font-size:12px;color:#8daec0}.capacity-state-badge{margin-left:auto;padding:4px 7px;border:1px solid #36556a;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.06em}.capacity-chevron{font-size:20px;line-height:1;color:#9fc4d6;min-width:28px;text-align:center}.accordion-chevron{font-size:24px;font-weight:800;line-height:1;display:inline-flex;align-items:center;justify-content:center;min-width:30px;min-height:30px}.capacity-summary.capacity-warning{border-color:#665c2d}.capacity-summary.capacity-warning .capacity-state-badge{border-color:#665c2d;color:#ffe795}.capacity-summary.capacity-prelimit{border-color:#8f6a2c}.capacity-summary.capacity-prelimit .capacity-state-badge{border-color:#8f6a2c;color:#ffd166}.capacity-summary.capacity-critical,.capacity-summary.capacity-hard{border-color:#6b3740}.capacity-summary.capacity-critical .capacity-state-badge,.capacity-summary.capacity-hard .capacity-state-badge{border-color:#6b3740;color:#ff9ba4}.capacity-summary.capacity-normal .capacity-state-badge{border-color:#2b6f62;color:#8ff1c3}.capacity-details{margin:-4px 0 12px;padding:10px;border:1px solid #1f3b4d;border-radius:10px;background:#061019}.capacity-kpis{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px}.capacity-kpis>div{display:grid;gap:3px;padding:8px;border:1px solid #17384b;border-radius:8px;background:#081721}.capacity-kpis span{color:#789aac;font-size:11px}.capacity-kpis strong{font-size:15px}.capacity-metric-table{margin-top:9px;border:1px solid #17384b;border-radius:8px;overflow:hidden}.capacity-metric-row{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr .75fr;gap:8px;padding:7px 9px;border-bottom:1px solid #123042;color:#9db7c5;font-size:11px}.capacity-metric-row:last-child{border-bottom:0}.capacity-metric-head{color:#6f91a3;background:#07131d;font-weight:700}.capacity-metric-row.limiting{background:rgba(255,209,102,.06);color:#ffe795}.capacity-empty{padding:10px;color:#789aac;font-size:11px}.capacity-reference-row{margin-top:9px}.control-policy-grid small{color:#6f91a3;font-size:10px}.control-policy-grid input[readonly]{opacity:.65;cursor:not-allowed}.capacity-disabled .capacity-state-badge{color:#789aac}.capacity-not-configured .capacity-state-badge,.capacity-waiting .capacity-state-badge{color:#789aac}.capacity-live-inline{color:#9fc4d6!important;font-weight:650}.capacity-live-inline.stale{color:#ffd166!important}.capacity-live-value{color:#eaf6ff;font-weight:700}.capacity-live-value small{display:block;margin-top:2px;color:#6f91a3;font-size:9px}.modeled-value{color:#8ff1c3}.last-known-label{display:block;margin-top:2px;color:#ffd166;font-size:9px;letter-spacing:.06em}.capacity-stale-note{border-color:#665c2d;color:#ffe795}.control-policy-error{margin:8px 0;padding:8px 10px;border:1px solid #6b3740;border-radius:9px;color:#ff9ba4;background:#211014;font-size:11px;line-height:1.45}.control-policy-head{margin-top:2px}@media(max-width:900px){.capacity-kpis{grid-template-columns:repeat(2,minmax(120px,1fr))}}@media(max-width:600px){.capacity-kpis{grid-template-columns:1fr}.capacity-metric-row{grid-template-columns:1.1fr .9fr .9fr .9fr .7fr;font-size:8px}.capacity-state-badge{margin-left:0}}
.control-policy-panel{margin-top:12px;padding:12px;border:1px solid #284b60;border-radius:12px;background:#081721}.operator-adjustability-summary{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 10px;padding:9px 11px;border:1px solid #284b60;border-radius:10px;background:#07131d;color:#b9d6e5;cursor:pointer;text-align:left}.operator-adjustability-summary>span:first-child{display:grid;gap:3px}.operator-adjustability-summary strong{font-size:13px}.operator-adjustability-summary small{color:#789aac;font-size:10px}.operator-adjustability-details{padding:10px;border:1px solid #1f3b4d;border-radius:10px;background:#061019;margin-bottom:10px}.operator-control-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:10px;margin-bottom:0}.operator-control-grid label{display:grid;gap:5px;color:#9db7c5;font-size:11px}.operator-control-grid input{width:100%;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#eaf6ff;font:inherit;font-size:14px}.operator-control-grid small{color:#6f91a3;font-size:10px}.adjustability-error{color:#ff9ba4!important}.hard-limit-override-inline,.hard-limit-override-summary{color:#ff9ba4!important;font-weight:800}.hard-limit-override-warning{display:grid;gap:4px;margin-bottom:10px;padding:10px 11px;border:1px solid #6b3740;border-radius:10px;background:#1b0e13;color:#ffb6bd;font-size:12px;line-height:1.45}.hard-limit-override-warning strong{color:#ff8c97;font-size:13px}.adjustability-helper{display:grid;gap:4px;margin-top:3px;padding:9px;border:1px solid #284b60;border-radius:9px;background:#081721;color:#8daec0}.adjustability-helper strong{color:#eaf6ff;font-size:11px}.adjustability-helper span{padding:4px 6px;border:1px solid #17384b;border-radius:6px;font-size:10px}.adjustability-helper span.active{border-color:#58e7ff;color:#eaf6ff;background:#0b2635}.adjustability-helper small{margin-top:3px;line-height:1.4}.advanced-control-summary{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 10px;padding:9px 11px;border:1px solid #284b60;border-radius:10px;background:#07131d;color:#b9d6e5;cursor:pointer;text-align:left}.advanced-control-summary>span:first-child{display:grid;gap:3px}.advanced-control-summary strong{font-size:13px}.advanced-control-summary small{color:#789aac;font-size:10px}.advanced-control-details{padding:10px;border:1px solid #1f3b4d;border-radius:10px;background:#061019;margin-bottom:10px}.control-policy-readonly{display:grid;gap:5px;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#9db7c5;font-size:11px}.control-policy-readonly strong{color:#eaf6ff;font-size:14px}.control-policy-readonly small{color:#6f91a3;font-size:10px}.control-policy-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.control-policy-head strong{font-size:14px}.control-policy-head p{margin:4px 0 0;color:#789aac;font-size:11px;line-height:1.45}.control-policy-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:10px}.control-policy-grid label{display:grid;gap:5px;color:#9db7c5;font-size:11px}.control-policy-grid input{width:100%;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#eaf6ff;font:inherit;font-size:14px}.control-reference-row span:first-child{border-color:#665c2d;color:#ffe795}@media(max-width:1100px){.control-policy-grid{grid-template-columns:repeat(2,minmax(140px,1fr))}}@media(max-width:700px){.control-policy-head{flex-direction:column}.control-policy-grid,.operator-control-grid{grid-template-columns:1fr}.operator-control-head{align-items:flex-start;flex-direction:column}}.dashboard{max-width:1540px;margin:0 auto;padding:20px;color:#eaf6ff}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:5px 20px;border:1px solid #1b3a4e;border-radius:20px;background:rgba(7,19,31,.82);box-shadow:0 20px 60px rgba(0,0,0,.25)}.topbar h1{margin:0;font-size:18px;letter-spacing:.28em}.topbar p{margin:4px 0 0;color:#83a7bd;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.runtime-switch{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.runtime-label{font-size:9px;color:#6f91a3;letter-spacing:.14em}.runtime-fixed{padding:7px 10px;border:1px solid #58e7ff;border-radius:999px;color:#eaf6ff;background:#103044;font-size:10px;font-weight:700}.runtime-version{padding:6px 9px;border:1px solid #36556a;border-radius:999px;color:#88a9ba;background:#081721;font-size:9px}.runtime-status{padding:6px 9px;border-radius:999px;border:1px solid #284b60;font-size:9px;letter-spacing:.08em}.runtime-status.online{color:#8ff1c3;border-color:#2b6f62}.runtime-status.offline{color:#ff8c97;border-color:#6b3740}.startup-panel{margin-top:14px;padding:14px 16px;border:1px solid #3a5364;border-radius:16px;background:#0b1822}.startup-panel.ready{border-color:#2b6f62}.startup-panel.timeout,.startup-panel.fault{border-color:#6b3740}.startup-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.startup-head strong{font-size:12px}.startup-head p{margin:4px 0 0;color:#89a8b9;font-size:10px;line-height:1.5}.startup-actions{display:flex;align-items:center;gap:8px}.startup-actions button{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:10px}.startup-badge{padding:5px 8px;border:1px solid #665c2d;border-radius:999px;color:#ffe795;font-size:9px;letter-spacing:.08em}.startup-panel.ready .startup-badge{border-color:#2b6f62;color:#8ff1c3}.startup-panel.timeout .startup-badge,.startup-panel.fault .startup-badge{border-color:#6b3740;color:#ff9ba4}.startup-checks{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.startup-checks span{padding:5px 8px;border:1px solid #3b4450;border-radius:999px;color:#8399a7;font-size:9px}.startup-checks span.ok{border-color:#2b6f62;color:#8ff1c3}.startup-warning{margin:10px 0 0;padding:8px 10px;border:1px solid #665c2d;border-radius:10px;color:#ffe795;background:#17170d;font-size:10px;line-height:1.5}.grid-impedance-panel{margin-top:14px;padding:14px 16px;border:1px solid #3a5364;border-radius:16px;background:#0b1822}.grid-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.grid-head-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.grid-collapse-toggle{padding:4px 8px;display:inline-flex;align-items:center;gap:4px;min-height:34px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em}.grid-collapsed-summary{margin:4px 0 0!important;color:#789aac!important;font-size:11px!important}.grid-impedance-details{margin-top:0}.grid-panel-head strong{font-size:14px}.grid-panel-head p{max-width:950px;margin:4px 0 0;color:#89a8b9;font-size:11px;line-height:1.5}.grid-provenance{padding:5px 8px;border:1px solid #665c2d;border-radius:999px;color:#ffe795;font-size:10px;letter-spacing:.08em}.grid-preset-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:12px;color:#789aac;font-size:11px}.grid-preset-actions button{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer;font-size:11px}.grid-preset-actions button.selected{border-color:#58e7ff;color:#eaf6ff}.grid-name{margin-left:auto;color:#b9d6e5}.grid-parameter-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-top:12px}.grid-parameter-grid label{display:grid;gap:5px;color:#9db7c5;font-size:11px}.grid-parameter-grid input{width:100%;padding:8px 9px;border:1px solid #284b60;border-radius:9px;background:#07131d;color:#eaf6ff;font:inherit;font-size:14px}.grid-derived{display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;color:#7598aa;font-size:11px}.grid-derived span{padding:5px 7px;border:1px solid #1f3b4d;border-radius:8px;background:#081721}.electrical-profile-row{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-top:12px;padding:10px;border:1px solid #1f3b4d;border-radius:10px;background:#081721}.electrical-profile-info{display:flex;gap:8px;flex-wrap:wrap;align-items:center;color:#789aac;font-size:9px}.profile-badge,.voltage-guard{padding:5px 7px;border:1px solid #665c2d;border-radius:999px;color:#ffe795}.profile-badge.calibrated{border-color:#2b6f62;color:#8ff1c3}.profile-badge.running{border-color:#58e7ff;color:#58e7ff}.voltage-guard.safe{border-color:#2b6f62;color:#8ff1c3}.voltage-guard.unsafe{border-color:#6b3740;color:#ff8c97}.voltage-guard.unknown{border-color:#3b5364;color:#8daec0}.calibration-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.calibration-actions button{padding:7px 9px;border:1px solid #58e7ff;border-radius:8px;background:#0b2635;color:#dff7ff;cursor:pointer;font-size:9px;font-weight:700}.calibration-actions button.cancel{border-color:#6b3740;color:#ff9ba4}.calibration-actions button:disabled{cursor:not-allowed;opacity:.45}.calibration-actions small{max-width:420px;color:#6f91a3;font-size:8px}.topbar-meta{display:flex;gap:8px;flex-wrap:wrap}.chip{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.chip.measured{border-color:#2b6f62;color:#8ff1c3}.chip.active{border-color:#2b6f62;color:#8ff1c3}.section,.agent-section{margin-top:14px}.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px;align-items:stretch}.overview-grid>*{min-width:0}.footer-meta{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding:0 4px;color:#6f91a3;font-size:10px}.footer-meta button{margin-left:5px;padding:4px 8px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer}.footer-meta button.selected{border-color:#58e7ff;color:#eaf6ff}@media(max-width:1100px){.overview-grid{grid-template-columns:1fr}.startup-head{flex-direction:column}.grid-parameter-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.grid-name{margin-left:0}}@media(max-width:700px){.electrical-profile-row{flex-direction:column;align-items:flex-start}.calibration-actions{justify-content:flex-start}.dashboard{padding:10px}.topbar,.footer-meta,.grid-panel-head{flex-direction:column;align-items:flex-start}.grid-head-actions{justify-content:flex-start}.runtime-switch{justify-content:flex-start}.grid-parameter-grid{grid-template-columns:1fr}}
</style>
