// EXACT ECONOMIC SERIES (6 Nov 2026 repair). Pure functions: no network, no files, no keys.
// Problem fixed: the calendar kept ONE row per broad kind and day, so a subsidiary provider row (continuing claims, private payrolls,
// productivity) could replace the headline of an official release, and a provider number could appear under the wrong series name.
// Rules here:
//   - every provider row is mapped to ONE exact series by its exact name, or to nothing (UNKNOWN). No broad "kind" guessing.
//   - a value is shown only if its unit is known and matches the series, and the number lies in a conservative plausible band for that
//     series; otherwise the figure is UNKNOWN (never shown under a series it may not belong to).
//   - consensus forecasts (a market estimate) are kept apart from released/previous values, each with its source and retrieval time.
//   - (r2) provider values are labelled AS RETRIEVED, with their real retrieval time versus the release time (before / after / UNKNOWN);
//     a field name never certifies a pre-release vintage. A missing or invalid retrieval time is UNKNOWN and is shown as such (r3).
//   - headline and subsidiary series of one release are separate entries; a subsidiary never renames or replaces the headline.
// The pre-registered calendar STUDY (MODE=study, C.hist) is not changed by this module.

// unit: 'K' = thousands of persons (claims levels, payroll CHANGES); '%' = percent. band = conservative sanity range in that unit;
// a value outside it is refused as UNKNOWN (for example during a 2020-style claims spike), never shown as if verified.
export const SERIES = Object.freeze({
  CLAIMS_INITIAL: { title: 'Initial jobless claims', release: 'claims', headline: true, unit: 'K', band: [100, 1000], ref: 'WEEK_INITIAL', lowerIsStronger: true },
  CLAIMS_INITIAL_4WK: { title: 'Initial claims, 4-week average', release: 'claims', headline: false, unit: 'K', band: [100, 1000], ref: 'WEEK_INITIAL', lowerIsStronger: true },
  CLAIMS_CONTINUED: { title: 'Continuing claims', release: 'claims', headline: false, unit: 'K', band: [800, 5000], ref: 'WEEK_CONTINUED', lowerIsStronger: true },
  CLAIMS_CONTINUED_4WK: { title: 'Continuing claims, 4-week average', release: 'claims', headline: false, unit: 'K', band: [800, 5000], ref: 'WEEK_CONTINUED', lowerIsStronger: true },
  PAYROLLS_TOTAL: { title: 'Nonfarm payrolls (monthly change)', release: 'empsit', headline: true, unit: 'K', band: [-1500, 1500], ref: 'MONTH' },
  PAYROLLS_PRIVATE: { title: 'Private payrolls (monthly change)', release: 'empsit', headline: false, unit: 'K', band: [-1500, 1500], ref: 'MONTH' },
  UNEMPLOYMENT_RATE: { title: 'Unemployment rate', release: 'empsit', headline: false, unit: '%', band: [2, 15], ref: 'MONTH', lowerIsStronger: true },
  PRODUCTIVITY: { title: 'Nonfarm productivity (quarter, annual rate)', release: 'prod2', headline: true, unit: '%', band: [-15, 15], ref: 'QUARTER' },
  UNIT_LABOR_COSTS: { title: 'Unit labor costs (quarter, annual rate)', release: 'prod2', headline: false, unit: '%', band: [-15, 15], ref: 'QUARTER' },
  CPI_MOM: { title: 'CPI (month on month)', release: 'cpi', headline: true, unit: '%', band: [-2, 2], ref: 'MONTH', kind: 'CPI' },
  CPI_YOY: { title: 'CPI (year on year)', release: 'cpi', headline: false, unit: '%', band: [-3, 15], ref: 'MONTH', kind: 'CPI' },
  CORE_CPI_MOM: { title: 'Core CPI (month on month)', release: 'cpi', headline: false, unit: '%', band: [-2, 2], ref: 'MONTH', kind: 'CORE_CPI' },
  CORE_CPI_YOY: { title: 'Core CPI (year on year)', release: 'cpi', headline: false, unit: '%', band: [-3, 15], ref: 'MONTH', kind: 'CORE_CPI' },
  PPI_MOM: { title: 'PPI final demand (month on month)', release: 'ppi', headline: true, unit: '%', band: [-3, 3], ref: 'MONTH', kind: 'PPI' },
  PPI_YOY: { title: 'PPI final demand (year on year)', release: 'ppi', headline: false, unit: '%', band: [-5, 20], ref: 'MONTH', kind: 'PPI' },
  FED_RATE: { title: 'Fed funds target (upper bound)', release: 'fomc', headline: true, unit: '%', band: [0, 15], ref: 'MEETING', kind: 'FED' }
});

// official releases: title, agency, public schedule page. The schedule page is the authority for the DATE only.
export const RELEASES = Object.freeze({
  cpi: { title: 'Inflation (CPI)', agency: 'BLS', url: 'https://www.bls.gov/schedule/news_release/cpi.htm', kind: 'CPI' },
  ppi: { title: 'Producer prices (PPI)', agency: 'BLS', url: 'https://www.bls.gov/schedule/news_release/ppi.htm', kind: 'PPI' },
  empsit: { title: 'Jobs report', agency: 'BLS', url: 'https://www.bls.gov/schedule/news_release/empsit.htm', kind: 'JOBS' },
  prod2: { title: 'Productivity and costs', agency: 'BLS', url: 'https://www.bls.gov/schedule/news_release/prod2.htm', kind: 'PRODUCTIVITY' },
  realer: { title: 'Real earnings', agency: 'BLS', url: 'https://www.bls.gov/schedule/news_release/realer.htm', kind: null },
  fomc: { title: 'Fed rate decision', agency: 'Federal Reserve', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', kind: 'FED' },
  claims: { title: 'Jobless claims', agency: 'DOL', url: 'https://www.dol.gov/ui/data.pdf', kind: 'CLAIMS' }
});

// EXACT provider names (case-insensitive, after removing a trailing "(Oct)"/"(Q3)" style period). Anything else maps to nothing.
const NAMES = [
  [/^initial jobless claims$/i, 'CLAIMS_INITIAL'],
  [/^(initial )?jobless claims 4[- ]week average$/i, 'CLAIMS_INITIAL_4WK'],
  [/^continuing jobless claims$/i, 'CLAIMS_CONTINUED'],
  [/^continuing (jobless )?claims 4[- ]week average$/i, 'CLAIMS_CONTINUED_4WK'],
  [/^non[- ]?farm payrolls$/i, 'PAYROLLS_TOTAL'],
  [/^(non[- ]?farm payrolls private|private non[- ]?farm payrolls)$/i, 'PAYROLLS_PRIVATE'],
  [/^unemployment rate$/i, 'UNEMPLOYMENT_RATE'],
  [/^non[- ]?farm productivity( qoq)?$/i, 'PRODUCTIVITY'],
  [/^unit labou?r costs( qoq)?$/i, 'UNIT_LABOR_COSTS'],
  [/^cpi mom$/i, 'CPI_MOM'], [/^cpi yoy$/i, 'CPI_YOY'], [/^core cpi mom$/i, 'CORE_CPI_MOM'], [/^core cpi yoy$/i, 'CORE_CPI_YOY'],
  [/^ppi mom$/i, 'PPI_MOM'], [/^ppi yoy$/i, 'PPI_YOY'],
  [/^(fed interest rate decision|fomc interest rate decision|fed funds (target )?rate upper bound)$/i, 'FED_RATE']   // (r2) a bare 'Fed Funds Rate' may be the EFFECTIVE rate: not mapped (UNKNOWN)
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function seriesOf(providerName) {
  const n = String(providerName || '').replace(/\s*\((?:[a-z]{3,9}|q[1-4])\)\s*$/i, '').replace(/\s+/g, ' ').trim();
  for (const [re, id] of NAMES) if (re.test(n)) return id;
  return null;
}
// the provider's own period hint, e.g. "CPI MoM (Oct)" -> 'Oct'; never invented
export const providerPeriod = (name) => { const m = /\(([a-z]{3,9}|q[1-4])\)\s*$/i.exec(String(name || '')); return m ? m[1] : null; };

// a raw provider value ("1,710K", "2.5%", "5", 0.3) -> {v, unit} in the provider's stated unit, or null
export function parseRaw(raw, unitField) {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim(), m = /^([-+]?\d[\d,]*\.?\d*|[-+]?\.\d+)\s*([KMB%])?$/i.exec(s);
  if (!m) return null;
  const v = parseFloat(m[1].replace(/,/g, '')); if (!Number.isFinite(v)) return null;
  const suf = m[2] ? m[2].toUpperCase() : '', uf = String(unitField || '').trim().toUpperCase();
  const unit = suf || (/^(K|M|B|%)$/.test(uf) ? uf : '');
  return { v, unit };
}
// convert to the series unit; unknown or mismatched unit -> null
function toSeriesUnit(p, series) {
  if (!p || !p.unit) return null;
  if (series.unit === '%') return p.unit === '%' ? p.v : null;
  if (series.unit === 'K') return p.unit === 'K' ? p.v : p.unit === 'M' ? p.v * 1000 : null;
  return null;
}
// verify one provider value for a series: {v, unit} or {unknown: reason}
export function verifyValue(seriesId, raw, unitField) {
  const s = SERIES[seriesId]; if (!s) return { unknown: 'series not mapped' };
  if (raw === null || raw === undefined || raw === '') return { unknown: 'not provided' };
  const p = parseRaw(raw, unitField); if (!p) return { unknown: 'unreadable value' };
  const v = toSeriesUnit(p, s); if (v === null) return { unknown: 'unit not stated or not ' + (s.unit === 'K' ? 'thousands' : 'percent') };
  if (!(v >= s.band[0] && v <= s.band[1])) return { unknown: 'value outside the plausible range for this series (source mapping not verified)' };
  return { v: +v.toFixed(4), unit: s.unit };
}

// reference period of a release on date d (YYYY-MM-DD, New York): official schedule text wins; weekly claims use the DOL convention
// (initial claims: week ending the Saturday before the Thursday release; continuing claims: one week earlier), labelled as derived.
// (r2, Codex R1) the provider's own period hint must AGREE with the official reference; a disagreement is a conflict, never relabelled.
const FULLM = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], QN = { first: 1, second: 2, third: 3, fourth: 4 };
export function periodAgrees(officialRef, hint) {
  if (!hint) return null;   // no hint: nothing to compare
  const m = /^([A-Za-z]+) (\d{4})$/.exec(officialRef || ''), q = /^(First|Second|Third|Fourth) Quarter (\d{4})/i.exec(officialRef || ''), h = hint.toLowerCase();
  if (m && FULLM.includes(m[1].toLowerCase())) return MONTHS.indexOf(h.slice(0, 3)) === FULLM.indexOf(m[1].toLowerCase());
  if (q) return /^q[1-4]$/.test(h) && +h[1] === QN[q[1].toLowerCase()];
  return false;
}
export function referencePeriod(seriesId, releaseDay, officialRef, providerName) {
  const s = SERIES[seriesId]; if (!s) return null; const hint = providerPeriod(providerName);
  if (officialRef) { const ok = periodAgrees(officialRef, hint); return ok === false ? { period: officialRef, basis: 'official schedule', conflict: true, providerHint: hint } : { period: officialRef, basis: 'official schedule' + (hint ? ' (provider period agrees)' : ' (provider gave no period)'), providerHint: hint }; }
  if (s.ref === 'WEEK_INITIAL' || s.ref === 'WEEK_CONTINUED') {
    const d = new Date(releaseDay + 'T12:00:00Z'); if (isNaN(d)) return null;
    const back = ((d.getUTCDay() + 1) % 7) || 7, end = new Date(d.getTime() - (back + (s.ref === 'WEEK_CONTINUED' ? 7 : 0)) * 864e5);
    return { period: 'week ending ' + end.toISOString().slice(0, 10), basis: 'derived (DOL weekly convention)' };
  }
  const p = providerPeriod(providerName); if (p) { const mo = MONTHS.indexOf(p.slice(0, 3).toLowerCase()); return { period: mo >= 0 ? p.slice(0, 1).toUpperCase() + p.slice(1).toLowerCase() : p.toUpperCase(), basis: 'provider name' }; }
  return null;
}

// a value the provider did not give at all is absent (null), not UNKNOWN; the raw string wins over a pre-parsed number
const given = (raw, parsed) => raw !== null && raw !== undefined && raw !== '' ? raw : parsed !== null && parsed !== undefined && parsed !== '' ? parsed : null;
// one provider row -> a series entry (consensus / previous / actual kept apart, each with source + retrieval time)
export const retrievalTiming = (retrievedAt, releaseAt) => { const a = Date.parse(retrievedAt || ''), b = Date.parse(releaseAt && String(releaseAt).length <= 19 ? releaseAt + 'Z' : releaseAt || ''); return !Number.isFinite(a) || !Number.isFinite(b) ? 'UNKNOWN' : a < b ? 'RETRIEVED_BEFORE_RELEASE' : 'RETRIEVED_AFTER_RELEASE'; };
export function seriesEntry(row, { source, retrievedAt, officialRef = null, releaseDay, releaseAt = null }) {
  const id = seriesOf(row.name); if (!id) return { id: null, providerName: String(row.name || '').slice(0, 80), status: 'UNKNOWN_MAPPING' };
  const ref = referencePeriod(id, releaseDay, officialRef, row.name), timing = retrievalTiming(retrievedAt, releaseAt || row.t);
  const s = SERIES[id], pack = (raw, extra) => { if (ref && ref.conflict) return { status: 'UNKNOWN', why: 'provider period ' + ref.providerHint + ' does not match the official reference ' + ref.period, source, retrievedAt };
    const r = verifyValue(id, raw, row.unit); return r.unknown ? { status: 'UNKNOWN', why: r.unknown, source, retrievedAt } : { v: r.v, unit: r.unit, source, retrievedAt, ...extra }; };
  return {
    id, title: s.title, headline: s.headline, providerName: String(row.name || '').slice(0, 80), providerKey: row.key || null, status: 'MAPPED',
    ref, claim: JSON.stringify([given(row.fcRaw, row.fc), given(row.prevRaw, row.prev), given(row.actRaw, row.act), String(row.unit ?? row.unitRaw ?? ''), providerPeriod(row.name)]),
    consensus: given(row.fcRaw, row.fc) === null ? null : pack(given(row.fcRaw, row.fc), { kind: 'CONSENSUS_FORECAST', timing }),
    previous: given(row.prevRaw, row.prev) === null ? null : pack(given(row.prevRaw, row.prev), { vintage: 'PROVIDER_PREVIOUS_AS_RETRIEVED', timing }),
    actual: given(row.actRaw, row.act) === null ? null : pack(given(row.actRaw, row.act), { vintage: 'PROVIDER_ACTUAL_AS_RETRIEVED', timing })
  };
}

// ---- (6 Nov repair) exact-series merge. Pure: official rows (dates) + provider rows (forecasts/values) -> one row per release and day.
const nyDayOf = (t) => { const d = new Date(String(t).length <= 19 ? t + 'Z' : t); return isNaN(d) ? String(t).slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
export function mergeEconRows(official, provider, { providerAt = null } = {}) {
  const rows = [], byRel = new Map(), legacy = (r) => { const h = r.series.find(x => x.headline && x.status === 'MAPPED'), ok = (z) => z && z.v !== undefined ? z.v : null;
    r.fc = h ? ok(h.consensus) : null; r.prev = h ? ok(h.previous) : null; r.act = h ? ok(h.actual) : null; r.unit = h && SERIES[h.id] ? SERIES[h.id].unit : ''; if (h && h.providerKey) r.key = h.providerKey; };
  for (const o of official || []) { const rel = RELEASES[o.release] || null, day = nyDayOf(o.t), r = { schema: 2, t: o.t, day, release: o.release || null, title: rel ? rel.title : o.name, name: rel ? rel.title : o.name, key: o.key, kind: rel ? rel.kind : o.kind, country: 'US', imp: o.imp || 'High',
      dateSource: { by: rel ? rel.agency + ' schedule' : o.src, url: rel ? rel.url : null, retrievedAt: o.retrievedAt || null }, ref: o.ref || null, src: o.src, series: [] };
    rows.push(r); byRel.set(o.release + '|' + day, r); }
  // (r2, Codex R2) every provider row is reconciled as a full typed claim (values, unit, provider period), order-independently:
  // exact duplicates are one entry; any difference (including a unit or period difference) makes the affected figure UNKNOWN.
  const seen = new Set();
  for (const p of provider || []) { const id = seriesOf(p.name), day = nyDayOf(p.t), exact = JSON.stringify([id || p.name, day, p.fcRaw ?? p.fc, p.prevRaw ?? p.prev, p.actRaw ?? p.act, String(p.unit ?? p.unitRaw ?? ''), providerPeriod(p.name)]); if (seen.has(exact)) continue; seen.add(exact);
    if (!id) { rows.push({ schema: 2, t: p.t, day, release: null, title: String(p.name || '').slice(0, 80), name: String(p.name || '').slice(0, 80), key: p.key, kind: null, country: 'US', imp: p.imp || '', dateSource: { by: 'TipRanks (date not officially verified)', url: null, retrievedAt: providerAt }, ref: null, series: [{ id: null, providerName: String(p.name || '').slice(0, 80), status: 'UNKNOWN_MAPPING' }], fc: null, prev: null, act: null, unit: '' }); continue; }
    const relId = SERIES[id].release; let r = byRel.get(relId + '|' + day);
    if (!r) { const rel = RELEASES[relId]; r = { schema: 2, t: p.t, day, release: relId, title: rel.title, name: rel.title, key: p.key, kind: rel.kind, country: 'US', imp: p.imp || '', dateSource: { by: 'TipRanks (date not officially verified' + (relId === 'claims' ? '; DOL publishes weekly on Thursdays' : '') + ')', url: null, retrievedAt: providerAt }, ref: null, series: [] }; rows.push(r); byRel.set(relId + '|' + day, r); }
    const e = seriesEntry(p, { source: 'TipRanks', retrievedAt: providerAt, officialRef: r.ref, releaseDay: day, releaseAt: r.t }), prior = r.series.find(x => x.id === id);
    if (prior) { const typed = (z) => z ? JSON.stringify(z.v !== undefined ? [z.v, z.unit] : ['UNKNOWN', z.why]) : 'null';
      for (const f of ['consensus', 'previous', 'actual']) if (typed(prior[f]) !== typed(e[f]) || JSON.stringify(prior.ref) !== JSON.stringify(e.ref)) prior[f] = { status: 'UNKNOWN', why: 'conflicting provider rows (value, unit or period differ)', source: 'TipRanks', retrievedAt: providerAt };
      continue; }
    r.series.push(e); }
  for (const r of rows) { r.series.sort((a, b) => (b.headline ? 1 : 0) - (a.headline ? 1 : 0)); legacy(r); }
  return rows.sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
}
// official released values (Alpha Vantage mirrors BLS series) fill only the EXACT headline series of the official reference month.
// (r2, Codex R3/R4) every point used must be a finite, positive level for the EXACT required month (adjacent month / 12 months earlier
// found by date, not by position); null, zero, missing or gapped inputs leave the actual UNKNOWN (absent). Each series carries its own
// retrieval time (avAtBy[series]); refreshing one series never freshens another. A zero CHANGE stays a legitimate result.
const monthShift = (ym, k) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + k, 1)); return d.toISOString().slice(0, 10); };
export function fillOfficialActual(r, av, avAtBy) {
  if (!r || r.schema !== 2 || !r.ref || !av) return; const m = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/.exec(r.ref); if (!m) return;
  // (r3, Codex 68c4bf45 R4) only a parseable retrieval time is kept; a missing or invalid one stays null (shown as UNKNOWN), never fabricated or backfilled
  const rm = m[2] + '-' + String(FULLM.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0') + '-01', at = (ser) => { const v = avAtBy && typeof avAtBy === 'object' ? avAtBy[ser] : avAtBy; return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null; };
  const level = (ser, date) => { const a = av[ser]; if (!Array.isArray(a)) return null; const hits = a.filter(x => Array.isArray(x) && x[0] === date); if (hits.length !== 1) return null; const v = hits[0][1]; return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null; };
  const both = (ser, k, f) => { const x = level(ser, rm), y = level(ser, monthShift(rm, k)); return x === null || y === null ? null : f(x, y); };
  const want = { PAYROLLS_TOTAL: ['NFP', () => both('NFP', -1, (x, y) => Math.round(x - y))], UNEMPLOYMENT_RATE: ['UNEMP', () => level('UNEMP', rm)],
    CPI_MOM: ['CPI', () => both('CPI', -1, (x, y) => +((x / y - 1) * 100).toFixed(2))], CPI_YOY: ['CPI', () => both('CPI', -12, (x, y) => +((x / y - 1) * 100).toFixed(2))] };
  const make = (id) => { const [ser, f] = want[id], v = f(); if (v === null || !Number.isFinite(v)) return null; const chk = verifyValue(id, String(v) + SERIES[id].unit); return chk.unknown ? null : { v: chk.v, unit: SERIES[id].unit, source: 'Alpha Vantage (BLS series ' + ser + ')', retrievedAt: at(ser), vintage: 'LATEST_AT_RETRIEVAL' }; };
  for (const s of r.series) { if (!want[s.id] || (s.actual && s.actual.v !== undefined)) continue; const a = make(s.id); if (a) s.actual = a; }
  for (const id of Object.keys(want)) { if (SERIES[id].release !== r.release || r.series.some(s => s.id === id)) continue; const a = make(id); if (a) r.series.push({ id, title: SERIES[id].title, headline: SERIES[id].headline, status: 'MAPPED', ref: { period: r.ref, basis: 'official schedule' }, consensus: null, previous: null, actual: a }); }
  r.series.sort((a, b) => (b.headline ? 1 : 0) - (a.headline ? 1 : 0)); const h = r.series.find(x => x.headline && x.status === 'MAPPED'); r.act = h && h.actual && h.actual.v !== undefined ? h.actual.v : null;
}
