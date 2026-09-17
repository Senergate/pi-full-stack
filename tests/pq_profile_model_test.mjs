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
assert(Math.abs(hp3A - 48.48) < 1e-6, `Measured-shape fallback HP level3 must be 80.8% of 60 A = 48.48 A, got ${hp3A}`);

const wb1 = modelBuildingPowers({profiles:DEFAULT_ELECTRICAL_PROFILES,heatpumpLevel:0,wallboxMask:1,batteryCharging:false,phaseVoltages:{a:230,b:230,c:230}});
const wb2 = modelBuildingPowers({profiles:DEFAULT_ELECTRICAL_PROFILES,heatpumpLevel:0,wallboxMask:2,batteryCharging:false,phaseVoltages:{a:230,b:230,c:230}});
const iWb1 = PhasorCalculator.buildCurrentPhasorsFromComplexPower(wb1.powers, V);
const iWb2 = PhasorCalculator.buildCurrentPhasorsFromComplexPower(wb2.powers, V);
const wb1A = PhasorCalculator.complexMagnitude(iWb1.b);
const wb2A = PhasorCalculator.complexMagnitude(iWb2.b);
assert(wb2A > wb1A, `Measured-shape fallback must keep Wallbox mask2 > mask1, got ${wb2A} <= ${wb1A}`);
assert(Math.abs(wb1A - 64 * 0.333) < 1e-6, `Wallbox mask1 fallback should use 33.3%, got ${wb1A}`);
assert(Math.abs(wb2A - 64 * 0.714) < 1e-6, `Wallbox mask2 fallback should use 71.4%, got ${wb2A}`);
console.log('pq_profile_model_test: PASS');
