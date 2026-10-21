// Builds targeted five-minute historical-bar requests for EVENT_ORB_RETEST_15D_V1.
// Research only: it rejects weak events and never writes scanner, eligibility, or action files.
import fs from 'node:fs';
import { EVENT_ORB_RETEST_RULE_HASH, EVENT_ORB_RETEST_SPEC, validatePrimaryEvent } from './event-orb-retest-core.mjs';

const INPUT = process.env.EVENT_ORB_EVENTS || 'data/catalyst-events.jsonl';
const OUTPUT = process.env.EVENT_ORB_REQUESTS || 'data/event-orb-retest-15d-requests.json';
const MAX_EVENTS = Math.max(1, Math.min(500, +(process.env.EVENT_ORB_MAX_EVENTS || 120)));
const readJsonl = path => fs.existsSync(path) ? fs.readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : null;
const date = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const shift = (ms, days) => new Date(ms + days * 86_400_000);
const write = (path, body) => { fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(path, JSON.stringify(body, null, 2)); };

const raw = readJsonl(INPUT);
if (raw === null) {
  const out = { generatedAt: new Date().toISOString(), status: 'INSUFFICIENT_DATA', allowBuy: false, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, reason: `Missing ${INPUT}; only strict reviewed primary events may create bar requests.`, requests: [], rejected: [] };
  write(OUTPUT, out); console.log(JSON.stringify({ output: OUTPUT, status: out.status })); process.exit(0);
}
const accepted = [], rejected = [];
const unique = new Map();
for (const item of raw) {
  const checked = validatePrimaryEvent(item);
  if (!checked.ok) { rejected.push({ eventId: item?.eventId || null, sym: item?.sym || item?.symbol || null, reason: checked.reason }); continue; }
  const e = checked.event;
  const key = `${e.eventId}:${e.sym}`;
  if (unique.has(key)) { rejected.push({ eventId: e.eventId, sym: e.sym, reason: 'duplicate_event_id' }); continue; }
  unique.set(key, e);
}
for (const event of [...unique.values()].sort((a, b) => a.publishedAt - b.publishedAt).slice(-MAX_EVENTS)) {
  // Two calendar days before and five after capture any next-session event reaction
  // plus the 78 five-minute RTH outcome path. The bar core rejects holidays/gaps.
  accepted.push({ sym: event.sym, from: date(shift(event.publishedAt, -2)), to: date(shift(event.publishedAt, 5)), reason: `${EVENT_ORB_RETEST_SPEC.id}:${event.eventId}`, eventId: event.eventId, sourceUrl: event.sourceUrl, publishedAt: new Date(event.publishedAt).toISOString() });
}
const out = { generatedAt: new Date().toISOString(), status: accepted.length ? 'REQUESTS_READY' : 'INSUFFICIENT_DATA', allowBuy: false, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, source: INPUT, requestWindow: 'two calendar days before through five calendar days after verified publication; bar gaps fail closed later', requests: accepted, rejected, coverage: { rawEvents: raw.length, strictEvents: unique.size, requests: accepted.length, rejected: rejected.length }, limitations: ['Request generation does not validate actual bar coverage or create a plan.', 'The identifier 15D means a documented 15-minute delayed data lane, not a 15-day holding horizon.', 'No scanner, eligibility, Telegram, ZAD, broker, or action file is modified.'] };
write(OUTPUT, out);
console.log(JSON.stringify({ output: OUTPUT, status: out.status, requests: accepted.length, rejected: rejected.length }, null, 2));
