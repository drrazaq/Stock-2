// Only the owner's affirmative ZAD mark can authorize approved BUY wording.
// Third-party screens, missing files and unknown marks never count as approval.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const symbol=x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
export function zadDate(date) {
 const t=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(date+'T00:00:00Z'):NaN;
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===date?t:null;
}
// Rejections remain recheck-required until an explicit valid owner update.
// A quarterly list may block, but can never supply the owner's affirmative mark.
// A malformed exclusion file cannot be silently interpreted as an empty list.
export function resolveZad(marks,list,now=Date.now()) {
 const listValid=object(list)&&Array.isArray(list.notHalal)&&list.notHalal.every(symbol)
  &&['newHalal','halalAgain'].every(k=>list[k]===undefined||Array.isArray(list[k])&&list[k].every(symbol));
 const valid=object(marks)&&listValid&&Number.isFinite(now),out=Object.create(null),excluded=new Set(listValid?list.notHalal:[]);
 if(object(marks))for(const [sym,m] of Object.entries(marks)){
  if(!symbol(sym)||!object(m))continue;
  const at=zadDate(m.d),fresh=at!==null&&now>=at&&now-at<=90*86400000;
  if(m.s==='fail')out[sym]={...m,s:'fail',requiresRecheck:!fresh};
  else if(m.s==='ok')out[sym]=valid&&fresh&&(m.requiresRecheck===undefined||m.requiresRecheck===false)&&(m.by===undefined||typeof m.by==='string')&&!/ZAD list|Zoya|Halal Terminal|HalalScreener/i.test(String(m.by||''))?{...m,s:'ok'}:{...m,s:'expired',was:'ok',requiresRecheck:true};
 }
 for(const sym of excluded)out[sym]={s:'fail',d:list.effective||list.received||null,by:'ZAD list',requiresRecheck:true};
 return {valid,marks:out,excluded,reason:valid?null:!listValid?'MISSING_OR_MALFORMED_ZAD_LIST':'MISSING_OR_MALFORMED_OWNER_MARKS'};
}
export function zadApproved(symbol, marks, excluded, nowMs = Date.now()) {
  const date = marks?.[symbol]?.d;
  const markedAt = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
  const dated = Number.isFinite(markedAt) && new Date(markedAt).toISOString().slice(0, 10) === date;
  return typeof symbol === 'string' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) && object(marks) && Object.hasOwn(marks, symbol) && object(marks[symbol])
    && marks[symbol]?.s === 'ok' && (marks[symbol]?.requiresRecheck===undefined||marks[symbol]?.requiresRecheck===false) && (marks[symbol]?.by===undefined||typeof marks[symbol]?.by==='string') && !/ZAD list|Zoya|Halal Terminal|HalalScreener/i.test(String(marks[symbol]?.by||'')) && dated && Number.isFinite(nowMs)
    && nowMs >= markedAt && nowMs - markedAt <= 90 * 86400000 && excluded instanceof Set && !excluded.has(symbol);
}
