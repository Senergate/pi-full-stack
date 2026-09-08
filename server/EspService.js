const HEATPUMP_MAX_HZ = 50;
const HEATPUMP_ZERO_HOLD_THRESHOLD_HZ = 2;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({ 0: 0, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 });
const HEATPUMP_LEVEL_TARGET_TOLERANCE_HZ = 0.05;

const mqtt = () => EspService.server.services.get('MqttService').bus;

const finiteNumber = value => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const strictIntInRange = (value, min, max) => {
  const parsed = finiteNumber(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
};

const own = (object, key) => Object.prototype.hasOwnProperty.call(object ?? {}, key);

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
  const level = strictIntInRange(command.level, 0, 5);
  const hasTargetHz = own(command, 'target_hz') || own(command, 'targetHz');
  const suppliedTargetHz = hasTargetHz ? finiteNumber(command.target_hz ?? command.targetHz) : null;

  // STOP/ZERO_HOLD preserve the Branch-A invariant: their effective target is always 0 Hz.
  if (mode === 'stop') return { accepted: true, mode, level: 0, target_hz: 0, payload: 'stop,0' };
  if (mode === 'zero_hold') return { accepted: true, mode, level: 0, target_hz: 0, payload: 'start,0' };

  if (mode === 'start') {
    if (level === null || level < 1 || level > 5) {
      return { accepted: false, reason: 'invalid_heatpump_level', message: `start requires integer level 1..5, got ${command.level}` };
    }

    const expectedTargetHz = HEATPUMP_LEVEL_TO_HZ[level];

    if (hasTargetHz && suppliedTargetHz === null) {
      return {
        accepted: false,
        reason: 'invalid_target_hz',
        message: `target_hz must be numeric when supplied, got ${command.target_hz ?? command.targetHz}`,
      };
    }

    if (suppliedTargetHz !== null && (suppliedTargetHz <= HEATPUMP_ZERO_HOLD_THRESHOLD_HZ || suppliedTargetHz > HEATPUMP_MAX_HZ)) {
      return {
        accepted: false,
        reason: 'invalid_target_hz',
        message: `start requires ${HEATPUMP_ZERO_HOLD_THRESHOLD_HZ}<target_hz<=${HEATPUMP_MAX_HZ}, got ${suppliedTargetHz}`,
      };
    }

    // P0-2: level and target_hz are one canonical discrete command pair.
    // A contradictory pair is rejected instead of letting REAL and Simulation diverge.
    if (suppliedTargetHz !== null && Math.abs(suppliedTargetHz - expectedTargetHz) > HEATPUMP_LEVEL_TARGET_TOLERANCE_HZ) {
      return {
        accepted: false,
        reason: 'heatpump_level_target_mismatch',
        message: `level ${level} requires target_hz=${expectedTargetHz}, got ${suppliedTargetHz}`,
        expected_target_hz: expectedTargetHz,
      };
    }

    // If target_hz is omitted, derive it from the level; otherwise canonicalize to the same mapped value.
    return { accepted: true, mode, level, target_hz: expectedTargetHz, payload: `start,${formatHz(expectedTargetHz)}` };
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

  wallbox: async (id, state) => {
    const relayId = Number(id);
    const output = state === true;
    console.log('wallbox->', { relayId, output });
    mqtt().publish(`wallbox/relay/${relayId}`, output ? '1' : '0');
    return { accepted: true, relayId, output };
  },

  bypass: async value => {
    const enabled = value === true;
    console.log('wallbox bypass', enabled);
    mqtt().publish('senergate/config/branchB/compat_safety_bypass', enabled ? '1' : '0');
    return { accepted: true, enabled };
  },

  requestUpdate: async () => {
    mqtt().publish('senergate/sys/request/status', '1');
    mqtt().publish('senergate/sys/request/branchA/status', '1');
    mqtt().publish('senergate/sys/request/branchB/status', '1');
    return { accepted: true };
  },

  init: async server => {
    const bus = mqtt();
    for (const topic of [
      'senergate/state/branchA/status',
      'senergate/state/branchA/ack',
      'senergate/state/branchB/status',
      'senergate/state/branchB/ack',
    ]) {
      bus.subscribe(topic, { qos: 1 }, err => {
        if (err) console.error(`Subscribe failed for ${topic}:`, err);
      });
    }

    bus.on('message', (topic, message) => {
      const payload = parseJson(message);
      if (!payload) return;

      if (topic === 'senergate/state/branchA/status') server.emitServiceEvent('EspService', 'branchA', payload);
      if (topic === 'senergate/state/branchA/ack') server.emitServiceEvent('EspService', 'branchA_ack', payload);
      if (topic === 'senergate/state/branchB/status') server.emitServiceEvent('EspService', 'branchB', payload);
      if (topic === 'senergate/state/branchB/ack') server.emitServiceEvent('EspService', 'branchB_ack', payload);
    });
  },
};

export default EspService;
