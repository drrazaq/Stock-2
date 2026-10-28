// Only the owner's affirmative ZAD mark can authorize approved BUY wording.
// Third-party screens, missing files and unknown marks never count as approval.
export function zadApproved(symbol, marks, excluded) {
  return typeof symbol === 'string' && !!marks && Object.hasOwn(marks, symbol)
    && marks[symbol]?.s === 'ok' && excluded instanceof Set && !excluded.has(symbol);
}
