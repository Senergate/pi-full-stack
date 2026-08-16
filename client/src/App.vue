<script setup>
import App from './App.js';
import { reactive } from 'vue';
import MainDashboard from './components/MainDashboard.vue';
import SimpleDashboard from './components/SimpleDashboard.vue';
import Menu from './components/Menu.vue';

import { useQuasar } from 'quasar';

const $q = useQuasar();
$q.dark.set(true);

const _ = reactive({
  showMenu: true,
});
</script>

<template>
  <q-layout view="hHh LpR fFf">
    <!-- <Menu /> -->
    <q-page-container style='padding:1em;'>
      <!-- <MainDashboard v-if="App._.connected" /> -->
      <SimpleDashboard v-if="App._.connected" />
    </q-page-container>
  </q-layout>
</template>

<style>
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 1,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24;
}
</style>
