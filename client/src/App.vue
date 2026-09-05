<script setup>
import App from './App.js';
import SimpleDashboard from './components/SimpleDashboard.vue';
import { useQuasar } from 'quasar';

const $q = useQuasar();
$q.dark.set(true);
</script>

<template>
  <q-layout view="hHh LpR fFf">
    <q-page-container style="padding:1em;">
      <SimpleDashboard v-if="App._.mode === 'simulation' || App._.connected" />

      <div v-else class="connection-gate">
        <h2>REAL HARDWARE · nicht verbunden</h2>
        <p>
          Der Pi5/Socket.IO-Server ist derzeit nicht erreichbar. Im Real-Hardware-Modus
          werden keine simulierten Werte als reale Messwerte ausgegeben.
        </p>
        <p>
          REAL HARDWARE 当前无法连接 Pi5/Socket.IO。系统不会用模拟值代替真实测量值。
        </p>
        <button type="button" @click="App.setMode('simulation')">
          Zurück zu SIMULATION / 返回模拟模式
        </button>
      </div>
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
.connection-gate {
  max-width: 760px;
  margin: 60px auto;
  padding: 24px;
  border: 1px solid #284b60;
  border-radius: 18px;
  background: #081721;
  color: #eaf6ff;
}
.connection-gate p { color: #83a7bd; line-height: 1.6; }
.connection-gate button {
  padding: 10px 14px;
  border: 1px solid #58e7ff;
  border-radius: 10px;
  color: #eaf6ff;
  background: #103044;
  cursor: pointer;
}
</style>
