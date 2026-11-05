export const proposedPolicy = {
  id:'UNAPPROVED_CONTRACT_RECLAIM_RESEARCH_1',version:1,mode:'OFFLINE_RESEARCH_ONLY',adopted:false,
  minPrice:2,minDollarVolume:500000,maxSpreadPct:3,maxQuoteAgeMs:30000,materialityRatio:0.1,
  openingBarMs:300000,maxTriggerAgeMs:30000,minOpeningVolumeRatio:1.5,
  maxHoldSessions:5,exitRule:'FIRST_CLOSE_BELOW_OPENING_LOW_ELSE_MAX_SESSION_CLOSE',
  exitContract:'PROPOSED ONLY: max 5 sessions; close below opening low exits next session open',
  invalidationContract:'PROPOSED ONLY: close below opening low; no intraday stop or target',
  commissionPerSideUsd:3,slippagePerSidePct:0.25,maxExitQuoteAgeMs:30000
};
export function researchFixture() {
  const dates=['2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10','2026-11-11'];
  const sessions=dates.map(date=>({date,open:date+'T14:30:00Z',close:date+'T21:00:00Z',evidenceId:'SYNTHETIC_CALENDAR_'+date}));
  const bar=(start,end,open,high,low,close,n)=>({symbol:'TEST',securityId:'SYNTHETIC_SECURITY',start,end,availableAt:end,open,high,low,close,volume:2000,dollarVolume:21000,prior20SessionMedianVolume:1000,priorVolumeEvidenceId:'SYNTHETIC_PRIOR_VOLUME',evidenceId:'SYNTHETIC_BAR_'+n});
  const input={observationId:'SYNTHETIC_OBSERVATION_1',symbol:'TEST',securityId:'SYNTHETIC_SECURITY',issuerId:'SYNTHETIC_ISSUER',issuerEvidenceId:'SYNTHETIC_ISSUER_MAPPING',identityEvidenceId:'SYNTHETIC_IDENTITY',identityAsOf:'2026-11-03T21:00:00Z',instrument:'US_COMMON_STOCK',zad:'YES',zadAsOf:'2026-11-03T21:00:00Z',zadEvidenceId:'SYNTHETIC_OWNER_MARK',asOf:'2026-11-04T14:45:05Z',sessionOpen:sessions[1].open,sessionClose:sessions[1].close,calendar:{source:'SYNTHETIC_TEST_NOT_AUTHORITATIVE',evidenceId:'SYNTHETIC_CALENDAR',sessions},prior20DayDollarVolume:1000000,liquidityAsOf:'2026-11-03T21:00:00Z',liquidityEvidenceId:'SYNTHETIC_LIQUIDITY',paperBudgetUsd:1000,
  catalyst:{securityId:'SYNTHETIC_SECURITY',sourceId:'SYNTHETIC_DOCUMENT',sourceUrl:'https://example.invalid/synthetic',documentHash:'a'.repeat(64),verification:'VERIFIED_MATERIAL_AGREEMENT',publishedAt:'2026-11-04T13:00:00Z',observedAt:'2026-11-04T13:01:00Z',firstTradableSessionOpen:sessions[1].open,priorSessionDate:sessions[0].date,contractValueUsd:20000000,priorMarketCapUsd:100000000,marketCapAsOf:'2026-11-03T21:00:00Z',currency:'USD',contractValueBasis:'FIXED_COMMITTED_NOT_CEILING'},
  quote:{symbol:'TEST',securityId:'SYNTHETIC_SECURITY',source:'SYNTHETIC',evidenceId:'SYNTHETIC_ENTRY_QUOTE',at:'2026-11-04T14:45:04Z',observedAt:'2026-11-04T14:45:05Z',sourceDelayMs:0,sizeUnits:'SHARES',bid:10.49,ask:10.5,bidSize:1000,askSize:1000},
  bars:[bar('2026-11-04T14:30:00Z','2026-11-04T14:35:00Z',10,10.4,9.9,10.3,1),bar('2026-11-04T14:35:00Z','2026-11-04T14:40:00Z',10.3,10.35,10.1,10.2,2),bar('2026-11-04T14:40:00Z','2026-11-04T14:45:00Z',10.2,10.6,10.15,10.5,3)]};
  const exit={asOf:'2026-11-10T21:01:00Z',sessionCloses:sessions.slice(1,6).map(s=>({sessionDate:s.date,securityId:input.securityId,evidenceId:'SYNTHETIC_CLOSE_'+s.date,at:s.close,availableAt:s.close,close:11})),quote:{symbol:'TEST',securityId:input.securityId,source:'SYNTHETIC',evidenceId:'SYNTHETIC_EXIT_QUOTE',at:'2026-11-10T20:59:59Z',observedAt:'2026-11-10T21:00:00Z',sourceDelayMs:0,sizeUnits:'SHARES',bid:11,ask:11.01,bidSize:1000,askSize:1000}};
  return {input,exit,policy:structuredClone(proposedPolicy)};
}
