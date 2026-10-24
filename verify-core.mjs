// VERIFY CORE (independent check, 24 Oct 2026; verify-lab.mjs uses it). A SEPARATE, MINIMAL re-implementation of two rules that feed real
// TRY SMALL buys, written from their written specs (data/strategy-library.json SQ6-MTUM and SQ1-BBAUTH) WITHOUT reading or importing the
// squads' rule code (squad6-core.mjs / squad1-core.mjs). Only value-core.mjs (the shared judge) is reused, by verify-lab.mjs.
// Pure functions, no network, no files. Tests: test/verify-core.test.mjs.
export const COST = 0.008, STRESS = 0.012, CAP = 3, SPLIT = '2024-01-01';
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const avg = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
export const sdev = (a) => { if (a.length < 2) return null; const m = avg(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); };
export const cap = (g) => fin(g) ? Math.min(g, CAP) : g;
export const half = (d) => (d < SPLIT ? 'older' : 'newer');
export const rd = (x, n = 4) => (fin(x) ? +x.toFixed(n) : null);

// ---------------- dates ----------------
const DMS = 864e5, toMs = (d) => Date.parse(d + 'T00:00:00Z');
export const plusDays = (d, n) => new Date(toMs(d) + n * DMS).toISOString().slice(0, 10);
export const dayGap = (a, b) => Math.round((toMs(b) - toMs(a)) / DMS);
// index of the first session strictly after calendar date d (dates sorted ascending); dates.length if none
export function sessionAfter(dates, d) { let a = 0, b = dates.length; while (a < b) { const m = (a + b) >> 1; if (dates[m] > d) b = m; else a = m + 1; } return a; }
// Monday-based week key (UTC): the date of that week's Monday
export const weekKey = (d) => { const x = new Date(d + 'T00:00:00Z'), wd = (x.getUTCDay() + 6) % 7; return new Date(x.getTime() - wd * DMS).toISOString().slice(0, 10); };
// the last session of each calendar month in `months` whose month is OVER in the data (a later session exists in a later month)
export function lastSessionsOf(dates, months) { const out = []; for (let i = 0; i + 1 < dates.length; i++) { const a = dates[i].slice(0, 7), b = dates[i + 1].slice(0, 7); if (a !== b && months.includes(+dates[i].slice(5, 7))) out.push(i); } return out; }

// ---------------- price helpers over one stock's close array c (NaN / 0 = no bar) ----------------
// the most recent close at or before t, but not before t - back; null if none
export function closeOnOrBefore(c, t, back = Infinity) { for (let q = Math.min(t, c.length - 1); q >= 0 && q >= t - back; q--) if (c[q] > 0) return c[q]; return null; }
// last index with a close (-1 if none)
export function lastBar(c) { for (let q = c.length - 1; q >= 0; q--) if (c[q] > 0) return q; return -1; }
export function firstBar(c) { for (let q = 0; q < c.length; q++) if (c[q] > 0) return q; return -1; }
// a buy at the open of k and a sale at the close of x (session index); a stock with no bar at x: its latest close at or before x (a
// stock that stopped trading = its last close). -> { g, exitAt (index of the close used), gone } or null (no open at k)
export function holdReturn(o, c, k, x) { if (!(o[k] > 0)) return null; for (let q = Math.min(x, c.length - 1); q >= k; q--) if (c[q] > 0) return { g: c[q] / o[k] - 1, exitAt: q, gone: q < x };
  return null; }

// ---------------- liquidity ----------------
// liquid at t: close >= 5 USD and the average traded value (close x volume, a missing session counts 0) of sessions t-19..t >= 5M USD
export function liquidSeries(c, v, minPx = 5, minTv = 5e6, n = 20) { const T = c.length, out = new Uint8Array(T); let s = 0;
  const tv = (q) => (c[q] > 0 && v[q] > 0 ? c[q] * v[q] : 0);
  for (let t = 0; t < T; t++) { s += tv(t); if (t >= n) s -= tv(t - n); if (t >= n - 1 && c[t] >= minPx && s / n >= minTv) out[t] = 1; } return out; }
// average traded value of sessions t-62..t over the sessions present (at least minHave), else NaN
export function tradedValue63(c, v, t, minHave = 50) { let s = 0, n = 0; for (let q = Math.max(0, t - 62); q <= t; q++) if (c[q] > 0 && v[q] > 0) { s += c[q] * v[q]; n++; } return n >= minHave ? s / n : NaN; }

// ---------------- SQ6-MTUM (MSCI momentum, written from the spec) ----------------
// weekly returns known at the close of session t: week closes = the close of each Monday-week's last session (weeks that ENDED by t),
// returns between consecutive weeks that both have a week close; the last `maxW` of them. dates = session dates, c = closes.
export function weeklyReturnsUpTo(dates, c, t, maxW = 156) { const closes = []; // [weekKey, close] for complete weeks ending <= t
  for (let q = 0; q <= t; q++) { const lastOfWeek = q === dates.length - 1 ? false : weekKey(dates[q + 1]) !== weekKey(dates[q]); if (!lastOfWeek) continue; closes.push(c[q] > 0 ? c[q] : NaN); }
  const r = []; for (let j = 1; j < closes.length; j++) if (closes[j] > 0 && closes[j - 1] > 0) r.push(closes[j] / closes[j - 1] - 1);
  return r.slice(-maxW); }
// z-scores of the finite values (sample sd); null for the rest
export function zOf(vals) { const v = vals.filter(fin), m = avg(v), s = sdev(v); return vals.map(x => (fin(x) && s > 0 ? (x - m) / s : null)); }
// rows: [{ id, m6, m12, vol }] (vol = annualised weekly sd). -> ids of the top `n` by the combined, re-standardised, +-3 winsorised z,
// positive only, best first.
export function msciMomentumPick(rows, n) {
  const r = rows.filter(x => fin(x.m6) && fin(x.m12) && x.vol > 0);
  const z6 = zOf(r.map(x => x.m6 / x.vol)), z12 = zOf(r.map(x => x.m12 / x.vol));
  const comb = r.map((_, i) => (z6[i] !== null && z12[i] !== null ? (z6[i] + z12[i]) / 2 : null)), Z = zOf(comb).map(z => (z === null ? null : Math.min(3, Math.max(-3, z))));
  return r.map((x, i) => ({ id: x.id, z: Z[i] })).filter(x => x.z !== null && x.z > 0).sort((a, b) => b.z - a.z).slice(0, n).map(x => x.id);
}

// ---------------- SQ1-BBAUTH (buyback authorization, written from the spec) ----------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ', rsquo: '\'', lsquo: '\'', ldquo: '"', rdquo: '"', ndash: '-', mdash: '-' };
export function textOf(html) { return String(html || '').replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? ' ')
  .replace(/[   ]/g, ' ').replace(/[‘’]/g, '\'').replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim(); }
// sentences: split after . ; ! ? when the next word starts with a capital, a digit-free quote or a bracket
export const splitSentences = (t) => String(t || '').split(/(?<=[.;!?])\s+(?=["(A-Z])/);
const MULT = { billion: 1e9, bn: 1e9, b: 1e9, million: 1e6, mm: 1e6, mil: 1e6, m: 1e6, thousand: 1e3 };
// { usd, shares }: the largest dollar amount and the largest "up to N shares" in sentences that name a repurchase / buyback AND an
// authorization / approval (null each when none). Dollar amounts under 1M USD are ignored (fees, prices per share).
export function authorizedSize(text) { let usd = null, shares = null;
  for (const s of splitSentences(text)) { if (!/repurchas|buy[\s-]?back/i.test(s) || !/authori[sz]|approv/i.test(s)) continue;
    for (const m of s.matchAll(/\$\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(billion|million|thousand|bn|mm|mil|b|m)\b)?/gi)) { const n = parseFloat(m[1].replace(/,/g, '')), v = n * (m[2] ? MULT[m[2].toLowerCase()] : 1); if (v >= 1e6 && (usd === null || v > usd)) usd = v; }
    for (const m of s.matchAll(/up\s+to\s+(?:an\s+aggregate\s+of\s+|a\s+total\s+of\s+|approximately\s+)?(\d[\d,]*(?:\.\d+)?)\s*(million\s+|billion\s+)?(?:(?:additional|outstanding|issued|of\s+(?:its|our|the\s+company's|the\s+company’s)(?:\s+outstanding)?)\s+)*(?:shares|common\s+shares|common\s+stock|ordinary\s+shares|class\s+a)/gi)) {
      const v = parseFloat(m[1].replace(/,/g, '')) * (m[2] ? MULT[m[2].trim().toLowerCase()] : 1); if (v >= 1000 && (shares === null || v > shares)) shares = v; } }
  return { usd, shares }; }
// size as a fraction of the company: max(usd / (shares outstanding x price), shares / shares outstanding)
export function sizeOfCompany(a, sharesOut, px) { const x = []; if (a.usd > 0 && sharesOut > 0 && px > 0) x.push(a.usd / (sharesOut * px)); if (a.shares > 0 && sharesOut > 0) x.push(a.shares / sharesOut); return x.length ? Math.max(...x) : null; }
// the share count known on date d: the latest [date, count] whose date is at least `lagDays` before d
export function sharesKnownOn(rows, d, lagDays = 30) { if (!rows) return null; const lim = plusDays(d, -lagDays); let v = null; for (const [e, n] of rows) if (e <= lim && n > 0) v = n; return v; }
// events [{ key, d, ... }] -> the first per key in every `gap`-day window (a later event within gap days of the last KEPT one is dropped)
export function firstPerKey(events, gap) { const last = new Map(), out = [];
  for (const e of [...events].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))) { const p = last.get(e.key); if (p !== undefined && dayGap(p, e.d) < gap) continue; last.set(e.key, e.d); out.push(e); }
  return out; }

// ---------------- the yardsticks ----------------
// the same stock on its other days: windows of `len` sessions starting every `step` from `from`, okStart(u) true, not overlapping any
// [a, b] in `taken`; ret(u, x) its capped gross return; mean of 3+ windows else null
export function sameStockOtherDays({ from, last, len, step = 10, okStart, taken = [], ret }) { const v = [];
  for (let u = from; u + len - 1 <= last; u += step) { const x = u + len - 1; if (!okStart(u) || taken.some(([a, b]) => u <= b && x >= a)) continue; const g = ret(u, x); if (fin(g)) v.push(cap(g)); }
  return v.length >= 3 ? avg(v) : null; }

// ---------------- comparison with the squad's trade list ----------------
// mine / theirs: [{ s, sig, buy, sell, net, avgStock, sameStock }] -> matched counts, per-field differences, the unmatched ones
export function compareTrades(mine, theirs, tol = 0.002) { const key = (z) => z.s + '|' + z.sig, M = new Map(mine.map(z => [key(z), z])), out = { theirs: theirs.length, matched: 0, onlyTheirs: [], sameDates: 0, netWithin: 0, avgStockWithin: 0, sameStockWithin: 0, sameStockBoth: 0, bigNetDiff: [] };
  for (const z of theirs) { const m = M.get(key(z)); if (!m) { out.onlyTheirs.push(key(z)); continue; } out.matched++;
    if (m.buy === z.buy && m.sell === z.sell) out.sameDates++;
    if (fin(m.net) && fin(z.net) && Math.abs(m.net - z.net) <= tol) out.netWithin++; else out.bigNetDiff.push({ k: key(z), mine: m.net, theirs: z.net, mineSell: m.sell, theirSell: z.sell });
    if (fin(m.avgStock) && fin(z.avgStock) && Math.abs(m.avgStock - z.avgStock) <= 0.01) out.avgStockWithin++;
    if (fin(m.sameStock) && fin(z.sameStock)) { out.sameStockBoth++; if (Math.abs(m.sameStock - z.sameStock) <= 0.02) out.sameStockWithin++; } }
  const T = new Set(theirs.map(key)), first = theirs.length ? theirs.map(z => z.sig).sort()[0] : null;
  out.onlyMine = mine.filter(z => !T.has(key(z)) && first !== null && z.sig >= first).map(key);
  out.bigNetDiff = out.bigNetDiff.slice(0, 40); out.onlyTheirs = out.onlyTheirs.slice(0, 60); out.onlyMine = out.onlyMine.slice(0, 60);
  return out; }
