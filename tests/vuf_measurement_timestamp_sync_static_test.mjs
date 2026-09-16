import assert from 'node:assert/strict';
import fs from 'node:fs';

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const vuf = fs.readFileSync(new URL('../client/src/components/VufCard.vue', import.meta.url), 'utf8');

assert.match(dash, /wallboxPhysicalActiveForMeasurement\(\{/);
assert.match(dash, /currentA:\s*liveWallboxCurrentA/);
assert.match(dash, /fallbackActive:\s*Number\(state\.wallboxMask\) > 0/);
assert.doesNotMatch(dash, /currentA:\s*measuredCurrents\.value\.b,[\s\S]{0,120}active:\s*Number\(state\.wallboxMask\) > 0/);
assert.match(dash, /:sample-ts="_\.energy_meter\.lastUpdate"/);
assert.match(vuf, /sampleTs:\s*\{/);
assert.match(vuf, /\(\) => \[props\.vuf, props\.sampleTs\]/);
assert.match(vuf, /addPoint\(value, sampleTs\)/);

console.log('vuf_measurement_timestamp_sync_static_test: PASS');
