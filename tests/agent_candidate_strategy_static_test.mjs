import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');

const choose = text.slice(text.indexOf('const chooseNextAction'), text.indexOf('const selectAndApplyState'));
if (!choose.includes('...getReductionCandidates(current)') || !choose.includes('...getCompensationCandidates(current)')) {
  throw new Error('AI must evaluate permitted reductions plus Battery compensation candidates.');
}
if (!text.includes('automaticCandidateRespectsMonotonicRule')) {
  throw new Error('Automatic monotonic downshift guard is missing.');
}
if (!text.includes('candidate.heatpump > current.heatpump') || !text.includes('candidate.wallbox > current.wallbox')) {
  throw new Error('Heatpump/Wallbox automatic upshift guard is incomplete.');
}

const compensationStart = text.indexOf('const getCompensationCandidates');
const compensationEnd = text.indexOf('const automaticCandidateRespectsMonotonicRule');
const compensation = text.slice(compensationStart, compensationEnd);
if (compensation.includes('heatpump: 1') || compensation.includes('current.wallbox | 1') || compensation.includes('current.wallbox | 2')) {
  throw new Error('Heatpump/Wallbox upshift candidates must not be generated automatically.');
}
if (!compensation.includes('batteryCharging: true')) {
  throw new Error('Battery OFF->ON compensation candidate must remain available.');
}

console.log('agent_candidate_strategy_static_test: PASS');
