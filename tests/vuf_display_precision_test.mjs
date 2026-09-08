import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const vufCard = fs.readFileSync(path.join(root, 'client/src/components/VufCard.vue'), 'utf8');
const agentCard = fs.readFileSync(path.join(root, 'client/src/components/AgentCard.vue'), 'utf8');

assert.match(vufCard, /safeVuf\.value\.toFixed\(2\)/, 'Main VUF must display exactly 2 decimals');
assert.doesNotMatch(vufCard, /safeVuf\.value\.toFixed\(1\)/, 'Main VUF must not display 1 decimal');
assert.match(vufCard, /numeric\.toFixed\(2\)/, 'VUF breakdown percentages must display exactly 2 decimals');
assert.match(vufCard, /value\.toFixed\(2\).*padding\.left/, 'VUF graph Y-axis labels must display exactly 2 decimals');
assert.match(vufCard, /0\.00–2\.50%/, 'VUF history range must use 2-decimal presentation');
assert.match(vufCard, /VUF ≤ 2\.00%/, 'VUF reference threshold must use 2-decimal presentation');
assert.match(agentCard, /numeric\.toFixed\(2\)/, 'Agent VUF must display exactly 2 decimals');
assert.match(agentCard, /Balanced &lt; 1\.00% · Warning 1\.00–2\.00% · Critical &gt; 2\.00%/, 'Agent VUF threshold legend must use 2 decimals');

// Safety/decision logic must continue to use raw numeric values, not rounded display values.
assert.match(vufCard, /if \(safeVuf\.value > 2\)/, 'VUF status must compare the raw value against 2%');
assert.match(agentCard, /if \(numeric > 2\)/, 'Agent status must compare the raw value against 2%');

console.log('vuf_display_precision_test PASS');
