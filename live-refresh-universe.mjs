// Research-only refresh selection for a delayed whole-market snapshot.
// All >=$1 stocks retain their existing live-price refresh. A bounded number
// of actively traded sub-$1 stocks gain visibility for missed-runner research.
// This does NOT change the under-$1 BUY/alert eligibility rules.
import { isFreshPriceAge } from './ignition-gates.mjs';
export const MAX_PENNY_RESEARCH_REFRESH = 250;
// A fresh median is not proof that each stock is fresh. Refresh eligible stale,
// missing-clock and future-clock rows even when most of the snapshot is current.
export function selectStaleRefreshSymbols(rows, nowMs = Date.now()) {
  if (!Array.isArray(rows) || !Number.isFinite(nowMs)) return [];
  return selectLiveRefreshSymbols(rows.filter(r => r && !isFreshPriceAge(
    typeof r.t === 'number' && r.t > 0 ? (nowMs - r.t) / 60000 : null)));
}
export function selectLiveRefreshSymbols(rows, pennyCap = MAX_PENNY_RESEARCH_REFRESH) {
  if (!Array.isArray(rows)) return [];
  const cap = Number.isInteger(pennyCap) && pennyCap >= 0 ? Math.min(pennyCap, MAX_PENNY_RESEARCH_REFRESH) : 0;
  const standard = [], pennies = [], used = new Set();
  for (const r of rows) {
    if (!r || typeof r.sym !== 'string' || !/^[A-Z]{1,5}$/.test(r.sym) || used.has(r.sym)) continue;
    if (!Number.isFinite(r.prevC) || r.prevC <= 0) continue;
    if (r.prevC >= 1) { standard.push(r.sym); used.add(r.sym); continue; }
    if (r.prevC < 0.1 || !Number.isFinite(r.price) || r.price < 0.1 ||
        !Number.isFinite(r.vol) || r.vol <= 0) continue;
    pennies.push({sym:r.sym, dollarVolume:r.vol * r.price});
    used.add(r.sym);
  }
  pennies.sort((a,b)=>b.dollarVolume-a.dollarVolume || a.sym.localeCompare(b.sym));
  return [...standard, ...pennies.slice(0,cap).map(r=>r.sym)];
}
