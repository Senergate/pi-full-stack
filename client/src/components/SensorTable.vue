<script setup>
import { reactive } from 'vue';
import App from '../App.js';

const _ = reactive({
  showMenu: true,
});

</script>

<template>

    <q-drawer show-if-above v-model="_.showMenu" side="left" bordered>
      <q-list>
        <q-item clickable v-ripple>
          <q-item-section avatar>
            <q-icon name="sym_o_motion_sensor_active" />
          </q-item-section>
          <q-item-section>Sensors</q-item-section>
        </q-item>

        <q-item clickable v-ripple>
          <q-item-section avatar>
            <q-icon name="wifi" />
          </q-item-section>
          <q-item-section>Test</q-item-section>
        </q-item>

      </q-list>

    </q-drawer>

</template>

<style scoped></style>
