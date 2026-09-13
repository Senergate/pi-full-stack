<script setup>
import { reactive, ref, onMounted, onUnmounted, watch } from 'vue';

const props = defineProps({
  pico: {
    type: Object,
    required: true,
  },
  shelly: {
    type: Object,
    required: true,
  },
});

const graph = ref(null);
const container = ref(null);

const HEIGHT = 320;
const MAX_POINTS = 20;
const SECONDS_VISIBLE = 10;

const _ = reactive({
  data: [],
  ctx: null,
  width: 800,
  animationFrame: null,
  resizeObserver: null,
});

const getShellyPoint = () => ({
  ts: performance.now(),
  a_act_power: props.shelly.data?.a_act_power ?? null,
  b_act_power: props.shelly.data?.b_act_power ?? null,
  c_act_power: props.shelly.data?.c_act_power ?? null,
});

const niceCeil = value => {
  if (value === 0) return 0;

  const sign = Math.sign(value);
  const abs = Math.abs(value);
  const exponent = Math.floor(Math.log10(abs));
  const base = Math.pow(10, exponent);
  const normalized = abs / base;

  let nice;

  if (normalized <= 1) nice = base;
  else if (normalized <= 2) nice = 2 * base;
  else if (normalized <= 5) nice = 5 * base;
  else nice = 10 * base;

  return sign < 0 ? -Math.floor(abs / base) * base : nice;
};

const niceFloor = value => {
  if (value === 0) return 0;

  const sign = Math.sign(value);
  const abs = Math.abs(value);
  const exponent = Math.floor(Math.log10(abs));
  const base = Math.pow(10, exponent);
  const normalized = abs / base;

  let nice;

  if (normalized <= 1) nice = base;
  else if (normalized <= 2) nice = 2 * base;
  else if (normalized <= 5) nice = 5 * base;
  else nice = 10 * base;

  return sign < 0 ? -nice : Math.floor(abs / base) * base;
};

const resizeCanvas = () => {
  if (!container.value || !graph.value) return;

  const dpr = window.devicePixelRatio || 1;
  const width = container.value.clientWidth;

  _.width = width;

  graph.value.width = width * dpr;
  graph.value.height = HEIGHT * dpr;
  graph.value.style.width = `${width}px`;
  graph.value.style.height = `${HEIGHT}px`;

  _.ctx = graph.value.getContext('2d');
  _.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const drawGrid = (ctx, mapX, mapY, padding, width, height, minY, maxY) => {
  const gridValues = [
    minY,
    minY + (maxY - minY) * 0.25,
    minY + (maxY - minY) * 0.5,
    minY + (maxY - minY) * 0.75,
    maxY,
  ];

  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (const value of gridValues) {
    const y = mapY(value);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.strokeStyle =
      Math.abs(value) < 0.0001 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#aab';
    ctx.fillText(`${value.toFixed(0)} W`, padding.left - 8, y);
  }

  const timeMarks = [30, 20, 10, 0];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#aab';

  for (const secondsAgo of timeMarks) {
    const x = mapX(performance.now() - secondsAgo * 1000);

    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, height - padding.bottom);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillText(secondsAgo === 0 ? 'now' : `-${secondsAgo}s`, x, height - padding.bottom + 8);
  }
};

const drawLine = (ctx, points, key, color, mapX, mapY, width) => {
  const validPoints = points.filter(p => typeof p[key] === 'number');

  if (validPoints.length < 2) return;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.moveTo(mapX(validPoints[0].ts), mapY(validPoints[0][key]));

  for (let i = 1; i < validPoints.length; i++) {
    const p = validPoints[i];
    ctx.lineTo(mapX(p.ts), mapY(p[key]));
  }

  ctx.stroke();

  const last = validPoints[validPoints.length - 1];
  const lastX = mapX(last.ts);
  const lastY = mapY(last[key]);

  ctx.beginPath();
  ctx.setLineDash([5, 8]);
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(width, lastY);
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = color;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${last[key].toFixed(0)} W`, width - 4, lastY - 4);
};

const drawGraph = () => {
  const ctx = _.ctx;
  if (!ctx) return;

  const width = _.width;
  const height = HEIGHT;
  const now = performance.now();

  ctx.clearRect(0, 0, width, height);

  const padding = {
    top: 16,
    right: 64,
    bottom: 34,
    left: 56,
  };

  const visibleStart = now - SECONDS_VISIBLE * 1000;

  const visiblePoints = _.data.filter(p => p.ts >= visibleStart && p.ts <= now);

  if (visiblePoints.length < 2) return;

  const values = visiblePoints.flatMap(p =>
    [p.a_act_power, p.b_act_power, p.c_act_power].filter(v => typeof v === 'number')
  );

  if (!values.length) return;

  const rawMinY = Math.min(...values);
  const rawMaxY = Math.max(...values);

  let minY = rawMinY;
  let maxY = rawMaxY;

  if (minY === maxY) {
    minY -= 50;
    maxY += 50;
  }

  const range = maxY - minY;
  const margin = range * 0.15;

  minY = niceFloor(minY - margin);
  maxY = niceCeil(maxY + margin);

  if (minY === maxY) {
    minY -= 50;
    maxY += 50;
  }

  const mapX = ts =>
    width -
    padding.right -
    ((now - ts) / 1000 / SECONDS_VISIBLE) * (width - padding.left - padding.right);

  const mapY = y =>
    padding.top +
    ((maxY - y) / (maxY - minY)) * (height - padding.top - padding.bottom);

  drawGrid(ctx, mapX, mapY, padding, width, height, minY, maxY);

  const firstVisibleIndex = _.data.findIndex(p => p.ts >= visibleStart);
  const startIndex = Math.max(0, firstVisibleIndex - 1);
  const endIndex = Math.min(_.data.length, firstVisibleIndex + visiblePoints.length + 1);
  const drawPoints = _.data.slice(startIndex, endIndex);

  ctx.save();

  // ctx.beginPath();
  // ctx.rect(
  //   padding.left,
  //   padding.top,
  //   width - padding.left - padding.right,
  //   height - padding.top - padding.bottom
  // );
  // ctx.clip();

  drawLine(ctx, drawPoints, 'a_act_power', '#00ccff', mapX, mapY, width);
  drawLine(ctx, drawPoints, 'b_act_power', '#00ff66', mapX, mapY, width);
  drawLine(ctx, drawPoints, 'c_act_power', '#ffcc00', mapX, mapY, width);

  ctx.restore();
};

const animate = () => {
  drawGraph();
  _.animationFrame = requestAnimationFrame(animate);
};

watch(
  () => props.shelly.lastUpdate,
  () => {
    const point = getShellyPoint();

    if (
      point.a_act_power === null &&
      point.b_act_power === null &&
      point.c_act_power === null
    ) {
      return;
    }

    _.data.push(point);

    if (_.data.length > MAX_POINTS) {
      _.data.shift();
    }
  }
);

onMounted(() => {
  resizeCanvas();

  _.resizeObserver = new ResizeObserver(resizeCanvas);

  if (container.value) {
    _.resizeObserver.observe(container.value);
  }

  animate();
});

onUnmounted(() => {
  if (_.animationFrame) {
    cancelAnimationFrame(_.animationFrame);
  }

  if (_.resizeObserver) {
    _.resizeObserver.disconnect();
  }
});
</script>

<template>
  <div ref="container" class="energy-graph">
    <div class="graph-title">Shelly Active Power</div>

    <canvas ref="graph"></canvas>

    <div class="legend">
      <span><i class="l1"></i>L1</span>
      <span><i class="l2"></i>L2</span>
      <span><i class="l3"></i>L3</span>
    </div>
  </div>
</template>

<style scoped>
.energy-graph {
  width: 100%;
}

.graph-title {
  color: #ccc;
  font-weight: bold;
  letter-spacing: 0.12em;
  margin-bottom: 0.75em;
}

canvas {
  display: block;
  width: 100%;
  height: 320px;
}

.legend {
  display: flex;
  gap: 1.5em;
  margin-top: 0.75em;
  color: #aab;
  font-size: 0.9em;
}

.legend span {
  display: flex;
  align-items: center;
  gap: 0.4em;
}

.legend i {
  display: inline-block;
  width: 1em;
  height: 0.25em;
  border-radius: 1em;
}

.l1 {
  background: #00ccff;
}

.l2 {
  background: #00ff66;
}

.l3 {
  background: #ffcc00;
}
</style>
