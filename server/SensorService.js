import noble from '@abandonware/noble';
import sqlite3 from 'sqlite3';

const timeouts = new Map();

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.get(checkTableSQL, [], (err, row) => {
      if (err) {
        reject(err); // Reject the promise if there's an error
      } else {
        resolve(row); // Resolve with the row (if table exists)
      }
    });
  });
}

const SensorService = {
  name: 'SensorService',

  push: (mac, rssi, property, value) => {
    const existing = timeouts.get(mac);
    const data = existing?.[1] || { b: null, h: null, t: null };

    if (existing) clearTimeout(existing[0]);

    const timer = setTimeout(() => {
      timeouts.delete(mac);
      Object.assign(data, { mac, rssi, time: Date.now() });

      SensorService.server.io.emit('SensorService', 'update', data);
      SensorService.run(`INSERT INTO sensor_data (mac, rssi, time, humidity, temperature) VALUES (?,?,?,?,?)`, [
        data.mac,
        data.rssi,
        data.time,
        data.h,
        data.t,
      ]);
    }, 1000);

    data[property] = value;
    timeouts.set(mac, [timer, data]);
  },

  all: async (sql, params) => {
    return await new Promise((resolve, reject) => {
      SensorService.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  },

  run: async (sql, data) => {
    return await new Promise((resolve, reject) => {
      SensorService.db.run(sql, data, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  decodeBTHomeV2: (mac, rssi, buf) => {
    if (!buf || buf.length < 2) return;
    let pos = 1;
    while (pos < buf.length) {
      const id = buf.readUInt8(pos++);
      switch (id) {
        case 0x00:
          ({ id: buf.readUInt8(pos++) });
          break;
        case 0x3a:
          ({ button: buf.readUInt8(pos++) });
          break;
        case 0x01:
          SensorService.push(mac, rssi, 'b', buf.readUInt8(pos++));
          break;
        case 0x2e:
          SensorService.push(mac, rssi, 'h', buf.readUInt8(pos++));
          break;
        case 0x45:
          SensorService.push(mac, rssi, 't', buf.readInt16LE(pos) * 0.1);
          pos += 2;
          break;
        default: {
          pos = buf.length;
          break;
        }
      }
    }
  },

  init: async server => {
    SensorService.server = server;
    console.log('init sensor service');

    SensorService.db = new sqlite3.Database('sensor_data.db');

    await SensorService.run(`
        CREATE TABLE IF NOT EXISTS sensor_data (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mac TEXT,
          rssi INTEGER,
          time INTEGER,
          humidity INTEGER,
          temperature REAL
        );
    `);

    noble.on('stateChange', async state => {
      if (state === 'poweredOn') await noble.startScanningAsync([], true);
      else await noble.stopScanningAsync();
    });

    noble.on('discover', p => {
      (p.advertisement.serviceData || [])
        .filter(sd => sd.data && sd.data.length > 0)
        .forEach(sd => SensorService.decodeBTHomeV2(p.address, p.rssi, sd.data));
    });
  },
};

export default SensorService;
