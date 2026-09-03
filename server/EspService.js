const mqtt = () => EspService.server.services.get('MqttService').bus;

const EspService = {
  name: 'EspService',

  heatpump: async (load, mode = 'auto') => {
    const bus = EspService.server.services.get('MqttService').bus;
    const numericLoad = Number(load);
    const safeLoad = Number.isFinite(numericLoad) ? Math.max(0, numericLoad) : 0;
    const hz = safeLoad * 10;

    /*
     * Senergate merge decision 3C:
     * - OFF must be a real STOP command: stop,0.
     * - ZERO_HOLD remains available explicitly: start,0.
     * - Positive levels continue to use start,<hz>.
     */
    let payload;
    if (mode === 'zero_hold') {
      payload = 'start,0';
    } else if (mode === 'stop' || hz <= 0) {
      payload = 'stop,0';
    } else {
      payload = `start,${hz}`;
    }

    console.log('heatpump->', { load: safeLoad, mode, payload });
    bus.publish(`heatpump/vfd/control`, payload);
    return { accepted: true, payload };
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
