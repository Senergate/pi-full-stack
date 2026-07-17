const WallboxService = {
  name: 'WallboxService',
  set: (id, state) => {
    const bus = WallboxService.server.services.get('MqttService').bus;
    bus.publish(`branch-b-shelly/command/switch:${id}`, state ? 'on' : 'off');
  },
  requestUpdate: () => {
    const bus = WallboxService.server.services.get('MqttService').bus;
    bus.publish(`branch-b-shelly/command/switch:0`, 'status_update');
    bus.publish(`branch-b-shelly/command/switch:1`, 'status_update');
  },
  init: async server => {
    WallboxService.server = server;
    const bus = server.services.get('MqttService').bus;
    bus.subscribe('branch-b-shelly/status/#', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
      }
    });
    bus.on('message', (topic, message) => {
      if (!topic.startsWith('branch-b-shelly/status/switch:')) {
        return;
      }
      try {
        const payload = JSON.parse(message.toString());
        server.io.emit('WallboxService', 'data', payload);
      } catch (err) {
        console.error(`Invalid MQTT payload on ${topic}:`, err);
      }
    });
  },
};

export default WallboxService;
