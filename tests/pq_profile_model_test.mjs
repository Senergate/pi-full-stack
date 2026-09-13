import PhasorCalculator from '../client/src/components/PhasorCalculator.js';
import { DEFAULT_ELECTRICAL_PROFILES, modelBuildingPowers } from '../client/src/ElectricalProfileModel.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const model = modelBuildingPowers({
  profiles: DEFAULT_ELECTRICAL_PROFILES,
  heatpumpLevel: 5,
  wallboxMask: 3,
  batteryCharging: true,
  phaseVoltages: { a: 230, b: 230, c: 230 },
});
const V = PhasorCalculator.buildSourceVoltagePhasors({ a:230,b:230,c:230 }, { a:0,b:-120,c:120 });
const I = PhasorCalculator.buildCurrentPhasorsFromComplexPower(model.powers, V);
const mag = Object.fromEntries(Object.entries(I).map(([k,v]) => [k, PhasorCalculator.complexMagnitude(v)]));
assert(Math.abs(mag.a - 60) < 1e-6, `HP full-scale must target 60 A apparent current, got ${mag.a}`);
assert(Math.abs(mag.b - 64) < 1e-6, `Wallbox full-scale must target 64 A, got ${mag.b}`);
assert(Math.abs(mag.c - 40) < 1e-6, `Battery full-scale must target 40 A, got ${mag.c}`);

const hp3 = modelBuildingPowers({profiles:DEFAULT_ELECTRICAL_PROFILES,heatpumpLevel:3,wallboxMask:0,batteryCharging:false,phaseVoltages:{a:230,b:230,c:230}});
const i3 = PhasorCalculator.buildCurrentPhasorsFromComplexPower(hp3.powers, V);
const hp3A = PhasorCalculator.complexMagnitude(i3.a);
assert(Math.abs(hp3A - 28.8) < 1e-6, `Fallback HP profile must be non-linear (level3=48% => 28.8 A), got ${hp3A}`);
console.log('pq_profile_model_test: PASS');
