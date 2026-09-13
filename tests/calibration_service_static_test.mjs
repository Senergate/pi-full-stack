import fs from 'node:fs';
const text=fs.readFileSync(new URL('../server/ElectricalCalibrationService.js',import.meta.url),'utf8');
for(const term of ['captureBaseline','captureDevicePoint','startRecommendedCalibration','CALIBRATE_REAL_HARDWARE','electrical_profiles.json','shelly_plus_pico_fundamental']){
 if(!text.includes(term)) throw new Error(`Calibration feature missing: ${term}`);
}
console.log('calibration_service_static_test: PASS');
