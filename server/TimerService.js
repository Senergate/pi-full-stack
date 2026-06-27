import cron from 'node-cron';
import http from 'http';

const TimerService = {
  name: 'TimerService',

  timers: {},
  request: async url => {
    return new Promise((resolve, reject) => {
      http
        .get(url, res => {
          let data = '';

          res.on('data', chunk => {
            data += chunk;
          });

          res.on('end', () => {
            // console.log(data);
            resolve(data);
          });
        })
        .on('error', err => {
          console.error(err);
          reject(err);
        });
    });
  },

  setEngineInterval: async (base, factor, turnOn) => {
    await TimerService.request(`http://192.168.178.74/settings/light/0?auto_off=${base || 0}`);
    await TimerService.request(`http://192.168.178.74/settings/light/0?auto_on=${base * factor || 0}`);
    await TimerService.engine(turnOn);
  },

  heatWater: async timer => {
    if (TimerService.timers.heat) return false;

    TimerService.timers.heat = setTimeout(async () => {
      await TimerService.waterPump(false);
      await TimerService.floorPump(true);
      await TimerService.engine(false);
      TimerService.timers.heat = null;
    }, timer * 1000);

    await TimerService.setEngineInterval(0, 0, true); // clear timers and start engine
    await TimerService.floorPump(false);
    await TimerService.waterPump(true);

    return true;
  },

  getEngineStatus: async ()=>{
    return JSON.parse(await TimerService.request(`http://192.168.178.74/light/0`));
  },

  engine: async on => {
    await TimerService.request(`http://192.168.178.74/light/0?turn=${on ? 'on' : 'off'}`);
  },

  floorPump: async on => {
    await TimerService.request(`http://192.168.178.123/relay/0?turn=${on ? 'on' : 'off'}`);
  },
  waterPump: async on => {
    await TimerService.request(`http://192.168.178.123/relay/1?turn=${on ? 'on' : 'off'}`);
  },

  init: async server => {
    TimerService.server = server;
    console.log('init timer service');

    // checker
    cron.schedule(`* * * * *`, async () => {
      const data = JSON.parse(await TimerService.request(`http://192.168.178.74/light/0`));
	    console.log(data.ison,data.timer_remaining)
      if (data.has_timer && data.timer_remaining < 2) {
        console.log('stuck');
	TimerService.engine(!data.ison);
      }
    });

    // cold
    // const F_BASE = 400;
    // const F_MORNING = 1;
    // const F_NOON = 2;
    // const F_EVENING = 2;
    // const F_NIGHT = 2;
    //

    const F_BASE = 300;
    const F_MORNING = 2;
    const F_NOON = 0;
    const F_EVENING = 4;
    const F_NIGHT = 20;
/*
    // Morning
    cron.schedule(`10 7 * * *`, async () => {
        await TimerService.setEngineInterval(F_BASE, F_MORNING, true);
      await TimerService.floorPump(true);
    });

    // Noon
    cron.schedule(`30 11 * * *`, async () => {
      await TimerService.setEngineInterval(0, 0, false);
    });

    // Evening
    cron.schedule(`30 18 * * *`, async () => {
      await TimerService.setEngineInterval(0, 0, true);
      await TimerService.waterPump(true);
      await TimerService.floorPump(false);
      const duration = 30 * 60 * 1000;
      setTimeout(async () => {
        await TimerService.setEngineInterval(F_BASE, F_EVENING, true);
        await TimerService.waterPump(false);
      }, duration);
    });

    // Night Reduction
    cron.schedule(`0 0 * * *`, async () => {
      await TimerService.setEngineInterval(F_BASE, F_NIGHT, true);
      await TimerService.floorPump(false);
      await TimerService.waterPump(false);
    });
    */
  },
};

export default TimerService;
