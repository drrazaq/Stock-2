// Classification only. A target band is not a forecast, approved entry or trade signal.
// Categories use the owner's requested core ranges; unassigned gaps are explicitly reported.
export const MOVE_CATEGORIES = Object.freeze([
  {id:0,min:0.02,max:0.05,label:'2-5%'},
  {id:1,min:0.07,max:0.10,label:'7-10%'},
  {id:2,min:0.11,max:0.20,label:'11-20%'},
  {id:3,min:0.25,max:Infinity,label:'25%+'}
]);
export function classifyPotentialMove(move) {
  if (!Number.isFinite(move) || move < 0) return {category:null,reason:'INVALID_MOVE'};
  const match=MOVE_CATEGORIES.find(c=>move>=c.min-1e-10 && move<=c.max+1e-10);
  return match ? {category:match.id,label:match.label,reason:'CLASSIFICATION_ONLY'} : {category:null,reason:'BETWEEN_CATEGORIES'};
}
export function categorizeCandidate({entry,validatedTarget,halalApproved=false,quoteFresh=false,spreadPct=null}) {
  if (!Number.isFinite(entry)||entry<=0||!Number.isFinite(validatedTarget)||validatedTarget<=entry) return {category:null,decision:'NO BUY',reason:'NO_VALIDATED_TARGET'};
  const move=validatedTarget/entry-1;
  const c=classifyPotentialMove(move);
  if (move < MOVE_CATEGORIES[0].min) return {...c,decision:'NO BUY',reason:'BELOW_CATEGORY_0'};
  // Transition gaps (5-7%, 10-11%, 20-25%) stay visible in research.
  // They must not become BUY signals just because the owner-defined bands have gaps.
  if (!halalApproved) return {...c,decision:'NO BUY',reason:'ZAD_NOT_CONFIRMED'};
  if (!quoteFresh||!Number.isFinite(spreadPct)||spreadPct<0) return {...c,decision:'NO BUY',reason:'EXECUTION_NOT_VERIFIED'};
  return {...c,decision:'RESEARCH CANDIDATE',reason:'REQUIRES_PROVEN_ENTRY_AND_RISK'};
}
