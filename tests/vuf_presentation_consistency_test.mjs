import { classifyVuf, formatVufPercent } from '../client/src/VufPresentation.js';

function assert(condition, message) { if (!condition) throw new Error(message); }

assert(formatVufPercent(1.16) === '1.2%', 'VUF display must use one decimal place.');
assert(formatVufPercent(1.94) === '1.9%', 'VUF rounding must be shared and stable.');
assert(classifyVuf(0.9).label === 'Balanced', '<1.0% must be Balanced.');
assert(classifyVuf(1.0).label === 'Warning', '1.0–2.0% must be Warning.');
assert(classifyVuf(2.0).label === 'Warning', 'Exactly 2.0% remains Warning; critical is >2.0%.');
assert(classifyVuf(2.01).label === 'Critical', '>2.0% must be Critical.');

console.log('vuf_presentation_consistency_test: PASS');
