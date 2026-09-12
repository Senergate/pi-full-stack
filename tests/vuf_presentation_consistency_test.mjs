import { classifyVuf, formatVufPercent, roundedVuf } from '../client/src/VufPresentation.js';
function assert(c,m){if(!c) throw new Error(m)}
assert(formatVufPercent(1.16)==='1.2%','one decimal VUF required');
assert(formatVufPercent(2.04)==='2.0%','2.04 must display 2.0%');
assert(classifyVuf(2.04).label==='Warning','classification must use same rounded 2.0% value');
assert(formatVufPercent(2.06)==='2.1%' && classifyVuf(2.06).label==='Critical','2.06 must display 2.1% Critical');
assert(roundedVuf(1.94)===1.9,'rounding contract mismatch');
console.log('vuf_presentation_consistency_test: PASS');
