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
if (!watch.length) { console.log('news watch: nothing to watch'); process.exit(0); }
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
const mentions = (t, s) => new RegExp('\\b' + esc(s) + '\\b').test(t) || (keyWord(s) ? new RegExp('\\b' + esc(keyWord(s)) + '\\b', 'i').test(t) : false);
const indHit = (t, s) => { const w = (meta[s] || {}).words || []; return w.filter(x => new RegExp('\\b' + esc(x) + '\\b', 'i').test(t)); };
// ---- read the news (last 2 hours; each headline once)
const SEEN = 'data/news-seen.json', seen = readJson(SEEN, {}); for (const k of Object.keys(seen)) if (now - seen[k] > 3 * 864e5) delete seen[k];
const since = now - 2 * 3600e3, from = iso(now - 864e5), to = iso(now), alerts = [];
const fresh = (a) => Array.isArray(a) ? a.filter(x => x && x.headline && x.datetime * 1000 >= since && !seen[x.id || x.headline]) : [];
const add = (sym, why, x, th, kind) => { const key = x.id || x.headline; alerts.push({ sym, why, kind, th, h: String(x.headline).slice(0, 180), src: x.source || '', t: x.datetime * 1000, url: x.url || '' }); seen[key] = now; };
for (const s of watch) {   // 1. the stock's own news
  for (const x of fresh(await fh('/company-news?symbol=' + encodeURIComponent(s) + '&from=' + from + '&to=' + to))) { const t = x.headline + ' ' + (x.summary || ''), th = threatsOf(t); if (th.length && (mentions(x.headline, s) || mentions(t, s))) add(s, 'its own news', x, th, 'own'); } }
for (const s of held) { const m = meta[s] || {};   // 2. competitors' news that touches your stock's business (held stocks only, to save calls)
  for (const p of m.peers || []) for (const x of fresh(await fh('/company-news?symbol=' + encodeURIComponent(p) + '&from=' + from + '&to=' + to))) { const t = x.headline + ' ' + (x.summary || ''), th = threatsOf(t), w = indHit(t, s);
    if ((th.length && (w.length || mentions(t, s))) || (mentions(x.headline, s) && /\b(cheaper|replace|rival|compet\w*|share)\b/i.test(t))) add(s, 'competitor ' + p + ' news' + (w.length ? ' (' + w.slice(0, 3).join(', ') + ')' : ''), x, th.length ? th : ['competitor move'], 'peer'); } }
{ const g = fresh(await fh('/news?category=general'));   // 3. general market news naming your stock, or hitting its industry with a threat
  for (const x of g) { const t = x.headline + ' ' + (x.summary || ''), th = threatsOf(t); if (!th.length) continue;
    for (const s of watch) { const w = indHit(t, s); if (mentions(x.headline, s)) { add(s, 'market news naming it', x, th, 'general'); break; } if (held.includes(s) && w.length >= 2) { add(s, 'industry news (' + w.slice(0, 3).join(', ') + ')', x, th, 'industry'); break; } } } }
fs.writeFileSync(SEEN, JSON.stringify(seen));
if (alerts.length) fs.appendFileSync('data/news-log.jsonl', alerts.map(a => JSON.stringify({ at: new Date(now).toISOString(), ...a }) + '\n').join(''));
// ---- send: one message, with today's move so far and your stop
if (alerts.length) { const lines = ['NEWS WATCH (heads-up, not a tested signal; words matched, not meaning)'], q = {};
  for (const a of alerts.slice(0, 8)) { if (!q[a.sym]) { const j = await fh('/quote?symbol=' + encodeURIComponent(a.sym)); q[a.sym] = j && +j.c > 0 ? { c: +j.c, dp: +j.dp } : null; } const p = pos[a.sym], qq = q[a.sym];
    const ny = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(a.t));
    lines.push('', a.sym + (p ? ' (YOU HOLD' + (p.stop ? ', stop ' + p.stop : '') + ')' : ' (on today’s buy list)') + ': ' + a.why + '. Threat: ' + a.th.join(', ') + '.', '"' + a.h + '" (' + a.src + ', ~' + ny + ' New York)',
      qq ? 'Now ' + qq.c + ' (' + (qq.dp >= 0 ? '+' : '') + (qq.dp || 0).toFixed(1) + '% since the last close): ' + (Math.abs(qq.dp || 0) >= 3 ? 'the market has already reacted.' : 'little reaction so far.') : 'Price not available.',
      p ? 'What to do: read it; your stop is your protection. If the threat is real for the business, you may tighten the stop or sell, your decision.' : 'What to do: hold off buying ' + a.sym + ' today until you have read it.'); }
  if (alerts.length > 8) lines.push('', '+' + (alerts.length - 8) + ' more in the news log.');
  lines.push('', 'Send  check SYM  for the full picture. Not financial advice.');
  if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: lines.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
  else console.log(lines.join('\n')); }
console.log('news watch: ' + watch.length + ' stocks (' + held.length + ' held), ' + calls + ' calls, ' + alerts.length + ' alerts');
