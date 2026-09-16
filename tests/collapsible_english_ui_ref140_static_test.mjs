import fs from 'node:fs';
import assert from 'node:assert/strict';

const dashboard = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const currentCard = fs.readFileSync(new URL('../client/src/components/CurrentCard.vue', import.meta.url), 'utf8');
const agentCard = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');
const cfg = fs.readFileSync(new URL('../client/src/ControlPolicyConfig.js', import.meta.url), 'utf8');

// Battery scaling/reference maximum requested for the new revision.
assert.match(cfg, /referenceMaxA:\s*1\.40/);

// Site Limits and AI Control Thresholds must start collapsed and have explicit SHOW/HIDE controls.
assert.match(dashboard, /const siteLimitsOpen = ref\(false\)/);
assert.match(dashboard, /const aiThresholdsOpen = ref\(false\)/);
assert.match(dashboard, /v-if="siteLimitsOpen" class="control-policy-content"/);
assert.match(dashboard, /v-if="aiThresholdsOpen" class="control-policy-content"/);
assert.match(dashboard, /siteLimitsOpen \? 'HIDE' : 'SHOW'/);
assert.match(dashboard, /aiThresholdsOpen \? 'HIDE' : 'SHOW'/);

// Updated configuration-panel titles are English only.
assert.ok(dashboard.includes('<strong>Startup Initialization</strong>'));
assert.ok(dashboard.includes('<strong>Senergate Grid Impedance</strong>'));
assert.ok(dashboard.includes('<strong>Site Limits</strong>'));
assert.ok(dashboard.includes('<strong>AI Control Thresholds</strong>'));

// No Chinese ideographs remain in user-facing Vue components touched by this revision.
const chinese = /[\u3400-\u9fff]/;
assert.equal(chinese.test(dashboard), false, 'SimpleDashboard must not contain Chinese UI text.');
assert.equal(chinese.test(currentCard), false, 'CurrentCard must not contain Chinese UI text.');
assert.equal(chinese.test(agentCard), false, 'AgentCard must not contain Chinese UI text.');
assert.equal(dashboard.includes('Netzimpedanz'), false);
assert.equal(dashboard.includes('Regler-Schwellen'), false);
assert.equal(agentCard.includes('Schieflast'), false);

console.log('collapsible_english_ui_ref140_static_test: PASS');
