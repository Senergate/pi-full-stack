'use strict';

import Server from './Server.js';
import MqttService from './MqttService.js';
import EspService from './EspService.js';
// import SensorService from './SensorService.js';
// import TimerService from './TimerService.js';
// import DoorService from './DoorService.js';
// import LockService from './LockService.js';
// import ShutterService from './ShutterService.js';

(async () => {
  console.log('START SENERGATE-PI-FULLSTACK');

  await Server.start();
  await Server.init([
    MqttService,
    EspService,
    // SensorService,
    // TimerService,
    // DoorService,
    // LockService,
    // ShutterService
  ]);
})();
