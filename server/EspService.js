const mqtt = () => EspService.server.services.get('MqttService').bus;

const EspService = {
  name: 'EspService',
  wallbox: async (id, state) => {
    console.log('wallbox->', id, state);
    const bus = EspService.server.services.get('MqttService').bus;
    bus.publish(`wallbox/relay/${id}`, state ? '1' : '0');
    return { x: 5 };
  },

  init: async server => {
    const bus = EspService.server.services.get('MqttService').bus;

    bus.subscribe('senergate/state/branchB/status', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
        return;
      }
    });

    bus.on('message', (topic, message) => {
      if(topic!=='senergate/state/branchB/status') return;
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
