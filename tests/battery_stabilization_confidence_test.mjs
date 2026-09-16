import assert from 'node:assert/strict';
import { updateBatteryStabilizationWindow } from '../client/src/BatteryStabilizationModel.js';

const cfg = {
  startedAtMs: 0,
  minSettleMs: 3000,
  stableDeltaA: 0.02,
  stableSamples: 3,
  stableDurationMs: 1000,
  stableSlopeAperS: 0.02,
};

let samples = [];
let final = null;

// Stable-looking samples collected before minSettleMs must not be counted retroactively.
samples = [];
for (const [t, i] of [[500, 1.00], [1000, 1.00], [1500, 1.00], [2500, 1.00], [3000, 1.00]]) {
  final = updateBatteryStabilizationWindow({ ...cfg, samples, nowMs: t, currentA: i });
  samples = final.samples;
}
assert.equal(final.stableReady, false);
assert.equal(final.stableCount, 0);

// High-rate samples with small deltas are not enough before the stable-duration requirement.
for (const [t, i] of [[3000, 1.00], [3100, 1.01], [3200, 1.01], [3300, 1.02]]) {
  const r = updateBatteryStabilizationWindow({ ...cfg, samples, nowMs: t, currentA: i });
  samples = r.samples;
  if (t === 3300) {
    assert.equal(r.stableCount >= 3, true);
    assert.equal(r.stableReady, false, 'sample count alone must not declare stable');
  }
}

// A sufficiently long, flat suffix with low slope becomes high-confidence stable.
samples = [];
for (const [t, i] of [[3000, 1.01], [3500, 1.015], [4000, 1.018], [4500, 1.019]]) {
  final = updateBatteryStabilizationWindow({ ...cfg, samples, nowMs: t, currentA: i });
  samples = final.samples;
}
assert.equal(final.stableCount >= 3, true);
assert.equal(final.stableDurationMs >= 1000, true);
assert.ok(final.slopeAperS <= 0.02);
assert.equal(final.stableReady, true);

// A continuing ramp fails the delta/slope stability test.
samples = [];
for (const [t, i] of [[3000, 0.40], [3500, 0.50], [4000, 0.60], [4500, 0.70]]) {
  final = updateBatteryStabilizationWindow({ ...cfg, samples, nowMs: t, currentA: i });
  samples = final.samples;
}
assert.equal(final.stableReady, false);

console.log('battery_stabilization_confidence_test: PASS');
