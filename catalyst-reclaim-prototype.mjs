// Offline research prototype. Not connected to production or BUY eligibility.
// Thresholds and exit contracts are caller-supplied proposals, not adopted rules.
export function assessReclaim(input, policy) {
  const reject = reason => ({status: 'NO_PAPER_SETUP', reason, actionable: false, realDollars: 0});
  const unknown = reason => ({...reject(reason), status: 'UNKNOWN'});
  const time = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
  const positive = value => Number.isFinite(value) && value > 0;
  if (!policy || !policy.id || ![policy.minPrice, policy.minDollarVolume, policy.maxSpreadPct, policy.maxQuoteAgeMs, policy.materialityRatio, policy.openingBarMs].every(positive) || !policy.exitContract || !policy.invalidationContract) return unknown('INCOMPLETE_PROPOSED_POLICY');
  if (!input || typeof input.symbol !== 'string' || !input.symbol) return unknown('MISSING_IDENTITY');
  if (input.instrument !== 'US_COMMON_STOCK') return reject('UNSUPPORTED_INSTRUMENT');
  // Research inclusion does not confer halal approval or live strategy approval.
  if (input.zad !== 'YES') return reject('ZAD_NOT_CONFIRMED');
  const now = time(input.asOf), start = time(input.sessionOpen), end = time(input.sessionClose);
  if (![now, start, end].every(Number.isFinite) || start >= end) return unknown('INVALID_SESSION_CLOCK');
  if (now < start || now >= end) return reject('OUTSIDE_ENTRY_SESSION');
  const c = input.catalyst;
  if (!c || !c.sourceId || !c.documentHash || c.verification !== 'VERIFIED_MATERIAL_AGREEMENT') return unknown('UNVERIFIED_CATALYST');
  const published = time(c.publishedAt), observed = time(c.observedAt);
  if (![published, observed].every(Number.isFinite) || published > observed || observed > now || published >= start) return unknown('CATALYST_CLOCK_OR_SESSION_UNRESOLVED');
  // The caller must establish which regular session first followed publication.
  if (c.firstTradableSessionOpen !== input.sessionOpen) return unknown('FIRST_TRADABLE_SESSION_UNVERIFIED');
  if (!positive(c.contractValueUsd) || !positive(c.priorMarketCapUsd) || time(c.marketCapAsOf) >= published || !Number.isFinite(time(c.marketCapAsOf))) return unknown('MISSING_POINT_IN_TIME_MATERIALITY');
  if (c.contractValueUsd / c.priorMarketCapUsd < policy.materialityRatio) return reject('CATALYST_BELOW_PROPOSED_MATERIALITY');
  if (!positive(input.prior20DayDollarVolume)) return unknown('MISSING_LIQUIDITY');
  if (input.prior20DayDollarVolume < policy.minDollarVolume) return reject('INSUFFICIENT_LIQUIDITY');
  const q = input.quote;
  if (!q || q.symbol !== input.symbol || !q.source || !q.evidenceId || !positive(q.bid) || !positive(q.ask) || !positive(q.bidSize) || !positive(q.askSize) || q.bid > q.ask) return unknown('INVALID_QUOTE');
  const qt = time(q.at);
  if (!Number.isFinite(qt) || qt > now || now - qt > policy.maxQuoteAgeMs) return unknown('STALE_OR_INVALID_QUOTE_CLOCK');
  if (q.ask < policy.minPrice) return reject('PRICE_BELOW_PROPOSED_MINIMUM');
  const spreadPct = 100 * (q.ask - q.bid) / q.ask;
  if (spreadPct >= policy.maxSpreadPct) return reject('SPREAD_TOO_WIDE');
  const bars = input.bars;
  if (!Array.isArray(bars) || bars.length < 3) return unknown('INSUFFICIENT_COMPLETED_BARS');
  let previousEnd = start;
  for (const b of bars) {
    const from = time(b.start), to = time(b.end);
    if (b.symbol !== input.symbol || !b.evidenceId || ![b.open,b.high,b.low,b.close].every(positive) || b.low > Math.min(b.open,b.close) || b.high < Math.max(b.open,b.close) || !Number.isFinite(from) || !Number.isFinite(to) || from !== previousEnd || to - from !== policy.openingBarMs || to > now || to > end) return unknown('INVALID_OR_GAPPED_BAR_EVIDENCE');
    previousEnd = to;
  }
  const opening = bars[0];
  let pulledBack = false, trigger;
  for (const b of bars.slice(1)) {
    if (b.low <= opening.low) return reject('OPENING_LOW_NOT_HELD');
    if (pulledBack && b.close > opening.high) { trigger = b; break; }
    if (b.close < opening.high && b.high <= opening.high) pulledBack = true;
  }
  if (!trigger) return reject('NO_COMPLETED_PULLBACK_RECLAIM');
  // Refuse historical trigger + later quote joins. No inferred or guaranteed fill.
  if (time(trigger.end) !== time(bars.at(-1).end) || qt < time(trigger.end)) return unknown('ENTRY_QUOTE_NOT_PAIRED_TO_NEW_TRIGGER');
  if (!positive(input.paperBudgetUsd) || input.paperBudgetUsd < 1000) return unknown('PAPER_BUDGET_BELOW_USER_MINIMUM');
  const shares = Math.floor((input.paperBudgetUsd - 3) / q.ask);
  if (shares < 1 || q.askSize < shares) return reject('INSUFFICIENT_DISPLAYED_ENTRY_SIZE');
  return {
    status: 'PAPER_SETUP_ONLY', actionable: false, realDollars: 0,
    policyId: policy.id, symbol: input.symbol, assessedAt: input.asOf,
    card: {reason: 'Verified agreement and completed opening-range pullback/reclaim under proposed policy',
      entryReferenceAsk: q.ask, entryIsFill: false, paperShares: shares,
      paperBudgetUsd: input.paperBudgetUsd, commissionPerSideUsd: 3,
      expiry: input.sessionClose, invalidation: policy.invalidationContract,
      exit: policy.exitContract, spreadPct, quoteAt: q.at, quoteSource: q.source,
      limits: 'Untested hypothesis; ticker-level identity; displayed size is not a guaranteed fill; exit costs/outcome not evaluated'},
    evidence: {catalyst: c.sourceId, documentHash: c.documentHash, quote: q.evidenceId, bars: bars.map(b => b.evidenceId)}
  };
}
