// EXACT ECONOMIC SERIES (6 Nov 2026 repair). Pure functions: no network, no files, no keys.
// Problem fixed: the calendar kept ONE row per broad kind and day, so a subsidiary provider row (continuing claims, private payrolls,
// productivity) could replace the headline of an official release, and a provider number could appear under the wrong series name.
// Rules here:
//   - every provider row is mapped to ONE exact series by its exact name, or to nothing (UNKNOWN). No broad "kind" guessing.
//   - a value is shown only if its unit is known and matches the series, and the number lies in a conservative plausible band for that
//     series; otherwise the figure is UNKNOWN (never shown under a series it may not belong to).
//   - consensus forecasts (a market estimate) are kept apart from released/previous values, each with its source and retrieval time.
//   - a provider "previous" value is labelled with its vintage: it is the value published BEFORE this release and may be revised in it.
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
  [/^(fed interest rate decision|fomc interest rate decision|fed funds rate( upper bound)?)$/i, 'FED_RATE']
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
export function referencePeriod(seriesId, releaseDay, officialRef, providerName) {
  const s = SERIES[seriesId]; if (!s) return null;
  if (officialRef) return { period: officialRef, basis: 'official schedule' };
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
export function seriesEntry(row, { source, retrievedAt, officialRef = null, releaseDay }) {
  const id = seriesOf(row.name); if (!id) return { id: null, providerName: String(row.name || '').slice(0, 80), status: 'UNKNOWN_MAPPING' };
  const s = SERIES[id], pack = (raw, extra) => { const r = verifyValue(id, raw, row.unit); return r.unknown ? { status: 'UNKNOWN', why: r.unknown, source, retrievedAt } : { v: r.v, unit: r.unit, source, retrievedAt, ...extra }; };
  return {
    id, title: s.title, headline: s.headline, providerName: String(row.name || '').slice(0, 80), status: 'MAPPED',
    ref: referencePeriod(id, releaseDay, officialRef, row.name),
    consensus: given(row.fcRaw, row.fc) === null ? null : pack(given(row.fcRaw, row.fc), { kind: 'CONSENSUS_FORECAST' }),
    previous: given(row.prevRaw, row.prev) === null ? null : pack(given(row.prevRaw, row.prev), { vintage: 'PUBLISHED_BEFORE_THIS_RELEASE_MAY_BE_REVISED' }),
    actual: given(row.actRaw, row.act) === null ? null : pack(given(row.actRaw, row.act), { vintage: 'AS_REPORTED_BY_SOURCE' })
  };
}

// ---- (6 Nov repair) exact-series merge. Pure: official rows (dates) + provider rows (forecasts/values) -> one row per release and day.
const nyDayOf = (t) => { const d = new Date(String(t).length <= 19 ? t + 'Z' : t); return isNaN(d) ? String(t).slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); };
export function mergeEconRows(official, provider, { providerAt = null } = {}) {
  const rows = [], byRel = new Map(), legacy = (r) => { const h = r.series.find(x => x.headline && x.status === 'MAPPED'), ok = (z) => z && z.v !== undefined ? z.v : null;
    r.fc = h ? ok(h.consensus) : null; r.prev = h ? ok(h.previous) : null; r.act = h ? ok(h.actual) : null; r.unit = h && SERIES[h.id] ? SERIES[h.id].unit : ''; };
  for (const o of official || []) { const rel = RELEASES[o.release] || null, day = nyDayOf(o.t), r = { schema: 2, t: o.t, day, release: o.release || null, title: rel ? rel.title : o.name, name: rel ? rel.title : o.name, key: o.key, kind: rel ? rel.kind : o.kind, country: 'US', imp: o.imp || 'High',
      dateSource: { by: rel ? rel.agency + ' schedule' : o.src, url: rel ? rel.url : null, retrievedAt: o.retrievedAt || null }, ref: o.ref || null, src: o.src, series: [] };
    rows.push(r); byRel.set(o.release + '|' + day, r); }
  const seen = new Set();
  for (const p of provider || []) { const id = seriesOf(p.name), day = nyDayOf(p.t), dedup = (id || p.name) + '|' + day; if (seen.has(dedup + '|' + JSON.stringify([p.fcRaw ?? p.fc, p.prevRaw ?? p.prev, p.actRaw ?? p.act]))) continue; seen.add(dedup + '|' + JSON.stringify([p.fcRaw ?? p.fc, p.prevRaw ?? p.prev, p.actRaw ?? p.act]));
    if (!id) { rows.push({ schema: 2, t: p.t, day, release: null, title: String(p.name || '').slice(0, 80), name: String(p.name || '').slice(0, 80), key: p.key, kind: null, country: 'US', imp: p.imp || '', dateSource: { by: 'TipRanks (date not officially verified)', url: null, retrievedAt: providerAt }, ref: null, series: [{ id: null, providerName: String(p.name || '').slice(0, 80), status: 'UNKNOWN_MAPPING' }], fc: null, prev: null, act: null, unit: '' }); continue; }
    const relId = SERIES[id].release; let r = byRel.get(relId + '|' + day);
    if (!r) { const rel = RELEASES[relId]; r = { schema: 2, t: p.t, day, release: relId, title: rel.title, name: rel.title, key: p.key, kind: rel.kind, country: 'US', imp: p.imp || '', dateSource: { by: 'TipRanks (date not officially verified' + (relId === 'claims' ? '; DOL publishes weekly on Thursdays' : '') + ')', url: null, retrievedAt: providerAt }, ref: null, series: [] }; rows.push(r); byRel.set(relId + '|' + day, r); }
    const e = seriesEntry(p, { source: 'TipRanks', retrievedAt: providerAt, officialRef: r.ref, releaseDay: day }), prior = r.series.find(x => x.id === id);
    if (prior) { // two provider rows for one exact series and day: identical values are one entry; any difference is a CONFLICT, never a silent pick
      for (const f of ['consensus', 'previous', 'actual']) if (JSON.stringify(prior[f] && prior[f].v) !== JSON.stringify(e[f] && e[f].v)) prior[f] = { status: 'UNKNOWN', why: 'conflicting provider rows', source: 'TipRanks', retrievedAt: providerAt };
      continue; }
    r.series.push(e); }
  for (const r of rows) { r.series.sort((a, b) => (b.headline ? 1 : 0) - (a.headline ? 1 : 0)); legacy(r); }
  return rows.sort((a, b) => a.t < b.t ? -1 : a.t > b.t ? 1 : 0);
}
// official released values (Alpha Vantage mirrors BLS series) fill only the EXACT headline series of the official reference month
export function fillOfficialActual(r, av, avAt) {
  if (!r || r.schema !== 2 || !r.ref || !av) return; const m = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/.exec(r.ref); if (!m) return;
  const rm = m[2] + '-' + String(['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(m[1]) + 1).padStart(2, '0') + '-01';
  const pick = (ser, f) => { const a = av[ser]; if (!a) return null; const i = a.findIndex(x => x[0] === rm); return i < 0 ? null : f(a, i); };
  const want = { PAYROLLS_TOTAL: () => pick('NFP', (a, i) => a[i + 1] ? Math.round(a[i][1] - a[i + 1][1]) : null), UNEMPLOYMENT_RATE: () => pick('UNEMP', (a, i) => a[i][1]),
    CPI_MOM: () => pick('CPI', (a, i) => a[i + 1] ? +((a[i][1] / a[i + 1][1] - 1) * 100).toFixed(2) : null), CPI_YOY: () => pick('CPI', (a, i) => a[i + 12] ? +((a[i][1] / a[i + 12][1] - 1) * 100).toFixed(2) : null) };
  for (const s of r.series) { if (!want[s.id] || (s.actual && s.actual.v !== undefined)) continue; const v = want[s.id](); if (v !== null && Number.isFinite(v)) s.actual = { v, unit: SERIES[s.id].unit, source: 'Alpha Vantage (BLS series)', retrievedAt: avAt || null, vintage: 'LATEST_AT_RETRIEVAL' }; }
  for (const id of Object.keys(want)) { if (SERIES[id].release !== r.release || r.series.some(s => s.id === id)) continue; const v = want[id](); if (v !== null && Number.isFinite(v)) r.series.push({ id, title: SERIES[id].title, headline: SERIES[id].headline, status: 'MAPPED', ref: { period: r.ref, basis: 'official schedule' }, consensus: null, previous: null, actual: { v, unit: SERIES[id].unit, source: 'Alpha Vantage (BLS series)', retrievedAt: avAt || null, vintage: 'LATEST_AT_RETRIEVAL' } }); }
  r.series.sort((a, b) => (b.headline ? 1 : 0) - (a.headline ? 1 : 0)); const h = r.series.find(x => x.headline && x.status === 'MAPPED'); r.act = h && h.actual && h.actual.v !== undefined ? h.actual.v : null;
}
