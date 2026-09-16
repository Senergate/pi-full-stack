import assert from 'node:assert/strict';
import { batteryCurrentRatio, batteryPowerForCurrent, applyBatteryPowerToModel } from '../client/src/BatteryDynamicPowerModel.js';

const close = (a,b,t=1e-9) => assert.ok(Math.abs(a-b)<=t, `${a} != ${b}`);
close(batteryCurrentRatio(1.04, 1.30), 0.8);
close(batteryCurrentRatio(1.60, 1.30), 1.0);
close(batteryCurrentRatio(0.01, 1.30), 0.01/1.30);

const scaled = batteryPowerForCurrent({ fullPower: { p: 9000, q: 1000 }, currentA: 1.04, referenceMaxA: 1.30 });
close(scaled.p, 7200);
close(scaled.q, 800);
assert.equal(scaled.source, 'current_scaled_pq');

const model = { powers: { a:{p:1,q:2}, b:{p:3,q:4}, c:{p:5,q:6} }, assets: { battery: {} } };
const applied = applyBatteryPowerToModel(model, { p: 7, q: 8, ratio: .5, source: 'test' });
assert.deepEqual(applied.powers.c, {p:7,q:8});
assert.equal(applied.assets.battery.dynamic_ratio, .5);
console.log('battery_dynamic_power_model_test: PASS');
