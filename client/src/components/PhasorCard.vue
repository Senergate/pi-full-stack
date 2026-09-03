<template>
  <section class="phasor-card">
    <div class="card-header">
      <div>
        <div class="eyebrow">Voltage Phasor Estimate</div>
      </div>

      <span class="badge">225–240 V</span>
    </div>

    <div class="phasor-container">
      <svg
        class="phasor"
        viewBox="0 0 400 400"
        role="img"
        aria-label="Three-phase voltage phasor diagram"
      >
        <!-- Radial voltage scale -->
        <circle
          v-for="ring in voltageRings"
          :key="ring.value"
          :cx="CENTER"
          :cy="CENTER"
          :r="ring.radius"
          class="voltage-ring"
        />

        <!-- Ideal phase-angle grid -->
        <g class="ideal-grid">
          <line
            v-for="phase in idealPhases"
            :key="phase.label"
            :x1="CENTER"
            :y1="CENTER"
            :x2="phase.x"
            :y2="phase.y"
            class="ideal-line"
          />

          <text
            v-for="phase in idealPhases"
            :key="`${phase.label}-angle`"
            :x="phase.labelX"
            :y="phase.labelY"
            class="angle-label"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ phase.label }}
          </text>
        </g>

        <!-- Voltage scale labels -->
        <g class="scale-labels">
          <g
            v-for="ring in voltageRings"
            :key="`${ring.value}-label`"
          >
            <rect
              :x="CENTER + 7"
              :y="CENTER - ring.radius - 8"
              width="43"
              height="16"
              rx="5"
              class="scale-label-background"
            />

            <text
              :x="CENTER + 28"
              :y="CENTER - ring.radius"
              class="scale-label"
              text-anchor="middle"
              dominant-baseline="middle"
            >
              {{ ring.value }} V
            </text>
          </g>
        </g>

        <!-- Actual Digital Twin phasors -->
        <g
          v-for="phase in phasors"
          :key="phase.key"
          class="phase"
        >
          <line
            :x1="CENTER"
            :y1="CENTER"
            :x2="phase.x"
            :y2="phase.y"
            :stroke="phase.color"
            class="phasor-line"
          />

          <circle
            :cx="phase.x"
            :cy="phase.y"
            r="6"
            :fill="phase.color"
            class="phasor-point"
          />

          <g
            :transform="`translate(${phase.valueLabelX}, ${phase.valueLabelY})`"
          >
            <rect
              x="-31"
              y="-12"
              width="62"
              height="24"
              rx="7"
              class="value-label-background"
            />

            <text
              x="0"
              y="1"
              :fill="phase.color"
              class="value-label"
              text-anchor="middle"
              dominant-baseline="middle"
            >
              {{ phase.voltage.toFixed(1) }} V
            </text>
          </g>
        </g>

        <!-- Common origin -->
        <circle
          :cx="CENTER"
          :cy="CENTER"
          r="5"
          class="origin"
        />
      </svg>
    </div>

    <div class="legend">
      <div
        v-for="phase in phasors"
        :key="`${phase.key}-legend`"
        class="legend-item"
      >
        <span
          class="phase-dot"
          :style="{ backgroundColor: phase.color }"
        />

        <span class="phase-name">
          {{ phase.label }}
        </span>

        <strong>
          {{ phase.voltage.toFixed(1) }} V
        </strong>

        <span class="angle-value">
          {{ formatAngle(phase.angle) }}
        </span>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /*
   * Same shape as measuredVoltages in SimpleDashboard:
   *
   * {
   *   a: 230.2,
   *   b: 229.8,
   *   c: 231.1
   * }
   */
  voltages: {
    type: Object,
    required: true,
  },

  /*
   * Same shape as _.vuf.sourceAngle:
   *
   * {
   *   a: 0,
   *   b: -120.2,
   *   c: 119.8
   * }
   */
  angles: {
    type: Object,
    required: true,
  },
})

const CENTER = 200

/*
 * The visual radial scale represents only 225–235 V.
 *
 * The inner radius corresponds to 225 V.
 * The outer radius corresponds to 235 V.
 */
const INNER_RADIUS = 50
const OUTER_RADIUS = 150

const MIN_VOLTAGE = 225
const MAX_VOLTAGE = 240

const phaseDefinitions = [
  {
    key: 'a',
    label: 'L1',
    color: '#58e7ff',
  },
  {
    key: 'b',
    label: 'L2',
    color: '#a98bff',
  },
  {
    key: 'c',
    label: 'L3',
    color: '#42e38c',
  },
]

const voltageRings = computed(() => {
  return [225, 230, 235, 240].map(value => ({
    value,
    radius: voltageToRadius(value),
  }))
})

/*
 * Convert our electrical angle convention to SVG coordinates.
 *
 * Requested orientation:
 *
 *             0°
 *              ↑
 *              |
 *              |
 *      -120°   •   +120°
 *          ↙       ↘
 *
 * SVG's positive Y direction points downward, so:
 *
 * x = cx + r * sin(angle)
 * y = cy - r * cos(angle)
 */
const pointFor = (radius, angleDegrees) => {
  const angle =
    angleDegrees * Math.PI / 180

  return {
    x:
      CENTER +
      radius * Math.sin(angle),

    y:
      CENTER -
      radius * Math.cos(angle),
  }
}

function voltageToRadius(voltage) {
  const numericVoltage =
    Number(voltage)

  const safeVoltage =
    Number.isFinite(numericVoltage)
      ? numericVoltage
      : 230

  /*
   * Clamp visually to the 225–235 V plotting range.
   */
  const clamped =
    Math.max(
      MIN_VOLTAGE,
      Math.min(
        MAX_VOLTAGE,
        safeVoltage,
      ),
    )

  const normalized =
    (
      clamped -
      MIN_VOLTAGE
    ) /
    (
      MAX_VOLTAGE -
      MIN_VOLTAGE
    )

  return (
    INNER_RADIUS +
    normalized *
      (
        OUTER_RADIUS -
        INNER_RADIUS
      )
  )
}

/*
 * Perfect phase-angle reference grid.
 *
 * This does NOT depend on the simulated angles.
 * It always shows the ideal three-phase system.
 */
const idealPhases = computed(() => {
  return [
    {
      label: '0°',
      angle: 0,
    },
    {
      label: '+120°',
      angle: 120,
    },
    {
      label: '-120°',
      angle: -120,
    },
  ].map(phase => {
    const endpoint =
      pointFor(
        OUTER_RADIUS + 5,
        phase.angle,
      )

    const labelPoint =
      pointFor(
        OUTER_RADIUS + 27,
        phase.angle,
      )

    return {
      ...phase,

      x: endpoint.x,
      y: endpoint.y,

      labelX: labelPoint.x,
      labelY: labelPoint.y,
    }
  })
})

const phasors = computed(() => {
  return phaseDefinitions.map(
    definition => {
      const voltageValue =
        Number(
          props.voltages?.[
            definition.key
          ],
        )

      const angleValue =
        Number(
          props.angles?.[
            definition.key
          ],
        )

      const voltage =
        Number.isFinite(voltageValue)
          ? voltageValue
          : 230

      const angle =
        Number.isFinite(angleValue)
          ? angleValue
          : 0

      const radius =
        voltageToRadius(voltage)

      const endpoint =
        pointFor(
          radius,
          angle,
        )

      /*
       * Put the value label slightly beyond
       * the endpoint of the vector.
       */
      const valueLabel =
        pointFor(
          voltageToRadius(240)+30,
          angle,
        )

      return {
        ...definition,

        voltage,
        angle,
        radius,

        x: endpoint.x,
        y: endpoint.y,

        valueLabelX:
          valueLabel.x,

        valueLabelY:
          valueLabel.y,
      }
    },
  )
})

const formatAngle = angle => {
  const value =
    Number(angle)

  if (!Number.isFinite(value)) {
    return '—'
  }

  const prefix =
    value > 0
      ? '+'
      : ''

  return `${prefix}${value.toFixed(1)}°`
}
</script>

<style scoped>
.phasor-card {
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

.phasor-container {
  width: 100%;

  margin-top: 6px;
}

.phasor {
  display: block;

  width: 100%;
  height: auto;

  max-height: 400px;

  overflow: visible;
}

/* -----------------------------
   Radial voltage grid
----------------------------- */

.voltage-ring {
  fill: none;

  stroke: #17364a;
  stroke-width: 1.3;
}

.voltage-ring:nth-child(2) {
  stroke: #21465c;
}

.ideal-line {
  stroke: #315469;
  stroke-width: 1;

  stroke-dasharray: 5 6;
}

.angle-label {
  fill: #7398ac;

  font-size: 11px;
  font-weight: 600;
}

.scale-label-background {
  fill: #091923;

  opacity: 0.92;
}

.scale-label {
  fill: #668da2;

  font-size: 15px;
}

/* -----------------------------
   Actual phasors
----------------------------- */

.phasor-line {
  stroke-width: 3.5;

  stroke-linecap: round;

  filter:
    drop-shadow(
      0 0 5px
      rgba(88, 231, 255, 0.12)
    );
}

.phasor-point {
  stroke: #081721;
  stroke-width: 2;
}

.origin {
  fill: #dff7ff;

  stroke: #17384b;
  stroke-width: 3;
}

.value-label-background {
  fill: #081721;

  stroke: #17384b;
  stroke-width: 1;
}

.value-label {
  font-size: 10px;
  font-weight: 800;
}

/* -----------------------------
   Legend
----------------------------- */

.legend {
  display: grid;

  grid-template-columns:
    repeat(3, 1fr);

  gap: 8px;

  margin-top: 2px;
}

.legend-item {
  display: grid;

  grid-template-columns:
    auto auto 1fr;

  align-items: center;

  gap: 6px;

  padding: 9px 10px;

  color: #9fbccc;

  border: 1px solid #17384b;
  border-radius: 10px;

  background: #081721;

  font-size: 11px;
}

.phase-dot {
  width: 8px;
  height: 8px;

  border-radius: 50%;
}

.phase-name {
  font-weight: 700;

  color: #dff5ff;
}

.legend-item strong {
  text-align: right;

  color: #e8f6ff;

  font-size: 11px;
}

.angle-value {
  grid-column: 2 / 4;

  color: #6f91a3;

  font-size: 10px;
}

/* -----------------------------
   Responsive
----------------------------- */

@media (max-width: 600px) {
  .legend {
    grid-template-columns: 1fr;
  }

  .angle-value {
    grid-column: auto;
    justify-self: end;
  }
}
</style>
