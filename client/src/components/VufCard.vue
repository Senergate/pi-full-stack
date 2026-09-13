<template>
  <section class="vuf-card">
    <div class="eyebrow">Estimated three-phase voltage unbalance</div>

    <div class="big-status">
      <div class="value">{{ formattedVuf }}</div>
      <div class="state" :class="statusClass">{{ statusLabel }}</div>
    </div>

    <div
      class="gauge"
      role="meter"
      aria-label="Voltage unbalance factor"
      :aria-valuenow="safeVuf"
      aria-valuemin="0"
      aria-valuemax="4"
    >
      <div class="gauge-fill" :style="{ width: gaugeWidth }" />
    </div>

    <div class="reference">Engineering reference: EN 50160 VUF ≤ 2% · demo status only</div>

    <div class="vuf-breakdown">
      <span>Total estimated: {{ formatPercent(safeVuf) }}</span>
      <span>Baseline PCC: {{ formattedBaseline }}</span>
      <span>Scenario ΔVUF: {{ formattedLoadImpact }}</span>
    </div>

    <div class="history">
      <div class="history-header">
        <span>VUF · last 10 seconds</span>
        <span class="history-range">0–4.0%</span>
      </div>

      <div ref="graphContainer" class="graph-container">
        <canvas ref="graph" class="graph" aria-label="VUF history for the last 10 seconds" />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { classifyVuf, formatVufPercent, numberOrNullVuf } from '../VufPresentation.js';

const props = defineProps({
  vuf: {
    type: Number,
    required: false,
    default: null,
  },
  baselineVuf: {
    type: Number,
    required: false,
    default: null,
  },
  loadImpactVuf: {
    type: Number,
    required: false,
    default: null,
  },
});

const graph = ref(null);
const graphContainer = ref(null);

const GRAPH_HEIGHT = 150;
const SECONDS_VISIBLE = 10;

const MIN_VUF = 0;
const MAX_VUF = 4.0;

const MAX_POINTS = 300;

const graphState = reactive({
  data: [],
  ctx: null,
  width: 400,
  animationFrame: null,
  resizeObserver: null,
});

const safeVuf = computed(() => numberOrNullVuf(props.vuf));

const formatPercent = value => formatVufPercent(value);
const formattedVuf = computed(() => formatVufPercent(safeVuf.value));
const formattedBaseline = computed(() => formatVufPercent(props.baselineVuf));
const formattedLoadImpact = computed(() => formatVufPercent(props.loadImpactVuf));

const status = computed(() => classifyVuf(safeVuf.value));
const statusLabel = computed(() => status.value.label.toUpperCase());
const statusClass = computed(() => {
  if (status.value.className === 'critical') return 'bad';
  if (status.value.className === 'warning') return 'warn';
  if (status.value.className === 'balanced') return 'good';
  return 'unknown';
});

const gaugeWidth = computed(() =>
  safeVuf.value === null ? '0%' : `${Math.min(100, (safeVuf.value / 4) * 100)}%`
);

const addPoint = value => {
  if (value === null || value === undefined || value === '') {
    return;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return;

  graphState.data.push({
    ts: performance.now(),
    vuf: Math.max(0, numericValue),
  });

  if (graphState.data.length > MAX_POINTS) {
    graphState.data.splice(0, graphState.data.length - MAX_POINTS);
  }
};

const resizeCanvas = () => {
  if (!graphContainer.value || !graph.value) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = graphContainer.value.clientWidth;

  graphState.width = width;

  graph.value.width = width * dpr;
  graph.value.height = GRAPH_HEIGHT * dpr;

  graph.value.style.width = `${width}px`;
  graph.value.style.height = `${GRAPH_HEIGHT}px`;

  graphState.ctx = graph.value.getContext('2d');

  graphState.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const drawGrid = (ctx, mapX, mapY, padding, width, height, now) => {
  const yValues = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];

  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (const value of yValues) {
    const y = mapY(value);

    ctx.beginPath();

    ctx.moveTo(padding.left, y);

    ctx.lineTo(width - padding.right, y);

    ctx.strokeStyle = value === 2 ? 'rgba(255, 209, 102, 0.28)' : 'rgba(255, 255, 255, 0.08)';

    ctx.lineWidth = 1;

    ctx.stroke();

    ctx.fillStyle = '#789aac';

    ctx.fillText(`${value.toFixed(1)}%`, padding.left - 7, y);
  }

  const timeMarks = [10, 5, 0];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#789aac';

  for (const secondsAgo of timeMarks) {
    const x = mapX(now - secondsAgo * 1000);

    ctx.beginPath();

    ctx.moveTo(x, padding.top);

    ctx.lineTo(x, height - padding.bottom);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';

    ctx.lineWidth = 1;

    ctx.stroke();

    ctx.fillText(secondsAgo === 0 ? 'now' : `-${secondsAgo}s`, x, height - padding.bottom + 7);
  }
};

const drawThreshold = (ctx, mapY, padding, width) => {
  const y = mapY(2);

  ctx.save();

  ctx.setLineDash([4, 5]);

  ctx.beginPath();

  ctx.moveTo(padding.left, y);

  ctx.lineTo(width - padding.right, y);

  ctx.strokeStyle = 'rgba(255, 209, 102, 0.55)';

  ctx.lineWidth = 1;

  ctx.stroke();

  ctx.restore();
};

const drawLine = (ctx, points, mapX, mapY, plotLeft, plotTop, plotWidth, plotHeight) => {
  if (points.length < 2) {
    return;
  }

  /*
   * Restrict everything drawn below to the actual
   * plotting region.
   *
   * The first point is intentionally allowed to exist
   * before the visible time window. Canvas then clips
   * the line exactly where it crosses the left edge.
   */
  ctx.save();

  ctx.beginPath();

  ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);

  ctx.clip();

  ctx.beginPath();

  ctx.moveTo(mapX(points[0].ts), mapY(points[0].vuf));

  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(mapX(points[i].ts), mapY(points[i].vuf));
  }

  ctx.lineTo(mapX(performance.now()), mapY(points[points.length-1].vuf));

  ctx.strokeStyle = '#58e7ff';

  ctx.lineWidth = 2.5;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.stroke();

  //
  // /*
  //  * Only draw the current-value dot when the last
  //  * point itself is inside the graph area.
  //  */
  // const last = points[points.length - 1];
  //
  // const x = mapX(last.ts);
  // const y = mapY(last.vuf);
  //
  // if (x >= plotLeft && x <= plotLeft + plotWidth) {
  //   ctx.beginPath();
  //
  //   ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  //
  //   ctx.fillStyle = '#58e7ff';
  //
  //   ctx.fill();
  // }

  ctx.restore();
};

const drawGraph = () => {
  const ctx = graphState.ctx;

  if (!ctx) {
    return;
  }

  const width = graphState.width;
  const height = GRAPH_HEIGHT;

  const now = performance.now();

  const visibilityStart = now - SECONDS_VISIBLE * 1000;

  /*
   * We only need one point before the visible area.
   * Everything older can safely be removed.
   */
  const lastPointBeforeVisible = graphState.data.findLastIndex(point => point.ts < visibilityStart);

  if (lastPointBeforeVisible > 0) {
    graphState.data.splice(0, lastPointBeforeVisible);
  }

  ctx.clearRect(0, 0, width, height);

  const padding = {
    top: 10,
    right: 10,
    bottom: 25,
    left: 42,
  };

  const plotLeft = padding.left;

  const plotTop = padding.top;

  const plotWidth = width - padding.left - padding.right;

  const plotHeight = height - padding.top - padding.bottom;

  const mapX = ts => {
    return plotLeft + ((ts - visibilityStart) / (SECONDS_VISIBLE * 1000)) * plotWidth;
  };

  const mapY = value => {
    /*
     * Do not clamp the value here.
     *
     * Allow the line to mathematically continue outside
     * the 0–2.5% range. The canvas clipping rectangle
     * then cuts it exactly at the plot boundary.
     *
     * This produces a smoother transition when VUF
     * enters or leaves the visible y range.
     */
    return plotTop + (1 - (value - MIN_VUF) / (MAX_VUF - MIN_VUF)) * plotHeight;
  };

  drawGrid(ctx, mapX, mapY, padding, width, height, now);

  drawThreshold(ctx, mapY, padding, width);

  /*
   * graphState.data now contains:
   *
   *   - at most one point before visibilityStart
   *   - all currently visible points
   *
   * Passing that previous point into drawLine() lets
   * canvas clipping calculate a visually continuous
   * entry at the left edge.
   */
  drawLine(ctx, graphState.data, mapX, mapY, plotLeft, plotTop, plotWidth, plotHeight);

  graphState.animationFrame = requestAnimationFrame(drawGraph);
};

watch(
  () => props.vuf,
  value => {
    addPoint(value);
  },
  {
    immediate: true,
  }
);

onMounted(() => {
  resizeCanvas();

  graphState.resizeObserver = new ResizeObserver(resizeCanvas);

  if (graphContainer.value) {
    graphState.resizeObserver.observe(graphContainer.value);
  }

  graphState.animationFrame = requestAnimationFrame(drawGraph);
});

onUnmounted(() => {
  if (graphState.animationFrame) {
    cancelAnimationFrame(graphState.animationFrame);
  }

  graphState.resizeObserver?.disconnect();
});
</script>

<style scoped>
.vuf-card {
  --panel: #0b1a27;
  --line: #163448;
  --text: #eaf6ff;
  --muted: #83a7bd;
  --green: #42e38c;
  --yellow: #ffd166;
  --red: #ff5c6c;

  padding: 18px;

  color: var(--text);

  border: 1px solid var(--line);
  border-radius: 20px;

  background: linear-gradient(180deg, rgba(12, 30, 44, 0.94), rgba(6, 18, 28, 0.94));

  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.34);
}

.eyebrow {
  font-size: 11px;

  color: #6f9ab1;

  letter-spacing: 0.14em;

  text-transform: uppercase;
}

.big-status {
  display: flex;

  align-items: flex-end;
  justify-content: space-between;

  gap: 16px;

  margin-top: 6px;
}

.value {
  font-size: 40px;
  font-weight: 900;
  line-height: 1;
}

.state {
  font-weight: 800;

  letter-spacing: 0.04em;
}

.good {
  color: var(--green);
}

.warn {
  color: var(--yellow);
}

.unknown {
  color: #789aac;
}

.bad {
  color: var(--red);
}

.gauge {
  height: 12px;

  margin: 14px 0 8px;

  overflow: hidden;

  border: 1px solid #17384a;

  border-radius: 999px;

  background: #0a1923;
}

.gauge-fill {
  height: 100%;

  background: linear-gradient(90deg, var(--green), var(--yellow), var(--red));

  transition: width 0.6s ease;
}

.reference {
  margin-top: 4px;

  color: var(--muted);

  font-size: 12px;
  line-height: 1.45;
}

.history {
  margin-top: 18px;
  padding-top: 14px;

  border-top: 1px solid rgba(29, 59, 80, 0.72);
}

.history-header {
  display: flex;

  align-items: center;
  justify-content: space-between;

  gap: 12px;

  margin-bottom: 4px;

  color: #96b7c9;

  font-size: 11px;
  font-weight: 700;

  letter-spacing: 0.04em;

  text-transform: uppercase;
}

.history-range {
  color: #6f9ab1;

  font-weight: 600;
}

.graph-container {
  width: 100%;

  min-width: 0;
}

.graph {
  display: block;

  width: 100%;
  height: 150px;
}
.vuf-breakdown {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin-top: 10px;
  color: #83a7bd;
  font-size: 10px;
}

.vuf-breakdown span {
  padding: 6px 8px;
  border: 1px solid rgba(88, 231, 255, 0.15);
  border-radius: 8px;
  background: rgba(3, 15, 24, 0.4);
}

</style>
