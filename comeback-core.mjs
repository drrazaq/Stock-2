// COMEBACK BOARD CORE (25 Oct 2026; owner: "Don't reject all, work them out, maybe with time the average will decide differently").
// Pure functions, no network, no files (comeback-lab.mjs reads and writes). Library entry COMEBACK-1 (data/strategy-library.json),
// pre-registered 25 Oct 2026 BEFORE any forward result existed (the labs' forward paper lanes start on 26 Oct 2026).
//
// THE RULE (pre-registered; one version):
// 1. What counts. A lab rule's frozen first-run verdict (data/<lab>-lab.json firstRun, decoded: data/decoded-history.json) is NEVER
//    re-run or edited. Only its FORWARD paper record counts here: the 'result' lines of data/<lab>-paper.jsonl whose SIGNAL day is
//    strictly AFTER the date of that rule's own frozenAt (data the frozen test never saw), resolved by the lab itself at the rule's own
//    hold and its own exits. Cost 0.8% a round trip (the lab's net), stress 1.2% (net - 0.4%). Every stock trade's gross return is capped
//    at +300%, like the labs' average-stock yardstick (AUD-1, capBoth), so both sides are treated the same.
// 2. COMEBACK (eligible for TRY SMALL through the 'comeback' lab) needs ALL of, on the forward record alone:
//    a. 30+ resolved trades on 10+ distinct signal days;
//    b. average after 1.2% stress > 0;
//    c. beats the average stock on the same days (edge = mean per signal day of net - the average stock's gross over the same span > 0);
//    d. beats SPY per year of capital (sum of net / years held vs sum of SPY over the same buy-to-sell spans / years; SPY known for 90%+);
//    e. > 0 without its 2 best trades;
//    f. block t (non-overlapping blocks of the rule's own block / hold length in sessions) >= BAR, the multiple-testing bar:
//       BAR = max(2.5, one-sided z for 0.05 / N), N = number of rules on the board with 30+ forward trades (Bonferroni over every rule
//       being watched; N < 1 counts as 1);
//    g. the record split in two by signal date (older = first half, newer = second) passes the existing TRY SMALL half gates in
//       scan.mjs tryQualifies (each half: 20+ trades, 3+ blocks, > 0 after 1.2%, beats the average stock, > 0 without its 2 best,
//       and beats SPY per year of capital), because data/comeback-lab.json is read by that same function.
// 3. Never COMEBACK: near-copies of a rule already live (scan.mjs TRY_DUPLICATE), rules paused for an engine bug (TRY_PAUSED, unless
//    corrected), baskets (TRY_BASKET, labs squad5 / squad10 / squad17: a basket is owned whole), intraday entries (squad2), options
//    (squad15), rules already live in their own lab (their frozen run passes tryQualifies), and a lab whose paper lane records no
//    average-stock yardstick (gate c cannot be checked: the rule stays WATCHING).
// 4. STATUS: TOO EARLY (under 30 trades or 10 days) / FADING (enough record, and the average after 1.2% <= 0 or the edge over the
//    average stock <= 0) / COMEBACK (every gate above) / WATCHING (anything else: positive but a gate is missing).
// 5. Output: data/comeback-board.json (every rule), data/comeback-lab.json (firstRun-like entries, COMEBACK rules only, recomputed every
//    run: a rule that fades drops out), data/comeback-today.json (methods[id].newSignals copied from the rule's own lab today file,
//    COMEBACK rules only). scan.mjs reads it as lab 'comeback'; a rule already offered by its own lab is not offered twice.
// Rejected rules keep running on paper; a rule comes back only on its own forward record.
import { halfStat } from './value-core.mjs';
import { NYSE_HOLIDAYS } from './anomaly-core.mjs';

export const CAP = 3, COST = 0.008, STRESS = 0.012, MIN_N = 30, MIN_DAYS = 10, BASE_BAR = 2.5, ALPHA = 0.05, YEAR = 252, SPY_COVER = 0.9, HALF_N = 20, HALF_BLOCKS = 3;
export const PAPER_FROM = '2026-10-26', SPEC_ID = 'COMEBACK-1';
export const LINE = 'Rejected rules keep running on paper; a rule comes back only on its own forward record.';
// every lab with a forward paper lane and frozen per-rule verdicts (squad3 has no paper lane)
export const LABS = ['anomaly', 'angles', 'macro', 'tipster', 'decoded', 'expert', 'confluence', 'ml', 'squad1', 'squad2', 'squad4', 'squad5', 'squad6', 'squad7', 'squad8', 'squad9',
  'squad10', 'squad11', 'squad12', 'squad13', 'squad14', 'squad15', 'squad16', 'squad17', 'squad18', 'squad19', 'squad20', 'squad21', 'squad22'];
export const verdictFile = (lab) => lab === 'decoded' ? 'data/decoded-history.json' : 'data/' + lab + '-lab.json';
export const paperFile = (lab) => 'data/' + lab + '-paper.jsonl';
export const todayPath = (lab) => 'data/' + lab + '-today.json';
export const NO_TICKET = { squad2: 'enters intraday; TRY SMALL places next-open orders', squad5: 'a basket: owned whole, not as single tickets', squad10: 'a basket: owned whole, not as single tickets',
  squad17: 'a basket: owned whole, not as single tickets', squad15: 'long calls (options), not a stock ticket' };

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
const fin = (x) => typeof x === 'number' && isFinite(x);

// one-sided normal quantile (Acklam's rational approximation, |error| < 1.2e-9)
export function zInv(p) {
  if (!(p > 0 && p < 1)) return NaN;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00], lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
// the multiple-testing bar: Bonferroni over every rule on the board with 30+ forward trades
export const bonferroniBar = (watched) => +Math.max(BASE_BAR, zInv(1 - ALPHA / Math.max(1, watched || 0))).toFixed(2);

// NYSE session index of a date (weekdays minus the published full-day closures; a weekend date takes the next session's index)
const DAY = 864e5, MON0 = Date.parse('1970-01-05T00:00:00Z'), HOL = [...NYSE_HOLIDAYS].sort();
export function sessionIndex(d) { const n = Math.floor((Date.parse(String(d).slice(0, 10) + 'T00:00:00Z') - MON0) / DAY), w = Math.floor(n / 7) * 5 + Math.min(n % 7, 5);
  let h = 0; for (const x of HOL) { if (x < d) h++; else break; } return w - h; }
export const sessionsHeld = (buy, sell) => buy && sell && sell >= buy ? sessionIndex(sell) - sessionIndex(buy) + 1 : null;

// the scan.mjs sets that keep a rule out of TRY SMALL, read from its source so the two never drift apart
export function scanSets(src) { const get = (name) => { const m = String(src || '').match(new RegExp('const ' + name + "\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)")); return new Set(m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : []); };
  return { duplicate: get('TRY_DUPLICATE'), paused: get('TRY_PAUSED'), basket: get('TRY_BASKET') }; }
// mirror of scan.mjs tryQualifies for ONE run (a rule already live in its own lab is not a comeback); scan.mjs also skips an id twice
const halfOk = (h) => h && h.avgStress > 0 && h.edge > 0 && h.noTop2 > 0 && !(typeof h.n === 'number' && h.n < HALF_N) && !(typeof h.blocks === 'number' && h.blocks < HALF_BLOCKS);
const beatsIndex = (py) => !py || ['older', 'newer'].every(h => !py[h] || typeof py[h].rule !== 'number' || typeof py[h].spy !== 'number' || py[h].rule > py[h].spy);
const portfolioBeatsSpy = (pf) => { const h = pf && pf.standard && pf.standard.halves; return !h || ['older', 'newer'].every(k => !h[k] || h[k].beatsSpy !== false); };
export const liveInOwnLab = (r) => !!(r && r.results && !/REJECTED|TOO FEW/i.test(r.verdict || '') && halfOk(r.results.older) && halfOk(r.results.newer) && beatsIndex(r.perYear) && portfolioBeatsSpy(r.portfolio));
export const effectiveRuns = (j) => { if (!j) return {}; const out = { ...(j.firstRun || {}) }; for (const [k, r] of Object.entries(j.correctedRun || {})) if (r && r.results) out[k] = { ...r, corrected: true, frozenAt: (j.firstRun || {})[k] ? j.firstRun[k].frozenAt : r.frozenAt }; return out; };

// one paper 'result' line -> a forward trade, or null (unresolved / unusable). lines = the whole ledger (squad15 needs its entry line).
export function tradeOf(line, lab, byId) {
  if (!line || line.type !== 'result' || (line.state && line.state !== 'closed')) return null;
  const base = byId && byId.get(line.sid || line.id), entry = byId && byId.get('entry:' + line.id);
  const m = line.m || (base && (base.m || base.rule)) || (lab === 'squad15' && line.id ? String(line.id).split('|')[0] : null);
  const d = line.d || (base && base.d) || (entry && entry.entry) || null;
  const net0 = fin(line.net) ? line.net : fin(line.g) ? line.g - COST : null, net = net0 === null || lab === 'squad15' ? net0 : Math.min(net0, CAP - COST);   // +300% gross cap, as the labs' yardstick (AUD-1)
  if (!m || !d || net === null) return null;
  const avgStock = lab === 'squad15' ? null : fin(line.avgStock) ? line.avgStock : fin(line.c) ? line.c - COST : null;
  const buy = line.buy || (entry && entry.entry) || null, sell = line.sell || line.exit || line.exitDay || null;
  return { lab, m, id: line.id, sym: line.sym || (line.id ? String(line.id).split('|')[1] : null), d: String(d).slice(0, 10), buy, sell, net, avgStock, spy: fin(line.spy) ? line.spy : null };
}
// the ledger lines -> forward trades of the rules with a frozen verdict, signal day strictly after that rule's frozenAt date
export function forwardTrades(lab, lines, runs) {
  const byId = new Map(); for (const l of lines || []) { if (!l || !l.id) continue; if (l.type === 'entry') byId.set('entry:' + l.id, l); else if (l.type === 'signal' && !byId.has(l.id)) byId.set(l.id, l); }
  const out = [], seen = new Set(), unmatched = new Set(); let beforeFreeze = 0;
  for (const l of lines || []) { const z = tradeOf(l, lab, byId); if (!z) continue; const key = z.m + '|' + (z.id || z.sym + '|' + z.d); if (seen.has(key)) continue; seen.add(key);
    const r = runs[z.m]; if (!r || !r.frozenAt) { unmatched.add(z.m); continue; }
    if (!(z.d > String(r.frozenAt).slice(0, 10))) { beforeFreeze++; continue; } out.push(z); }
  return { trades: out, unmatched: [...unmatched], beforeFreeze };
}
// per year of capital: sum of net over the years held vs SPY's sum over the same spans (only trades with SPY known)
export function perYear(tr, spyOf, hold) {
  const v = tr.map(z => { const s = fin(z.spy) ? z.spy : spyOf ? spyOf(z.buy, z.sell) : null, h = sessionsHeld(z.buy, z.sell) || hold || 1; return { net: z.net, spy: fin(s) ? s : null, y: h / YEAR }; });
  const k = v.filter(z => z.spy !== null), y = k.reduce((a, z) => a + z.y, 0);
  return { rule: k.length && y > 0 ? r4(k.reduce((a, z) => a + z.net, 0) / y) : null, spy: k.length && y > 0 ? r4(k.reduce((a, z) => a + z.spy, 0) / y) : null, coverage: tr.length ? r4(k.length / tr.length) : null };
}
const toRows = (tr) => tr.map(z => ({ t: sessionIndex(z.d), s: z.sym, g: z.net + COST, c: z.avgStock === null ? null : z.avgStock + COST, own: null }));
// first / second half of the record by signal date (a day's trades stay together)
export function halves(tr) { const s = [...tr].sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0); if (!s.length) return { older: [], newer: [] }; const cut = s[Math.floor(s.length / 2)].d;
  return { older: s.filter(z => z.d < cut), newer: s.filter(z => z.d >= cut) }; }
const beatsSpy = (py) => !!(py && py.rule !== null && py.spy !== null && py.coverage >= SPY_COVER && py.rule > py.spy);

// one rule's forward record and gates. o = { block, hold, bar, spyOf, exclude: reason|null, noYardstick: bool }
export function ruleRecord(tr, o) {
  const block = o.block || o.hold || 63, all = halfStat(toRows(tr), block), py = perYear(tr, o.spyOf, o.hold), H = halves(tr);
  const half = Object.fromEntries(['older', 'newer'].map(k => [k, { ...halfStat(toRows(H[k]), block), from: H[k].length ? H[k][0].d : null, to: H[k].length ? H[k][H[k].length - 1].d : null }]));
  const pyH = Object.fromEntries(['older', 'newer'].map(k => [k, perYear(H[k], o.spyOf, o.hold)]));
  const n = all.n || 0, days = all.days || 0, enough = n >= MIN_N && days >= MIN_DAYS;
  const gates = { trades: enough, stress: all.avgStress > 0, averageStock: all.edge > 0, spy: beatsSpy(py), noTop2: all.noTop2 > 0, luck: fin(all.tBlock) && all.tBlock >= o.bar,
    halves: ['older', 'newer'].every(k => halfOk(half[k]) && beatsSpy(pyH[k])) };
  const why = [];
  if (!gates.trades) why.push(n + ' trades on ' + days + ' days (needs ' + MIN_N + ' on ' + MIN_DAYS + ')');
  else { if (!gates.stress) why.push('average after 1.2% ' + pct(all.avgStress)); if (!gates.averageStock) why.push(all.edge === null ? 'no average-stock yardstick' : 'edge vs the average stock ' + pct(all.edge));
    if (!gates.spy) why.push(py.coverage !== null && py.coverage < SPY_COVER ? 'SPY known for only ' + Math.round((py.coverage || 0) * 100) + '% of trades' : 'not ahead of SPY per year of capital');
    if (!gates.noTop2) why.push('not positive without its 2 best'); if (!gates.luck) why.push('block t ' + (all.tBlock ?? 'n/a') + ' under the bar ' + o.bar);
    if (!gates.halves) why.push('a half fails the TRY SMALL half gates (20+ trades, 3+ blocks, > 0 after 1.2%, beats the average stock and SPY, > 0 without its 2 best)'); }
  if (o.exclude) why.push('never a comeback: ' + o.exclude); if (o.noYardstick) why.push('its lab records no average-stock yardstick on paper');
  const status = !enough ? 'TOO EARLY' : (!(all.avgStress > 0) || (fin(all.edge) && all.edge <= 0)) ? 'FADING' : Object.values(gates).every(Boolean) && !o.exclude && !o.noYardstick ? 'COMEBACK' : 'WATCHING';
  return { n, days, stocks: all.stocks || 0, avg: all.avg ?? null, avgStress: all.avgStress ?? null, edge: all.edge ?? null, noTop2: all.noTop2 ?? null, tBlock: all.tBlock ?? null, blocks: all.blocks || 0,
    vsSpy: py, gates, status, why, half, perYearHalves: pyH, block };
}
const pct = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';

// the whole board. labs = [{ lab, runs (effective firstRun), lines (paper ledger or []), today (lab today file or null) }]
// sets = scanSets(scan.mjs source); names = id -> name (library); spyOf(buy, sell) -> SPY return or null
export function buildBoard(labs, { sets = { duplicate: new Set(), paused: new Set(), basket: new Set() }, names = {}, spyOf = null, now = new Date().toISOString() } = {}) {
  const raw = [], unmatched = {}; let beforeFreeze = 0;
  for (const L of labs) { const f = forwardTrades(L.lab, L.lines, L.runs); beforeFreeze += f.beforeFreeze; if (f.unmatched.length) unmatched[L.lab] = f.unmatched;
    const noYard = L.lines && L.lines.some(l => l && l.type === 'result') && !L.lines.some(l => l && l.type === 'result' && (fin(l.avgStock) || fin(l.c)));
    for (const [id, r] of Object.entries(L.runs)) { if (!r || !r.frozenAt) continue;
      const exclude = NO_TICKET[L.lab] || (sets.duplicate.has(id) ? 'a near-copy of a rule already live (TRY_DUPLICATE)' : null) || (sets.paused.has(id) && !r.corrected ? 'paused for an engine bug (TRY_PAUSED)' : null)
        || (sets.basket.has(id) ? 'a basket (TRY_BASKET)' : null) || (liveInOwnLab(r) ? 'already live in its own lab' : null);
      raw.push({ lab: L.lab, id, r, tr: f.trades.filter(z => z.m === id), exclude, noYard }); } }
  const pre = raw.map(x => x.tr.length >= MIN_N).filter(Boolean).length, bar = bonferroniBar(pre);
  const rules = raw.map(x => { const hold = +x.r.hold > 0 ? +x.r.hold : x.lab === 'decoded' ? 126 : 63, rec = ruleRecord(x.tr, { block: +x.r.block > 0 ? +x.r.block : hold, hold, bar, spyOf, exclude: x.exclude, noYardstick: x.noYard });
    return { lab: x.lab, id: x.id, name: x.r.name || names[x.id] || null, frozenVerdict: x.r.verdict || null, frozenAt: x.r.frozenAt, hold, n: rec.n, days: rec.days, stocks: rec.stocks, avg: rec.avg, avgStress: rec.avgStress,
      edgeVsAverageStock: rec.edge, vsSpy: rec.vsSpy, noTop2: rec.noTop2, blockT: rec.tBlock, blocks: rec.blocks, block: rec.block, bar, status: rec.status, why: rec.why, excluded: x.exclude || null, halves: rec.n >= MIN_N ? rec.half : null, perYearHalves: rec.n >= MIN_N ? rec.perYearHalves : null,
      firstSignal: x.tr.length ? x.tr.reduce((a, z) => z.d < a ? z.d : a, x.tr[0].d) : null, lastSignal: x.tr.length ? x.tr.reduce((a, z) => z.d > a ? z.d : a, x.tr[0].d) : null }; });
  rules.sort((a, b) => (b.avg ?? -9) - (a.avg ?? -9) || a.id.localeCompare(b.id));
  const counts = {}; for (const r of rules) counts[r.status] = (counts[r.status] || 0) + 1;
  return { generatedAt: now, spec: SPEC_ID + ' (comeback-core.mjs header, pre-registered 25 Oct 2026 before any forward result)', paperFrom: PAPER_FROM, cost: COST, stress: STRESS,
    bar, watchedWith30: pre, barRule: 'max(2.5, one-sided z for 0.05 / ' + Math.max(1, pre) + ' rules with 30+ forward trades)', rules: rules.length, counts, earliest: earliestComeback(rules.filter(r => !r.excluded), PAPER_FROM, (r) => (labs.find(L => L.lab === r.lab) || { runs: {} }).runs[r.id]),
    unmatched, signalsBeforeFreeze: beforeFreeze, line: LINE, board: rules };
}

// data/comeback-lab.json: firstRun-like entries, COMEBACK rules only, so scan.mjs tryQualifies applies its own half gates
export function labFile(board) {
  const firstRun = {}; for (const r of board.board.filter(x => x.status === 'COMEBACK')) firstRun[r.id] = { verdict: 'COMEBACK', lab: r.lab, name: r.name, hold: r.hold, block: r.block, frozenVerdict: r.frozenVerdict, frozenAt: r.frozenAt,
    results: { older: r.halves.older, newer: r.halves.newer }, perYear: { older: { rule: r.perYearHalves.older.rule, spy: r.perYearHalves.older.spy }, newer: { rule: r.perYearHalves.newer.rule, spy: r.perYearHalves.newer.spy } },
    forward: { n: r.n, days: r.days, avg: r.avg, avgStress: r.avgStress, edge: r.edgeVsAverageStock, blockT: r.blockT, bar: r.bar } };
  return { generatedAt: board.generatedAt, preRegistered: board.spec, note: 'NOT a frozen verdict: recomputed every run from each rule\'s FORWARD paper record only (signals after its own frozenAt). Only rules with status COMEBACK are listed; older / newer = first / second half of the forward record by signal date, so scan.mjs tryQualifies applies its usual gates. The rules\' own frozen first runs stay where they are, untouched.', firstRun };
}
// data/comeback-today.json: the standard lab format; newSignals copied from the rule's own lab today file (COMEBACK rules only).
// lastClose is per pick (d = the source file's newest close), so a stale source lab never offers an old list.
export function todayOut(board, todays) {
  const methods = {}; for (const r of board.board.filter(x => x.status === 'COMEBACK')) { const T = todays[r.lab], M = T && T.methods ? T.methods[r.id] : null;
    methods[r.id] = { name: r.name || (M && M.name) || r.id, hold: r.hold, lab: r.lab, tier: 'COMEBACK', source: todayPath(r.lab), sourceGeneratedAt: T ? T.generatedAt || null : null,
      newSignals: M && Array.isArray(M.newSignals) ? M.newSignals.map(p => ({ ...p, signalDay: p.d || null, d: (T && T.lastClose) || p.d || null })) : [] }; }
  return { generatedAt: board.generatedAt, lastClose: null, note: 'COMEBACK lab (COMEBACK-1): rules frozen as rejected / not proven whose FORWARD paper record alone passed every comeback gate. Signals are the rule\'s own lab signals of its newest close. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods };
}

// the earliest a rule could qualify (an estimate, not a gate): forward signals from PAPER_FROM at the signal pace of its own frozen 5-year
// run (trades and distinct signal days per session); it needs 10+ signal days, 40+ trades (20+ in each half) and 6+ distinct blocks
// of `block` sessions (3+ in each half; at best 4 x block + 2 sessions), then its last signal must resolve (hold + 1 sessions).
export function earliestComeback(rules, from = PAPER_FROM, runsOf = () => null) {
  let best = null; for (const r of rules) { const fr = runsOf(r) || {}, R = fr.results || {}, w = fr.window || [], len = w[0] && w[1] ? sessionIndex(w[1]) - sessionIndex(w[0]) + 1 : null;
    const n5 = (R.older && R.older.n || 0) + (R.newer && R.newer.n || 0), d5 = (R.older && R.older.days || 0) + (R.newer && R.newer.days || 0);
    if (!len || !(n5 > 0) || !(d5 > 0)) continue; const span = Math.ceil(Math.max(MIN_DAYS * len / d5, 2 * HALF_N * len / n5, 4 * r.block + 2)), at = span - 1 + r.hold + 1;
    if (!best || at < best.sessions) best = { id: r.id, lab: r.lab, hold: r.hold, block: r.block, sessions: at, pace: { tradesPerSession: +(n5 / len).toFixed(3), signalDaysPerSession: +(d5 / len).toFixed(3) } }; }
  if (!best) return null; let d = from; for (let i = 0; i < best.sessions; i++) d = nextSessionOf(d);
  return { ...best, date: d, note: 'estimate at the rule\'s 5-year signal pace (rules that can come back only); most rules need far longer, and every gate must still pass' };
}
function nextSessionOf(d) { let x = Date.parse(d + 'T00:00:00Z'); for (;;) { x += DAY; const s = new Date(x).toISOString().slice(0, 10), w = new Date(x).getUTCDay(); if (w !== 0 && w !== 6 && !NYSE_HOLIDAYS.has(s)) return s; } }

// the weekly Sunday scoreboard section (scan.mjs prints the same from data/comeback-board.json) and the bot's  comeback  reply
export function scoreboardLines(board) {
  const B = (board && board.board) || [], top = B.filter(r => r.n > 0 && r.avg !== null).sort((a, b) => b.avg - a.avg).slice(0, 5);
  return ['', 'COMEBACK (forward paper records, top 5 by average after 0.8%):', ...(top.length ? top.map(r => '- ' + r.id + ' (' + r.lab + '): ' + r.n + ' trades on ' + r.days + ' days, average ' + pct(r.avg) + ', ' + r.status) : ['- no forward paper trade has finished yet']), LINE];
}
export function boardText(board) {
  if (!board || !Array.isArray(board.board)) return 'COMEBACK BOARD: not built yet (it runs weekday evenings after the labs\' paper lanes, and on Sunday).';
  const c = board.counts || {}, L = ['COMEBACK BOARD (' + String(board.generatedAt).slice(0, 10) + '): ' + board.rules + ' rules watched on forward paper since ' + board.paperFrom + '.',
    'Status: ' + ['COMEBACK', 'WATCHING', 'FADING', 'TOO EARLY'].map(k => (c[k] || 0) + ' ' + k).join(', ') + '.',
    'A rule comes back (TRY SMALL, 1,000 USD) only when its forward record alone has 30+ trades on 10+ days, makes money after 1.2% costs, beats the average stock and SPY per year of capital, stays positive without its 2 best trades, and has block t >= ' + board.bar + (board.watchedWith30 > 0 ? ' (the luck bar is raised for every rule being watched: Bonferroni over the ' + board.watchedWith30 + ' rule' + (board.watchedWith30 === 1 ? '' : 's') + ' with 30+ forward trades, never under 2.5).' : ' (bar 2.5 until rules reach 30 forward trades; then it rises with every rule that does: Bonferroni).')];
  const shown = board.board.filter(r => r.n > 0).slice(0, 15);
  if (shown.length) { L.push(''); for (const r of shown) L.push('- ' + r.id + ' (' + r.lab + ', frozen ' + (r.frozenVerdict || '?') + '): ' + r.n + ' trades / ' + r.days + ' days, avg ' + pct(r.avg) + ', vs avg stock ' + pct(r.edgeVsAverageStock) + ', vs SPY/yr ' + pct(r.vsSpy && r.vsSpy.rule !== null && r.vsSpy.spy !== null ? r.vsSpy.rule - r.vsSpy.spy : null) + ', t ' + (r.blockT ?? 'n/a') + ' -> ' + r.status); }
  else L.push('', 'No forward paper trade has finished yet: every rule is TOO EARLY.');
  if (board.earliest) L.push('', 'Earliest possible comeback (estimate at the 5-year signal pace): ' + board.earliest.date + ' (' + board.earliest.id + ').');
  L.push('', LINE); return L.join('\n');
}

// the library entry (written before any result; idempotent)
export const LIBRARY_ENTRY = { id: SPEC_ID, family: 'Comeback board (forward paper records)', name: 'COMEBACK BOARD: a rejected / not-proven rule can come back to TRY SMALL on its own forward paper record only',
  explain: 'RULE (comeback-core.mjs header): every lab rule with a frozen first-run verdict keeps its forward paper lane; only paper trades whose signal day is after that rule\'s frozenAt count (resolved by the lab at the rule\'s own hold and exits, 0.8% cost, 1.2% stress). COMEBACK = 30+ resolved trades on 10+ distinct signal days, average after 1.2% > 0, beats the average stock on the same days, beats SPY per year of capital, > 0 without its 2 best, block t >= max(2.5, one-sided z for 0.05 / N) where N = rules on the board with 30+ forward trades (Bonferroni), and both date halves of the forward record pass the TRY SMALL half gates. Near-copies of live rules (TRY_DUPLICATE), paused rules, baskets, intraday and options rules never come back. Frozen verdicts are never re-run or edited.',
  status: 'pre-registered 25 Oct 2026 before any forward result (forward paper lanes start 26 Oct 2026)', agent: 'comeback', sources: [],
  note: 'Owner, 25 Oct 2026: "Don\'t reject all, work them out, maybe with time the average will decide differently." Outputs data/comeback-board.json, data/comeback-lab.json (COMEBACK rules only, recomputed each run), data/comeback-today.json (lab \'comeback\' in scan.mjs TRY SMALL).' };
export function preRegister(LB) { if (!LB || !Array.isArray(LB.strategies) || LB.strategies.some(e => e.id === SPEC_ID)) return 0; LB.strategies.push({ ...LIBRARY_ENTRY }); return 1; }
