const boolOrNull = value => {
  if (value === true || value === 1 || value === '1' || value === 'on' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'off' || value === 'false') return false;
  return null;
};

const idFromTopic = topic => {
  const match = /switch:(\d+)/.exec(topic);
  return match ? Number(match[1]) : null;
};

const normalizeSwitchStatus = (topic, payload) => ({
  ...payload,
  id: Number.isFinite(Number(payload?.id)) ? Number(payload.id) : idFromTopic(topic),
  output: boolOrNull(payload?.output ?? payload?.state),
});

const WallboxService = {
  name: 'WallboxService',

  set: (id, state) => {
    const bus = WallboxService.server.services.get('MqttService').bus;
    const relayId = Number(id);
    const output = state === true;
    bus.publish(`branch-b-shelly/command/switch:${relayId}`, output ? 'on' : 'off');
    return { accepted: true, id: relayId, state: output };
  },

  requestUpdate: () => {
    const bus = WallboxService.server.services.get('MqttService').bus;
    bus.publish('branch-b-shelly/command/switch:0', 'status_update');
    bus.publish('branch-b-shelly/command/switch:1', 'status_update');
    return { accepted: true };
  },

  init: async server => {
    WallboxService.server = server;
    const bus = server.services.get('MqttService').bus;
    bus.subscribe('branch-b-shelly/status/#', { qos: 1 }, err => {
      if (err) console.error('Subscribe failed:', err);
    });

    bus.on('message', (topic, message) => {
      if (!topic.startsWith('branch-b-shelly/status/switch:')) return;
      try {
        const payload = normalizeSwitchStatus(topic, JSON.parse(message.toString()));
        server.emitServiceEvent('WallboxService', 'data', payload);
      } catch (err) {
        console.error(`Invalid MQTT payload on ${topic}:`, err);
      }
    });
  },
};

export default WallboxService;
