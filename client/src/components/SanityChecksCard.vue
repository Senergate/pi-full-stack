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

const SANITY_LIMITS = {
  identityOkPercent: 1,
  identityWarningPercent: 5,

  voltageNominal: 230,
  voltageWarningPercent: 10,

  frequencyNominal: 50,
  frequencyOkDeviation: 0.2,
  frequencyWarningDeviation: 0.5,

  voltageImbalanceWarningPercent: 2,
  voltageImbalanceErrorPercent: 3,

  phaseFrequencySpreadWarning: 0.05,
  phaseFrequencySpreadError: 0.2,

  picoPhaseImbalanceWarningPercent: 10,
  picoPhaseImbalanceErrorPercent: 20,

  zeroCurrentThreshold: 0.01,
  zeroPowerTolerance: 2,

  abruptVoltageJump: 15,
  abruptFrequencyJump: 0.2,
  abruptPowerFactorJump: 0.25,
  abruptPicoRmsJumpPercent: 25,

  frozenAfterSeconds: 5,
};

const numberOrNull = value => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const formatValue = (value, unit = '') => {
  const number = numberOrNull(value);

  if (number === null) return '-';
  return `${number.toFixed(2)}${unit ? ` ${unit}` : ''}`;
};

const getPicoMap = () => props.root.pico?.map ?? {};

const getEnergyMeterMap = () => props.root.energy_meter?.map ?? {};

const getPicoMetricKeys = () => Object.keys(getPicoMap());

const getEnergyMeterMetricKeys = () => Object.keys(getEnergyMeterMap());

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

const getPicoQuality = () => props.root.pico?.quality ?? {};

const getEnergyMeterQuality = () => props.root.energy_meter?.quality ?? {};

const relativeDifferencePercent = (actual, expected) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    return null;
  }

  if (Math.abs(expected) < Number.EPSILON) {
    return Math.abs(actual) < Number.EPSILON ? 0 : null;
  }

  return (Math.abs(actual - expected) / Math.abs(expected)) * 100;
};

const identityStatus = percent => {
  if (percent === null) {
    return 'unknown';
  }

  if (percent <= SANITY_LIMITS.identityOkPercent) {
    return 'ok';
  }

  if (percent <= SANITY_LIMITS.identityWarningPercent) {
    return 'warning';
  }

  return 'error';
};

const boundedStatus = (value, okMin, okMax, warningMin = okMin, warningMax = okMax) => {
  if (!Number.isFinite(value)) {
    return 'unknown';
  }

  if (value >= okMin && value <= okMax) {
    return 'ok';
  }

  if (value >= warningMin && value <= warningMax) {
    return 'warning';
  }

  return 'error';
};

const booleanStatus = (value, warning = false) => {
  if (value === null || value === undefined) {
    return 'unknown';
  }

  if (value) {
    return 'ok';
  }

  return warning ? 'warning' : 'error';
};

const phaseResult = ({ status, summary, details = '' }) => ({
  status,
  summary,
  details,
});

const unavailableResult = (summary = 'N/A', details = '') =>
  phaseResult({
    status: 'unknown',
    summary,
    details,
  });

const comparisonResult = (calculated, measured, unit = '') => {
  if (!Number.isFinite(calculated) || !Number.isFinite(measured)) {
    return unavailableResult('NO DATA');
  }

  const difference = calculated - measured;

  const percent = relativeDifferencePercent(calculated, measured);

  return phaseResult({
    status: identityStatus(percent),

    summary: `${formatValue(calculated, unit)} vs ` + `${formatValue(measured, unit)}`,

    details: `Δ ${formatValue(difference, unit)}` + (percent === null ? '' : ` (${percent.toFixed(2)}%)`),
  });
};

const createPerPhaseCheck = (id, group, label, formula, evaluator, note = '') => ({
  id,
  group,
  label,
  formula,
  note,

  phases: Object.fromEntries(PHASES.map(phase => [phase.label, evaluator(phase)])),
});

const sanityChecks = computed(() => {
  const checks = [];

  checks.push(
    createPerPhaseCheck(
      'pico-ac-rms',
      'Pico signal identities',
      'AC RMS identity',
      'AC RMS(calc) = √max(0, RMS² − DC²)',
      phase => {
        const channel = getPicoChannel(phase);

        const rms = numberOrNull(channel.rms_mv);
        const dc = numberOrNull(channel.dc_mv);
        const measured = numberOrNull(channel.ac_rms_mv);

        if (rms === null || dc === null) {
          return unavailableResult('NO DATA');
        }

        const calculated = Math.sqrt(
          Math.max(0, rms ** 2 - dc ** 2)
        );

        return comparisonResult(calculated, measured, 'mV');
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'pico-total-rms',
      'Pico signal identities',
      'Total RMS identity',
      'RMS(calc) = √(AC RMS² + DC²)',
      phase => {
        const channel = getPicoChannel(phase);

        const acRms = numberOrNull(channel.ac_rms_mv);
        const dc = numberOrNull(channel.dc_mv);
        const measured = numberOrNull(channel.rms_mv);

        if (acRms === null || dc === null) {
          return unavailableResult('NO DATA');
        }

        const calculated = Math.sqrt(acRms ** 2 + dc ** 2);

        return comparisonResult(calculated, measured, 'mV');
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'pico-dc-mean',
      'Pico signal identities',
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
      'Valid when DC and mean use the same sample window and definition.'
    )
  );

  checks.push(
    createPerPhaseCheck(
      'pico-std-ac',
      'Pico signal identities',
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
      'Valid when both values use the same samples and population convention.'
    )
  );

  checks.push(
    createPerPhaseCheck(
      'pico-ordering',
      'Pico signal identities',
      'Minimum / mean / maximum ordering',
      'minimum ≤ mean ≤ maximum',
      phase => {
        const channel = getPicoChannel(phase);

        const minimum = numberOrNull(channel.min_mv);
        const mean = numberOrNull(channel.mean_mv);
        const maximum = numberOrNull(channel.max_mv);

        if (
          [minimum, mean, maximum].some(value => value === null)
        ) {
          return unavailableResult('NO DATA');
        }

        const valid = minimum <= mean && mean <= maximum;

        return phaseResult({
          status: booleanStatus(valid),
          summary: valid ? 'ORDER VALID' : 'IMPOSSIBLE ORDER',
          details:
            `${formatValue(minimum, 'mV')} ≤ ` +
            `${formatValue(mean, 'mV')} ≤ ` +
            `${formatValue(maximum, 'mV')}`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'pico-time-domain-crest',
      'Pico signal identities',
      'Time-domain crest factor',
      'Crest factor = max(|maximum − DC|, |DC − minimum|) / AC RMS',
      phase => {
        const channel = getPicoChannel(phase);

        const minimum = numberOrNull(channel.min_mv);
        const maximum = numberOrNull(channel.max_mv);
        const dc = numberOrNull(channel.dc_mv);
        const acRms = numberOrNull(channel.ac_rms_mv);

        if (
          minimum === null ||
          maximum === null ||
          dc === null ||
          acRms === null ||
          acRms <= 0
        ) {
          return unavailableResult('NO DATA');
        }

        const timeDomainPeak = Math.max(
          Math.abs(maximum - dc),
          Math.abs(dc - minimum)
        );

        const crestFactor = timeDomainPeak / acRms;

        let status;

        if (crestFactor < 1) {
          status = 'error';
        } else if (crestFactor <= 3) {
          status = 'ok';
        } else if (crestFactor <= 5) {
          status = 'warning';
        } else {
          status = 'error';
        }

        return phaseResult({
          status,
          summary: crestFactor.toFixed(3),
          details:
            `Time-domain peak ${formatValue(timeDomainPeak, 'mV')}; ` +
            `ideal sine wave √2 ≈ ${Math.SQRT2.toFixed(3)}`,
        });
      },
      'Uses minimum, maximum, DC, and AC RMS. The spectral peak_amplitude_mv value is not used.'
    )
  );

  checks.push(
    createPerPhaseCheck(
      'pico-frequency',
      'Pico signal identities',
      'Pico fundamental frequency',
      '|fpeak − 50 Hz|',
      phase => {
        const frequency = numberOrNull(
          getPicoChannel(phase).peak_frequency_hz
        );

        if (frequency === null) {
          return unavailableResult('NO DATA');
        }

        const deviation = Math.abs(
          frequency - SANITY_LIMITS.frequencyNominal
        );

        const status =
          deviation <= SANITY_LIMITS.frequencyOkDeviation
            ? 'ok'
            : deviation <= SANITY_LIMITS.frequencyWarningDeviation
              ? 'warning'
              : 'error';

        return phaseResult({
          status,
          summary: formatValue(frequency, 'Hz'),
          details: `Deviation ${deviation.toFixed(3)} Hz`,
        });
      },
      'Enable this interpretation only when peak_frequency_hz represents the mains fundamental.'
    )
  );

  checks.push(
    createPerPhaseCheck(
      'energy-meter-va',
      'Energy meter electrical identities',
      'Apparent power identity',
      'S(calc) = |V × I|',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (
          measurement.voltage === null ||
          measurement.current === null
        ) {
          return unavailableResult('NO DATA');
        }

        const calculated = Math.abs(
          measurement.voltage * measurement.current
        );

        return comparisonResult(
          calculated,
          measurement.aprt_power,
          'VA'
        );
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'energy-meter-pf',
      'Energy meter electrical identities',
      'Power-factor identity',
      'PF(calc) = P / S',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (
          measurement.act_power === null ||
          measurement.aprt_power === null ||
          Math.abs(measurement.aprt_power) < Number.EPSILON
        ) {
          return unavailableResult('NO LOAD');
        }

        const calculated =
          measurement.act_power / measurement.aprt_power;

        return comparisonResult(
          calculated,
          measurement.pf,
          ''
        );
      },
      'Sign conventions may differ during export.'
    )
  );

  checks.push(
    createPerPhaseCheck(
      'energy-meter-pf-bounds',
      'Energy meter electrical identities',
      'Power-factor bounds',
      '0 ≤ |PF| ≤ 1',
      phase => {
        const powerFactor = getEnergyMeterPhase(phase).pf;

        if (powerFactor === null) {
          return unavailableResult('NO DATA');
        }

        const valid = Math.abs(powerFactor) <= 1.01;

        return phaseResult({
          status: booleanStatus(valid),
          summary: formatValue(powerFactor),
          details: valid
            ? '|PF| within bounds'
            : '|PF| exceeds 1',
        });
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'energy-meter-p-s',
      'Energy meter electrical identities',
      'Active power does not exceed apparent power',
      '|P| ≤ S',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (
          measurement.act_power === null ||
          measurement.aprt_power === null
        ) {
          return unavailableResult('NO DATA');
        }

        const activePower = Math.abs(measurement.act_power);
        const apparentPower = Math.abs(measurement.aprt_power);

        const valid = activePower <= apparentPower + 1;

        return phaseResult({
          status: booleanStatus(valid),
          summary: valid ? 'VALID' : '|P| > S',
          details:
            `${formatValue(activePower, 'W')} ≤ ` +
            `${formatValue(apparentPower, 'VA')}`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'energy-meter-zero',
      'Energy meter electrical identities',
      'Zero-current consistency',
      '|I| < 0.01 A ⇒ |P| and S < 2',
      phase => {
        const measurement = getEnergyMeterPhase(phase);

        if (
          measurement.current === null ||
          measurement.act_power === null ||
          measurement.aprt_power === null
        ) {
          return unavailableResult('NO DATA');
        }

        if (
          Math.abs(measurement.current) >=
          SANITY_LIMITS.zeroCurrentThreshold
        ) {
          return phaseResult({
            status: 'ok',
            summary: 'LOADED',
            details: 'Zero-current rule not applicable',
          });
        }

        const valid =
          Math.abs(measurement.act_power) <=
            SANITY_LIMITS.zeroPowerTolerance &&
          Math.abs(measurement.aprt_power) <=
            SANITY_LIMITS.zeroPowerTolerance;

        return phaseResult({
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
    createPerPhaseCheck(
      'energy-meter-voltage',
      'Energy meter operating ranges',
      'Voltage range',
      '230 V ± 10% ⇒ 207 V ≤ V ≤ 253 V',
      phase => {
        const voltage = getEnergyMeterPhase(phase).voltage;

        if (voltage === null) {
          return unavailableResult('NO DATA');
        }

        const tolerance =
          SANITY_LIMITS.voltageWarningPercent / 100;

        const minimum =
          SANITY_LIMITS.voltageNominal * (1 - tolerance);

        const maximum =
          SANITY_LIMITS.voltageNominal * (1 + tolerance);

        return phaseResult({
          status: boundedStatus(voltage, minimum, maximum),
          summary: formatValue(voltage, 'V'),
          details:
            `Expected ${minimum.toFixed(0)}–` +
            `${maximum.toFixed(0)} V`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'energy-meter-frequency',
      'Energy meter operating ranges',
      'Grid frequency range',
      '|f − 50 Hz|',
      phase => {
        const frequency = getEnergyMeterPhase(phase).freq;

        if (frequency === null) {
          return unavailableResult('NO DATA');
        }

        const deviation = Math.abs(
          frequency - SANITY_LIMITS.frequencyNominal
        );

        const status =
          deviation <= SANITY_LIMITS.frequencyOkDeviation
            ? 'ok'
            : deviation <= SANITY_LIMITS.frequencyWarningDeviation
              ? 'warning'
              : 'error';

        return phaseResult({
          status,
          summary: formatValue(frequency, 'Hz'),
          details: `Deviation ${deviation.toFixed(3)} Hz`,
        });
      }
    )
  );

  checks.push(
    createPerPhaseCheck(
      'finite-values',
      'Data quality',
      'Finite numeric values',
      'isFinite(value) for every mapped metric',
      phase => {
        const picoChannel = getPicoChannel(phase);
        const energyData = props.root.energy_meter?.data ?? {};

        const picoMetricKeys = getPicoMetricKeys();
        const energyMetricKeys = getEnergyMeterMetricKeys();

        const invalidPico = picoMetricKeys
          .filter(key => {
            const value = picoChannel[key];

            return (
              value !== undefined &&
              value !== null &&
              numberOrNull(value) === null
            );
          })
          .map(key => `Pico: ${key}`);

        const invalidEnergyMeter = energyMetricKeys
          .filter(key => {
            const fullKey = `${phase.channel}_${key}`;
            const value = energyData[fullKey];

            return (
              value !== undefined &&
              value !== null &&
              numberOrNull(value) === null
            );
          })
          .map(
            key =>
              `Energy meter: ${phase.channel}_${key}`
          );

        const invalidValues = [
          ...invalidPico,
          ...invalidEnergyMeter,
        ];

        const valid = invalidValues.length === 0;

        return phaseResult({
          status: booleanStatus(valid),
          summary: valid ? 'FINITE' : 'INVALID VALUE',
          details:
            invalidValues.join(', ') ||
            'All available mapped metrics are finite',
        });
      }
    )
  );

  return checks;
});

const groupedSanityChecks = computed(() => {
  const groups = new Map();

  for (const check of sanityChecks.value) {
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

const systemSanityChecks = computed(() => {
  const voltages = PHASES.map(phase => getEnergyMeterPhase(phase).voltage);

  const frequencies = PHASES.map(phase => getEnergyMeterPhase(phase).freq);

  const picoAcRms = PHASES.map(phase => numberOrNull(getPicoChannel(phase).ac_rms_mv));

  const rows = [];

  if (voltages.every(Number.isFinite)) {
    const average = voltages.reduce((sum, value) => sum + value, 0) / voltages.length;

    const maximumDeviation = Math.max(...voltages.map(voltage => Math.abs(voltage - average)));

    const imbalance = average > 0 ? (maximumDeviation / average) * 100 : 0;

    const status =
      imbalance <= SANITY_LIMITS.voltageImbalanceWarningPercent
        ? 'ok'
        : imbalance <= SANITY_LIMITS.voltageImbalanceErrorPercent
          ? 'warning'
          : 'error';

    rows.push({
      label: 'Voltage imbalance',

      formula: '100 × max(|Vi − Vavg|) / Vavg',

      value: `${imbalance.toFixed(2)} %`,

      status,

      details: `Vavg=${average.toFixed(2)} V`,
    });
  } else {
    rows.push({
      label: 'Voltage imbalance',

      formula: '100 × max(|Vi − Vavg|) / Vavg',

      value: 'NO DATA',
      status: 'unknown',
      details: '',
    });
  }

  if (frequencies.every(Number.isFinite)) {
    const spread = Math.max(...frequencies) - Math.min(...frequencies);

    const status =
      spread <= SANITY_LIMITS.phaseFrequencySpreadWarning
        ? 'ok'
        : spread <= SANITY_LIMITS.phaseFrequencySpreadError
          ? 'warning'
          : 'error';

    rows.push({
      label: 'Frequency agreement',

      formula: 'spread = max(fi) − min(fi)',

      value: `${spread.toFixed(3)} Hz`,

      status,

      details: 'All phases share one grid frequency',
    });
  } else {
    rows.push({
      label: 'Frequency agreement',

      formula: 'spread = max(fi) − min(fi)',

      value: 'NO DATA',
      status: 'unknown',
      details: '',
    });
  }

  if (picoAcRms.every(Number.isFinite)) {
    const average = picoAcRms.reduce((sum, value) => sum + value, 0) / picoAcRms.length;

    const imbalance =
      average > 0 ? (Math.max(...picoAcRms.map(value => Math.abs(value - average))) / average) * 100 : 0;

    const status =
      imbalance <= SANITY_LIMITS.picoPhaseImbalanceWarningPercent
        ? 'ok'
        : imbalance <= SANITY_LIMITS.picoPhaseImbalanceErrorPercent
          ? 'warning'
          : 'error';

    rows.push({
      label: 'Pico phase consistency',

      formula: '100 × max(|ACRMSi − average|) / average',

      value: `${imbalance.toFixed(2)} %`,

      status,

      details: 'Useful only when all channels should have comparable gain and signal level',
    });
  } else {
    rows.push({
      label: 'Pico phase consistency',

      formula: '100 × max(|ACRMSi − average|) / average',

      value: 'NO DATA',
      status: 'unknown',
      details: '',
    });
  }

  const picoFrequencies = PHASES.map(phase => numberOrNull(getPicoChannel(phase).peak_frequency_hz));

  PHASES.forEach((phase, index) => {
    const picoFrequency = picoFrequencies[index];

    const energyMeterFrequency = frequencies[index];

    if (
      Number.isFinite(picoFrequency) &&
      Number.isFinite(energyMeterFrequency) &&
      picoFrequency >= 40 &&
      picoFrequency <= 70
    ) {
      const difference = Math.abs(picoFrequency - energyMeterFrequency);

      rows.push({
        label: `${phase.label} Pico/energy meter frequency`,

        formula: '|fPico − fEnergyMeter|',

        value: `${difference.toFixed(3)} Hz`,

        status: difference <= 0.2 ? 'ok' : difference <= 0.5 ? 'warning' : 'error',

        details: `${picoFrequency.toFixed(3)} Hz ` + `vs ` + `${energyMeterFrequency.toFixed(3)} Hz`,
      });
    } else {
      rows.push({
        label: `${phase.label} Pico/energy meter frequency`,

        formula: '|fPico − fEnergyMeter|',

        value: 'N/A',
        status: 'unknown',

        details: 'Pico peak is missing or does not look like a 50 Hz fundamental',
      });
    }
  });

  const sources = [
    ['Pico', props.root.pico, 1.1],
    ['Energy meter', props.root.energy_meter, 1.5],
  ];

  for (const [label, source, staleError] of sources) {
    const age = source?.lastUpdate ? (performance.now() - source.lastUpdate) / 1000 : null;

    rows.push({
      label: `${label} packet freshness`,

      formula: 'age = now − last packet arrival',

      value: age === null ? 'DISCONNECTED' : `${age.toFixed(2)} s`,

      status: age === null || age > staleError ? 'error' : age > staleError * 0.65 ? 'warning' : 'ok',

      details: `Stale threshold ` + `${staleError.toFixed(1)} s`,
    });
  }

  const qualitySources = [
    ['Pico', getPicoQuality()],
    ['Energy meter', getEnergyMeterQuality()],
  ];

  for (const [label, quality] of qualitySources) {
    const changedAt = numberOrNull(quality.changedAt);

    const unchanged = changedAt === null ? null : (performance.now() - changedAt) / 1000;

    rows.push({
      label: `${label} frozen values`,

      formula: 'unchanged time = now − last value change',

      value: unchanged === null ? 'NO DATA' : `${unchanged.toFixed(1)} s`,

      status: unchanged === null ? 'unknown' : unchanged > SANITY_LIMITS.frozenAfterSeconds ? 'warning' : 'ok',

      details: `Warning after ` + `${SANITY_LIMITS.frozenAfterSeconds} s ` + 'while packets may still arrive',
    });
  }

  const picoQuality = getPicoQuality();

  const energyMeterQuality = getEnergyMeterQuality();

  for (const phase of PHASES) {
    const picoJump = picoQuality.abrupt?.[phase.label];

    rows.push({
      label: `${phase.label} Pico abrupt RMS change`,

      formula: '100 × (ACRMSnew − ACRMSprevious) / |ACRMSprevious|',

      value: Number.isFinite(picoJump) ? `${picoJump.toFixed(2)} %` : 'NO HISTORY',

      status: !Number.isFinite(picoJump)
        ? 'unknown'
        : Math.abs(picoJump) <= SANITY_LIMITS.abruptPicoRmsJumpPercent
          ? 'ok'
          : 'warning',

      details: `Warning above ` + `${SANITY_LIMITS.abruptPicoRmsJumpPercent}% ` + 'per received update',
    });

    const energyMeterJump = energyMeterQuality.abrupt?.[phase.label];

    if (
      !energyMeterJump ||
      ![energyMeterJump.voltageDelta, energyMeterJump.frequencyDelta, energyMeterJump.pfDelta].every(Number.isFinite)
    ) {
      rows.push({
        label: `${phase.label} Energy meter abrupt change`,

        formula: 'compare ΔV, Δf, and ΔPF with limits',

        value: 'NO HISTORY',
        status: 'unknown',
        details: '',
      });

      continue;
    }

    const violations = [];

    if (Math.abs(energyMeterJump.voltageDelta) > SANITY_LIMITS.abruptVoltageJump) {
      violations.push(`ΔV=` + `${energyMeterJump.voltageDelta.toFixed(2)} V`);
    }

    if (Math.abs(energyMeterJump.frequencyDelta) > SANITY_LIMITS.abruptFrequencyJump) {
      violations.push(`Δf=` + `${energyMeterJump.frequencyDelta.toFixed(3)} Hz`);
    }

    if (Math.abs(energyMeterJump.pfDelta) > SANITY_LIMITS.abruptPowerFactorJump) {
      violations.push(`ΔPF=` + `${energyMeterJump.pfDelta.toFixed(3)}`);
    }

    rows.push({
      label: `${phase.label} Energy meter abrupt change`,

      formula: 'compare |ΔV|, |Δf|, and |ΔPF| with limits',

      value: violations.length > 0 ? violations.join(', ') : 'WITHIN LIMITS',

      status: violations.length > 0 ? 'warning' : 'ok',

      details:
        `Limits: ` +
        `${SANITY_LIMITS.abruptVoltageJump} V, ` +
        `${SANITY_LIMITS.abruptFrequencyJump} Hz, ` +
        `PF ${SANITY_LIMITS.abruptPowerFactorJump}`,
    });
  }

  rows.push({
    label: 'Source timestamp agreement',

    formula: 'latency = browser arrival time − source timestamp',

    value: 'N/A',
    status: 'unknown',

    details: 'No guaranteed source timestamp field is defined in the current payload contract.',
  });

  return rows;
});

const sanityStatusLabel = status =>
  ({
    ok: 'OK',
    warning: 'CHECK',
    error: 'MISMATCH',
    unknown: 'N/A',
  })[status];

const sanityStatusColor = status =>
  ({
    ok: 'positive',
    warning: 'warning',
    error: 'negative',
    unknown: 'grey-7',
  })[status];
</script>

<template>
  <Card>
    <q-card-section>
      <div class="text-h6 text-spaced text-uppercase">
        Sanity Checks
      </div>

      <div class="text-caption text-grey-5 q-mt-xs">
        Formula-driven consistency, range, cross-phase, and data-quality checks.
        Thresholds are collected in <code>SANITY_LIMITS</code> so they can be
        tuned for the installation.
      </div>
    </q-card-section>

    <q-card-section class="q-pt-none">
      <q-expansion-item
        v-for="group in groupedSanityChecks"
        :key="group.name"
        :label="group.name"
        default-opened
        dense
        header-class="sanity-group-header"
      >
        <div class="sanity-table-wrapper q-pb-md">
          <table
            class="full-width phase_table sanity-table detailed-sanity-table"
          >
            <thead>
              <tr>
                <th class="text-left">
                  Check
                </th>

                <th class="text-left">
                  L1
                </th>

                <th class="text-left">
                  L2
                </th>

                <th class="text-left">
                  L3
                </th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="check in group.checks"
                :key="check.id"
              >
                <td class="check-description-cell">
                  <div class="sanity-check-name">
                    {{ check.label }}
                  </div>

                  <div
                    v-if="check.note"
                    class="sanity-note"
                  >
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
                  <div class="sanity-result">
                    <div class="sanity-summary">
                      {{ check.phases[phase.label].summary }}
                    </div>

                    <div
                      v-if="check.phases[phase.label].details"
                      class="sanity-note"
                    >
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
        label="System and cross-phase checks"
        default-opened
        dense
        header-class="sanity-group-header"
      >
        <div class="sanity-table-wrapper q-pb-md">
          <table
            class="full-width phase_table sanity-table system-sanity-table"
          >
            <thead>
              <tr>
                <th class="text-left">
                  Check
                </th>

                <th class="text-left">
                  Result
                </th>

                <th class="text-left">
                  Details
                </th>

                <th class="text-right">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="check in systemSanityChecks"
                :key="check.label"
              >
                <td class="check-description-cell">
                  <div class="sanity-check-name">
                    {{ check.label }}
                  </div>

                  <code class="formula-code">
                    {{ check.formula }}
                  </code>
                </td>

                <td class="system-result">
                  {{ check.value }}
                </td>

                <td class="sanity-note system-details">
                  {{ check.details }}
                </td>

                <td
                  class="text-right system-status"
                  :class="`status-${check.status}`"
                >
                  {{ sanityStatusLabel(check.status) }}
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
.phase_table {
  color: #aab;
  border-collapse: separate;
  border-spacing: 0;
}

.phase_table thead {
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.phase_table th {
  color: #ccc;
  padding: 0 1em 0.5em 0;
}

.phase_table td {
  padding: 0.5em 1em 0.5em 0;
  vertical-align: top;
  transition: background-color 180ms ease;
}

.sanity-table-wrapper {
  overflow-x: auto;
}

.sanity-table th,
.sanity-table td {
  white-space: nowrap;
}

.sanity-table td:first-child {
  color: #ccc;
}

.sanity-group-header {
  color: #ccc;
  font-weight: bold;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 1.2em;
  border-radius: 0.4em;
  padding: 0.5em;
  margin: 0 -0.5em 0 -0.5em;}

.detailed-sanity-table {
  min-width: 1000px;
}

.system-sanity-table {
  min-width: 850px;
}

.detailed-sanity-table th:first-child {
  width: 310px;
}

.system-sanity-table th:first-child {
  width: 320px;
}

.system-sanity-table th:nth-child(2) {
  width: 160px;
}

.system-sanity-table th:nth-child(3) {
  width: auto;
}

.system-sanity-table th:last-child {
  width: 90px;
}

.check-description-cell {
  min-width: 280px;
  max-width: 360px;
  padding-right: 2em !important;
  white-space: normal !important;
}

.sanity-check-name {
  color: #ddd;
  font-weight: bold;
}

.sanity-result {
  min-width: 205px;
}

.sanity-summary {
  color: #ccc;
  white-space: normal;
}

.sanity-note {
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

.system-result {
  color: #ddd;
}

.system-details {
  min-width: 280px;
  max-width: 500px;
}

.system-status {
  font-size: 0.8em;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* subtle status highlighting */

.status-ok {
  background-color: rgba(76, 175, 80, 0.18);
}

.status-warning {
  background-color: rgba(255, 193, 7, 0.18);
}

.status-error {
  background-color: rgba(244, 67, 54, 0.18);
}

.status-unknown {
  background-color: rgba(255, 255, 255, 0.13);
}

.text-spaced {
  letter-spacing: 0.2em;
}

.text-uppercase {
  text-transform: uppercase;
}
</style>
