import assert from 'node:assert/strict';
import {
  PROTOTYPE_CURRENT_REFERENCE_MAX_A,
  projectLiveScaledBuildingCurrents,
  scalePrototypeCurrentToBuilding,
} from '../client/src/PrototypeCurrentTwinModel.js';

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected}, got ${actual}`);
};

assert.equal(PROTOTYPE_CURRENT_REFERENCE_MAX_A.heatpump, 0.26);
assert.equal(PROTOTYPE_CURRENT_REFERENCE_MAX_A.wallbox, 0.42);
assert.equal(PROTOTYPE_CURRENT_REFERENCE_MAX_A.battery, 1.30);

// Curve-anchor fallback values when live Shelly data is temporarily unavailable.
let result = projectLiveScaledBuildingCurrents({
  measuredCurrents: { a: null, b: null, c: null },
  heatpumpLevel: 1,
  wallboxMask: 1,
  batteryCharging: true,
});
close(result.a, 60 * (0.09 / 0.26));
close(result.b, 64 * (0.14 / 0.42));
close(result.c, 40);

// Live Shelly current must synchronously change the modeled display current.
result = projectLiveScaledBuildingCurrents({
  measuredCurrents: { a: 0.20, b: 0.30, c: 1.04 },
  heatpumpLevel: 3,
  wallboxMask: 2,
  batteryCharging: true,
});
close(result.a, 60 * (0.20 / 0.26));
close(result.b, 64 * (0.30 / 0.42));
close(result.c, 40 * (1.04 / 1.30));

const changed = projectLiveScaledBuildingCurrents({
  measuredCurrents: { a: 0.22, b: 0.31, c: 0.65 },
  heatpumpLevel: 3,
  wallboxMask: 2,
  batteryCharging: true,
});
assert.ok(changed.a > result.a, 'Heatpump modeled current must follow live measured increase.');
assert.ok(changed.b > result.b, 'Wallbox modeled current must follow live measured increase.');
assert.ok(changed.c < result.c, 'Battery modeled current must follow live measured decrease.');

// Battery above predicted 1.30 A maximum must saturate at the existing 40 A model maximum.
result = projectLiveScaledBuildingCurrents({
  measuredCurrents: { a: 0, b: 0, c: 1.60 },
  heatpumpLevel: 0,
  wallboxMask: 0,
  batteryCharging: true,
});
close(result.c, 40);

// Close to full C300: 0.01 A maps to only about 0.308 A building-equivalent current.
result = projectLiveScaledBuildingCurrents({
  measuredCurrents: { a: 0, b: 0, c: 0.01 },
  heatpumpLevel: 0,
  wallboxMask: 0,
  batteryCharging: true,
});
close(result.c, 40 * (0.01 / 1.30));

// OFF state remains zero even if measurement noise/background current exists.
result = projectLiveScaledBuildingCurrents({
  measuredCurrents: { a: 0.12, b: 0.20, c: 0.30 },
  heatpumpLevel: 0,
  wallboxMask: 0,
  batteryCharging: false,
});
assert.deepEqual(result, { a: 0, b: 0, c: 0 });

// Generic saturation helper also caps A/B at their configured model maxima.
close(scalePrototypeCurrentToBuilding({ measuredA: 0.50, fallbackPrototypeA: 0, prototypeMaxA: 0.26, buildingMaxA: 60, active: true }), 60);

console.log('prototype_current_live_twin_test: PASS');
