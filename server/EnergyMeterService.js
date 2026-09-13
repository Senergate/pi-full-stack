const HISTORY_LIMIT = 240;

const EnergyMeterService = {
  name: 'EnergyMeterService',
  latestPayload: null,
  history: [],

  _record: payload => {
    const item = { ts_ms: Date.now(), payload: { ...payload } };
    EnergyMeterService.latestPayload = item;
    EnergyMeterService.history.push(item);
    if (EnergyMeterService.history.length > HISTORY_LIMIT) EnergyMeterService.history.splice(0, EnergyMeterService.history.length - HISTORY_LIMIT);
  },

  _samplesSince: sinceMs => EnergyMeterService.history.filter(item => item.ts_ms >= sinceMs),
  _latest: () => EnergyMeterService.latestPayload,

  init: async server => {
    const bus = EnergyMeterService.server.services.get('MqttService').bus;

    bus.subscribe('shellypro3em-ece334e62cdc/status/em:0', { qos: 1 }, err => {
      if (err) {
        console.error('Subscribe failed:', err);
        return;
      }
    });

    bus.on('message', (topic, message) => {
      if (topic !== 'shellypro3em-ece334e62cdc/status/em:0') return;
      try {
        const payload = JSON.parse(message.toString());
        EnergyMeterService._record(payload);
        server.emitServiceEvent('EnergyMeterService', 'data', payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default EnergyMeterService;
