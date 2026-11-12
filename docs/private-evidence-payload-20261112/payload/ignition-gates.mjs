// Shared integrity gates for intraday ignition signals.
// A signal is eligible only when its observed price age is known, finite, non-negative,
// and no older than the configured limit. Unknown age is not evidence of freshness.
export const MAX_SIGNAL_PRICE_AGE_MIN = 3;

export function isFreshPriceAge(age, maxAge = MAX_SIGNAL_PRICE_AGE_MIN) {
  return typeof age === 'number' && Number.isFinite(age) && age >= 0 && age <= maxAge;
}

export function paperSignalAgeReason(age, maxAge = MAX_SIGNAL_PRICE_AGE_MIN) {
  if (typeof age !== 'number' || !Number.isFinite(age)) return 'unknown signal price age: not scored';
  if (age < 0) return 'invalid future-dated signal price age: not scored';
  if (age > maxAge) return `stale signal (price ${age.toFixed(1)} min old): not scored`;
  return null;
}
