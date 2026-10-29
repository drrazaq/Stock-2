import {saveAlertState,alertAvailable,deliverAlertOnce} from './alert-delivery-state.mjs';
import {telegramFetch} from './telegram-delivery.mjs';
// NEWS WATCH: every 15 minutes from before the US open to the close, reads the news for the stocks you HOLD and the stocks on
// today's BUY list, plus their competitors (Finnhub peer list) and their industry words (e.g. memory, DRAM, HBM for a memory
// maker), and alerts you when a headline carries a THREAT word: cheaper rival, replace, ban, export control, tariff, probe,
// lawsuit, recall, downgrade, guidance cut, offering, delisting... It shows how much the stock has already moved today.
// It is a HEADS-UP, not a tested signal: news cannot be tested fairly (free sources keep about a year, without exact times), and
// it matches words, not meaning, so some alerts will be false alarms. It never buys or sells. Your stop still protects you.
// Sources: Finnhub company news, general market news, peers, company profile and quotes (official API). No scraping.
import fs from 'node:fs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org', FAST = Boolean(local(env.FH_BASE));
const sleep = (ms) => new Promise(r => setTimeout(r, FAST ? 0 : ms)), readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
if (!env.FINNHUB_KEY) { console.log('news watch: no FINNHUB_KEY'); process.exit(0); }
const iso = (ms) => new Date(ms).toISOString().slice(0, 10), now = Date.now();
let calls = 0;
async function fh(p) { if (calls) await sleep(1100); calls++; try { const r = await fetch(FH + p + (p.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(env.FINNHUB_KEY)); return r.ok ? await r.json() : null; } catch (e) { return null; } }
// ---- whom to watch: what you hold (with your stop) and today's buy list
const pos = readJson('data/my-positions.json', {}), sig = readJson('data/signals.json', {});
const held = Object.keys(pos).filter(s => /^[A-Z.]{1,6}$/.test(s));
const buyList = [...new Set([...(sig.quick || []).map(x => x.sym), ...(sig.stocks || []).filter(x => x.state === 'Buy watch' && x.buyLo).map(x => x.sym), ...(sig.pead || []).filter(x => x.live).map(x => x.sym), ...(sig.evt || []).filter(x => x.live).map(x => x.sym)])].filter(s => !held.includes(s)).slice(0, 15);
const watch = [...held, ...buyList];
// (no early exit when nothing is held: the market-shock check below still runs)
// ---- per stock: name, industry, peers (refreshed weekly) and its industry words
const META = 'data/news-meta.json', meta = readJson(META, {});
const IND = [
  [/semiconductor/i, ['chip', 'chips', 'semiconductor', 'memory', 'dram', 'nand', 'hbm', 'wafer', 'foundry', 'gpu', 'ai accelerator']],
  [/software|technology|internet|communications/i, ['software', 'cloud', 'ai', 'cyber', 'data center', 'subscription']],
  [/pharma|biotech|life sciences|health/i, ['fda', 'trial', 'drug', 'approval', 'biotech', 'patent']],
  [/energy|oil|gas|utilities/i, ['oil', 'crude', 'opec', 'natural gas', 'power', 'electricity', 'grid']],
  [/aerospace|defense|airlines/i, ['defense', 'pentagon', 'missile', 'launch', 'aircraft', 'faa']],
  [/bank|financial|insurance/i, ['rates', 'fed', 'credit', 'loan', 'deposit']],
  [/machinery|electrical|industrial|construction|building/i, ['orders', 'factory', 'infrastructure', 'data center', 'equipment']],
  [/retail|consumer|auto/i, ['consumer', 'sales', 'tariff', 'demand', 'ev']],
];
for (const s of watch) { const m = meta[s]; if (m && now - Date.parse(m.at) < 7 * 864e5) continue;
  const pf = await fh('/stock/profile2?symbol=' + encodeURIComponent(s)), peers = await fh('/stock/peers?symbol=' + encodeURIComponent(s));
  const ind = (pf && pf.finnhubIndustry) || '', words = (IND.find(([re]) => re.test(ind)) || [null, []])[1];
  meta[s] = { at: new Date().toISOString(), name: String((pf && pf.name) || '').replace(/,?\s+(inc|corp|corporation|ltd|plc|co|holdings?|group|n\.?v\.?|s\.?a\.?)\.?$/i, '').trim(), ind, peers: (Array.isArray(peers) ? peers : []).filter(p => p !== s && /^[A-Z.]{1,6}$/.test(p)).slice(0, 4), words }; }
fs.writeFileSync(META, JSON.stringify(meta));
// ---- threat words (whole-word style matching on the headline and summary)
const THREAT = [['cheaper rival or replacement', /\b(cheaper|low[- ]cost|undercut|price war|replace[sd]?|replacement|alternative to|substitute|rival(s)?\b.*\b(launch|unveil|beat)|cuts? prices?)\b/i],
  ['ban or export control', /\b(ban(s|ned)?|export (control|curb|restriction)s?|blacklist(ed)?|entity list|sanction(s|ed)?)\b/i], ['tariff', /\btariffs?\b/i],
  ['probe or lawsuit', /\b(probe|investigation|investigat(es|ing)|subpoena|lawsuit|sued|class action|antitrust|sec charges?)\b/i], ['recall or safety', /\b(recall(s|ed)?|safety (issue|concern|warning)|halted? (production|shipments))\b/i],
  ['downgrade or guidance cut', /\b(downgrade[sd]?|cuts? (its )?(guidance|forecast|outlook)|lower(s|ed)? (its )?(guidance|forecast|outlook)|weak (guidance|outlook|forecast)|miss(es|ed)? (estimates|expectations))\b/i],
  ['share sale or dilution', /\b(offering|dilut\w*|private placement|registered direct|at-the-market)\b/i], ['delisting or bankruptcy', /\b(delist\w*|bankrupt\w*|chapter 11|going concern|default(s|ed)?)\b/i],
  ['short seller or fraud claim', /\b(short seller|short report|fraud|accounting (issue|irregularit\w*))\b/i], ['executive exit', /\b(ceo|cfo|chief executive|chief financial)\b.*\b(resign\w*|steps? down|depart\w*|ousted|fired)\b/i]];
const threatsOf = (t) => THREAT.filter(([, re]) => re.test(t)).map(([k]) => k);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), GENERIC = /^(the|inc|corp|group|technology|technologies|holdings?|international|systems|global|company|industries|american|united|first|new|energy|therapeutics|pharmaceuticals|bio|semiconductor)$/i;
const keyWord = (s) => { const w = String((meta[s] || {}).name || '').split(/\s+/).find(x => x.length >= 4 && !GENERIC.test(x)); return w || null; };
// a threat counts only when the threat words and the company are in the SAME sentence: a market round-up ("CoreWeave slides on debt;
// TSMC moves on outlook | Stock Movers") that names your stock elsewhere is not a threat to your stock
const SPREAD = new Set(['cheaper rival or replacement', 'ban or export control', 'tariff', 'recall or safety']), spread = (th) => th.filter(k => SPREAD.has(k));   // threats that hit a whole industry
const sameSentence = (t, s) => { const out = new Set(); for (const z of String(t).split(/(?<=[.!?;|])\s+|\n+/)) if (mentions(z, s)) for (const k of threatsOf(z)) out.add(k); return [...out]; };
const mentions = (t, s) => new RegExp('\\b' + esc(s) + '\\b').test(t) || (keyWord(s) ? new RegExp('\\b' + esc(keyWord(s)) + '\\b', 'i').test(t) : false);
const indHit = (t, s) => { const w = (meta[s] || {}).words || []; return w.filter(x => new RegExp('\\b' + esc(x) + '\\b', 'i').test(t)); };
// ---- read the news (last 2 hours; each headline once)
const SEEN = 'data/news-seen.json', seen = readJson(SEEN, {}); for (const k of Object.keys(seen)) if (now - seen[k] > 3 * 864e5) delete seen[k];
const DELIVERY='data/news-delivery.json';
const delivery=fs.existsSync(DELIVERY)?JSON.parse(fs.readFileSync(DELIVERY,'utf8')):{unknown:{}};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
if(!object(delivery)||!object(delivery.unknown)||delivery.sent!==undefined&&!object(delivery.sent)||delivery.delivery!==undefined&&!object(delivery.delivery))throw Error('NEWS_DELIVERY_STATE_UNREADABLE');
delivery.sent||={};delivery.delivery||={};
for(const [key,value]of Object.entries(delivery.unknown)){if(!object(value))throw Error('NEWS_DELIVERY_STATE_UNREADABLE');delivery.delivery[key]||={status:'UNKNOWN',at:value.at||null};}
let deliveryFailures=0;
const unconfirmed=r=>!r.ok&&!/^HTTP_(?:400|401|403|404|429)$/.test(r.reason||'');
const saveDelivery=()=>saveAlertState(DELIVERY,delivery);
const queued=new Set();
async function deliver(text,keys){
 const result=await deliverAlertOnce({book:delivery,keys,save:saveDelivery,send:async()=>{
  if(!env.TG_TOKEN||!env.TG_CHAT){console.log(text);return {ok:false,reason:'MISSING_CREDENTIALS',deliveredParts:0};}
  const r=await telegramFetch(TG+'/bot'+env.TG_TOKEN+'/sendMessage',{body:JSON.stringify({chat_id:env.TG_CHAT,text})});const b=await r.json();return {ok:r.ok,reason:b.description||null,deliveredParts:r.deliveredParts};
 }});
 if(!result.ok){deliveryFailures++;console.error('NEWS DELIVERY UNCONFIRMED: '+result.reason);}
 return result;
}
const since = now - 2 * 3600e3, from = iso(now - 864e5), to = iso(now), alerts = [];
const fresh = (a) => Array.isArray(a) ? a.filter(x => x && x.headline && typeof x.datetime==='number' && Number.isFinite(x.datetime) && x.datetime*1000<=now && x.datetime * 1000 >= since && !seen[x.id || x.headline]) : [];
const add = (sym, why, x, th, kind) => { const sourceId=String(x.id||x.headline+'|'+x.datetime),key=sym+'|'+sourceId;if(seen[key]||delivery.unknown[key]||!alertAvailable(delivery,key)||queued.has(key))return;queued.add(key);alerts.push({key,sourceId,sym,why,kind,th,h:String(x.headline).slice(0,180),src:x.source||'',t:x.datetime*1000,url:x.url||''}); };
// ---- MARKET SHOCK (Trump, China, the Fed, Europe, the UK, wars, tariffs...): the S&P 500's move today + the big headlines behind it.
// Sent once per level per day (S&P 500 down or up 1.5%, then 2.5%), or for a top-tier headline (tariff, sanctions, export
// controls, a surprise rate move, war) even before the market moves. It also says what the 5-year test found on days like this.
const MACRO = /\b(tariffs?|trade war|sanctions?|export (controls?|curbs?|ban)|fed\b|fomc|powell|rate (cut|hike)s?|interest rates?|inflation|cpi|payrolls|jobs report|recession|china|beijing|xi jinping|trump|white house|executive order|ecb|lagarde|bank of england|european union|\beu\b|brussels|opec|war|invasion|missile|ceasefire|shutdown|debt ceiling|treasury yields?)\b/i;
const TIER1 = /\b(tariffs?|export (controls?|curbs?|ban)|emergency rate|surprise (rate )?(cut|hike)|declares? war|invasion|missile strike|trade war)\b/i;   // 'sanctions' dropped 22 Oct: daily routine headlines (a law firm, a shipping company) fired MARKET SHOCK on a +0.5% day
const GEN = await fh('/news?category=general'), MS = readJson('data/macro-state.json', {}), today = iso(now);
if (MS.day !== today) { MS.day = today; MS.sent = []; MS.heads = []; }
{ const beforeSent=[...MS.sent],beforeHeads=[...MS.heads]; const spy = await fh('/quote?symbol=SPY'), dp = spy && Number.isFinite(spy.dp) && Number.isFinite(spy.c) && spy.c>0 && Number.isFinite(spy.t) && now-spy.t*1000>=0 && now-spy.t*1000<=180000 ? spy.dp : null;
  const heads = (Array.isArray(GEN) ? GEN : []).filter(x => x && x.headline && typeof x.datetime==='number' && Number.isFinite(x.datetime) && x.datetime*1000<=now && x.datetime * 1000 >= now - 6 * 3600e3 && MACRO.test(x.headline + ' ' + (x.summary || '')) && !MS.heads.includes(x.id || x.headline) && !delivery.unknown['macro-head|'+(x.id||x.headline)]).sort((a, b) => b.datetime - a.datetime);
  const lvl = dp === null ? null : dp <= -2.5 ? 'down2.5' : dp <= -1.5 ? 'down1.5' : dp >= 2.5 ? 'up2.5' : dp >= 1.5 ? 'up1.5' : null;
  const t1 = heads.filter(x => TIER1.test(x.headline)), why = [];
  if (lvl && !MS.sent.includes(lvl) && !delivery.unknown['macro-level|'+today+'|'+lvl]) { why.push('move'); MS.sent.push(lvl); } if (t1.length && (dp === null || Math.abs(dp) >= 1.0)) why.push('headline');   // a headline alone needs the market to be moving 1%+ (22 Oct)
  if (why.length) { const MD = readJson('data/mday-study.json', null), row = (k) => MD && MD.rows ? MD.rows.find(r => r.k === k) : null, pcx = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
    const k = dp !== null && dp <= -1.5 ? 'bigDown' : dp !== null && dp >= 1.5 ? 'bigUp' : null, r = k ? row(k) : null, allN = MD && MD.all && isFinite(MD.all.newer) ? MD.all.newer : null;
    const show = (why.includes('move') ? heads : t1).slice(0, 4); for (const x of show) MS.heads.push(x.id || x.headline);
    const DEC = 'RESEARCH CONTEXT ONLY: no new BUY and no instruction to override holding-specific stops, SELLs or ZAD exclusions. Review the current ACTIONS message and broker orders.';
    const lines = [(why.includes('move') ? 'MARKET SHOCK' : 'MARKET NEWS (heads-up)') + (dp !== null ? ': S&P 500 ' + (dp >= 0 ? '+' : '') + dp.toFixed(1) + '% today' : ''), DEC, '',
      ...(show.length ? ['Why (headlines):', ...show.map(x => '- "' + String(x.headline).slice(0, 160) + '" (' + (x.source || '') + ')')] : ['No big headline found yet; the move may be flows, data or rumours.']), '',
      r ? 'Stored market-day study summary (window not independently verified here), when the S&P 500 had ' + (k === 'bigDown' ? 'a big drop (1.5%+)' : 'a big rise (1.5%+)') + ' that day: the system’s tested buys made ' + pcx(r.newer.avg) + ' a trade on average (' + r.newer.n + ' unseen trades) vs ' + (allN !== null ? pcx(allN) : 'n/a') + ' on all days: ' + r.verdict + '.' : 'The market has not moved 1.5% yet; this is a heads-up on the news only.',
      'Research context, not a new approved signal. Not financial advice.'];
    const macroKeys=[...(why.includes('move')&&lvl?['macro-level|'+today+'|'+lvl]:[]),...show.map(x=>'macro-head|'+(x.id||x.headline))];
    const outcome=await deliver(lines.join('\n'),macroKeys);if(!outcome.ok){MS.sent=beforeSent;MS.heads=beforeHeads;if(unconfirmed(outcome)||outcome.deliveredParts>0){if(lvl)delivery.unknown['macro-level|'+today+'|'+lvl]={at:new Date(now).toISOString(),reason:outcome.reason};for(const x of show)delivery.unknown['macro-head|'+(x.id||x.headline)]={at:new Date(now).toISOString(),reason:outcome.reason};}}
    fs.appendFileSync('data/macro-log.jsonl', JSON.stringify({ at: new Date(now).toISOString(), dp, kind: k, why, deliveryConfirmed:outcome.ok, deliveryReason:outcome.reason, heads: show.map(x => x.headline) }) + '\n'); }
  MS.lastDp = dp; MS.at = new Date(now).toISOString(); fs.writeFileSync('data/macro-state.json', JSON.stringify(MS)); }
if (!watch.length) { saveDelivery();if(deliveryFailures)process.exitCode=2;console.log('news watch: nothing to watch; market shock check done'); process.exit(process.exitCode||0); }
for (const s of watch) {   // 1. the stock's own news
  for (const x of fresh(await fh('/company-news?symbol=' + encodeURIComponent(s) + '&from=' + from + '&to=' + to))) { const t = x.headline + ' ' + (x.summary || ''), th = sameSentence(t, s); if (th.length) add(s, 'its own news', x, th, 'own'); } }
for (const s of held) { const m = meta[s] || {};   // 2. competitors' news that touches your stock's business (held stocks only, to save calls)
  for (const p of m.peers || []) for (const x of fresh(await fh('/company-news?symbol=' + encodeURIComponent(p) + '&from=' + from + '&to=' + to))) { const t = x.headline + ' ' + (x.summary || ''), th = spread(threatsOf(t)), w = indHit(t, s);
    if ((th.length && (w.length || mentions(t, s))) || (mentions(x.headline, s) && /\b(cheaper|replace|rival|compet\w*|share)\b/i.test(t))) add(s, 'competitor ' + p + ' news' + (w.length ? ' (' + w.slice(0, 3).join(', ') + ')' : ''), x, th.length ? th : ['competitor move'], 'peer'); } }
{ const g = fresh(GEN);   // 3. general market news naming your stock, or hitting its industry with a threat
  for (const x of g) { const t = x.headline + ' ' + (x.summary || ''); if (!threatsOf(t).length) continue;
    for (const s of watch) { const w = indHit(t, s), own = sameSentence(t, s), ind = spread(threatsOf(t)); if (own.length) { add(s, 'market news naming it', x, own, 'general'); break; } if (held.includes(s) && w.length >= 2 && ind.length) { add(s, 'industry news (' + w.slice(0, 3).join(', ') + ')', x, ind, 'industry'); break; } } } }
// Delivery state is committed only after an acknowledged notification below.
if (alerts.length) fs.appendFileSync('data/news-log.jsonl', alerts.map(a => JSON.stringify({ at: new Date(now).toISOString(), ...a }) + '\n').join(''));
// ---- send: DECISIONS, not headlines. One line per stock: what to do, at what price. The headline is kept only as the reason.
// Held stock: SELL NOW only when the live price is at or under your stop (your tested protection); otherwise HOLD with the stop.
// Buy-list stock: NO BUY TODAY (a bad-news headline is a precaution: skipping a buy costs little). ACTIONS reads the same log.
if (alerts.length) { const by = new Map(); for (const a of alerts) { if (!by.has(a.sym)) by.set(a.sym, []); by.get(a.sym).push(a); }
  const deliveredKeys=[];
  const lines = ['NEWS DECISIONS (' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now)) + ' Kuwait)'], dec = [];
  for (const [sym, A] of [...by].slice(0, 8)) { const j = await fh('/quote?symbol=' + encodeURIComponent(sym)), qq = j && Number.isFinite(j.c) && j.c>0 && Number.isFinite(j.t) && now-j.t*1000>=0 && now-j.t*1000<=180000 ? { c: j.c, dp: Number.isFinite(j.dp)?j.dp:0 } : null, p = pos[sym];
    const why = A[0].th.join(', ') + ': "' + A[0].h.slice(0, 90) + (A[0].h.length > 90 ? '…' : '') + '"', px = qq ? ' (now ' + qq.c + ', ' + (qq.dp >= 0 ? '+' : '') + (qq.dp || 0).toFixed(1) + '% today)' : '';
    let d;
    if(p&&!qq)d='PRICE UNVERIFIED: check your broker; keep its stop order. No current-price SELL/HOLD inference.';
    else if (p && p.stop && qq && qq.c <= p.stop) d = 'SELL NOW at the market price' + px + '. It is at or under your stop ' + p.stop + '.';
    else if (p && p.stop) d = 'HOLD' + px + '. Keep the stop at ' + p.stop + ' at your broker; it sells only if the price reaches ' + p.stop + '.';
    else if (p) d = 'HOLD' + px + ', but NO STOP is recorded: place one now (send  stop ' + sym + ' PRICE ) or tap  my stocks  for the level.';
    else d = 'NO BUY TODAY' + px + '. Re-checked tomorrow.';
    deliveredKeys.push(A[0].key);
    lines.push('', sym + (p ? ' (you hold)' : '') + ': ' + d, 'Why (' + A[0].why + '): ' + why); dec.push({ sym, d: d.split(/[ .(]/)[0] === 'SELL' ? 'SELL' : d.startsWith('HOLD') ? 'HOLD' : d.startsWith('PRICE UNVERIFIED') ? 'PRICE UNVERIFIED' : 'NO BUY' }); }
  lines.push('', 'Decided by the system. News is a precaution, not a tested signal; your stop is the tested protection.');
  fs.appendFileSync('data/news-log.jsonl', dec.map(x => JSON.stringify({ at: new Date(now).toISOString(), decision: x.d, sym: x.sym }) + '\n').join(''));
  const outcome=await deliver(lines.join('\n'),deliveredKeys);if(outcome.ok)for(const key of deliveredKeys)seen[key]=now;else if(unconfirmed(outcome)||outcome.deliveredParts>0)for(const key of deliveredKeys)delivery.unknown[key]={at:new Date(now).toISOString(),reason:outcome.reason}; }
fs.writeFileSync(SEEN,JSON.stringify(seen));saveDelivery();if(deliveryFailures)process.exitCode=2;
console.log('news watch: ' + watch.length + ' stocks (' + held.length + ' held), ' + calls + ' calls, ' + alerts.length + ' alerts');
