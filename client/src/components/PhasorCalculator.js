const PhasorCalculator = {
  // Return the magnitude of a complex number.
  complexMagnitude: value => Math.hypot(value.re, value.im),

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
      a: Number(measuredCurrents?.a),
      b: Number(measuredCurrents?.b),
      c: Number(measuredCurrents?.c),
    };

    const angles = {
      a: Number(phaseAngles?.a),
      b: Number(phaseAngles?.b),
      c: Number(phaseAngles?.c),
    };

    const values = [currents.a, currents.b, currents.c, angles.a, angles.b, angles.c];

    if (values.some(value => !Number.isFinite(value))) {
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
