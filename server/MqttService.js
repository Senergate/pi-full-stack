import Aedes from 'aedes';
import net from 'net';
import mqtt from 'mqtt';

import config from './config.js';

const MqttService = {
  name: 'MqttService',

  createMqttClient: () => {
    return mqtt.connect(`mqtt://localhost:${config.mqtt_port}`, {
      clientId: `senergate-server-${Math.random().toString(16).slice(2, 8)}`,
    });
  },

  init: async server => {
    console.log('init mqtt service');

    {
      console.log('connect to mqtt bus ...');
      MqttService.bus = MqttService.createMqttClient();
      MqttService.bus.on('connect', () => {
        console.log('mqtt bus connected');
      });
    }
  },
};

export default MqttService;
