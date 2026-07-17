'use strict';

import Server from './Server.js';
import MqttService from './MqttService.js';
import PicoService from './PicoService.js';
import BatteryService from './BatteryService.js';
import EspService from './EspService.js';
import WallboxService from './WallboxService.js';
import EnergyMeterService from './EnergyMeterService.js';

(async () => {
  console.log('START SENERGATE-PI-FULLSTACK');

  await Server.start();
  await Server.init([MqttService, EspService, BatteryService, PicoService, EnergyMeterService, WallboxService]);
})();
