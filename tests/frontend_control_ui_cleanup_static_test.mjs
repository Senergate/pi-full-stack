import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../client/src/components/SimpleDashboard.vue', import.meta.url), 'utf8');
const template = src.slice(src.indexOf('<template>'), src.indexOf('</template>') + 11);

assert.doesNotMatch(template, /[\u3400-\u9fff]/, 'frontend template must not contain Chinese display text');
for (const needle of [
  'Operator Adjustability / Bedien-Eingriffsgrenze',
  'Advanced Control Parameters / Erweiterte Regelparameter',
  'AI Control Thresholds / Regler-Schwellen',
  '.accordion-chevron{font-size:24px',
  '.operator-adjustability-summary strong{font-size:13px',
  '.control-policy-grid label{display:grid;gap:5px;color:#9db7c5;font-size:11px',
  'font-size:14px',
]) {
  assert.ok(src.includes(needle), `missing UI cleanup marker: ${needle}`);
}

console.log('frontend_control_ui_cleanup_static_test: PASS');
