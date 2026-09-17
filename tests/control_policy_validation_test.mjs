import assert from 'node:assert/strict';
import {
  CONTROL_POLICY_DEFAULTS,
  resolveControlPolicyThresholds,
  validateControlPolicyThresholds,
} from '../client/src/ControlPolicyConfig.js';

const good = validateControlPolicyThresholds(CONTROL_POLICY_DEFAULTS);
assert.equal(good.valid, true);

const bad = validateControlPolicyThresholds({
  ...CONTROL_POLICY_DEFAULTS,
  warningRatio: 0.95,
  preLimitRatio: 0.90,
  criticalRatio: 0.80,
});
assert.equal(bad.valid, false);
assert.ok(bad.errors.length > 0);

const resolved = resolveControlPolicyThresholds({
  ...CONTROL_POLICY_DEFAULTS,
  vufExitPct: 2.2,
  vufEnterPct: 2.0,
});
assert.equal(resolved.valid, false);
assert.equal(resolved.usedDefaults, true);
assert.equal(resolved.values.vufEnterPct, CONTROL_POLICY_DEFAULTS.vufEnterPct);
assert.equal(resolved.values.vufExitPct, CONTROL_POLICY_DEFAULTS.vufExitPct);
console.log('control_policy_validation_test: PASS');
