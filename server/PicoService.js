const HISTORY_LIMIT = 600;

const PicoService = {
  name: 'PicoService',
  latestPayload: null,
  history: [],

  _record: payload => {
    const item = { ts_ms: Date.now(), payload };
    PicoService.latestPayload = item;
    PicoService.history.push(item);
    if (PicoService.history.length > HISTORY_LIMIT) PicoService.history.splice(0, PicoService.history.length - HISTORY_LIMIT);
  },

  _samplesSince: sinceMs => PicoService.history.filter(item => item.ts_ms >= sinceMs),
  _latest: () => PicoService.latestPayload,

  init: async server => {
    const bus = PicoService.server.services.get('MqttService').bus;

    bus.subscribe('pico/data', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
        return;
      }
    });

    bus.on('message', (topic, message) => {
      if(topic!=='pico/data') return;
      try {
        const payload = JSON.parse(message.toString());
        PicoService._record(payload);
        server.emitServiceEvent('PicoService', 'data', payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default PicoService;
