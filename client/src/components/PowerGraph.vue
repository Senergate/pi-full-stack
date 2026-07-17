<script setup>
import { reactive, ref, onMounted, watch } from 'vue';
import App from '../App.js';

const graph = ref(null);

const WIDTH = 800;
const HEIGHT = 400;

const _ = reactive({
  count: 0,
  data: [],
  ctx: null,
  la: 0,
  lb: 0,
  lc: 0,
});

const test = async () => {
  const res = await App.SomeService.test('hello');
  console.log(res);
};

const MAX_POINTS = 1000;

const drawGraph = () => {
  const ctx = _.ctx;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const points = _.data;
  const n = points.length;

  if (n < 2) return;

  const padding = 0;

  // https://shelly-api-docs.shelly.cloud/gen2/0.14/ComponentsAndServices/EMData
  let minY = 0;
  let maxY = 6;

  const now = (performance.timeOrigin + performance.now()) / 1000;

  function mapX(x) {
    // return padding + ((x - minX) / (maxX - minX)) * (WIDTH - padding * 2);
    return WIDTH - padding - (now - x / 1000) * 30;
  }

  function mapY(y) {
    return HEIGHT - padding - ((Math.abs(y) - minY) / (maxY - minY)) * (HEIGHT - padding * 2);
  }

  // Axes
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, HEIGHT - padding);
  ctx.lineTo(WIDTH - padding, HEIGHT - padding);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  let p0 = points[0];
  const colors = {
    a: '#00ccff',
    b: '#00ff66',
    c: '#ffcc00',
  };

  if (false) {
    for (let a of ['a', 'b', 'c']) {
      ctx.beginPath();
      ctx.strokeStyle = colors[a];
      ctx.lineWidth = 5;

      ctx.moveTo(mapX(p0.ts), mapY(p0[`${a}_act_power`]));

      for (let i = 1; i < n - 1; i++) {
        const p = points[i];
        const next = points[i + 1];

        const x = mapX(p.ts);
        const y = mapY(p[`${a}_act_power`]);

        const nextX = mapX(next.ts);
        const nextY = mapY(next[`${a}_act_power`]);

        const midX = (x + nextX) / 2;
        const midY = (y + nextY) / 2;

        ctx.quadraticCurveTo(x, y, midX, midY);
      }

      // Finish at the final point
      const last = points[n - 1];
      ctx.lineTo(mapX(last.ts), mapY(last[`${a}_act_power`]));

      ctx.stroke();

      ctx.beginPath();
      ctx.setLineDash([5, 10]);
      ctx.moveTo(mapX(last.ts), mapY(last[`${a}_act_power`]));
      ctx.lineTo(1000, mapY(last[`${a}_act_power`]));
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    for (let a of ['a', 'b', 'c']) {
      ctx.beginPath();
      ctx.strokeStyle = colors[a];
      ctx.lineWidth = 5;

      ctx.moveTo(mapX(p0.ts), mapY(p0[`${a}_act_power`]));
      for (let i = 1; i < n; i++) {
        const p = points[i];
        const x = mapX(p.ts);
        ctx.lineTo(x, mapY(p[`${a}_act_power`]));
      }
      ctx.stroke();

      ctx.beginPath();
      ctx.setLineDash([5, 10]);
      ctx.moveTo(mapX(points[n - 1].ts), mapY(points[n - 1][`${a}_act_power`]));
      ctx.lineTo(1000, mapY(points[n - 1][`${a}_act_power`]));
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // // Points
  // for (const p of points) {
  //   ctx.beginPath();
  //   ctx.arc(mapX(p.x), mapY(p.y), 3, 0, Math.PI * 2);
  //   ctx.fill();
  // }
};

const animate = () => {
  drawGraph();
  requestAnimationFrame(animate);
};

const init = () => {
  const canvas = graph.value;
  _.ctx = canvas.getContext('2d');
  watch(
    () => App._.connected,
    () => {
      if (!App._.connected) return;
      App.io.emit('startSim', 10);
    }
  );
  App.io.on('data', p => {
    console.log(p);
    _.data.push(p);
    if (_.data.length > MAX_POINTS) _.data.shift();
  });
  animate();

  watch(
    () => _.la,
    () => {
      App.SomeService.set('light a', _.la);
    }
  );
  watch(
    () => _.lb,
    () => {
      App.SomeService.set('light b', _.lb);
    }
  );
  watch(
    () => _.lc,
    () => {
      App.SomeService.set('light c', _.lc);
    }
  );
};

onMounted(init);
</script>

<template>
  <!-- <q-btn :icon="App._.connected ? 'wifi' : 'wifi_off'" @click="test" /> -->

  <table>
    <tbody>
      <tr>
        <td style="width: 200px">
          <q-list>
            <q-item>
              <q-item-section>Light&nbsp;A</q-item-section>
              <q-item-section>
                <q-slider v-model="_.la" :min="0" :max="100" color="cyan" />
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Light&nbsp;B</q-item-section>
              <q-item-section>
                <q-slider v-model="_.lb" :min="0" :max="100" color="green-13" />
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Light&nbsp;C</q-item-section>
              <q-item-section>
                <q-slider v-model="_.lc" :min="0" :max="100" color="orange-12" />
              </q-item-section>
            </q-item>
          </q-list>
        </td>
        <td>
          <canvas ref="graph" width="800" height="400"></canvas>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
canvas {
  width: 800px;
  height: 400px;
}
</style>
