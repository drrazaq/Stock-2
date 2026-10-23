// CATALYST RUN-UP LANE, pure rules (shared helper; imported by catalyst-lab.mjs and its tests, not run by a workflow).
// Pre-registered 23 Oct 2026 in data/strategy-library.json as CAT-RUN1 and CAT-NEWS1 (the owner's OCGN case). Nothing here reads the
// network or the disk; every rule the study and the live list use is here, so a test can hold it to the registered wording.

// ---- 1. 8-K text -> dated catalysts ----------------------------------------------------------------------------------------------
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = '(January|February|March|April|May|June|July|August|September|October|November|December)';
const ORD = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4 };
const pad = (n) => String(n).padStart(2, '0');
// date patterns, each -> { date: the EARLIEST day the event can happen, precision }
const DATE_RX = [
  { rx: new RegExp('\\b' + MON + '\\s+(\\d{1,2}),?\\s+(20\\d\\d)\\b', 'gi'), f: (m) => ({ date: m[3] + '-' + pad(MONTHS.indexOf(m[1].toLowerCase()) + 1) + '-' + pad(+m[2]), precision: 'day' }) },
  { rx: /\b(first|second|third|fourth|1st|2nd|3rd|4th)\s+(?:calendar\s+)?quarter\s+(?:of\s+)?(20\d\d)\b/gi, f: (m) => ({ date: m[2] + '-' + pad((ORD[m[1].toLowerCase()] - 1) * 3 + 1) + '-01', precision: 'quarter' }) },
  { rx: /\b(?:Q([1-4])|([1-4])Q)\s*(?:of\s+)?'?(20\d\d|\d\d)\b/g, f: (m) => ({ date: (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad((+(m[1] || m[2]) - 1) * 3 + 1) + '-01', precision: 'quarter' }) },
  { rx: /\b(first|second|1st|2nd)\s+half\s+(?:of\s+)?(20\d\d)\b/gi, f: (m) => ({ date: m[2] + (ORD[m[1].toLowerCase()] === 1 ? '-01-01' : '-07-01'), precision: 'half' }) },
  { rx: /\b(?:([12])H|H([12]))\s*(?:of\s+)?'?(20\d\d|\d\d)\b/g, f: (m) => ({ date: (m[3].length === 2 ? '20' + m[3] : m[3]) + ((m[1] || m[2]) === '1' ? '-01-01' : '-07-01'), precision: 'half' }) },
  { rx: new RegExp('\\b' + MON + '\\s+(?:of\\s+)?(20\\d\\d)\\b', 'gi'), f: (m) => ({ date: m[2] + '-' + pad(MONTHS.indexOf(m[1].toLowerCase()) + 1) + '-01', precision: 'month' }) },
];
const KINDS = [
  { kind: 'PDUFA', rx: /\bPDUFA\b|target action date|Prescription Drug User Fee Act/i, needsExpect: false },
  { kind: 'ADCOM', rx: /advisory committee/i, needsExpect: false },
  { kind: 'TOPLINE', rx: /\btop-?line\b/i, needsExpect: true },
];
const EXPECT = /\b(expect\w*|anticipat\w*|plan(s|ned|ning)?|on track|guid\w*|remain\w*|scheduled|intend\w*|will)\b/i;
export function html2text(h) {
  return String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&#8203;|&#x200b;|​/gi, '').replace(/&#8217;|&rsquo;/gi, '’').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#821[12];|&ndash;|&mdash;/gi, '-').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
function sentences(text) {
  const t = String(text || '').replace(/\bU\.S\./g, 'US').replace(/\b(Inc|Corp|Co|Ltd|No|approx|Dr|Mr|Ms|vs|e\.g|i\.e)\./gi, '$1');
  return t.split(/(?<=[.;!?])\s+(?=[A-Z(“"])/);
}
// text of one 8-K document + its EDGAR filing date -> [{ kind, date, precision, text }] in text order; one per kind per sentence
export function extractCatalysts(text, filingDate) {
  const out = [];
  for (const s of sentences(text)) {
    for (const K of KINDS) {
      const km = s.match(K.rx); if (!km) continue;
      if (K.needsExpect && !EXPECT.test(s)) continue;
      const at = km.index, found = [];
      for (const P of DATE_RX) { P.rx.lastIndex = 0; let m; while ((m = P.rx.exec(s))) { const v = P.f(m); if (!found.some(x => m.index < x.end && x.start < m.index + m[0].length)) found.push({ ...v, start: m.index, end: m.index + m[0].length }); } }
      const ok = found.filter(x => /^\d{4}-\d\d-\d\d$/.test(x.date) && !isNaN(Date.parse(x.date)) && x.date > filingDate);
      if (!ok.length) continue;
      const best = ok.sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at))[0];
      out.push({ kind: K.kind, date: best.date, precision: best.precision, text: s.slice(0, 300) });
    }
  }
  return out;
}

// ---- 2. NYSE trading calendar (for dates past the price cache: the live list) ---------------------------------------------------
const ymd = (d) => d.toISOString().slice(0, 10), dt = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const nthDow = (y, m, dow, n) => { const d = dt(y, m, 1); d.setUTCDate(1 + ((dow - d.getUTCDay() + 7) % 7) + 7 * (n - 1)); return d; };
const lastDow = (y, m, dow) => { const d = dt(y, m + 1, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - dow + 7) % 7)); return d; };
const observed = (d) => { const w = d.getUTCDay(), o = new Date(d); if (w === 6) o.setUTCDate(o.getUTCDate() - 1); if (w === 0) o.setUTCDate(o.getUTCDate() + 1); return o; };
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return dt(y, mo, da); }
const HCACHE = {};
export function nyseHolidays(y) {
  if (HCACHE[y]) return HCACHE[y];
  const ny = dt(y, 1, 1), s = new Set();
  if (ny.getUTCDay() !== 6) s.add(ymd(observed(ny)));       // New Year on a Saturday: no Friday closure (NYSE rule)
  s.add(ymd(nthDow(y, 1, 1, 3))); s.add(ymd(nthDow(y, 2, 1, 3)));
  const gf = easter(y); gf.setUTCDate(gf.getUTCDate() - 2); s.add(ymd(gf));
  s.add(ymd(lastDow(y, 5, 1))); if (y >= 2022) s.add(ymd(observed(dt(y, 6, 19)))); s.add(ymd(observed(dt(y, 7, 4))));
  s.add(ymd(nthDow(y, 9, 1, 1))); s.add(ymd(nthDow(y, 11, 4, 4))); s.add(ymd(observed(dt(y, 12, 25))));
  if (y === 2025) s.add('2025-01-09');                           // national day of mourning (President Carter)
  return (HCACHE[y] = s);
}
export const isSession = (d) => { const x = new Date(d + 'T12:00:00Z'), w = x.getUTCDay(); return w !== 0 && w !== 6 && !nyseHolidays(x.getUTCFullYear()).has(d); };
export function tradingSessions(from, to) { const out = []; for (let x = new Date(from + 'T12:00:00Z'); ymd(x) <= to; x.setUTCDate(x.getUTCDate() + 1)) { const d = ymd(x); if (isSession(d)) out.push(d); } return out; }

// ---- 3. the CAT-RUN1 window (fixed: buy the open 30 sessions before the event session, sell the close 2 sessions before) ----------
export const RUN_BEFORE = 30, SELL_BEFORE = 2;
export const firstOnOrAfter = (S, d) => { let lo = 0, hi = S.length; while (lo < hi) { const m = (lo + hi) >> 1; if (S[m] < d) lo = m + 1; else hi = m; } return lo; };
// S = sorted session dates (they must reach the event session); -> { eventSession, buy, sell, iEvent, iBuy, iSell, held } or null
export function runUpPlan(S, eventDate) {
  const iE = firstOnOrAfter(S, eventDate); if (iE >= S.length) return null;
  const iB = iE - RUN_BEFORE, iS = iE - SELL_BEFORE; if (iB < 0) return null;
  return { eventSession: S[iE], buy: S[iB], sell: S[iS], iEvent: iE, iBuy: iB, iSell: iS, held: iS - iB + 1 };
}

// ---- 4. gates ---------------------------------------------------------------------------------------------------------------------
export const DILUTION_FORMS = new Set(['424B5', 'S-1', 'S-1/A', 'S-3', 'S-3/A']), DILUTION_SESSIONS = 20;
// filings [{ form, d: EDGAR filing date }]; a filing counts from the first session on/after its date; window = the 20 sessions before entry
export function dilutedBefore(filings, S, iEntry) {
  for (const f of filings || []) { if (!DILUTION_FORMS.has(f.form)) continue; const i = firstOnOrAfter(S, f.d);
    if (i >= iEntry - DILUTION_SESSIONS && i <= iEntry - 1) return f.form + ' ' + f.d; }
  return null;
}
// house lottery rule: a close 15%+ above the previous close on any of the 21 sessions up to the signal close (closes indexed like S)
export function lotteryJump(closes, iSignal) { for (let k = Math.max(1, iSignal - 20); k <= iSignal; k++) { const a = closes[k - 1], b = closes[k]; if (a > 0 && b > 0 && b / a - 1 >= 0.15) return +(b / a - 1).toFixed(3); } return null; }

// ---- 5. CAT-NEWS1 phrase lists (fixed in the pre-registration) --------------------------------------------------------------------
export const POSITIVE = ['Fast Track designation', 'Breakthrough Therapy designation', 'Orphan Drug designation', 'Rare Pediatric Disease designation', 'Regenerative Medicine Advanced Therapy', 'Breakthrough Device designation',
  'positive topline', 'positive top-line', 'met its primary endpoint', 'met the primary endpoint', 'achieved its primary endpoint', 'achieved the primary endpoint', 'first patient dosed', 'completed enrollment', 'completion of enrollment',
  'awarded a contract', 'contract award', 'strategic partnership', 'strategic collaboration', 'collaboration and license agreement', 'license and collaboration agreement', 'exclusive license agreement', 'supply agreement', 'purchase order'];
export const NEGATIVE = ['complete response letter', 'clinical hold', 'did not meet the primary endpoint', 'did not meet its primary endpoint', 'failed to meet', 'did not achieve', 'substantial doubt', 'going concern',
  'Termination of a Material Definitive Agreement', 'Notice of Delisting', 'Non-Reliance on Previously Issued', 'refusal to file', 'discontinue development', 'reduction in force', 'workforce reduction'];
export const CATALYST_PHRASES = ['PDUFA', 'target action date', 'advisory committee', 'topline', 'top-line'];
export const BIO_SIC = /^(283[3-6]|384[1-5]|3851|8731|8071)$/;

// ---- 6. verdict (the registered gates) --------------------------------------------------------------------------------------------
// R = { older, newer } each { n, avg, avgStress, edge, t, vsOwn, noTop2 }; bar = the PROVEN bar (max of own, league, 4.0)
export const TIER2_T = 2.5, MIN_PER_HALF = 20;
export function verdictOf(R, bar) {
  const H = ['older', 'newer'].map(k => R[k] || {}), why = [];
  if (!H.every(r => r.n >= MIN_PER_HALF)) return { verdict: 'TOO FEW CASES', why: 'fewer than ' + MIN_PER_HALF + ' trades in a half (' + H.map(r => r.n || 0).join(' / ') + ')' };
  H.forEach((r, j) => { const hf = j ? 'newer' : 'older';
    if (!(r.avg > 0)) why.push('lost money after 0.8% costs in the ' + hf + ' half');
    if (!(r.avgStress > 0)) why.push('lost money after 1.2% costs in the ' + hf + ' half');
    if (!(r.edge > 0)) why.push('not better than the average stock in the ' + hf + ' half');
    if (!(r.t >= TIER2_T)) why.push('t ' + r.t + ' under ' + TIER2_T + ' in the ' + hf + ' half');
    if (!(r.vsOwn > 0)) why.push('not better than the same stock on its other days in the ' + hf + ' half');
    if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); });
  if (!why.length) return H.every(r => r.t >= bar) ? { verdict: 'PROVEN', why: 'every gate passed in both halves and t clears the proof bar ' + bar } : { verdict: 'TRADABLE SMALL', why: 'every gate passed in both halves with t >= ' + TIER2_T + ', below the proof bar ' + bar };
  return { verdict: H.every(r => r.edge > 0) ? 'NOT PROVEN' : 'REJECTED', why: why.join('; ') };
}
export const tierOfVerdict = (v) => v === 'PROVEN' ? 'proven' : v === 'TRADABLE SMALL' ? 'small' : null;
