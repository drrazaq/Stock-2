// Syntax normalization only: no issuer alias, tradability or halal inference.
// Dot and hyphen securities remain distinct until authoritative IDs map them.
export function marketSymbol(value) {
 if(typeof value!=='string')return null;
 const symbol=value.trim().toUpperCase();
 return /^[A-Z][A-Z0-9]{0,5}(?:[.\-][A-Z0-9]{1,3})?$/.test(symbol)?symbol:null;
}
