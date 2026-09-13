import fs from 'node:fs';
const text = fs.readFileSync(new URL('../client/src/components/AgentCard.vue', import.meta.url), 'utf8');

const choose = text.slice(text.indexOf('const chooseNextAction'), text.indexOf('const selectAndApplyState'));
if (!choose.includes('...getReductionCandidates(current)') || !choose.includes('...getCompensationCandidates(current)')) {
  throw new Error('AI must compare reduction and compensation candidates in one search space.');
}
if (choose.includes('if (reductions.length > 0)')) {
  throw new Error('Old reduction-first greedy branch must be removed.');
}
if (!text.includes('current.wallbox | 1') || !text.includes('current.wallbox | 2')) {
  throw new Error('Branch-B compensation must treat wallbox state as a relay bitmask.');
}

console.log('agent_candidate_strategy_static_test: PASS');
