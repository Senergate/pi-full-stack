const BatteryService = {
  name: 'BatteryService',
  set: (discharging) => {
    const bus = BatteryService.server.services.get('MqttService').bus;
    bus.publish(`shelly-battery/command/switch:0`, discharging ? 'on' : 'off');
  },
  requestUpdate: () => {
    const bus = BatteryService.server.services.get('MqttService').bus;
    bus.publish(`shelly-battery/command/switch:0`, 'status_update');
  },
  init: async server => {
    BatteryService.server = server;
    const bus = server.services.get('MqttService').bus;
    bus.subscribe('shelly-battery/status/#', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
      }
    });
    bus.on('message', (topic, message) => {
      if (!topic.startsWith('shelly-battery/status/switch:')) {
        return;
      }
      try {
        const payload = JSON.parse(message.toString());
        server.io.emit('BatteryService', 'data', payload);
      } catch (err) {
        console.error(`Invalid MQTT payload on ${topic}:`, err);
      }
    });
  },
};

export default BatteryService;
