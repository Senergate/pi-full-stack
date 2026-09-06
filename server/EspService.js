const HEATPUMP_MAX_HZ = 50;
const HEATPUMP_ZERO_HOLD_THRESHOLD_HZ = 2;
const HEATPUMP_LEVEL_TO_HZ = Object.freeze({
  0: 0,
  1: 10,
  2: 20,
  3: 30,
  4: 40,
  5: 50,
});

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
      message: 'Use { mode, level, target_hz }; normalized numeric load is not allowed in the execution path.',
    };
  }

  const mode = String(command.mode ?? '').toLowerCase();
  const level = clampInt(command.level, 0, 5);
  const targetHzFromCommand = finiteNumber(command.target_hz ?? command.targetHz);
  const targetHz = targetHzFromCommand ?? (level === null ? null : HEATPUMP_LEVEL_TO_HZ[level]);

  if (mode === 'stop') {
    return { accepted: true, mode, level: 0, target_hz: 0, payload: 'stop,0' };
  }

  if (mode === 'zero_hold') {
    return { accepted: true, mode, level: 0, target_hz: 0, payload: 'start,0' };
  }

  if (mode === 'start') {
    if (level === null || level < 1 || level > 5) {
      return { accepted: false, reason: 'invalid_heatpump_level', message: `Heatpump start requires level 1..5, got ${command.level}` };
    }

    if (targetHz === null || targetHz <= HEATPUMP_ZERO_HOLD_THRESHOLD_HZ || targetHz > HEATPUMP_MAX_HZ) {
      return {
        accepted: false,
        reason: 'invalid_target_hz',
        message: `Heatpump start requires ${HEATPUMP_ZERO_HOLD_THRESHOLD_HZ}<target_hz<=${HEATPUMP_MAX_HZ}, got ${targetHz}`,
      };
    }

    return { accepted: true, mode, level, target_hz: targetHz, payload: `start,${formatHz(targetHz)}` };
  }

  return { accepted: false, reason: 'invalid_heatpump_mode', message: `Unsupported heatpump mode: ${command.mode}` };
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

    console.log('heatpump->', {
      command,
      mode: normalized.mode,
      level: normalized.level,
      target_hz: normalized.target_hz,
      payload: normalized.payload,
    });

    mqtt().publish('heatpump/vfd/control', normalized.payload);
    return normalized;
  },

  wallbox: async (id, state) => {
    console.log('wallbox->', id, state);
    mqtt().publish(`wallbox/relay/${id}`, state ? '1' : '0');
    return { accepted: true, id, state: state === true };
  },

  bypass: async v => {
    console.log('wallbox bypass', v);
    mqtt().publish('senergate/config/branchB/compat_safety_bypass', v ? '1' : '0');
    return { accepted: true, bypass: v === true };
  },

  requestUpdate: async () => {
    const bus = mqtt();
    bus.publish('senergate/sys/request/status', '1');
    bus.publish('senergate/sys/request/branchA/status', '1');
    bus.publish('senergate/sys/request/branchB/status', '1');
    return { accepted: true };
  },

  init: async server => {
    const bus = mqtt();
    const topics = [
      'senergate/state/branchA/status',
      'senergate/state/branchA/ack',
      'senergate/state/branchB/status',
      'senergate/state/branchB/ack',
    ];

    for (const topic of topics) {
      bus.subscribe(topic, { qos: 1 }, err => {
        if (err) console.error(`Subscribe failed for ${topic}:`, err);
      });
    }

    bus.on('message', (topic, message) => {
      const payload = parseJson(message);
      if (!payload) return;

      if (topic === 'senergate/state/branchA/status') server.io.emit('EspService', 'branchA', payload);
      if (topic === 'senergate/state/branchA/ack') server.io.emit('EspService', 'branchA_ack', payload);
      if (topic === 'senergate/state/branchB/status') server.io.emit('EspService', 'branchB', payload);
      if (topic === 'senergate/state/branchB/ack') server.io.emit('EspService', 'branchB_ack', payload);
    });
  },
};

export default EspService;
