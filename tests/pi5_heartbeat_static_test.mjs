import fs from 'node:fs';
const mqtt = fs.readFileSync(new URL('../server/MqttService.js', import.meta.url), 'utf8');
if (!mqtt.includes("senergate/sys/heartbeat/pi5")) throw new Error('Pi5 heartbeat topic missing.');
if (!mqtt.includes('HEARTBEAT_PERIOD_MS = 1000')) throw new Error('Pi5 heartbeat must run at 1 s period.');
if (!mqtt.includes('retain: false')) throw new Error('Pi5 heartbeat must not be retained.');
if (!mqtt.includes('last_heartbeat_at')) throw new Error('MQTT status must expose heartbeat timestamp.');
console.log('pi5_heartbeat_static_test: PASS');
