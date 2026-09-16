import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateDecimalInput } from '../client/src/ControlInputValidation.js';

const spec = { min: 0.00, max: 1.00, unit: 'Ω', decimals: 2 };
assert.equal(validateDecimalInput('0.26', spec).valid, true);
assert.equal(validateDecimalInput('1.00', spec).valid, true);
assert.equal(validateDecimalInput('0.091', spec).valid, false);
assert.match(validateDecimalInput('0.091', spec).error, /no more than 2 decimal places/);
assert.match(validateDecimalInput('0,09', spec).error, /Use "\." as the decimal separator/);
assert.equal(validateDecimalInput('1.01', spec).valid, false);
assert.match(validateDecimalInput('abc', spec).error, /digits and "\." only/);

const dash = fs.readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
assert.match(dash, /const GRID_INPUT_SPECS = Object\.freeze/);
assert.match(dash, /const gridDraft = reactive/);
assert.match(dash, /const gridErrors = reactive/);
assert.match(dash, /invalid drafts never replace the active impedance/i);
assert.match(dash, /Built-in presets retain their original engineering precision/);
assert.match(dash, /:value="gridDraft\.xPhase"/);
assert.match(dash, /@blur="commitGridField\('xPhase'\)"/);
assert.match(dash, /syncGridDraftFromActive\(\)/);
assert.match(dash, /gridImpedanceOpen/);
console.log('grid_input_validation_test: PASS');
