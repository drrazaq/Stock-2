// EVENT_ORB_RETEST_15D_V1 events adapter (research only; no Telegram, no BUY, nothing in scan.mjs is touched).
// Builds data/catalyst-events.jsonl in the strict envelope the lane requires from official timestamped sources:
//   1. SEC EDGAR submissions API (data.sec.gov, official): every 8-K with its acceptance time (UTC, "...Z") for the halal watch
//      list, going back EVR_YEARS (default 2). Items kept: 1.01 (contract), 2.02 (results), 8.01 (other events).
//   2. data/events-recent.json (the last 10 days, written by events-study.mjs from the same EDGAR acceptance times, sliced to
//      the minute) for a watch-list symbol whose EDGAR page could not be fetched in this run (budget or refusal).
// Universe: ZAD halal "ok" marks (data/halal.json) plus the scan watch universe (data/signals.json uni) minus every halal "fail";
// a symbol needs an SEC number in data/sec-ciks.json. blocked:true when the symbol is lottery-like in data/signals.json
// (one-day jump >= 15%, the scan's own threshold) or filed a share sale (8-K item 3.02, 424B4, 424B5) in the 30 days before.
// Timestamps: EDGAR acceptanceDateTime carries "Z" and is UTC (checked in the run: 2.02 filings cluster at 07-08 and 16-17 New
// York time under that reading). availableAt = acceptance + 1 minute (EDGAR dissemination), NOT the time Stock-2 captured it.
// Also writes one matched non-event control per strict event (same stock, same New York clock time, nearest weekday at least
// 7 calendar days earlier with no 8-K of any kind within 2 days) to data/event-orb-retest-15d-controls.jsonl. The control
// rows are lane-private yardstick inputs only; they are never mixed into the event file.
// Budget: EVR_SEC_CALLS (default 600) and EVR_SEC_MINUTES (default 20); EDGAR pages cached in fm-cache/evr-sec.json.gz.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SEC_DATA = local(env.SEC_BASE) || 'https://data.sec.gov', FAST = Boolean(local(env.SEC_BASE));
const UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com';
const CDIR = env.FM_CACHE_DIR || 'fm-cache', CACHE = CDIR + '/evr-sec.json.gz', VER = 1;
const OUT = env.EVENT_ORB_EVENTS || 'data/catalyst-events.jsonl', CONTROLS = env.EVENT_ORB_CONTROLS || 'data/event-orb-retest-15d-controls.jsonl', SUMMARY = env.EVENT_ORB_EVENTS_SUMMARY || 'data/event-orb-retest-15d-events.json';
const YEARS = +(env.EVR_YEARS || 2), MAXN = Math.max(1, Math.min(500, +(env.EVENT_ORB_MAX_EVENTS || 500)));
const MAXC = +(env.EVR_SEC_CALLS || 600), MAXMS = +(env.EVR_SEC_MINUTES || 20) * 60000, t0 = Date.now();
const ITEMS = { '1.01': 'CONTRACT', '2.02': 'EARN', '8.01': 'NEWS' }, DILUTION_ITEM = '3.02', DILUTION_FORMS = new Set(['424B4', '424B5']);
const LOTTERY = 0.15, DILUTION_DAYS = 30, CONTROL_GAP_DAYS = 7, CONTROL_CLEAR_DAYS = 2;
const sleep = (ms) => new Promise(r => setTimeout(r, FAST ? 0 : ms)), J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
const nyParts = (ms) => Object.fromEntries(NY.formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
const nyDate = (ms) => { const p = nyParts(ms); return `${p.year}-${p.month}-${p.day}`; };
function nyToUtc(day, hour, minute) {   // New York wall clock -> UTC ms (DST-safe)
  const [y, m, d] = day.split('-').map(Number); let guess = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 2; i++) { const p = nyParts(guess); const asIf = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); guess += Date.UTC(y, m - 1, d, hour, minute) - asIf; }
  return guess;
}
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CDIR, { recursive: true });

// ---- universe
const halal = J('data/halal.json', {}), sig = J('data/signals.json', {}), ciks = J('data/sec-ciks.json', {});
const fail = new Set(Object.entries(halal).filter(([, v]) => v && v.s === 'fail').map(([k]) => k));
const universe = [...new Set([...Object.entries(halal).filter(([, v]) => v && v.s === 'ok').map(([k]) => k), ...((sig.uni || []).map(x => x.sym))])]
  .filter(s => /^[A-Z]{1,5}(\.[A-Z])?$/.test(s) && s !== 'SPY' && !fail.has(s)).sort();
const lottery = sig.lottery || {};

// ---- EDGAR submissions (cached one day)
let cache = { _v: VER, syms: {} }; try { const x = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString()); if (x._v === VER) cache = x; } catch (e) {}
let calls = 0, note = '';
async function sec(url) {
  if (note || calls >= MAXC || Date.now() - t0 > MAXMS) return null; await sleep(150); calls++;
  const go = () => fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  let r; try { r = await go(); } catch (e) { return null; }
  for (let k = 0; k < 3 && (r.status === 403 || r.status === 429); k++) { await sleep(4000 + Math.random() * 6000); try { r = await go(); } catch (e) { return null; } }
  if (r.status === 403 || r.status === 429) { note = 'SEC refused this server (HTTP ' + r.status + ') after 3 retries'; console.log('evr-events: ' + note); return null; }
  if (!r.ok) return null; return r.json().catch(() => null);
}
const cut = new Date(Date.now() - YEARS * 365.25 * 864e5).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
// SEC numbers: data/sec-ciks.json first, then the SEC's official ticker file (one call a week, cached) for the rest of the watch list
if (universe.some(s => !(ciks[s] && ciks[s][0])) && (!cache.ciks || !cache.ciksAt || Date.now() - Date.parse(cache.ciksAt) > 7 * 864e5)) {
  const j = await sec((local(env.SEC_BASE) || 'https://www.sec.gov') + '/files/company_tickers.json');
  if (j) { const m = {}; for (const x of Object.values(j)) if (x && x.ticker) m[String(x.ticker).toUpperCase().replace(/-/g, '.')] = x.cik_str; cache.ciks = m; cache.ciksAt = new Date().toISOString(); }
}
for (const s of universe) if (!(ciks[s] && ciks[s][0]) && cache.ciks && cache.ciks[s]) ciks[s] = [cache.ciks[s], 'from the SEC ticker file'];
const withCik = universe.filter(s => ciks[s] && ciks[s][0]), noCik = universe.filter(s => !(ciks[s] && ciks[s][0]));
console.log('evr-events: universe ' + universe.length + ' (halal ok + watch universe, minus halal fail), with SEC number ' + withCik.length + ' (' + noCik.length + ' without)');
const rowsOf = (R) => { const n = (R.form || []).length, out = []; for (let k = 0; k < n; k++) { const form = String(R.form[k] || ''); if (!/^8-K$/.test(form) && !DILUTION_FORMS.has(form)) continue; out.push({ a: R.accessionNumber[k], form, items: String((R.items || [])[k] || ''), acc: String(R.acceptanceDateTime ? R.acceptanceDateTime[k] || '' : ''), fd: String(R.filingDate[k] || '') }); } return out; };
let fetched = 0, fromCache = 0, failed = 0;
for (const s of withCik) {
  const S = cache.syms[s];
  if (S && S.t === today) { fromCache++; continue; }
  if (note || calls >= MAXC || Date.now() - t0 > MAXMS) break;
  const cik = String(ciks[s][0]).padStart(10, '0');
  const j = await sec(SEC_DATA + '/submissions/CIK' + cik + '.json');
  if (!j || !j.filings) { failed++; continue; }
  let rows = rowsOf(j.filings.recent || {}), complete = true;
  const oldest = rows.length ? rows.map(r => r.fd).sort()[0] : null;
  if (!oldest || oldest > cut) for (const fl of j.filings.files || []) { if (String(fl.filingTo || '') < cut) continue; const o = await sec(SEC_DATA + '/submissions/' + fl.name); if (o) rows = rows.concat(rowsOf(o)); else complete = false; }
  cache.syms[s] = { cik: ciks[s][0], t: today, complete, rows: rows.filter(r => r.fd >= cut) }; fetched++;
}
fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(cache)));
console.log('evr-events: EDGAR pages fetched ' + fetched + ', from cache ' + fromCache + ', failed ' + failed + ', calls ' + calls + (note ? ', ' + note : ''));

// ---- strict rows
const rejected = {}, rej = (why) => { rejected[why] = (rejected[why] || 0) + 1; };
const all = [], covered = new Set(), hourHist = {}, formatSample = new Set();
for (const s of withCik) {
  const S = cache.syms[s]; if (!S) continue; covered.add(s);
  const sales = S.rows.filter(r => DILUTION_FORMS.has(r.form) || r.items.split(',').map(x => x.trim()).includes(DILUTION_ITEM)).map(r => r.fd);
  for (const r of S.rows) {
    if (r.form !== '8-K') continue;
    const items = r.items.split(',').map(x => x.trim()).filter(Boolean), fams = [...new Set(items.filter(i => ITEMS[i]).map(i => ITEMS[i]))];
    all.push(1);
    if (!fams.length) { rej('item_not_in_1.01_2.02_8.01'); continue; }
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(r.acc)) { rej('no_acceptance_time'); continue; }
    if (formatSample.size < 3) formatSample.add(r.acc);
    const ms = Date.parse(r.acc); if (!(ms > 0)) { rej('bad_acceptance_time'); continue; }
    if (r.fd < cut) { rej('older_than_window'); continue; }
    if (fams.includes('EARN')) { const h = nyParts(ms).hour; hourHist[h] = (hourHist[h] || 0) + 1; }
    const blocked = [];
    if (lottery[s] >= LOTTERY) blocked.push('lottery_like');
    if (sales.some(d => d <= r.fd && Date.parse(r.fd) - Date.parse(d) <= DILUTION_DAYS * 864e5)) blocked.push('share_sale_within_30_days');
    const row = { eventId: r.a, sym: s, kind: 'sec_8k_' + fams.join('+').toLowerCase() + '_items_' + items.filter(i => ITEMS[i]).join('+'), sourceUrl: 'https://www.sec.gov/Archives/edgar/data/' + S.cik + '/' + String(r.a).replace(/-/g, '') + '/', publishedAt: new Date(ms).toISOString(), capturedAt: new Date(ms + 60000).toISOString(), availableAt: new Date(ms + 60000).toISOString(), verificationStatus: 'VERIFIED_PRIMARY_CONTENT', tradableUniverseVerified: true, blocked: blocked.length > 0, source: 'EDGAR submissions API, acceptanceDateTime (UTC); availableAt = acceptance + 1 minute (EDGAR dissemination, not Stock-2 capture)' };
    if (blocked.length) row.blockReasons = blocked;
    row._ms = ms; row._fams = fams; all[all.length - 1] = row;
  }
}
// events-recent.json for watch-list symbols without an EDGAR page this run (same acceptance times, cut to the minute, no accession number)
const recent = (J('data/events-recent.json', {}).events || []), recentUsed = [], recentMatched = { exact: 0, checked: 0 };
const known = new Map(); for (const r of all) if (typeof r === 'object') known.set(r.sym + '|' + r.publishedAt.slice(0, 16), r);
for (const e of recent) {
  // e.p: since 22 Oct 2026 New York time with its offset ('2026-10-21T08:05-04:00'); older files: UTC cut to the minute without a Z.
  // utcMin = the UTC minute in both cases (same key and event id as before).
  const pz = String(e.p || ''), zoned = /^\d{4}-\d\d-\d\dT\d\d:\d\d(Z|[+-]\d\d:\d\d)$/.test(pz); if (!universe.includes(e.sym) || !(zoned || /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(pz))) continue;
  const utcMin = new Date(Date.parse(zoned ? pz : pz + ':00Z')).toISOString().slice(0, 16);
  if (covered.has(e.sym)) { recentMatched.checked++; if (known.has(e.sym + '|' + utcMin)) recentMatched.exact++; continue; }
  const fams = String(e.f || '').split(',').filter(f => ['CONTRACT', 'EARN', 'NEWS'].includes(f)); if (!fams.length) { rej('recent_row_family_not_in_lane'); continue; }
  const ms = Date.parse(utcMin + ':00Z'); const cik = ciks[e.sym] ? ciks[e.sym][0] : null;
  if (!cik) { rej('recent_row_no_sec_number'); continue; }
  const row = { eventId: 'events-recent:' + e.sym + ':' + utcMin + ':' + fams.join('+'), sym: e.sym, kind: 'sec_8k_' + fams.join('+').toLowerCase() + '_from_events_recent', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=' + String(cik).padStart(10, '0') + '&type=8-K&dateb=&owner=include&count=40', publishedAt: new Date(ms).toISOString(), capturedAt: new Date(ms + 60000).toISOString(), availableAt: new Date(ms + 60000).toISOString(), verificationStatus: 'VERIFIED_PRIMARY_CONTENT', tradableUniverseVerified: true, blocked: lottery[e.sym] >= LOTTERY || /DILUTION|OFFERING/.test(String(e.f)), source: 'data/events-recent.json (events-study.mjs, EDGAR acceptance time cut to the minute; New York time with offset, older files UTC)', _ms: ms, _fams: fams };
  if (row.blocked) row.blockReasons = [lottery[e.sym] >= LOTTERY ? 'lottery_like' : 'share_sale_flag'];
  recentUsed.push(row);
}
const rows = [...all.filter(r => typeof r === 'object'), ...recentUsed].sort((a, b) => a._ms - b._ms);
const rawCount = all.length + recent.length;
const unblocked = rows.filter(r => !r.blocked), blockedN = rows.length - unblocked.length;
for (const r of rows) if (r.blocked) rej('blocked_' + r.blockReasons.join('_and_'));
// the lane file: the newest MAXN unblocked events (the supplied requests script caps at 500) plus the blocked rows in the same date range
const lane = unblocked.slice(-MAXN), from = lane.length ? lane[0]._ms : null;
const laneRows = rows.filter(r => from !== null && r._ms >= from);
const strip = (r) => { const o = { ...r }; delete o._ms; delete o._fams; return o; };
fs.writeFileSync(OUT, laneRows.map(r => JSON.stringify(strip(r))).join('\n') + (laneRows.length ? '\n' : ''));

// ---- matched non-event controls: same stock, same New York clock time, nearest weekday >= 7 calendar days earlier with no 8-K within 2 days
const controls = [], controlMiss = {};
for (const e of lane) {
  const S = cache.syms[e.sym], filingDays = new Set((S ? S.rows : []).map(r => r.fd));
  const p = nyParts(e._ms), evDay = nyDate(e._ms); let pick = null;
  for (let k = CONTROL_GAP_DAYS; k <= CONTROL_GAP_DAYS + 30 && !pick; k++) {
    const day = new Date(Date.parse(evDay + 'T12:00:00Z') - k * 864e5).toISOString().slice(0, 10), wd = new Date(day + 'T12:00:00Z').getUTCDay();
    if (wd === 0 || wd === 6) continue;
    let clear = true; for (let j = -CONTROL_CLEAR_DAYS; j <= CONTROL_CLEAR_DAYS && clear; j++) if (filingDays.has(new Date(Date.parse(day + 'T12:00:00Z') + j * 864e5).toISOString().slice(0, 10))) clear = false;
    if (clear) pick = day;
  }
  if (!pick) { controlMiss.no_clear_weekday_within_37_days = (controlMiss.no_clear_weekday_within_37_days || 0) + 1; continue; }
  const ms = nyToUtc(pick, +p.hour, +p.minute);
  controls.push({ eventId: 'control:' + e.eventId + ':' + pick, sym: e.sym, kind: 'control_non_event_day_for_' + e.kind, sourceUrl: e.sourceUrl, publishedAt: new Date(ms).toISOString(), capturedAt: new Date(ms + 60000).toISOString(), availableAt: new Date(ms + 60000).toISOString(), verificationStatus: 'VERIFIED_PRIMARY_CONTENT', tradableUniverseVerified: true, blocked: false, control: true, forEventId: e.eventId, note: 'NOT an event: a matched non-event control day for the yardstick (same stock, same New York clock time, no 8-K within 2 days). verificationStatus is set only so the frozen core accepts the row; it is never mixed into the event file.' });
}
fs.writeFileSync(CONTROLS, controls.map(r => JSON.stringify(r)).join('\n') + (controls.length ? '\n' : ''));

const summary = {
  generatedAt: new Date().toISOString(), status: laneRows.length ? 'OK' : (note || 'no events'), allowBuy: false, lane: 'EVENT_ORB_RETEST_15D_V1',
  window: { from: cut, years: YEARS, items: Object.keys(ITEMS), forms: ['8-K'] },
  universe: { symbols: universe.length, withSecNumber: withCik.length, withoutSecNumber: noCik.length, halalFailExcluded: fail.size, edgarPagesThisRun: fetched, fromCache, failed, coveredSymbols: covered.size, secCalls: calls, secNote: note || null },
  counts: { raw8KRowsAndRecentRows: rawCount, raw8K: all.length, strictUnblocked: unblocked.length, blocked: blockedN, laneFileRows: laneRows.length, laneUnblocked: lane.length, laneFrom: lane.length ? lane[0].publishedAt : null, laneTo: lane.length ? lane[lane.length - 1].publishedAt : null, eventsRecentRowsUsed: recentUsed.length, rejectedByReason: rejected, controls: controls.length, controlsMissing: controlMiss },
  families: lane.reduce((o, r) => { for (const f of r._fams) o[f] = (o[f] || 0) + 1; return o; }, {}),
  timestampBasis: { acceptanceDateTimeSamples: [...formatSample], readAs: 'UTC (the Z suffix)', earningsFilingsByNewYorkHour: hourHist, eventsRecentCrossCheck: recentMatched, note: 'If 2.02 filings cluster at 07-08 and 16-17 New York time, the UTC reading is right (pre-market and after-close releases).' },
  blocks: { lotteryThreshold: LOTTERY, dilution: '8-K item 3.02 or 424B4/424B5 within ' + DILUTION_DAYS + ' days before' },
  files: { events: OUT, controls: CONTROLS },
};
fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 1));
console.log('evr-events: raw 8-K rows ' + all.length + ', strict unblocked ' + unblocked.length + ', blocked ' + blockedN + ', lane file ' + laneRows.length + ' rows (' + lane.length + ' unblocked, ' + (lane.length ? lane[0].publishedAt.slice(0, 10) + ' to ' + lane[lane.length - 1].publishedAt.slice(0, 10) : 'none') + '), controls ' + controls.length);
console.log('evr-events: 2.02 filings by New York hour (UTC reading): ' + JSON.stringify(hourHist));
