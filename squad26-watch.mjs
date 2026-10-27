// SQUAD 26 FORWARD PAPER WATCHER (27 Oct 2026): RECORD ONLY. No Telegram, no buy message, never places an order (the lead turns
// alerts on only after SQ26-FIRSTMIN passes its frozen test). Rule = squad26-core.mjs header (the same frozen event test).
// Every 60 s: the official EDGAR current-filings Atom feed (type 8-K, 100 newest) with SEC_UA (SEC fair use: ~1 feed request a minute
// plus one full-text read per candidate). Each NEW 8-K: acceptance time (<updated>) vs detection time -> the true detection lag.
// Candidates (filer not a mega-cap, a ticker, Alpaca raw prior close 1-10 USD and 20-day traded value >= 0.5M USD) are read in full
// and given the frozen counterparty test. A qualifying event records the Alpaca latest trade + quote at detection; 35 minutes after the
// acceptance the 1-minute bars give the historical rule's first-minute fill AND the fill this watcher could really have had (first bar
// starting after detection); Finnhub company news (free tier, < 30 calls a minute) for the event ticker records when the press release
// appeared. Writes data/squad26-paper.jsonl (append) and data/squad26-today.json; commits at most once every 30 minutes.
// env: SEC_UA, ALPACA_KEY / ALPACA_SECRET, FINNHUB_KEY, WATCH_MINUTES (default 355), WATCH_UNTIL (ISO; hard stop), NO_GIT=1 (local test).
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { nyParts } from './sec-time.mjs';
import { html2text } from './squad21-core.mjs';
import { ID, TH, MEGACAP_SHA, r4, listOn, allCiks, eventOf, itemNumbers, parseAtom, lagStats, priorStats, passPrior, firstEntry, etToIso } from './squad26-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SEC = local(env.SEC_BASE) || 'https://www.sec.gov', AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets', FH = local(env.FINNHUB_BASE) || 'https://finnhub.io';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', PAPER = 'data/squad26-paper.jsonl', TODAY = 'data/squad26-today.json', MCF = 'data/squad24-megacaps.json';
const FEED = SEC + '/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=100&output=atom';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, sleep = (ms) => new Promise(r => setTimeout(r, ms));
const t0 = Date.now(), log = (...a) => console.log('[' + new Date().toISOString().slice(11, 19) + 'Z]', ...a);
const STOP = Math.min(t0 + (+env.WATCH_MINUTES || 355) * 60e3, env.WATCH_UNTIL ? Date.parse(env.WATCH_UNTIL) : Infinity);
const nyNow = () => nyParts(Date.now()), nyStr = (ms) => { const p = nyParts(ms); return p.d + ' ' + p.hm + ':' + new Date(ms).toISOString().slice(17, 19); };

// ---------------- network (polite, keys never printed) ----------------
let lastSec = 0, secReq = 0;
async function sec(url, kind = 'text') { for (let a = 0; a < 3; a++) { const w = 150 - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(30000) }); if (r.status === 404) return null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; } if (!r.ok) return null; return kind === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer()).subarray(0, 15e6).toString('latin1'); } catch (e) { await sleep(2000); } } return null; }
const AH = { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' };
async function alp(path) { if (!env.ALPACA_KEY && !local(env.ALPACA_DATA_BASE)) return null; for (let a = 0; a < 3; a++) { try { const r = await fetch(AD + path, { headers: AH, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(3000); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(1000); } } return null; }
let fhCalls = []; async function finnhub(sym, from, to) { if (!env.FINNHUB_KEY && !local(env.FINNHUB_BASE)) return null; fhCalls = fhCalls.filter(x => x > Date.now() - 60e3); if (fhCalls.length >= 25) await sleep(60e3 - (Date.now() - fhCalls[0]));
  fhCalls.push(Date.now()); try { const r = await fetch(FH + '/api/v1/company-news?symbol=' + encodeURIComponent(sym) + '&from=' + from + '&to=' + to + '&token=' + encodeURIComponent(env.FINNHUB_KEY || ''), { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { err: r.status }; const j = await r.json(); return Array.isArray(j) ? j : null; } catch (e) { return null; } }

// ---------------- state ----------------
const MCRAW = (() => { try { return fs.readFileSync(MCF); } catch (e) { return null; } })();
if (!MCRAW || crypto.createHash('sha256').update(MCRAW).digest('hex') !== MEGACAP_SHA) { console.log('squad26-watch: the frozen mega-cap list is missing or changed; nothing done'); process.exit(0); }
const MC = JSON.parse(MCRAW.toString()), MCALL = allCiks(MC), COS = (cik) => ({ cik, aliases: (MC.companies[cik] || {}).aliases || [] });
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const today = nyNow().d, prev = J(TODAY, {}), same = prev.date === today;
const ST = { date: today, seen: new Set(same ? prev.seen || [] : []), lags: same ? prev.lagsSec || [] : [], candLags: same ? prev.candLagsSec || [] : [], events: same ? prev.events || [] : [], polls: same ? prev.polls || 0 : 0, newFilings: same ? prev.newFilings || 0 : 0,
  candidates: same ? prev.candidates || 0 : 0, gaps: same ? prev.gaps || 0 : 0, feedErrors: same ? prev.feedErrors || 0 : 0, runs: [...(same ? prev.runs || [] : []), { startedAt: new Date(t0).toISOString(), until: new Date(STOP).toISOString() }] };
const pending = [];   // lines to append
let dirty = false, lastCommit = Date.now();
// ticker map: SEC company_tickers.json (official), CIK -> ticker
const TK = new Map(); { const j = await sec(SEC + '/files/company_tickers.json', 'json'); if (j) for (const v of Object.values(j)) if (v && v.cik_str && v.ticker && !TK.has(String(v.cik_str))) TK.set(String(v.cik_str), String(v.ticker).toUpperCase()); log('ticker map: ' + TK.size + ' CIKs'); }

// ---------------- one candidate ----------------
const regularAt = (ms) => { const p = nyParts(ms), wd = new Date(ms).getUTCDay(); return wd >= 1 && wd <= 5 && p.hm >= '09:30' && p.hm < '16:00'; };   // holidays not checked live (information only)
async function examine(e) { const accMs = Date.parse(e.updated), acc = nyParts(accMs), sym = TK.get(e.cik); if (!sym || !/^[A-Z.]{1,6}$/.test(sym)) return { why: 'no ticker' };
  const from = new Date(accMs - 45 * 864e5).toISOString().slice(0, 10), j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(sym) + '&timeframe=1Day&start=' + from + 'T00:00:00Z&adjustment=raw&feed=sip&limit=100');
  const bars = (((j && j.bars) || {})[sym] || []).map(b => ({ d: nyParts(Date.parse(b.t)).d, c: b.c, v: b.v })).filter(b => b.d < acc.d || (b.d === acc.d && acc.hm >= '16:00'));
  const pd = bars.length ? bars[bars.length - 1].d : null, ps = pd ? priorStats(bars, pd) : null; if (!passPrior(ps)) return { why: 'price filter', sym, ps };
  ST.candidates++; const txt = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.adsh + '.txt'); if (!txt) return { why: 'not read', sym };
  const hdr = txt.slice(0, Math.max(0, txt.search(/<DOCUMENT>/i)) || 20000), form = ((/CONFORMED SUBMISSION TYPE:\s*([^\n]+)/i.exec(hdr) || [])[1] || '').trim();
  const items = e.items.length ? e.items : itemNumbers([...hdr.matchAll(/ITEM INFORMATION:\s*([^\n]+)/gi)].map(m => m[1].trim())), docs = []; const re = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi; let m;
  while ((m = re.exec(txt)) !== null) { const body = m[1], type = ((/<TYPE>([^\n<]+)/i.exec(body) || [])[1] || '').trim().toUpperCase(), file = ((/<FILENAME>([^\n<]+)/i.exec(body) || [])[1] || '').trim();
    if (!(type === '8-K' || /^EX-99/.test(type) || /^EX-10/.test(type)) || /\.(pdf|jpg|jpeg|png|gif|xlsx?|zip)$/i.test(file)) continue; docs.push({ type, text: html2text(body.slice(0, 3e6)) }); }
  const acceptHdr = (/<ACCEPTANCE-DATETIME>\s*(\d{14})/i.exec(hdr) || /ACCEPTANCE-DATETIME:\s*(\d{14})/i.exec(hdr) || [])[1] || null;
  if (form && form !== '8-K') return { why: 'not a plain 8-K', sym }; const ev = eventOf({ items, docs }, listOn(MC, acc.d).map(String).map(COS)); if (!ev) return { why: 'no counterparty', sym, items };
  return { sym, ps, ev, items, acceptHdr }; }

// ---------------- the loop ----------------
function save(final) { const out = { generatedAt: new Date().toISOString(), date: ST.date, note: 'SQUAD 26 forward PAPER watcher: RECORD ONLY. No alerts, no buy messages, no orders. newSignals stays empty until the lead turns alerts on after SQ26-FIRSTMIN passes.',
    lagSec: lagStats(ST.lags), candidateLagSec: lagStats(ST.candLags), lagsSec: ST.lags.slice(-3000), candLagsSec: ST.candLags.slice(-500), polls: ST.polls, newFilings: ST.newFilings, candidates: ST.candidates, gaps: ST.gaps, feedErrors: ST.feedErrors, secRequests: secReq,
    events: ST.events, runs: ST.runs, seen: [...ST.seen].slice(-4000), methods: { [ID]: { name: 'first minute after a deal 8-K with a top-100 company (paper record only)', hold: 3, newSignals: [] } } };
  fs.writeFileSync(TODAY, JSON.stringify(out, null, 1)); if (pending.length) { fs.appendFileSync(PAPER, pending.map(x => JSON.stringify(x)).join('\n') + '\n'); pending.length = 0; } dirty = true;
  if (env.NO_GIT) return; if (!final && Date.now() - lastCommit < 30 * 60e3) return; lastCommit = Date.now();
  try { const g = (...a) => execFileSync('git', a, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 120e3 }).toString();
    g('add', TODAY, PAPER); try { g('diff', '--cached', '--quiet'); return; } catch (e) {}
    g('-c', 'user.name=scanner', '-c', 'user.email=scanner@users.noreply.github.com', 'commit', '-q', '-m', 'squad 26 watcher ' + new Date().toISOString().slice(0, 16));
    for (let i = 0; i < 4; i++) { try { g('pull', '-q', '--rebase', '--autostash'); g('push', '-q'); log('committed and pushed'); dirty = false; return; } catch (e) { try { g('rebase', '--abort'); } catch (x) {} execFileSync('sleep', ['5']); } }
    log('push failed (will retry at the next commit)'); } catch (e) { log('git: ' + String(e.message || e).slice(0, 200)); } }

let first = true; const backfill = [];
log('watching EDGAR 8-K feed until ' + new Date(STOP).toISOString() + ' (record only)');
while (Date.now() < STOP) { const tPoll = Date.now(), xml = await sec(FEED); ST.polls++;
  if (!xml) { ST.feedErrors++; } else { const es = parseAtom(xml).filter(e => e.form === '8-K'), fresh = es.filter(e => !ST.seen.has(e.adsh));
    if (!first && es.length >= 90 && fresh.length === es.length) ST.gaps++;
    for (const e of fresh) { ST.seen.add(e.adsh); const accMs = Date.parse(e.updated); if (!isFinite(accMs)) continue; const lag = (tPoll - accMs) / 1000; if (!first) { ST.newFilings++; ST.lags.push(Math.round(lag)); }
      if (MCALL.has(e.cik)) continue; let r; try { r = await examine(e); } catch (x) { r = { why: 'error ' + String(x.message || x).slice(0, 80) }; }
      if (r.ps && !first) ST.candLags.push(Math.round(lag)); if (!r.ev) continue;
      const tq = Date.now(), [lt, lq] = await Promise.all([alp('/v2/stocks/' + encodeURIComponent(r.sym) + '/trades/latest?feed=sip'), alp('/v2/stocks/' + encodeURIComponent(r.sym) + '/quotes/latest?feed=sip')]);
      const line = { type: 'event', id: ID + '|' + r.sym + '|' + e.adsh, m: ID, set: r.ev.set, sym: r.sym, cik: e.cik, adsh: e.adsh, company: e.name, items: r.items, counterparty: (MC.companies[r.ev.match.cik] || {}).name || r.ev.match.alias, alias: r.ev.match.alias, doc: r.ev.doc,
        sentence: r.ev.match.sentence.slice(0, 300), acceptedFeed: e.updated, acceptedHeader: r.acceptHdr ? etToIso(r.acceptHdr, nyParts) : null, acceptedNY: nyStr(accMs), detectedAt: new Date(tPoll).toISOString(), detectedNY: nyStr(tPoll), lagSec: Math.round(lag),
        backlog: first, qualifiedAt: new Date(tq).toISOString(), checkSec: Math.round((tq - tPoll) / 1000), priorClose: r.ps.close, dv20: Math.round(r.ps.dv), halal: halal(r.sym),
        latestTrade: lt && lt.trade ? { p: lt.trade.p, s: lt.trade.s, t: lt.trade.t } : null, latestQuote: lq && lq.quote ? { bp: lq.quote.bp, ap: lq.quote.ap, bs: lq.quote.bs, as: lq.quote.as, t: lq.quote.t } : null,
        plan: 'PAPER ONLY (record): the historical rule would buy the first SIP minute >= 1 min after the acceptance at its high + 1% (regular) / 3% (extended) and sell the close of session 3' };
      pending.push(line); ST.events.push({ sym: r.sym, adsh: e.adsh, set: r.ev.set, counterparty: line.counterparty, acceptedNY: line.acceptedNY, detectedNY: line.detectedNY, lagSec: line.lagSec, backlog: first, halal: line.halal, last: line.latestTrade && line.latestTrade.p });
      backfill.push({ ...line, accMs, detMs: tPoll, news1: await finnhub(r.sym, new Date(accMs - 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)) });
      log('EVENT ' + r.sym + ' (' + r.ev.set + ') with ' + line.counterparty + ', accepted ' + line.acceptedNY + ', detected ' + line.detectedNY + ' (lag ' + line.lagSec + ' s)'); save(false); } }
  // 35 minutes after the acceptance: the first-minute fills (rule vs this watcher) + the press-release time (Finnhub)
  for (const b of backfill.filter(x => !x.done && Date.now() > x.accMs + 35 * 60e3)) { b.done = true;
    const j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(b.sym) + '&timeframe=1Min&start=' + encodeURIComponent(new Date(b.accMs).toISOString()) + '&end=' + encodeURIComponent(new Date(b.accMs + 35 * 60e3).toISOString()) + '&adjustment=raw&feed=sip&limit=1000');
    const mins = (((j && j.bars) || {})[b.sym] || []).map(x => ({ ms: Date.parse(x.t), o: x.o, h: x.h, l: x.l, c: x.c, v: x.v })), rule = firstEntry(mins, b.accMs, regularAt), real = firstEntry(mins, b.detMs - 60e3 + 1, regularAt);
    const news2 = await finnhub(b.sym, new Date(b.accMs - 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)), all = [...(Array.isArray(b.news1) ? b.news1 : []), ...(Array.isArray(news2) ? news2 : [])];
    const items = [...new Map(all.filter(n => n && n.datetime).map(n => [n.id || n.url, { at: new Date(n.datetime * 1000).toISOString(), ny: nyStr(n.datetime * 1000), source: n.source, headline: String(n.headline || '').slice(0, 160) }])).values()].sort((x, y) => x.at < y.at ? -1 : 1);
    const after = items.filter(n => Date.parse(n.at) >= b.accMs - 6 * 3600e3);
    pending.push({ type: 'fill', id: b.id, sym: b.sym, adsh: b.adsh, minuteBars: mins.length, ruleFill: rule ? { ny: nyStr(rule.ms), high: rule.high, px: r4(rule.px), slip: rule.slip } : null, watcherFill: real ? { ny: nyStr(real.ms), high: real.high, px: r4(real.px), slip: real.slip } : null,
      costOfLag: rule && real ? r4(real.px / rule.px - 1) : null, lastPrice35m: mins.length ? mins[mins.length - 1].c : null,
      news: { finnhub: !!(env.FINNHUB_KEY || local(env.FINNHUB_BASE)), first: after[0] || null, firstVsAcceptanceSec: after[0] ? Math.round((Date.parse(after[0].at) - b.accMs) / 1000) : null, items: after.slice(0, 5) } });
    save(false); }
  if (first) { first = false; log('first poll: ' + ST.seen.size + ' 8-Ks already in the feed (backlog; no lag counted)'); }
  if (ST.polls % 30 === 0) { log('polls ' + ST.polls + ', new 8-Ks ' + ST.newFilings + ', candidates ' + ST.candidates + ', events ' + ST.events.length + ', lag ' + JSON.stringify(lagStats(ST.lags))); save(false); }
  const wait = 60e3 - (Date.now() - tPoll); if (wait > 0 && Date.now() + wait < STOP) await sleep(wait); else if (Date.now() + Math.max(0, wait) >= STOP) break; }
ST.runs[ST.runs.length - 1].endedAt = new Date().toISOString(); ST.runs[ST.runs.length - 1].lag = lagStats(ST.lags);
pending.push({ type: 'lag', date: ST.date, run: ST.runs[ST.runs.length - 1], newFilings: ST.newFilings, candidates: ST.candidates, events: ST.events.length, gaps: ST.gaps, feedErrors: ST.feedErrors, lag: lagStats(ST.lags), candidateLag: lagStats(ST.candLags) });
save(true); log('done: ' + ST.polls + ' polls, ' + ST.newFilings + ' new 8-Ks, lag ' + JSON.stringify(lagStats(ST.lags)) + ', events ' + ST.events.length);
