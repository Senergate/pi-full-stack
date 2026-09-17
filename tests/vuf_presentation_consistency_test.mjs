import { classifyVuf, formatSignedVufDeltaPercent, formatVufPercent } from '../client/src/VufPresentation.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(formatVufPercent(1.16) === '1.2%', 'VUF display must use one decimal place.');
assert(formatVufPercent(1.94) === '1.9%', 'VUF rounding must be stable.');
assert(classifyVuf(0.9).label === 'Balanced', '<1.0% must be Balanced.');
assert(classifyVuf(1.0).label === 'Warning', '1.0–2.0% must be Warning.');
assert(classifyVuf(2.0).label === 'Warning', 'Exactly 2.0% remains Warning; critical is >2.0%.');
assert(classifyVuf(2.01).label === 'Critical', 'Raw 2.01% must be Critical even when display rounds to 2.0%.');
assert(classifyVuf(2.04).label === 'Critical', 'Raw classification must not depend on display rounding.');
assert(formatSignedVufDeltaPercent(-0.44) === '-0.4%', 'Improvement delta must keep its negative sign.');
assert(formatSignedVufDeltaPercent(0.34) === '+0.3%', 'Worsening delta must show a positive sign.');
assert(formatSignedVufDeltaPercent(0) === '0.0%', 'Zero delta must not show a plus/minus sign.');

console.log('vuf_presentation_consistency_test: PASS');
