import fs from 'fs';
import path from 'path';

const MODEL_VERSION = '1.5-pq-calibration';
const CONFIRM_TOKEN = 'CALIBRATE_REAL_HARDWARE';
const SHELLY_TOPIC = 'shellypro3em-ece334e62cdc/status/em:0';
const PICO_TOPIC = 'pico/data';
const BUFFER_MS = 120000;
const DEFAULT_CAPTURE_MS = 10000;
const DEFAULT_SETTLE_MS = 6000;
const PHASES = ['a', 'b', 'c'];
const DEVICE_PHASE = Object.freeze({ heatpump: 'a', wallbox: 'b', battery: 'c' });
const Q_SIGN = Object.freeze({ heatpump: 1, wallbox: 1, battery: 1 });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const avg = values => {
  const valid = values.map(finite).filter(value => value !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};

const modelPath = () => path.resolve(process.cwd(), 'config/electrical_profiles.json');
const defaultModel = () => ({
  schemaVersion: '1.0',
  modelVersion: MODEL_VERSION,
  updatedAt: null,
  baseline: null,
  devices: {
    heatpump: { phase: 'a', qSign: 'lagging', quality: 'uncalibrated', points: {} },
    wallbox: { phase: 'b', qSign: 'near_unity', quality: 'uncalibrated', points: {} },
    battery: { phase: 'c', qSign: 'near_unity', quality: 'uncalibrated', points: {} },
  },
});

const loadModel = () => {
  try {
    return { ...defaultModel(), ...JSON.parse(fs.readFileSync(modelPath(), 'utf8')) };
  } catch {
    return defaultModel();
  }
};

const persistModel = model => {
  const file = modelPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(model, null, 2));
};

const picoRatioForPhase = (payload, phase) => {
  if (!payload || typeof payload !== 'object') return null;
  const candidates = [
    payload?.phases?.[phase]?.fundamental_ratio,
    payload?.phases?.[phase]?.i1_over_irms,
    payload?.[`${phase}_fundamental_ratio`],
    payload?.[`fundamental_ratio_${phase}`],
  ];
  for (const candidate of candidates) {
    const n = finite(candidate);
    if (n !== null && n > 0 && n <= 1.05) return clamp(n, 0, 1);
  }

  const phaseObj = payload?.phases?.[phase] ?? payload?.[phase];
  const i1 = finite(phaseObj?.fundamental_rms_a ?? phaseObj?.fundamental_rms_A ?? phaseObj?.fundamental_rms);
  const irms = finite(phaseObj?.total_rms_a ?? phaseObj?.rms_a ?? phaseObj?.irms);
  if (i1 !== null && irms !== null && irms > 0) return clamp(i1 / irms, 0, 1);
  return null;
};

const buildPhaseElectricalPoint = (summary, phase, qSign = 1) => {
  const voltage = finite(summary?.[`${phase}_voltage`]);
  const current = finite(summary?.[`${phase}_current`]);
  const active = finite(summary?.[`${phase}_act_power`]);
  const apparent = finite(summary?.[`${phase}_aprt_power`]);
  const pf = finite(summary?.[`${phase}_pf`]);
  const fundamentalRatio = finite(summary?.[`${phase}_fundamental_ratio`]);

  if (voltage === null || current === null || active === null) return null;

  let fundamentalCurrent = current;
  let apparentFundamental = null;
  let method = 'shelly_pf_fallback';

  if (fundamentalRatio !== null && fundamentalRatio > 0) {
    fundamentalCurrent = current * clamp(fundamentalRatio, 0, 1);
    apparentFundamental = Math.abs(voltage * fundamentalCurrent);
    method = 'shelly_plus_pico_fundamental';
  } else if (apparent !== null && Math.abs(apparent) > 0) {
    apparentFundamental = Math.abs(apparent);
    method = 'shelly_apparent_power_fallback';
  } else if (pf !== null && Math.abs(pf) > 0.05) {
    apparentFundamental = Math.abs(active / pf);
  } else {
    apparentFundamental = Math.abs(voltage * current);
  }

  const p = active;
  const qMagnitude = Math.sqrt(Math.max(0, apparentFundamental ** 2 - p ** 2));
  const q = (qSign < 0 ? -1 : 1) * qMagnitude;

  return {
    pW: p,
    qVar: q,
    voltageV: voltage,
    currentA: current,
    fundamentalCurrentA: fundamentalCurrent,
    apparentVA: apparentFundamental,
    pfTotal: pf,
    fundamentalRatio,
    method,
  };
};

const subtractPoint = (loaded, baseline) => {
  if (!loaded || !baseline) return null;
  const pW = Math.max(0, Number(loaded.pW) - Number(baseline.pW));
  const qVar = Number(loaded.qVar) - Number(baseline.qVar);
  return {
    pW,
    qVar,
    apparentVA: Math.hypot(pW, qVar),
    source: 'measured_delta_pq',
    loaded,
    baseline,
  };
};

const ElectricalCalibrationService = {
  name: 'ElectricalCalibrationService',
  model: loadModel(),
  shellySamples: [],
  picoSamples: [],
  job: null,

  getModel: () => ElectricalCalibrationService.model,
  getStatus: () => ({
    modelVersion: MODEL_VERSION,
    modelUpdatedAt: ElectricalCalibrationService.model?.updatedAt ?? null,
    job: ElectricalCalibrationService.job,
    latestShellyAgeMs: ElectricalCalibrationService.shellySamples.length
      ? Date.now() - ElectricalCalibrationService.shellySamples.at(-1).ts
      : null,
    latestPicoAgeMs: ElectricalCalibrationService.picoSamples.length
      ? Date.now() - ElectricalCalibrationService.picoSamples.at(-1).ts
      : null,
  }),

  _emitProgress: (stage, detail = {}) => {
    const payload = { ts: Date.now(), stage, ...detail };
    ElectricalCalibrationService.job = {
      ...(ElectricalCalibrationService.job ?? {}),
      ...payload,
    };
    ElectricalCalibrationService.server.emitServiceEvent('ElectricalCalibrationService', 'progress', payload);
  },

  _trim: () => {
    const cutoff = Date.now() - BUFFER_MS;
    ElectricalCalibrationService.shellySamples = ElectricalCalibrationService.shellySamples.filter(item => item.ts >= cutoff);
    ElectricalCalibrationService.picoSamples = ElectricalCalibrationService.picoSamples.filter(item => item.ts >= cutoff);
  },

  _summarizeWindow: (startTs, endTs) => {
    const shelly = ElectricalCalibrationService.shellySamples.filter(item => item.ts >= startTs && item.ts <= endTs);
    if (shelly.length < 3) throw new Error(`Not enough Shelly samples in calibration window (${shelly.length}).`);
    const pico = ElectricalCalibrationService.picoSamples.filter(item => item.ts >= startTs && item.ts <= endTs);

    const result = { samples: shelly.length, picoSamples: pico.length };
    for (const phase of PHASES) {
      for (const suffix of ['voltage', 'current', 'act_power', 'aprt_power', 'pf']) {
        result[`${phase}_${suffix}`] = avg(shelly.map(item => item.payload?.[`${phase}_${suffix}`]));
      }
      result[`${phase}_fundamental_ratio`] = avg(pico.map(item => picoRatioForPhase(item.payload, phase)));
    }
    return result;
  },

  _captureSummary: async (durationMs = DEFAULT_CAPTURE_MS) => {
    const duration = clamp(Number(durationMs) || DEFAULT_CAPTURE_MS, 2000, 30000);
    const startTs = Date.now();
    await sleep(duration);
    return ElectricalCalibrationService._summarizeWindow(startTs, Date.now());
  },

  startBaselineCapture: async (confirmToken, durationMs = DEFAULT_CAPTURE_MS) => {
    if (confirmToken !== 'CAPTURE_PCC_BASELINE') {
      return { accepted: false, reason: 'confirmation_required', requiredToken: 'CAPTURE_PCC_BASELINE' };
    }
    if (ElectricalCalibrationService.job?.running) return { accepted: false, reason: 'calibration_already_running' };
    const jobId = `baseline-${Date.now()}`;
    ElectricalCalibrationService.job = { id: jobId, running: true, stage: 'baseline_queued', startedAt: new Date().toISOString() };
    void (async () => {
      try {
        await ElectricalCalibrationService.captureBaseline(durationMs);
        ElectricalCalibrationService.job = { id: jobId, running: false, stage: 'baseline_complete', finishedAt: new Date().toISOString() };
        ElectricalCalibrationService._emitProgress('baseline_job_complete', { id: jobId });
      } catch (error) {
        ElectricalCalibrationService.job = { id: jobId, running: false, stage: 'baseline_failed', error: error instanceof Error ? error.message : String(error) };
        ElectricalCalibrationService._emitProgress('baseline_job_failed', { id: jobId, error: ElectricalCalibrationService.job.error });
      }
    })();
    return { accepted: true, jobId };
  },

  captureBaseline: async (durationMs = DEFAULT_CAPTURE_MS) => {
    ElectricalCalibrationService._emitProgress('baseline_capture_started');
    const summary = await ElectricalCalibrationService._captureSummary(durationMs);
    const phases = {};
    for (const phase of PHASES) {
      phases[phase] = buildPhaseElectricalPoint(summary, phase, 1);
    }
    ElectricalCalibrationService.model.baseline = {
      ts: new Date().toISOString(),
      summary,
      phases,
      voltageMagnitudes: {
        a: summary.a_voltage,
        b: summary.b_voltage,
        c: summary.c_voltage,
      },
      voltageAngles: { a: 0, b: -120, c: 120 },
      quality: 'measured_pcc_baseline',
    };
    ElectricalCalibrationService.model.updatedAt = new Date().toISOString();
    persistModel(ElectricalCalibrationService.model);
    ElectricalCalibrationService._emitProgress('baseline_capture_complete', { samples: summary.samples });
    return ElectricalCalibrationService.model.baseline;
  },

  captureDevicePoint: async (device, stateKey, durationMs = DEFAULT_CAPTURE_MS) => {
    if (!DEVICE_PHASE[device]) throw new Error(`Unsupported calibration device: ${device}`);
    if (!ElectricalCalibrationService.model.baseline?.phases) throw new Error('Capture baseline before device points.');

    ElectricalCalibrationService._emitProgress('device_capture_started', { device, stateKey });
    const summary = await ElectricalCalibrationService._captureSummary(durationMs);
    const phase = DEVICE_PHASE[device];
    const loaded = buildPhaseElectricalPoint(summary, phase, Q_SIGN[device]);
    const baseline = ElectricalCalibrationService.model.baseline.phases[phase];
    const delta = subtractPoint(loaded, baseline);
    if (!delta) throw new Error(`Cannot derive ${device} P/Q point.`);

    const profile = ElectricalCalibrationService.model.devices[device];
    profile.points[String(stateKey)] = {
      ...delta,
      ts: new Date().toISOString(),
      samples: summary.samples,
      picoSamples: summary.picoSamples,
    };
    profile.quality = summary.picoSamples > 0 ? 'measured_shelly_plus_pico' : 'measured_shelly_pq_fallback';
    ElectricalCalibrationService.model.updatedAt = new Date().toISOString();
    persistModel(ElectricalCalibrationService.model);
    ElectricalCalibrationService._emitProgress('device_capture_complete', { device, stateKey, point: profile.points[String(stateKey)] });
    return profile.points[String(stateKey)];
  },

  startRecommendedCalibration: async (confirmToken, options = {}) => {
    if (confirmToken !== CONFIRM_TOKEN) {
      return { accepted: false, reason: 'confirmation_required', requiredToken: CONFIRM_TOKEN };
    }
    if (ElectricalCalibrationService.job?.running) {
      return { accepted: false, reason: 'calibration_already_running', job: ElectricalCalibrationService.job };
    }

    const settleMs = clamp(Number(options?.settleMs) || DEFAULT_SETTLE_MS, 3000, 15000);
    const captureMs = clamp(Number(options?.captureMs) || DEFAULT_CAPTURE_MS, 3000, 20000);
    const jobId = `pqcal-${Date.now()}`;
    ElectricalCalibrationService.job = { id: jobId, running: true, stage: 'queued', startedAt: new Date().toISOString() };

    void (async () => {
      const esp = ElectricalCalibrationService.server.services.get('EspService');
      const wallbox = ElectricalCalibrationService.server.services.get('WallboxService');
      const battery = ElectricalCalibrationService.server.services.get('BatteryService');
      try {
        ElectricalCalibrationService._emitProgress('safe_baseline_state', { id: jobId });
        await esp.heatpump({ mode: 'stop', level: 0, target_hz: 0 });
        await wallbox.set(0, false);
        await wallbox.set(1, false);
        await battery.set(false);
        await sleep(settleMs);
        await ElectricalCalibrationService.captureBaseline(captureMs);

        for (const level of [1, 2, 3, 4, 5]) {
          ElectricalCalibrationService._emitProgress('heatpump_setpoint', { level });
          await esp.heatpump({ mode: 'start', level, target_hz: level * 10 });
          await sleep(settleMs);
          await ElectricalCalibrationService.captureDevicePoint('heatpump', level, captureMs);
        }
        await esp.heatpump({ mode: 'stop', level: 0, target_hz: 0 });
        await sleep(settleMs);

        for (const mask of [1, 2, 3]) {
          await wallbox.set(0, (mask & 1) !== 0);
          await wallbox.set(1, (mask & 2) !== 0);
          ElectricalCalibrationService._emitProgress('wallbox_setpoint', { mask });
          await sleep(settleMs);
          await ElectricalCalibrationService.captureDevicePoint('wallbox', mask, captureMs);
        }
        await wallbox.set(0, false);
        await wallbox.set(1, false);
        await sleep(settleMs);

        await battery.set(true);
        ElectricalCalibrationService._emitProgress('battery_setpoint', { charging: true });
        await sleep(settleMs);
        await ElectricalCalibrationService.captureDevicePoint('battery', 'on', captureMs);
        await battery.set(false);

        ElectricalCalibrationService.model.devices.heatpump.points['0'] = { pW: 0, qVar: 0, apparentVA: 0, source: 'baseline_zero' };
        ElectricalCalibrationService.model.devices.wallbox.points['0'] = { pW: 0, qVar: 0, apparentVA: 0, source: 'baseline_zero' };
        ElectricalCalibrationService.model.devices.battery.points.off = { pW: 0, qVar: 0, apparentVA: 0, source: 'baseline_zero' };
        ElectricalCalibrationService.model.updatedAt = new Date().toISOString();
        persistModel(ElectricalCalibrationService.model);

        ElectricalCalibrationService.job = {
          id: jobId,
          running: false,
          stage: 'complete',
          startedAt: ElectricalCalibrationService.job.startedAt,
          finishedAt: new Date().toISOString(),
        };
        ElectricalCalibrationService._emitProgress('calibration_complete', { id: jobId });
      } catch (error) {
        try {
          await esp.heatpump({ mode: 'stop', level: 0, target_hz: 0 });
          await wallbox.set(0, false);
          await wallbox.set(1, false);
          await battery.set(false);
        } catch {}
        ElectricalCalibrationService.job = {
          id: jobId,
          running: false,
          stage: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
        ElectricalCalibrationService._emitProgress('calibration_failed', { id: jobId, error: ElectricalCalibrationService.job.error });
      }
    })();

    return { accepted: true, jobId, settleMs, captureMs };
  },

  init: async server => {
    ElectricalCalibrationService.server = server;
    const bus = server.services.get('MqttService').bus;
    for (const topic of [SHELLY_TOPIC, PICO_TOPIC]) {
      bus.subscribe(topic, { qos: 1 }, err => {
        if (err) console.error(`ElectricalCalibrationService subscribe failed: ${topic}`, err);
      });
    }
    bus.on('message', (topic, message) => {
      if (topic !== SHELLY_TOPIC && topic !== PICO_TOPIC) return;
      try {
        const payload = JSON.parse(message.toString());
        const item = { ts: Date.now(), payload };
        if (topic === SHELLY_TOPIC) ElectricalCalibrationService.shellySamples.push(item);
        else ElectricalCalibrationService.picoSamples.push(item);
        ElectricalCalibrationService._trim();
      } catch {}
    });
    console.log(`ElectricalCalibrationService ready: ${modelPath()}`);
  },
};

export default ElectricalCalibrationService;
