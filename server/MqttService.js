import Aedes from 'aedes';
import net from 'net';
import mqtt from 'mqtt';

import config from './config.js';

const MqttService = {
  name: 'MqttService',

  _: {
    usr: 'test',
    pwd: 'test',
  },

  createMqttClient: () => {
	  //return mqtt.connect(`mqtt://${config.pi_ip}:${config.mqtt_port}`, {
    return mqtt.connect(`mqtt://localhost:${config.mqtt_port}`, {
      clientId: `senergate-server-${Math.random().toString(16).slice(2, 8)}`,
      username: MqttService._.usr,
      password: MqttService._.pwd,
    });
  },

  init: async server => {
    console.log('init mqtt service');

    {
      console.log('create broker ...');
      const aedes = await Aedes.createBroker({
        protocolVersion: 4,
      });
      aedes.authenticate = function (client, username, password, callback) {
        const ok = true;
        console.log('AUTH', client.id, username, ok);
        // const ok = username === MqttService._.usr && password?.toString() === MqttService._.pwd;
        // console.log('AUTH', client.id, username, ok);
        callback(ok ? null : new Error('Auth failed'), ok);
      };

      net
        .createServer(aedes.handle)
        .listen(config.mqtt_port, () => console.log(`Broker on ${config.pi_ip}:${config.mqtt_port}`));

      aedes.on('client', client => console.log('Client Connected', client?.id));
      aedes.on('clientError', (client, err) => console.log('clientError', client?.id, err.message));
      aedes.on('connectionError', (client, err) => console.log('connectionError', err.message));
    }

    {
      console.log('create mqtt bus ...');
      MqttService.bus = MqttService.createMqttClient();
      MqttService.bus.on('connect', () => {
        console.log('mqtt bus connected');
      });
    }
  },
};

export default MqttService;
