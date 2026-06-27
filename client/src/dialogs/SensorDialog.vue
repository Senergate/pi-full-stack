<script lang="ts" setup>
import { useDialogPluginComponent } from 'quasar';
import { ref, reactive, onMounted } from 'vue';
import * as d3 from 'd3';

import App from '../App.js';

const _ = reactive({});

defineEmits([...useDialogPluginComponent.emits]);

const { dialogRef, onDialogHide, onDialogOK, onDialogCancel } = useDialogPluginComponent();

const svg_container = ref(null);

const init = async () => {
  const data = await App.SensorService.all(`SELECT * from sensor_data`, []);
  console.log(data.length);

  const temperature_data = data.filter(m => m.temperature !== null);

  const svg = d3.select(svg_container.value);
  const width = parseInt(svg.style('width'));
  const height = parseInt(svg.style('height'));
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Group data by MAC address
  const grouped = d3.group(temperature_data, d => d.mac);

  // Flatten to get full extent
  const allData = Array.from(grouped.values()).flat();

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(allData, d => new Date(d.time)))
    .range([0, innerWidth]);

  const yScale = d3
    .scaleLinear()
    .domain(d3.extent(allData, d => d.temperature))
    .nice()
    .range([innerHeight, 0]);

  const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(Array.from(grouped.keys()));

  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Axes
  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeMinute.every(60)) // ⏱️ Tick every 30 minutes
    .tickFormat(d3.timeFormat('%H:%M')); // 🕒 Format as hh:mm
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text') // Select tick labels
    .attr('transform', 'rotate(45)')
    .style('text-anchor', 'start')
    .attr('dx', '0.5em')
    .attr('dy', '0.25em');

  g.append('g').call(d3.axisLeft(yScale));

  // Line generator
  const line = d3
    .line()
    .x(d => xScale(new Date(d.time)))
    .y(d => yScale(d.temperature));

  // Plot each MAC's line
  grouped.forEach((values, mac) => {
    g.append('path')
      .datum(values)
      .attr('fill', 'none')
      .attr('stroke', colorScale(mac))
      .attr('stroke-width', 2)
      .attr('d', line);
  });
};

onMounted(init);
</script>

<template>
  <q-dialog ref="dialogRef" backdrop-filter="blur(4px) grayscale(50%)">
    <q-card class="q-dialog-plugin" style="background-color: rgba(0, 0, 0, 0.9); min-width: 80em" flat>
      <table class="sensor_table">
        <tbody>
          <tr>
            <th></th>
            <th><q-icon name="sym_o_motion_sensor_active" size="26px" /></th>
            <th><q-icon name="sym_o_device_thermostat" size="26px" /></th>
            <th><q-icon name="sym_o_humidity_mid" size="26px" /></th>
            <th><q-icon name="sym_o_battery_3_bar" size="26px" /></th>
          </tr>
          <tr v-for="(data, mac) in App._.sensors">
            <td style="padding-bottom: 0.45em">
              <q-icon :name="data.rssi > -60 ? 'wifi' : data.rssi > -75 ? 'wifi_2_bar' : 'wifi_1_bar'" size="18px" />
            </td>
            <td>{{ mac }}</td>
            <td>{{ parseFloat(data.t).toFixed(1) }}</td>
            <td>{{ data.h }}%</td>
            <td>{{ data.b }}%</td>
          </tr>
        </tbody>
      </table>
      <div class="svg_frame">
        <svg ref="svg_container" />
      </div>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.svg_frame {
  display: block;
  padding: 1em;
  min-width: 80em;
}
.svg_frame svg {
  /* border:1px solid #0f0; */
  width: 100%;
  height: 30em;
}

.sensor_table {
}

.sensor_table td {
  text-align: center;
  padding: 0.2em 0.5em;
  font-size: 1.2em;
}
</style>
