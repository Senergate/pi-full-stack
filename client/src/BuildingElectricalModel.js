/*
 * Senergate building-scale electrical model (v1.5)
 *
 * Core rule:
 *   - MEASURED values stay measured.
 *   - Device calibration produces prototype P/Q points.
 *   - P and Q are scaled together to the equivalent building capacity.
 *   - Complex current is derived from S=P+jQ; no phase-specific arbitrary
 *     current multiplier is used.
 */

export const BUILDING_CAPACITY = Object.freeze({
  heatpumpMaxCurrentA: 40,
  wallboxMaxCurrentA: 64,
  batteryMaxCurrentA: 40,
  referenceVoltageV: 230,
});

export const DEFAULT_DEVICE_MODEL = Object.freeze({
  // Fallback only until a measured calibration exists. Fractions are explicitly
  // MODELED and are not claimed to be an ATV12/motor current curve.
  heatpump: {
    pf: 0.85,
    qSign: 1, // +Q = lagging/inductive load
    fractions: { 0: 0, 1: 0.20, 2: 0.40, 3: 0.60, 4: 0.80, 5: 1.00 },
  },
  wallbox: {
    pf: 0.995,
    qSign: 1,
    fractions: { 0: 0, 1: 0.50, 2: 0.50, 3: 1.00 },
  },
  battery: {
    pf: 0.99,
    qSign: 1,
    fractions: { off: 0, on: 1.00 },
  },
});

const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const magnitude = point => Math.hypot(Number(point?.pW ?? 0), Number(point?.qVar ?? 0));

const fallbackPower = ({ currentA, fraction, pf, qSign, voltageV }) => {
  const apparentVA = Math.max(0, currentA) * Math.max(0, fraction) * voltageV;
  const safePf = clamp(Math.abs(Number(pf) || 1), 0.05, 1);
  const pW = apparentVA * safePf;
  const qVar = (Number(qSign) < 0 ? -1 : 1) * Math.sqrt(Math.max(0, apparentVA ** 2 - pW ** 2));
  return { pW, qVar, apparentVA, source: 'fallback_device_model' };
};

const normalizeProfilePoints = profile => {
  if (!profile || typeof profile !== 'object') return {};
  return profile.points && typeof profile.points === 'object' ? profile.points : profile;
};

const measuredScaledPower = ({ profile, stateKey, targetCurrentA, voltageV }) => {
  const points = normalizeProfilePoints(profile);
  const point = points?.[String(stateKey)] ?? points?.[stateKey];
  if (!point) return null;

  const pW = finite(point.pW);
  const qVar = finite(point.qVar);
  if (pW === null || qVar === null) return null;

  const validPoints = Object.values(points).filter(item => finite(item?.pW) !== null && finite(item?.qVar) !== null);
  if (validPoints.length === 0) return null;

  const maxVA = Math.max(...validPoints.map(magnitude));
  if (!Number.isFinite(maxVA) || maxVA <= 1) return null;

  const targetVA = targetCurrentA * voltageV;
  const k = targetVA / maxVA;
  const scaledP = Math.max(0, pW * k);
  const scaledQ = qVar * k;
  return {
    pW: scaledP,
    qVar: scaledQ,
    apparentVA: Math.hypot(scaledP, scaledQ),
    scale: k,
    source: 'measured_pq_scaled_to_building',
    calibrationQuality: profile?.quality ?? 'unknown',
  };
};

const devicePower = ({ device, stateKey, profile, voltageV }) => {
  const config = {
    heatpump: {
      maxA: BUILDING_CAPACITY.heatpumpMaxCurrentA,
      fallback: DEFAULT_DEVICE_MODEL.heatpump,
    },
    wallbox: {
      maxA: BUILDING_CAPACITY.wallboxMaxCurrentA,
      fallback: DEFAULT_DEVICE_MODEL.wallbox,
    },
    battery: {
      maxA: BUILDING_CAPACITY.batteryMaxCurrentA,
      fallback: DEFAULT_DEVICE_MODEL.battery,
    },
  }[device];

  const measured = measuredScaledPower({ profile, stateKey, targetCurrentA: config.maxA, voltageV });
  if (measured) return measured;

  const fraction = Number(config.fallback.fractions?.[stateKey] ?? 0);
  return fallbackPower({
    currentA: config.maxA,
    fraction,
    pf: config.fallback.pf,
    qSign: config.fallback.qSign,
    voltageV,
  });
};

export const buildBuildingComplexPowers = ({
  heatpumpLevel = 0,
  wallboxMask = 0,
  batteryCharging = false,
  calibration = null,
  voltageV = BUILDING_CAPACITY.referenceVoltageV,
} = {}) => {
  const referenceVoltage = finite(voltageV) ?? BUILDING_CAPACITY.referenceVoltageV;
  const hpLevel = clamp(Math.round(Number(heatpumpLevel) || 0), 0, 5);
  const wbMask = clamp(Math.round(Number(wallboxMask) || 0), 0, 3);
  const batteryKey = batteryCharging === true ? 'on' : 'off';

  const heatpump = devicePower({
    device: 'heatpump',
    stateKey: hpLevel,
    profile: calibration?.devices?.heatpump,
    voltageV: referenceVoltage,
  });
  const wallbox = devicePower({
    device: 'wallbox',
    stateKey: wbMask,
    profile: calibration?.devices?.wallbox,
    voltageV: referenceVoltage,
  });
  const battery = devicePower({
    device: 'battery',
    stateKey: batteryKey,
    profile: calibration?.devices?.battery,
    voltageV: referenceVoltage,
  });

  return {
    phasePowers: {
      a: { re: heatpump.pW, im: heatpump.qVar },
      b: { re: wallbox.pW, im: wallbox.qVar },
      c: { re: battery.pW, im: battery.qVar },
    },
    devices: { heatpump, wallbox, battery },
    capacity: BUILDING_CAPACITY,
    source: [heatpump.source, wallbox.source, battery.source].every(source => source === 'measured_pq_scaled_to_building')
      ? 'calibrated_pq_building_model'
      : 'hybrid_pq_building_model',
  };
};

export default {
  BUILDING_CAPACITY,
  DEFAULT_DEVICE_MODEL,
  buildBuildingComplexPowers,
};
