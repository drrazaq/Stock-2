// Cloud scanner for the US stock signal board. Runs on GitHub Actions (free), so it works while your phone is off.
// It reuses the exact rules inside index.html, writes data/signals.json and an append-only journal, and sends Telegram alerts.
// Read only: it holds no broker login and cannot trade.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const env = process.env, MODE = env.MODE === 'intraday' ? 'intraday' : env.MODE === 'chat' ? 'chat' : 'daily', RATE = Math.max(1, parseInt(env.RATE || '8', 10) || 8);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', FMPB = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const MV_HOSTS = local(env.MASSIVE_BASE) ? [local(env.MASSIVE_BASE)] : ['https://api.massive.com', 'https://api.polygon.io'];
const TD = local(env.TD_BASE) || 'https://api.twelvedata.com', TG = local(env.TG_BASE) || 'https://api.telegram.org', FAST = Boolean(local(env.TD_BASE));
if (!env.TWELVE_KEY) { console.error('Missing secret TWELVE_KEY'); process.exit(1); }
// SEC EDGAR (official, free; the SEC asks every program to name itself) and ClinicalTrials.gov, for company events in  check  and the nightly event-drift test
const SEC_DATA = local(env.SEC_BASE) || 'https://data.sec.gov', SEC_WWW = local(env.SEC_BASE) || 'https://www.sec.gov', CTG = local(env.CT_BASE) || 'https://clinicaltrials.gov', SEC_UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com';
let SEC_LAST = null;
async function secJson(url) { try { await new Promise(r => setTimeout(r, FAST ? 0 : 150)); const r = await fetch(url, { headers: { 'User-Agent': SEC_UA, 'Accept': 'application/json' } }); SEC_LAST = r.status; return r.ok ? await r.json() : null; } catch (e) { SEC_LAST = 'no connection'; return null; } }
// one SEC filing -> its event families (same table as events-study.mjs, read from its output so the two never disagree)
function evFams(form, items, sic, ES) { const map = (ES && ES.map && ES.map.item) || {}, bio = /^(283[3-6]|8731)$/.test(String(sic || '')), f = String(form || '').toUpperCase(), o = new Set();
  if (f === '8-K') for (const it of String(items || '').split(',').map(x => x.trim())) { let k = map[it]; if (k === 'NEWS' && bio) k = 'BIO_NEWS'; if (k) o.add(k); }
  if (f === 'SC 13D' || f === 'SCHEDULE 13D') o.add('ACTIVIST'); if (f === '424B4' || f === '424B5') o.add('OFFERING');
  if (o.has('EARN')) { o.delete('NEWS'); o.delete('BIO_NEWS'); } return [...o]; }
// the session a filing reacts in (New York time): before the close -> that day, after the close or on a weekend -> the next weekday
function evReact(p) { const d = p.slice(0, 10), wd = new Date(d + 'T12:00:00Z').getUTCDay(), nx = (x) => { let ms = Date.parse(x + 'T12:00:00Z'); do { ms += 864e5; } while ([0, 6].includes(new Date(ms).getUTCDay())); return new Date(ms).toISOString().slice(0, 10); };
  if (wd === 0 || wd === 6) return nx(d); return p.length >= 16 && p.slice(11, 16) >= '16:00' ? nx(d) : d; }
// recent events on a stock that the Sunday study proved to be followed by losses (information for holders)
function eventWarn(sym) { const ES = readJson0('data/events-study.json'), ER = readJson0('data/events-recent.json'); if (!ES || !ES.fam || !ER) return '';
  const hits = (ER.events || []).filter(e => e.sym === sym).flatMap(e => e.f.split(',').filter(k => ES.fam[k] && ES.fam[k].warn).map(k => ({ k, d: e.p.slice(0, 10) })));
  if (!hits.length) return ''; const h = hits[0], F = ES.fam[h.k];
  return ' | NEWS WARNING ' + h.d + ': ' + F.name + '; after such filings stocks lagged other stocks by ' + Math.abs(Math.round((F.drift.newer.vs || 0) * 1000) / 10) + '% over 20 sessions (' + F.drift.newer.n + ' tested cases). Keep your stop firm'; }
// SELL on a tested warning filing: only families where, in BOTH halves (30+ cases each), the stock fell on average AND lagged other stocks
// over the next 20 sessions; and only when the average fall in the newer half (1.5%+) is larger than the cost of selling (3 USD fee + spread)
function eventSell(sym) { const ES = readJson0('data/events-study.json'), ER = readJson0('data/events-recent.json'); if (!ES || !ES.fam || !ER) return '';
  const hits = (ER.events || []).filter(e => e.sym === sym).flatMap(e => e.f.split(',').filter(k => { const F = ES.fam[k]; return F && F.warn && F.drift && F.drift.newer && F.drift.newer.avg <= -0.015; }).map(k => ({ k, d: e.p.slice(0, 10) })));
  if (!hits.length) return ''; const h = hits[0], F = ES.fam[h.k];
  return 'SELL at the next open. SEC filing ' + h.d + ': ' + F.name + '. Tested: after such filings stocks fell ' + pcs(F.drift.newer.avg) + ' on average over 20 sessions (' + F.drift.newer.n + ' newer cases; older half ' + pcs(F.drift.older.avg) + ') and lagged other stocks by ' + pcs(F.drift.newer.vs) + '.'; }
function newsText() { let L = []; try { L = fs.readFileSync('data/news-log.jsonl', 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {}
  if (!L.length) return 'NEWS WATCH: no threat headline about your stocks or today\u2019s buy list so far. It checks every 15 minutes from before the US open to the close (Finnhub company, competitor and market news).';
  return ['NEWS WATCH: the last threat headlines (heads-up only, words matched, not meaning)', ...L.slice(-10).reverse().map(a => '- ' + a.sym + ' ' + String(a.at).slice(5, 16).replace('T', ' ') + ' UTC: ' + a.why + '. ' + (a.th || []).join(', ') + '. "' + a.h + '" (' + a.src + ')'), '', 'Send  check SYM  for the full picture.'].join('\n'); }
function fastText() { const F = readJson0('data/fastmover-lab.json'), V = readJson0('data/fastmover-live.json'), Pp = readJson0('data/fastmover-paper.json');
  if (!F || !F.rules) return 'FAST MOVERS: the five-year fast-mover lab runs on Sunday with the other studies (the first run builds its own price history). Ask again after Sunday.';
  const ln = (x) => !x || !x.n ? 'no trades' : x.n + ' trades, ' + Math.round(x.win * 100) + '% won, average ' + pcs(x.avg) + ', median ' + pcs(x.med) + ', stopped ' + Math.round(x.stopped * 100) + '%';
  const D = F.decode || {}, rec = (Pp && Pp.record) || {};
  return ['FAST MOVERS AND DAY TRADES (five years, whole market incl. 1-3 USD stocks, ' + F.from + ' to ' + F.to + '; bought at the open or the close, stop 8% checked first, costs by price)', '',
    'RULES (newer half; "best moment" = the average high of the day, what a chart shows):', ...Object.entries(F.rules).map(([k, x]) => '- ' + x.name + ': ' + x.verdict + '. ' + ln(x.results.newer) + '; best moment ' + pcs(x.results.newer.best || 0) + (rec[k] && rec[k].n ? '. Paper since: ' + rec[k].n + ' trades, ' + pcs(rec[k].avg) : '')),
    '', 'WHAT CAME BEFORE THE JUMPS (found on old data, checked on unseen data):', ...((D.confirmed || []).slice(0, 5).map(x => '- ' + x.what + ': ' + x.newer.lift.toFixed(1) + 'x more jumps than normal; buying it earned ' + pcs(x.newer.ev) + ' a trade')), ...((D.confirmed || []).length ? [] : ['- no pattern kept its edge on unseen data']),
    ...(D.chosen ? ['Best pattern by profit: ' + D.chosen.what + ' -> ' + D.chosen.verdict + ' (' + pcs(D.chosen.newer.ev) + ' a trade on unseen data).'] : []),
    '', V && V.list && V.list.length ? 'TODAY’S DAY-TRADE LIST (' + V.day + '): ' + V.list.map(x => x.sym + ' open ' + x.lo + '-' + x.hi).join(' | ') + '. Stop 8%, sell at the close.' : 'TODAY: no candidates from a passed rule' + (V ? ' (' + V.logged + ' logged on paper for ' + V.day + ')' : '') + '.',
    ...(() => { const IL = readJson0('data/ignition-lab.json'), IR = readJson0('data/ignition-results.json'), LV = readJson0('data/ignition-live.json'); if (!IL || !IL.rules) return ['', 'IGNITION (catching a run while it starts, minute by minute): the test runs on Saturday.'];
      const rr = (IR && IR.record) || {};
      return ['', 'IGNITION (buying WHILE a stock starts to run; minute-by-minute test, ' + IL.tested + ' of ' + IL.candidates + ' run days tested, ' + IL.window + '):', ...Object.entries(IL.rules).filter(([k, x]) => (x.results.newer.n || 0) > 0 || rr[k]).map(([k, x]) => '- ' + k + ': ' + x.verdict + (x.results.newer.n ? ' (' + x.results.newer.n + ' trades, ' + Math.round(x.results.newer.win * 100) + '% won, average ' + pcs(x.results.newer.avg) + ')' : '') + (rr[k] ? ' | live paper ' + rr[k].n + ' trades, ' + pcs(rr[k].avg) + (typeof rr[k].stress === 'number' ? ' (' + pcs(rr[k].stress) + ' at 1.5x costs)' : '') : '')),
        ...Object.entries(rr).filter(([k]) => /^IG8\//.test(k)).map(([k, r]) => '- ' + k + ' (quiet build-up, forward-tested only): live paper ' + r.n + ' trades, ' + pcs(r.avg) + (typeof r.stress === 'number' ? ' (' + pcs(r.stress) + ' at 1.5x costs)' : '') + '; alerts need 60+ trades, 30+ days, 20+ stocks, PF 1.20+'),
        ...(IL.variants ? [IL.variants + ' versions tested (versions with no trades yet are not listed), ' + IL.passing + ' passed the history test; any alert also needs 30+ positive live paper trades at 1.5x costs.'] : []),
        ...(LV ? ['Last watcher day ' + LV.day + ': ' + (LV.triggers || []).length + ' ignitions seen, ' + LV.alerts + ' alerts, data ' + (LV.src || 'none') + (LV.avgDelayMin !== null && LV.avgDelayMin !== undefined ? ' (' + LV.avgDelayMin + ' min old)' : '') + (LV.note ? ' [' + LV.note + ']' : '') + '.',
          ...(LV.coverage ? ['COVERAGE (measured): ' + LV.coverage.minutesWatched + ' minutes watched (' + LV.coverage.firstMinute + '-' + LV.coverage.lastMinute + ' New York, ' + Math.round((LV.coverage.minutesCompletedRate || 0) * 100) + '% of the minutes); mode ' + Object.entries(LV.coverage.modes || {}).map(([k, n]) => k + ' ' + n + ' min').join(', ') + '; ' + LV.coverage.receivedMedian + ' stocks a minute, ' + LV.coverage.liveMedian + ' with a live price (' + Math.round((LV.coverage.liveRate || 0) * 100) + '%); price age ' + LV.coverage.priceAgeP50Min + ' min typical, ' + LV.coverage.priceAgeP95Min + ' min worst 5%; volume ' + LV.coverage.volumeAgeP50Min + ' min old.',
            'Runners (15%+): ' + LV.coverage.moversLiveBeforePlus5 + ' visible live before +5%, ' + LV.coverage.moversFirstLiveAfterPlus10 + ' first live only after +10%, ' + LV.coverage.moversNeverLive + ' never had a live price.'] : []),
          ...(LV.missed && LV.missed.length ? ['MISSED-MOVER AUDIT (' + LV.missed.length + ' stocks ran 15%+): ' + Object.entries(LV.tally || {}).map(([k, n]) => n + ' ' + k).join(', ') + '.', ...LV.missed.slice(0, 8).map(x => '- ' + x.sym + ' up to ' + pcs(x.maxUp) + ': ' + (x.code || '') + '. First seen ' + x.firstSeen + ' at ' + pcs(x.firstSeenUp !== undefined ? x.firstSeenUp : x.alreadyUp) + (x.firstLive ? ', first live ' + x.firstLive + ' at ' + pcs(x.firstLiveUp || 0) : ', never with a live price') + (x.crossed10 ? ', crossed +10% at ' + x.crossed10 : '') + '. ' + x.why + (x.afterFirstSeen ? ' If bought when first seen: best ' + pcs(x.afterFirstSeen.best) + ', worst ' + pcs(x.afterFirstSeen.worst) + ', by the end ' + pcs(x.afterFirstSeen.last) + ' (before costs).' : ''))] : [])] : [])]; })(),
    'Only rules that PASSED send a morning list or a live alert. Use 1,000 USD at most per day trade. Research, not advice.'].join('\n'); }
// ECONOMIC CALENDAR (calendar.mjs): CPI, PPI, retail sales, jobs, the Fed... this week, with forecast / previous / actual; market
// holidays; ex-dividend days of your stocks. Read from the ENCRYPTED data/calendar.enc (TipRanks data may not be republished).
function calRead0() { const k = privKey(); if (!k || !fs.existsSync('data/calendar.enc')) return null; try { const b = Buffer.from(fs.readFileSync('data/calendar.enc', 'utf8'), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)), d.final()])).toString()); } catch (e) { return null; } }
const CAL_NAME = { CPI: 'Inflation (CPI)', CORE_CPI: 'Core inflation (CPI)', PPI: 'Producer prices (PPI)', PCE: 'PCE inflation', RETAIL: 'Retail sales', JOBS: 'Jobs report', CLAIMS: 'Jobless claims', FED: 'Fed rate decision', GDP: 'GDP', ISM: 'Business surveys (ISM/PMI)', SENTIMENT: 'Consumer sentiment' };
function calendarText(short) {
  const C = calRead0(); if (!C) return short ? '' : 'CALENDAR: not loaded yet. It needs the calendar job (TipRanks economic calendar, saved encrypted) to run once.';
  const kw = (t) => { const d = new Date(t + (String(t).length <= 19 ? 'Z' : '')); return isNaN(d) ? String(t).slice(0, 16) : d.toLocaleString('en-GB', { timeZone: 'Asia/Kuwait', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' Kuwait'; };
  const today = new Date().toISOString().slice(0, 10), wk = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), St = C.study && C.study.bySurprise;
  const INDX = (C.study && C.study.industry) || {}, hasFind = (e) => { const k = e.key || calKey(e.name); return ['_HOT', '_COOL'].some(z => INDX[k + z] && ((INDX[k + z].up || []).length || (INDX[k + z].down || []).length)); };
  const evAll = (C.econ || []).filter(e => e.t.slice(0, 10) >= new Date(Date.now() - 864e5).toISOString().slice(0, 10) && e.t.slice(0, 10) <= wk).sort((a, b) => a.t < b.t ? -1 : 1);
  const ev = evAll.filter(e => short ? (e.kind || hasFind(e)) : true);
  const v = (x, u) => x === null || x === undefined ? 'n/a' : x + (u && u.length <= 2 && !(u === '%' && Math.abs(+x) >= 50) ? u : '');   // an index level (e.g. 338.9) is never shown as a percent
  const tested = (e, s) => { const r = St && St[e.kind + (s > 0 ? '_HOT' : '_COOL')]; return r && /both halves/.test(r.verdict) ? 'tested: the S&P 500 went ' + r.verdict.split(' ')[0] + ' that day in both halves (' + pcs(r.newer.r1) + ' newer half)' : null; };
  const line = (e) => { const done = e.act !== null && e.act !== undefined, bs = e.fc !== null && e.fc !== undefined ? e.fc : e.prev, s = done && bs !== null && bs !== undefined ? Math.sign((e.act - bs) * (/claims|unemployment|jobless/i.test(e.name) ? -1 : 1)) : 0, nm = CAL_NAME[e.kind] || e.name;
    return (done ? '' : kw(e.t) + ': ') + nm + (e.name && e.name.toLowerCase() !== nm.toLowerCase() ? ' (' + e.name + ')' : '') + ': ' + (done ? 'came in ' + v(e.act, e.unit) + (e.fc !== null && e.fc !== undefined ? ' vs forecast ' + v(e.fc, e.unit) : ' vs previous ' + v(e.prev, e.unit)) + (s === 0 ? ' = as expected' : !e.kind ? (s > 0 ? ' = ABOVE' : ' = BELOW') : /CPI|PPI|PCE/.test(e.kind) ? (s > 0 ? ' = HOTTER inflation' : ' = COOLER inflation') : (s > 0 ? ' = STRONGER economy' : ' = WEAKER economy')) + (tested(e, s) ? '; ' + tested(e, s) : '') : 'forecast ' + v(e.fc, e.unit) + ', previous ' + v(e.prev, e.unit)); };
  const hol = (C.holidays || []).filter(h => h.d >= today && h.d <= new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)).map(h => h.d + ' ' + h.name + (h.status === 'early-close' ? ' (HALF DAY, closes early)' : ' (MARKET CLOSED)'));
  const div = Object.entries(C.div || {}).flatMap(([s, a]) => a.filter(x => x.ex >= today && x.ex <= wk).map(x => s + ' ex-dividend ' + x.ex + (x.amt ? ' (' + x.amt + ' a share: the price drops by about that much that morning; not a sell signal)' : '')));
  const IND = C.study && C.study.industry, GRP = { CPI: 'INFLATION', CORE_CPI: 'INFLATION', PPI: 'INFLATION', PCE: 'INFLATION', RETAIL: 'GROWTH', JOBS: 'GROWTH', GDP: 'GROWTH', ISM: 'GROWTH', SENTIMENT: 'GROWTH', FED: 'FED' };
  const prepNames = [...new Set(evAll.filter(e => (e.act === null || e.act === undefined) && !GRP[e.kind] && hasFind(e)).map(e => e.key || calKey(e.name)))].map(k => { const h = INDX[k + '_HOT'], c = INDX[k + '_COOL'], LB = (C.study.labels || {})[k] || { name: k, basis: 'forecast' }, f = (L) => L && (L.up.length || L.down.length) ? (L.up.length ? 'hunt ' + L.up.slice(0, 3).map(r => r.name).join(', ') : '') + (L.up.length && L.down.length ? '; ' : '') + (L.down.length ? 'avoid ' + L.down.slice(0, 3).map(r => r.name).join(', ') : '') : 'no steady industry effect';
    return 'PREPARED for ' + LB.name + ': if above ' + LB.basis + ' -> ' + f(h) + ' | if below -> ' + f(c) + '.'; });
  const prep = [...new Set(ev.filter(e => e.act === null || e.act === undefined).map(e => GRP[e.kind]).filter(Boolean))].map(G => { const h = IND && IND[G + '_HOT'], c = IND && IND[G + '_COOL'], f = (L) => L && (L.up.length || L.down.length) ? (L.up.length ? 'hunt ' + L.up.slice(0, 3).map(r => r.name).join(', ') : '') + (L.up.length && L.down.length ? '; ' : '') + (L.down.length ? 'avoid ' + L.down.slice(0, 3).map(r => r.name).join(', ') : '') : 'no steady industry effect';
    return 'PREPARED for ' + G.toLowerCase() + ' news: if ' + (G === 'INFLATION' ? 'HOT' : G === 'FED' ? 'HAWKISH' : 'STRONG') + ' -> ' + f(h) + ' | if ' + (G === 'INFLATION' ? 'COOL' : G === 'FED' ? 'DOVISH' : 'WEAK') + ' -> ' + f(c) + '.'; });
  const anyPass = St && Object.values(St).some(x => /both halves/.test(x.verdict));
  const indPass = IND && Object.values(IND).some(L => (L.up || []).length || (L.down || []).length);
  const decision = anyPass || indPass ? 'DECISION: only tested reactions change ACTIONS (hunt / avoid industries after a surprise, below); everything else follows the normal rules.' : 'DECISION: no release has a tested effect yet (' + (C.study ? C.study.releases + ' past releases studied' : 'the study runs on Sunday') + '), so normal rules apply. Big moves are covered by the market-shock alert and your stops.';
  if (short) { if (!ev.length && !hol.length && !div.length) return ''; return ['THIS WEEK: ' + [...ev.slice(0, 5).map(line), ...hol, ...div].join(' | '), ...(IND ? [...prep, ...prepNames] : []), decision].join('\n'); }
  return ['ECONOMIC CALENDAR (US, next 7 days, every release big and small; TipRanks, private)', '', ...(ev.length ? ev.map(e => '- ' + line(e) + (hasFind(e) ? '  [tested reaction on file]' : '')) : ['- no important release found']), '',
    ...(IND ? [...prep, ...prepNames, ''] : ['What goes up or down after each kind of surprise: the study runs on Sunday.', '']), 'MARKET HOLIDAYS (2 weeks): ' + (hol.length ? hol.join(' | ') : 'none'), 'YOUR STOCKS, EX-DIVIDEND (7 days): ' + (div.length ? div.join(' | ') : 'none'), '', decision,
    'Updated ' + String(C.updated || '').slice(0, 16).replace('T', ' ') + ' UTC. Not financial advice.'].join('\n'); }
// MACRO REACTION (calendar study): after a release surprise (hot / cool inflation, strong / weak economy, Fed), the industries that
// beat or lagged the market over the next 5 sessions in BOTH halves of the past. Active for 7 days after the release.
const CAL_GROUP = { CPI: 'INFLATION', CORE_CPI: 'INFLATION', PPI: 'INFLATION', PCE: 'INFLATION', RETAIL: 'GROWTH', JOBS: 'GROWTH', GDP: 'GROWTH', ISM: 'GROWTH', SENTIMENT: 'GROWTH', FED: 'FED' };
const CAL_LABEL = { INFLATION_HOT: 'HOT INFLATION', INFLATION_COOL: 'COOL INFLATION', GROWTH_HOT: 'STRONG ECONOMY', GROWTH_COOL: 'WEAK ECONOMY', FED_HOT: 'FED MORE HAWKISH THAN EXPECTED', FED_COOL: 'FED MORE DOVISH THAN EXPECTED' };
let MACRO_C;
const calKey = (name) => String(name || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, ' ').replace(/\bq[1-4]\b/g, ' ').replace(/\b(final|prel|preliminary|flash|adv|advance|second estimate|third estimate|2nd|3rd)\b/g, ' ').replace(/[^a-z0-9%\- ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
function macroNow() {
  if (MACRO_C !== undefined) return MACRO_C; MACRO_C = []; const C = calRead0(); if (!C || !C.study || !C.study.industry) return MACRO_C;
  const since = new Date(Date.now() - 7 * 864e5).toISOString(), nowIso = new Date().toISOString(), byK = {}, LBL = C.study.labels || {};
  for (const e of [...(C.econ || []), ...(C.hist || [])]) { if (e.act === null || e.act === undefined || e.t < since || e.t > nowIso) continue; const base = e.fc !== null && e.fc !== undefined ? e.fc : e.prev; if (base === null || base === undefined) continue;
    const s = Math.sign((e.act - base) * (/claims|unemployment|jobless/i.test(e.name) ? -1 : 1)); if (!s) continue;
    for (const k of [e.key || calKey(e.name), CAL_GROUP[e.kind]].filter(Boolean)) { const id = k + e.t.slice(0, 10), x = byK[id] || (byK[id] = { k, d: e.t.slice(0, 10), sum: 0, core: null, ev: [] }); x.sum += s; if (e.kind === 'CORE_CPI' && k === 'INFLATION') x.core = s; if (!x.ev.some(y => y.name === e.name)) x.ev.push(e); } }
  const latest = {}; for (const x of Object.values(byK)) if (!latest[x.k] || latest[x.k].d < x.d) latest[x.k] = x;
  const CK = readJson0('data/sec-ciks.json') || {};
  for (const x of Object.values(latest)) { const sg = Math.sign(x.core !== null ? x.core : x.sum); if (!sg) continue; const key = x.k + (sg > 0 ? '_HOT' : '_COOL'), L = C.study.industry[key]; if (!L || (!(L.up || []).length && !(L.down || []).length)) continue;
    const lb = LBL[x.k] || { name: x.k, basis: 'forecast' }, fam = CAL_LABEL[key];
    MACRO_C.push({ key, label: fam || (lb.name + ' ' + (sg > 0 ? 'ABOVE' : 'BELOW') + ' ' + (lb.basis === 'previous' ? 'the previous value' : 'forecast')).toUpperCase(), d: x.d, until: new Date(Date.parse(x.d) + 7 * 864e5).toISOString().slice(0, 10),
      ev: x.ev.slice(0, 3).map(e => e.name + ' ' + e.act + ' vs ' + (e.fc !== null && e.fc !== undefined ? 'forecast ' + e.fc : 'previous ' + e.prev)).join('; '),
      up: L.up || [], down: L.down || [], events: L.events, upSet: new Set((L.up || []).map(r => r.g)), downSet: new Set((L.down || []).map(r => r.g)), indOf: (sym) => CK[sym] && CK[sym][1] ? String(CK[sym][1]).slice(0, 3) : null }); }
  MACRO_C.sort((p, q) => (q.up.length + q.down.length) - (p.up.length + p.down.length)); return MACRO_C; }
function macroLines(pos, cands) {
  const M = macroNow(), out = []; const nm = (r) => r.name + ' (' + pcs(r.newer.ex) + ' vs the market in 5 days)';
  for (const m of M.slice(0, 4)) { out.push('AFTER ' + m.label + ' (' + m.d + ': ' + m.ev + '), tested on ' + m.events + ' past releases, both halves:');
    out.push(m.up.length ? '  HUNT, industries that beat the market next: ' + m.up.slice(0, 5).map(nm).join(', ') : '  no industry beat the market steadily after this.');
    out.push(m.down.length ? '  AVOID, industries that lagged: ' + m.down.slice(0, 5).map(nm).join(', ') + '. No new buys in them until ' + m.until + '.' : '  no industry lagged steadily after this.');
    const heldBad = Object.keys(pos || {}).filter(s => m.downSet.has(m.indOf(s))), heldGood = Object.keys(pos || {}).filter(s => m.upSet.has(m.indOf(s)));
    if (heldBad.length) out.push('  YOUR STOCKS in lagging industries: ' + heldBad.join(', ') + ': HOLD with your stop (no tested reason to sell early).');
    if (heldGood.length) out.push('  YOUR STOCKS in industries that tend to gain now: ' + heldGood.join(', ') + ': HOLD.'); }
  return out; }
// YOUR SKIPS vs THE SYSTEM: every buy you skipped (Skipped button), why, and what the price did since. Over time this shows whether
// your tips and your judgment beat the system's list, or the other way round.
async function skipsText() {
  let L = []; try { L = fs.readFileSync('data/skipped.jsonl', 'utf8').trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { }
  const since = Date.now() - 45 * 864e5, why = {}; for (const r of L) if (r.why) why[r.sym] = r.why;
  const sk = L.filter(r => !r.why && r.ts >= since && r.px > 0), seen = new Set(), rows = [];
  for (const r of sk.reverse()) { if (seen.has(r.sym)) continue; seen.add(r.sym); if (rows.length >= 15) break; let now = null; try { const j = await liveQ(r.sym); now = +j.price || null; } catch (e) { } rows.push({ ...r, why: why[r.sym] || 'no reason given', now, ch: now ? now / r.px - 1 : null }); }
  if (!rows.length) return 'YOUR SKIPS: none recorded yet with a price. Tap Skipped under a buy, then pick the reason; I compare later.';
  const NAME = { tip: 'tip said wait', halal: 'not halal / unsure', money: 'no money', trust: 'did not trust it', other: 'other' }, done = rows.filter(r => r.ch !== null), avg = done.length ? done.reduce((a, r) => a + r.ch, 0) / done.length : null;
  const byWhy = {}; for (const r of done) (byWhy[r.why] = byWhy[r.why] || []).push(r.ch);
  return ['YOUR SKIPS (last 45 days): what the price did after you skipped', '', ...rows.map(r => '- ' + r.sym + ' ' + r.d + ' (' + (NAME[r.why] || r.why) + '): ' + money(r.px) + ' -> ' + (r.now ? money(r.now) + ' (' + pcs(r.ch) + ')' : 'no price now') + (r.ch === null ? '' : r.ch > 0.03 ? '  MISSED a gain' : r.ch < -0.03 ? '  GOOD SKIP' : '')), '',
    'Average since skipping: ' + (avg === null ? 'n/a' : pcs(avg)) + (avg === null ? '' : avg > 0 ? ' (the skipped buys went UP on average: skipping cost you)' : ' (the skipped buys went DOWN on average: your skips helped)'),
    ...Object.entries(byWhy).map(([w, a]) => '  ' + (NAME[w] || w) + ': ' + a.length + ' skips, ' + pcs(a.reduce((x, y) => x + y, 0) / a.length) + ' average since'),
    'Too few skips to judge until about 20. The system’s own record: send  record .'].join('\n'); }
// HORIZONS (horizons.mjs, Sunday): is this stock in a tested mid- or long-term setup today (1, 3, 6 months)?
// share count history (SEC, data/shares.json.gz, weekly): dilution = new shares sold over the past year, using only counts already public
let SHR_C; const shr = () => { if (SHR_C !== undefined) return SHR_C; try { SHR_C = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/shares.json.gz')).toString()); } catch (e) { SHR_C = null; } return SHR_C; };
function sharesAt(sym, d) { const S = shr(); if (!S) return null; const a = S.c[S.t[sym]]; if (!a) return null; const lim = new Date(Date.parse(d) - (S.lagDays || 30) * 864e5).toISOString().slice(0, 10); let v = null; for (const [e, x] of a) { if (e <= lim) v = x; else break; } return v; }
function dilutionLine(sym) { const d = new Date().toISOString().slice(0, 10), now = sharesAt(sym, d), ago = sharesAt(sym, new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10)); if (!now || !ago) return '';
  const g = now / ago - 1; return g >= 0.3 ? 'DILUTION: share count up ' + Math.round(g * 100) + '% in a year (' + (ago / 1e6).toFixed(1) + 'M -> ' + (now / 1e6).toFixed(1) + 'M shares). The company keeps selling new shares, which weighs on the price and often ends runs.' : g <= -0.05 ? 'Share count down ' + Math.round(-g * 100) + '% in a year (buybacks or a reverse split).' : ''; }
// QUALITY (long investing by the SEC reports, quality.mjs): where this company ranks now, and whether the quality test has passed
function qualityLine(sym) { const Q = readJson0('data/quality.json'); if (!Q || Q.status !== 'OK') return 'Long term (company quality from its SEC reports): the study runs on Sunday.';
  const r = Q.rank && Q.rank[sym]; if (r === undefined) return 'Long term (company quality): not ranked (no full yearly SEC report, or not liquid enough).';
  const best = Object.values(Q.results).find(x => x.verdict === 'PROMISING' && /Quality/.test(x.name)), lab = r >= 0.9 ? 'TOP 10% quality' : r >= 0.7 ? 'good quality' : r >= 0.3 ? 'average quality' : 'LOW quality';
  return 'Long term (company quality from its SEC reports): ' + lab + ' (better than ' + Math.round(r * 100) + '% of liquid US stocks). ' + (best ? 'On 5 years of history, top-10% quality companies beat the average stock and the S&P 500 over ' + best.months + ' months (' + pcs(best.results.newer.avg) + ' vs S&P 500 ' + pcs(best.results.newer.spy) + '); its live paper record comes next.' : 'The quality test has not passed yet, so this is information, not a buy.'); }
// TESTED STOP (stops.mjs): the stop rule the 5-year stop study recommends for a buy like this (strong stock or any stock), from the buy price
function testedStop(entry, c) { const ST = readJson0('data/stops.json'); if (!ST || ST.status !== 'OK' || !c || c.length < 130) return null;
  const n = c.length, i = n - 1, strong = c[i].c / c[n - 127].c - 1 >= 0.3, pool = strong ? 'STRONG' : 'ANY', P = ST.results[pool]; if (!P) return null;
  let tr = 0; for (let k = i - 13; k <= i; k++) tr += Math.max(c[k].h, c[k - 1].c) - Math.min(c[k].l, c[k - 1].c); const a = tr / 14; let s50 = 0; for (let k = i - 49; k <= i; k++) s50 += c[k].c; const m50 = s50 / 50;
  const rule = P.recommended === 'NONE' ? 'PCT35' : P.recommended, lv = { PCT10: entry * 0.9, PCT15: entry * 0.85, PCT20: entry * 0.8, PCT25: entry * 0.75, PCT35: entry * 0.65, ATR2: entry - 2 * a, ATR3: entry - 3 * a, ATR4: entry - 4 * a, OLD: Math.max(entry - 2 * a, m50 < c[i].c ? m50 : 0) }[rule];
  const R = P.rules[rule], why = (P.recommended === 'NONE' ? 'no stop did best in the 5-year stop study, so only a disaster stop: ' : 'tested on 5 years (' + pool.toLowerCase() + ' stocks): ') + R.name + '; worst 5% of buys averaged ' + pcs(R.newer.worst5) + ' with it vs ' + pcs(P.rules.NONE.newer.worst5) + ' without';
  return { stop: +lv.toFixed(2), rule, pool, why }; }
function stopsText(sig) { const pos = loadPos(), syms = Object.keys(pos), ST = readJson0('data/stops.json'); if (!ST || ST.status !== 'OK') return 'STOPS: the stop study runs on Sunday with the other studies. Until then your current stops stay.';
  return (async () => { const out = ['YOUR STOPS vs THE TESTED STOP (from the 5-year stop study; the tested stop is measured from YOUR buy price)', ''];
    for (const sym of syms) { const P = pos[sym]; let d = null; try { d = await loadDaily(sym); } catch (e) {} const t = d ? testedStop(P.entry, d.candles) : null, px = d ? d.last : null;
      if (!t) { out.push(sym + ': no tested stop (not enough price history).'); continue; }
      const cur = P.stop || 0, gap = cur ? t.stop / cur - 1 : null;
      out.push(sym + ' (bought ' + money(P.entry) + (px ? ', now ' + money(px) : '') + '): your stop ' + (cur ? money(cur) : 'NONE') + ' | tested stop ' + money(t.stop) + ' (' + t.why.split(':').slice(-1)[0].split(';')[0].trim() + ')' +
        (px && t.stop >= px ? '. The tested stop is ALREADY above today\u2019s price: by the tested rule this one is past its stop.' : !cur ? '. Set it: stop ' + sym + ' ' + t.stop.toFixed(2) : Math.abs(gap) < 0.02 ? '. Same as yours.' : gap > 0 ? '. Tighter than yours: you may raise it to ' + money(t.stop) + '.' : '. Yours is TIGHTER than the tested stop: it is hit more often. Your choice: keep yours, or widen to ' + money(t.stop) + ' (send  stop ' + sym + ' ' + t.stop.toFixed(2) + ' ).')); }
    out.push('', 'New buys you record (bought SYM PRICE SHARES) get the tested stop automatically. Stops are always yours to place at the broker. Research only.'); return out.join('\n'); })(); }
// WHAT TO SELL AND WHY: every reason the system knows, for each stock you hold, each labelled by how strong the evidence is.
//   MUST    = your own rules (halal per ZAD)          TESTED = passed a 5-year test (stop, warning filing, stretched take-profit)
//   INFO    = known risk, not tested as a sell signal (earnings soon, dilution, low quality, source sold, news, too big a share)
async function sellCheckText(sig) { const pos = loadPos(), syms = Object.keys(pos); if (!syms.length) return 'WHAT TO SELL: you have no stocks recorded.';
  const pv = privRead(), Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), tips = readTips(), last = {}; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
  let news = []; try { news = fs.readFileSync('data/news-log.jsonl', 'utf8').trim().split('\n').slice(-300).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) {}
  const Q = readJson0('data/quality.json'), tot = syms.reduce((a, k) => a + ((pv.shares || {})[k] || 0) * (last[k] || pos[k].entry), 0);
  const sells = [], options = [], holds = [];
  for (const sym of syms) { const P = pos[sym], R = []; let r = ''; try { r = await reviewReply(sym, sig, pos); } catch (e) {}
    const pm = r.match(/^Price ([\d.,]+)/m), px = pm ? +pm[1].replace(/,/g, '') : last[sym] || null, verdict = ((r.match(/\u2192 (.+)/) || [])[1] || '').trim(), earn = ((r.match(/^Earnings on (\S+)/m) || [])[1] || '').replace(/:+$/, '');
    if (bad.has(sym)) R.push(['MUST', 'not halal on the ZAD list (from ' + ((Z && Z.effective) || 'the new list') + ')']);
    if (P.stop && px && px <= P.stop) R.push(['TESTED', 'at or under your stop ' + money(P.stop)]);
    { const es = eventSell(sym); if (es) R.push(['TESTED', es.replace(/^SELL at the next open\. /, '')]); }
    if (verdict === 'TAKE PROFIT OPTION') R.push(['OPTION', ((r.match(/^Why: (.+)$/m) || [])[1] || 'stretched far above its average').split('. Tested')[0] + ': selling and buying back 10% lower beat holding on 5 years of history (not yet confirmed live)']);
    if (earn) { const days = Math.round((Date.parse(earn) - Date.now()) / 864e5); if (days >= 0 && days <= 10) R.push(['INFO', 'earnings in ' + days + ' day' + (days === 1 ? '' : 's') + ' (' + earn + '): the price can jump past your stop that day']); }
    { const dl = dilutionLine(sym); if (/^DILUTION/.test(dl)) R.push(['INFO', dl.replace(/^DILUTION: /, '').split('.')[0] + ' (new shares)']); }
    if (Q && Q.status === 'OK' && Q.rank && Q.rank[sym] !== undefined && Q.rank[sym] < 0.3) R.push(['INFO', 'LOW company quality from its SEC reports (worse than ' + Math.round((1 - Q.rank[sym]) * 100) + '% of US stocks)']);
    { const tx = tips.filter(t => t.sym === sym && t.exit && Date.now() - (t.exit.ts || 0) < 14 * 864e5); if (tx.length) R.push(['INFO', tx[0].src + ' (your source) said SELL on ' + tx[0].exit.d]); }
    { const nw = news.filter(n => n.sym === sym && Date.now() - Date.parse(n.at) < 3 * 864e5); if (nw.length) R.push(['INFO', 'threat headline: ' + nw[nw.length - 1].why + ' ("' + String(nw[nw.length - 1].h).slice(0, 70) + '")']); }
    { const sh = (pv.shares || {})[sym]; if (sh && tot > 0 && sh * (px || P.entry) / tot > 0.15) R.push(['INFO', Math.round(sh * (px || P.entry) / tot * 100) + '% of your money in one stock (trimming over 15% lowered the worst fall in the test)']); }
    const head = sym + (px ? ' ' + money(px) + ' (' + pcs(px / P.entry - 1) + ' from your ' + money(P.entry) + ')' : ''), body = R.map(([k, w]) => '   ' + k + ': ' + w);
    if (R.some(x => x[0] === 'MUST' || x[0] === 'TESTED')) { sells.push([head + ': SELL', ...body]); noteSell(sym, R.filter(x => x[0] === 'MUST' || x[0] === 'TESTED').map(x => x[1]).join('; ')); }
    else if (R.some(x => x[0] === 'OPTION')) options.push([head + ': TAKE PROFIT OPTION (your choice)', ...body]);
    else holds.push([head + ': HOLD' + (P.stop ? ', stop ' + money(P.stop) : ', SET A STOP'), ...(body.length ? body : ['   no sell reason found: trend, filings, news, quality and size checked'])]); }
  const out = ['WHAT TO SELL AND WHY (' + syms.length + ' stocks checked: stop, halal, SEC filings, stretch, earnings, dilution, quality, your sources, news, size)', ''];
  if (sells.length) out.push('SELL', ...sells.flat(), ''); if (options.length) out.push('OPTION', ...options.flat(), ''); if (holds.length) out.push('HOLD', ...holds.flat(), '');
  out.push('MUST = your rules. TESTED = passed a 5-year test. OPTION = passed on history, live check running. INFO = a real risk, not a tested sell signal: weigh it, the stop still decides.', 'After you sell: sold SYM PRICE. Not financial advice, not a halal ruling.');
  return out.join('\n'); }
function horizonLine(sym) { const HZ = readJson0('data/horizons.json'); if (!HZ || HZ.status !== 'OK') return 'Mid / long term: the 1-6 month study runs on Sunday.';
  const sets = Object.entries(HZ.today || {}).filter(([, a]) => a.includes(sym)).map(([k]) => k); if (!sets.length) return 'Mid / long term: not in any of the 4 tested pullback / leader / turn-around setups today.';
  return 'Mid / long term: ' + sets.map(k => { const rs = Object.values(HZ.results).filter(r => r.setup === k), best = rs.find(r => r.verdict === 'PROMISING');
    return (rs[0] ? rs[0].name : k) + ' -> ' + (best ? 'TESTED BUY for ' + best.months + ' month' + (best.months > 1 ? 's' : '') + ' (' + pcs(best.results.newer.avg) + ' vs an average stock ' + pcs(best.results.newer.ctrl) + ')' + ((EX) => EX && EX.results && EX.results[k] && EX.results[k].best !== 'HOLD60' ? ', SELL: ' + EX.results[k].exits[EX.results[k].best].name + ' (tested better exit)' : ', SELL: after ' + best.months + ' month' + (best.months > 1 ? 's' : '') + ' or a close 25% under your buy')(readJson0('data/exits.json')) : 'tested, no edge (' + rs.map(r => r.months + 'm ' + r.verdict.toLowerCase()).join(', ') + ')'); }).join('; ') + '.'; }
// Research registry: every idea ever tested, its result and how many versions were tried (the false-discovery count).
const PENDING = [
  ['Short interest (FINRA, twice a month)', 'free public files with an archive, so nothing is lost by waiting. Build the collector if any company-news or fast-mover test passes on Sunday, then test squeeze setups against the same baseline'],
  ['Big-fund holdings (SEC 13F, quarterly, 45 days late)', 'free SEC data sets going back years, so it can be tested later without collecting now. Same trigger as short interest; one new feed at a time'],
  ['Options activity', 'paid feed; only after short interest or 13F shows something'],
  ['Why-I-skipped log + why-it-fired log', 'cheap; next after Sunday results'],
  ['Heavy pre-market volume before take-off', 'COLLECTING since 15 Oct 2026 (data/premarket.jsonl, 9:25 New York every day); testable after about 90 sessions'],
  ['Share-count history (SEC)', 'BUILT: dilution flag in runners and check SYM; the fast-mover lab now uses the share count known on each past day'],
  ['Exit test (trailing stop, profit lock, average lines) per kind of buy', 'BUILT: runs Sunday; send  exits  for the result'],
  ['Sell now, buy back lower (3 triggers x 2 buy-back rules)', 'BUILT: runs Sunday; send  rebuy  for the result'],
  ['Rebalancing (equal weights, trim over 15%, new cash to the smallest)', 'BUILT: test runs Sunday; send  rebalance  for your portfolio'],
  ['Pre-market gappers: which gaps hold to the close', 'uses the pre-market record; after ~60 sessions'],
  ['Halt / resume study, per-stock gap-fill, entry 30 min after the open', 'later; need minute data and a passed fast-mover rule first'],
  ['5-day range used up when a fast mover fires (the "ADR" idea)', 'COLLECTING since 15 Oct 2026 on every ignition trigger (adr5); tested with the fast-mover paper record'],
  ['Congress trades', 'not built: official disclosures are PDFs up to 45 days late, the free feeds are unofficial, and published studies find no edge after the delay. Revisit only if the FMP plan includes it, as a months-long scoreboard'],
  ['Passive 5% stakes (13G)', 'not built: low expected value, and the SEC history already saved lacks them (a fair test needs a full re-download). Activist 13D and insider clusters are already tested'],
  ['Futures methods from reels (SMT, PSP, Quarterly Theory, Nasdaq timing)', 'rejected: built for index futures, not halal US stocks; no complete rules published'],
  ['Re-running the deep-pullback setup with the octopus filters added', 'rejected: choosing filters after seeing the results is tuning to the past (it would "pass" by luck)'],
  ['Worst-trade audit (the -85% to -90% trades in the 1-6 month study)', 'BUILT: the next study run lists the 20 worst trades of each setup and how each ended (stop gap, delisting, data gap)'],
  ['Sell a stretched stock, buy back 10% lower', 'passed on 5 years of history; LIVE PAPER CHECK running on every stock in the nightly scan; shown to you as an option, not an order, until it confirms'],
  ['Rejected from outside sources (unverified numbers or already failed here)', 'machine learning on 26 angles (overfits), social-media mood (the crowd test failed), paid alt-data, rules for one stock only'],
  ['Rejected as near copies (do not rebuild)', 'quiet heavy volume / narrow range = hunting #16; post-earnings consolidation breakout = hunting #12/#14'],
];
function experimentRows() {
  const rows = [], add = (where, name, verdict, tried, why) => rows.push({ where, name, verdict: verdict || 'NOT RUN YET', tried: tried || 1, why: why || '' });
  const J = (f) => readJson0('data/' + f);
  const HL = J('hunting-lab.json'); for (const r of (HL && HL.rules) || []) add('hunting lab', r.name, r.verdict, 1, r.why);
  const WS = J('winners-study.json'); if (WS) add('winners study', 'what winners looked like the day before', (WS.promising || []).length ? 'PROMISING' : 'NOT PROVEN', Math.max(1, (WS.lift || []).length), (WS.promising || []).length ? '' : 'no pattern passed as a buy rule');
  const LS = J('leaders-study.json'); if (LS) { add('leaders study', 'LEADERS (strongest stocks) ' + (LS.chosen || ''), LS.verdict, Math.max(1, (LS.rows || []).length), LS.why); if (LS.live) add('leaders study', 'LEADERS live version ' + LS.live, LS.liveVerdict, 0, LS.liveWhy); }
  const SC = J('score-study.json'); if (SC) add('score study', '0-100 stock score', SC.verdict, Math.max(1, Object.keys(SC.variant || {}).length), '');
  const SM = J('smart-money-study.json'); if (SM) { add('smart money', 'insider buying', SM.verdict, 1, SM.why); if (SM.strict) add('smart money', 'strict insider cluster (3+ insiders, $100K+, profitable)', SM.strict.verdict, 1, SM.strict.why); }
  const ES = J('events-study.json'); if (ES && ES.fam) { for (const x of Object.values(ES.fam)) add('company news', x.name, x.warn ? 'WARNING' : x.verdict, 1, x.why); if (ES.link) add('company news', 'supply chain (hot industry -> suppliers)', linkVerdict(ES.link), 1, ES.link.why); if (ES.peer) add('company news', 'peer lag (leader jumps -> laggard peers)', ES.peer.verdict, 1, ES.peer.why); }
  else add('company news', 'SEC/FDA news families, supply chain, peer lag, Friday-night filings', 'NOT RUN YET', 0, 'first run Sunday');
  { const CS = (calRead0() || {}).study; if (CS && CS.industry) { const L = Object.entries(CS.industry), found = L.reduce((a, [, v]) => a + (v.up || []).length + (v.down || []).length, 0); add('economic calendar', 'industries after inflation / growth / Fed surprises (' + CS.releases + ' releases)', found ? 'PROMISING' : 'NOT PROVEN', Math.max(1, CS.industryTests || 1), found ? '' : 'no industry reacted steadily in both halves'); } else add('economic calendar', 'industries after inflation / growth / Fed surprises', 'NOT RUN YET', 0, 'first run Sunday after the calendar history loads'); }
  { const HZ = J('horizons.json'); if (HZ && HZ.status === 'OK') for (const r of Object.values(HZ.results)) add('mid / long term (1-6 months)', r.name + ', ' + r.months + ' month' + (r.months > 1 ? 's' : ''), r.verdict, 1, r.why); else add('mid / long term (1-6 months)', 'pullback, leader and turn-around setups held 1, 3, 6 months', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const EX = J('exits.json'); if (EX && EX.status === 'OK') for (const r of Object.values(EX.results)) add('exit test (when to sell)', r.name + ': ' + (r.best === 'HOLD60' ? 'no exit beat holding 3 months' : r.exits[r.best].name), r.best === 'HOLD60' ? 'NOT PROVEN' : 'PROMISING', Object.keys(r.exits).length - 1, r.best === 'HOLD60' ? 'no exit beat the default beyond luck' : ''); else add('exit test (when to sell)', '10 ways of selling the same buys', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const RL = J('rebalance.json'); if (RL && RL.status === 'OK') for (const r of Object.values(RL.results)) add('rebalancing', r.pool.toLowerCase() + ' stocks: ' + r.mode.toLowerCase() + ' vs ' + r.vs.toLowerCase(), /BETTER|SAFER/.test(r.verdict) ? 'PROMISING' : 'NOT PROVEN', 1, r.verdict.toLowerCase()); else add('rebalancing', 'equal weights, trim over 15%, new cash to the smallest', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const RB = J('rebuy.json'); if (RB && RB.status === 'OK') for (const r of Object.values(RB.results)) add('sell now, buy back lower', r.name, r.verdict === 'SWITCH WINS' ? 'PROMISING' : swWins(r) ? 'TRADABLE SMALL (tier 2)' : r.verdict, 1, r.why); else add('sell now, buy back lower', 'selling and re-buying vs holding (6 versions)', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const QY = J('quality.json'); if (QY && QY.status === 'OK') for (const r of Object.values(QY.results)) add('long investing (company quality)', r.name + ', ' + r.months + ' months', r.verdict, 1, r.why); else add('long investing (company quality)', 'quality companies from SEC reports, held 6-12 months', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const SS = J('stops.json'); if (SS && SS.status === 'OK') for (const [pool, P] of Object.entries(SS.results)) add('stop study', pool.toLowerCase() + ' stocks: recommended ' + P.rules[P.recommended === 'NONE' ? 'NONE' : P.recommended].name, 'PROMISING', Object.keys(P.rules).length - 1, ''); else add('stop study', '10 stop rules on your own buys', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const SQ = J('sequence-study.json'); if (SQ && SQ.status === 'OK') for (const r of Object.values(SQ.results)) add('fast movers', 'filing -> quiet days -> breakout, sold after ' + r.hold + ' session' + (r.hold > 1 ? 's' : '') + ' (vs the same breakout without a filing)', /PROMISING/.test(r.verdict) ? 'PROVISIONALLY PROMISING' : r.verdict, 1, r.why); else add('fast movers', 'filing -> quiet days -> breakout as one rule', 'NOT RUN YET', 0, 'first run Sunday'); }
  { const AL = J('autolab.json'); if (AL && AL.status === 'OK') { const t = Object.values(AL.tried), c = Object.values(AL.candidates || {}); add('autolab (rules the system invents)', t.length + ' invented rules tested; ' + c.length + ' live candidate' + (c.length === 1 ? '' : 's') + (c.filter(x => x.status === 'PROVEN LIVE').length ? ', ' + c.filter(x => x.status === 'PROVEN LIVE').length + ' PROVEN LIVE' : ''), c.some(x => x.status === 'PROVEN LIVE') ? 'PROMISING' : 'NOT PROVEN', Math.max(1, t.length), c.length ? 'candidates on paper' : 'none survived all gates'); } else add('autolab (rules the system invents)', '60 new rules a week, three gates + paper', 'NOT RUN YET', 0, 'first run Sunday'); }
  const OC = J('octopus.json'); if (OC && OC.status === 'OK') add('octopus (many angles linked)', '26 angles + 325 combinations, retrained weekly, judged on unseen weeks' + (OC.paper && OC.paper.n ? ' (live paper ' + OC.paper.n + ' picks, ' + pcs(OC.paper.avg) + ' a trade)' : ''), OC.verdict, 1, OC.why); else add('octopus (many angles linked)', '26 angles + 325 combinations, retrained weekly', 'NOT RUN YET', 0, 'first run Sunday');
  const FL = J('fastmover-lab.json'); if (FL && FL.rules) for (const r of Object.values(FL.rules)) add('fast-mover lab', r.name, r.verdict, 1, r.why);
  const IG = J('ignition-lab.json'); if (IG && IG.rules) { const v = Object.values(IG.rules); v.forEach((r, i) => add('ignition (minute bars)', r.name + ' / ' + r.exitName, r.verdict, i === 0 ? Math.max(v.length, IG.variants || 0) - v.length + 1 : 1, r.why)); }
  return rows; }
// append-only research ledger: one line each time an idea gets a new verdict (never rewritten), so the count of things tried can never be forgotten
function ledgerAppend() { try { const rows = experimentRows(), f = 'data/experiments.jsonl', last = new Map();
  if (fs.existsSync(f)) for (const ln of fs.readFileSync(f, 'utf8').split('\n')) { if (!ln.trim()) continue; try { const x = JSON.parse(ln); last.set(x.where + '|' + x.name, x.verdict + '|' + x.tried); } catch (e) {} }
  const d = new Date().toISOString().slice(0, 10), add = rows.filter(r => last.get(r.where + '|' + r.name) !== r.verdict + '|' + r.tried).map(r => JSON.stringify({ d, where: r.where, name: r.name, verdict: r.verdict, tried: r.tried, why: String(r.why || '').slice(0, 160), first: !last.has(r.where + '|' + r.name) }) + '\n');
  if (add.length) fs.appendFileSync(f, add.join('')); return add.length; } catch (e) { console.log('ledger: ' + e.message); return 0; } }
function ledgerInfo() { try { const L = fs.readFileSync('data/experiments.jsonl', 'utf8').split('\n').filter(x => x.trim()).map(x => JSON.parse(x)); if (!L.length) return null;
  const ideas = new Set(L.map(x => x.where + '|' + x.name)).size, ev = L.length; return { ideas, ev, since: L[0].d }; } catch (e) { return null; } }
function exitsText() { const EX = readJson0('data/exits.json'); if (!EX || EX.status !== 'OK') return 'EXIT TEST: runs on Sunday with the other studies (the same buys sold 10 ways). Ask again after Sunday.';
  const out = ['EXIT TEST: WHEN TO SELL (' + EX.from + ' to ' + EX.to + ', the same buys sold ' + Object.keys(Object.values(EX.results)[0].exits).length + ' ways, judged above the S&P 500 over the same days)', ''];
  for (const r of Object.values(EX.results)) { const d = r.exits.HOLD60.results.newer; out.push(r.name + ' (' + r.trades + ' trades): holding 3 months made ' + pcs(d.avg) + ' a trade.');
    if (r.best !== 'HOLD60') { const b = r.exits[r.best].results; out.push('  BETTER: ' + r.exits[r.best].name + ', ' + pcs(b.vsDefault.newer.diff) + ' a trade more (newer half; ' + pcs(b.vsDefault.older.diff) + ' older), about ' + Math.round(b.newer.days) + ' sessions held.'); }
    else out.push('  Keep the default: no other way of selling beat it beyond luck.'); }
  out.push('', 'A better exit goes into your sell plans only for a kind of buy that has itself passed its test. Research only.'); return out.join('\n'); }
function rebuyText() { const RB = readJson0('data/rebuy.json'); if (!RB || RB.status !== 'OK') return 'SELL NOW, BUY BACK LOWER: the test runs on Sunday with the other studies. Until it says otherwise: do not sell a stock just to buy it back cheaper. Sell only on your stop, a tested exit, or a tested warning.';
  const win = Object.values(RB.results).filter(r => swWins(r));
  return ['SELL NOW, BUY BACK LOWER? (' + RB.from + ' to ' + RB.to + ', whole market, compared with simply holding for 60 sessions, your costs included)', '',
    ...Object.values(RB.results).map(r => { const n = r.results.newer; return '- ' + r.name + ': ' + (swTier(r) === 'small' ? 'TRADABLE SMALL (tier 2; ' + r.verdict.toLowerCase() + ')' : r.verdict) + (n.n ? ' (' + pcs(n.adv) + ' vs holding; the stock came back to the buy-back price ' + Math.round(n.cameBack * 100) + '% of the time)' : ''); }),
    '', switchPaperLine(),
    '', win.length ? 'DECISION: the 10%-lower buy-back passed on history. When one of your stocks meets it, ACTIONS shows it as a TAKE PROFIT OPTION with the buy-back price, until the live paper check confirms it.' : 'DECISION: no switch beat holding. Do not sell to buy back lower; sell only on your stop, a tested exit, or a tested warning.', 'Research only.'].join('\n'); }
// REBALANCE: your portfolio by stock and by industry, measured against equal weights. Health first (stop, halal, tested warning), then
// trim what grew too big, then where new cash should go. Whether trimming is advised follows the Sunday rebalancing test (rebalance.mjs).
function rebalanceText(sig) { const pos = loadPos(), pv = privRead(), sh = pv.shares || {}, syms = Object.keys(pos); if (!syms.length) return 'REBALANCE: no stocks recorded. Send  bought SYM PRICE SHARES  for each one you own.';
  const last = {}; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
  const SEC = readJson0('data/sectors.json') || {}, CK = readJson0('data/sec-ciks.json') || {}, sicG = (c) => { c = +c; if (!c) return null; return c === 3674 || c === 3825 ? 'Semiconductors' : (c >= 2830 && c <= 2836) || c === 8731 ? 'Health care and biotech' : (c >= 7370 && c <= 7379) || (c >= 3570 && c <= 3579) ? 'Technology' : (c >= 3660 && c <= 3679) || c === 3827 ? 'Electrical Equipment' : c === 1311 || c === 2911 || c === 1381 || c === 1389 ? 'Energy' : c >= 1000 && c <= 1099 ? 'Mining' : c >= 3720 && c <= 3769 ? 'Aerospace' : c >= 6000 && c <= 6799 ? 'Financials' : c >= 4900 && c <= 4999 ? 'Utilities' : c >= 1500 && c <= 1799 ? 'Construction' : c >= 5000 && c <= 5199 ? 'Distribution' : c >= 3500 && c <= 3569 ? 'Machinery' : null; }, Z = readJson0('data/zad-list.json'), m0 = (x) => money(x).replace(/\.00$/, '');
  const noSh = syms.filter(k => !(sh[k] > 0)); if (noSh.length === syms.length) return 'REBALANCE: I know your buy prices but not how many shares you hold, so I cannot see the weights. Send for each:  bought SYM PRICE SHARES  (shares stay encrypted).';
  const rows = syms.filter(k => sh[k] > 0).map(k => { const P = pos[k], px = last[k] || P.entry; return { k, P, px, usd: sh[k] * px, g: px / P.entry - 1, ind: secGroup(SEC[k]) || sicG(CK[k] && CK[k][1]) || 'Other', up: ((sig && sig.stocks) || []).find(x => x.sym === k) }; }), tot = rows.reduce((a, r) => a + r.usd, 0), n = rows.length;
  const tgt = 1 / n, cap = Math.max(0.15, 1.5 / n), RB = readJson0('data/rebalance.json'), band = RB && RB.status === 'OK' ? RB.results.STRONG_BAND || RB.results.ANY_BAND : null, cashR = RB && RB.status === 'OK' ? RB.results.STRONG_NEWCASH || RB.results.ANY_NEWCASH : null;
  const out = ['REBALANCE: ' + n + ' stocks, about ' + m0(tot) + ' USD at the last close. Target ' + Math.round(tgt * 100) + '% each (equal weights), limit ' + Math.round(cap * 100) + '% per stock, 35% per industry.' + (noSh.length ? ' Not counted (shares unknown): ' + noSh.join(', ') + '.' : ''), ''];
  rows.sort((a, b) => b.usd - a.usd); out.push('WEIGHTS:', ...rows.map(r => '- ' + r.k + ' ' + Math.round(r.usd / tot * 100) + '% (' + m0(r.usd) + ' USD, ' + pcs(r.g) + ' from your buy, ' + r.ind + ')'));
  const ind = {}; for (const r of rows) ind[r.ind] = (ind[r.ind] || 0) + r.usd; const heavy = Object.entries(ind).filter(([g, v]) => g !== 'Other' && v / tot > 0.35);
  out.push('', 'BY INDUSTRY: ' + Object.entries(ind).sort((a, b) => b[1] - a[1]).map(([g, v]) => g + ' ' + Math.round(v / tot * 100) + '%').join(', ') + (heavy.length ? '. TOO MUCH IN ' + heavy.map(x => x[0]).join(', ') + ': these tend to fall together; no new buys there until under 35%.' : '.'));
  // 1. health first: these are sells for their own reason, not rebalancing
  const fix = rows.filter(r => (r.P.stop && r.px <= r.P.stop) || (Z && (Z.notHalal || []).includes(r.k)) || eventSell(r.k));
  if (fix.length) out.push('', 'SELL FIRST (not rebalancing):', ...fix.map(r => '- ' + r.k + ': ' + [r.P.stop && r.px <= r.P.stop ? 'at or under your stop ' + money(r.P.stop) : '', Z && (Z.notHalal || []).includes(r.k) ? 'not halal on the new ZAD list' : '', eventSell(r.k) ? 'tested warning filing' : ''].filter(Boolean).join('; ') + ' (' + m0(r.usd) + ' USD)'));
  // 2. trim what grew too big (only winners; a loser that is big is a stop question, not a trim)
  const okR = rows.filter(r => !fix.includes(r)), big = okR.filter(r => r.usd / tot > cap && r.g > 0).map(r => ({ ...r, cut: r.usd - tgt * tot })).filter(r => r.cut >= 1000);
  const trimWord = !band ? 'the rebalancing test runs Sunday' : 'a RISK REVIEW, not an order. Tested on 10-stock portfolios: trimming cut the worst fall (' + pcs(band.newer.mdd) + ' vs ' + pcs(band.newer.baseMdd) + ') and the profit was ' + pcs(band.newer.ret) + ' vs ' + pcs(band.newer.baseRet) + ' a year without trimming (' + (band.moreProfit ? 'more profit' : band.lessProfit ? 'LESS profit' : 'difference within luck') + ')' + (n < 8 ? '. You hold under 8 stocks, so the test does not fit your portfolio well' : '');
  out.push('', 'TRIM (' + trimWord + '):', ...(big.length ? big.map(r => '- ' + r.k + ': SELL about ' + m0(Math.floor(r.cut / r.px) * r.px) + ' USD (' + Math.floor(r.cut / r.px) + ' shares) to bring it from ' + Math.round(r.usd / tot * 100) + '% back to ' + Math.round(tgt * 100) + '%. Keep the rest with its stop.') : ['- nothing: no winner is over ' + Math.round(cap * 100) + '% of your portfolio.']));
  // 3. new cash: into the most underweight healthy holding, never into one under its 50-day trend break or a sell
  const br = budgetRoom(), room = br ? br.room + fix.reduce((a, r) => a + r.usd, 0) : null, low = okR.filter(r => r.usd / tot < tgt * 0.7 && !heavy.some(h => h[0] === r.ind)).sort((a, b) => a.usd - b.usd);
  // single stocks are not funds: new cash goes only to an underweight holding that is NOT falling (in profit or in an uptrend, and 8%+ above
  // its stop). Adding to a falling stock to lower the average is never advised by this system.
  const healthy = (r) => (r.g >= 0 || (r.up && r.up.uptrend)) && (!r.P.stop || r.px >= r.P.stop * 1.08), under = low.filter(healthy), falling = low.filter(r => !healthy(r));
  const cashWord = !cashR ? '' : /SAFER|BETTER/.test(cashR.verdict) ? ' (tested: new cash into the smallest holding lowered the worst fall' + (/LESS PROFIT/.test(cashR.verdict) ? ', at some cost in profit)' : ')') : cashR.verdict === 'WORSE' ? ' (tested: adding to the winners made more; this is a risk choice)' : '';
  out.push('', 'NEW CASH' + cashWord + ':', ...(room && room >= 1000 ? (under.length ? under.slice(0, 3).map(r => '- ' + r.k + ': ADD up to ' + m0(Math.max(1000, tgt * tot - r.usd)) + ' USD (now ' + Math.round(r.usd / tot * 100) + '%), only while it holds above its stop ' + (r.P.stop ? money(r.P.stop) : '(set one)') + '.') : ['- no healthy holding is underweight; put new cash into the tested buys in ACTIONS.']) : ['- no budget room now' + (br ? ' (' + m0(br.room) + ' USD free)' : ' (send  budget 20000  to set yours)') + '. Selling the SELL FIRST stocks frees cash.']));
  if (falling.length) out.push('NOT ADDING TO (underweight because they fell; adding would only lower your average): ' + falling.map(r => r.k + ' ' + pcs(r.g)).join(', ') + '. They stay on their stops.');
  out.push('', 'Tested buys in ACTIONS come before rebalancing buys. Fees: 3 USD a trade; no trade under 1,000 USD. Research only, not financial advice.');
  return out.join('\n'); }
// LIVE PAPER CHECK of "sell a stretched stock, buy it back 10% lower" (rebuy.mjs passed it on 5 years of history). Every stock in the
// nightly scan that newly closes 30%+ above its 50-day average (STRETCH) or 25%+ above its close 10 sessions earlier (SPIKE) is logged;
// paper-sold at the next open, paper-bought back at 10% under that price (or at the close 60 sessions later if it never comes back),
// and compared with simply holding over the same days. Costs 0.4% a side. Nothing is traded. File: data/switch-paper.json.
function switchPaper(loaded) { const f = 'data/switch-paper.json', S = readJson(f, { open: [], done: [] }), SIDE = 0.004, H = 60;
  // 1. finish or update the open cases
  const still = []; for (const x of S.open) { const d = loaded[x.sym]; const c = d && d.candles; if (!c) { still.push(x); continue; } const k = c.findIndex(b => b.d === x.d); if (k < 0) { still.push(x); continue; }
    if (k + 1 >= c.length) { still.push(x); continue; } const sell = c[k + 1].o; if (!(sell > 0)) { still.push(x); continue; } x.sell = sell;
    let px = null; for (let j = k + 2; j <= Math.min(c.length - 1, k + H) && px === null; j++) { const lim = sell * 0.9; if (c[j].o > 0 && c[j].o <= lim) { px = c[j].o; x.backD = c[j].d; } else if (c[j].l <= lim) { px = lim; x.backD = c[j].d; } }
    if (c.length - 1 < k + H) { still.push(x); continue; }
    const end = c[k + H].c, back = px !== null; if (!back) px = end;
    S.done.push({ ...x, end, back, adv: +((1 - SIDE) ** 2 * sell / px - 1).toFixed(4), hold: +(end / sell - 1).toFixed(4), doneD: c[k + H].d }); }
  S.open = still;
  // 2. new triggers at the last close (first day only), liquid stocks
  const openSyms = new Set(S.open.map(x => x.sym));
  for (const [sym, d] of Object.entries(loaded)) { const c = d && d.candles; if (!c || c.length < 62 || openSyms.has(sym) || sym === 'SPY') continue; const i = c.length - 1, cl = c[i].c;
    let dv = 0; for (let j = i - 19; j <= i; j++) dv += c[j].c * c[j].v; if (!(cl >= 5) || dv / 20 < 5e6) continue;
    const avg = (e) => { let t = 0; for (let j = e - 49; j <= e; j++) t += c[j].c; return t / 50; }, m = avg(i), mp = avg(i - 1);
    const st = cl >= m * 1.3 && !(c[i - 1].c >= mp * 1.3), sp = cl >= c[i - 10].c * 1.25 && !(c[i - 1].c >= c[i - 11].c * 1.25);
    if (st || sp) S.open.push({ sym, d: c[i].d, trig: st ? 'STRETCH' : 'SPIKE', ref: cl }); }
  if (S.done.length > 2000) S.done = S.done.slice(-2000);
  fs.writeFileSync(f, JSON.stringify(S)); }
// TIER 2, "TRADABLE SMALL" (owner's decision, 22 Oct 2026): a rule that passed its own pre-registered test in BOTH halves, after the
// stress cost, beat its yardstick (holding / the average stock), survives without its 2 best trades, with t >= 2.5 in every reported
// half and block, but is below the league proof bar (about 4.0 after ~1,600 tries). Traded at most 1,000 USD a trade with a stop,
// always labelled with its odds, and switched off automatically when its own live record turns negative (20+ finished cases).
// The proof bar is unchanged and still decides the label PROVEN and any bigger size.
const TIER2_T = 2.5;
// TIER 2 is an ADDITION with its own switch (owner, 22 Oct: "as an addition like a new strategy, don't mess up the system").
//  tier2 off  = the system behaves exactly as before (proven-only);  tier2 on  = the addition is shown, in its own section, with its own record.
const TIER2_ON = () => (readJson0('data/settings.json') || {}).tier2 !== false;
// its own ledger: every tier-2 instruction shown is logged once with its price; after 30 calendar days its move is filled in, after costs.
// (review S-11, 22 Oct) a switch case (sell, buy back lower) is a round trip too, so it now pays the same 0.8% as a buy.
function tier2Log(sym, kind, px, extra) { try { if (!(px > 0)) return; const f = 'data/tier2-ledger.jsonl', d = new Date().toISOString().slice(0, 10); let L = []; try { L = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {}
  if (L.some(r => r.sym === r.sym && r.sym === sym && r.kind === kind && Date.now() - Date.parse(r.d) < 30 * 864e5)) return; fs.appendFileSync(f, JSON.stringify({ d, sym, kind, px: +(+px).toFixed(4), ...(extra || {}) }) + '\n'); } catch (e) {} }
// option tickets (kind option:<rule>) are never priced here with the stock's price: optionsShadow resolves them at their own bid
function tier2Resolve(lastPx) { try { const f = 'data/tier2-ledger.jsonl'; let L = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)), ch = false;
  for (const r of L) if (!r.out && !/^option:/.test(r.kind || '') && Date.now() - Date.parse(r.d) >= 30 * 864e5 && lastPx[r.sym] > 0) { r.out = new Date().toISOString().slice(0, 10); r.px1 = lastPx[r.sym]; r.pct = +(r.kind === 'switch sell' ? r.px / r.px1 - 1 - 0.008 : r.px1 / r.px - 1 - 0.008).toFixed(4); ch = true; }
  if (ch) fs.writeFileSync(f, L.map(x => JSON.stringify(x)).join('\n') + '\n'); return L; } catch (e) { return []; } }
// TIER 2 SWITCHES ITSELF OFF ON ITS OWN LEDGER (review S-12, 22 Oct): 20+ resolved cases of that kind in data/tier2-ledger.jsonl with a
// negative average after costs. (Before, V15 read only the league's 3-month score, which cannot exist before about Feb 2027.)
function tier2LedgerNegative(kind) { try { const a = fs.readFileSync('data/tier2-ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(r => r.kind === kind && typeof r.pct === 'number');
  return a.length >= 20 && a.reduce((x, r) => x + r.pct, 0) / a.length < 0; } catch (e) { return false; } }
// FOLLOWING (owner's request 23 Oct 2026; follow-lane.mjs): new buy calls of public traders whose OWN full dated call history passed the
// tier-2 bar (FOLLOW in data/follow-board.json). Gates here, at display time: not halal in ZAD -> removed; unknown halal -> shown with
// "check ZAD first"; lottery-like (15%+ one-day jump last month) -> removed; a tested warning filing or an offering filing (424B4 / 424B5)
// in the last 30 days -> removed (dilution); a stock you hold -> skipped; a trader whose own tier-2 ledger turned negative -> off.
// 1,000 USD, stop 15% under the buy unless the trader gave one, sold at the close of his horizon. Each shown call is logged as 'follow:<trader>'.
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
function followFade() { const F = readJson0('data/follow-fade.json'), A = (F && (F.avoid || F)) || {}, today = new Date().toISOString().slice(0, 10), out = {};
  for (const [sym, v] of Object.entries(A)) if (v && v.trader && !(v.until && v.until < today)) out[sym] = v.trader; return out; }
function followOffering(sym) { const ER = readJson0('data/events-recent.json'); return ((ER && ER.events) || []).some(e => e.sym === sym && /OFFERING/.test(e.f || '') && Date.now() - Date.parse(e.p) < 30 * 864e5); }
function followSection(sig, pos) { if (!TIER2_ON()) return []; const FT = readJson0('data/follow-today.json'); if (!FT || !Array.isArray(FT.calls) || !FT.calls.length || Date.now() - Date.parse(FT.at || 0) > 4 * 864e5) return [];
  const lot = (sig && sig.lottery) || {}, last = {}, seen = new Set(), rows = []; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
  for (const x of FT.calls) { if (!x || !x.sym || seen.has(x.sym) || (pos || {})[x.sym]) continue; const kind = 'follow:' + x.trader, hal = myHalal(x.sym);
    if (hal === 'fail' || lot[x.sym] >= 0.15 || eventWarn(x.sym) || followOffering(x.sym) || tier2LedgerNegative(kind)) continue; seen.add(x.sym);
    const px = x.last > 0 ? x.last : last[x.sym], H = x.H || 20, own = x.st > 0 && px > 0 && x.st < px;
    if (px > 0) tier2Log(x.sym, kind, px);
    rows.push('- BUY ' + x.sym + (px > 0 ? ' at the next open, only up to ' + money(px * 1.03) + ' (last close ' + money(px) + ' +3%)' : ' at the next open (no recent price: only near the open)') + ', 1,000 USD. ' + (own ? 'STOP ' + money(x.st) + ' (the trader’s own)' : 'STOP 15% under your buy') + ' at your broker. SELL at the close of the ' + ordinal(H) + ' session after you buy (' + (H === 1 ? 'the same day: he day-trades' : 'his horizon') + ')' + (x.tg > 0 ? '; his target ' + money(x.tg) + ' is information only' : '') + '. From ' + x.trader + (x.source ? ' [' + x.source + ']' : '') + (x.title ? ' ("' + String(x.title).slice(0, 60) + '", ' + String(x.pub || '').slice(0, 10) + ')' : '') + '. His record: ' + x.record + '.' + (hal === 'ok' ? '' : ' Halal not checked: check ZAD first.') + ' Send  bought ' + x.sym + ' PRICE .');
    if (rows.length >= 5) break; }
  return rows.length ? ['FOLLOWING (traders whose own call history wins; tier 2, 1,000 USD, stop 15% unless the trader gave one)', ...rows, 'Why these: each trader passed the tier-2 test on his own full call history (30+ calls on 10+ days, both halves, after the 1.2% cost, t 2.5+), below the 4.0 proof bar. Send  traders  for the leaderboard.'] : []; }
function tradersText() { const B = readJson0('data/follow-board.json'); if (!B || !Array.isArray(B.traders)) return 'TRADERS: the follow lane has not run yet (it runs each night after the US close and in full on Sunday).';
  const by = (l) => B.traders.filter(t => t.level === l), list = [...by('FOLLOW'), ...by('FADE'), ...by('NO EDGE'), ...by('WATCH')].slice(0, 10), c = B.counts || {};
  return ['TRADERS (public traders scored on every dated call they made; from ' + String(B.generatedAt || '').slice(0, 10) + ')',
    B.screened + ' traders screened, ' + B.judged + ' with enough calls to judge: FOLLOW ' + (c.FOLLOW || 0) + ', FADE ' + (c.FADE || 0) + ', NO EDGE ' + (c['NO EDGE'] || 0) + ', WATCH (too few) ' + (c.WATCH || 0) + '. Calls scored: ' + ((B.calls && B.calls.scored) || 0) + '.',
    'Luck bar: with ' + B.judged + ' traders judged, about ' + ((B.luck && B.luck.followByLuckAtMost) || 0) + ' would reach t 2.5 by luck alone.', '',
    ...list.map(t => '- ' + t.level + ' ' + t.name + ' (' + t.src + ', judged at ' + t.H + ' session' + (t.H > 1 ? 's' : '') + '): ' + t.record), '',
    'FOLLOW traders’ new buy calls appear in ACTIONS under FOLLOWING (tier 2, 1,000 USD, with a stop). FADE: their calls lag the average stock. Research, not advice.'].join('\n'); }
function swTier(r) { if (!r) return null;
  // A-SWR1 (Agent A, 23 Oct): the switch counted in USD against holding, failed buy-backs included. While its verdict for this trigger is
  // not TRADABLE SMALL or PROVEN, the switch is neither tier 2 nor proven (it lost -2.8% to -3.4% per switch vs holding in 2024-26).
  { const AV = (readJson0('data/agent-a-lab.json') || {}).verdicts || {}, k = 'A-SWR1/' + (r.trigger || 'STRETCH') + '/LOWER10', v = AV[k];
    if (v && v !== 'TRADABLE SMALL' && v !== 'PROVEN') return null; } if (r.verdict === 'SWITCH WINS') return 'proven'; if (!TIER2_ON() || r.verdict !== 'BELOW THE LEAGUE BAR' || !r.results) return null;
  const o = r.results.older || {}, n = r.results.newer || {}, ts = [o.t, n.t, o.tBlock, n.tBlock].filter(x => typeof x === 'number');
  if (ts.length < 2 || Math.min(...ts) < TIER2_T || !(o.adv > 0 && n.adv > 0) || !(o.noTop2 > 0 && n.noTop2 > 0)) return null;
  // (review S-13) the stress cost: rebuy.json gives it for the newer half only (results.stress); no older-half stress figure exists in its output
  if (!(r.results.stress && r.results.stress.adv > 0)) return null;
  if (tier2LedgerNegative('switch sell')) return null;   // its own ledger negative: off (review S-12)
  const S = readJson0('data/switch-paper.json'), D = ((S && S.done) || []).filter(x => !r.trigger || x.trig === r.trigger);
  if (D.length >= 20 && D.reduce((a, x) => a + (x.adv || 0), 0) / D.length < 0) return null;   // live record negative: off
  return 'small'; }
const swWins = (r) => !!swTier(r);
const swLabel = (r) => swTier(r) === 'small' ? ' TRADABLE SMALL (tier 2: passed its own test in both halves, t ' + Math.min(...[r.results.older.t, r.results.newer.t, r.results.older.tBlock, r.results.newer.tBlock].filter(x => typeof x === 'number')).toFixed(1) + ' at worst, below the 4.0 proof bar; switched off if its live record turns negative).' : '';
function v15Tier() { if (!TIER2_ON()) return null; const Q = readJson0('data/quality.json'), V = Q && Q.v15 && Q.v15.monthly && Q.v15.monthly['6m']; if (!V || !V.t) return null;
  if (V.t.clearsLeagueBar) return 'proven'; if (!(V.t.older >= TIER2_T && V.t.newer >= TIER2_T)) return null;
  if (!(V.older && V.newer && V.older.beatAvgStock / V.older.months > 0.5 && V.newer.beatAvgStock / V.newer.months > 0.5)) return null;
  // (review S-13) stress cost and without its 2 best, from the trade study row of the same rule (F-SCORE UPTREND, 6 months): noTop2 in both
  // halves, stress for the newer half only (quality.mjs publishes no older-half stress figure)
  { const R = Q.results && Q.results['F-SCORE UPTREND_126'] && Q.results['F-SCORE UPTREND_126'].results; if (!R || !R.older || !R.newer || !R.stress) return null;
    if (!(R.older.noTop2 > 0 && R.newer.noTop2 > 0) || !(R.stress.avg > 0)) return null; }
  if (tier2LedgerNegative('longer hold')) return null;   // its own ledger negative: off (review S-12)
  const LG = readJson0('data/agent-league.json'), b = LG && (LG.rows || []).find(x => x.id === 'B'); if (b && b.scored3m >= 3 && typeof b.vsSpy3m === 'number' && b.vsSpy3m < 0) return null;   // live league record negative: off
  return 'small'; }
// CATALYST RUN-UP (the owner's OCGN case, 23 Oct 2026; catalyst-lab.mjs, pre-registered CAT-RUN1 / CAT-NEWS1). data/catalyst-today.json is
// written weekly: upcoming dated catalysts (PDUFA, advisory committee, expected topline) with the buy and sell sessions, gates checked.
// A BUY is shown only when the rule's frozen verdict is PROVEN, or TRADABLE SMALL with the tier2 switch on and its own ledger not
// negative; otherwise nothing new appears in ACTIONS and  catalysts  shows the calendar as information only.
function catalystTier(rule) { const C = readJson0('data/catalyst-today.json'), v = C && C.rules && C.rules[rule];
  if (v === 'PROVEN') return 'proven'; if (v !== 'TRADABLE SMALL' || !TIER2_ON() || tier2LedgerNegative('catalyst')) return null; return 'small'; }
function catalystLines(sig, pos) { const C = readJson0('data/catalyst-today.json'); if (!C) return [];
  const tiers = { 'CAT-RUN1': catalystTier('CAT-RUN1'), 'CAT-NEWS1': catalystTier('CAT-NEWS1') }; if (!tiers['CAT-RUN1'] && !tiers['CAT-NEWS1']) return [];
  const after = (sig && sig.session) || ny(Date.now()).d, next = (C.sessions || []).find(d => d > after); if (!next) return [];
  const Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), lot = (sig && sig.lottery) || {}, held = new Set(Object.keys(pos || {})), last = {}; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
  const ok = (sym, hal) => sym && hal !== 'fail' && !bad.has(sym) && myHalal(sym) !== 'fail' && !(lot[sym] >= 0.15) && !held.has(sym);
  const run = tiers['CAT-RUN1'] ? (C.upcoming || []).filter(u => u.buy === next && !u.entryPassed && !u.blocked && ok(u.sym, u.halal)).slice(0, 3) : [];
  const nw = tiers['CAT-NEWS1'] ? (C.news || []).filter(u => u.buy === next && ok(u.sym, u.halal)).slice(0, 3) : [];
  if (!run.length && !nw.length) return [];
  const lab = (t) => t === 'proven' ? 'PROVEN' : 'tier 2, TRADABLE SMALL: passed its own pre-registered 5-year test in both halves after the higher cost, below the 4.0 proof bar; 1,000 USD, switched off if its live record turns negative';
  const buyLine = (u) => { const px = last[u.sym] || u.lastClose; tier2Log(u.sym, 'catalyst', px); return '- BUY ' + u.sym + ' at the open on ' + next + (px ? ', up to ' + money(px * 1.03) + ' (3% above the last close ' + money(px) + ')' : '') + '. STOP 15% under your buy at your broker. ';
  };
  const out = [];
  if (run.length) out.push('CATALYST RUN-UP (' + lab(tiers['CAT-RUN1']) + '):', ...run.map(u => buyLine(u) + 'SELL at the close on ' + u.sell + ' (2 sessions before the ' + (u.kinds || []).map(k => k === 'ADCOM' ? 'advisory committee' : k === 'TOPLINE' ? 'expected topline' : k).join(' / ') + ' date ' + u.event + (u.precision && u.precision !== 'day' ? ', earliest day of the stated ' + u.precision : '') + '; never hold through it). Stated in an 8-K filed ' + u.firstStated + '. Check ZAD; send  bought ' + u.sym + ' PRICE .'));
  if (nw.length) out.push('NEWS BUILD-UP (' + lab(tiers['CAT-NEWS1']) + '):', ...nw.map(u => buyLine(u) + 'SELL at the close on ' + u.sell + ' (15 sessions). ' + u.positives + ' positive 8-Ks in 60 sessions, none negative. Check ZAD; send  bought ' + u.sym + ' PRICE .'));
  return out; }
function catalystCalendarText() { const C = readJson0('data/catalyst-today.json'), L = readJson0('data/catalyst-lab.json');
  if (!C) return 'CATALYSTS: the catalyst calendar is built with the Sunday studies (catalyst-lab). Ask again after it runs.';
  const v = (id) => { const r = L && L.results && L.results[id]; return r ? r.verdict : 'not run'; }, qual = catalystTier('CAT-RUN1') || catalystTier('CAT-NEWS1');
  const up = (C.upcoming || []).filter(u => !u.entryPassed && !u.blocked && u.halal !== 'fail').slice(0, 15), inWin = (C.upcoming || []).filter(u => u.entryPassed && !u.blocked).slice(0, 8);
  const kind = (u) => (u.kinds || []).map(k => k === 'ADCOM' ? 'advisory committee' : k === 'TOPLINE' ? 'topline' : k).join('/');
  return ['CATALYST CALENDAR (from company 8-Ks: FDA decision dates, advisory committees, expected trial readouts; week of ' + C.lastClose + ')', '',
    'Rules: run-up into the date (CAT-RUN1) ' + v('CAT-RUN1') + '; news build-up (CAT-NEWS1) ' + v('CAT-NEWS1') + '.', qual ? 'A rule qualified: its buys appear in ACTIONS on their buy day.' : 'INFORMATION ONLY: no catalyst rule passed its test, so nothing here is a buy.', '',
    up.length ? 'Coming up (buy day = 30 sessions before, sell day = 2 sessions before):' : 'No upcoming dated catalyst passes the gates (price, volume, no recent share sale, no 15% one-day jump).',
    ...up.map(u => '- ' + u.sym + ': ' + kind(u) + ' ' + u.event + (u.precision !== 'day' ? ' (earliest day of the stated ' + u.precision + ')' : '') + '; buy day ' + u.buy + ', sell day ' + u.sell + (u.halal === 'ok' ? ' (halal per ZAD)' : ' (check ZAD)')),
    ...(inWin.length ? ['', 'Already inside the window (buy day passed): ' + inWin.map(u => u.sym + ' ' + kind(u) + ' ' + u.event).join(', ') + '.'] : []),
    '', 'Never hold through the decision day: the result is a coin toss that can halve a small company. Research only.'].join('\n'); }
// CHAIN DECODER (owner, 23 Oct 2026: "follow the source"; chain-decoder.mjs, pre-registered CHAIN-MOM1 / CHAIN-DEMAND1 / CHAIN-LAG1 /
// CHAIN-READ1). data/chain-today.json is written weekly: hot layers now, each member's chain and layer (point in time), and buys ONLY for a
// rule whose frozen verdict is PROVEN, or TRADABLE SMALL with the tier2 switch on and its own ledger ('chain:<rule>') not negative.
// Gates at display time: ZAD not halal -> removed; unknown halal -> shown with "check ZAD first"; lottery-like, an offering filing in
// 30 days or a tested warning filing -> removed; a stock you hold -> skipped. Each shown line is logged once in the tier-2 ledger.
const CHAIN_RULES = ['CHAIN-MOM1', 'CHAIN-DEMAND1', 'CHAIN-LAG1', 'CHAIN-READ1'];
const CHAIN_NAMES = { 'CHAIN-MOM1': 'hot layer of an active chain', 'CHAIN-DEMAND1': 'demand signal at the source', 'CHAIN-LAG1': 'one layer leads another', 'CHAIN-READ1': 'earnings read-through' };
function chainTier(rule) { const C = readJson0('data/chain-today.json'), v = C && C.rules && C.rules[rule];
  if (v === 'PROVEN') return 'proven'; if (v !== 'TRADABLE SMALL' || !TIER2_ON() || tier2LedgerNegative('chain:' + rule)) return null; return 'small'; }
const chainLayerName = (k) => String(k || '').replace('|', ' > ');
function chainLines(sig, pos) { const C = readJson0('data/chain-today.json'); if (!C || !Array.isArray(C.buys) || !C.buys.length) return [];
  const tiers = Object.fromEntries(CHAIN_RULES.map(r => [r, chainTier(r)])); if (!CHAIN_RULES.some(r => tiers[r])) return [];
  const after = (sig && sig.session) || ny(Date.now()).d, next = (C.sessions || []).find(d => d > after); if (!next) return [];
  const Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), lot = (sig && sig.lottery) || {}, held = new Set(Object.keys(pos || {})), last = {}; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
  const rows = [], seen = new Set();
  for (const b of C.buys) { if (!b || !b.sym || !tiers[b.rule] || b.buy !== next || seen.has(b.sym) || held.has(b.sym)) continue;
    const hal = bad.has(b.sym) || b.halal === 'fail' || myHalal(b.sym) === 'fail' ? 'fail' : myHalal(b.sym) === 'ok' || b.halal === 'ok' ? 'ok' : 'unknown';
    if (hal === 'fail' || lot[b.sym] >= 0.15 || followOffering(b.sym) || eventWarn(b.sym)) continue; seen.add(b.sym);
    const px = last[b.sym] || b.lastClose; tier2Log(b.sym, 'chain:' + b.rule, px);
    rows.push('- BUY ' + b.sym + ' at the open on ' + next + (px ? ', up to ' + money(px * 1.03) + ' (3% above the last close ' + money(px) + ')' : '') + '. ' + (b.stopPct ? 'STOP ' + Math.round(b.stopPct * 100) + '% under your buy' : 'STOP 15% under your buy (safety stop; the test held without one)') + ' at your broker. SELL at the close on ' + b.sell + '. ' + CHAIN_NAMES[b.rule] + ' (' + b.rule + ', ' + (tiers[b.rule] === 'proven' ? 'PROVEN' : 'tier 2') + '): ' + chainLayerName(b.chainLayer) + '; ' + b.event + (b.source ? ' (' + b.source + ')' : '') + '.' + (hal === 'ok' ? '' : ' Halal not checked: check ZAD first.') + ' Send  bought ' + b.sym + ' PRICE .');
    if (rows.length >= 5) break; }
  if (!rows.length) return [];
  const proven = CHAIN_RULES.filter(r => tiers[r] === 'proven').length, small = CHAIN_RULES.filter(r => tiers[r] === 'small').length;
  return [(small ? 'CHAIN (tier 2, TRADABLE SMALL: passed its own pre-registered 5-year test in both halves after the higher cost, below the 4.0 proof bar; 1,000 USD each, switched off if its live record turns negative' + (proven ? '; PROVEN rules marked' : '') + '):' : 'CHAIN (PROVEN):'), ...rows]; }
function chainsText() { const C = readJson0('data/chain-today.json');
  if (!C) return 'CHAINS: the chain decoder runs with the Sunday studies (chain-decoder). Ask again after it runs.';
  const row = (x) => '- ' + chainLayerName(x.layer) + ': ' + pcs(x.excess) + ' vs the S&P 500 in 3 months (' + x.n + ' stocks)', qual = CHAIN_RULES.some(chainTier), v = C.verdicts || {};
  return ['CHAINS (value chains by layer, members counted from the first SEC filing that shows them in that business; as of ' + C.lastClose + ')', '',
    'HOT NOW (3-month return of the layer’s members minus the S&P 500, ' + pcs(C.spy63) + '):', ...(C.hot || []).slice(0, 8).map(row), '', 'COLDEST:', ...(C.cold || []).map(row), '',
    ...((C.recentDemand || []).length ? ['DEMAND SIGNALS (last 30 sessions, big customers’ earnings 8-Ks with raised guidance or capital spending):', ...C.recentDemand.slice(-5).map(e => '- ' + e.node + ' ' + e.filed + ' (' + e.kind + '): ' + String(e.text || '').slice(0, 120)), ''] : []),
    'DECODER VERDICTS (pre-registered 23 Oct 2026, judged once):', ...CHAIN_RULES.map(r => '- ' + r + ' (' + CHAIN_NAMES[r] + '): ' + (v[r] || 'not run')),
    '', qual ? 'A rule qualified: its buys appear in ACTIONS under CHAIN on their buy day.' : 'INFORMATION ONLY: no chain rule passed its test, so a hot layer here is context, not a buy.', 'Send  check SYM  to see a stock’s chain and layer.'].join('\n'); }
function chainGraphLine(sym) { const C = readJson0('data/chain-today.json'), m = C && C.members && C.members[sym]; if (!m || !m.length) return null;
  const hot = new Map(((C && C.hot) || []).map((x, k) => [x.layer, k + 1]));
  return 'Chains (point-in-time graph): ' + m.map(x => x.chain + ', layer ' + (x.li + 1) + ' of ' + x.of + ': ' + x.layer + (x.status === 'today-only' ? ' (today only: no dated SEC filing shows it there yet)' : x.since ? ' (since ' + x.since + ')' : '') + (hot.has(x.chain + '|' + x.layer) ? ', HOT #' + hot.get(x.chain + '|' + x.layer) : '')).join(' | ') + '. Send  chains  for the hot layers.'; }
// DISCOVERED (owner, 23 Oct 2026: "come up with new paths by itself"; discovery2.mjs). data/discovery2-today.json is written weekly: the
// signals at the last close of rules the system found on 2021-2023 and tested once on 2024-2026. A buy is shown ONLY for a rule whose
// frozen verdict is TRADABLE SMALL with the tier2 switch on and its own ledger ('discovery:<id>') not negative. Same display gates as CHAIN.
function discoveryLines(sig, pos) { if (!TIER2_ON()) return []; const C = readJson0('data/discovery2-today.json'); if (!C || !Array.isArray(C.buys) || !C.buys.length) return [];
  const on = (r) => C.rules && C.rules[r] === 'TRADABLE SMALL' && !tier2LedgerNegative('discovery:' + r);
  const after = (sig && sig.session) || ny(Date.now()).d, next = (C.sessions || []).find(d => d > after); if (!next) return [];
  const Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), lot = (sig && sig.lottery) || {}, held = new Set(Object.keys(pos || {})), last = {}; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
  const rows = [], seen = new Set();
  for (const b of C.buys) { if (!b || !b.sym || !on(b.rule) || b.buy !== next || seen.has(b.sym) || held.has(b.sym)) continue;
    const hal = bad.has(b.sym) || b.halal === 'fail' || myHalal(b.sym) === 'fail' ? 'fail' : myHalal(b.sym) === 'ok' || b.halal === 'ok' ? 'ok' : 'unknown';
    if (hal === 'fail' || lot[b.sym] >= 0.15 || followOffering(b.sym) || eventWarn(b.sym)) continue; seen.add(b.sym);
    const px = last[b.sym] || b.lastClose; tier2Log(b.sym, 'discovery:' + b.rule, px);
    rows.push('- BUY ' + b.sym + ' at the open on ' + next + (px ? ', up to ' + money(px * 1.03) + ' (3% above the last close ' + money(px) + ')' : '') + '. STOP ' + Math.round((b.stopPct || 0.15) * 100) + '% under your buy at your broker. SELL at the close on ' + b.sell + ' (hold ' + b.hold + ' sessions). Rule ' + b.rule + ': ' + b.combo + '.' + (hal === 'ok' ? '' : ' Halal not checked: check ZAD first.') + ' Send  bought ' + b.sym + ' PRICE .');
    if (rows.length >= 5) break; }
  return rows.length ? ['DISCOVERED (tier 2, TRADABLE SMALL: a rule the system found on 2021-2023 and passed its one test on 2024-2026 after the higher cost, below the 4.0 proof bar; 1,000 USD each, switched off if its live record turns negative):', ...rows] : []; }
// SUPPLY-CHAIN result (Agent C, 22 Oct): it has no luck test and no costs, so a PROMISING there is information only, never a pass.
const linkVerdict = (k) => k && /PROMISING|BETTER/.test(k.verdict || '') && typeof k.t !== 'number' ? 'INFORMATION ONLY (no luck test, no costs; not a buy rule)' : (k && k.verdict) || 'not run';
function switchPaperLine() { const S = readJson0('data/switch-paper.json'); if (!S) return 'Live paper check: starts with the next nightly scan.'; const D = S.done || [];
  if (!D.length) return 'Live paper check: ' + (S.open || []).length + ' cases running, first results after 60 sessions (about 3 months).';
  const a = D.reduce((t, x) => t + x.adv, 0) / D.length, b = D.filter(x => x.adv > 0).length / D.length;
  return 'Live paper check: ' + D.length + ' finished cases, selling and buying back ' + pcs(a) + ' vs holding on average, better ' + Math.round(b * 100) + '% of the time (' + (S.open || []).length + ' still running).'; }
function qualityText() { const Q = readJson0('data/quality.json'); if (!Q || Q.status !== 'OK') return 'QUALITY COMPANIES (long investing): the study runs on Sunday with the other studies. Ask again after Sunday.';
  const HL = HALALM(), z = readJson0('data/zad-list.json'), bad = new Set((z && z.notHalal) || []);
  return ['QUALITY COMPANIES: long investing by the SEC reports (' + Q.from + ' to ' + Q.to + ', ' + Q.months + ' monthly portfolios)', '',
    ...Object.values(Q.results).map(r => '- ' + r.name + ', ' + r.months + ' months: ' + r.verdict + (r.results.newer.n ? ' (' + pcs(r.results.newer.avg) + ' vs average stock ' + pcs(r.results.newer.ctrl) + ', S&P 500 ' + pcs(r.results.newer.spy) + ')' : '')),
    '', 'TOP QUALITY NOW (profit on assets, no new shares, lean growth, cash-backed profit):', ...Q.today.filter(x => !bad.has(x.sym)).slice(0, 15).map(x => '- ' + x.sym + (HL[x.sym] && HL[x.sym].s === 'ok' ? ' (halal per ZAD)' : '') + ': gross profit ' + Math.round((x.profit || 0) * 100) + '% of assets, shares ' + pcs(x.dilute || 0) + ' in a year'),
    '', Object.values(Q.results).some(r => r.verdict === 'PROMISING') ? 'A version passed: it goes to paper first, then into ACTIONS.' : 'No version passed yet: this list is research, not a buy list.', 'Check ZAD before anything. Research only.'].join('\n'); }
function autolabText() { const AL = readJson0('data/autolab.json'); if (!AL || AL.status !== 'OK') return 'AUTOLAB: the system starts inventing and testing its own rules on Sunday (60 a week).';
  const t = Object.values(AL.tried), c = Object.values(AL.candidates || {}), cnt = (v) => t.filter(x => x.verdict === v).length;
  return ['AUTOLAB: rules the system invents itself (' + AL.weeks + ' week' + (AL.weeks === 1 ? '' : 's') + ', ' + t.length + ' rules tried, luck bar now t ' + AL.last.bar + ')', '',
    'Failed: discovery ' + cnt('FAILED DISCOVERY') + ', validation ' + cnt('FAILED VALIDATION') + ', untouched vault ' + cnt('FAILED VAULT') + ', live paper ' + cnt('FAILED LIVE') + '.', '',
    ...(c.length ? ['LIVE CANDIDATES:', ...c.map(x => '- ' + x.name + ': ' + x.status + (x.stability ? ' [' + x.stability + (x.loses && x.loses.length ? ', loses in ' + x.loses.join(', ') : '') + ']' : '') + (x.paper && x.paper.n ? ' (' + x.paper.n + ' paper trades, ' + pcs(x.paper.avg) + ' a trade, ' + pcs(x.paper.vsAvg || 0) + ' vs an average stock)' : '') + (x.today && x.today.length ? '. This week: ' + x.today.slice(0, 8).join(', ') : ''))] : ['No rule has survived all three gates yet. That is normal: most invented rules are luck, and the gates are built to catch that.']),
    '', 'Only PROVEN LIVE rules (30+ paper trades, profitable, better than an average stock) appear in your ACTIONS. Check ZAD. Research only.'].join('\n'); }
// OPPORTUNITY BOARD: everything worth knowing today, wider than the tested buys, each with an honest evidence label.
//   [TESTED] passed its 5-year test   [EARLY] promising, too few trades yet   [PAPER] on live paper   [INFO] no test supports buying it
function opportunitiesText(sig, short) { const N = short ? 3 : 8, out = [], m0 = (x) => money(x).replace(/\.00$/, ''), Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), mine = loadPos(), skip = (s0) => bad.has(s0) || mine[s0];
  // 1. what moved today (the whole market, from the live watcher)
  { const G = readJson0('data/ignition-live.json'), mv = G && G.missed ? G.missed.filter(x => x.code !== 'UNDER_1_USD' && !/^[A-Z]{4}[WUR]$/.test(x.sym) && x.maxUp >= 0.15 && x.maxUp < 20 && !skip(x.sym)).slice(0, N) : [];
    if (mv.length) out.push('MOVED TODAY [INFO] (' + G.day + ', 1 USD+ stocks up 15%+ at their high):', ...mv.map(x => '- ' + x.sym + ' up to +' + Math.round(x.maxUp * 100) + '%' + (x.afterFirstSeen ? ', ' + (x.afterFirstSeen.last >= 0 ? 'held' : 'faded') + ' after it showed' : '') + (x.preMarketVolX ? ', pre-market volume ' + x.preMarketVolX.toFixed(1) + 'x' : '')),
      '  ' + (moverEvidence().replace(/^\n/, '').slice(0, 220) || 'Buying after a big jump has not passed a test yet.'), ''); }
  // 2. early-wave radar (rules on paper)
  { const R = readJson0('data/intraday-radar.json'), rc = R && R.candidates ? R.candidates.filter(x => x.levels && /REVIEW|WATCH/.test(x.verdict || '') && !skip(x.sym)).slice(0, N) : [];
    const rLose = (() => { const g = (readJson0('data/radar-record.json') || {}).groups || {}; return Object.values(g).filter(x => x.n >= 20 && x.avg < 0).length > 0; })();
    if (rc.length) out.push('EARLY-WAVE RADAR [PAPER] (' + R.session + ')' + (rLose ? ': LIVE RECORD LOSING, do not buy these, watch only' : '') + ':', ...rc.map(x => '- ' + x.sym + ': ' + String(x.stage || '').replace(/_/g, ' ').toLowerCase() + ', entry ' + m0(x.levels.lo) + '-' + m0(x.levels.hi) + ', stop ' + m0(x.levels.stop) + (x.catalyst && x.catalyst.headline ? ' | news: ' + String(x.catalyst.headline).slice(0, 60) : '')), ''); }
  // 3. leaders (the only whole-market rule provisionally promising)
  { const L = ((sig && sig.leaders) || []).filter(x => !skip(x.sym)).slice(0, N);
    if (L.length) out.push('LEADERS [EARLY] (strongest stocks; provisionally promising on 5 years):', ...L.map(x => '- ' + x.sym + ' ' + m0(x.last) + ': buy ' + m0(x.buyLo) + '-' + m0(x.buyHi) + ', stop ' + m0(x.stop) + (x.earnDays !== undefined && x.earnDays <= 21 ? ' (earnings in ' + x.earnDays + 'd)' : '')), ''); }
  // 4. quick setups held back for too few trades
  { const H = ((sig && sig.quickHeld) || []).filter(x => !skip(x.sym)).slice(0, N), Q = new Map(((sig && sig.quick) || []).map(x => [x.sym, x]));
    if (H.length) out.push('QUICK SETUPS [EARLY] (passed, but under 30 tested trades):', ...H.map(x => { const q = Q.get(x.sym); return '- ' + x.sym + (q && q.buyLo ? ': ' + m0(q.buyLo) + '-' + m0(q.buyHi) + ', stop ' + m0(q.stop) + (q.win ? ', ' + Math.round(q.win * 100) + '% won over ' + q.n : '') : ': send  check ' + x.sym + '  for its range'); }), ''); }
  // 5. strong companies by their reports (discovery)
  { const DC = readJson0('data/discovery.json'), dc = DC && DC.candidates ? DC.candidates.filter(x => !skip(x.sym)).slice(0, N) : [];
    if (dc.length) out.push('STRONG COMPANIES [INFO] (growth + momentum from their reports):', ...dc.map(x => '- ' + x.sym + ' ' + m0(x.price) + ': ' + (x.revGrowth !== undefined ? 'revenue ' + pcs(x.revGrowth) : '') + (x.profitTrend ? ', ' + x.profitTrend : '') + (x.mom6 !== undefined ? ', 6 months ' + pcs(x.mom6) : '')), ''); }
  // 6. quality and autolab (after Sunday)
  { const Q = readJson0('data/quality.json'), q = Q && Q.status === 'OK' ? Q.today.filter(x => !skip(x.sym)).slice(0, N) : [], pass = Q && Q.results && Object.entries(Q.results).some(([k, r]) => /^QUALITY_/.test(k) && r.verdict === 'PROMISING');
    if (q.length) out.push('TOP QUALITY COMPANIES [' + (pass ? 'TESTED on history, paper next' : 'INFO') + ']: ' + q.map(x => x.sym).join(', '), ''); }
  { const AL = readJson0('data/autolab.json'), c = AL && AL.candidates ? Object.values(AL.candidates).filter(x => x.today && x.today.length) : [];
    if (c.length) out.push('AUTOLAB [PAPER] (rules the system invented, passed 3 gates):', ...c.slice(0, N).map(x => '- ' + x.name + ': ' + x.today.filter(s0 => !skip(s0)).slice(0, 5).join(', ')), ''); }
  if (!out.length) return short ? '' : 'OPPORTUNITIES: nothing extra today beyond the BUY list.';
  return ['OPPORTUNITIES BEYOND THE TESTED BUYS (you decide; the label says how much evidence is behind each)', '', ...out, '[TESTED] passed its test | [EARLY] promising, too few trades | [PAPER] being proven live | [INFO] interesting, no test supports buying it. Check ZAD; use a stop on anything you buy.' + (short ? ' Full board: send  opportunities' : '')].join('\n'); }
// MISSED RUNNERS: why the 15%+ movers of the last weeks were not caught, grouped by cause, and what would fix the biggest cause.
// SCORECARD: two separate report cards, future days only (no back-test numbers here).
//   A. MAKING MONEY: every engine's paper/real record after costs, against the market on the same days.
//   B. FINDING OPPORTUNITIES: how many fast runners were seen in time, and why the rest were missed.
// A system can get better at finding runners while losing money on its entries, so the two are never mixed.
let SC_ROWS = [];
function scorecardText() { const A = [], av = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; SC_ROWS = [];
  const verdict = (n, avg, bench, days, stocks) => { const ex = bench === null || bench === undefined ? avg : avg - bench; if (!n || avg === null) return 'no finished trades yet'; if (n < 10) return 'too early (' + n + ')';
    if (avg < 0 && ex < 0) return n >= 20 ? 'LOSING: do not act on these' : 'losing so far'; if (avg > 0 && ex > 0 && typeof days === 'number' && days < 10) return 'positive, but all from ' + days + ' trading day' + (days === 1 ? '' : 's') + ': not evidence yet (10+ days needed)'; if (avg > 0 && ex > 0 && typeof stocks === 'number' && stocks < 20) return 'positive, but on only ' + stocks + ' stock' + (stocks === 1 ? '' : 's') + ': not evidence yet (20+ needed; 22 Oct)'; if (avg > 0 && ex > 0) return n >= 30 ? 'POSITIVE so far (one market period only; not proof yet)' : 'positive so far, too few'; return 'mixed: no edge shown'; };
  const row = (name, n, win, avg, bench, extra, days, stocks) => { SC_ROWS.push({ engine: name, n: n || 0, win: typeof win === 'number' && isFinite(win) ? +win.toFixed(3) : null, avg: typeof avg === 'number' && isFinite(avg) ? +avg.toFixed(4) : null, days: typeof days === 'number' ? days : null, stocks: typeof stocks === 'number' ? stocks : null, verdict: verdict(n, avg, bench, days, stocks) }); return A.push('- ' + name + ': ' + (n ? n + ' finished, ' + (win === null || win === undefined || !isFinite(win) ? '' : Math.round(win * 100) + '% won, ') + 'average ' + pcs(avg) + (bench !== null && bench !== undefined ? ' vs S&P ' + pcs(bench) : '') + (extra ? ' ' + extra : '') + ' => ' : '') + verdict(n, avg, bench, days, stocks)); };
  const sg = readJson0('data/signals.json') || {}, q = sg.quickRecord; if (q) row('Quick trades (ACTIONS)', q.n, q.winRate, q.avgPct, q.avgSpy, sg.quickPaused ? '(paused by the system)' : '', q.days, q.stocks);
  const oc = readJson0('data/outcomes.json'); if (oc && oc.horizons) { const h = oc.horizons['3'] || oc.horizons['1']; row('Swing buys (ACTIONS), 3 days after the signal', h ? h.n : 0, oc.winRate, h ? h.avgReturn : null, h ? h.avgBenchmark : null, typeof oc.avgR === 'number' ? '(finished trades: ' + oc.finished + ', average ' + oc.avgR.toFixed(2) + 'R)' : ''); }
  const rr = readJson0('data/radar-record.json'); if (rr && rr.groups) for (const g of Object.values(rr.groups)) if (g.n) row('Early-wave radar, ' + g.name, g.n, g.win, g.avg, null);
  const ir = readJson0('data/ignition-results.json'); if (ir && ir.done) { const by = {}; for (const v of Object.values(ir.done)) if (typeof v.close === 'number') (by[v.rule] = by[v.rule] || []).push(v); for (const [k, a] of Object.entries(by)) row('Fast alerts rule ' + k + ' (paper, at the alert price, sold at the close)', a.length, a.filter(x => x.close > 0).length / a.length, av(a.map(x => x.close)), null, '(' + pcs(av(a.map(x => x.close_s))) + ' at 1.5x costs, ' + new Set(a.map(x => x.d)).size + ' day(s), ' + new Set(a.map(x => x.sym)).size + ' stocks)', new Set(a.map(x => x.d)).size, new Set(a.map(x => x.sym)).size); }
  { const AP = readJson0(ALP_FILE); if (AP && Array.isArray(AP.closed)) { const by = {}; for (const t of AP.closed) if (typeof t.net === 'number') (by[t.engine || t.kind] = by[t.engine || t.kind] || []).push(t);
    for (const [k, a] of Object.entries(by)) row('Alpaca paper, ' + k + ' (filled at the open, after fees)', a.length, a.filter(x => x.net > 0).length / a.length, av(a.map(x => x.net)), null, '(' + new Set(a.map(x => x.out)).size + ' exit day(s), ' + new Set(a.map(x => x.sym)).size + ' stocks)', new Set(a.map(x => x.out)).size, new Set(a.map(x => x.sym)).size); } }
  // tier2 off = exactly as before tier 2: its ledger rows are not shown and not counted (review S-14, 22 Oct)
  if (TIER2_ON()) { let T2 = []; try { T2 = fs.readFileSync('data/tier2-ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {} const by = {}; for (const r of T2) if (typeof r.pct === 'number') (by[r.kind] = by[r.kind] || []).push(r);
    for (const [k, a] of Object.entries(by)) row('TRADABLE SMALL ledger, ' + k + ' (30 days after each instruction, after costs)', a.length, a.filter(x => x.pct > 0).length / a.length, av(a.map(x => x.pct)), null, '(' + new Set(a.map(x => x.d)).size + ' day(s), ' + new Set(a.map(x => x.sym)).size + ' stocks; ' + T2.filter(r => r.kind === k && typeof r.pct !== 'number').length + ' still open)', new Set(a.map(x => x.d)).size, new Set(a.map(x => x.sym)).size); }
  const AL = readJson0('data/autolab.json'); if (AL && AL.candidates) for (const c of Object.values(AL.candidates)) if (c.paper) row('Autolab: ' + c.name, c.paper.n, c.paper.win, c.paper.avg, null, typeof c.paper.vsAvg === 'number' ? '(' + pcs(c.paper.vsAvg) + ' vs an average stock)' : '');
  const oct = readJson0('data/octopus-paper.json'); if (oct && oct.record) row('Octopus score top picks (rejected idea, kept on paper)', oct.record.n, oct.record.win, oct.record.avg, null);
  let mt = []; try { mt = fs.readFileSync(MY_TRADES, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) {}
  const own = mt.filter(t => (t.kind || 'manual') === 'manual'), sys = mt.filter(t => (t.kind || 'manual') !== 'manual');
  const disc = (a) => { const k = a.filter(t => t.sysSell !== undefined); return k.length ? '(' + k.filter(t => t.sysSell).length + ' of ' + k.length + ' sold after the system said SELL)' : ''; };
  if (sys.length) row('YOUR REAL trades on system picks', sys.length, sys.filter(t => t.pct > 0).length / sys.length, av(sys.map(t => t.pct)), null, disc(sys)); if (own.length) row('YOUR REAL trades on your own picks', own.length, own.filter(t => t.pct > 0).length / own.length, av(own.map(t => t.pct)), null, disc(own));
  // OPEN, MARKED TO MARKET (22 Oct): not verdicts, but the unfinished results are shown, not hidden behind "open"
  try { const SG = readJson0('data/signals.json'), lastPx = {}; for (const x of (SG && SG.stocks) || []) if (x.last) lastPx[x.sym] = x.last;
    const LD = readJson0('data/leaders.json'), lp = ((LD && LD.paper) || []).filter(x => x.entry > 0 && lastPx[x.sym] > 0); if (lp.length) { const r = lp.map(x => lastPx[x.sym] / x.entry - 1); A.push('- Leaders list (T1), ' + lp.length + ' open paper positions marked to market: average ' + pcs(av(r)) + ' before costs, ' + r.filter(x => x > 0).length + ' up (scored by the league at 1 and 3 months; not a verdict)'); }
    const SW = readJson0('data/switch-paper.json'), so = ((SW && SW.open) || []).filter(x => x.ref > 0 && lastPx[x.sym] > 0); if (so.length) { const r = so.map(x => lastPx[x.sym] / x.ref - 1), back = r.filter(x => x <= -0.10).length, away = r.filter(x => x > 0.05).length; A.push('- Switch, ' + so.length + ' open: since the sell signal the stocks moved ' + pcs(av(r)) + ' on average; ' + back + ' reached the buy-back level (10% lower), ' + away + ' ran away 5%+ (a missed rise counts against the switch; not a verdict until round trips finish)'); } } catch (e) {}
  // B. finding
  let L = []; try { L = fs.readFileSync('data/ignition-days.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x)).slice(-20); } catch (e) {}
  const B = []; if (L.length) { let n = 0, caught = 0, data = 0, gap = 0, alerts = 0; for (const d of L) { alerts += d.alerts || 0; for (const [k, v] of Object.entries(d.tally || {})) { n += v; if (/^CAUGHT/.test(k) && !/NOT/.test(k)) caught += v; if (/NOT_VISIBLE|NO_LIVE|TOO_LATE|VOLUME_FIGURE_LATE/.test(k)) data += v; if (k === 'GAPPED_AT_OPEN') gap += v; } }
    const sec = L.reduce((a, d) => a + ((d.tally || {}).SEC_CHECK_UNAVAILABLE || 0), 0); if (sec) B.push('- ' + sec + ' blocked only because the SEC safety check could not be reached (a fault, being fixed; not a market reason).');
    B.push('- ' + n + ' stocks ran 15%+ in ' + L.length + ' session' + (L.length === 1 ? '' : 's') + '; caught in time: ' + caught + ' (' + (n ? Math.round(caught / n * 100) : 0) + '%). Missed for late data: ' + data + ', already gapped at the open: ' + gap + '.', '- Alerts sent: ' + alerts + '. Whether those alerts made money is in card A (fast alerts rows).'); }
  else B.push('- The daily history starts with the next fast-mover session.');
  return ['SCORECARD (future days only, after costs; back-tests are NOT counted here)', '', 'A. MAKING MONEY', ...(A.length ? A : ['- No finished paper trades yet.']), '',
    'B. FINDING OPPORTUNITIES', ...B, '',
    'Rules: a "POSITIVE" record from one market period is not proof. A rule that is changed starts a new record; it never keeps the old one. LOSING engines stay visible, they are not hidden. Research only.'].join('\n'); }
// ENGINE HISTORY (22 Oct): one line a day per engine in data/engine-history.jsonl, so the trajectory is kept, not only tonight's snapshot.
function engineHistorySnapshot() { try { scorecardText(); const d = new Date().toISOString().slice(0, 10), f = 'data/engine-history.jsonl'; let have = false; try { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); have = L.length > 0 && JSON.parse(L[L.length - 1]).d === d; } catch (e) {}
  if (!have && SC_ROWS.length) fs.appendFileSync(f, SC_ROWS.map(r => JSON.stringify({ d, ...r })).join('\n') + '\n'); } catch (e) {} }
// AVOID LEDGER (22 Oct): every stock the ACTIONS page told you to avoid is logged with its price; 10 sessions later its move is filled in, so
// the avoid rules are judged on future days too (were they right, or too strict?). Shown in  progress .
function avoidLedger(items, last) { const f = 'data/avoid-ledger.jsonl', d = new Date().toISOString().slice(0, 10); let L = []; try { L = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {}
  let changed = false; for (const r of L) if (!r.out && Date.now() - Date.parse(r.d) >= 14 * 864e5 && last[r.sym] > 0) { r.out = d; r.px1 = last[r.sym]; r.pct = +(r.px1 / r.px - 1).toFixed(4); changed = true; }
  for (const it of items) if (last[it.sym] > 0 && !L.some(r => r.sym === it.sym && Date.now() - Date.parse(r.d) < 20 * 864e5)) { L.push({ d, sym: it.sym, why: it.why, px: last[it.sym] }); changed = true; }
  if (changed) try { fs.writeFileSync(f, L.slice(-2000).map(x => JSON.stringify(x)).join('\n') + '\n'); } catch (e) {}
  const done = L.filter(r => typeof r.pct === 'number'); if (!done.length) return 'AVOIDED STOCKS: ' + L.length + ' logged; their 10-session moves are filled in as they come.';
  const avg = done.reduce((a, r) => a + r.pct, 0) / done.length, byWhy = {}; for (const r of done) (byWhy[r.why] = byWhy[r.why] || []).push(r.pct);
  return 'AVOIDED STOCKS, 10 sessions later: ' + done.length + ' resolved, average ' + pcs(avg) + (Object.keys(byWhy).length > 1 ? ' (' + Object.entries(byWhy).map(([k, a]) => k + ' ' + pcs(a.reduce((x, y) => x + y, 0) / a.length) + ' on ' + a.length).join('; ') + ')' : '') + '. ' + (avg < 0 ? 'The avoid rules were right so far.' : 'Avoided stocks did fine so far: watch whether the rules are too strict (no change before 100 resolved).'); }
// WEEKLY SCOREBOARD (22 Oct): you vs the system vs the S&P 500, this week and the last 90 days; the one number that says whether trading beats the index.
// SELL DISCIPLINE (23 Oct): the owner's biggest measured leak. A sale more than 1% under its stop counts as late; its cost is the gap
// between the actual result and the stop's result. Shown every Sunday.
function sellDiscipline(trades) {
  const w = (trades || []).filter(t => t && t.stop > 0 && t.entry > 0 && t.exit > 0), late = w.filter(t => t.exit < t.stop * 0.99);
  const cost = late.reduce((a, t) => a + ((t.stop / t.entry - 1) - (t.exit / t.entry - 1)), 0);
  if (!w.length) return { withStop: 0, late: 0, cost: 0, line: '' };
  const line = 'SELL DISCIPLINE: ' + late.length + ' of ' + w.length + ' sales with a stop were made late (more than 1% under the stop)' + (late.length ? ': ' + late.map(t => t.sym).join(', ') + '. Selling at the stop would have saved about ' + Math.round(cost * 100) + ' points (about ' + Math.round(cost * 1000) + ' USD at 1,000 USD a trade). Keep every stop as a real order at your broker.' : '. Well done: every stop was respected.');
  return { withStop: w.length, late: late.length, cost, line };
}
function scoreboardText() { const now = Date.now(), d7 = new Date(now - 7 * 864e5).toISOString().slice(0, 10), d90 = new Date(now - 90 * 864e5).toISOString().slice(0, 10), av = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  let mt = []; try { mt = fs.readFileSync(MY_TRADES, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(t => typeof t.pct === 'number' && t.out); } catch (e) {}
  const you = (since) => mt.filter(t => String(t.out).slice(0, 10) >= since).map(t => t.pct);   // stored after costs already
  let H = []; try { H = fs.readFileSync('data/engine-history.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x)); } catch (e) {}
  const lastRow = (eng) => H.filter(r => r.engine === eng).slice(-1)[0], firstRow = (eng, since) => H.filter(r => r.engine === eng && r.d >= since)[0];
  const engines = [...new Set(H.map(r => r.engine))].filter(e => !/YOUR REAL/.test(e)), sysLines = [];
  for (const e of engines) { const a = lastRow(e), b = firstRow(e, d7); if (a && b && a.n > b.n && a.avg !== null) sysLines.push(e.replace(/ \(.*?\)/g, '') + ': +' + (a.n - b.n) + ' trades this week, running average ' + pcs(a.avg) + ' (' + a.verdict + ')'); }
  let spy7 = null, spy90 = null; try { let sp = spyDaily && spyDaily.candles ? spyDaily.candles.map(c => c.c) : null; if (sp && sp.length > 70) fs.writeFileSync('data/spy-closes.json', JSON.stringify(sp.slice(-300))); else sp = readJson0('data/spy-closes.json'); if (sp && sp.length > 70) { spy7 = sp[sp.length - 1] / sp[sp.length - 6] - 1; spy90 = sp[sp.length - 1] / sp[sp.length - 64] - 1; } } catch (e) {}
  const y7 = you(d7), y90 = you(d90), line = (lab, a) => lab + ': ' + (a.length ? a.length + ' sales, ' + a.filter(x => x > 0).length + ' won, average ' + pcs(av(a)) + ' after costs' : 'no sales');
  const L = ['SCOREBOARD (week to ' + new Date(now).toISOString().slice(0, 10) + ')', line('Your real trades this week', y7), 'S&P 500 this week: ' + (spy7 === null ? 'n/a' : pcs(spy7)), 'System paper engines this week: ' + (sysLines.length ? '' : 'no engine added finished trades'), ...sysLines.map(x => '- ' + x), '',
    'Last 90 days: ' + line('you', y90) + (spy90 === null ? '' : '; S&P 500 ' + pcs(spy90) + ' over the same period') + '.',
    y90.length >= 10 && spy90 !== null ? (y90.reduce((a, b) => a + b, 0) < spy90 ? 'DECISION: your trading is behind the index over 90 days. The index fund (check ZAD) is the better use of new money until the record turns.' : 'Your trading is ahead of the index over 90 days; the ladder decides size, not this line.') : 'DECISION: fewer than 10 sales in 90 days: too early to judge you against the index.'];
  // THE OWNER'S WRITTEN 90-DAY DECISION (22 Oct): set once by  decision TEXT ; shown every Sunday with the days left, never changed by the system
  { const DC = (readJson0('data/settings.json') || {}).decision; if (DC && DC.text) { const left = Math.ceil((Date.parse(DC.due) - now) / 864e5); L.push('', 'YOUR DECISION (written ' + DC.set + ', due ' + DC.due + (left > 0 ? ', ' + left + ' days left' : ', DUE NOW: act on it') + '): ' + DC.text); } }
  // THIS WEEK (outside reviews, 22 Oct): what changed in 7 days, and how far each engine is from a verdict at its current pace
  try { const W = ['', 'THIS WEEK'], lastOf = (e, f) => H.filter(r => r.engine === e && f(r.d)).slice(-1)[0];
    for (const e of engines) { const a = lastOf(e, () => true), b = lastOf(e, d => d <= d7); if (!a) continue; const dd = b ? (a.days || 0) - (b.days || 0) : null, dn = b ? a.n - b.n : null;
      const need = a.days !== null && a.days < 10 ? 10 - a.days : 0, eta = need && dd > 0 ? ' about ' + Math.ceil(need / dd) + ' week(s) to a verdict at this pace' : need ? ' no new days this week' : '';
      if (dn || need) W.push('- ' + e.replace(/ \(.*?\)/g, '') + ': ' + (dn !== null ? (dn >= 0 ? '+' : '') + dn + ' trades this week, ' : '') + 'average ' + pcs(a.avg) + (b && b.avg !== null && a.avg !== null ? ' (was ' + pcs(b.avg) + ')' : '') + (need ? '; ' + a.days + ' of 10 distinct days,' + eta : '') + '.'); }
    const LB = readJson0('data/strategy-library.json'), lt = ((LB && LB.strategies) || []).filter(x => x.tested && x.tested >= d7); if (lt.length) { const c = {}; for (const x of lt) { const k = /tradable small/i.test(x.status) ? 'TRADABLE SMALL' : /passed|proven/i.test(x.status) && !/not proven/i.test(x.status) ? 'passed' : /reject|FAILED/i.test(x.status) ? 'rejected' : /not proven|too few|needs data/i.test(x.status) ? 'not proven / needs data' : 'other'; (c[k] = c[k] || []).push(x.id); } W.push('- Tested this week: ' + lt.length + ' rules: ' + Object.entries(c).map(([k, a]) => a.length + ' ' + k + (/(TRADABLE|passed)/.test(k) ? ' (' + a.join(', ') + ')' : '')).join(', ') + '.'); }
    let T2 = []; try { T2 = fs.readFileSync('data/tier2-ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {} const t2w = T2.filter(r => r.d >= d7); if (t2w.length) W.push('- TRADABLE SMALL instructions this week: ' + t2w.map(r => r.sym + ' (' + r.kind + ')').join(', ') + '.');
    if (W.length > 2) L.push(...W); } catch (e) {}
  try { const sd = sellDiscipline(mt); if (sd.line) L.push('', sd.line); } catch (e) {}
  return L.join('\n'); }
// ENGINE KIND OF A SCORECARD ROW (22 Oct): the same mapping for the LOSING block and for FOCUS. Rows of the TRADABLE SMALL ledger,
// YOUR REAL trades, autolab, radar and fast alerts belong to no buy engine kind (null).
function scRowKind(e) { e = String(e || ''); if (/^Quick trades/.test(e)) return 'quick trade'; if (/^Swing buys/.test(e)) return 'swing trade'; if (/^Octopus/.test(e)) return 'octopus';
  const m = e.match(/^Alpaca paper, (.+?) \(filled/); if (m) { const n0 = m[1].replace(/ \(outside the tested set\)/, ''); return n0 === 'quick' ? 'quick trade' : n0 === 'leader' ? 'trend trade' : n0 === 'entry' ? null : n0; } return null; }
// FOCUS PER ENGINE KIND (review S-14, 22 Oct): FOCUS was lifted for EVERY engine as soon as any row said POSITIVE (a tier-2 ledger row, an
// Alpaca row of another kind). Now it is lifted only for the kind whose OWN live record is POSITIVE under the full live bar (30+ trades,
// 10+ distinct days, 20+ stocks; a record whose days or stocks are unknown has not shown the bar). The octopus row is a rejected idea
// kept on paper and never lifts FOCUS.
function workingKinds() { const W = new Set(); try { scorecardText(); for (const r of SC_ROWS) { if (!/^POSITIVE/.test(r.verdict || '') || !(r.n >= 30 && r.days >= 10 && r.stocks >= 20)) continue;
  const k = scRowKind(r.engine); if (k && k !== 'octopus') W.add(k); } } catch (e) { W.clear(); } return W; }
// SUNDAY SCOREBOARD (review S-2, 22 Oct): the scoreboard with the owner's 90-day decision was attached only to an ACTIONS message built on
// a UTC Sunday, and nothing builds one on Sundays. The bot's full check (every 5 minutes) now sends it once every Sunday, Kuwait time,
// from 08:00; data/tg-state.json keeps the date it was sent.
async function sundayScoreboard(now = Date.now()) { try {
  const k = new Date(now), day = k.toLocaleDateString('en-US', { timeZone: 'Asia/Kuwait', weekday: 'short' }), hr = +k.toLocaleString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', hourCycle: 'h23' }), d = k.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' });
  if (day !== 'Sun' || hr < 8 || !env.TG_TOKEN || !env.TG_CHAT) return;
  if (readJson('data/tg-state.json', { offset: 0 }).scoreboardSent === d) return;
  await telegram(scoreboardText() + '\n' + FOOT);
  const st = readJson('data/tg-state.json', { offset: 0 }); st.scoreboardSent = d; fs.writeFileSync('data/tg-state.json', JSON.stringify(st)); console.log('Sunday scoreboard sent');
} catch (e) { console.log('Sunday scoreboard failed: ' + e.message); } }
// SPY CLOSES (review S-3, 22 Oct): written by every nightly scan from the SPY candles it already loaded, so the scoreboard has the S&P 500
// figures (this week and 90 days) in every process, not only in one that happened to load SPY.
function saveSpyCloses(candles) { try { const sp = (candles || []).map(c => c && c.c).filter(x => x > 0); if (sp.length > 70) fs.writeFileSync('data/spy-closes.json', JSON.stringify(sp.slice(-300))); } catch (e) {} }
// LIVE RECORD CONCLUSIONS: the scorecard turned into plain decisions, shown automatically in every ACTIONS message (no command needed).
function liveConclusions() { let t = ''; try { t = scorecardText(); } catch (e) { return []; }
  const A = (t.split('\nB. ')[0] || '').split('\n').filter(l => /^- /.test(l) && / => /.test(l)), nm = (l) => l.slice(2, l.indexOf(':')).replace(/ \(.*?\)/g, '').replace(/, 3 days after the signal/, '').replace(/^Early-wave radar, /, 'early-wave '), stop = [], care = [], work = [];
  for (const l of A) { const v = l.split(' => ')[1]; if (/^LOSING/.test(v)) stop.push(nm(l)); else if (/^losing so far/.test(v)) care.push(nm(l)); else if (/^POSITIVE/.test(v)) work.push(nm(l)); }
  const out = ['LIVE RECORD (what really happened on future days, after costs):'];
  if (stop.length) out.push('- STOP using: ' + stop.join('; ') + '. They lost money on 20+ live trades.');
  if (care.length) out.push('- CAUTION: ' + care.join('; ') + ': losing so far. If you buy one, use half your usual amount until the record turns positive.');
  if (work.length) out.push('- WORKING so far: ' + work.join('; ') + ' (one market period only: keep amounts normal, not bigger).');
  if (out.length === 1) out.push('- Too early for every engine: no live verdict yet. Amounts stay normal.');
  out.push('- Unchanged: your stops, and selling on the tested exits.');
  return out; }
function missedText() { let L = []; try { L = fs.readFileSync('data/ignition-days.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x)).slice(-20); } catch (e) {}
  if (!L.length) return 'MISSED RUNNERS: the history starts with the next fast-mover session (one line a day).';
  const G = { DATA: ['NOT_VISIBLE_LIVE', 'NO_LIVE_PRICE_AT_SIGNAL', 'VISIBLE_TOO_LATE', 'VOLUME_FIGURE_LATE'], GAP: ['GAPPED_AT_OPEN'], RULES: ['CAUGHT_RULE_NOT_PASSED', 'CAUGHT_PAPER_GATE_NOT_MET', 'NO_RULE_FIT', 'LOW_VOLUME', 'NO_VOLUME_HISTORY', 'AFTER_11_00'], SAFETY: ['UNDER_1_USD', 'SEC_BLOCKED', 'SEC_CHECK_UNAVAILABLE', 'NOT_HALAL', 'ALERT_CAP_REACHED'], CAUGHT: ['ALERTED'] };
  const tot = {}; let n = 0; for (const d of L) for (const [k, v] of Object.entries(d.tally || {})) { tot[k] = (tot[k] || 0) + v; n += v; }
  const grp = Object.fromEntries(Object.entries(G).map(([g, ks]) => [g, ks.reduce((a, k) => a + (tot[k] || 0), 0)])), pc0 = (x) => n ? Math.round(x / n * 100) + '%' : '0%';
  const live = L.map(d => d.liveRate).filter(x => typeof x === 'number'), lr = live.length ? live.reduce((a, b) => a + b, 0) / live.length : null;
  const NAME = { DATA: 'the price was not live or came too late (data feed)', GAP: 'it was already up 10%+ at the open (gap)', RULES: 'seen in time, but no tested rule fired or passed', SAFETY: 'blocked on purpose (under 1 USD, dilution/delisting filing, not halal)', CAUGHT: 'caught and alerted' };
  const big = Object.entries(grp).filter(([g]) => g !== 'CAUGHT').sort((a, b) => b[1] - a[1])[0];
  const fix = { DATA: 'A real-time feed is the fix. Worth testing the 99 USD/month Alpaca plan side by side for 2 weeks before paying for good.', GAP: 'These moved overnight: the pre-market record (saved daily since 15 Oct) is what can catch them; its test comes after ~90 sessions.', RULES: 'The data saw them; the rules did not fire or have not passed. That is the fast-mover lab and autolab job, not a data problem: a faster feed would not help.', SAFETY: 'Blocked by design. Most of these fall back hard; keep the blocks.' };
  return ['MISSED RUNNERS: ' + n + ' stocks ran 15%+ in the last ' + L.length + ' sessions (' + L[0].day + ' to ' + L[L.length - 1].day + ')' + (lr !== null ? '; live prices for about ' + Math.round(lr * 100) + '% of stocks' : ''), '',
    ...Object.entries(grp).sort((a, b) => b[1] - a[1]).map(([g, v]) => '- ' + pc0(v) + ' ' + NAME[g] + ' (' + v + ')'), '',
    ...(() => { const fd = L.filter(d => typeof d.feedFix === 'number'); if (!fd.length) return []; const ff = fd.reduce((a, d) => a + d.feedFix, 0), gl = fd.reduce((a, d) => a + (d.feedGapLike || 0), 0), ages = fd.flatMap(d => d.feedFixAges || []).sort((a, b) => a - b);
      return ['Of the data-feed misses (' + fd.length + ' sessions measured): ' + ff + ' real-time could have helped (no big gap, price was just late' + (ages.length ? ', median ' + ages[Math.floor(ages.length / 2)] + ' min old' : '') + '), ' + gl + ' had already gapped 20%+ before the open or were up 10%+ at 9:35, which no feed can fix.',
        'Seeing more runners earlier is not the same as making money: the 2-week side-by-side test must count the net result of every extra trade, losers included, after costs.', '']; })(),
    'BIGGEST CAUSE: ' + NAME[big[0]] + '. ' + (big[0] === 'DATA' && (() => { const fd = L.filter(d => typeof d.feedFix === 'number'); return fd.length >= 5 && fd.reduce((a, d) => a + d.feedFix, 0) < fd.reduce((a, d) => a + (d.feedGapLike || 0), 0); })() ? 'But most of these had gapped before the open, which real-time cannot fix: do NOT pay for the feed on this evidence. The pre-market record is the better lead.' : fix[big[0]]), 'Details of today: send  movers . Research only.'].join('\n'); }
function experimentsText() { const rows = experimentRows(), LI = ledgerInfo();
  const N = rows.reduce((a, r) => a + r.tried, 0), cnt = (v) => rows.filter(r => r.verdict === v).length;
  const icon = (v) => /PROMISING/.test(v) ? 'PASS' : v === 'WARNING' ? 'WARN' : v === 'NOT RUN YET' ? 'WAIT' : 'FAIL';
  const by = {}; for (const r of rows) (by[r.where] = by[r.where] || []).push(r);
  return ['RESEARCH REGISTRY: every idea tested, result, versions tried', '',
    rows.length + ' ideas, ' + N + ' versions tried in total. Passed: ' + (cnt('PROMISING') + cnt('PROVISIONALLY PROMISING')) + ', warnings: ' + cnt('WARNING') + ', waiting: ' + cnt('NOT RUN YET') + ', failed: ' + (rows.length - cnt('PROMISING') - cnt('PROVISIONALLY PROMISING') - cnt('WARNING') - cnt('NOT RUN YET')) + '.',
    ...(LI ? ['Permanent ledger (never rewritten): ' + LI.ideas + ' ideas and ' + LI.ev + ' result changes logged since ' + LI.since + '.'] : []),
    'The more versions tried, the more one passes by luck. With ' + N + ' tries, about ' + Math.max(1, Math.round(N * 0.05)) + ' would "pass" by pure chance at the usual 5% bar, which is why every pass still needs the paper record before any alert.', '',
    ...Object.entries(by).flatMap(([w, a]) => [w.toUpperCase() + ':', ...a.map(r => '- ' + icon(r.verdict) + ' ' + r.name + (r.why && icon(r.verdict) !== 'PASS' ? ': ' + String(r.why).split(';')[0].slice(0, 90) : '')), '']),
    'WAITING / TO COLLECT (not forgotten):', ...PENDING.map(([a, b]) => '- ' + a + ': ' + b),
    '', 'Research only. Nothing here is a buy until it passes the paper record.'].join('\n'); }
function eventsText() { const ES = readJson0('data/events-study.json'); if (!ES || !ES.fam) return 'EVENTS: the company-news study runs every Sunday after the SEC history is collected on weekdays. Ask again after Sunday.';
  const ln = (s) => !s || !s.n ? 'no trades yet' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pcs(s.avg);
  const buy = Object.entries(ES.fam).filter(([, x]) => x.sign >= 0), warn = Object.entries(ES.fam).filter(([, x]) => x.warn), ER = readJson0('data/events-recent.json');
  const live = ((ER && ER.events) || []).filter(e => e.f.split(',').some(k => ES.fam[k] && (ES.fam[k].warn || ES.fam[k].verdict === 'PROMISING'))).slice(0, 10);
  return ['COMPANY NEWS -> WHAT THE STOCK DID NEXT (SEC filings and FDA approvals, ' + ES.stocks + ' stocks, ' + ES.events + ' events, ' + ES.from + ' to ' + ES.to + ')', '',
    'AS A BUY (news + a strong day, bought the next open; must beat stocks that jumped the same way WITHOUT the news):', ...buy.map(([, x]) => '- ' + x.name + ': ' + x.verdict + '. Newer half ' + ln(x.results.newer) + (x.results.ctrlNewer && x.results.ctrlNewer.n ? '; without the news ' + pcs(x.results.ctrlNewer.avg) : '')),
    '', 'WARNINGS (stocks lagged the market and other stocks by 1%+ over the next 20 sessions, both halves):', ...(warn.length ? warn.map(([, x]) => '- ' + x.name + ': ' + pcs(x.drift.newer.vs) + ' vs other stocks (' + x.drift.newer.n + ' cases)') : ['- none proven']),
    ...(live.length ? ['', 'LAST 10 DAYS (only kinds that passed or warn):', ...live.map(e => '- ' + e.sym + ' ' + e.p.slice(0, 10) + ': ' + e.f.split(',').filter(k => ES.fam[k]).map(k => ES.fam[k].name.replace(/ \(.*\)$/, '') + (ES.fam[k].warn ? ' (WARNING)' : ' (passed)')).join('; '))] : []),
    '', 'SUPPLY CHAIN (hot industry -> its suppliers next month): ' + (ES.link ? linkVerdict(ES.link) : 'not run') + '. Send  themes  for the map now.',
    'PEER LAG (industry leader jumps 6%+ -> its laggard peers for 3 days): ' + (ES.peer ? ES.peer.verdict + (ES.peer.results && ES.peer.results.newer ? ', newer half ' + ln(ES.peer.results.newer) + (ES.peer.results.ctrlNewer && ES.peer.results.ctrlNewer.n ? ' vs other laggards ' + pcs(ES.peer.results.ctrlNewer.avg) : '') : '') + (ES.peer.why ? ' (' + ES.peer.why + ')' : '') : 'runs from next Sunday') + '.',
    'Only kinds that PASSED become buys (as "event drift" in ACTIONS). Research, not advice.'].join('\n'); }

// The rules come from the page itself, so the page and the scanner can never disagree.
const html = fs.readFileSync('index.html', 'utf8'), m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!m) { console.error('index.html has no logic block. Upload the latest index.html first.'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'logic-' + Date.now() + '.cjs'); fs.writeFileSync(tmp, m[1]);
const L = createRequire(import.meta.url)(tmp);

const readJson0 = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
// SETTINGS WRITES (review S-4, 22 Oct): every write was readJson(settings, {}) -> one key -> write, so a file that failed to parse was
// replaced by {} and the decision, focus, quiet, tier2 and fee were lost silently. readSettings() gives {} only when the file is missing
// and null when it exists but does not parse; updateSettings() then ABORTS (returns null) and writes nothing. Written one key a line, so
// edits of different keys by two runners merge in git.
function readSettings() { const f = 'data/settings.json'; if (!fs.existsSync(f)) return {}; try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch (e) { return null; } }
function updateSettings(mut) { const st = readSettings(); if (!st) { console.log('Error: data/settings.json does not parse; nothing was written to it'); return null; } mut(st); fs.writeFileSync('data/settings.json', JSON.stringify(st, null, 1)); return st; }
const SETTINGS_BAD = 'Not saved: your settings file could not be read (data/settings.json does not parse), so I changed nothing rather than wipe your decision, focus, quiet, tier 2 and fee. Send this message to Claude.';
const DEFAULT = 'SPY QQQ IWM DIA AAPL MSFT NVDA AMZN GOOGL META TSLA AVGO AMD NFLX ORCL CRM JPM BAC V MA UNH LLY JNJ XOM CVX WMT COST HD PG KO PEP DIS'.split(' ');
const fromFile = fs.existsSync('watchlist.txt') ? fs.readFileSync('watchlist.txt', 'utf8').toUpperCase().split(/[\s,]+/).filter(s => /^[A-Z.\-]{1,8}$/.test(s)) : [];
// Candidates from the discovery engine are tested automatically, so a Buy watch with prices is sent if a tested rule fires on one.
let DISC = new Set(), BIOBLOCK = new Map(), DISCMETA = null;
try { DISCMETA = JSON.parse(fs.readFileSync('data/discovery.json', 'utf8')); const cs = DISCMETA.candidates || []; DISC = new Set(cs.map(c => c.sym).filter(x => /^[A-Z.\-]{1,8}$/.test(x))); for (const c of cs) { if (c.bio && (c.bio.risk === 'high' || c.bio.risk === 'unknown')) BIOBLOCK.set(c.sym, c.bio.text); else if (c.hardBlock) BIOBLOCK.set(c.sym, 'dilution: ' + String(c.hardBlock).slice(0, 120)); } } catch {}
// Several ZAD marks in one message (owner, 23 Oct: 15 marks in one message got no reply): every "halal SYM yes/no" in the text, in order.
function halalBatch(text) {
  const out = [], seen = new Set();
  for (const m of String(text || '').matchAll(/(?:^|[^a-z])(?:halal|zad)\s+([a-z.\-]{1,6}(?:\s*,\s*[a-z.\-]{1,6})*)\s+(yes|ok|pass|no|not\s+halal|fail|haram)\b/gi)) {   // also a comma list: halal pr,lly,app yes
    for (const t of m[1].split(/\s*,\s*/)) { const sym = t.toUpperCase(); if (!sym || seen.has(sym)) continue; seen.add(sym); out.push([sym, !/^(yes|ok|pass)$/i.test(m[2])]); } }
  return out;
}
// YOUR HALAL MARKS from ZAD: "halal BFLY no" blocks it everywhere (plan, radar, checks); "halal BFLY yes" marks it as checked.
const HALAL_FILE = 'data/halal.json', HALAL_DAYS = 90;
// FILTERING POLICY: only YOUR OWN ZAD marks ever remove a stock. Every other screen (the built-in list, Zoya, Halal Terminal,
// HalalScreener) is SHOWN on the card as information, never used to drop a stock: platforms rule differently, you decide.
const myHalal = (sym) => { const m = HALALM()[sym]; return m && (m.s === 'fail' || m.s === 'ok') ? m.s : 'unknown'; };
// your ZAD marks. A NOT HALAL mark counts for 90 days, then expires: companies change their debt and income every quarter, so a
// stock can become halal again. When an expired one shows up as a buy, the card asks you to check it in ZAD again.
// ZAD's published list (data/zad-list.json, from its quarterly Sharia review) fills in every stock it names; your own mark wins
// only when it is newer than the list. Stocks the list removes are NOT HALAL right away (a trade bought now would still be held
// on the date they stop being compliant).
const ZADL = () => { const z = readJson0('data/zad-list.json'); if (!z) return {}; const o = {}, d = z.effective || z.received;
  for (const s of z.notHalal || []) o[s] = { s: 'fail', d, by: 'ZAD list (not compliant from ' + z.effective + ')' }; for (const s of [...(z.halalAgain || []), ...(z.newHalal || [])]) o[s] = { s: 'ok', d, by: 'ZAD list (' + z.effective + ')' }; return o; };
const HALALM = () => { const z = ZADL(), m0 = readJson0(HALAL_FILE) || {}, m = { ...z }; for (const [k, v] of Object.entries(m0)) if (!z[k] || !v.d || v.d >= z[k].d) m[k] = v; const out = {}; for (const [k, v] of Object.entries(m)) out[k] = v && (v.s === 'fail' || v.s === 'ok') && v.d && Date.now() - Date.parse(v.d) > HALAL_DAYS * 86400000 ? { ...v, was: v.s, s: 'expired' } : v; return out; };
// ZOYA (AAOIFI) halal pre-check. Secret ZOYA_KEY holds the key WITH its prefix ("live-..." or "sandbox-..."). Each stock on
// the buy list is checked about weekly and remembered in data/zoya.json. The result is SHOWN only, never used to drop a stock
// from the buy list; your own ZAD mark always wins. Sandbox data are dummy values: shown, never acted on.
const ZOYA_FILE = 'data/zoya.json', ZOYAM = () => readJson0(ZOYA_FILE) || {};
const zoyaLive = () => /^live-/.test(env.ZOYA_KEY || '');
async function zoyaCheck(syms) {
  if (!env.ZOYA_KEY) return 0;
  const url = local(env.ZOYA_BASE) ? local(env.ZOYA_BASE) + '/graphql' : (zoyaLive() ? 'https://api.zoya.finance/graphql' : 'https://sandbox-api.zoya.finance/graphql'), Z = ZOYAM(); let n = 0;
  for (const sym of [...new Set(syms)].slice(0, 40)) {
    const old = Z[sym]; if (old && Date.now() - Date.parse(old.at) < 7 * 86400000 && old.live === zoyaLive()) continue;   // re-checked weekly: a status can change after new financial statements
    for (let a = 0; a < 2; a++) try { const r = await fetch(url, { method: 'POST', headers: { 'Authorization': env.ZOYA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { basicCompliance { report(symbol: "' + sym + '") { symbol status purificationRatio reportDate } } }' }) });
      if (!r.ok) { console.log('Zoya: HTTP ' + r.status + ' for ' + sym); if (r.status === 401 || r.status === 403) break; continue; }
      const j = await r.json(), rep = j && j.data && j.data.basicCompliance ? j.data.basicCompliance.report : null;
      Z[sym] = { s: rep ? String(rep.status || 'UNRATED') : 'UNRATED', p: rep && typeof rep.purificationRatio === 'number' ? rep.purificationRatio : null, d: rep ? rep.reportDate : null, at: new Date().toISOString(), live: zoyaLive() }; n++; break;
    } catch (e) { console.log('Zoya: ' + e.message + (a ? '' : ', retrying')); await sleep(FAST ? 5 : 2000); }
    await sleep(FAST ? 0 : 300);
  }
  fs.writeFileSync(ZOYA_FILE, JSON.stringify(Z, null, 1)); return n;
}
// MORE HALAL PRE-CHECKS: Halal Terminal (secret HALALTERMINAL_KEY, free key about 50 checks a month) and HalalScreener.app
// (secret HALALSCREENER_KEY). Same rules as Zoya: each stock at most once every 30 days, results in data/halal-ext.json.
const HEXT_FILE = 'data/halal-ext.json', HEXTM = () => readJson0(HEXT_FILE) || {};
const verdictOf = (j) => {   // tolerant reading of a provider's answer: true = passes, false = fails, null = unknown
  if (!j || typeof j !== 'object') return null; const o = j.data && typeof j.data === 'object' ? j.data : j.result && typeof j.result === 'object' ? j.result : j;
  for (const k of ['aaoifi_compliant', 'is_compliant', 'compliant', 'isCompliant', 'shariah_compliant', 'halal']) if (typeof o[k] === 'boolean') return o[k];
  const st = String(o.status || o.compliance || o.compliance_status || o.verdict || o.rating || '').toUpperCase();
  if (/NOT|NON|FAIL|HARAM|NO_?PASS/.test(st)) return false; if (/^(COMPLIANT|HALAL|PASS|YES)/.test(st)) return true; return null; };
async function halalExtCheck(syms) {
  const SRC = [];
  if (env.HALALTERMINAL_KEY) SRC.push({ k: 'ht', name: 'Halal Terminal', max: 10, days: 30, req: (sym) => [(local(env.HT_BASE) || 'https://api.halalterminal.com') + '/api/screen/' + encodeURIComponent(sym), { method: 'POST', headers: { 'X-API-Key': env.HALALTERMINAL_KEY, 'Content-Type': 'application/json' } }] });
  if (env.HALALSCREENER_KEY) SRC.push({ k: 'hs', name: 'HalalScreener', max: 25, days: 14, req: (sym) => [(local(env.HS_BASE) || 'https://halalscreener.app') + '/api/v1/screen?symbol=' + encodeURIComponent(sym), { headers: { 'Authorization': 'Bearer ' + env.HALALSCREENER_KEY } }] });
  if (!SRC.length) return 0; const X = HEXTM(); let n = 0;
  for (const src of SRC) { let used = 0;
    for (const sym of [...new Set(syms)]) { if (used >= src.max) break;   // free plans are small: a few new stocks a night, each remembered 30 days
      const old = X[sym] && X[sym][src.k]; if (old && Date.now() - Date.parse(old.at) < src.days * 86400000) continue;
      try { const [u, o] = src.req(sym); let r = null; for (let a = 0; a < 2 && !r; a++) { try { r = await fetch(u, o); } catch (e) { if (a) throw e; await sleep(FAST ? 5 : 2000); } } used++;
        if (r.status === 401 || r.status === 402 || r.status === 403 || r.status === 429) { console.log(src.name + ': HTTP ' + r.status + ' (key or monthly limit), stopped for tonight'); break; }
        if (!r.ok) continue; const j = await r.json().catch(() => null), v = verdictOf(j);
        X[sym] = X[sym] || {}; X[sym][src.k] = { v, pur: j && typeof (j.purification_rate ?? (j.data && j.data.purification_rate)) === 'number' ? (j.purification_rate ?? j.data.purification_rate) : null, at: new Date().toISOString() }; n++;
      } catch (e) { console.log(src.name + ': ' + e.message); }
      await sleep(FAST ? 0 : 400); } }
  fs.writeFileSync(HEXT_FILE, JSON.stringify(X, null, 1)); return n;
}
// All halal pre-checks for one stock: { pass: [...names], fail: [...names], text }
const halalChecks = (sym) => {
  const pass = [], fail = [], unk = [], z = ZOYAM()[sym], x = HEXTM()[sym] || {};
  if (z && z.live) (z.s === 'COMPLIANT' ? pass : z.s === 'NON_COMPLIANT' ? fail : unk).push('Zoya');
  for (const [k, name] of [['ht', 'Halal Terminal'], ['hs', 'HalalScreener']]) if (x[k]) (x[k].v === true ? pass : x[k].v === false ? fail : unk).push(name);
  const parts = [...pass.map(n => n + ' PASS'), ...fail.map(n => n + ' FAIL'), ...unk.map(n => n + ' unclear')];
  return { pass, fail, text: parts.length ? 'Halal pre-checks: ' + parts.join(' | ') + (pass.length && fail.length ? '. SOURCES DISAGREE' : '') + '. Confirm in ZAD.' : null };
};
const zoyaText = (sym) => { const z = ZOYAM()[sym]; if (!z) return null; const tag = z.live ? '' : ' (SANDBOX test data, not real)';
  return 'Halal pre-check (Zoya, AAOIFI): ' + (z.s === 'COMPLIANT' ? 'COMPLIANT' : z.s === 'NON_COMPLIANT' ? 'NOT COMPLIANT' : z.s === 'QUESTIONABLE' ? 'QUESTIONABLE (cannot decide)' : 'not rated') + (z.p ? ', purify ' + (z.p * 100).toFixed(1) + '% of gains' : '') + tag + '. Confirm in ZAD.'; };
const EXTRA_FILE = 'data/watch-extra.json', readExtra = () => { try { const a = JSON.parse(fs.readFileSync(EXTRA_FILE, 'utf8')); return Array.isArray(a) ? a.filter(x => /^[A-Z.\-]{1,8}$/.test(x)) : []; } catch { return []; } };
// Stocks the live whole-market radar flagged today (only if that feed is available): tonight's scan runs the tested rules on them.
const RADAR = (() => { const r = readJson0('data/intraday-radar.json'); return (r && r.status === 'OK' ? (r.candidates || []).filter(x => x.verdict === 'EARLY_WAVE_REVIEW').map(x => x.sym) : []).filter(x => /^[A-Z]{1,5}$/.test(x)).slice(0, 10); })();
// Names from the smart-money job (insider buying, analysts turning positive, upgrades): tested with all rules tonight.
const SMART = (() => { const r = readJson0('data/smart-money.json'); return ((r && r.picks) || []).filter(x => /^[A-Z]{1,5}$/.test(x)).slice(0, 30); })();
const MAIN = ['SPY', ...new Set([...(fromFile.length ? fromFile : DEFAULT), ...readExtra(), ...DISC, ...RADAR, ...SMART].filter(s => s !== 'SPY'))].slice(0, 1000);
// Extra large, heavily traded companies scanned for QUICK TRADES only. Short bounces behave best in liquid names.
const QEXTRA = env.NO_QUICK_EXTRA ? [] : 'ABBV ABT ACN ADBE AMAT AMGN BKNG BMY CAT COP CSCO CVS DE DHR GE GILD HON IBM INTC INTU ISRG LIN LOW MCD MDT MMM MRK NEE NKE NOW PFE QCOM SBUX SO T TGT TMO TMUS TXN UNP UPS VZ PLTR UBER SHOP PANW MU ADP SPGI TJX VRTX REGN ZTS CI ELV'.split(' ').filter(x => !MAIN.includes(x));
const FMOVERS = (() => { try { const f = JSON.parse(fs.readFileSync('data/fm-state.json', 'utf8')); return Object.keys(f.sent || {}).filter(x => /^[A-Z]{1,5}$/.test(x) && !MAIN.includes(x) && !QEXTRA.includes(x)).slice(0, 12); } catch { return []; } })();
// Whole-market leaders: the strongest liquid stocks found by the morning sweep of every US stock. Loaded so the LEADERS list can rank them.
const LEADU = (() => { const u = readJson0('data/leaders-universe.json'); return ((u && u.syms) || []).map(x => x.sym).filter(x => /^[A-Z]{1,5}$/.test(x) && !MAIN.includes(x) && !QEXTRA.includes(x) && !FMOVERS.includes(x)).slice(0, 25); })();
// WIDER HUNT: the most traded strong-trend COMPANIES from the morning whole-market sweep (funds removed), scanned for
// QUICK TRADES only. More stocks tested = more chances that a proven setup fires. Each stock is still judged only on its
// own trades the rule never saw, with the same 30-trade and after-cost rules. Set WIDE_N to change the number (0 = off).
const QWIDE = (() => { const n = env.WIDE_N !== undefined ? +env.WIDE_N || 0 : 120; if (!n) return []; const u = readJson0('data/radar-universe.json'), co = readJson0('data/companies.json'), cs = co && co.syms && co.syms.length > 3000 ? new Set(co.syms) : null;
  return ((u && u.syms) || []).map(x => x.sym).filter(x => /^[A-Z]{1,5}$/.test(x) && (!cs || cs.has(x)) && !MAIN.includes(x) && !QEXTRA.includes(x) && !FMOVERS.includes(x) && !LEADU.includes(x)).slice(0, n); })();
const BTSET = new Set([...(fromFile.length ? fromFile : DEFAULT), ...QEXTRA]);   // the past test uses only the fixed list, never stocks picked BECAUSE they already rose
const QONLY = new Set([...QEXTRA, ...FMOVERS, ...LEADU, ...QWIDE]), LEADHELD = (() => { const u = readJson0('data/leaders.json'); return ((u && u.paper) || []).map(x => x.sym).filter(x => /^[A-Z]{1,5}$/.test(x)); })(),   // leaders still being ridden on paper: always loaded, so their exits are never missed
  LIST = [...new Set([...MAIN, ...QEXTRA, ...FMOVERS, ...LEADU, ...LEADHELD, ...QWIDE])];
for (const x of LEADHELD) if (!MAIN.includes(x)) QONLY.add(x);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const money = (x) => x.toFixed(2);
fs.mkdirSync('data', { recursive: true });

function ny(ms) {
  const o = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(new Date(ms)).forEach(p => o[p.type] = p.value);
  return { d: o.year + '-' + o.month + '-' + o.day, mins: +o.hour * 60 + +o.minute, weekend: o.weekday === 'Sat' || o.weekday === 'Sun' };
}
// DAY-OF-WEEK: which weekday the next buy would happen on (today before the close, else the next weekday), and what the study says
function buyDayNote() {
  const D = readJson0('data/dow-study.json'); if (!D || !D.rows) return null;
  let ms = Date.now(), n = ny(ms); if (n.weekend || n.mins >= 960) { do { ms += 86400000; n = ny(ms); } while (n.weekend); }
  const wd = new Date(n.d + 'T12:00:00Z').getUTCDay() - 1, r = D.rows[wd]; if (!r) return null;
  if (/WORSE/.test(r.verdict)) return 'DAY CHECK: buys made on a ' + r.day + ' did WORSE in both halves of the tests (' + pcs(r.older.avg) + ' / ' + pcs(r.newer.avg) + ' a trade vs ' + pcs(D.all.older) + ' / ' + pcs(D.all.newer) + ' on average). Consider waiting a day.';
  if (/BETTER/.test(r.verdict)) return 'DAY CHECK: buys made on a ' + r.day + ' did better than average in both halves of the tests.';
  return null; }
// WHEN IN THE DAY: tested choice between the last minutes of the signal day and the next open; the rest are fixed safety rules
function timingNote() { const T = readJson0('data/timing-study.json'); if (!T || !T.buy) return null;
  const w = (x) => x === 'CLOSE' ? 'in the last 15 minutes before the close (11:45 pm Kuwait, 10:45 pm from November)' : x === 'OPEN' ? 'at the open, after the first 15 minutes (4:45 pm Kuwait)' : 'at the open, after the first 15 minutes (4:45 pm Kuwait; tested: no difference from the close)';
  const pre = T.buy === 'CLOSE' || T.sell === 'CLOSE';   // acting near the close needs an alert before the close, which the scheduled jobs cannot send yet
  return 'WHEN: buy ' + (T.buy === 'CLOSE' ? 'at the open after the first 15 minutes (tested: buying in the last minutes of the signal day did better, but that needs a pre-close alert, planned with the always-on server)' : w(T.buy)) + '; sell on a rule exit ' + (T.sell === 'CLOSE' ? 'at the open (near the close did better, same pre-close alert needed)' : w(T.sell)) + '. Stops: any time. Never in pre-market or after-hours.'; }
function timingText() { const T = readJson0('data/timing-study.json'); if (!T || !T.older) return 'The timing study runs with the nightly scan. Ask again tomorrow.';
  const l = (h, k) => T[h][k].n ? pcs(T[h][k].avg) + ' (' + T[h][k].n + ')' : 'n/a';
  return ['WHEN TO BUY AND SELL (tested on the unseen trades of the rules the system offers, after costs; older | newer half)',
    'BUY at the next open: ' + l('older', 'openIn') + ' | ' + l('newer', 'openIn'), 'BUY in the last minutes of the signal day: ' + l('older', 'closeIn') + ' | ' + l('newer', 'closeIn'),
    'SELL (rule exit) at the next open: ' + l('older', 'openOut') + ' | ' + l('newer', 'openOut'), 'SELL (rule exit) in the last minutes of the day it fires: ' + l('older', 'closeOut') + ' | ' + l('newer', 'closeOut'),
    '', timingNote(), '',
    'Fixed rules (not testable with daily prices, from how the market works):',
    '- PRE-MARKET and AFTER-HOURS: do not trade. Few buyers and sellers, wide spreads, prices that often reverse at the open; most broker stops do not work then.',
    '- FIRST 15 MINUTES after the open: the widest swings of the day. Wait, unless the plan says buy at the open.',
    '- Always LIMIT orders, never market orders.',
    '- STOPS: sell as soon as one is hit, any time in the session. Do not wait for a better price.',
    'A choice changes only when one way is better by 0.2% a trade or more in BOTH halves.'].filter(x => x !== null).join('\n'); }
function shadowText() {
  const LS = readJson0('data/lessons.json') || {}, rs = Object.values(LS.rules || {}), sg = readJson0('data/signals.json') || {}, RR = readJson0('data/radar-record.json') || {}, LD = readJson0('data/leaders.json') || {};
  const n = rs.reduce((a, r) => a + r.n, 0), avg = n ? rs.reduce((a, r) => a + r.avg * r.n, 0) / n : null, win = n ? rs.reduce((a, r) => a + r.win * r.n, 0) / n : null;
  const ld = (LD.done || []).filter(x => typeof x.pct === 'number'), la = ld.length ? ld.reduce((a, x) => a + x.pct, 0) / ld.length : null;
  const rg = Object.values(RR.groups || {}).filter(g => g.n), rn = rg.reduce((a, g) => a + g.n, 0), ra = rn ? rg.reduce((a, g) => a + g.avg * g.n, 0) / rn : null;
  return ['SHADOW RECORD: every system signal followed forward on paper, whether you bought or not (after costs)',
    'Tested-rule buys (swing and quick): ' + (n ? n + ' finished, ' + Math.round(win * 100) + '% won, average ' + pcs(avg) : 'none finished yet') + (sg.quickRecord && sg.quickRecord.n ? ' | quick trades vs S&P 500 same days: ' + pcs(sg.quickRecord.avgPct) + ' vs ' + pcs(sg.quickRecord.avgSpy || 0) : ''),
    'LEADERS trend trades: ' + (ld.length ? ld.length + ' finished, average ' + pcs(la) : 'none finished yet (they last weeks)'),
    'Early-wave radar: ' + (rn ? rn + ' finished, average ' + pcs(ra) : 'none finished yet'),
    '', 'This is the honest forward test: about 60 finished trades per kind are needed before it means much. Rules that lose here are demoted automatically.'].join('\n'); }
function themesText() { const F = readJson0('data/leaders-study.json'), th = F && F.theme;
  if (!th || !th.now) return 'THEMES: the industry study runs every Sunday with the LEADERS fair test (it first loads the industry of every stock). Ask again after Sunday.';
  return ['WHERE THE MONEY IS GOING (strongest industries over 6 months, from the Sunday study ' + String(F.to || '') + ')', ...th.now.map((x, k) => (k + 1) + ') ' + x.name + ': ' + pcs(x.avg) + ' average (' + x.n + ' stocks). Leaders: ' + x.leaders.join(', ')),
    '', 'TEST: ' + th.verdict + '.', ...(() => { const ES = readJson0('data/events-study.json'), K = ES && ES.link; if (!K || !K.now) return [];
      return ['', 'SUPPLY CHAIN NOW (hot industry -> suppliers that have not moved yet). History test: ' + K.verdict + (K.linked && K.linked.newer.n ? ' (' + K.linked.newer.n + ' newer cases, ' + pcs(K.linked.newer.avg) + ' vs the market next month; other lagging industries ' + pcs(K.base.newer.avg) + ')' : ''), ...(K.now.length ? K.now.slice(0, 6).map(x => '- ' + x.up + ' hot (' + pcs(x.upMom) + ' in 3 months) -> ' + x.down + ' (' + pcs(x.downMom) + '): ' + (x.stocks.join(', ') || 'no liquid stocks')) : ['- no hot industry with lagging suppliers right now'])]; })(),
    'Information to explore with  check SYM . A stock becomes a buy only through a tested rule (ACTIONS).'].join('\n'); }
function dowText() {
  const D = readJson0('data/dow-study.json'); if (!D || !D.rows) return 'The day-of-week study runs with the nightly scan. Ask again tomorrow.';
  return ['DAY OF THE WEEK: does the buy day matter? (unseen trades of the rules the system offers, after costs, by the day the BUY happened)', 'Average: older half ' + pcs(D.all.older) + ', newer half ' + pcs(D.all.newer), ...D.rows.map(r => r.day + ': older ' + (r.older.n ? pcs(r.older.avg) + ' (' + r.older.n + ')' : 'n/a') + ', newer ' + (r.newer.n ? pcs(r.newer.avg) + ' (' + r.newer.n + ')' : 'n/a') + ' -> ' + r.verdict), '', 'A day counts as worse or better only if it differs by 0.5% a trade or more in BOTH halves, with 150+ trades each.'].join('\n'); }
// ---- ALPACA PAPER TRADING (fake money only). Every fully proven BUY becomes a PAPER limit order at the top of its buy range with
// its stop attached; each night the trade's own tested exit closes it. Real fills, real timing, real gaps: the honest track record.
// The address is fixed to Alpaca's PAPER server, so no real money can ever move. Secrets: ALPACA_KEY, ALPACA_SECRET.
const ALP = local(env.ALPACA_BASE) || 'https://paper-api.alpaca.markets', ALP_FILE = 'data/alpaca-paper.json';
async function alp(method, path, body) {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) return null;
  try { const r = await fetch(ALP + path, { method, headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : {}; } catch (e) {} if (!r.ok) { console.log('Alpaca paper ' + method + ' ' + path + ': HTTP ' + r.status + ' ' + String(t).slice(0, 160)); return { error: r.status, j }; } return j; }
  catch (e) { console.log('Alpaca paper: ' + e.message); return null; }
}
async function alpacaPaper(sig, loaded, session) {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET || !sig) return;
  const A = readJson(ALP_FILE, { plans: {}, pendingBuy: {}, pendingExit: {}, closed: [], start: null }), today = session;
  const acct = await alp('GET', '/v2/account'); if (!acct || acct.error) { console.log('Alpaca paper: account not reachable, skipped.'); return; }
  if (!A.start) A.start = { d: today, equity: +acct.equity };
  const posL = await alp('GET', '/v2/positions'), held = {}; for (const p of Array.isArray(posL) ? posL : []) held[p.symbol] = p;
  // 1. finished exits from the last run: record the real fill
  for (const [sym, x] of Object.entries(A.pendingExit)) { const o = await alp('GET', '/v2/orders/' + x.id); if (o && o.status === 'filled') { const ex = +o.filled_avg_price, pct = ex / x.entry - 1;
    A.closed.push({ sym, kind: x.kind, engine: x.kindName || x.kind, entry: x.entry, exit: ex, pct: +pct.toFixed(5), net: +(pct - 2 * FEE() / (x.entry * x.qty)).toFixed(5), why: x.why, in: x.since, out: String(o.filled_at || '').slice(0, 10) }); delete A.pendingExit[sym]; delete A.plans[sym]; }
    else if (o && ['canceled', 'expired', 'rejected'].includes(o.status)) delete A.pendingExit[sym]; }
  // 2. stops the broker filled by itself (position gone, no exit sent by us)
  for (const [sym, P] of Object.entries(A.plans)) if (!held[sym] && !A.pendingExit[sym]) {
    const os = await alp('GET', '/v2/orders?status=closed&limit=20&symbols=' + sym), st = (Array.isArray(os) ? os : []).find(o => o.side === 'sell' && o.status === 'filled');
    if (st) { const ex = +st.filled_avg_price, pct = ex / P.entry - 1; A.closed.push({ sym, kind: P.kind, engine: P.kindName || P.kind, entry: P.entry, exit: ex, pct: +pct.toFixed(5), net: +(pct - 2 * FEE() / (P.entry * P.qty)).toFixed(5), why: ex < P.stop * 0.995 ? 'stop (gapped through)' : 'stop', in: P.since, out: String(st.filled_at || '').slice(0, 10) }); }
    delete A.plans[sym]; }
  // 3. new fills become tracked paper positions with their own exit rule
  for (const [sym, b] of Object.entries(A.pendingBuy)) { if (held[sym] && !A.plans[sym]) { A.plans[sym] = { ...b.plan, entry: +held[sym].avg_entry_price, qty: +held[sym].qty, since: today }; delete A.pendingBuy[sym]; continue; }
    if (b.d >= today) continue;
    // filled and stopped out the same day (audit 22 Oct: these, the worst trades, were dropped from the record)
    const bo = await alp('GET', '/v2/orders/' + b.id + '?nested=true'); if (bo && bo.status === 'filled' && +bo.filled_avg_price > 0) { const en = +bo.filled_avg_price, q = +bo.filled_qty || 1, legs = Array.isArray(bo.legs) ? bo.legs : [], sl = legs.find(o => o.side === 'sell' && o.status === 'filled');
      let ex = sl ? +sl.filled_avg_price : null, outD = sl ? String(sl.filled_at || '').slice(0, 10) : null; if (!ex) { const os = await alp('GET', '/v2/orders?status=closed&limit=20&symbols=' + sym), st = (Array.isArray(os) ? os : []).find(o => o.side === 'sell' && o.status === 'filled' && o.filled_at >= bo.filled_at); if (st) { ex = +st.filled_avg_price; outD = String(st.filled_at || '').slice(0, 10); } }
      if (ex) { const pct = ex / en - 1; A.closed.push({ sym, kind: b.plan.kind, engine: b.plan.kindName || b.plan.kind, entry: en, exit: ex, pct: +pct.toFixed(5), net: +(pct - 2 * FEE() / (en * q)).toFixed(5), why: 'stop, same day as the fill', in: String(bo.filled_at || '').slice(0, 10), out: outD }); } }
    delete A.pendingBuy[sym]; }
  // 4. tonight's exits, by each trade's own tested rule (stops sit at the broker already)
  for (const [sym, P] of Object.entries(A.plans)) { const d = loaded[sym]; if (!d || !held[sym] || A.pendingExit[sym]) continue;
    const c = d.candles, i = c.length - 1, ind = L.indicators(c, null), n = c.filter(k => k.d > P.since).length; let why = null;
    if (P.kind === 'quick') { const s5 = ind.sma5[i]; if (n >= 1 && (P.q === 'gap' ? c[i].c < s5 : c[i].c > s5)) why = 'rule exit (5 day average)'; else if (n >= (P.maxHold || 5)) why = 'time limit'; }
    else if (P.kind === 'leader') { if (c[i].c < ind.e[50][i]) why = 'closed under its 50 day average'; }
    else { const vv = P.key ? L.VARIANTS.find(x => L.vkey(x) === P.key) : null, lv = P.exitMA ? c.slice(-P.exitMA).reduce((a, x) => a + x.c, 0) / P.exitMA : null;
      if (vv && L.exitAt(ind, c, vv, i)) why = 'rule exit'; else if (lv && c[i].c < lv) why = 'closed under its ' + P.exitMA + ' day average'; else if (P.maxHold && n >= P.maxHold) why = 'time limit'; }
    if (why) { const oo = await alp('GET', '/v2/orders?status=open&symbols=' + sym); for (const o of Array.isArray(oo) ? oo : []) await alp('DELETE', '/v2/orders/' + o.id);
      const o = await alp('POST', '/v2/orders', { symbol: sym, qty: String(P.qty), side: 'sell', type: 'market', time_in_force: 'day', client_order_id: 's2x-' + sym + '-' + today });
      if (o && o.id) A.pendingExit[sym] = { id: o.id, entry: P.entry, qty: P.qty, kind: P.kind, kindName: P.kindName, why, since: P.since }; } }
  // 5. tonight's proven buys become paper orders for the next session
  const cands = planCands(sig, {}).filter(x => (x.ok || x.losingLive || x.paperOnly) && !held[x.sym] && !A.plans[x.sym] && !A.pendingBuy[x.sym] && x.hi > 0 && x.stop > 0 && x.stop < x.hi);
  for (const x of cands.slice(0, 10)) { const usd = amountFor(x, sig.market, false).usd, qty = Math.floor(usd / x.hi); if (qty < 1) continue;
    const src = x.kind === 'quick trade' ? (sig.quick || []).find(q => q.sym === x.sym) : x.kind === 'swing trade' ? (sig.stocks || []).find(b => b.sym === x.sym) : x.kind === 'earnings drift' ? (sig.pead || []).find(e => e.sym === x.sym) : x.kind === 'event drift' ? (sig.evt || []).find(e => e.sym === x.sym) : null;
    const plan = x.kind === 'quick trade' ? { kind: 'quick', q: src && src.q, maxHold: (src && src.maxHold) || 5, stop: x.stop } : x.kind === 'swing trade' ? { kind: 'entry', key: src && src.key, maxHold: src && src.maxHold, stop: x.stop } : (x.kind === 'earnings drift' || x.kind === 'event drift') ? { kind: 'entry', exitMA: 20, maxHold: (src && src.hold) || 40, stop: x.stop } : x.kind === 'trend trade' ? { kind: 'leader', stop: x.stop } : x.kind === 'octopus' ? { kind: 'entry', maxHold: 10, stop: x.stop } : x.kind === 'mid-term' ? { kind: 'entry', maxHold: x.days, stop: x.stop } : null;
    if (!plan) continue;
    const o = await alp('POST', '/v2/orders', { symbol: x.sym, qty: String(qty), side: 'buy', type: 'limit', limit_price: String(+x.hi.toFixed(2)), time_in_force: 'day', order_class: 'oto', stop_loss: { stop_price: String(+Math.min(x.stop, x.hi - 0.02).toFixed(2)) }, client_order_id: 's2-' + x.sym + '-' + today });
    if (o && o.id) A.pendingBuy[x.sym] = { id: o.id, d: today, plan: { ...plan, kindName: x.kind + (x.outsideTest ? ' (outside the tested set)' : '') } }; }
  A.closed = A.closed.slice(-500); A.equity = { d: today, equity: +acct.equity }; fs.writeFileSync(ALP_FILE, JSON.stringify(A, null, 1));
  console.log('Alpaca paper: ' + Object.keys(held).length + ' positions, ' + Object.keys(A.pendingBuy).length + ' buy orders for the next session, ' + Object.keys(A.pendingExit).length + ' exits sent, ' + A.closed.length + ' finished.');
}
async function paperText() {
  if (!env.ALPACA_KEY || !env.ALPACA_SECRET) return 'PAPER ACCOUNT: not connected. This bot run sees: ALPACA_KEY ' + (env.ALPACA_KEY ? 'present' : 'MISSING') + ', ALPACA_SECRET ' + (env.ALPACA_SECRET ? 'present' : 'MISSING') + '. If you added them, this bot run started before: cancel it in Actions and run the workflow again.';
  { const t = await alp('GET', '/v2/account'); if (!t || t.error) return 'PAPER ACCOUNT: keys found (ALPACA_KEY starts ' + String(env.ALPACA_KEY).slice(0, 2) + ', ' + String(env.ALPACA_KEY).length + ' characters; ALPACA_SECRET ' + String(env.ALPACA_SECRET).length + ' characters), but Alpaca ' + (t && (t.error === 401 || t.error === 403) ? 'REJECTED them (HTTP ' + t.error + '). Use the PAPER keys from the Paper Trading dashboard; Key ID in ALPACA_KEY, Secret Key in ALPACA_SECRET, and the newest pair if you regenerated.' : 'could not be reached right now (' + (t ? 'HTTP ' + t.error : 'no answer') + '). Try again in a few minutes.'); }
  const A = readJson(ALP_FILE, { closed: [], plans: {}, pendingBuy: {} }), acct = await alp('GET', '/v2/account'), pos = await alp('GET', '/v2/positions'), c = A.closed || [];
  const w = c.filter(t => t.net > 0), avg = c.length ? c.reduce((a, t) => a + t.net, 0) / c.length : null, gaps = c.filter(t => /gapped/.test(t.why || '')).length;
  return ['PAPER ACCOUNT (Alpaca, fake money; real fills and timing)', acct && !acct.error ? 'Equity ' + money(+acct.equity) + (A.start ? ' (started ' + money(A.start.equity) + ' on ' + A.start.d + ': ' + pcs(+acct.equity / A.start.equity - 1) + ')' : '') : 'account not reachable right now',
    'Finished trades: ' + (c.length ? c.length + ', ' + Math.round(w.length / c.length * 100) + '% won, average ' + pcs(avg) + ' after your $6 fees' + (gaps ? ', ' + gaps + ' gapped through the stop' : '') : 'none yet'),
    'Open: ' + ((Array.isArray(pos) && pos.length) ? pos.map(p => p.symbol + ' ' + pcs(+p.unrealized_plpc)).join(', ') : 'none') + (Object.keys(A.pendingBuy || {}).length ? ' | buy orders waiting: ' + Object.keys(A.pendingBuy).join(', ') : ''),
    '', 'Only fully proven buys are placed, with their stop attached; each closes on its own tested exit. Compare with  shadow  and  record.'].join('\n'); }
const barClosed = (d, now) => { const n = ny(now); return d < n.d || (d === n.d && n.mins >= 970); };
// US stock market holidays, worked out from the exchange's standing rules (New Year, Martin Luther King Jr. Day, Presidents' Day,
// Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas, with the weekend-observance rule).
// Early closes and one-off closures are not covered.
const HOLS = {};
function usHolidays(y) {
  if (HOLS[y]) return HOLS[y];
  const d = (m, day) => new Date(Date.UTC(y, m, day)), isoD = (x) => x.toISOString().slice(0, 10);
  const nth = (m, wd, k) => { const f = d(m, 1); return d(m, 1 + (wd - f.getUTCDay() + 7) % 7 + 7 * (k - 1)); }, lastW = (m, wd) => { const l = d(m + 1, 0); return d(m, l.getUTCDate() - (l.getUTCDay() - wd + 7) % 7); };
  const obs = (x) => x.getUTCDay() === 6 ? new Date(+x - 86400000) : x.getUTCDay() === 0 ? new Date(+x + 86400000) : x;
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = d(Math.floor((h + l - 7 * m + 114) / 31) - 1, (h + l - 7 * m + 114) % 31 + 1), ny1 = d(0, 1);
  const list = [ny1.getUTCDay() === 6 ? null : obs(ny1), nth(0, 1, 3), nth(1, 1, 3), new Date(+easter - 2 * 86400000), lastW(4, 1), obs(d(5, 19)), obs(d(6, 4)), nth(8, 1, 1), nth(10, 4, 4), obs(d(11, 25))];
  return (HOLS[y] = new Set(list.filter(Boolean).map(isoD)));
}
const isHoliday = (dateStr) => usHolidays(+dateStr.slice(0, 4)).has(dateStr);
const marketOpen = (now) => { const n = ny(now); return !n.weekend && !isHoliday(n.d) && n.mins >= 570 && n.mins < 960; };

let used = 0;
async function td(pathname) {   // rate-limited Twelve Data call with one retry on a limit error
  for (let attempt = 0; attempt < 3; attempt++) {
    if (used >= RATE) { console.log('rate limit pause'); await sleep(FAST ? 5 : 61000); used = 0; }
    used++;
    let j; try { const r = await fetch(TD + pathname + '&apikey=' + encodeURIComponent(env.TWELVE_KEY)); j = await r.json(); } catch (e) { await sleep(FAST ? 5 : 3000); continue; }   // a dropped connection must not stop the run
    if (j.code === 429) { await sleep(FAST ? 5 : 61000); used = 0; continue; }
    return j;
  }
  return { status: 'error', message: 'rate limit' };
}
// Live prices: Finnhub quote first (60 calls a minute, free), so the Twelve Data daily budget is kept for the nightly
// price histories (that budget is what limits how many stocks can be tested). Twelve Data is the fallback.
let fhUsed = 0, fhStart = Date.now();
async function liveQ(sym) {
  if (env.FINNHUB_KEY) {
    if (Date.now() - fhStart > 60000) { fhStart = Date.now(); fhUsed = 0; }
    if (fhUsed >= 50) { await sleep(FAST ? 5 : Math.max(0, 61000 - (Date.now() - fhStart))); fhStart = Date.now(); fhUsed = 0; }
    fhUsed++;
    try { const r = await fetch(FH + '/quote?symbol=' + encodeURIComponent(sym) + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (r.ok) { const j = await r.json(); if (j && +j.c > 0) return { price: +j.c, src: 'finnhub', t: +j.t > 0 ? +j.t * 1000 : null }; } } catch (e) {}
  }
  return td('/price?symbol=' + encodeURIComponent(sym));
}
// ---- WHOLE MARKET (paid Massive plan: unlimited calls, 5+ years of daily prices). Every liquid US company is tested every
// night with the same rules and the same proof gates as the core list. On the free plan (5 calls a minute) the first refusal
// switches this off by itself and the scan continues as before.
let mvHost = 0, mv429 = 0;
async function mv(pathq) {
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(MV_HOSTS[mvHost] + pathq + (pathq.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY));
      if (r.status === 429) { mv429++; if (mv429 > 6) return null; await sleep(FAST ? 5 : 3000); continue; }
      if (!r.ok) return null; return await r.json(); }
    catch (e) { if (mvHost + 1 < MV_HOSTS.length) mvHost++; else await sleep(FAST ? 5 : 1500); }
  }
  return null;
}
async function wideUniverse(already) {
  if (!env.MASSIVE_KEY || env.WIDE_ALL === '0') return [];
  const co = readJson0('data/companies.json'), cs = co && co.syms && co.syms.length > 3000 ? new Set(co.syms) : null;
  if (!cs) { console.log('whole market: no company list yet (discovery makes it), skipped'); return []; }
  const days = []; for (let k = 0; k < 10 && days.length < 5; k++) { const d = new Date(Date.now() - k * 86400000); if ([0, 6].includes(d.getUTCDay())) continue;
    const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d.toISOString().slice(0, 10) + '?adjusted=true'); if (mv429 > 6) { console.log('whole market: Massive refused (free plan?), skipped'); return []; }
    if (j && Array.isArray(j.results) && j.results.length > 500) days.push(new Map(j.results.map(r => [r.T, r]))); }
  if (days.length < 3) return [];
  const MIN_DV = +(env.WIDE_DV || 1e7), MAX = +(env.WIDE_MAX || 2500), out = [];
  for (const [sym, r] of days[0]) {
    if (!/^[A-Z]{1,5}$/.test(sym) || !cs.has(sym) || already.has(sym) || !(r.c >= +(env.WIDE_MIN_PX || 2))) continue;
    const dv = days.map(m => m.get(sym)).filter(Boolean).map(x => x.c * x.v).sort((a, b) => a - b); if (dv.length < 3) continue;
    const med = dv[Math.floor(dv.length / 2)]; if (med >= (r.c < 5 ? MIN_DV / 2 : MIN_DV)) out.push({ sym, dv: med });   // under 5 USD: 5M USD a day or more
  }
  return out.sort((a, b) => b.dv - a.dv).slice(0, MAX).map(x => x.sym);
}
async function loadWide(syms, loaded, now) {
  const from = new Date(now - (365 * 5 + 10) * 86400000).toISOString().slice(0, 10), to = new Date(now).toISOString().slice(0, 10);
  let i = 0, ok = 0; const worker = async () => { while (i < syms.length && mv429 <= 6) { const sym = syms[i++];
    const j = await mv('/v2/aggs/ticker/' + sym + '/range/1/day/' + from + '/' + to + '?adjusted=true&sort=asc&limit=50000');
    if (!j || !Array.isArray(j.results) || j.results.length < 30) continue;
    const all = j.results.map(x => ({ d: new Date(x.t).toISOString().slice(0, 10), o: +(+x.o).toFixed(4), h: +(+x.h).toFixed(4), l: +(+x.l).toFixed(4), c: +(+x.c).toFixed(4), v: Math.round(+x.v || 0) }));
    loaded[sym] = { candles: all.filter(c => barClosed(c.d, now)), last: all[all.length - 1].c, wide: true }; ok++; } };
  await Promise.all(Array.from({ length: +(env.WIDE_CONC || 8) }, worker));
  return ok;
}
async function telegram(text, buttons) {   // buttons: optional rows of { text, data } shown under the last part
  if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[no Telegram secrets, message not sent]\n' + text); return; }
  const parts = []; { let rest = text; while (rest.length > 3800) { let cut = rest.lastIndexOf('\n\n', 3800); if (cut < 1500) cut = rest.lastIndexOf('\n', 3800); if (cut < 1500) cut = 3800; parts.push(rest.slice(0, cut)); rest = rest.slice(cut).replace(/^\n+/, ''); } parts.push(rest); }   // split long messages between paragraphs, never mid-word
  for (let i = 0; i < parts.length; i++) {
    for (let a = 0; a < 3; a++) {   // a dropped connection is retried, so a message is not lost and the run does not stop
      try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: parts[i], disable_web_page_preview: true, ...(buttons && buttons.length && i === parts.length - 1 ? { reply_markup: { inline_keyboard: buttons.map(row => row.map(b => ({ text: b.text, callback_data: String(b.data).slice(0, 64) }))) } } : {}) }) });
        if (!r.ok) console.error('Telegram error', r.status, await r.text()); break; }
      catch (e) { console.error('Telegram connection error, retrying', e.message); await sleep(FAST ? 50 : 3000); }
    }
    if (i + 1 < parts.length) await sleep(FAST ? 0 : 700);   // keeps the parts in order on your phone
  }
}
const FOOT = '\nTested signals, not instructions. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : '');

// ---- Your own positions, told to the bot in Telegram. Read at every run (every 30 minutes in market hours).
// Stored in data/my-positions.json: ticker, entry price, levels and date. No share counts, no money amounts.
const POS_FILE = 'data/my-positions.json';
// GUIDE TARGETS: a stock bought without a tested target (trend trades, swing trades that exit on a close, your own picks) still gets
// two sell markers: 2x and 3x the risk to its stop (stop 8% under the buy -> +16% and +24%). They are guides, not tested exits.
// PRICE TARGETS: only tested ones. A target is shown only when the walk-forward test (index.html, targetStudy / the 2R-3R
// choice) found it beat the plain exit on trades the system never saw. Otherwise the plan says "no target" and the tested exit applies.
// Earlier untested guide targets on your positions are removed here.
function guideTargets(P) { if (P && P.guide) { delete P.t1; delete P.t2; delete P.guide; delete P.aw; }
  if (P && P.kind === 'quick' && P.t1 && !P.ownT && (!P.tmode || !P.tnote)) { delete P.t1; delete P.t2; delete P.tmode; }   // a quick-trade target saved before the target study existed was never tested
  return P; }
const loadPos = () => { const p = readJson(POS_FILE, {}); for (const k of Object.keys(p)) guideTargets(p[k]); return p; };
const savePos = (p) => fs.writeFileSync(POS_FILE, JSON.stringify(p, null, 1));
// STOP PLAN of 18 Oct (stop study: 35% under the buy for own picks), applied ONCE to the positions still held. The owner still
// places the same stops at his broker (they show UNCONFIRMED until he sends  stop placed ).
{ const ST = readSettings(); if (ST && !ST.stopPlan1018) { try { const p = JSON.parse(fs.readFileSync(POS_FILE, 'utf8')), plan = { RKLB: 48.74, RELL: 13.77, APP: 204.68, CCJ: 56.30 };
    for (const [k, v] of Object.entries(plan)) if (p[k]) { p[k].stop = v; p[k].own = true; p[k].stopWhy = 'the tested 35% disaster stop for your own picks (stop study, 18 Oct): tighter stops cost money on 5 years of buys'; delete p[k].stopOk; }
    fs.writeFileSync(POS_FILE, JSON.stringify(p, null, 1)); updateSettings(s => { s.stopPlan1018 = new Date().toISOString(); }); } catch (e) { } } }
// STOP RESTORE (audit 22 Oct): the nightly raise had tightened the tested 35% disaster stops of 18 Oct (APP, RELL, CCJ) although they are
// the owner's own stops; they go back to the plan once. RKLB was never raised.
{ const ST = readSettings(); if (ST && !ST.stopRestore1022) { try { const p = JSON.parse(fs.readFileSync(POS_FILE, 'utf8')), plan = { RKLB: 48.74, RELL: 13.77, APP: 204.68, CCJ: 56.30 };
    for (const [k, v] of Object.entries(plan)) if (p[k] && p[k].own && /35% disaster/.test(p[k].stopWhy || '')) { p[k].stop = v; delete p[k].raised; }
    fs.writeFileSync(POS_FILE, JSON.stringify(p, null, 1)); updateSettings(s => { s.stopRestore1022 = new Date().toISOString(); }); } catch (e) { } } }
// TRADES MIGRATION (audit 22 Oct): part and half sales were stored with kind 'xxx-part' / 'xxx-half', which counted the owner's own
// part sales as system trades. The kind is now clean and the row carries part / half instead.
{ const ST = readSettings(); if (ST && !ST.tradesMig1022) { try { const MT0 = 'data/my-trades.jsonl'; if (fs.existsSync(MT0)) { const L = fs.readFileSync(MT0, 'utf8').split('\n').filter(Boolean).map(l => { try { const t = JSON.parse(l); const m = String(t.kind || '').match(/^(.*)-(part|half)$/); if (m) { t.kind = m[1] || 'manual'; if (m[2] === 'half') t.half = true; else t.part = t.part || true; } return JSON.stringify(t); } catch (e) { return l; } }); fs.writeFileSync(MT0, L.join('\n') + (L.length ? '\n' : '')); }
    updateSettings(s => { s.tradesMig1022 = new Date().toISOString(); }); } catch (e) { } } }
const HELP = 'You do not need these. Tap the buttons in the bar (send  menu  to show it again), or write or forward anything. For reference, you can ask in plain words:\nfrom ClayTrader what to buy   (any source or channel you logged)\nwhen to sell VRTX\nreview   (HOLD or SELL study of every stock you own, from its own past)\nreview ZETA   (one stock)\nshould I buy more VRTX\nwhen to buy LPG\npenny stock for today\nlook for energy stocks\nwhat to buy today\nstrongest stocks\n\nOr use the commands:\nleaders   (the strongest stocks to ride, with buy range, stop and exit rule)\nradar   (today\u2019s early-wave board: buy reviews, pre-wave watches, do-not-chase; new rules, paper only)\ntoday   (the short plan: what to buy, stop, when to sell, with live prices)\ndetails   (the long version with every setup)\nreport   (last night\u2019s full scan report)\nmarket   (indexes, sectors and headlines right now)\nday trades   (fast movers: which day-trade and overnight rules passed five years of tests, and today\u2019s list)\nnews watch   (the latest threat headlines about your stocks, their competitors and their industry; checked every 15 minutes)\nmovers   (stocks up 20%+ right now, with the news: investigate, do not chase)\nhalal BFLY no   (BFLY is not halal in ZAD: never offered again;  halal BFLY yes  to undo)\ncheck LPG   (analyses ANY ticker now: tested rules, plus news, earnings, analysts, insiders; adds it to my nightly scan)\nremove LPG   (takes it off)\ntips SOURCE NAME + the tickers or the pasted message   (logs a source\u2019s tips, checks each, scores the source)\nsources   (scoreboard of the sources you logged)\nname SOURCE NAME   (gives a name to tips you pasted without one)\nfollow NAME CHANNEL-ID   (follow a YouTube channel: its stock mentions are logged, checked and scored)\nunfollow NAME   |   channels\nbought option HQY 95 2026-11-21 2.40   (the options trial: 1 contract; the bot tells you when to sell;  sold option HQY 95 2026-11-21 PRICE  to close)\nbought VRTX 500.55 20 shares   (with the shares: kept encrypted, used to learn your usual buy size)\nbought VRTX 500.55\nbought VRTX   (uses the current price)\nbought TTD 20.16 stop 10.50 target 15\nfee 3   (your broker fee per buy and per sell, in USD)\nstop VRTX 480\nstop placed   (you placed ALL stops at your broker;  stop placed VRTX  for one. Unconfirmed stops show RISK UNPROTECTED)\ntarget VRTX 516\nsold VRTX 520.10   (records the result in your real record)\nsold half VRTX 520.10   (after target 1: half sold, the rest runs with a trailing stop)\nsold VRTX 520.10 5 shares   (you sold only part)\nadded VRTX 480 5 shares   (you bought more of a stock you hold: I update the average price)\nmy stocks   (what to do with each stock you own: SELL ALL, SELL PART, HOLD or BUY A LITTLE MORE)\nmarket today   (is today a buying day, a selling day or a nothing-to-do day? from the tests and your stocks)\nactions   (the one message to act on: sell, buy with amount and stop, hold)\ndays   (does the buy day matter? Monday to Friday results of the tested rules)\nthemes   (where the money is going: the strongest industries now, the supply chain, and whether following them has worked)\nevents   (company news from SEC filings and the FDA: which kinds of news were followed by gains or by losses, tested)\ntiming   (buy and sell at the open or near the close? and the pre-market / after-hours rules)\nshadow   (the forward paper record of every system signal, bought or not)\npaper   (the Alpaca PAPER account: real fills on every proven buy, fake money)\nquiet on / quiet off   (on = only action messages and alerts; off = every message)\ngoals   (your money goals: back to zero, then 10K, 25K, 50K, 100K, 250K, 500K, 1M, with a timeline plan)\nbudget 5000   (your total trading money: each buy gets 1,000 to 5,000 USD by its evidence, private)\nbudget open   (no budget limit: every proven buy is listed, you decide; size still follows the evidence)\nsize 1000   (your base buy amount for the goals timeline, private)\ntrades 15   (how many buys a month to plan with)\npnl -2000 TTD   (adds a sale result in dollars, when I did not know the shares)\nrecord   (your real results, by kind of trade)\nwinners   (what this week\u2019s winners study learned)\nscore   (every stock scored 0 to 100, and whether the score has worked)\nscore NVDA   (one stock\u2019s score and rank)\nlab   (this week\u2019s hunting lab: new ways to catch moves, tested on two years of the whole market)\nlessons   (what the system learned from its finished trades, and which rules it demoted)\npositions\n\nPaste or forward any market message or advice (Arabic or English): I check its warning signs, what my data says about the themes it names, and which of those stocks have tested support.\n\nI usually reply within a minute. You do not need commands: anything you write or forward is studied, and the important things (buys, sells, stops, targets, the weekly review of your stocks) are sent to you without asking.';
// ONE-TAP MENU. Telegram shows these in the "/" menu (bottom-left Menu button) and as a keyboard bar under the typing box.
// Every entry sends a normal command, so tapping and typing do the same thing.
const MENU = [
  ['actions', 'actions', 'The one message to act on: sell, buy (amount, stop), hold'],
  ['mystocks', 'my stocks', 'What to do with each stock you own'],
  ['day', 'market today', 'Is today a buying, selling or nothing-to-do day? (tested)'],
  ['today', 'today', 'Short plan with live prices'],
  ['check', 'check a stock', 'Deep check of any ticker: send /check NVDA'],
  ['bought', 'i bought', 'Record a buy: /bought NVDA 180.5 10 shares'],
  ['sold', 'i sold', 'Record a sale: /sold NVDA 190.2'],
  ['stopplaced', 'stop placed', 'You placed ALL stops at your broker'],
  ['market', 'market', 'Indexes, sectors and headlines now'],
  ['movers', 'movers', 'Stocks up 20%+ now, with the news (do not chase)'],
  ['daytrades', 'day trades', 'Fast movers: tested day-trade rules and today\u2019s list'],
  ['newswatch', 'news watch', 'Threat headlines about your stocks and their competitors'],
  ['radar', 'radar', 'Early-wave board (paper only)'],
  ['leaders', 'leaders', 'Strongest stocks to ride, with stop and exit'],
  ['themes', 'themes', 'Where the money goes: industries and supply chain'],
  ['events', 'events', 'Company news (SEC, FDA): what it did next, tested'],
  ['catalysts', 'catalysts', 'Upcoming FDA dates and trial readouts (calendar; a buy only if a rule passed)'],
  ['chains', 'chains', 'Value chains: which layers are hot now, and the chain decoder verdicts'],
  ['calendar', 'calendar', 'This week: CPI, jobs, Fed, holidays, your dividends'],
  ['skips', 'skips', 'Buys you skipped, why, and what they did since'],
  ['health', 'health', 'Is every part of the system running?'],
  ['strategies', 'strategies', 'The strategy library: what was tested, what failed, what is waiting'],
  ['league', 'league', 'Agent league: three research agents competing, scored on results only'],
  ['progress', 'progress', 'Proof of work: what was tested, rejected, built and scored lately'],
  ['tier2', 'tier2 on', 'Turn the TRADABLE SMALL addition on or off (tier2 off = proven-only, as before)'],
  ['scoreboard', 'scoreboard', 'You vs the system vs the S&P 500, this week and the last 90 days'],
  ['chase', 'chase', 'Read this before buying a stock that just jumped'],
  ['ladder', 'ladder', 'Your size level: how much per trade now, and what it takes to grow it'],
  ['dips', 'dips', 'Fallen stocks now under their own fair value (watch list, tested every Sunday)'],
  ['research', 'research', 'Every idea tested, result, and what is waiting'],
  ['review', 'review', 'Hold-or-sell study of every stock you own'],
  ['sell', 'what to sell', 'What to sell and why: every reason, tested or not'],
  ['opportunities', 'opportunities', 'Everything worth knowing today, beyond the tested buys, with evidence labels'],
  ['rebalance', 'rebalance', 'Your weights: sell first, trim, where new cash goes'],
  ['record', 'record', 'Your real results'],
  ['goals', 'goals', 'Money goals and timeline'],
  ['paper', 'paper', 'Alpaca PAPER account (fake money study)'],
  ['shadow', 'shadow', 'Forward paper record of every system signal'],
  ['timing', 'timing', 'Buy and sell at the open or the close?'],
  ['days', 'days', 'Does the buy day matter?'],
  ['lab', 'lab', 'This week’s hunting lab results'],
  ['score', 'score', 'Every stock scored 0 to 100'],
  ['sources', 'sources', 'Scoreboard of the sources you logged'],
  ['traders', 'traders', 'Public traders scored on their own call history'],
  ['details', 'details', 'Long version with every setup'],
  ['report', 'report', 'Last night’s full scan report'],
  ['quieton', 'quiet on', 'Only action messages and alerts'],
  ['quietoff', 'quiet off', 'Every message'],
  ['help', 'help', 'All commands explained'],
  ['menu', 'menu', 'Show the button bar again'],
], MENU_V = 13;
const MENU_KB = [['actions', 'my stocks', 'market today'], ['check a stock', 'i bought', 'i sold'], ['market', 'movers', 'day trades'], ['leaders', 'themes', 'events', 'calendar'], ['record', 'goals', 'paper'], ['today', 'review', 'help']];
const MENU_TEXT = ['MENU: tap a button in the bar under the typing box, or the  /  Menu button for the full list.', '',
  'EVERY DAY: market today (buying, selling or nothing-to-do day) | actions (what to do) | my stocks | today', 'AFTER YOU TRADE: i bought, i sold (I show the exact words to send) | stop placed (from the / menu)',
  'ANY STOCK: check a stock (deep check: tested rules, news, SEC filings, analysts, insiders, halal)', 'MARKET NOW: market | movers | day trades (fast movers, tested) | radar',
  'IDEAS AND STUDIES: leaders | themes | events | timing | days | lab | score', 'YOUR RESULTS: record | goals | paper | shadow | review', '',
  'You can still type anything in plain words (Arabic or English), or forward a message.'].join('\n');
async function sendMenu() {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const post = (m, b) => fetch(TG + '/bot' + env.TG_TOKEN + '/' + m, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()).catch(() => null);
  await post('setMyCommands', { commands: MENU.map(([c, , d]) => ({ command: c, description: d.slice(0, 256) })) });
  await post('setChatMenuButton', { chat_id: env.TG_CHAT, menu_button: { type: 'commands' } });
  await post('sendMessage', { chat_id: env.TG_CHAT, text: MENU_TEXT, reply_markup: { keyboard: MENU_KB.map(r => r.map(t => ({ text: t }))), resize_keyboard: true, is_persistent: true, input_field_placeholder: 'Tap a button or type a command' } });
}
// commands that need a ticker or a price: tapped alone, show exactly what to send
const ASK = { 'check a stock': 'Send:  check NVDA   (any ticker). I check the tested rules, news, SEC filings, analysts, insiders, earnings date and halal.', 'check': 'Send:  check NVDA   (any ticker).',
  'i bought': 'Send:  bought NVDA 180.50 10 shares   (ticker, your price, shares). Shares stay encrypted.', 'bought': 'Send:  bought NVDA 180.50 10 shares',
  'i sold': 'Send:  sold NVDA 190.20   (all)  or  sold NVDA 190.20 5 shares   (part)  or  sold half NVDA 190.20', 'sold': 'Send:  sold NVDA 190.20' };
function planFor(sym, entry, sig) {   // levels for a new position, scaled from last night's plan to the price you actually paid
  const q = ((sig && sig.quick) || []).find(x => x.sym === sym), b = ((sig && sig.stocks) || []).find(x => x.sym === sym && x.buyLo);
  if (q) return { kind: 'quick', q: q.q || 'rsi', key: q.key || null, maxHold: q.maxHold || 5, stop: +(entry - (q.buyLo - q.stop)).toFixed(2), t1: q.t1 ? +(entry * q.t1 / q.buyLo).toFixed(2) : null, t2: null, ...(q.t1 && q.tgtNote ? { tmode: q.half ? 'half' : 'all', tnote: q.tgtNote } : {}) };
  const ld = ((sig && sig.leaders) || []).find(x => x.sym === sym);
  if (!q && !b && ld) return { kind: 'leader', stop: +(entry - (ld.buyLo - ld.stop)).toFixed(2), t1: null, t2: null };
  if (b) return { kind: 'entry', key: b.key || null, maxHold: b.maxHold || null, stop: +(entry - (b.buyLo - b.stop)).toFixed(2), t1: b.target ? +(entry * b.target / b.buyLo).toFixed(2) : null, t2: null, ...(b.target ? { tmode: b.half ? 'half' : 'all' } : {}), ...(b.exitBelow ? { exitBelow: +b.exitBelow.toFixed(2) } : {}) };
  const ev = ((sig && sig.evt) || []).find(x => x.sym === sym && x.live); if (ev && !((sig && sig.pead) || []).some(x => x.sym === sym && x.live)) return { kind: 'entry', exitMA: 20, maxHold: ev.hold || 40, stop: +(entry - (ev.buyLo - ev.stop)).toFixed(2), t1: null, t2: null, exitBelow: ev.sma20 };
  const pe = ((sig && sig.pead) || []).find(x => x.sym === sym && x.live); if (pe) return { kind: 'entry', exitMA: 20, maxHold: pe.hold || 40, stop: +(entry - (pe.buyLo - pe.stop)).toFixed(2), t1: null, t2: null, exitBelow: pe.sma20 };
  { const HZ = readJson('data/horizons.json', null), r = HZ && HZ.status === 'OK' ? Object.values(HZ.results).filter(x => x.verdict === 'PROMISING' && (HZ.today[x.setup] || []).includes(sym))[0] : null; if (r) return { kind: 'entry', maxHold: r.hold, stop: +(entry * 0.75).toFixed(2), t1: null, t2: null }; }
  { const OD = readJson('data/octopus-daily.json', null), z = OD && OD.live && OD.today ? OD.today.picks.find(x => x.sym === sym) : null; if (z) return { kind: 'entry', maxHold: 10, stop: +(entry - (z.c - z.stop)).toFixed(2), t1: null, t2: null }; }
  const rd = readJson('data/intraday-radar.json', null), rc = rd && (rd.candidates || []).find(x => x.sym === sym && x.levels && x.group);
  if (rc) return { kind: 'radar', maxHold: 5, stop: +(entry - (rc.levels.entry - rc.levels.stop)).toFixed(2), t1: +(entry + (rc.levels.t1 - rc.levels.entry)).toFixed(2), t2: null };
  return { kind: 'manual', stop: null, t1: null, t2: null };
}
const stopTag = (sym, P, short) => !P.stop ? (short ? ' NO STOP' : ' (NO STOP: send  stop ' + sym + ' PRICE)') : P.stopOk && P.stopOk.price === P.stop ? '' : short ? ' UNCONFIRMED' : ' (RISK UNPROTECTED until the stop is at your broker: then send  stop placed ' + sym + ')';
const posLine = (sym, P, price) => sym + ': bought ' + money(P.entry) + (price ? ', now ' + money(price) + ' (' + (price >= P.entry ? '+' : '') + ((price / P.entry - 1) * 100).toFixed(1) + '%)' : '') + '\n  stop ' + (P.stop ? money(P.stop) : 'NOT SET') + ', target 1 ' + (P.t1 ? money(P.t1) : 'not set') + (P.t2 ? ', target 2 ' + money(P.t2) : '') + (P.ownT ? '\n  target 1 is your own' : P.t1 && P.tmode ? '\n  target tested: ' + (P.tmode === 'half' ? 'sell HALF there, the rest on the exit rule' : 'sell ALL there') + (P.tnote ? ' (' + P.tnote + ')' : '') : P.tnote ? '\n  no target: ' + P.tnote + '. Sell on the exit rule' : '') + (P.kind === 'entry' ? '\n  swing trade: ' + (P.exitBelow ? 'also sell on a daily close under ~' + money(P.exitBelow) + '; ' : '') + (P.maxHold ? 'sell after ' + P.maxHold + ' sessions at the latest' : 'no time limit') : '') + (P.kind === 'manual' ? '\n  your own pick: no tested target or time limit; the stop protects it and I check it every night' : '') + (P.kind === 'leader' ? '\n  leader trade: no fixed target. I raise the stop as it climbs; also sell on a close under its 50 day average' : '') + (P.kind === 'radar' ? '\n  early-wave trade: sell at target 1 or after 5 sessions, whichever comes first' : '') + (P.kind === 'quick' ? '\n  quick trade: also sell on the first close ' + (P.q === 'gap' ? 'below' : 'above') + ' its 5 day average, or after ' + (P.maxHold || 5) + ' sessions' : '');
// "today": the short-trade list. Only setups that passed the tests at the last close, re-priced now.
// ---- YOUR REAL RECORD: every sale you report, split by the kind of trade, so paper and real results can be compared.
const MY_TRADES = 'data/my-trades.jsonl';
// SELL NOTICES (22 Oct): one line per stock per day whenever the bot tells the owner to SELL a held stock. The  sold  command then
// records whether the system said SELL before the sale (and when), so the real record separates discipline from strategy.
function noteSell(sym, why) { try { const f = 'data/sell-notices.jsonl', d = new Date().toISOString().slice(0, 10); let last = null; try { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); for (let i = L.length - 1; i >= Math.max(0, L.length - 400); i--) { const x = JSON.parse(L[i]); if (x.sym === sym) { last = x; break; } } } catch (e) {}
  if (!last || last.d !== d) fs.appendFileSync(f, JSON.stringify({ d, sym, why: String(why || '').slice(0, 120) }) + '\n'); } catch (e) {} }
function sellNoticeBefore(sym, since) { try { const L = fs.readFileSync('data/sell-notices.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x)).filter(x => x.sym === sym && (!since || x.d >= since)); return L.length ? L[0] : null; } catch (e) { return null; } }
// MOOD at the moment of a buy or a sale (optional word in the message): after enough trades, which moods made money and which lost
const moodOf = (t) => { const m = String(t || '').match(/\b(calm|anxious|excited|fomo|fear|scared|bored|angry|confident|hopeful|greedy)\b|\u0645\u062A\u062D\u0645\u0633|\u062E\u0627\u064A\u0641|\u0642\u0644\u0642|\u0647\u0627\u062F\u0626|\u0648\u0627\u062B\u0642/i); if (!m) return null; const w = m[0].toLowerCase();
  return { '\u0645\u062A\u062D\u0645\u0633': 'excited', '\u062E\u0627\u064A\u0641': 'fear', '\u0642\u0644\u0642': 'anxious', '\u0647\u0627\u062F\u0626': 'calm', '\u0648\u0627\u062B\u0642': 'confident', scared: 'fear', greedy: 'fomo' }[w] || w; };
function myRecord(full) {
  const all = fs.existsSync(MY_TRADES) ? fs.readFileSync(MY_TRADES, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  if (!all.length) return 'YOUR REAL RECORD: no sale recorded yet. When you sell, send: sold SYMBOL PRICE';
  const line = (name, a) => { if (!a.length) return null; const w = a.filter(t => t.pct > 0), l = a.filter(t => t.pct <= 0), sw = w.reduce((x, t) => x + t.pct, 0), sl = -l.reduce((x, t) => x + t.pct, 0);
    return name + ': ' + a.length + ' trades, ' + Math.round(w.length / a.length * 100) + '% won, average ' + pcs(a.reduce((x, t) => x + t.pct, 0) / a.length) + (sl > 0 ? ', profit factor ' + (sw / sl).toFixed(2) : ''); };
  const names = { quick: 'Quick trades', entry: 'Swing trades', leader: 'Leaders', radar: 'Early-wave', manual: 'Your own picks' };
  const rows = [line('All system trades', all.filter(t => t.kind !== 'manual')), ...(full ? Object.keys(names).map(k => line(names[k], all.filter(t => t.kind === k))) : [line('Your own picks', all.filter(t => t.kind === 'manual'))])].filter(Boolean);
  // OPEN NOW: your own picks vs the system's picks, at the last close (the losses still open count too)
  { const pos = loadPos(), sg = readJson0('data/signals.json') || {}, last = {}; for (const x of sg.stocks || []) if (x.last) last[x.sym] = x.last;
    const grp = (f) => Object.entries(pos).filter(([k, P]) => f(P) && last[k] && P.entry).map(([k, P]) => last[k] / P.entry - 1), own = grp(P => (P.kind || 'manual') === 'manual'), sys = grp(P => (P.kind || 'manual') !== 'manual'), av = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    if (own.length || sys.length) rows.push('Open now (not yet sold): system picks ' + (sys.length ? sys.length + ', average ' + pcs(av(sys)) : 'none') + ' | your own picks ' + (own.length ? own.length + ', average ' + pcs(av(own)) : 'none') + '.'); }
  { const md = all.filter(t => t.mood && (t.mood.buy || t.mood.sell)); if (md.length) { const by = {}; for (const t of md) { const k = t.mood.buy || t.mood.sell; (by[k] = by[k] || []).push(t.pct); }
      const av = (a) => a.reduce((x, y) => x + y, 0) / a.length, base = av(all.map(t => t.pct)), baseW = all.filter(t => t.pct > 0).length / all.length;
      rows.push('By your mood (20 sales per mood before any verdict; your overall: ' + Math.round(baseW * 100) + '% won, ' + pcs(base) + '): ' + Object.entries(by).map(([k, a]) => k + ' ' + a.length + (a.length >= 20 ? ' sales, ' + Math.round(a.filter(x => x > 0).length / a.length * 100) + '% won, ' + pcs(av(a)) + (av(a) < base - 0.02 ? ' (WORSE than your usual)' : av(a) > base + 0.02 ? ' (better than your usual)' : ' (about your usual)') : ' so far, too few to judge')).join(' | ') + '.'); }
    else rows.push('Mood: add one word to a buy or sale (calm, excited, fomo, anxious, fear, confident). After 20 sales per mood, I compare each mood with your usual result.'); }
  // CALIBRATION: did the system's buys do what their tests promised?
  const cal = all.filter(t => t.test && typeof t.test.win === 'number');
  if (cal.length) { const promW = cal.reduce((a, t) => a + t.test.win, 0) / cal.length, realW = cal.filter(t => t.pct > 0).length / cal.length, promA = cal.filter(t => typeof t.test.net === 'number'), realA = cal.reduce((a, t) => a + t.pct, 0) / cal.length;
    rows.push('Promise vs reality (' + cal.length + ' system buys): tests said ' + Math.round(promW * 100) + '% would win' + (promA.length ? ', average ' + pcs(promA.reduce((a, t) => a + t.test.net, 0) / promA.length) : '') + '; really ' + Math.round(realW * 100) + '% won, average ' + pcs(realA) + (cal.length < 20 ? ' (under 20: too early to judge)' : realA < 0 ? ' (WORSE than tested: be careful)' : '')); }
  if (cal.length >= 20) { const pw = cal.reduce((a, t) => a + t.test.win, 0) / cal.length, rw = cal.filter(t => t.pct > 0).length / cal.length, dr = rw - pw;
    if (Math.abs(dr) > 0.10) rows.push('CALIBRATION ALERT: the tests promised ' + Math.round(pw * 100) + '% wins, reality is ' + Math.round(rw * 100) + '% over ' + cal.length + ' buys (' + (dr < 0 ? 'worse: buy the minimum amount until it recovers' : 'better than promised, but it can still be luck') + ').'); }
  { const ls = all.filter(t => t.lossType); if (ls.length) { const by = {}; for (const t of ls) { const k = t.lossType.replace(/ \(.*$/, ''); by[k] = (by[k] || 0) + 1; } rows.push('Why the losses lost (' + ls.length + '): ' + Object.entries(by).map(([k, n]) => n + ' ' + k).join(', ') + '.'); } }
  return 'YOUR REAL RECORD (after about 0.8% costs; in dollars, your $' + 2 * FEE() + ' broker fees)\n' + rows.join('\n') + (all.length < 20 ? '\nUnder 20 sales: too few to judge.' : '') + (full ? '\nLast sales: ' + all.slice(-5).map(t => t.sym + ' ' + pcs(t.pct)).join(', ') : '');
}
// ---- MONEY GOALS (encrypted, like your share counts). Realized profit after fees, counted from the day goals started
// (your TTD loss included). Ladder: back to zero, then 10K, 25K, 50K, 100K, 250K, 500K, 1M USD. The goals never change how
// much the system tells you to risk: chasing a goal with bigger bets is the fastest way to move away from it.
const GOAL_LADDER = [0, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const goalName = (g) => g === 0 ? 'Back to zero (losses recovered)' : money(g).replace(/\.00$/, '') + ' USD profit';
function addRealized(pv, sym, usd, d, note) {
  if (typeof pv.realized !== 'number') pv.realized = (pv.closed || []).reduce((a, x) => a + (x.usd || 0), 0);
  pv.closed = (pv.closed || []).concat({ sym, usd: +usd.toFixed(2), d, ...(note ? { note } : {}) }).slice(-500); pv.realized = +(pv.realized + usd).toFixed(2);
  if (!pv.goals) pv.goals = { start: d, base: +(pv.realized - usd).toFixed(2), hit: [] };   // goals start with the first recorded sale after this upgrade
}
function goalNews(pv) {
  if (!pv.goals) return ''; const prog = pv.realized - pv.goals.base, out = [];
  for (const g of GOAL_LADDER) if (prog >= g && !pv.goals.hit.includes(g) && (g > 0 || pv.closed.some(x => x.d >= pv.goals.start && x.usd < 0))) { pv.goals.hit.push(g); out.push('MILESTONE REACHED: ' + goalName(g) + '!'); }
  return out.length ? '\n\n' + out.join('\n') + ' Well done. Same rules, same sizes: the next goal comes from repeating what worked, not from bigger bets.' : '';
}
function goalsText() {
  const pv = privRead(), notYet = !pv.goals; if (notYet) { pv.realized = typeof pv.realized === 'number' ? pv.realized : (pv.closed || []).reduce((x, y) => x + (y.usd || 0), 0); pv.goals = { start: ny(Date.now()).d, base: pv.realized, hit: [] }; }   // shown only; the goals really start with your next recorded sale
  const prog = pv.realized - pv.goals.base, since = (pv.closed || []).filter(x => x.d >= pv.goals.start), next = GOAL_LADDER.find(g => !pv.goals.hit.includes(g));
  const days = Math.max(1, (Date.now() - Date.parse(pv.goals.start)) / 86400000), perMonth = prog / days * 30.4;
  const w = since.filter(x => x.usd > 0), l = since.filter(x => x.usd <= 0);
  const lines = [notYet ? 'MONEY GOALS (they start with your next recorded sale, e.g.  sold TTD 12.10 ; private)' : 'MONEY GOALS (realized profit after fees since ' + pv.goals.start + ', private)', 'Now: ' + (prog >= 0 ? '+' : '') + money(prog) + ' USD from ' + since.length + ' sales (' + w.length + ' won, ' + l.length + ' lost' + (w.length ? '; average win +' + money(w.reduce((a, x) => a + x.usd, 0) / w.length) : '') + (l.length ? ', average loss ' + money(l.reduce((a, x) => a + x.usd, 0) / l.length) : '') + ').'];
  for (const g of GOAL_LADDER) { const done = pv.goals.hit.includes(g); lines.push((done ? 'DONE ' : g === next ? 'NEXT ' : '- ') + goalName(g) + (g === next ? ': ' + money(Math.max(0, g - prog)) + ' USD to go' : '')); }
  lines.push(since.length >= 5 && days >= 30 && perMonth > 0 && next !== undefined ? 'Pace: about ' + money(perMonth) + ' USD a month so far, so the next goal in roughly ' + Math.ceil((next - prog) / perMonth) + ' months at this pace (a pace, not a promise).' : 'Pace: too early to measure (needs 5+ sales over a month).');
  // TIMELINE PLAN: your buy size x the expected profit a trade x trades a month
  { const sg0 = readJson('data/signals.json', null), okc = sg0 ? planCands(sg0, {}).filter(x => x.ok) : [], avgAmt = okc.length ? okc.reduce((t, x) => t + amountFor(x, sg0.market, false).usd, 0) / okc.length : null, ub = usualBuy(), size = ub && ub.set ? ub.usd : avgAmt || (ub ? ub.usd : STD_BUY), mine = (pv.closed || []).filter(x => x.d >= pv.goals.start), buys30 = (pv.buys || []).filter(x => Date.now() - Date.parse(x.d) < 30 * 86400000).length;
    const tpm = pv.tradesPerMonth || (buys30 >= 5 ? buys30 : 10);
    let net = null, src = '';
    if (mine.length >= 10) { net = mine.reduce((a, x) => a + x.usd, 0) / mine.length / size; src = 'your own last ' + mine.length + ' sales'; }
    else { const sg = readJson('data/signals.json', null), ok = sg ? planCands(sg, {}).filter(x => x.ok && !x.thin && typeof x.net === 'number') : []; if (ok.length) { net = ok.reduce((a, x) => a + x.net, 0) / ok.length; src = 'the average of today\u2019s proven buys (tested, not yet your live result)'; } else { net = null; } }
    if (net === null) { lines.push('', 'TIMELINE PLAN: NO CURRENT PROVEN SETUP, so no timeline is shown (it is never based on an assumed return). It appears when proven buys exist or after 10+ of your own sales.'); }
    else {
    const at = (sz) => (net + 2 * FEE() / STD_BUY - 2 * FEE() / sz) * sz, month = (sz) => at(sz) * tpm;
    const left = GOAL_LADDER.filter(g => !pv.goals.hit.includes(g)).slice(0, 4);
    const fmtT = (m) => !(m > 0) || !isFinite(m) ? 'not reachable at this pace' : m < 1 ? 'under a month' : m < 24 ? Math.ceil(m) + ' months' : (m / 12).toFixed(1) + ' years';
    lines.push('', 'TIMELINE PLAN: ' + money(size) + ' USD a buy' + (ub && ub.set ? ' (your setting)' : avgAmt ? ' (average amount the system recommends today)' : '') + ' x ' + tpm + ' trades a month' + (pv.tradesPerMonth ? ' (your setting)' : buys30 >= 5 ? ' (your last 30 days)' : ' (assumed)') + ' x ' + pcs(net) + ' a trade after fees, from ' + src + '.',
      'That is about ' + money(at(size)) + ' USD a trade and ' + money(month(size)) + ' USD a month.');
    for (const g of left) lines.push('  ' + goalName(g) + ': ' + fmtT((g - prog) / month(size)) + ' at ' + money(size) + ' a buy; ' + fmtT((g - prog) / month(size * 2)) + ' at ' + money(size * 2) + '; ' + fmtT((g - prog) / month(size * 5)) + ' at ' + money(size * 5));
    lines.push('Bigger buys reach goals faster but lose faster too: your size grows by the ladder (send  ladder ): 2,500 USD a trade after 30+ sales on 10+ days with a positive record. Change the plan:  size 1000  |  trades 15'); } }
  lines.push('The goals never raise your size or risk. To add a sale I could not price in dollars:  pnl -2000 TTD');
  return lines.join('\n');
}
function lessonsText() {
  const LS = readJson('data/lessons.json', null), rs = LS ? Object.entries(LS.rules || {}).map(([k, r]) => r).sort((a, b) => b.n - a.n) : [];
  if (!rs.length) return 'LESSONS: no live paper trade has finished yet. Each finished trade is reviewed after the nightly scan.';
  const endName = { stop: 'stop', target: 'target', rule_exit: 'rule exit', time_exit: 'time limit' };
  return ['LESSONS FROM FINISHED TRADES (live paper, after costs), ' + LS.session, ...rs.slice(0, 10).map(r => (r.demoted ? 'DEMOTED ' : '') + r.name + ': ' + r.n + ' trades, ' + Math.round(r.win * 100) + '% won, average ' + pcs(r.avg)
    + '\n  how they ended: ' + Object.entries(r.ends).map(([k, v]) => v + ' ' + (endName[k] || k)).join(', ')
    + (r.t1Rate !== null ? '\n  reached target 1: ' + Math.round(r.t1Rate * 100) + '% (the test expected about half)' : '') + '\n  typical best price before the exit: ' + pcs(r.medianRunUp)
    + (r.fill && r.fill.inN + r.fill.upN ? '\n  opened inside the buy range ' + r.fill.inN + ' of ' + (r.fill.inN + r.fill.upN) + ' times' + (r.fill.inN ? ' (average ' + pcs(r.fill.inSum / r.fill.inN) + ')' : '') + (r.fill.upN ? '; above it ' + r.fill.upN + ' (average ' + pcs(r.fill.upSum / r.fill.upN) + ', skipped by the plan)' : '') : '')
    + (r.demoted ? '\n  lesson: it loses live, so it is paper only until its record turns positive' : r.n < 10 ? '\n  too few trades to draw a lesson yet' : '')),
    'A rule is demoted automatically after 10+ live trades with a negative average, and restored when the average turns positive.'].join('\n');
}
function soldLesson(P, exit) {
  if (P.t2 && exit >= P.t2) return 'It reached target 2: the plan worked in full.';
  if (P.t1 && exit >= P.t1) return 'It reached target 1: the plan worked.';
  if (P.stop && exit <= P.stop * 1.002) return 'It hit the stop: the loss was capped as planned. One stop is normal; a run of them is a lesson the review will catch.';
  if (P.kind === 'quick') return 'It was sold on the quick-trade rule (the bounce back to the 5 day average, or the time limit) before target 1. That is by design: target 1 is a level only about half of past trades reached, and a dip trade is built to take the bounce back to the average and get out. Every tested result of this rule already includes that exit.';
  if (P.kind === 'radar') return 'It ended on the 5 day time limit before marker 1. The radar record counts this.';
  return 'Sold before the target and above the stop.';
}
// ---- THE PLAN: the one short message. At most 2 buys, each with buy range, stop, sell, how long, what to expect and why.
// A buy needs proof on trades it never saw: 30 or more, and a positive average after YOUR costs (fees by trade size, costPct).
// MY_COST: the cost taken off each RECORDED sale in your trade journal: 3+3 USD on a 1,000 USD trade (0.6%) + 0.2% slippage.
// No two buys from the same industry.
const MY_COST = 0.008, TEST_COST = 0.001, CHEAP_COST = 0.012;
// after-cost average for YOU: stocks under 5 USD are charged 1.2% a round trip (wide spreads, gaps), others 0.8% (MY_COST)
// YOUR BROKER FEE: a fixed fee per buy and per sell (default 3 USD each, change with:  fee 3). Rules are judged on a standard
// 1,000 USD buy: fixed fees + spread (0.2%, or 1% under 5 USD) must still leave a profit. Every card also shows the dollars.
const FEE = () => { const st = readJson0('data/settings.json') || {}; return typeof st.feeUSD === 'number' ? st.feeUSD : 3; }, STD_BUY = 1000;
const costPct = (px, usd) => 2 * FEE() / (usd || STD_BUY) + (px > 0 && px < 5 ? 0.01 : 0.002);
const netOf = (avg, px) => typeof avg === 'number' ? avg + TEST_COST - costPct(px, STD_BUY) : null;
// always shown per $1,000, so every card compares the same way
const usdLine = (net, gross, px) => { if (net === null) return ''; const sz = STD_BUY, fees = 2 * FEE(), n2 = gross + TEST_COST - costPct(px, sz);
  return ' (on a ' + '$' + Math.round(sz) + ' buy: about ' + (n2 >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(n2 * sz)) + ' after your $' + fees + ' broker fees' + (fees / sz > 0.01 ? '. WARNING: the fees alone are ' + (fees / sz * 100).toFixed(1) + '% of this buy; buy about $' + Math.ceil(fees / 0.005 / 100) * 100 + '+ or the fee eats the gain' : '') + ')'; };
// Ranking by evidence, not by luck: average after costs, weighted by how many unseen trades back it (more trades, more trust).
const evid = (net, n) => (net || 0) * Math.sqrt(Math.min(n || 0, 200));
const secGroup = (x) => !x ? null : /biotech|pharma|life sciences|health/i.test(x) ? 'Health care and biotech' : /semiconductor/i.test(x) ? 'Semiconductors' : x;
const pcs = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
// BUY evidence: 30+ unseen trades with a positive average after costs, OR an EARLY-EVIDENCE buy: 15 to 29 unseen trades
// with a strong average (+1.5% or more after costs) and at least half won. Early-evidence buys get a smaller size and are
// demoted automatically if their live record turns negative.
// MIN_NET: a proven buy must also clear +0.4% a trade after your $6 fees and the spread (about $4 per $1,000): a tiny edge is not worth the risk.
const MIN_NET = 0.004;
const okEv = (n, net, win) => (n >= 30 && net >= MIN_NET) || (n >= 15 && net >= 0.015 && (win || 0) >= 0.5);
// The full picture of a tested rule on this stock, after your fees and spread: average win, average loss, profit factor, and a
// SAFETY MARGIN (lower bound: the average minus 1.28 standard errors, so there is only about a 1 in 10 chance the true average is
// lower). RANK = that lower bound divided by what the stop would cost. It ranks trades by profit for the risk taken, not by score.
const distOf = (pcts, px) => { if (!Array.isArray(pcts) || pcts.length < 5) return null; const c = costPct(px, STD_BUY) - TEST_COST, r = pcts.map(p => p - c), n = r.length, m = r.reduce((a, x) => a + x, 0) / n;
  const w = r.filter(x => x > 0), l = r.filter(x => x <= 0), sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)), gw = w.reduce((a, x) => a + x, 0), gl = -l.reduce((a, x) => a + x, 0);
  return { n, avg: m, aw: w.length ? gw / w.length : 0, al: l.length ? -gl / l.length : 0, pf: gl > 0 ? gw / gl : 99, lb: m - 1.28 * sd / Math.sqrt(n), worst: Math.min(...r) }; };
// HIGH CONVICTION label (a label only, nothing is hidden): 60+ unseen trades, +0.8% or more after costs, a cautious (95%) lower
// bound on the win rate of at least 50%, stop no wider than 12%, and not losing on live paper.
const wilsonLo = (p, n) => { if (!(n > 0) || typeof p !== 'number') return 0; const z = 1.96, d = 1 + z * z / n; return (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d; };
const highConv = (x) => !x.thin && x.n >= 60 && x.net >= 0.008 && wilsonLo(x.win, x.n) >= 0.5 && x.lo > 0 && x.stop > 0 && (x.lo - x.stop) / x.lo <= 0.12 && !(x.live && x.live.n >= 10 && x.live.avg <= 0);
const rankOf = (x) => { if (!x.d || !(x.lo > 0) || !(x.stop > 0)) return null; const mid = (x.lo + x.hi) / 2, risk = (mid - x.stop) / mid + costPct(mid, STD_BUY); return risk > 0 ? x.d.lb / risk : null; };
const distText = (d) => !d ? '' : 'Winners averaged ' + pcs(d.aw) + ', losers ' + pcs(d.al) + ', profit factor ' + (d.pf >= 20 ? 'over 20' : d.pf.toFixed(1)) + '. Safety margin (lower bound of the average): ' + pcs(d.lb) + (d.lb > 0 ? '' : ', so the edge could still be luck');
function planCands(sig, held0) { const c0 = planCands0(sig, held0), LT = (sig && sig.lottery) || {};
  // LOTTERY AVOID (tested 19 Oct, autolab M15: stocks with a 15%+ one-day jump in the last month lagged the average stock by about 3% over the next month, t -5): never a buy
  for (const x of c0) if (LT[x.sym] >= 0.15) { x.ok = false; x.lottery = LT[x.sym]; x.avoid = 'AVOID: lottery-like (a ' + Math.round(LT[x.sym] * 100) + '% one-day jump in the last month); tested 19 Oct: such stocks lagged the average stock by about 3% over the next month (t -5)'; }
  // TIPSTER FADE (Agent C, 20 Oct, C-FADE1): a tip source whose tips lag the average stock with t <= -2 on 10+ tips over 5+ days is FADE; its
  // recent buy tips become AVOID for 20 sessions after each tip (data/tip-score.json, re-scored every study run).
  { const TS = readJson0('data/tip-score.json'), FD = {}; for (const f of (TS && TS.fade) || []) if (f && f.sym && !FD[f.sym]) FD[f.sym] = f.src;
    for (const x of c0) if (FD[x.sym] && x.ok) { x.ok = false; x.fade = FD[x.sym]; x.avoid = 'AVOID: tipped by ' + FD[x.sym] + ', a source whose tips lagged the average stock (tested: FADE); avoid for 20 sessions after the tip'; } }
  // FOLLOW-LANE FADE (23 Oct): buy calls of public traders whose own call history lags the average stock (follow-lane.mjs FADE), avoided for
  // 20 sessions after the entry (data/follow-fade.json); same AVOID wording, so the ACTIONS AVOID line picks them up.
  { const FF = followFade(); for (const x of c0) if (FF[x.sym] && x.ok) { x.ok = false; x.fade = FF[x.sym]; x.avoid = 'AVOID: tipped by ' + FF[x.sym] + ', a source whose tips lagged the average stock (tested: FADE); avoid for 20 sessions after the tip'; } }
  // LIVE LOSING ENGINES (22 Oct): an engine whose live record says LOSING (20+ future-day trades, negative, behind the S&P) cannot
  // produce a buy line at all; it keeps logging on paper (the record stays visible) but never competes for the owner's money.
  // (audit 22 Oct) per engine kind, from the scorecard rows themselves, not from rendered text
  let WK = new Set(); try { WK = workingKinds(); const lose = new Map();
    for (const r of SC_ROWS) { if (!/^LOSING/.test(r.verdict || '')) continue; const e = r.engine, k = scRowKind(e);
      if (k && !lose.has(k)) lose.set(k, e.replace(/ \(.*?\)/g, '') + ': ' + r.n + ' trades, average ' + pcs(r.avg)); }
    for (const x of c0) if (x.ok && lose.has(x.kind)) { x.ok = false; x.losingLive = true; x.avoid = 'PAPER ONLY: this engine is LOSING on its live record (' + lose.get(x.kind) + ')'; } } catch (e) {}
  // FOCUS MODE inside the gate (audit 22 Oct): while no engine is proven live, engine trades are paper only on EVERY path (alerts,
  // buttons, replies), not only in ACTIONS. Earnings drift stays as the owner's labelled choice (21 Oct).
  // (review S-14) per kind: only the kinds in workingKinds() are lifted
  { const FOCUS = (readJson0('data/settings.json') || {}).focus !== false; if (FOCUS) for (const x of c0) if (x.ok && x.kind !== 'earnings drift' && !WK.has(x.kind)) { x.ok = false; x.paperOnly = true; x.avoid = 'PAPER ONLY: focus mode, ' + (WK.size ? 'the ' + x.kind + ' engine has not' : 'no buy engine has') + ' proven itself live yet (its ' + x.kind + ' is logged on paper)'; } }
  return c0; }
// ONE GATE FOR EVERY REPLY (audit 22 Oct): null when a buy line may be shown for this stock, otherwise the reason it may not.
function gateVerdict(sym, sig) { try { sig = sig || readJson0('data/signals.json'); if (myHalal(sym) === 'fail') return 'you marked it NOT halal in ZAD';
  const lot = ((sig && sig.lottery) || {})[sym]; if (lot >= 0.15) return 'lottery-like (a ' + Math.round(lot * 100) + '% one-day jump in the last month; tested to lag)';
  const TS = readJson0('data/tip-score.json'), fd = ((TS && TS.fade) || []).find(f => f.sym === sym); if (fd) return 'tipped by ' + fd.src + ', a source whose tips lag (FADE)'; const ff = followFade()[sym]; if (ff) return 'tipped by ' + ff + ', a source whose tips lag (FADE)';
  const ew = eventWarn(sym); if (ew) return ew.replace(/^\s*\|\s*/, '').slice(0, 140);
  if (BIOBLOCK.has(sym)) return 'dilution / trial-risk block (' + String(BIOBLOCK.get(sym)).slice(0, 100) + ')';   // review S-5
  // (review S-5, 22 Oct) every plan block gives a reason; before, the blocks without an avoid text fell through and passed with focus off
  const pc = sig ? planCands(sig, {}).find(x => x.sym === sym) : null; if (pc && pc.ok) return null;
  if (pc && !pc.ok) return pc.avoid ? pc.avoid.replace(/^(AVOID|PAPER ONLY):\s*/, '') : pc.threatBlock ? 'threat headline in the last 24 hours' : pc.macroBlock ? 'macro: ' + pc.macroBlock : pc.watch ? 'early evidence (under 30 unseen trades): watch only' : pc.newsBlock ? 'bad-news filing' : pc.regBlock ? 'falling market (no record of its own in falling markets)' : 'not cleared by the plan gates';
  const FOCUS = (readJson0('data/settings.json') || {}).focus !== false; if (FOCUS && !(pc && workingKinds().has(pc.kind))) return 'focus mode: ' + (pc ? 'the ' + pc.kind + ' engine has not' : 'no tested engine for this stock has') + ' proven itself live yet';   // per kind (review S-14)
  return null; } catch (e) { return 'gate check failed (' + String(e && e.message).slice(0, 60) + ')'; } }   // an error means blocked (review S-5)
const gateLines = (lines, gv) => gv ? lines.map(l => /^CONCLUSION/.test(l) && /\bBUY\b/.test(l) ? 'CONCLUSION: PAPER ONLY (' + gv + '). Levels for the record: ' + l.replace(/^CONCLUSION[^:]*:\s*/, '').replace(/\b(ENTRY CONFIRMED\.\s*)?BUY\b/g, 'range') : l) : lines;
function planCands0(sig, held0) {
  const c = [], HM = HALALM(), held = new Proxy(held0 || {}, { get: (o, k) => o[k] || (HM[k] && HM[k].s === 'fail' ? { notHalal: true } : undefined) });   // not halal in ZAD: never offered
  for (const q of sig.quickPaused ? [] : (sig.quick || [])) { if (held[q.sym]) continue; const net = netOf(q.avgPct, q.last);
    c.push({ sym: q.sym, kind: 'quick trade', n: q.n, net, live: q.live, lo: q.buyLo, hi: q.buyHi, stop: q.stop, days: q.maxHold || 5, earnDays: q.earnDays, sector: q.sector,
      sell: (q.t1 ? money(q.t1) + (q.half ? ' (half, tested; the rest on ' : ' (all, tested), or the ') : 'the ') + (q.exitText || 'first daily close above its 5 day average') + (q.t1 && q.half ? ')' : ''), tgtNote: q.tgtNote || null,
      wait: 'up to ' + (q.maxHold || 5) + ' trading days, then sell anyway (holding time tested on this stock: the best of ' + (q.q === 'gap' ? '5, 10 and 15' : '3, 5, 7 and 10') + ' days on past data)',
      expect: (q.n ? Math.round(q.win * 100) + '% of ' + q.n + ' past trades it never saw won; average ' + (net === null ? 'n/a' : pcs(net) + usdLine(net, q.avgPct, q.last)) + ' a trade after fees and spread' : 'no tested record') + (q.live ? '. Live paper so far: ' + q.live.n + ' trades, average ' + pcs(q.live.avg) : '') + (q.demoted ? '. DEMOTED: this rule lost money on live paper, so it is paper only' : ''),
      why: q.q === 'gap' ? 'strong gap up on heavy volume, held near the high' : 'a short dip inside an uptrend' + (q.what ? ' (' + q.what + ')' : ''),
      ok: okEv(q.n, net, q.win) && !q.demoted, thin: q.n < 30, cheap: q.last < 5, score: evid(net, q.n), d: distOf(q.pcts, q.last), win: q.win, r10: q.r10, r20: q.r20 }); }
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo)) { if (held[b.sym]) continue; const net = netOf(b.avgPct, b.last);
    c.push({ sym: b.sym, kind: 'swing trade', n: b.n, net, live: b.live, lo: b.buyLo, hi: b.buyHi, stop: b.stop, days: b.days || 20, earnDays: b.earnDays, sector: b.sector,
      sell: b.target ? money(b.target) + (b.half ? ' (half, tested; the rest on a daily close under ~' + money(b.exitBelow) + ')' : ' (all, tested), or a daily close under ~' + money(b.exitBelow)) : 'when it closes under ~' + money(b.exitBelow) + ' (no fixed target)', tgtNote: b.tgtNote || null,
      wait: (b.days ? 'about ' + b.days + ' trading days is typical' : 'days to weeks') + (b.maxHold ? '; sell after ' + b.maxHold + ' days at the latest (the test chose this over no limit, on this stock\u2019s own past)' : '; no time limit (the test chose this over a 20 day limit, on this stock\u2019s own past)'),
      expect: (b.n ? Math.round(b.win * 100) + '% of ' + b.n + ' past trades it never saw won; average ' + (net === null ? 'n/a' : pcs(net) + usdLine(net, b.avgPct, b.last)) + ' a trade after fees and spread' + (b.hit ? '; target reached in ' + Math.round(b.hit * 100) + '%' : '') : 'tested rule, record not stored') + (b.live ? '. Live paper so far: ' + b.live.n + ' trades, average ' + pcs(b.live.avg) : '') + (b.demoted ? '. DEMOTED: this rule lost money on live paper, so it is paper only' : ''),
      why: String(b.why || 'a tested entry signal fired').split('. ')[0].replace(/\.$/, ''),
      ok: okEv(b.n, net, b.win) && !b.demoted, thin: b.n < 30, cheap: b.last < 5, score: evid(net, b.n), d: distOf(b.pcts, b.last), win: b.win, r10: b.r10, r20: b.r20 }); }
  const RD = readJson('data/intraday-radar.json', null);
  if (RD && RD.session === ny(Date.now()).d && marketOpen(Date.now())) for (const r of (RD.candidates || []).filter(x => x.proven && x.levels && !held[x.sym])) {
    const L0 = r.levels; c.push({ sym: r.sym, kind: 'early-wave ' + (String(r.group || '').startsWith('pullback') ? 'pullback' : 'breakout') + ' (radar, today)', lo: L0.lo, hi: Math.min(L0.noEntryAbove, Math.max(L0.hi, L0.lo)), stop: L0.stop, days: 5, earnDays: null, sector: null,
      sell: money(L0.t1) + ' (marker 1), or after 5 trading days', wait: 'up to 5 trading days', expect: r.record || 'proven on paper',
      why: (String(r.group || '').startsWith('pullback') ? 'broke the first-45-minute high, pulled back to it and turned up' : 'broke above the high of the first 45 minutes') + (r.catalyst && r.catalyst.status === 'STRONG' ? '; news: ' + r.catalyst.kind : ''),
      ok: true, score: 0.0005 }); }
  const fair = (sig.leadFair && sig.leadFair.state) || 'NOT RUN';
  for (const r of sig.leaders || []) { if (held[r.sym]) continue;
    c.push({ sym: r.sym, kind: 'trend trade', lo: r.buyLo, hi: r.buyHi, stop: r.stop, days: 30, earnDays: r.earnDays, sector: r.sector,
      sell: 'no fixed target. Sell when it closes under the stop (I raise it as it climbs) or under its 50 day average (~' + money(r.e50) + ')',
      wait: 'weeks, as long as the trend holds',
      expect: fair === 'PROVISIONALLY PROMISING' ? 'passed the whole-market fair test; live record still building' : 'NOT proven on the whole-market fair test (' + fair.toLowerCase() + ')',
      why: 'one of the strongest stocks: ' + pcs(r.mom) + ' in 6 months',
      ok: fair === 'PROVISIONALLY PROMISING', score: -0.001 }); }
  const ESnow = readJson0('data/earnings-study.json'), peadLive = !!(ESnow && ESnow.verdict === 'PROMISING');   // the CURRENT verdict decides, not the one stored in last night's signals (22 Oct)
  for (const e of (sig.pead || []).filter(x => x.live && peadLive && !held[x.sym])) { const t = e.test || {};
    c.push({ sym: e.sym, kind: 'earnings drift', outsideTest: e.inTest === false, n: t.n || null, net: typeof t.avg === 'number' ? t.avg : null, lo: e.buyLo, hi: e.buyHi, stop: e.stop, days: e.hold, earnDays: null, sector: null,
      sell: 'when it closes under its 20 day average (~' + money(e.sma20) + ' now, rising) or after ' + e.hold + ' sessions', wait: 'days to weeks, up to ' + e.hold + ' sessions',
      expect: (t.n ? Math.round((t.win || 0) * 100) + '% of ' + t.n + ' past earnings beats it never saw won; average ' + pcs(t.avg) + ' a trade after costs (whole-market fair test)' : 'whole-market fair test passed'),
      why: 'earnings beat the estimate by ' + Math.round(e.sur * 100) + '% and the stock closed up ' + pcs(e.up) + ' on the news', ok: true, thin: false, score: 0.002 }); }
  for (const e of (sig.evt || []).filter(x => x.live && !held[x.sym] && !(sig.pead || []).some(p => p.sym === x.sym && p.live))) { const t = e.test || {};
    c.push({ sym: e.sym, kind: 'event drift', n: t.n || null, net: typeof t.avg === 'number' ? t.avg : null, lo: e.buyLo, hi: e.buyHi, stop: e.stop, days: e.hold, earnDays: null, sector: null,
      sell: 'when it closes under its 20 day average (~' + money(e.sma20) + ' now, rising) or after ' + e.hold + ' sessions', wait: 'days to weeks, up to ' + e.hold + ' sessions',
      expect: (t.n ? Math.round((t.win || 0) * 100) + '% of ' + t.n + ' past cases it never saw won; average ' + pcs(t.avg) + ' a trade after costs, better than stocks that jumped the same way without the news' : 'whole-market fair test passed'),
      why: e.name + ' (filed ' + e.p + ' New York time), and the stock closed up ' + pcs(e.up) + ' on it', ok: true, thin: false, score: 0.002 }); }
  // OCTOPUS: the many-angle model's top 5 of the whole market, ONLY when its 5-year unseen test passed AND its live paper record
  // passed (30+ picks over 10+ days, positive, half or more won). Exit: the close 10 trading days after buying (the tested exit).
  { const OD = readJson0('data/octopus-daily.json'); if (OD && OD.live && OD.today && sig.session && OD.today.d >= sig.session) for (const z of OD.today.picks) { if (held[z.sym] || c.some(x => x.sym === z.sym)) continue; const t = OD.test && OD.test.newer, r = OD.record || {};
      c.push({ sym: z.sym, kind: 'octopus', n: t ? t.n : null, net: t ? t.avg : null, lo: z.lo, hi: z.hi, stop: z.stop, days: 10, earnDays: null, sector: null,
        sell: 'at the close on the 10th trading day after you buy (the tested exit), or earlier only at the safety stop', wait: '10 trading days',
        expect: (t ? Math.round((t.win || 0) * 100) + '% of ' + t.n + ' unseen 5-year picks won, average ' + pcs(t.avg) + ' a trade after costs' : 'tested') + '; live paper ' + r.n + ' picks, ' + pcs(r.avg) + ' a trade',
        why: 'top 5 of the whole market on 26 linked angles (momentum, volume, industry, SEC news, market mood) in the model retrained every Sunday', ok: true, thin: false, score: 0.002 }); } }
  // HORIZONS: stocks in a mid / long-term setup whose 1-6 month test PASSED (bought at the open, sold after the tested hold, safety stop 25% under the entry)
  { const HZ = readJson0('data/horizons.json'); if (HZ && HZ.status === 'OK') for (const r of Object.values(HZ.results).filter(r => r.verdict === 'PROMISING').sort((a, b) => b.results.newer.avg - b.results.newer.ctrl - (a.results.newer.avg - a.results.newer.ctrl))) for (const sym of (HZ.today[r.setup] || []).slice(0, 5)) {
      if (held[sym] || c.some(x => x.sym === sym)) continue; const q = (sig.stocks || []).find(b => b.sym === sym), last = q && q.last; if (!(last > 0)) continue; const n = r.results.newer;
      c.push({ sym, kind: 'mid-term', n: n.n, net: n.avg, lo: +(last * 0.99).toFixed(2), hi: +(last * 1.02).toFixed(2), stop: +(last * 0.75).toFixed(2), days: r.hold, earnDays: null, sector: q.sector || null,
        sell: 'after ' + r.months + ' month' + (r.months > 1 ? 's' : '') + ' (' + r.hold + ' sessions, the tested hold), or at the safety stop', wait: r.months + ' month' + (r.months > 1 ? 's' : ''),
        expect: Math.round(n.win * 100) + '% of ' + n.n + ' unseen trades won; average ' + pcs(n.avg) + ' vs ' + pcs(n.ctrl) + ' for an average stock held as long',
        why: r.name + ' (mid / long-term setup, tested on 5 years)', ok: true, thin: false, score: 0.002 }); } }
  // NEWS GATE (precaution, not tested): no buy today for a stock the news watch flagged with a threat headline in the last 24 hours.
  { let L = []; try { L = fs.readFileSync('data/news-log.jsonl', 'utf8').trim().split('\n').slice(-400).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { }
    const bad = new Set(L.filter(a => a.th && a.sym && Date.now() - Date.parse(a.at) < 864e5).map(a => a.sym)); for (const x of c) if (x.ok && bad.has(x.sym)) { x.ok = false; x.threatBlock = true; } }
  // MACRO GATE (tested, calendar study): no new buy in an industry that lagged the market after this kind of surprise in both halves;
  // a buy in an industry that beat the market is marked as a tailwind and moved to the front
  for (const m of macroNow()) for (const x of c) { const g = m.indOf(x.sym); if (!g) continue;
    if (x.ok && m.downSet.has(g)) { x.ok = false; x.macroBlock = m.label; } else if (m.upSet.has(g)) { x.macroUp = m.label; x.why = (x.why ? x.why + '; ' : '') + 'tailwind: its industry beat the market after ' + m.label.toLowerCase() + ' in past tests'; x.score = (x.score || 0) + 0.001; } }
  c.sort((a, b) => (b.macroUp ? 1 : 0) - (a.macroUp ? 1 : 0));
  // EARLY EVIDENCE IS WATCH-ONLY (owner's decision, 12 Oct): 15-29 unseen trades can be luck. Such setups are logged on paper and
  // listed in one WATCH line; they become BUYs by themselves once they reach 30+ unseen trades with a positive result.
  for (const x of c) if (x.thin && x.ok) { x.ok = false; x.watch = true; }
  // BAD-NEWS GATE: no buy within 10 days of a filing kind the event study proved is followed by losses (e.g. a share offering).
  for (const x of c) if (x.ok && eventWarn(x.sym)) { x.ok = false; x.newsBlock = true; }
  // FALLING-MARKET GATE: when the S&P 500 is under its 50 day average or in a downtrend, a quick or swing rule is offered only if
  // its OWN unseen trades made money in falling markets (10+ such trades). Its record there is in the per-stock test.
  { const mk = sig.market || {}, weak = mk.above50 === false || mk.up === false;
    if (weak) for (const x of c) if (x.ok && /quick|swing/.test(x.kind || '')) { const src = x.kind === 'quick trade' ? (sig.quick || []).find(q => q.sym === x.sym) : (sig.stocks || []).find(b => b.sym === x.sym), dn = src && src.reg && src.reg.down;
      if (!dn || dn.n < 10 || !(dn.avgR > 0)) { x.ok = false; x.regBlock = true; } } }
  return c;
}
// Your accepted loss per trade (set with:  risk 50). Only this one number is stored; share counts are worked out in the message.
const myRisk = () => null;     // retired: the system sizes each buy itself
// PRIVATE FIGURES (share counts, money amounts). The repository is public, so these are kept ENCRYPTED in data/private.enc with
// the GitHub secret PRIVATE_KEY. Without that secret nothing is stored: the numbers are used for the reply and then forgotten.
const PRIV_FILE = 'data/private.enc', privKey = () => env.PRIVATE_KEY ? crypto.createHash('sha256').update(String(env.PRIVATE_KEY)).digest() : null;
function privRead() {
  const k = privKey(); if (!k || !fs.existsSync(PRIV_FILE)) return { buys: [], shares: {} };
  try { const b = Buffer.from(fs.readFileSync(PRIV_FILE, 'utf8'), 'base64'), d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString()); }
  catch (e) { return { buys: [], shares: {} }; }
}
function privWrite(o) {
  const k = privKey(); if (!k) return false; const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv), enc = Buffer.concat([c.update(JSON.stringify(o)), c.final()]);
  fs.writeFileSync(PRIV_FILE, Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')); return true;
}
// Your usual buy, learned from what you actually buy (the median of your last 10 buys in USD). Sizes are suggested relative to it.
const usualBuy = () => { const pv0 = privRead(); if (pv0.buyUSD > 0) return { usd: pv0.buyUSD, n: 99, set: true }; const b = (privRead().buys || []).slice(-10).map(x => x.usd).filter(x => x > 0).sort((a, c) => a - c); return b.length ? { usd: b[Math.floor(b.length / 2)], n: b.length } : null; };
// The account size is private: it comes ONLY from the GitHub secret ACCOUNT_USD, never from a file (the repository is public).
const myAccount = () => { const v = +(env.ACCOUNT_USD || 0); return v > 0 ? v : null; };
{ const st = readSettings(); if (st && (st.accountUSD !== undefined || st.riskUSD !== undefined)) updateSettings(s => { delete s.accountUSD; delete s.riskUSD; }); }   // scrub any amount saved earlier
// SIZING DECIDED BY THE SYSTEM. How much of the account a trade may lose depends on how strong its evidence is, how it has
// done live, and the market. 0.5% is the normal bet; strong, long records earn up to 1%; thin records, live losses, a weak
// market or a paper-only setup get less. A position is never more than a fifth of the account.
function sizeFor(x, mk) {
  const n = x.n || 0, net = x.net === undefined || x.net === null ? null : x.net, why = [];
  let pct = 0.005;
  if (x.kind && /radar/.test(x.kind)) { pct = 0.0025; why.push('early-wave setup: smaller bet'); }
  else if (x.thin) { pct = 0.0025; why.push('EARLY EVIDENCE, only ' + n + ' tested trades: half the normal size'); }
  else if (n >= 100 && net >= 0.015) { pct = 0.01; why.push('long, strong record (' + n + ' trades, ' + pcs(net) + ')'); }
  else if (n >= 60 && net >= 0.01) { pct = 0.0075; why.push('strong record (' + n + ' trades, ' + pcs(net) + ')'); }
  else if (n < 40 || (net !== null && net < 0.005)) { pct = 0.0035; why.push('thinner evidence (' + n + ' trades' + (net !== null ? ', ' + pcs(net) : '') + ')'); }
  else why.push('normal evidence (' + n + ' trades' + (net !== null ? ', ' + pcs(net) : '') + ')');
  if (x.cheap) { pct *= 0.5; why.push('cheap stock under 5 USD: halved'); }
  if (x.live && x.live.n >= 10) { if (x.live.avg > 0) { pct *= 1.2; why.push('making money live'); } else { pct *= 0.5; why.push('losing live: halved'); } }
  if (mk && (mk.up === false || mk.above50 === false)) { pct *= 0.5; why.push('weak market: halved'); }
  { const sd = x.lo > 0 && x.stop > 0 ? (x.lo - x.stop) / x.lo : 0; if (sd > 0.08) { pct *= 0.08 / sd; why.push('wide stop (' + Math.round(sd * 100) + '% away): smaller, so a stop-out costs about the same as a normal trade'); } }
  return { pct: Math.min(0.01, pct), why: why.join(', ') };
}
// "Take half, let the rest run": used only when the Sunday exit test (hunting lab, years of data) found it better in both halves.
const HALF_RUN = () => { const h = readJson0('data/hunting-lab.json'); return Boolean(h && h.exitTest && /TAKE HALF/.test(h.exitTest.verdict || '')); };
const t1Text = (sym, P) => P.tmode === 'all' ? 'TARGET (' + money(P.t1) + ') reached: SELL ALL now (the tested plan for this stock sells everything at the target), then send  sold ' + sym + ' PRICE' : (P.tmode === 'half' || HALF_RUN()) && !P.trail ? 'TARGET 1 (' + money(P.t1) + ') reached: SELL HALF now, then send  sold half ' + sym + ' PRICE . I move the stop on the rest to your buy price ' + money(P.entry) + ' and trail it, so the rest can run.' : 'TAKE PROFIT. Target 1 (' + money(P.t1) + ') reached: sell, or sell half and move the stop to ' + money(P.entry) + '.';
// SIZE LADDER (user plan 20 Oct 2026: 1,000 USD a trade now, then 2,500, then 5,000, then more). The most one buy may get is set by
// YOUR REAL RECORD (data/my-trades.jsonl, every sale you reported), with fixed gates written in advance (never tuned on the record):
//   level 1  1,000 USD  : the start.
//   level 2  2,500 USD  : 30+ sales on 10+ different days, total after costs positive, wins pay 1.2x+ the losses (profit factor).
//   level 3  5,000 USD  : 80+ sales over 3+ calendar months, total positive, profit factor 1.3+, 2 of the last 3 months positive.
//   level 4 10,000 USD  : 200+ sales over 6+ months, total positive, profit factor 1.3+, 4 of the last 6 months positive.
// STEP DOWN at once (one level) when your last 20 sales lost money in total after costs. Results are per 1,000 USD traded
// (percent per trade minus 0.8% costs), so a bigger size never makes an old record look better. The other caps still apply:
// 20% of your budget for one stock, and a hit stop costs at most 1.5% of your budget.
const LADDER = [1000, 2500, 5000, 10000];
let LADDER_C; function ladder() { if (LADDER_C) return LADDER_C;
  const rows = []; try { for (const l of fs.readFileSync('data/my-trades.jsonl', 'utf8').split('\n')) { if (!l.trim()) continue; try { const x = JSON.parse(l); if (typeof x.pct === 'number' && isFinite(x.pct) && x.out) { const pm = typeof x.part === 'string' ? x.part.match(/(\d+(?:\.\d+)?) of (\d+(?:\.\d+)?)/) : null, w = x.half ? 0.5 : pm ? +pm[1] / +pm[2] : x.part ? 0.5 : 1; rows.push({ d: String(x.out).slice(0, 10), r: x.pct * w, whole: !(x.half || x.part) }); } } catch (e) {} } } catch (e) {}   // pct is stored already after the 0.8% cost (audit 22 Oct: it was deducted twice)
  rows.sort((a, b) => a.d < b.d ? -1 : 1);
  const n = rows.filter(z => z.whole).length, days = new Set(rows.filter(z => z.whole).map(z => z.d)).size, tot = rows.reduce((a, z) => a + z.r, 0), gain = rows.filter(z => z.r > 0).reduce((a, z) => a + z.r, 0), loss = -rows.filter(z => z.r < 0).reduce((a, z) => a + z.r, 0), pf = loss > 0 ? gain / loss : (gain > 0 ? 99 : 0);
  const byM = {}; for (const z of rows) byM[z.d.slice(0, 7)] = (byM[z.d.slice(0, 7)] || 0) + z.r; const ms = Object.keys(byM).sort(), lastPos = (k) => ms.slice(-k).filter(m => byM[m] > 0).length;
  let lv = 0; if (n >= 30 && days >= 10 && tot > 0 && pf >= 1.2) lv = 1; if (lv === 1 && n >= 80 && ms.length >= 3 && pf >= 1.3 && lastPos(3) >= 2) lv = 2; if (lv === 2 && n >= 200 && ms.length >= 6 && pf >= 1.3 && lastPos(6) >= 4) lv = 3;
  const last20 = rows.slice(-20).reduce((a, z) => a + z.r, 0), down = n >= 20 && last20 < 0 && lv > 0; if (down) lv--;
  const need = lv === 0 ? '30+ sales on 10+ days (now ' + n + ' on ' + days + '), total positive, profit factor 1.2+ (now ' + pf.toFixed(2) + ')' : lv === 1 ? '80+ sales over 3+ months (now ' + n + ', ' + ms.length + ' months), profit factor 1.3+, 2 of the last 3 months positive' : lv === 2 ? '200+ sales over 6+ months, profit factor 1.3+, 4 of the last 6 months positive' : 'top level';
  return (LADDER_C = { level: lv + 1, max: LADDER[lv], next: LADDER[lv + 1] || null, need, n, days, tot, pf, down,
    text: 'SIZE LEVEL ' + (lv + 1) + ': up to ' + LADDER[lv].toLocaleString('en-US') + ' USD a trade' + (down ? ' (stepped down: your last 20 sales lost money)' : '') + '. Your record: ' + n + ' sales on ' + days + ' days, ' + (tot >= 0 ? '+' : '') + (tot * 100).toFixed(1) + '% in total per 1,000 USD traded after costs (' + ((tot + rows.length * 0.008) >= 0 ? '+' : '') + ((tot + rows.length * 0.008) * 100).toFixed(1) + '% before the 0.8% a trade cost).' + (LADDER[lv + 1] ? ' Next: ' + LADDER[lv + 1].toLocaleString('en-US') + ' USD a trade after ' + need + '.' : '') }); }
// HOW MUCH TO PUT IN EACH BUY: one of 1,000 / 1,500 / 2,000 / 3,000 / 5,000 USD, from the strength of the evidence.
// Never under 1,000 (the 6 USD fees eat a smaller buy). Your budget (send  budget 5000 ) caps the total open at once.
function amountFor(x, mk, top) {
  const weak = mk && (mk.up === false || mk.above50 === false), stopPct = x.lo > 0 && x.stop > 0 ? (x.lo - x.stop) / x.lo : 1, hc = typeof highConv === 'function' && highConv(x), lbOk = x.d && x.d.lb > 0;
  let usd = 1000, why = 'early evidence, cheap stock, trend trade or radar: the minimum';
  if (!x.thin && x.n >= 30 && !x.cheap && /quick|swing|octopus|event drift|earnings drift/.test(x.kind || '')) {
    if (hc && top && stopPct <= 0.08 && !weak) { usd = 5000; why = 'HIGH CONVICTION, top pick, normal stop'; }
    else if (hc) { usd = 3000; why = 'HIGH CONVICTION'; }
    else if (lbOk && stopPct <= 0.12) { usd = 2000; why = 'proven with a safety margin'; }
    else { usd = 1500; why = 'proven, but the edge could still be luck or the stop is wide'; }
  }
  if (weak && usd > 1000) { usd = usd >= 3000 ? usd / 2 : 1000; why += '; weak market: smaller'; }
  if (x.earnDays !== null && x.earnDays !== undefined && x.earnDays <= (x.days || 5) * 1.5 && usd > 1000) { usd = 1000; why += '; earnings inside the hold: minimum'; }
  { const L = ladder(); if (usd > L.max) { usd = L.max; why += '; size level ' + L.level + ' (your real record sets the most per trade)'; } }
  { const b = budgetOnce(); if (b && usd > Math.max(1000, Math.floor(b * 0.2 / 500) * 500)) { usd = Math.max(1000, Math.floor(b * 0.2 / 500) * 500); why += '; capped at 20% of your budget for one stock'; } }
  // RISK PER TRADE: a hit stop should cost at most 1.5% of your budget (so 5 losses in a row cost about 7%). 1,000 USD stays the
  // minimum (your choice); when even 1,000 USD risks more than that, the card says so.
  let riskPct = null; { const b = budgetOnce(); if (b && stopPct > 0 && stopPct < 1) { const cap = Math.floor(b * 0.015 / (stopPct + 0.008) / 100) * 100;
    if (usd > cap) { usd = Math.max(1000, cap); why += cap >= 1000 ? '; kept so a hit stop costs at most 1.5% of your budget' : '; the minimum, and even that risks more than 1.5% of your budget (wide stop)'; } riskPct = usd * (stopPct + 0.008) / b; } }
  return { usd, why, riskPct };
}
let BUDGET_C; const budgetOnce = () => { if (BUDGET_C === undefined) { try { BUDGET_C = privRead().budget || 0; } catch (e) { BUDGET_C = 0; } } return BUDGET_C; };
const budgetRoom = () => { const pv = privRead(), b = pv.budget || 0; if (!b) return null; const pos = loadPos(), open = Object.entries(pv.shares || {}).reduce((a, [k, n]) => a + (pos[k] ? n * pos[k].entry : 0), 0);
  // money that today's SELL lines free up (at the buy prices), so a full budget does not hide which buys fit after the sales
  const selling = Object.keys(pos).filter(k => (pos[k].lastAct && /^SELL ALL/.test(pos[k].lastAct.act) && !/trend is broken/.test(pos[k].lastAct.why || '') && pos[k].lastAct.d >= ny(Date.now() - 4 * 864e5).d) || (pos[k].exitFlag && (!pos[k].since || pos[k].exitFlag.d >= pos[k].since)));
  const freed = selling.reduce((a, k) => a + ((pv.shares || {})[k] || 0) * (pos[k].entry || 0), 0);
  return { budget: b, open, room: Math.max(0, b - open), freed, after: Math.max(0, b - open + freed), selling }; };
// PROTECT MODE (a risk rule fixed in advance, not a tested edge): stop buying while the portfolio is bleeding or buys are piling up.
function protectWhy(held, px, sig) { const lastPx = {}; for (const x of (sig && sig.stocks) || []) if (x.last) lastPx[x.sym] = x.last; const pr = (k) => (px && px[k]) || lastPx[k];
    const syms = Object.keys(held), hit = syms.filter(k => pr(k) && held[k].stop && pr(k) <= held[k].stop), wk = syms.filter(k => held[k].since && Date.now() - Date.parse(held[k].since) < 7 * 864e5);
    const wkAvg = wk.filter(k => pr(k) && held[k].entry).map(k => pr(k) / held[k].entry - 1), avg = wkAvg.length ? wkAvg.reduce((a, b) => a + b, 0) / wkAvg.length : 0, why = [];
    if (hit.length >= 2) why.push(hit.length + ' of your stocks are at or under their stop (' + hit.join(', ') + ')');
    if (wkAvg.length >= 4 && avg <= -0.08) why.push('your ' + wkAvg.length + ' buys of the last 7 days are down ' + (Math.abs(avg) * 100).toFixed(1) + '% on average');
    if (wk.length >= 5) why.push(wk.length + ' buys in 7 days: stocks bought together in a few days tend to fall together');
    return why; }
function planText(sig, pos, px, title, only, full, opts) {
  const short = !only && !full;   // the everyday message: 2 to 3 lines per buy; send  details  for the full cards
  const held = pos || {}, out = [title || 'PLAN'];
  if (!sig) return out.concat('No scan has run yet.').join('\n');
  const c = planCands(sig, held), pick = c.filter(x => x.ok && (!only || only.includes(x.sym))).sort((a, b) => b.score - a.score), skipped = [];
  for (const x of pick) { const g = secGroup(x.sector), first = g && pick.find(p => p !== x && secGroup(p.sector) === g && pick.indexOf(p) < pick.indexOf(x)); if (first) x.sameAs = first.sym; }
  const pv = sig.posVerdict || {}, sells = [], holds = [];
  for (const sym of Object.keys(held)) { const P = held[sym], p = px && px[sym], now = p ? ' Now ' + money(p) + ' (' + pcs(p / P.entry - 1) + ').' : '';
    if (p && P.stop && p <= P.stop) { sells.push(sym + ': SELL NOW. Your stop ' + money(P.stop) + ' is reached.' + now); noteSell(sym, 'stop reached'); }
    else if (eventSell(sym)) { sells.push(sym + ': ' + eventSell(sym) + now); noteSell(sym, eventSell(sym)); }
    else if (p && P.t2 && p >= P.t2) { sells.push(sym + ': SELL. Target 2 (' + money(P.t2) + ') reached.' + now); noteSell(sym, 'target 2 reached'); }
    else if (pv[sym]) { sells.push(sym + ': SELL at the ' + (px ? 'close or next open' : 'open') + '. ' + pv[sym].replace(/^\w/, ch => ch.toUpperCase()).replace(/\.?$/, '.') + now); noteSell(sym, pv[sym]); }
    else if (p && P.t1 && p >= P.t1 && !P.trail) sells.push(sym + ': ' + t1Text(sym, P) + now);
    else holds.push(sym + ': stop ' + (P.stop ? money(P.stop) : 'NOT SET') + (P.t1 ? ', target ' + money(P.t1) : '') + (P.own ? ' (your own stop)' : '') + (p ? ', now ' + money(p) + ' (' + pcs(p / P.entry - 1) + ')' : '')); }
  // PROTECT MODE (a risk rule fixed in advance, not a tested edge): stop buying while the portfolio is bleeding or buys are piling up.
  //  - 2+ of your stocks at or under their stop, or
  //  - your buys of the last 7 days (4+ of them) are down 8%+ on average, or
  //  - 5+ buys in the last 7 days (pace limit: buys made together in a few days fall together).
  const PG = protectWhy(held, px, sig);
  if (PG.length && !only) out.push('', 'CAUTION (protect advice, your decision): ' + PG.join('; ') + '.', 'Suggested: deal with the stops first and buy smaller. Every opportunity is still listed below.');
  if (sells.length && !only) out.push('', 'SELL', ...sells);
  const mk = sig.market || {};
  if (!only && (mk.above50 === false || mk.up === false)) out.push('', 'MARKET: ' + (mk.up === false ? 'the S&P 500 is in a downtrend' : 'the S&P 500 is under its 50 day average (' + pcs(mk.spyVs50) + ')') + '. Dips fail more often in a weak market: consider smaller size.');
  for (const x of c) x.rank = rankOf(x);
  const RK = (x) => typeof x.rank === 'number' ? x.rank : -1e9;
  pick.sort((a, b) => (a.thin ? 1 : 0) - (b.thin ? 1 : 0) || RK(b) - RK(a) || b.score - a.score);   // fully proven first, early evidence after; inside each, best profit for the risk first
  const nFull = pick.filter(x => !x.thin).length;
  // TOP PICK: the single best trade for its risk. It needs a positive safety margin, and no halal screen saying FAIL (unless you marked it halal in ZAD).
  // The full list stays below: how many you buy is your decision.
  let TOPSYM = null;
  if (!only && pick.length) { const hOK = (x) => { const hm = HALALM()[x.sym]; if (hm && hm.s === 'ok') return true; return !halalChecks(x.sym).fail.length && L.halalOf(x.sym, null) !== 'fail'; };
    const top = pick.filter(x => typeof x.rank === 'number' && x.d && x.d.lb > 0 && hOK(x)).sort((a, b) => (highConv(b) ? 1 : 0) - (highConv(a) ? 1 : 0) || (a.thin ? 1 : 0) - (b.thin ? 1 : 0) || b.rank - a.rank)[0];   // a fully proven trade first, if one qualifies
    if (top) { TOPSYM = top.sym; const mid = (top.lo + top.hi) / 2, loss = Math.round(1000 * ((mid - top.stop) / mid + costPct(mid, STD_BUY)));
      out.push('', 'TOP PICK: ' + top.sym + (highConv(top) ? ' (HIGH CONVICTION)' : top.thin ? ' (early evidence)' : '') + '. Best profit for its risk: average ' + pcs(top.d.avg) + ' (safety margin ' + pcs(top.d.lb) + '), winners ' + pcs(top.d.aw) + ', losers ' + pcs(top.d.al) + '; the stop costs about $' + loss + ' per $1,000.'); }
    else if (pick.some(x => x.d)) out.push('', 'TOP PICK: none today. No buy has a safety margin above zero with a clean halal screen, so each could still be luck. The list is your choice; smaller size.'); }
  if (!only) out.push('', short ? 'BUY (' + nFull + ' proven' + (pick.length > nFull ? ', ' + (pick.length - nFull) + ' early' : '') + ')' : 'BUY' + (pick.length ? ' (' + nFull + ' fully proven' + (pick.length > nFull ? ', ' + (pick.length - nFull) + ' early evidence' : '') + ', strongest evidence first)' : ''));
  if (!only && !short && pick.length && !nFull) out.push('None fully proven (30+ tested trades) today.');
  { const b = budgetOnce(); if (b && pick.length && !only) { const per = {}; for (const x of pick) { const g = secGroup(x.sector) || 'Other'; per[g] = (per[g] || 0) + amountFor(x, sig.market, false).usd; }
      const over = Object.entries(per).filter(([g, v]) => g !== 'Other' && v > b * 0.4); if (over.length) out.push('SECTOR LIMIT: ' + over.map(([g, v]) => g + ' buys add up to ' + money(v).replace(/\.00$/, '') + ' USD').join('; ') + ', over 40% of your budget. They tend to fall together: buy only the strongest ones until under ' + money(b * 0.4).replace(/\.00$/, '') + ' USD.'); } }
  { const br = budgetRoom(), m0 = (x) => money(x).replace(/\.00$/, ''); if (br && pick.length && !only) {
      if (br.room >= 1000) out.push('BUDGET: ' + m0(br.open) + ' USD open of ' + m0(br.budget) + '; room for ' + m0(br.room) + ' USD more. Fill it in the order below, strongest first.');
      else if (br.after >= 1000) out.push('BUDGET FULL: ' + m0(br.open) + ' USD open of ' + m0(br.budget) + '. Today\u2019s sells (' + br.selling.join(', ') + ') free about ' + m0(br.freed) + ' USD at your buy prices, so about ' + m0(br.after) + ' USD of room AFTER they are sold. Sell first, then buy from the top only until that room is used; skip the rest.');
      else out.push('NOTE, BUDGET: ' + m0(br.open) + ' USD open of ' + m0(br.budget) + (br.freed ? '; after today\u2019s sells (' + br.selling.join(', ') + ') only about ' + m0(Math.max(0, br.after)) + ' USD of room, under the 1000 USD minimum a trade' : (br.room > 0 ? '; only ' + m0(br.room) + ' USD of room, under the 1000 USD minimum a trade' : '')) + '. The full list is still shown: you decide. Send  budget open  to stop this note.'); } }
  if (!pick.length && !only) out.push(short ? 'Nothing proven today. Waiting is a result.' : 'Nothing today. No setup has proof: 30+ unseen trades averaging +0.4% or more after costs, or 15+ with +1.5% or more a trade. Waiting is a result.');
  pick.forEach((x, n) => {
    if (short) {   // compact card
      if (x.thin && (n === 0 || !pick[n - 1].thin)) out.push('', 'EARLY EVIDENCE (fewer tested trades: smaller size, your choice)');
      const p = px && px[x.sym], ex = String(x.expect || ''), wm = ex.match(/^(\d+)% of (\d+)/), dm = ex.match(/about ([+-]\$\d+)/);
      const sell = String(x.sell || '').replace(/ \(no fixed target\)/, '').replace(/^when it /, '').split(', then')[0].split(', or')[0].replace(/ \(marker 1\)/, '');
      const hm = HALALM()[x.sym], hc = halalChecks(x.sym), bi = L.halalOf(x.sym, null);
      const hal = hm && hm.s === 'ok' ? (/list/.test(hm.by || '') ? 'ZAD halal (ZAD list)' : 'ZAD halal (yours)') : hm && hm.s === 'expired' ? 'recheck ZAD' : [...hc.pass.map(k => k.replace('Halal Terminal', 'HT') + ' pass'), ...hc.fail.map(k => k.replace('Halal Terminal', 'HT') + ' FAIL'), ...(bi === 'fail' ? ['built-in FAIL'] : [])].join(', ') || 'check ZAD';
      const z = sizeFor(x, sig.market), stopPct = Math.round((1 - x.stop / x.lo) * 100);
      out.push((n ? '' : '') + (n + 1) + ') ' + x.sym + (highConv(x) ? ' HIGH CONVICTION' : '') + (x.cheap ? ' (under 5 USD)' : '') + (p ? '  now ' + money(p) + (p > x.hi ? ': ABOVE range, skip' : p <= x.stop ? ': at stop, cancelled' : p < x.lo ? ': under range, wait' : ': OK to buy') : ''),
        '   Buy ' + money(x.lo) + '-' + money(x.hi) + ' | Stop ' + money(x.stop) + ' (-' + stopPct + '%)' + (stopPct > 12 ? ' WIDE' : '') + ' | Sell ' + (!/^\d/.test(sell) && x.tgtNote && /^tested/.test(x.tgtNote) ? '(no target: tested) ' : '') + (/^closes/.test(sell) ? 'when it ' + sell.replace('~', '') : /^no fixed target/.test(sell) ? 'when the bot says (stop rises as it climbs)' : sell + ' or when the bot says') + ' | ' + (/quick|radar/.test(x.kind) ? 'max ' + x.days + ' days' : x.days >= 30 ? 'hold weeks while the trend holds' : '~' + x.days + ' days'),
        '   ' + (typeof x.net === 'number' ? (x.net >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(x.net * 1000)) + ' per $1,000' : dm ? dm[1] + ' per $1,000' : '') + (wm ? ' (' + wm[1] + '% of ' + wm[2] + ' won)' : '') + (x.d ? ' | win ' + pcs(x.d.aw) + ' / loss ' + pcs(x.d.al) + (x.d.lb > 0 ? '' : ', could be luck') : '') + ' | BUY ' + (() => { const u = amountFor(x, sig.market, TOPSYM === x.sym).usd, sh = Math.floor(u / x.hi); return sh >= 1 ? money(u).replace(/\.00$/, '') + ' USD (' + sh + ' sh)' : '1 share = ' + money(x.hi).replace(/\.00$/, '') + ' USD (more than the ' + money(u).replace(/\.00$/, '') + ' planned)'; })() + (() => { const r = amountFor(x, sig.market, TOPSYM === x.sym).riskPct; return r && r > 0.015 ? ' | RISK ' + (r * 100).toFixed(1) + '% of budget at the stop (over 1.5%)' : ''; })() + ' | halal: ' + hal
        + (x.earnDays !== null && x.earnDays !== undefined && x.earnDays <= x.days * 1.5 ? ' | EARNINGS in ' + x.earnDays + 'd' : '') + (x.sameAs ? ' | same industry as ' + x.sameAs : ''));
      return;
    }
    if (!only && x.thin && (n === 0 || !pick[n - 1].thin)) out.push('', 'EARLY EVIDENCE (15 to 29 tested trades with a strong average: promising, NOT fully proven. Smaller size, your choice)');
    const p = px && px[x.sym], risk = x.lo - x.stop;
    { const SS = readJson('data/score-study.json', null), sc = SS && SS.scores && SS.verdict !== 'REJECTED' ? SS.scores[x.sym] : undefined;   // a score the Sunday test rejected is not shown
      out.push((n ? '\n' : '') + (n + 1) + ') ' + x.sym + (highConv(x) ? ' (HIGH CONVICTION: 60+ unseen trades, +0.8% or more after costs, cautious win rate 50%+)' : '') + ', ' + x.kind + (x.thin ? ' (EARLY EVIDENCE: ' + x.n + ' tested trades, smaller size)' : '') + (x.cheap ? ' (CHEAP STOCK under 5 USD: higher risk, smaller size)' : '') + (x.sector ? ', ' + x.sector : '') + (sc !== undefined ? ', score ' + sc + '/100' : '')); }
    if (p) out.push('   Now: ' + money(p) + (p > x.hi ? ', ABOVE the range: SKIP, do not chase' : p <= x.stop ? ', AT THE STOP: CANCELLED' : p < x.lo ? ', under the range: wait for it to turn up' : ', inside the range: OK to buy'));
    out.push('   Buy: ' + money(x.lo) + ' to ' + money(x.hi) + ' (skip if above ' + money(x.hi) + ')',
      '   Stop: ' + money(x.stop) + ' (' + pcs(x.stop / x.lo - 1) + '). If it is hit: about -$' + Math.round(1000 * (1 - x.stop / ((x.lo + x.hi) / 2)) + 2 * FEE() + 2) + ' on a $1,000 buy, fees included' + ((x.lo - x.stop) / x.lo > 0.12 ? '. WIDE STOP: buy less' : ''),
      '   Sell: ' + x.sell + (x.tgtNote ? '. Target study: ' + x.tgtNote : ''),
      '   Wait: ' + x.wait,
      '   Expected: ' + x.expect + (x.d ? '. ' + distText(x.d) : '') + (typeof x.r10 === 'number' ? '. Bigger runs: ' + Math.round(x.r10 * 100) + '% of past trades were up +10% at some point' + (typeof x.r20 === 'number' ? ', ' + Math.round(x.r20 * 100) + '% up +20%' : '') + ' (before the planned exit)' : ''),
      '   Why: ' + x.why,
      ...(() => { const hm = HALALM()[x.sym], zt = zoyaLive() ? zoyaText(x.sym) : null; const hc0 = halalChecks(x.sym).text, bi = L.halalOf(x.sym, null), hc = bi === 'fail' ? 'Built-in screen: FAILS (business type, e.g. interest-based finance or tobacco)' + (hc0 ? '. ' + hc0.replace(/\. Confirm in ZAD\.$/, '') : '') + '. Your decision: check ZAD.' : hc0 ? hc0.replace('Confirm in ZAD.', 'Shown for information, not filtered. Your decision: check ZAD.') : null; return hm && hm.s !== 'expired' ? ['   Halal: ' + (hm.s === 'ok' ? 'HALAL in ZAD (your mark, ' + hm.d + ')' : 'NOT halal in ZAD (your mark)')] : hm ? ['   Halal: you marked it ' + (hm.was === 'ok' ? 'HALAL' : 'NOT halal') + ' on ' + hm.d + ', over 90 days ago. Its finances may have changed: CHECK ZAD AGAIN' + (hc ? '. ' + hc : '')] : hc ? ['   ' + hc] : zt ? ['   ' + zt] : []; })(),
      '   Amount: BUY ' + money(amountFor(x, sig.market, TOPSYM === x.sym).usd).replace(/\.00$/, '') + ' USD (' + amountFor(x, sig.market, TOPSYM === x.sym).why + '), about ' + Math.max(1, Math.floor(amountFor(x, sig.market, TOPSYM === x.sym).usd / x.hi)) + ' shares at the top of the range',
      '   Size: ' + (!myRisk() ? (() => { const z = sizeFor(x, sig.market), acct = myAccount(), ub = usualBuy();
        if (!(risk > 0)) return 'n/a';
        if (!acct && ub) { const mult = z.pct / 0.005, usd = ub.usd * mult, sh = Math.floor(usd / x.lo);
          return sh < 1 ? 'skip: one share costs more than this trade should take' : sh + ' shares, about ' + money(sh * x.lo) + ' USD = ' + (mult === 1 ? 'your usual buy' : mult.toFixed(1) + 'x your usual buy of ' + money(ub.usd) + ' USD') + ' (' + z.why + '). It may lose about ' + money(sh * risk) + ' USD at the stop'; }
        if (!acct) return 'size ' + (z.pct / 0.005).toFixed(1) + 'x your usual buy (' + z.why + '). Tell me your shares when you buy (bought SYMBOL PRICE SHARES) and I will learn your usual size'; if (false) return 'risk ' + (z.pct * 100).toFixed(2) + '% of your account (' + z.why + '). Add your account size as the GitHub secret ACCOUNT_USD and I will give the exact shares';
        const usd = acct * z.pct, sh = Math.min(Math.floor(usd / risk), Math.floor(acct * 0.2 / x.lo));
        return sh < 1 ? 'skip: even 1 share risks ' + money(risk) + ' USD, more than the ' + money(usd) + ' USD this trade should risk' : sh + ' shares, about ' + money(sh * x.lo) + ' USD (it may lose about ' + money(sh * risk) + ' USD = ' + (z.pct * 100).toFixed(2) + '% of your account; ' + z.why + ')' + (sh * x.lo < 2000 ? '. Under 2,000 USD the 3 USD minimum fee eats more of the edge' : ''); })() : myRisk() && risk > 0 && Math.floor(myRisk() / risk) < 1 ? 'even 1 share risks ' + money(risk) + ' USD, more than your accepted loss of ' + money(myRisk()) + ': skip it, or accept the bigger risk knowingly' : myRisk() && risk > 0 ? Math.floor(myRisk() / risk) + ' shares (your accepted loss ' + money(myRisk()) + ' USD / ' + money(risk) + ' risk per share' + (Math.floor(myRisk() / risk) * x.lo < 2000 ? '; under 2,000 USD the 3 USD minimum fee eats more of the edge' : '') + ')' : 'shares = the loss you accept / ' + money(risk) + (risk > 0 ? (risk <= 100 ? '. Example: 100 USD / ' + money(risk) + ' = ' + Math.floor(100 / risk) + ' shares' : '. Example: 1 share risks ' + money(risk) + ' USD') : '') + '. Set yours once with:  risk 50'));
    if (x.sameAs) out.push('   NOTE: same industry as ' + x.sameAs + '. Both can fall together.');
    if (x.earnDays !== null && x.earnDays !== undefined && x.earnDays <= x.days * 1.5) out.push('   WARNING: earnings in ' + x.earnDays + ' days, inside the holding time. A result can jump the price past the stop.');
  });
  if (only) { out.push('', 'Check halal in ZAD first. Buy only inside the range and place the stop at once. Then send: bought SYMBOL PRICE SHARES'); return out.join('\n'); }
  if (short && opts && opts.actions) return out.slice(1).join('\n');   // the ACTIONS message adds its own holdings and footer
  if (short) {
    if (holds.length) out.push('', 'HOLD (stops at your broker)', ...holds.map(h => h.replace(' (your own stop)', '')));
    const RR = readJson('data/radar-record.json', null), rv = RR ? Object.values(RR.groups || {}).filter(g => g.proven).length : 0;
    out.push('', 'Tested ' + (sig.tested || sig.scanned || 0) + ' stocks | radar ' + (rv ? 'has PROVEN setups' : 'paper only') + ' | check ZAD, buy inside the range, set the stop, then send: bought SYMBOL PRICE SHARES', 'Full cards: send  details');
    return out.join('\n');
  }
  const notProven = c.filter(x => !x.ok).map(x => x.sym);
  if (skipped.length) out.push('', 'Also passed, left out: ' + skipped.join(', ') + '.');
  if (notProven.length) out.push('', 'Not proven, paper only: ' + [...new Set(notProven)].join(', ') + '.');
  if (holds.length) out.push('', 'HOLD (keep these stops at your broker)', ...holds);
  { const LS = readJson('data/lessons.json', null), rs = LS ? Object.values(LS.rules || {}) : [], n = rs.reduce((a, r) => a + r.n, 0);
    if (n) { const dem = rs.filter(r => r.demoted), sum = rs.reduce((a, r) => a + r.avg * r.n, 0);
      out.push('', 'LEARNING: ' + n + ' live paper trades reviewed, average ' + pcs(sum / n) + '.' + (dem.length ? ' Demoted for losing live: ' + dem.map(r => r.name).join('; ') + '.' : ' No rule demoted.') + ' Send  lessons  for what each rule taught.'); } }
  { const RR = readJson('data/radar-record.json', null), gs = RR ? Object.values(RR.groups || {}) : [], pv = gs.filter(g => g.proven), best = [...gs].sort((a, b) => (b.n || 0) - (a.n || 0))[0];
    out.push('', 'EARLY-WAVE RADAR (alerts during the session): ' + (pv.length ? 'PROVEN on paper: ' + pv.map(g => g.name.toLowerCase() + ' (' + g.n + ' trades, ' + Math.round(g.win * 100) + '% won, average ' + pcs(g.avg) + ' after costs)').join('; ') + '. Its alerts marked BUY can be acted on.'
      : 'not proven yet' + (best && best.n ? ' (furthest: ' + best.name.toLowerCase() + ', ' + best.n + ' of ' + (RR.need || 30) + ' paper trades, average ' + pcs(best.avg) + ')' : '') + '. Its alerts are paper only.')); }
  { const ru = readJson('data/radar-universe.json', null), rn = ru && ru.syms ? ru.syms.length : 0;
    out.push('', 'COVERAGE: ' + (sig.tested || sig.scanned || 0) + ' stocks tested last night; ' + c.length + ' had a setup, ' + c.filter(x => x.ok && !x.thin).length + ' fully proven (30+ unseen trades, profit after costs)' + (c.some(x => x.ok && x.thin) ? ' and ' + c.filter(x => x.ok && x.thin).length + ' early evidence (15 to 29)' : '') + '.' + (rn ? ' The radar watches about ' + rn + ' strong stocks live in the session.' : '')); }
  out.push('', 'Before buying: check halal in ZAD. Buy only inside the range and place the stop at once. Then send: bought SYMBOL PRICE SHARES', 'Full details: send  details');
  return out.join('\n');
}
// CONCLUSION: one line per trade. Buy range, stop, where to sell. Only setups that passed their tests and are not blocked.
function conclusion(sig, pos) {
  const out = ['CONCLUSION'];
  if (!sig) return out.concat('No scan has run yet.');
  const held = pos || {}, OK = new Set(planCands(sig, held).filter(x => x.ok).map(x => x.kind + '|' + x.sym));   /* kind|sym: FOCUS is per engine kind (review S-14) */   // the same evidence gates as the plan: early, rejected or paper-only setups never show as BUY here
  for (const q of (sig.quick || []).filter(x => !held[x.sym] && OK.has('quick trade|' + x.sym)).slice(0, 4)) out.push(q.sym + ': BUY ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ' | STOP ' + money(q.stop) + ' | SELL ' + (q.t1 ? money(q.t1) + (q.t2 ? ' then ' + money(q.t2) : '') : 'on the rule exit') + ' | out after ' + (q.maxHold || 5) + ' sessions at the latest');
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !held[x.sym] && OK.has('swing trade|' + x.sym)).slice(0, 4)) out.push(b.sym + ': BUY ' + money(b.buyLo) + ' to ' + money(b.buyHi) + ' | STOP ' + money(b.stop) + ' | SELL ' + (b.target ? money(b.target) : 'when it closes below ~' + money(b.exitBelow)) + ' | swing trade, days to weeks');
  for (const r of (sig.leaders || []).filter(x => !held[x.sym] && OK.has('trend trade|' + x.sym)).slice(0, 5)) out.push(leadLine(r));
  // FOCUS MODE (user, 21 Oct: "it still suggests EFXT"): while no engine is proven live, engine trades are PAPER lines, never BUY lines.
  // (review S-14, 22 Oct) the lines above come only from planCands' ok set per kind, which applies FOCUS per engine kind; the old global
  // rewrite here (lifted for all kinds by any POSITIVE row) is gone.
  if (sig.quickPaused) out.push('Quick trades are paused by the circuit breaker.');
  if (out.length === 1) out.push('No new trade today. Nothing passed its tests.');
  const pv = sig.posVerdict || {};
  for (const sym of Object.keys(pos || {})) { const P = pos[sym]; out.push(sym + ' (yours): ' + (pv[sym] ? 'SELL at the next open, ' + pv[sym] : 'HOLD | STOP ' + (P.stop ? money(P.stop) : 'none set') + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'no target set'))); }
  return out;
}
// The same conclusion, recalculated from the price RIGHT NOW (market hours only): buy near the live price, with the stop and
// selling prices moved by the same amount. A setup that has run away or failed is marked SKIP or CANCELLED.
function conclusionLive(sig, pos, px) {
  const out = ['WHAT TO DO NOW (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait time, live prices)'], held = pos || {}, OK = new Set(planCands(sig, held).filter(x => x.ok).map(x => x.kind + '|' + x.sym));   /* kind|sym: FOCUS is per engine kind (review S-14) */ let any = false;
  for (const q of (sig.quick || []).filter(x => !held[x.sym] && OK.has('quick trade|' + x.sym)).slice(0, 5)) { const p = px[q.sym]; if (!p) continue; any = true; const k = p / q.buyLo;
    out.push(p > q.buyHi ? q.sym + ': SKIP. Now ' + money(p) + ', above its entry range (' + money(q.buyLo) + ' to ' + money(q.buyHi) + ').' : p <= q.stop ? q.sym + ': CANCELLED. Now ' + money(p) + ', at or below its invalidation level ' + money(q.stop) + '.'
      : q.sym + ': BUY near ' + money(p) + ' | STOP ' + money(p - (q.buyLo - q.stop)) + ' | SELL ' + (q.t1 ? money(q.t1 * k) + (q.t2 ? ' then ' + money(q.t2 * k) : '') : 'on the rule exit') + ' | out after ' + (q.maxHold || 5) + ' sessions at the latest'); }
  for (const b of (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !held[x.sym] && OK.has('swing trade|' + x.sym)).slice(0, 4)) { const p = px[b.sym]; if (!p) continue; any = true;
    out.push(p > b.buyHi ? b.sym + ': SKIP. Now ' + money(p) + ', above its buy range (' + money(b.buyLo) + ' to ' + money(b.buyHi) + ').' : p <= b.stop ? b.sym + ': CANCELLED. Now ' + money(p) + ', at its stop level.'
      : b.sym + ': BUY near ' + money(p) + ' | STOP ' + money(p - (b.buyLo - b.stop)) + ' | SELL ' + (b.target ? money(b.target * p / b.buyLo) : 'when it closes below ~' + money(b.exitBelow)) + ' | swing trade, days to weeks'); }
  if (sig.quickPaused) out.push('Quick trades are paused by the circuit breaker.');
  if (!any) out.push('No new trade right now. Nothing passed its tests at the last close.');
  const pv = sig.posVerdict || {};
  for (const sym of Object.keys(held)) { const P = held[sym], p = px[sym], chg = p ? ' Now ' + money(p) + ' (' + (p >= P.entry ? '+' : '') + ((p / P.entry - 1) * 100).toFixed(1) + '%).' : '';
    out.push(sym + ' (yours): ' + (p && P.stop && p <= P.stop ? 'SELL NOW, your stop ' + money(P.stop) + ' is reached.' + chg : eventSell(sym) ? eventSell(sym) + chg : p && P.t2 && p >= P.t2 ? 'TARGET 2 REACHED (' + money(P.t2) + '). Sell.' + chg : p && P.t1 && p >= P.t1 ? 'TARGET 1 REACHED (' + money(P.t1) + '). Take profit, or sell part and raise the stop to your entry.' + chg : pv[sym] ? 'SELL at the next open, ' + pv[sym] + chg : 'HOLD | STOP ' + (P.stop ? money(P.stop) : 'none set') + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'no target set') + '.' + chg)); }
  return out;
}
// WHAT KIND OF DAY IS TODAY? The market's state, each part checked against the market-day study (the system's own unseen trades
// grouped by what the S&P 500 did), plus YOUR tested sells and the proven buys. Verdicts come only from tests, never from opinion.
async function dayText(sig, pos) {
  const MD = readJson0('data/mday-study.json'), row = (k) => MD && MD.rows ? MD.rows.find(r => r.k === k) : null, NAME = { bigDown: 'a big drop (1.5%+)', down: 'a drop', flat: 'a flat day', up: 'a rise', bigUp: 'a big rise (1.5%+)', gapDown: 'opened down 0.75%+', gapFlat: 'opened flat', gapUp: 'opened up 0.75%+', strong: 'above its long trend line', weak: 'under its long trend line', calm: 'calm last 20 days', wild: 'wild last 20 days (big daily swings)' };
  const sp = await loadDaily('SPY'), c = sp && sp.candles, n = c ? c.length : 0, out = [], tags = [];
  if (n > 25) { const b = c[n - 1], r = b.c / c[n - 2].c - 1; tags.push(r <= -0.015 ? 'bigDown' : r <= -0.005 ? 'down' : r < 0.005 ? 'flat' : r < 0.015 ? 'up' : 'bigUp');
    let s1 = 0, s2 = 0; for (let j = n - 20; j < n; j++) { const x = c[j].c / c[j - 1].c - 1; s1 += x; s2 += x * x; } const sd = Math.sqrt(Math.max(0, s2 / 20 - (s1 / 20) ** 2)); tags.push(sd > 0.015 ? 'wild' : 'calm');
    tags.push(sig && sig.market && sig.market.up === false ? 'weak' : 'strong');
    out.push('S&P 500 (SPY) last close ' + b.d + ': ' + pcs(r) + ' (' + NAME[tags[0]] + '); ' + (sig && sig.market && sig.market.above50 === false ? 'under' : 'above') + ' its 50 day average; ' + NAME[tags[2]] + '; daily swings ' + (sd * 100).toFixed(1) + '% (' + (tags[1] === 'wild' ? 'wild' : 'calm') + ').'); }
  // the buy morning: how the S&P 500 opened (known from 4:30 pm Kuwait)
  { const t = ny(Date.now()); if (!t.weekend && t.mins >= 570 && t.mins < 960 && env.FINNHUB_KEY) { try { const r = await fetch(FH + '/quote?symbol=SPY&token=' + encodeURIComponent(env.FINNHUB_KEY)), j = r.ok ? await r.json() : null;
      if (j && +j.o > 0 && +j.pc > 0) { const g = j.o / j.pc - 1; tags.push(g <= -0.0075 ? 'gapDown' : g >= 0.0075 ? 'gapUp' : 'gapFlat'); out.push('Today it opened ' + pcs(g) + ' (' + NAME[tags[tags.length - 1]] + ') and is ' + pcs(j.c / j.pc - 1) + ' now.'); } } catch (e) {} }
    else out.push('The market is closed now (opens 4:30 pm Kuwait). The opening gap is checked once it opens: ask again after 4:45 pm.'); }
  // what the tests say about days like this
  const bad = [], good = [], lines = [];
  for (const k of tags) { const r = row(k); if (!r) continue; lines.push('- ' + NAME[k] + ': ' + (r.older.n ? pcs(r.older.avg) + ' / ' + pcs(r.newer.avg) + ' a trade (' + r.older.n + ' / ' + r.newer.n + ' trades)' : 'no trades') + ' -> ' + r.verdict);
    if (/LOSING|WORSE/.test(r.verdict)) bad.push({ k, r }); if (/BETTER/.test(r.verdict)) good.push({ k, r }); }
  // your actions: tested sells, and the proven buys
  let h = { acts: { sell: [], part: [] } }; try { h = await holdingsText(sig, pos || {}, null, true); } catch (e) {}
  const sells = [...h.acts.sell, ...h.acts.part].map(l => l.split(/[ :(]/)[0]), buys = planCands(sig, pos || {}).filter(x => x.ok);
  const losing = bad.some(x => /LOSING/.test(x.r.verdict)), head = [];
  if (sells.length) head.push('SELL DAY: ' + sells.length + ' of your stocks hit their tested exit or stop (' + sells.slice(0, 6).join(', ') + '). Sell those first.');
  const PGd = protectWhy(pos || {}, null, sig);
  if (!buys.length) head.push('NO NEW BUYS: no proven buy rule fired.');
  else if (PGd.length) head.push('CAREFUL (protect advice): ' + PGd.join('; ') + '. Buys are listed; your decision, smaller size suggested.');
  else if (losing) head.push('NOT A BUYING DAY: buys made after days like this LOST money in both halves of the tests. Skip the ' + buys.length + ' buy' + (buys.length > 1 ? 's' : '') + ' today (or wait for tomorrow’s list).');
  else if (bad.length) head.push('CAREFUL BUYING DAY: buys after ' + bad.map(x => NAME[x.k]).join(' / ') + ' did WORSE than usual (still positive). Take only the TOP PICK, or wait a day.');
  else head.push('BUYING DAY: ' + buys.length + ' proven buy' + (buys.length > 1 ? 's' : '') + ' (' + buys.slice(0, 5).map(x => x.sym).join(', ') + ')' + (good.length ? '; days like this were BETTER than usual in the tests' : '') + '. Use ACTIONS for ranges and stops.');
  if (!sells.length && !buys.length) head.splice(0, head.length, 'NOTHING TO DO TODAY: no tested sell and no proven buy. Keep your stops at the broker.');
  const dn = buyDayNote();
  return ['TODAY’S MARKET: ' + head.map(x => x.split(':')[0]).join(' + '), ...head, '', ...out, '',
    MD && MD.rows ? 'TESTED (the system’s own unseen trades bought after days like this, older / newer half; average of all ' + pcs(MD.all.older) + ' / ' + pcs(MD.all.newer) + '):' : 'The market-day study is built with the nightly scan; it shows here from tomorrow.', ...lines,
    ...(dn ? ['', dn] : []), '', 'A day counts as worse or better only with 150+ trades in each half and the same direction in both. Your stops always apply.'].join('\n');
}
async function hotList(sig) {
  if (!sig) return 'No scan has run yet.';
  const open = marketOpen(Date.now()), pos = loadPos(), px = {};
  if (open) { const c = planCands(sig, pos); for (const sym of [...new Set([...c.filter(x => x.ok).map(x => x.sym), ...Object.keys(pos)])].slice(0, 30)) { const j = await liveQ((sym)); if (j && +j.price > 0) px[sym] = +j.price; } }
  if (QUIET()) return actionsText(sig, pos, open ? px : null, open ? 'ACTIONS NOW (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait, live prices)' : 'ACTIONS, from the ' + sig.session + ' close');
  return planText(sig, pos, open ? px : null, open ? 'WHAT TO DO NOW (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait, live prices)' : 'PLAN, from the ' + sig.session + ' close');
}
async function detailList(sig) {
  if (!sig) return 'No scan has run yet.';
  const open = marketOpen(Date.now()), pos = loadPos(), px = {};
  const OK = new Set(planCands(sig, pos).filter(x => x.ok).map(x => x.sym)), qk = (sig.quick || []).filter(x => !pos[x.sym] && OK.has(x.sym)).slice(0, 5), buys = (sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo && !pos[x.sym] && OK.has(x.sym)).slice(0, 4);
  if (open) for (const sym of [...new Set([...qk.map(q => q.sym), ...buys.map(b => b.sym), ...Object.keys(pos)])].slice(0, 30)) { const j = await liveQ((sym)); if (j && +j.price > 0) px[sym] = +j.price; }
  const out = [...(open ? conclusionLive(sig, pos, px) : conclusion(sig, pos)), '', 'DETAILS, from the ' + sig.session + ' close' + (open ? ', priced now' : ' (market closed: these are the prices to use at the next open)')], live = async (sym, fallback) => px[sym] || fallback;
  if (qk.length) out.push('', 'QUICK TRADES, 2 TO 5 DAYS (' + qk.length + ')');
  for (const q of qk) {
    const p = await live(q.sym, q.last), where = p > q.buyHi ? 'ABOVE its entry range: the dip is gone, skip it' : p <= q.stop ? 'FAILED: at or below its invalidation level' : p < q.buyLo ? 'below its planned range, dip still running' : 'inside its entry range';
    out.push(q.sym + ' ' + money(p) + ': ' + where + '\n  entry ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ', invalidation ' + money(q.stop) + (q.t1 ? ', target 1 ' + money(q.t1) : '') + (q.t2 ? ', target 2 ' + money(q.t2) : '') + '\n  exit on the ' + (q.exitText || 'first close above its 5 day average') + ', or after ' + (q.maxHold || 5) + ' sessions\n  past result: ' + Math.round(q.win * 100) + '% wins over ' + q.n + ' trades, average ' + (q.avgPct * 100).toFixed(2) + '% a trade' + (q.earn ? '\n  ' + q.earn : ''));
  }
  if (buys.length) out.push('', 'ENTRY CONFIRMED, swing trades of days to weeks (' + buys.length + ')');
  for (const b of buys) {
    const p = await live(b.sym, b.last), where = p > b.buyHi ? 'ABOVE its buy range: too late for this signal' : p <= b.stop ? 'FAILED: at its stop level' : 'in or below its buy range';
    out.push(b.sym + ' ' + money(p) + ': ' + where + '\n  buy range ' + money(b.buyLo) + ' to ' + money(b.buyHi) + ', stop ' + money(b.stop) + (b.target ? ', target ' + money(b.target) : ', no fixed target') + (b.earn ? '\n  ' + b.earn : ''));
  }
  const lds = (sig.leaders || []).filter(x => !pos[x.sym] && OK.has(x.sym)).slice(0, 5);
  if (lds.length) { out.push('', 'LEADERS, strongest stocks, trend trades of weeks (' + lds.length + ')');
    for (const r of lds) { let p = r.last; if (open) { const j = await liveQ((r.sym)); if (j && +j.price > 0) p = +j.price; }
      out.push(r.sym + ' ' + money(p) + ': ' + (p > r.buyHi ? 'ABOVE its buy range. Do not chase; wait for it to come back under ' + money(r.buyHi) : p <= r.stop ? 'FAILED: at or under its stop. Skip it' : 'in its buy range') + '\n  buy ' + money(r.buyLo) + ' to ' + money(r.buyHi) + ', stop ' + money(r.stop) + ', up ' + Math.round(r.mom * 100) + '% in ' + Math.round(LEADCFG.LOOK / 21) + ' months' + (r.earn ? '\n  ' + r.earn : '')); }
    out.push('Full list and its record: send   leaders'); }
  if (!qk.length && !buys.length && !lds.length) out.push('', 'Nothing passed the tests at that close. On most days the honest answer is: no trade today.');
  out.push('', 'These are tested setups, not hot tips. Small wins, strict stops, manual review only. Check halal status first. After buying, tell me: bought SYMBOL PRICE SHARES');
  return out.join('\n');
}
// On-demand analysis of ANY ticker, right now, with the same rules as the nightly scan. The ticker then joins the nightly list.
// SPLITS (23 Oct, holdings brief): Twelve Data handed the scan IESC (2-for-1, 24 Aug) and GRML (1-for-50, 24 Aug) unadjusted, so
// IESC read -62% over 6 months (real about -37%) and GRML +1,151% with "uptrend" (real about -65%). Same rule as leaders-study.mjs:
// a split is applied only when the price jump across its date matches it, so an already adjusted series is never adjusted twice.
function adjustSplits(sym, c, splits) {
  if (!c || c.length < 2 || !Array.isArray(splits)) return 0; let n = 0;
  for (const sp of splits) { if (sp.s !== sym || !(sp.r > 0) || sp.r === 1) continue;
    const iA = c.findIndex(x => x.d >= sp.d); if (iA <= 0) continue;
    const pre = c[iA - 1].c, post = c[iA].c; if (!(pre > 0) || !(post > 0)) continue;
    const jump = Math.log(pre / post), want = Math.log(sp.r); if (!(Math.abs(jump - want) < Math.abs(jump))) continue;
    for (let k = 0; k < iA; k++) { for (const f of ['o', 'h', 'l', 'c']) c[k][f] = +(c[k][f] / sp.r).toFixed(4); c[k].v = Math.round(c[k].v * sp.r); }
    n++; }
  return n;
}
let SPLITS0 = null; const SPLIT_ASKED = {};
async function splitsFor(sym, c) {   // the official list saved by the Sunday study, plus a direct Massive check when a series has a split-sized one-day jump
  if (!SPLITS0) { const j = readJson0('data/splits.json'); SPLITS0 = j && Array.isArray(j.splits) ? j.splits : []; }
  const own = SPLITS0.filter(x => x.s === sym);
  let big = false; for (let k = Math.max(1, c.length - 400); k < c.length; k++) { const q = c[k].c / c[k - 1].c; if (q >= 1.8 || q <= 0.55) { big = true; break; } }
  if (!big || !env.MASSIVE_KEY) return own;
  if (!SPLIT_ASKED[sym]) { SPLIT_ASKED[sym] = []; try { const j = await mv('/stocks/v1/splits?ticker=' + encodeURIComponent(sym) + '&limit=100');
    for (const x of (j && Array.isArray(j.results) ? j.results : [])) { const f = +x.split_from, t = +x.split_to, d = String(x.execution_date || ''); if (!d || !(f > 0) || !(t > 0) || f === t || /dividend/i.test(String(x.adjustment_type || ''))) continue; SPLIT_ASKED[sym].push({ s: sym, d, r: t / f }); } } catch (e) {} }
  return [...own, ...SPLIT_ASKED[sym].filter(x => !own.some(o => o.d === x.d))];
}
let spyDaily = null;
async function loadDaily(sym) {
  if (sym === 'SPY' && spyDaily) return spyDaily;
  const j = await td('/time_series?symbol=' + encodeURIComponent(sym) + '&interval=1day&outputsize=4000&order=ASC'); if (!j || !j.values) return null;
  const now = Date.now(), all = j.values.map(v => ({ d: v.datetime.slice(0, 10), o: +(+v.open).toFixed(4), h: +(+v.high).toFixed(4), l: +(+v.low).toFixed(4), c: +(+v.close).toFixed(4), v: Math.round(+v.volume || 0) })).sort((a, b) => a.d < b.d ? -1 : 1);
  adjustSplits(sym, all, await splitsFor(sym, all));
  const res = { candles: all.filter(c => barClosed(c.d, now)), last: all[all.length - 1].c }; if (sym === 'SPY') spyDaily = res; return res;
}
function addExtra(sym) { const a = readExtra(); if (a.includes(sym)) return false; a.push(sym); fs.writeFileSync(EXTRA_FILE, JSON.stringify(a.slice(-60))); return true; }

// DEEP CHECK: everything public about one stock, gathered for  check SYM . Information only: news and analyst opinions did NOT
// predict returns in the system's own tests, so none of this can turn a stock into a BUY; it can warn (bad news, earnings soon).
async function deepInfo(sym) {
  if (!env.FINNHUB_KEY) return [];
  const T = encodeURIComponent(env.FINNHUB_KEY), d = (ms) => new Date(ms).toISOString().slice(0, 10), get = async (p) => { try { const r = await fetch(FH + p + (p.includes('?') ? '&' : '?') + 'token=' + T); return r.ok ? await r.json() : null; } catch (e) { return null; } finally { await sleep(FAST ? 0 : 1100); } };
  const out = ['', 'WHAT THE MARKET SAYS (information only; in the tests, news and analyst ratings did not predict returns)'];
  const pf = await get('/stock/profile2?symbol=' + sym); if (pf && pf.name) out.push('Company: ' + pf.name + (pf.finnhubIndustry ? ', ' + pf.finnhubIndustry : '') + (pf.marketCapitalization ? ', market value about ' + (pf.marketCapitalization >= 1000 ? (pf.marketCapitalization / 1000).toFixed(1) + ' billion' : Math.round(pf.marketCapitalization) + ' million') + ' USD' : '') + '.');
  const ec = await get('/calendar/earnings?symbol=' + sym + '&from=' + d(Date.now()) + '&to=' + d(Date.now() + 90 * 864e5)), nx = ec && (ec.earningsCalendar || []).filter(x => x.date).sort((a, b) => a.date < b.date ? -1 : 1)[0];
  out.push('Next earnings: ' + (nx ? nx.date + (nx.hour === 'bmo' ? ' (before the open)' : nx.hour === 'amc' ? ' (after the close)' : '') + ', in ' + Math.max(0, Math.round((Date.parse(nx.date) - Date.now()) / 864e5)) + ' days' + (Date.parse(nx.date) - Date.now() < 10 * 864e5 ? '. CAUTION: a result can gap the price through any stop' : '') : 'none found in the next 90 days') + '.');
  const es = await get('/stock/earnings?symbol=' + sym); if (Array.isArray(es) && es.length) out.push('Last results vs estimates: ' + es.slice(0, 4).map(q => q.period.slice(0, 7) + ' ' + (q.surprisePercent === null || q.surprisePercent === undefined ? 'n/a' : (q.surprisePercent >= 0 ? 'beat ' : 'missed ') + Math.abs(q.surprisePercent).toFixed(0) + '%')).join(', ') + '.');
  const rc = await get('/stock/recommendation?symbol=' + sym); if (Array.isArray(rc) && rc.length) { const a = rc[0], b = rc[1], pos = (x) => (x.strongBuy || 0) + (x.buy || 0), tot = (x) => pos(x) + (x.hold || 0) + (x.sell || 0) + (x.strongSell || 0);
    out.push('Analysts (' + a.period.slice(0, 7) + '): ' + pos(a) + ' buy, ' + (a.hold || 0) + ' hold, ' + ((a.sell || 0) + (a.strongSell || 0)) + ' sell of ' + tot(a) + (b && tot(b) ? '; a month earlier ' + pos(b) + ' buy of ' + tot(b) + (pos(a) / Math.max(1, tot(a)) > pos(b) / Math.max(1, tot(b)) + 0.05 ? ' (turning more positive)' : pos(a) / Math.max(1, tot(a)) < pos(b) / Math.max(1, tot(b)) - 0.05 ? ' (turning more negative)' : ' (about the same)') : '') + '.'); }
  const it = await get('/stock/insider-transactions?symbol=' + sym + '&from=' + d(Date.now() - 90 * 864e5)), tx = (it && it.data) || [];
  if (tx.length) { const buys = tx.filter(x => x.transactionCode === 'P'), sells = tx.filter(x => x.transactionCode === 'S'), v = (a) => a.reduce((s, x) => s + Math.abs((x.change || 0) * (x.transactionPrice || 0)), 0);
    out.push('Insiders, last 90 days: ' + buys.length + ' open-market buys (' + money(v(buys) / 1e6) + 'M USD), ' + sells.length + ' sales (' + money(v(sells) / 1e6) + 'M USD)' + (buys.length ? '. Insider BUYING is the one kind of insider signal worth noting' : '') + '.'); }
  const nw = await get('/company-news?symbol=' + sym + '&from=' + d(Date.now() - 7 * 864e5) + '&to=' + d(Date.now())), hs = (Array.isArray(nw) ? nw : []).map(x => String(x.headline || '')).filter(Boolean);
  if (hs.length) { const nr = negNews(hs); out.push('News this week (' + hs.length + ' headlines)' + (nr.hard ? ': WARNING, ' + nr.hard.tag + ': "' + nr.hard.h + '"' : nr.soft ? ': caution, ' + nr.soft.tag + ': "' + nr.soft.h + '"' : (() => { const w = hs.find(h => /guidance (cut|lower)|lowers? (its )?(guidance|outlook|forecast)|cuts? (its )?(guidance|outlook|forecast)|downgrad|miss(es|ed)? (estimates|expectations)|shares (fall|plunge|tumble|sink|slide)/i.test(h)); return w ? ': caution, weak news: "' + w.slice(0, 110) + '"' : ': nothing alarming found'; })()) + '.', ...hs.slice(0, 3).map(h => '  - ' + h.slice(0, 140))); }
  else out.push('News this week: none found.');
  // official company events (SEC) and, for drug makers, late-stage trials (ClinicalTrials.gov); each event kind with its tested record
  { const CK = readJson0('data/sec-ciks.json') || {}, ES = readJson0('data/events-study.json'); let cik = CK[sym] && CK[sym][0], sic = CK[sym] && CK[sym][1];
    if (!cik) { const tl = await secJson(SEC_WWW + '/files/company_tickers.json'); const hit = tl && Object.values(tl).find(x => String(x.ticker || '').toUpperCase().replace(/-/g, '.') === sym); if (hit) cik = hit.cik_str; }
    const j = cik ? await secJson(SEC_DATA + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json') : null, r = j && j.filings && j.filings.recent;
    if (r && r.form) { sic = j.sic || sic; const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), rows = [];
      for (let k = 0; k < Math.min(r.form.length, 100) && rows.length < 6; k++) { const pt = String(r.acceptanceDateTime[k] || '').slice(0, 16); if (pt.slice(0, 10) < since) break;
        const f = evFams(r.form[k], (r.items || [])[k], sic, ES).filter(q => q !== 'EARN'); if (!f.length) continue;
        rows.push(pt.slice(0, 10) + ' ' + f.map(q => { const F = ES && ES.fam && ES.fam[q], nm = F ? F.name.replace(/ \(.*\)$/, '') : q.toLowerCase();
          return nm + (F && F.warn ? ' [WARNING: such filings were followed by ' + pcs(F.drift.newer.vs) + ' vs other stocks over 20 sessions]' : F && F.verdict === 'PROMISING' ? ' [a tested BUY kind of news]' : ''); }).join('; ')); }
      out.push('SEC filings, last 90 days (official): ' + (rows.length ? rows.join(' | ') : 'no major company events (contracts, deals, share sales, management changes)') + '. Send  events  for what each kind of news did in the past.'); }
    else out.push('SEC filings: could not be read (' + (!cik ? 'the SEC company list did not load' : 'the SEC answered ' + (SEC_LAST === 403 || SEC_LAST === 429 ? 'HTTP ' + SEC_LAST + ': it refuses programs without a real contact email' : SEC_LAST)) + (/noreply/.test(SEC_UA) ? '. Fix: add the GitHub secret SEC_UA with your name and email' : '') + ').');
    if (/^(283[3-6]|8731)$/.test(String(sic || '')) && j && j.name) { const nm = String(j.name).replace(/[,.]/g, ' ').replace(/\b(inc|corp|corporation|ltd|plc|co|holdings?|nv|sa|ag|de)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      try { const rr = await fetch(CTG + '/api/v2/studies?query.spons=' + encodeURIComponent(nm) + '&filter.advanced=' + encodeURIComponent('AREA[Phase]PHASE3') + '&pageSize=50&format=json&fields=NCTId,BriefTitle,OverallStatus,PrimaryCompletionDate'), cj = rr.ok ? await rr.json() : null;
        const L2 = ((cj && cj.studies) || []).map(x => { const ps = x.protocolSection || {}, im = ps.identificationModule || {}, sm = ps.statusModule || {}; return { id: im.nctId, t: String(im.briefTitle || '').slice(0, 70), st: String(sm.overallStatus || ''), d: (sm.primaryCompletionDateStruct || {}).date }; }).filter(x => x.d && /RECRUITING|ACTIVE|COMPLETED|ENROLLING/.test(x.st));
        const soon = L2.filter(x => { const t = Date.parse(x.d.length === 7 ? x.d + '-15' : x.d); return t > Date.now() - 120 * 864e5 && t < Date.now() + 180 * 864e5; }).sort((a, b) => a.d < b.d ? -1 : 1);
        if (cj) out.push('Late-stage drug trials (ClinicalTrials.gov, phase 3, sponsor "' + nm + '"): ' + L2.length + ' found' + (soon.length ? '; main results due now or within 6 months: ' + soon.slice(0, 3).map(x => x.d + ' ' + x.t + ' (' + x.id + ')').join(' | ') + '. CAUTION: one trial result can move a drug stock 30-70% in a day, through any stop' : '') + '.'); } catch (e) {} } }
  { const hc = halalChecks(sym).text; if (hc) out.push(hc); }
  { const tp = readTips().filter(x => x.sym === sym); if (tp.length) out.push('Your sources mentioned it ' + tp.length + ' time' + (tp.length > 1 ? 's' : '') + ' (latest: ' + tp[tp.length - 1].src + ', ' + tp[tp.length - 1].d + '). Send  sources  for how those sources scored.'); }
  return out;
}
async function checkLive(sym) {
  const d = await loadDaily(sym); if (!d || !d.candles.length) return sym + ': I could not load prices for this ticker. Check the symbol.';
  const c = d.candles, i = c.length - 1, out = [sym + ', analysed now from the ' + c[i].d + ' close', 'Closed ' + money(c[i].c) + '.'], added = addExtra(sym);
  const refLine2 = () => { const r = L.refPlan(c, d.last), o = L.refOdds(c);
    if (!r) return 'CONCLUSION: no plan. ' + (c.length < 30 ? 'It is too new.' : 'the short-term rules only buy stocks above their 50-day average, and this one is under it (that is the short-term angle only; see mid / long term below).');
    if (o && o.won < 0.25) return 'CONCLUSION: no plan. On its own history the reward marker came before the stop in only ' + Math.round(o.won * 100) + '% of cases, which loses on average.';
    return 'REFERENCE LEVELS (not tested, not a buy): ' + (r.extended ? 'after a pullback, range ' : 'range ') + money(r.lo) + ' to ' + money(r.hi) + ' | STOP ' + money(r.stop) + ' | reward marker ' + money(r.target) + (o ? '. The marker came first in ' + Math.round(o.won * 100) + '% of ' + o.cases + ' past cases.' : '.'); };
  let word = 'NO BUY: no tested rule supports a trade on it.';
  if (c.length < 600) out.push('It has under three years of price history, so no rule can be tested on it.', refLine2());
  else {
    const spy = await loadDaily('SPY'), mkt = spy ? L.marketMap(spy.candles) : null, ind = L.indicators(c, mkt);
    const mom = spy && spy.candles.length > 130 ? spy.candles[spy.candles.length - 1].c / spy.candles[spy.candles.length - 127].c - 1 : undefined;
    const T = L.trendStats(c, ind, mom), Lr = L.learn(c, ind, null, false), halal = myHalal(sym), v = L.applyGates(L.verdict(c, ind, Lr, null, d.last, false), { dollarVol: T.dollarVol, halal, limit: null });
    const trig = L.buyTrigger(c, ind, Lr), dist = Lr.v.mult * ind.atr[i], half = 0.5 * ind.atr[i], Q = d.last >= 5 ? L.quickFire(c, ind, L.quickStudy(c, ind, false)) : null;
    out.push((T.up ? 'In an uptrend' : c[i].c < ind.e[L.CFG.TREND][i] ? 'In a downtrend' : 'Mixed trend') + ', ' + (T.mom6 >= 0 ? '+' : '') + Math.round(T.mom6 * 100) + '% over 6 months' + (T.rs === null ? '' : ' (' + (T.rs >= 0 ? '+' : '') + Math.round(T.rs * 100) + '% vs the market)') + '.',
      'Rule tested for it: ' + L.ruleText(Lr.v) + '. ' + Lr.test.n + ' unseen trades, ' + Math.round(Lr.test.winRate * 100) + '% wins. ' + L.statusText(Lr));
    if (v.act) word = Lr.test.n < 30 ? 'WATCH ONLY (EARLY EVIDENCE, ' + Lr.test.n + ' tested trades): an entry fired, but it is not a buy until 30. Prices below for the record.' : 'BUY: a tested rule confirmed an entry. Prices below.';
    else if (v.blocked) word = 'NO BUY: ' + v.why;
    else if (Lr.proven && trig.price) word = 'WATCH: not yet. It becomes a buy only after a daily close above ~' + money(trig.price) + '.';
    else if (Q) { const net = netOf(Q.avgPct, d.last); word = okEv(Q.test.n, net, Q.test.winRate) ? (Q.test.n < 30 ? 'WATCH ONLY (EARLY EVIDENCE, not a buy until 30 tested trades)' : 'BUY') + ': quick trade with ' + Q.test.n + ' tested past trades. Prices below.' : 'WATCH: quick trade setup, but only ' + Q.test.n + ' past trades' + (net > 0 ? '' : ' and no profit after your costs') + '. Paper only.'; }
    else if (Lr.proven) word = 'WATCH: tested rule, but no entry now.';
    if (v.act) out.push('CONCLUSION: ENTRY CONFIRMED. BUY ' + money(d.last) + ' to ' + money(d.last + half) + ' | STOP ' + money(d.last - dist) + ' | SELL ' + (Lr.v.tp ? money(d.last + Lr.v.tp * dist) : 'when it closes below ~' + money(L.sellLevel({ v: Lr.v }, c, ind))));
    else if (v.blocked) out.push('CONCLUSION: no trade. ' + v.why);
    else if (Lr.proven && trig.price) out.push('CONCLUSION: not yet. BUY only after a daily close above ~' + money(trig.price) + ' (' + ((trig.price / d.last - 1) * 100).toFixed(1) + '% away) | then STOP ~' + money(trig.price - dist) + ' | SELL ' + (Lr.v.tp ? '~' + money(trig.price + Lr.v.tp * dist) : 'on the rule exit'));
    else if (Q) { const P = L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q); out.push('CONCLUSION: quick trade setup. BUY ' + money(P.lo) + ' to ' + money(P.hi) + ' | STOP ' + money(P.stop) + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'on the rule exit') + ' | out after ' + Q.v.maxHold + ' sessions. Past result: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' trades.'); }
    else if (Lr.proven) out.push('CONCLUSION: no trade now. ' + trig.text);
    else out.push('No tested rule supports a trade on this stock.', refLine2());
    out.push(horizonLine(sym), qualityLine(sym)); { const dl = dilutionLine(sym); if (dl) out.push(dl); }
    out.push(L.HALAL_TEXT[halal] + '.');
  }
  try { out.push(...await deepInfo(sym)); } catch (e) {}
  if (myHalal(sym) === 'fail') word = 'NO BUY: you marked it NOT halal in ZAD.';
  { const gv = gateVerdict(sym); if (gv && /^BUY|ENTRY CONFIRMED/.test(word)) word = 'NO BUY (paper only): ' + gv + '.'; const g2 = gateLines(out, gv); out.length = 0; out.push(...g2); }
  out.unshift(sym + ': ' + word);
  out.push(added ? 'I have added ' + sym + ' to my nightly scan. Send: remove ' + sym + '   to take it off.' : sym + ' is on my nightly scan list.');
  return out.join('\n');
}
// ---- Tip log. You forward what a channel or person recommends; the bot stamps date and price, checks each stock against the
// tested rules, adds it to the nightly scan, and from then on scores that source against the S&P 500.
const TIP_FILE = 'data/tips.jsonl', NOT_TICKERS = new Set(['USD', 'US', 'USA', 'ETF', 'FDA', 'CEO', 'AI', 'IPO', 'EPS', 'PE', 'ATH', 'GTC', 'NYSE', 'KWD', 'KD', 'TP', 'SL', 'BUY', 'SELL', 'TIPS', 'TIP', 'LOG']);
const readTips = () => fs.existsSync(TIP_FILE) ? fs.readFileSync(TIP_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
const western = (t) => t.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[\u066B]/g, '.').replace(/[\u066C]/g, '');
function parseTips(raw) {       // source name, tickers, and any "buy below" / "current price" figures (Arabic or English)
  const text = western(raw), first = text.split('\n')[0], m = first.match(/^\s*(?:tips?|log|\u062A\u0648\u0635\u064A\u0627\u062A|\u062A\u0648\u0635\u064A\u0629)\s*[:\-]?\s*(.*)$/i);
  let src = m ? m[1].replace(/\b[A-Z]{1,5}\b.*$/, '').replace(/[:\-]+\s*$/, '').trim().slice(0, 40) : '';
  // a "Tip NAME source" / "source: NAME" line names the source; its own capital letters (e.g. "DA" in "DA Davidson") are not tickers
  const srcLine = text.match(/^\s*(?:tips?\s+)?(.{2,40}?)\s+source\s*$/im) || text.match(/^\s*(?:source|from|\u0627\u0644\u0645\u0635\u062F\u0631)\s*[:\-]\s*(.{2,40})$/im);
  const named = srcLine && /[a-z\u0600-\u06FF]/.test(srcLine[1]) ? srcLine : null;
  const body0 = m ? text.slice(first.length) + ' ' + m[1] : text, body = named ? body0.replace(named[0], ' ') : body0, found = [], re = /\b[A-Z]{1,5}\b/g; let x;
  while ((x = re.exec(body))) if (!NOT_TICKERS.has(x[0]) && !found.some(f => f.sym === x[0])) found.push({ sym: x[0], at: x.index });
  found.forEach((f, n) => { const seg = body.slice(f.at, n + 1 < found.length ? found[n + 1].at : f.at + 220), num = (r) => { const q = seg.match(r); return q ? +q[1].replace(/,/g, '') : null; };
    f.below = num(/(?:\u0627\u0642\u0644 \u0645\u0646|\u0623\u0642\u0644 \u0645\u0646|below|under)\s*\$?\s*([\d.,]+)/i); f.stated = num(/(?:\u0627\u0644\u062D\u0627\u0644\u064A|\u0627\u0644\u0633\u0639\u0631|current(?: price)?|price|now)\s*[:\-]?\s*\$?\s*([\d.,]+)/i); });
  // the source's name: one you logged before that appears anywhere in the text wins; then a line like "Tip NAME source" / "source: NAME"
  { const known = [...new Set(readTips().map(t => t.src))].filter(n => n && n.length >= 3 && n !== 'Unnamed source').sort((a, b) => b.length - a.length).find(n => text.includes(n.replace(/^youtube:\s*/i, '')));
    const line = text.match(/^\s*(?:tips?\s+)?(.{2,40}?)\s+source\s*$/im) || text.match(/^\s*(?:source|from|\u0627\u0644\u0645\u0635\u062F\u0631)\s*[:\-]\s*(.{2,40})$/im);
    if (named) src = named[1].trim(); else if (known) src = known; else if (line && !/\b[A-Z]{2,5}\b/.test(line[1])) src = line[1].trim(); }
  return { src: src || 'Unnamed source', tips: found.slice(0, 15) };
}
function tipExit(src, syms, raw) { const n = ny(Date.now()), atOpen = /\bopen(s|ing)?\b|\u0627\u0641\u062A\u062A\u0627\u062D/i.test(raw);
  const nextWd = (d) => { let ms = Date.parse(d + 'T12:00:00Z'); do { ms += 864e5; } while ([0, 6].includes(new Date(ms).getUTCDay())); return new Date(ms).toISOString().slice(0, 10); };
  const exitD = n.weekend ? nextWd(n.d) : atOpen ? (n.mins < 570 ? n.d : nextWd(n.d)) : (n.mins < 960 ? n.d : nextWd(n.d)), when = atOpen ? 'open' : 'close';
  const all = readTips(), out = [], marked = {};
  if (src === 'Unnamed source') { const last = [...all].reverse().find(t => syms.includes(t.sym) && !t.exit); if (last) src = last.src; }   // no name given: the source whose tip on this stock is still open
  for (const t of all) if (t.src === src && syms.includes(t.sym) && !t.exit && t.d <= exitD) { t.exit = { d: exitD, when, ts: Date.now() }; marked[t.sym] = (marked[t.sym] || 0) + 1; }
  fs.writeFileSync(TIP_FILE, all.map(t => JSON.stringify(t)).join('\n') + '\n');
  for (const sy of syms) out.push(marked[sy] ? sy + ': ' + src + ' says SELL. Its tip is closed at the ' + (when === 'open' ? 'open' : 'close') + ' of ' + exitD + ' and scored at that price.' : sy + ': no open tip from ' + src + ' for this stock, so nothing to close (send its buy message first).');
  const P = loadPos(), mine = syms.filter(sy => P[sy]);
  if (mine.length) out.push('', 'YOU HOLD ' + mine.join(', ') + '. The source\u2019s sell is its own call, not a tested exit. Your stop and the system\u2019s exit rules still apply; selling is your decision. If you sell, send:  sold SYM PRICE');
  return ['SOURCE SELL: ' + src, '', ...out].join('\n'); }
async function logTips(raw, fwd) {     // fwd = the channel or person a message was forwarded from, used as the source name when none is typed
  const parsed = parseTips(raw), tips = parsed.tips, src = parsed.src === 'Unnamed source' && fwd ? fwd : parsed.src; if (!tips.length) return 'I found no tickers in that message. Send it like this:\ntips SOURCE NAME\nLPG ETON PAYS';
  // the source says SELL (end of day or at the open): its tips are closed at that price, so the source is scored on its own exits
  const SELLW = /\b(sell|sold|exit|take profits?|close (the )?position|get out)\b|\u0628\u064A\u0639|(^|\s)\u0628\u0639(\s|$)|\u0627\u062E\u0631\u062C|\u062E\u0631\u0648\u062C|\u062C\u0646\u064A|\u062A\u0635\u0631\u064A\u0641/i, BUYW = /\b(buy|entry|accumulate)\b|\u0634\u0631\u0627\u0621|\u0627\u0634\u062A\u0631|\u062F\u062E\u0648\u0644/i;
  if (SELLW.test(raw) && !BUYW.test(raw)) return tipExit(src, tips.map(t => t.sym), raw);
  const paid = /\b(sponsored|paid (promotion|partnership|post)|compensated|on behalf of|#ad\b|affiliate|advertisement|promoted by)/i.test(raw);   // paid promotion: logged, but never trusted
  const old = readTips(), day = ny(Date.now()).d, out = ['Logged ' + tips.length + ' tip' + (tips.length > 1 ? 's' : '') + ' from: ' + src + (paid ? ' (PAID PROMOTION: the source was paid to post this. Logged and scored, but treat it as an advert, not advice.)' : ''), ''];
  for (const t of tips) {
    const rep = await checkLive(t.sym), px = rep.match(/Closed ([\d.]+)\./), concl = rep.split('\n').find(l => l.startsWith('CONCLUSION')) || (rep.includes('could not load') ? 'I could not load prices for this ticker.' : 'No tested rule supports a trade on this stock.');
    const p0 = px ? +px[1] : null;
    if (!p0) { out.push(t.sym + ': not logged. I could not load prices for it, so it is probably not a US ticker.'); continue; }
    if (!old.some(o => o.sym === t.sym && o.src === src && o.d === day)) fs.appendFileSync(TIP_FILE, JSON.stringify({ sym: t.sym, src, d: day, p0, below: t.below, ts: Date.now(), ...(paid ? { paid: true } : {}) }) + '\n');
    out.push(t.sym + (p0 ? ' at ' + money(p0) : '') + (t.below ? ' (source says buy below ' + money(t.below) + (p0 ? p0 <= t.below ? ', it is inside that zone' : ', it is ABOVE that level' : '') + ')' : '') + '\n  Short term: ' + concl.replace(/^CONCLUSION:?\s*/, '') + '\n  ' + horizonLine(t.sym) + '\n  ' + qualityLine(t.sym));
  }
  { let pg = []; try { pg = protectWhy(loadPos(), null, readJson('data/signals.json', null)); } catch (e) {} if (pg.length) out.push('', 'CAUTION (protect advice): ' + pg[0] + '. Setups above are real; buying is your decision, smaller size suggested.'); }
  out.push('', 'The source gave no stop and no selling price for any of these. I will follow each one and score this source against the S&P 500. Send: sources   to see the scoreboard. All of them are now on my nightly scan.');
  return out.join('\n');
}
function tipBoard(sig) {
  const b = sig && sig.tipBoard; if (!b || !b.tips || !b.tips.length) return readTips().length ? 'Tips are logged. Their results appear after the next nightly scan.' : 'No tips logged yet. Send:\ntips SOURCE NAME\nLPG ETON PAYS';
  const pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', out = ['TIP SOURCES, scored against the S&P 500 (from the ' + sig.session + ' close)'];
  for (const s0 of b.sources) out.push(s0.src + ': ' + s0.n + ' tips, average ' + pcx(s0.avg) + ' against ' + pcx(s0.spy) + ' for the S&P 500' + (typeof s0.withStop === 'number' ? ' (with the tested stop added: ' + pcx(s0.withStop) + ')' : '') + '. ' + s0.beat + ' of ' + s0.n + ' beat the market. ' + (s0.muted ? 'MUTED: trails the market. ' : s0.trusted ? 'TRUSTED so far: ahead of the market. ' : '') + 'Record: ' + (s0.n < 10 || s0.days < 20 ? 'INSUFFICIENT EVIDENCE (under 10 tips or under a month)' : s0.n < 30 ? 'EARLY RECORD (10 to 29 tips)' : s0.n < 50 ? 'TRACKABLE RECORD (30+ tips)' : 'MORE RELIABLE RECORD (50+ tips)') + '.');
  out.push('', 'EACH TIP'); for (const t of b.tips.slice(-20)) out.push(t.sym + ' (' + t.src + ', ' + t.d + '): ' + (t.ret === null ? 'too early' : pcx(t.ret) + ' in ' + t.days + ' sessions, S&P 500 ' + pcx(t.spy)));
  return out.join('\n');
}
function checkOne(sym, sig) {
  if (!sig) return 'No scan has run yet.';
  const q = (sig.quick || []).find(x => x.sym === sym), st = (sig.stocks || []).find(x => x.sym === sym), qOk = q && q.n >= 30 && okEv(q.n, netOf(q.avgPct, q.last), q.win), stOk = st && st.state === 'Buy watch' && (st.n || 0) >= 30 && okEv(st.n || 0, netOf(st.avgPct || 0, st.last), st.win);
  const word = qOk || stOk ? 'BUY: a tested setup is open. Send  today  for the prices.' : st && st.state === 'Buy watch' ? 'WATCH ONLY: entry signal, but under 30 tested trades (early evidence). Paper only.' : q ? 'WATCH: quick setup with too little proof. Paper only.' : st && st.state === 'Blocked' ? 'NO BUY: blocked by earnings or news.' : st && st.proven && st.trigger ? 'WATCH: needs a daily close above ~' + money(st.trigger) + '.' : 'NO BUY: no tested setup.';
  const gv1 = gateVerdict(sym, sig), lines = [sym + ': ' + (myHalal(sym) === 'fail' ? 'NO BUY: you marked it NOT halal in ZAD.' : gv1 && /^BUY/.test(word) ? 'NO BUY (paper only): ' + gv1 + '.' : word), sym + ', from the ' + sig.session + ' close'];
  if (q) lines.push('Quick trade setup: entry ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ', invalidation ' + money(q.stop) + (q.t1 ? ', target 1 ' + money(q.t1) : '') + '. Past result ' + Math.round(q.win * 100) + '% wins over ' + q.n + ' trades.');
  if (st) lines.push('Closed ' + money(st.last) + '. ' + (st.uptrend ? 'In an uptrend' : 'Not in an uptrend') + ', ' + (st.mom6 >= 0 ? '+' : '') + Math.round(st.mom6 * 100) + '% over 6 months.', 'Rule: ' + st.rule + '. ' + (st.proven ? 'It passed its tests.' : 'It did not pass its tests, so no signals are given.'), 'State: ' + (st.state === 'Buy watch' ? 'ENTRY CONFIRMED' : st.trigger ? 'BUY WATCH, needs a close above ~' + money(st.trigger) : st.state) + '. ' + st.why, L.HALAL_TEXT[st.halal] || '');
  if (!q && !st) lines.push('Not on the scanned list, or it has under three years of price history. To have me scan it, add it to watchlist.txt in the repository. To check it right away, add it to the watchlist in Setup on the page.');
  return lines.filter(Boolean).join('\n');
}
// Pre-market briefing: sent once each weekday about an hour before the US open, without being asked.
async function preMarket(sig) {
  if (!sig || !env.TG_TOKEN || !env.TG_CHAT) return;
  const n = ny(Date.now());
  if (!env.BRIEF_NOW && (n.weekend || isHoliday(n.d) || n.mins < 240 || n.mins > 300)) return;        // 4:00 to 5:00 am New York = when US pre-market trading opens (11 am Kuwait time while New York is on summer time, noon in winter)
  const st = readJson('data/tg-state.json', { offset: 0 }); if (st.brief === n.d && !env.BRIEF_NOW) return;
  if (QUIET()) await telegram(await actionsText(sig, loadPos(), null, 'MORNING ACTIONS, ' + n.d + '. Market opens 4:30 pm Kuwait (5:30 pm from November).') + '\n\nTap a button below after you act: I record it for you.', tradeButtons(sig, loadPos()));
  else await telegram(planText(sig, loadPos(), null, 'MORNING PLAN, ' + n.d + '. Market opens 4:30 pm Kuwait. Prices from the ' + sig.session + ' close.') + '\nDuring the session send: today   for live prices.');
  st.brief = n.d; fs.writeFileSync('data/tg-state.json', JSON.stringify(st));
  console.log('pre-market briefing sent');
}
// "market": what is moving right now. Indexes, the eleven sectors ranked by today's change, and the latest tagged headlines.
const SECTORS = { XLK: 'Technology', XLF: 'Financials', XLE: 'Energy', XLV: 'Health care', XLY: 'Consumer discretionary', XLP: 'Consumer staples', XLI: 'Industrials', XLB: 'Materials', XLU: 'Utilities', XLRE: 'Real estate', XLC: 'Communication' };
async function marketNow() {
  // Outside forces that move groups of stocks: oil for energy companies, metals for miners, Bitcoin for crypto-linked and speculative stocks.
  // Shown as context through exchange-traded funds that follow them. Not a suggestion to trade any of them.
  const DRIVERS = { USO: 'Crude oil', GLD: 'Gold', SLV: 'Silver', CPER: 'Copper', XME: 'Metals and mining companies', IBIT: 'Bitcoin' };
  const idx = { SPY: 'S&P 500', QQQ: 'Nasdaq 100', IWM: 'Small companies' }, syms = [...Object.keys(idx), ...Object.keys(SECTORS), ...Object.keys(DRIVERS)], q = {};
  for (let k = 0; k < syms.length; k += 7) {            // two batches: the free plan allows 8 quotes a minute
    if (k) await sleep(FAST ? 5 : 62000);
    try { const part = syms.slice(k, k + 7), r = await fetch(TD + '/quote?symbol=' + part.join(',') + '&apikey=' + encodeURIComponent(env.TWELVE_KEY)), j = await r.json(); for (const x of part) { const v = part.length === 1 ? j : j[x]; if (v && v.percent_change !== undefined) q[x] = +v.percent_change / 100; } } catch (e) {}
  }
  const pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%', out = ['MARKET NOW' + (marketOpen(Date.now()) ? '' : ' (market closed: last session)')];
  out.push(Object.keys(idx).filter(x => q[x] !== undefined).map(x => idx[x] + ' ' + pcx(q[x])).join(', ') || 'Index prices unavailable.');
  const secs = Object.keys(SECTORS).filter(x => q[x] !== undefined).sort((a, b) => q[b] - q[a]);
  if (secs.length) out.push('', 'SECTORS TODAY, strongest first', ...secs.map(x => SECTORS[x] + ' ' + pcx(q[x])), '', 'Strongest: ' + secs.slice(0, 2).map(x => SECTORS[x]).join(', ') + '. Weakest: ' + secs.slice(-2).map(x => SECTORS[x]).join(', ') + '.', 'One day of sector moves is mostly noise. The weekly review shows which sectors are really leading.');
  const drv = Object.keys(DRIVERS).filter(x => q[x] !== undefined);
  if (drv.length) out.push('', 'OIL, METALS AND BITCOIN TODAY (context for the stocks tied to them)', ...drv.map(x => DRIVERS[x] + ' ' + pcx(q[x])), 'Oil moves energy stocks, metals move miners, and Bitcoin tends to move with crypto-linked and speculative stocks. A one-day move is context, not a signal.');
  if (env.FINNHUB_KEY) {
    const tag = (t) => /\bFDA\b|PDUFA|phase (2|3|ii|iii)\b|trial/i.test(t) ? 'FDA' : /\bmerg|acqui|takeover|buyout|tender offer/i.test(t) ? 'Deal' : /earnings|guidance|results/i.test(t) ? 'Earnings' : /\bFed\b|rates?\b|inflation|jobs|tariff/i.test(t) ? 'Economy' : null, heads = [];
    for (const cat of ['merger', 'general']) { try { const r = await fetch(FH + '/news?category=' + cat + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (r.ok) for (const x of (await r.json()).slice(0, 25)) { const t = tag(x.headline || '') || (cat === 'merger' ? 'Deal' : null); if (t && Date.now() - x.datetime * 1000 < 36 * 3600000) heads.push({ t, h: String(x.headline).slice(0, 120), rel: String(x.related || '').split(',')[0], at: x.datetime }); } } catch (e) {} }
    heads.sort((a, b) => b.at - a.at);
    const seen = new Set(), top = heads.filter(x => !seen.has(x.h) && seen.add(x.h)).slice(0, 8);
    out.push('', 'HEADLINES, last 36 hours', ...(top.length ? top.map(x => x.t + (x.rel ? ' ' + x.rel : '') + ': ' + x.h) : ['Nothing tagged deal, FDA, earnings or economy.']));
  } else out.push('', 'Headlines are off: the Finnhub key is not passed to this bot yet.');
  out.push('', 'This is a picture of the moment, not advice on what to buy or sell. By the time a headline is here, the price has usually moved.');
  return out.join('\n');
}
// Negative news that blocks a NEW entry for a week. Evidence: disclosed regulator investigations are followed by months of
// underperformance; drug rejections, going-concern warnings, delisting notices, short-seller reports and bankruptcies bring losses
// too large to step in front of. Lawsuits and law-firm notices are common and mostly priced in at once, so they warn but do not block.
const HARD_NEG = [
  ['Regulator investigation', /\b(SEC|DOJ|FTC|Justice Department|regulators?)\b[^.]{0,60}\b(investigat\w*|probe|subpoena\w*|charges?|inquiry)|\bsubpoena(ed)?\b|under (federal |criminal )?investigation/i],
  ['FDA rejection', /complete response letter|\bCRL\b|FDA (rejects|rejection|declines|refuses|refusal)|refus(e|al)[- ]to[- ]file|clinical hold/i],
  ['Going-concern warning', /going[- ]concern/i],
  ['Delisting notice', /delisting|to be delisted|listing (deficiency|standards)|deficiency (notice|letter)|non-?compliance (notice|letter)/i],
  ['Short-seller report', /short[- ]seller|short report|hindenburg|muddy waters|citron research|spruce point|grizzly research/i],
  ['Bankruptcy', /bankruptcy|chapter 11/i],
  ['Accounting restatement', /restat(e|es|ed|ement)\b[^.]{0,40}(financial|results|earnings|statements)|accounting irregularit/i],
  // New shares sold to raise money. Evidence: companies that issue stock lag the market afterwards, and the sale itself is usually priced under the market.
  ['Share offering', /\b(pric(es|ed|ing)|announc(es|ed|ing)|launch(es|ed|ing)?|propos(es|ed)|commenc(es|ed|ing)|clos(es|ed|ing)|files? for|plans?)\b[^.]{0,70}\b((public|follow-on|underwritten|registered direct|secondary) offering|offering of (common |ordinary )?(stock|shares|ADSs)|private placement|convertible (senior )?notes)|\bregistered direct\b|\bsecondary offering\b|at-the-market (offering|program|facility)|\bATM (offering|program|facility)\b|\b(share|stock|equity) offering\b/i]];
const SOFT_NEG = /class action|lawsuit|\bsue[sd]?\b|securities fraud|shareholder alert|investor alert|lead plaintiff|on behalf of (investors|shareholders)|law (firm|offices?)/i;
const LAWFIRM = /shareholder alert|investor alert|investors? (are )?(encouraged|reminded|urged)|reminds (investors|shareholders)|law (firm|offices?)|lead plaintiff|on behalf of (investors|shareholders)|pomerantz|rosen law|levi & korsinsky|bragar eagel|glancy prongay|faruqi|kessler topaz|robbins geller|bernstein liebhard|schall law|hagens berman/i;
const ROUNDUP = /stocks? (mixed|moving|movers)|gap up and gap down|pre-market session|midday stories|top stories|market (wrap|update)|biggest (gainers|movers|losers)/i;
function negNews(heads) {      // heads: this company's own headlines, newest first
  const own = heads.filter(h => h && !ROUNDUP.test(h));
  for (const h of own) { if (LAWFIRM.test(h)) continue; const t = HARD_NEG.find(([, re]) => re.test(h)); if (t) return { hard: { tag: t[0], h: h.slice(0, 110) }, soft: null }; }
  const s = own.find(h => SOFT_NEG.test(h));
  return { hard: null, soft: s ? { tag: 'Legal news', h: s.slice(0, 110) } : null };
}
async function newsRisk(sym) {
  if (!env.FINNHUB_KEY) return { known: false };
  try { const d = (ms) => new Date(ms).toISOString().slice(0, 10), r = await fetch(FH + '/company-news?symbol=' + sym + '&from=' + d(Date.now() - 7 * 86400000) + '&to=' + d(Date.now()) + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (!r.ok) return { known: false };
    const it = await r.json(); return { known: true, ...negNews((Array.isArray(it) ? it : []).map(x => String(x.headline || ''))) }; } catch (e) { return { known: false }; } finally { await sleep(FAST ? 0 : 1100); }
}
// ---- Fast movers requiring investigation. A SEPARATE category from quality candidates: a stock up 50% is not a good
// investment because it is up 50%; it is a priority to look into. Source: FMP's live gainers list (if your plan allows it).
async function gainersNow() {
  if (!env.FMP_KEY) return { off: 'no FMP key is passed to the bot' };
  try {
    const r = await fetch(FMPB + '/stable/biggest-gainers?apikey=' + encodeURIComponent(env.FMP_KEY));
    if (!r.ok) return { off: 'FMP answered HTTP ' + r.status + ' for the live gainers list (not on your plan)' };
    const j = await r.json(); if (!Array.isArray(j)) return { off: 'FMP returned no list' };
    return { list: j.map(x => ({ sym: String(x.symbol || ''), price: +x.price, pct: +(x.changesPercentage ?? x.changePercentage ?? x.changePercent ?? 0) / 100, name: String(x.name || '').slice(0, 40) })).filter(x => /^[A-Z]{1,5}$/.test(x.sym) && x.price >= 0.1 && x.pct >= 0.2 && x.pct < 20).sort((a, b) => b.pct - a.pct) };
  } catch (e) { return { off: 'the live gainers list could not be reached' }; }
}
async function whyMoved(sym, name) {     // the headline must be about THIS company; general market round-ups are ignored
  if (!env.FINNHUB_KEY) return '';
  try { const d = (ms) => new Date(ms).toISOString().slice(0, 10), r = await fetch(FH + '/company-news?symbol=' + sym + '&from=' + d(Date.now() - 2 * 86400000) + '&to=' + d(Date.now()) + '&token=' + encodeURIComponent(env.FINNHUB_KEY)); if (!r.ok) return '';
    const it = await r.json(); if (!Array.isArray(it) || !it.length) return '\n  cause: UNRESOLVED (no company news in the last 2 days; SEC filings checked below). Not proof of a pump, but no reason to expect it to continue.';
    const word = String(name || '').split(/[\s,.]+/)[0], esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const about = new RegExp('\\b' + esc(sym) + '\\b' + (word.length >= 4 ? '|' + esc(word) : ''), 'i'), roundup = /stocks? (mixed|moving|movers)|gap up and gap down|pre-market session|midday stories|top stories|market (wrap|update)|biggest (gainers|movers)/i;
    const tagOf = (h) => { const hn = LAWFIRM.test(h) ? null : HARD_NEG.find(([, re]) => re.test(h)); if (hn) return 'WARNING, ' + hn[0].toUpperCase(); return tagOf0(h); };
    const tagOf0 = (h) => /offering|private placement|warrants|registered direct/i.test(h) ? 'SHARE OFFERING (dilution)' : /trading halt|halted/i.test(h) ? 'TRADING HALT' : /\bFDA\b|PDUFA|phase (2|3|ii|iii)|trial|approval/i.test(h) ? 'FDA / trial' : /\bmerg|acqui|takeover|buyout|to be bought/i.test(h) ? 'Deal' : /earnings|guidance|results|quarter/i.test(h) ? 'Earnings' : /contract|partnership|awarded|agreement/i.test(h) ? 'Contract' : null;
    const heads = it.map(x => String(x.headline || '')).filter(Boolean), own = heads.filter(h => about.test(h) && !roundup.test(h)), pick = own.find(h => /^WARNING/.test(tagOf(h) || '')) || own.find(h => tagOf(h)) || own[0] || heads.find(h => tagOf(h) && !roundup.test(h));
    if (!pick) return '\n  cause: UNRESOLVED (only general market round-ups, nothing about this company; SEC filings checked below).';
    return '\n  news: ' + (tagOf(pick) || 'Company news') + ' \u2014 ' + pick.slice(0, 120) + (tagOf(pick) === 'Deal' && /to be (acquired|bought|taken private)|acquired by|agrees? to be|buyout|takeover (bid|offer)|tender offer|to sell itself/i.test(pick) ? '\n  note: if this company is being bought, the price usually jumps to near the offer at once and then barely moves.' : tagOf(pick) === 'Deal' && /to acquire|acquires|acquisition of|to buy\b/i.test(pick) ? '\n  note: this company is the buyer. A buyer\u2019s share price often dips on the news.' : ''); } catch (e) { return ''; } finally { await sleep(FAST ? 0 : 1100); }
}
const moverEvidence = () => { const m = readJson('data/movers-state.json', null); return m && m.study ? '\nWhat the last ' + m.sessions + ' sessions say about buying after a 20% jump: ' + m.study : '\nThe movers radar has not produced its study yet.'; };
// OUTSIDE-IN: before the price, the situation. Its own runner history (the radar's journal) and the base rate for stocks like it.
const moverSituation = (x) => { const out = [], M = readJson0('data/movers-state.json') || {}; let J = []; try { J = fs.readFileSync('data/movers-journal.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) {}
  const past = J.filter(e => e.sym === x.sym && e.d < ny(Date.now()).d).slice(-3); out.push(past.length ? 'history: ran 20%+ before on ' + past.map(e => e.d + ' (' + (e.ret >= 0 ? '+' : '') + Math.round(e.ret * 100) + '%)').join(', ') + ': a repeat runner (repeat runs often come with share sales)' : 'history: first 20%+ run seen by the radar (45-session memory)');
  const base = x.price < 5 ? M.penny : M.study; if (base) out.push('stocks like it (' + (x.price < 5 ? 'under 5 USD' : 'all prices') + ') bought the next morning: ' + base.replace(/^three sessions after the next open they were typically (\S+), and/, 'typically $1 three sessions later, and'));
  return out.map(l => '\n  ' + l).join(''); };
// INDUSTRY (SEC industry code, official, one look-up per company, cached in data/sic-extra.json): is the runner moving alone, or with
// other stocks of the same industry (a theme)? Only gainers whose industry is already known are compared, and the count says so.
let TICKS = null;
async function secIndustry(sym, fetchIt) { const X = readJson('data/sic-extra.json', {}), CK = readJson0('data/sec-ciks.json') || {};
  if (X[sym]) return { sic: X[sym][0], desc: X[sym][1] }; if (CK[sym] && CK[sym][1] && !fetchIt) return { sic: CK[sym][1], desc: null };
  if (!fetchIt) return null; try { let cik = CK[sym] && CK[sym][0]; if (!cik) { if (!TICKS) TICKS = await secJson(SEC_WWW + '/files/company_tickers.json'); const hit = TICKS && Object.values(TICKS).find(t => String(t.ticker || '').toUpperCase().replace(/-/g, '.') === sym); if (hit) cik = hit.cik_str; }
    const fb = CK[sym] && CK[sym][1] ? { sic: CK[sym][1], desc: null } : null; if (!cik) return fb; const j = await secJson(SEC_DATA + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json'); if (!j || !j.sic) return fb;
    X[sym] = [String(j.sic), String(j.sicDescription || ''), ny(Date.now()).d]; fs.writeFileSync('data/sic-extra.json', JSON.stringify(X)); return { sic: String(j.sic), desc: j.sicDescription || null }; } catch (e) { return null; } }
async function industryLine(x, list) { const me = await secIndustry(x.sym, true); if (!me) return '\n  industry: unknown (no SEC industry code found)';
  let known = 0; const same = []; for (const o of list) { if (o.sym === x.sym) continue; const k = await secIndustry(o.sym, false); if (!k) continue; known++; if (String(k.sic).slice(0, 3) === String(me.sic).slice(0, 3)) same.push(o.sym); }
  return '\n  industry: ' + (me.desc || 'SEC code ' + me.sic) + (same.length ? ' | moving WITH its industry: ' + same.slice(0, 4).join(', ') + ' also up 20%+ now (a theme)' : ' | moving ALONE: none of the ' + known + ' other gainers with a known industry are from it'); }
// ONE-LINE VERDICT FIRST (the web in one sentence): what this move is and why the answer is what it is; the detail follows.
function runnerVerdict(x, full) { const why = [];
  if (/SEC RISK/.test(full)) why.push('new shares or delisting notice filed (supply)'); else if (/DILUTION:/.test(full)) why.push('the company keeps selling new shares (supply)');
  if (/cause: UNRESOLVED/.test(full)) why.push('no known cause'); else if (/news: WARNING/.test(full)) why.push('bad news behind it'); else if (/news: /.test(full)) why.push('has company news');
  if (/repeat runner/.test(full)) why.push('repeat runner'); if (/moving WITH its industry/.test(full)) why.push('part of an industry theme'); else if (/moving ALONE/.test(full)) why.push('moving alone in its industry');
  if (x.price < 1) why.push('under 1 USD'); else if (x.price < 5) why.push('under 5 USD');
  const m = full.match(/typically (-?\+?[\d.]+%) three sessions later/); return x.sym + ': NO BUY: ' + (why.length ? why.join(', ') : 'already up 20%+') + (m ? '; stocks like it: typically ' + m[1] + ' in 3 days' : '') + '.\n' + full; }
const moverLine = async (x) => x.sym + ' ' + (x.pct >= 0 ? '+' : '') + Math.round(x.pct * 100) + '% at ' + money(x.price) + (x.name ? ' (' + x.name + ')' : '') + (x.price < 5 ? '\n  under 5 USD: can be halted, wide spread, gaps past stops' : '') + (await whyMoved(x.sym, x.name)) + moverSituation(x);
async function fastMovers() {     // automatic alert, at most a few a day, each stock once
  const now = Date.now(); if (!marketOpen(now)) return;
  const st = readJson('data/fm-state.json', { day: '', sent: {}, off: '' }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; st.off = ''; }
  if (st.off || Object.keys(st.sent).length >= 12) return;
  const g = await gainersNow();
  if (g.off) { st.off = g.off; console.log('fast movers off today: ' + g.off); fs.writeFileSync('data/fm-state.json', JSON.stringify(st)); return; }
  const RUN = (readJson0('data/settings.json') || {}).runners !== false && QUIET(), fresh = g.list.filter(x => x.price >= (RUN ? 0.1 : 1) && !st.sent[x.sym]).slice(0, 4); if (!fresh.length) return;      // the runners heads-up includes 0.10-1 USD stocks (flagged); the old alert stays at 1 USD+
  const lines = []; for (const x of fresh) { st.sent[x.sym] = 1; lines.push((await moverLine(x)) + (await industryLine(x, g.list))); }
  fs.writeFileSync('data/fm-state.json', JSON.stringify(st));
  const ST = readJson0('data/settings.json') || {}, runners = ST.runners !== false && ST.opportunitiesOnly === false;   // opportunities only (23 Oct): heads-ups with no tested buy are not sent unless opportunitiesOnly is false   // runners heads-up: ON unless you send  runners off  (also in quiet mode)
  if (runners && QUIET()) { const ER = readJson0('data/events-recent.json'), secOf = (sym) => { const ev = ((ER && ER.events) || []).filter(e => e.sym === sym && /DELIST|DILUTION|OFFERING|RESTATE/.test(e.f)); return ev.length ? '\n  SEC RISK: ' + ev.map(e => e.f.split(',').filter(k => /DELIST|DILUTION|OFFERING|RESTATE/.test(k)).map(k => ({ DELIST: 'delisting notice', DILUTION: 'new shares sold', OFFERING: 'share offering', RESTATE: 'restated results' })[k]).join(', ') + ' ' + e.p.slice(5, 10)).join('; ') : ''; };
    await telegram('RUNNERS NOW (heads-up only: already up 20%+, no tested way to buy these yet)\n\n' + lines.map((l, i) => runnerVerdict(fresh[i], l + secOf(fresh[i].sym) + (dilutionLine(fresh[i].sym) ? '\n  ' + dilutionLine(fresh[i].sym) : '') + (fresh[i].price < 1 ? '\n  UNDER 1 USD: pump-style risk (halts, reverse splits, share sales; many fall back 50%+ within days)' : fresh[i].price < 5 && fresh[i].pct >= 0.5 ? '\n  PUMP-STYLE MOVE: small price, 50%+ in a day; these often fade fast' : ''))).join('\n\n') + '\n\nDECISION: NO BUY. Already up 20%+ is too late: the evidence above says most fall back. The early chance is BEFORE the jump: watch for an EARLY WAVE ALERT instead. Send  runners off  to stop these.'); }
  if (!QUIET()) await telegram('FAST MOVERS REQUIRING INVESTIGATION\nNot quality candidates. Already moving. Investigate before anything else.\n\n' + lines.join('\n\n') + '\n' + moverEvidence() + '\n\nNo entry or exit prices are given for fast movers: nothing here has been tested on them. Not financial advice, not a halal ruling.');
  console.log('fast movers alert: ' + fresh.length);
}
async function moversNow() {      // the "movers" command
  const g = await gainersNow(); if (g.off) return 'Live movers are unavailable: ' + g.off + '. The nightly movers radar still reports the day\u2019s movers after the close.';
  if (!g.list.length) return 'No stock is up 20% or more right now.';
  const main = g.list.filter(x => x.price >= 1), sub = g.list.filter(x => x.price < 1), lines = []; for (const x of main.slice(0, 8)) lines.push(await moverLine(x));
  return 'FAST MOVERS RIGHT NOW (investigation list, not quality candidates)\n\n' + (lines.length ? lines.join('\n\n') : 'None at 1 USD and over.')
    + (sub.length ? '\n\nUNDER 1 USD (extreme risk: shown so nothing is hidden, never a trade)\n' + sub.slice(0, 6).map(x => x.sym + ' +' + Math.round(x.pct * 100) + '% at ' + x.price.toFixed(3) + (x.name ? ' (' + x.name + ')' : '')).join('\n') + '\nStocks under 1 USD can be halted, delisted or diluted within days.' : '') + '\n' + moverEvidence();
}
// ---- Plain questions. No AI: the bot looks for a few words (sell, buy, penny, a sector name, a ticker) and answers from its own data.
const SECTORS_OF = {}; for (const [name, list] of Object.entries({
  'Technology': 'AAPL MSFT NVDA AVGO AMD ORCL CRM ADBE AMAT CSCO IBM INTC INTU NOW QCOM TXN ACN PLTR PANW MU SHOP ADP',
  'Consumer discretionary': 'AMZN TSLA HD BKNG LOW MCD NKE SBUX TGT TJX UBER', 'Communication': 'GOOGL META NFLX DIS T TMUS VZ CMCSA',
  'Financials': 'JPM BAC V MA SPGI', 'Health care': 'UNH LLY JNJ ABBV ABT AMGN BMY CVS DHR GILD ISRG MDT MRK PFE TMO VRTX REGN ZTS CI ELV',
  'Energy': 'XOM CVX COP', 'Consumer staples': 'WMT COST PG KO PEP', 'Industrials': 'CAT DE GE HON MMM UNP UPS', 'Materials': 'LIN', 'Utilities': 'NEE SO' })) for (const x of list.split(' ')) SECTORS_OF[x] = name;
const SECTOR_WORDS = [['Technology', /\b(tech|technology|software|semiconductors?|chips?|ai)\b/i], ['Health care', /\b(health|healthcare|pharma|biotech|medical|drug)\w*/i], ['Energy', /\b(energy|oil|gas)\b/i], ['Financials', /\b(financ\w*|banks?|payments?)\b/i],
  ['Consumer discretionary', /\b(consumer|retail|discretionary|cars?|autos?)\b/i], ['Consumer staples', /\b(staples|food|beverages?)\b/i], ['Communication', /\b(communication|media|telecom|streaming)\b/i], ['Industrials', /\b(industrials?|machinery|transport|airlines?|defen[cs]e)\b/i], ['Materials', /\b(materials?|mining|metals?|chemicals?)\b/i], ['Utilities', /\butilit\w*/i]];
const COMMON_WORDS = new Set('IT THIS THAT MY THE A AN NOW TODAY STOCK STOCKS PENNY ME SOME ANY THEM ALL AND OR FOR TO IN ON OF IS ARE WHAT WHEN SHOULD CAN DO I WE YOU BUY SELL HOLD SHARE SHARES PLEASE NEW GOOD BEST HOT ONE HUNT FIND LOOK GIVE WANT NEED UP DOWN OUT AT MORE AGAIN BACK HIGH LOW INTO SOON LATER HERE THERE BEFORE AFTER MUCH MANY JUST RIGHT GOING WHEN THEN IF NOT YET'.split(' '));
function findTicker(text, sig, pos) {
  const known = new Set([...Object.keys(pos || {}), ...((sig && sig.stocks) || []).map(x => x.sym), ...((sig && sig.quick) || []).map(x => x.sym), ...((sig && sig.uni) || []).map(x => x.sym)]);
  const toks = text.replace(/[^A-Za-z.\s-]/g, ' ').split(/\s+/).filter(Boolean), okT = (t) => !COMMON_WORDS.has(t) && !NOT_TICKERS.has(t);
  for (const t of toks) if (/^[A-Z]{2,5}$/.test(t) && okT(t)) return t;                                  // written in capitals
  for (const t of toks) if (known.has(t.toUpperCase()) && okT(t.toUpperCase())) return t.toUpperCase();   // a stock I already follow
  const m = text.match(/\b(?:sell|buy|check|about|hunt|find)\s+([A-Za-z]{1,5})\b/i); return m && okT(m[1].toUpperCase()) ? m[1].toUpperCase() : null;
}
const universe = (sig) => { const ind = {}; for (const c of ((DISCMETA && DISCMETA.candidates) || [])) if (c.industry) ind[c.sym] = c.industry;
  return [...((sig && sig.stocks) || []), ...((sig && sig.uni) || [])].map(x => ({ ...x, sector: SECTORS_OF[x.sym] || ind[x.sym] || 'Other' })); };
const supportLine = (x, sig) => { const gv = gateVerdict(x.sym, sig); if (gv && ((x.state === 'Buy watch' && x.buyLo) || ((sig && sig.quick) || []).some(k => k.sym === x.sym))) return x.sym + ': setup, PAPER ONLY (' + gv + ')'; return supportLine0(x, sig); };
const supportLine0 = (x, sig) => { const q = ((sig && sig.quick) || []).find(k => k.sym === x.sym);
  return x.state === 'Buy watch' && x.buyLo ? x.sym + ': ENTRY CONFIRMED. BUY ' + money(x.buyLo) + ' to ' + money(x.buyHi) + ' | STOP ' + money(x.stop) + ' | SELL ' + (x.target ? money(x.target) : 'below ~' + money(x.exitBelow))
    : q ? x.sym + ': QUICK TRADE. BUY ' + money(q.buyLo) + ' to ' + money(q.buyHi) + ' | STOP ' + money(q.stop) + ' | SELL ' + (q.t1 ? money(q.t1) : 'on the rule exit')
    : x.proven && x.trigger && x.trigger / x.last < 1.15 ? x.sym + ': BUY WATCH. Only after a daily close above ~' + money(x.trigger) + ' (now ' + money(x.last) + ')' : null; };
function sectorReply(name, sig) {
  const rows = universe(sig).filter(x => x.sector.toLowerCase().includes(name.toLowerCase()) || (name === 'Health care' && /bio|pharma|health|medical|drug/i.test(x.sector)) || (name === 'Technology' && /semi|software|tech|electron/i.test(x.sector)));
  if (!rows.length) return name + ': I have no stocks from this sector on my scan. Add some with:  check TICKER';
  const sup = rows.map(x => supportLine(x, sig)).filter(Boolean), up = rows.filter(x => x.uptrend).sort((a, b) => b.mom6 - a.mom6);
  return [name.toUpperCase() + ', from the ' + sig.session + ' close: ' + rows.length + ' stock' + (rows.length === 1 ? '' : 's') + ' on my scan, ' + up.length + ' in an uptrend.', '', 'WITH TESTED SUPPORT', ...(sup.length ? sup : ['None today.']), '', 'STRONGEST TRENDS (no trade unless listed above)', ...(up.length ? up.slice(0, 6).map(x => x.sym + ' ' + (x.mom6 >= 0 ? '+' : '') + Math.round(x.mom6 * 100) + '% in 6 months, closed ' + money(x.last)) : ['None in an uptrend.']), '', 'For any of them: check TICKER'].join('\n');
}
// OPINION CHECK: a pasted or forwarded opinion with no tickers (a market call, a "buy now" message) cannot be scored as a tip,
// so it is answered with what can be checked: its warning signs, what the system's own data says about the themes it names,
// and which stocks in those themes have tested support today.
const RED_FLAGS = [
  [/استثمر بالكامل|كل (اموالك|أموالك|فلوسك|المال)|all[\s-]?in\b|invest (everything|it all)|fully invested/i, 'It tells you to put in everything. That one advice can cost a large part of an account in a single fall.'],
  [/لا تقلق|ولا تقلق|don'?t worry|no risk|بدون مخاطر|مضمون|guarantee/i, 'It tells you not to worry. Any real plan says where you get out if it is wrong; this one has no stop.'],
  [/(حتى|الى|إلى)\s*عام\s*\S{2,4}|until\s+20\d\d|لا يمكن ايقاف|لا يمكن إيقاف|unstoppable|can'?t be stopped|سوف تتجاوز|will (surely|definitely)/i, 'It states the future as a fact. Nobody knows that.'],
  [/متلاعب|manipulat/i, 'It blames every drop on manipulators in advance, so you would ignore any warning.'],
  [/حان (وقت|الوقت)|فرص[ةه] رائع|now is the time|don'?t miss|لا تفوت/i, 'It pushes urgency: "now". Real opportunities can wait for a plan.'],
  [/مذهل|سعداء|استمتع|amazing|incredible|!!/i, 'It runs on excitement, not evidence: no prices, no record, no numbers.']];
const THEMES = [
  ['AI, chips, memory and data centres', /ذكاء|اصطناعي|\bai\b|مراكز البيانات|data ?cent|الذاكرة|الذكرة|memory|chip|رقائق|semiconductor/i, 'Technology'],
  ['Energy and power', /طاقة|الطاقه|energy|power|نفط|oil|كهرباء|electric/i, 'Energy'],
  ['Shipping and transport', /شحن|shipping|ناقلات|tankers?|transport/i, 'Industrials']];
const THEME_PROXY = { 'AI, chips, memory and data centres': 'SMH', 'Energy and power': 'XLE', 'Shipping and transport': 'XLI' };   // measuring sticks only, never suggested as buys
const OPIN_FILE = 'data/opinions.jsonl';
const readOpinions = () => fs.existsSync(OPIN_FILE) ? fs.readFileSync(OPIN_FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
// Does the message touch what the system is working on right now: your positions, today's buys, the radar?
const themeOfSector = (sec) => !sec ? null : /semi|software|tech|electron|communication/i.test(sec) ? 'AI, chips, memory and data centres' : /energy|oil|gas|utilit|power/i.test(sec) ? 'Energy and power' : /marine|shipping|transport|logistic|airline|industrial/i.test(sec) ? 'Shipping and transport' : null;
// LEARN FROM A MARKET MESSAGE: claims checked against the data, and its market call logged and scored 20 sessions later
const MCALL_FILE = 'data/market-calls.jsonl';
async function opinionChecks(text, src) { const out = [], spyD = await loadDaily('SPY').catch(() => null), c = spyD && spyD.candles;
  // 1. inflation / PPI / CPI claims -> what the S&P 500 did the next day after such releases (calendar study)
  if (/\u062A\u0636\u062E\u0645|inflation|\bPPI\b|\bCPI\b|\u0627\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u0646\u062A\u062C\u064A\u0646|producer prices/i.test(text)) { const C = calRead0(), S = C && C.study && C.study.bySurprise, hot = !/\u0627\u0642\u0644|\u0623\u0642\u0644|lower|cool|softer|\u0627\u0646\u062E\u0641\u0636/i.test(text) || /\u0627\u0639\u0644\u0649|\u0623\u0639\u0644\u0649|higher|hot|\u0642\u0641\u0632/i.test(text);
    const ks = S ? Object.keys(S).filter(k => /INFL|CPI|PPI|PCE/i.test(k) && k.endsWith(hot ? '_HOT' : '_COOL')) : [];
    if (ks.length) for (const k of ks.slice(0, 3)) { const r = S[k]; out.push('- After ' + (hot ? 'HOTTER' : 'COOLER') + ' inflation news (' + r.events + ' releases), the S&P 500 the next day: ' + pcs(r.older.r1) + ' (older half), ' + pcs(r.newer.r1) + ' (newer half). ' + (/both halves/.test(r.verdict) ? 'A steady pattern: ' + r.verdict + '.' : 'No steady pattern, so "bad news is good news" is not proven by the data.')); }
    else out.push('- Inflation claim: the calendar study has no tested result for this yet (it needs more past releases).'); }
  // 2. seasonality: "the first half of October is stronger than the second"
  { const MONTHS = [[/october|\u0627\u0643\u062A\u0648\u0628\u0631|\u0623\u0643\u062A\u0648\u0628\u0631/i, 10], [/november|\u0646\u0648\u0641\u0645\u0628\u0631/i, 11], [/december|\u062F\u064A\u0633\u0645\u0628\u0631/i, 12], [/september|\u0633\u0628\u062A\u0645\u0628\u0631/i, 9], [/january|\u064A\u0646\u0627\u064A\u0631/i, 1]], mm = MONTHS.find(([re]) => re.test(text));
    if (mm && c && /\u0627\u0644\u0646\u0635\u0641|half|\u0645\u0648\u0633\u0645|season/i.test(text)) { const M = String(mm[1]).padStart(2, '0'), yrs = [...new Set(c.map(x => x.d.slice(0, 4)))]; let n = 0, firstWins = 0, f = 0, sc = 0;
      for (const y of yrs) { const prev = c.filter(x => x.d < y + '-' + M + '-01').pop(), mid = c.filter(x => x.d >= y + '-' + M + '-01' && x.d <= y + '-' + M + '-15').pop(), end = c.filter(x => x.d.startsWith(y + '-' + M)).pop(); if (!prev || !mid || !end || end.d <= y + '-' + M + '-25') continue;
        const a = mid.c / prev.c - 1, b2 = end.c / mid.c - 1; n++; f += a; sc += b2; if (a > b2) firstWins++; }
      if (n) out.push('- Seasonality (' + n + ' years of S&P 500 data): first half of the month averaged ' + pcs(f / n) + ', second half ' + pcs(sc / n) + '; the first half was stronger in ' + firstWins + ' of ' + n + ' years. ' + (n < 15 ? 'Too few years to rely on.' : firstWins / n >= 0.7 ? 'It held most years.' : 'Not a reliable pattern.')); } }
  // 2b. US midterm elections (every 4 years, early November of 2010, 2014, 2018, 2022, 2026...): the S&P 500 one year after, on the data it has
  if (c && /midterm|mid-term|\u0627\u0644\u0627\u0646\u062A\u062E\u0627\u0628\u0627\u062A \u0627\u0644\u0646\u0635\u0641\u064A\u0629|\u0645\u0646\u062A\u0635\u0641 \u0627\u0644\u0648\u0644\u0627\u064A\u0629|\u0627\u0644\u0627\u0646\u062A\u062E\u0627\u0628\u0627\u062A|election/i.test(text)) { const days = { 2010: '2010-11-02', 2014: '2014-11-04', 2018: '2018-11-06', 2022: '2022-11-08', 2026: '2026-11-03' }, rows = [];
    for (const [y, d] of Object.entries(days)) { const k = c.findIndex(z => z.d >= d); if (k < 0 || k + 252 >= c.length) continue; rows.push(y + ' ' + pcs(c[k + 252].c / c[k].c - 1)); }
    out.push('- Midterm elections, S&P 500 one year after (in my own data): ' + (rows.length ? rows.join(', ') : 'not enough history') + '. Published history (Yardeni, via CNBC): higher 12 months after every midterm since 1954, about +15% on average. That is only ~18 cases and says nothing about single stocks or the months before. This year\u2019s election is 3 November 2026; the system will score the claim on 3 November 2027.'); }
  // 3. the market call itself: logged now, scored against the S&P 500 20 sessions later
  const up = /\u0627\u0633\u062A\u0645\u062A\u0639|\u0644\u0627 \u062A\u0642\u0644\u0642|\u0635\u0639\u0648\u062F|\u0627\u0631\u062A\u0641\u0627\u0639|\u062C\u064A\u062F\u0629|bullish|rally|enjoy the ride|don.t worry|higher/i.test(text), dn = /\u0647\u0628\u0648\u0637|\u0627\u0646\u0647\u064A\u0627\u0631|\u062A\u0635\u062D\u064A\u062D \u0642\u0648\u064A|crash|bearish|sell everything/i.test(text), dir = up && !dn ? 1 : dn && !up ? -1 : 0;
  if (dir && c) { const day = ny(Date.now()).d; fs.appendFileSync(MCALL_FILE, JSON.stringify({ src: src || 'unnamed', d: day, dir, spy: c[c.length - 1].c }) + '\n');
    let L = []; try { L = fs.readFileSync(MCALL_FILE, 'utf8').trim().split('\n').map(x => JSON.parse(x)); } catch (e) {}
    const mine = L.filter(x => x.src === (src || 'unnamed')), done = mine.map(x => { const k = c.findIndex(z => z.d >= x.d); return k >= 0 && k + 20 < c.length ? { ...x, r: c[k + 20].c / c[k].c - 1 } : null; }).filter(Boolean), right = done.filter(x => Math.sign(x.r) === x.dir).length;
    out.push('- Market call logged: ' + (dir > 0 ? 'UP (calm, stay in)' : 'DOWN') + ' from ' + (src || 'this source') + '. Each call is scored on the S&P 500 20 sessions later. ' + (done.length ? 'So far ' + right + ' of ' + done.length + ' past calls were right.' : 'First result in about 4 weeks.')); }
  return out; }
async function opinionReply(text, sig, src) {
  const flags = RED_FLAGS.filter(([re]) => re.test(text)).map(([, w]) => w), themes = THEMES.filter(([, re]) => re.test(text));
  const now = Date.now(), day = ny(now).d, past = readOpinions(), tnames = themes.map(t => t[0]);
  // 1. REPEATED: has this theme been pushed before, by whom, and what has it done since? (scored on a broad fund for the theme)
  const proxyNow = {}; for (const t of tnames) { const p = THEME_PROXY[t]; if (p) { const j = await liveQ(p); if (j && +j.price > 0) proxyNow[t] = +j.price; } }
  fs.appendFileSync(OPIN_FILE, JSON.stringify({ d: day, ts: now, src: src || 'unnamed', themes: tnames, flags: flags.length, proxy: proxyNow }) + '\n');
  const repeat = tnames.map(t => { const prev = past.filter(o => (o.themes || []).includes(t) && now - o.ts < 30 * 86400000), first = past.filter(o => (o.themes || []).includes(t) && o.proxy && o.proxy[t]).sort((a, b) => a.ts - b.ts)[0];
    return prev.length ? t + ': pushed ' + (prev.length + 1) + ' times in 30 days by ' + new Set([...prev.map(o => o.src), src || 'unnamed']).size + ' source(s)' + (first && proxyNow[t] ? '. Since the first push (' + first.d + '), ' + THEME_PROXY[t] + ' moved ' + pcs(proxyNow[t] / first.proxy[t] - 1) : '') + '. Many people repeating a theme is crowd mood, not new information.' : null; }).filter(Boolean);
  // 2. RELEVANT TO WHAT I AM WORKING ON: your positions, tonight's buys, today's radar
  const SC = readJson('data/sectors.json', {}), pos = loadPos(), touch = [];
  if (env.FINNHUB_KEY) { let got = 0; for (const sym of Object.keys(pos)) if (SC[sym] === undefined && got < 8) { got++; try { const j = await (await fetch(FH + '/stock/profile2?symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY))).json(); SC[sym] = (j && j.finnhubIndustry) || null; } catch (e) { } } if (got) fs.writeFileSync('data/sectors.json', JSON.stringify(SC)); }
  for (const sym of Object.keys(pos)) { const th = themeOfSector(SC[sym]); if (th && tnames.includes(th)) { const P = pos[sym]; touch.push(sym + ' (yours): in this theme. Plan unchanged: stop ' + (P.stop ? money(P.stop) : 'NOT SET') + '. A message is not a reason to add or to remove the stop.'); } }
  for (const c of sig ? planCands(sig, pos).filter(x => x.ok) : []) { const th = themeOfSector(c.sector || SC[c.sym]); if (th && tnames.includes(th)) touch.push(c.sym + ': on tonight\u2019s BUY list and in this theme (' + c.kind + '). The plan\u2019s prices and stop still decide.'); }
  { const rd = readJson('data/intraday-radar.json', null); if (rd && rd.session === day) for (const c of (rd.candidates || []).filter(x => x.levels)) { const th = themeOfSector(SC[c.sym]); if (th && tnames.includes(th)) touch.push(c.sym + ': on today\u2019s radar (' + c.stage.toLowerCase().replace(/_/g, ' ') + ')' + (c.proven ? ', proven setup' : ', paper only') + '.'); } }
  // 3. CLAIMS THAT CAN BE CHECKED: "earnings season" -> your stocks reporting in the next three weeks
  const earn = [];
  if (/اعلانات|إعلانات|نتائج|ارباح|أرباح|earnings|results|guidance/i.test(text) && env.FINNHUB_KEY) for (const sym of Object.keys(pos).slice(0, 8)) {
    try { const r = await fetch(FH + '/calendar/earnings?from=' + day + '&to=' + new Date(now + 21 * 86400000).toISOString().slice(0, 10) + '&symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY)), j = r.ok ? await r.json() : null, e = j && (j.earningsCalendar || [])[0];
      if (e && e.date) earn.push(sym + ' (yours) reports on ' + e.date + '. A result can jump the price past the stop: decide before that day whether to hold through it.'); } catch (e) { } }
  const out = ['OPINION CHECK' + (src ? ' (' + src + ')' : '') + ': no stock is named, so there is nothing to buy from it and nothing I can score.'];
  if (flags.length) out.push('', 'WARNING SIGNS (' + flags.length + ')', ...flags.map(x => '- ' + x));
  const mk = sig && sig.market ? sig.market : null, fair = readJson('data/leaders-study.json', null), ws = readJson('data/winners-study.json', null);
  out.push('', 'WHAT MY DATA SAYS');
  if (mk) out.push('- S&P 500: ' + (mk.up ? 'in an uptrend' : 'in a downtrend') + (typeof mk.above50 === 'boolean' ? ', ' + (mk.above50 ? 'above' : 'under') + ' its 50 day average' : '') + '.');
  if (fair && fair.liveVerdict) out.push('- Buying the strongest stocks (LEADERS) on the whole market: ' + fair.liveVerdict + ' in the fair test up to ' + fair.to + '. A strong theme did not make its strongest stocks a winning buy.');
  if (ws && ws.base && ws.base.newer && ws.base.newer.n) out.push('- A random stock held 10 days in the newer year: average ' + pcs(ws.base.newer.avg) + ' a trade after costs. Most single stocks lagged the index.');
  for (const [name, , sec] of themes) {
    const rows = sig ? universe(sig).filter(x => x.sector && (x.sector.toLowerCase().includes(sec.toLowerCase()) || (sec === 'Technology' && /semi|software|tech|electron/i.test(x.sector)))) : [];
    const sup = rows.map(x => supportLine(x, sig)).filter(Boolean), up = rows.filter(x => x.uptrend).length;
    out.push('', name.toUpperCase() + ': ' + (rows.length ? rows.length + ' on my scan, ' + up + ' in an uptrend.' : 'none on my scan.'), ...(sup.length ? ['With tested support today:', ...sup.slice(0, 5)] : ['No stock in this theme has tested support today.']));
  }
  if (touch.length) out.push('', 'WHAT THIS TOUCHES IN MY WORK RIGHT NOW', ...touch.slice(0, 10));
  if (repeat.length) out.push('', 'REPEATED', ...repeat);
  if (earn.length) out.push('', 'CHECKED CLAIM: earnings season', ...earn);
  { let lc = []; try { lc = await opinionChecks(text, src); } catch (e) {} if (lc.length) out.push('', 'CHECKED AGAINST THE DATA (and learned from)', ...lc); }
  out.push('', 'WHAT TO DO: nothing changes. Keep your stops, buy only from the plan’s BUY lines, and never put everything in.', 'If this source names stocks, send:  tips ' + (src || 'SOURCE NAME') + ' TICKER TICKER   and I will check each one and score the source against the S&P 500.');
  return out.join('\n');
}
async function pennyReply(sig) {
  const rows = universe(sig).filter(x => x.last < 5), sup = rows.map(x => supportLine(x, sig)).filter(Boolean), out = ['PENNY STOCKS (under 5 USD), from the ' + (sig ? sig.session : 'last') + ' close', '', 'WITH TESTED SUPPORT', ...(sup.length ? sup : ['None. No stock under 5 USD on my scan has a tested rule firing or close to firing.'])];
  const g = marketOpen(Date.now()) ? await gainersNow() : { list: [] };
  const pm = (g.list || []).filter(x => x.price < 5).slice(0, 5);
  if (pm.length) out.push('', 'MOVING NOW under 5 USD (investigation only, no prices given)', ...pm.map(x => x.sym + ' +' + Math.round(x.pct * 100) + '% at ' + money(x.price)));
  const m = readJson('data/movers-state.json', null);
  out.push('', m && m.penny ? 'What my own radar measured over the last ' + m.sessions + ' sessions: stocks under 5 USD bought the morning after a 20% jump were ' + m.penny : 'My movers radar has not measured penny-stock jumps yet.', 'So I will not name a penny stock to buy unless a tested rule supports it. To have one checked: check TICKER');
  return out.join('\n');
}
async function sellReply(sym, sig, pos) {
  const P = pos[sym];
  if (P) { let p = null; if (marketOpen(Date.now())) { const j = await liveQ((sym)); p = +j.price || null; }
    const pv = (sig && sig.posVerdict || {})[sym], lines = ['WHEN TO SELL ' + sym + ' (you bought at ' + money(P.entry) + (p ? ', now ' + money(p) + ', ' + (p >= P.entry ? '+' : '') + ((p / P.entry - 1) * 100).toFixed(1) + '%' : '') + ')'];
    if (p && P.stop && p <= P.stop) lines.push('SELL NOW: your stop ' + money(P.stop) + ' is reached.');
    else if (eventSell(sym)) lines.push(eventSell(sym));
    else if (pv) lines.push('SELL at the next open: ' + pv);
    else lines.push('Not yet. HOLD.');
    // THE SELL PLAN, in the order that matters: the tested exit first (it is what the tests measured), then the stop, then a target only if one was tested.
    let c = null; try { const d = await loadDaily(sym); c = d && d.candles; } catch (e) {}
    const avgN = (n) => c && c.length >= n ? c.slice(-n).reduce((a, x) => a + x.c, 0) / n : null, held = c ? c.filter(k => k.d > (P.since || '')).length : null, left = (n) => held === null ? n + ' sessions from your buy' : Math.max(0, n - held) + ' more session' + (n - held === 1 ? '' : 's');
    if (P.kind === 'quick') { const a5 = avgN(5); lines.push('SELL (TESTED EXIT): on the first day it CLOSES ' + (P.q === 'gap' ? 'below' : 'above') + ' its 5 day average' + (a5 ? ' (about ' + money(a5) + ' now; the line moves each day)' : '') + ', at the next open; or after ' + left(P.maxHold || 5) + ', whatever happens. I send this as SELL in your ACTIONS.'); }
    else if (P.kind === 'entry') { const lv = P.exitMA ? avgN(P.exitMA) : P.exitBelow; lines.push('SELL (TESTED EXIT): on a daily close under ' + (lv ? '~' + money(lv) : 'its exit line') + (P.exitMA ? ' (its ' + P.exitMA + ' day average, rising)' : '') + ', at the next open' + (P.maxHold ? '; or after ' + left(P.maxHold) : '') + '. I send this as SELL in your ACTIONS.'); }
    else if (P.kind === 'leader') lines.push('SELL (TESTED EXIT): on a daily close under its rising stop or its 50 day average' + (avgN(50) ? ' (~' + money(avgN(50)) + ')' : '') + '. No price target on purpose: trend trades make their money from the big runs.');
    else lines.push('Your own pick: no tested exit. I check it every night with the hold-or-sell study (send  review ' + sym + ') and the stop protects it.');
    lines.push('STOP: ' + (P.stop ? money(P.stop) + ' (sell at once if it trades there; keep it at your broker)' : 'none set. Send: stop ' + sym + ' PRICE'));
    lines.push('TARGET: ' + (P.t1 ? money(P.t1) + (P.ownT ? ' (yours)' : P.tmode ? ' (tested: sell ' + (P.tmode === 'half' ? 'half' : 'all') + ' there)' : '') : P.kind === 'manual' ? 'none (optional: target ' + sym + ' PRICE)' : 'none on purpose: the target study found no fixed price that beat the tested exit above. The exit catches the bounce for you.'));
    // ONE PLAIN LINE (user, 20 Oct): the single price that decides, so the message never needs decoding. For a trend/leader trade the
    // 50-day line is the working sell line when the formula stop sits far below it (lottery-like stocks make a 3-ATR stop meaningless).
    { const a50 = avgN(50), far = P.stop && p && P.stop < p * 0.75, line = P.kind === 'leader' || far ? (a50 && (!P.stop || a50 > P.stop) ? a50 : P.stop) : (P.kind === 'quick' ? null : P.stop);
      if (line) lines.push('IN ONE LINE: hold while it closes above ' + money(line) + '. If it CLOSES under ' + money(line) + ', sell at the next open.' + (far ? ' Move your broker stop from ' + money(P.stop) + ' up to ' + money(line) + ': the old stop is far too wide for this stock.' : ' Keep that stop at your broker.') + ' No target: wait for my SELL message when it is stretched.'); }
    return lines.join('\n'); }
  const d = await loadDaily(sym); if (!d || d.candles.length < 60) return sym + ': I could not load prices for it. Check the ticker.';
  const c = d.candles, i = c.length - 1, ind = L.indicators(c, null), a = ind.atr[i], e50 = ind.e[50][i];
  return ['WHEN TO SELL ' + sym + ' (closed ' + money(c[i].c) + '). I am not tracking it for you, so these are general levels for a holder:', 'Trend exit: a daily close below its 50 day average, now ~' + money(e50) + (c[i].c < e50 ? '. It is ALREADY below that line: the trend has broken.' : '.'), 'Volatility stop: ' + money(c[i].c - 2 * a) + ', two normal daily moves under the price.', 'If you hold it, send:  bought ' + sym + ' YOUR-PRICE   and I will set a stop, raise it as it rises, and alert you.'].join('\n');
}
// HOLD OR SELL REVIEW of a stock you own (bought before the system or not). It studies the stock's OWN past: every earlier
// day when it was in the same state as now (trend, and how stretched it was above its 50 day average), what it did over the
// next 20 sessions, against the S&P 500 on the same days. Then it applies the holder rules: a close under the 50 day average
// ends the trend (sell); a very stretched stock whose own past says it lagged from here: take part profit or tighten the stop.
// SIX ANGLES (user, 21 Oct: scan / setup / news / crowd / risk / research as one card): every module's verdict on one stock in six lines,
// so a buy is seen to need all six, and the one that objects is named. Names are the user's; the engines are the existing ones.
function sixAngles(sym, sig, pos) { const L = [];
  try { const st = (sig && sig.stocks || []).find(x => x.sym === sym); L.push('SCAN: ' + (st ? 'on the nightly list, last close ' + money(st.last || st.close || 0) + (st.state ? ', ' + st.state : '') : 'not on the nightly list yet (send  check ' + sym + '  adds it)')); } catch (e) { L.push('SCAN: n/a'); }
  try { const c = sig ? planCands(sig, pos || {}).find(x => x.sym === sym) : null; L.push('SETUP: ' + (c ? (c.ok ? c.kind + ' setup, tested; buy ' + money(c.lo) + ' to ' + money(c.hi) + ', stop ' + money(c.stop) : c.avoid ? c.avoid : c.kind + ' setup but paper only (' + (c.why || 'engine not proven live') + ')') : 'no tested setup today')); } catch (e) { L.push('SETUP: n/a'); }
  try { const ew = eventWarn(sym), es = eventSell(sym); L.push('NEWS: ' + (es ? es : ew ? ew.replace(/^\s*\|?\s*/, '') : 'no warning filing in the last 30 days')); } catch (e) { L.push('NEWS: n/a'); }
  try { const TS = readJson0('data/tip-score.json'), fd = ((TS && TS.fade) || []).find(f => f.sym === sym), IS = readJson0('data/insider-study.json'), ic = ((IS && IS.recent) || []).find(r => r.sym === sym); L.push('CROWD: ' + [fd ? 'tipped by a FADE source (' + fd.src + '): avoid 20 sessions' : null, ic ? ic.n + ' insiders bought in the last 30 days (not proven as a buy rule)' : null].filter(Boolean).join('; ') || 'no tip or insider flag'); } catch (e) { L.push('CROWD: n/a'); }
  try { const lot = (sig && sig.lottery || {})[sym], hal = myHalal(sym), P = (pos || {})[sym]; L.push('RISK: ' + [hal === 'fail' ? 'NOT HALAL (ZAD)' : hal === 'ok' ? 'halal (ZAD)' : 'halal not checked: see ZAD', lot >= 0.15 ? 'lottery-like (+' + Math.round(lot * 100) + '% in one day last month): blocked' : 'not lottery-like', P ? 'you hold it, stop ' + (P.stop ? money(P.stop) : 'NOT SET') : 'size cap ' + ladder().max.toLocaleString('en-US') + ' USD'].join('; ')); } catch (e) { L.push('RISK: n/a'); }
  try { const LB = readJson0('data/strategy-library.json'), c = sig ? planCands(sig, pos || {}).find(x => x.sym === sym) : null, kind = c && c.kind, e = LB && kind ? LB.strategies.find(x => new RegExp(kind.split(' ')[0], 'i').test(x.name)) : null; L.push('RESEARCH: ' + (e ? e.id + ' ' + e.name + ': ' + e.status : 'buy rules proven live: none yet; proven: stops, trim, switch, avoid rules')); } catch (e) { L.push('RESEARCH: n/a'); }
  const obj = L.filter(l => /blocked|FADE|NOT HALAL|paper only|SELL|warning/i.test(l)).map(l => l.split(':')[0]);
  return ['SIX ANGLES on ' + sym + (obj.length ? ' (objections: ' + obj.join(', ') + ')' : ' (no module objects)'), ...L.map(l => '- ' + l)].join('\n'); }
async function reviewReply(sym, sig, pos) {
  const d = await loadDaily(sym); if (!d || d.candles.length < 260) return sym + ': not enough price history to study (one year needed). Check the ticker.';
  const spy = await loadDaily('SPY'), sMap = new Map((spy ? spy.candles : []).map(x => [x.d, x.c]));
  const c = d.candles, n = c.length, i = n - 1, cl = c.map(x => x.c);
  const sma = (p) => { const o = new Array(n).fill(null); let t = 0; for (let k = 0; k < n; k++) { t += cl[k]; if (k >= p) t -= cl[k - p]; if (k >= p - 1) o[k] = t / p; } return o; };
  const m50 = sma(50), m200 = sma(200), tr = c.map((x, k) => k ? Math.max(x.h - x.l, Math.abs(x.h - c[k - 1].c), Math.abs(x.l - c[k - 1].c)) : x.h - x.l);
  const a14 = (() => { const o = new Array(n).fill(null); let t = 0; for (let k = 0; k < n; k++) { t += tr[k]; if (k >= 14) t -= tr[k - 14]; if (k >= 13) o[k] = t / 14; } return o; })();
  const bucket = (k) => { const z = a14[k] ? (cl[k] - m50[k]) / a14[k] : 0; return (cl[k] > m50[k] ? 'A' : 'B') + (cl[k] > m200[k] ? 'A' : 'B') + (z < 0 ? 0 : z < 2 ? 1 : z < 4 ? 2 : 3); };
  const H = 20, now = bucket(i), same = [];
  for (let k = 200; k < n - H; k += 5) if (bucket(k) === now) { const r = cl[k + H] / cl[k] - 1, s0 = sMap.get(c[k].d), s1 = sMap.get(c[k + H].d); same.push({ r, s: s0 && s1 ? s1 / s0 - 1 : null }); }
  const avgOf = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, hr = avgOf(same.map(x => x.r)), hs = avgOf(same.filter(x => x.s !== null).map(x => x.s)), hw = same.length ? same.filter(x => x.r > 0).length / same.length : null;
  let hi52 = 0; for (let k = Math.max(0, n - 252); k < n; k++) hi52 = Math.max(hi52, c[k].h);
  const z = a14[i] ? (cl[i] - m50[i]) / a14[i] : 0, P = pos[sym];
  let p = null; if (marketOpen(Date.now())) { const j = await liveQ(sym); p = +j.price || null; }
  const px = p || cl[i], trail = +Math.max(cl[i] - 2 * a14[i], m50[i] < cl[i] ? m50[i] : 0).toFixed(2);
  let earn = ''; if (env.FINNHUB_KEY) { try { const day = new Date().toISOString().slice(0, 10), r = await fetch(FH + '/calendar/earnings?from=' + day + '&to=' + new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) + '&symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY)), j = r.ok ? await r.json() : null, e = j && (j.earningsCalendar || [])[0]; if (e && e.date) earn = e.date; } catch (e) {} }
  const SS = readJson('data/score-study.json', null), sc = SS && SS.scores && SS.verdict !== 'REJECTED' ? SS.scores[sym] : undefined;
  const enough = same.length >= 20, lag = enough && hs !== null && hr < hs, neg = enough && hr < 0;
  let verdict, why;
  // what the 5-year whole-market tests said (rebuy.mjs, exits.mjs): selling a FALLING stock did not beat holding it; selling a STRETCHED
  // stock and buying it back 10% lower did. These replace the untested holder rules when the tests are there.
  const RBt = readJson0('data/rebuy.json'), RBr = (k) => RBt && RBt.status === 'OK' && RBt.results[k] ? RBt.results[k] : null, fallTested = RBr('FALLING/LOWER10') && RBr('FALLING/UPTURN') && !swWins(RBr('FALLING/LOWER10')) && !swWins(RBr('FALLING/UPTURN'));
  const stretch = m50[i] > 0 && cl[i] >= m50[i] * 1.3 && swWins(RBr('STRETCH/LOWER10')), spike = i >= 10 && cl[i] >= cl[i - 10] * 1.25 && swWins(RBr('SPIKE/LOWER10'));
  const fallNote = () => { const r = RBr('FALLING/LOWER10'); return ' In the 5-year test (' + r.results.newer.n + ' recent cases), selling a stock in this state did NOT beat holding it (' + pcs(r.results.newer.adv) + ' vs holding), so the stop decides, not the trend line.'; };
  if (false) {}
  else if (stretch || spike) { const by = new Date(Date.now() + 87 * 864e5).toISOString().slice(0, 10), r = RBr(stretch ? 'STRETCH/LOWER10' : 'SPIKE/LOWER10'); verdict = 'TAKE PROFIT OPTION'; if (swTier(r) === 'small') tier2Log(sym, 'switch sell', cl[i]);
    why = (stretch ? 'it is ' + Math.round((cl[i] / m50[i] - 1) * 100) + '% above its 50 day average' : 'it rose ' + Math.round((cl[i] / cl[i - 10] - 1) * 100) + '% in 10 sessions') + '. Tested on 5 years of the whole market: selling here and buying back 10% lower beat holding (' + pcs(r.results.newer.adv) + ' a case, better ' + Math.round(r.results.newer.better * 100) + '% of the time; it came back down ' + Math.round(r.results.newer.cameBack * 100) + '% of the time). After you sell, place a GTC limit BUY at ' + money(cl[i] * 0.9) + '. If it is not filled by ' + by + ', buy it back at the market that day (that is part of the tested rule)' + swLabel(r); }
  else if (cl[i] < m50[i] && cl[i] < m200[i] && fallTested) { verdict = 'HOLD WITH STOP'; why = 'the trend is weak: it closed under its 50 day (' + money(m50[i]) + ') and 200 day (' + money(m200[i]) + ') averages.' + fallNote(); }
  else if (cl[i] < m50[i] && fallTested) { verdict = 'HOLD WITH STOP'; why = 'it closed under its 50 day average (' + money(m50[i]) + ').' + fallNote(); }
  else if (cl[i] < m50[i] && cl[i] < m200[i]) { verdict = 'SELL'; why = 'the trend is broken: it closed under both its 50 day (' + money(m50[i]) + ') and 200 day (' + money(m200[i]) + ') averages.'; }
  else if (cl[i] < m50[i]) { verdict = neg || lag ? 'SELL' : 'SELL OR TIGHTEN'; why = 'it closed under its 50 day average (' + money(m50[i]) + '), the holder exit rule.' + (enough ? ' Its own past from this state: ' + (neg || lag ? 'weak.' : 'not clearly weak, so a tight stop is the alternative.') : ''); }
  else if (z >= 4 && (neg || lag)) { verdict = 'TAKE PART PROFIT'; why = 'it is very stretched (' + z.toFixed(1) + ' daily moves above its 50 day average) and from this stretch its own past lagged. Sell part, raise the stop on the rest.'; }
  else if (z >= 4) { verdict = 'HOLD, RAISE THE STOP'; why = 'strong but very stretched (' + z.toFixed(1) + ' daily moves above its 50 day average). Nobody knows the top; a raised stop keeps most of the gain if it turns.'; }
  else { verdict = 'HOLD'; why = 'the trend is intact: above its 50 day' + (cl[i] > m200[i] ? ' and 200 day averages.' : ' average (under its 200 day, so weaker).'); }
  // a SYSTEM trade (quick, swing, radar, leader) follows its own tested exit and stop; the general holder rules do not override it
  const sysTrade = P && ['quick', 'entry', 'radar', 'leader'].includes(P.kind), pv = sig && sig.posVerdict ? sig.posVerdict[sym] : null;
  if (sysTrade && pv) { verdict = 'SELL (its tested exit fired)'; why = pv.replace(/\.?$/, '.') + ' This trade follows its own tested rule.'; }
  else if (sysTrade && !verdict.startsWith('SELL')) { verdict = 'HOLD (follow its tested rule)'; why = 'this is a ' + (P.kind === 'entry' ? 'swing' : P.kind) + ' trade from the plan: keep its own stop ' + money(P.stop) + ' and exit rule; the bot tells you when it fires. ' + why; }
  const out = ['HOLD OR SELL: ' + sym + ' → ' + verdict, 'Price ' + money(px) + (p ? ' (live)' : ' (last close ' + c[i].d + ')') + (P ? ' | you bought at ' + money(P.entry) + ', ' + (px >= P.entry ? '+' : '') + ((px / P.entry - 1) * 100).toFixed(1) + '%' : ''),
    'Why: ' + why,
    'Its own past: ' + (enough ? same.length + ' earlier times in this same state, the next 20 sessions averaged ' + pcs(hr) + ' (' + Math.round(hw * 100) + '% up)' + (hs !== null ? ', S&P 500 ' + pcs(hs) + ' on the same days' : '') + '.' : 'only ' + same.length + ' earlier times in this state, too few to judge; the trend rule decides.'),
    'From its 1-year high: ' + pcs(px / hi52 - 1) + (sc !== undefined && sc !== null ? ' | score ' + sc + '/100' : ''),
    sysTrade ? 'Stop to use: ' + money(P.stop) + ' (the trade\u2019s own tested stop; the bot raises it when its rule says so).' : 'Stop to use: ' + money(Math.max(trail, P && P.stop || 0)) + (P && P.stop && P.stop >= trail ? ' (your current stop)' : ' (2 daily moves under the price, or the 50 day average if closer)') + '. Raise it as it rises, never lower it.'];
  if (earn) out.push('Earnings on ' + earn + ': a result can jump the price past the stop. Decide before that day whether to hold through it.');
  if (!P) out.push('', 'I am not tracking it. Send:  bought ' + sym + ' YOUR-PRICE SHARES   and I will watch the stop every day and tell you when to sell.');
  else if (!sysTrade && (verdict === 'HOLD' || verdict.startsWith('HOLD,') || verdict === 'HOLD WITH STOP')) out.push('', 'To set this stop: stop ' + sym + ' ' + Math.max(trail, P.stop || 0).toFixed(2));
  out.push('Tested on its own history, not a promise. Not financial advice, not a halal ruling.');
  return out.join('\n');
}
// Is this stock on today's tested BUY list? (a tested rule fired on it at the last close) -> its buy range and stop
// (review S-16, 22 Oct) the add goes through the same gates as every other buy: gateVerdict (halal, lottery, FADE, filing warnings, FOCUS)
// and planCands ok for THAT setup's kind (FOCUS per kind, live-losing block). planCands is asked with no holdings, since the stock is owned.
const buyToday = (sym, sig) => { if (!sig) return null; let OK;
  try { if (gateVerdict(sym, sig)) return null; OK = new Set(planCands(sig, {}).filter(x => x.ok && x.sym === sym).map(x => x.kind)); } catch (e) { return null; }
  const q = OK.has('quick trade') ? (sig.quickPaused ? [] : sig.quick || []).find(x => x.sym === sym && !x.demoted && okEv(x.n, netOf(x.avgPct, x.last), x.win)) : null, b = OK.has('swing trade') ? (sig.stocks || []).find(x => x.sym === sym && x.state === 'Buy watch' && x.buyLo && !x.demoted && okEv(x.n, netOf(x.avgPct, x.last), x.win)) : null;
  const r = q || b; return r ? { lo: r.buyLo, hi: r.buyHi, stop: r.stop, n: r.n, thin: r.n < 30 } : null; };
// MOVE TOGETHER (holdings review, 23 Oct): 7 of 12 holdings fell as one group. Daily returns over the last 60 sessions; stocks linked
// at correlation 0.4 or more form a group; the largest group of 3+ is shown with its share of the money (shares x price when known).
function clusterRisk(closes, dollars) {
  const syms = Object.keys(closes || {}).filter(s => Array.isArray(closes[s]) && closes[s].length >= 31);
  const ret = {}; for (const s of syms) { const c = closes[s].slice(-61); ret[s] = c.slice(1).map((x, i) => Math.log(x / c[i])); }
  const corr = (a, b) => { const m = Math.min(a.length, b.length), x = a.slice(-m), y = b.slice(-m), mx = x.reduce((q, v) => q + v, 0) / m, my = y.reduce((q, v) => q + v, 0) / m; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < m; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0; };
  const C = {}; for (const a of syms) for (const b of syms) if (a < b) C[a + '|' + b] = corr(ret[a], ret[b]);
  const cc = (a, b) => C[a < b ? a + '|' + b : b + '|' + a];
  const seen = new Set(); let best = null;
  for (const s of syms) { if (seen.has(s)) continue; const g = [s]; seen.add(s); for (let k = 0; k < g.length; k++) for (const t of syms) if (!seen.has(t) && cc(g[k], t) >= 0.4) { seen.add(t); g.push(t); } if (g.length >= 3 && (!best || g.length > best.length)) best = g; }
  if (!best) return null;
  let sum = 0, n = 0; for (const a of best) for (const b of best) if (a < b) { sum += cc(a, b); n++; }
  const byMoney = syms.every(s => dollars && dollars[s] > 0), tot = byMoney ? syms.reduce((q, s) => q + dollars[s], 0) : syms.length, part = byMoney ? best.reduce((q, s) => q + dollars[s], 0) : best.length, share = part / tot;
  const line = 'MOVE TOGETHER: ' + best.join(', ') + ' (average correlation ' + (sum / n).toFixed(2) + ' over 60 sessions) = ' + (byMoney ? Math.round(share * 100) + '% of your money' : best.length + ' of your ' + syms.length + ' stocks (no share counts, so counted, not weighted)') + '. One bad day for that theme hits all of them at once. Information only.';
  return { syms: best, corr: sum / n, share, byMoney, line };
}
// The "SELL if it closes under X" price on a HOLD line (fix 23 Oct: CCJ showed 92.60, its 50-day, while trading at 78.93 on a HOLD).
function lossLineFor(P, px, m50) {
  const own = P.own || /35% disaster/.test(P.stopWhy || ''), st = P.stop > 0 ? P.stop : null;
  if (own) return st;
  if ((P.kind === 'leader' || (st && px && st < px * 0.75)) && m50 > 0 && px && m50 < px) return Math.max(m50, st || 0);
  return st;
}
// YOUR STOCKS: one clear action per stock you own. SELL ALL, SELL HALF, SELL SOME, HOLD, or BUY A LITTLE MORE.
// Built from the HOLD OR SELL study of each stock. "Buy a little more" only when a TESTED buy rule fired on that stock today:
// never just to lower the average of a falling stock.
async function holdingsText(sig, pos, title, raw) {
  const mine = Object.keys(pos); if (!mine.length) return raw ? { acts: { sell: [], part: [], add: [], hold: [] }, holdShort: [] } : 'You have no stocks recorded. Send:  bought SYMBOL PRICE SHARES   for each one you own.';
  const pv = privRead(), out = [title || 'YOUR STOCKS: what to do'], acts = { sell: [], part: [], add: [], hold: [] };
  const CL = {}, DL = {};
  let curPx = null; const mark = (sym, act, why) => { if (!pos[sym]) return; const d = ny(Date.now()).d, prev = pos[sym].lastAct, same = prev && prev.act === act;
    pos[sym].lastAct = { act, why: String(why || '').slice(0, 80), d, since: same ? (prev.since || prev.d) : d, ...(same ? (prev.px0 ? { px0: prev.px0 } : {}) : curPx ? { px0: curPx } : {}) }; };
  for (const sym of mine.slice(0, 15)) { let r = ''; try { r = await reviewReply(sym, sig, pos); } catch (e) { continue; }
    const P = pos[sym], verdict = ((r.match(/→ (.+)/) || [])[1] || '').trim(), why = ((r.match(/^Why: (.+)$/m) || [])[1] || '').split(/[.:;]/)[0].trim(), stopM = r.match(/^Stop to use: ([\d.,]+)/m), stop = stopM ? stopM[1] : (P.stop ? money(P.stop) : 'not set');
    const pm = r.match(/^Price ([\d.,]+)/m), px = (curPx = pm ? +pm[1].replace(/,/g, '') : null), chg = px && P.entry ? ' (' + pcs(px / P.entry - 1) + ')' : '', earn = ((r.match(/^Earnings on (\S+)/m) || [])[1] || '').replace(/:+$/, ''), sh = pv.shares && pv.shares[sym];
    const ew = eventWarn(sym), tail = (earn ? ' | EARNINGS ' + earn + ': decide before' : '') + ew;
    // TWO PRICES (user, 20 Oct): the profit line (30% above the 50-day: the tested SWITCH sell, then buy back 10% lower) and the loss line
    // (a close under the 50-day for trend trades, else the stop). Shown on every HOLD line so "when to sell" never needs decoding.
    let two = ''; try { const dd = await loadDaily(sym), cc = dd && dd.candles; if (cc && cc.length >= 31) { CL[sym] = cc.map(x => x.c); if (sh > 0 && px) DL[sym] = sh * px; } if (cc && cc.length >= 50) { const m50 = cc.slice(-50).reduce((q, x) => q + x.c, 0) / 50, RBt = readJson0('data/rebuy.json'), sw = RBt && RBt.status === 'OK' && swWins(RBt.results['STRETCH/LOWER10']);
      const lossLine = lossLineFor(P, px, m50);
      two = (sw ? ' SELL WITH PROFIT at ' + money(m50 * 1.3) + ' (then buy back ~' + money(m50 * 1.3 * 0.9) + ')' : '') + (lossLine ? ' | SELL if it closes under ' + money(lossLine) : '') + (P.t1 && P.ownT ? ' | your target ' + money(P.t1) : ''); } } catch (e) {}
    // A trade the system chose follows ITS OWN tested exit and stop. The general hold-or-sell study (trend under the averages)
    // is for your own picks only: a dip-buy is below its short averages by design, so "trend broken" would contradict the buy.
    if (['quick', 'entry', 'radar', 'leader'].includes(P.kind) || P.src === 'try small') {
      const stopHit = P.stop && px && px <= P.stop, xf = P.exitFlag && (!P.since || P.exitFlag.d >= P.since) ? P.exitFlag.why : null;
      if (stopHit || xf) { mark(sym, 'SELL ALL', stopHit ? 'stop reached' : 'its tested exit'); acts.sell.push(sym + chg + ': SELL ALL. ' + (stopHit ? 'the stop ' + money(P.stop) + ' is reached' : xf.replace(/^[A-Z -]+: /, '').toLowerCase().replace(/\.$/, '')) + ' (its own tested exit).' + tail); continue; }
      const ex = P.kind === 'quick' ? 'exit: first close ' + (P.q === 'gap' ? 'below' : 'above') + ' its 5 day average or ' + (P.maxHold || 5) + ' sessions' : P.kind === 'entry' ? 'exit: a close under ~' + (P.exitBelow ? money(P.exitBelow) : 'its exit line') + (P.maxHold ? ' or ' + P.maxHold + ' sessions' : '') : P.kind === 'leader' ? 'exit: a close under its rising stop or 50 day average' : 'exit: target or 5 sessions';
      mark(sym, 'HOLD', 'its own rule'); acts.hold.push(sym + chg + ': HOLD, stop ' + (P.stop ? money(P.stop) : 'not set') + stopTag(sym, P) + (P.t1 && P.tmode ? ', sell ' + (P.tmode === 'half' ? 'half' : 'all') + ' at ' + money(P.t1) + ' (tested)' : '') + '; ' + ex + ' (system trade: its own rule decides).' + tail);
      (acts.holdShort = acts.holdShort || []).push(sym + chg + ':' + (two || ' stop ' + (P.stop ? money(P.stop) : 'not set')) + stopTag(sym, P, true) + (P.t1 && P.tmode ? ' target ' + money(P.t1) + ' (tested)' : '') + (earn ? ' EARNINGS ' + earn : '') + (ew ? ' NEWS WARNING' : '')); continue; }
    if (P.stop && px && px <= P.stop) { mark(sym, 'SELL ALL', 'stop reached'); acts.sell.push(sym + chg + ': SELL ALL. the stop ' + money(P.stop) + ' is reached.' + tail); }
    else if (/^SELL( \(|$)/.test(verdict)) mark(sym, 'SELL ALL', why), acts.sell.push(sym + chg + ': SELL ALL. ' + why + '.' + tail);
    else if (verdict === 'TAKE PROFIT OPTION') { const full = ((r.match(/^Why: (.+)$/m) || [])[1] || ''); mark(sym, 'TAKE PROFIT OPTION', 'stretched'); acts.part.push(sym + chg + ': TAKE PROFIT OPTION (tested on 5 years of history, not yet confirmed live: your choice, not an order). ' + full + '. ' + switchPaperLine() + tail); }
    else if (verdict === 'SELL OR TIGHTEN') mark(sym, 'SELL HALF', why), acts.part.push(sym + chg + ': SELL HALF' + (sh >= 2 ? ' (' + Math.floor(sh / 2) + ' shares)' : '') + ', keep the rest with the stop at ' + stop + '. ' + why + '.' + tail);
    else if (verdict === 'TAKE PART PROFIT') mark(sym, 'SELL SOME', 'lock profit'), acts.part.push(sym + chg + ': SELL SOME (about a third' + (sh >= 3 ? ', ' + Math.floor(sh / 3) + ' shares' : '') + ') to lock profit, raise the stop on the rest to ' + stop + '.' + tail);
    else { mark(sym, 'HOLD', why); const b0 = buyToday(sym, sig), b = b0 && !b0.thin && px && P.entry && px > P.entry * 1.01 && !(sig && sig.session && P.since && sig.session <= P.since) ? b0 : null;   // add ONLY: a fully proven rule (not early evidence), a NEW signal, and the stock already in profit. Never to lower an average.
      if (b && verdict.startsWith('HOLD') && !(P.stop && px && px <= P.stop)) acts.add.push(sym + chg + ': HOLD and ADD 1,000 USD (a winner with a new PROVEN signal; fees 3 USD per buy and per sell) inside ' + money(b.lo) + '-' + money(b.hi) + '. A tested buy rule fired on it today' + (b.thin ? ' (early evidence)' : '') + '' + '. Then use ONE stop for all shares: ' + money(Math.max(b.stop, P.own ? P.stop || 0 : 0)) + '. Send after:  added ' + sym + ' PRICE SHARES' + tail);
      else { acts.hold.push(sym + chg + ': HOLD, stop ' + stop + (verdict.includes('RAISE') ? ' (raise it to this now)' : stopTag(sym, P)) + (P.t1 ? ', sell ' + (P.tmode === 'half' ? 'half' : 'at') + ' ' + money(P.t1) + (P.t2 ? ', rest at ' + money(P.t2) : '') + (P.tmode === 'half' ? ' (half)' : '') : '') + '.' + tail); (acts.holdShort = acts.holdShort || []).push(sym + chg + (two ? ':' + two : '') + (P.stop ? (two ? '' : ' stop ' + money(P.stop)) + (verdict.includes('RAISE') && stop !== money(P.stop) ? ' (suggested: raise the stop to ' + stop + ')' : '') + stopTag(sym, P, true).replace(' UNCONFIRMED', ' (stop not confirmed at broker)') : ' NO STOP: send  stop ' + sym + ' PRICE') + (P.t1 ? ' target ' + money(P.t1) + (P.tmode ? ' (tested' + (P.tmode === 'half' ? ', half' : '') + ')' : P.ownT ? ' (yours)' : '') : P.tnote ? ' no target (tested)' : '') + (earn ? ' EARNINGS ' + earn : '') + (ew ? ' NEWS WARNING' : '')); } } }
  if (raw) { let cl = null; try { const cr = clusterRisk(CL, DL); cl = cr && cr.line; } catch (e) {} return { acts, holdShort: acts.holdShort || [], cluster: cl }; }
  if (acts.sell.length) out.push('', 'SELL ALL', ...acts.sell);
  if (acts.part.length) out.push('', 'SELL PART', ...acts.part);
  if (acts.add.length) out.push('', 'BUY A LITTLE MORE', ...acts.add);
  if (acts.hold.length) out.push('', 'HOLD (keep these stops at your broker)', ...acts.hold);
  { try { const cr = clusterRisk(CL, DL); if (cr) out.push('', cr.line); } catch (e) {} }
  { const dn = buyDayNote(), tn = timingNote(); if (tn) out.push('', tn); if (dn) out.push(dn); }
  { const g = goalsText().split('\n'); if (/^MONEY GOALS \((?!they start)/.test(g[0])) out.push('', 'GOAL: ' + (g.find(x => /^NEXT /.test(x)) || '').replace(/^NEXT\s+/, '') + ' | ' + g[1].replace(/^Now: /, 'now ') + ' (accounting only: never a reason to buy more or bigger)'); }
  out.push('', 'After you act, send:  sold SYM PRICE   or  sold SYM PRICE 5 shares   (part) or  added SYM PRICE SHARES . Details for one stock:  review SYM');
  return out.join('\n');
}
// UNRESOLVED SELLS (holdings review, 23 Oct): a SELL the owner has not acted on is listed with its age and the move since the first
// SELL, so the cost of waiting is visible (TTD, RKLB, COHR, SYM: SELL 14 Oct, still held 23 Oct; DOCN sold 100 vs a 120.81 stop).
function unresolvedSells(pos, lastPx, today) {
  const out = [];
  for (const [sym, P] of Object.entries(pos || {})) { const A = P && P.lastAct; if (!A || A.act !== 'SELL ALL') continue;
    const since = A.since || A.d; if (!since || since >= today) continue;
    const days = Math.round((Date.parse(today) - Date.parse(since)) / 864e5), now = lastPx && lastPx[sym];
    out.push(sym + ': SELL since ' + since + ' (' + days + ' days)' + (A.px0 > 0 && now > 0 ? ', ' + money(A.px0) + ' then, ' + money(now) + ' now (' + pcs(now / A.px0 - 1) + ' since)' : '') + '. Still held. If you are keeping it on purpose, that is your call; the tested rule says sell.'); }
  return out;
}
function halalGapLine(pos) {   // holdings with no halal mark of yours (or ZAD list entry): never shown as approved
  const miss = Object.keys(pos || {}).filter(s => myHalal(s) === 'unknown');
  return miss.length ? 'HALAL NOT MARKED: ' + miss.join(', ') + '. Check each in ZAD, then send  halal SYM yes  or  halal SYM no .' : '';
}
// TRY SMALL (owner's request 23 Oct 2026, "find a way to make money ... do it all"; size chosen: the smallest real option).
// A weaker-proof lane, separate from TRADABLE SMALL. Pre-registered in test/try-small.test.mjs before any live use: a rule qualifies when its
// FROZEN first run made money after the 1.2% stress cost in BOTH halves, beat the average stock in both, and stayed positive without its
// 2 best trades in both. The luck bar is not required. 300 USD, max 2 open, ZAD-ok stocks only, stop 15%, sold after ~3 months.
// Off with  settings.trySmall = false , or for a rule whose own ledger (kind try:<rule>) averages < 0 after 10+ resolved cases.
const TRY_USD = 1000, TRY_MAX = 2;   // 1,000 USD: owner's choice 24 Oct (at 300 USD the fees ate ~2% a trade)
// (24 Oct, engine audit) a lab's corrected re-run (correctedRun[id], firstRun untouched) replaces that rule's frozen first run here
const labRuns = (j) => { if (!j) return {}; const out = { ...(j.firstRun || {}) }; for (const [k, r] of Object.entries(j.correctedRun || {})) if (r && r.results) out[k] = { ...r, corrected: true }; return out; };
// paused until its corrected re-run exists: ANOM-SUESURGE (engine audit AUD-2, 24 Oct: its revenue-surprise cut-off used filings made after the buy)
// SQ1-BBAUTH paused 24 Oct 2026: the independent re-check (verify-lab) found squad1-lab looked up share counts by today's ticker list,
// silently dropping taken-over / renamed companies (survivorship); corrected, its older half loses after costs. Off until a corrected run exists.
// BASKET labs (squad5, squad10; 24 Oct 2026) are left out of TRY SMALL on purpose: a basket works only when the WHOLE basket is owned by
// weight; 2 of its names at 1,000 USD with a 15% stop is not the rule that was tested. The basket is shown separately as a core holding.
// Near-copies of a rule already in the lane (24 Oct 2026): Squad 14 re-tested SQ11-PB12 with other leader lists / a deeper dip / a
// Shariah screen AFTER PB12 had won. They largely pick the same trades, so they would send the owner the same buy up to 4 times and
// their extra 'wins' add little evidence. Only the original SQ11-PB12 trades; the copies stay on paper.
const TRY_DUPLICATE = new Set(['SQ14-PB12M', 'SQ14-PB15', 'SQ14-PB12H']);
const TRY_PAUSED = new Set(['ANOM-SUESURGE', 'SQ1-BBAUTH']);
// (24 Oct 2026) a rule whose lab measured its return per year of capital against the S&P 500 must beat it in BOTH halves:
// otherwise simply holding SPUS did better, and a 1,000 USD ticket adds risk without adding money. Rules without that measure are unaffected.
const beatsIndex = (py) => !py || ['older', 'newer'].every(h => !py[h] || typeof py[h].rule !== 'number' || typeof py[h].spy !== 'number' || py[h].rule > py[h].spy);
// Basket labs (squad 5) also report a whole-portfolio test; when it says the basket lagged SPY in a half, the rule does not qualify.
const portfolioBeatsSpy = (pf) => { const h = pf && pf.standard && pf.standard.halves; return !h || ['older', 'newer'].every(k => !h[k] || h[k].beatsSpy !== false); };
function tryQualifies(firstRun) {
  // (24 Oct) also a usable sample in each half: not frozen REJECTED / TOO FEW CASES, 20+ trades, 3+ blocks where reported
  const ok = (h) => h && h.avgStress > 0 && h.edge > 0 && h.noTop2 > 0 && !(typeof h.n === 'number' && h.n < 20) && !(typeof h.blocks === 'number' && h.blocks < 3);
  return Object.entries(firstRun || {}).filter(([id, r]) => r && r.results && !(TRY_PAUSED.has(id) && !r.corrected) && !/REJECTED|TOO FEW/i.test(r.verdict || '') && ok(r.results.older) && ok(r.results.newer) && !TRY_DUPLICATE.has(id) && beatsIndex(r.perYear) && portfolioBeatsSpy(r.portfolio)).map(([id]) => id);
}
function tryLedgerOff(kind) { try { const a = fs.readFileSync('data/tier2-ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(r => r.kind === kind && typeof r.pct === 'number');
  return a.length >= 10 && a.reduce((x, r) => x + r.pct, 0) / a.length < 0; } catch (e) { return false; } }
function trySmallLines(pos, lastPx) {
  if ((readJson0('data/settings.json') || {}).trySmall === false) return [];
  // sources: the value lab (B-*) and, since 23 Oct evening, the decoded lab (DEC-*), both judged on their frozen first runs by tryQualifies
  const fresh = (j) => j && Date.now() - Date.parse(j.generatedAt || 0) <= 10 * 864e5;
  const VL = readJson0('data/value-lab.json'), VT = readJson0('data/value-today.json'), DH = readJson0('data/decoded-history.json'), DT = readJson0('data/decoded-today.json'), src = [];
  if (VL && fresh(VT) && VT.rules) for (const id of tryQualifies(labRuns(VL))) { const R = VT.rules[id.replace(/_\w+$/, '')]; if (R && Array.isArray(R.picks)) src.push({ id, picks: R.picks.map(p => ({ sym: p.sym, px: p.lastClose, blocked: p.blocked })), stopPct: 0.15, hold: 63, what: 'cash-rich, growing, low-debt company' }); }
  const DC = readJson0('data/decoded-check.json'), failsBudget = (id) => !!(DC && DC.budget && new RegExp('\\b' + id + '\\b').test(DC.label || '') && tryQualifies({ x: { results: DC.budget } }).length === 0);   // DEC2-TPS: proven per dollar invested, loses per dollar planned
  if (DH && fresh(DT) && DT.methods) for (const id of tryQualifies(labRuns(DH)).filter(i => !failsBudget(i))) { const M = DT.methods[id]; if (M && Array.isArray(M.newSignals)) src.push({ id, picks: M.newSignals.map(p => ({ sym: p.sym, px: p.close })), stopPct: 0.35, hold: 126, what: id === 'DEC-FROG' ? 'frog in the pan: a 12-month winner that climbed steadily' : 'decoded trader method' }); }
  for (const lab of ['anomaly', 'expert', 'confluence', 'ml', 'angles', 'macro', 'tipster', 'research', 'squad1', 'squad2', 'squad3', 'squad4', 'squad6', 'squad7', 'squad8', 'squad9', 'squad11', 'squad12', 'squad13', 'squad14']) { const AL = readJson0('data/' + lab + '-lab.json'), AT = readJson0('data/' + lab + '-today.json');   // standard labs (23-24 Oct): same standard, each rule's own hold
    if (AL && fresh(AT) && AT.methods) for (const id of tryQualifies(labRuns(AL))) { const M = AT.methods[id], hold = +((AL.firstRun[id] || {}).hold || (M && M.hold) || 63); if (M && Array.isArray(M.newSignals)) src.push({ id, picks: M.newSignals.map(p => ({ sym: p.sym, px: p.close })), stopPct: hold > 100 ? 0.35 : 0.15, hold, what: M.name || 'published market pattern' }); } }
  if (!src.length) return [];
  const Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), held = new Set(Object.keys(pos || {}));
  let slots = TRY_MAX - Object.values(pos || {}).filter(P => P && P.src === 'try small').length; const buys = [], mark = [];
  for (const S0 of src) { if (tryLedgerOff('try:' + S0.id)) continue;
    for (const p of S0.picks) { if (!p || p.blocked || held.has(p.sym) || bad.has(p.sym)) continue; const h = myHalal(p.sym); if (h === 'fail') continue; let ew = ''; try { ew = eventWarn(p.sym); } catch (e) {} if (ew) continue;
      const px = (lastPx && lastPx[p.sym]) || p.px; if (!(px > 0)) continue;
      if (h !== 'ok') { if (!mark.includes(p.sym)) mark.push(p.sym); continue; }
      if (slots <= 0 || buys.some(b => b.sym === p.sym)) continue; slots--; tier2Log(p.sym, 'try:' + S0.id, px); buys.push({ sym: p.sym, id: S0.id, px, stopPct: S0.stopPct, hold: S0.hold, what: S0.what }); } }
  if (!buys.length && !mark.length) return [];
  const out = ['TRY SMALL (weaker proof: made money after costs in BOTH 5-year test halves and beat the average stock, but did NOT pass the luck test. Small on purpose: ' + TRY_USD + ' USD each, max ' + TRY_MAX + ' open. Switches itself off if its first 10 results lose on average.)'];
  for (const b of buys) out.push('- BUY ' + b.sym + ' ' + TRY_USD + ' USD up to ' + money(b.px * 1.03) + '. STOP ' + money(b.px * (1 - b.stopPct)) + ' at your broker (' + Math.round(b.stopPct * 100) + '%). SELL after about ' + (Math.max(1, Math.round(b.hold / 21)) + ' month' + (Math.round(b.hold / 21) > 1 ? 's' : '')) + ' (' + b.hold + ' sessions); the bot reminds you. Rule ' + b.id + ' (' + b.what + ').');
  if (mark.length) out.push('MARK HALAL FIRST (picks of this lane, no ZAD mark of yours yet): ' + mark.slice(0, 6).join(', ') + '. Check ZAD, send  halal SYM yes  and they can be bought next time.');
  return out;
}
// ACTIONS: the ONE message to act on. Sells first, then buys (strongest first, with amount, range and stop), then one line of
// holds and the goal. Everything else the system sends is information. Send  details  for the full cards, or  review SYM .
async function actionsText(sig, pos, px, title) {
  const h = await holdingsText(sig, pos, null, true), plan = planText(sig, pos, px, 'x', null, null, { actions: true });
  const out = [title || 'ACTIONS'];
  { const HZ = readJson0('data/horizons.json'), QY = readJson0('data/quality.json'), passed = [...Object.values((HZ && HZ.results) || {}), ...Object.values((QY && QY.results) || {})].some(r => r.verdict === 'PROMISING');
    if ((HZ || QY) && !passed) out.push('YARDSTICK: on 5 years, the S&P 500 beat every long-term stock-picking method tested. Long-term money: a halal index fund (check ZAD). The buys below are short-term trades with a small, fixed amount.'); }
  const planSells = (plan.match(/\nSELL\n([\s\S]*?)(\n\n|$)/) || [])[1] || '', soldSyms = new Set(planSells.split('\n').map(l => l.replace(/^- /, '').split(/[ :]/)[0]));
  const sells = [...(planSells ? planSells.split('\n') : []), ...h.acts.sell.filter(l => !soldSyms.has(l.split(/[ :]/)[0]))];
  if (sells.length) out.push('', 'SELL', ...sells.map(l => '- ' + l));
  { const lp = {}; for (const x of (sig && sig.stocks) || []) if (x.last) lp[x.sym] = x.last; for (const x of (sig && sig.uni) || []) if (x.last && !lp[x.sym]) lp[x.sym] = x.last;
    const un = unresolvedSells(pos, lp, ny(Date.now()).d); if (un.length) out.push('', 'SELLS NOT DONE YET (' + un.length + ')', ...un.map(l => '- ' + l)); }
  { const hg = halalGapLine(pos); if (hg) out.push('', hg); }
  if (h.cluster) out.push('', h.cluster);
  try { fs.writeFileSync('data/actions-sells.json', JSON.stringify({ at: new Date().toISOString(), sells: sells.map(l => ({ sym: l.replace(/^- /, '').split(/[ :]/)[0], why: l.replace(/^- /, '').slice(0, 300) })) })); } catch (e) {}   // read by the pre-market check
  if (h.acts.part.length) out.push('', 'SELL PART', ...h.acts.part.map(l => '- ' + l));
  const buyPart = plan.replace(/\nSELL\n[\s\S]*?(\n\n|$)/, '\n').trim();
  if (sig) { const fd = planCands(sig, pos).filter(x => x.fade); if (fd.length) out.push('', 'AVOID (tipped by a FADE source whose tips lag the market; 20 sessions after the tip): ' + fd.slice(0, 8).map(x => x.sym + ' (' + x.fade + ')').join(', ') + '.'); }
  if (sig) { const av = planCands(sig, pos).filter(x => x.lottery); if (av.length) out.push('', 'AVOID (lottery-like, tested to lag about 3% a month): ' + av.slice(0, 8).map(x => x.sym + ' +' + Math.round(x.lottery * 100) + '% in one day').join(', ') + '. Do not chase these.'); }
  const FOCUS = (readJson0('data/settings.json') || {}).focus !== false, working = FOCUS ? workingKinds().size > 0 : true;   // a kind proven under the full live bar (review S-14)
  engineHistorySnapshot(); if (sig) { const lp = {}; for (const x of sig.stocks || []) if (x.last) lp[x.sym] = x.last; tier2Resolve(lp); }
  if (sig) { try { const lastPx = {}; for (const x of sig.stocks || []) if (x.last) lastPx[x.sym] = x.last; const pc = planCands(sig, pos); avoidLedger([...pc.filter(x => x.lottery).map(x => ({ sym: x.sym, why: 'lottery' })), ...pc.filter(x => x.fade).map(x => ({ sym: x.sym, why: 'faded tipster' }))], lastPx); } catch (e) {} }
  out.push('', ladder().text);
  if (new Date().getUTCDay() === 0) { try { out.push('', scoreboardText()); } catch (e) {} }
  // LONGER HOLDS (owner's choice, 20 Oct 2026: every chance shown, labelled): the closest buy rule, F-score 8-9 in an uptrend (beat the
  // average stock in both halves, t 5.5 / 2.6, beat the S&P 500 in 2024-26 but not in 2021-23: NOT PROVEN). Shown as buys at the minimum
  // size with the tested exits; never more than 3 open from this list. The same picks are frozen weekly by the league and scored.
  { const Q = readJson0('data/quality.json'), Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []), lot = (sig && sig.lottery) || {}, held = new Set(Object.keys(pos || {}));
    const TSf = readJson0('data/tip-score.json'), faded = new Set(((TSf && TSf.fade) || []).map(f => f.sym)), lhOpen = Object.values(pos || {}).filter(P => P && P.src === 'longer hold').length;
    const picks = ((Q && Q.fscoreUpToday) || []).filter(x => x && x.sym && !bad.has(x.sym) && myHalal(x.sym) !== 'fail' && !(lot[x.sym] >= 0.15) && !held.has(x.sym) && !faded.has(x.sym) && !eventWarn(x.sym) && !BIOBLOCK.has(x.sym)).slice(0, Math.max(0, 3 - lhOpen));
    if (picks.length && v15Tier() && Date.now() - Date.parse(Q.generatedAt || 0) < 10 * 864e5) { const last = {}; for (const x of (sig && sig.stocks) || []) if (x.last) last[x.sym] = x.last;
      out.push('', 'LONGER HOLDS (F-score 8-9 in an uptrend: improving finances, stock above its 200-day; ' + (v15Tier() === 'small' ? 'TRADABLE SMALL (tier 2): passed its own test in both halves against the average stock (t ' + Q.v15.monthly['6m'].t.older.toFixed(1) + ' / ' + Q.v15.monthly['6m'].t.newer.toFixed(1) + '), below the 4.0 proof bar; switched off if its live league score turns negative' : v15Tier() === 'proven' ? 'PROVEN' : 'NOT PROVEN') + '. 1,000 USD each, at most 3 open):',
        ...picks.map(x => (tier2Log(x.sym, 'longer hold', last[x.sym]), x)).map(x => '- BUY ' + x.sym + (last[x.sym] ? ' up to ' + money(last[x.sym] * 1.02) + ' (2% above the last close)' : ' at the next open') + ', F-score ' + x.fs + '/9. STOP 25% under your buy at your broker. SELL when it is 30%+ above its 50-day average (the bot tells you; buy back 10% lower), or TRIM when it passes 15% of your money. Review at 6 months. Check ZAD first; send  bought ' + x.sym + ' PRICE .'),
        'Why these: in the 5-year test this rule made +9.7% in 6 months vs the S&P 500 +7.6% in 2024-26, but +5.8% vs +9.1% in 2021-23. It beat the average stock in both. The league scores these same picks monthly.'); } }
  { try { const lp = {}; for (const x of (sig && sig.stocks) || []) if (x.last) lp[x.sym] = x.last; const tl = trySmallLines(pos, lp); if (tl.length) out.push('', ...tl); } catch (e) {} }   // TRY SMALL (23 Oct)
  { const cl = catalystLines(sig, pos); if (cl.length) out.push('', ...cl); }   // CATALYST RUN-UP: only when a catalyst rule reached tier 2 or proven (23 Oct)
  { const chl = chainLines(sig, pos); if (chl.length) out.push('', ...chl); }   // CHAIN: only when a chain-decoder rule reached tier 2 or proven (23 Oct)
  { const dl = discoveryLines(sig, pos); if (dl.length) out.push('', ...dl); }   // DISCOVERED: only when a discovery2 rule reached tier 2 (23 Oct)
  // EARNINGS DRIFT (owner's choice, 21 Oct): the only buy rule that passed its own 5-year test (both halves, stress cost, last 12 months),
  // shown with its full instruction while its live paper record builds (30+ trades on 10+ days needed before it becomes a plain BUY).
  if (FOCUS && !working && sig) { const ed = planCands(sig, pos || {}).filter(x => x.kind === 'earnings drift' && x.ok).slice(0, 3), pf = sig.peadFunnel;
    if (!ed.length && pf && pf.reports) out.push('', 'EARNINGS DRIFT: no buy tonight. ' + pf.reports + ' companies reported for this session; ' + pf.beat + ' beat by 10%+; ' + pf.passed + ' also closed up 3%+ in the top half of the day with a stop under 15%' + (pf.notHalal ? '; ' + pf.notHalal + ' skipped as not halal (ZAD)' : '') + (pf.noPrice ? '; ' + pf.noPrice + ' without a usable price (not on the liquid list)' : '') + '. The rule fires only on the reaction day.');
    if (ed.length) out.push('', 'EARNINGS DRIFT (passed its 5-year test: beat 10%+ and a strong reaction day; live paper still building, so 1,000 USD each, your choice):', 'Shape: about 1 win in 3, winners much bigger than losers (+1.8% a trade on average over 176 past beats). If two losses in a row would make you move the stop, skip these.',
      ...ed.map(x => '- BUY ' + x.sym + ' from ' + money(x.lo) + ' to ' + money(x.hi) + ' at the open. STOP ' + money(x.stop) + ' at your broker. SELL ' + x.sell + '. Past test: ' + x.expect + (x.outsideTest ? '. NOTE: this company was not in the tested set (smaller or newer); its paper record is kept separately, so treat it as the weaker of the two' : '') + '. Send  bought ' + x.sym + ' PRICE .')); }
  { const fl = followSection(sig, pos); if (fl.length) out.push('', ...fl); }   // FOLLOWING (follow-lane.mjs, tier 2)
  { const IR = readJson0('data/ignition-results.json'), r8 = IR && IR.record && IR.record['IG8/close'];   // the daily-trade channel, so a day without swing buys is not a day without trades
    if (r8 && r8.n >= 20) out.push('DAILY TRADES: watch for EARLY WAVE alerts between about 4:45 and 9 pm Kuwait (at most 3 a day, 1,000 USD each, stop 8%, sell by the close). Their live paper record so far: ' + r8.n + ' trades, ' + Math.round(r8.win * 100) + '% won, ' + pcs(r8.avg) + ' a trade after costs (' + pcs(r8.stress) + ' at 1.5x costs), but on only ' + r8.days + ' day' + (r8.days === 1 ? '' : 's') + (r8.avg > 0 ? '. Not evidence until 10+ distinct days (now ' + r8.days + ' of 10) and 20+ stocks; it switches itself off if the record turns negative.' : '. Negative so far: alerts are paused until it recovers.')); }
  if (FOCUS && !working && TIER2_ON()) out.push('', 'TWO LEVELS (your choice, 22 Oct): PROVEN = passed every test and the 4.0 luck bar (none yet). TRADABLE SMALL = passed its own test in both halves after the higher cost, beat its yardstick, t 2.5+, but below 4.0: real instructions at 1,000 USD with a stop, switched off by itself if its live record turns negative. Today TRADABLE SMALL: ' + ([v15Tier() === 'small' ? 'LONGER HOLDS (F-score in an uptrend)' : null, (() => { const RB = readJson0('data/rebuy.json'); return RB && RB.status === 'OK' && Object.values(RB.results).some(r => swTier(r) === 'small') ? 'selling a stretched stock and buying it back 10% lower' : null; })()].filter(Boolean).join('; ') || 'none') + '. Always in use: your stops, and never buying a stock that jumped 15%+ in one day in the last month.', 'BEST USE OF YOUR NEXT 1,000 USD: 1) hold cash, or 2) add to your halal index fund (check ZAD): it beat every stock method tested. 3) An EARLY WAVE alert only as a small test (1,000 USD, stop at once, expected result about zero until it proves itself).');
  else if (FOCUS && !working) out.push('', 'REALITY CHECK: no buy rule has passed every test yet. Always in use: your stops, and never buying a stock that jumped 15%+ in one day in the last month.', 'BEST USE OF YOUR NEXT 1,000 USD: 1) hold cash, or 2) add to your halal index fund (check ZAD): it beat every stock method tested. 3) An EARLY WAVE alert only as a small test (1,000 USD, stop at once, expected result about zero until it proves itself).');
  if (FOCUS && !working) out.push('', 'FOCUS MODE (4-week plan from 18 Oct): no new trading buys until an engine shows a positive live record.', 'What to do instead: 1) long-term money in a halal index fund (check ZAD); 2) your long-term source\u2019s tips, each with a 35% stop; 3) EARLY WAVE alerts during the session, 1,000 USD each, stop at once.', 'Engine buys still logged on paper. To see them anyway: send  focus off');
  else out.push('', buyPart.replace(/^\n+/, ''));
  if (h.acts.add.length) out.push('', 'ADD TO A STOCK YOU OWN', ...h.acts.add.map(l => '- ' + l));
  { const z = readJson0('data/zad-list.json'), bad = z ? Object.keys(pos || {}).filter(s => (z.notHalal || []).includes(s)) : []; if (bad.length) out.push('', 'NOT HALAL (ZAD list): ' + bad.join(', ') + ' stop' + (bad.length > 1 ? '' : 's') + ' being Sharia compliant on ' + z.effective + '. SELL before then (any day, at the open after 4:45 pm Kuwait).'); }
  if (h.holdShort.length) out.push('', 'HOLD (stops at your broker): ' + h.holdShort.join(' | '));
  { const dn = buyDayNote(), tn = timingNote(); if (tn) out.push(tn); if (dn) out.push(dn); }
  { const g = goalsText().split('\n'); if (/^MONEY GOALS \((?!they start)/.test(g[0])) out.push('GOAL: ' + (g.find(x => /^NEXT /.test(x)) || '').replace(/^NEXT\s+/, '') + ' | ' + g[1].replace(/^Now: /, 'now ') + ' (accounting only: never a reason to buy more or bigger)'); }
  { const cc = planCands(sig, pos || {}), w = cc.filter(x => x.watch), rb = cc.filter(x => x.regBlock), nb = cc.filter(x => x.newsBlock); if (w.length) out.push('', 'WATCH ONLY (early evidence, 15-29 tested trades; paper until proven, not a buy): ' + w.slice(0, 8).map(x => x.sym).join(', ') + '.'); if (rb.length) out.push('NOT IN THIS MARKET (the market is weak and these rules have no winning record in falling markets): ' + rb.slice(0, 8).map(x => x.sym).join(', ') + '.'); { const tb = cc.filter(x => x.threatBlock); if (tb.length) out.push('NO BUY TODAY (threat headline in the last day): ' + tb.slice(0, 8).map(x => x.sym).join(', ') + '. Re-checked tomorrow.'); }
    { const ct = calendarText(true); if (ct) out.push(ct); }
    { const ml = macroLines(pos, cc); if (ml.length) out.push(...ml); const mb = cc.filter(x => x.macroBlock); if (mb.length) out.push('HELD BACK (industry lags after ' + mb[0].macroBlock.toLowerCase() + '): ' + mb.slice(0, 8).map(x => x.sym).join(', ') + '.'); }
    { let ml = null; try { const L = fs.readFileSync('data/macro-log.jsonl', 'utf8').trim().split('\n'); ml = JSON.parse(L[L.length - 1]); } catch { } if (ml && Date.now() - Date.parse(ml.at) < 18 * 3600e3 && ml.kind) out.push('MARKET SHOCK TODAY (S&P 500 ' + (ml.dp >= 0 ? '+' : '') + Number(ml.dp).toFixed(1) + '%): ' + (ml.kind === 'bigDown' ? 'HOLD everything, keep every stop; no panic-selling. The buys above stay valid at their prices.' : 'HOLD; do not chase; buy only inside the ranges above.')); }
    if (nb.length) out.push('HELD BACK (BAD NEWS): ' + nb.slice(0, 8).map(x => x.sym).join(', ') + ' filed news that was followed by losses in the tests (send  check SYM ).'); }
  { const AL = readJson0('data/autolab.json'), pr = AL && AL.candidates ? Object.values(AL.candidates).filter(x => x.status === 'PROVEN LIVE' && x.today && x.today.length) : [], Z = readJson0('data/zad-list.json'), bad = new Set((Z && Z.notHalal) || []);
    if (pr.length) { const pg = protectWhy(pos || {}, px, sig).length; out.push('', 'AUTO-DISCOVERED (rules the system invented, proven on live paper' + (pg ? '; caution: protect advice is on' : '') + '):', ...pr.slice(0, 3).map(x => '- ' + x.name + ' (' + x.paper.n + ' paper trades, ' + pcs(x.paper.avg) + ' a trade): ' + x.today.filter(s0 => !bad.has(s0) && !(pos || {})[s0]).slice(0, 6).join(', ') + '. Picks from the last Sunday close; check ZAD; 1,000 USD each; stop: the tested stop.')); } }
  if (sig && sig.quickHeld && sig.quickHeld.length) out.push('QUICK TRADES held back (not strong enough): ' + sig.quickHeld.slice(0, 6).map(x => x.sym).join(', ') + '. Why: ' + sig.quickHeld[0].why + '. Logged on paper.');
  { const HL = readJson('data/hunting-lab.json', null), LS = readJson('data/leaders-study.json', null), rows = HL && HL.rules ? HL.rules : [], pass = rows.filter(r => r.verdict === 'PROMISING');
    const SM = readJson('data/smart-money-study.json', null), smUp = SM && SM.rising && SM.rising.older.n >= 30 && SM.rising.newer.n >= 30 && SM.rising.older.avg > 0 && SM.rising.newer.avg > 0;
    const rOnly = rows.filter(r => r.market && r.market.risingOnly).map(r => r.name.replace(/ \(.*\)$/, ''));
    if (rows.length || LS) out.push('RESEARCH (Sunday): ' + (rows.length ? (pass.length ? 'NEW idea passed: ' + pass.map(r => r.name).join(', ') + ' (paper first)' : 'none of ' + rows.length + ' new ideas passed') : 'not run yet') + (LS && LS.liveVerdict ? '; LEADERS ' + String(LS.liveVerdict).toLowerCase() : '') + (rOnly.length ? '; works in RISING markets only: ' + rOnly.join(', ') : '') + (smUp ? '; insider buying works in rising markets (' + pcs(SM.rising.older.avg) + ' / ' + pcs(SM.rising.newer.avg) + ' a trade)' : '') + '. Send  lab  for details.'); }
  if (!FOCUS) { let ob = ''; try { ob = opportunitiesText(sig, true); } catch (e) {} if (ob) out.push('', ob); } else out.push('', 'Other ideas (information only): send  opportunities');   // FOCUS on: one working kind does not open the whole ungated board (review S-14)
  { const lc = liveConclusions(); if (lc.length) out.push('', ...lc); }
  out.push('', 'This is the one message to act on. Check ZAD, buy inside the range, set the stop. After: bought / sold SYMBOL PRICE SHARES. Why and details: send  details  or  review SYM');
  return out.join('\n');
}
// STOCK MAP (the spider web for one stock): what the company is, where it sits in its value chain (AI: chip equipment -> chips ->
// networking -> servers -> power -> data centers -> cloud -> software -> security), how every link of that chain and its industry are
// doing, how healthy the business is (SEC reports), its fair-value range, recent SEC events and dilution, then the tailwinds and
// headwinds counted. Weekly data (chains-status.json, quality.json) plus live SEC lookups. Context, not a buy signal.
// OPTIONS PAPER TEST (the owner's decision; Sharia status of options is for him and ZAD's Sharia board, see the scorecard note).
// Question: on the system's own tested BUY signals, does a call option (30-60 days, first strike at or above the price) make more
// than buying the stock, after ZAD's 5 USD per contract each way?
// Forward test only (no options history is held): each night up to 5 BUY signals get a paper call at the ASK; 14 days later it is
// sold at the BID (the real cost of the spread), next to the stock's own result over the same days. Alpaca's free options data
// (indicative feed). Nothing is bought; the result appears in the weekly report card. Options can lose 100%: this measures it.
async function optionsShadow() { if (!env.ALPACA_KEY || !env.ALPACA_SECRET) return 'Options paper test: off (no Alpaca key).';
  const AD = 'https://data.alpaca.markets', H = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET } }, S = readJson('data/options-shadow.json', { open: [], done: [] }), today = ny(Date.now()).d, sg = readJson('data/signals.json', null) || {};
  const last = {}; for (const x of sg.stocks || []) if (x.last) last[x.sym] = x.last; let st = null;
  const get = async (path) => { try { const r = await fetch(AD + path, H); st = r.status; return r.ok ? await r.json() : null; } catch (e) { st = e.message; return null; } };
  // 1. close the paper calls that are 14+ days old, at the bid
  for (const o of S.open) { if (Date.parse(today) - Date.parse(o.d) < 14 * 864e5) continue; const j = await get('/v1beta1/options/snapshots?feed=indicative&symbols=' + o.occ), q = j && j.snapshots && j.snapshots[o.occ] && j.snapshots[o.occ].latestQuote;
    const bid = q && q.bp > 0 ? q.bp : (Date.parse(today) > Date.parse(o.exp) ? 0 : null); if (bid === null) continue;
    o.out = today; o.bid1 = bid; o.ret = +(bid / o.ask - 1 - 10 / (o.ask * 100)).toFixed(4); /* ZAD: 5 USD per option contract, in and out */ o.stock = last[o.sym] ? +(last[o.sym] / o.under - 1 - 0.008).toFixed(4) : null; o.closed = true; }
  S.done = S.done.concat(S.open.filter(o => o.closed)).slice(-500); S.open = S.open.filter(o => !o.closed);
  // 2. open new paper calls on today's tested BUY signals
  // candidates: tested BUY signals first; then (20 Oct 2026, so the lab is not empty while no buy engine is proven) the LONGER HOLDS
  // picks (F-score in an uptrend) and the 6-month leaders list, ZAD not-halal removed
  const Zl = readJson('data/zad-list.json', {}), badZ = new Set(Zl.notHalal || []), Q = readJson('data/quality.json', {}), LD = readJson('data/leaders.json', {});
  const extra = [...((Q.fscoreUpToday || []).map(x => x.sym)), ...((LD.paper || []).map(x => x.sym))].filter(sym => sym && !badZ.has(sym) && myHalal(sym) !== 'fail').map(sym => ({ sym, ok: true }));
  const seenC = new Set(), cands = [...planCands(sg, {}).filter(x => x.ok), ...extra].filter(x => !S.open.some(o => o.sym === x.sym) && !seenC.has(x.sym) && seenC.add(x.sym)).slice(0, 5), lo = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), hi = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  for (const c of cands) { const px = last[c.sym]; if (!(px > 0)) continue; const j = await get('/v1beta1/options/snapshots/' + c.sym + '?feed=indicative&type=call&limit=500&expiration_date_gte=' + lo + '&expiration_date_lte=' + hi); if (!j || !j.snapshots) continue;
    const rows = Object.entries(j.snapshots).map(([occ, v]) => { const m = occ.match(/(\d{6})C(\d{8})$/); const q = v.latestQuote || {}; return m ? { occ, exp: '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6), k: +m[2] / 1000, ask: q.ap, bid: q.bp } : null; })
      .filter(x => x && x.k >= px && x.ask > 0 && x.bid > 0 && (x.ask - x.bid) / x.ask <= 0.15).sort((a, b) => a.k - b.k || (a.exp < b.exp ? -1 : 1));
    const o = rows[0]; if (o) S.open.push({ d: today, sym: c.sym, occ: o.occ, exp: o.exp, strike: o.k, ask: o.ask, bid: o.bid, under: px }); }
  // 3. COVERED CALL paper test on the stocks the owner holds (O2): sell a call 30-45 days out, strike 5%+ above the price, at the BID;
  // 14 days later buy it back at the ASK. Income = premium kept, next to the stock's own move. Nothing is sold; paper only.
  S.cc = S.cc || { open: [], done: [] }; const posH = loadPos();
  for (const o of S.cc.open) { if (Date.parse(today) - Date.parse(o.d) < 14 * 864e5) continue; const j = await get('/v1beta1/options/snapshots?feed=indicative&symbols=' + o.occ), q = j && j.snapshots && j.snapshots[o.occ] && j.snapshots[o.occ].latestQuote;
    const ask = q && q.ap > 0 ? q.ap : (Date.parse(today) > Date.parse(o.exp) ? Math.max(0, (last[o.sym] || 0) - o.strike) : null); if (ask === null) continue;
    o.out = today; o.ask1 = ask; o.income = +((o.bid - ask) * 100 - 10).toFixed(2); /* USD per contract after ZAD fees */ o.incomePct = +(o.income / (o.under * 100)).toFixed(4); o.stock = last[o.sym] ? +(last[o.sym] / o.under - 1).toFixed(4) : null; o.closed = true; }
  S.cc.done = S.cc.done.concat(S.cc.open.filter(o => o.closed)).slice(-500); S.cc.open = S.cc.open.filter(o => !o.closed);
  const lo2 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), hi2 = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
  for (const sym of Object.keys(posH).filter(k => posH[k] && posH[k].entry && !badZ.has(k) && myHalal(k) !== 'fail' && !S.cc.open.some(o => o.sym === k)).slice(0, 5)) { const px = last[sym]; if (!(px > 0)) continue;
    const j = await get('/v1beta1/options/snapshots/' + sym + '?feed=indicative&type=call&limit=500&expiration_date_gte=' + lo2 + '&expiration_date_lte=' + hi2); if (!j || !j.snapshots) continue;
    const rows = Object.entries(j.snapshots).map(([occ, v]) => { const m = occ.match(/(\d{6})C(\d{8})$/); const q = v.latestQuote || {}; return m ? { occ, exp: '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6), k: +m[2] / 1000, ask: q.ap, bid: q.bp } : null; })
      .filter(x => x && x.k >= px * 1.05 && x.ask > 0 && x.bid > 0 && (x.ask - x.bid) / x.ask <= 0.3).sort((a, b) => a.k - b.k || (a.exp < b.exp ? -1 : 1));
    const o = rows[0]; if (o) S.cc.open.push({ d: today, sym, occ: o.occ, exp: o.exp, strike: o.k, bid: o.bid, ask: o.ask, under: px }); }
  // 3b. SELL notices for the owner's real contracts: when the stock passed strike x 1.05, or the 14-day date arrived, or expiry is within 5 days
  for (const o of (S.real || []).filter(o => !o.closed)) { const px = last[o.sym], due = o.sellBy ? today >= o.sellBy : Date.parse(today) >= Date.parse(o.d) + 14 * 864e5, near = Date.parse(o.exp) - Date.parse(today) <= 5 * 864e5, hit = !o.rule && px > 0 && px >= o.strike * 1.05;   // a lane contract (o.rule) sells on its rule's date
    if ((hit || due || near) && o.notified !== today) { o.notified = today; await telegram('OPTIONS TRIAL: SELL TO CLOSE your 1 x ' + o.sym + ' ' + o.exp + ' ' + o.strike + ' CALL tomorrow (limit at the bid). Reason: ' + (hit ? o.sym + ' passed ' + (o.strike * 1.05).toFixed(2) + ' (now ' + px.toFixed(2) + ')' : due ? (o.rule ? 'the exit date of rule ' + o.rule + ' (' + o.sellBy + ') arrived' : 'the 14-day date arrived') : 'expiry is within 5 days') + '. Then send  sold option ' + o.sym + ' ' + o.strike + ' ' + o.exp + ' PRICE .'); } }
  // 4. THE TICKET, sent to the owner (his choice, 20 Oct 2026: "whenever you find an option opportunity give it to me, 1 contract").
  // One ticket a night at most, only while fewer than 2 real contracts are open, only a call bought today under 300 USD, always
  // labelled as the small trial with no evidence yet. Separate message; never inside ACTIONS.
  { const realOpen = (S.real || []).filter(o => !o.closed).length, tk = S.open.filter(o => o.d === today && o.ask * 100 <= 300 && myHalal(o.sym) === 'ok' && !(S.real || []).some(r => !r.closed && r.sym === o.sym)).sort((a, b) => a.ask - b.ask)[0];   // 22 Oct: a real ticket only on a stock ZAD has confirmed halal (TEVA was sent while unchecked)
    if (tk && realOpen < 2) S.trialSent = today; if (tk && realOpen < 2) await telegram(['OPTIONS TRIAL TICKET (separate from your stocks; 1 contract; no evidence yet, the paper test runs beside it)', '',
      'In ZAD: ' + tk.sym + ' > Options > choose GOING UP > pick BUY CALL (never "sell put": that can lose more than you pay) > expiry ' + tk.exp + ' > strike ' + tk.strike + ' > quantity 1 > LIMIT ' + tk.ask.toFixed(2) + ' > confirm.', 'Cost: about ' + Math.round(tk.ask * 100) + ' USD + 5 USD ZAD fee = the most you can lose. Stock now ' + tk.under.toFixed(2) + '.',
      'SELL TO CLOSE (limit at the bid) when ' + tk.sym + ' passes ' + (tk.strike * 1.05).toFixed(2) + ', or on ' + new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) + ', whichever comes first. Never hold it to expiry.',
      'Why this one: ' + tk.sym + ' is halal in ZAD (your mark), on tonight\u2019s LONGER HOLDS / leaders list, and this is the cheapest clean call 30-60 days out (spread under 15%).', 'If you place it, send:  bought option ' + tk.sym + ' ' + tk.strike + ' ' + tk.exp + ' ' + tk.ask.toFixed(2) + '  so I track it and tell you when to sell. Whether options themselves are allowed is ZAD\u2019s Sharia view: check it once.'].join('\n')); }
  // 5. OPTIONS LANE tickets (23 Oct 2026; options-lab.mjs): only rules at tier 2 or proven in data/options-lab.json; the same gates as the
  // trial ticket (halal ok in ZAD, at most 300 USD, at most 2 open counting tonight's tickets), labelled with the rule and its record and
  // logged to data/tier2-ledger.jsonl as option:<rule>. Nothing qualifies -> nothing new is shown. Logged tickets are resolved here at
  // their own bid on the rule's sell date (never with the stock price).
  try { S.labT = S.labT || []; const rules = ['OPT-LH1', 'OPT-CAT1', 'OPT-FOLLOW1'].filter(r => optionsLabTier(r));
    let LG = []; try { LG = fs.readFileSync('data/tier2-ledger.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) {} let lch = false;
    for (const r of LG) if (/^option:/.test(r.kind || '') && !r.out && r.occ && today >= (r.sellBy || new Date(Date.parse(r.d) + 30 * 864e5).toISOString().slice(0, 10))) { const j = await get('/v1beta1/options/snapshots?feed=indicative&symbols=' + r.occ), q = j && j.snapshots && j.snapshots[r.occ] && j.snapshots[r.occ].latestQuote;
      const bid = q && q.bp > 0 ? q.bp : (today > r.exp ? 0 : null); if (bid === null) continue; r.out = today; r.px1 = bid; r.pct = +Math.max(-1, (bid * 100 - 5) / (r.px * 100 + 5) - 1).toFixed(4); lch = true; }
    if (lch) fs.writeFileSync('data/tier2-ledger.jsonl', LG.map(x => JSON.stringify(x)).join('\n') + '\n');
    if (rules.length) { const OC = await import(new URL('./options-core.mjs', import.meta.url).href), LB = readJson0('data/options-lab.json') || {}, CTd = readJson0('data/catalyst-today.json') || {};
      let fc = []; try { fc = fs.readFileSync('data/follow-calls.jsonl', 'utf8').trim().split('\n').slice(-5000).map(x => JSON.parse(x)); } catch (e) {}
      const next = (CTd.sessions || []).find(d => d > today) || (() => { let x = new Date(today + 'T12:00:00Z'); do x = new Date(x.getTime() + 864e5); while ([0, 6].includes(x.getUTCDay())); return x.toISOString().slice(0, 10); })();
      const ctx = { today, next, quality: readJson0('data/quality.json') || {}, catalystToday: CTd, followCalls: fc, follow: ((LB.latest || {})['OPT-FOLLOW1'] || {}).follow || [] };
      for (const rule of rules) for (const c of OC.labCandidates(rule, ctx)) {
        if ((S.real || []).filter(o => !o.closed).length + S.labT.filter(t => t.d === today).length + (S.trialSent === today ? 1 : 0) >= 2) break;
        if (myHalal(c.sym) !== 'ok' || badZ.has(c.sym) || (S.real || []).some(r => !r.closed && r.sym === c.sym) || S.labT.some(t => t.sym === c.sym && t.rule === rule && Date.parse(today) - Date.parse(t.d) < 30 * 864e5)) continue;
        const px = last[c.sym]; if (!(px > 0)) continue;
        const j = await get('/v1beta1/options/snapshots/' + c.sym + '?feed=indicative&type=call&limit=1000&expiration_date_gte=' + c.lo + '&expiration_date_lte=' + c.hi); if (!j || !j.snapshots) continue;
        const rows = Object.entries(j.snapshots).map(([occ, v]) => { const m = occ.match(/(\d{6})C(\d{8})$/), q = v.latestQuote || {}; return m ? { occ, exp: '20' + m[1].slice(0, 2) + '-' + m[1].slice(2, 4) + '-' + m[1].slice(4, 6), k: +m[2] / 1000, ask: q.ap, bid: q.bp } : null; }).filter(Boolean);
        const tk = OC.labTicket(rows, px, c); if (!tk) continue;
        S.labT.push({ d: today, sym: tk.sym, rule, occ: tk.occ, exp: tk.exp, strike: tk.k, ask: tk.ask, sellBy: tk.sellBy }); S.labT = S.labT.slice(-200);
        tier2Log(tk.sym, 'option:' + rule, tk.ask, { occ: tk.occ, exp: tk.exp, strike: tk.k, sellBy: tk.sellBy, under: px });
        await telegram(optionsLabTicketText(tk, rule, optionsLabTier(rule), (LB.latest || {})[rule] || {})); } } } catch (e) { console.log('options lane ticket: ' + e.message); }
  fs.writeFileSync('data/options-shadow.json', JSON.stringify(S));
  return 'Options lab (separate from stock trading, Alpaca data): ' + (st === null ? 'no BUY signal to test today' : 'data ' + (st === 200 ? 'OK' : 'HTTP ' + st)) + '; ' + S.open.length + ' open paper calls, ' + S.done.length + ' finished.'; }
// OPTIONS LAB: kept fully SEPARATE from stock trading (owner's instruction). Its own file, its own message, never in ACTIONS,
// the LIVE RECORD or the stock report card, never a buy instruction.
function optionsText() { const OS = readJson0('data/options-shadow.json'); if (!OS) return 'OPTIONS LAB (separate from stock trading): no paper calls yet. It starts with the next nightly scan.';
  const d = (OS.done || []).filter(o => typeof o.ret === 'number'), av = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, days = new Set(d.map(o => o.d)).size, st = d.filter(o => o.stock !== null);
  return ['OPTIONS LAB (paper only, SEPARATE from your stock trading)', '',
    'Test: a call 30-60 days out on each tested stock BUY signal, bought at the ask, sold at the bid 14 days later, ZAD fee 5 USD a contract each way, next to the same stock over the same days.',
    (OS.cc ? 'Covered calls (paper) on the stocks you hold: ' + (OS.cc.open || []).length + ' open, ' + (OS.cc.done || []).length + ' finished' + ((OS.cc.done || []).length ? ', average income ' + pcs(av(OS.cc.done.map(o => o.incomePct || 0))) + ' of the stock value per 14 days after ZAD fees, while the stocks moved ' + pcs(av(OS.cc.done.filter(o => o.stock !== null).map(o => o.stock))) : '') + '.' : ''),
    ...((OS.open || []).filter(o => o.ask * 100 <= 300 && myHalal(o.sym) === 'ok' && (OS.real || []).filter(r => !r.closed).length < 2 && !(OS.real || []).some(r => !r.closed && r.sym === o.sym)).slice(0, 2).map(o => 'TICKET (your choice, small trial, NO evidence yet): BUY TO OPEN 1 x ' + o.sym + ' ' + o.exp + ' ' + o.strike + ' CALL, limit ' + o.ask.toFixed(2) + ' (about ' + Math.round(o.ask * 100) + ' USD + 5 USD ZAD fee; the most you can lose). Plan: sell it when the stock passes ' + (o.strike * 1.05).toFixed(2) + ' or on ' + new Date(Date.parse(o.d) + 14 * 864e5).toISOString().slice(0, 10) + ', whichever first.')),
    (OS.cc && OS.cc.open && OS.cc.open.length ? 'COVERED CALL tickets need 100 shares of the stock; with 1,000 USD positions you do not have them, so these stay paper: ' + OS.cc.open.slice(0, 3).map(o => 'SELL TO OPEN 1 x ' + o.sym + ' ' + o.exp + ' ' + o.strike + ' CALL at ' + o.bid.toFixed(2)).join(' | ') : ''),
    (OS.real && OS.real.length ? 'YOUR TRIAL (real, 1 contract each): ' + OS.real.filter(o => !o.closed).map(o => o.sym + ' ' + o.exp + ' ' + o.strike + ' call, paid ' + o.paid.toFixed(2) + ', sell when ' + o.sym + ' passes ' + (o.strike * 1.05).toFixed(2) + ' or on ' + new Date(Date.parse(o.d) + 14 * 864e5).toISOString().slice(0, 10)).join(' | ') + (OS.real.some(o => o.closed) ? ' | closed: ' + OS.real.filter(o => o.closed).length + ', total ' + (OS.real.filter(o => o.closed).reduce((a, z) => a + z.pnl, 0) >= 0 ? '+' : '') + OS.real.filter(o => o.closed).reduce((a, z) => a + z.pnl, 0).toFixed(0) + ' USD' : '') : ''),
    'Open paper calls: ' + (OS.open || []).length + (OS.open && OS.open.length ? ' (' + OS.open.slice(-5).map(o => o.sym + ' ' + o.strike + ' call, exp ' + o.exp).join(', ') + ')' : '') + '.',
    d.length ? 'Finished: ' + d.length + ' on ' + days + ' signal day(s): calls ' + pcs(av(d.map(o => o.ret))) + ' a trade, ' + Math.round(d.filter(o => o.ret > 0).length / d.length * 100) + '% won, worst ' + pcs(Math.min(...d.map(o => o.ret))) + ' | the same stocks ' + (st.length ? pcs(av(st.map(o => o.stock))) : 'n/a') + '.' : 'Finished: none yet (first results 14 days after the first paper call).',
    'Verdict: ' + (d.length < 20 || days < 10 ? 'too early (20+ calls over 10+ days needed).' : av(d.map(o => o.ret)) > 0 && av(d.map(o => o.ret)) > (st.length ? av(st.map(o => o.stock)) : 0) ? 'calls did better than the stocks so far (one period only).' : 'calls did NOT beat simply owning the stock.'),
    '', (d.length >= 20 && days >= 10 && av(d.map(o => o.ret)) > 0 && av(d.map(o => o.ret)) > (st.length ? av(st.map(o => o.stock)) : 0) ? 'SMALL TRIAL ALLOWED: the paper calls earned it. Rules: 1 contract per trade, at most 300 USD per trade, at most 2 open at once, sell after 14 days or at -50%. Options money is separate from your stock money.' : 'SMALL TRIAL: not yet. When the paper calls beat owning the stock (20+ calls over 10+ days), this line will say so, with the trial rules (1 contract, max 300 USD a trade, max 2 open).'), 'Sharia: per ZAD (options as offered in the ZAD app). The system never places orders.'].join('\n'); }
// OPTIONS LANE (options-lab.mjs -> data/options-lab.json, pre-registered 23 Oct 2026): a rule feeds the options ticket only at tier 2
// (TRADABLE SMALL, while tier 2 is on and its own option ledger is not negative) or PROVEN. Separate from stock trading.
function optionsLabTier(rule) { const B = readJson0('data/options-lab.json'), v = B && B.verdicts && B.verdicts[rule];
  if (v === 'PROVEN') return 'proven'; if (v !== 'TRADABLE SMALL' || !TIER2_ON() || tier2LedgerNegative('option:' + rule)) return null; return 'small'; }
function optionsLabTicketText(tk, rule, tier, r) { const why = { 'OPT-LH1': 'a new LONGER HOLDS pick; the at-the-money call 60-90 days out', 'OPT-CAT1': 'a CAT-RUN1 run-up entry; a call expiring after the ' + (tk.event || 'catalyst') + ' date', 'OPT-FOLLOW1': 'a new options call by a trader at FOLLOW; the at-the-money call 30-60 days out' }[rule] || rule;
  return ['OPTIONS TICKET, rule ' + rule + ' (' + (tier === 'proven' ? 'PROVEN' : 'TRADABLE SMALL, tier 2: passed its pre-registered test on real option prices in both halves, below the 4.0 proof bar') + '; separate from your stocks; 1 contract)',
    'Record of the rule: ' + r.n + ' trades, ' + pcs(r.avg) + ' a call after the spread and ZAD fees, vs ' + pcs(r.stock) + ' for the same stock with the same money, block t ' + r.tBlock + '.', '',
    'In ZAD: ' + tk.sym + ' > Options > choose GOING UP > pick BUY CALL (never "sell put") > expiry ' + tk.exp + ' > strike ' + tk.k + ' > quantity 1 > LIMIT ' + tk.ask.toFixed(2) + ' > confirm.',
    'Cost: about ' + Math.round(tk.ask * 100 + 5) + ' USD with the 5 USD ZAD fee = the most you can lose. Stock now ' + tk.spot.toFixed(2) + '.',
    'SELL TO CLOSE (limit at the bid) on ' + tk.sellBy + ' (the rule\u2019s exit' + (rule === 'OPT-CAT1' ? ', 2 sessions before the event; never hold through it' : '') + '). Never hold it to expiry.',
    'Why: ' + why + '. ' + tk.sym + ' is marked halal in ZAD (yours). If you place it, send:  bought option ' + tk.sym + ' ' + tk.k + ' ' + tk.exp + ' ' + tk.ask.toFixed(2) + ' . Whether options are allowed is ZAD\u2019s Sharia view: check it once.'].join('\n'); }
function optionsLabText() { const B = readJson0('data/options-lab.json'); if (!B || !B.verdicts) return 'OPTIONS LANE: has not run yet (options-lab.yml, weekly on Saturday).';
  const L = B.latest || {}, c = (B.coverage && B.coverage.alpaca) || {}, live = Object.keys(B.verdicts).filter(id => optionsLabTier(id));
  const line = (id) => { const r = L[id] || {}; return id + ': ' + B.verdicts[id] + (typeof r.n === 'number' && r.n ? ' | ' + r.n + ' trades, ' + pcs(r.avg) + ' a call after the spread and ZAD fees vs the same stock with the same money ' + pcs(r.stock) + ', block t ' + r.tBlock : '') + (r.why ? ' | ' + r.why : ''); };
  return ['OPTIONS LANE (long calls only, 1 contract, SEPARATE from your stocks; ' + (B.window || []).join(' to ') + ', run ' + String(B.generatedAt || '').slice(0, 10) + ')', '', ...Object.keys(B.verdicts).map(line), '',
    'Options traders (explicit options calls, scored with real call prices): ' + ((B.leaderboard || []).slice(0, 5).map(t => t.name + ' ' + t.level + ' (' + t.priced + ' priced on ' + t.days + ' days' + (t.avg !== null && t.avg !== undefined ? ', ' + pcs(t.avg) + ' a call' : '') + ')').join('; ') || 'none found'),
    'Data: Alpaca daily option bars ' + (c.firstOptionBar || '?') + ' to ' + (c.lastOptionBar || '?') + ' (' + (c.optionSeriesCached || 0) + ' contracts priced, ' + (c.contractsCached || 0) + ' listed). ' + ((B.coverage && B.coverage.note) || ''),
    live.length ? 'LIVE: ' + live.join(', ') + ' feed the options ticket (halal ok only, at most 300 USD, at most 2 open).' : 'LIVE: no options rule has reached tier 2 or proven, so no new options ticket is shown. Sharia: options are ZAD\u2019s view to confirm.'].join('\n'); }
async function stockMap(sym, sig, pos, short) { const CS = readJson0('data/chains-status.json'), CH = (readJson0('data/chains.json') || {}).chains || {}, QY = readJson0('data/quality.json'), up = [], down = [], out = [];
  const ex = (r, b) => r === null || r === undefined || b === null || b === undefined ? null : r - b, vs = (r) => r === null || r === undefined ? 'n/a' : pcs(r) + (CS && CS.spy && CS.spy.r3 !== null ? ' (S&P ' + pcs(CS.spy.r3) + ')' : '');
  const si = await secIndustry(sym, true).catch(() => null);
  out.push((short ? 'STOCK MAP ' : 'SNAPSHOT: ') + sym + (si && si.desc ? ', ' + si.desc : si ? ', SEC industry code ' + si.sic : '') + (CS ? ' (chain data as of ' + CS.asOf + ')' : ''));
  // 1. value chains
  const mine = []; for (const [name, layers] of Object.entries(CH)) layers.forEach((L, k) => { if (L.syms.includes(sym)) mine.push({ name, k, layers }); });
  { const cg = chainGraphLine(sym); if (cg) out.push(cg); }
  if (!mine.length) out.push('Value chain: not on the chain map (data/chains.json; it can be added). Judged by its industry below.');
  for (const m of mine) { const st = CS && CS.chains && CS.chains[m.name]; out.push('Value chain: ' + m.name + ', layer ' + (m.k + 1) + ' of ' + m.layers.length + ': ' + m.layers[m.k].layer);
    if (st) { const spy = CS.spy.r3; if (!short) out.push(...st.map((L, k) => (k === m.k ? '  > ' : '    ') + L.layer + ': ' + pcs(L.r3) + ' in 3 months' + (k < m.k ? ' (its suppliers)' : k > m.k ? ' (its customers)' : ' (ITS LAYER)')));
      const me = st[m.k], sup = st.slice(0, m.k).map(L => L.r3).filter(x => x !== null), cus = st.slice(m.k + 1).map(L => L.r3).filter(x => x !== null), a = (v) => v.length ? v.reduce((x, y) => x + y, 0) / v.length : null;
      const e1 = ex(me.r3, spy); if (e1 !== null) (e1 > 0.05 ? up : e1 < -0.05 ? down : []).push('its own layer ' + pcs(me.r3) + ' in 3 months vs S&P ' + pcs(spy));
      const e2 = ex(a(cus), spy); if (e2 !== null) (e2 > 0.05 ? up : e2 < -0.05 ? down : []).push('its customers’ layers ' + pcs(a(cus)) + ' (demand side)');
      const e3 = ex(a(sup), spy); if (e3 !== null && e3 > 0.10 && e1 !== null && e1 < 0) up.push('its suppliers are running ahead of it (' + pcs(a(sup)) + '): a possible catch-up, untested'); } }
  // 2. industry
  if (CS && CS.symInd && CS.symInd[sym]) { const g = CS.ind[CS.symInd[sym]]; out.push('Industry: ' + g.name + ': ' + pcs(g.r3) + ' in 3 months, rank ' + g.rank + ' of ' + CS.nInd + ' industries');
    if (g.rank <= CS.nInd / 4) up.push('its industry is in the top quarter'); else if (g.rank > CS.nInd * 3 / 4) down.push('its industry is in the bottom quarter'); }
  // 3. business health (SEC 10-K numbers, known at the time)
  const P = QY && QY.per && QY.per[sym]; if (P) { const pr = (x) => x === null ? 'n/a' : 'better than ' + Math.round(x * 100) + '% of liquid stocks';
    out.push('Business (last 10-K): profit on assets ' + pr(P.pr) + '; share count ' + (P.dilute === null ? 'n/a' : pcs(P.dilute)) + ' in a year; assets ' + (P.growth === null ? 'n/a' : pcs(P.growth)) + '; quality overall ' + pr(P.qr));
    if (P.qr !== null) (P.qr >= 0.7 ? up : P.qr <= 0.3 ? down : []).push('business quality ' + (P.qr >= 0.7 ? 'high' : 'low') + ' vs other companies'); if (P.dilute > 0.2) down.push('share count up ' + pcs(P.dilute) + ' in a year (dilution)'); if (P.accr > 0.1) down.push('profits not backed by cash'); }
  else out.push('Business: no SEC yearly numbers for it in the quality study (too small, foreign, or new).');
  const F = QY && QY.fair && QY.fair[sym]; if (F) { const px = F.px; out.push('Fair value range (own cash-flow history, ' + F.years + ' yrs): ' + money(F.cons) + ' / ' + money(F.base) + ' / ' + money(F.opt) + ' (conservative / base / optimistic), price ' + money(px) + ' on ' + (QY.to || 'the last study'));
    if (px > F.opt) down.push('priced above its optimistic value'); else if (px <= F.base) up.push('priced at or under its base value'); }
  // 4. events and supply of shares
  { const ER = readJson0('data/events-recent.json'), ev = ((ER && ER.events) || []).filter(e => e.sym === sym); if (ev.length) out.push('SEC events (10 days): ' + ev.slice(-4).map(e => e.p.slice(0, 10) + ' ' + e.f).join(' | ')); if (ev.some(e => /DELIST|DILUTION|OFFERING|RESTATE/.test(e.f))) down.push('a share sale, delisting or restatement filing'); }
  { const dl = dilutionLine(sym); if (dl && !P) out.push(dl); }
  { const Z = readJson0('data/zad-list.json'); if (Z && (Z.notHalal || []).includes(sym)) down.push('NOT HALAL on the ZAD list'); }
  // 5. tested evidence behind the chain idea
  const ES = readJson0('data/events-study.json'), link = ES && ES.link ? linkVerdict(ES.link) : null;
  out.push('TAILWINDS (' + up.length + '): ' + (up.join('; ') || 'none') + '.', 'HEADWINDS (' + down.length + '): ' + (down.join('; ') || 'none') + '.');
  if (!short) out.push('How much to trust the chain view: "a hot industry pulls its suppliers up" tested ' + (link || 'not yet') + ' on 5 years; quality and cheapness have their own tests (Sunday). This map explains a stock; only tested rules make a BUY. Check ZAD.');
  return out.join('\n'); }
// SECOND OPINION ("argue against me"): on every buy of your OWN pick (no tested signal), the system argues the other side with
// facts it already holds, so the decision is not made on the story alone. It never blocks the buy; it records what to watch.
async function secondOpinion(sym, entry, sig, pos) { const con = [], pro = [], st = ((sig && sig.stocks) || []).find(x => x.sym === sym), Z = readJson0('data/zad-list.json');
  if (Z && (Z.notHalal || []).includes(sym)) con.push('NOT HALAL on the ZAD list.');
  if (st) { if (st.uptrend === false) con.push('It is not in an uptrend (the rules that tested well buy uptrends).'); else if (st.uptrend) pro.push('It is in an uptrend.'); if (typeof st.mom6 === 'number') (st.mom6 < 0 ? con : pro).push('6-month change ' + pcs(st.mom6) + '.'); }
  if (sig && sig.market && sig.market.above50 === false) con.push('The S&P 500 is under its 50-day average: buys fail more often in a weak market.');
  try { const d = await loadDaily(sym); if (d && d.candles.length > 6) { const c = d.candles, n = c.length - 1, r5 = c[n].c / c[n - 5].c - 1; if (r5 >= 0.2) con.push('Up ' + pcs(r5) + ' in 5 sessions: buying after a big jump tested badly (typically -4.9% three days later, 719 cases).'); else if (r5 <= -0.15) con.push('Down ' + pcs(r5) + ' in 5 sessions: a falling knife until it stops falling.'); } } catch (e) { }
  { const dl = dilutionLine(sym); if (dl && /^DILUTION/.test(dl)) con.push(dl); }
  { let mt = []; try { mt = fs.readFileSync(MY_TRADES, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(t => (t.kind || 'manual') === 'manual'); } catch (e) { } if (mt.length >= 3) { const a = mt.reduce((x, t) => x + t.pct, 0) / mt.length; (a < 0 ? con : pro).push('Your own picks so far: ' + mt.length + ' sold, average ' + pcs(a) + '.'); } }
  { const SC = readJson0('data/sectors.json') || {}, CK = readJson0('data/sec-ciks.json') || {}, X = readJson0('data/sic-extra.json') || {}, ind = (s) => SC[s] || (X[s] && X[s][0] && 'SIC ' + String(X[s][0]).slice(0, 2)) || (CK[s] && CK[s][1] && 'SIC ' + String(CK[s][1]).slice(0, 2)) || null, me = ind(sym), same = me ? Object.keys(pos).filter(k => k !== sym && ind(k) === me) : [];
    if (same.length >= 2) con.push('You already hold ' + same.length + ' stocks from the same industry (' + same.join(', ') + '): they tend to fall together.'); if (Object.keys(pos).length >= 12) con.push('This makes ' + Object.keys(pos).length + ' open positions: hard to watch, and losses add up together.'); }
  { const QY = readJson0('data/quality.json'), f = QY && QY.fair && QY.fair[sym], vr = QY && QY.results ? Object.values(QY.results).filter(r => /cash flow/i.test(r.name)) : [], vOk = vr.some(r => r.verdict === 'PROMISING');
    if (f) { const where = entry > f.opt ? 'ABOVE its optimistic value' : entry > f.base ? 'between its base and optimistic value' : entry > f.cons ? 'between its conservative and base value' : 'BELOW its conservative value';
      (entry > f.opt ? con : entry <= f.base ? pro : []).push('Fair value range from its own cash flow history (' + f.years + ' years): ' + money(f.cons) + ' / ' + money(f.base) + ' / ' + money(f.opt) + ' (conservative / base / optimistic); your price is ' + where + '. ' + (vOk ? 'Buying cheap passed the 5-year test.' : 'Note: "cheap" has NOT beaten the market on 5 years of tests yet, so treat this as information.')); } }
  const P = pos[sym], stopTxt = P && P.stop ? money(P.stop) + ' (' + pcs(P.stop / entry - 1) + ')' : 'not set yet';
  return ['SECOND OPINION on ' + sym + ' (your own pick; the system argues the other side so you see it):',
    ...(con.length ? con.map(x => '- AGAINST: ' + x) : ['- Nothing in the data argues against it.']), ...pro.map(x => '- FOR: ' + x),
    'What proves it wrong: a close under ' + stopTxt + '. Put that stop at your broker now.',
    'Not a block: your decision. Research only.'].join('\n'); }
// TRADE WORDS: turns the ways you might say a buy or a sale into the standard line, so every one is recorded.
// "I bought 10 shares of RELL at 21.19", "bought 10 RELL @ 21.19", "اشتريت RELL 21.19 10 سهم", "sold all my TTD at 12.10", "بعت TTD 12.1",
// "sold 5 RELL at 23" ... become "bought RELL 21.19 10 shares" / "sold TTD 12.10" / "sold RELL 23 5 shares".
// common typos for "shares" (shears, shars, shrs, sahres...) are read as shares
const SHARE_TYPOS = /\b(?:shears?|shars?|shres?|shrs?|sahres?|shaers?|shaes?|sharez)\b/gi;
function tradeWords(t0) {
  let t = western(t0).replace(/[،,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:i\s+)?(?:bought (?:more|extra)|added|add more)\b/i.test(t)) return t0;   // adding to a stock you hold has its own command
  if (/^(?:i\s+)?(?:just\s+)?(?:bought|sold)\s+options?\b/i.test(t)) return t0;   // options trial commands have their own handler (audit 22 Oct: they were recorded as stock trades)
  const buyW = /^(?:i\s+)?(?:just\s+)?(?:(?:bought|purchased)\b|اشتريت|شريت)/i, sellW = /^(?:i\s+)?(?:just\s+)?(?:(?:sold|exited)\b|بعت)/i;   // past tense only: "buy X?" is a question, never a recorded trade
  const isBuy = buyW.test(t), isSell = sellW.test(t); if ((!isBuy && !isSell) || /[?؟]/.test(t)) return t0;
  if (/^(?:i\s+)?(?:bought|sold)\s+[A-Za-z.\-]{1,6}(\s|$)/i.test(t) && !/\b(of|@|at)\b/i.test(t.split(' ').slice(2, 3).join(' '))) { /* already standard, but may still carry Arabic share words */ }
  const half = /\bhalf\b|نص|نصف/i.test(t), all = /\ball\b|كل/i.test(t);
  const words = t.replace(buyW, '').replace(sellW, '').replace(/\b(all|my|the|of|shares?|sh|stocks?|half|at|@|for|price|each|x)\b/gi, ' ').replace(/(سهم|اسهم|أسهم|كل|نص|نصف|على|ب|بسعر)/g, ' ').trim().split(/\s+/).filter(Boolean);
  const sym = (words.find(w => /^[A-Za-z]{1,5}(\.[A-Za-z])?$/.test(w) && !NOT_TICKERS.has(w.toUpperCase())) || '').toUpperCase(); if (!sym) return t0;
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  // the price is the number written after at/@/بسعر, or the number with decimals; the share count is the number written next to shares/سهم, or the whole number left over
  let price = null, sh = null;
  { const pm = t.match(/(?:@|\bat\b|بسعر|على)\s*(\d+(?:\.\d+)?)/i); if (pm) price = +pm[1]; }
  { const sm = t.match(/(\d+)\s*(?:shares?|sh|stocks?|سهم|اسهم|أسهم)/i) || t.match(/(?:shares?|سهم|اسهم)\s*(\d+)/i); if (sm) sh = +sm[1]; }
  if (price === null) { const dec = nums.find(n => !Number.isInteger(n)); price = dec ?? (nums.length === 1 && sh === null ? nums[0] : nums.find(n => n !== sh) ?? null); }
  if (sh === null && nums.length >= 2) sh = nums.find(n => n !== price && Number.isInteger(n)) ?? null;
  const rest = (t.match(/\b(stop\s+\d+(?:\.\d+)?|target\s+\d+(?:\.\d+)?)/gi) || []).join(' ');
  if (isBuy) return 'bought ' + sym + (price ? ' ' + price : '') + (sh ? ' ' + sh + ' shares' : '') + (rest ? ' ' + rest : '');
  if (half && !all) return 'sold half ' + sym + (price ? ' ' + price : '');
  return 'sold ' + sym + (price ? ' ' + price : '') + (sh && !all ? ' ' + sh + ' shares' : '');
}
// ONE-TAP RECORDING: buttons under ACTIONS and BUY NOW so the system records your trades without typing.
// Tapping "Bought" records the buy at the live price with the recommended number of shares; "Sold" records the sale at the live price;
// "Skipped" records that you passed on it (missed trades are evidence too). If your real price differs, send the bought/sold line to correct it.
function tradeButtons(sig, pos, max) {
  const rows = [], c = sig ? planCands(sig, pos).filter(x => x.ok) : [];
  for (const x of c.slice(0, max || 5)) { const a = amountFor(x, sig.market, false).usd, sh = Math.max(1, Math.floor(a / x.hi)); rows.push([{ text: 'Bought ' + x.sym + ' (' + sh + ' sh)', data: 'b|' + x.sym + '|' + sh }, { text: 'Skipped ' + x.sym, data: 's|' + x.sym }]); }
  for (const sym of Object.keys(pos || {}).slice(0, 6)) rows.push([{ text: 'Sold all ' + sym, data: 'x|' + sym }]);
  return rows;
}
const QUIET = () => { const st = readJson0('data/settings.json') || {}; return st.quiet !== false; };   // quiet unless you send  quiet off
// "Should I buy more of X?" for a stock you already hold. The answer follows the plan, not the mood of the day.
async function addReply(sym, pos) {
  const P = pos[sym]; let p = null;
  if (marketOpen(Date.now())) { const j = await liveQ((sym)); p = +j.price || null; }
  const now = p ? ' You bought at ' + money(P.entry) + ', now ' + money(p) + ' (' + (p >= P.entry ? '+' : '') + ((p / P.entry - 1) * 100).toFixed(1) + '%).' : ' You bought at ' + money(P.entry) + '.';
  const plan = 'Your plan is unchanged: HOLD | STOP ' + (P.stop ? money(P.stop) : 'none set') + ' | SELL ' + (P.t1 ? money(P.t1) + (P.t2 ? ' then ' + money(P.t2) : '') : 'no target set') + (P.kind === 'quick' ? ' | or on the rule exit, or after ' + (P.maxHold || 5) + ' sessions.' : '.');
  const SG = readJson('data/signals.json', null), out = ['SHOULD YOU BUY MORE ' + sym + '?'], b = buyToday(sym, SG), b0s = SG && SG.session;   // adds: a NEW, fully PROVEN signal on a stock already in profit. Never early evidence, never to lower an average.
  if (b && !b.thin && p && p > P.entry * 1.01 && !(P.since && b0s && b0s <= P.since) && !(P.stop && p <= P.stop) && !(p > b.hi)) out.push('Yes: add 1,000 USD (each buy and each sell costs you 3 USD, so smaller adds are not worth it), inside ' + money(b.lo) + ' to ' + money(b.hi) + '.' + now, 'A TESTED buy rule fired on ' + sym + ' at the last close (' + b.n + ' unseen trades' + (b.thin ? ', early evidence' : '') + '). That is the only reason to add' + (p && p < P.entry ? ', and it also lowers your average price' : '') + '. Use ONE stop for all your shares: ' + money(b.stop) + '. After buying send:  added ' + sym + ' PRICE SHARES');
  else if (b && b.thin) out.push('No.' + now, 'A buy rule fired, but it is only EARLY EVIDENCE (' + b.n + ' tested trades). Adding needs a fully proven rule.', plan);
  else if (p && P.stop && p <= P.stop) out.push('No. It has reached your stop at ' + money(P.stop) + '.' + now, 'The plan says sell or reassess here, not add.');
  else if (p && p < P.entry) out.push('No.' + now, 'It is below your entry. Buying more now is adding to a losing trade: it doubles the bet at the moment the trade is going against you, and it is how a small planned loss becomes a large one.', plan);
  else if (P.kind === 'quick') out.push('No.' + now, 'A quick trade is a single entry. Its edge is small, so the plan is to take the bounce and leave, not to build a bigger position.', plan);
  else if (p) out.push('Only as a planned second stage.' + now, 'It is above your entry, so adding is allowed by the rules if: it has made a daily close above your entry, you then move the stop on ALL shares up to your entry price, and your total open risk stays under 2% of the account. Otherwise, no.', plan);
  else out.push('The market is closed, so I cannot see the price.' + now, 'The rule either way: never add while it is below your entry. Above your entry, only as a planned second stage with the stop moved up to your entry price.', plan);
  return out.join('\n');
}
// "From SOURCE what to buy?"  Lists what that source recommended, and which of it your tested rules support today.
function sourceReply(src, sig) {
  const mine = readTips().filter(t => t.src === src), seen = new Set(), tips = mine.filter(t => !seen.has(t.sym) && seen.add(t.sym)).slice(-20);
  const rows = universe(sig), board = (sig && sig.tipBoard) || { tips: [], sources: [] }, pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  const good = [], rest = [];
  for (const t of tips) {
    const x = rows.find(r => r.sym === t.sym), sup = x ? supportLine(x, sig) : null, perf = board.tips.find(b => b.sym === t.sym && b.src === src && b.d === t.d);
    const since = perf && perf.ret !== null ? ' Since the tip: ' + pcx(perf.ret) + ' in ' + perf.days + ' sessions (S&P 500 ' + pcx(perf.spy) + ').' : '';
    if (sup) good.push(sup + (t.below ? ' | the source said: buy below ' + money(t.below) : '') + (since ? '.' + since : ''));
    else rest.push(t.sym + ': ' + (x ? 'no tested support today' : 'not scanned yet, wait for tonight') + (t.below ? ', source said buy below ' + money(t.below) : '') + '.' + since);
  }
  const rec = board.sources.find(g => g.src === src);
  return ['FROM ' + src + ': ' + tips.length + ' stock' + (tips.length === 1 ? '' : 's') + ' logged', '', 'WHAT YOUR TESTED RULES SUPPORT TODAY', ...(good.length ? good : ['None. Nothing this source named has a tested entry or setup today.']), '', 'THE REST', ...(rest.length ? rest : ['None.']), '',
    rec ? 'This source\u2019s record so far: ' + rec.n + ' tip' + (rec.n === 1 ? '' : 's') + ', average ' + pcx(rec.avg) + ' against ' + pcx(rec.spy) + ' for the S&P 500' + (rec.muted ? '. MUTED: it trails the market.' : rec.trusted ? '. Ahead of the market so far.' : rec.n < 10 || rec.days < 20 ? '. Too early to judge.' : '.') : 'No record yet: results start after the next nightly scan.',
    'A source naming a stock is a lead. Only a line starting ENTRY CONFIRMED, QUICK TRADE or BUY WATCH carries prices from your tested rules.'].join('\n');
}
async function natural(text, sig, pos) {
  // a pasted tip list (2+ tickers with buy words, Arabic or English) is logged as tips, even when it names a known source
  { const tk = (western(text).match(/\b[A-Z]{2,5}\b/g) || []).filter(x => !NOT_TICKERS.has(x)); if (new Set(tk).size >= 2 && /\u0634\u0631\u0627\u0621|\u0627\u0642\u0644 \u0645\u0646|\u0623\u0642\u0644 \u0645\u0646|\u062A\u0648\u0635\u064A|\bbuy\b|\bbelow\b|\btarget\b/i.test(text)) return null; }
  if (/^\s*(health|system health|status check|sell|sells|sell check|why sell|what (to|should i) sell|which stocks to sell)\s*\??\s*$/i.test(text)) return null;   // menu words (audit 22 Oct)
  if (/^(i\s+)?(bought|sold)\b|^(check|add|analy[sz]e|remove|delete|unwatch|stop|target|tips?|log|name|rename|source|follow|unfollow|channels?|positions?|status|list|sources?|scoreboard|market|news|movers?|gainers?|today|update|hot|leaders?|radar|early|wave|ladder|details?|report|record|results?|performance|winners?|patterns?|lessons?|mistakes?|lab|hunting|hunt|risk|account|capital|balance|score)\b/i.test(text)) return null;
  { const low = text.toLowerCase(), srcs = [...new Set(readTips().map(t => t.src))].sort((a, b) => b.length - a.length), hit = srcs.find(n => { const k = n.toLowerCase().replace(/^youtube:\s*/, '').trim(); return k.length >= 3 && low.includes(k); }); if (hit) return sourceReply(hit, sig); }
  if (/\bleaders?\b|\bstrongest\b|\bwaves?\b|\btrending\b|ride\b/i.test(text) && !findTicker(text, sig, pos)) return leadersText();
  if (/\bpenn(y|ies)\b|under\s*\$?\s*5\b|\bcheap stocks?\b/i.test(text)) return pennyReply(sig);
  const sec = SECTOR_WORDS.find(([, re]) => re.test(text)), tk = findTicker(text, sig, pos);
  if (sec && !tk && sig) return sectorReply(sec[0], sig);
  if (/\bmy (stocks|shares|portfolio|positions)\b|\bholdings\b|\bportfolio\b|what (should i|to) do with my/i.test(text) && !findTicker(text, sig, pos)) return holdingsText(sig, pos);
  if (/^review\b|\bhold or sell\b|\bkeep or sell\b|\breach(ed)? (its|their|the) (limit|top|peak)|\bstudy (my|them|it)\b/i.test(text)) {   // HOLD OR SELL review: one stock, or all you own
    if (tk) return reviewReply(tk, sig, pos);
    const mine = Object.keys(pos); if (!mine.length) return 'You have no positions recorded. Send:  bought SYMBOL PRICE SHARES   for each stock you own, then:  review';
    const parts = []; for (const x of mine.slice(0, 8)) parts.push(await reviewReply(x, sig, pos));
    return parts.join('\n\n') + (mine.length > 8 ? '\n\nOnly the first 8 shown. Send:  review SYMBOL   for the others.' : '');
  }
  if (tk && pos[tk] && /\b(more|add|adding|average|averaging|double)\b/i.test(text) && !/\bsell\b/i.test(text)) return addReply(tk, pos);
  if (/\bsell\b|\bexit\b|take profit|get out/i.test(text)) return tk ? sellReply(tk, sig, pos) : hotList(sig);
  if (!tk && /\bbuy\b|\bhunt\b|\brecommend/i.test(text)) return hotList(sig);
  if (tk && /\bbuy\b|\bhunt\b|\bfind\b|look (for|at|into)|what about|how about|\bentry\b|\bworth\b/i.test(text)) { const known = sig && ((sig.quick || []).some(x => x.sym === tk) || (sig.stocks || []).some(x => x.sym === tk)); return known ? checkOne(tk, sig) : checkLive(tk); }
  return null;
}
// ---- Watchdog. The bot wakes every few minutes, so it can notice when one of the nightly programs did NOT do its job
// (crashed, was cancelled, or never started) and tell you once, instead of you discovering a missing message days later.
async function watchdog(sig) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const now = Date.now(), n = ny(now);
  let expected = ''; for (let k = 0; k < 10; k++) { const x = ny(now - k * 86400000); if (x.weekend || isHoliday(x.d) || (k === 0 && x.mins < 970)) continue; expected = x.d; break; }
  if (!expected) return;
  const later = n.d > expected, st = readJson('data/tg-state.json', { offset: 0 }), warned = st.warned || {}, out = [];
  const late = (key, have, due, what, name) => { if (due && (have || '') < expected && warned[key] !== expected) { warned[key] = expected; out.push(what + ' for the ' + expected + ' close has not completed' + (have ? ' (its last result is from ' + have + ')' : '') + '. In GitHub open Actions, then ' + name + '. If the newest run is red, cancelled or missing, tap Run workflow, and send Claude the red lines if it fails again.'); } };
  late('scan', sig && sig.session, later || n.mins >= 1230, 'The nightly scan', 'Stock scanner');                         // due by 8:30 pm New York
  late('disc', DISCMETA && DISCMETA.session, later && n.mins >= 150, 'The discovery engine', 'Discovery engine');        // due by 2:30 am New York
  late('movers', (readJson('data/movers-state.json', {}) || {}).session, later && n.mins >= 210, 'The movers radar', 'Movers radar');   // due by 3:30 am New York
  if (!out.length) return;
  st.warned = warned; fs.writeFileSync('data/tg-state.json', JSON.stringify(st));
  await telegram('WATCHDOG\n' + out.join('\n\n') + '');
  console.log('watchdog: ' + out.length + ' warning(s) sent');
}
async function tgCommands(sig) {
  if (env.GITHUB_WORKFLOW && env.GITHUB_WORKFLOW !== 'Telegram bot replies') return;   // one reader of Telegram messages (audit 22 Oct): the bot workflow
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  const state = readJson('data/tg-state.json', { offset: 0 }), pos = loadPos(), out = [];
  let ups = [];
  try { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/getUpdates?timeout=' + Math.min(50, Math.max(0, parseInt(env.TG_WAIT || '0', 10) || 0)) + '&offset=' + state.offset); ups = ((await r.json()).result) || []; } catch (e) { console.log('could not read Telegram messages'); return; }
  // One message may carry several commands, one per line (for example four "follow" lines pasted together). Split those up.
  // A leading dash, bullet or backtick copied from a list is ignored. A multi-line tip message is left whole.
  const CMD_LINE = /^(follow|unfollow|bought|i bought|sold|i sold|stop|target|check|add|remove)\b/i, clean = (x) => x.replace(/^[\s\-\u2022*`>]+/, '').replace(/`+$/, '').trim(), queue = [];
  for (const u of ups) {
    if (u.callback_query) {   // a tapped button: Bought / Sold / Skipped
      const cq = u.callback_query, chatId = cq.message && cq.message.chat ? cq.message.chat.id : (cq.from && cq.from.id); let txt = null, note = 'Recorded';
      const [kind, sym, sh] = String(cq.data || '').split('|');
      if (String(chatId) === String(env.TG_CHAT) && sym) {
        if (kind === 'b') { const j = await liveQ(sym), p = +j.price || null; if (p) txt = 'bought ' + sym + ' ' + p + (+sh > 0 ? ' ' + sh + ' shares' : ''); else note = 'No live price: send  bought ' + sym + ' PRICE SHARES shares'; }
        else if (kind === 'x') txt = 'sold ' + sym;
        else if (kind === 's') { let px = null; try { const j = await liveQ(sym); px = +j.price || null; } catch (e) { }
          fs.appendFileSync('data/skipped.jsonl', JSON.stringify({ sym, d: ny(Date.now()).d, ts: Date.now(), px }) + '\n'); note = 'Skipped ' + sym + ': noted';
          // ask why, with one tap: the system later shows whether your skips were right (send  skips )
          try { await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: 'Why did you skip ' + sym + '? (one tap; used to check later whether skipping was right)', reply_markup: { inline_keyboard: [[{ text: 'My tip says wait', callback_data: 'r|' + sym + '|tip' }, { text: 'Not halal / unsure', callback_data: 'r|' + sym + '|halal' }], [{ text: 'No money now', callback_data: 'r|' + sym + '|money' }, { text: 'Do not trust it', callback_data: 'r|' + sym + '|trust' }, { text: 'Other', callback_data: 'r|' + sym + '|other' }]] } }) }); } catch (e) { } }
        else if (kind === 'r') { fs.appendFileSync('data/skipped.jsonl', JSON.stringify({ sym, why: sh, ts: Date.now() }) + '\n'); note = 'Reason saved for ' + sym; }
      }
      try { await fetch(TG + '/bot' + env.TG_TOKEN + '/answerCallbackQuery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cq.id, text: note }) }); } catch (e) {}
      if (txt) queue.push({ update_id: u.update_id, message: { chat: { id: chatId }, text: txt } }); else state.offset = Math.max(state.offset, u.update_id + 1);
      continue;
    }
    const m = u.message, lines = m && m.text ? m.text.split('\n').map(clean).filter(Boolean) : [];
    if (lines.length > 1 && lines.every(x => CMD_LINE.test(x))) lines.forEach(x => queue.push({ update_id: u.update_id, message: { ...m, text: x } }));
    else { if (m && m.text && lines.length === 1) m.text = lines[0]; queue.push(u); }
  }
  if (state.menuV !== MENU_V) { await sendMenu(); state.menuV = MENU_V; }   // the one-tap menu appears by itself once (and after each change)
  for (const u of queue) {
    state.offset = u.update_id + 1;
    const m = u.message; if (!m || !m.text || String(m.chat.id) !== String(env.TG_CHAT)) continue;      // only you
    { const sl = m.text.trim().match(/^\/([a-z_]+)(?:@\w+)?\s*([\s\S]*)$/i); if (sl) { const e = MENU.find(x => x[0] === sl[1].toLowerCase()), base = e ? e[1] : sl[1].toLowerCase() === 'start' ? 'menu' : sl[1];
      m.text = sl[2] ? (/^(check|bought|sold)$/i.test(sl[1]) ? sl[1].toLowerCase() : base) + ' ' + sl[2].trim() : base; } }
    { const t0 = m.text.trim().toLowerCase(); if (ASK[t0]) { out.push(ASK[t0]); continue; }
      if (/^(news ?watch|my news|news alerts?|threats?)\s*\??$/.test(t0)) { out.push(newsText()); continue; }
      if (/^(market today|today'?s market|day|day type|what (kind of )?day( is (it|today))?|how is the market( today)?|is today a (buy|buying|sell|selling) day|buy day|sell day)\s*\??$/.test(t0)) { out.push(await dayText(sig, pos)); continue; } if (/^(menu|start|buttons?|bar)$/.test(t0)) { await sendMenu(); state.menuV = MENU_V; continue; } }
    const text = tradeWords(m.text.trim().replace(/\$/g, '').replace(SHARE_TYPOS, 'shares')), num = (re) => { const x = text.match(re); return x ? +x[1] : null; };
    let k;
    { const tk = (text.match(/\b[A-Z]{2,5}\b/g) || []).filter(x => !NOT_TICKERS.has(x) && !COMMON_WORDS.has(x)), fwd = m.forward_origin || m.forward_from_chat;
      if (!tk.length && !/^\s*(?:tips?|log)\b/i.test(text) && (text.length >= 160 || (fwd && text.length >= 60))) {
        const src = (m.forward_origin && (m.forward_origin.sender_user_name || (m.forward_origin.sender_user && m.forward_origin.sender_user.first_name) || (m.forward_origin.chat && m.forward_origin.chat.title))) || (m.forward_from_chat && m.forward_from_chat.title) || null;
        const known = !src ? [...new Set(readTips().map(t => t.src))].filter(n => n && n.length >= 3 && n !== 'Unnamed source').find(n => text.includes(n)) : null;   // a source you logged before, named in the pasted text
        out.push(await opinionReply(text, sig, src || known || null)); continue; } }
    { const h1 = text.match(/^(?:halal|zad)\s+([a-z.\-]{1,6})\s+(yes|ok|halal|pass|no|not(?:\s+halal)?|fail|haram)\s*$/i), h2 = text.match(/^([a-z.\-]{1,6})\s+(?:is\s+)?(not\s+halal|haram|halal)(?:\s+(?:in|on)\s+zad)?\s*$/i), h3 = text.match(/^(?:not\s+halal|haram)\s+([a-z.\-]{1,6})\s*$/i);
      if (!h1 && !h2 && !h3) { const hb = halalBatch(text); if (hb.length >= 2) { const mk = HALALM(), d = ny(Date.now()).d; for (const [sym, bad] of hb) mk[sym] = { s: bad ? 'fail' : 'ok', d, by: 'ZAD (you)' }; fs.writeFileSync(HALAL_FILE, JSON.stringify(mk, null, 1));
        out.push('Recorded ' + hb.length + ' ZAD marks.\nHALAL: ' + (hb.filter(x => !x[1]).map(x => x[0]).join(', ') || 'none') + '\nNOT HALAL: ' + (hb.filter(x => x[1]).map(x => x[0]).join(', ') || 'none') + '\nTo change one: halal SYM yes  or  halal SYM no'); continue; } }
      const hm = h1 ? [h1[1], !/^(yes|ok|halal|pass)$/i.test(h1[2])] : h2 ? [h2[1], !/^halal$/i.test(h2[2])] : h3 ? [h3[1], true] : null;
      if (hm) { const sym = hm[0].toUpperCase(), mk = HALALM(); mk[sym] = { s: hm[1] ? 'fail' : 'ok', d: ny(Date.now()).d, by: 'ZAD (you)' }; fs.writeFileSync(HALAL_FILE, JSON.stringify(mk, null, 1));
        out.push(sym + (hm[1] ? ': marked NOT HALAL (ZAD). I will not offer it as a buy anywhere: plan, BUY NOW, radar or checks.' + (pos[sym] ? ' You hold it: decide yourself whether to sell.' : '') : ': marked HALAL (checked in ZAD). Thank you.') + ' To change it: halal ' + sym + (hm[1] ? ' yes' : ' no')); continue; } }
    if (/^traders?\s*$/i.test(text)) { out.push(tradersText()); continue; }
    if (!(m.forward_origin || m.forward_from_chat)) { const nl = await natural(text, sig, pos); if (nl) { out.push(nl); continue; } }   // a forwarded message is someone else's words: treat it as a tip, not as your question
    if (/^(sources?|tips?)\s*$/i.test(text)) { out.push(tipBoard(sig)); continue; }
    if ((k = m.text.trim().match(/^follow\s+(.+)$/i))) {       // follow NAME UCxxxxxxxx   (or a channel link containing the ID)
      let id = (k[1].match(/UC[\w-]{20,24}/) || [])[0];
      const handle = (k[1].match(/@([\w.-]{3,40})/) || [])[1], name = k[1].replace(/https?:\/\/\S+/g, '').replace(/UC[\w-]{20,24}/, '').replace(/@[\w.-]+/, '').trim().slice(0, 30) || (handle || '');
      if (!id && handle && env.YT_KEY) {      // a channel link with an @name: ask the official API which channel ID that handle belongs to
        try { const r = await fetch(YTAPI + '/youtube/v3/channels?part=snippet&forHandle=' + encodeURIComponent('@' + handle) + '&key=' + encodeURIComponent(env.YT_KEY)); if (r.ok) { const it = ((await r.json()).items || [])[0]; if (it && /^UC[\w-]{20,24}$/.test(it.id || '')) id = it.id; } else console.log('YouTube handle lookup answered ' + r.status); } catch (e) {}
        if (!id) { out.push('I could not find a YouTube channel for @' + handle + '. Check the spelling of the link, or send the channel ID that starts with UC.'); continue; }
      }
      if (!id || !name) out.push('Send it like this:\nfollow ZipTrader UCxxxxxxxxxxxxxxxxxxxxxx\nThe ID starts with UC. On YouTube open the channel, tap its description, then Share channel, then Copy channel ID.');
      else {    // ask YouTube whose channel this is. If YouTube does not answer, follow anyway, marked unverified, and say so honestly.
        const f = await ytFeed(id), a = readChannels().filter(c => c.id !== id && c.name !== name);
        if (f.ok) { const real = String(f.channel || '').slice(0, 60), latest = String((f.items[0] || {}).title || '').slice(0, 90);
          a.push({ name, id }); fs.writeFileSync(CH_FILE, JSON.stringify(a.slice(-12)));
          out.push('Following ' + name + '.\nYouTube says this ID belongs to: ' + (real || 'unknown') + (latest ? '\nIts latest video: "' + latest + '"' : '') + '\nIf that is not the channel you meant, send:  unfollow ' + name); }
        else if (env.YT_KEY && f.status === 404) out.push('Not followed: YouTube\u2019s official API says no channel has the ID ' + id + '. Copy the real one from the YouTube app: open the channel, tap its description, Share channel, Copy channel ID.');
        else { a.push({ name, id, unverified: true }); fs.writeFileSync(CH_FILE, JSON.stringify(a.slice(-12)));
          out.push('Saved ' + name + ', but NOT verified: YouTube (' + f.via + ') answered ' + (f.status === -1 ? 'nothing' : 'HTTP ' + f.status) + '. ' + (env.YT_KEY ? (f.status === 404 ? 'With the official API a 404 means this channel ID does not exist.' : f.status === 403 ? 'A 403 means the YT_KEY secret is wrong, or the YouTube Data API is not switched on for it, or its daily allowance is used up.' : '') + ' ' : 'Without a YT_KEY secret I use the public feed, which YouTube often refuses to GitHub\u2019s servers. ') + 'To check the ID yourself, open this link in your phone\u2019s browser:\nhttps://www.youtube.com/feeds/videos.xml?channel_id=' + id + '\nIf you see a page of text with video titles, the ID is right and YouTube is blocking my server. I will keep trying each night and report it under SCAN HEALTH.'); }
      }
      continue;
    }
    if ((k = m.text.trim().match(/^unfollow\s+(.+)$/i))) { const a = readChannels(), b = a.filter(c => c.name.toLowerCase() !== k[1].trim().toLowerCase()); fs.writeFileSync(CH_FILE, JSON.stringify(b)); out.push(b.length < a.length ? 'Stopped following ' + k[1].trim() + '. Its past record stays in the scoreboard.' : 'I was not following "' + k[1].trim() + '".'); continue; }
    if (/^channels?\s*$/i.test(text)) { const a = readChannels(); out.push(a.length ? 'Channels I follow (' + a.length + ' of 12):\n' + a.map(c => c.name).join('\n') : 'No channels followed yet.\nfollow NAME CHANNEL-ID'); continue; }
    if ((k = m.text.trim().match(/^(?:name|rename|source)\s+(.{1,80})$/i))) {     // "name NEW" names the unnamed tips; "name OLD = NEW" renames a source
      const parts = k[1].split(/\s*=\s*/), from = parts.length > 1 ? parts[0].trim() : 'Unnamed source', to = (parts.length > 1 ? parts[1] : parts[0]).trim().slice(0, 40), all = readTips(), hit = all.filter(t => t.src === from).length;
      if (!to || !hit) out.push(hit ? 'Send it like this: name SOURCE NAME' : 'I have no tips logged under "' + from + '".');
      else { fs.writeFileSync(TIP_FILE, all.map(t => JSON.stringify(t.src === from ? { ...t, src: to } : t)).join('\n') + '\n'); out.push(hit + ' tip' + (hit > 1 ? 's' : '') + ' moved from "' + from + '" to "' + to + '". The scoreboard will show the new name after the next nightly scan.'); }
      continue;
    }
    // "tip check btbt, nabl, uroy" / "check tips btbt nabl" / "check btbt, nabl, uroy": a list of tickers in any case -> each one checked and logged as a tip
    if ((k = text.trim().match(/^(?:tips?\s*check|check\s*tips?|check)\s*[:\-]?\s*(\$?[a-z][a-z.\-]{0,5}(?:\s*[,\u060C/&]\s*\$?[a-z][a-z.\-]{0,5}|\s+(?:and\s+)?\$?[a-z][a-z.\-]{0,5})+)\s*$/i))) {
      const syms = [...new Set(k[1].split(/[\s,\u060C/&]+/).map(x => x.replace(/^\$/, '').toUpperCase()).filter(x => x && x !== 'AND' && /^[A-Z][A-Z.\-]{0,5}$/.test(x)))].slice(0, 15);
      if (syms.length >= 2) { out.push(await logTips('tips\n' + syms.join(' '), (m.forward_origin && (m.forward_origin.chat || {}).title) || null)); continue; } }
    if (/^\s*(?:tips?\b|log\b|\u062A\u0648\u0635\u064A\u0627\u062A|\u062A\u0648\u0635\u064A\u0629)/i.test(text) || (/\u062A\u0648\u0635\u064A|\u0633\u0647\u0645|\u0634\u0631\u0627\u0621|\u0627\u0634\u062A\u0631|\u0628\u064A\u0639|\btips?\b|\bsource\b/i.test(text) && (text.match(/\b[A-Z]{2,5}\b/g) || []).filter(x => !NOT_TICKERS.has(x)).length >= 1) || ((m.forward_origin || m.forward_from_chat) && /\$[A-Z]{1,5}\b|\u0633\u0647\u0645|\b[A-Z]{2,5}\b.*\b(buy|sell|target|entry|stop)\b|\b(buy|sell|target|entry|stop)\b.*\b[A-Z]{2,5}\b|\u0628\u064A\u0639/i.test(m.text))) { const fo = m.forward_origin || {}, fwd = String((fo.chat && fo.chat.title) || fo.sender_user_name || (fo.sender_user && [fo.sender_user.first_name, fo.sender_user.last_name].filter(Boolean).join(' ')) || (m.forward_from_chat && m.forward_from_chat.title) || '').slice(0, 40); out.push(await logTips(m.text, fwd)); continue; }
    if (/^(leaders?|strongest)\b/i.test(text)) { out.push(leadersText()); continue; }
    if (/^(details?|more|full)\s*$/i.test(text)) { const ps = loadPos(), px = {}; if (marketOpen(Date.now()) && sig) for (const y of planCands(sig, ps).filter(z => z.ok).map(z => z.sym).slice(0, 30)) { const j = await liveQ(y); if (j && +j.price > 0) px[y] = +j.price; } out.push(planText(sig, ps, Object.keys(px).length ? px : null, 'DETAILS: full cards' + (sig ? ', from the ' + sig.session + ' close' : ''), null, true)); continue; }
    if (/^(record|my record|results?|performance)\s*$/i.test(text)) { out.push(myRecord(true)); continue; }
    if (/^(lessons?|learn\w*|mistakes?)\s*$/i.test(text)) { out.push(lessonsText()); continue; }
    if ((k = text.match(/^(account|capital|balance)\s+(\d+(?:\.\d+)?)\s*(usd|\$)?\s*$/i))) { const ub = usualBuy(); out.push('No account size needed, and I do not store it. I size each buy from YOUR usual buy, learned from what you actually buy: report the shares when you buy, for example  bought CRWD 268.50 10  . Strong records then get up to 2x your usual buy; thin evidence, live losses, a weak market or radar setups get less.' + (ub ? ' Your usual buy so far: about ' + money(ub.usd) + ' USD (' + ub.n + ' buys).' : ' No buy with shares reported yet.')); continue; }
    if ((k = text.match(/^runners?\s+(on|off)\s*$/i))) { const st = updateSettings(s => { s.runners = k[1].toLowerCase() === 'on'; }); if (!st) { out.push(SETTINGS_BAD); continue; } out.push('Runners heads-up ' + (st.runners ? 'ON: stocks up 20%+ during the session, with their SEC risks (at most 12 a day, each once).' : 'OFF.')); continue; }
    if ((k = text.match(/^(?:fee|fees|commission)\s+(\d+(?:\.\d+)?)\s*(usd|\$)?\s*$/i))) { const st = updateSettings(s => { s.feeUSD = +k[1]; }); if (!st) { out.push(SETTINGS_BAD); continue; } out.push('Saved: your broker fee is ' + money(+k[1]) + ' USD per buy and per sell (' + money(2 * k[1]) + ' a round trip). Every BUY is now judged after this fee on a 1,000 USD buy, and each card shows the dollars on your usual buy.'); continue; }
    if ((k = text.match(/^risk\s+(\d+(?:\.\d+)?)\s*(usd|\$)?\s*$/i))) { const st = updateSettings(s => { s.riskUSD = +k[1]; }); if (!st) { out.push(SETTINGS_BAD); continue; } out.push('Saved: you accept losing about ' + money(+k[1]) + ' USD per trade. Every buy in the plan now shows the exact number of shares for that loss (shares = ' + money(+k[1]) + ' / (buy price - stop)).'); continue; }
    if ((k = text.match(/^score(?:\s+([a-z.\-]{1,6}))?\s*$/i))) { const w = readJson('data/score-study.json', null);
      if (!w || !w.text) out.push('The stock score runs every Sunday with the fair test. No result yet.');
      else if (!k[1]) out.push(w.text);
      else { const sy = k[1].toUpperCase(), sc = (w.scores || {})[sy], all = Object.values(w.scores || {}), rank = sc === undefined ? null : all.filter(x => x > sc).length + 1;
        out.push(sc === undefined ? sy + ': no score (under 5 USD, thinly traded, a fund, or under 6 months of prices).' : sy + ': score ' + sc + ' of 100, rank ' + rank + ' of ' + all.length + ' liquid US companies. The score itself is ' + w.verdict + ' as a way to pick stocks' + (w.verdict === 'PROMISING' ? '.' : ', so treat it as research only.')); }
      continue; }
    if (/^(lab|hunting|hunting lab|hunt)\s*$/i.test(text)) { const w = readJson('data/hunting-lab.json', null); out.push(w && w.text ? w.text : 'The hunting lab runs every Sunday with the fair test. No result yet.'); continue; }
    if (/^(winners?|winner study|patterns?)\s*$/i.test(text)) { const w = readJson('data/winners-study.json', null); out.push(w && w.text ? w.text : 'The winners study runs every Sunday with the fair test. No result yet.'); continue; }
    if (/^(report|scan|full report)\s*$/i.test(text)) { const r = fs.existsSync('data/scan-report.txt') ? fs.readFileSync('data/scan-report.txt', 'utf8') : ''; out.push(r || 'No nightly report saved yet. It arrives after tonight\u2019s scan.'); continue; }
    if (/^(radar|early|wave)\b/i.test(text)) { const r = readJson('data/intraday-radar.json', null); out.push(r && r.text ? r.text : 'The early-wave radar has not produced a board yet. It runs about every 15 minutes while the US market is open (from 4:30 pm Kuwait).'); continue; }
    // WHAT TO SELL AND WHY (before the general "today / sell" list, which only shows stop hits)
    if (/^\s*(sell|sells|sell check|why sell|what\s+(to|should\s+i|do\s+i|can\s+i)\s+sell\b.*|which\s+(stocks?\s+)?(to|should\s+i)\s+sell\b.*|\u0634\u0646\u0648\s+\u0623?\u0627?\u0628\u064A\u0639.*|\u0645\u0627\u0630\u0627\s+\u0623?\u0627?\u0628\u064A\u0639.*)\s*\??\s*$/i.test(text)) { out.push(await sellCheckText(sig)); continue; }
    if (/^(today|hot|hot\s*list|quick|setups?|ideas?|list today|update|recommend\w*|buy|sell|what now|now what)\s*\??$/i.test(text) || /^(today|hot)\b/i.test(text) || /what.*\b(buy|sell|do)\b/i.test(text) || /^buy\s+(today|now|what|list)\b/i.test(text) || /^(\u0627\u0644\u064A\u0648\u0645|\u0634\u0646\u0648 \u0627\u0634\u062A\u0631\u064A|\u0645\u0627\u0630\u0627 \u0627\u0634\u062A\u0631\u064A|\u0648\u0634 \u0627\u0634\u062A\u0631\u064A|\u062A\u062D\u062F\u064A\u062B)\s*\??$/.test(text)) { out.push(await hotList(sig)); continue; }
    if (/^(movers?|gainers?|fast|pennies|penny)\b/i.test(text)) { out.push(await moversNow()); continue; }
    if (/^(market|news|now|sectors?|breaking)\b/i.test(text) || /what.*(happening|going on|news)/i.test(text)) { out.push(await marketNow()); continue; }
    if (/^options?\s+lab\s*\??\s*$/i.test(text)) { out.push(optionsLabText()); continue; }   // the options lane (options-lab.mjs): verdicts and data coverage
    if (/^(options?|\u062E\u064A\u0627\u0631\u0627\u062A)\s*\??\s*$/i.test(text)) { out.push(optionsText()); continue; }
    if ((k = text.match(/^(?:snapshot|snap|map|web|chain|study|research)\s+(?:of\s+)?([a-z.\-]{1,6})\b/i))) { out.push(await stockMap(k[1].toUpperCase(), sig, pos)); continue; }
    if ((k = text.match(/^(?:check|ask|about|add|analy[sz]e)\s+([a-z.\-]{1,6})\b/i))) { const sy = k[1].toUpperCase(), known = sig && ((sig.quick || []).some(x => x.sym === sy) || (sig.stocks || []).some(x => x.sym === sy)); out.push(sixAngles(sy, sig, pos) + '\n\n' + (known ? checkOne(sy, sig) + '\n' + (await deepInfo(sy).catch(() => [])).join('\n') : await checkLive(sy)) + '\n\n' + (await stockMap(sy, sig, pos, true).catch(() => ''))); continue; }
    if ((k = text.match(/^(?:remove|delete|unwatch)\s+([a-z.\-]{1,6})\b/i))) { const sy = k[1].toUpperCase(), a = readExtra(); if (a.includes(sy)) { fs.writeFileSync(EXTRA_FILE, JSON.stringify(a.filter(x => x !== sy))); out.push('Removed ' + sy + ' from my nightly scan.'); } else out.push(sy + ' was not one of the stocks you added.'); continue; }
    // ADDED: more shares of a stock you already hold. The average price and share count are updated; the stop stays.
    if ((k = text.match(/^(?:i\s+)?(?:added|add more|bought more|bought extra)\s+([a-z.\-]{1,6})\s+(?:at\s+)?(\d+(?:\.\d+)?)/i))) {
      const sym = k[1].toUpperCase(), price = +k[2], P = pos[sym], shm = text.match(/(\d+(?:\.\d+)?)\s*(?:shares?|sh|stocks?|\u0627\u0633\u0647\u0645|\u0633\u0647\u0645)\b/i), add = shm ? +shm[1] : null;
      if (!P) { out.push('I am not tracking ' + sym + ' yet. For a first buy send:  bought ' + sym + ' ' + price + ' SHARES shares'); continue; }
      if (!add) { out.push('How many shares did you add? Send:  added ' + sym + ' ' + price + ' 10 shares'); continue; }
      const pv = privRead(), old = pv.shares && pv.shares[sym];
      if (!old) { out.push('I do not know how many ' + sym + ' shares you had before, so I cannot work out the new average. Send your TOTAL now with the average price from your broker:  bought ' + sym + ' AVERAGE-PRICE TOTAL shares'); continue; }
      const tot = old + add, avg = +((old * P.entry + add * price) / tot).toFixed(4);
      pv.shares[sym] = tot; pv.buys = (pv.buys || []).concat({ sym, usd: +(add * price).toFixed(2), d: ny(Date.now()).d }).slice(-50); const saved = privWrite(pv);
      out.push('Added ' + add + ' ' + sym + ' at ' + money(price) + '. You now hold ' + tot + ' shares at an average of ' + money(avg) + ' (was ' + money(P.entry) + ').' + (P.stop ? ' Stop stays ' + money(P.stop) + ' for ALL shares: at the stop the whole position would lose about ' + money(tot * (avg - P.stop)) + ' USD. Update the stop at your broker to cover all ' + tot + ' shares.' : ' No stop set: send  stop ' + sym + ' PRICE') + (saved ? '' : ' (share counts not stored: add the PRIVATE_KEY secret)'));
      P.entry = avg; P.addedOn = ny(Date.now()).d; continue;
    }
    // SOLD PART: "sold SYM PRICE 5 shares" when you sell only some of your shares
    { const pm = text.match(/^(?:i\s+)?sold\s+(?!half\b)([a-z.\-]{1,6})\s+(?:at\s+)?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*(?:shares?|sh|stocks?|\u0627\u0633\u0647\u0645|\u0633\u0647\u0645)\b/i);
      if (pm && pos[pm[1].toUpperCase()]) { const sym = pm[1].toUpperCase(), exit = +pm[2], n0 = +pm[3], P = pos[sym], pv = privRead(), held = pv.shares && pv.shares[sym];
        if (held && n0 < held) {
          fs.appendFileSync(MY_TRADES, JSON.stringify({ sym, kind: (P.kind || 'manual'), entry: P.entry, exit, since: P.since || null, out: ny(Date.now()).d, pct: +(exit / P.entry - 1 - MY_COST).toFixed(5), priced: 'you', part: n0 + ' of ' + held, lesson: 'Part sold; the rest is still held.' }) + '\n');
          const usd = n0 * (exit - P.entry) - 2 * FEE(); pv.shares[sym] = held - n0; addRealized(pv, sym, usd, ny(Date.now()).d); const news = goalNews(pv); privWrite(pv);
          out.push('Sold ' + n0 + ' of your ' + held + ' ' + sym + ' at ' + money(exit) + ' (' + pcs(exit / P.entry - 1) + ', about ' + (usd >= 0 ? '+' : '') + money(usd) + ' USD after fees). You still hold ' + (held - n0) + ' shares at ' + money(P.entry) + ', stop ' + (P.stop ? money(P.stop) : 'not set') + '. Change the stop at your broker to cover ' + (held - n0) + ' shares.' + news);
          continue; } } }
    if ((k = text.match(/^(?:i\s+)?bought\s+(?!options?\b)([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {   // (22 Oct) not "bought option ...": that is the options trial, handled below
      const sym = k[1].toUpperCase(); let entry = k[2] ? +k[2] : null;
      const shm = text.match(/(\d+(?:\.\d+)?)\s*(?:shares?|sh|stocks?|اسهم|سهم)\b/i) || text.match(/\b(?:x|qty|shares?)\s*(\d+(?:\.\d+)?)/i) || text.match(/^(?:i\s+)?bought\s+[a-z.\-]{1,6}\s+(?:at\s+)?\d+(?:\.\d+)?\s+(\d+)\s*$/i), shares = shm ? +shm[1] : null;
      if (!entry) { const j = await liveQ((sym)); entry = +j.price || null; }
      if (!entry) { out.push(sym + ': I could not get a price. Send it with the price, for example: bought ' + sym + ' 12.50'); continue; }
      const P = { entry, since: ny(Date.now()).d, ...planFor(sym, entry, sig) }; { const md = moodOf(text); if (md) P.mood = md; }
      { const Qh = readJson0('data/quality.json'); if (((Qh && Qh.fscoreUpToday) || []).some(x => x.sym === sym)) P.src = 'longer hold'; }   // counts toward the 3 open LONGER HOLDS
      if (!P.src) { const VT = readJson0('data/value-today.json'), VL = readJson0('data/value-lab.json'), q = VL ? tryQualifies(labRuns(VL)) : [];   // TRY SMALL buy: its own 15% stop and ~3-month exit
        if (VT && VT.rules && q.some(id => ((VT.rules[id.replace(/_\w+$/, '')] || {}).picks || []).some(x => x.sym === sym))) { P.src = 'try small'; P.stop = +(entry * 0.85).toFixed(2); P.own = true; P.stopWhy = 'the TRY SMALL lane stop, 15% under your buy (fixed, never moved by the bot)'; P.tryHold = 63; } 
        for (const lab of ['anomaly', 'expert', 'confluence', 'ml', 'angles', 'macro', 'tipster', 'research', 'squad1', 'squad2', 'squad3', 'squad4', 'squad6', 'squad7', 'squad8', 'squad9', 'squad11', 'squad12', 'squad13', 'squad14']) if (!P.src) { const AL = readJson0('data/' + lab + '-lab.json'), AT = readJson0('data/' + lab + '-today.json'), aq = AL ? tryQualifies(labRuns(AL)) : [], hit = AT && AT.methods ? aq.find(id => ((AT.methods[id] || {}).newSignals || []).some(x => x.sym === sym)) : null;
          if (hit) { const hold = +((AL.firstRun[hit] || {}).hold || 63), sp = hold > 100 ? 0.35 : 0.15; P.src = 'try small'; P.stop = +(entry * (1 - sp)).toFixed(2); P.own = true; P.stopWhy = 'the TRY SMALL lane stop, ' + Math.round(sp * 100) + '% under your buy (fixed, never moved by the bot)'; P.tryHold = hold; } }
        if (!P.src) { const DH = readJson0('data/decoded-history.json'), DT = readJson0('data/decoded-today.json'), dq = DH ? tryQualifies(labRuns(DH)) : [];
          if (DT && DT.methods && dq.some(id => ((DT.methods[id] || {}).newSignals || []).some(x => x.sym === sym))) { P.src = 'try small'; P.stop = +(entry * 0.65).toFixed(2); P.own = true; P.stopWhy = 'the TRY SMALL lane stop for a 6-month hold, 35% under your buy (fixed, never moved by the bot)'; P.tryHold = 126; } } }
      { const cd = sig ? planCands(sig, {}).find(x => x.sym === sym && x.ok) : null; if (cd && typeof cd.win === 'number') P.test = { win: +cd.win.toFixed(3), net: cd.net !== null ? +cd.net.toFixed(4) : null, n: cd.n || null, kind: cd.kind }; }   // what the tests promised, to compare with what really happens
      if (P.kind === 'manual' && !P.stop) {   // no tested plan today: suggest a stop from the stock's own volatility and trend
        const d = await loadDaily(sym);
        if (d && d.candles.length > 60) {
          const c = d.candles, i = c.length - 1, ind = L.indicators(c, null), a = ind.atr[i], e50 = ind.e[50][i], px = d.last, vol = px - 2 * a, trend = e50 < px ? e50 : null;
          P.stop = +Math.max(vol, trend || 0).toFixed(2); P.stopWhy = trend && trend > vol ? 'its 50 day average, the trend line a holder of this stock should not see broken' : 'two normal daily moves (ATR) below the current price ' + money(px);
          { const ts = testedStop(entry, c); if (ts) { P.stop = ts.stop; P.stopWhy = 'the tested stop for a buy like this (' + ts.why + ')'; P.stopRule = ts.rule; } }
          if (P.stop > entry) P.stopWhy += '. It is above your entry, so it locks in part of your gain'; else P.stopWhy += '. It is below your entry, so hitting it means accepting a loss of ' + ((1 - P.stop / entry) * 100).toFixed(1) + '%';
          P.stopWhy += '. I will raise it if the stock rises, never lower it.';
        }
      }
      const st = num(/stop\s+(\d+(?:\.\d+)?)/i), tg = num(/target\s+(\d+(?:\.\d+)?)/i); if (st) { P.stop = st; delete P.stopWhy; P.own = true; } if (tg) { P.t1 = tg; P.ownT = true; }
      guideTargets(P); P.mktAtBuy = sig && sig.market ? (sig.market.above50 === false || sig.market.up === false ? 'weak' : 'rising') : null; P.orig = { d: P.since, stop: P.stop || null, t1: P.t1 || null, tmode: P.tmode || null, exitBelow: P.exitBelow || null, kind: P.kind, key: P.key || null, logic: L.LOGIC_VERSION };   // the plan at the buy, archived for honest scoring
      pos[sym] = P;
      if (shares > 0) { const pv = privRead(); pv.buys = (pv.buys || []).concat({ sym, usd: +(shares * entry).toFixed(2), d: ny(Date.now()).d }).slice(-50); pv.shares = pv.shares || {}; pv.shares[sym] = shares;
        const saved = privWrite(pv); out.push('Noted ' + shares + ' shares, about ' + money(shares * entry) + ' USD' + (P.stop ? '; at the stop this position would lose about ' + money(shares * (entry - P.stop)) + ' USD' : '') + '. ' + (saved ? 'Kept encrypted (only your PRIVATE_KEY secret can read it); I learn your usual buy size from it.' : 'Not stored: add the GitHub secret PRIVATE_KEY (any long password) and I will keep share counts encrypted and learn your usual buy size.')); }
      out.push('Tracking ' + posLine(sym, P) + (P.stopWhy ? '\n  Suggested stop ' + money(P.stop) + ': ' + P.stopWhy + ' To change it: stop ' + sym + ' <price>' : P.kind === 'manual' && !P.stop ? '\n  I could not load enough price history to suggest a stop. Send: stop ' + sym + ' <price>' : '') + '\n  I check your positions about every 15 minutes in market hours. Place the stop with your broker too: my alerts can be late.');
      if (P.kind === 'manual') { try { out.push(await secondOpinion(sym, entry, sig, pos)); } catch (e) { } }
      try { out.push(await stockMap(sym, sig, pos, true)); } catch (e) { }
    } else if ((k = text.match(/^(?:i\s+)?sold\s+half\s+([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {
      const sym = k[1].toUpperCase(), P = pos[sym]; if (!P) { out.push('I was not tracking ' + sym + '.'); continue; }
      let exit = k[2] ? +k[2] : null; if (!exit) { const j = await liveQ(sym); exit = +j.price || null; }
      if (exit && P.entry) fs.appendFileSync(MY_TRADES, JSON.stringify({ sym, kind: (P.kind || 'manual'), entry: P.entry, exit, since: P.since || null, out: ny(Date.now()).d, pct: +(exit / P.entry - 1 - MY_COST).toFixed(5), priced: k[2] ? 'you' : 'quote', half: true, lesson: 'Half sold at target 1; the rest runs with a trailing stop.' }) + '\n');
      let news = ''; { const pv = privRead(); if (pv.shares && pv.shares[sym]) { const h = Math.floor(pv.shares[sym] / 2); if (exit && P.entry) { addRealized(pv, sym, h * (exit - P.entry) - 2 * FEE(), ny(Date.now()).d, 'half'); news = goalNews(pv); } pv.shares[sym] -= h; privWrite(pv); } }
      P.trail = true; P.halfSince = ny(Date.now()).d; P.stop = Math.max(P.stop || 0, P.entry); P.own = false; delete P.stopWhy; P.maxHold = 30;
      out.push('Half of ' + sym + ' sold' + (exit ? ' at ' + money(exit) + ' (' + pcs(exit / P.entry - 1) + ')' : '') + '. The rest now has its stop at your buy price ' + money(P.stop) + ': it cannot turn into a loss. I raise the stop every night (3 daily moves under the close) and tell you when to sell the rest. Move the stop at your broker to ' + money(P.stop) + ' now.' + news);
    } else if ((k = text.match(/^(?:i\s+)?sold\s+(?!options?\b)([a-z.\-]{1,6})(?:\s+(?:at\s+)?(\d+(?:\.\d+)?))?/i))) {
      const sym = k[1].toUpperCase(), shTxt = (text.match(/(\d+)\s*shares?\b/i) || [])[1], shSaid = shTxt ? +shTxt : null;
      if (!pos[sym]) {   // already sold today (for example with the Sold button): correct that record with your real price and shares
        const today = ny(Date.now()).d, rows = fs.existsSync(MY_TRADES) ? fs.readFileSync(MY_TRADES, 'utf8').split('\n').filter(Boolean) : [];
        let ix = -1; for (let i = rows.length - 1; i >= 0; i--) { try { const r = JSON.parse(rows[i]); if (r.sym === sym && r.out === today && !r.half && !r.part) { ix = i; break; } } catch (e) {} }
        if (ix < 0 || (!k[2] && !shSaid)) { out.push('I was not tracking ' + sym + '.'); continue; }
        const r = JSON.parse(rows[ix]); if (k[2]) { r.exit = +k[2]; r.pct = +(r.exit / r.entry - 1 - MY_COST).toFixed(5); r.priced = 'you'; }
        rows[ix] = JSON.stringify(r); fs.writeFileSync(MY_TRADES, rows.join('\n') + '\n');
        let msg = sym + ': sale already recorded today. Updated with your price ' + money(r.exit) + ', result ' + pcs(r.pct) + ' after about 0.8% costs.';
        const pv = privRead(), key = sym + '|' + today, was = (pv.soldUsd || {})[key], n = shSaid || (was && was.sh);   // dollars and shares stay only in the encrypted file
        if (n && r.entry) { const usd = n * (r.exit - r.entry) - 2 * FEE() - n * r.entry * 0.002, prev = was ? was.usd : 0;
          addRealized(pv, sym, usd - prev, today, was ? 'correction' : undefined); pv.soldUsd = { ...(pv.soldUsd || {}), [key]: { usd: +usd.toFixed(2), sh: n } }; const news = goalNews(pv); privWrite(pv);
          msg += ' In money: about ' + (usd >= 0 ? '+' : '') + money(usd) + ' USD on ' + n + ' shares (private, encrypted). Since your goals started: ' + (pv.realized - pv.goals.base >= 0 ? '+' : '') + money(pv.realized - pv.goals.base) + ' USD.' + news; }
        out.push(msg); continue; }
      let exit = k[2] ? +k[2] : null; if (!exit) { const j = await liveQ((sym)); exit = +j.price || null; }
      const P = pos[sym]; delete pos[sym];
      if (exit && P.entry) {     // your real trades are the evidence that matters most: every sale is recorded
        const t = { sym, kind: P.kind || 'manual', entry: P.entry, exit, since: P.since || null, out: ny(Date.now()).d, pct: +(exit / P.entry - 1 - MY_COST).toFixed(5), priced: k[2] ? 'you' : 'quote at the time of your message', t1: P.t1 || null, stop: P.stop || null, test: P.test || null, orig: P.orig || null, mkt: { atBuy: P.mktAtBuy || null, atSale: (sig && sig.market) ? (sig.market.above50 === false || sig.market.up === false ? 'weak' : 'rising') : null }, lesson: soldLesson(P, exit) };
        { const md = moodOf(text); if (md || P.mood) t.mood = { buy: P.mood || null, sell: md }; }
        { const nz = sellNoticeBefore(sym, P.since); t.sysSell = nz ? { d: nz.d, why: nz.why } : null; out.push(nz ? 'The system had said SELL on ' + nz.d + ' (' + nz.why + ').' : 'No SELL notice had been sent for ' + sym + ' while you held it: this sale was your own call.'); }
        // LOSS LEDGER: why each losing trade lost (gaps through the stop are the hidden cost to watch)
        if (t.pct <= 0) t.lossType = P.stop && exit < P.stop * 0.995 ? 'sold below the stop (' + pcs(exit / P.stop - 1) + ' past it)' : P.stop && exit <= P.stop * 1.01 ? 'stop hit (normal)' : t.mkt.atSale === 'weak' ? 'sold in a weak market' : P.kind === 'manual' ? 'own pick, sold early' : 'sold on the rule exit or early';
        fs.appendFileSync(MY_TRADES, JSON.stringify(t) + '\n');
        { const pv = privRead(), sh = (pv.shares && pv.shares[sym]) || shSaid; if (sh) { const usd = sh * (exit - P.entry) - 2 * FEE() - sh * P.entry * 0.002; addRealized(pv, sym, usd, t.out); if (pv.shares) delete pv.shares[sym]; pv.soldUsd = { ...(pv.soldUsd || {}), [sym + '|' + t.out]: { usd: +usd.toFixed(2), sh } }; const news = goalNews(pv); privWrite(pv); out.push('In money: about ' + (usd >= 0 ? '+' : '') + money(usd) + ' USD on ' + sh + ' shares (private, encrypted). Since your goals started: ' + (pv.realized - pv.goals.base >= 0 ? '+' : '') + money(pv.realized - pv.goals.base) + ' USD. Send  goals  for the ladder.' + news); }
          else out.push('I do not know how many ' + sym + ' shares you had, so this sale is not in your dollar goals. Send the result in dollars, for example:  pnl -2000 ' + sym); }
        out.push('Sold ' + sym + ' at ' + money(exit) + ' (' + (k[2] ? 'your price' : 'price now; send  sold ' + sym + ' PRICE  next time for your exact fill') + '). Result ' + pcs(t.pct) + ' after about 0.8% costs. Recorded.\nWHY: ' + t.lesson + '\n' + myRecord());
      } else out.push('Stopped tracking ' + sym + '. I could not get a price, so this sale is not in your record. Next time send: sold ' + sym + ' PRICE');
    } else if ((k = text.match(/^focus\s+(on|off)\s*$/i))) { const st = updateSettings(s => { s.focus = k[1].toLowerCase() === 'on'; }); if (!st) out.push(SETTINGS_BAD); else out.push(st.focus ? 'FOCUS ON: ACTIONS shows no engine buys until one has a positive live record; sells, stops, early-wave alerts and your source tips continue.' : 'FOCUS OFF: ACTIONS shows every engine buy again (with the live record caution).');
    } else if ((k = text.match(/^decision\s+([\s\S]{10,600})$/i))) { const st = readSettings(); if (!st) out.push(SETTINGS_BAD); else if (st.decision && st.decision.text && Date.parse(st.decision.due) > Date.now()) out.push('You already wrote your decision on ' + st.decision.set + ' (due ' + st.decision.due + '): ' + st.decision.text + '\nIt stays as written until its date; that is the point of writing it before the result is known.'); else { const set = new Date().toISOString().slice(0, 10), due = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10); st.decision = { text: k[1].trim(), set, due }; if (!updateSettings(s => { if (!(s.decision && s.decision.text && Date.parse(s.decision.due) > Date.now())) s.decision = st.decision; })) out.push(SETTINGS_BAD); else out.push('Saved. Your decision, due ' + due + ': ' + st.decision.text + '\nIt is shown in every Sunday SCOREBOARD with the days left.'); }
    } else if ((k = text.match(/^tier\s*2\s+(on|off)\s*$/i))) { const st = updateSettings(s => { s.tier2 = k[1].toLowerCase() === 'on'; }); if (!st) out.push(SETTINGS_BAD); else out.push(st.tier2 ? 'TRADABLE SMALL is ON: rules that passed their own test (t 2.5+, both halves, higher cost) are shown in their own section at 1,000 USD with a stop, with their own record.' : 'TRADABLE SMALL is OFF: the system is back to proven-only, exactly as before. Its ledger is kept.');
    } else if ((k = text.match(/^quiet\s+(on|off)\s*$/i))) { const st = updateSettings(s => { s.quiet = k[1].toLowerCase() === 'on'; }); if (!st) out.push(SETTINGS_BAD); else out.push(st.quiet ? 'QUIET ON: you get ONE action message each night and morning, plus BUY NOW, stop and target alerts. Research messages are kept in the system and summed up there. Send  quiet off  to get everything again.' : 'QUIET OFF: you get every message again (plan, your stocks, radar paper alerts, movers, smart money, deals, Sunday studies).');
    } else if (/^(themes?|sectors? flow|industr(y|ies)|where is the money)\s*\??\s*$/i.test(text)) { out.push(themesText());
    } else if (/^(skips?|my skips|skipped)\s*\??\s*$/i.test(text)) { out.push(await skipsText());
    } else if (/^(ladder|size level|level)\s*\??\s*$/i.test(text)) { out.push(ladder().text + '\n\nThe ladder: 1,000 USD a trade, then 2,500 (30+ sales on 10+ days, positive, profit factor 1.2+), then 5,000 (80+ sales over 3+ months, profit factor 1.3+), then 10,000 (200+ sales over 6+ months). It steps down one level at once if your last 20 sales lost money. Report every sale ( sold SYM PRICE ) so the ladder can see it.');
    } else if ((k = text.match(/^(?:bought|sold)\s+option\s+([A-Za-z.]{1,6})\s+(\d+(?:\.\d+)?)\s+(\d{4}-\d{2}-\d{2})\s+(\d+(?:\.\d+)?)\s*$/i))) {   // OPTIONS TRIAL: 1 contract, kept apart from stocks
      const sold = /^sold/i.test(text), sym = k[1].toUpperCase(), strike = +k[2], exp = k[3], px = +k[4], OS = readJson('data/options-shadow.json', { open: [], done: [] }); OS.real = OS.real || [];
      if (!sold) { if (OS.real.filter(o => !o.closed).length >= 2) out.push('OPTIONS TRIAL: 2 contracts are already open; that is the limit of the trial. Close one first.');
        else { const lt = (OS.labT || []).find(t => t.sym === sym && t.strike === strike && t.exp === exp); if (lt) { OS.real.push({ d: ny(Date.now()).d, sym, strike, exp, paid: px, cost: +(px * 100 + 5).toFixed(2), rule: lt.rule, sellBy: lt.sellBy }); fs.writeFileSync('data/options-shadow.json', JSON.stringify(OS)); out.push('OPTIONS (rule ' + lt.rule + '): recorded 1 x ' + sym + ' ' + exp + ' ' + strike + ' CALL bought at ' + px.toFixed(2) + ' (' + (px * 100 + 5).toFixed(0) + ' USD with the ZAD fee, the most you can lose). Plan: SELL TO CLOSE on ' + lt.sellBy + ' (the rule\u2019s exit); I remind you that day. Then send  sold option ' + sym + ' ' + strike + ' ' + exp + ' PRICE .'); } else {
        OS.real.push({ d: ny(Date.now()).d, sym, strike, exp, paid: px, cost: +(px * 100 + 5).toFixed(2) }); fs.writeFileSync('data/options-shadow.json', JSON.stringify(OS)); out.push('OPTIONS TRIAL: recorded 1 x ' + sym + ' ' + exp + ' ' + strike + ' CALL bought at ' + px.toFixed(2) + ' (' + (px * 100 + 5).toFixed(0) + ' USD with the ZAD fee, the most you can lose). Plan: SELL TO CLOSE when ' + sym + ' passes ' + (strike * 1.05).toFixed(2) + ' or on ' + new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10) + ', whichever first; never hold it to expiry. Then send  sold option ' + sym + ' ' + strike + ' ' + exp + ' PRICE .'); } } }
      else { const o = OS.real.find(z => !z.closed && z.sym === sym && z.strike === strike && z.exp === exp); if (!o) out.push('OPTIONS TRIAL: no open ' + sym + ' ' + exp + ' ' + strike + ' call recorded.');
        else { o.closed = true; o.out = ny(Date.now()).d; o.got = px; o.pnl = +((px - o.paid) * 100 - 10).toFixed(2); fs.writeFileSync('data/options-shadow.json', JSON.stringify(OS)); const all = OS.real.filter(z => z.closed), tot = all.reduce((a, z) => a + z.pnl, 0);
          out.push('OPTIONS TRIAL: closed ' + sym + ' ' + strike + ' call: ' + (o.pnl >= 0 ? '+' : '') + o.pnl.toFixed(0) + ' USD after fees. Trial record: ' + all.length + ' trade' + (all.length === 1 ? '' : 's') + ', ' + all.filter(z => z.pnl > 0).length + ' won, ' + (tot >= 0 ? '+' : '') + tot.toFixed(0) + ' USD in total. Kept separate from your stock record.'); } }
    } else if (/^(scoreboard|score board)\s*\??\s*$/i.test(text)) { out.push(scoreboardText());
    } else if (/^(progress|is it learning|learning|what did you learn|improve(ment)?s?)\s*\??\s*$/i.test(text)) {   // PROOF OF WORK: what the system tested, rejected, built and scored lately
      const LB = readJson0('data/strategy-library.json'), L = LB && LB.strategies || [], d7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10), d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const tested = (since) => L.filter(e => e.tested && e.tested >= since), t7 = tested(d7), t30 = tested(d30), cnt = (a) => { const o = {}; for (const e of a) { const k = /passed|in use/.test(e.status) ? 'passed' : /rejected|FAILED/.test(e.status) ? 'rejected' : /not proven/.test(e.status) ? 'not proven' : 'other'; o[k] = (o[k] || 0) + 1; } return o; };
      const AL = readJson0('data/autolab.json') || {}, LG = readJson0('data/agent-league.json') || {}, IR = readJson0('data/ignition-results.json') || {}, r8 = IR.record && IR.record['IG8/close'], OS = readJson0('data/options-shadow.json') || {}, TS = readJson0('data/tip-score.json') || {};
      const closest = L.filter(e => e.result && typeof e.result.t === 'number' && !/rejected|FAILED/.test(e.status)).sort((a, b) => b.result.t - a.result.t).slice(0, 3);
      const c7 = cnt(t7), c30 = cnt(t30), queued = L.filter(e => /^queued/.test(e.status)).length;
      let avl = ''; try { const lastPx = {}; for (const x of (readJson0('data/signals.json') || {}).stocks || []) if (x.last) lastPx[x.sym] = x.last; avl = avoidLedger([], lastPx); } catch (e) {}
      out.push(['PROGRESS (proof of work, updated ' + (LB && LB.updated || '') + ')', '', avl, '',
        'Last 7 days: ' + t7.length + ' strategies tested (' + (c7.passed || 0) + ' passed, ' + (c7['not proven'] || 0) + ' not proven, ' + (c7.rejected || 0) + ' rejected). Last 30 days: ' + t30.length + ' tested. Library: ' + L.length + ' strategies, ' + queued + ' queued for the agents.',
        'Autolab: ' + (Object.keys(AL.tried || {}).length) + ' rules tried in total over ' + (AL.weeks || 0) + ' weeks, ' + (AL.last && AL.last.passed || 0) + ' passed last week.',
        'Agent league: ' + (LG.rows ? LG.rows.map(r => r.name.replace(/ - /, ': ') + ' ' + r.points + ' pts').join(' | ') : 'no table yet') + '. Picks frozen weekly; first scores about 17 Nov.',
        'Live paper: early-wave day channel ' + (r8 ? r8.n + ' trades on ' + r8.days + ' days, ' + pcs(r8.avg) + ' a trade' : 'no record') + '. Options lab: ' + ((OS.open || []).length) + ' paper calls open, ' + ((OS.done || []).length) + ' finished' + (OS.cc ? ', covered calls ' + (OS.cc.open || []).length + ' open' : '') + '.',
        'Tip sources: ' + ((TS.fade || []).length ? 'FADE flags on ' + [...new Set((TS.fade || []).map(f => f.src))].join(', ') : 'none flagged yet') + '.',
        closest.length ? 'Closest to passing: ' + closest.map(e => e.id + ' ' + e.name + ' (t ' + e.result.t + ')').join(' | ') : '',
        '', 'What changed for you: every HOLD shows two sell prices; LONGER HOLDS buys; options tickets; the size ladder (send  ladder ). Full notes: the project docs "Agent A/B/C research" and "Changes and decisions".'].filter(x => x !== '' || true).join('\n'));
    } else if (/^(chase|urge|chase card|i want to buy it)\s*\??\s*$/i.test(text)) { out.push(['CHASE CARD. You are looking at a stock that just jumped. Read this first.', '',
        '1. Stocks that jumped 15%+ in one day lagged the average stock by 3.2% over the next month: 3,054 cases, 5 years, dead stocks included, real costs (t -5.1). It is one of the most solid results in the whole system.',
        '2. The ones you remember (TGL, NIVF, GRML) are the lottery winners. For each one there are 50 that faded, halted or reverse-split. You remember the exception.',
        '3. If you buy now you are the exit for people who bought 20 minutes ago with faster data.',
        '4. What to do: put the phone down for 60 minutes. If you still want it, send  check SYM  first. If it still passes nothing, the most the ladder allows for an untested pick is 1,000 USD with a stop at once; better, add the money to SPUS/HLAL (check ZAD).',
        '', 'The urge is the feeling this rule was built to protect you from.'].join('\n'));
    } else if (/^(league|agents|agent league)\s*\??\s*$/i.test(text)) { const LG = readJson0('data/agent-league.json'); out.push(LG && LG.text ? LG.text : 'AGENT LEAGUE: no score yet. The referee runs with the Sunday studies.');
    } else if (/^(strateg(y|ies)|library|strategy library|استراتيجيات)\s*\??\s*$/i.test(text)) { const LB = readJson0('data/strategy-library.json'), L = LB && LB.strategies || [], cnt = {};
      for (const e of L) { const k = /^LIVE/.test(e.status) ? 'passed, now on live paper' : /^FAILED/.test(e.status) || /rejected/.test(e.status) ? 'tested and failed' : /^queued/.test(e.status) ? 'waiting to be tested' : /not proven|^tested/.test(e.status) ? 'tested, not proven / in use' : /live paper|^paper|bred/.test(e.status) ? 'running on paper now' : /not for this system/.test(e.status) ? 'not for this system' : 'needs data / other'; cnt[k] = (cnt[k] || 0) + 1; }
      const near = L.filter(e => e.result && typeof e.result.t === 'number').sort((x, y) => y.result.t - x.result.t).slice(0, 5);
      out.push(!L.length ? 'STRATEGY LIBRARY: not loaded yet.' : 'STRATEGY LIBRARY: ' + L.length + ' named strategies (updated ' + (LB.updated || '') + ')\n' + Object.entries(cnt).map(([k, v]) => '- ' + k + ': ' + v).join('\n') + (near.length ? '\n\nClosest to passing:\n' + near.map(e => '- ' + e.id + ' ' + e.name + ' (t ' + e.result.t + (typeof e.result.edge === 'number' ? ', ' + pcs(e.result.edge) + ' vs an average stock' : '') + ')').join('\n') : '') + '\n\nEvery strategy must pass the same tests before it can reach ACTIONS. Most will fail; that is the filter working.');
    } else if (/^(dips?|fair dips?|cheap|fair price|undervalued|فرص)\s*\??\s*$/i.test(text)) { const Q = readJson0('data/quality.json'), L = Q && Q.dips || [];
      out.push(!L.length ? 'FAIR-PRICE DIPS: none right now (or the Sunday study has not run yet).' : 'FAIR-PRICE DIPS (Sunday ' + String(Q.to || '').slice(0, 10) + '): down 40%+ from the 1-year high, cash flow positive, little dilution, and under the LOW end of their own fair value.\n' + (Q.dipVerdict === 'PROMISING' ? 'The 5-year test PASSED: research list, paper first, check ZAD.' : 'The 5-year test has NOT passed (' + (Q.dipVerdict || 'not run') + '): WATCH LIST ONLY, not a buy list.') + '\n' + L.slice(0, 15).map(d => '- ' + d.sym + ' ' + d.px + ' (down ' + Math.round(d.down * 100) + '%, fair value ' + d.fairLow + ' / ' + d.fairMid + ' / ' + d.fairHigh + ')').join('\n') + '\nFor any of them:  snapshot SYM');
    } else if (/^(health|system health|status)\s*\??\s*$/i.test(text)) { const H = readJson0('data/health.json'); out.push(!H ? 'HEALTH: the first check runs this evening.' : H.problems && H.problems.length ? 'SYSTEM HEALTH (' + String(H.at).slice(0, 16).replace('T', ' ') + ' UTC): ' + H.problems.length + ' problem(s)\n' + H.problems.map(p => '- ' + p).join('\n') + '\nSend this to Claude.' : 'SYSTEM HEALTH: all ' + H.ok + ' parts fine (' + String(H.at).slice(0, 16).replace('T', ' ') + ' UTC).');
    } else if (/^(calendar|economic calendar|events this week|upcoming( events)?|this week)\s*\??\s*$/i.test(text)) { out.push(calendarText(false));
    } else if (/^(rebalance|rebalancing|balance|allocation|weights?)\s*\??\s*$/i.test(text)) { out.push(rebalanceText(readJson('data/signals.json', null)));
    } else if (/^(rebuy|buy back|sell and buy back|buy back lower)\s*\??\s*$/i.test(text)) { out.push(rebuyText());
    } else if (/^(sell|what (to|should i) sell|sell check|why sell|sells?\?|\u0645\u0627\u0630\u0627 \u0623\u0628\u064A\u0639|\u0634\u0646\u0648 \u0623\u0628\u064A\u0639|\u0634\u0646\u0648 \u0627\u0628\u064A\u0639)\s*\??\s*$/i.test(text)) { out.push(await sellCheckText(sig));
    } else if (/^(stops?|my stops|check stops|restudy stops)\s*\??\s*$/i.test(text)) { out.push(await stopsText(sig));
    } else if (/^(opportunit(y|ies)|chances?|all chances|what else|wide|board|\u0641\u0631\u0635)\s*\??\s*$/i.test(text)) { out.push(opportunitiesText(sig, false));
    } else if (/^(scorecard|report cards?|how is the system doing)\s*\??\s*$/i.test(text)) { out.push(scorecardText());
    } else if (/^(missed|missed runners|why missed|runners missed)\s*\??\s*$/i.test(text)) { out.push(missedText());
    } else if (/^(autolab|auto lab|invented|self learning|discoveries)\s*\??\s*$/i.test(text)) { out.push(autolabText());
    } else if (/^(quality|long term|long investing|investing)\s*\??\s*$/i.test(text)) { out.push(qualityText());
    } else if (/^(exits?|exit test|when to sell)\s*\??\s*$/i.test(text)) { out.push(exitsText());
    } else if (/^(research|experiments?|registry|ideas tested)\s*\??\s*$/i.test(text)) { out.push(experimentsText());
    } else if (/^(catalysts|catalyst calendar|run-?ups?|fda dates?)\s*\??\s*$/i.test(text)) { out.push(catalystCalendarText());
    } else if (/^(chains|chain map|hot chains?|hot layers?|value chains?)\s*\??\s*$/i.test(text)) { out.push(chainsText());
    } else if (/^(events?|news study|catalysts?|company news)\s*\??\s*$/i.test(text)) { out.push(eventsText());
    } else if (/^(day ?trades?|fast ?movers?|runners?|fast)\s*\??\s*$/i.test(text)) { out.push(fastText());
    } else if (/^(news ?watch|my news|news alerts?|threats?)\s*\??\s*$/i.test(text)) { out.push(newsText());
    } else if (/^(paper|alpaca|paper account)\s*\??\s*$/i.test(text)) { out.push(await paperText());
    } else if (/^(shadow|track ?record|forward)\s*\??\s*$/i.test(text)) { out.push(shadowText());
    } else if (/^(days?|weekdays?|day of (the )?week|best day|monday)\s*\??\s*$/i.test(text)) { out.push(dowText());
    } else if (/^(timing|when|when to (buy|sell|trade)|pre ?market|after ?hours|post ?market)\s*\??\s*$/i.test(text)) { out.push(timingText());
    } else if (/^(actions?|what to do|todo)\s*$/i.test(text)) { out.push(await hotList(sig));
    } else if (/^(goals?|targets?|milestones?|my goals?|plan my goals|timeline)\s*$/i.test(text)) { out.push(goalsText());
    } else if ((k = text.match(/^(?:size|buy size|per buy)\s+\$?(\d+(?:\.\d+)?)\s*(?:usd|\$)?\s*$/i))) { const pv = privRead(); pv.buyUSD = +k[1]; out.push(privWrite(pv) ? 'Your buy size is now ' + money(+k[1]) + ' USD per recommendation (private, encrypted). Plans show shares for this amount, scaled down for weaker evidence or wide stops. Send  goals  for the timeline.' : 'Not stored: add the GitHub secret PRIVATE_KEY first.');
    } else if (/^budget\s+(open|off|none|no limit|unlimited)\s*$/i.test(text)) { const pv = privRead(); pv.budget = 0; pv.budgetOpen = true; out.push(privWrite(pv) ? 'Budget is OPEN: no budget limit. Every proven buy is listed every day; you decide which to take. Size still follows the evidence: 1,000 USD minimum, up to 2,000 / 3,000 / 5,000 USD when the evidence is strong (your 6 USD buy+sell fee is already in every number). To set a limit again:  budget 8000' : 'Not stored: add the GitHub secret PRIVATE_KEY first.');
    } else if ((k = text.match(/^budget\s+\$?(\d+(?:\.\d+)?)\s*(?:usd|\$)?\s*$/i))) { const pv = privRead(); pv.budget = +k[1]; out.push(privWrite(pv) ? 'Your trading budget is ' + money(+k[1]).replace(/\.00$/, '') + ' USD (private, encrypted). Each buy gets 1,000 to 5,000 USD by the strength of its evidence, and the plan shows how much room is left after your open stocks.' : 'Not stored: add the GitHub secret PRIVATE_KEY first.');
    } else if ((k = text.match(/^trades\s+(\d+)\s*(?:a month|per month|monthly)?\s*$/i))) { const pv = privRead(); pv.tradesPerMonth = +k[1]; out.push(privWrite(pv) ? 'Planning with ' + k[1] + ' trades a month. Send  goals  for the timeline.' : 'Not stored: add the GitHub secret PRIVATE_KEY first.');
    } else if ((k = text.match(/^pnl\s+([+-]?\d+(?:\.\d+)?)\s*([a-z.\-]{1,6})?\s*$/i))) {
      const pv = privRead(), usd = +k[1], sym = (k[2] || 'manual').toUpperCase(); addRealized(pv, sym, usd, ny(Date.now()).d, 'you'); const news = goalNews(pv);
      out.push(privWrite(pv) ? 'Recorded ' + (usd >= 0 ? '+' : '') + money(usd) + ' USD' + (k[2] ? ' for ' + sym : '') + ' (private, encrypted).\n\n' + goalsText() + news : 'Not stored: add the GitHub secret PRIVATE_KEY first.');
    } else if ((k = text.match(/^(?:stops?\s+(?:placed|set|done|in)|placed\s+stops?)(?:\s+([a-z.\-]{1,6}))?\s*$/i))) {   // you confirm the stop is placed at your broker
      const list = k[1] ? [k[1].toUpperCase()] : Object.keys(pos); const done = [];
      for (const sy of list) if (pos[sy]) { pos[sy].stopOk = { price: pos[sy].stop || null, d: ny(Date.now()).d }; done.push(sy + (pos[sy].stop ? ' ' + money(pos[sy].stop) : ' (no stop set!)')); }
      out.push(done.length ? 'Stop confirmed at your broker: ' + done.join(', ') + '. If you move a stop later, send  stop SYM PRICE  and then  stop placed SYM  again.' : 'I am not tracking ' + (k[1] || 'any stock') + '.');
    } else if ((k = text.match(/^(stop|target)\s+([a-z.\-]{1,6})\s+(\d+(?:\.\d+)?)/i))) {
      const sym = k[2].toUpperCase(); if (!pos[sym]) { out.push('I am not tracking ' + sym + '. Send: bought ' + sym + ' <price>'); continue; }
      const mine = k[1].toLowerCase() === 'stop';
      if (mine) { pos[sym].stop = +k[3]; delete pos[sym].stopWhy; pos[sym].own = true; } else pos[sym].t1 = +k[3];      // a stop you set yourself is yours: it is never moved by the bot
      out.push('Updated ' + posLine(sym, pos[sym]) + (mine ? '\n  This is now your own stop. I will not raise or change it; I only alert you if the price reaches it. Place it with your broker too.' : ''));
    } else if (/^(positions?|status|list)\b/i.test(text)) {
      const syms = Object.keys(pos); out.push(syms.length ? 'Your tracked positions:\n' + syms.map(x => posLine(x, pos[x])).join('\n') : 'No positions tracked. Send: bought VRTX 500.55');
    } else if (/^(help|commands?|\?)\s*$/i.test(text)) out.push(HELP);
    else out.push(await hotList(sig) + '\n\nYou do not need commands. Write anything, a ticker, or forward a post, and I will study it. Send  help  for the full list.');
  }
  fs.writeFileSync('data/tg-state.json', JSON.stringify(state)); savePos(pos);
  if (out.length) await telegram(out.join('\n\n'));
  if (ups.length) console.log('Telegram: ' + ups.length + ' message(s) read');
}

// ---- Followed channels: public YouTube feeds of channels you choose. Every stock a channel names in a video title or description
// is logged under that channel's name, checked by the tested rules, and scored over time. Titles and descriptions only; no video is watched.
const YT = local(env.YT_BASE) || 'https://www.youtube.com', CH_FILE = 'data/channels.json';
const readChannels = () => { const a = readJson(CH_FILE, []); return Array.isArray(a) ? a.filter(c => c && /^UC[\w-]{20,24}$/.test(c.id || '')) : []; };
const unxml = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const FUNDS = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UVXY', 'VXX', 'VIX', 'SPX', 'NDX', 'DJI', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC', 'GLD', 'SLV', 'USO', 'TLT', 'IBIT']);   // index and sector funds are market talk, not a stock tip
function tickersIn(text, known) {
  const found = new Set(), add = (x) => { if (x && x.length > 1 && !NOT_TICKERS.has(x) && !FUNDS.has(x)) found.add(x); };
  for (const m of text.matchAll(/\$([A-Z]{1,5})\b/g)) add(m[1]);                                   // $NVDA
  for (const m of text.matchAll(/\b(?:NASDAQ|NYSE|AMEX)\s*:\s*([A-Z]{1,5})\b/g)) add(m[1]);      // NASDAQ: NVDA
  for (const m of text.matchAll(/\(([A-Z]{2,5})\)/g)) add(m[1]);                                   // (NVDA)
  for (const m of text.matchAll(/\b[A-Z]{2,5}\b/g)) if (known.has(m[0])) add(m[0]);               // a bare word counts only if it is a stock the system already knows
  return [...found].slice(0, 5);
}
// Reads a channel's newest videos. With a YT_KEY secret it uses YouTube's official Data API (the permitted route from a server);
// without one it falls back to the public feed, which YouTube often refuses to cloud servers.
const YTAPI = local(env.YTAPI_BASE) || 'https://www.googleapis.com';
async function ytFeed(id) {
  if (env.YT_KEY) {
    try {
      const r = await fetch(YTAPI + '/youtube/v3/playlistItems?part=snippet&maxResults=8&playlistId=UU' + id.slice(2) + '&key=' + encodeURIComponent(env.YT_KEY));
      if (!r.ok) return { ok: false, status: r.status, via: 'YouTube Data API' };
      const items = (((await r.json()).items) || []).map(x => x.snippet || {}).map(x => ({ title: String(x.title || ''), desc: String(x.description || ''), pub: Date.parse(x.publishedAt || ''), channel: String(x.channelTitle || '') }));
      return { ok: true, items, channel: (items[0] || {}).channel || '', via: 'YouTube Data API' };
    } catch (e) { return { ok: false, status: -1, via: 'YouTube Data API' }; }
  }
  const H = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', 'Accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };
  let status = 0;
  for (let t = 0; t < 2; t++) {
    try { const r = await fetch(YT + '/feeds/videos.xml?channel_id=' + id, { headers: H }); status = r.status;
      if (r.ok) { const xml = await r.text(), items = xml.split('<entry>').slice(1, 9).map(e => ({ title: unxml((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), desc: unxml((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1]), pub: Date.parse((e.match(/<published>([^<]+)<\/published>/) || [])[1] || '') }));
        return { ok: true, items, channel: unxml((xml.match(/<author>\s*<name>([\s\S]*?)<\/name>/) || [])[1] || ''), via: 'public feed' }; } } catch (e) { status = -1; }
    await sleep(FAST ? 0 : 2500);
  }
  return { ok: false, status, via: 'public feed' };
}
async function channelMentions(known, now) {
  const out = [], chans = readChannels().slice(0, 12); let ok = 0;
  for (const ch of chans) {
    try {
      const f = await ytFeed(ch.id); if (!f.ok) { console.log('YouTube (' + f.via + ') for ' + ch.name + ' answered ' + f.status); continue; } ok++;
      for (const e of f.items) {
        if (!(now - e.pub < 3 * 86400000)) continue;
        const title = e.title, desc = e.desc.slice(0, 1500);
        for (const sym of tickersIn(title + ' ' + desc, known)) if (!out.some(o => o.sym === sym && o.name === ch.name)) out.push({ sym, name: ch.name, title: title.slice(0, 90) });
      }
    } catch (e) {}
    await sleep(FAST ? 0 : 500);
  }
  return { mentions: out.slice(0, 12), channels: chans.length, ok };
}

// ---- Crowd radar: the stocks Reddit's trading forums mention most (ApeWisdom's free public feed). The crowd is a LEAD, not a signal:
// each name is run through the same tested rules, only the ones with tested support are shown, and the crowd itself is scored.
const AW = local(env.AW_BASE) || 'https://apewisdom.io';
async function crowdList() {
  try {
    const r = await fetch(AW + '/api/v1.0/filter/all-stocks/page/1', { headers: { Accept: 'application/json', 'User-Agent': 'Stock-2 personal research scanner (one request a day)' } }); if (!r.ok) return null;
    const skip = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'UVXY', 'VIX']);
    const rows = (((await r.json()).results) || []).filter(x => /^[A-Z]{1,5}$/.test(x.ticker || '') && !skip.has(x.ticker)).map(x => ({ sym: x.ticker, mentions: +x.mentions || 0, was: +x.mentions_24h_ago || 0 }));
    if (!rows.length) { console.log('crowd radar: the feed answered but no tickers were recognised'); return null; }
    const top = rows.slice(0, 5), surge = rows.filter(x => !top.includes(x) && x.mentions >= 15 && x.was > 0 && x.mentions >= 2 * x.was).sort((a, b) => b.mentions / b.was - a.mentions / a.was).slice(0, 4);
    return [...top, ...surge.map(x => ({ ...x, surge: true }))];
  } catch (e) { return null; }
}

// ---- LEADERS: ride the strongest stocks. The rule has no tuned settings: rank by 6-month gain, keep only stocks above their rising
// 50 and 200 day averages while the S&P 500 is above its own 200 day average, buy at the next open, and trail a stop three normal
// daily moves (ATR) under the close. It is tested on ALL stocks of the fixed list together, with at most five held at a time.
const LEAD_COST = 0.008;   // round trip, same as the fair test and the ledger rule: 3 USD + 3 USD on a 1,000 USD buy plus the spread (was 0.4% until 18 Oct 2026)
const LEAD_FILE = 'data/leaders.json', LEADCFG = { N: 5, LOOK: 126, ATR: 3 }, LEAD_PIN = '126-3';   // the version the fair test was set up to judge
// SELF-TUNING. Nine versions of the one rule (strength measured over 3, 6 or 12 months; stop 2, 3 or 4 daily moves wide) are
// re-tested every night. A version is usable only if it made money overall AND in the last two years. The one in use changes only
// when another is clearly better on the OLDER years, so the choice is never made on the same data it is then judged by.
const LEAD_VARIANTS = [63, 126, 252].flatMap(LOOK => [2, 3, 4].map(ATR => ({ LOOK, ATR }))), leadKey = (v) => v.LOOK + '-' + v.ATR;
const leadName = (v) => 'strength over ' + Math.round(v.LOOK / 21) + ' months, stop ' + v.ATR + ' normal daily moves under the close';
{ const k = (readJson0(LEAD_FILE) || {}).rule, v = LEAD_VARIANTS.find(x => leadKey(x) === k); if (v) Object.assign(LEADCFG, v); }   // keep using last night's choice until tonight's test
function leadersPick(loaded, spy, btSet, current) {
  const cut = spy[Math.max(0, spy.length - 505)].d, res = [];
  for (const v of LEAD_VARIANTS) {
    Object.assign(LEADCFG, v);
    const r = leadersCalc(loaded, spy, btSet), early = r.done.filter(x => x.d < cut).map(x => x.pct), late = r.done.filter(x => x.d >= cut).map(x => x.pct);
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, m = mean(early), sd = Math.sqrt(mean(early.map(x => (x - m) ** 2)));
    res.push({ key: leadKey(v), v, r, ts: early.length >= 20 && sd > 0 ? m / sd * Math.sqrt(early.length) : -9, ok: Boolean(r.bt && r.bt.avg > 0 && r.bt.second > 0 && late.length >= 8 && mean(late) > 0) });
  }
  const ok = res.filter(x => x.ok).sort((a, b) => b.ts - a.ts), cur = res.find(x => x.key === current) || res.find(x => x.key === '126-3');
  // The whole-market FAIR test (dead stocks included) outranks this nightly test on 79 of today's well-known stocks, which flatters
  // the past. While the pre-registered version (6 months, 3 daily moves) passes the fair test, it stays in use; the nightly test may
  // not switch to a version the fair test has not passed.
  const FT = readJson0('data/leaders-study.json'), fr = FT && (FT.rows || []).find(r => r.key === LEAD_PIN), fb = fr && fr.test && fr.test.base;
  const pinOk = Boolean(fb && fb.n >= 30 && fb.avg > 0 && (fb.pf || 0) > 1.2 && (fb.spy === null || fb.avg > fb.spy) && !(fb.bestShare > 0.5)), pinned = pinOk ? res.find(x => x.key === LEAD_PIN) : null;
  const pick = pinned || (cur.ok && (!ok.length || ok[0].ts < cur.ts + 0.5) ? cur : ok[0] || cur);
  Object.assign(LEADCFG, pick.v);
  return { ...pick.r, rule: pick.key, was: cur.key, tried: res.length, passed: ok.length };
}
function leadersCalc(loaded, spy, btSet) {
  const T = spy.length, tOf = new Map(spy.map((k, t) => [k.d, t])), spyE = L.indicators(spy, null).e[L.CFG.TREND], S = {}, COST = LEAD_COST;
  for (const sym of Object.keys(loaded)) {
    if (sym === 'SPY' || FUNDS.has(sym)) continue;
    const c = loaded[sym].candles; if (c.length < 260) continue;
    const ind = L.indicators(c, null), at = new Int32Array(T).fill(-1);
    for (let i = 0; i < c.length; i++) { const t = tOf.get(c[i].d); if (t !== undefined) at[t] = i; }
    S[sym] = { c, ind, at };
  }
  const elig = (sym, t) => {
    const x = S[sym], i = x.at[t]; if (i < 200) return null;
    const c = x.c, px = c[i].c, e50 = x.ind.e[50][i], e200 = x.ind.e[L.CFG.TREND][i], a = x.ind.atr[i];
    if (!(px >= 5) || !(a > 0) || !(px > e50 && e50 > e200)) return null;
    let dv = 0; for (let k = i - 19; k <= i; k++) dv += c[k].c * c[k].v; if (dv / 20 < L.CFG.MIN_DOLLAR_VOL) return null;
    if (i <= LEADCFG.LOOK) return null;
    const mom = px / c[i - LEADCFG.LOOK].c - 1; if (!(mom > 0)) return null;
    return { sym, i, mom, px, a, e50 };
  };
  const rank = (t, only) => Object.keys(S).filter(x => !only || only.has(x)).map(x => elig(x, t)).filter(Boolean).sort((a, b) => b.mom - a.mom);
  // the past test
  const open = [], done = [], t0 = Math.max(330, T - 2520);
  for (let t = t0; t < T - 1; t++) {
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], x = S[p.sym], i = x.at[t]; if (i < 0 || i < p.i0) continue;
      const cl = x.c[i].c;
      if (cl < p.stop || cl < x.ind.e[50][i]) { if (i + 1 < x.c.length) { const ex = x.c[i + 1].o, tx = tOf.get(x.c[i + 1].d); done.push({ sym: p.sym, d: p.d, pct: ex / p.entry - 1 - COST, days: i + 1 - p.i0, spy: tx !== undefined ? spy[tx].o / spy[p.t].o - 1 : null }); open.splice(k, 1); } }
      else p.stop = Math.max(p.stop, cl - LEADCFG.ATR * x.ind.atr[i]);
    }
    if (open.length < LEADCFG.N && spy[t].c > spyE[t]) for (const r of rank(t, btSet)) {
      if (open.length >= LEADCFG.N) break;
      if (open.some(p => p.sym === r.sym)) continue;
      const c = S[r.sym].c; if (r.i + 1 >= c.length) continue;
      const en = c[r.i + 1].o; if (en > r.px + 0.5 * r.a || en <= r.px - LEADCFG.ATR * r.a) continue;    // opened above the buy range, or already under the stop: skipped, as you would
      const te = tOf.get(c[r.i + 1].d); if (te === undefined) continue;
      open.push({ sym: r.sym, entry: en, i0: r.i + 1, stop: r.px - LEADCFG.ATR * r.a, d: c[r.i + 1].d, t: te });
    }
  }
  let bt = null;
  if (done.length >= 30) {
    done.sort((a, b) => a.d < b.d ? -1 : 1);
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0, w = done.filter(x => x.pct > 0), l = done.filter(x => x.pct <= 0), h = Math.floor(done.length / 2);
    const days = done.map(x => x.days).sort((a, b) => a - b), sp = done.filter(x => x.spy !== null), years = (Date.parse(spy[T - 1].d) - Date.parse(spy[t0].d)) / 31557600000;
    const growth = done.reduce((g, x) => g * (1 + x.pct / LEADCFG.N), 1);
    bt = { n: done.length, from: spy[t0].d.slice(0, 4), win: w.length / done.length, avgWin: avg(w.map(x => x.pct)), avgLoss: avg(l.map(x => x.pct)), avg: avg(done.map(x => x.pct)), medDays: days[Math.floor(days.length / 2)],
      spy: sp.length ? avg(sp.map(x => x.spy)) : null, first: avg(done.slice(0, h).map(x => x.pct)), second: avg(done.slice(h).map(x => x.pct)), worst: Math.min(...done.map(x => x.pct)), best: Math.max(...done.map(x => x.pct)),
      perYear: Math.pow(growth, 1 / years) - 1, spyYear: Math.pow(spy[T - 1].c / spy[t0].c, 1 / years) - 1, stocks: Object.keys(S).filter(x => btSet.has(x)).length };
  }
  return { S, bt, done, marketOk: spy[T - 1].c > spyE[T - 1], ranked: rank(T - 1, null) };
}
const leadEvidence = (b) => !b ? 'Past test: too few trades to judge.' : 'Past test, ' + b.stocks + ' large stocks together since ' + b.from + ', five held at a time: ' + b.n + ' trades, ' + Math.round(b.win * 100) + '% won. Winners averaged +' + (b.avgWin * 100).toFixed(1) + '%, losers ' + (b.avgLoss * 100).toFixed(1) + '%, all trades ' + (b.avg >= 0 ? '+' : '') + (b.avg * 100).toFixed(2) + '% each after costs'
  + (b.spy !== null ? ' (S&P 500 over the same days ' + (b.spy >= 0 ? '+' : '') + (b.spy * 100).toFixed(2) + '%)' : '') + '. Typical hold ' + b.medDays + ' sessions. Earlier half ' + (b.first * 100).toFixed(2) + '%, later half ' + (b.second * 100).toFixed(2) + '% a trade. Whole account about ' + (b.perYear * 100).toFixed(0) + '% a year against ' + (b.spyYear * 100).toFixed(0) + '% for the S&P 500. Best trade +' + Math.round(b.best * 100) + '%, worst ' + Math.round(b.worst * 100) + '%.'
  + '\nCaution: the test list is today’s well-known companies, which flatters the past. The paper record below, counted from now on, is the honest test.';
// The paper ledger's summary: what decides profit is the size of winners against losers, not the share of winners.
function leadLedger(dn) {
  const w = dn.filter(p => p.pct > 0), l = dn.filter(p => p.pct <= 0), sum = (a) => a.reduce((x, p) => x + p.pct, 0), pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
  let eq = 0, peak = 0, dd = 0; for (const p of dn) { eq += p.pct / LEADCFG.N; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return ' Winners averaged ' + (w.length ? pc(sum(w) / w.length) : 'none yet') + ', losers ' + (l.length ? pc(sum(l) / l.length) : 'none yet') + '. Profit factor ' + (l.length && sum(l) < 0 ? (sum(w) / -sum(l)).toFixed(2) : 'not yet measurable') + ' (above 1 means it earns). Best ' + pc(Math.max(...dn.map(p => p.pct))) + ', worst ' + pc(Math.min(...dn.map(p => p.pct))) + '. Deepest fall of the paper account ' + (dd * 100).toFixed(1) + '%.' + (dn.length < 20 ? ' Under 20 finished trades: too few to judge.' : '');
}
const leadLine = (r) => r.sym + ': BUY ' + money(r.buyLo) + ' to ' + money(r.buyHi) + ' | STOP ' + money(r.stop) + ' | SELL when it closes under its trailing stop or its 50 day average (now ~' + money(r.e50) + ') | trend trade, weeks';
const leadersText = () => { const s = readJson(LEAD_FILE, null); return s && s.text ? s.text : 'The LEADERS list is built by the nightly scan. None has run on this version yet; it arrives after tonight’s close.'; };

// NIGHTLY STOP RAISE for one of your positions (moved out of daily() unchanged on 22 Oct so the regression tests can reach it).
// P: the position (changed in place), c: daily candles, ind: L.indicators(c), i: the last candle.
function stopWhyNow(P) {   // keeps the "above/below your entry" part of the reason true after a raise (PR, 23 Oct: stop 23.45 over entry 22.40 still said "a loss of 1.8%")
  if (!P.stopWhy || !(P.entry > 0) || !(P.stop > 0)) return; const base = P.stopWhy.replace(/\. It is (now )?(above|below) your entry[^.]*\.\d*%?[^.]*/, '').replace(/\. I will raise it.*$/, '');
  const g = Math.abs(P.stop / P.entry - 1) * 100;
  P.stopWhy = base + (P.stop > P.entry ? '. It is now above your entry, so it locks in a gain of ' + g.toFixed(1) + '%' : '. It is below your entry, so hitting it means accepting a loss of ' + g.toFixed(1) + '%') + '. I will raise it if the stock rises, never lower it.';
}
function nightlyStopRaise(P, c, ind, i) {
  if (P.stopWhy && !P.own && c.some(k => k.d > P.since)) { const a = ind.atr[i], e50 = ind.e[50][i], ns = +Math.max(c[i].c - 2 * a, e50 < c[i].c ? e50 : 0).toFixed(2); if (ns > P.stop && c[i].c > P.stop) { P.stop = ns; P.raised = c[i].d; stopWhyNow(P); } }
  if (P.kind === 'leader' && P.stop && !P.own && c.some(k => k.d > P.since)) { const ns = +(c[i].c - LEADCFG.ATR * ind.atr[i]).toFixed(2); if (ns > P.stop && c[i].c > P.stop) { P.stop = ns; P.raised = c[i].d; } }
  if (P.trail && P.stop && !P.own) { const ns = +(c[i].c - 3 * ind.atr[i]).toFixed(2); if (ns > P.stop && c[i].c > P.stop) { P.stop = ns; P.raised = c[i].d; } }   // the running half: stop trails 3 daily moves under the close
}
// MERGE, NOT OVERWRITE (audit 22 Oct): the scan runs for a long time while the bot records buys, sales and stops. Re-read the file and
// apply only the fields this job changed; a position sold meanwhile stays sold, a new one stays, a stop the owner changed stays his.
// FIX (review S-1, 22 Oct): the bot runs on another runner, so its trades reach this job only through git; the local file is this job's
// own hours-old checkout. The base is now the NEWEST copy on origin/main (git fetch + git show), the local file only when git fails.
function latestPositions() {
  try { const o = { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 };
    execSync('git fetch -q origin main', o); const j = JSON.parse(execSync('git show origin/main:' + POS_FILE, { ...o, maxBuffer: 64 << 20 }).toString());
    if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch (e) { console.log('positions merge: origin copy not readable (' + String(e.message).split('\n')[0].slice(0, 120) + '), using the local file'); }
  return readJson(POS_FILE, {});
}
function mergeNightlyPositions(POS_AT_LOAD, myPos) {
  const fresh = latestPositions(), F = ['stop', 'raised', 'exitBelow', 'exitFlag', 't1', 't2', 'tmode', 'tnote', 'tChecked', 'dist0'];
  for (const sym of Object.keys(fresh)) { const a = POS_AT_LOAD[sym], b = myPos[sym], f = fresh[sym]; if (!a || !b || a.entry !== f.entry || a.since !== f.since) continue;
    for (const k of F) { if (JSON.stringify(f[k]) !== JSON.stringify(a[k])) continue; if (b[k] === undefined) delete f[k]; else f[k] = b[k]; } }
  savePos(fresh); for (const k of Object.keys(myPos)) if (!fresh[k]) delete myPos[k]; Object.assign(myPos, fresh);
}
async function daily() {
  const now = Date.now(), loaded = {}, errors = [];
  await tgCommands(readJson('data/signals.json', null));
  const myPos = loadPos(), POS_AT_LOAD = JSON.parse(JSON.stringify(myPos)), myLines = [], posVerdict = {};
  for (const x of Object.keys(myPos)) if (!LIST.includes(x)) LIST.push(x);
  const crowd = env.NO_CROWD ? null : await crowdList();
  if (crowd) for (const x of crowd) if (!LIST.includes(x.sym)) LIST.push(x.sym);
  const chan = await channelMentions(new Set([...LIST, ...QEXTRA, ...DISC]), now);
  for (const x of chan.mentions) if (!LIST.includes(x.sym)) LIST.push(x.sym);
  for (const sym of LIST) {
    const j = await td('/time_series?symbol=' + encodeURIComponent(sym) + '&interval=1day&outputsize=4000&order=ASC');
    if (j.status === 'error' || !j.values) { errors.push(sym); continue; }
    const all = j.values.map(v => ({ d: v.datetime.slice(0, 10), o: +(+v.open).toFixed(4), h: +(+v.high).toFixed(4), l: +(+v.low).toFixed(4), c: +(+v.close).toFixed(4), v: Math.round(+v.volume || 0) })).sort((a, b) => a.d < b.d ? -1 : 1);
    if (adjustSplits(sym, all, await splitsFor(sym, all))) console.log('split adjusted: ' + sym);
    loaded[sym] = { candles: all.filter(c => barClosed(c.d, now)), last: all[all.length - 1].c };
  }
  const WIDE = new Set();
  { const t0 = Date.now(), ws = await wideUniverse(new Set(LIST));
    if (ws.length) { const n = await loadWide(ws, loaded, now); for (const x of ws) if (loaded[x]) { WIDE.add(x); LIST.push(x); } console.log('whole market:', n, 'of', ws.length, 'liquid companies loaded in', Math.round((Date.now() - t0) / 1000), 's'); } }
  if (!loaded.SPY) { await telegram('Stock scanner: could not load market data today (' + errors.length + ' errors). Check the TWELVE_KEY secret.'); process.exit(1); }
  const spy = loaded.SPY.candles, session = spy[spy.length - 1].d, prev = readJson('data/signals.json', null);
  saveSpyCloses(spy);   // review S-3: the scoreboard's S&P 500 figures
  if (prev && prev.session === session && !env.FORCE) { console.log('No new session since ' + session + ' (weekend or holiday). Nothing sent.'); return; }
  const mkt = L.marketMap(spy), mktUp = mkt[session].up, mom6 = spy[spy.length - 1].c / spy[spy.length - 127].c - 1;
  const models = readJson('data/models.json', {});
  const journal = fs.existsSync('data/journal.jsonl') ? fs.readFileSync('data/journal.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const uni = [];
  const VR = L.volRegime ? L.volRegime(spy) : { known: false, mult: 1 }, VOLM = VR.mult;
  const stocks = [], fresh = [], exits = [], openTrades = [], results = [], horizons = {}, picks = [], quick = [], DOWS = { older: [0, 1, 2, 3, 4].map(() => [0, 0]), newer: [0, 1, 2, 3, 4].map(() => [0, 0]) }, MDAY = { older: {}, newer: {} }, addMday = (md) => { if (md) for (const h of ['older', 'newer']) for (const [k, x] of Object.entries(md[h] || {})) { const y = MDAY[h][k] || (MDAY[h][k] = [0, 0]); y[0] += x[0]; y[1] += x[1]; } }, TIM = { older: { openIn: [0, 0], closeIn: [0, 0], openOut: [0, 0], closeOut: [0, 0] }, newer: { openIn: [0, 0], closeIn: [0, 0], openOut: [0, 0], closeOut: [0, 0] } }, qFin = [], blocked = [], wk = [], famRes = {}, live = {};
  // LESSONS: every finished live paper trade is reviewed: how it ended, how far it ran up before it ended, and whether it
  // reached its first target. Grouped by the exact rule that produced it. A rule whose live record turns negative
  // (10+ trades) is DEMOTED: its signals stay on paper and are no longer offered as BUY until the live record recovers.
  const PREV_LESSONS = readJson('data/lessons.json', { rules: {} });
  const weak = [];
  const refLine = (sym, d) => {
    if (myPos[sym]) return;   // already held: it is tracked under YOUR POSITIONS, not offered again
    const r = L.refPlan ? L.refPlan(d.candles, d.last) : null; if (!r) return;
    const o = L.refOdds ? L.refOdds(d.candles) : null;
    if (o && o.won < 0.25) { weak.push(sym + ' ' + Math.round(o.won * 100) + '%'); return; }   // the marker came first too rarely: this plan loses on average
    picks.push({ tier: r.extended ? 3 : 2, text: sym + ' closed ' + money(d.last) + ' (reference, not tested)\n  ' + (r.extended ? 'wait for a pullback, then buy ' : 'buy range ') + money(r.lo) + ' to ' + money(r.hi) + '\n  stop ' + money(r.stop) + ', reward marker ' + money(r.target) + (r.exit ? ', exit on a close below ~' + money(r.exit) : '')
      + (o ? '\n  marker reached before the stop in ' + Math.round(o.won * 100) + '% of ' + o.cases + ' past cases' + (o.cases < 100 ? ' (few cases, weak evidence)' : '') : '\n  too little history to count how often this worked') });
  };

  for (const sym of LIST) {
    const d = loaded[sym]; if (!d) continue;
    const only = QONLY.has(sym);
    if (d.candles.length < 600) { if (DISC.has(sym)) refLine(sym, d); continue; }
    const c = d.candles, i = c.length - 1, ind = L.indicators(c, mkt), T = L.trendStats(c, ind, mom6), halal = myHalal(sym);
    if (!only && !WIDE.has(sym) && i > 140) { const e2 = ind.e[L.CFG.TREND], e5 = ind.e[50], j = i - 5; wk.push({ sym, chg: c[i].c / c[j].c - 1, up: T.up, wasUp: c[j].c > e2[j] && e5[j] > e2[j] && c[j].c / c[j - 126].c - 1 > 0 }); }
    if (myPos[sym]) {   // your own position: end-of-day checks
      nightlyStopRaise(myPos[sym], c, ind, i);
      if (/your entry/.test(myPos[sym].stopWhy || '')) stopWhyNow(myPos[sym]);   // also repairs a reason left stale by an earlier raise
      const P = myPos[sym], held = c.filter(k => k.d > P.since).length, flags = [];
      if (P.kind === 'leader' && held >= 1 && c[i].c < ind.e[50][i]) flags.push('LEADER EXIT: it closed under its 50 day average, the trend is broken. Sell at the next open.');
      if (P.kind === 'entry' && c[i].d >= P.since && !(P.stop && c[i].c <= P.stop)) {
        const vv = !P.exitMA && P.key && L.VARIANTS ? L.VARIANTS.find(x => L.vkey(x) === P.key) : null, lv = P.exitMA ? c.slice(-P.exitMA).reduce((a, x) => a + x.c, 0) / P.exitMA : vv && L.sellLevel ? L.sellLevel({ v: vv }, c, ind) : P.exitBelow;
        if (lv) P.exitBelow = +lv.toFixed(2);
        if (vv && L.exitAt ? L.exitAt(ind, c, vv, i) : (lv && c[i].c < lv)) flags.push('SWING TRADE EXIT: it closed under ~' + money(P.exitBelow) + ', the tested exit line. Sell at the next open.'); }
      if (P.stop && c[i].c <= P.stop) flags.push('CLOSED AT OR BELOW YOUR STOP ' + money(P.stop) + '. Sell / reassess at the next open.');
      if (P.src === 'try small' && held >= (P.tryHold || 63)) flags.push('TRY SMALL TIME EXIT: ' + (P.tryHold || 63) + ' sessions have passed. Sell at the next open.');
      if (held >= 1 && P.t1 && c[i].h >= P.t1) flags.push('Target 1 ' + money(P.t1) + ' was reached today.');
      const gapT = P.q === 'gap', hit = gapT ? c[i].c < ind.sma5[i] : c[i].c > ind.sma5[i];
      if (P.trail) { if (c.filter(k => k.d > (P.halfSince || P.since)).length >= 30) flags.push('RUNNING HALF TIME EXIT: 30 sessions have passed. Sell the rest at the next open.'); }
      else if (P.kind === 'quick' && held >= 1 && hit) flags.push('QUICK TRADE EXIT: it closed ' + (gapT ? 'below' : 'above') + ' its 5 day average. Sell at the next open.');
      else if ((P.kind === 'quick' || P.kind === 'radar' || (P.kind === 'entry' && P.maxHold)) && held >= (P.maxHold || 5)) flags.push((P.kind === 'radar' ? 'EARLY-WAVE' : P.kind === 'entry' ? 'SWING TRADE' : 'QUICK TRADE') + ' TIME EXIT: ' + (P.maxHold || 5) + ' sessions have passed. Sell at the next open.');
      { const xf = flags.find(f => /STOP|EXIT/.test(f)); if (xf) P.exitFlag = { d: c[i].d, why: xf.replace(/ Sell.*$/, '') }; else delete P.exitFlag; }   // a system trade's own exit, kept for the YOUR STOCKS message
      if (flags.some(f => /STOP|EXIT/.test(f))) posVerdict[sym] = flags.find(f => /STOP|EXIT/.test(f)).replace(/ Sell.*$/, '').replace(/^(QUICK TRADE (TIME )?|LEADER )EXIT: /, '').toLowerCase();
      { const bc = L.bearishCandle ? L.bearishCandle(c, i) : 0; if (bc) flags.push('Candle warning: a ' + L.BEAR_NAMES[bc] + ' at this close. Weak evidence alone; check your stop.'); }
      if (P.raised === c[i].d) flags.push('Stop raised to ' + money(P.stop) + (P.entry && c[i].c > P.entry ? ' as the stock rose' : ' (it is still below your entry; the stop only tightened)') + '. Move it at your broker too.');
      myLines.push(posLine(sym, P, d.last) + (flags.length ? '\n  ' + flags.join('\n  ') : '\n  no exit signal at this close') + '\n  held ' + held + ' session' + (held === 1 ? '' : 's'));
    }
    const mine = journal.filter(x => x.sym === sym), resolved = mine.map(x => ({ x, t: L.resolveCall(x, c, ind) })).filter(y => y.t);
    for (const y of resolved) {
      const isQ = y.x.kind === 'quick', si = c.findIndex(k => k.d === y.x.d);
      if (y.t.open) {
        openTrades.push({ sym, stop: +y.t.stop.toFixed(4), target: isFinite(y.t.target) ? +y.t.target.toFixed(4) : null, t1: y.x.t1 || null, quick: isQ, since: y.x.d });
        // Exit alert: the rule's exit fired at this close, so the paper trade is sold at the next open
        const timeUp = y.x.v.maxHold && i - si >= y.x.v.maxHold;
        if (i > si && (L.exitAt(ind, c, y.x.v, i) || timeUp)) exits.push(sym + (isQ ? ' (quick trade)' : '') + ': exit signal at the close, ' + (timeUp && !L.exitAt(ind, c, y.x.v, i) ? 'time limit reached' : isQ ? 'closed ' + (y.x.v.q === 'gap' ? 'below' : 'above') + ' its 5 day average' : 'rule exit fired') + '. Sell at the next open. Entered after ' + y.x.d + ', now ' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '%.');
      } else {
        { const fk = isQ ? (y.x.v.q === 'gap' ? 'Quick trade: gap and hold' : y.x.v.q === 'candle' ? 'Quick trade: candlestick' : 'Quick trade: dip') : y.x.v.fam === 'brk20' ? '20 day volume breakout' : y.x.v.fam === 'pull' ? 'Dip in an uptrend' : y.x.v.fam === 'brk' ? 'New 52 week high' : 'Average cross', g = famRes[fk] || (famRes[fk] = { n: 0, pct: 0, win: 0, week: 0 }); g.n++; g.pct += y.t.pct; if (y.t.pct > 0) g.win++; if (y.t.exitIdx >= i - 4) g.week++; }
        { const lr = live[y.x.key] || (live[y.x.key] = { name: (isQ ? 'Quick trade: ' + L.quickWhat(y.x.v) : L.famText(y.x.v)) + ' (stop ' + y.x.v.mult + ' daily moves' + (y.x.v.maxHold ? ', max ' + y.x.v.maxHold + ' days' : '') + ')', n: 0, sum: 0, wins: 0, ends: {}, t1: 0, t1n: 0, runUp: [], last: [] });
          let mx = 0; for (let k = y.t.entryIdx; k <= y.t.exitIdx; k++) mx = Math.max(mx, c[k].h);
          { const hiB = y.x.ref + 0.5 * (y.x.dist / y.x.v.mult), above = y.t.entry > hiB; lr.fill = lr.fill || { inN: 0, inSum: 0, upN: 0, upSum: 0 };   // would you have bought? (the plan says skip if it opens above the range)
            if (above) { lr.fill.upN++; lr.fill.upSum += y.t.pct; } else { lr.fill.inN++; lr.fill.inSum += y.t.pct; } }
          lr.n++; lr.sum += y.t.pct; if (y.t.pct > 0) lr.wins++; lr.ends[y.t.reason] = (lr.ends[y.t.reason] || 0) + 1; lr.runUp.push(mx / y.t.entry - 1);
          if (y.x.t1) { lr.t1n++; if (mx >= y.x.t1 * (y.t.entry / y.x.ref)) lr.t1++; }
          lr.last.push(sym + ' ' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '% (' + y.t.reason.replace('_', ' ') + ')'); }
        if (isQ) qFin.push({ sym, d: c[y.t.exitIdx].d, pct: y.t.pct, spy: ind.bench && ind.bench[y.t.sigIdx] ? ind.bench[y.t.exitIdx] / ind.bench[y.t.sigIdx] - 1 : null }); else results.push(y.t.r);
        if (y.t.exitIdx === i) exits.push(sym + (isQ ? ' (quick trade)' : '') + ': paper trade from ' + y.x.d + ' ended by ' + y.t.reason.replace('_', ' ') + ' (' + (y.t.pct >= 0 ? '+' : '') + (y.t.pct * 100).toFixed(1) + '%)');
      }
      if (!isQ) { const o = L.barOutcomes(y.x, c, ind); for (const h in o) { const g = horizons[h] || (horizons[h] = { n: 0, ret: 0, bench: 0 }); g.n++; g.ret += o[h].ret; g.bench += o[h].bench || 0; } }
    }
    if (only) uni.push({ sym, last: d.last, uptrend: T.up, mom6: +T.mom6.toFixed(4) });
    if (!only) {
      const Lr = L.learn(c, ind, models[sym], sym === 'SPY'); models[sym] = Lr.key;
      if (Lr.proven || (Lr.test.n >= 15 && Lr.avgPct > 0)) addMday(Lr.mday);   // market-day study over the same rules
      if (Lr.dow && (Lr.proven || (Lr.test.n >= 15 && Lr.avgPct > 0))) for (const h of ['older', 'newer']) { Lr.dow[h].forEach((x, k) => { DOWS[h][k][0] += x[0]; DOWS[h][k][1] += x[1]; }); if (Lr.timing) for (const k of ['openIn', 'closeIn', 'openOut', 'closeOut']) { TIM[h][k][0] += Lr.timing[h][k][0]; TIM[h][k][1] += Lr.timing[h][k][1]; } }   // day-of-week study over the rules the system would offer
      // YOUR STOCKS: the sell target is re-tested every night on the same rule you bought on (your own typed target is kept)
      if (myPos[sym] && !myPos[sym].ownT && myPos[sym].entry && (myPos[sym].kind === 'entry' || myPos[sym].kind === 'quick')) { const P = myPos[sym];
        let R = null; if (P.kind === 'entry' && (!P.key || P.key === Lr.key)) R = Lr;
        if (P.kind === 'quick' && L.quickStudy) { const qs = L.quickStudy(c, ind, false) || []; R = qs.find(Q => Q.key === P.key) || qs.find(Q => Q.v && Q.v.q === P.q) || null; }
        if (R) { P.dist0 = P.dist0 || (P.stop && P.stop < P.entry ? +(P.entry - P.stop).toFixed(4) : null);
          const tp = R.v && R.v.tp, tg = R.tgt;
          if (tp && P.dist0) { P.t1 = +(P.entry + tp * P.dist0).toFixed(2); P.tmode = 'all'; P.tnote = 'target ' + tp + 'x the stop distance, chosen by the test'; }
          else if (tg && tg.mode !== 'none' && tg.x) { P.t1 = +(P.entry * (1 + tg.x)).toFixed(2); P.tmode = tg.mode; P.tnote = tg.verdict; }
          else { delete P.t1; delete P.t2; delete P.tmode; P.tnote = tg ? tg.verdict : 'no tested target'; }
          if (P.orig && (P.t1 || null) !== (P.orig.t1 || null)) P.tnote = 'NEW TEST RESULT after your buy (target at the buy: ' + (P.orig.t1 ? money(P.orig.t1) : 'none') + '); ' + (P.tnote || '');
          P.tChecked = c[i].d; } }
      const paused = L.isPaused(resolved.filter(y => !y.t.open && y.x.kind !== 'quick').map(y => y.t.r));
      const v = L.applyGates(L.verdict(c, ind, Lr, null, d.last, paused), { dollarVol: T.dollarVol, halal, limit: null }), trig = L.buyTrigger(c, ind, Lr), dist = Lr.v.mult * ind.atr[i];
      const row = { sym, last: d.last, state: v.word, why: v.why, halal, rule: L.ruleText(Lr.v), proven: Lr.proven, uptrend: T.up, mom6: +T.mom6.toFixed(4), trigger: trig.price ? +trig.price.toFixed(4) : null };
      if (v.act) Object.assign(row, { buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), stop: +(d.last - dist).toFixed(4), target: Lr.v.tp ? +(d.last + Lr.v.tp * dist).toFixed(4) : Lr.tgt && Lr.tgt.mode !== 'none' && Lr.tgt.x ? +(d.last * (1 + Lr.tgt.x)).toFixed(4) : null, half: !Lr.v.tp && Lr.tgt && Lr.tgt.mode === 'half', tgtNote: Lr.v.tp ? 'target ' + Lr.v.tp + 'x the stop distance, chosen by the walk-forward test' : Lr.tgt ? Lr.tgt.verdict + (Lr.tgt.mode !== 'none' && Lr.tgt.oosAvg !== null ? ' (' + pcs(Lr.tgt.oosAvg) + ' a trade with it vs ' + pcs(Lr.tgt.baseAvg) + ' without)' : '') : null, exitBelow: +L.sellLevel({ v: Lr.v }, c, ind).toFixed(4), hit: Lr.hitRate, days: Lr.medDays, n: Lr.test ? Lr.test.n : null, win: Lr.test ? Lr.test.winRate : null, avgPct: Lr.avgPct, pcts: Lr.oosPct || null, r10: Lr.reach10 ?? null, r20: Lr.reach20 ?? null, key: Lr.key, maxHold: Lr.v.maxHold || null, reg: Lr.regime || null });
      stocks.push(row);
      if (BIOBLOCK.has(sym)) { if (v.act) { blocked.push(sym + ': a tested rule fired, but ' + BIOBLOCK.get(sym)); row.state = 'Blocked'; } else if (DISC.has(sym)) blocked.push(sym + ' (discovery pick): ' + BIOBLOCK.get(sym)); }
      else if (DISC.has(sym) && halal !== 'fail') {
        if (v.act) picks.push({ tier: 0, text: sym + ' closed ' + money(d.last) + ' (ENTRY CONFIRMED, tested rule)\n  buy range ' + money(row.buyLo) + ' to ' + money(row.buyHi) + '\n  stop ' + money(row.stop) + (row.target ? ', target ' + money(row.target) : ', no fixed target') + ', exit on a close below ~' + money(row.exitBelow) });
        else if (Lr.proven && trig.price && trig.price / d.last < 1.15) picks.push({ tier: 1, text: sym + ' closed ' + money(d.last) + ' (BUY WATCH, tested rule)\n  buy only after a close above ~' + money(trig.price) + ', then up to ' + money(trig.price + 0.5 * ind.atr[i]) + '\n  stop ~' + money(trig.price - dist) + (Lr.v.tp ? ', target ~' + money(trig.price + Lr.v.tp * dist) : ', no fixed target') });
        else refLine(sym, d);
      }
      if (v.signal && !BIOBLOCK.has(sym) && !mine.some(x => x.d === c[i].d && x.kind !== 'quick')) { const e = { sym, d: c[i].d, key: Lr.key, v: Lr.v, dist: +dist.toFixed(6), ref: d.last, state: v.word, loggedAt: new Date(now).toISOString() }; fresh.push(e); fs.appendFileSync('data/journal.jsonl', JSON.stringify(e) + '\n'); }
    }
    // Quick trades: three kinds of dip, each shown only where it passed its own tests on this stock
    if (L.quickStudy && !myPos[sym] && !BIOBLOCK.has(sym) && d.last >= (WIDE.has(sym) ? 2 : 5) && !(T.dollarVol !== null && T.dollarVol < L.CFG.MIN_DOLLAR_VOL) && halal !== 'fail') {
      const QS = L.quickStudy(c, ind, sym === 'SPY'); for (const q of QS || []) addMday(q.mday); const Q = L.quickFire(c, ind, QS);
      if (Q) {
        const qd = Q.v.mult * ind.atr[i], per10k = Math.floor(VOLM * Math.min(10000 * 0.005 / qd, 10000 * 0.20 / d.last)), P = L.quickPlan ? L.quickPlan(d.last, ind.atr[i], ind.sma5[i], Q) : {};
        const t1 = P.t1 ? +P.t1.toFixed(4) : null, t2 = null, qhalf = !!P.half, tgtNote = Q.tgt ? Q.tgt.verdict + (t1 && Q.tgt.oosAvg !== null ? ' (' + pcs(Q.tgt.oosAvg) + ' a trade with it vs ' + pcs(Q.tgt.baseAvg) + ' without)' : '') : null;
        quick.push({ t: Q.test.t, row: { sym, last: d.last, buyLo: d.last, buyHi: +(d.last + 0.5 * ind.atr[i]).toFixed(4), sellAbove: +ind.sma5[i].toFixed(4), stop: +(d.last - qd).toFixed(4), t1, t2, half: qhalf, tgtNote, rsi2: ind.rsi2[i] !== null ? +ind.rsi2[i].toFixed(1) : null, mom6: +T.mom6.toFixed(4), reg: Q.regime || null, q: Q.v.q, maxHold: Q.v.maxHold, exitText: L.quickExitText ? L.quickExitText(Q.v, ind.sma5[i]) : '', what: L.quickWhat(Q.v), key: Q.key, win: Q.test.winRate, n: Q.test.n, avgPct: Q.avgPct, pcts: Q.oosPct || null, r10: Q.reach10 ?? null, r20: Q.reach20 ?? null, days: Q.medDays },
          text: sym + ' closed ' + money(d.last) + '\n  why: ' + (Q.v.q === 'gap' ? 'momentum, ' : 'in an uptrend, ') + L.quickWhat(Q.v) + '\n  buy ' + money(d.last) + ' to ' + money(d.last + 0.5 * ind.atr[i]) + ' at the next open' + (t1 ? '\n  target: ' + money(t1) + (qhalf ? ' (sell HALF there)' : ' (sell ALL there)') + ', ' + tgtNote : '\n  no target: ' + (tgtNote || 'not studied')) + '\n  rule exit: ' + (L.quickExitText ? L.quickExitText(Q.v, ind.sma5[i]) : 'first close above its 5 day average') + '\n  time exit: after ' + Q.v.maxHold + ' sessions\n  invalidation: ' + money(d.last - qd) + ' (stop loss)\n  size: about ' + per10k + ' shares per 10,000 USD of account (risking about ' + Math.round(per10k * qd) + ' USD)\n  past result here: ' + Math.round(Q.test.winRate * 100) + '% wins over ' + Q.test.n + ' unseen trades, average ' + (Q.avgPct * 100).toFixed(2) + '% a trade, about ' + Q.medDays + ' days held\n  ' + L.HALAL_TEXT[halal] });
        quick[quick.length - 1].entry = mine.some(x => x.d === c[i].d && x.kind === 'quick') ? null : { sym, d: c[i].d, key: Q.key, v: Q.v, dist: +qd.toFixed(6), ref: d.last, t1, state: 'Quick trade', kind: 'quick', loggedAt: new Date(now).toISOString() };
      }
    }
  }
  quick.sort((a, b) => b.t - a.t);
  { const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], avgOf = (h) => { const n = h.reduce((a, x) => a + x[0], 0); return n ? h.reduce((a, x) => a + x[1], 0) / n : null; };
    const allO = avgOf(DOWS.older), allN = avgOf(DOWS.newer), rows = days.map((d, k) => { const o = DOWS.older[k], w = DOWS.newer[k], ao = o[0] ? o[1] / o[0] : null, an = w[0] ? w[1] / w[0] : null, enough = o[0] >= 150 && w[0] >= 150;
      return { day: d, older: { n: o[0], avg: ao }, newer: { n: w[0], avg: an }, verdict: !enough ? 'too few trades' : ao < allO - 0.005 && an < allN - 0.005 ? 'WORSE in both halves' : ao > allO + 0.005 && an > allN + 0.005 ? 'BETTER in both halves' : 'no steady difference' }; });
    fs.writeFileSync('data/dow-study.json', JSON.stringify({ session, all: { older: allO, newer: allN }, rows }, null, 1));
    { const tags = ['bigDown', 'down', 'flat', 'up', 'bigUp', 'gapDown', 'gapFlat', 'gapUp', 'strong', 'weak', 'calm', 'wild'], av = (x) => x && x[0] ? x[1] / x[0] : null, all = { older: av(MDAY.older.all), newer: av(MDAY.newer.all) };
      const rows = tags.map(k => { const o = MDAY.older[k] || [0, 0], w = MDAY.newer[k] || [0, 0], ao = av(o), an = av(w), enough = o[0] >= 150 && w[0] >= 150;
        return { k, older: { n: o[0], avg: ao }, newer: { n: w[0], avg: an }, verdict: !enough ? 'too few trades' : ao < 0 && an < 0 ? 'LOSING in both halves' : ao < all.older - 0.005 && an < all.newer - 0.005 ? 'WORSE in both halves' : ao > all.older + 0.005 && an > all.newer + 0.005 ? 'BETTER in both halves' : 'no steady difference' }; });
      fs.writeFileSync('data/mday-study.json', JSON.stringify({ session, all, n: { older: (MDAY.older.all || [0])[0], newer: (MDAY.newer.all || [0])[0] }, rows }, null, 1)); }
    const av = (x) => x[0] ? x[1] / x[0] : null, T2 = {}; for (const h of ['older', 'newer']) { T2[h] = {}; for (const k in TIM[h]) T2[h][k] = { n: TIM[h][k][0], avg: av(TIM[h][k]) }; }
    const better = (a, b) => ['older', 'newer'].every(h => T2[h][a].n >= 150 && T2[h][a].avg > T2[h][b].avg + 0.002);
    T2.buy = better('closeIn', 'openIn') ? 'CLOSE' : better('openIn', 'closeIn') ? 'OPEN' : 'EITHER'; T2.sell = better('closeOut', 'openOut') ? 'CLOSE' : better('openOut', 'closeOut') ? 'OPEN' : 'EITHER';
    fs.writeFileSync('data/timing-study.json', JSON.stringify({ session, ...T2 }, null, 1)); }
  // EARNINGS DRIFT: a stock that beat its EPS estimate by 10%+ and whose reaction day (this session) closed up 3%+ in the top half.
  // Offered only while the Sunday fair test (earnings-study.mjs) says PROMISING; otherwise logged for the record only.
  const pead = [], peadFunnel = { reports: 0, noPrice: 0, held: 0, notHalal: 0, smallEst: 0, beat: 0, passed: 0 }; { const ES = readJson0('data/earnings-study.json'), ER = readJson0('data/earnings-recent.json'), R = (ES && ES.rule) || { minSurprise: 0.10, minUp: 0.03, minLoc: 0.5, maxGap: 0.03, maxStop: 0.15, hold: 40 };
    const nextDay = (d) => { let ms = Date.parse(d + 'T12:00:00Z'); do { ms += 864e5; } while ([0, 6].includes(new Date(ms).getUTCDay())); return new Date(ms).toISOString().slice(0, 10); };
    for (const r of (ER && ER.reports) || []) { const react = r.t === 'bmo' ? r.d : r.t === 'amc' ? nextDay(r.d) : null; if (react ? react !== session : !(r.d === session || nextDay(r.d) === session)) continue; peadFunnel.reports++;
      const d = loaded[r.sym]; if (!d || d.candles.length < 30) { peadFunnel.noPrice++; continue; } if (myPos[r.sym]) { peadFunnel.held++; continue; } if (myHalal(r.sym) === 'fail') { peadFunnel.notHalal++; continue; }
      const c = d.candles, i = c.length - 1, b = c[i], p = c[i - 1]; if (b.d !== session) { peadFunnel.noPrice++; continue; }
      if (!(Math.abs(r.e) >= 0.05)) { peadFunnel.smallEst++; continue; } const sur = (r.a - r.e) / Math.abs(r.e), up = b.c / p.c - 1, loc = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, stop = +(b.l * 0.995).toFixed(2);
      if (sur >= R.minSurprise) peadFunnel.beat++; if (sur < R.minSurprise || up < R.minUp || loc < R.minLoc || !(b.c >= 5) || b.c * b.v < 5e6 || (b.c - stop) / b.c > R.maxStop) continue; peadFunnel.passed++;
      let s20 = 0; for (let k = i - 19; k <= i; k++) s20 += c[k].c;
      pead.push({ sym: r.sym, inTest: !!(ES && Array.isArray(ES.syms) && ES.syms.includes(r.sym)), last: b.c, buyLo: +b.c.toFixed(2), buyHi: +(b.c * (1 + R.maxGap)).toFixed(2), stop, sur: +sur.toFixed(3), up: +up.toFixed(3), sma20: +(s20 / 20).toFixed(2), hold: R.hold || 40, live: ES && ES.verdict === 'PROMISING', test: ES && ES.results ? { n: ES.results.main.newer.n, avg: ES.results.main.newer.avg, win: ES.results.main.newer.win } : null }); } }
  // EVENT DRIFT: company news (an SEC filing) that the Sunday study (events-study.mjs) PROVED is followed by gains, when the stock also
  // closed up strongly on it today. Only the stocks that jumped today are checked against the SEC (at most 120 requests). Nothing is
  // offered while no news kind has passed. Earnings days are left to the earnings-drift rule.
  const evt = []; { const ES = readJson0('data/events-study.json'), CK = readJson0('data/sec-ciks.json') || {}, R = (ES && ES.rule) || {};
    const ok = ES && ES.fam ? Object.keys(ES.fam).filter(k => ES.fam[k].verdict === 'PROMISING' && ES.fam[k].sign >= 0) : [], fam8 = ok.filter(k => !/^(FDA_|EPS_ACCEL)/.test(k));
    if (ok.length) { const jumped = [];
      for (const [sym, d] of Object.entries(loaded)) { if (!d || d.candles.length < 30 || myPos[sym] || myHalal(sym) === 'fail' || BIOBLOCK.has(sym) || pead.some(x => x.sym === sym)) continue;
        const c = d.candles, i = c.length - 1, b = c[i], p = c[i - 1]; if (b.d !== session) continue;
        const up = b.c / p.c - 1, loc = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, stop = +(b.l * 0.995).toFixed(2);
        if (up < (R.minUp || 0.03) || loc < (R.minLoc || 0.5) || !(b.c >= (R.minPx || 5)) || b.c * b.v < (R.minDv || 5e6) || (b.c - stop) / b.c > (R.maxStop || 0.15)) continue;
        let s20 = 0; for (let k = i - 19; k <= i; k++) s20 += c[k].c; jumped.push({ sym, b, up, stop, sma20: +(s20 / 20).toFixed(2) }); }
      jumped.sort((x, y) => y.up - x.up); let asked = 0;
      const add = (x, k, p) => { const F = ES.fam[k], t = F.results && F.results.newer; if (evt.some(e => e.sym === x.sym)) return;
        evt.push({ sym: x.sym, fam: k, name: F.name.replace(/ \(.*\)$/, ''), p, last: x.b.c, buyLo: +x.b.c.toFixed(2), buyHi: +(x.b.c * (1 + (R.maxGap || 0.03))).toFixed(2), stop: x.stop, up: +x.up.toFixed(3), sma20: x.sma20, hold: R.hold || 40, live: true, test: t ? { n: t.n, avg: t.avg, win: t.win } : null }); };
      for (const x of jumped) { if (!fam8.length || asked >= 120 || !CK[x.sym]) continue; asked++;
        const j = await secJson(SEC_DATA + '/submissions/CIK' + String(CK[x.sym][0]).padStart(10, '0') + '.json'), r = j && j.filings && j.filings.recent; if (!r || !r.form) continue;
        let earn = false; const hits = [];
        for (let k = 0; k < Math.min(r.form.length, 40); k++) { const pt = String(r.acceptanceDateTime[k] || '').slice(0, 16); if (!pt || pt.slice(0, 10) < new Date(Date.parse(session + 'T12:00:00Z') - 5 * 864e5).toISOString().slice(0, 10)) continue;
          const f = evFams(r.form[k], (r.items || [])[k], j.sic, ES); if (f.includes('EARN')) earn = true; if (evReact(pt) !== session) continue; for (const q of f) if (fam8.includes(q)) hits.push([q, pt.replace('T', ' ')]); }
        if (!earn && hits.length) add(x, hits[0][0], hits[0][1]); }
      // earnings growth speeding up: tonight's earnings reactions, checked against the stored EPS history
      if (ok.includes('EPS_ACCEL')) { let EC = {}; try { EC = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/earnings-cache.json.gz')).toString()).syms || {}; } catch (e) {}
        const ER = readJson0('data/earnings-recent.json');
        for (const r of (ER && ER.reports) || []) { const x = jumped.find(y => y.sym === r.sym); if (!x) continue; const react = r.t === 'amc' ? evReact(r.d + 'T16:30') : r.d; if (react !== session && !(r.t !== 'bmo' && r.t !== 'amc' && evReact(r.d + 'T16:30') === session)) continue;
          const H = (EC[r.sym] || []).filter(q => isFinite(q.a) && q.d <= r.d), n = H.length, g = (k) => k >= 4 && Math.abs(H[k - 4].a) >= 0.05 ? (H[k].a - H[k - 4].a) / Math.abs(H[k - 4].a) : null;
          if (n < 6 || H[n - 1].d !== r.d) continue; const g1 = g(n - 1), g0 = g(n - 2); if (g1 !== null && g0 !== null && g1 >= 0.25 && g1 > g0 && g0 > 0 && H[n - 1].a > 0) add(x, 'EPS_ACCEL', r.d); } }
      if (evt.length) console.log('event drift tonight: ' + evt.map(e => e.sym + ' (' + e.fam + ')').join(', ')); } }

  // Earnings check (Finnhub). Results within 7 days block a quick trade or a confirmed entry: the price can gap through any stop.
  const earnings = async (sym) => {
    if (!env.FINNHUB_KEY) return { known: false };
    try {
      const today = new Date(now).toISOString().slice(0, 10), r = await fetch(FH + '/calendar/earnings?from=' + today + '&to=' + new Date(now + 21 * 86400000).toISOString().slice(0, 10) + '&symbol=' + sym + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
      if (!r.ok) return { known: false };
      const cal = ((await r.json()).earningsCalendar) || [], ds = cal.map(e => e.date).filter(Boolean).sort(), hr = ds[0] ? String((cal.find(e => e.date === ds[0]) || {}).hour || '').toLowerCase() : '';
      return { known: true, date: ds[0] || null, days: ds[0] ? Math.round((Date.parse(ds[0]) - now) / 86400000) : null, when: hr === 'bmo' ? ' before the market opens' : hr === 'amc' ? ' after the market closes' : '' };
    } catch (e) { return { known: false }; } finally { await sleep(FAST ? 0 : 1100); }
  };
  const earnText = (e) => !e.known ? 'earnings date NOT CHECKED, verify before acting' : e.date ? 'next earnings ' + e.date + (e.when || '') + ', in ' + e.days + ' days' : 'no earnings in the next three weeks';
  const keep = [];
  for (const q of quick.slice(0, 10)) {
    const e = await earnings(q.row.sym);
    if (e.known && e.date && e.days <= 7) { blocked.push(q.row.sym + ' (quick trade): earnings on ' + e.date + ', in ' + Math.max(e.days, 0) + ' days. A result can gap the price through the stop.'); continue; }
    const nr = await newsRisk(q.row.sym);
    if (nr.hard) { blocked.push(q.row.sym + ' (quick trade): ' + nr.hard.tag + ' in the news this week. "' + nr.hard.h + '"'); continue; }
    q.text += '\n  ' + earnText(e) + (nr.soft ? '\n  WARNING, ' + nr.soft.tag.toLowerCase() + ': "' + nr.soft.h + '"' : nr.known ? '\n  no negative news found this week' : ''); q.row.earn = earnText(e); q.row.earnDays = e.known && e.date ? e.days : null;
    if (q.entry) { fresh.push(q.entry); fs.appendFileSync('data/journal.jsonl', JSON.stringify(q.entry) + '\n'); }
    keep.push(q);
  }
  quick.length = 0; quick.push(...keep);
  // QUICK-TRADE GATE (stronger quick trades). The dip family loses on the whole market, so a stock's own good record is not enough.
  // 1) If Sunday's lab found a condition under which dips work on the whole market (both halves), only dips meeting it are offered.
  // 2) If no condition passed and the persistence test says a stock's own record does not carry forward, quick trades are paper only.
  // 3) Otherwise (or before the lab has run): a strict gate, 25+ unseen trades and a positive safety margin (luck taken off).
  // Every dip is still logged on paper, so the evidence keeps growing.
  const quickHeld = []; {
    const HL = readJson0('data/hunting-lab.json'), best = HL && HL.quickFilters ? HL.quickFilters.best : null, perBad = Boolean(HL && HL.persistence && /DID NOT HELP/.test(HL.persistence.verdict || ''));
    const moms = stocks.map(x => x.mom6).filter(x => typeof x === 'number').sort((a, b) => a - b), p80 = moms.length > 50 ? moms[Math.floor(moms.length * 0.8)] : null;
    const s50 = spy.slice(-50).reduce((a, x) => a + x.c, 0) / Math.min(50, spy.length), up50 = spy[spy.length - 1].c > s50;
    const meets = (r) => !best || best.split('+').every(k => k === 'up' ? up50 : k === 'strong' ? p80 !== null && r.mom6 >= p80 : k === 'deep' ? r.rsi2 !== null && r.rsi2 < 5 : true);
    const strictOk = (r) => { const d = distOf(r.pcts, r.last); return (r.n || 0) >= 30 && d && d.lb > 0; };
    const pass = [];
    for (const q of quick) { const r = q.row;
      const why = best ? (meets(r) ? null : 'does not meet the condition that works on the whole market (' + best + ')') : perBad ? 'paper only: dips do not work on the whole market and a stock\u2019s own record did not carry forward' : strictOk(r) ? null : 'strict gate: needs 30+ unseen trades and a positive safety margin (has ' + (r.n || 0) + ')';
      if (why) quickHeld.push({ sym: r.sym, why }); else pass.push(q); }
    quick.length = 0; quick.push(...pass); }
  for (const st of stocks.filter(x => x.state === 'Buy watch')) {
    const e = await earnings(st.sym);
    if (e.known && e.date && e.days <= 7) { st.state = 'Blocked'; blocked.push(st.sym + ': a tested rule fired, but earnings are on ' + e.date + ', in ' + Math.max(e.days, 0) + ' days.'); continue; }
    const nr = await newsRisk(st.sym);
    if (nr.hard) { st.state = 'Blocked'; blocked.push(st.sym + ': a tested rule fired, but there is ' + nr.hard.tag.toLowerCase() + ' in the news this week. "' + nr.hard.h + '"'); }
    else { st.earn = earnText(e) + (nr.soft ? '\n  WARNING, ' + nr.soft.tag.toLowerCase() + ': "' + nr.soft.h + '"' : ''); st.earnDays = e.known && e.date ? e.days : null; }
  }
  // ---- LEADERS: rank tonight, keep a paper portfolio of five going forward, and give prices only while the past test is positive
  // memory: the whole-market stocks have been tested already; keep only their last year, and leave them out of the LEADERS
  // re-test (which runs nine versions over every loaded stock and would not fit in memory with 2,500 more)
  for (const x of WIDE) if (loaded[x]) loaded[x] = { candles: loaded[x].candles.slice(-260), last: loaded[x].last, wide: true };
  const coreLoaded = Object.fromEntries(Object.entries(loaded).filter(([k]) => !WIDE.has(k)));
  const LS0 = readJson(LEAD_FILE, { paper: [], done: [] }), LS = LS0, LC = leadersPick(coreLoaded, spy, BTSET, LS0.rule), leadRows = [], leadOut = [], leadSkip = [];
  LS.paper = (LS.paper || []).filter(p => !(p.picked === session && !p.entry)); LS.done = LS.done || [];   // a re-run of the same night rebuilds tonight's picks
  for (const p of LS.paper) {
    const x = LC.S[p.sym]; if (!x) continue; const c = x.c, i = c.length - 1;
    if (!p.entry) { const k = c.findIndex(z => z.d > p.picked); if (k >= 0) { if (c[k].o > p.buyHi || c[k].o <= p.stop) { p.skip = true; LS.missed = LS.missed || { above: 0, under: 0 }; LS.missed[c[k].o > p.buyHi ? 'above' : 'under']++; } else { p.entry = c[k].o; p.in = c[k].d; p.entryWorst = +Math.max(c[k].o, Math.min(c[k].h, p.buyHi)).toFixed(4); } } }
    if (p.exitOn && !p.exit) { const k = c.findIndex(z => z.d > p.exitOn); if (k >= 0) { p.exit = c[k].o; p.out = c[k].d; p.gross = +(p.exit / p.entry - 1).toFixed(5); p.pct = +(p.gross - LEAD_COST).toFixed(5); if (p.entryWorst) p.pctWorst = +(p.exit / p.entryWorst - 1 - LEAD_COST).toFixed(5); const a = spy.find(z => z.d >= p.in), b = spy.find(z => z.d >= p.out); p.spy = a && b ? b.o / a.o - 1 : null; } }
    else if (p.entry && !p.exitOn) { if (c[i].c < p.stop || c[i].c < x.ind.e[50][i]) { p.exitOn = session; p.why = c[i].c < p.stop ? 'closed under its trailing stop ' + money(p.stop) : 'closed under its 50 day average'; } else p.stop = +Math.max(p.stop, c[i].c - LEADCFG.ATR * x.ind.atr[i]).toFixed(2); }
  }
  LS.done.push(...LS.paper.filter(p => p.exit)); LS.done = LS.done.slice(-300);
  LS.paper = LS.paper.filter(p => !p.exit && !p.skip);
  // The weekly fair test (whole market, dead stocks included, judged only on data the choice never saw) can veto the list.
  const FAIR = readJson('data/leaders-study.json', null), fairRow = FAIR && (FAIR.rows || []).find(r => r.key === LC.rule);
  const rowRejected = Boolean(fairRow && fairRow.test && fairRow.test.base && fairRow.test.base.n >= 30 && fairRow.test.low && !(fairRow.test.low.avg > 0));
  const fairBad = Boolean(FAIR && ((FAIR.liveVerdict === 'REJECTED' && FAIR.live === LC.rule) || rowRejected));
  const fairState = !FAIR ? 'NOT RUN' : fairBad ? 'REJECTED' : FAIR.live === LC.rule ? FAIR.liveVerdict : 'NOT PROVEN';
  const leadOk = LC.bt && LC.bt.avg > 0 && LC.bt.second > 0 && !fairBad;
  if (LC.marketOk && (leadOk || fairBad)) {
    let checked = 0;
    for (const r of LC.ranked) {
      if (LS.paper.length >= LEADCFG.N || checked >= 12) break;
      if (LS.paper.some(p => p.sym === r.sym)) continue;
      checked++;
      if (BIOBLOCK.has(r.sym)) { leadSkip.push(r.sym + (BIOBLOCK.get(r.sym).startsWith('dilution') ? ' (heavy share dilution)' : ' (trial risk)')); continue; }
      if (myHalal(r.sym) === 'fail') { leadSkip.push(r.sym + ' (you marked it NOT halal in ZAD)'); continue; }
      { const cs = (LC.S[r.sym] && LC.S[r.sym].c) || []; let mx = 0; for (let k = Math.max(1, cs.length - 21); k < cs.length; k++) { const a = cs[k - 1].c, b = cs[k].c; if (a > 0 && b > 0 && b / a - 1 > mx) mx = b / a - 1; }   // Agent A, 20 Oct: lottery-like stocks lagged the average stock ~3% a month (M15, t -5.1); their 3-ATR stop is also far too wide
        if (mx >= 0.15) { leadSkip.push(r.sym + ' (lottery-like: +' + Math.round(mx * 100) + '% in one day in the last month)'); continue; } }
      const e = await earnings(r.sym); if (e.known && e.date && e.days <= 7) { leadSkip.push(r.sym + ' (earnings ' + e.date + ')'); continue; }
      const nr = await newsRisk(r.sym); if (nr.hard) { leadSkip.push(r.sym + ' (' + nr.hard.tag.toLowerCase() + ')'); continue; }
      const row = { sym: r.sym, last: r.px, buyLo: +r.px.toFixed(2), buyHi: +(r.px + 0.5 * r.a).toFixed(2), stop: +(r.px - LEADCFG.ATR * r.a).toFixed(2), e50: +r.e50.toFixed(2), mom: r.mom, earn: earnText(e) + (nr.soft ? '. WARNING, ' + nr.soft.tag.toLowerCase() : ''), earnDays: e.known && e.date ? e.days : null };
      if (leadOk) leadRows.push(row); LS.paper.push({ sym: r.sym, picked: session, buyHi: row.buyHi, stop: row.stop, mom: r.mom, rule: LC.rule, paperOnly: !leadOk || undefined });
    }
  }
  {
    const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', top = LC.ranked.slice(0, 5).map(r => r.sym + ' +' + Math.round(r.mom * 100) + '%').join(', ');
    leadOut.push('LEADERS, ' + session + ' close', 'The strongest stocks I follow, to ride for weeks. Prices are from that close; buy at the next open (4:30 pm Kuwait).', 'Strongest over ' + Math.round(LEADCFG.LOOK / 21) + ' months: ' + (top || 'none in an uptrend') + '.', '');
    if (fairBad) leadOut.push('NO PRICES: the weekly fair test on the whole market (' + FAIR.to + ') REJECTED this version: it lost money on the newer data even at the lowest cost. Do not buy these. I keep following the picks on paper, so the live record keeps growing; the test re-runs every Sunday.');
    else if (!leadOk) leadOut.push('NO PRICES: on the past test this rule did not make money' + (LC.bt ? ' (' + (LC.bt.avg * 100).toFixed(2) + '% a trade, later half ' + (LC.bt.second * 100).toFixed(2) + '%)' : ' (too few trades to judge)') + ', so I will not suggest buying on it.');
    else if (!LC.marketOk) leadOut.push('NO NEW BUYS: the S&P 500 is under its 200 day average. Leaders fail most often in a falling market. Existing ones keep their stops.');
    else if (leadRows.length) { leadOut.push('NEW TO BUY (' + leadRows.length + ')'); for (const r of leadRows) leadOut.push(r.sym + ' closed ' + money(r.last) + ', up ' + Math.round(r.mom * 100) + '% in ' + Math.round(LEADCFG.LOOK / 21) + ' months\n  BUY ' + money(r.buyLo) + ' to ' + money(r.buyHi) + '. If it opens higher, skip it\n  STOP ' + money(r.stop) + ' (' + ((1 - r.stop / r.last) * 100).toFixed(1) + '% below). I raise it as the stock climbs\n  SELL when it closes under the stop or under its 50 day average (now ~' + money(r.e50) + '). No fixed target: let it run\n  ' + r.earn + (myPos[r.sym] ? '\n  you already hold this one' : '')); }
    else leadOut.push('NEW TO BUY: none tonight. All five places are taken by the stocks below.');
    const lastOf = (p) => loaded[p.sym] ? ', closed ' + money(loaded[p.sym].last) + ' (' + pc(loaded[p.sym].last / p.entry - 1) + ')' : ', no price tonight', held = LS.paper.filter(p => p.entry && !p.exitOn), sells = LS.paper.filter(p => p.exitOn);
    if (sells.length) leadOut.push('', 'SELL AT THE NEXT OPEN (' + sells.length + ')', ...sells.map(p => p.sym + ': ' + p.why + '. In at ' + money(p.entry) + lastOf(p)));
    if (held.length) leadOut.push('', 'STILL RIDING (' + held.length + ')', ...held.map(p => p.sym + ': in at ' + money(p.entry) + ' on ' + p.in + lastOf(p) + ', stop now ' + money(p.stop)));
    if (leadSkip.length) leadOut.push('', 'Strong but left out: ' + leadSkip.join(', ') + '.');
    leadOut.push('', 'Rule in use: ' + leadName(LEADCFG) + '.' + (LS0.rule && LC.rule !== LC.was ? ' CHANGED TONIGHT (it was ' + leadName(LEAD_VARIANTS.find(x => leadKey(x) === LC.was)) + '): the new one tested clearly better on the older years and still made money in the last two.' : '') + ' I re-test ' + LC.tried + ' versions every night; ' + LC.passed + ' pass tonight.', leadEvidence(LC.bt),
      FAIR && FAIR.verdict && FAIR.verdict !== 'NOT RUN' ? 'FAIR TEST (whole market, collapsed stocks included, ' + FAIR.from + ' to ' + FAIR.to + '): this version ' + fairState + '.' + (FAIR.live === LC.rule && FAIR.liveWhy ? ' ' + FAIR.liveWhy.replace(/^\w/, ch => ch.toUpperCase()) + '.' : '') : 'FAIR TEST: not run yet. Until it is, the past test above is flattered and the edge is NOT proven. Use small size or paper only.');
    const dn = LS.done.filter(p => typeof p.pct === 'number');
    leadOut.push('Paper record since this list started: ' + (dn.length ? dn.length + ' finished, ' + Math.round(dn.filter(p => p.pct > 0).length / dn.length * 100) + '% won, average ' + pc(dn.reduce((a, p) => a + p.pct, 0) / dn.length) + ' a trade after costs.' + leadLedger(dn) + (dn.some(p => typeof p.pctWorst === 'number') ? ' If every entry had been filled at the dearest price inside its buy range: average ' + pc(dn.filter(p => typeof p.pctWorst === 'number').reduce((a, p) => a + p.pctWorst, 0) / dn.filter(p => typeof p.pctWorst === 'number').length) + ' a trade.' : '') : 'no finished trade yet.') + (LS.missed ? ' Picks never entered: ' + LS.missed.above + ' opened above the buy range, ' + LS.missed.under + ' opened under the stop.' : ''), 'Costs in these figures: 0.8% a trade (3 USD + 3 USD fees on a 1,000 USD buy plus the spread), the same cost the fair test uses. Trades finished before 18 Oct 2026 were counted at 0.4%.', 'If you buy one, tell me: bought SYMBOL price. I will then trail its stop for you.');
    LS.session = session; LS.text = leadOut.join('\n'); LS.bt = LC.bt; LS.rule = LC.rule;
    fs.writeFileSync(LEAD_FILE, JSON.stringify(LS, null, 1));
  }
  // Circuit breaker: if the last five finished quick paper trades lost money overall, quick trades are paused.
  // Setups are still journaled as paper trades, so the record keeps running and the pause lifts by itself when it recovers.
  qFin.sort((a, b) => a.d < b.d ? -1 : 1);
  const lastFive = qFin.slice(-5), quickPaused = lastFive.length >= 5 && lastFive.reduce((a, x) => a + x.pct, 0) < 0;
  const tipRows = readTips().map(t => { const dd = loaded[t.sym], k = dd ? dd.candles.findIndex(x => x.d > t.d) : -1, ks = spy.findIndex(x => x.d > t.d);
    if (k < 0 || ks < 0) return { sym: t.sym, src: t.src, d: t.d, ret: null, spy: null, days: 0 };
    // closed by the source's own SELL message: scored at that day's close or open (S&P 500 over the same days)
    const ke = t.exit ? dd.candles.findIndex(x => x.d >= t.exit.d) : -1, kse = t.exit ? spy.findIndex(x => x.d >= t.exit.d) : -1;
    if (ke >= k && kse >= ks) { const px = t.exit.when === 'open' ? dd.candles[ke].o : dd.candles[ke].c, sx = t.exit.when === 'open' ? spy[kse].o : spy[kse].c;
      return { sym: t.sym, src: t.src, d: t.d, ret: px / dd.candles[k].o - 1, spy: sx / spy[ks].o - 1, days: ke - k + 1, closed: t.exit.d }; }
    // the same tip WITH the tested stop (from the stop study): did adding a stop to this source's calls help?
    const end = ke >= k ? ke : dd.candles.length - 1, e0 = dd.candles[k].o, ts = testedStop(e0, dd.candles.slice(0, k)); let rs = null;
    if (ts) { for (let j = k; j < end; j++) if (dd.candles[j].c <= ts.stop) { rs = (dd.candles[j + 1] ? dd.candles[j + 1].o : dd.candles[j].c) / e0 - 1; break; } }
    return { sym: t.sym, src: t.src, d: t.d, ret: dd.last / dd.candles[k].o - 1, retStop: rs, spy: spy[spy.length - 1].c / spy[ks].o - 1, days: dd.candles.length - k }; });
  const bySrc = {}; for (const t of tipRows) if (t.ret !== null) { const g = bySrc[t.src] || (bySrc[t.src] = { src: t.src, n: 0, avg: 0, spy: 0, beat: 0, days: 0, withStop: 0 }); g.n++; g.avg += t.ret; g.withStop += (t.retStop === null || t.retStop === undefined ? t.ret : t.retStop); g.spy += t.spy; if (t.ret > t.spy) g.beat++; g.days = Math.max(g.days, t.days); }
  // Self-pruning: once a source has a real record (10+ tips, a month old) and its picks trail the S&P 500, it is muted.
  // Its mentions are still logged and scored, so it can earn its way back, but they no longer appear in the daily message.
  const srcStats = Object.values(bySrc).map(g => ({ ...g, avg: g.avg / g.n, spy: g.spy / g.n, withStop: g.withStop / g.n })).map(g => ({ ...g, judged: g.n >= 10 && g.days >= 20, muted: g.n >= 10 && g.days >= 20 && g.avg < g.spy, trusted: g.n >= 10 && g.days >= 20 && g.avg > g.spy && g.beat / g.n >= 0.5 }));
  const MUTED = new Set(srcStats.filter(g => g.muted).map(g => g.src)), TRUSTED = new Set(srcStats.filter(g => g.trusted).map(g => g.src));
  const tipBoardData = { sources: srcStats, tips: tipRows };
  mergeNightlyPositions(POS_AT_LOAD, myPos);
  const LESSONS = { updated: new Date(now).toISOString(), session, rules: {} };
  for (const [k, r] of Object.entries(live)) {
    const med = [...r.runUp].sort((a, b) => a - b)[Math.floor(r.runUp.length / 2)], avg = r.sum / r.n;
    LESSONS.rules[k] = { name: r.name, n: r.n, win: r.wins / r.n, avg, ends: r.ends, fill: r.fill || null, t1Rate: r.t1n ? r.t1 / r.t1n : null, medianRunUp: med, demoted: r.n >= 10 && avg < 0, last: r.last.slice(-5),
      wasDemoted: Boolean(PREV_LESSONS.rules && PREV_LESSONS.rules[k] && PREV_LESSONS.rules[k].demoted) };
  }
  fs.writeFileSync('data/lessons.json', JSON.stringify(LESSONS, null, 1));
  for (const r of [...quick.map(x => x.row), ...stocks.filter(s => s.state === 'Buy watch')]) { const ls = r.key && LESSONS.rules[r.key]; if (ls) { r.live = { n: ls.n, avg: ls.avg, win: ls.win }; if (ls.demoted) r.demoted = true; } }
  { const SECF = 'data/sectors.json', SC = readJson(SECF, {}); let asked = 0;
    for (const r of [...quick.slice(0, 10).map(x => x.row), ...stocks.filter(s => s.state === 'Buy watch'), ...leadRows]) {
      if (SC[r.sym] === undefined && env.FINNHUB_KEY && asked < 15) { asked++; try { const j = await (await fetch(FH + '/stock/profile2?symbol=' + encodeURIComponent(r.sym) + '&token=' + encodeURIComponent(env.FINNHUB_KEY))).json(); SC[r.sym] = (j && j.finnhubIndustry) || null; } catch (e) {} await sleep(FAST ? 0 : 1100); }
      r.sector = SC[r.sym] || null;
    }
    fs.writeFileSync(SECF, JSON.stringify(SC)); }
  const qn = qFin.length, qs = qFin.filter(x => x.spy !== null);
  const quickRecord = qn ? { n: qn, winRate: qFin.filter(x => x.pct > 0).length / qn, avgPct: qFin.reduce((a, x) => a + x.pct, 0) / qn, avgSpy: qs.length ? qs.reduce((a, x) => a + x.spy, 0) / qs.length : null, days: new Set(qFin.map(x => x.d)).size, stocks: new Set(qFin.map(x => x.sym)).size } : null;   // days / stocks: the full live bar (review S-14, 22 Oct)

  const fin = results.length, wins = results.filter(r => r > 0).length;
  const outcomes = { updated: new Date(now).toISOString(), finished: fin, winRate: fin ? wins / fin : null, avgR: fin ? results.reduce((a, b) => a + b, 0) / fin : null,
    horizons: Object.fromEntries(Object.entries(horizons).map(([h, g]) => [h, { n: g.n, avgReturn: g.ret / g.n, avgBenchmark: g.bench / g.n }])) };
  fs.writeFileSync('data/outcomes.json', JSON.stringify(outcomes, null, 1));
  fs.writeFileSync('data/models.json', JSON.stringify(models, null, 1));
  { const n = await zoyaCheck([...quick.slice(0, 30).map(x => x.row.sym), ...stocks.filter(x => x.state === 'Buy watch').map(x => x.sym), ...Object.keys(myPos)]); if (env.ZOYA_KEY) console.log('Zoya halal checks:', n, zoyaLive() ? '(live)' : '(sandbox)'); }
  { const n = await halalExtCheck([...quick.slice(0, 30).map(x => x.row.sym), ...stocks.filter(x => x.state === 'Buy watch').map(x => x.sym)]); if (n) console.log('other halal checks:', n); }
  fs.writeFileSync('data/signals.json', JSON.stringify({ generatedAt: new Date(now).toISOString(), session, logicVersion: L.LOGIC_VERSION, market: { up: mktUp, ...(() => { let e = spy[0].c; const k = 2 / 51; for (const x of spy) e = x.c * k + e * (1 - k); const last = spy[spy.length - 1].c; return { above50: last > e, spyVs50: +(last / e - 1).toFixed(4) }; })() }, scanned: stocks.length, tested: Object.keys(loaded).length, errors, openTrades, quick: quickPaused ? [] : quick.slice(0, 30).map(x => x.row), quickHeld, pead, evt, quickPaused, quickRecord, posVerdict, peadFunnel, lottery: (() => { const o = {}; for (const [sym, L] of Object.entries(loaded)) { const cs = (L && L.candles) || []; let m = -1; for (let k = Math.max(1, cs.length - 21); k < cs.length; k++) { const a = cs[k - 1].c, b = cs[k].c; if (a > 0 && b > 0 && b / a - 1 > m) m = b / a - 1; } if (m >= 0.15) o[sym] = +m.toFixed(3); } return o; })(), leaders: leadRows, leadFair: { state: fairState, to: FAIR ? FAIR.to : null }, tipBoard: tipBoardData, uni, stocks }, null, 1));
  fs.writeFileSync('data/alert-state.json', JSON.stringify({ day: '', sent: {} }));
  { const n = ledgerAppend(); if (n) console.log('research ledger: ' + n + ' new result' + (n > 1 ? 's' : '') + ' logged'); }
  try { switchPaper(loaded); } catch (e) { console.log('switch paper: ' + e.message); }
  try { await alpacaPaper(readJson('data/signals.json', null), loaded, session); } catch (e) { console.log('Alpaca paper error: ' + e.message); }

  const buys = stocks.filter(s => s.state === 'Buy watch'), near = stocks.filter(s => s.state !== 'Buy watch' && s.trigger && s.trigger / s.last < 1.03).sort((a, b) => a.trigger / a.last - b.trigger / b.last).slice(0, 8);
  const msg = ['Daily scan, ' + session + ' close', 'All prices below are from that close. They do not update. Live prices come in the market-hours alerts.', 'Market: ' + (mktUp ? 'uptrend' : 'downtrend') + (VR.known ? ', volatility ' + (VR.high ? 'HIGH (top fifth of the past year): suggested sizes are halved' : 'normal') : '') + '. Scanned ' + stocks.length + ' stocks' + (QEXTRA.length ? ', plus ' + QEXTRA.length + ' large companies for quick trades' : '') + (QWIDE.length ? ', plus ' + QWIDE.filter(x => loaded[x]).length + ' of the most traded strong companies (wider hunt, quick trades)' : '') + (WIDE.size ? ', plus ' + WIDE.size + ' more liquid companies from the whole market (all rules)' : '') + '.' + (errors.length ? ' ' + errors.length + ' failed to load.' : ''), '', 'ENTRY CONFIRMED (' + buys.length + ')'];
  for (const s of buys) msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ' closed ' + money(s.last) + '\n  buy range ' + money(s.buyLo) + ' to ' + money(s.buyHi) + ' at the next open\n  stop ' + money(s.stop) + (s.target ? ', target ' + money(s.target) + (s.hit !== null && s.hit !== undefined ? ' (reached in ' + Math.round(s.hit * 100) + '% of past trades)' : '') : ', no fixed target') + ', exit on a close below ~' + money(s.exitBelow) + (s.days ? '\n  typical holding time ' + s.days + ' trading days' : '') + '\n  ' + (s.earn || 'earnings date NOT CHECKED') + '\n  ' + L.HALAL_TEXT[s.halal] + '\n  ' + s.why);
  if (!buys.length) msg.push('None today.');
  else msg.push('Manual review only. Check earnings dates and halal status before acting.');
  if (quickPaused) msg.push('', 'QUICK TRADES PAUSED BY THE CIRCUIT BREAKER', 'The last five finished quick paper trades lost ' + Math.abs(lastFive.reduce((a, x) => a + x.pct, 0) * 100).toFixed(1) + '% in total, so no quick trade prices are given.' + (quick.length ? ' Setups still being followed on paper: ' + quick.map(x => x.row.sym).join(', ') + '.' : ''), 'The pause lifts by itself once the last five are positive again.');
  else if (quick.length) msg.push('', 'QUICK TRADES (' + Math.min(quick.length, 3) + (quick.length > 3 ? ' of ' + quick.length : '') + ')', ...quick.slice(0, 3).map(x => x.text));
  else msg.push('', 'QUICK TRADES', 'No setup at this close.');
  for (const x of Object.keys(myPos)) if (!myLines.some(l => l.startsWith(x + ':'))) myLines.push(posLine(x, myPos[x]) + '\n  no price data for this stock today, so it could not be checked');
  if (myLines.length) msg.splice(3, 0, '', 'YOUR POSITIONS (' + myLines.length + ')', ...myLines);
  if (crowd) {     // only names with tested support are shown; the rest are counted and dropped
    const good = [], dropped = [], old = readTips(), day = session;
    for (const x of crowd) {
      const st = stocks.find(k => k.sym === x.sym), q = quick.find(k => k.row.sym === x.sym), tag = x.sym + ' (' + x.mentions + ' mentions' + (x.was ? ', ' + (x.surge ? 'surging from ' : 'was ') + x.was + ' yesterday' : '') + ')';
      if (loaded[x.sym] && !old.some(o => o.sym === x.sym && o.src === 'Reddit crowd' && Date.parse(day) - Date.parse(o.d) < 7 * 86400000)) fs.appendFileSync(TIP_FILE, JSON.stringify({ sym: x.sym, src: 'Reddit crowd', d: day, p0: loaded[x.sym].last, below: null, ts: now }) + '\n');
      if (BIOBLOCK.has(x.sym) || blocked.some(b => b.startsWith(x.sym + ':') || b.startsWith(x.sym + ' '))) dropped.push(x.sym + ' (blocked)');
      else if (st && st.state === 'Buy watch') good.push(tag + ': ENTRY CONFIRMED by a tested rule. Its prices are in the CONCLUSION.');
      else if (q) good.push(tag + ': a tested quick trade setup fired. See QUICK TRADES.');
      else if (st && st.proven && st.trigger && st.trigger / st.last < 1.15) good.push(tag + ': BUY WATCH. Needs a daily close above ~' + money(st.trigger) + ', ' + ((st.trigger / st.last - 1) * 100).toFixed(1) + '% away.');
      else dropped.push(x.sym);
    }
    if (MUTED.has('Reddit crowd')) msg.push('', 'CROWD RADAR', 'Muted: over its record so far, Reddit\u2019s most-mentioned stocks have trailed the S&P 500. Still being scored; it returns if that changes.');
    else msg.push('', 'CROWD RADAR (Reddit\u2019s most-mentioned stocks, filtered by the tested rules)', ...(good.length ? good : ['None of the crowd\u2019s favourites has tested support today.']), 'Checked ' + crowd.length + ', dropped ' + dropped.length + ' with no tested support' + (dropped.length ? ': ' + dropped.join(', ') : '') + '. The crowd is scored like any source: send   sources');
  }
  if (chan.mentions.length) {
    const good = [], dropped = [], old = readTips();
    for (const x of chan.mentions) {
      const st = stocks.find(k => k.sym === x.sym), q = quick.find(k => k.row.sym === x.sym), src = 'YouTube: ' + x.name, tag = x.sym + ' (' + x.name + (TRUSTED.has(src) ? ', a source that has beaten the market so far' : '') + ': "' + x.title + '")';
      if (!loaded[x.sym]) continue;                                   // not a real ticker: ignore it
      if (!old.some(o => o.sym === x.sym && o.src === src && Date.parse(session) - Date.parse(o.d) < 7 * 86400000)) fs.appendFileSync(TIP_FILE, JSON.stringify({ sym: x.sym, src, d: session, p0: loaded[x.sym].last, below: null, ts: now }) + '\n');
      if (MUTED.has(src)) { if (!dropped.includes('(' + x.name + ' is muted: its record trails the market)')) dropped.push('(' + x.name + ' is muted: its record trails the market)'); }
      else if (BIOBLOCK.has(x.sym)) dropped.push(x.sym + ' (blocked)');
      else if (st && st.state === 'Buy watch') good.push(tag + ': ENTRY CONFIRMED by a tested rule. Its prices are in the CONCLUSION.');
      else if (q) good.push(tag + ': a tested quick trade setup fired. See QUICK TRADES.');
      else if (st && st.proven && st.trigger && st.trigger / st.last < 1.15) good.push(tag + ': BUY WATCH. Needs a daily close above ~' + money(st.trigger) + '.');
      else dropped.push(x.sym + ' (' + x.name + ')');
    }
    msg.push('', 'FOLLOWED CHANNELS (stocks named in the last 3 days, filtered by the tested rules)', ...(good.length ? good : ['No stock named by your channels has tested support today.']), dropped.length ? 'Named but no tested support: ' + dropped.join(', ') + '.' : '', 'Each channel is scored: send   sources');
  }
  if (blocked.length) msg.push('', 'BLOCKED, EVENT OR NEWS RISK (' + blocked.length + ')', ...blocked.slice(0, 8), 'No prices are given for blocked stocks.');
  if (exits.length) msg.push('', 'SELL / REASSESS WATCH (paper trades)', ...exits);
  if (near.length) { msg.push('', 'BUY WATCH, WAITING FOR CONFIRMATION'); near.forEach(s => msg.push(s.sym + (DISC.has(s.sym) ? ' (discovery candidate)' : '') + ': needs a close above ~' + money(s.trigger) + ' (closed ' + money(s.last) + ')')); }
  if (picks.length) { picks.sort((a, b) => a.tier - b.tier); msg.push('', 'DISCOVERY PICKS WITH PRICES (' + picks.length + ')', ...picks.slice(0, 12).map(x => x.text)); if (picks.length > 12) msg.push('...and ' + (picks.length - 12) + ' more on the page.'); }
  if (weak.length) msg.push('', 'NO PLAN, POOR ODDS (' + weak.length + ')', 'The reward marker came before the stop in under 25% of past cases, so no prices are given: ' + weak.join(', ') + '.');
  if (quickRecord) msg.push('', 'Quick trade scoreboard: ' + quickRecord.n + ' finished, ' + Math.round(quickRecord.winRate * 100) + '% wins, average ' + (quickRecord.avgPct * 100).toFixed(2) + '% a trade' + (quickRecord.avgSpy !== null ? ' (S&P 500 ' + (quickRecord.avgSpy * 100).toFixed(2) + '% over the same days)' : '') + '.');
  if (fin) msg.push('', 'Paper record: ' + fin + ' finished, ' + Math.round(wins / fin * 100) + '% wins, average ' + outcomes.avgR.toFixed(2) + 'R.');
  if (FMOVERS.length) msg.push('', 'TODAY\'S FAST MOVERS, VERDICT', ...FMOVERS.map(x => x + ': ' + (quick.some(q => q.row.sym === x) ? 'a tested rule fired. See QUICK TRADES for its prices.' : !loaded[x] ? 'no price history available. No trade.' : loaded[x].candles.length < 600 ? 'too new to test (under three years of prices). No trade.' : 'no tested rule fired on it. No trade.')));
  msg.splice(1, 0, ...conclusion(readJson('data/signals.json', null), myPos), '', 'DETAILS');
  // Scan health: what was asked for, what came back, and which feeds were off. If a feed failed, say so rather than show an empty list.
  const fm = readJson('data/fm-state.json', {}), health = ['SCAN HEALTH', 'Prices: ' + LIST.length + ' requested, ' + (LIST.length - errors.length) + ' returned' + (errors.length ? ', ' + errors.length + ' failed (' + errors.slice(0, 8).join(', ') + (errors.length > 8 ? '\u2026' : '') + ')' : '') + '.',
    'Earnings check (Finnhub): ' + (env.FINNHUB_KEY ? 'on' : 'OFF, no key') + '. Live fast movers (FMP, run by the bot): ' + (fm.off ? 'OFF today: ' + fm.off : Object.keys(fm.sent || {}).length ? 'on, ' + Object.keys(fm.sent).length + ' alerted today' : fm.day ? 'on, none alerted today' : 'no report from the bot yet') + '.',
    'Crowd radar (ApeWisdom): ' + (env.NO_CROWD ? 'off' : crowd ? 'on, ' + crowd.length + ' names checked' : 'UNREACHABLE today') + '.',
    'Followed channels: ' + (chan.channels ? chan.ok + ' of ' + chan.channels + ' reachable, ' + chan.mentions.length + ' stocks named in the last 3 days' : 'none followed yet. Send the bot: follow NAME CHANNEL-ID') + '.',
    'Discovery list: ' + (DISCMETA && DISCMETA.session ? 'from the ' + DISCMETA.session + ' close, ' + DISC.size + ' candidates' : 'not received') + '. Journal: ' + journal.length + ' entries, ' + (sig0 => sig0 ? 'last scan ' + sig0.session : 'first scan')(readJson('data/signals.json', null)) + '.'];
  // OPTIONS DATA PROBE (read-only, one request): does the Massive key include options data? Needed before any options-flow study.
  if (env.MASSIVE_KEY) { let st = 'no answer', fields = []; try { const r = await fetch(MV_HOSTS[mvHost] + '/v3/snapshot/options/AAPL?limit=1&apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); st = 'HTTP ' + r.status;
      if (r.ok) { const j = await r.json(), o = j && j.results && j.results[0]; if (o) fields = ['day', 'greeks', 'implied_volatility', 'open_interest', 'last_trade', 'last_quote'].filter(k => o[k] !== undefined && o[k] !== null); } } catch (e) { st = e.message; }
    fs.writeFileSync('data/options-probe.json', JSON.stringify({ at: new Date().toISOString(), status: st, fields }, null, 1));
    health.push('Options data (Massive): ' + (fields.length ? 'AVAILABLE with ' + fields.join(', ') + '. An options-flow study can be built.' : st === 'HTTP 403' || st === 'HTTP 401' ? 'NOT included in your plan (' + st + '). Nothing to do; stocks are unaffected.' : 'not available (' + st + ').')); }
  try { const oc = await optionsShadow(); if (oc) health.push(oc); } catch (e) { health.push('Options paper test: error (' + e.message + ')'); }
  if (errors.length > LIST.length * 0.2) health.push('WARNING: more than a fifth of the prices failed to load. Treat this scan as incomplete.');
  msg.push('', ...health);
  fs.writeFileSync('data/scan-report.txt', msg.join('\n') + '\n\n' + leadOut.join('\n'));
  const healthBad = errors.length > LIST.length * 0.2;
  // ---- Weekly review: sent with the scan of each Friday close (or when WEEKLY is set)
  if (!QUIET() && (new Date(session + 'T12:00:00Z').getUTCDay() === 5 || env.WEEKLY)) {
    const pc = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', si = spy.length - 1, SEC = { SPY: 'Index funds', QQQ: 'Index funds', IWM: 'Index funds', DIA: 'Index funds', AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Technology', AVGO: 'Technology', AMD: 'Technology', ORCL: 'Technology', CRM: 'Technology', AMZN: 'Consumer discretionary', TSLA: 'Consumer discretionary', HD: 'Consumer discretionary', GOOGL: 'Communication', META: 'Communication', NFLX: 'Communication', DIS: 'Communication', JPM: 'Financials', BAC: 'Financials', V: 'Financials', MA: 'Financials', UNH: 'Health care', LLY: 'Health care', JNJ: 'Health care', XOM: 'Energy', CVX: 'Energy', WMT: 'Consumer staples', COST: 'Consumer staples', PG: 'Consumer staples', KO: 'Consumer staples', PEP: 'Consumer staples' };
    const w = ['Weekly review, week ending ' + session, 'S&P 500 fund: ' + pc(spy[si].c / spy[si - 5].c - 1) + ' this week, market ' + (mktUp ? 'in an uptrend' : 'in a downtrend') + '.'];
    const bySec = {}; for (const x of wk) { const k = SEC[x.sym]; if (!k || k === 'Index funds') continue; const g = bySec[k] || (bySec[k] = { n: 0, chg: 0, up: 0 }); g.n++; g.chg += x.chg; g.up += x.up ? 1 : 0; }
    const secs = Object.entries(bySec).sort((a, b) => b[1].chg / b[1].n - a[1].chg / a[1].n);
    if (secs.length) w.push('', 'SECTORS, strongest first', ...secs.map(([k, g]) => k + ': ' + pc(g.chg / g.n) + ', ' + g.up + ' of ' + g.n + ' in uptrend'));
    const sorted = [...wk].sort((a, b) => b.chg - a.chg);
    if (sorted.length >= 6) w.push('', 'BIGGEST MOVES ON YOUR LIST', 'Up: ' + sorted.slice(0, 3).map(x => x.sym + ' ' + pc(x.chg)).join(', '), 'Down: ' + sorted.slice(-3).reverse().map(x => x.sym + ' ' + pc(x.chg)).join(', '));
    const better = wk.filter(x => x.up && !x.wasUp).map(x => x.sym), worse = wk.filter(x => !x.up && x.wasUp).map(x => x.sym);
    w.push('', 'TREND CHANGES', 'Moved into an uptrend: ' + (better.join(', ') || 'none'), 'Fell out of an uptrend: ' + (worse.join(', ') || 'none'));
    const weekStart = new Date(Date.parse(session) - 6 * 86400000).toISOString().slice(0, 10), newSig = [...journal, ...fresh].filter(x => x.d >= weekStart);
    w.push('', 'SIGNALS THIS WEEK', newSig.length ? newSig.length + ' logged. Quick trades: ' + newSig.filter(x => x.kind === 'quick').length + '. Confirmed entries: ' + newSig.filter(x => x.kind !== 'quick').length + '.' : 'None. A quiet week is a normal result.');
    const fams = Object.entries(famRes);
    if (fams.length) w.push('', 'WHAT IS WORKING, all finished paper trades', ...fams.map(([k, g]) => k + ': ' + g.n + ' finished, ' + Math.round(g.win / g.n * 100) + '% wins, average ' + pc(g.pct / g.n) + (g.week ? ' (' + g.week + ' ended this week)' : '')), (results.length + qFin.length) < 20 ? 'Fewer than 20 finished trades: too few to judge.' : '');
    else w.push('', 'WHAT IS WORKING', 'No paper trade has finished yet.');
    if (DISCMETA && DISCMETA.candidates) { const bl = DISCMETA.candidates.filter(c => c.bio && (c.bio.risk === 'high' || c.bio.risk === 'unknown')).length; w.push('', 'DISCOVERY', DISCMETA.candidates.length + ' candidates on the list' + (bl ? ', ' + bl + ' blocked for binary event risk' : '') + '.' + (DISCMETA.record ? ' Earlier picks after 4+ weeks: ' + pc(DISCMETA.record.avgReturn) + ' on average, S&P 500 ' + pc(DISCMETA.record.avgSpy) + ' (' + DISCMETA.record.n + ' stocks).' : ' Their results are counted after four weeks.')); }
    if (tipBoardData.sources.length) w.push('', 'TIP SOURCES', ...tipBoardData.sources.map(g => g.src + ': ' + g.n + ' tips, average ' + pc(g.avg) + ' against ' + pc(g.spy) + ' for the S&P 500' + (g.n < 10 || g.days < 20 ? ' (too early to judge)' : '')));
    w.push('', 'FOR NEXT WEEK', 'Check earnings dates and halal status on the page before acting on anything. Research only: nothing here is an order.');
    await telegram(w.filter(x => x !== '').join('\n').replace(/\n(SECTORS|BIGGEST|TREND|SIGNALS|WHAT|DISCOVERY|TIP SOURCES|FOR NEXT)/g, '\n\n$1') + '\n' + FOOT);
  }
  // ---- The last message of the night. Quiet mode (the default): ONE action message. Otherwise the PLAN, YOUR STOCKS and the Friday study.
  if (QUIET()) { const sg = readJson('data/signals.json', null);
    await telegram(await actionsText(sg, loadPos(), null, 'ACTIONS FOR THE NEXT SESSION (' + session + ' close). Market opens 4:30 pm Kuwait (5:30 pm from November).') + (healthBad ? '\n\nWARNING: over a fifth of the prices failed to load tonight. Treat this as incomplete.' : '') + ([2, 4, 5].includes(new Date(session + 'T12:00:00Z').getUTCDay()) ? '\n\n' + (new Date(session + 'T12:00:00Z').getUTCDay() === 5 ? 'WEEKLY ' : 'MID-WEEK ') + scorecardText() : '') + '\n\nTap a button below after you act: I record it for you.', tradeButtons(sg, loadPos()));
    if (new Date(session + 'T12:00:00Z').getUTCDay() === 5 && fs.existsSync('data/options-shadow.json')) await telegram(optionsText());   // options: its own separate weekly message, never inside ACTIONS
  }
  else {
  // ---- The last message of the night: one short plan. Everything above it is background.
  { const sg = readJson('data/signals.json', null);
    await telegram(planText(sg, loadPos(), null, 'PLAN FOR THE NEXT SESSION, from the ' + session + ' close. Market opens 4:30 pm Kuwait (5:30 pm from November).')
      + (healthBad ? '\n\nWARNING: over a fifth of the prices failed to load tonight. Treat this plan as incomplete.' : '')
      + '\n\n' + myRecord() + '\nNightly report: send  report   Your record: send  record' + '\n' + FOOT);
    // every night: one clear action for each stock you own (sell all, sell part, hold, or buy a little more), sent without being asked
    if (Object.keys(loadPos()).length) { try { await telegram(await holdingsText(sg, loadPos(), 'YOUR STOCKS: what to do at the next open (4:30 pm Kuwait)') + '\n' + FOOT); } catch (e) { console.log('holdings message: ' + e.message); } }
    // every Friday close: the full HOLD OR SELL study of every stock you own, sent without being asked
    const mine = Object.keys(loadPos());
    if (mine.length && (new Date(session + 'T12:00:00Z').getUTCDay() === 5 || env.REVIEW_ALL)) {
      const parts = []; for (const x of mine.slice(0, 10)) { try { parts.push(await reviewReply(x, sg, loadPos())); } catch (e) {} }
      if (parts.length) await telegram('WEEKLY REVIEW OF YOUR STOCKS (automatic, every Friday close)\n\n' + parts.join('\n\n') + '\n' + FOOT); } }
  }
  console.log('daily scan done:', stocks.length, 'stocks,', buys.length, 'buy watch,', fresh.length, 'journal entries');
}

async function intraday(onlyMine) {
  const now = Date.now();
  const sig = readJson('data/signals.json', null);
  await tgCommands(sig);
  if (env.BOT_ONLY) return;   // fast reply loop: answer messages only; the full checks run every few minutes
  await preMarket(sig);
  if (onlyMine) await sundayScoreboard();   // once every Sunday, Kuwait time (review S-2)
  if (onlyMine) { await fastMovers(); await watchdog(sig); }
  if (onlyMine && (!Object.keys(loadPos()).length || new Date(now).getUTCMinutes() % 15 >= 5)) return;   // chat mode: your positions only, about every 15 minutes
  if (!marketOpen(now) && !env.FORCE) { console.log('Market closed. Nothing to do.'); return; }
  if (!sig) { console.log('No daily scan yet.'); return; }
  const myPos = loadPos();
  const st = readJson('data/alert-state.json', { day: '', sent: {} }), day = ny(now).d; if (st.day !== day) { st.day = day; st.sent = {}; }
  const OKI = new Set(planCands(sig, loadPos()).filter(x => x.ok).map(x => x.sym)), buys = sig.stocks.filter(s => s.state === 'Buy watch' && OKI.has(s.sym)), trig = sig.stocks.filter(s => s.state !== 'Buy watch' && s.proven && s.trigger && s.trigger / s.last < 1.03);
  const qk = sig.quick || [], planBuys = planCands(sig, myPos).filter(x => x.ok);
  const buyNowCards = [];
  const watch = onlyMine ? Object.keys(myPos).slice(0, 12) : [...new Set([...Object.keys(myPos), ...planBuys.map(s => s.sym), ...qk.map(s => s.sym), ...(sig.leaders || []).map(s => s.sym), ...buys.map(s => s.sym), ...(sig.openTrades || []).map(t => t.sym), ...trig.map(s => s.sym)])].slice(0, 40), alerts = [];
  const seen = {};
  for (const sym of watch) {
    const j = await liveQ((sym)), p = +j.price; if (!(p > 0)) continue; seen[sym] = p; const fresh = !j.t || Date.now() - j.t < 20 * 60000;   // STALE-QUOTE GATE: no BUY NOW on a price older than 20 minutes
    const say = (k, text) => { if (!st.sent[sym + k]) { st.sent[sym + k] = 1; alerts.push(sym + ' at ' + money(p) + ': ' + text); } };
    const b = buys.find(s => s.sym === sym), t = trig.find(s => s.sym === sym), qs0 = OKI.has(sym) ? qk.find(s => s.sym === sym) : null, mp = myPos[sym];
    if (mp) {   // you told the bot you bought this one
      const chg = ' You bought at ' + money(mp.entry) + ' (' + (p >= mp.entry ? '+' : '') + ((p / mp.entry - 1) * 100).toFixed(1) + '%).';
      if (mp.stop && p <= mp.stop) say('myst', 'YOUR POSITION: STOP LOSS REACHED (' + money(mp.stop) + '). Sell / reassess now.' + chg);
      else if (mp.t2 && p >= mp.t2) say('myt2', 'YOUR POSITION: TARGET 2 REACHED (' + money(mp.t2) + ').' + chg);
      else if (mp.t1 && p >= mp.t1 && !mp.trail) say('myt1', 'YOUR POSITION: ' + t1Text(sym, mp) + chg);
    }
    const pb = mp ? null : planBuys.find(x => x.sym === sym);
    if (pb && fresh && p >= pb.lo && p <= pb.hi && !st.sent[sym + 'buynow']) { st.sent[sym + 'buynow'] = 1; buyNowCards.push({ sym, p, text: planText(sig, myPos, { [sym]: p }, sym + ' is inside its buy range now', [sym]) }); }
    const qs = mp || (pb && st.sent[sym + 'buynow']) ? null : qs0;
    if (qs) {   // a quick trade setup from last night's close
      if (p > qs.buyHi) say('qhi', 'QUICK TRADE: above its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). The dip is gone. Skip it.');
      else if (p <= qs.stop) say('qlo', 'QUICK TRADE: already at its invalidation level ' + money(qs.stop) + '. The setup has failed.');
      else if (p < qs.buyLo) say('qlow', 'QUICK TRADE: below its planned entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + ') and above the invalidation level ' + money(qs.stop) + '. The dip is still running. A lower entry than planned, but no bounce yet. Manual review only.');
      else say('qin', 'QUICK TRADE: trading inside its entry range (' + money(qs.buyLo) + ' to ' + money(qs.buyHi) + '). Invalidation ' + money(qs.stop) + (qs.t1 ? ', target 1 ' + money(qs.t1) : '') + '. Manual review only.');
    }
    const ld = mp || !OKI.has(sym) ? null : (sig.leaders || []).find(s => s.sym === sym);
    if (ld) {   // a leader picked at last night's close
      if (p <= ld.stop) say('lst', 'LEADER: already at its stop ' + money(ld.stop) + '. Skip it.');
      else if (p > ld.buyHi) say('lhi', 'LEADER: above its buy range (' + money(ld.buyLo) + ' to ' + money(ld.buyHi) + '). Do not chase. It is a buy again only if it comes back into the range.');
      else say('lin', 'LEADER: in its buy range now (' + money(ld.buyLo) + ' to ' + money(ld.buyHi) + '). Stop ' + money(ld.stop) + '. Sell when it closes under its trailing stop or its 50 day average. If you buy, tell me: bought ' + sym + ' ' + money(p));
    }
    if (b && p > b.buyHi) say('hi', 'above its buy range (' + money(b.buyLo) + ' to ' + money(b.buyHi) + '). Too late for this signal.');
    if (b && p <= b.stop) say('lo', 'already down to its stop level ' + money(b.stop) + '. The signal has failed.');
    if (t && p >= t.trigger) say('tr', 'NOTHING TO DO YET: it is trying to break out above ' + money(t.trigger) + '. If it CLOSES above that tonight, the night scan checks it and puts it in ACTIONS with a buy range, stop and sell prices if it passes. Do not buy from this message.');
    for (const o of (sig.openTrades || []).filter(x => x.sym === sym)) {
      if (QUIET()) continue;   // the system's own paper trades are not yours: no alerts about them in quiet mode (they are scored in  shadow )
      if (p <= o.stop) say('st' + o.since, 'SELL / REASSESS WATCH. Paper trade from ' + o.since + ' is at its stop ' + money(o.stop) + '.');
      if (o.t1 && p >= o.t1) say('t1' + o.since, 'QUICK TRADE: paper trade from ' + o.since + ' reached Target 1 at ' + money(o.t1) + '. Review, or take part of the profit.');
      if (o.target && p >= o.target) say('tg' + o.since, 'paper trade from ' + o.since + ' reached its target ' + money(o.target) + '.');
    }
  }
  // ONE MARKET-OPEN CHECK a day, so you always know the system is running and where each holding stands, even when no alert fires.
  let openMsg = null;
  if (!onlyMine && !st.sent.__open && Object.keys(seen).length) {
    st.sent.__open = 1;
    const kt = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' });
    const posL = Object.entries(myPos).filter(([k]) => seen[k]).map(([k, P]) => { const p = seen[k], g = p / P.entry - 1;
      return k + ' ' + money(p) + ' (' + (g >= 0 ? '+' : '') + (g * 100).toFixed(1) + '% from your ' + money(P.entry) + ')' + (P.stop ? ' | stop ' + money(P.stop) + ' (' + ((P.stop / p - 1) * 100).toFixed(1) + '%)' : ' | NO STOP SET') + (P.t1 ? ' | target ' + money(P.t1) + ' (+' + ((P.t1 / p - 1) * 100).toFixed(1) + '%)' : '') + ': ' + (P.stop && p <= P.stop ? 'SELL NOW: the stop is reached' : P.lastAct && /^SELL/.test(P.lastAct.act) && !/trend is broken/.test(P.lastAct.why || '') ? P.lastAct.act + ' (from the review of ' + P.lastAct.d + ': ' + P.lastAct.why + ')' : 'HOLD'); });
    const buyL = planBuys.filter(x => seen[x.sym] && !myPos[x.sym]).map(x => { const p = seen[x.sym]; return x.sym + ' ' + money(p) + ' | buy range ' + money(x.lo) + ' to ' + money(x.hi) + ': ' + (p > x.hi ? 'ABOVE the range, do not chase' : p < x.lo ? 'below the range, wait' : 'INSIDE the range'); });
    openMsg = ['MARKET OPEN CHECK (' + kt + ' Kuwait). The system is running.', '', 'YOUR POSITIONS', ...(posL.length ? posL : ['none recorded']), '', 'PROVEN BUYS TODAY', ...(buyL.length ? buyL : ['none. Nothing passed the test last night. I will message you the moment one does.']), '', 'I check every 30 minutes and message you only when something happens: a stop, a target, a sell rule, or a proven buy inside its range.'].join('\n');
  }
  fs.writeFileSync('data/alert-state.json', JSON.stringify(st));
  if (openMsg) await telegram(openMsg + '\n' + FOOT);
  alerts.sort((a, b) => (b.includes('YOUR POSITION') ? 1 : 0) - (a.includes('YOUR POSITION') ? 1 : 0));
  for (const bc of buyNowCards) { const cd = planCands(sig, myPos).find(x => x.sym === bc.sym && x.ok), sh = cd ? Math.max(1, Math.floor(amountFor(cd, sig.market, false).usd / bc.p)) : null;
    await telegram('BUY NOW: a proven setup is inside its buy range (' + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit' }) + ' Kuwait)\n\n' + bc.text + '\n\nTap after you act: I record it for you.\n' + FOOT,
      [[{ text: 'Bought ' + bc.sym + (sh ? ' (' + sh + ' sh at ~' + money(bc.p) + ')' : ''), data: 'b|' + bc.sym + '|' + (sh || 0) }, { text: 'Skipped', data: 's|' + bc.sym }]]); }
  if (alerts.length) await telegram('Market hours check\n\n' + alerts.join('\n\n') + '\n' + FOOT);
  console.log('intraday check done:', watch.length, 'watched,', alerts.length, 'new alerts');
}

await (MODE === 'chat' ? intraday(true) : MODE === 'intraday' ? intraday() : daily());
