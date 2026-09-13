import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

const CONFIRMATION_TOKEN = 'CALIBRATE_REAL_HARDWARE';
const PROFILE_SCHEMA = '1.0';
const SETTLE_HEATPUMP_MS = 8000;
const SETTLE_SWITCH_MS = 4000;
const SAMPLE_WINDOW_MS = 10000;
const MIN_SHELLY_SAMPLES = 4;

const TARGETS = Object.freeze({
  heatpump: { phase: 'a', target_current_a: 40, q_sign: 'lagging' },
  wallbox: { phase: 'b', target_current_a: 64, q_sign: 'near_unity' },
  battery: { phase: 'c', target_current_a: 40, q_sign: 'near_unity' },
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mean = values => {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
};
const boolOrNull = value => {
  if (value === true || value === 1 || value === '1' || value === 'on' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'off' || value === 'false') return false;
  return null;
};

const phaseField = (payload, phase, names) => {
  for (const name of names) {
    const value = finite(payload?.[`${phase}_${name}`]);
    if (value !== null) return value;
  }
  return null;
};

const phaseSnapshot = (payload, phase) => {
  const voltage = phaseField(payload, phase, ['voltage', 'volt']);
  const current = phaseField(payload, phase, ['current', 'amp']);
  const activePower = phaseField(payload, phase, ['act_power', 'active_power', 'power']);
  const apparentPower = phaseField(payload, phase, ['aprt_power', 'apparent_power', 'apparent']);
  const pf = phaseField(payload, phase, ['pf', 'power_factor']);
  const fallbackS = voltage !== null && current !== null ? voltage * current : null;

  return {
    voltage,
    current,
    activePower,
    apparentPower: apparentPower ?? fallbackS,
    pf,
  };
};

const picoPhaseName = value => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (['a', 'l1', '1', 'phase_a', 'phase1'].includes(raw)) return 'a';
  if (['b', 'l2', '2', 'phase_b', 'phase2'].includes(raw)) return 'b';
  if (['c', 'l3', '3', 'phase_c', 'phase3'].includes(raw)) return 'c';
  return null;
};

const ratioFromPair = (fundamental, total) => {
  const f = finite(fundamental);
  const t = finite(total);
  if (f === null || t === null || t <= 1e-9) return null;
  return clamp(Math.abs(f / t), 0, 1);
};

const picoFundamentalRatio = (payload, phase) => {
  const nested = payload?.phases?.[phase] ?? payload?.[phase];
  if (nested && typeof nested === 'object') {
    for (const pair of [
      ['fundamental_rms_a', 'rms_a'],
      ['fundamental_rms', 'rms'],
      ['fundamental_rms_mV', 'rms_mV'],
      ['fundamental_rms_mv', 'rms_mv'],
    ]) {
      const ratio = ratioFromPair(nested[pair[0]], nested[pair[1]]);
      if (ratio !== null) return ratio;
    }
  }

  for (const pair of [
    [`${phase}_fundamental_rms_a`, `${phase}_rms_a`],
    [`${phase}_fundamental_rms`, `${phase}_rms`],
    [`${phase}_fundamental_rms_mV`, `${phase}_rms_mV`],
  ]) {
    const ratio = ratioFromPair(payload?.[pair[0]], payload?.[pair[1]]);
    if (ratio !== null) return ratio;
  }

  const declaredPhase = picoPhaseName(payload?.phase ?? payload?.measurement_phase ?? payload?.channel_phase);
  if (declaredPhase === phase) {
    for (const pair of [
      ['fundamental_rms_a', 'rms_a'],
      ['fundamental_rms', 'rms'],
      ['fundamental_rms_mV', 'rms_mV'],
      ['fundamental_rms_mv', 'rms_mv'],
    ]) {
      const ratio = ratioFromPair(payload?.[pair[0]], payload?.[pair[1]]);
      if (ratio !== null) return ratio;
    }
  }

  return null;
};

const deriveQ = ({ p, s, voltage, current, picoRatio, qSign }) => {
  const sign = qSign === 'leading' ? -1 : 1;
  if (p === null) return { q: null, method: 'missing_active_power' };

  // Prefer a fundamental displacement estimate when Pico provides a usable
  // current fundamental ratio. This avoids treating distortion PF entirely as
  // phase displacement for the VFD/motor branch.
  if (picoRatio !== null && voltage !== null && current !== null) {
    const i1 = Math.max(0, current * picoRatio);
    const s1 = Math.max(0, voltage * i1);
    if (s1 >= Math.abs(p) && s1 > 1e-9) {
      return {
        q: sign * Math.sqrt(Math.max(0, s1 * s1 - p * p)),
        method: 'pico_fundamental_plus_shelly_p',
        fundamental_ratio: picoRatio,
      };
    }
  }

  if (s !== null && s >= Math.abs(p)) {
    return {
      q: sign * Math.sqrt(Math.max(0, s * s - p * p)),
      method: 'shelly_apparent_power',
      fundamental_ratio: picoRatio,
    };
  }

  return { q: 0, method: 'unity_pf_fallback', fundamental_ratio: picoRatio };
};

const aggregateWindow = (energySamples, picoSamples, phase, qSign) => {
  const picoRatios = picoSamples
    .map(item => picoFundamentalRatio(item.payload, phase))
    .filter(Number.isFinite);
  const picoRatio = mean(picoRatios);

  const rows = energySamples.map(item => {
    const s = phaseSnapshot(item.payload, phase);
    const q = deriveQ({
      p: s.activePower,
      s: s.apparentPower,
      voltage: s.voltage,
      current: s.current,
      picoRatio,
      qSign,
    });
    return { ...s, q: q.q, qMethod: q.method };
  });

  const valid = rows.filter(row => row.voltage !== null && row.current !== null && row.activePower !== null);
  if (valid.length < MIN_SHELLY_SAMPLES) {
    throw new Error(`Insufficient Shelly samples for phase ${phase}: ${valid.length}/${MIN_SHELLY_SAMPLES}`);
  }

  const qMethods = [...new Set(valid.map(row => row.qMethod))];
  return {
    voltage_v: mean(valid.map(row => row.voltage)),
    current_a: mean(valid.map(row => row.current)),
    p_w: mean(valid.map(row => row.activePower)),
    s_va: mean(valid.map(row => row.apparentPower).filter(Number.isFinite)),
    pf: mean(valid.map(row => row.pf).filter(Number.isFinite)),
    q_var: mean(valid.map(row => row.q).filter(Number.isFinite)) ?? 0,
    sample_count: valid.length,
    pico_sample_count: picoSamples.length,
    pico_fundamental_ratio: picoRatio,
    q_method: qMethods.join('+') || 'unknown',
  };
};

const ElectricalCalibrationService = {
  name: 'ElectricalCalibrationService',
  running: false,
  cancelRequested: false,
  progress: { stage: 'idle', index: 0, total: 0, message: '' },
  profiles: null,

  _configPath: () => path.resolve(MODULE_DIR, 'config/electrical_profiles.json'),

  _defaultProfiles: () => ({
    schema_version: PROFILE_SCHEMA,
    provenance: 'fallback_pq_device_model_not_calibrated',
    generated_at: null,
    baseline: { calibrated: false, source: 'nominal_fallback', voltages: { a: 230, b: 230, c: 230 } },
    assets: {
      heatpump: { ...TARGETS.heatpump, points: {} },
      wallbox: { ...TARGETS.wallbox, points: {} },
      battery: { ...TARGETS.battery, points: {} },
    },
  }),

  _load: () => {
    const file = ElectricalCalibrationService._configPath();
    try {
      if (!fs.existsSync(file)) return ElectricalCalibrationService._defaultProfiles();
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : ElectricalCalibrationService._defaultProfiles();
    } catch (err) {
      console.error('Electrical profile load failed:', err);
      return ElectricalCalibrationService._defaultProfiles();
    }
  },

  _save: profiles => {
    const file = ElectricalCalibrationService._configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(profiles, null, 2) + '\n', 'utf8');
    ElectricalCalibrationService.profiles = profiles;
  },

  _emitProgress: (stage, index, total, message) => {
    ElectricalCalibrationService.progress = { stage, index, total, message, ts_ms: Date.now() };
    ElectricalCalibrationService.server.emitServiceEvent('ElectricalCalibrationService', 'progress', ElectricalCalibrationService.status());
  },

  _assertNotCancelled: () => {
    if (ElectricalCalibrationService.cancelRequested) throw new Error('Calibration cancelled by operator.');
  },

  _services: () => ({
    energy: ElectricalCalibrationService.server.services.get('EnergyMeterService'),
    pico: ElectricalCalibrationService.server.services.get('PicoService'),
    esp: ElectricalCalibrationService.server.services.get('EspService'),
    wallbox: ElectricalCalibrationService.server.services.get('WallboxService'),
    battery: ElectricalCalibrationService.server.services.get('BatteryService'),
  }),

  _preflight: () => {
    const { energy, esp, wallbox, battery } = ElectricalCalibrationService._services();
    const now = Date.now();
    const energyLatest = energy?._latest?.();
    if (!energyLatest || now - energyLatest.ts_ms > 3000) {
      throw new Error('Calibration preflight failed: Shelly Pro 3EM measurement is missing or stale (>3 s).');
    }

    const branchA = esp?._latestBranchA?.();
    if (!branchA || now - branchA.ts_ms > 5000) {
      throw new Error('Calibration preflight failed: Branch-A execution status is missing or stale (>5 s).');
    }
    const branchState = String(branchA.payload?.state ?? branchA.payload?.drive_state ?? branchA.payload?.safety?.state ?? '').toUpperCase();
    if (['SAFE_MODE', 'FAULT', 'ERROR'].includes(branchState)) {
      throw new Error(`Calibration preflight failed: Branch A is in ${branchState}.`);
    }

    const relays = wallbox?._latestRelays?.() ?? {};
    if (![0, 1].every(id => relays[id] && now - relays[id].ts_ms <= 5000)) {
      throw new Error('Calibration preflight failed: Branch-B Shelly relay status is missing or stale (>5 s).');
    }

    const batteryLatest = battery?._latest?.();
    if (!batteryLatest || now - batteryLatest.ts_ms > 5000) {
      throw new Error('Calibration preflight failed: Battery Shelly switch status is missing or stale (>5 s).');
    }
    return { accepted: true };
  },

  _waitHeatpumpStable: async (targetHz, timeoutMs = 15000) => {
    // The bench has previously shown several-second VFD start delays. Do not
    // capture P/Q only because a fixed timer elapsed: require fresh Branch-A
    // feedback near the requested frequency whenever that feedback is present.
    const { esp } = ElectricalCalibrationService._services();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ElectricalCalibrationService._assertNotCancelled();
      const latest = esp?._latestBranchA?.();
      const payload = latest?.payload ?? {};
      const actual = finite(
        payload.actual_output_frequency_hz ?? payload.actual_hz ?? payload.rfrd_hz ?? payload.atv12?.actual_hz
      );
      const state = String(payload.state ?? payload.drive_state ?? payload.safety?.state ?? '').toUpperCase();
      if (latest && Date.now() - latest.ts_ms <= 3000 && !['SAFE_MODE', 'FAULT', 'ERROR'].includes(state)) {
        if (actual !== null && Math.abs(actual - targetHz) <= 2.5) return { stable: true, actual_hz: actual, state };
      }
      await wait(500);
    }
    throw new Error(`Heat-pump calibration did not reach ${targetHz} Hz within ${timeoutMs / 1000}s.`);
  },

  _waitWallboxMask: async (targetMask, timeoutMs = 6000) => {
    const { wallbox } = ElectricalCalibrationService._services();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ElectricalCalibrationService._assertNotCancelled();
      const relays = wallbox?._latestRelays?.() ?? {};
      const r0 = boolOrNull(relays[0]?.payload?.output ?? relays[0]?.payload?.state);
      const r1 = boolOrNull(relays[1]?.payload?.output ?? relays[1]?.payload?.state);
      const fresh = [0, 1].every(id => relays[id] && Date.now() - relays[id].ts_ms <= 3000);
      const mask = (r0 ? 1 : 0) | (r1 ? 2 : 0);
      if (fresh && r0 !== null && r1 !== null && mask === targetMask) return { stable: true, mask };
      await wait(250);
    }
    throw new Error(`Wallbox calibration relay mask ${targetMask} was not confirmed within ${timeoutMs / 1000}s.`);
  },

  _waitBatteryState: async (targetOn, timeoutMs = 6000) => {
    const { battery } = ElectricalCalibrationService._services();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ElectricalCalibrationService._assertNotCancelled();
      const latest = battery?._latest?.();
      const output = boolOrNull(latest?.payload?.output ?? latest?.payload?.state ?? latest?.payload?.switch0);
      if (latest && Date.now() - latest.ts_ms <= 3000 && output === targetOn) return { stable: true, output };
      await wait(250);
    }
    throw new Error(`Battery calibration state ${targetOn ? 'ON' : 'OFF'} was not confirmed within ${timeoutMs / 1000}s.`);
  },

  _safeAllOff: async () => {
    const { esp, wallbox, battery } = ElectricalCalibrationService._services();
    await Promise.resolve(esp.heatpump({ mode: 'stop', level: 0, target_hz: 0 }));
    await Promise.resolve(wallbox.set(0, false));
    await Promise.resolve(wallbox.set(1, false));
    await Promise.resolve(battery.set(false));
  },

  _setWallboxMask: async mask => {
    const { wallbox } = ElectricalCalibrationService._services();
    await Promise.resolve(wallbox.set(0, (mask & 1) !== 0));
    await Promise.resolve(wallbox.set(1, (mask & 2) !== 0));
  },

  _captureWindow: async (label, qSigns) => {
    ElectricalCalibrationService._assertNotCancelled();
    const { energy, pico } = ElectricalCalibrationService._services();
    const startMs = Date.now();
    await wait(SAMPLE_WINDOW_MS);
    ElectricalCalibrationService._assertNotCancelled();
    const energySamples = energy._samplesSince(startMs);
    const picoSamples = pico?._samplesSince?.(startMs) ?? [];
    return {
      label,
      captured_at: new Date().toISOString(),
      phases: {
        a: aggregateWindow(energySamples, picoSamples, 'a', qSigns.a),
        b: aggregateWindow(energySamples, picoSamples, 'b', qSigns.b),
        c: aggregateWindow(energySamples, picoSamples, 'c', qSigns.c),
      },
    };
  },

  _deltaPoint: (baseline, capture, phase, stateMeta = {}) => {
    const before = baseline.phases[phase];
    const after = capture.phases[phase];
    const deltaP = Math.max(0, (after.p_w ?? 0) - (before.p_w ?? 0));
    const deltaQ = (after.q_var ?? 0) - (before.q_var ?? 0);
    return {
      ...stateMeta,
      delta_p_w: deltaP,
      delta_q_var: deltaQ,
      prototype_current_a: Math.max(0, (after.current_a ?? 0) - (before.current_a ?? 0)),
      prototype_voltage_v: after.voltage_v,
      prototype_pf: after.pf,
      prototype_apparent_va: Math.hypot(deltaP, deltaQ),
      sample_count: after.sample_count,
      pico_sample_count: after.pico_sample_count,
      pico_fundamental_ratio: after.pico_fundamental_ratio,
      q_method: after.q_method,
      captured_at: capture.captured_at,
    };
  },

  _runFullCalibration: async () => {
    const stages = 1 + 5 + 3 + 1;
    let step = 0;
    const { esp, battery } = ElectricalCalibrationService._services();
    const profiles = ElectricalCalibrationService._defaultProfiles();
    profiles.provenance = 'prototype_measured_pq_scaled_to_building_capacity';

    try {
      ElectricalCalibrationService._preflight();
      ElectricalCalibrationService._emitProgress('safe_off', step, stages, 'Switching all controllable devices OFF for baseline capture.');
      await ElectricalCalibrationService._safeAllOff();
      await wait(SETTLE_HEATPUMP_MS);
      await ElectricalCalibrationService._waitHeatpumpStable(0, 15000);
      await ElectricalCalibrationService._waitWallboxMask(0);
      await ElectricalCalibrationService._waitBatteryState(false);
      ElectricalCalibrationService._assertNotCancelled();

      step += 1;
      ElectricalCalibrationService._emitProgress('baseline', step, stages, 'Capturing 10 s all-OFF PCC baseline.');
      const baselineCapture = await ElectricalCalibrationService._captureWindow('all_off_baseline', {
        a: 'lagging', b: 'lagging', c: 'lagging',
      });
      profiles.baseline = {
        calibrated: true,
        source: 'shelly_all_controllable_devices_off_10s',
        captured_at: baselineCapture.captured_at,
        voltages: {
          a: baselineCapture.phases.a.voltage_v,
          b: baselineCapture.phases.b.voltage_v,
          c: baselineCapture.phases.c.voltage_v,
        },
        measured: baselineCapture.phases,
      };

      for (let level = 1; level <= 5; level += 1) {
        ElectricalCalibrationService._assertNotCancelled();
        ElectricalCalibrationService._emitProgress('heatpump', step, stages, `Heat pump level ${level}/5: settle ${SETTLE_HEATPUMP_MS / 1000}s, then sample ${SAMPLE_WINDOW_MS / 1000}s.`);
        const result = await Promise.resolve(esp.heatpump({ mode: 'start', level, target_hz: level * 10 }));
        if (result?.accepted === false) throw new Error(`Heat pump calibration command rejected at level ${level}: ${result.reason}`);
        await wait(SETTLE_HEATPUMP_MS);
        await ElectricalCalibrationService._waitHeatpumpStable(level * 10);
        const capture = await ElectricalCalibrationService._captureWindow(`heatpump_level_${level}`, { a: 'lagging', b: 'lagging', c: 'lagging' });
        profiles.assets.heatpump.points[level] = ElectricalCalibrationService._deltaPoint(
          baselineCapture, capture, 'a', { level, target_hz: level * 10 }
        );
        step += 1;
      }
      profiles.assets.heatpump.points[0] = { level: 0, target_hz: 0, delta_p_w: 0, delta_q_var: 0, prototype_current_a: 0 };
      await Promise.resolve(esp.heatpump({ mode: 'stop', level: 0, target_hz: 0 }));
      await wait(SETTLE_HEATPUMP_MS);

      for (const mask of [1, 2, 3]) {
        ElectricalCalibrationService._assertNotCancelled();
        ElectricalCalibrationService._emitProgress('wallbox', step, stages, `Wallbox relay mask ${mask}/3: settle ${SETTLE_SWITCH_MS / 1000}s, then sample ${SAMPLE_WINDOW_MS / 1000}s.`);
        await ElectricalCalibrationService._setWallboxMask(mask);
        await wait(SETTLE_SWITCH_MS);
        await ElectricalCalibrationService._waitWallboxMask(mask);
        const capture = await ElectricalCalibrationService._captureWindow(`wallbox_mask_${mask}`, { a: 'lagging', b: 'near_unity', c: 'lagging' });
        profiles.assets.wallbox.points[mask] = ElectricalCalibrationService._deltaPoint(
          baselineCapture, capture, 'b', { mask }
        );
        step += 1;
      }
      profiles.assets.wallbox.points[0] = { mask: 0, delta_p_w: 0, delta_q_var: 0, prototype_current_a: 0 };
      await ElectricalCalibrationService._setWallboxMask(0);
      await wait(SETTLE_SWITCH_MS);
      await ElectricalCalibrationService._waitWallboxMask(0);

      ElectricalCalibrationService._assertNotCancelled();
      ElectricalCalibrationService._emitProgress('battery', step, stages, `Battery ON: settle ${SETTLE_SWITCH_MS / 1000}s, then sample ${SAMPLE_WINDOW_MS / 1000}s.`);
      await Promise.resolve(battery.set(true));
      await wait(SETTLE_SWITCH_MS);
      await ElectricalCalibrationService._waitBatteryState(true);
      const batteryCapture = await ElectricalCalibrationService._captureWindow('battery_on', { a: 'lagging', b: 'lagging', c: 'near_unity' });
      profiles.assets.battery.points[1] = ElectricalCalibrationService._deltaPoint(
        baselineCapture, batteryCapture, 'c', { charging: true }
      );
      profiles.assets.battery.points[0] = { charging: false, delta_p_w: 0, delta_q_var: 0, prototype_current_a: 0 };
      step += 1;

      profiles.generated_at = new Date().toISOString();
      profiles.calibration = {
        settle_heatpump_ms: SETTLE_HEATPUMP_MS,
        settle_switch_ms: SETTLE_SWITCH_MS,
        sample_window_ms: SAMPLE_WINDOW_MS,
        completed_steps: step,
        pico_optional: true,
      };

      ElectricalCalibrationService._save(profiles);
      ElectricalCalibrationService.server.emitServiceEvent('ElectricalCalibrationService', 'updated', ElectricalCalibrationService.getModel());
      ElectricalCalibrationService._emitProgress('complete', step, stages, 'Electrical P/Q calibration completed. System is returning to safe OFF state.');
    } finally {
      try { await ElectricalCalibrationService._safeAllOff(); } catch (err) { console.error('Calibration safe-off failed:', err); }
      ElectricalCalibrationService.running = false;
      ElectricalCalibrationService.cancelRequested = false;
      // Publish the terminal running=false state as well. Without this second
      // event the browser could remain visually locked in CALIBRATION RUNNING.
      ElectricalCalibrationService.server.emitServiceEvent('ElectricalCalibrationService', 'progress', ElectricalCalibrationService.status());
    }
  },

  getModel: () => ({
    profiles: ElectricalCalibrationService.profiles ?? ElectricalCalibrationService._load(),
    calibration: {
      running: ElectricalCalibrationService.running,
      progress: ElectricalCalibrationService.progress,
    },
  }),

  status: () => ({
    running: ElectricalCalibrationService.running,
    progress: ElectricalCalibrationService.progress,
    profile_generated_at: ElectricalCalibrationService.profiles?.generated_at ?? null,
    profile_provenance: ElectricalCalibrationService.profiles?.provenance ?? null,
  }),

  startFullCalibration: options => {
    if (options?.confirmation !== CONFIRMATION_TOKEN) {
      return { accepted: false, reason: 'explicit_confirmation_required', required_confirmation: CONFIRMATION_TOKEN };
    }
    if (ElectricalCalibrationService.running) return { accepted: false, reason: 'calibration_already_running' };

    ElectricalCalibrationService.running = true;
    ElectricalCalibrationService.cancelRequested = false;
    ElectricalCalibrationService.progress = { stage: 'starting', index: 0, total: 10, message: 'Starting real-hardware calibration.', ts_ms: Date.now() };

    // Start asynchronously so the Socket.IO RPC returns immediately and does not
    // hit the normal 3 s frontend RPC timeout.
    ElectricalCalibrationService._runFullCalibration().catch(err => {
      console.error('Electrical calibration failed:', err);
      const cancelled = /cancelled by operator/i.test(err.message);
      ElectricalCalibrationService.progress = { stage: cancelled ? 'cancelled' : 'failed', index: 0, total: 10, message: err.message, ts_ms: Date.now() };
      ElectricalCalibrationService.server.emitServiceEvent('ElectricalCalibrationService', 'progress', ElectricalCalibrationService.status());
      ElectricalCalibrationService.running = false;
    });

    return { accepted: true, running: true };
  },

  cancelCalibration: () => {
    if (!ElectricalCalibrationService.running) return { accepted: true, running: false };
    ElectricalCalibrationService.cancelRequested = true;
    return { accepted: true, running: true, cancel_requested: true };
  },

  resetProfiles: options => {
    if (options?.confirmation !== 'RESET_ELECTRICAL_PROFILES') return { accepted: false, reason: 'explicit_confirmation_required' };
    const profiles = ElectricalCalibrationService._defaultProfiles();
    ElectricalCalibrationService._save(profiles);
    ElectricalCalibrationService.server.emitServiceEvent('ElectricalCalibrationService', 'updated', ElectricalCalibrationService.getModel());
    return { accepted: true };
  },

  init: async server => {
    ElectricalCalibrationService.server = server;
    ElectricalCalibrationService.profiles = ElectricalCalibrationService._load();
  },
};

export default ElectricalCalibrationService;
