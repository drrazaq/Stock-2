// MARKET-03 / CATALYST-03 provider-ingress matrix (Claude, 2 Nov 2026). Static and offline: reads the repository's own .mjs
// sources, finds every provider host each file can call, classifies the (file, host) pair, and joins it with the reviewed
// contract status of each live or catalyst ingress. Run: node tools/market03-ingress-matrix.mjs [--write]
// The test tests/market03-ingress-matrix.test.mjs fails if a new provider call appears without a classification.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

// Hosts that are not market/catalyst data providers.
const OPS=new Set(['api.github.com','api.telegram.org']);
// Research citations and reading lists: URLs that sit in comments/notes, never fetched.
const REFERENCE=/^(doi\.org|papers\.ssrn\.com|ssrn\.com|ideas\.repec\.org|repec\.cepr\.org|www\.nber\.org|www\.jstor\.org|onlinelibrary\.wiley\.com|www\.wiley\.com|www\.emeraldinsight\.com|www\.joim\.com|www\.openassetpricing\.com|www\.johnhcochrane\.com|alphaarchitect\.com|funds\.alphaarchitect\.com|www\.cxoadvisory\.com|quantpedia\.com|.*\.substack\.com|www\.investopedia\.com|www\.investors\.com|www\.amazon\.com|en\.wikipedia\.org|www\.dimensional\.com|www\.luxalgo\.com|www\.msci\.com|www\.zacks\.com|www\.validea\.com|www\.etfstrategy\.com|www\.etftrends\.com|www\.evidenceinvestor\.com|www\.fool\.com|www\.opb\.org|gvwire\.com|in\.benzinga\.com|www\.allsides\.com|www\.schaeffersresearch\.com|www\.ecfr\.gov|completetradersedge\.com|thepatternsite\.com|tradingsetupsreview\.com|www\.alphatrends\.net|www\.financialwisdomtv\.com|www\.warriortrading\.com|it\.tradingview\.com|www\.tradingview\.com|usethinkscript\.com|wl6\.wealth-lab\.com|www\.followingthetrend\.com|www\.quantconnect\.com|www\.thechartist\.com|www\.tradingmarkets\.com|www\.innovatoretfs\.com|www\.kjtradingsystems\.com|www\.magicformulainvesting\.com|www\.optimalmomentum\.com|www\.quant-investing\.com|www\.quantrocket\.com|www\.smbtraining\.com|www\.tradertom\.com|www\.nyse\.com)$/;
const PROVIDER={
 'api.twelvedata.com':'TWELVE_DATA','data.alpaca.markets':'ALPACA_DATA','paper-api.alpaca.markets':'ALPACA_PAPER','api.massive.com':'MASSIVE','api.polygon.io':'POLYGON',
 'finnhub.io':'FINNHUB','financialmodelingprep.com':'FMP','www.alphavantage.co':'ALPHA_VANTAGE','www.sec.gov':'SEC','data.sec.gov':'SEC','efts.sec.gov':'SEC',
 'api.fda.gov':'OPENFDA','api.nasdaq.com':'NASDAQ','www.nasdaq.com':'NASDAQ','api.finra.org':'FINRA','api.openfigi.com':'OPENFIGI','mcp.tipranks.com':'TIPRANKS',
 'public-api.etoro.com':'ETORO','api.stocktwits.com':'STOCKTWITS','stocktwits.com':'STOCKTWITS','apewisdom.io':'APEWISDOM','api.halalterminal.com':'HALALTERMINAL',
 'api.usaspending.gov':'USASPENDING','clinicaltrials.gov':'CLINICALTRIALS','www.googleapis.com':'YOUTUBE','www.youtube.com':'YOUTUBE','youtube.com':'YOUTUBE',
 'arkfunds.io':'ARKFUNDS','www.bls.gov':'BLS','www.federalreserve.gov':'FEDERAL_RESERVE'};
// Where a file sits in the decision flow.
const LIVE=new Set(['scan.mjs','ignition-watch.mjs','alpaca-feed.mjs','intraday-radar.mjs','news-watch.mjs','premarket-check.mjs','movers.mjs','opportunity-radar.mjs','research-collector.mjs','early-alerts.mjs','deals.mjs','discover.mjs','smart-money.mjs','regime-gate.mjs','tipranks.mjs','calendar.mjs','squad26-watch.mjs','shadow-outcomes.mjs','shadow-stream.mjs','hybrid-snapshot-transport.mjs','hybrid-research-fixture.mjs','paper-transport.mjs','paper-capture-ports.mjs','paper-capture-references.mjs','scorecard-1023.mjs','missed-runners.mjs','exits.mjs','follow-lane.mjs','tip-sources.mjs','gov-awards.mjs','gov-awards2.mjs','native-sec-events.mjs','shares.mjs','fastmover-lab.mjs']);
const CATALYST=new Set(['events-study.mjs','earnings-study.mjs','insider-study.mjs','chain-ripple.mjs','share-supply.mjs','share-supply-source.mjs','discovery2.mjs','comeback-lab.mjs','news-watch.mjs','research-collector.mjs']);
const SHARED_INPUT=new Set(['leaders-study.mjs']);       // builds the shared daily price cache other producers read
const DIAGNOSTIC=/^(tools\/|sip-access-|c0-diagnostic|options-survey|expert-probe)/;
export function roleOf(file){
 if(CATALYST.has(file))return 'CATALYST_LANE_PRODUCER';if(LIVE.has(file))return 'LIVE_DELIVERY_PATH';if(SHARED_INPUT.has(file))return 'SHARED_PRICE_INPUT';
 if(DIAGNOSTIC.test(file))return 'DIAGNOSTIC_TOOL';return 'FROZEN_RESEARCH_PRODUCER';
}

// Reviewed contract status per live/catalyst ingress. Dimensions: identity, units, clock, session, adjustment, revision, status.
// Y = covered by actual-caller tests; P = partial (stated); N = open; NA = not applicable. `by` names the package.
const C=(identity,units,clock,session,adjustment,revision,status,by,note)=>({identity,units,clock,session,adjustment,revision,status,by,note});
export const CONTRACTS={
 'earnings-study.mjs|ALPHA_VANTAGE':C('Y','P','Y','Y','NA','Y','Y','claude/market03-catalyst03','requested-symbol identity; EPS strict, currency not stated by provider (labelled); report day + provider timing; reaction session'),
 'earnings-study.mjs|FMP':C('Y','P','P','N','NA','Y','Y','claude/market03-catalyst03','whole response rejected on any foreign symbol; FMP gives no timing (UNKNOWN, both reaction candidates)'),
 'earnings-study.mjs|FINNHUB':C('Y','P','Y','Y','NA','Y','Y','Codex 86b25cc + claude/market03-catalyst03','pending vs malformed vs class rows; DMH kept; cross-provider corroboration vs same-provider revision'),
 'news-watch.mjs|FINNHUB':C('P','NA','Y','N','NA','Y','Y','Codex 0f29b05/5cc2dbb + claude/market03-catalyst03','company-news bounds/status/revisions (Codex); per-field and attribution digests (this package); quote/profile/metadata paths still legacy nullable'),
 'research-collector.mjs|FINNHUB':C('P','NA','Y','N','NA','P','Y','Codex cf7f964','live vs cached origin carried to reliability; no cross-job revision guarantee'),
 'events-study.mjs|SEC':C('Y','NA','Y','P','NA','P','Y','Codex SEC caller/native lineage','accession + reported publication metadata; body revisions/authenticity open'),
 'events-study.mjs|OPENFDA':C('P','NA','P','N','NA','N','Y','Codex FDA continuation','weekly marker only on success; schema/refresh failures distinct'),
 'insider-study.mjs|SEC':C('Y','Y','P','NA','NA','Y','Y','Codex insider ZIP/TSV','dash/dot classes distinct; CIK padding; legacy rows lack accession/ingestion clocks'),
 'chain-ripple.mjs|MASSIVE':C('P','P','Y','P','P','Y','Y','Codex chain continuation','price-day ids and raw hashes; corporate-action basis not authenticated'),
 'share-supply-source.mjs|SEC':C('Y','NA','Y','NA','NA','Y','Y','Codex share-supply','literal class punctuation; unique CIK mapping; bounded index'),
 'discovery2.mjs|SEC':C('Y','NA','Y','NA','NA','Y','Y','Codex share-supply (shared index contract)',''),
 'discovery2.mjs|PRICE_CACHE':C('P','NA','Y','Y','P','Y','Y','claude/market03-catalyst03','reads the shared cache (no fetch): close day, session-based lag, basis label, revision id; stale lines withheld'),
 'comeback-lab.mjs|MASSIVE':C('Y','Y','Y','Y','Y','Y','Y','claude/market03-catalyst03','SPY only; NY bar day; unfinished bar excluded; revised bars kept as original'),
 'alpaca-feed.mjs|ALPACA_DATA':C('Y','P','Y','Y','NA','N','P','Codex market-ingress-calendar','DST/half-day/impossible calendar controls; dot/dash classes distinct; intraday basis raw'),
 'ignition-watch.mjs|ALPACA_DATA':C('Y','P','Y','Y','NA','N','P','Codex market-ingress-calendar','actual alpacaAll caller test'),
 'ignition-watch.mjs|MASSIVE':C('N','N','P','P','N','N','P','open','15-minute delayed plan; contract not reviewed in this package (Codex watcher scope)'),
 'leaders-study.mjs|MASSIVE':C('P','P','P','N','P','N','P','open (Codex-owned shared cache)','grouped bars split-adjusted as of each fetch + heuristic split repair; share classes excluded (/^[A-Z]{1,5}$/); ticker reuse not detected'),
 'smart-money.mjs|FINNHUB':C('Y','Y','Y','NA','NA','P','Y','claude/market03-batch2','insider + recommendation: outcome per call, requested-symbol identity, strict numbers, no future dates, duplicate rows once, one person once, consecutive sorted months; study block unchanged'),
 'smart-money.mjs|FMP':C('Y','NA','Y','NA','NA','N','Y','claude/market03-batch2','grades-latest-news: bounded read, REFUSED/RATE_LIMITED/MALFORMED distinct, future rows excluded, classes counted'),
 'smart-money.mjs|MASSIVE':C('P','Y','Y','Y','Y','N','Y','claude/market03-batch2','grouped prices: exchange-calendar day, envelope checked, day/lag/basis recorded, no tips on a stale day; plain tickers only (classes excluded)'),
 'smart-money.mjs|POLYGON':C('P','Y','Y','Y','Y','N','Y','claude/market03-batch2','fallback host of the same grouped request'),
 'calendar.mjs|MASSIVE':C('Y','P','Y','Y','NA','P','Y','claude/market03-batch2 (batch 3)','holidays: validated, past dropped, NYSE/Nasdaq and exchange-calendar disagreements kept as CONFLICT, failure never ok; dividends: held-ticker identity, valid ex-date, finite amount, currency labelled; public status counts only'),
 'scan.mjs|TWELVE_DATA':C('N','N','N','N','N','N','N','open (scan.mjs owned by main session)','proposal in docs/market03-catalyst03/SCAN-PROPOSAL.md'),
 'scan.mjs|ALPACA_DATA':C('N','N','P','P','N','N','N','open (scan.mjs owned by main session)','proposal'),
 'scan.mjs|FINNHUB':C('N','N','N','N','NA','N','N','open (scan.mjs owned by main session)','proposal'),
 'scan.mjs|FMP':C('N','N','N','NA','NA','N','N','open (scan.mjs owned by main session)','proposal'),
 'scan.mjs|POLYGON':C('N','N','N','N','N','N','N','open (scan.mjs owned by main session)','proposal'),
 'scan.mjs|SEC':C('P','NA','P','NA','NA','N','P','open (scan.mjs owned by main session)','danger-filing reads; proposal'),
 'intraday-radar.mjs|FINNHUB':C('N','N','N','N','NA','N','N','open',''),
 'premarket-check.mjs|ALPACA_DATA':C('N','N','P','P','NA','N','N','open','prior-close / old-trade guard covered by Codex news tests only'),
 'movers.mjs|POLYGON':C('N','N','N','N','N','N','N','open',''),
 'movers.mjs|FINNHUB':C('N','N','N','N','NA','N','N','open',''),
};

const hostRe=/https?:\/\/([a-z0-9.\-]+\.(?:com|io|gov|org|markets|net|co))(?=[\/'"`?\s)]|$)/gi;
export function buildMatrix(root=ROOT){
 const files=execFileSync('git',['ls-files','*.mjs'],{cwd:root,encoding:'utf8'}).split('\n').filter(f=>f&&!/^(test|tests|docs)\//.test(f));
 const pairs=[];
 for(const file of files){const src=fs.readFileSync(path.join(root,file),'utf8'),hosts=new Set();for(const m of src.matchAll(hostRe))hosts.add(m[1].toLowerCase());
  for(const host of [...hosts].sort()){
   const kind=OPS.has(host)?'OPS':REFERENCE.test(host)?'REFERENCE_ONLY':PROVIDER[host]?'PROVIDER':'UNCLASSIFIED';
   if(kind!=='PROVIDER'){pairs.push({file,host,kind});continue;}
   const provider=PROVIDER[host],role=roleOf(file),contract=CONTRACTS[file+'|'+provider]||null;
   pairs.push({file,host,kind,provider,role,contract:contract||(role==='FROZEN_RESEARCH_PRODUCER'?'OUT_OF_SCOPE_FROZEN_INPUTS':role==='DIAGNOSTIC_TOOL'?'DIAGNOSTIC_NOT_A_DECISION_PATH':'NOT_REVIEWED')});}
 }
 // Ingress that is not a URL in the file (shared cache readers) is listed from the contract table.
 for(const key of Object.keys(CONTRACTS)){const [file,provider]=key.split('|');if(!pairs.some(p=>p.file===file&&p.provider===provider))pairs.push({file,host:null,kind:'PROVIDER',provider,role:roleOf(file),contract:CONTRACTS[key],via:'shared cache or injected transport'});}
 pairs.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:String(a.host)<String(b.host)?-1:1);
 const providerPairs=pairs.filter(p=>p.kind==='PROVIDER'),decision=providerPairs.filter(p=>['LIVE_DELIVERY_PATH','CATALYST_LANE_PRODUCER','SHARED_PRICE_INPUT'].includes(p.role));
 const reviewed=decision.filter(p=>typeof p.contract==='object');
 const full=reviewed.filter(p=>['identity','units','clock','session','adjustment','revision','status'].every(k=>['Y','NA'].includes(p.contract[k])));
 return {summary:{files:files.length,pairs:pairs.length,providerPairs:providerPairs.length,decisionPathPairs:decision.length,reviewedDecisionPairs:reviewed.length,fullyCoveredDecisionPairs:full.length,
  unreviewedDecisionPairs:[...new Set(decision.filter(p=>typeof p.contract!=='object').map(p=>p.file+'|'+p.provider))],unclassified:pairs.filter(p=>p.kind==='UNCLASSIFIED').map(p=>p.file+'|'+p.host),
  frozenResearchPairs:providerPairs.filter(p=>p.role==='FROZEN_RESEARCH_PRODUCER').length,
  decisionIngress:new Set(decision.map(p=>p.file+'|'+p.provider)).size,reviewedIngress:new Set(reviewed.map(p=>p.file+'|'+p.provider)).size,fullyCoveredIngress:[...new Set(full.map(p=>p.file+'|'+p.provider))]},pairs};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const m=buildMatrix();
 if(process.argv.includes('--write'))fs.writeFileSync(path.join(ROOT,'docs/validation/market03-ingress-matrix.json'),JSON.stringify(m,null,1)+'\n');
 console.log(JSON.stringify(m.summary,null,1));
}
