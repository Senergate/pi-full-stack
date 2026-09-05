const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const PhasorCalculator = {
  // Return the magnitude of a complex number.
  complexMagnitude: value => Math.hypot(value.re, value.im),

  // Subtract two complex numbers.
  complexSubtract: (a, b) => ({
    re: a.re - b.re,
    im: a.im - b.im,
  }),

  // Convert PF into the load angle phi in degrees.
  // For the prototype we assume an inductive load, so current lags voltage.
  powerFactorToAngle: pf => {
    const value = Number(pf);

    if (!Number.isFinite(value)) {
      return 0;
    }

    const clamped = Math.max(-1, Math.min(1, value));

    return (Math.acos(clamped) * 180) / Math.PI;
  },

  // Build current phasors from measured RMS currents and PF values.
  //
  // For an inductive load the current lags its OWN phase voltage:
  // I_angle[phase] = sourceAngle[phase] - acos(PF[phase]).
  //
  // This avoids inconsistent geometry when the source-voltage angles are
  // intentionally modeled as non-ideal, e.g. -120.2° / +119.8°.
  buildCurrentPhasorsFromPF: (
    currents,
    powerFactors = { a: 1, b: 1, c: 1 },
    sourceAngles = { a: 0, b: -120, c: 120 }
  ) => {
    const result = {};

    for (const phase of ['a', 'b', 'c']) {
      const current = finiteOrNull(currents?.[phase]);
      const pf = finiteOrNull(powerFactors?.[phase]);
      const sourceAngle = finiteOrNull(sourceAngles?.[phase]);

      if (current === null || pf === null || sourceAngle === null || current < 0) return null;

      const phi = PhasorCalculator.powerFactorToAngle(pf);
      const angle = sourceAngle - phi;

      result[phase] = PhasorCalculator.polarToComplex(current, angle);
    }

    return result;
  },

  // Build the assumed balanced source-voltage system.
  buildSourceVoltagePhasors: (voltages = { a: 230, b: 230, c: 230 }, angles = { a: 0, b: -120, c: 120 }) => ({
    a: PhasorCalculator.polarToComplex(Number(voltages.a), Number(angles.a)),

    b: PhasorCalculator.polarToComplex(Number(voltages.b), Number(angles.b)),

    c: PhasorCalculator.polarToComplex(Number(voltages.c), Number(angles.c)),
  }),

  // Build complex line impedances Z = R + jX.
  buildLineImpedances: (resistance, reactance = { a: 0, b: 0, c: 0 }) => ({
    a: {
      re: Number(resistance?.a ?? 0),
      im: Number(reactance?.a ?? 0),
    },

    b: {
      re: Number(resistance?.b ?? 0),
      im: Number(reactance?.b ?? 0),
    },

    c: {
      re: Number(resistance?.c ?? 0),
      im: Number(reactance?.c ?? 0),
    },
  }),

  // Calculate dV = Z * I for each phase.
  computeVoltageDrops: (currentPhasors, impedances) => ({
    a: PhasorCalculator.complexMultiply(impedances.a, currentPhasors.a),

    b: PhasorCalculator.complexMultiply(impedances.b, currentPhasors.b),

    c: PhasorCalculator.complexMultiply(impedances.c, currentPhasors.c),
  }),

  // Build neutral impedance ZN = RN + jXN.
  buildNeutralImpedance: (resistance = 0, reactance = 0) => ({
    re: Number(resistance ?? 0),
    im: Number(reactance ?? 0),
  }),

  // Fundamental neutral-current phasor: IN = IA + IB + IC.
  computeNeutralCurrentPhasor: currentPhasors =>
    PhasorCalculator.complexAdd(
      PhasorCalculator.complexAdd(currentPhasors.a, currentPhasors.b),
      currentPhasors.c
    ),

  // Neutral-point displacement VN = ZN * IN.
  computeNeutralVoltageDrop: (neutralCurrentPhasor, neutralImpedance) =>
    PhasorCalculator.complexMultiply(neutralImpedance, neutralCurrentPhasor),

  // Calculate simulated load-node voltages:
  //
  // VAN = EA - ZA*IA - VN
  // VBN = EB - ZB*IB - VN
  // VCN = EC - ZC*IC - VN
  //
  // With ZN = 0 this is backward-compatible with the previous phase-only model.
  computeLoadVoltages: (sourceVoltages, voltageDrops, neutralVoltageDrop = { re: 0, im: 0 }) => ({
    a: PhasorCalculator.complexSubtract(
      PhasorCalculator.complexSubtract(sourceVoltages.a, voltageDrops.a),
      neutralVoltageDrop
    ),

    b: PhasorCalculator.complexSubtract(
      PhasorCalculator.complexSubtract(sourceVoltages.b, voltageDrops.b),
      neutralVoltageDrop
    ),

    c: PhasorCalculator.complexSubtract(
      PhasorCalculator.complexSubtract(sourceVoltages.c, voltageDrops.c),
      neutralVoltageDrop
    ),
  }),

  // Compute VUF from positive- and negative-sequence voltage.
  computeVUF: sequenceComponents => {
    const positiveSequenceMagnitude = PhasorCalculator.complexMagnitude(sequenceComponents.positive);

    const negativeSequenceMagnitude = PhasorCalculator.complexMagnitude(sequenceComponents.negative);

    if (positiveSequenceMagnitude <= Number.EPSILON) {
      return {
        vufPercent: null,
        positiveSequenceMagnitude,
        negativeSequenceMagnitude,
        error: 'Positive-sequence voltage magnitude is too small to calculate VUF.',
      };
    }

    return {
      vufPercent: (negativeSequenceMagnitude / positiveSequenceMagnitude) * 100,

      positiveSequenceMagnitude,
      negativeSequenceMagnitude,
      error: null,
    };
  },

  // Complete VUF calculation chain.
  analyzeVUF: ({
    currents,
    powerFactors = { a: 1, b: 1, c: 1 },

    sourceVoltages = {
      a: 230,
      b: 230,
      c: 230,
    },

    sourceAngles = {
      a: 0,
      b: -120,
      c: 120,
    },

    resistance = {
      a: 0.03,
      b: 0.03,
      c: 0.03,
    },

    reactance = {
      a: 0,
      b: 0,
      c: 0,
    },

    neutralResistance = 0,
    neutralReactance = 0,
  }) => {
    const requiredValues = [
      ...['a', 'b', 'c'].map(p => finiteOrNull(currents?.[p])),
      ...['a', 'b', 'c'].map(p => finiteOrNull(powerFactors?.[p])),
      ...['a', 'b', 'c'].map(p => finiteOrNull(sourceVoltages?.[p])),
      ...['a', 'b', 'c'].map(p => finiteOrNull(sourceAngles?.[p])),
      ...['a', 'b', 'c'].map(p => finiteOrNull(resistance?.[p])),
      ...['a', 'b', 'c'].map(p => finiteOrNull(reactance?.[p])),
      finiteOrNull(neutralResistance),
      finiteOrNull(neutralReactance),
    ];

    if (requiredValues.some(value => value === null)) {
      return {
        vufPercent: null,
        positiveSequenceMagnitude: null,
        negativeSequenceMagnitude: null,
        error: 'Missing or invalid VUF input. No fail-open substitution is allowed.',
      };
    }

    const currentPhasors = PhasorCalculator.buildCurrentPhasorsFromPF(currents, powerFactors, sourceAngles);

    if (!currentPhasors) {
      return {
        vufPercent: null,
        positiveSequenceMagnitude: null,
        negativeSequenceMagnitude: null,
        error: 'Invalid current phasor input.',
      };
    }

    const sourceVoltagePhasors = PhasorCalculator.buildSourceVoltagePhasors(sourceVoltages, sourceAngles);

    const impedances = PhasorCalculator.buildLineImpedances(resistance, reactance);

    const voltageDrops = PhasorCalculator.computeVoltageDrops(currentPhasors, impedances);

    const neutralImpedance = PhasorCalculator.buildNeutralImpedance(neutralResistance, neutralReactance);

    const neutralCurrentPhasor = PhasorCalculator.computeNeutralCurrentPhasor(currentPhasors);

    const neutralVoltageDrop = PhasorCalculator.computeNeutralVoltageDrop(neutralCurrentPhasor, neutralImpedance);

    const loadVoltagePhasors = PhasorCalculator.computeLoadVoltages(
      sourceVoltagePhasors,
      voltageDrops,
      neutralVoltageDrop
    );

    // Reuse the existing generic symmetrical-component function.
    const sequenceComponents = PhasorCalculator.computeSequenceComponents(loadVoltagePhasors);

    const vuf = PhasorCalculator.computeVUF(sequenceComponents);

    return {
      ...vuf,

      currentPhasors,
      sourceVoltagePhasors,
      impedances,
      neutralImpedance,
      neutralCurrentPhasor,
      neutralVoltageDrop,
      voltageDrops,
      loadVoltagePhasors,
      sequenceComponents,

      loadVoltageMagnitudes: {
        a: PhasorCalculator.complexMagnitude(loadVoltagePhasors.a),
        b: PhasorCalculator.complexMagnitude(loadVoltagePhasors.b),
        c: PhasorCalculator.complexMagnitude(loadVoltagePhasors.c),
      },
    };
  },

  // Add two complex numbers.
  complexAdd: (a, b) => ({
    re: a.re + b.re,
    im: a.im + b.im,
  }),

  // Multiply two complex numbers.
  complexMultiply: (a, b) => ({
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  }),

  // Multiply a complex number by a real scalar.
  complexScale: (value, factor) => ({
    re: value.re * factor,
    im: value.im * factor,
  }),

  // Convert magnitude and angle in degrees into a complex phasor.
  polarToComplex: (magnitude, angleDegrees) => {
    const angleRadians = (angleDegrees * Math.PI) / 180;

    return {
      re: magnitude * Math.cos(angleRadians),
      im: magnitude * Math.sin(angleRadians),
    };
  },

  // Validate measured RMS currents and manually assigned phase angles.
  validateInputs: (measuredCurrents, phaseAngles) => {
    const currents = {
      a: finiteOrNull(measuredCurrents?.a),
      b: finiteOrNull(measuredCurrents?.b),
      c: finiteOrNull(measuredCurrents?.c),
    };

    const angles = {
      a: finiteOrNull(phaseAngles?.a),
      b: finiteOrNull(phaseAngles?.b),
      c: finiteOrNull(phaseAngles?.c),
    };

    const values = [currents.a, currents.b, currents.c, angles.a, angles.b, angles.c];

    if (values.some(value => value === null)) {
      return {
        valid: false,
        currents,
        angles,
        error: 'All current magnitudes and phase angles must be finite numbers.',
      };
    }

    if (currents.a < 0 || currents.b < 0 || currents.c < 0) {
      return {
        valid: false,
        currents,
        angles,
        error: 'Current magnitudes cannot be negative.',
      };
    }

    return {
      valid: true,
      currents,
      angles,
      error: null,
    };
  },

  // Build simulated three-phase current phasors from measured RMS magnitudes.
  buildPhasePhasors: (measuredCurrents, phaseAngles) => ({
    a: PhasorCalculator.polarToComplex(measuredCurrents.a, phaseAngles.a),

    b: PhasorCalculator.polarToComplex(measuredCurrents.b, phaseAngles.b),

    c: PhasorCalculator.polarToComplex(measuredCurrents.c, phaseAngles.c),
  }),

  // Compute zero-, positive-, and negative-sequence components.
  computeSequenceComponents: phasePhasors => {
    const rotationA = PhasorCalculator.polarToComplex(1, 120);

    const rotationASquared = PhasorCalculator.polarToComplex(1, 240);

    const zero = PhasorCalculator.complexScale(
      PhasorCalculator.complexAdd(PhasorCalculator.complexAdd(phasePhasors.a, phasePhasors.b), phasePhasors.c),
      1 / 3
    );

    const positive = PhasorCalculator.complexScale(
      PhasorCalculator.complexAdd(
        PhasorCalculator.complexAdd(phasePhasors.a, PhasorCalculator.complexMultiply(rotationA, phasePhasors.b)),
        PhasorCalculator.complexMultiply(rotationASquared, phasePhasors.c)
      ),
      1 / 3
    );

    const negative = PhasorCalculator.complexScale(
      PhasorCalculator.complexAdd(
        PhasorCalculator.complexAdd(phasePhasors.a, PhasorCalculator.complexMultiply(rotationASquared, phasePhasors.b)),
        PhasorCalculator.complexMultiply(rotationA, phasePhasors.c)
      ),
      1 / 3
    );

    return {
      zero,
      positive,
      negative,
    };
  },

  // Compute the neutral-current phasor for a four-wire system.
  computeNeutralCurrent: phasePhasors =>
    PhasorCalculator.complexAdd(PhasorCalculator.complexAdd(phasePhasors.a, phasePhasors.b), phasePhasors.c),

  // Compute CUF from positive- and negative-sequence magnitudes.
  computeCUF: sequenceComponents => {
    const positiveSequenceMagnitude = PhasorCalculator.complexMagnitude(sequenceComponents.positive);

    const negativeSequenceMagnitude = PhasorCalculator.complexMagnitude(sequenceComponents.negative);

    if (positiveSequenceMagnitude <= Number.EPSILON) {
      return {
        cufPercent: null,
        positiveSequenceMagnitude,
        negativeSequenceMagnitude,
        error: 'Positive-sequence magnitude is too small to calculate CUF.',
      };
    }

    return {
      cufPercent: (negativeSequenceMagnitude / positiveSequenceMagnitude) * 100,

      positiveSequenceMagnitude,
      negativeSequenceMagnitude,
      error: null,
    };
  },

  // Run the complete simulated three-phase current analysis.
  analyze: (
    measuredCurrents,
    phaseAngles = {
      a: 0,
      b: -120,
      c: 120,
    }
  ) => {
    const validation = PhasorCalculator.validateInputs(measuredCurrents, phaseAngles);

    if (!validation.valid) {
      return {
        cufPercent: null,
        positiveSequenceMagnitude: null,
        negativeSequenceMagnitude: null,
        zeroSequenceMagnitude: null,
        neutralCurrentMagnitude: null,
        phasePhasors: null,
        sequenceComponents: null,
        neutralCurrent: null,
        measuredCurrents: validation.currents,
        phaseAngles: validation.angles,
        error: validation.error,
      };
    }

    const phasePhasors = PhasorCalculator.buildPhasePhasors(validation.currents, validation.angles);

    const sequenceComponents = PhasorCalculator.computeSequenceComponents(phasePhasors);

    const neutralCurrent = PhasorCalculator.computeNeutralCurrent(phasePhasors);

    const cuf = PhasorCalculator.computeCUF(sequenceComponents);

    return {
      cufPercent: cuf.cufPercent,

      positiveSequenceMagnitude: cuf.positiveSequenceMagnitude,

      negativeSequenceMagnitude: cuf.negativeSequenceMagnitude,

      zeroSequenceMagnitude: PhasorCalculator.complexMagnitude(sequenceComponents.zero),

      neutralCurrentMagnitude: PhasorCalculator.complexMagnitude(neutralCurrent),

      phasePhasors,
      sequenceComponents,
      neutralCurrent,

      measuredCurrents: validation.currents,

      phaseAngles: validation.angles,

      error: cuf.error,
    };
  },
};

export { PhasorCalculator };

export default PhasorCalculator;
