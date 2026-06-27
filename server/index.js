'use strict';

import Server from './Server.js';
import MqttService from './MqttService.js';
// import SensorService from './SensorService.js';
// import TimerService from './TimerService.js';
// import DoorService from './DoorService.js';
// import LockService from './LockService.js';
// import ShutterService from './ShutterService.js';

(async () => {
  console.log('START VIGOR');

  await Server.start();
  await Server.init([
    MqttService,
    // SensorService,
    // TimerService,
    // DoorService,
    // LockService,
    // ShutterService
  ]);
})();
