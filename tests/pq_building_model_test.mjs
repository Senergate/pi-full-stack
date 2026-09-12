import { buildBuildingComplexPowers, BUILDING_CAPACITY } from '../client/src/BuildingElectricalModel.js';
import { analyzeIncrementalVuf } from '../client/src/IncrementalVufModel.js';

function assert(c,m){if(!c) throw new Error(m)}
assert(BUILDING_CAPACITY.heatpumpMaxCurrentA===40,'HP capacity must be 40 A');
assert(BUILDING_CAPACITY.wallboxMaxCurrentA===64,'Wallbox capacity must be 64 A');
assert(BUILDING_CAPACITY.batteryMaxCurrentA===40,'Battery capacity must be 40 A');

const full = buildBuildingComplexPowers({heatpumpLevel:5,wallboxMask:3,batteryCharging:true,voltageV:230});
const apparent = p => Math.hypot(p.re,p.im)/230;
assert(Math.abs(apparent(full.phasePowers.a)-40)<1e-6,'HP fallback full state must equal 40 A apparent current');
assert(Math.abs(apparent(full.phasePowers.b)-64)<1e-6,'Wallbox fallback full state must equal 64 A apparent current');
assert(Math.abs(apparent(full.phasePowers.c)-40)<1e-6,'Battery fallback full state must equal 40 A apparent current');

const wallboxOnly = buildBuildingComplexPowers({heatpumpLevel:0,wallboxMask:3,batteryCharging:false,voltageV:230});
const result = analyzeIncrementalVuf({
  phasePowers: wallboxOnly.phasePowers,
  baselineVoltages:{a:230,b:230,c:230},
  baselineAngles:{a:0,b:-120,c:120},
  resistance:{a:.22,b:.22,c:.22},
  reactance:{a:.15,b:.15,c:.15},
  neutralResistance:.02,
  neutralReactance:0,
});
assert(result.vufPercent>2.5,`Demo weak grid should make VUF >2.5% for isolated 64 A L2 load, got ${result.vufPercent}`);
assert(result.voltageValid===true,`Demo reference case must stay inside 207-253 V, got ${JSON.stringify(result.voltageMagnitudes)}`);
console.log('pq_building_model_test: PASS',result.vufPercent.toFixed(3),result.voltageMagnitudes);
