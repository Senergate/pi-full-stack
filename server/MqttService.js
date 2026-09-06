import mqtt from 'mqtt';
import config from './config.js';

const MqttService = {
  name: 'MqttService',
  connected: false,

  createMqttClient: () =>
    mqtt.connect(`mqtt://localhost:${config.mqtt_port}`, {
      clientId: `senergate-server-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 1000,
    }),

  init: async () => {
    console.log('init mqtt service');
    MqttService.bus = MqttService.createMqttClient();

    MqttService.bus.on('connect', () => {
      MqttService.connected = true;
      console.log('mqtt bus connected');
    });

    MqttService.bus.on('offline', () => {
      MqttService.connected = false;
      console.warn('mqtt bus offline');
    });

    MqttService.bus.on('error', err => {
      MqttService.connected = false;
      console.error('mqtt bus error:', err.message);
    });
  },
};

export default MqttService;
