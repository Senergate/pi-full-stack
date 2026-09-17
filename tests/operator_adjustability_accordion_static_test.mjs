import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
for (const needle of [
  'operatorAdjustabilityExpanded',
  'senergate.operatorAdjustabilityExpanded',
  'Preview:',
  '1–20 → Min Level 1',
  '91–100 → AI LOCKED',
  "@focus=\"adjustabilityEditing = 'heatpump'\"",
  "@blur=\"finishAdjustabilityEdit('heatpump')\"",
  'accordion-chevron',
  'Prototype · MEASURED',
  'Building Twin · MODELED',
]) assert.ok(src.includes(needle), `missing ${needle}`);
console.log('operator_adjustability_accordion_static_test PASS');
