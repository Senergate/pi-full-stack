<script setup>
import App from './App.js';
import { reactive } from 'vue';
import Master from './components/Master.vue';
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
    <Menu />
    <q-page-container>
      <Master />
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
