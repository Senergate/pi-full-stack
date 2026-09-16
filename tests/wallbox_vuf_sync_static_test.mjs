import assert from 'node:assert/strict';
import fs from 'node:fs';

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const vuf = fs.readFileSync(new URL('../client/src/components/VufCard.vue', import.meta.url), 'utf8');
const profile = fs.readFileSync(new URL('../client/src/ElectricalProfileModel.js', import.meta.url), 'utf8');

assert.match(profile, /1:\s*\{\s*fraction:\s*0\.333333/);
assert.match(profile, /2:\s*\{\s*fraction:\s*0\.714286/);
assert.match(dash, /confirmedMask:\s*null,\s*targetMask:\s*null/);
assert.match(dash, /beginWallboxTarget\(targetWallbox\)/);
assert.match(dash, /if \(observedMask === _\.wallbox\.targetMask\)/);
assert.match(dash, /scheduleExternalWallboxCommit\(\)/);
assert.match(dash, /wallboxPowerForCurrent\(\{/);
assert.match(dash, /const liveWallboxCurrentA = measuredCurrents\.value\.b/);
assert.match(dash, /currentA:\s*liveWallboxCurrentA/);
assert.match(dash, /wallboxPhysicalActiveForMeasurement\(\{/);
assert.match(dash, /PROTOTYPE_CURRENT_REFERENCE_MAX_A\.wallbox/);

// Step plot: horizontal hold to the new timestamp, then vertical transition.
assert.match(vuf, /mapY\(points\[i - 1\]\.vuf\)/);
assert.match(vuf, /mapY\(points\[i\]\.vuf\)/);
assert.doesNotMatch(vuf, /for \(let i = 1; i < points\.length; i \+= 1\) \{\s*ctx\.lineTo\(mapX\(points\[i\]\.ts\), mapY\(points\[i\]\.vuf\)\);\s*\}/s);

console.log('wallbox_vuf_sync_static_test: PASS');
