<script setup>
import { computed } from 'vue';
import Card from './Card.vue';

const props = defineProps({
  root: {
    type: Object,
    required: true,
  },
});

const PHASES = [
  { label: 'L1', channel: 'a' },
  { label: 'L2', channel: 'b' },
  { label: 'L3', channel: 'c' },
];

const INFERENCE_LIMITS = {
  minimumConfidenceOk: 0.8,
  minimumConfidenceWarning: 0.6,
  minimumFundamentalAmplitudeMv: 0.1,
  maximumFingerprintDistanceOk: 0.15,
  maximumFingerprintDistanceWarning: 0.3,
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

  return `${numericValue.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
};

const formatPercent = (value, decimals = 1) => {
  const numericValue = numberOrNull(value);

  if (numericValue === null) {
    return '-';
  }

  const percentValue = numericValue <= 1 ? numericValue * 100 : numericValue;
  return `${percentValue.toFixed(decimals)} %`;
};

const normalizeConfidence = value => {
  const numericValue = numberOrNull(value);

  if (numericValue === null) {
    return null;
  }

  return numericValue > 1 ? numericValue / 100 : numericValue;
};

const getPicoChannel = phase => props.root.pico?.data?.channels?.[phase.channel] ?? {};

const getInferenceChannel = phase =>
  props.root.inferred?.data?.channels?.[phase.channel] ??
  props.root.inference?.data?.channels?.[phase.channel] ??
  props.root.nilm?.data?.channels?.[phase.channel] ??
  {};

const getGlobalInference = () => props.root.inferred?.data ?? props.root.inference?.data ?? props.root.nilm?.data ?? {};

const getInferenceMap = () => props.root.inferred?.map ?? props.root.inference?.map ?? props.root.nilm?.map ?? {};

const getMappedValue = (phase, key) => {
  const channel = getInferenceChannel(phase);

  if (channel[key] !== undefined) {
    return channel[key];
  }

  const global = getGlobalInference();
  const prefixedKey = `${phase.channel}_${key}`;

  if (global[prefixedKey] !== undefined) {
    return global[prefixedKey];
  }

  return null;
};

const normalizeInferenceMetric = (key, definition) => {
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

const knownMetricKeys = [
  'device',
  'device_type',
  'device_label',
  'classification',
  'confidence',
  'score',
  'thd_i',
  'thd_i_percent',
  'h3_percent',
  'h5_percent',
  'h7_percent',
  'fundamental_amplitude_mv',
  'peak_frequency_hz',
  'estimated_power_w',
  'state',
];

const inferredMeasurementRows = computed(() => {
  const map = getInferenceMap();

  if (Object.keys(map).length > 0) {
    return Object.entries(map).map(([key, definition]) => {
      const metric = normalizeInferenceMetric(key, definition);

      return {
        key,
        label: metric.label,
        unit: metric.unit,
        values: Object.fromEntries(PHASES.map(phase => [phase.label, getMappedValue(phase, key)])),
      };
    });
  }

  const discoveredKeys = new Set();

  for (const phase of PHASES) {
    const channel = getInferenceChannel(phase);

    for (const key of Object.keys(channel)) {
      discoveredKeys.add(key);
    }
  }

  for (const key of knownMetricKeys) {
    for (const phase of PHASES) {
      const value = getMappedValue(phase, key);

      if (value !== null && value !== undefined) {
        discoveredKeys.add(key);
      }
    }
  }

  return Array.from(discoveredKeys).map(key => ({
    key,
    label: key.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()),
    unit: key.includes('percent')
      ? '%'
      : key.endsWith('_w')
        ? 'W'
        : key.endsWith('_mv')
          ? 'mV'
          : key.endsWith('_hz')
            ? 'Hz'
            : '',
    values: Object.fromEntries(PHASES.map(phase => [phase.label, getMappedValue(phase, key)])),
  }));
});

const displayInferenceValue = row => {
  const key = row.key.toLowerCase();

  return value => {
    if (value === undefined || value === null || value === '') {
      return '-';
    }

    if (key.includes('confidence') || key === 'score') {
      return formatPercent(value);
    }

    if (key.includes('percent')) {
      return formatPercent(value);
    }

    const numericValue = numberOrNull(value);

    if (numericValue !== null) {
      return formatValue(numericValue, row.unit);
    }

    return String(value);
  };
};

const inferenceSummaryRows = computed(() =>
  PHASES.map(phase => {
    const inference = getInferenceChannel(phase);

    const classification =
      inference.device_label ??
      inference.device_type ??
      inference.device ??
      inference.classification ??
      getMappedValue(phase, 'device_label') ??
      getMappedValue(phase, 'device_type') ??
      getMappedValue(phase, 'device') ??
      getMappedValue(phase, 'classification') ??
      'Unknown';

    const confidence = normalizeConfidence(
      inference.confidence ?? inference.score ?? getMappedValue(phase, 'confidence') ?? getMappedValue(phase, 'score')
    );

    const state = inference.state ?? getMappedValue(phase, 'state') ?? '-';

    const estimatedPower = numberOrNull(inference.estimated_power_w ?? getMappedValue(phase, 'estimated_power_w'));

    return {
      phase: phase.label,
      classification,
      confidence,
      state,
      estimatedPower,
    };
  })
);

const inferenceResult = ({ status, summary, details = '' }) => ({
  status,
  summary,
  details,
});

const unavailableResult = (summary = 'NO DATA', details = '') =>
  inferenceResult({
    status: 'unknown',
    summary,
    details,
  });

const confidenceStatus = confidence => {
  if (confidence === null) {
    return 'unknown';
  }

  if (confidence >= INFERENCE_LIMITS.minimumConfidenceOk) {
    return 'ok';
  }

  if (confidence >= INFERENCE_LIMITS.minimumConfidenceWarning) {
    return 'warning';
  }

  return 'error';
};

const createPerPhaseValidation = (id, group, label, formula, evaluator, note = '') => ({
  id,
  group,
  label,
  formula,
  note,
  phases: Object.fromEntries(PHASES.map(phase => [phase.label, evaluator(phase)])),
});

const inferredValidations = computed(() => {
  const checks = [];

  checks.push(
    createPerPhaseValidation(
      'nilm-confidence',
      'Inference quality',
      'Classification confidence',
      'confidence ≥ configured threshold',
      phase => {
        const inference = getInferenceChannel(phase);
        const confidence = normalizeConfidence(
          inference.confidence ??
            inference.score ??
            getMappedValue(phase, 'confidence') ??
            getMappedValue(phase, 'score')
        );

        if (confidence === null) {
          return unavailableResult();
        }

        return inferenceResult({
          status: confidenceStatus(confidence),
          summary: formatPercent(confidence),
          details:
            confidence >= INFERENCE_LIMITS.minimumConfidenceOk
              ? 'High-confidence inference'
              : confidence >= INFERENCE_LIMITS.minimumConfidenceWarning
                ? 'Usable, but should be treated cautiously'
                : 'Low-confidence classification',
        });
      },
      'This validates inference confidence, not the physical measurement itself.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'nilm-classification-present',
      'Inference quality',
      'Classification is present',
      'device classification is non-empty',
      phase => {
        const inference = getInferenceChannel(phase);
        const classification =
          inference.device_label ??
          inference.device_type ??
          inference.device ??
          inference.classification ??
          getMappedValue(phase, 'device_label') ??
          getMappedValue(phase, 'device_type') ??
          getMappedValue(phase, 'device') ??
          getMappedValue(phase, 'classification');

        const valid = classification !== null && classification !== undefined && String(classification).trim() !== '';

        return inferenceResult({
          status: valid ? 'ok' : 'unknown',
          summary: valid ? String(classification) : 'UNCLASSIFIED',
          details: valid ? 'A device class was inferred' : 'No classification is available',
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'nilm-fundamental-signal',
      'Input suitability',
      'Fundamental signal strength',
      'fundamental amplitude ≥ minimum usable amplitude',
      phase => {
        const inference = getInferenceChannel(phase);
        const pico = getPicoChannel(phase);

        const amplitude = numberOrNull(
          inference.fundamental_amplitude_mv ??
            getMappedValue(phase, 'fundamental_amplitude_mv') ??
            pico.fundamental_amplitude_mv ??
            pico.peak_amplitude_mv
        );

        if (amplitude === null) {
          return unavailableResult();
        }

        const valid = amplitude >= INFERENCE_LIMITS.minimumFundamentalAmplitudeMv;

        return inferenceResult({
          status: valid ? 'ok' : 'warning',
          summary: formatValue(amplitude, 'mV'),
          details: valid
            ? 'Signal amplitude is sufficient for stable inference'
            : 'Very small signal; classification may be unstable',
        });
      },
      'If no dedicated fundamental amplitude exists, this falls back to the available Pico amplitude field.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'nilm-harmonic-inputs',
      'Input suitability',
      'Harmonic fingerprint availability',
      'THD-I and/or harmonic ratios are finite',
      phase => {
        const inference = getInferenceChannel(phase);

        const values = [
          inference.thd_i,
          inference.thd_i_percent,
          inference.h3_percent,
          inference.h5_percent,
          inference.h7_percent,
          getMappedValue(phase, 'thd_i'),
          getMappedValue(phase, 'thd_i_percent'),
          getMappedValue(phase, 'h3_percent'),
          getMappedValue(phase, 'h5_percent'),
          getMappedValue(phase, 'h7_percent'),
        ]
          .map(numberOrNull)
          .filter(value => value !== null);

        if (values.length === 0) {
          return unavailableResult('NO FINGERPRINT');
        }

        return inferenceResult({
          status: 'ok',
          summary: `${values.length} metric${values.length === 1 ? '' : 's'}`,
          details: 'Finite harmonic features are available to the classifier',
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'nilm-fingerprint-distance',
      'Model consistency',
      'Fingerprint match distance',
      'distance to selected model ≤ configured threshold',
      phase => {
        const inference = getInferenceChannel(phase);

        const distance = numberOrNull(
          inference.fingerprint_distance ??
            inference.model_distance ??
            getMappedValue(phase, 'fingerprint_distance') ??
            getMappedValue(phase, 'model_distance')
        );

        if (distance === null) {
          return unavailableResult('NOT PROVIDED');
        }

        const status =
          distance <= INFERENCE_LIMITS.maximumFingerprintDistanceOk
            ? 'ok'
            : distance <= INFERENCE_LIMITS.maximumFingerprintDistanceWarning
              ? 'warning'
              : 'error';

        return inferenceResult({
          status,
          summary: distance.toFixed(3),
          details: 'Lower values indicate a closer match to the selected device model',
        });
      },
      'This check is active only when the inference pipeline exposes a fingerprint or model distance.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'nilm-finite-values',
      'Data quality',
      'Finite inference values',
      'all available numeric inference outputs are finite',
      phase => {
        const inference = getInferenceChannel(phase);

        const invalidKeys = Object.entries(inference)
          .filter(([, value]) => typeof value === 'number' && !Number.isFinite(value))
          .map(([key]) => key);

        return inferenceResult({
          status: invalidKeys.length === 0 ? 'ok' : 'error',
          summary: invalidKeys.length === 0 ? 'FINITE' : 'INVALID VALUE',
          details: invalidKeys.length === 0 ? 'All available inference outputs are finite' : invalidKeys.join(', '),
        });
      }
    )
  );

  return checks;
});

const groupedInferredValidations = computed(() => {
  const groups = new Map();

  for (const check of inferredValidations.value) {
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
</script>

<template>
  <Card>
    <q-card-section>
      <div class="title-row">
        <div>
          <div class="text-h6 text-spaced text-uppercase">Inferred</div>

          <div class="text-caption text-grey-5 q-mt-xs">
            Device identification and derived classifications produced from real measured waveforms and harmonic
            fingerprints.
          </div>
        </div>

        <div class="provenance-label">INFERRED</div>
      </div>
    </q-card-section>

    <q-separator dark />

    <q-card-section>
      <div class="section-heading">Inference results</div>

      <div class="section-description">
        These values are conclusions produced by the NILM or classification pipeline. They are not direct measurements.
      </div>

      <q-expansion-item label="Device identification summary" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table summary-table">
            <thead>
              <tr>
                <th class="text-left">Branch</th>
                <th class="text-left">Classification</th>
                <th class="text-left">Confidence</th>
                <th class="text-left">State</th>
                <th class="text-left">Estimated power</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in inferenceSummaryRows" :key="row.phase">
                <td class="measurement-name">{{ row.phase }}</td>
                <td>{{ row.classification }}</td>
                <td>{{ formatPercent(row.confidence) }}</td>
                <td>{{ row.state }}</td>
                <td>{{ formatValue(row.estimatedPower, 'W') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>

      <q-expansion-item label="Inference outputs" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table measurement-table">
            <thead>
              <tr>
                <th class="text-left">Inference</th>
                <th class="text-left">L1</th>
                <th class="text-left">L2</th>
                <th class="text-left">L3</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in inferredMeasurementRows" :key="row.key">
                <td class="measurement-description-cell">
                  <div class="measurement-name">{{ row.label }}</div>
                  <code class="metric-key">{{ row.key }}</code>
                </td>

                <td v-for="phase in PHASES" :key="`${row.key}-${phase.label}`" class="measurement-value">
                  {{ displayInferenceValue(row)(row.values[phase.label]) }}
                </td>
              </tr>

              <tr v-if="inferredMeasurementRows.length === 0">
                <td colspan="4">No inference data is currently available.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>
    </q-card-section>

    <q-separator dark />

    <q-card-section>
      <div class="section-heading">Inference validations</div>

      <div class="section-description">
        Confidence, signal suitability, fingerprint availability and model consistency checks for the inferred results.
      </div>

      <q-expansion-item
        v-for="group in groupedInferredValidations"
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
                  <div class="validation-name">{{ check.label }}</div>

                  <div v-if="check.note" class="validation-note">
                    {{ check.note }}
                  </div>

                  <code class="formula-code">{{ check.formula }}</code>
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
    </q-card-section>
  </Card>
</template>

<style scoped>
.phase-table {
  color: #aab;
  border-collapse: separate;
  border-spacing: 0;
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

.summary-table {
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
  max-width: 380px;
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
  color: #c69bf5;
  font-size: 0.8em;
  line-height: 1.35;
  margin-top: 0.45em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.metric-key {
  display: block;
  color: #806b95;
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
  color: #d8b7ff;
  background: rgba(156, 39, 176, 0.12);
  border: 1px solid rgba(156, 39, 176, 0.3);
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
