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

const VALIDATION_LIMITS = {
  identityOkPercent: 1,
  identityWarningPercent: 5,

  voltageNominal: 230,
  voltageOkPercent: 10,

  frequencyNominal: 50,
  frequencyOkDeviation: 0.2,
  frequencyWarningDeviation: 0.5,

  zeroCurrentThreshold: 0.01,
  zeroPowerTolerance: 2,
};

/*
 * General helpers
 */

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

const formatAge = value => {
  const numericValue = numberOrNull(value);

  if (numericValue === null) {
    return 'DISCONNECTED';
  }

  return `${numericValue.toFixed(2)} s`;
};

const relativeDifferencePercent = (actual, expected) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return null;
  }

  if (Math.abs(expected) < Number.EPSILON) {
    return Math.abs(actual) < Number.EPSILON ? 0 : null;
  }

  return (Math.abs(actual - expected) / Math.abs(expected)) * 100;
};

/*
 * Source access
 */

const getPicoMap = () => props.root.pico?.map ?? {};

const getEnergyMeterMap = () => props.root.energy_meter?.map ?? {};

const getPicoChannel = phase => props.root.pico?.data?.channels?.[phase.channel] ?? {};

const getEnergyMeterPhase = phase => {
  const data = props.root.energy_meter?.data ?? {};

  const prefix = phase.channel;

  return {
    voltage: numberOrNull(data[`${prefix}_voltage`]),

    current: numberOrNull(data[`${prefix}_current`]),

    act_power: numberOrNull(data[`${prefix}_act_power`]),

    aprt_power: numberOrNull(data[`${prefix}_aprt_power`]),

    pf: numberOrNull(data[`${prefix}_pf`]),

    freq: numberOrNull(data[`${prefix}_freq`]),
  };
};

/*
 * Map normalization
 *
 * Pico map entries are expected to look like:
 *   key: [label, divisor, unit]
 *
 * Energy-meter map entries are expected to look like:
 *   key: [label, unit]
 *
 * Object-shaped metadata is supported as well.
 */

const normalizePicoMetric = (key, definition) => {
  if (Array.isArray(definition)) {
    return {
      key,
      label: definition[0] ?? key,
      divisor: numberOrNull(definition[1]) ?? 1,
      unit: definition[2] ?? '',
    };
  }

  if (definition && typeof definition === 'object') {
    return {
      key,
      label: definition.label ?? definition.name ?? key,

      divisor: numberOrNull(definition.divisor ?? definition.scale) ?? 1,

      unit: definition.unit ?? '',
    };
  }

  return {
    key,
    label: key,
    divisor: 1,
    unit: '',
  };
};

const normalizeEnergyMetric = (key, definition) => {
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

/*
 * Measurement rows
 */

const picoMeasurementRows = computed(() => {
  const map = getPicoMap();

  return Object.entries(map).map(([key, definition]) => {
    const metric = normalizePicoMetric(key, definition);

    return {
      key,
      label: metric.label,
      unit: metric.unit,

      values: Object.fromEntries(
        PHASES.map(phase => {
          const channel = getPicoChannel(phase);

          const rawValue = numberOrNull(channel[key]);

          const value = rawValue === null ? null : rawValue / metric.divisor;

          return [phase.label, value];
        })
      ),
    };
  });
});

const energyMeasurementRows = computed(() => {
  const map = getEnergyMeterMap();

  return Object.entries(map).map(([key, definition]) => {
    const metric = normalizeEnergyMetric(key, definition);

    const data = props.root.energy_meter?.data ?? {};

    return {
      key,
      label: metric.label,
      unit: metric.unit,

      values: Object.fromEntries(PHASES.map(phase => [phase.label, numberOrNull(data[`${phase.channel}_${key}`])])),
    };
  });
});

const sourceRows = computed(() => [
  {
    label: 'PicoScope',
    source: 'Current waveform / DSP',
    age: formatAge(props.root.pico?.timedelta),
    status: props.root.pico?.lastUpdate ? 'Receiving' : 'Disconnected',
  },
  {
    label: 'Energy meter',
    source: 'Voltage, current, power and frequency',
    age: formatAge(props.root.energy_meter?.timedelta),
    status: props.root.energy_meter?.lastUpdate ? 'Receiving' : 'Disconnected',
  },
]);

/*
 * Validation helpers
 */

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

const booleanStatus = value => {
  if (value === null || value === undefined) {
    return 'unknown';
  }

  return value ? 'ok' : 'error';
};

const identityStatus = percent => {
  if (percent === null) {
    return 'unknown';
  }

  if (percent <= VALIDATION_LIMITS.identityOkPercent) {
    return 'ok';
  }

  if (percent <= VALIDATION_LIMITS.identityWarningPercent) {
    return 'warning';
  }

  return 'error';
};

const comparisonResult = (calculated, measured, unit = '') => {
  if (!Number.isFinite(calculated) || !Number.isFinite(measured)) {
    return unavailableResult();
  }

  const difference = calculated - measured;

  const percent = relativeDifferencePercent(calculated, measured);

  return validationResult({
    status: identityStatus(percent),

    summary: `${formatValue(calculated, unit)} vs ` + `${formatValue(measured, unit)}`,

    details: `Δ ${formatValue(difference, unit)}` + (percent === null ? '' : ` (${percent.toFixed(2)}%)`),
  });
};

const createPerPhaseValidation = (id, group, label, formula, evaluator, note = '') => ({
  id,
  group,
  label,
  formula,
  note,

  phases: Object.fromEntries(PHASES.map(phase => [phase.label, evaluator(phase)])),
});

/*
 * MEASURED validations
 *
 * These checks use only physical measurements
 * from PicoScope and the energy meter.
 */

const measuredValidations = computed(() => {
  const checks = [];

  checks.push(
    createPerPhaseValidation(
      'pico-ac-rms-identity',
      'PicoScope signal identities',
      'AC RMS identity',
      'AC RMS(calc) = √max(0, RMS² − DC²)',
      phase => {
        const channel = getPicoChannel(phase);

        const rms = numberOrNull(channel.rms_mv);

        const dc = numberOrNull(channel.dc_mv);

        const measuredAcRms = numberOrNull(channel.ac_rms_mv);

        if (rms === null || dc === null) {
          return unavailableResult();
        }

        const calculatedAcRms = Math.sqrt(Math.max(0, rms ** 2 - dc ** 2));

        return comparisonResult(calculatedAcRms, measuredAcRms, 'mV');
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'pico-total-rms-identity',
      'PicoScope signal identities',
      'Total RMS identity',
      'RMS(calc) = √(AC RMS² + DC²)',
      phase => {
        const channel = getPicoChannel(phase);

        const acRms = numberOrNull(channel.ac_rms_mv);

        const dc = numberOrNull(channel.dc_mv);

        const measuredRms = numberOrNull(channel.rms_mv);

        if (acRms === null || dc === null) {
          return unavailableResult();
        }

        const calculatedRms = Math.sqrt(acRms ** 2 + dc ** 2);

        return comparisonResult(calculatedRms, measuredRms, 'mV');
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'pico-dc-mean',
      'PicoScope signal identities',
      'DC versus mean',
      'DC ≈ mean(x)',
      phase => {
        const channel = getPicoChannel(phase);

        return comparisonResult(
          numberOrNull(channel.dc_mv),

          numberOrNull(channel.mean_mv),

          'mV'
        );
      },
      'Valid when both metrics use the same sample window.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'pico-std-ac-rms',
      'PicoScope signal identities',
      'Standard deviation versus AC RMS',
      'σ(x) ≈ RMS(x − mean(x))',
      phase => {
        const channel = getPicoChannel(phase);

        return comparisonResult(
          numberOrNull(channel.std_mv),

          numberOrNull(channel.ac_rms_mv),

          'mV'
        );
      },
      'Valid when both metrics use the same samples and population convention.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'pico-sample-order',
      'PicoScope signal identities',
      'Minimum / mean / maximum ordering',
      'minimum ≤ mean ≤ maximum',
      phase => {
        const channel = getPicoChannel(phase);

        const minimum = numberOrNull(channel.min_mv);

        const mean = numberOrNull(channel.mean_mv);

        const maximum = numberOrNull(channel.max_mv);

        if ([minimum, mean, maximum].some(value => value === null)) {
          return unavailableResult();
        }

        const valid = minimum <= mean && mean <= maximum;

        return validationResult({
          status: booleanStatus(valid),

          summary: valid ? 'ORDER VALID' : 'IMPOSSIBLE ORDER',

          details:
            `${formatValue(minimum, 'mV')} ≤ ` + `${formatValue(mean, 'mV')} ≤ ` + `${formatValue(maximum, 'mV')}`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'pico-time-domain-crest',
      'PicoScope signal identities',
      'Time-domain crest factor',
      'CF = max(|maximum − DC|, |DC − minimum|) / AC RMS',
      phase => {
        const channel = getPicoChannel(phase);

        const minimum = numberOrNull(channel.min_mv);

        const maximum = numberOrNull(channel.max_mv);

        const dc = numberOrNull(channel.dc_mv);

        const acRms = numberOrNull(channel.ac_rms_mv);

        if (minimum === null || maximum === null || dc === null || acRms === null || acRms <= 0) {
          return unavailableResult();
        }

        const timeDomainPeak = Math.max(
          Math.abs(maximum - dc),

          Math.abs(dc - minimum)
        );

        const crestFactor = timeDomainPeak / acRms;

        let status = 'ok';

        if (crestFactor < 1) {
          status = 'error';
        } else if (crestFactor <= 3) {
          status = 'ok';
        } else if (crestFactor <= 5) {
          status = 'warning';
        } else {
          status = 'error';
        }

        return validationResult({
          status,

          summary: crestFactor.toFixed(3),

          details: `Peak ${formatValue(timeDomainPeak, 'mV')}; ` + `ideal sine √2 ≈ ` + `${Math.SQRT2.toFixed(3)}`,
        });
      },
      'Uses the measured time-domain range. The dominant FFT peak amplitude is not used.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-apparent-power',
      'Energy-meter electrical identities',
      'Apparent power identity',
      'S(calc) = |V × I|',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (measurement.voltage === null || measurement.current === null) {
          return unavailableResult();
        }

        const calculated = Math.abs(measurement.voltage * measurement.current);

        return comparisonResult(calculated, measurement.aprt_power, 'VA');
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-power-factor',
      'Energy-meter electrical identities',
      'Power-factor identity',
      'PF(calc) = P / S',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (measurement.act_power === null || measurement.aprt_power === null) {
          return unavailableResult();
        }

        if (Math.abs(measurement.aprt_power) < Number.EPSILON) {
          return unavailableResult('NO LOAD');
        }

        const calculated = measurement.act_power / measurement.aprt_power;

        return comparisonResult(calculated, measurement.pf);
      },
      'The sign may depend on the meter import/export convention.'
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-pf-bounds',
      'Energy-meter electrical identities',
      'Power-factor bounds',
      '0 ≤ |PF| ≤ 1',
      phase => {
        const powerFactor = getEnergyMeterPhase(phase).pf;

        if (powerFactor === null) {
          return unavailableResult();
        }

        const valid = Math.abs(powerFactor) <= 1.01;

        return validationResult({
          status: booleanStatus(valid),

          summary: formatValue(powerFactor),

          details: valid ? '|PF| is within physical bounds' : '|PF| exceeds 1',
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-active-apparent',
      'Energy-meter electrical identities',
      'Active power does not exceed apparent power',
      '|P| ≤ S',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (measurement.act_power === null || measurement.aprt_power === null) {
          return unavailableResult();
        }

        const activePower = Math.abs(measurement.act_power);

        const apparentPower = Math.abs(measurement.aprt_power);

        const valid = activePower <= apparentPower + 1;

        return validationResult({
          status: booleanStatus(valid),

          summary: valid ? 'VALID' : '|P| > S',

          details: `${formatValue(activePower, 'W')} ≤ ` + `${formatValue(apparentPower, 'VA')}`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-zero-current',
      'Energy-meter electrical identities',
      'Zero-current consistency',
      '|I| < 0.01 A ⇒ |P| and S < 2',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (measurement.current === null || measurement.act_power === null || measurement.aprt_power === null) {
          return unavailableResult();
        }

        if (Math.abs(measurement.current) >= VALIDATION_LIMITS.zeroCurrentThreshold) {
          return validationResult({
            status: 'ok',
            summary: 'LOADED',
            details: 'Zero-current rule is not applicable',
          });
        }

        const valid =
          Math.abs(measurement.act_power) <= VALIDATION_LIMITS.zeroPowerTolerance &&
          Math.abs(measurement.aprt_power) <= VALIDATION_LIMITS.zeroPowerTolerance;

        return validationResult({
          status: booleanStatus(valid),

          summary: valid ? 'CONSISTENT' : 'RESIDUAL POWER',

          details:
            `I=${formatValue(measurement.current, 'A')}, ` +
            `P=${formatValue(measurement.act_power, 'W')}, ` +
            `S=${formatValue(measurement.aprt_power, 'VA')}`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-voltage-range',
      'Measured operating ranges',
      'Grid voltage range',
      '230 V ± 10% ⇒ 207 V ≤ V ≤ 253 V',
      phase => {
        const voltage = getEnergyMeterPhase(phase).voltage;

        if (voltage === null) {
          return unavailableResult();
        }

        const tolerance = VALIDATION_LIMITS.voltageOkPercent / 100;

        const minimum = VALIDATION_LIMITS.voltageNominal * (1 - tolerance);

        const maximum = VALIDATION_LIMITS.voltageNominal * (1 + tolerance);

        const valid = voltage >= minimum && voltage <= maximum;

        return validationResult({
          status: booleanStatus(valid),

          summary: formatValue(voltage, 'V'),

          details: `Expected ` + `${minimum.toFixed(0)}–` + `${maximum.toFixed(0)} V`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'energy-frequency-range',
      'Measured operating ranges',
      'Grid frequency range',
      '|f − 50 Hz|',
      phase => {
        const frequency = getEnergyMeterPhase(phase).freq;

        if (frequency === null) {
          return unavailableResult();
        }

        const deviation = Math.abs(frequency - VALIDATION_LIMITS.frequencyNominal);

        const status =
          deviation <= VALIDATION_LIMITS.frequencyOkDeviation
            ? 'ok'
            : deviation <= VALIDATION_LIMITS.frequencyWarningDeviation
              ? 'warning'
              : 'error';

        return validationResult({
          status,

          summary: formatValue(frequency, 'Hz'),

          details: `Deviation ` + `${deviation.toFixed(3)} Hz`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseValidation(
      'finite-values',
      'Measured data quality',
      'Finite mapped values',
      'isFinite(value) for every available mapped metric',
      phase => {
        const picoChannel = getPicoChannel(phase);

        const energyData = props.root.energy_meter?.data ?? {};

        const invalidPico = Object.keys(getPicoMap())
          .filter(key => {
            const value = picoChannel[key];

            return value !== undefined && value !== null && numberOrNull(value) === null;
          })
          .map(key => `Pico: ${key}`);

        const invalidEnergy = Object.keys(getEnergyMeterMap())
          .filter(key => {
            const fullKey = `${phase.channel}_${key}`;

            const value = energyData[fullKey];

            return value !== undefined && value !== null && numberOrNull(value) === null;
          })
          .map(key => `Energy meter: ` + `${phase.channel}_${key}`);

        const invalidValues = [...invalidPico, ...invalidEnergy];

        return validationResult({
          status: invalidValues.length === 0 ? 'ok' : 'error',

          summary: invalidValues.length === 0 ? 'FINITE' : 'INVALID VALUE',

          details: invalidValues.join(', ') || 'All available mapped values are finite',
        });
      }
    )
  );

  return checks;
});

const groupedMeasuredValidations = computed(() => {
  const groups = new Map();

  for (const check of measuredValidations.value) {
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
          <div class="text-h6 text-spaced text-uppercase">Measured</div>

          <div class="text-caption text-grey-5 q-mt-xs">
            Direct measurements from the physical test bench, followed by validations that use only those measured
            values.
          </div>
        </div>

        <div class="provenance-label">MEASURED</div>
      </div>
    </q-card-section>

    <q-separator dark />

    <q-card-section>
      <div class="section-heading">Measurements</div>

      <div class="section-description">
        Values reported directly by the PicoScope processing pipeline and energy meter.
      </div>

      <q-expansion-item label="Measurement sources" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table source-table">
            <thead>
              <tr>
                <th class="text-left">Source</th>

                <th class="text-left">Measurement domain</th>

                <th class="text-left">Last packet</th>

                <th class="text-left">Status</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="source in sourceRows" :key="source.label">
                <td class="measurement-name">
                  {{ source.label }}
                </td>

                <td>
                  {{ source.source }}
                </td>

                <td>
                  {{ source.age }}
                </td>

                <td>
                  {{ source.status }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>

      <q-expansion-item label="PicoScope measurements" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table measurement-table">
            <thead>
              <tr>
                <th class="text-left">Measurement</th>

                <th class="text-left">L1</th>

                <th class="text-left">L2</th>

                <th class="text-left">L3</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in picoMeasurementRows" :key="row.key">
                <td class="measurement-description-cell">
                  <div class="measurement-name">
                    {{ row.label }}
                  </div>

                  <code class="metric-key">
                    {{ row.key }}
                  </code>
                </td>

                <td v-for="phase in PHASES" :key="`${row.key}-${phase.label}`" class="measurement-value">
                  {{ formatValue(row.values[phase.label], row.unit) }}
                </td>
              </tr>

              <tr v-if="picoMeasurementRows.length === 0">
                <td colspan="4">No PicoScope map is available.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>

      <q-expansion-item label="Energy-meter measurements" default-opened dense header-class="group-header">
        <div class="table-wrapper q-pb-md">
          <table class="full-width phase-table measurement-table">
            <thead>
              <tr>
                <th class="text-left">Measurement</th>

                <th class="text-left">L1</th>

                <th class="text-left">L2</th>

                <th class="text-left">L3</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in energyMeasurementRows" :key="row.key">
                <td class="measurement-description-cell">
                  <div class="measurement-name">
                    {{ row.label }}
                  </div>

                  <code class="metric-key">
                    {{ row.key }}
                  </code>
                </td>

                <td v-for="phase in PHASES" :key="`${row.key}-${phase.label}`" class="measurement-value">
                  {{ formatValue(row.values[phase.label], row.unit) }}
                </td>
              </tr>

              <tr v-if="energyMeasurementRows.length === 0">
                <td colspan="4">No energy-meter map is available.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </q-expansion-item>
    </q-card-section>

    <q-separator dark />

    <q-card-section>
      <div class="section-heading">Measurement validations</div>

      <div class="section-description">
        Mathematical identities, physical plausibility checks and operating ranges evaluated only from real
        measurements.
      </div>

      <q-expansion-item
        v-for="group in groupedMeasuredValidations"
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
    </q-card-section>
  </Card>
</template>

<style>
.phase-table {
  color: #aab;
  /* border-collapse: separate; */
  /* border-spacing: 0; */
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

.measurement-table,
.validation-table {
  min-width: 1000px;
}

.source-table {
  min-width: 760px;
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
  color: #7ea5d6;
  font-size: 0.8em;
  line-height: 1.35;
  margin-top: 0.45em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.metric-key {
  display: block;
  color: #68788f;
  font-size: 0.78em;
  margin-top: 0.3em;
  white-space: normal;
  overflow-wrap: anywhere;
}

.group-header {
  color: #ccc;
  font-weight: bold;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 1.2em;
  border-radius: 0.4em;
  padding: 0.5em;
  margin: 0 -0.5em 0 -0.5em;
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

  color: #9fd2ff;
  background: rgba(33, 150, 243, 0.12);

  border: 1px solid rgba(33, 150, 243, 0.3);

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
