import ElectricalCalibrationService from '../server/ElectricalCalibrationService.js';
import { modelBuildingPowers } from '../client/src/ElectricalProfileModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const backendFallback = ElectricalCalibrationService._defaultProfiles();
const model = modelBuildingPowers({
  profiles: backendFallback,
  heatpumpLevel: 3,
  wallboxMask: 2,
  batteryCharging: true,
  phaseVoltages: { a: 230, b: 230, c: 230 },
});

assert(model !== null, 'Fallback runtime model must exist when device states are known.');
assert(model.powers.a.p > 0, `Heatpump fallback P must be >0, got ${model.powers.a.p}`);
assert(model.powers.b.p > 0, `Wallbox fallback P must be >0, got ${model.powers.b.p}`);
assert(model.powers.c.p > 0, `Battery fallback P must be >0, got ${model.powers.c.p}`);

console.log('fallback_profile_runtime_model_test: PASS');
console.log(JSON.stringify(model.powers));
