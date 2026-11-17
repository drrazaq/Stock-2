// INSIDER RECENT FEED (Agent A repair, 17 Nov 2026). Pure functions, used by insider-study.mjs for its `recent` list only.
// WHY: Agent C's champion E3 (3+ insiders buying within 10 days, last 30 days) reads data/insider-study.json `recent`. That list was
// built only from the SEC quarterly insider data sets, which end at the last finished quarter (Q3 = 30 Sep; Q4 arrives in January),
// so E3's weekly league batches were empty for about 2 months of every 3 (6 Nov and 13 Nov batches: "champion picked nothing").
// FIX: purchases filed AFTER the newest quarterly filing date are added from data/buyers-live.json, which squad31-buyers.mjs fills
// every weekday from the SEC's official EDGAR daily index (form.YYYYMMDD.idx) and each Form 4's XML (transaction code P, open
// market, price > 0). Free official data, no scraping.
// E3's RULE IS UNCHANGED: the same 10-day window, distinct insiders, 30-day gap between events of one stock, 2+ for the list and
// 3+ for E3 (league.mjs `min.n`). The study's trades and frozen verdicts still use the quarterly data sets only.
// Identity: the quarterly sets count insiders by reporting-owner CIK; the live rows carry the owner's name, so live insiders are
// counted by name ('N:' + upper-case name). Live rows start after the last quarterly date, so a 10-day window can mix the two only
// in the first 10 days after a quarter ends; that is outside the 30-day `recent` window from day 40 of a quarter on.
const SYM = /^[A-Z][A-Z0-9.]{0,6}$/;
const day = 864e5, isoOf = (t) => new Date(t).toISOString().slice(0, 10);

export function liveToPurchases(live, after) {
  const out = [];
  for (const r of (live && live.ins) || []) {
    const sym = String(r.sym || '').toUpperCase().trim().replace(/-/g, '.'), d = String(r.filed || '').slice(0, 10), sh = +r.sh, px = +r.px;
    if (!SYM.test(sym) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || (after && !(d > after)) || !(sh > 0) || !(px > 0)) continue;
    const who = 'N:' + String(r.name || '?').toUpperCase().replace(/&AMP;/g, '&').replace(/\s+/g, ' ').trim();
    out.push({ sym, d, who, usd: Math.round(sh * px), src: 'live' });
  }
  return out;
}

// Same cluster logic as insider-study.mjs section 3 (CLUSTER2: 2+ distinct insiders filing within 10 days; next event of the
// same stock only after 30 days). keep(sym) = the stock is in the price cache.
export function cluster2(purchases, keep = () => true) {
  const bySym = {}; for (const p of purchases) if (keep(p.sym)) (bySym[p.sym] = bySym[p.sym] || []).push(p);
  const ev = [];
  for (const [sym, a] of Object.entries(bySym)) { a.sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0); let last = '0';
    for (const p of a) { const from = isoOf(Date.parse(p.d) - 10 * day), win = a.filter(z => z.d >= from && z.d <= p.d), n = new Set(win.map(z => z.who)).size;
      if (n < 2 || p.d <= last) continue;
      ev.push({ sym, d: p.d, n, usd: win.reduce((s, z) => s + z.usd, 0), ...(p.src === 'live' ? { src: 'live' } : {}) });
      last = isoOf(Date.parse(p.d) + 30 * day); } }
  return ev;
}

// The `recent` list: CLUSTER2 events filed in the last 30 days (as of `nowMs`), most insiders first, then newest, top 15.
export function recentClusters(quarterly, live, keep, nowMs) {
  const lastQ = quarterly.reduce((m, p) => p.d > m ? p.d : m, '');
  const all = quarterly.concat(liveToPurchases(live, lastQ)), cut = isoOf(nowMs - 30 * day);
  return cluster2(all, keep).filter(e => e.d >= cut).sort((a, b) => b.n - a.n || (a.d < b.d ? 1 : -1)).slice(0, 15);
}
