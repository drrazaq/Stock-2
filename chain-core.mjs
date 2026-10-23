// CHAIN DECODER, pure rules (shared helper; imported by chain-decoder.mjs, scan.mjs-free, and its tests; not run by a workflow).
// Pre-registered 23 Oct 2026 in data/strategy-library.json as CHAIN-MOM1 / CHAIN-DEMAND1 / CHAIN-LAG1 / CHAIN-READ1, BEFORE any run.
// Nothing here reads the network or the disk, so a test can hold every rule to its registered wording.

// ---- sentences ----------------------------------------------------------------------------------------------------------------
export function sentences(text) {
  const t = String(text || '').replace(/\bU\.S\./g, 'US').replace(/\b(Inc|Corp|Co|Ltd|No|approx|Dr|Mr|Ms|vs|e\.g|i\.e)\./gi, '$1').replace(/(\d)\.(\d)/g, '$1․$2');
  return t.split(/(?<=[.;!?])\s+(?=[A-Z(“"$0-9])/).map(s => s.replace(/․/g, '.'));
}

// ---- CHAIN-DEMAND1 keyword rule (and part A for CHAIN-READ1) ---------------------------------------------------------------------
const RAISE_A = /\b(rais(e|es|ed|ing)|increas(e|es|ed|ing)|lift(s|ed|ing)?|boost(s|ed|ing)?)\b[^.;]{0,80}?\b(guidance|outlook|forecast)\b/i;
const RAISE_B = /\b(guidance|outlook|forecast)\b[^.;]{0,40}?\b(raised|increased|lifted)\b/i;
const CAPEX = /\bcapital (expenditures?|spending|investments?)\b|\bcapex\b/i, CAPEX_UP = /\b(increas\w*|higher|rais\w*|grow\w*|accelerat\w*|expand\w*)\b/i;
const VETO = /\b(lower(s|ed|ing)?|reduc\w*|decreas\w*|cut|cuts|cutting|narrow\w*|withdr\w*)\b/i;
export const guidanceRaised = (s) => (RAISE_A.test(s) || RAISE_B.test(s)) && !VETO.test(s);
export const capexUp = (s) => CAPEX.test(s) && CAPEX_UP.test(s) && !VETO.test(s);
// text of an earnings 8-K (its exhibit 99) -> { hit, kind: 'guidance' | 'capex', text: the first counting sentence }
export function demandSignal(text) {
  for (const s of sentences(text)) { if (guidanceRaised(s)) return { hit: true, kind: 'guidance', text: s.slice(0, 300) }; if (capexUp(s)) return { hit: true, kind: 'capex', text: s.slice(0, 300) }; }
  return { hit: false, kind: null, text: null };
}

// ---- CHAIN-READ1 keyword rule -----------------------------------------------------------------------------------------------------
const REV = /\b(revenues?|net sales|sales)\b/i, UPW = /\b(increas\w*|grew|growth|up|rose|higher)\b/i, DOWNW = /\b(decreas\w*|declin\w*|fell|lower)\b/i;
const YOY = /\b(year[- ]over[- ]year|prior[- ]year|same period|same quarter|compared (to|with)|versus|vs)\b/i, PCT = /(\d{1,4}(?:\.\d+)?)\s?(%|percent\b)/gi;
// the largest stated growth (fraction) of a revenue sentence against the prior year, or null
export function revenueGrowth(text) { let best = null;
  for (const s of sentences(text)) { if (!REV.test(s) || !UPW.test(s) || !YOY.test(s) || DOWNW.test(s)) continue;
    PCT.lastIndex = 0; let m; while ((m = PCT.exec(s))) { const v = +m[1] / 100; if (v > 0 && v < 20 && (best === null || v > best)) best = v; } }
  return best; }
// -> { hit, growth, text }: revenue up 10%+ on the prior year AND a raised-guidance sentence (part A of the CHAIN-DEMAND1 rule)
export function readThrough(text) { const growth = revenueGrowth(text), g = sentences(text).find(guidanceRaised);
  return { hit: growth !== null && growth >= 0.10 && !!g, growth, text: g ? g.slice(0, 300) : null }; }

// ---- graph: major-customer disclosures and point-in-time links ---------------------------------------------------------------------
const CONC = /\baccounted for\b|\brepresent\w*\b|\bcomprised\b|%\s*of\b|\bpercent of\b|\blargest customers?\b|\b10%/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const aliasRx = (aliases) => new RegExp('(^|[^A-Za-z0-9])(' + aliases.map(esc).join('|') + ')(?![A-Za-z0-9])', 'i');
// the first sentence that names one of the customer's aliases next to concentration words, or null
export function customerSentence(text, aliases) { const rx = aliasRx(aliases); for (const s of sentences(text)) if (rx.test(s) && CONC.test(s)) return s.slice(0, 400); return null; }
export const LINK_DAYS = 400;
// filed = filing dates (YYYY-MM-DD) that showed the link; day = a session date -> is the link public and still current on that day
export function linkActive(filed, day) { let last = null; for (const d of filed) if (d <= day && (last === null || d > last)) last = d;
  return last !== null && (Date.parse(day) - Date.parse(last)) / 864e5 <= LINK_DAYS; }

// ---- graph: 8-K material agreements (items 1.01 / 7.01 / 8.01) -----------------------------------------------------------------
const AGREE = /\b(agreements?|contracts?|purchase orders?|orders?|partnership|collaboration|agreed|commitments?)\b/i;
const MONEY = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(million|billion|thousand)?\b/gi;
export function dollars(s) { let best = null; MONEY.lastIndex = 0; let m; while ((m = MONEY.exec(s))) { const v = +m[1].replace(/,/g, '') * ({ thousand: 1e3, million: 1e6, billion: 1e9 }[String(m[2] || '').toLowerCase()] || 1); if (v >= 1e5 && (best === null || v > best)) best = v; } return best; }
// -> { text, value } : the first sentence naming the customer with agreement words; value = the largest stated USD amount in the
// sentences that name the customer (null when none is stated), or null when no such sentence exists
export function agreementEvidence(text, aliases) { const rx = aliasRx(aliases), S = sentences(text).filter(s => rx.test(s)), a = S.find(s => AGREE.test(s));
  if (!a) return null; const vals = S.map(dollars).filter(v => v !== null); return { text: a.slice(0, 400), value: vals.length ? Math.max(...vals) : null }; }

// ---- CHAIN-MOM1 selection -----------------------------------------------------------------------------------------------------
export const MOM_TOP = 3, MIN_LAYER = 3;
// layers = [{ key, members: [{ s, r63, above50, ok }] }] (point-in-time members with a 63-session return); spy63 = SPY's return
// -> { ranked: [{ key, excess, n }], top: the first 3, buys: [{ s, layers: [keys] }] members of the top layers above their 50-day that pass the gates }
export function momSelect(layers, spy63) {
  const ranked = layers.map(L => { const v = L.members.filter(x => typeof x.r63 === 'number' && isFinite(x.r63)); return { key: L.key, n: v.length, excess: v.length >= MIN_LAYER ? v.reduce((a, x) => a + x.r63, 0) / v.length - spy63 : null, L }; })
    .filter(x => x.excess !== null).sort((a, b) => b.excess - a.excess);
  const top = ranked.slice(0, MOM_TOP), buys = new Map();
  for (const t of top) for (const x of t.L.members) { if (!x.above50 || !x.ok) continue; if (!buys.has(x.s)) buys.set(x.s, { s: x.s, layers: [] }); buys.get(x.s).layers.push(t.key); }
  const strip = (x) => ({ key: x.key, excess: x.excess, n: x.n });
  return { ranked: ranked.map(strip), top: top.map(strip), buys: [...buys.values()] }; }

// ---- CHAIN-LAG1: does layer A's month predict layer B's next month? (learned on the first half only) ----------------------------
export const LAG_T = 3.0, LAG_MAX = 10, LAG_MIN_MONTHS = 15;
const chainOf = (key) => key.split('|')[0];
// series = { 'chain|layer': [monthly excess return or null, ...] } over the FIRST half only -> kept pairs [{ from, to, slope, t, n }]
export function lagLearn(series) { const keys = Object.keys(series), out = [];
  for (const a of keys) for (const b of keys) { if (a === b || chainOf(a) !== chainOf(b)) continue; const X = [], Y = [];
    for (let m = 0; m + 1 < series[a].length && m + 1 < series[b].length; m++) { const x = series[a][m], y = series[b][m + 1]; if (typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y)) { X.push(x); Y.push(y); } }
    const n = X.length; if (n < LAG_MIN_MONTHS) continue; const mx = X.reduce((s, v) => s + v, 0) / n, my = Y.reduce((s, v) => s + v, 0) / n;
    let sxx = 0, sxy = 0; for (let k = 0; k < n; k++) { sxx += (X[k] - mx) ** 2; sxy += (X[k] - mx) * (Y[k] - my); } if (!(sxx > 0)) continue;
    const slope = sxy / sxx, icpt = my - slope * mx; let sse = 0; for (let k = 0; k < n; k++) sse += (Y[k] - icpt - slope * X[k]) ** 2;
    const se = Math.sqrt(sse / (n - 2) / sxx), t = se > 0 ? slope / se : 0; if (Math.abs(t) >= LAG_T) out.push({ from: a, to: b, slope: +slope.toFixed(4), t: +t.toFixed(2), n }); }
  return out.sort((p, q) => Math.abs(q.t) - Math.abs(p.t)).slice(0, LAG_MAX); }
// buy layer B next month when sign(slope) x A's excess return this month > 0
export const lagPredict = (pair, aExcess) => typeof aExcess === 'number' && isFinite(aExcess) && Math.sign(pair.slope) * aExcess > 0;

// ---- exits ------------------------------------------------------------------------------------------------------------------------
// bars[k] = { o, l, c } (null/NaN when missing); buy the open of iEntry, hold `hold` sessions (sell the close of iEntry + hold - 1);
// stop `stop` (0.2 = 20%) under the entry: out on the first session whose low reaches it, at the lower of its open and the stop price
export function stopExit(bars, iEntry, hold, stop) { const e = bars[iEntry] && bars[iEntry].o; if (!(e > 0)) return null; const last = iEntry + hold - 1; if (last >= bars.length) return null;
  const sp = e * (1 - stop), r = (x) => +(x / e - 1).toFixed(6); let lastC = null, at = null;
  for (let k = iEntry; k <= last; k++) { const b = bars[k]; if (!b) continue; if (k > iEntry && b.o > 0 && b.o <= sp) return { ret: r(b.o), why: 'stop', at: k };
    if (b.l > 0 && b.l <= sp) return { ret: r(sp), why: 'stop', at: k }; if (b.c > 0) { lastC = b.c; at = k; } }
  return lastC === null ? null : { ret: r(lastC), why: 'time', at }; }
