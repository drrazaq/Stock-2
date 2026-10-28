// Only the owner's affirmative ZAD mark can authorize approved BUY wording.
// Third-party screens, missing files and unknown marks never count as approval.
export function zadApproved(symbol, marks, excluded, nowMs = Date.now()) {
  const date = marks?.[symbol]?.d;
  const markedAt = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
  const dated = Number.isFinite(markedAt) && new Date(markedAt).toISOString().slice(0, 10) === date;
  return typeof symbol === 'string' && !!marks && Object.hasOwn(marks, symbol)
    && marks[symbol]?.s === 'ok' && dated && Number.isFinite(nowMs)
    && nowMs >= markedAt && nowMs - markedAt <= 90 * 86400000 && excluded instanceof Set && !excluded.has(symbol);
}
