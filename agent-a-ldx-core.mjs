// AGENT A LEADER DIP EXITS STUDY CORE (A-LDX1; 1 Nov 2026; Stock-2). Pure functions, no network, no files. Used by agent-a-ldx-lab.mjs and
// test/agent-a-ldx-core.test.mjs. Long only; never places an order; never gives a halal ruling.
//
// THE QUESTION. The owner's real trading lane is LEADER DIP (CLAUDE.md 2a): SQ11-PB12 entries (a top-300 company's first close 12% under its
// 50-day high while above its 200-day average; buy the next open), a GTC sell limit at +20%, else sold at the close of session 126, NO stop,
// 3 slots x 1,000 USD, new buys off when 10+ finished trades average below 0. That exit (TGT20) was tested once by A-TGT1 (25 Oct) and as a
// 3-slot account (REPLAY-PB12T20, 27 Oct). It is NOT re-tested here. The open questions the owner meets while HOLDING a leader dip are:
//   (a) "It is 3 months in and still under my price: keep waiting or free the slot?"         -> LDX-HALF63
//   (b) "The stock broke below its 200-day average (the reason I bought is gone): sell?"     -> LDX-T200
//   (c) "Six months are up and it never reached +20%: should I have waited longer?"          -> LDX-TIME189
// WHAT WAS ALREADY LEARNED (library, read before writing this): A-TGT-* (+10/+15/+20% targets, 10% trail, 10% stop from the buy on PB12:
// no adoption); SQ20-XH/XA-*-PB12 (sell on a +25% / +40% day: do not adopt); SQ3-CUTRUN (-8% cut + 50-day trail on an account: rejected);
// SQ14-PB12P5 (5 slots: too few); SQ18-PB12-* (entry filters). None is a halfway check, a 200-day trend-break exit or a longer time exit
// on the live PB12 +20% lane.
//
// PRE-REGISTERED 1 Nov 2026 BEFORE ANY RESULT WAS SEEN (one version each; the lab writes the same text into data/strategy-library.json
// before computing anything; each runs ONCE on the 5-year window; first complete verdict frozen in data/agent-a-ldx-lab.json firstRun).
// TRADES: the SQ11-PB12 trade list in data/squad11-lab.json (as REPLAY-PB12T20 and A-TGT1 rebuilt it; trades whose path holds a split
//   artifact are left out, as tested). Buy = the open of session k (the session after the signal close), px0.
// LIVE (the reference, unchanged): the +20% limit (account-replay-core targetExit: first session k..x whose high reaches px0 x 1.20 -> sold
//   at that level, or at the open when the stock opens at or above it) else the close of session x = k + 125 (a stock whose bars stop
//   early: its last close).
// VARIANTS (the +20% limit stays in force in all of them until the variant sells first):
//   LDX-HALF63:  at the close of session m = k + 62 (the 63rd session held), if the target has not filled by m, m < x, and that close (the
//                last close at or before m) is BELOW px0 -> sell at the next open. Otherwise as LIVE.
//   LDX-T200:    the first close q, k <= q < x and q before the target fill, under the stock's own 200-session average close (the last 200
//                closes it traded, q included; fewer than 200: no check) -> sell at the next open. Otherwise as LIVE.
//   LDX-TIME189: as LIVE but the time exit is the close of session k + 188 (189 sessions, about 9 months); the +20% limit stays good until
//                then. Trades whose 189th session is not in the data yet are left out of BOTH arms of this comparison.
// COSTS 0.8% round trip (1.2% stress). Halves by signal date (before / from 2024-01-01).
// ADOPT (decides whether the live lane should change; an exit is never a buy signal), ALL in BOTH halves:
//   (1) the variant changed the sale of 10+ trades;
//   (2) SAME MONEY: the average over ALL trades of (variant net - LIVE net) > 0 (money in cash at 0% after the earlier sale);
//   (3) the return per year of capital tied up (sum of nets / sum of years held) is not below LIVE's;
//   (4) THE REAL ACCOUNT: the 3-slot, 3,000 USD account (account-replay-core simulate: 1,000 USD a buy, whole shares, held symbols skipped,
//       the 10-result switch-off, same-day pick order of the lab) ends ABOVE the same account with the LIVE exit, at 0.8% AND at 1.2%
//       cost. Windows: OLDER 2021-10-12..2023-12-29 and NEWER 2024-01-02..CUT (CUT = the SQ11-PB12 list complete-through date, as
//       REPLAY-PB12T20).
//   Otherwise DO NOT ADOPT, and the live lane stays as it is. Reported for both arms: trades, distinct stocks and signal days, average,
//   median, worst trade, win rate, average at 1.2%, per year of capital; accounts: end USD, per year, max drawdown, vs SPY.
export const REGISTERED = '2026-11-01', COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', YEAR = 252, TARGET = 0.20, HOLD = 126;
export const ADOPT = { minFired: 10 };
export const r4 = (x) => typeof x === 'number' && isFinite(x) ? Math.round(x * 1e4) / 1e4 : null;
export const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';

export const VARIANTS = {
  'LDX-HALF63': { kind: 'half', check: 63, name: 'LEADER DIP (+20% limit, 126 sessions) + halfway check: still under the buy price after 63 sessions -> sell at the next open' },
  'LDX-T200': { kind: 'trend', len: 200, name: 'LEADER DIP (+20% limit, 126 sessions) + trend break: first close under the stock\'s 200-day average -> sell at the next open' },
  'LDX-TIME189': { kind: 'time', hold: 189, name: 'LEADER DIP with a 189-session time exit instead of 126 (the +20% limit kept until then)' },
};
export const IDS = Object.keys(VARIANTS);

// ---------------- exits ----------------
// S = { o, h, c } arrays; tr = { k, x, px0, px1, kind } from squad20-core holdFrom (x = the planned time sale, already the last bar for a
// stock that stopped trading). Returns the sale { q, px, how, atOpen }.
export function targetExit(S, tr, p = TARGET) { const L = tr.px0 * (1 + p);
  for (let q = tr.k; q <= tr.x; q++) { const o = S.o[q], h = S.h ? S.h[q] : NaN, c = S.c[q];
    if (q > tr.k && o > 0 && o >= L) return { q, px: o, how: 'gap' };
    const top = h > 0 ? h : c; if (top > 0 && top >= L - 1e-12) return { q, px: L, how: 'target' }; }
  return null; }
export function liveExit(S, tr, p = TARGET) { const t = targetExit(S, tr, p); return t ? { ...t, atOpen: false } : { q: tr.x, px: tr.px1, how: tr.kind || 'time', atOpen: false }; }
// the first open after q up to x (null when there is none: keep the live sale)
function openAfter(S, q, x) { for (let u = q + 1; u <= x; u++) if (S.o[u] > 0) return u; return null; }
export function halfwayExit(S, tr, live, check = 63) { const m = tr.k + check - 1; if (live.q <= m || m >= tr.x) return live;
  let c = null; for (let q = m; q >= tr.k; q--) if (S.c[q] > 0) { c = S.c[q]; break; } if (!(c > 0) || c >= tr.px0) return live;
  const u = openAfter(S, m, tr.x); return u === null ? live : { q: u, px: S.o[u], how: 'halfway', atOpen: true }; }
// sma[q] = the average of the stock's last `len` closes up to q (null with fewer)
export function smaOf(c, len = 200) { const out = new Array(c.length).fill(null), w = []; let s = 0;
  for (let q = 0; q < c.length; q++) { if (!(c[q] > 0)) continue; w.push(c[q]); s += c[q]; if (w.length > len) s -= w.shift(); if (w.length === len) out[q] = s / len; } return out; }
export function trendExit(S, tr, live, sma) { const end = Math.min(live.q - 1, tr.x - 1);
  for (let q = tr.k; q <= end; q++) { if (!(S.c[q] > 0) || !(sma[q] > 0) || S.c[q] >= sma[q]) continue; const u = openAfter(S, q, tr.x); return u === null ? live : { q: u, px: S.o[u], how: 'trend', atOpen: true }; }
  return live; }

// ---------------- reporting ----------------
// rows: { sig, sym, half, k, base: { q, px }, alt: { q, px }, px0 }
export const netOf = (px0, px1, c = COST) => px1 / px0 - 1 - c;
export function armStats(rows, which, cost = COST) { const v = rows.filter(z => ok(z[which].px) && z.px0 > 0); if (!v.length) return { n: 0 };
  const net = v.map(z => netOf(z.px0, z[which].px, cost)), years = v.reduce((a, z) => a + (z[which].q - z.k + 1) / YEAR, 0);
  return { n: v.length, stocks: new Set(v.map(z => z.sym)).size, days: new Set(v.map(z => z.sig)).size, avg: r4(mean(net)), median: r4(median(net)), worst: r4(Math.min(...net)), best: r4(Math.max(...net)),
    win: r4(net.filter(x => x > 0).length / net.length), avgStress: r4(mean(v.map(z => netOf(z.px0, z[which].px, STRESS)))), perYear: years > 0 ? r4(net.reduce((a, x) => a + x, 0) / years) : null,
    heldAvg: r4(mean(v.map(z => z[which].q - z.k + 1))) }; }
export function compare(rows) { const v = rows.filter(z => ok(z.base.px) && ok(z.alt.px) && z.px0 > 0); if (!v.length) return { n: 0, fired: 0 };
  const d = v.map(z => (z.alt.px - z.base.px) / z.px0), fired = v.filter(z => z.alt.q !== z.base.q || Math.abs(z.alt.px - z.base.px) > 1e-9);
  return { n: v.length, fired: fired.length, diff: r4(mean(d)), firedDiff: fired.length ? r4(mean(fired.map(z => (z.alt.px - z.base.px) / z.px0))) : null,
    firedBetter: fired.length ? r4(fired.filter(z => z.alt.px > z.base.px + 1e-9).length / fired.length) : null }; }
const pct = (x) => ok(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%' : 'n/a';
// cmp / live / alt = { older, newer } of compare() / armStats(); acct = { older: { cost: { alt, live }, stress: { alt, live } }, newer: ... } end USD
export function adoptLdx(cmp, live, alt, acct, A = ADOPT) { const why = [];
  for (const h of ['older', 'newer']) { const c = cmp[h] || {}, L = live[h] || {}, X = alt[h] || {}, a = acct[h] || {};
    if (!(c.fired >= A.minFired)) why.push(h + ': changed only ' + (c.fired || 0) + ' trades');
    if (!(ok(c.diff) && c.diff > 0)) why.push(h + ': same-money average change ' + pct(c.diff) + ' (not > 0)');
    if (!(ok(X.perYear) && ok(L.perYear) && X.perYear >= L.perYear)) why.push(h + ': per year of capital ' + pct(X.perYear) + ' below the live ' + pct(L.perYear));
    for (const k of ['cost', 'stress']) { const z = a[k] || {}; if (!(ok(z.alt) && ok(z.live) && z.alt > z.live)) why.push(h + ': 3-slot account at ' + (k === 'cost' ? '0.8%' : '1.2%') + ' ends ' + (ok(z.alt) ? z.alt.toFixed(0) : 'n/a') + ' USD, not above the live ' + (ok(z.live) ? z.live.toFixed(0) : 'n/a')); } }
  return { adopt: !why.length, why: why.length ? why.join('; ') : 'changed 10+ trades, improved the same-money average, kept the per-year return and beat the live 3-slot account at both costs in both halves' }; }

// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (agent-a-ldx-core.mjs header, pre-registered 1 Nov 2026 before any run): the SQ11-PB12 trade list (data/squad11-lab.json), buy the next open; LIVE = the owner\'s lane exit (+20% sell limit, else the close of session 126, no stop), NOT re-tested; the variant applied to the SAME trades. Cost 0.8% (1.2% stress); halves by signal date (before / from 2024-01-01); run once, first complete result frozen in data/agent-a-ldx-lab.json firstRun. ADOPT only if in BOTH halves: it changed 10+ trades, the same-money average change over all trades > 0, the per-year return of capital not below LIVE, and the 3-slot 3,000 USD account ends above the LIVE account at 0.8% and at 1.2%.';
const CHECK = 'Library check 1 Nov 2026: A-TGT-* (targets / 10% trail / 10% stop on PB12: not adopted), SQ20-XH/XA-*-PB12 (sell on a big up day: not adopted), SQ3-CUTRUN (rejected), SQ14-PB12P5, SQ18-PB12-*: none is a halfway check, a 200-day trend-break exit or a 189-session time exit on the live PB12 +20% lane.';
export function preRegister(LB, today = REGISTERED) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(VARIANTS)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'LEADER DIP exits on the live lane (Agent A, A-LDX1)', name: r.name, explain: 'RULE: ' + r.name + '. ' + COMMON, status: 'pre-registered ' + today + ' (Agent A); 5-year one-shot pending',
      agent: 'A', registered: today, hold: r.kind === 'time' ? r.hold : HOLD, kind: 'exit', libraryCheck: CHECK,
      note: 'Pre-registered ' + today + ' BEFORE any run (agent-a-ldx-core.mjs = the exact rule; one version). Run once by agent-a-ldx-lab.mjs; an exit question on the owner\'s live lane, never a buy signal.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
