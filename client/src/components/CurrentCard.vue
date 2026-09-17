<template>
  <section class="current-card">
    <div class="card-header">
      <div>
        <div class="eyebrow">SHELLY · MEASURED + BUILDING TWIN · MODELED</div>
        <h2>Phase Currents</h2>
      </div>

      <span class="badge">
        {{ yRange.min }}–{{ yRange.max }} A
      </span>
    </div>

    <div class="measured-strip">
      <div class="measured-copy">
        <strong>SHELLY · MEASURED</strong>
        <small>physical prototype current / 原型实测电流</small>
      </div>
      <div
        v-for="phase in measuredPhases"
        :key="`measured-${phase.key}`"
        class="measured-phase"
      >
        <span>{{ phase.label }}</span>
        <strong>{{ formatMeasuredCurrent(phase.current) }} A</strong>
      </div>
    </div>

    <div class="model-heading">
      <span>{{ sourceLabel }}</span>
      <strong>BUILDING TWIN · MODELED · 0–100 A</strong>
    </div>

    <div class="chart">
      <div class="plot-area">
        <!-- Horizontal grid -->
        <div
          v-for="tick in ticks"
          :key="tick.value"
          class="grid-line"
          :style="{ bottom: `${tick.position}%` }"
        >
          <span class="tick-label">
            {{ formatTick(tick.value) }} A
          </span>

          <div class="line" />
        </div>

        <!-- Bars -->
        <div class="bars">
          <div
            v-for="phase in phases"
            :key="phase.key"
            class="bar-column"
          >
            <div class="bar-area">
              <div
                class="bar"
                :style="{
                  height: `${phase.height}%`,
                  backgroundColor: phase.color,
                }"
              >
                <span class="bar-value">
                  {{ formatCurrent(phase.current) }} A
                </span>
              </div>
            </div>

            <div class="phase-label">
              <span
                class="phase-dot"
                :style="{ backgroundColor: phase.color }"
              />

              <span>{{ phase.label }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  sourceLabel: {
    type: String,
    default: 'SCALED FROM MEASURED · Digital Twin',
  },

  /*
   * Same phase-key convention as SimpleDashboard:
   *
   * {
   *   a: 82,
   *   b: 22,
   *   c: 43
   * }
   */
  measuredCurrents: {
    type: Object,
    default: () => ({ a: null, b: null, c: null }),
  },

  currents: {
    type: Object,
    required: true,
  },

  /*
   * Visible y-axis range:
   *
   * {
   *   min: 0,
   *   max: 100
   * }
   */
  yRange: {
    type: Object,
    default: () => ({
      min: 0,
      max: 100,
    }),
  },
})

const phaseDefinitions = [
  {
    key: 'a',
    label: 'I1',
    color: '#58e7ff',
  },
  {
    key: 'b',
    label: 'I2',
    color: '#a98bff',
  },
  {
    key: 'c',
    label: 'I3',
    color: '#42e38c',
  },
]

const safeMin = computed(() => {
  const value = Number(props.yRange?.min)

  return Number.isFinite(value)
    ? value
    : 0
})

const safeMax = computed(() => {
  const value = Number(props.yRange?.max)

  if (!Number.isFinite(value)) {
    return 100
  }

  /*
   * Prevent a zero-width / inverted range.
   */
  return value > safeMin.value
    ? value
    : safeMin.value + 1
})

const measuredPhases = computed(() =>
  phaseDefinitions.map(definition => {
    const value = props.measuredCurrents?.[definition.key]
    const numeric = value === null || value === undefined || value === '' ? null : Number(value)
    return {
      ...definition,
      current: numeric !== null && Number.isFinite(numeric) ? numeric : null,
    }
  })
)

const phases = computed(() => {
  return phaseDefinitions.map(
    definition => {
      const rawValue = props.currents?.[definition.key]
      const raw =
        rawValue === null || rawValue === undefined || rawValue === ''
          ? null
          : Number(rawValue)

      const current =
        raw !== null && Number.isFinite(raw)
          ? raw
          : null

      /*
       * Clamp only the visual representation.
       *
       * Example with range 0–100:
       *
       * current = 120 A
       * displayed value = 120 A
       * bar height = 100%
       */
      const clamped =
        current === null
          ? safeMin.value
          : Math.max(
              safeMin.value,
              Math.min(safeMax.value, current),
            )

      const height =
        (
          (
            clamped -
            safeMin.value
          ) /
          (
            safeMax.value -
            safeMin.value
          )
        ) * 100

      return {
        ...definition,
        current,
        clamped,
        height,
      }
    },
  )
})

/*
 * Five horizontal levels:
 *
 * max
 * 75%
 * 50%
 * 25%
 * min
 */
const ticks = computed(() => {
  const count = 5

  return Array.from(
    { length: count },
    (_, index) => {
      const fraction =
        index / (count - 1)

      return {
        value:
          safeMin.value +
          fraction *
            (
              safeMax.value -
              safeMin.value
            ),

        position:
          fraction * 100,
      }
    },
  )
})

const formatMeasuredCurrent = value =>
  Number.isFinite(value) ? value.toFixed(2) : '—'

const formatCurrent = value => {
  if (!Number.isFinite(value)) {
    return '—'
  }

  if (
    Math.abs(
      value -
      Math.round(value),
    ) < 0.05
  ) {
    return Math.round(value)
  }

  return value.toFixed(1)
}

const formatTick = value => {
  if (
    Math.abs(
      value -
      Math.round(value),
    ) < 0.05
  ) {
    return Math.round(value)
  }

  return value.toFixed(1)
}
</script>

<style scoped>
.measured-strip {
  display: grid;
  grid-template-columns: minmax(150px, 1.4fr) repeat(3, minmax(60px, .7fr));
  gap: 8px;
  align-items: stretch;
  margin-bottom: 14px;
  padding: 10px;
  border: 1px solid #245264;
  border-radius: 12px;
  background: rgba(8, 27, 37, .72);
}
.measured-copy { display: grid; align-content: center; gap: 2px; }
.measured-copy strong { color: #8ff1c3; font-size: 10px; letter-spacing: .05em; }
.measured-copy small { color: #6f91a3; font-size: 8px; }
.measured-phase {
  display: grid;
  gap: 3px;
  align-content: center;
  justify-items: end;
  padding: 7px 8px;
  border: 1px solid #1d4355;
  border-radius: 9px;
  background: #071721;
}
.measured-phase span { color: #6f91a3; font-size: 8px; }
.measured-phase strong { color: #eaf6ff; font-size: 12px; }
.model-heading {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 8px;
  color: #6f91a3;
  font-size: 8px;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.model-heading strong { color: #83a7bd; font-size: 8px; }

.current-card {
  --text: #eaf6ff;
  --muted: #83a7bd;
  --line: #163448;

  padding: 18px;

  color: var(--text);

  border: 1px solid var(--line);
  border-radius: 20px;

  background:
    linear-gradient(
      180deg,
      rgba(12, 30, 44, 0.94),
      rgba(6, 18, 28, 0.94)
    );

  box-shadow:
    0 20px 60px
    rgba(0, 0, 0, 0.34);
}

.card-header {
  display: flex;

  align-items: flex-start;
  justify-content: space-between;

  gap: 16px;

  margin-bottom: 18px;
}

.eyebrow {
  margin-bottom: 5px;

  color: #6f9ab1;

  font-size: 11px;

  letter-spacing: 0.14em;

  text-transform: uppercase;
}

h2 {
  margin: 0;

  font-size: 16px;
  font-weight: 700;
}

.badge {
  flex-shrink: 0;

  padding: 6px 9px;

  color: #a7c8d8;

  border: 1px solid #284b60;
  border-radius: 999px;

  font-size: 11px;
}

/* -----------------------------
   Chart
----------------------------- */

.chart {
  width: 100%;

  padding-top: 8px;
}

.plot-area {
  position: relative;

  height: 260px;

  margin-left: 42px;
}

/* -----------------------------
   Grid
----------------------------- */

.grid-line {
  position: absolute;

  right: 0;
  left: 0;

  display: flex;
  align-items: center;

  pointer-events: none;

  transform: translateY(50%);
}

.tick-label {
  position: absolute;

  right: calc(100% + 8px);

  width: 42px;

  color: #668da2;

  font-size: 10px;
  line-height: 1;

  text-align: right;

  white-space: nowrap;
}

.line {
  width: 100%;
  height: 1px;

  background:
    rgba(
      255,
      255,
      255,
      0.08
    );
}

/* -----------------------------
   Bars
----------------------------- */

.bars {
  position: absolute;

  inset: 0;

  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 24px;
}

.bar-column {
  display: flex;

  min-width: 0;

  flex-direction: column;

  align-items: center;
}

.bar-area {
  position: relative;

  width: 100%;

  flex: 1;
}

.bar {
  position: absolute;

  right: 16%;
  bottom: 0;
  left: 16%;

  min-height: 2px;

  border-radius:
    9px 9px 3px 3px;

  box-shadow:
    0 0 18px
    rgba(
      88,
      231,
      255,
      0.08
    );

  transition:
    height 0.45s ease;
}

.bar-value {
  position: absolute;

  bottom: calc(100% + 7px);
  left: 50%;

  color: #dff5ff;

  font-size: 11px;
  font-weight: 800;

  white-space: nowrap;

  transform:
    translateX(-50%);
}

/* -----------------------------
   Phase labels
----------------------------- */

.phase-label {
  display: flex;

  align-items: center;
  justify-content: center;

  gap: 6px;

  height: 30px;

  color: #9fbccc;

  font-size: 11px;
  font-weight: 700;
}

.phase-dot {
  width: 8px;
  height: 8px;

  border-radius: 50%;
}
@media(max-width:700px){.measured-strip{grid-template-columns:1fr 1fr}.measured-copy{grid-column:1/-1}.model-heading{flex-direction:column}}
</style>
