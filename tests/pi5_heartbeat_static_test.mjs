import fs from 'node:fs';
const mqtt = fs.readFileSync(new URL('../server/MqttService.js', import.meta.url), 'utf8');
if (!mqtt.includes('senergate/sys/heartbeat/pi5')) throw new Error('Pi5 heartbeat topic missing.');
if (!mqtt.includes('HEARTBEAT_PERIOD_MS = 1000')) throw new Error('Pi5 heartbeat period must be 1 s.');
if (!mqtt.includes('retain: false')) throw new Error('Heartbeat must not be retained.');
console.log('pi5_heartbeat_static_test: PASS');
