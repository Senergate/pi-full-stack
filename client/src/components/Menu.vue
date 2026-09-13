<script setup>
import { reactive } from 'vue';
import App from '../App.js';

import SensorDialog from '../dialogs/SensorDialog.vue';
import DoorDialog from '../dialogs/DoorDialog.vue';
import ShutterDialog from '../dialogs/ShutterDialog.vue';

import { Dialog } from 'quasar';

const _ = reactive({
  show: true,
  mini: false,
  width: 150,
});

const showDialog = dialog => {
  Dialog.create({
    component: dialog,
    componentProps: {},
  });
};

const test = async () => {
  const x = await App.SensorService.all(`SELECT * from sensor_data`, []);
  console.log(x);
};

const heatWater = async () => {
  const res = await App.TimerService.heatWater(60*45);
  console.log(res);
};
</script>

<template>
  <q-drawer show-if-above v-model="_.show" :mini="_.mini" :width="_.width" side="left">
    <q-list>
      <q-item clickable v-ripple @click="() => showDialog(DoorDialog)">
        <q-item-section avatar>
          <q-icon name="key" />
        </q-item-section>
        <q-item-section>Doors</q-item-section>
      </q-item>

      <q-item clickable v-ripple @click="() => showDialog(ShutterDialog)">
        <q-item-section avatar>
          <q-icon name="window" />
        </q-item-section>
        <q-item-section>Shutters</q-item-section>
      </q-item>

      <q-item clickable v-ripple @click="() => showDialog(SensorDialog)">
        <q-item-section avatar>
          <q-icon name="sym_o_motion_sensor_active" />
        </q-item-section>
        <q-item-section>Sensors</q-item-section>
      </q-item>

      <q-item clickable v-ripple @click="heatWater">
        <q-item-section avatar>
          <q-icon name="shower" />
        </q-item-section>
        <q-item-section>Shower</q-item-section>
      </q-item>

      <q-item clickable v-ripple @click="test">
        <q-item-section avatar>
          <q-icon name="api" />
        </q-item-section>
        <q-item-section>Test</q-item-section>
      </q-item>
    </q-list>
  </q-drawer>
</template>

<style scoped></style>
