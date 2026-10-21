// Runs EVENT_ORB_RETEST_15D_V1 paper observation and outcome recording on supplied data.
// This script is intentionally isolated from scan.mjs, eligibility state, broker and notification paths.
import fs from 'node:fs';
import { EVENT_ORB_RETEST_RULE_HASH, EVENT_ORB_RETEST_SPEC, appendPaperLedger, buildEventOrbRetestPlan } from './event-orb-retest-core.mjs';

const EVENTS_FILE = process.env.EVENT_ORB_EVENTS || 'data/catalyst-events.jsonl';
const BARS_FILE = process.env.EVENT_ORB_BARS || 'data/event-orb-retest-15d-bars.json';
const LEDGER_FILE = process.env.EVENT_ORB_LEDGER || 'data/event-orb-retest-15d-paper.json';
const AS_OF = process.env.EVENT_ORB_AS_OF || new Date().toISOString();
const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const readJsonl = path => fs.readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
const write = (path, body) => { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(path, JSON.stringify(body, null, 2)); };

if (!fs.existsSync(EVENTS_FILE) || !fs.existsSync(BARS_FILE)) {
  const result = { generatedAt: new Date().toISOString(), status: 'INSUFFICIENT_DATA', allowBuy: false, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, reason: `Requires ${EVENTS_FILE} and ${BARS_FILE}. Nothing was inferred or fetched.`, records: [] };
  write(LEDGER_FILE, result); console.log(JSON.stringify({ output: LEDGER_FILE, status: result.status })); process.exit(0);
}
const events = readJsonl(EVENTS_FILE);
const rawBars = readJson(BARS_FILE);
if (+rawBars.barMinutes !== 5 || !rawBars.series || typeof rawBars.series !== 'object') {
  const result = { generatedAt: new Date().toISOString(), status: 'REJECTED_INPUT', allowBuy: false, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, reason: 'The lane requires a bar manifest with barMinutes=5 and a symbol series map; no conversion from a different interval occurs.', records: [] };
  write(LEDGER_FILE, result); console.log(JSON.stringify({ output: LEDGER_FILE, status: result.status })); process.exit(0);
}
const plans = [], rejected = [];
for (const event of events) {
  const sym = String(event?.sym || event?.symbol || '').toUpperCase();
  const plan = buildEventOrbRetestPlan({ event, bars: rawBars.series[sym] || [], asOf: AS_OF });
  if (plan.status === 'PAPER_PLAN_ONLY') plans.push(plan);
  else rejected.push({ eventId: event?.eventId || null, sym: sym || null, reason: plan.reason });
}
const prior = fs.existsSync(LEDGER_FILE) ? readJson(LEDGER_FILE) : null;
const result = appendPaperLedger(prior, plans, rawBars.series, AS_OF);
result.input = { eventsFile: EVENTS_FILE, barsFile: BARS_FILE, barsGeneratedAt: rawBars.generatedAt || null, barMinutes: rawBars.barMinutes, asOf: AS_OF, strictEventsSupplied: events.length, plansBuiltThisRun: plans.length, rejectedThisRun: rejected.length, rejections: rejected };
result.status = 'RESEARCH_PAPER_LEDGER_ONLY';
result.allowBuy = false;
write(LEDGER_FILE, result);
console.log(JSON.stringify({ output: LEDGER_FILE, status: result.status, suppliedEvents: events.length, plans: plans.length, records: result.records.length, completedMidpoint: result.scorecard.n, rejected: rejected.length }, null, 2));
