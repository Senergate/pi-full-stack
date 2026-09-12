import PhasorCalculator from './components/PhasorCalculator.js';

const PHASES = ['a', 'b', 'c'];
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const complexConjugate = value => ({ re: value.re, im: -value.im });
const complexDivide = (a, b) => {
  const denominator = b.re * b.re + b.im * b.im;
  if (!Number.isFinite(denominator) || denominator <= Number.EPSILON) return null;
  return {
    re: (a.re * b.re + a.im * b.im) / denominator,
    im: (a.im * b.re - a.re * b.im) / denominator,
  };
};
const complexAngleDeg = value => Math.atan2(value.im, value.re) * 180 / Math.PI;

export const DEFAULT_VOLTAGE_LIMITS = Object.freeze({ min: 207, max: 253 });

export const analyzeIncrementalVuf = ({
  phasePowers,
  baselineVoltages,
  baselineAngles = { a: 0, b: -120, c: 120 },
  resistance,
  reactance,
  neutralResistance = 0,
  neutralReactance = 0,
  voltageLimits = DEFAULT_VOLTAGE_LIMITS,
} = {}) => {
  const required = [
    ...PHASES.map(p => finite(baselineVoltages?.[p])),
    ...PHASES.map(p => finite(baselineAngles?.[p])),
    ...PHASES.map(p => finite(resistance?.[p])),
    ...PHASES.map(p => finite(reactance?.[p])),
    finite(neutralResistance), finite(neutralReactance),
  ];
  if (required.some(value => value === null)) {
    return { vufPercent: null, error: 'Missing baseline voltage/grid-model input.' };
  }

  const baselinePhasors = PhasorCalculator.buildSourceVoltagePhasors(baselineVoltages, baselineAngles);
  const currentPhasors = {};

  for (const phase of PHASES) {
    const power = phasePowers?.[phase];
    if (!power || !Number.isFinite(Number(power.re)) || !Number.isFinite(Number(power.im))) {
      return { vufPercent: null, error: `Invalid complex power on phase ${phase}.` };
    }
    // S = V * conj(I)  ->  I = conj(S / V)
    const quotient = complexDivide({ re: Number(power.re), im: Number(power.im) }, baselinePhasors[phase]);
    if (!quotient) return { vufPercent: null, error: `Cannot derive current on phase ${phase}.` };
    currentPhasors[phase] = complexConjugate(quotient);
  }

  const impedances = PhasorCalculator.buildLineImpedances(resistance, reactance);
  const voltageDrops = PhasorCalculator.computeVoltageDrops(currentPhasors, impedances);
  const neutralImpedance = PhasorCalculator.buildNeutralImpedance(neutralResistance, neutralReactance);
  const neutralCurrentPhasor = PhasorCalculator.computeNeutralCurrentPhasor(currentPhasors);
  const neutralVoltageDrop = PhasorCalculator.computeNeutralVoltageDrop(neutralCurrentPhasor, neutralImpedance);
  const projectedVoltagePhasors = PhasorCalculator.computeLoadVoltages(
    baselinePhasors,
    voltageDrops,
    neutralVoltageDrop
  );

  const baselineSequence = PhasorCalculator.computeSequenceComponents(baselinePhasors);
  const projectedSequence = PhasorCalculator.computeSequenceComponents(projectedVoltagePhasors);
  const vuf = PhasorCalculator.computeVUF(projectedSequence);
  const baselineVuf = PhasorCalculator.computeVUF(baselineSequence);

  const voltageMagnitudes = Object.fromEntries(PHASES.map(p => [p, PhasorCalculator.complexMagnitude(projectedVoltagePhasors[p])]));
  const voltageAngles = Object.fromEntries(PHASES.map(p => [p, complexAngleDeg(projectedVoltagePhasors[p])]));
  const currentMagnitudes = Object.fromEntries(PHASES.map(p => [p, PhasorCalculator.complexMagnitude(currentPhasors[p])]));
  const minVoltage = Math.min(...Object.values(voltageMagnitudes));
  const maxVoltage = Math.max(...Object.values(voltageMagnitudes));
  const voltageValid = minVoltage >= voltageLimits.min && maxVoltage <= voltageLimits.max;

  const deltaV2 = PhasorCalculator.complexSubtract(projectedSequence.negative, baselineSequence.negative);
  const deltaV2Magnitude = PhasorCalculator.complexMagnitude(deltaV2);
  const positiveMagnitude = vuf.positiveSequenceMagnitude;

  return {
    ...vuf,
    baselineVufPercent: baselineVuf.vufPercent,
    scenarioDeltaVufPercent: vuf.vufPercent === null || baselineVuf.vufPercent === null
      ? null
      : vuf.vufPercent - baselineVuf.vufPercent,
    incrementalNegativeSequencePercent: positiveMagnitude > Number.EPSILON
      ? (deltaV2Magnitude / positiveMagnitude) * 100
      : null,
    baselineVoltagePhasors: baselinePhasors,
    projectedVoltagePhasors,
    voltageMagnitudes,
    voltageAngles,
    currentPhasors,
    currentMagnitudes,
    neutralCurrentPhasor,
    neutralVoltageDrop,
    voltageDrops,
    projectedSequence,
    baselineSequence,
    voltageValid,
    voltageLimits,
    minVoltage,
    maxVoltage,
    error: vuf.error,
  };
};

export default { analyzeIncrementalVuf, DEFAULT_VOLTAGE_LIMITS };
