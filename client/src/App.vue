<script setup>
import App from './App.js';
import SimpleDashboard from './components/SimpleDashboard.vue';
import { onMounted } from 'vue';
import { useQuasar } from 'quasar';

const $q = useQuasar();
$q.dark.set(true);

onMounted(() => App.ensureConnected());
</script>

<template>
  <q-layout view="hHh LpR fFf">
    <q-page-container style="padding:1em;">
      <SimpleDashboard />
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
