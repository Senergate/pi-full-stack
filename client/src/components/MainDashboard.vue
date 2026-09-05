<script setup>
import { reactive, watch, onMounted, onUnmounted } from 'vue';
import App from '../App.js';
import Card from './Card.vue';
import EnergyGraph from './EnergyGraph.vue';
import MeasuredCard from './MeasuredCard.vue';
import DiscoveredDevicesCard from './DiscoveredDevicesCard.vue';
import InferredCard from './InferredCard.vue';
import SimulatedCard from './SimulatedCard.vue';
import SensorDataCard from './SensorDataCard.vue';
import SanityChecksCard from './SanityChecksCard.vue';

const _ = reactive({
  count: 0,
  heatpump: { load: 0 },
  wallbox: { load: -1, r0: null, r1: null },
  battery: { load: 0.8, discharging: false },
  energy_meter: {
    timedelta: null,
    lastUpdate: null,
    data: {},
    map: {
      voltage: ['Voltage', 'V'],
      current: ['Current', 'A'],
      act_power: ['Active Power', 'W'],
      aprt_power: ['Apparent Power', 'VA'],
      pf: ['Power Factor', ''],
      freq: ['Frequency', 'Hz'],
    },
    quality: { signature: null, changedAt: null, abrupt: { L1: null, L2: null, L3: null } },
  },
  pico: {
    timedelta: null,
    lastUpdate: null,
    data: { channels: { a: {}, b: {}, c: {} } },
    map: {
      min_mv: ['Minimum Voltage', 1, 'mV'],
      max_mv: ['Maximum Voltage', 1, 'mV'],
      mean_mv: ['Mean Voltage', 1, 'mV'],
      std_mv: ['Standard Deviation', 1, 'mV'],
      dc_mv: ['DC Voltage', 1, 'mV'],
      rms_mv: ['RMS Voltage', 1, 'mV'],
      ac_rms_mv: ['AC RMS Voltage', 1, 'mV'],
      peak_frequency_hz: ['Peak Frequency', 1000, 'kHz'],
      peak_amplitude_mv: ['Peak Amplitude', 1, 'mV'],
    },
    quality: { signature: null, changedAt: null, abrupt: { L1: null, L2: null, L3: null } },
  },
});

let animationFrame = null;
let unwatchHeatpump = null;

const PHASES = [
  { label: 'L1', pico: 'a', shelly: 'a' },
  { label: 'L2', pico: 'b', shelly: 'b' },
  { label: 'L3', pico: 'c', shelly: 'c' },
];

const numberOrNull = value => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const SANITY_LIMITS = { frozenAfterSeconds: 5 };

const updateFrozenState = (target, data) => {
  const signature = JSON.stringify(data);
  if (target.signature !== signature) {
    target.signature = signature;
    target.changedAt = performance.now();
  }
};

const mergePicoData = data => {
  const { channels, ...rest } = data;
  Object.assign(_.pico.data, rest);

  if (!channels) return;

  _.pico.data.channels ??= { a: {}, b: {}, c: {} };

  for (const channel of ['a', 'b', 'c']) {
    _.pico.data.channels[channel] ??= {};
    if (channels[channel]) {
      Object.assign(_.pico.data.channels[channel], channels[channel]);
    }
  }
};

const animate = () => {
  const now = performance.now();

  if (_.energy_meter.lastUpdate) {
    _.energy_meter.timedelta = (now - _.energy_meter.lastUpdate) / 1000;
  }

  if (_.pico.lastUpdate) {
    _.pico.timedelta = (now - _.pico.lastUpdate) / 1000;
  }

  animationFrame = requestAnimationFrame(animate);
};

const onEnergyMeter = data => {
  const previous = { ..._.energy_meter.data };
  Object.assign(_.energy_meter.data, data);

  for (const phase of PHASES) {
    const p = phase.shelly;
    const currentVoltage = numberOrNull(_.energy_meter.data[`${p}_voltage`]);
    const previousVoltage = numberOrNull(previous[`${p}_voltage`]);
    const currentFrequency = numberOrNull(_.energy_meter.data[`${p}_freq`]);
    const previousFrequency = numberOrNull(previous[`${p}_freq`]);
    const currentPf = numberOrNull(_.energy_meter.data[`${p}_pf`]);
    const previousPf = numberOrNull(previous[`${p}_pf`]);

    _.energy_meter.quality.abrupt[phase.label] = {
      voltageDelta: currentVoltage !== null && previousVoltage !== null ? currentVoltage - previousVoltage : null,
      frequencyDelta:
        currentFrequency !== null && previousFrequency !== null ? currentFrequency - previousFrequency : null,
      pfDelta: currentPf !== null && previousPf !== null ? currentPf - previousPf : null,
    };
  }

  updateFrozenState(_.energy_meter.quality, _.energy_meter.data);
  _.energy_meter.lastUpdate = performance.now();
};

const onPicoData = data => {
  const previous = JSON.parse(JSON.stringify(_.pico.data.channels || {}));
  mergePicoData(data);

  for (const phase of PHASES) {
    const current = numberOrNull(_.pico.data.channels?.[phase.pico]?.ac_rms_mv);
    const before = numberOrNull(previous?.[phase.pico]?.ac_rms_mv);
    _.pico.quality.abrupt[phase.label] =
      current !== null && before !== null && Math.abs(before) > Number.EPSILON
        ? ((current - before) / Math.abs(before)) * 100
        : null;
  }

  updateFrozenState(_.pico.quality, _.pico.data.channels);
  _.pico.lastUpdate = performance.now();
};

const onBranchA = data => {
  // console.log('branchA', data);
};

const onWallbox = data => {
  // console.log('wallbox', data);
  if (data.id === 0) _.wallbox.r0 = data.output;
  else _.wallbox.r1 = data.output;
  _.wallbox.load = (_.wallbox.r0 ? 1 : 0) + (_.wallbox.r1 ? 2 : 0);
};

const onBattery = data => {
  console.log('battery', data.output);
  _.battery.discharging = data.output;
};

const toggleWallbox = r => {
  if (r === 0) {
    if (_.wallbox.r0 === null) return;
    let s = !_.wallbox.r0;
    _.wallbox.r0 = null;
    App.WallboxService.set(0, s);
  } else {
    if (_.wallbox.r1 === null) return;
    let s = !_.wallbox.r1;
    _.wallbox.r1 = null;
    App.WallboxService.set(1, s);
  }
};

const init = () => {
  animationFrame = requestAnimationFrame(animate);

  unwatchHeatpump = watch(
    () => _.heatpump.load,
    v => {
      App.EspService.heatpump(v);
    }
  );

  App.EnergyMeterService.on('data', onEnergyMeter);
  App.PicoService.on('data', onPicoData);
  App.EspService.on('branchA', onBranchA);
  // App.EspService.on('branchB', onBranchB);
  App.WallboxService.on('data', onWallbox);
  App.BatteryService.on('data', onBattery);
  App.WallboxService.requestUpdate();
  App.BatteryService.requestUpdate();
};

onMounted(init);

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  if (unwatchHeatpump) {
    unwatchHeatpump();
  }

  App.EnergyMeterService.off?.('data', onEnergyMeter);
  App.PicoService.off?.('data', onPicoData);
  App.EspService.off?.('branchA', onBranchA);
  App.WallboxService.off?.('data', onWallbox);
  App.BatteryService.off?.('data', onBattery);
});

const updateHeatpumpLoad = value => {
  _.heatpump.load = value;
};
const updateCount = value => {
  _.count = value;
};
</script>

<template>
  <div class="container">
    <div class="row" style="margin: 0 0 1em 0">
      <div class="col-12">
        <div class="title">
          <q-spinner-audio color="white" size="0.8em" style="margin-top: -0.3em" />
          <q-spinner-audio color="white" size="0.8em" style="margin-top: -0.3em; margin-left: -0.2em" />
          SENERGATE
        </div>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <DiscoveredDevicesCard
          :root="_"
          @update:heatpump-load="updateHeatpumpLoad"
          @update:count="updateCount"
          @toggle-wallbox="toggleWallbox"
        />
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <MeasuredCard :root="_" />
      </div>
    </div>

    <!-- <div class="row q-col-gutter-md q-mt-md"> -->
    <!--   <div class="col-12"> -->
    <!--     <InferredCard :root="_" /> -->
    <!--   </div> -->
    <!-- </div> -->

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <SimulatedCard :root="_" />
      </div>
    </div>

    <!-- <div class="row q-col-gutter-md q-mt-md"> -->
    <!--   <div class="col-12"> -->
    <!--     <SensorDataCard :root="_" /> -->
    <!--   </div> -->
    <!-- </div> -->

    <!-- <div class="row q-col-gutter-md q-mt-md"><div class="col-12"> -->
    <!--   <SanityChecksCard :root="_" /> -->
    <!-- </div></div> -->

    <!-- <div class="row q-col-gutter-md q-mt-md"><div class="col-12"> -->
    <!--   <Card><q-card-section><EnergyGraph :pico="_.pico" :shelly="_.energy_meter" /></q-card-section></Card> -->
    <!-- </div></div> -->
  </div>
</template>

<style scoped>
.title {
  font-size: 2em;
  letter-spacing: 0.1em;
  padding: 0;
  margin: 0;
}
.container {
  max-width: 1200px;
  margin: 1em auto 0;
  padding: 1.5em;
  border-radius: 1em;
  background-color: #0a1422;
  border: 1px solid #16344a;
}
</style>
