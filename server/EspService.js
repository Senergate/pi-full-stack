const HEATPUMP_MAX_HZ = 50;
const HEATPUMP_ZERO_HOLD_THRESHOLD_HZ = 2;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });

const mqtt = () => EspService.server.services.get('MqttService').bus;

const finiteNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clampInt = (value, min, max) => {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const formatHz = value => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export const normalizeHeatpumpCommand = command => {
  if (command === null || command === undefined || typeof command !== 'object' || Array.isArray(command)) {
    return {
      accepted: false,
      reason: 'legacy_normalized_load_rejected',
      message: 'Use { mode, level, target_hz }. Numeric 0..1 load is forbidden in execution path.',
    };
  }

  const mode = String(command.mode ?? '').toLowerCase();
  const level = clampInt(command.level, 0, 5);
  const targetHz = finiteNumber(command.target_hz ?? command.targetHz) ?? (level === null ? null : HEATPUMP_LEVEL_TO_HZ[level]);

  if (mode === 'stop') return { accepted: true, mode, level: 0, target_hz: 0, payload: 'stop,0' };
  if (mode === 'zero_hold') return { accepted: true, mode, level: 0, target_hz: 0, payload: 'start,0' };

  if (mode === 'start') {
    if (level === null || level < 1 || level > 5) {
      return { accepted: false, reason: 'invalid_heatpump_level', message: `start requires level 1..5, got ${command.level}` };
    }

    if (targetHz === null || targetHz <= HEATPUMP_ZERO_HOLD_THRESHOLD_HZ || targetHz > HEATPUMP_MAX_HZ) {
      return {
        accepted: false,
        reason: 'invalid_target_hz',
        message: `start requires ${HEATPUMP_ZERO_HOLD_THRESHOLD_HZ}<target_hz<=${HEATPUMP_MAX_HZ}, got ${targetHz}`,
      };
    }

    return { accepted: true, mode, level, target_hz: targetHz, payload: `start,${formatHz(targetHz)}` };
  }

  return { accepted: false, reason: 'invalid_heatpump_mode', message: `unsupported heatpump mode: ${command.mode}` };
};

const parseJson = message => {
  try {
    return JSON.parse(message.toString());
  } catch {
    return null;
  }
};

const EspService = {
  name: 'EspService',
  latestBranchAStatus: null,
  latestBranchAAck: null,

  _latestBranchA: () => EspService.latestBranchAStatus,

  heatpump: async command => {
    const normalized = normalizeHeatpumpCommand(command);

    if (!normalized.accepted) {
      console.warn('heatpump rejected ->', normalized);
      return normalized;
    }

    console.log('heatpump->', { command, ...normalized });
    mqtt().publish('heatpump/vfd/control', normalized.payload);
    return normalized;
  },

  requestUpdate: async () => {
    mqtt().publish('senergate/sys/request/status', '1');
    mqtt().publish('senergate/sys/request/branchA/status', '1');
    return { accepted: true };
  },

  init: async server => {
    const bus = mqtt();
    for (const topic of [
      'senergate/state/branchA/status',
      'senergate/state/branchA/ack',
    ]) {
      bus.subscribe(topic, { qos: 1 }, err => {
        if (err) console.error(`Subscribe failed for ${topic}:`, err);
      });
    }

    bus.on('message', (topic, message) => {
      const payload = parseJson(message);
      if (!payload) return;

      if (topic === 'senergate/state/branchA/status') {
        EspService.latestBranchAStatus = { ts_ms: Date.now(), payload };
        server.emitServiceEvent('EspService', 'branchA', payload);
      }
      if (topic === 'senergate/state/branchA/ack') {
        EspService.latestBranchAAck = { ts_ms: Date.now(), payload };
        server.emitServiceEvent('EspService', 'branchA_ack', payload);
      }
    });
  },
};

export default EspService;
