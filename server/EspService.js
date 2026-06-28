const mqtt = () => EspService.server.services.get('MqttService').bus;

const EspService = {
  name: 'EspService',
  wallbox: async (id, state) => {
    console.log('wallbox->', id, state);

    // EspService.server.io.emit('EspService', 'update', { x: 99 });

    return { x: 5 };
  },

  init: async server => {
    const bus = EspService.server.services.get('MqttService').bus;

    bus.subscribe('#', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
        return;
      }
    });

    bus.on('message', (topic, message) => {
      console.log(`Received on ${topic}:`);

      try {
        const payload = JSON.parse(message.toString());
        console.log(payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default EspService;
