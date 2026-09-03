<script setup>
import { computed, onMounted, onUnmounted, reactive, watch } from 'vue';

import App from '../App.js';
import PhasorCalculator from './PhasorCalculator.js';
import DiscoveredDevicesCard from './DiscoveredDevicesCard.vue';
import VufCard from './VufCard.vue';
import CurrentCard from './CurrentCard.vue';
import PhasorCard from './PhasorCard.vue';
import AgentCard from './AgentCard.vue';

const scenarios = {
  ideal: {
    angle: { a: 0, b: -120, c: 120 },
    resistance: { a: 0.05, b: 0.05, c: 0.05 },
    reactance: { a: 0.02, b: 0.02, c: 0.02 },
  },
  realistic: {
    angle: { a: 0, b: -120.2, c: 119.8 },
    resistance: { a: 0.08, b: 0.08, c: 0.08 },
    reactance: { a: 0.03, b: 0.03, c: 0.03 },
  },
};

const HEATPUMP_MAX_CURRENT = 35;
const WALLBOX_R0_CURRENT = 16;
const WALLBOX_R1_CURRENT = 16;
const BATTERY_CHARGE_CURRENT = 20;
const HEATPUMP_LEVELS = 5;

const _ = reactive({
  count: 0,
  heatpump: { load: 0 },
  wallbox: { load: -1, r0: null, r1: null },
  // Merge decision 2A: relay ON means battery charging.
  battery: { charging: false },
  // Merge decision 5B: keep raw measurement and demo-scaled data separated.
  energy_meter: { timedelta: null, lastUpdate: null, rawData: {}, demoScaled: {}, data: {} },
  vuf: {
    scenario: 'realistic',
    sourceAngle: { a: 0, b: -120, c: 120 },
    resistance: { a: 0.05, b: 0.05, c: 0.05 },
    reactance: { a: 0.02, b: 0.02, c: 0.02 },
  },
  agent: { enabled: false },
});

let animationFrame = null;
let unwatchHeatpump = null;
let pendingHeatpumpCommandMode = null;

const numberOrNull = value => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clampInt = (value, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;
};

const selectScenario = key => {
  const scenario = scenarios[key];
  if (!scenario) return;
  _.vuf.scenario = key;
  Object.assign(_.vuf.sourceAngle, scenario.angle);
  Object.assign(_.vuf.resistance, scenario.resistance);
  Object.assign(_.vuf.reactance, scenario.reactance);
};

const demoScaledEnergyData = computed(() => _.energy_meter.demoScaled ?? {});

const measuredCurrents = computed(() => ({
  a: numberOrNull(demoScaledEnergyData.value.a_current) ?? 0,
  b: numberOrNull(demoScaledEnergyData.value.b_current) ?? 0,
  c: numberOrNull(demoScaledEnergyData.value.c_current) ?? 0,
}));

const measuredPowerFactors = computed(() => ({
  a: numberOrNull(demoScaledEnergyData.value.a_pf) ?? 1,
  b: numberOrNull(demoScaledEnergyData.value.b_pf) ?? 1,
  c: numberOrNull(demoScaledEnergyData.value.c_pf) ?? 1,
}));

const measuredVoltages = computed(() => ({
  a: numberOrNull(demoScaledEnergyData.value.a_voltage) ?? 230,
  b: numberOrNull(demoScaledEnergyData.value.b_voltage) ?? 230,
  c: numberOrNull(demoScaledEnergyData.value.c_voltage) ?? 230,
}));

const vufResult = computed(() =>
  PhasorCalculator.analyzeVUF({
    currents: measuredCurrents.value,
    powerFactors: measuredPowerFactors.value,
    sourceVoltages: measuredVoltages.value,
    sourceAngles: _.vuf.sourceAngle,
    resistance: _.vuf.resistance,
    reactance: _.vuf.reactance,
  })
);

const currentVuf = computed(() => {
  const value = Number(vufResult.value?.vufPercent);
  return Number.isFinite(value) ? value : 0;
});

const heatpumpLevel = computed(() =>
  clampInt((Number(_.heatpump.load) || 0) * HEATPUMP_LEVELS, 0, 5)
);

const wallboxLevel = computed(() => {
  if (_.wallbox.r0 === null || _.wallbox.r1 === null) {
    return clampInt(_.wallbox.load, 0, 3);
  }
  return (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
});

const batteryCharging = computed(() => _.battery.charging === true);

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
  const currents = { ...measuredCurrents.value };

  currents.a +=
    heatpumpCurrentForLevel(candidate.heatpump) -
    heatpumpCurrentForLevel(agentDeviceStates.value.heatpump);

  currents.b +=
    wallboxCurrentForLevel(candidate.wallbox) -
    wallboxCurrentForLevel(agentDeviceStates.value.wallbox);

  currents.c +=
    batteryCurrentForState(candidate.batteryCharging) -
    batteryCurrentForState(agentDeviceStates.value.batteryCharging);

  currents.a = Math.max(0, currents.a);
  currents.b = Math.max(0, currents.b);
  currents.c = Math.max(0, currents.c);

  const result = PhasorCalculator.analyzeVUF({
    currents,
    powerFactors: measuredPowerFactors.value,
    sourceVoltages: measuredVoltages.value,
    sourceAngles: _.vuf.sourceAngle,
    resistance: _.vuf.resistance,
    reactance: _.vuf.reactance,
  });

  return Number(result?.vufPercent);
};

const applyAgentDeviceState = state => {
  const targetHeatpump = clampInt(state?.heatpump, 0, 5);
  const targetWallbox = clampInt(state?.wallbox, 0, 3);
  const targetBatteryCharging = state?.batteryCharging === true;

  const normalizedHeatpump = targetHeatpump / HEATPUMP_LEVELS;
  applyHeatpumpLoad(normalizedHeatpump, targetHeatpump === 0 ? 'stop' : 'start');

  const targetR0 = (targetWallbox & 1) !== 0;
  const targetR1 = (targetWallbox & 2) !== 0;

  if (_.wallbox.r0 !== null && _.wallbox.r0 !== targetR0) {
    _.wallbox.r0 = null;
    App.WallboxService.set(0, targetR0);
  }

  if (_.wallbox.r1 !== null && _.wallbox.r1 !== targetR1) {
    _.wallbox.r1 = null;
    App.WallboxService.set(1, targetR1);
  }

  if (batteryCharging.value !== targetBatteryCharging) {
    App.BatteryService.set(targetBatteryCharging);
  }
};

const onAgentEnabledChange = enabled => {
  _.agent.enabled = enabled;
};

const buildDemoScaledEnergyData = input => {
  const raw = { ...(input ?? {}) };
  const scaled = { ...raw };

  const scaleCurrent = (value, offset, factor) => {
    const current = numberOrNull(value);
    const corrected = Math.min(Math.max(0, (current ?? 0) - offset), 45);
    return corrected * factor;
  };

  scaled.a_current = scaleCurrent(raw.a_current, 0.24, 800);
  scaled.b_current = scaleCurrent(raw.b_current, 0.19, 400);
  scaled.c_current = scaleCurrent(raw.c_current, 0.13, 230);

  scaled.a_pf = 1;
  scaled.b_pf = 1;
  scaled.c_pf = 1;

  scaled.a_voltage = numberOrNull(raw.a_voltage) ?? 230;
  scaled.b_voltage = numberOrNull(raw.b_voltage) ?? 230;
  scaled.c_voltage = numberOrNull(raw.c_voltage) ?? 230;

  if (_.vuf.scenario === 'realistic') {
    scaled.b_voltage += -1;
    scaled.a_voltage += 1;
    scaled.c_voltage += 0.5;
  }

  return scaled;
};

const onEnergyMeter = data => {
  const raw = { ...(data ?? {}) };
  const scaled = buildDemoScaledEnergyData(raw);

  _.energy_meter.rawData = raw;
  _.energy_meter.demoScaled = scaled;
  // Backward-compatible alias for older widgets. Do not treat this as raw measured data.
  _.energy_meter.data = scaled;
  _.energy_meter.lastUpdate = performance.now();
};

const onWallbox = data => {
  if (data.id === 0) _.wallbox.r0 = data.output;
  else if (data.id === 1) _.wallbox.r1 = data.output;

  if (_.wallbox.r0 !== null && _.wallbox.r1 !== null) {
    _.wallbox.load = (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
  }
};

const onBattery = data => {
  _.battery.charging = data.output === true;
};

const toggleWallbox = r => {
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

const applyHeatpumpLoad = (normalizedLoad, mode = null) => {
  const safeLoad = Math.max(0, Math.min(1, Number(normalizedLoad) || 0));
  const commandMode = mode ?? (safeLoad <= 0 ? 'stop' : 'start');

  if (Math.abs((Number(_.heatpump.load) || 0) - safeLoad) <= 0.0001) {
    App.EspService.heatpump(safeLoad, commandMode);
    return;
  }

  pendingHeatpumpCommandMode = commandMode;
  _.heatpump.load = safeLoad;
};

const updateHeatpumpLoad = value => {
  applyHeatpumpLoad(Number(value) || 0);
};

const sendHeatpumpZeroHold = () => {
  applyHeatpumpLoad(0, 'zero_hold');
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

const init = () => {
  selectScenario('realistic');

  unwatchHeatpump = watch(
    () => _.heatpump.load,
    value => {
      const mode = pendingHeatpumpCommandMode ?? (Number(value) <= 0 ? 'stop' : 'start');
      pendingHeatpumpCommandMode = null;
      App.EspService.heatpump(value, mode);
    }
  );

  App.EnergyMeterService.on('data', onEnergyMeter);
  App.WallboxService.on('data', onWallbox);
  App.BatteryService.on('data', onBattery);

  App.WallboxService.requestUpdate();
  App.BatteryService.requestUpdate();

  animationFrame = requestAnimationFrame(animate);
};

onMounted(init);

onUnmounted(() => {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  unwatchHeatpump?.();
  App.EnergyMeterService.off?.('data', onEnergyMeter);
  App.WallboxService.off?.('data', onWallbox);
  App.BatteryService.off?.('data', onBattery);
});
</script>

<template>
  <div class="dashboard">
    <header class="topbar">
      <div>
        <h1 style='font-size:3em;padding:0;line-height: 2em;margin-bottom:-0.4em;'>SENERGATE</h1>
        <p style='font-size:1em;padding-bottom:1em'>Smart Energy Gateway · Frontstage</p>
      </div>
    </header>

    <div class="overview-grid">
      <CurrentCard
        :currents="measuredCurrents"
        :y-range="{ min: 0, max: 100 }"
      />

      <PhasorCard
        :voltages="measuredVoltages"
        :angles="_.vuf.sourceAngle"
      />

      <VufCard :vuf="currentVuf" />
    </div>

    <div class="agent-section">
      <AgentCard
        :vuf="currentVuf"
        :device-states="agentDeviceStates"
        :predict-vuf="predictVufForDeviceState"
        @apply-state="applyAgentDeviceState"
        @enabled-change="onAgentEnabledChange"
        @heatpump-zero-hold="sendHeatpumpZeroHold"
      />
    </div>

    <div class="footer-meta">
      <span>
        Measurement age:
        {{ _.energy_meter.timedelta !== null ? `${_.energy_meter.timedelta.toFixed(1)} s` : '--' }} · Demo-scaled data source
      </span>

      <span>
        Scenario:
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
.dashboard{max-width:1540px;margin:0 auto;padding:20px;color:#eaf6ff}.topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:5px 20px;border:1px solid #1b3a4e;border-radius:20px;background:rgba(7,19,31,.82);box-shadow:0 20px 60px rgba(0,0,0,.25)}.topbar h1{margin:0;font-size:18px;letter-spacing:.28em}.topbar p{margin:4px 0 0;color:#83a7bd;font-size:10px;letter-spacing:.12em;text-transform:uppercase}.topbar-meta{display:flex;gap:8px;flex-wrap:wrap}.chip{padding:6px 9px;border:1px solid #284b60;border-radius:999px;color:#a7c8d8;font-size:10px}.chip.measured{border-color:#2b6f62;color:#8ff1c3}.chip.simulated{border-color:#65455c;color:#ffc2e5}.chip.active{border-color:#2b6f62;color:#8ff1c3}.section,.agent-section{margin-top:14px}.overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px;align-items:stretch}.overview-grid>*{min-width:0}.footer-meta{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding:0 4px;color:#6f91a3;font-size:10px}.footer-meta button{margin-left:5px;padding:4px 8px;border:1px solid #284b60;border-radius:999px;color:#8daec0;background:#081721;cursor:pointer}.footer-meta button.selected{border-color:#58e7ff;color:#eaf6ff}@media(max-width:1100px){.overview-grid{grid-template-columns:1fr}}@media(max-width:700px){.dashboard{padding:10px}.topbar,.footer-meta{flex-direction:column;align-items:flex-start}}
</style>
