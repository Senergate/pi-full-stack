<script setup>
import { reactive, watch, onMounted, onUnmounted, computed } from 'vue';
import App from '../App.js';
import Card from './Card.vue';

const _ = reactive({
  count: 0,
  now: Date.now(),

  heatpump: {
    load: 0,
  },

  wallbox: {
    load: 0.5,
    r1: null,
    r2: null,
  },

  shelly: {
    lastUpdate: null,
    data: {},
  },

  pico: {
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

let clock = null;

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
      L1: _.shelly.data[`a_${key}`],
      L2: _.shelly.data[`b_${key}`],
      L3: _.shelly.data[`c_${key}`],
    },
  }))
);

const ageSeconds = lastUpdate => {
  if (!lastUpdate) return null;
  return Math.floor((_.now - lastUpdate) / 1000);
};

const ageLabel = lastUpdate => {
  const age = ageSeconds(lastUpdate);
  return age === null ? '-' : `${age}s`;
};

const ageClass = lastUpdate => {
  const age = ageSeconds(lastUpdate);

  if (age === null) return '';
  if (age > 5) return 'section-stale-red';
  if (age > 2) return 'section-stale-orange';

  return '';
};

const formatValue = (value, unit) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${Number.parseFloat(value).toFixed(2)}${unit ? ` ${unit}` : ''}`;
};

const init = () => {
  clock = setInterval(() => {
    _.now = Date.now();
  }, 500);

  watch(
    () => _.heatpump.load,
    v => {
      App.EspService.heatpump(v);
    }
  );

  App.ShellyService.on('data', data => {
    Object.assign(_.shelly.data, data);
    _.shelly.lastUpdate = Date.now();
  });

  App.PicoService.on('data', data => {
    Object.assign(_.pico.data, data);
    _.pico.lastUpdate = Date.now();
  });

  App.EspService.on('branchA', data => {
    console.log('branchA', data);
  });

  App.EspService.on('branchB', data => {
    _.wallbox.r1 = data.relay_1_on;
    _.wallbox.r2 = data.relay_2_on;
  });
};

const toggleBypass = () => {
  App.EspService.bypass(true);
};

const toggleWallbox = r => {
  if (r == 0) {
    if (_.wallbox.r1 === null) return;
    App.EspService.wallbox(1, !_.wallbox.r1);
    _.wallbox.r1 = null;
  } else {
    if (_.wallbox.r2 === null) return;
    App.EspService.wallbox(2, !_.wallbox.r2);
    _.wallbox.r2 = null;
  }
};

onMounted(init);

onUnmounted(() => {
  if (clock) clearInterval(clock);
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

    <div class="row q-col-gutter-md">
      <div class="col-12">
        <Card>
          <q-card-section>Card 3</q-card-section>
        </Card>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12 col-sm-6">
        <Card>
          <q-card-section
            >Discovered Devices
            <q-input v-model="_.count" label="test" />
          </q-card-section>
        </Card>
      </div>

      <div class="col-12 col-sm-6">
        <Card>
          <q-card-section>
            <div class="text-h6">Discovered Devices</div>
          </q-card-section>

          <q-card-section class="q-pt-none">
            <q-list>
              <q-item>
                <q-item-section side>
                  <q-icon color="secondary" name="heat_pump" size="3em" />
                </q-item-section>
                <q-item-section>
                  <q-slider v-model="_.heatpump.load" :min="0" :max="5" label color="secondary" />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section side>
                  <q-icon color="secondary" name="electric_car" size="3em" />
                </q-item-section>
                <q-item-section>
                  <q-linear-progress rounded size="1em" stripe :value="_.wallbox.load" color="secondary" />
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    :model-value="_.wallbox.r1"
                    @update:model-value="() => toggleWallbox(0)"
                    indeterminate-value="null"
                    color="secondary"
                  />
                </q-item-section>
                <q-item-section side>
                  <q-toggle
                    :model-value="_.wallbox.r2"
                    @update:model-value="() => toggleWallbox(1)"
                    indeterminate-value="null"
                    color="secondary"
                  />
                </q-item-section>
                <!-- <q-item-section side> -->
                <!--   <q-btn label="Toggle Bypass" color="secondary" @click="toggleBypass" /> -->
                <!-- </q-item-section> -->
              </q-item>
              <q-item>
                <q-item-section side>
                  <q-icon color="secondary" name="battery_charging_full" size="3em" />
                </q-item-section>
                <q-item-section>
                  <q-slider v-model="_.count" :min="0" :max="10" label color="secondary" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card-section>
        </Card>
      </div>
    </div>

    <div class="row q-col-gutter-md q-mt-md">
      <div class="col-12">
        <Card>
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
                <tr class="section-row" :class="ageClass(_.pico.lastUpdate)">
                  <td colspan="4">Pico ({{ ageLabel(_.pico.lastUpdate) }})</td>
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

                <tr class="section-row" :class="ageClass(_.shelly.lastUpdate)">
                  <td colspan="4">Shelly ({{ ageLabel(_.shelly.lastUpdate) }})</td>
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
  </div>
</template>

<style scoped>
.phase_table {
  color: #aab;
  border-collapse: collapse;
}

.phase_table thead {
  /* border:1px solid red; */
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

.section-row td {
  padding-top: 0.8em;
  padding-bottom: 0.4em;
  color: #ccc;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

.separator-row td {
  padding: 0.6em 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.25);
}

.section-stale-orange td {
  color: orange;
}

.section-stale-red td {
  color: red;
}

.text-spaced {
  letter-spacing: 0.2em;
}

.text-h6 {
  /* text-transform: uppercase; */
}

.q-card__section {
  margin: 0;
  padding: 0;
}

.title {
  font-size: 2em;
  letter-spacing: 0.1em;
  padding: 0;
  margin: 0 0 0 0;
}

.container {
  max-width: 1024px;
  padding: 0;
  margin: 1em auto 0 auto;
  padding: 1.5em;
  border-radius: 1em;
  background-color: #0a1422;
  border: 1px solid #16344a;
}
</style>
