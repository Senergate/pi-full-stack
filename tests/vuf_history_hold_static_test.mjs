import fs from 'node:fs';
import assert from 'node:assert/strict';

const file = new URL('../client/src/components/VufCard.vue', import.meta.url);
const src = fs.readFileSync(file, 'utf8');

assert.match(src, /if \(points\.length === 0\) \{\s*return;\s*\}/s,
  'VUF graph must render even when exactly one retained history point exists');
assert.doesNotMatch(src, /if \(points\.length < 2\)/,
  'Old two-point guard would make a stable trace disappear after the 10 s window');
assert.match(src, /ctx\.lineTo\(mapX\(performance\.now\(\)\), mapY\(points\[points\.length-1\]\.vuf\)\)/,
  'Last known VUF must be extended to current time');
assert.match(src, /SECONDS_VISIBLE = 10/,
  'The visible history window remains 10 seconds');

console.log('PASS vuf_history_hold_static_test');
