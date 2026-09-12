import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ElectricalCalibrationService from '../server/ElectricalCalibrationService.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'senergate-profile-migration-'));
const file = path.join(dir, 'electrical_profiles.json');

try {
  fs.writeFileSync(file, JSON.stringify({
    schema_version: '1.0',
    provenance: 'old_v1_5_calibration',
    baseline: { calibrated: true, voltages: { a: 231, b: 230, c: 229 } },
    assets: {
      heatpump: {
        phase: 'a', target_current_a: 40, q_sign: 'lagging',
        points: { 5: { delta_p_w: 700, delta_q_var: 300 } },
      },
      wallbox: {
        phase: 'b', target_current_a: 64, q_sign: 'near_unity',
        points: { 3: { delta_p_w: 1000, delta_q_var: 0 } },
      },
      battery: {
        phase: 'c', target_current_a: 40, q_sign: 'near_unity',
        points: { 1: { delta_p_w: 500, delta_q_var: 0 } },
      },
    },
  }, null, 2));

  ElectricalCalibrationService._configPath = () => file;
  const migrated = ElectricalCalibrationService._load();

  assert(migrated.assets.heatpump.target_current_a === 60,
    `Old Branch-A 40 A profile must migrate to 60 A, got ${migrated.assets.heatpump.target_current_a}`);
  assert(migrated.assets.wallbox.target_current_a === 64, 'Branch B target must remain 64 A.');
  assert(migrated.assets.battery.target_current_a === 40, 'Battery target must remain 40 A.');
  assert(migrated.assets.heatpump.points[5].delta_p_w === 700,
    'Measured/calibrated Branch-A P/Q points must survive target migration.');
  assert(migrated.baseline.voltages.a === 231,
    'Calibrated baseline must survive target migration.');

  console.log('electrical_profile_target_migration_test: PASS');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
