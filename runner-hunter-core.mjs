// REVIEWED AND ADOPTED BY SQUAD 19 (25 Oct 2026), unchanged logic. Source: the owner's outside 'Runner Hunter RH1' package (written against a
// 23 Oct snapshot). Schema check: fm-cache/fm.json.gz = { days: { d: { T, o, h, l, c, v } }, gone, cs, minPx } (fastmover-lab.mjs addDay) - matches.
// Known limits (squad 19 review): the fm cache is SPLIT-ADJUSTED (adjusted=true), so price bands of stocks that later reverse-split are wrong;
// 'gone' days in the calendar conservatively skip holiday-adjacent pairs; the halves are split at the median signal date of the rows.
// squad19-lab.mjs rh1raw runs the same functions on RAW Massive bars from 2021 with split days removed. Research only: no rule is chosen here.
// Runner Hunter v1: frozen, observation-only research for sub-$5 US stocks.
// Uses only information available at the signal-day close; outcomes are next-session labels.
// Daily OHLC cannot prove an intraday executable strategy or the order of high/low events.

export const RUNNER_HUNTER_VERSION = 'RH1-2026-10-25';
export const DEFAULTS = Object.freeze({ minPrice: 0.10, maxPrice: 5, minDollarVolume: 300_000, targetFromPriorClose: 0.40, minimumRemainingUpside: 0.25, cost: 0.016, stressCost: 0.024, minBucketN: 50 });

const finite = Number.isFinite;
const pct = (n) => n === null || !finite(n) ? 'n/a' : `${(n * 100).toFixed(2)}%`;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const median = (xs) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const bucket = (x, cuts, labels) => { if (!finite(x)) return 'UNKNOWN'; for (let i = 0; i < cuts.length; i++) if (x < cuts[i]) return labels[i]; return labels.at(-1); };

function featureRow(c, i, defaults) {
  const b = c[i], prev = c[i - 1];
  if (!b || !prev || !(b.c > 0) || !(b.h >= b.l) || !(prev.c > 0)) return null;
  const ret1 = b.c / prev.c - 1;
  const ret5 = i >= 5 && c[i - 5].c > 0 ? b.c / c[i - 5].c - 1 : null;
  const ret20 = i >= 20 && c[i - 20].c > 0 ? b.c / c[i - 20].c - 1 : null;
  const priorVols = c.slice(Math.max(0, i - 20), i).map(x => x.v).filter(x => finite(x) && x >= 0);
  const avgPriorVol = priorVols.length >= 10 ? mean(priorVols) : null;
  const rvol = avgPriorVol > 0 ? b.v / avgPriorVol : null;
  const closeLocation = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5;
  const high20 = i >= 20 ? Math.max(...c.slice(i - 20, i).map(x => x.h)) : null;
  const distHigh20 = high20 > 0 ? b.c / high20 - 1 : null;
  const rangePct = b.c > 0 ? (b.h - b.l) / b.c : null;
  const rangePrior = i >= 5 ? mean(c.slice(i - 5, i).map(x => (x.h - x.l) / x.c).filter(finite)) : null;
  const compression = finite(rangePct) && finite(rangePrior) && rangePrior > 0 ? rangePct / rangePrior : null;
  return {
    priceBand: bucket(b.c, [1, 2], ['0.10-0.99', '1.00-1.99', '2.00-4.99']),
    rvolBand: bucket(rvol, [1, 2, 4], ['<1x', '1-1.99x', '2-3.99x', '4x+']),
    ret1Band: bucket(ret1, [-0.05, 0, 0.05, 0.15], ['<-5%', '-5-0%', '0-5%', '5-15%', '15%+']),
    ret5Band: ret5 === null ? 'UNKNOWN' : bucket(ret5, [-0.20, -0.05, 0, 0.10, 0.20], ['<-20%', '-20--5%', '-5-0%', '0-10%', '10-20%', '20%+']),
    ret20Band: ret20 === null ? 'UNKNOWN' : bucket(ret20, [-0.20, 0, 0.20, 0.50], ['<-20%', '-20-0%', '0-20%', '20-50%', '50%+']),
    closeLocationBand: bucket(closeLocation, [0.25, 0.5, 0.75], ['bottom-quarter', 'lower-middle', 'upper-middle', 'top-quarter']),
    near20High: finite(distHigh20) ? (distHigh20 >= -0.03 ? 'within-3%-of-prior-20d-high' : distHigh20 >= -0.10 ? '3-10%-below-prior-20d-high' : '10%+-below-prior-20d-high') : 'UNKNOWN',
    compressionBand: finite(compression) ? (compression < 0.75 ? 'range-compressed' : compression > 1.5 ? 'range-expanded' : 'normal-range') : 'UNKNOWN',
    price: b.c,
    dollarVolume: b.c * b.v,
    ret1, ret5, ret20, rvol, closeLocation, distHigh20, compression,
  };
}

/** Build labels for every signal close and its next consecutive market session. */
export function buildRunnerRows(store, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const days = Object.keys(store?.days || {}).sort();
  // Include known no-data/closed dates as gaps. This can conservatively skip holiday-adjacent labels,
  // but avoids pretending a stock has consecutive sessions when the cache explicitly records a missing date.
  const calendar = [...new Set([...days, ...(Array.isArray(store?.gone) ? store.gone : [])])].sort();
  const dayIndex = new Map(calendar.map((d, i) => [d, i]));
  const perSymbol = new Map();
  for (const d of days) {
    const x = store.days[d];
    if (!x || !Array.isArray(x.T)) continue;
    for (let j = 0; j < x.T.length; j++) {
      const sym = x.T[j];
      if (!/^[A-Z]{1,5}$/.test(sym || '') || sym === 'SPY') continue;
      const b = { d, t: dayIndex.get(d), o: +x.o[j], h: +x.h[j], l: +x.l[j], c: +x.c[j], v: +x.v[j] };
      if (![b.o, b.h, b.l, b.c, b.v].every(finite) || b.o <= 0 || b.c <= 0 || b.h < b.l || b.v < 0) continue;
      if (!perSymbol.has(sym)) perSymbol.set(sym, []);
      perSymbol.get(sym).push(b);
    }
  }
  const rows = [];
  for (const [sym, c] of perSymbol) {
    c.sort((a, b) => a.t - b.t);
    for (let i = 20; i < c.length - 1; i++) {
      const signal = c[i], next = c[i + 1];
      if (next.t !== signal.t + 1) continue; // don't bridge missing sessions
      if (signal.c < cfg.minPrice || signal.c >= cfg.maxPrice || signal.c * signal.v < cfg.minDollarVolume) continue;
      const f = featureRow(c, i, cfg);
      if (!f) continue;
      const targetFromPriorClose = next.h / signal.c - 1;
      const openGap = next.o / signal.c - 1;
      const remainingUpside = next.h / next.o - 1;
      const adverseExcursion = next.l / next.o - 1;
      const openToClose = next.c / next.o - 1;
      rows.push({
        sym, signalDate: signal.d, eventDate: next.d, signalPrice: signal.c, nextOpen: next.o,
        nextHigh: next.h, nextLow: next.l, nextClose: next.c,
        ...f,
        target40FromPriorClose: targetFromPriorClose >= cfg.targetFromPriorClose,
        target40FromOpen: remainingUpside >= cfg.targetFromPriorClose,
        remaining25FromOpen: remainingUpside >= cfg.minimumRemainingUpside,
        openGap, remainingUpside, adverseExcursion, openToClose,
        netOpenToClose: openToClose - cfg.cost,
        stressNetOpenToClose: openToClose - cfg.stressCost,
        // The outcome labels are descriptive. They do not model intraday order, halt fills, spread or queue position.
      });
    }
  }
  return rows.sort((a, b) => a.signalDate.localeCompare(b.signalDate) || a.sym.localeCompare(b.sym));
}

function summarise(rows, minN) {
  const n = rows.length;
  const count = (k) => rows.filter(r => r[k]).length;
  const vals = (k) => rows.map(r => r[k]).filter(finite);
  return {
    n,
    target40FromPriorCloseN: count('target40FromPriorClose'),
    target40FromPriorCloseRate: n ? count('target40FromPriorClose') / n : null,
    remaining25FromOpenN: count('remaining25FromOpen'),
    remaining25FromOpenRate: n ? count('remaining25FromOpen') / n : null,
    target40FromOpenN: count('target40FromOpen'),
    target40FromOpenRate: n ? count('target40FromOpen') / n : null,
    meanOpenGap: mean(vals('openGap')),
    medianRemainingUpside: median(vals('remainingUpside')),
    meanOpenToClose: mean(vals('openToClose')),
    meanNetOpenToClose: mean(vals('netOpenToClose')),
    meanStressNetOpenToClose: mean(vals('stressNetOpenToClose')),
    enoughCases: n >= minN,
  };
}

export function analyseRunnerRows(rows, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  if (!rows.length) return { version: RUNNER_HUNTER_VERSION, status: 'NO_DATA', config: cfg, total: summarise([], cfg.minBucketN), halves: [], features: [] };
  const dates = [...new Set(rows.map(r => r.signalDate))].sort();
  const midpoint = dates[Math.floor(dates.length / 2)];
  const older = rows.filter(r => r.signalDate < midpoint), newer = rows.filter(r => r.signalDate >= midpoint);
  const featureKeys = ['priceBand', 'rvolBand', 'ret1Band', 'ret5Band', 'ret20Band', 'closeLocationBand', 'near20High', 'compressionBand'];
  const features = [];
  for (const feature of featureKeys) {
    const levels = [...new Set(rows.map(r => r[feature]).filter(x => x && x !== 'UNKNOWN'))].sort();
    for (const level of levels) {
      const all = rows.filter(r => r[feature] === level), a = older.filter(r => r[feature] === level), b = newer.filter(r => r[feature] === level);
      features.push({ feature, level, all: summarise(all, cfg.minBucketN), older: summarise(a, cfg.minBucketN), newer: summarise(b, cfg.minBucketN),
        liftOlder: a.length && older.length ? (a.filter(r => r.target40FromPriorClose).length / a.length) - (older.filter(r => r.target40FromPriorClose).length / older.length) : null,
        liftNewer: b.length && newer.length ? (b.filter(r => r.target40FromPriorClose).length / b.length) - (newer.filter(r => r.target40FromPriorClose).length / newer.length) : null,
        stableDirection: a.length >= cfg.minBucketN && b.length >= cfg.minBucketN && Math.sign((a.filter(r => r.target40FromPriorClose).length / a.length) - (older.filter(r => r.target40FromPriorClose).length / older.length)) === Math.sign((b.filter(r => r.target40FromPriorClose).length / b.length) - (newer.filter(r => r.target40FromPriorClose).length / newer.length)),
      });
    }
  }
  features.sort((a, b) => (b.liftOlder ?? -Infinity) - (a.liftOlder ?? -Infinity));
  return {
    version: RUNNER_HUNTER_VERSION,
    status: 'RESEARCH_ONLY_NOT_A_TRADING_RULE',
    target: 'next-session high >= 40% above signal-day close; secondary outcome is >=25% upside from next open to high',
    split: { midpointSignalDate: midpoint, olderRows: older.length, newerRows: newer.length },
    config: cfg,
    total: summarise(rows, cfg.minBucketN),
    halves: [{ name: 'older', ...summarise(older, cfg.minBucketN) }, { name: 'newer', ...summarise(newer, cfg.minBucketN) }],
    features,
    caveats: [
      'Daily bars cannot reveal the minute a signal became available or the sequence of intraday high and low.',
      'A high-touch label is not an executable fill or a profitable strategy.',
      'Only feature buckets with enough observations in both halves should be considered for a later frozen test.',
      'No catalyst, social, point-in-time float, spread, halt, or order-book information is included in this price/volume-only pass.',
      'The study must be run on a cache that actually includes sub-$1 securities; source cache filters may otherwise bias coverage.',
    ],
  };
}

export function renderRunnerReport(result) {
  const p = pct;
  const lines = [
    '# Stock-2 Runner Hunter RH1 — research report', '',
    `- Version: ${result.version}`, `- Status: ${result.status}`, `- Target: ${result.target || 'not available'}`, '',
    '## Overall results', '',
    `- Signal rows: ${result.total.n}`, `- 40%+ next-session high from prior close: ${result.total.target40FromPriorCloseN} (${p(result.total.target40FromPriorCloseRate)})`,
    `- 25%+ remaining upside from next open to high: ${result.total.remaining25FromOpenN} (${p(result.total.remaining25FromOpenRate)})`,
    `- Mean next-open to close: ${p(result.total.meanOpenToClose)}`, `- Mean net next-open to close at base cost: ${p(result.total.meanNetOpenToClose)}`,
    `- Mean net next-open to close at stress cost: ${p(result.total.meanStressNetOpenToClose)}`, '',
    '## Frozen split', '',
    ...result.halves.map(h => `- ${h.name}: n=${h.n}; 40% target rate=${p(h.target40FromPriorCloseRate)}; 25% remaining-upside rate=${p(h.remaining25FromOpenRate)}; mean net open-to-close=${p(h.meanNetOpenToClose)}`), '',
    '## Feature buckets with highest older-half lift', '',
    '| Feature | Bucket | n older | 40% rate older | lift older | n newer | 40% rate newer | lift newer | Stable direction |',
    '|---|---|---:|---:|---:|---:|---:|---:|---|',
    ...result.features.slice(0, 30).map(f => `| ${f.feature} | ${f.level} | ${f.older.n} | ${p(f.older.target40FromPriorCloseRate)} | ${p(f.liftOlder)} | ${f.newer.n} | ${p(f.newer.target40FromPriorCloseRate)} | ${p(f.liftNewer)} | ${f.stableDirection ? 'yes' : 'no'} |`), '',
    '## Interpretation and limits', '',
    ...result.caveats.map(x => `- ${x}`), '',
    'No bucket is approved as a buy signal by this report. Use the older half only to form a small number of hypotheses; freeze them before judging the newer half. Any eventual candidate needs minute-bar replay, realistic spread/slippage, catalyst timing, dilution checks, halal eligibility and paper tracking.', ''
  ];
  return lines.join('\n');
}
