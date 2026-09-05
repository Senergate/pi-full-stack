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
  const mappedHz = level === null ? null : HEATPUMP_LEVEL_TO_HZ[level];
  const targetHz = targetHzFromCommand ?? mappedHz;

  if (mode === 'stop') {
    return {
      accepted: true,
      mode,
      level: 0,
      target_hz: 0,
      payload: 'stop,0',
    };
  }

  if (mode === 'zero_hold') {
    return {
      accepted: true,
      mode,
      level: 0,
      target_hz: 0,
      payload: 'start,0',
    };
  }

  if (mode === 'start') {
    if (level === null || level < 1 || level > 5) {
      return {
        accepted: false,
        reason: 'invalid_heatpump_level',
        message: `Heatpump start requires level 1..5, got ${command.level}`,
      };
    }

    if (targetHz === null || targetHz <= HEATPUMP_ZERO_HOLD_THRESHOLD_HZ || targetHz > HEATPUMP_MAX_HZ) {
      return {
        accepted: false,
        reason: 'invalid_target_hz',
        message: `Heatpump start requires ${HEATPUMP_ZERO_HOLD_THRESHOLD_HZ}<target_hz<=${HEATPUMP_MAX_HZ}, got ${targetHz}`,
      };
    }

    return {
      accepted: true,
      mode,
      level,
      target_hz: targetHz,
      payload: `start,${formatHz(targetHz)}`,
    };
  }

  return {
    accepted: false,
    reason: 'invalid_heatpump_mode',
    message: `Unsupported heatpump mode: ${command.mode}`,
  };
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

    const bus = mqtt();
    bus.publish('heatpump/vfd/control', normalized.payload);
    return normalized;
  },

  wallbox: async (id, state) => {
    console.log('wallbox->', id, state);
    const bus = mqtt();
    bus.publish(`wallbox/relay/${id}`, state ? '1' : '0');
    return { x: 5 };
  },

  bypass: async v => {
    console.log('wallbox bypass', v);
    const bus = mqtt();
    bus.publish('senergate/config/branchB/compat_safety_bypass', v ? '1' : '0');
    return { x: 5 };
  },

  requestUpdate: async () => {
    // Best-effort status request. Older ESP32 firmware may ignore these topics;
    // the dashboard still updates from periodic senergate/state/branch*/status.
    const bus = mqtt();
    bus.publish('senergate/sys/request/status', '1');
    bus.publish('senergate/sys/request/branchA/status', '1');
    bus.publish('senergate/sys/request/branchB/status', '1');
    return { accepted: true };
  },

  init: async server => {
    const bus = mqtt();

    bus.subscribe('senergate/state/branchB/status', { qos: 1 }, err => {
      if (err) console.error('Subscribe failed:', err);
    });

    bus.subscribe('senergate/state/branchB/ack', { qos: 1 }, err => {
      if (err) console.error('Subscribe failed:', err);
    });

    bus.subscribe('senergate/state/branchA/status', { qos: 1 }, err => {
      if (err) console.error('Subscribe failed:', err);
    });

    bus.subscribe('senergate/state/branchA/ack', { qos: 1 }, err => {
      if (err) console.error('Subscribe failed:', err);
    });

    bus.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (topic === 'senergate/state/branchA/status') server.io.emit('EspService', 'branchA', payload);
        if (topic === 'senergate/state/branchA/ack') server.io.emit('EspService', 'branchA_ack', payload);
        if (topic === 'senergate/state/branchB/status') server.io.emit('EspService', 'branchB', payload);
        if (topic === 'senergate/state/branchB/ack') server.io.emit('EspService', 'branchB_ack', payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default EspService;
