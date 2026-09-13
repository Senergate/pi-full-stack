import { buildBuildingComplexPowers } from '../client/src/BuildingElectricalModel.js';
function assert(c,m){if(!c) throw new Error(m)}
const calibration={devices:{heatpump:{quality:'measured',points:{0:{pW:0,qVar:0},1:{pW:100,qVar:50},5:{pW:500,qVar:250}}}}};
const state=buildBuildingComplexPowers({heatpumpLevel:1,wallboxMask:0,batteryCharging:false,calibration,voltageV:230});
const hp=state.devices.heatpump;
assert(hp.source==='measured_pq_scaled_to_building','measured profile must be used');
const ratio=hp.qVar/hp.pW;
assert(Math.abs(ratio-.5)<1e-9,`P/Q ratio must survive building scaling, got ${ratio}`);
console.log('pq_scaling_preserves_pf_test: PASS');
