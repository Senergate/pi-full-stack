<script setup>
import { computed } from 'vue';
import Card from './Card.vue';
import PhasorCalculator from './PhasorCalculator.js';

const props = defineProps({
  root: {
    type: Object,
    required: true,
  },
});

const PHASES = [
  { label: 'L1', channel: 'a', angle: 0 },
  { label: 'L2', channel: 'b', angle: -120 },
  { label: 'L3', channel: 'c', angle: -240 },
];

const SIMULATION_LIMITS = {
  projectionFactor: 20,
  imbalanceLimitKva: 4.6,
  phaseSeparationDegrees: 120,
  phaseSeparationToleranceDegrees: 1,
  minimumPositiveSequence: 1e-9,
  maximumCufOkPercent: 5,
  maximumCufWarningPercent: 10,
};

const numberOrNull = value => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : null;
};

const formatValue = (value, unit = '', decimals = 2) => {
  const numericValue = numberOrNull(value);

  if (numericValue === null) {
    return '-';
  }

  return `${numericValue.toFixed(decimals)}` + `${unit ? ` ${unit}` : ''}`;
};

const formatPercent = (value, decimals = 2) => {
  const numericValue = numberOrNull(value);

  if (numericValue === null) {
    return '-';
  }

  return `${numericValue.toFixed(decimals)} %`;
};

const getSimulatedRoot = () => props.root.simulated ?? props.root.simulation ?? props.root.digital_twin ?? {};

const getSimulatedData = () => getSimulatedRoot().data ?? {};

const getSimulatedMap = () => getSimulatedRoot().map ?? {};

const getSimulatedPhase = phase => {
  const data = getSimulatedData();

  return data.channels?.[phase.channel] ?? data.phases?.[phase.channel] ?? data.phases?.[phase.label] ?? {};
};

const getMeasuredEnergyPhase = phase => {
  const data = props.root.energy_meter?.data ?? {};

  const prefix = phase.channel;

  return {
    voltage: numberOrNull(data[`${prefix}_voltage`]),
    current: numberOrNull(data[`${prefix}_current`]),
    actPower: numberOrNull(data[`${prefix}_act_power`]),
    apparentPower: numberOrNull(data[`${prefix}_aprt_power`]),
  };
};

// Shelly RMS currents are measured; only the phase angles are assigned by the Digital Twin.
const measuredCurrents = computed(() => ({
  a: getMeasuredEnergyPhase(PHASES[0]).current,
  b: getMeasuredEnergyPhase(PHASES[1]).current,
  c: getMeasuredEnergyPhase(PHASES[2]).current,
}));

const simulatedPhaseAngles = Object.freeze({
  a: PHASES[0].angle,
  b: PHASES[1].angle,
  c: PHASES[2].angle,
});

const phasorAnalysis = computed(() => PhasorCalculator.analyze(measuredCurrents.value, simulatedPhaseAngles));

const calculatedSystemValues = computed(() => ({
  cuf_percent: phasorAnalysis.value.cufPercent,
  positive_sequence_current_a: phasorAnalysis.value.positiveSequenceMagnitude,
  negative_sequence_current_a: phasorAnalysis.value.negativeSequenceMagnitude,
  zero_sequence_current_a: phasorAnalysis.value.zeroSequenceMagnitude,
  neutral_current_phasor_a: phasorAnalysis.value.neutralCurrentMagnitude,
}));

const getSimulatedValue = (phase, key) => {
  const phaseData = getSimulatedPhase(phase);

  if (phaseData[key] !== undefined) {
    return phaseData[key];
  }

  const data = getSimulatedData();

  const candidates = [`${phase.channel}_${key}`, `${phase.label}_${key}`, `${phase.label.toLowerCase()}_${key}`];

  for (const candidate of candidates) {
    if (data[candidate] !== undefined) {
      return data[candidate];
    }
  }

  return null;
};

const getSystemSimulatedValue = key => {
  const data = getSimulatedData();

  return data[key] ?? data.system?.[key] ?? null;
};

const normalizeMetric = (key, definition) => {
  if (Array.isArray(definition)) {
    return {
      key,
      label: definition[0] ?? key,
      unit: definition[1] ?? '',
    };
  }

  if (definition && typeof definition === 'object') {
    return {
      key,
      label: definition.label ?? definition.name ?? key,
      unit: definition.unit ?? '',
    };
  }

  return {
    key,
    label: key,
    unit: '',
  };
};

const knownPhaseMetricKeys = [
  'current_rms_a',
  'fundamental_rms_a',
  'apparent_power_va',
  'projected_apparent_power_va',
  'phase_angle_deg',
  'thd_i_percent',
  'h3_percent',
  'h5_percent',
  'h7_percent',
];

const knownSystemMetricKeys = [
  'neutral_current_rms_a',
  'neutral_current_phasor_a',
  'positive_sequence_current_a',
  'negative_sequence_current_a',
  'zero_sequence_current_a',
  'cuf_percent',
  'vuf_percent',
  'imbalance_va',
  'imbalance_kva',
  'projected_imbalance_va',
  'projected_imbalance_kva',
  'projection_factor',
];

const prettifyKey = key => key.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());

const inferUnit = key => {
  const lower = key.toLowerCase();

  if (lower.endsWith('_percent')) {
    return '%';
  }

  if (lower.endsWith('_kva')) {
    return 'kVA';
  }

  if (lower.endsWith('_va')) {
    return 'VA';
  }

  if (lower.endsWith('_a')) {
    return 'A';
  }

  if (lower.endsWith('_deg')) {
    return '°';
  }

  return '';
};

const phaseMetricRows = computed(() => {
  const map = getSimulatedMap();

  const phaseMap = map.phases ?? map.channels ?? {};

  if (Object.keys(phaseMap).length > 0) {
    return Object.entries(phaseMap).map(([key, definition]) => {
      const metric = normalizeMetric(key, definition);

      return {
        key,
        label: metric.label,
        unit: metric.unit,
        values: Object.fromEntries(PHASES.map(phase => [phase.label, getSimulatedValue(phase, key)])),
      };
    });
  }

  const discovered = new Set();

  for (const phase of PHASES) {
    const phaseData = getSimulatedPhase(phase);

    for (const key of Object.keys(phaseData)) {
      if (typeof phaseData[key] !== 'object') {
        discovered.add(key);
      }
    }
  }

  for (const key of knownPhaseMetricKeys) {
    for (const phase of PHASES) {
      const value = getSimulatedValue(phase, key);

      if (value !== null && value !== undefined) {
        discovered.add(key);
      }
    }
  }

  return Array.from(discovered).map(key => ({
    key,
    label: prettifyKey(key),
    unit: inferUnit(key),
    values: Object.fromEntries(PHASES.map(phase => [phase.label, getSimulatedValue(phase, key)])),
  }));
});

const systemMetricRows = computed(() => {
  const map = getSimulatedMap();
  const systemMap = map.system ?? {};
  const rowsByKey = new Map();

  const addRow = (key, label, unit, value) => {
    if (value === null || value === undefined) return;

    rowsByKey.set(key, {
      key,
      label,
      unit,
      value,
    });
  };

  if (Object.keys(systemMap).length > 0) {
    for (const [key, definition] of Object.entries(systemMap)) {
      const metric = normalizeMetric(key, definition);

      addRow(key, metric.label, metric.unit, getSystemSimulatedValue(key));
    }
  } else {
    for (const key of knownSystemMetricKeys) {
      addRow(key, prettifyKey(key), inferUnit(key), getSystemSimulatedValue(key));
    }
  }

  // Locally calculated phasor quantities take precedence over supplied values.
  for (const [key, value] of Object.entries(calculatedSystemValues.value)) {
    addRow(key, prettifyKey(key), inferUnit(key), value);
  }

  return Array.from(rowsByKey.values());
});

const projectionFactor = computed(
  () => numberOrNull(getSystemSimulatedValue('projection_factor')) ?? SIMULATION_LIMITS.projectionFactor
);

const measuredApparentPower = computed(() =>
  Object.fromEntries(PHASES.map(phase => [phase.label, getMeasuredEnergyPhase(phase).apparentPower]))
);

const projectedApparentPower = computed(() =>
  Object.fromEntries(
    PHASES.map(phase => {
      const provided = numberOrNull(getSimulatedValue(phase, 'projected_apparent_power_va'));

      const measured = measuredApparentPower.value[phase.label];

      return [phase.label, provided ?? (measured === null ? null : measured * projectionFactor.value)];
    })
  )
);

const measuredImbalanceVa = computed(() => {
  const values = Object.values(measuredApparentPower.value).filter(value => Number.isFinite(value));

  if (values.length !== PHASES.length) {
    return null;
  }

  return Math.max(...values) - Math.min(...values);
});

const projectedImbalanceVa = computed(() => {
  const provided = numberOrNull(getSystemSimulatedValue('projected_imbalance_va'));

  if (provided !== null) {
    return provided;
  }

  const providedKva = numberOrNull(getSystemSimulatedValue('projected_imbalance_kva'));

  if (providedKva !== null) {
    return providedKva * 1000;
  }

  if (measuredImbalanceVa.value === null) {
    return null;
  }

  return measuredImbalanceVa.value * projectionFactor.value;
});

const simulationSummaryRows = computed(() => [
  {
    label: 'Phase separation',
    value: '120°',
    details: 'Assigned in software using one-third-period time shifts.',
  },
  {
    label: 'Measured phase currents',
    value: PHASES.map(phase => formatValue(measuredCurrents.value[phase.channel], 'A')).join(' / '),
    details: 'Shelly RMS currents used as measured phasor magnitudes.',
  },
  {
    label: 'Calculated CUF',
    value: formatPercent(phasorAnalysis.value.cufPercent),
    details: phasorAnalysis.value.error ?? 'Calculated locally from measured RMS currents and assigned phase angles.',
  },
  {
    label: 'Phasor neutral current',
    value: formatValue(phasorAnalysis.value.neutralCurrentMagnitude, 'A'),
    details: 'Vector sum of the three simulated RMS current phasors; waveform harmonics are not included.',
  },
  {
    label: 'Projection factor',
    value: `×${projectionFactor.value}`,
    details: 'Fixed building-scale multiplier applied to measured branch loading.',
  },
  {
    label: 'Measured imbalance',
    value: formatValue(measuredImbalanceVa.value, 'VA'),
    details: 'Maximum measured branch apparent power minus minimum.',
  },
  {
    label: 'Projected imbalance',
    value: formatValue(projectedImbalanceVa.value === null ? null : projectedImbalanceVa.value / 1000, 'kVA'),
    details: 'Measured imbalance multiplied by the fixed projection factor.',
  },
]);

const validationResult = ({ status, summary, details = '' }) => ({
  status,
  summary,
  details,
});

const unavailableResult = (summary = 'NO DATA', details = '') =>
  validationResult({
    status: 'unknown',
    summary,
    details,
  });

const createSystemValidation = (id, group, label, formula, evaluator, note = '') => ({
  id,
  group,
  label,
  formula,
  note,
  ...evaluator(),
});

const createPerPhaseValidation = (id, group, label, formula, evaluator, note = '') => ({
  id,
  group,
  label,
  formula,
  note,
  phases: Object.fromEntries(PHASES.map(phase => [phase.label, evaluator(phase)])),
});

const simulatedPhaseValidations = computed(() => {
  const checks = [];

  checks.push(
    createPerPhaseValidation(
      'phase-angle-assignment',
      'Three-phase construction',
      'Assigned phase angle',
      'L1 = 0°, L2 = −120°, L3 = −240°',
      phase => {
        const measured = numberOrNull(getSimulatedValue(phase, 'phase_angle_deg'));

        const expected = phase.angle;

        if (measured === null) {
          return validationResult({
            status: 'ok',
            summary: `${expected}°`,
            details: 'Using the configured software phase assignment',
          });
        }

        const wrappedDifference = Math.abs(((((measured - expected + 180) % 360) + 360) % 360) - 180);

        const status = wrappedDifference <= SIMULATION_LIMITS.phaseSeparationToleranceDegrees ? 'ok' : 'error';

        return validationResult({
          status,
          summary: formatValue(measured, '°'),
          details: `Expected ${expected}°; ` + `Δ ${wrappedDifference.toFixed(2)}°`,
        });
      },
      'The angle is simulated and must never be presented as a measured phase angle.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'projection-scaling',
      'Projection consistency',
      'Projected apparent power',
      'Sprojected = Smeasured × projection factor',
      phase => {
        const measured = measuredApparentPower.value[phase.label];

        const projected = projectedApparentPower.value[phase.label];

        if (measured === null || projected === null) {
          return unavailableResult();
        }

        const expected = measured * projectionFactor.value;

        const difference = Math.abs(projected - expected);

        const tolerance = Math.max(0.5, Math.abs(expected) * 0.005);

        return validationResult({
          status: difference <= tolerance ? 'ok' : 'error',
          summary: formatValue(projected, 'VA'),
          details:
            `${formatValue(measured, 'VA')} × ` + `${projectionFactor.value} = ` + `${formatValue(expected, 'VA')}`,
        });
      }
    )
  );

  return checks;
});

const simulatedSystemValidations = computed(() => {
  const checks = [];

  checks.push(
    createSystemValidation(
      'projection-factor',
      'Projection consistency',
      'Projection factor is fixed',
      'k = configured constant',
      () => {
        const factor = projectionFactor.value;

        const valid = Number.isFinite(factor) && factor > 0;

        return {
          status: valid ? 'ok' : 'error',
          summary: valid ? `×${factor}` : 'INVALID',
          details: valid
            ? 'A positive, explicit projection factor is configured'
            : 'Projection factor must be positive and finite',
        };
      },
      'The factor should represent a declared building model, not be tuned dynamically to cross a limit.'
    )
  );

  checks.push(
    createSystemValidation(
      'projected-imbalance',
      'Projected operating limits',
      'Projected branch imbalance',
      'max(Sprojected) − min(Sprojected)',
      () => {
        const imbalance = projectedImbalanceVa.value;

        if (imbalance === null) {
          return unavailableResult();
        }

        const imbalanceKva = imbalance / 1000;

        return {
          status: imbalanceKva <= SIMULATION_LIMITS.imbalanceLimitKva ? 'ok' : 'warning',
          summary: formatValue(imbalanceKva, 'kVA'),
          details: `Reference line: ` + `${SIMULATION_LIMITS.imbalanceLimitKva.toFixed(1)} kVA`,
        };
      },
      'This is a projected Digital Twin quantity, not a measured test-bench limit violation.'
    )
  );

  checks.push(
    createSystemValidation(
      'neutral-current',
      'Three-phase construction',
      'Neutral current is available',
      'iN(t) = iL1(t) + iL2(t) + iL3(t)',
      () => {
        const current = numberOrNull(phasorAnalysis.value.neutralCurrentMagnitude);

        if (current === null) {
          return unavailableResult();
        }

        return {
          status: current >= 0 ? 'ok' : 'error',
          summary: formatValue(current, 'A'),
          details: current >= 0 ? 'Neutral RMS current is finite and non-negative' : 'RMS current cannot be negative',
        };
      },
      'This value is the vector sum of Shelly RMS current phasors with software-assigned phase angles. Harmonic neutral current requires waveform processing.'
    )
  );

  checks.push(
    createSystemValidation(
      'cuf-valid',
      'Three-phase construction',
      'Current unbalance factor',
      'CUF = |I₂| / |I₁| × 100%',
      () => {
        const result = phasorAnalysis.value;

        const cuf = numberOrNull(result.cufPercent);

        if (cuf === null) {
          return unavailableResult('NO CUF', result.error ?? 'Measured phase currents are unavailable');
        }

        const status =
          cuf <= SIMULATION_LIMITS.maximumCufOkPercent
            ? 'ok'
            : cuf <= SIMULATION_LIMITS.maximumCufWarningPercent
              ? 'warning'
              : 'error';

        return {
          status,
          summary: formatPercent(cuf),
          details: `|I1|=${formatValue(result.positiveSequenceMagnitude, 'A')}; |I2|=${formatValue(
            result.negativeSequenceMagnitude,
            'A'
          )}`,
        };
      },
      'Computed locally by PhasorCalculator from Shelly RMS currents and manually assigned 0°, -120° and -240° phase angles.'
    )
  );

  checks.push(
    createSystemValidation(
      'vuf-provenance',
      'Projected model outputs',
      'Voltage unbalance factor provenance',
      'VUF = model(CUF, grid impedance, projection)',
      () => {
        const vuf = numberOrNull(getSystemSimulatedValue('vuf_percent'));

        if (vuf === null) {
          return unavailableResult('NOT PROVIDED');
        }

        return {
          status: vuf >= 0 ? 'ok' : 'error',
          summary: formatPercent(vuf),
          details: 'VUF is a projected model output and requires an explicit grid-impedance model',
        };
      },
      'Never label this as measured because the test bench has no voltage transformer for phase-resolved voltage harmonics.'
    )
  );

  checks.push(
    createSystemValidation(
      'finite-simulated-values',
      'Data quality',
      'Finite simulated outputs',
      'all available numeric simulation outputs are finite',
      () => {
        const invalid = [];

        const visit = (value, path) => {
          if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
              invalid.push(path);
            }

            return;
          }

          if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
              visit(child, path ? `${path}.${key}` : key);
            }
          }
        };

        visit(getSimulatedData(), '');

        return {
          status: invalid.length === 0 ? 'ok' : 'error',
          summary: invalid.length === 0 ? 'FINITE' : 'INVALID VALUE',
          details: invalid.length === 0 ? 'All available simulated outputs are finite' : invalid.join(', '),
        };
      }
    )
  );

  return checks;
});

const groupedPhaseValidations = computed(() => {
  const groups = new Map();

  for (const check of simulatedPhaseValidations.value) {
    if (!groups.has(check.group)) {
      groups.set(check.group, []);
    }

    groups.get(check.group).push(check);
  }

  return Array.from(groups, ([name, checks]) => ({
    name,
    checks,
  }));
});

const groupedSystemValidations = computed(() => {
  const groups = new Map();

  for (const check of simulatedSystemValidations.value) {
    if (!groups.has(check.group)) {
      groups.set(check.group, []);
    }

    groups.get(check.group).push(check);
  }

  return Array.from(groups, ([name, checks]) => ({
    name,
    checks,
  }));
});

const getCufStatus = cufPercent => {
  if (!Number.isFinite(cufPercent)) {
    return {
      status: 'unknown',
      label: 'Unavailable',
      color: 'grey',
    };
  }

  if (cufPercent < 10) {
    return {
      status: 'ok',
      label: 'OK',
      color: 'green',
    };
  }

  if (cufPercent < 20) {
    return {
      status: 'moderate',
      label: 'Moderate',
      color: 'orange',
    };
  }

  return {
    status: 'severe',
    label: 'Severe',
    color: 'red',
  };
};

const cufStatus = computed(() =>
  getCufStatus(phasorResult.value?.cufPercent)
);

</script>

<template>
  <Card>
    <q-card-section>
      <div class="title-row">
        <div>
          <div class="text-h6 text-spaced text-uppercase">Simulated</div>

          <div class="text-caption text-grey-5 q-mt-xs">
            Three-phase Digital Twin quantities driven by real measured branch amplitudes, waveforms and harmonics.
          </div>
        </div>

        <div class="provenance-label">SIMULATED</div>
      </div>
    </q-card-section>

    <q-separator dark />

    <q-card-section>
      <div class="section-heading">Digital Twin outputs</div>

      <div class="section-description">
        The 120° phase separation and building-scale projection exist in software. The source amplitudes and waveform
        characteristics remain driven by real measurements.
      </div>

      <q-expansion-item label="Simulation summary" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table summary-table">
            <thead>
              <tr>
                <th class="text-left">Quantity</th>

                <th class="text-left">Value</th>

                <th class="text-left">Meaning</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in simulationSummaryRows" :key="row.label">
                <td class="measurement-name">
                  {{ row.label }}
                </td>

                <td>
                  {{ row.value }}
                </td>

                <td class="description-cell">
                  {{ row.details }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>

      <q-expansion-item label="Simulated phase quantities" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table measurement-table">
            <thead>
              <tr>
                <th class="text-left">Quantity</th>

                <th class="text-left">L1</th>

                <th class="text-left">L2</th>

                <th class="text-left">L3</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in phaseMetricRows" :key="row.key">
                <td class="measurement-description-cell">
                  <div class="measurement-name">
                    {{ row.label }}
                  </div>

                  <code class="metric-key">
                    {{ row.key }}
                  </code>
                </td>

                <td v-for="phase in PHASES" :key="`${row.key}-${phase.label}`" class="measurement-value">
                  {{
                    typeof row.values[phase.label] === 'number'
                      ? formatValue(row.values[phase.label], row.unit)
                      : (row.values[phase.label] ?? '-')
                  }}
                </td>
              </tr>

              <tr v-if="phaseMetricRows.length === 0">
                <td colspan="4">No simulated phase data is currently available.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>

      <q-expansion-item label="System and projected quantities" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table system-table">
            <thead>
              <tr>
                <th class="text-left">Quantity</th>

                <th class="text-left">Value</th>

                <th class="text-left">Provenance</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in systemMetricRows" :key="row.key">
                <td class="measurement-description-cell">
                  <div class="measurement-name">
                    {{ row.label }}
                  </div>

                  <code class="metric-key">
                    {{ row.key }}
                  </code>
                </td>

                <td class="measurement-value">
                  {{ typeof row.value === 'number' ? formatValue(row.value, row.unit) : (row.value ?? '-') }}
                </td>

                <td class="description-cell">SIMULATED · driven by measured branch data</td>
              </tr>

              <tr v-if="systemMetricRows.length === 0">
                <td colspan="3">No system simulation outputs are currently available.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>
    </q-card-section>

    <q-separator dark />

    <q-card-section>
      <div class="section-heading">Simulation validations</div>

      <div class="section-description">
        Construction, projection and model consistency checks evaluated only for the Digital Twin outputs.
      </div>

      <q-expansion-item
        v-for="group in groupedPhaseValidations"
        :key="group.name"
        :label="group.name"
        default-opened
        dense
        header-class="group-header"
      >
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table validation-table">
            <thead>
              <tr>
                <th class="text-left">Validation</th>

                <th class="text-left">L1</th>

                <th class="text-left">L2</th>

                <th class="text-left">L3</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="check in group.checks" :key="check.id">
                <td class="validation-description-cell">
                  <div class="validation-name">
                    {{ check.label }}
                  </div>

                  <div v-if="check.note" class="validation-note">
                    {{ check.note }}
                  </div>

                  <code class="formula-code">
                    {{ check.formula }}
                  </code>
                </td>

                <td
                  v-for="phase in PHASES"
                  :key="`${check.id}-${phase.label}`"
                  :class="`status-${check.phases[phase.label].status}`"
                >
                  <div class="validation-result">
                    <div class="validation-summary">
                      {{ check.phases[phase.label].summary }}
                    </div>

                    <div v-if="check.phases[phase.label].details" class="validation-note">
                      {{ check.phases[phase.label].details }}
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>

      <q-expansion-item
        v-for="group in groupedSystemValidations"
        :key="group.name"
        :label="group.name"
        default-opened
        dense
        header-class="group-header"
      >
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table system-validation-table">
            <thead>
              <tr>
                <th class="text-left">Validation</th>

                <th class="text-left">Result</th>

                <th class="text-left">Details</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="check in group.checks" :key="check.id">
                <td class="validation-description-cell">
                  <div class="validation-name">
                    {{ check.label }}
                  </div>

                  <div v-if="check.note" class="validation-note">
                    {{ check.note }}
                  </div>

                  <code class="formula-code">
                    {{ check.formula }}
                  </code>
                </td>

                <td :class="`status-${check.status}`">
                  <div class="validation-summary">
                    {{ check.summary }}
                  </div>
                </td>

                <td class="description-cell">
                  {{ check.details }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>
    </q-card-section>
  </Card>
</template>

<style scoped>
.phase-table {
  color: #aab;
  border-collapse: separate;
  border-spacing: 0.25em;
}

.phase-table thead {
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.phase-table th {
  color: #ccc;
  padding: 0 1em 0.5em 0;
}

.phase-table td {
  padding: 0.55em 1em 0.55em 0.65em;

  vertical-align: top;

  transition: background-color 180ms ease;
}

.table-wrapper {
  overflow-x: auto;
}

.summary-table,
.system-table,
.system-validation-table {
  min-width: 860px;
}

.measurement-table,
.validation-table {
  min-width: 1000px;
}

.measurement-table th:first-child,
.validation-table th:first-child {
  width: 320px;
}

.measurement-description-cell,
.validation-description-cell {
  min-width: 280px;
  max-width: 390px;
  padding-right: 2em !important;
  white-space: normal !important;
}

.measurement-name,
.validation-name {
  color: #ddd;
  font-weight: 600;
}

.measurement-value {
  min-width: 180px;
  color: #ccc;
  white-space: nowrap;
}

.description-cell {
  color: #8895a7;
  white-space: normal;
}

.validation-result {
  min-width: 205px;
}

.validation-summary {
  color: #ccc;
  white-space: normal;
}

.validation-note {
  color: #8895a7;
  font-size: 0.82em;
  line-height: 1.35;
  margin-top: 0.3em;
  white-space: normal;
}

.formula-code {
  display: block;
  color: #f2ad72;
  font-size: 0.8em;
  line-height: 1.35;
  margin-top: 0.45em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.metric-key {
  display: block;
  color: #9a7557;
  font-size: 0.78em;
  margin-top: 0.3em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.group-header {
  color: #ccc;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.section-heading {
  color: #ddd;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.section-description {
  color: #8895a7;
  font-size: 0.82em;
  line-height: 1.4;
  margin-top: 0.25em;
  margin-bottom: 0.75em;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1em;
}

.provenance-label {
  flex: 0 0 auto;
  padding: 0.35em 0.7em;

  color: #ffc58f;
  background: rgba(255, 152, 0, 0.12);

  border: 1px solid rgba(255, 152, 0, 0.3);

  border-radius: 4px;

  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.status-ok {
  background-color: rgba(76, 175, 80, 0.08);
}

.status-warning {
  background-color: rgba(255, 193, 7, 0.08);
}

.status-error {
  background-color: rgba(244, 67, 54, 0.08);
}

.status-unknown {
  background-color: rgba(255, 255, 255, 0.03);
}

.status-ok,
.status-warning,
.status-error,
.status-unknown {
  border-radius: 4px;

  transition: background-color 180ms ease;
}

.text-spaced {
  letter-spacing: 0.2em;
}

.text-uppercase {
  text-transform: uppercase;
}
</style>
