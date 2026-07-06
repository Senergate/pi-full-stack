<script setup>
import { reactive, watch, onMounted } from 'vue';
import App from '../App.js';
import Card from './Card.vue';

const _ = reactive({
  count: 0,
  heatpump: {
    load: 0,
  },
  wallbox: {
    load: 0.5,
    r1: null,
    r2: null,
  },
  shelly: {
    data: {

    }
  },
  pico: {
    data: {
      timestamp: 1782652636.6645148,
      samples: 12000,
      sample_rate_hz: 39111.38923654568,
      duration_s: 0.30681600000000003,
      fft_resolution_hz: 3.2592824363788067,
      overflow: 0,
      channels: {
        A: {
          min_mv: 0,
          max_mv: 16.117125984251967,
          mean_mv: 0.038949721128608915,
          std_mv: 0.791353575657098,
          dc_mv: 0.038949721128608915,
          rms_mv: 0.7923115312055421,
          ac_rms_mv: 0.791353575657098,
          peak_frequency_hz: 6124.191697955777,
          peak_amplitude_mv: 0.052864897313239054,
        },
        B: {
          min_mv: 0,
          max_mv: 0,
          mean_mv: 0,
          std_mv: 0,
          dc_mv: 0,
          rms_mv: 0,
          ac_rms_mv: 0,
          peak_frequency_hz: 0,
          peak_amplitude_mv: 0,
        },
        C: {
          min_mv: 0,
          max_mv: 15.994094488188976,
          mean_mv: 7.734477526246718,
          std_mv: 7.992735562218269,
          dc_mv: 7.734477526246718,
          rms_mv: 11.122318300226988,
          ac_rms_mv: 7.992735562218269,
          peak_frequency_hz: 45.62995410930329,
          peak_amplitude_mv: 0.5324014008282792,
        },
      },
    },
  },
});

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

// const test = async () => {
//   // const res = await App.SomeService.test('hello');
//   const res = await App.EspService.wallbox('hello', 2);
//   console.log(res);
// };

const init = () => {
  // watch(
  //   () => _.wallbox.r1,
  //   v => {
  //     App.EspService.wallbox(1, v);
  //   }
  // );
  // watch(
  //   () => _.wallbox.r2,
  //   v => {
  //     App.EspService.wallbox(2, v);
  //   }
  // );

  watch(
    () => _.heatpump.load,
    v => {
      App.EspService.heatpump(_.heatpump.load);
    }
  );

  App.EspService.on('update', data => {
    console.log(data);
  });
  App.ShellyService.on('data', data => {
    Object.assign(_.shelly.data, data);
    console.log(_.shelly.data)
  });

  App.PicoService.on('data', data => {
    Object.assign(_.pico.data, data);
  });
  App.EspService.on('branchA', data => {
    console.log('branchA',data)
  });
  App.EspService.on('branchB', data => {
    _.wallbox.r1 = data.relay_1_on;
    _.wallbox.r2 = data.relay_2_on;
  });
};

const toggleBypass = ()=>{
  App.EspService.bypass(true);
};

const toggleWallbox = r => {
  if(r==0){
    if(_.wallbox.r1===null) return;
    App.EspService.wallbox(1, !_.wallbox.r1);
    _.wallbox.r1 = null;
  } else {
    if(_.wallbox.r2===null) return;
    App.EspService.wallbox(2, !_.wallbox.r2);
    _.wallbox.r2 = null;
  }
};

onMounted(init);
</script>

<template>
  <div class="container">
    <!-- Row 1: two cards -->

    <!-- Row 2: one card -->
    <div class="row" style="margin: 0 0 1em 0">
      <div class="col-12">
        <div class="title">
          <q-spinner-audio color="white" size="0.8em" style="margin-top: -0.3em" />
          <q-spinner-audio color="white" size="0.8em" style="margin-top: -0.3em; margin-left: -0.2em" />
          SENERGATE
        </div>
      </div>
    </div>

    <!-- Row 2: one card -->
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
                  <q-toggle :model-value="_.wallbox.r1" @update:model-value="()=>toggleWallbox(0)" indeterminate-value="null" color="secondary" />
                </q-item-section>
                <q-item-section side>
                  <q-toggle :model-value="_.wallbox.r2" @update:model-value="()=>toggleWallbox(1)" indeterminate-value="null" color="secondary" />
                </q-item-section>
                <q-item-section side>
                  <q-btn label='Toggle Bypass' color="secondary" @click='toggleBypass' />
                </q-item-section>
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
            <tr
              v-for="a in Object.keys(pico_map)"
              :key="a"
            >
              <td>{{ pico_map[a][0] }}</td>

              <td class="text-right" style='width:150px;'>
                {{ Number.parseFloat(_.pico.data.channels.A[a] / pico_map[a][1]).toFixed(2) }}
                {{ pico_map[a][2] }}
              </td>

              <td class="text-right" style='width:150px;'>
                {{ Number.parseFloat(_.pico.data.channels.B[a] / pico_map[a][1]).toFixed(2) }}
                {{ pico_map[a][2] }}
              </td>

              <td class="text-right" style='width:150px;'>
                {{ Number.parseFloat(_.pico.data.channels.C[a] / pico_map[a][1]).toFixed(2) }}
                {{ pico_map[a][2] }}
              </td>
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
  color:#aab;
  border-collapse:collapse;
}

.phase_table thead {
  /* border:1px solid red; */
  border-bottom:1px solid rgba(255,255,255,0.2);
}

.phase_table th {
  color:#ccc;
  padding: 0 0 0.5em 0;
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
