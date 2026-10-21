// EVENT_ORB_RETEST_15D_V1 bars adapter (research only). For every request in the lane's request files it fetches 1-minute bars
// from the same Massive endpoint orb-study.mjs uses (/v2/aggs/ticker/{sym}/range/1/minute/{from}/{to}, adjusted, paged by
// next_url), aggregates them to 5-minute regular-session bars (New York 09:30-15:55 bar starts) and writes the bar manifest the
// frozen core expects: { barMinutes: 5, series: { SYM: [{t,o,h,l,c,v,vw}, ...] } }. Per stock-day 5-minute bars are cached in
// fm-cache/evr-min.json.gz (same folder and same budget variables as orb-study: EVR_CALLS / EVR_MINUTES, defaults 2500 / 35).
// If the minute-bar plan refuses (HTTP 401/403) the manifest records status "needs data" with the exact error.
// Request files: EVENT_ORB_REQUEST_FILES (comma separated; default the event requests and the control requests).
// Exports fetchStockDays(sym, days) for the gates script (SPY same-minutes yardstick), using the identical fetch and cache.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { nyOffset } from './ignition-core.mjs';
const env = process.env, CDIR = env.FM_CACHE_DIR || 'fm-cache', MC = CDIR + '/evr-min.json.gz', VER = 1;
const OUT = env.EVENT_ORB_BARS || 'data/event-orb-retest-15d-bars.json';
const FILES = (env.EVENT_ORB_REQUEST_FILES || 'data/event-orb-retest-15d-requests.json,data/event-orb-retest-15d-control-requests.json').split(',').map(x => x.trim()).filter(Boolean);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TEST = local(env.MASSIVE_BASE), PX = TEST || 'https://api.massive.com';
const sleep = (ms) => new Promise(r => setTimeout(r, TEST ? 0 : ms)), J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(CDIR, { recursive: true });
export let calls = 0, refused = null; const t0 = Date.now(), BUDGET = +(env.EVR_CALLS || 2500), MAXMS = +(env.EVR_MINUTES || 35) * 60000;
async function api(path) { if (!env.MASSIVE_KEY) { refused = 'MASSIVE_KEY is not set in this environment'; return null; } for (let a = 0; a < 3; a++) { if (calls) await sleep(150); calls++;
  let r; try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { await sleep(3000); continue; }
  if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401 || r.status === 403) { refused = 'HTTP ' + r.status + ' from the minute-bar endpoint (plan limit?)'; return null; } if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
let mc = { _v: VER, d: {}, done: {} }; try { const x = JSON.parse(zlib.gunzipSync(fs.readFileSync(MC)).toString()); if (x._v === VER) mc = x; } catch (e) {}
const saveCache = () => fs.writeFileSync(MC, zlib.gzipSync(JSON.stringify(mc)));
const dayList = (from, to) => { const out = []; for (let ms = Date.parse(from + 'T12:00:00Z'); ms <= Date.parse(to + 'T12:00:00Z'); ms += 864e5) { const wd = new Date(ms).getUTCDay(); if (wd !== 0 && wd !== 6) out.push(new Date(ms).toISOString().slice(0, 10)); } return out; };
// 1-minute rows of one New York day -> 5-minute regular-session bars [t, o, h, l, c, v, vw]
function toFive(rows, day) {
  const off = nyOffset(day), B = new Map();
  for (const r of rows) { const m = Math.floor(((r.t / 60000) + off) % 1440 + 1440) % 1440; if (m < 570 || m >= 960) continue; const t5 = Math.floor(r.t / 300000) * 300000; let b = B.get(t5);
    const o = +r.o, h = +r.h, l = +r.l, c = +r.c, v = +(r.v || 0), vw = Number.isFinite(+r.vw) ? +r.vw : (h + l + c) / 3;
    if (!b) B.set(t5, b = { t: t5, o, h, l, c, v, pv: vw * v }); else { b.h = Math.max(b.h, h); b.l = Math.min(b.l, l); b.c = c; b.v += v; b.pv += vw * v; } }
  return [...B.values()].sort((a, b) => a.t - b.t).map(b => [b.t, +b.o.toPrecision(7), +b.h.toPrecision(7), +b.l.toPrecision(7), +b.c.toPrecision(7), Math.round(b.v), +(b.v > 0 ? b.pv / b.v : (b.h + b.l + b.c) / 3).toPrecision(7)]);
}
/** Fetches (or reads from the cache) the 5-minute regular-session bars of `sym` on the New York dates in `days`. Returns {bars, missing}. */
export async function fetchStockDays(sym, days) {
  const need = [...new Set(days)].filter(d => !(sym + '|' + d in mc.d) && !mc.done[sym + '|' + d]).sort();
  if (need.length && !refused && calls < BUDGET && Date.now() - t0 <= MAXMS) {
    const runs = []; for (const d of need) { const r = runs[runs.length - 1]; if (r && (Date.parse(d) - Date.parse(r[1])) / 864e5 <= 4 && (Date.parse(d) - Date.parse(r[0])) / 864e5 < 60) r[1] = d; else runs.push([d, d]); }
    for (const [a, b] of runs) { if (refused || calls >= BUDGET || Date.now() - t0 > MAXMS) break; let path = `/v2/aggs/ticker/${sym}/range/1/minute/${a}/${b}?adjusted=true&sort=asc&limit=50000`, all = [], ok = true;
      while (path) { const j = await api(path); if (!j) { ok = false; break; } all = all.concat(j.results || []); path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '').replace(/[?&]apiKey=[^&]*/, '') : null; }
      if (!ok) continue;
      const off = nyOffset(a), byDay = {}; for (const r of all) { const d = new Date(r.t + off * 60000).toISOString().slice(0, 10); (byDay[d] = byDay[d] || []).push(r); }
      for (const d of dayList(a, b)) { const key = sym + '|' + d, five = toFive(byDay[d] || [], d); mc.done[key] = 1; if (five.length) mc.d[key] = five; } }
  }
  const bars = [], missing = [];
  for (const d of [...new Set(days)].sort()) { const x = mc.d[sym + '|' + d]; if (x) bars.push(...x.map(b => ({ t: b[0], o: b[1], h: b[2], l: b[3], c: b[4], v: b[5], vw: b[6] }))); else if (!mc.done[sym + '|' + d]) missing.push(d); }
  return { bars, missing };
}
export const budget = () => ({ calls, budget: BUDGET, refused, minutes: +((Date.now() - t0) / 60000).toFixed(1), maxMinutes: MAXMS / 60000 });
export const save = saveCache;

async function main() {
  const requests = [], sources = {};
  for (const f of FILES) { const j = J(f, null); if (!j) { sources[f] = 'missing'; continue; } sources[f] = { status: j.status, requests: (j.requests || []).length }; for (const r of j.requests || []) requests.push({ ...r, file: f }); }
  const bySym = new Map(); for (const r of requests) { let s = bySym.get(r.sym); if (!s) bySym.set(r.sym, s = new Set()); for (const d of dayList(r.from, r.to)) s.add(d); }
  const totalDays = [...bySym.values()].reduce((a, s) => a + s.size, 0), haveBefore = [...bySym.entries()].reduce((a, [s, set]) => a + [...set].filter(d => (s + '|' + d in mc.d) || mc.done[s + '|' + d]).length, 0);
  console.log('evr-bars: ' + requests.length + ' requests, ' + bySym.size + ' stocks, ' + totalDays + ' stock-days needed, ' + haveBefore + ' cached, budget ' + BUDGET + ' calls / ' + MAXMS / 60000 + ' min');
  const series = {}; let covered = 0, partial = 0, uncovered = 0, stockDaysMissing = 0;
  // oldest requests first so that repeated runs extend the history backwards consistently
  const order = [...bySym.entries()].sort((a, b) => [...a[1]].sort()[0] < [...b[1]].sort()[0] ? -1 : 1);
  for (const [sym, set] of order) { const { bars, missing } = await fetchStockDays(sym, [...set]); series[sym] = bars; stockDaysMissing += missing.length; }
  saveCache();
  for (const r of requests) { const days = dayList(r.from, r.to), have = days.filter(d => mc.d[r.sym + '|' + d]).length, known = days.filter(d => mc.done[r.sym + '|' + d]).length; r.coverage = { sessions: days.length, withBars: have, known }; if (have === days.length) covered++; else if (known === days.length) partial++; else uncovered++; }
  const status = refused && !Object.keys(series).some(s => series[s].length) ? 'needs data' : (uncovered ? 'INCREMENTAL' : 'OK');
  const out = { generatedAt: new Date().toISOString(), barMinutes: 5, status, allowBuy: false, why: refused || null, source: PX + ' /v2/aggs/ticker/{sym}/range/1/minute (adjusted), aggregated to 5-minute regular-session bars (New York 09:30-15:55 starts); vw = volume-weighted price of the minute bars',
    coverage: { requestFiles: sources, requests: requests.length, requestsFullyCovered: covered, requestsKnownWithGaps: partial, requestsNotYetFetched: uncovered, stocks: bySym.size, stockDaysNeeded: totalDays, stockDaysCachedBefore: haveBefore, stockDaysStillMissing: stockDaysMissing, ...budget() },
    requests: requests.map(r => ({ sym: r.sym, from: r.from, to: r.to, eventId: r.eventId, file: r.file, coverage: r.coverage })), series };
  fs.writeFileSync(OUT, JSON.stringify(out));
  fs.writeFileSync(env.EVENT_ORB_BARS_COVERAGE || 'data/event-orb-retest-15d-bars-coverage.json', JSON.stringify({ generatedAt: out.generatedAt, status, why: out.why, barMinutes: 5, coverage: out.coverage, fiveMinuteBars: Object.values(series).reduce((a, b) => a + b.length, 0) }, null, 1));   // small, committed; the manifest itself is not
  console.log('evr-bars: ' + status + (refused ? ' (' + refused + ')' : '') + '; ' + calls + ' calls; covered ' + covered + ' of ' + requests.length + ' requests (' + partial + ' known with gaps, ' + uncovered + ' not fetched); series ' + Object.keys(series).length + ' stocks, ' + Object.values(series).reduce((a, b) => a + b.length, 0) + ' five-minute bars');
}
if (process.argv[1] && /event-orb-retest-bars\.mjs$/.test(process.argv[1])) await main();
