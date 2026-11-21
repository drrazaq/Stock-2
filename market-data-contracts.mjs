// Market-data contracts (1 Nov 2026). INACTIVE: no production file imports this module, it makes no request and changes no rule.
// Pure functions that define what a timestamped volume, a pre-market informational price, a prior-close exit instruction and an
// entry-quote evidence check must satisfy, from Alpaca's official documentation (cited per rule; see docs/market-data-contracts-2026-11-01.md).
//
// Doc facts used (docs.alpaca.markets, read 1 Nov 2026):
//  D1 Market Data FAQ "How are bars aggregated?": minute bars hold trades in [t, t+60s), stamped at the LEFT edge; daily bars truncate
//     the trade time to the New York day. A bar is emitted only if none of o,h,l,c,v is 0: a minute with no trades, or with only
//     volume-only trades (e.g. a single odd-lot 'I'), produces NO bar. Extended-hours trades ('T') update minute volume and daily volume.
//  D2 Historical bars reference (/v2/stocks/bars): start/end inclusive; end defaults to now with real-time access; limit <= 10000 data
//     points per page in total (not per symbol); results sorted by symbol then time; follow next_page_token.
//  D3 Subscription table: Algo Trader Plus = all US exchanges real time, no 15-minute historical restriction, 10,000 historical calls/min.
//  D4 Real-time stock stream: minute bars emitted right after each minute mark; updatedBars emitted after the half-minute mark when a
//     late trade arrives for the previous minute; dailyBars emitted after each minute mark, holding all trades until emission.
//  D5 Latest quotes reference: best bid/ask with sizes "in shares (round lots prior to November 3, 2025)", exchanges, condition flags
//     and an RFC-3339 timestamp; 0 price means no active bid/ask. Feed sip = all US exchanges (NBBO); iex = one exchange.
//  D6 Snapshot reference: latest trade, latest quote, latest minute bar, current daily bar, previous daily bar; no as-of time for the
//     daily bar's cumulative volume (its t is the session start).

const need = (v, code) => { if (!v) throw Error(code); };
const MIN = 60000;
// Calendar-exact timestamp checks. Date.parse silently normalises impossible dates (2026-02-30 -> 2026-03-02), so every field is
// checked against the real calendar first. Supported formats (RFC 3339 profile used by Alpaca): YYYY-MM-DDTHH:MM:SS, optional
// fraction of 1-9 digits, then 'Z' or a +HH:MM / -HH:MM offset. Uppercase 'T' and 'Z' only; no leap second (60); no offset without colon.
const daysInMonth = (y, m) => [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
export const isCalendarDay = (x) => { if (typeof x !== 'string') return false; const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(x); if (!m) return false; const y = +m[1], mo = +m[2], d = +m[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo); };
export const isIso = (x) => {
  if (typeof x !== 'string') return false;
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(\.\d{1,9})?(Z|([+-])(\d\d):(\d\d))$/.exec(x);
  if (!m || !isCalendarDay(m[1]) || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) return false;
  if (m[6] !== 'Z' && (+m[8] > 23 || +m[9] > 59)) return false;
  return Number.isFinite(Date.parse(x));
};
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nyParts = (ms) => { const p = Object.fromEntries(NY.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { day: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute }; };
export const nyDay = (ms) => nyParts(ms).day;

// New York wall-clock minute of a session day -> UTC ms (DST-correct, including the 1 Nov / 2 Nov 2026 change).
export function nyLocalToUtc(day, minuteOfDay) {
  need(isCalendarDay(day) && Number.isInteger(minuteOfDay) && minuteOfDay >= 0 && minuteOfDay < 1440, 'NY_LOCAL_ARGS');
  for (const offsetH of [4, 5]) { const ms = Date.parse(day + 'T00:00:00Z') + minuteOfDay * MIN + offsetH * 3600000, p = nyParts(ms); if (p.day === day && p.min === minuteOfDay) return ms; }
  throw Error('NY_LOCAL_UNRESOLVED');
}

// Session scopes in New York local minutes. Extended hours per D1 condition 'T'; the regular session is 09:30-16:00.
export const SCOPES = Object.freeze({ PRE: [240, 570], REGULAR: [570, 960], POST: [960, 1200], PRE_AND_REGULAR: [240, 960], ALL_EXTENDED: [240, 1200] });

// Argument checks: a missing, non-finite or out-of-range limit is a caller error, never a silent pass.
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const argCheck = (ok, what) => { if (!ok) throw Error('INVALID_ARGUMENT_' + what); };
const positivePrice = (x) => finite(x) && x > 0;

// Volume classes. Only RETURNED_BAR_SUM with an explicit evidence boundary may be offered to a time-sensitive gate.
export const VOLUME_CLASS = Object.freeze({
  UNTIMED_DAILY: 'UNTIMED_DAILY',        // snapshot dailyBar.v (D6), Massive totals without a usable as-of: informational or daily rules only
  RETURNED_BAR_SUM: 'RETURNED_BAR_SUM',  // sum of the SIP 1-minute bars the API returned, over a stated scope, through a stated closed minute
});

// Revision grace: minutes whose interval ended less than graceMs before retrieval are reported separately (INSIDE_GRACE): the stream
// re-emits a minute after the next half-minute mark when a late trade arrives (D4). 60 s = that plus margin. The REST behaviour is NOT
// documented; this is an assumption until the bounded protected verification measures it. It is not a guarantee that a minute is final:
// trade corrections and cancels (D4) can change a bar later.
export const DEFAULT_REVISION_GRACE_MS = 60000;
export const MAX_REVISION_GRACE_MS = 15 * MIN;
export const SIZE_UNIT_CHANGE = Date.parse('2025-11-03T00:00:00-05:00');   // D5
export const COVERAGE_LIMITS = Object.freeze([
  'Only returned bars are summed. A minute with no qualifying trade, or with only volume-only trades, returns no bar (D1); its volume is not counted.',
  'Bars can change after retrieval: late trades (D4 updatedBars) and trade corrections or cancels (D4). A second retrieval is the only evidence of change.',
  'The revision grace is an unverified assumption about the REST endpoint (no documented settlement time).',
  'The condition rules of D1 decide which trades a bar counts; the sum is that, not every reported share.',
]);

const BAR_FIELDS = ['o', 'h', 'l', 'c', 'v', 'n', 'vw'];
function barProblem(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'NOT_AN_OBJECT';
  if (!isIso(b.t)) return 'BAD_TIMESTAMP';
  if (Date.parse(b.t) % MIN !== 0) return 'NOT_MINUTE_ALIGNED';
  if (!['o', 'h', 'l', 'c', 'vw'].every(k => positivePrice(b[k]))) return 'BAD_PRICE';
  if (!(Number.isSafeInteger(b.v) && b.v > 0 && Number.isSafeInteger(b.n) && b.n > 0)) return 'BAD_VOLUME_OR_COUNT';
  if (!(b.h >= Math.max(b.o, b.c) && b.l <= Math.min(b.o, b.c) && b.l <= b.h && b.vw >= b.l && b.vw <= b.h)) return 'INCONSISTENT_OHLC';
  return null;
}

// Sum of the returned qualifying SIP 1-minute bars for one symbol, one New York session day and one scope.
//   bars        array from /v2/stocks/bars?timeframe=1Min&feed=sip for that symbol (all pages merged), unmodified
//   asOf        closed minute boundary (ms, minute-aligned): only bars whose interval ENDS at or before it are summed
//   retrievedAt when the response was received (ms)
//   graceMs     integer 0..15 min; bars ending later than retrievedAt - graceMs are counted separately as INSIDE_GRACE
//   dailyVolume optional, a later-retrieved daily total for the same session (safe integer >= 0), for a consistency check only
export function aggregateTimedVolume(bars, { day, scope = 'REGULAR', asOf, retrievedAt, feed, graceMs = DEFAULT_REVISION_GRACE_MS, dailyVolume = null } = {}) {
  argCheck(feed === 'sip', 'FEED_MUST_BE_SIP');                                   // iex is one exchange, about 2.5% of volume (D8)
  argCheck(Array.isArray(bars), 'BARS');
  argCheck(typeof scope === 'string' && Object.hasOwn(SCOPES, scope), 'SCOPE');
  argCheck(isCalendarDay(day), 'DAY');
  argCheck(finite(asOf) && asOf % MIN === 0, 'AS_OF');
  argCheck(finite(retrievedAt) && asOf <= retrievedAt, 'RETRIEVED_AT');
  argCheck(Number.isSafeInteger(graceMs) && graceMs >= 0 && graceMs <= MAX_REVISION_GRACE_MS, 'GRACE_MS');
  argCheck(dailyVolume === null || (Number.isSafeInteger(dailyVolume) && dailyVolume >= 0), 'DAILY_VOLUME');
  const [s0, s1] = SCOPES[scope], start = nyLocalToUtc(day, s0), end = Math.min(nyLocalToUtc(day, s1), asOf), graceBoundary = Math.min(end, Math.floor((retrievedAt - graceMs) / MIN) * MIN);
  const issues = [], seen = new Set(); let outside = 0, inside = 0, trades = 0, prev = -Infinity; const minutes = [];
  bars.forEach((b, i) => {
    const problem = barProblem(b); if (problem) { issues.push({ code: 'MALFORMED_BAR', problem, index: i }); return; }
    const t = Date.parse(b.t);
    if (seen.has(t)) { issues.push({ code: 'DUPLICATE_MINUTE', index: i, t: b.t }); return; }
    if (t < prev) issues.push({ code: 'OUT_OF_ORDER', index: i, t: b.t });
    prev = Math.max(prev, t); seen.add(t);
    if (nyDay(t) !== day) { issues.push({ code: 'OTHER_SESSION', index: i, t: b.t }); return; }
    if (t + MIN > retrievedAt) { issues.push({ code: 'BAR_NOT_CLOSED_AT_RETRIEVAL', index: i, t: b.t }); return; }   // never counted
    if (t < start || t + MIN > end) return;                                                                         // outside scope / after asOf
    if (t + MIN <= graceBoundary) outside += b.v; else inside += b.v;
    trades += b.n; minutes.push(t);
  });
  const expected = Math.max(0, (end - start) / MIN), have = new Set(minutes), gaps = [];
  for (let t = start; t < end; t += MIN) if (!have.has(t)) { const g = gaps[gaps.length - 1]; if (g && g.to === t) g.to = t + MIN; else gaps.push({ from: t, to: t + MIN }); }
  const blocking = issues.filter(x => x.code !== 'BAR_NOT_CLOSED_AT_RETRIEVAL');
  let consistency = null;
  if (dailyVolume !== null) consistency = outside + inside > dailyVolume ? { status: 'CONTRADICTION', returnedBarSum: outside + inside, dailyVolume } : { status: 'NOT_CONTRADICTED', returnedBarSum: outside + inside, dailyVolume, notInReturnedBars: dailyVolume - outside - inside };
  const status = blocking.length || (consistency && consistency.status === 'CONTRADICTION') ? 'INVALID_EVIDENCE' : expected === 0 ? 'EMPTY_WINDOW' : 'COMPUTED';
  return {
    volumeClass: status === 'COMPUTED' ? VOLUME_CLASS.RETURNED_BAR_SUM : null, status, evidence: 'SUM_OF_RETURNED_QUALIFYING_SIP_MINUTE_BARS', feed, day, scope,
    windowStart: new Date(start).toISOString(), asOf: new Date(end).toISOString(), graceBoundary: new Date(Math.max(start, graceBoundary)).toISOString(), graceMs, retrievedAt: new Date(retrievedAt).toISOString(),
    volumeOutsideGrace: outside, volumeInsideGrace: inside, returnedBarSum: outside + inside, trades,
    coverage: { minutesInWindow: expected, minutesWithReturnedBar: minutes.length, minutesWithoutReturnedBar: expected - minutes.length,
      minutesWithoutBar: gaps.map(g => ({ from: new Date(g.from).toISOString(), to: new Date(g.to).toISOString() })),
      label: expected - minutes.length ? 'SOME_MINUTES_RETURNED_NO_BAR' : 'EVERY_MINUTE_RETURNED_A_BAR', limits: COVERAGE_LIMITS },
    consistency, issues,
  };
}

// Revisions between two retrievals of the same symbol and session. Every field of every minute is compared; malformed or duplicate
// evidence on either side is reported, and the comparison is marked not comparable rather than silently cleaned.
export function reconcileRevisions(before, after) {
  argCheck(Array.isArray(before) && Array.isArray(after), 'REVISION_INPUTS');
  const evidenceIssues = [], index = (bars, side) => { const map = new Map(); bars.forEach((b, i) => { const problem = barProblem(b); if (problem) { evidenceIssues.push({ side, index: i, code: 'MALFORMED_BAR', problem }); return; } const t = Date.parse(b.t); if (map.has(t)) { evidenceIssues.push({ side, index: i, code: 'DUPLICATE_MINUTE', t: b.t }); return; } map.set(t, b); }); return map; };
  const a = index(before, 'before'), b = index(after, 'after'), changes = [];
  for (const [t, x] of b) { const y = a.get(t); if (!y) { changes.push({ t: new Date(t).toISOString(), kind: 'ADDED', dv: x.v, dn: x.n }); continue; } const fields = BAR_FIELDS.filter(k => y[k] !== x[k]); if (fields.length) changes.push({ t: new Date(t).toISOString(), kind: 'CHANGED', fields, dv: x.v - y.v, dn: x.n - y.n }); }
  for (const [t, y] of a) if (!b.has(t)) changes.push({ t: new Date(t).toISOString(), kind: 'REMOVED', dv: -y.v, dn: -y.n });
  return { comparable: evidenceIssues.length === 0, changes: changes.sort((x, y) => x.t < y.t ? -1 : 1), evidenceIssues };
}

// Evidence check for a time-sensitive gate. Untimed daily volume never qualifies; the grace boundary must be within maxAgeMs.
// Passing means "the evidence meets the stated requirements", not that the volume is complete or final (see COVERAGE_LIMITS).
export function volumeMeetsGateEvidence(v, { nowMs, maxAgeMs, allowMinutesWithoutBar = true } = {}) {
  argCheck(finite(nowMs), 'NOW_MS'); argCheck(finite(maxAgeMs) && maxAgeMs >= 0, 'MAX_AGE_MS'); argCheck(typeof allowMinutesWithoutBar === 'boolean', 'ALLOW_MINUTES_WITHOUT_BAR');
  if (!v || v.volumeClass !== VOLUME_CLASS.RETURNED_BAR_SUM || v.status !== 'COMPUTED') return { meets: false, reason: 'NOT_A_COMPUTED_RETURNED_BAR_SUM' };
  const age = nowMs - Date.parse(v.graceBoundary);
  if (!(age >= 0)) return { meets: false, reason: 'BOUNDARY_AFTER_NOW' };
  if (age > maxAgeMs) return { meets: false, reason: 'BOUNDARY_TOO_OLD', ageMs: age };
  if (!allowMinutesWithoutBar && v.coverage.minutesWithoutReturnedBar) return { meets: false, reason: 'MINUTES_WITHOUT_BAR_NOT_ALLOWED' };
  return { meets: true, ageMs: age, volume: v.volumeOutsideGrace, evidence: v.evidence, minutesWithoutReturnedBar: v.coverage.minutesWithoutReturnedBar, limits: COVERAGE_LIMITS };
}

// ---- Three separate price roles (never interchangeable) ----
const PHASES = ['PRE', 'REGULAR', 'POST'];
const phaseOf = (t) => { const p = nyParts(t); return p.min < 240 || p.min >= 1200 ? 'OVERNIGHT' : p.min < 570 ? 'PRE' : p.min < 960 ? 'REGULAR' : 'POST'; };

// 1) Pre-market INFORMATIONAL price: a reported trade with its time and age. Information only; it says nothing about fills.
export function premarketInfo(trade, { nowMs, day, feed } = {}) {
  argCheck(finite(nowMs), 'NOW_MS'); argCheck(isCalendarDay(day), 'DAY');
  const base = { role: 'PREMARKET_INFORMATION', informationOnly: true, feed: feed || null };
  if (!trade || !positivePrice(trade.p) || !isIso(trade.t)) return { ...base, status: 'MISSING_OR_MALFORMED' };
  const t = Date.parse(trade.t);
  if (t > nowMs) return { ...base, status: 'TRADE_CLOCK_AFTER_NOW', tradeAt: trade.t };
  if (nyDay(t) !== day) return { ...base, status: 'NOT_THIS_SESSION_DAY', tradeAt: trade.t };
  return { ...base, status: 'REPORTED_TRADE', price: trade.p, tradeAt: trade.t, ageMs: nowMs - t, phase: phaseOf(t) };
}

// 2) PRIOR-CLOSE exit instruction: the previous session's daily close compared with the owner's stop, for action at the open.
//    It is an instruction, not a price at which an order would fill. stop: a positive finite number, or null for "no stop set".
export function priorCloseExit(prevDailyBar, { stop, day } = {}) {
  argCheck(stop === null || positivePrice(stop), 'STOP'); argCheck(isCalendarDay(day), 'DAY');
  const base = { role: 'PRIOR_CLOSE_INSTRUCTION', instructionForTheOpen: true };
  if (!prevDailyBar || !positivePrice(prevDailyBar.c) || !isIso(prevDailyBar.t)) return { ...base, status: 'MISSING_OR_MALFORMED' };
  const session = nyDay(Date.parse(prevDailyBar.t));
  if (!(session < day)) return { ...base, status: 'NOT_A_PRIOR_SESSION', session };
  return { ...base, status: 'PRIOR_CLOSE_REPORTED', session, close: prevDailyBar.c, stopHit: stop === null ? null : prevDailyBar.c <= stop };
}

// 3) ENTRY QUOTE evidence: whether a consolidated best bid/offer meets a strategy's stated quote checks. Passing is evidence about the
//    quote at its timestamp only: not a fill, not a guarantee of execution, size or price. Every limit is required and validated.
export function entryQuoteEvidence(q, { nowMs, feed, maxAgeMs, maxSpreadPct, minAskShares, phase } = {}) {
  argCheck(finite(nowMs), 'NOW_MS'); argCheck(finite(maxAgeMs) && maxAgeMs > 0, 'MAX_AGE_MS'); argCheck(finite(maxSpreadPct) && maxSpreadPct > 0 && maxSpreadPct < 1, 'MAX_SPREAD_PCT');
  argCheck(Number.isSafeInteger(minAskShares) && minAskShares > 0, 'MIN_ASK_SHARES'); argCheck(phase === undefined || PHASES.includes(phase), 'PHASE');
  const fail = (reason) => ({ role: 'ENTRY_QUOTE_EVIDENCE', passesQuoteChecks: false, reason });
  if (feed !== 'sip') return fail('NOT_CONSOLIDATED_FEED');                       // iex is one exchange (D5, D8)
  if (!q || !isIso(q.t)) return fail('NO_VALID_QUOTE_CLOCK');
  const t = Date.parse(q.t), age = nowMs - t;
  if (age < 0) return fail('QUOTE_CLOCK_AFTER_NOW');
  if (age > maxAgeMs) return fail('QUOTE_OLDER_THAN_LIMIT');
  if (!finite(q.bp) || !finite(q.ap)) return fail('NON_FINITE_PRICE');
  if (!(q.bp > 0) || !(q.ap > 0)) return fail('ONE_SIDED_OR_NO_MARKET');           // 0 = no active bid/ask (D5)
  if (q.ap < q.bp) return fail('CROSSED');
  const spread = (q.ap - q.bp) / ((q.ap + q.bp) / 2);
  if (!(spread <= maxSpreadPct)) return fail('SPREAD_ABOVE_LIMIT');
  if (t < SIZE_UNIT_CHANGE) return fail('SIZE_UNIT_ROUND_LOTS_BEFORE_2025_11_03'); // D5
  if (!(Number.isSafeInteger(q.as) && q.as >= minAskShares)) return fail('ASK_SIZE_BELOW_LIMIT_OR_MALFORMED');
  const quotePhase = phaseOf(t);
  if (phase && quotePhase !== phase) return fail('OTHER_SESSION_PHASE');
  return { role: 'ENTRY_QUOTE_EVIDENCE', passesQuoteChecks: true, evidenceLabel: 'QUOTE_CHECKS_PASSED_AT_QUOTE_TIME_NOT_A_FILL_GUARANTEE', ask: q.ap, bid: q.bp, askShares: q.as, spread, ageMs: age, quoteAt: q.t, phase: quotePhase, conditions: Array.isArray(q.c) ? q.c : [] };
}

// Request budget for timed volume by REST polling (D2/D3). Each poll asks only for the newly closed minute(s). The maximum number of
// symbols per request is NOT documented; production already chunks snapshot requests at 200, so that is the default here.
export function planBarRequests({ symbols, symbolsPerRequest = 200, minutesPerPoll = 1, pollsPerMinute = 1, pageLimit = 10000, callsPerMinuteLimit = 10000 } = {}) {
  argCheck([symbols, symbolsPerRequest, minutesPerPoll, pollsPerMinute, pageLimit, callsPerMinuteLimit].every(x => Number.isSafeInteger(x) && x > 0) && pageLimit <= 10000, 'PLAN');
  const chunks = Math.ceil(symbols / symbolsPerRequest), pagesPerChunk = Math.ceil(Math.min(symbols, symbolsPerRequest) * minutesPerPoll / pageLimit);
  const callsPerPoll = chunks * pagesPerChunk, callsPerMinute = callsPerPoll * pollsPerMinute;
  return { chunks, pagesPerChunk, callsPerPoll, callsPerMinute, shareOfLimit: callsPerMinute / callsPerMinuteLimit, withinLimit: callsPerMinute <= callsPerMinuteLimit };
}
