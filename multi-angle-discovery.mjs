// MULTI-ANGLE DISCOVERY REGISTRY (research only; no orders, recommendations or implicit validation).
// This layer preserves independent ways to surface a stock before or during a move.
// Inputs are point-in-time observations supplied by their respective collectors.
// Missing data NEVER becomes a negative finding; no synthetic evidence is created.
export const LANES = Object.freeze([
  {id:'PRE_IGNITION',name:'Early unusual activity',source:'pre-ignition-discovery.mjs',horizon:'intraday'},
  {id:'NEWS_CATALYST',name:'Verified material company news',source:'news-watch.mjs / catalyst-core.mjs',horizon:'intraday to 10 sessions'},
  {id:'SEC_EVENT',name:'Dated SEC catalyst',source:'catalyst-core.mjs / catalyst-integrity.mjs',horizon:'1 to 60 sessions'},
  {id:'INSIDER_CLUSTER',name:'Multiple open-market insider purchases',source:'insider-study.mjs',horizon:'20 to 60 sessions'},
  {id:'EARNINGS_SURPRISE',name:'Earnings surprise and reaction',source:'earnings-study.mjs',horizon:'1 to 40 sessions'},
  {id:'INDUSTRY_RIPPLE',name:'Customer/supplier or industry demand',source:'chain-core.mjs / chain-ripple.mjs',horizon:'1 to 60 sessions'},
  {id:'SUPPLY_SHIFT',name:'Shares outstanding or float change',source:'share-supply.mjs',horizon:'1 to 60 sessions'},
  {id:'TECHNICAL_BUILDUP',name:'Compression, trend, volume or relative strength',source:'discovery2-core.mjs',horizon:'intraday to 60 sessions'},
  {id:'MARKET_DISLOCATION',name:'Post-event overreaction or reversal',source:'comeback-core.mjs',horizon:'1 to 60 sessions'}
]);
const allowed=new Set(LANES.map(x=>x.id));
const symOk=s=>typeof s==='string' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s);
const finite=x=>typeof x==='number' && Number.isFinite(x);
const timeOk=t=>typeof t==='string' && Number.isFinite(Date.parse(t));
// Evidence: {symbol,lane,asOf,observedAt,sourceId,description,score?}
// asOf is when evidence became PUBLIC; observedAt is when scanner captured it.
export function assembleMultiAngle(observations=[],{cutoff,limit=100}={}) {
  if (!timeOk(cutoff)) throw new TypeError('cutoff must be an ISO timestamp');
  const at=Date.parse(cutoff), grouped=new Map(), ignored={invalid:0,future:0,unknownLane:0};
  for(const o of observations) {
    if (!o || !symOk(o.symbol) || !timeOk(o.asOf) || !timeOk(o.observedAt) ||
      typeof o.sourceId!=='string' || !o.sourceId.trim() || typeof o.description!=='string' || !o.description.trim()) {ignored.invalid++;continue;}
    if(!allowed.has(o.lane)) {ignored.unknownLane++;continue;}
    // Both publication time AND collector time must precede the decision cutoff.
    if(Date.parse(o.asOf)>at || Date.parse(o.observedAt)>at || Date.parse(o.observedAt)<Date.parse(o.asOf)) {ignored.future++;continue;}
    const score=finite(o.score)?Math.max(0,Math.min(100,o.score)):null;
    const row=grouped.get(o.symbol)||{symbol:o.symbol,lanes:new Map()};
    const prior=row.lanes.get(o.lane);
    const ev={lane:o.lane,asOf:o.asOf,observedAt:o.observedAt,sourceId:o.sourceId,description:o.description,score};
    // Keep most recent evidence per lane; never count repeated headlines as independent confirmation.
    if(!prior || Date.parse(ev.observedAt)>Date.parse(prior.observedAt))row.lanes.set(o.lane,ev);
    grouped.set(o.symbol,row);
  }
  const candidates=[...grouped.values()].map(x=>{
    const evidence=[...x.lanes.values()].sort((a,b)=>a.lane.localeCompare(b.lane));
    const independentLanes=evidence.length;
    return {symbol:x.symbol,independentLanes,evidence,classification:'RESEARCH ONLY',
      status:'NOT AN APPROVED BUY'};
  }).sort((a,b)=>b.independentLanes-a.independentLanes || a.symbol.localeCompare(b.symbol));
  return {cutoff,candidates:candidates.slice(0,Math.max(0,Math.floor(limit))),count:candidates.length,ignored,
    note:'Lane count is breadth of distinct evidence, NOT predicted returns or a trading score.'};
}
