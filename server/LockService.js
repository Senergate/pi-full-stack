import mqtt from 'mqtt';

const LockService = {
  name: 'LockService',

  _: {
    id: '492EAA87',
    connected: false,
    state: -1,
  },

  getState: async () => {
    return LockService._;
  },

  unlock: async () => {
    const api = `nuki/${LockService._.id}/unlock`;
    console.log(api);
    LockService.mqttClient.publish(api, `true`, { qos: 2 });
  },

  lock: async () => {
    const api = `nuki/${LockService._.id}/lock`;
    console.log(api);
    LockService.mqttClient.publish(api, `true`, { qos: 2 });
  },

  init: async server => {
    console.log('init lock service');

    const mqttService = server.services.get('MqttService');
    LockService.mqttClient = mqttService.createMqttClient();

    const update = () => {
      server.io.emit('LockService', 'update', LockService._);
    };

    LockService.mqttClient.on('connect', () => {
      console.log('MQTT LockService connected to broker');
      LockService.mqttClient.subscribe('nuki/#', err => {
        if (!err) console.log('Subscribed to nuki/#');
      });
    });

    LockService.mqttClient.on('message', (topic, message) => {
      console.log(`[MQTT LockService] ${topic}: ${message.toString()}`);
      if (topic === `nuki/${LockService._.id}/connected`) {
        LockService._.connected = message.toString() === 'true';
        update();
      } else if (topic === `nuki/${LockService._.id}/state`) {
        LockService._.state = parseInt(message.toString());
        update();
      }
    });
  },
};

export default LockService;
