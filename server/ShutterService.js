import mqtt from 'mqtt';

const ShutterService = {
  name: 'ShutterService',

  _: {},

  requestList: async ()=>{
    ShutterService.mqttClient.publish(
      `shutter/api`,
      JSON.stringify({
        api: `broadcastShutters`,
      })
    );
  },

  emergency: async () => {
    ShutterService.mqttClient.publish(`shutter/api`, JSON.stringify({ api: 'emergency' }));
  },

  activate: async (id, direction) => {
    ShutterService.mqttClient.publish(
      `shutter/api`,
      JSON.stringify({
        api: `activate`,
        id: id,
        direction: direction,
      })
    );
  },

  init: async server => {
    console.log('init shutter service');

    const mqttService = server.services.get('MqttService');
    ShutterService.mqttClient = mqttService.createMqttClient();

    ShutterService.mqttClient.on("connect", () => {
      console.log("Connected to broker");
      ShutterService.mqttClient.subscribe("shutter/#", (err) => {
        if (!err) console.log("Subscribed to shutter/#");
      });
    });

    ShutterService.mqttClient.on("message", (topic, message) => {
      console.log(`[MQTT ShutterService] ${topic}: ${message.toString()}`);
      if (topic === "shutter/list"){
        server.io.emit('ShutterService', 'list', JSON.parse(message.toString()));
      }
    });
  },
};

export default ShutterService;
