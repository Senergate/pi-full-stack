import Aedes from 'aedes';
import net from 'net';
import mqtt from 'mqtt';

const MqttService = {
  name: 'MqttService',

  _: {
    ip: '192.168.178.222',
    port: 1884,
    usr: 'test',
    pwd: 'test',
  },

  createMqttClient: () => {
    return mqtt.connect(`mqtt://${MqttService._.ip}:${MqttService._.port}`, {
      clientId: `senergate-device-${Math.random().toString(16).slice(2, 8)}`,
      username: MqttService._.usr,
      password: MqttService._.pwd,
    });
  },

  init: async server => {
    console.log('init mqtt service');

    const aedes = await Aedes.createBroker({
      protocolVersion: 4,
    });
    aedes.authenticate = function (client, username, password, callback) {
      const ok = true;
      // const ok = username === MqttService._.usr && password?.toString() === MqttService._.pwd;
      console.log('AUTH', client.id, username, ok);
      callback(ok ? null : new Error('Auth failed'), ok);
    };

    net
      .createServer(aedes.handle)
      .listen(MqttService._.port, () => console.log(`Broker on ${MqttService._.ip}:${MqttService._.port}`));

    aedes.on('client', client => console.log('Client Connected', client?.id));
    aedes.on('clientError', (client, err) => console.log('clientError', client?.id, err.message));
    aedes.on('connectionError', (client, err) => console.log('connectionError', err.message));

    setTimeout(() => {
      console.log('now');

      const test = MqttService.createMqttClient();
      test.on('connect', () => {
        console.log('connected');

        test.subscribe('#', { qos: 1 }, err => {
          if (err) {
            console.error('Subscribe failed:', err);
            return;
          }

          console.log('Subscribed to devices/demo/command');
        });

        test.on('message', (topic, message) => {
          console.log(`Received on ${topic}:`);

          try {
            const payload = JSON.parse(message.toString());
            console.log(payload);
          } catch {
            console.log(message.toString());
          }
        });

        // setInterval(() => {
        //   console.log('publish');
        //   test.publish(
        //     'devices/demo/command',
        //     JSON.stringify({
        //       action: 'reboot',
        //       timestamp: Date.now(),
        //     }),
        //     { qos: 1 },
        //     err => {
        //       if (err) {
        //         console.error(err);
        //       } else {
        //         console.log('Message sent');
        //       }
        //     }
        //   );
        // }, 1000);
      });
    }, 2000);
  },
};

export default MqttService;
