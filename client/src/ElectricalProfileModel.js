/*
 * Senergate Building-Twin electrical profile model (v1.5)
 * --------------------------------------------------------
 * The model keeps three layers separate:
 *   MEASURED  : Shelly/Pico prototype measurements.
 *   MODELED   : calibrated/scaled P+jQ device profiles at building scale.
 *   ESTIMATED : projected voltage phasors / VUF through the feeder model.
 *
 * Important: building-scale current is NOT produced by multiplying the live
 * Shelly current. The live prototype is used only to identify device P/Q
 * profiles. P and Q are then scaled together, which preserves the measured
 * electrical power factor / displacement behaviour of each device profile.
 */

export const BUILDING_TARGETS = Object.freeze({
  nominalVoltageV: 230,
  // DEMO building-equivalent capacity. The physical ATV12 remains capped at 50 Hz.
  // 60 A is selected so Branch A at max alone exceeds 2.3% modeled VUF
  // with the current symmetric Weak-Grid Demo feeder while staying above 207 V.
  heatpumpMaxCurrentA: 60,
  wallboxMaxCurrentA: 64,
  batteryMaxCurrentA: 40,
});

const qFromPf = (apparentVA, pf = 1, sign = 1) => {
  const s = Math.max(0, Number(apparentVA) || 0);
  const safePf = Math.max(0, Math.min(1, Math.abs(Number(pf) || 0)));
  return sign * s * Math.sqrt(Math.max(0, 1 - safePf * safePf));
};

export const DEFAULT_ELECTRICAL_PROFILES = Object.freeze({
  schema_version: '1.0',
  provenance: 'fallback_pq_device_model_not_calibrated',
  generated_at: null,
  baseline: {
    source: 'nominal_fallback',
    calibrated: false,
    voltages: { a: 230, b: 230, c: 230 },
  },
  assets: {
    heatpump: {
      phase: 'a',
      q_sign: 'lagging',
      target_current_a: BUILDING_TARGETS.heatpumpMaxCurrentA,
      // Non-linear fallback only. Real calibration replaces these points.
      points: {
        0: { fraction: 0.00, pf: 1.00 },
        1: { fraction: 0.15, pf: 0.90 },
        2: { fraction: 0.30, pf: 0.90 },
        3: { fraction: 0.48, pf: 0.91 },
        4: { fraction: 0.72, pf: 0.92 },
        5: { fraction: 1.00, pf: 0.93 },
      },
    },
    wallbox: {
      phase: 'b',
      q_sign: 'near_unity',
      target_current_a: BUILDING_TARGETS.wallboxMaxCurrentA,
      points: {
        0: { fraction: 0.00, pf: 1.000 },
        1: { fraction: 0.50, pf: 0.995 },
        2: { fraction: 0.50, pf: 0.995 },
        3: { fraction: 1.00, pf: 0.995 },
      },
    },
    battery: {
      phase: 'c',
      q_sign: 'near_unity',
      target_current_a: BUILDING_TARGETS.batteryMaxCurrentA,
      points: {
        0: { fraction: 0.00, pf: 1.000 },
        1: { fraction: 1.00, pf: 0.990 },
      },
    },
  },
});

const finiteOrNull = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getAsset = (profiles, name) =>
  profiles?.assets?.[name] ?? DEFAULT_ELECTRICAL_PROFILES.assets[name];

const pointFor = (asset, state) => {
  const key = String(state);
  return asset?.points?.[key] ?? asset?.points?.[state] ?? null;
};

const pointComplexPower = (point, asset, targetVA) => {
  if (!point) return { p: 0, q: 0, source: 'missing_point' };

  const measuredP = finiteOrNull(point.delta_p_w ?? point.p_w);
  const measuredQ = finiteOrNull(point.delta_q_var ?? point.q_var);

  if (measuredP !== null && measuredQ !== null) {
    return { p: measuredP, q: measuredQ, source: 'calibrated_pq' };
  }

  const fraction = Math.max(0, Math.min(1, finiteOrNull(point.fraction) ?? 0));
  const apparentVA = targetVA * fraction;
  const pf = Math.max(0, Math.min(1, Math.abs(finiteOrNull(point.pf) ?? 1)));
  const sign = asset?.q_sign === 'lagging' ? 1 : asset?.q_sign === 'leading' ? -1 : 1;
  const q = asset?.q_sign === 'near_unity' ? qFromPf(apparentVA, pf, sign) : qFromPf(apparentVA, pf, sign);
  return {
    p: apparentVA * pf,
    q,
    source: 'fallback_normalized_pq',
  };
};

const maxMeasuredApparent = asset => {
  const points = Object.values(asset?.points ?? {});
  let max = 0;
  for (const point of points) {
    const p = finiteOrNull(point?.delta_p_w ?? point?.p_w);
    const q = finiteOrNull(point?.delta_q_var ?? point?.q_var);
    if (p === null || q === null) continue;
    max = Math.max(max, Math.hypot(p, q));
  }
  return max;
};

export const modelAssetPower = ({ profiles, assetName, state, voltageV = 230 }) => {
  const asset = getAsset(profiles, assetName);
  const targetCurrent = finiteOrNull(asset?.target_current_a) ?? (
    assetName === 'heatpump' ? BUILDING_TARGETS.heatpumpMaxCurrentA :
      assetName === 'wallbox' ? BUILDING_TARGETS.wallboxMaxCurrentA :
        BUILDING_TARGETS.batteryMaxCurrentA
  );
  const targetVA = Math.max(0, finiteOrNull(voltageV) ?? 230) * Math.max(0, targetCurrent);
  const point = pointFor(asset, state);
  const raw = pointComplexPower(point, asset, targetVA);
  const measuredMax = maxMeasuredApparent(asset);

  if (raw.source === 'calibrated_pq' && measuredMax > 1e-6) {
    const scale = targetVA / measuredMax;
    return {
      p: raw.p * scale,
      q: raw.q * scale,
      targetVA,
      scale,
      source: 'calibrated_pq_scaled_to_building_capacity',
      calibrated: true,
    };
  }

  return {
    p: raw.p,
    q: raw.q,
    targetVA,
    scale: 1,
    source: raw.source,
    calibrated: false,
  };
};

export const modelBuildingPowers = ({
  profiles = DEFAULT_ELECTRICAL_PROFILES,
  heatpumpLevel,
  wallboxMask,
  batteryCharging,
  phaseVoltages = { a: 230, b: 230, c: 230 },
} = {}) => {
  const statesKnown = [heatpumpLevel, wallboxMask, batteryCharging].every(v => v !== null && v !== undefined);
  if (!statesKnown) return null;

  const heatpump = modelAssetPower({
    profiles,
    assetName: 'heatpump',
    state: Number(heatpumpLevel),
    voltageV: phaseVoltages.a,
  });
  const wallbox = modelAssetPower({
    profiles,
    assetName: 'wallbox',
    state: Number(wallboxMask),
    voltageV: phaseVoltages.b,
  });
  const battery = modelAssetPower({
    profiles,
    assetName: 'battery',
    state: batteryCharging === true ? 1 : 0,
    voltageV: phaseVoltages.c,
  });

  return {
    powers: {
      a: { p: heatpump.p, q: heatpump.q },
      b: { p: wallbox.p, q: wallbox.q },
      c: { p: battery.p, q: battery.q },
    },
    assets: { heatpump, wallbox, battery },
    calibrated: heatpump.calibrated && wallbox.calibrated && battery.calibrated,
    provenance: profiles?.provenance ?? DEFAULT_ELECTRICAL_PROFILES.provenance,
  };
};

export const baselineVoltagesFromProfiles = (profiles, fallbackVoltages = null) => {
  const baseline = profiles?.baseline;
  const calibrated = baseline?.calibrated === true;
  const source = calibrated ? 'calibrated_off_state_pcc' : (baseline?.source ?? 'live_fallback');
  const candidate = calibrated ? baseline?.voltages : fallbackVoltages;

  const voltages = {
    a: finiteOrNull(candidate?.a),
    b: finiteOrNull(candidate?.b),
    c: finiteOrNull(candidate?.c),
  };

  if ([voltages.a, voltages.b, voltages.c].some(v => v === null)) {
    return {
      voltages: { ...DEFAULT_ELECTRICAL_PROFILES.baseline.voltages },
      calibrated: false,
      source: 'nominal_230v_fallback',
    };
  }

  return { voltages, calibrated, source };
};

export const profileSummary = profiles => ({
  calibrated: profiles?.baseline?.calibrated === true &&
    ['heatpump', 'wallbox', 'battery'].every(name => {
      const asset = profiles?.assets?.[name];
      return maxMeasuredApparent(asset) > 1e-6;
    }),
  provenance: profiles?.provenance ?? DEFAULT_ELECTRICAL_PROFILES.provenance,
  generatedAt: profiles?.generated_at ?? null,
});

export default {
  BUILDING_TARGETS,
  DEFAULT_ELECTRICAL_PROFILES,
  modelAssetPower,
  modelBuildingPowers,
  baselineVoltagesFromProfiles,
  profileSummary,
};
