const mqtt = () => PicoService.server.services.get('MqttService').bus;

const PicoService = {
  name: 'PicoService',

  init: async server => {
    const bus = PicoService.server.services.get('MqttService').bus;

    bus.subscribe('pico/data', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
        return;
      }
    });

    bus.on('message', (topic, message) => {
      if(topic!=='pico/data') return;
      try {
        const payload = JSON.parse(message.toString());
        server.io.emit('PicoService', 'data', payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default PicoService;
