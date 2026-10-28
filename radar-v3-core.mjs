// DAILY OPPORTUNITY RADAR (V3.0, owner approved 28 Oct 2026: "do 1, 2, 3"). Pure functions, no network, no files; opportunity-radar.mjs
// reads and writes. Research and routing only: it adds NO buy rule, lowers NO gate and places NO order.
// WHY: the audit (docs/v3-opportunity-audit-2026-10-28.md) found the system SAW the day's runners (BRAI, AEYE, OWLS on 27 Oct) but the
// quiet / opportunitiesOnly / focus switches muted every short-term research lane. This message shows what the system already knows,
// in four panels, each line labelled:
//   A. LIVE RESEARCH LEADS   stocks moving +2% to +20% on rising volume pace (the early-wave observation lane), not yet extended
//   B. SHORT SETUPS (PAPER)  intraday rule hits (IG1-IG9) with each rule's own live paper record and history verdict
//   C. APPROVED SIGNALS      only alerts from rules that passed every gate (zero is allowed and said plainly)
//   D. RUNNERS WE MISSED     the day's biggest movers and the first reason in the pipeline that stopped them
// Every A and B line says NOT AN APPROVED BUY. Hard rules are never bypassed: under 1 USD, NOT HALAL (ZAD), SEC danger filings and the
// one-day-jump AVOID list are shown as BLOCKED with the reason, never as a lead.
// PRE-REGISTERED SCORECARD (written before any radar line existed): every A and B line is logged at its listing price; scored at the
// 15:00 New York price (same day) and at the 5th session close, after the 6 USD round trip on 1,000 USD and an assumed spread (1% under
// 5 USD, 0.3% above), against the median $1+ stock over the same minutes (same day) and SPY (5 sessions). Reported after 10 sessions.
// Nothing becomes a BUY from this scorecard; promotion stays under the existing bars.

export const SIZE = 1000, FEE = 3;
export const NOT_APPROVED = 'NOT AN APPROVED BUY';
export const radarOn = (st) => !st || st.radar !== false;
export const spreadOf = (price) => (price > 0 && price < 5 ? 0.01 : 0.003);
// gross move needed for +2% NET on the position: 2% + both fees + the assumed spread
export const netHurdle = (price, size = SIZE, fee = FEE) => +(0.02 + (2 * fee) / size + spreadOf(price)).toFixed(4);
export const netOf = (entry, exit, size = SIZE, fee = FEE) => (entry > 0 && exit > 0 ? +(exit / entry - 1 - (2 * fee) / size - spreadOf(entry)).toFixed(4) : null);
const pct = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '?' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const usd = (x) => (x >= 10 ? '$' + x.toFixed(2) : '$' + x.toFixed(x >= 1 ? 2 : 4));

export const DANGER = /DELIST|DILUTION|OFFERING|RESTATE/;
// ctx: { halal: {SYM: 'ok'|'fail'}, events: {SYM: [{f, p}]}, lottery: {SYM: oneDayJump} }
export function blockOf(sym, price, ctx = {}) {
  if (!(price >= 1)) return 'under 1 USD';
  if ((ctx.halal || {})[sym] === 'fail') return 'NOT HALAL (ZAD)';
  const ev = ((ctx.events || {})[sym] || []).filter(e => DANGER.test(e.f));
  if (ev.length) return 'SEC danger filing: ' + [...new Set(ev.flatMap(e => e.f.split(',').filter(k => DANGER.test(k))))].join(', ').toLowerCase();
  const j = (ctx.lottery || {})[sym]; if (j >= 0.15) return 'AVOID list: jumped ' + pct(j) + ' in one day this month';
  return null;
}
// ZAD marks, same merge as scan.mjs HALALM: the ZAD list fills in, the owner's own mark wins when newer, a mark older than 90 days expires
export function halalMap(zad, marks = {}, now = Date.now()) {
  const m = {}, d = zad && (zad.effective || zad.received);
  if (zad) { for (const s of zad.notHalal || []) m[s] = { s: 'fail', d }; for (const s of [...(zad.halalAgain || []), ...(zad.newHalal || [])]) m[s] = { s: 'ok', d }; }
  for (const [k, v] of Object.entries(marks || {})) if (!m[k] || !v.d || v.d >= m[k].d) m[k] = v;
  const out = {}; for (const [k, v] of Object.entries(m)) if (v && (v.s === 'ok' || v.s === 'fail') && v.d && now - Date.parse(v.d) <= 90 * 86400000) out[k] = v.s;
  return out;
}
export const halalWord =(sym, ctx = {}) => ((ctx.halal || {})[sym] === 'ok' ? 'halal (your ZAD mark)' : 'HALAL UNKNOWN: check ZAD first');
export function catalystOf(sym, ctx = {}) {
  const ev = ((ctx.events || {})[sym] || []).filter(e => !DANGER.test(e.f));
  return ev.length ? 'SEC 8-K ' + ev.map(e => e.f.split(',')[0].toLowerCase() + ' ' + String(e.p).slice(5, 10)).slice(0, 2).join(', ')
    : 'NO VERIFIED CATALYST (no SEC 8-K in 10 days; headlines not checked)';
}

// plain words for the watcher's reason codes (ignition-watch.mjs codeOf), so D says WHY in one phrase
export const CODE_WORDS = {
  ALERTED: 'alerted', UNDER_1_USD: 'under 1 USD (hard rule)', SEC_CHECK_UNAVAILABLE: 'SEC check failed (safety block)', SEC_BLOCKED: 'SEC danger filing (safety block)',
  NOT_HALAL: 'NOT HALAL (ZAD)', LOTTERY_AVOID: 'on the one-day-jump AVOID list', ALERT_CAP_REACHED: 'daily alert cap reached', NO_LIVE_PRICE_AT_SIGNAL: 'no fresh price at the signal',
  VOLUME_FIGURE_LATE: 'volume figure late (data)', CAUGHT_PAPER_GATE_NOT_MET: 'a rule caught it; paper record not strong enough (promotion gate)',
  CAUGHT_RULE_NOT_PASSED: 'a rule caught it; rule failed its 5-year test (promotion gate)', GAPPED_AT_OPEN: 'gapped up before the open (timing)',
  NOT_VISIBLE_LIVE: 'never had a fresh price (data)', VISIBLE_TOO_LATE: 'first fresh price came after +25% (data)', NO_VOLUME_HISTORY: 'no volume history',
  AFTER_11_00: 'move came after 11:00 New York (rule window)', LOW_VOLUME: 'volume too low for the rules', NO_RULE_FIT: 'no rule fits this shape',
};
export const SILENCE_KIND = { UNDER_1_USD: 'safety rule', SEC_CHECK_UNAVAILABLE: 'safety rule', SEC_BLOCKED: 'safety rule', NOT_HALAL: 'safety rule', LOTTERY_AVOID: 'safety rule', ALERT_CAP_REACHED: 'safety rule',
  NO_LIVE_PRICE_AT_SIGNAL: 'data limitation', VOLUME_FIGURE_LATE: 'data limitation', NOT_VISIBLE_LIVE: 'data limitation', VISIBLE_TOO_LATE: 'data limitation', NO_VOLUME_HISTORY: 'data limitation',
  GAPPED_AT_OPEN: 'timing problem', AFTER_11_00: 'timing problem', CAUGHT_PAPER_GATE_NOT_MET: 'strategy-promotion gate', CAUGHT_RULE_NOT_PASSED: 'strategy-promotion gate',
  LOW_VOLUME: 'research-quality rule', NO_RULE_FIT: 'research-quality rule' };
export function topSilence(tally = {}) {
  const e = Object.entries(tally).filter(([k]) => k !== 'ALERTED').sort((a, b) => b[1] - a[1]); if (!e.length) return null;
  return { code: e[0][0], n: e[0][1], kind: SILENCE_KIND[e[0][0]] || 'other', words: (CODE_WORDS[e[0][0]] || e[0][0]).replace(/ \([^)]*\)$/, '') };   // the kind is said separately
}

// closest rule to approval: the best positive live paper record, with its 5-year history verdict (lab) and what is still missing
export function closestRule(record = {}, lab = {}) {
  const c = Object.entries(record).filter(([k, r]) => /\/close$/.test(k) && r && r.n > 0 && r.avg > 0).sort((a, b) => b[1].n * b[1].avg - a[1].n * a[1].avg)[0];
  if (!c) return null; const [k, r] = c, rule = k.split('/')[0], hv = ((lab[k] || {}).verdict) || 'not tested', miss = [];
  if (hv !== 'PROMISING') miss.push('its 5-year history test (' + hv + ')'); if (r.n < 30) miss.push((30 - r.n) + ' more paper trades'); if ((r.days || 0) < 10) miss.push((10 - (r.days || 0)) + ' more trading days');
  if (!(r.stress > 0)) miss.push('a profit at the stress cost');
  return { rule, n: r.n, days: r.days || 0, avg: r.avg, stress: r.stress, history: hv, missing: miss };
}

// D lists 1 USD+ movers only (sub-1 USD warrants and pennies are counted, never listed: no rule may trade them), and a move over +300%
// is flagged as a likely split or data error, not explained (V3.0: verify corporate actions before telling any story about a move)
export function runnerLines(movers = [], n = 5, withAfter = false) {
  const big = movers.filter(m => m.code !== 'UNDER_1_USD').sort((a, b) => b.maxUp - a.maxUp), under = movers.length - movers.filter(m => m.code !== 'UNDER_1_USD').length, out = [];
  for (const m of big.slice(0, n)) out.push('- ' + m.sym + ' up to ' + pct(m.maxUp) + (m.maxUp > 3 ? ' (LIKELY A SPLIT OR DATA ERROR: check before reading anything into it)' : '') + ' (first seen ' + m.firstSeen + ' at ' + pct(m.firstSeenUp)
    + (withAfter ? '; ' + pct(m.afterFirstSeen && m.afterFirstSeen.last) + ' from there to 15:00' : '') + '): ' + (CODE_WORDS[m.code] || m.code) + '.');
  if (under) out.push('  (+' + under + ' under 1 USD, mostly warrants and pennies: not listed, never tradable by these rules)');
  return out;
}

// ---- MIDDAY (about 11:15 New York) from the watcher's snapshot
// snap: { day, at, firstMinute, scanned, live, alerts, movers: [{sym, code, maxUp, firstSeen, firstSeenUp, px}], hits: [{sym, rule, m, price}],
//         early: [{sym, change, rvT, price, score, firstMinute}], now: {SYM: {px, chg}}, tally, mkt }
export function buildMidday(snap, ctx = {}) {
  const now = snap.now || {}, rows = [], blocked = [], text = [];
  const fm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  text.push('OPPORTUNITY RADAR ' + snap.at + ' New York (' + snap.day + '). Research list: nothing in A or B is an approved buy.');
  if (snap.firstMinute && snap.firstMinute > '09:35') text.push('WATCHER STARTED LATE today (' + snap.firstMinute + '): the open was not watched.');
  if (snap.mode === 'NO_USABLE_MARKET_DATA' || snap.scanned === 0) text.push('NO MARKET DATA right now: the watcher received no prices, so an empty list below is a data problem, not a quiet market.');
  // B first (it fixes which symbols A must skip)
  const seenB = new Set(), B = [];
  for (const h of (snap.hits || []).slice().sort((a, b) => a.m - b.m)) { if (seenB.has(h.sym)) continue; seenB.add(h.sym);
    const blk = blockOf(h.sym, h.price, ctx); if (blk) { blocked.push(h.sym + ' (' + blk + ')'); continue; }
    const r = (ctx.record || {})[h.rule + '/close'], hv = (((ctx.lab || {})[h.rule + '/close']) || {}).verdict || 'not tested', n = now[h.sym] || {};
    B.push({ h, r, hv, n, rank: r && r.n >= 20 ? r.avg : -1 }); }
  B.sort((a, b) => b.rank - a.rank);
  text.push('', 'B. SHORT SETUPS (PAPER, ' + NOT_APPROVED + ')' + (B.length ? ':' : ': none before 11:00.'));
  for (const x of B.slice(0, 5)) { const { h, r, hv, n } = x;
    text.push('- ' + h.sym + ': ' + h.rule + ' at ' + fm(h.m) + ' ' + usd(h.price) + (n.px > 0 ? ', now ' + usd(n.px) + ' (' + pct(n.px / h.price - 1) + ' since)' : '') + '. ' + halalWord(h.sym, ctx) + '.',
      '  Rule record: ' + (r ? r.n + ' paper trades on ' + (r.days || 0) + ' days, ' + pct(r.avg, 1) + ' a trade after costs' : 'no paper record yet') + '; 5-year test ' + hv + '.',
      '  For +2% net on 1,000 USD it needs ' + pct(netHurdle(h.price), 1) + ' gross. ' + catalystOf(h.sym, ctx) + '.');
    rows.push({ type: 'list', d: snap.day, at: snap.at, panel: 'B', sym: h.sym, px: n.px > 0 ? n.px : h.price, rule: h.rule }); }
  // A: early-wave observations not already in B, not extended (+2% to +20% now), not blocked
  const A = [];
  for (const e of (snap.early || []).slice().sort((a, b) => (b.score - a.score) || ((b.rvT || 0) - (a.rvT || 0)))) {
    if (seenB.has(e.sym) || A.some(a => a.sym === e.sym)) continue; const n = now[e.sym] || {}, px = n.px > 0 ? n.px : e.price, chg = n.chg !== undefined ? n.chg : e.change;
    if (!(chg >= 0.02 && chg <= 0.20)) continue; const blk = blockOf(e.sym, px, ctx); if (blk) { blocked.push(e.sym + ' (' + blk + ')'); continue; }
    A.push({ sym: e.sym, px, chg, rvT: e.rvT, first: e.firstMinute }); if (A.length >= 5) break; }
  text.push('', 'A. LIVE RESEARCH LEADS (' + NOT_APPROVED + ')' + (A.length ? ':' : ': none right now.'));
  for (const a of A) { text.push('- ' + a.sym + ' ' + pct(a.chg) + ' at ' + usd(a.px) + (a.rvT ? ', volume pace ' + a.rvT.toFixed(1) + 'x normal' : '') + ' (seen ' + a.first + '). ' + halalWord(a.sym, ctx) + '.',
      '  ' + catalystOf(a.sym, ctx) + '. Needs ' + pct(netHurdle(a.px), 1) + ' gross for +2% net.' + (a.px < 5 ? ' Under 5 USD: wide spreads, halts, gaps.' : ''));
    rows.push({ type: 'list', d: snap.day, at: snap.at, panel: 'A', sym: a.sym, px: a.px }); }
  if (blocked.length) text.push('BLOCKED by hard rules (not leads): ' + blocked.slice(0, 6).join('; ') + (blocked.length > 6 ? '; +' + (blocked.length - 6) + ' more' : '') + '.');
  // C
  const cr = closestRule(ctx.record, ctx.lab);
  text.push('', 'C. APPROVED SIGNALS: ' + (snap.alerts > 0 ? snap.alerts + ' tested alert' + (snap.alerts > 1 ? 's' : '') + ' sent today (see those messages).' : '0 so far today.'));
  if (!(snap.alerts > 0) && cr) text.push('  Closest: ' + cr.rule + ' (' + cr.n + ' paper trades on ' + cr.days + ' days, ' + pct(cr.avg, 1) + ' a trade). Missing: ' + cr.missing.join('; ') + '.');
  // D
  text.push('', 'D. RUNNERS SO FAR (retrospective, not buys)' + ((snap.movers || []).length ? ':' : ': none of 15%+ yet.'), ...runnerLines(snap.movers));
  const ts = topSilence(snap.tally);
  text.push('', 'Scanned ' + (snap.scanned ?? '?') + ' stocks (' + (snap.live ?? '?') + ' with a fresh price). 15%+ movers: ' + (snap.movers || []).length + '. Rule hits: ' + (snap.hits || []).length + '. Approved: ' + (snap.alerts || 0) + '.'
    + (ts ? ' Top reason for silence: ' + ts.words + ' (' + ts.n + ', ' + ts.kind + ').' : ''));
  text.push('Chasing: stocks already up 20%+ when first seen fell a median 19% to the close (469 cases, 14-27 Oct). Check ZAD. Research only, not advice.');
  return { text: text.join('\n'), rows };
}

// ---- SCORING (pre-registered above)
export function scoreSameDay(list, close) {   // list row + close row {px, mkt}
  const net = netOf(list.px, close.px); return net === null ? null : { net, vsMkt: close.mkt === null || close.mkt === undefined ? null : +(net - close.mkt).toFixed(4) };
}
export function scoreboard(ledger = []) {
  const key = (r) => r.d + '|' + r.sym, close = new Map(), s5 = new Map(), out = {};
  for (const r of ledger) { if (r.type === 'close') close.set(key(r), r); if (r.type === 's5') s5.set(key(r) + '|' + r.panel, r); }
  const days = new Set();
  for (const r of ledger.filter(x => x.type === 'list')) { days.add(r.d); const o = out[r.panel] || (out[r.panel] = { n: 0, sum: 0, win: 0, beat: 0, nb: 0, n5: 0, sum5: 0, beat5: 0 });
    const c = close.get(key(r)), s = c ? scoreSameDay(r, c) : null;
    if (s) { o.n++; o.sum += s.net; if (s.net > 0) o.win++; if (s.vsMkt !== null) { o.nb++; if (s.vsMkt > 0) o.beat++; } }
    const f = s5.get(key(r) + '|' + r.panel); if (f && f.net !== null) { o.n5++; o.sum5 += f.net; if (f.spy !== null && f.net > f.spy) o.beat5++; } }
  return { sessions: days.size, panels: Object.fromEntries(Object.entries(out).map(([k, o]) => [k, { n: o.n, avgNet: o.n ? +(o.sum / o.n).toFixed(4) : null, win: o.n ? +(o.win / o.n).toFixed(3) : null,
    beatMkt: o.nb ? +(o.beat / o.nb).toFixed(3) : null, n5: o.n5, avgNet5: o.n5 ? +(o.sum5 / o.n5).toFixed(4) : null, beatSpy5: o.n5 ? +(o.beat5 / o.n5).toFixed(3) : null }])) };
}

// ---- AFTER THE CLOSE
// live = data/ignition-live.json (today's), ledger = all radar rows
export function buildClose(day, live, ledger = [], ctx = {}) {
  const text = ['OPPORTUNITY RADAR, AFTER THE CLOSE (' + day + ')'];
  if (!live || live.day !== day) { text.push('The live watcher saved no results for today (not run, or not saved yet). Nothing to score.'); }
  else {
    const cov = live.coverage || {}; if (cov.firstMinute && cov.firstMinute > '09:35') text.push('WATCHER STARTED LATE (' + cov.firstMinute + '): the open was not watched.');
    const mine = ledger.filter(r => r.type === 'list' && r.d === day), close = new Map(ledger.filter(r => r.type === 'close' && r.d === day).map(r => [r.sym, r]));
    text.push('', 'TODAY\'S RADAR LINES (listing price to 15:00, after 6 USD fees and spread):' + (mine.length ? '' : ' none were listed.'));
    for (const r of mine) { const c = close.get(r.sym), s = c ? scoreSameDay(r, c) : null;
      text.push('- ' + r.panel + ' ' + r.sym + ': ' + usd(r.px) + (c ? ' to ' + usd(c.px) + ', net ' + pct(s.net, 1) + (s.vsMkt !== null ? ' (' + pct(s.vsMkt, 1) + ' vs the average stock)' : '') : ', no 15:00 price')); }
    text.push('', 'D. RUNNERS WE MISSED TODAY (retrospective, not buys):' + ((live.missed || []).length ? '' : ' none of 15%+.'), ...runnerLines(live.missed, 5, true));
    const ts = topSilence(live.tally), all = Object.values(live.tally || {}).reduce((a, b) => a + b, 0); if (ts) text.push('Top reason for silence today: ' + ts.words + ' (' + ts.n + ' of ' + all + ' movers of 15%+; ' + ts.kind + ').');
    text.push('', 'C. APPROVED SIGNALS today: ' + (live.alerts || 0) + '. Tested buys for the next session come in ACTIONS tonight.');
  }
  const sb = scoreboard(ledger), P = sb.panels;
  text.push('', 'RADAR SCORECARD (' + sb.sessions + ' session' + (sb.sessions === 1 ? '' : 's') + '; verdict after 10):');
  for (const k of ['A', 'B']) { const p = P[k]; text.push('- ' + k + ': ' + (p && p.n ? p.n + ' lines, same day ' + pct(p.avgNet, 1) + ' net on average, ' + Math.round(p.win * 100) + '% positive' + (p.beatMkt !== null ? ', ' + Math.round(p.beatMkt * 100) + '% beat the average stock' : '') : 'no scored lines yet')
    + (p && p.n5 ? '; 5 sessions ' + pct(p.avgNet5, 1) + ', ' + Math.round(p.beatSpy5 * 100) + '% beat SPY' : '')); }
  text.push('Nothing here is an approved buy unless it says APPROVED. Research only, not advice.');
  return text.join('\n');
}
