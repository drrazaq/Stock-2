// SHADOW OUTCOMES (owner, 28 Oct 2026, Phase 1: five-day outcomes, realistic costs, filter shadow test). Runs after the close in
// opportunity-radar.yml. Research only; never places an order and sends no message (the radar's after-close message reads its report).
// 1. Every (day, stock) the system logged - the candidate stream (data/shadow/DAY.jsonl.gz), the early-alert ledger (data/opp-ledger.jsonl)
//    and the radar ledger - gets its daily outcome from Alpaca daily bars (SIP; IEX if the plan refuses): that day's close c0, the closes 1, 5
//    and 10 sessions later, and the 5- and 10-session highest high / lowest low. Saved per day in data/shadow-outcomes/DAY.json.gz; a day
//    is refetched until it has its 10-session close (or is 20 sessions old).
//    Raw (unadjusted) prices, like the recorded entries; a split inside the window distorts that stock's result (rare; check outliers).
// 2. data/shadow-report.json: the soft-filter table (shadow-eval.mjs filterTable) at the same-day, 1- and 5-session horizons, and the
//    early-alert ledger's results at 5 sessions (delivered vs eligible-but-not-delivered), all after costs.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { filterTable, stats, entryOf, netExit } from './shadow-eval.mjs';
import { evaluate } from './rank-models.mjs';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const env = process.env, ALPD = local(process.env.ALPACA_DATA) || 'https://data.alpaca.markets', readJson = (f, d = null) => { try { return JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const readLines = (f) => { try { const t = /\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8'); return t.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), since = new Date(Date.now() - 32 * 864e5).toISOString().slice(0, 10);
const SD = 'data/shadow', OD = 'data/shadow-outcomes';

// (day, sym) pairs
const want = new Map(); const add = (d, s) => { if (d >= since && d <= today && /^[A-Z.]{1,6}$/.test(s)) (want.get(d) || want.set(d, new Set()).get(d)).add(s); };
const shadowDays = fs.existsSync(SD) ? fs.readdirSync(SD).filter(f => /^\d{4}-\d{2}-\d{2}\.jsonl\.gz$/.test(f)).map(f => f.slice(0, 10)).sort() : [];
const shadowRows = []; for (const d of shadowDays) for (const r of readLines(SD + '/' + d + '.jsonl.gz')) { shadowRows.push(r); add(r.d, r.sym); }
const opp = readLines('data/opp-ledger.jsonl'); for (const r of opp) add(r.d, r.sym);
for (const r of readLines('data/radar-v3-ledger.jsonl')) if (r.type === 'list') add(r.d, r.sym);

async function bars(syms, start) {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) return null; const H = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET } };
  for (const feed of ['sip', 'iex']) { const out = {}; let ok = true;
    for (let i = 0; i < syms.length && ok; i += 200) { let tok = '';
      do { const r = await fetch(ALPD + '/v2/stocks/bars?symbols=' + syms.slice(i, i + 200).map(encodeURIComponent).join(',') + '&timeframe=1Day&start=' + start + '&adjustment=raw&feed=' + feed + '&limit=10000' + (tok ? '&page_token=' + tok : ''), H).catch(() => null);
        if (!r || !r.ok) { ok = false; break; } const j = await r.json(); for (const [s, b] of Object.entries(j.bars || {})) (out[s] || (out[s] = [])).push(...b.map(x => ({ d: String(x.t).slice(0, 10), h: x.h, l: x.l, c: x.c }))); tok = j.next_page_token || ''; } while (tok); }
    if (ok) return { out, feed }; }
  return null;
}
const outcomeOf = (b, d) => { const i = b.findIndex(x => x.d === d); if (i < 0) return null; const after = b.slice(i + 1), c = (k) => after[k - 1] ? after[k - 1].c : null, w = (k) => after.slice(0, k);
  return { c0: b[i].c, c1: c(1), c5: c(5), c10: c(10), h5: w(5).length ? Math.max(...w(5).map(x => x.h)) : null, l5: w(5).length ? Math.min(...w(5).map(x => x.l)) : null, h10: w(10).length === 10 ? Math.max(...w(10).map(x => x.h)) : null, l10: w(10).length === 10 ? Math.min(...w(10).map(x => x.l)) : null, sessionsAfter: after.length }; };

fs.mkdirSync(OD, { recursive: true }); let fetched = 0, feedUsed = null;
for (const [d, set] of [...want.entries()].sort()) {
  const f = OD + '/' + d + '.json.gz', old = readJson(f, null); if (old && old.complete && [...set].every(s => old.o[s])) continue;
  const res = await bars([...set], d); if (!res) { console.log('shadow outcomes: no bars for ' + d + ' (Alpaca keys missing or refused)'); continue; }
  feedUsed = res.feed; const o = {}; for (const s of set) { const x = res.out[s]; o[s] = x ? outcomeOf(x.sort((a, b) => a.d < b.d ? -1 : 1), d) : null; }
  const vals = Object.values(o).filter(Boolean), complete = vals.length > 0 && vals.every(x => x.c10 !== null || x.sessionsAfter >= 20);
  fs.writeFileSync(f, zlib.gzipSync(JSON.stringify({ d, updated: new Date().toISOString(), feed: res.feed, complete, o }))); fetched++;
}
// the report
const outcomes = {}; for (const f of fs.readdirSync(OD)) { const j = readJson(OD + '/' + f); if (j && j.o) for (const [s, x] of Object.entries(j.o)) if (x) outcomes[j.d + '|' + s] = x; }
// (28 Oct fix, owner item 6) the old line entered at the ASK and still took the FULL assumed spread: half the spread counted twice. Ledger
// rows now go through shadow-eval.mjs entryOf / netExit, which count the spread once (ask entry -> exit half only).
const oppEl = opp.filter(r => !/^(SOFT|HARD)/.test(r.decision)), d5 = (r) => netExit(entryOf({ px: r.px, bid: r.bid, ask: r.ask, qAgeSec: r.qAgeSec }), (outcomes[r.d + '|' + r.sym] || {}).c5);
const report = { generatedAt: new Date().toISOString(), feed: feedUsed, preRegistered: 'shadow-eval.mjs header, 28 Oct 2026', shadowSessions: shadowDays.length,
  filters: { day: filterTable(shadowRows, outcomes, 'day'), d1: filterTable(shadowRows, outcomes, 'd1'), d5: filterTable(shadowRows, outcomes, 'd5') },
  alerts5d: { delivered: stats(oppEl.filter(r => r.decision === 'SENT').map(d5)), notDelivered: stats(oppEl.filter(r => r.decision !== 'SENT').map(d5)) } };
// RANKING EXPERIMENT (rank-models.mjs, frozen 28 Oct): the three candidate streams, built only from what was recorded at decision time
const SH = new Map(shadowRows.map(r => [r.d + '|' + r.sym, r]));
const E = oppEl.filter(r => r.kind === 'lead').map(r => { const sh = SH.get(r.d + '|' + r.sym), base = sh && sh.v && sh.v.base;
  return { d: r.d, sym: r.sym, m: r.m, chg: r.chg, cat: r.cat, rvT: r.rvT, dollarVol: r.dollarVol, bid: r.bid, ask: r.ask, decision: r.decision, e: base && base.m === r.m ? base : { m: r.m, px: r.px, bid: r.bid, ask: r.ask, qAgeSec: r.qAgeSec, next: null, px30: null }, last: sh ? sh.last : r.px15 }; });
const F = shadowRows.filter(r => r.f && r.v && r.v.D).map(r => ({ d: r.d, sym: r.sym, m: r.f.decM, chg: r.f.chg, dEligible: r.f.eligible, why: r.f.why, e: r.v.D, last: r.last }));
const N = shadowRows.filter(r => r.v && r.v.R0).map(r => ({ d: r.d, sym: r.sym, m: r.v.R0.m, chg: r.chg0, e: r.v.R0, last: r.last }));
report.ranking = evaluate({ E, F, N }, outcomes);
report.rankingPilot = evaluate({ E, F, N }, outcomes, '2026-10-28');   // includes the first live day (28 Oct, code deployed that morning): a pilot, never counted in the verdict
report.dFeed = { filingsDecided: F.length, dEligible: F.filter(r => r.dEligible).length, topReasons: Object.entries(F.flatMap(r => r.why || []).reduce((o, w) => (o[w.replace(/ [\d.,]+$/, '')] = (o[w.replace(/ [\d.,]+$/, '')] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 6) };
fs.writeFileSync('data/shadow-report.json', JSON.stringify(report, null, 1));
console.log('shadow outcomes: ' + fetched + ' day files updated; ' + shadowRows.length + ' shadow candidates over ' + shadowDays.length + ' sessions; ' + Object.keys(outcomes).length + ' outcomes');
