import fs from 'node:fs';
const svc = fs.readFileSync(new URL('../server/ElectricalCalibrationService.js', import.meta.url), 'utf8');
for (const token of [
  "'CALIBRATE_REAL_HARDWARE'",
  'SAMPLE_WINDOW_MS = 10000',
  'SETTLE_HEATPUMP_MS = 8000',
  'for (let level = 1; level <= 5; level += 1)',
  'for (const mask of [1, 2, 3])',
  "battery.set(true)",
  '_safeAllOff',
  '_waitHeatpumpStable',
  'pico_fundamental_plus_shelly_p',
  "electrical_profiles.json",
]) if (!svc.includes(token)) throw new Error(`Calibration service missing: ${token}`);
console.log('electrical_calibration_service_static_test: PASS');
