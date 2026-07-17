<script setup>
import { reactive, watch, onMounted, onUnmounted, computed } from 'vue';
import App from '../App.js';
import Card from './Card.vue';
import EnergyGraph from './EnergyGraph.vue';

const _ = reactive({
  count: 0,

  heatpump: {
    load: 0,
  },

  wallbox: {
    load: -1,
    r0: null,
    r1: null,
  },

  energy_meter: {
    timedelta: null,
    lastUpdate: null,
    data: {},
  },

  pico: {
    timedelta: null,
    lastUpdate: null,
    data: {
      channels: {
        A: {},
        B: {},
        C: {},
      },
    },
  },
});

let animationFrame = null;
let unwatchHeatpump = null;

const pico_map = {
  min_mv: ['Minimum Voltage', 1, 'mV'],
  max_mv: ['Maximum Voltage', 1, 'mV'],
  mean_mv: ['Mean Voltage', 1, 'mV'],
  std_mv: ['Standard Deviation', 1, 'mV'],
  dc_mv: ['DC Voltage', 1, 'mV'],
  rms_mv: ['RMS Voltage', 1, 'mV'],
  ac_rms_mv: ['AC RMS Voltage', 1, 'mV'],
  peak_frequency_hz: ['Peak Frequency', 1000, 'kHz'],
  peak_amplitude_mv: ['Peak Amplitude', 1, 'mV'],
};

const shelly_map = {
  voltage: ['Voltage', 'V'],
  current: ['Current', 'A'],
  act_power: ['Active Power', 'W'],
  aprt_power: ['Apparent Power', 'VA'],
  pf: ['Power Factor', ''],
  freq: ['Frequency', 'Hz'],
};

const picoRows = computed(() =>
  Object.keys(pico_map).map(key => ({
    label: pico_map[key][0],
    unit: pico_map[key][2],
    values: {
      L1: _.pico.data.channels?.A?.[key] / pico_map[key][1],
      L2: _.pico.data.channels?.B?.[key] / pico_map[key][1],
      L3: _.pico.data.channels?.C?.[key] / pico_map[key][1],
    },
  }))
);

const shellyRows = computed(() =>
  Object.keys(shelly_map).map(key => ({
    label: shelly_map[key][0],
    unit: shelly_map[key][1],
    values: {
      L1: _.energy_meter.data[`a_${key}`],
      L2: _.energy_meter.data[`b_${key}`],
      L3: _.energy_meter.data[`c_${key}`],
    },
  }))
);

const formatValue = (value, unit) => {
  if (value === undefined || value === null || value === '') return '-';

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';

  return `${numericValue.toFixed(2)}${unit ? ` ${unit}` : ''}`;
};

const calculateAcRms = channel => {
  const rms = Number(channel?.rms_mv);
  const dc = Number(channel?.dc_mv);

  if (!Number.isFinite(rms) || !Number.isFinite(dc)) return null;
  return Math.sqrt(Math.max(0, rms ** 2 - dc ** 2));
};

const sanityChecks = computed(() =>
  [
    ['L1', _.pico.data.channels?.A],
    ['L2', _.pico.data.channels?.B],
    ['L3', _.pico.data.channels?.C],
  ].map(([phase, channel]) => {
    const measured = Number(channel?.ac_rms_mv);
    const calculated = calculateAcRms(channel);
    const validMeasured = Number.isFinite(measured);
    const difference = calculated !== null && validMeasured ? calculated - measured : null;
    const absoluteDifference = difference !== null ? Math.abs(difference) : null;
    const percentDifference =
      absoluteDifference !== null && Math.abs(measured) > 0
        ? (absoluteDifference / Math.abs(measured)) * 100
        : null;

    let status = 'unknown';
    if (percentDifference !== null) {
      if (percentDifference <= 1) status = 'ok';
      else if (percentDifference <= 5) status = 'warning';
      else status = 'error';
    }

    return {
      phase,
      measured: validMeasured ? measured : null,
      calculated,
      difference,
      percentDifference,
      status,
    };
  })
);

const sanityStatusLabel = status => ({
  ok: 'OK',
  warning: 'CHECK',
  error: 'MISMATCH',
  unknown: 'NO DATA',
}[status]);

const mergePicoData = data => {
  const { channels, ...rest } = data;
  Object.assign(_.pico.data, rest);

  if (!channels) return;

  _.pico.data.channels ??= { A: {}, B: {}, C: {} };

  for (const channel of ['A', 'B', 'C']) {
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
  Object.assign(_.energy_meter.data, data);
  _.energy_meter.lastUpdate = performance.now();
};

const onPicoData = data => {
  mergePicoData(data);
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
  App.WallboxService.requestUpdate();
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
});
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
        <Card>
          <q-card-section>
            <div class="text-h6 text-spaced text-uppercase">Discovered Devices</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-list>
              <q-expansion-item label="PHASE L1" caption="STATUS: OK" default-opened dense>
                <q-list>
                  <q-item>
                    <q-item-section side>
                      <q-icon color="secondary" name="heat_pump" size="3em" />
                    </q-item-section>
                    <q-item-section>
                      <q-slider v-model="_.heatpump.load" :min="0" :max="5" label color="secondary" track-size="12px" />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-expansion-item>
              <br>
              <q-expansion-item label="PHASE L2" caption="STATUS: OK" default-opened dense>
                <q-list>
                  <q-item>
                    <q-item-section side>
                      <q-icon color="secondary" name="electric_car" size="3em" />
                    </q-item-section>

                    <q-item-section>
                      <q-linear-progress
                        rounded
                        size="1em"
                        stripe
                        :value="_.wallbox.load / 3"
                        color="secondary"
                        :indeterminate="_.wallbox.load < 0"
                      />
                    </q-item-section>

                    <q-item-section side>
                      <q-toggle
                        :model-value="_.wallbox.r0"
                        @update:model-value="() => toggleWallbox(0)"
                        indeterminate-value="null"
                        color="secondary"
                      />
                    </q-item-section>

                    <q-item-section side>
                      <q-toggle
                        :model-value="_.wallbox.r1"
                        @update:model-value="() => toggleWallbox(1)"
                        indeterminate-value="null"
                        color="secondary"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-expansion-item>
              <br>
              <q-expansion-item label="PHASE L3" caption="STATUS: OK" default-opened dense>
                <q-list>
                  <q-item>
                    <q-item-section side>
                      <q-icon color="secondary" name="battery_charging_full" size="3em" />
                    </q-item-section>
                    <q-item-section>
                      <q-slider v-model="_.count" :min="0" :max="10" label color="secondary" />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-expansion-item>
            </q-list>
          </q-card-section>
        </Card>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <Card>
          <q-card-section>
            <div class="text-h6 text-spaced text-uppercase">Sensor Data</div>
          </q-card-section>
          <q-card-section>
            <table class="full-width phase_table">
              <thead>
                <tr>
                  <th class="text-left text-spaced">PHASES</th>
                  <th class="text-right">L1</th>
                  <th class="text-right">L2</th>
                  <th class="text-right">L3</th>
                </tr>
              </thead>

              <tbody>
                <tr
                  class="section-row"
                  :class="{
                    'section-stale-red': !_.pico.lastUpdate || _.pico.timedelta > 1.1,
                    'section-stale-orange':
                      _.pico.lastUpdate && _.pico.timedelta > 0.7 && _.pico.timedelta <= 1.1,
                  }"
                >
                  <td colspan="4">
                    Pico [{{ _.pico.lastUpdate ? `${_.pico.timedelta?.toFixed(1)}s` : 'disconnected' }}]
                  </td>
                </tr>

                <tr v-for="row in picoRows" :key="`pico-${row.label}`">
                  <td>{{ row.label }}</td>
                  <td class="text-right value-cell">{{ formatValue(row.values.L1, row.unit) }}</td>
                  <td class="text-right value-cell">{{ formatValue(row.values.L2, row.unit) }}</td>
                  <td class="text-right value-cell">{{ formatValue(row.values.L3, row.unit) }}</td>
                </tr>

                <tr class="separator-row">
                  <td colspan="4"></td>
                </tr>

                <tr
                  class="section-row"
                  :class="{
                    'section-stale-red': !_.energy_meter.lastUpdate || _.energy_meter.timedelta > 1.5,
                    'section-stale-orange':
                      _.energy_meter.lastUpdate &&
                      _.energy_meter.timedelta > 1.0 &&
                      _.energy_meter.timedelta <= 1.5,
                  }"
                >
                  <td colspan="4">
                    Shelly [{{
                      _.energy_meter.lastUpdate ? `${_.energy_meter.timedelta?.toFixed(1)}s` : 'disconnected'
                    }}]
                  </td>
                </tr>

                <tr v-for="row in shellyRows" :key="`shelly-${row.label}`">
                  <td>{{ row.label }}</td>
                  <td class="text-right value-cell">{{ formatValue(row.values.L1, row.unit) }}</td>
                  <td class="text-right value-cell">{{ formatValue(row.values.L2, row.unit) }}</td>
                  <td class="text-right value-cell">{{ formatValue(row.values.L3, row.unit) }}</td>
                </tr>
              </tbody>
            </table>
          </q-card-section>
        </Card>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <Card>
          <q-card-section>
            <div class="text-h6 text-spaced text-uppercase">Sanity Checks</div>
            <div class="text-caption text-grey-5 q-mt-xs">
              AC RMS consistency: calculated from total RMS and DC component, then compared with measured AC RMS.
            </div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <div class="sanity-table-wrapper">
              <table class="full-width phase_table sanity-table">
                <thead>
                  <tr>
                    <th class="text-left">Phase</th>
                    <th class="text-right">Calculated AC RMS</th>
                    <th class="text-right">Measured AC RMS</th>
                    <th class="text-right">Difference</th>
                    <th class="text-right">Difference %</th>
                    <th class="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="check in sanityChecks" :key="check.phase">
                    <td>{{ check.phase }}</td>
                    <td class="text-right">{{ formatValue(check.calculated, 'mV') }}</td>
                    <td class="text-right">{{ formatValue(check.measured, 'mV') }}</td>
                    <td class="text-right">{{ formatValue(check.difference, 'mV') }}</td>
                    <td class="text-right">{{ formatValue(check.percentDifference, '%') }}</td>
                    <td class="text-right">
                      <q-badge
                        :color="
                          check.status === 'ok'
                            ? 'positive'
                            : check.status === 'warning'
                              ? 'warning'
                              : check.status === 'error'
                                ? 'negative'
                                : 'grey-7'
                        "
                        :label="sanityStatusLabel(check.status)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </q-card-section>
        </Card>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <Card>
          <q-card-section>
            <EnergyGraph :pico="_.pico" :shelly="_.energy_meter" />
          </q-card-section>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.phase_table {
  color: #aab;
  border-collapse: collapse;
}

.phase_table thead {
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.phase_table th {
  color: #ccc;
  padding: 0 0 0.5em 0;
}

.phase_table td {
  padding: 0.25em 0;
}

.value-cell {
  width: 150px;
}

.sanity-table-wrapper {
  overflow-x: auto;
}

.sanity-table th,
.sanity-table td {
  white-space: nowrap;
  padding-right: 1em;
}

.sanity-table td:first-child {
  font-weight: bold;
  color: #ccc;
}

.section-row td {
  padding-top: 0.8em;
  padding-bottom: 0.4em;
  color: #ccc;
  font-weight: bold;
  letter-spacing: 0.12em;
}

.separator-row td {
  padding: 0.6em 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.25);
}

.section-stale-orange td {
  color: var(--q-secondary);
}

.section-stale-red td {
  color: red;
}

.text-spaced {
  letter-spacing: 0.2em;
}

.text-uppercase {
  text-transform:uppercase;
}

.title {
  font-size: 2em;
  letter-spacing: 0.1em;
  padding: 0;
  margin: 0;
}

.container {
  max-width: 1024px;
  margin: 1em auto 0 auto;
  padding: 1.5em;
  border-radius: 1em;
  background-color: #0a1422;
  border: 1px solid #16344a;
}
</style>
