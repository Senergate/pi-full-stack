'use strict';

import Server from './Server.js';
import MqttService from './MqttService.js';
import PicoService from './PicoService.js';
import EspService from './EspService.js';
import ShellyService from './ShellyService.js';

(async () => {
  console.log('START SENERGATE-PI-FULLSTACK');

  await Server.start();
  await Server.init([MqttService, EspService, PicoService, ShellyService]);
})();
