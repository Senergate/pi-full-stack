const EnergyMeterService = {
  name: 'EnergyMeterService',

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
        server.emitServiceEvent('EnergyMeterService', 'data', payload);
      } catch {
        console.log(message.toString());
      }
    });
  },
};

export default EnergyMeterService;
