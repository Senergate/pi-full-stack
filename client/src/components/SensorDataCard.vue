<script setup>
import { computed } from 'vue';
import Card from './Card.vue';

const props = defineProps({
  root: { type: Object, required: true },
});


const picoRows = computed(() => Object.entries(props.root.pico.map).map(([key, [label, divisor, unit]]) => ({
  label, unit,
  values: {
    L1: props.root.pico.data.channels?.a?.[key] / divisor,
    L2: props.root.pico.data.channels?.b?.[key] / divisor,
    L3: props.root.pico.data.channels?.c?.[key] / divisor,
  },
})));

const shellyRows = computed(() => Object.entries(props.root.energy_meter.map).map(([key, [label, unit]]) => ({
  label, unit,
  values: {
    L1: props.root.energy_meter.data[`a_${key}`],
    L2: props.root.energy_meter.data[`b_${key}`],
    L3: props.root.energy_meter.data[`c_${key}`],
  },
})));

const formatValue = (value, unit) => {
  if (value === undefined || value === null || value === '') return '-';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '-';
  return `${numericValue.toFixed(2)}${unit ? ` ${unit}` : ''}`;
};
</script>

<template>
  <Card>
    <q-card-section>
      <div class="text-h6 text-spaced text-uppercase">Sensor Data</div>
    </q-card-section>
    <q-card-section>
      <table class="full-width phase-table">
        <thead><tr><th class="text-left text-spaced">PHASES</th><th class="text-right">L1</th><th class="text-right">L2</th><th class="text-right">L3</th></tr></thead>
        <tbody>
          <tr class="section-row" :class="{ 'section-stale-red': !props.root.pico.lastUpdate || props.root.pico.timedelta > 1.1, 'section-stale-orange': props.root.pico.lastUpdate && props.root.pico.timedelta > 0.7 && props.root.pico.timedelta <= 1.1 }">
            <td colspan="4">Pico [{{ props.root.pico.lastUpdate ? `${props.root.pico.timedelta?.toFixed(1)}s` : 'disconnected' }}]</td>
          </tr>
          <tr v-for="row in picoRows" :key="`pico-${row.label}`"><td>{{ row.label }}</td><td class="text-right value-cell">{{ formatValue(row.values.L1, row.unit) }}</td><td class="text-right value-cell">{{ formatValue(row.values.L2, row.unit) }}</td><td class="text-right value-cell">{{ formatValue(row.values.L3, row.unit) }}</td></tr>
          <tr class="separator-row"><td colspan="4"></td></tr>
          <tr class="section-row" :class="{ 'section-stale-red': !props.root.energy_meter.lastUpdate || props.root.energy_meter.timedelta > 1.5, 'section-stale-orange': props.root.energy_meter.lastUpdate && props.root.energy_meter.timedelta > 1.0 && props.root.energy_meter.timedelta <= 1.5 }">
            <td colspan="4">Shelly [{{ props.root.energy_meter.lastUpdate ? `${props.root.energy_meter.timedelta?.toFixed(1)}s` : 'disconnected' }}]</td>
          </tr>
          <tr v-for="row in shellyRows" :key="`shelly-${row.label}`"><td>{{ row.label }}</td><td class="text-right value-cell">{{ formatValue(row.values.L1, row.unit) }}</td><td class="text-right value-cell">{{ formatValue(row.values.L2, row.unit) }}</td><td class="text-right value-cell">{{ formatValue(row.values.L3, row.unit) }}</td></tr>
        </tbody>
      </table>
    </q-card-section>
  </Card>
</template>

<style scoped>
.phase-table { color: #aab; border-collapse: collapse; }
.phase-table thead { border-bottom: 1px solid rgba(255,255,255,.2); }
.phase-table th { color: #ccc; padding: 0 0 .5em; }
.phase-table td { padding: .25em 0; }
.value-cell { width: 150px; }
.section-row td { padding-top: .8em; padding-bottom: .4em; color: #ccc; font-weight: bold; letter-spacing: .12em; }
.separator-row td { padding: .6em 0; border-bottom: 1px solid rgba(255,255,255,.25); }
.section-stale-orange td { color: var(--q-secondary); }
.section-stale-red td { color: red; }
.text-spaced { letter-spacing: .2em; }
.text-uppercase { text-transform: uppercase; }
</style>
