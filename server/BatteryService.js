const boolOrNull = value => {
  if (value === true || value === 1 || value === '1' || value === 'on' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'off' || value === 'false') return false;
  return null;
};

const normalizeSwitchStatus = payload => ({
  ...payload,
  id: Number.isFinite(Number(payload?.id)) ? Number(payload.id) : 0,
  output: boolOrNull(payload?.output ?? payload?.state ?? payload?.switch0),
});

const BatteryService = {
  name: 'BatteryService',

  // Physical Branch-C command: true = charger ON, false = charger OFF.
  // Discharge remains Digital-Twin-only in the current prototype.
  set: charging => {
    const bus = BatteryService.server.services.get('MqttService').bus;
    const output = charging === true;
    bus.publish('shelly-battery/command/switch:0', output ? 'on' : 'off');
    return { accepted: true, charging: output };
  },

  requestUpdate: () => {
    const bus = BatteryService.server.services.get('MqttService').bus;
    bus.publish('shelly-battery/command/switch:0', 'status_update');
    return { accepted: true };
  },

  init: async server => {
    BatteryService.server = server;
    const bus = server.services.get('MqttService').bus;
    bus.subscribe('shelly-battery/status/#', { qos: 1 }, err => {
      if (err) console.error('Subscribe failed:', err);
    });

    bus.on('message', (topic, message) => {
      if (!topic.startsWith('shelly-battery/status/switch:')) return;
      try {
        const payload = normalizeSwitchStatus(JSON.parse(message.toString()));
        server.io.emit('BatteryService', 'data', payload);
      } catch (err) {
        console.error(`Invalid MQTT payload on ${topic}:`, err);
      }
    });
  },
};

export default BatteryService;
