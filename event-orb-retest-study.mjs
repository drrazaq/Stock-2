// Offline causal historical study for EVENT_ORB_RETEST_15D_V1.
// The result remains research-only and cannot write Stock-2 eligibility or action state.
import fs from 'node:fs';
import { EVENT_ORB_RETEST_RULE_HASH, EVENT_ORB_RETEST_SPEC, historicalStudy } from './event-orb-retest-core.mjs';

const EVENTS_FILE = process.env.EVENT_ORB_EVENTS || 'data/catalyst-events.jsonl';
const BARS_FILE = process.env.EVENT_ORB_BARS || 'data/event-orb-retest-15d-bars.json';
const OUTPUT = process.env.EVENT_ORB_STUDY || 'data/event-orb-retest-15d-study.json';
const AS_OF = process.env.EVENT_ORB_AS_OF || new Date().toISOString();
const readJsonl = path => fs.readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const write = (path, body) => { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(path, JSON.stringify(body, null, 2)); };
if (!fs.existsSync(EVENTS_FILE) || !fs.existsSync(BARS_FILE)) {
  const out = { generatedAt: new Date().toISOString(), status: 'INSUFFICIENT_DATA', allowBuy: false, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, reason: `Requires strict reviewed events in ${EVENTS_FILE} and matching five-minute bars in ${BARS_FILE}.` };
  write(OUTPUT, out); console.log(JSON.stringify({ output: OUTPUT, status: out.status })); process.exit(0);
}
const events = readJsonl(EVENTS_FILE);
const raw = JSON.parse(fs.readFileSync(BARS_FILE, 'utf8'));
if (+raw.barMinutes !== 5 || !raw.series || typeof raw.series !== 'object') {
  const out = { generatedAt: new Date().toISOString(), status: 'REJECTED_INPUT', allowBuy: false, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, reason: 'The study accepts only a documented five-minute series bundle.' };
  write(OUTPUT, out); console.log(JSON.stringify({ output: OUTPUT, status: out.status })); process.exit(0);
}
const result = historicalStudy({ events, series: raw.series, asOf: AS_OF });
result.input = { eventsFile: EVENTS_FILE, barsFile: BARS_FILE, barsGeneratedAt: raw.generatedAt || null, barMinutes: raw.barMinutes, asOf: AS_OF };
result.promotion = 'The historical report cannot grant BUY eligibility. It needs separately supplied controls, enough chronology-respecting cases, a complete cost/benchmark review and then prospective live-paper evidence under the existing universal action gate.';
write(OUTPUT, result);
console.log(JSON.stringify({ output: OUTPUT, status: result.status, coverage: result.coverage, midpoint: result.midpoint }, null, 2));
