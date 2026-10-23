// Observation-only discovery lane. It deliberately does NOT authorize a buy or alert.
// `rvT` is an approximate time-of-day-normalized volume pace (daily relative volume
// divided by the market's learned fraction-of-day curve), not a stock-specific intraday model.
export function scoreEarlyWaveCandidate({ change, rv, rvT, live, price, oneMinuteChange = null }) {
  if (!live || !(price > 0) || !Number.isFinite(change) || change < 0.02 || change > 0.15) return null;
  const pace = Number.isFinite(rvT) ? rvT : null;
  const dailyRelativeVolume = Number.isFinite(rv) ? rv : null;
  // Require either elevated estimated time-of-day pace or at least half a normal day's volume.
  // The threshold is intentionally for discovery only; it is not a proven trading rule.
  if (!((pace !== null && pace >= 1.5) || (dailyRelativeVolume !== null && dailyRelativeVolume >= 0.5))) return null;
  let score = 0;
  if (change <= 0.05) score += 25;
  else if (change <= 0.08) score += 22;
  else if (change <= 0.12) score += 14;
  else score += 5; // already extended; retain for observation but rank lower
  if (pace !== null) score += Math.round(35 * Math.min(pace, 2.5) / 2.5);
  else score += 10;
  if (dailyRelativeVolume !== null) score += Math.round(15 * Math.min(dailyRelativeVolume, 1.5) / 1.5);
  if (oneMinuteChange !== null && Number.isFinite(oneMinuteChange)) {
    if (oneMinuteChange > 0) score += 15;
    else if (oneMinuteChange < -0.01) score -= 10;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    change: +change.toFixed(4),
    rv: dailyRelativeVolume === null ? null : +dailyRelativeVolume.toFixed(2),
    rvT: pace === null ? null : +pace.toFixed(2),
    price: +price.toFixed(price < 1 ? 4 : 2),
    under1: price < 1,
    lane: 'OBSERVATION_ONLY_NOT_A_BUY_SIGNAL',
  };
}

export function updateEarlyWaveCandidate(book, sym, candidate, minute) {
  if (!candidate) return;
  const old = book[sym];
  if (!old) {
    book[sym] = { sym, firstMinute: minute, firstChange: candidate.change, maxChange: candidate.change, ...candidate };
    return;
  }
  old.lastMinute = minute;
  old.change = candidate.change;
  old.price = candidate.price;
  old.rv = candidate.rv;
  old.rvT = candidate.rvT;
  old.score = Math.max(old.score, candidate.score);
  old.maxChange = Math.max(old.maxChange, candidate.change);
  old.under1 = old.under1 || candidate.under1;
}
