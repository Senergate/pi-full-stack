const mqtt = () => EspService.server.services.get('MqttService').bus;

const EspService = {
  name: 'EspService',

  heatpump: async (load) => {
    console.log('heatpump->', load);
    const bus = EspService.server.services.get('MqttService').bus;
    bus.publish(`heatpump/vfd/control`, `start,${load*10}`);
    return { x: 5 };
  },


  wallbox: async (id, state) => {
    console.log('wallbox->', id, state);
    const bus = EspService.server.services.get('MqttService').bus;
    bus.publish(`wallbox/relay/${id}`, state ? '1' : '0');
    return { x: 5 };
  },

  bypass: async v => {
    console.log('wallbox bypass',v);
    const bus = EspService.server.services.get('MqttService').bus;
    // bus.publish(`wallbox/relay/${id}`, state ? '1' : '0');
    bus.publish(`senergate/config/branchB/compat_safety_bypass`, v ? "1" : '0');
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
        server.io.emit('EspService', 'branchB', payload);
      } catch {
        console.log(message.toString());
      }
    });

    bus.subscribe('senergate/state/branchA/status', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
        return;
      }
    });

    bus.on('message', (topic, message) => {
      if(topic!=='senergate/state/branchA/status') return;
      try {
        const payload = JSON.parse(message.toString());
        server.io.emit('EspService', 'branchA', payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default EspService;
