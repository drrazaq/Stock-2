// Research-only multi-horizon trade plan evaluator. Does not place orders.
// Each horizon must have independently validated, out-of-sample statistics.
export const HORIZONS = Object.freeze([1,3,5,10,21,42]);
const finite = Number.isFinite;
export function assessTradePlan({symbol,entry,stop,targets,stats,capital=1000,feeRoundTrip=6,spreadPct=0,slippagePct=0,halalStatus='unknown',quoteAgeSec=null}) {
 const fail = reason => ({symbol,decision:'NO BUY',reason,plans:[]});
 if(!/^[A-Z]{1,5}$/.test(symbol||'')) return fail('INVALID_SYMBOL');
 if(halalStatus!=='approved') return fail('HALAL_NOT_CONFIRMED');
 if(!finite(quoteAgeSec)||quoteAgeSec<0||quoteAgeSec>120) return fail('STALE_QUOTE');
 if(!finite(entry)||entry<=0||!finite(stop)||stop<=0||stop>=entry) return fail('INVALID_ENTRY_STOP');
 if(!finite(capital)||capital<=feeRoundTrip||!finite(feeRoundTrip)||feeRoundTrip<0||!finite(spreadPct)||spreadPct<0||!finite(slippagePct)||slippagePct<0) return fail('INVALID_COSTS');
 const shares=Math.floor(capital/(entry*(1+spreadPct/2+slippagePct)));
 if(shares<1) return fail('INSUFFICIENT_CAPITAL');
 const plans=HORIZONS.map(sessions=>{
  const target=targets?.[sessions], r=stats?.[sessions];
  if(!finite(target)||target<=entry||!r||!Number.isInteger(r.n)||r.n<60||!finite(r.winRate)||r.winRate<0||r.winRate>1||!finite(r.avgNet)||!finite(r.stressNet)||!finite(r.noTop2Net)||!finite(r.benchmarkExcess)||r.outOfSample!==true) return {sessions,decision:'UNPROVEN'};
  const netTarget=shares*(target-entry)-feeRoundTrip-shares*entry*(spreadPct+2*slippagePct);
  const netStop=shares*(stop-entry)-feeRoundTrip-shares*entry*(spreadPct+2*slippagePct);
  const proven=r.avgNet>0&&r.stressNet>0&&r.noTop2Net>0&&r.benchmarkExcess>0&&netTarget>0;
  return {sessions,decision:proven?'ELIGIBLE':'NO EDGE',entry,stop,target,shares,netTarget:+netTarget.toFixed(2),netStop:+netStop.toFixed(2),winRate:r.winRate,avgNet:r.avgNet};
 });
 const eligible=plans.filter(p=>p.decision==='ELIGIBLE').sort((a,b)=>b.avgNet-a.avgNet);
 return {symbol,decision:eligible.length?'RESEARCH CANDIDATE':'NO BUY',reason:eligible.length?'REQUIRES_LIVE_EXECUTION_CHECK':'NO_VALIDATED_EDGE',preferred:eligible[0]||null,plans};
}
