// SQUAD 32: PATHWAYS LAB (owner, 17 Nov 2026). Rules and verdict: squad32-core.mjs (pre-registered there before any number).
// Events: data/squad32-spinoffs.json (SEC EDGAR full-index Form 10-12B filers 2020-2026 + SEC submissions tickers) and
// data/squad32-sp500-changes.json (Wikipedia "Historical components of the S&P 500" change table, effective date, S&P announcement date
// from the cited S&P press release). Prices: the squad30 5-year whole-market cache (restored read only; dead stocks included).
// Spin-offs whose SEC record has no ticker (often delisted) are looked up by CIK in the Massive reference list, so failed spin-offs count.
// Writes data/squad32-lab.json. Never places an order. Halal: owner's ZAD marks only (data/halal.json); research only, not advice.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { RULES32, SPLIT, posOnOrAfter, spinStart, tradeOf, spyOver, judge, runWindow } from './squad32-core.mjs';

const env = process.env, CACHE = env.HUNT_CACHE || 'squad30-cache', OUT = 'data/squad32-lab.json';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const rgz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
async function api(path) {
  if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { await sleep(local(env.MASSIVE_BASE) ? 0 : 120); let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(2000); continue; }
    if (r.status === 429) { await sleep(20000); continue; } if (!r.ok) return null; try { return await r.json(); } catch (e) { return null; } }
  return null;
}

const SPIN = readJson('data/squad32-spinoffs.json', []), SPC = readJson('data/squad32-sp500-changes.json', []), SPC2 = readJson('data/squad32-sp400-600-changes.json', []);
// tickers per spin-off CIK (SEC + Massive by CIK, active and delisted)
for (const s of SPIN) { const set = new Set(s.tickers || []);
  for (const act of ['true', 'false']) { const j = await api('/v3/reference/tickers?cik=' + s.cik.padStart(10, '0') + '&active=' + act + '&limit=50');
    if (j && Array.isArray(j.results)) for (const t of j.results) if (t.ticker) set.add(t.ticker); }
  s.all = [...set]; }
const want = new Set(['SPY']); for (const s of SPIN) for (const t of s.all) want.add(t); for (const c of SPC.concat(SPC2)) { if (c.add) want.add(c.add); if (c.rem) want.add(c.rem); }

const files = fs.existsSync(CACHE + '/days') ? fs.readdirSync(CACHE + '/days').filter(f => f.endsWith('.json.gz')).sort() : [];
if (!files.length) { console.log('squad32: no price cache; nothing done'); process.exit(0); }
const days = [], S = new Map();
for (const f of files) { const x = rgz(CACHE + '/days/' + f); if (!x || x.holiday || !x.s) continue; const di = days.length; days.push(f.slice(0, 10));
  for (let i = 0; i < x.s.length; i++) { const sym = x.s[i]; if (!want.has(sym)) continue; let s = S.get(sym); if (!s) { s = { d: [], o: [], h: [], l: [], c: [], v: [] }; S.set(sym, s); }
    s.d.push(di); s.o.push(x.o[i]); s.h.push(x.h[i]); s.l.push(x.l[i]); s.c.push(x.c[i]); s.v.push(x.v[i]); } }
console.log('squad32: ' + days.length + ' sessions ' + days[0] + ' to ' + days[days.length - 1] + '; ' + S.size + ' of ' + want.size + ' event symbols found');
const spy = S.get('SPY'); if (!spy) { console.log('squad32: SPY missing from the cache; nothing done'); process.exit(0); }
const spyAt = new Map(spy.d.map((di, k) => [di, k]));

const rows = {}, events = {}, lists = { spinsFound: [], spinsNotListed: [] };
for (const id of Object.keys(RULES32)) { rows[id] = []; events[id] = 0; }
const push = (id, s, sym, t, note = {}) => { if (!t) return; const di0 = s.d[t.e], di1 = s.d[t.x], day = days[di0];
  rows[id].push({ di: di0, day, sym, px: t.entry, gross: Math.min(t.gross, 3), spy: spyOver(spy, spyAt, di0, di1), how: t.how, sell: days[di1], ...note }); };

// spin-offs
for (const sp of SPIN) { let best = null;
  for (const t of sp.all) { const s = S.get(t); if (!s) continue; if (spinStart(s, days, sp.filed) === 0 && (!best || s.d[0] < best.s.d[0])) best = { t, s }; }
  if (!best) { lists.spinsNotListed.push(sp.name); continue; }
  const { t: sym, s } = best; lists.spinsFound.push({ sym, name: sp.name, filed: sp.filed, first: days[s.d[0]], px: s.c[0] });
  for (const [id, r] of Object.entries(RULES32)) { if (r.kind !== 'spin') continue; events[id]++;
    if (r.wait < s.d.length && s.d[r.wait] - s.d[0] <= r.wait + 5) push(id, s, sym, tradeOf(s, r.wait, r.hold)); } }
// S&P 500 changes
for (const c of SPC) {
  if (c.rem && /capitaliz/i.test(c.reason || '')) { const s = S.get(c.rem); if (s) { const e = posOnOrAfter(s, days, c.eff);
    for (const id of ['SPDEL-63', 'SPDEL-126']) { events[id]++; if (e >= 0 && Date.parse(days[s.d[e]]) - Date.parse(c.eff) <= 7 * 864e5) push(id, s, c.rem, tradeOf(s, e, RULES32[id].hold), { eff: c.eff }); } } }
  if (c.add) { const s = S.get(c.add); if (!s) continue;
    { events['SPADD-63']++; const e = posOnOrAfter(s, days, c.eff); if (e >= 0 && Date.parse(days[s.d[e]]) - Date.parse(c.eff) <= 7 * 864e5) push('SPADD-63', s, c.add, tradeOf(s, e, 63), { eff: c.eff }); }
    if (c.ann) { events['SPADD-RUN']++; const w = runWindow(s, days, c.ann, c.eff); if (w) push('SPADD-RUN', s, c.add, tradeOf(s, w[0], null, w[1]), { ann: c.ann, eff: c.eff }); } } }
// batch 2: S&P 400 / 600 additions, the same run rule
for (const c of SPC2) { if (!c.add || !c.ann) continue; const s = S.get(c.add);
  for (const [id, r] of Object.entries(RULES32)) { if (r.kind !== 'addrun2' || !r.idx.includes(c.index)) continue; events[id]++; if (!s) continue;
    const w = runWindow(s, days, c.ann, c.eff); if (w) push(id, s, c.add, tradeOf(s, w[0], null, w[1]), { ann: c.ann, eff: c.eff, index: c.index }); } }

const res = { generatedAt: new Date().toISOString(), label: 'SQUAD 32 PATHWAYS: first 5-year verdicts (pre-registered 17 Nov 2026; frozen)', split: SPLIT,
  window: [days[0], days[days.length - 1]], spinFilers: SPIN.length, spinsListed: lists.spinsFound.length, sp500Changes: SPC.length, rules: {} };
for (const [id, r] of Object.entries(RULES32)) { const j = judge(rows[id]);
  res.rules[id] = { text: r.text, events: events[id], ...j, trades: rows[id].map(z => ({ sym: z.sym, buy: z.day, sell: z.sell, px: +z.px.toFixed(2), gross: +z.gross.toFixed(4), spy: z.spy === null ? null : +z.spy.toFixed(4), how: z.how })) };
  const p = (x) => x === null || x === undefined ? 'n/a' : (x * 100).toFixed(2) + '%';
  console.log(id + ' ' + j.verdict + (j.winner ? ' WINNER' : '') + ': n ' + j.all.n + ', avg ' + p(j.all.avg) + ' (older ' + p(j.older.avg) + ', newer ' + p(j.newer.avg) + '), t ' + (j.all.t || 0).toFixed(2) +
    ', win ' + p(j.all.win) + ' | vs SPY ' + p(j.vsSpy.all.avg) + ' (older ' + p(j.vsSpy.older.avg) + ', newer ' + p(j.vsSpy.newer.avg) + '), month t ' + (j.vsSpy.all.t === null ? 'n/a' : j.vsSpy.all.t.toFixed(2)) + ' | ' + j.why); }
res.spinsFound = lists.spinsFound; res.spinsNotListed = lists.spinsNotListed;
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
