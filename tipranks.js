// TipRanks radar for the US stock signal board. Runs on GitHub Actions twice a week.
// It asks TipRanks (through its official MCP API, with YOUR key) for trending stocks, analysts' top rated stocks and top
// Smart Score stocks, shortlists the names that appear most, adds a buy range and sell prices to each, and sends the result
// to your Telegram ONLY. Nothing from TipRanks is saved in the repository or printed in the public run log, because the
// TipRanks terms forbid republishing their data. Data by TipRanks.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const MCP = (local(env.TR_BASE) || 'https://mcp.tipranks.com') + '/mcp/?apikey=' + encodeURIComponent(env.TIPRANKS_KEY || '');
const TD = local(env.TD_BASE) || 'https://api.twelvedata.com', TG = local(env.TG_BASE) || 'https://api.telegram.org', FAST = Boolean(local(env.TD_BASE));
const RATE = Math.max(1, parseInt(env.RATE || '8', 10) || 8), SHORTLIST = 10, MIN_LEFT = 6;
for (const k of ['TIPRANKS_KEY', 'TWELVE_KEY', 'TG_TOKEN', 'TG_CHAT']) if (!env[k]) { console.error('Missing secret ' + k); process.exit(1); }

const html = fs.readFileSync('index.html', 'utf8'), m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!m) { console.error('index.html has no logic block. Upload the latest index.html first.'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'logic-' + Date.now() + '.cjs'); fs.writeFileSync(tmp, m[1]);
const L = createRequire(import.meta.url)(tmp);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const money = (x) => Number(x).toFixed(2);

// ---- minimal MCP client over HTTP (JSON or event-stream replies)
let session = null, rpcId = 0;
async function rpc(method, params, notify) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (session) headers['Mcp-Session-Id'] = session;
  const r = await fetch(MCP, { method: 'POST', headers, body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++rpcId, method, params }) });
  if (r.headers.get('mcp-session-id')) session = r.headers.get('mcp-session-id');
  if (notify) return null;
  if (r.status === 401 || r.status === 403) { console.error('TipRanks rejected the key (HTTP ' + r.status + '). Check the TIPRANKS_KEY secret.'); process.exit(1); }
  if (r.status === 429) { const e = new Error('quota'); e.quota = true; throw e; }
  const text = await r.text();
  let msg = null;
  if ((r.headers.get('content-type') || '').includes('event-stream')) { for (const line of text.split('\n')) if (line.startsWith('data:')) { try { const j = JSON.parse(line.slice(5).trim()); if (j.id === rpcId) msg = j; } catch {} } }
  else { try { msg = JSON.parse(text); } catch {} }
  if (!msg) throw new Error('Unreadable reply from TipRanks (HTTP ' + r.status + ')');
  if (msg.error) throw new Error('TipRanks error: ' + msg.error.message);
  return msg.result;
}
// Fill a tool's arguments from its published schema, so the script adapts if TipRanks renames things.
function argsFor(tool, tickers) {
  const props = (tool.inputSchema && tool.inputSchema.properties) || {}, req = (tool.inputSchema && tool.inputSchema.required) || [], a = {};
  for (const [k, p] of Object.entries(props)) {
    if (tickers && /ticker|symbol/i.test(k)) { a[k] = p.type === 'array' ? tickers : tickers.join(','); continue; }
    if (!req.includes(k)) continue;
    a[k] = p.default !== undefined ? p.default : p.enum ? p.enum[0] : /country|market/i.test(k) ? 'us' : p.type === 'number' || p.type === 'integer' ? 10 : p.type === 'boolean' ? false : p.type === 'array' ? [] : '';
  }
  return a;
}
async function call(tools, name, tickers) {
  const tool = tools.find(t => t.name === name); if (!tool) { console.log('tool not offered by TipRanks: ' + name); return null; }
  const res = await rpc('tools/call', { name, arguments: argsFor(tool, tickers) });
  if (res.isError) { console.log(name + ' returned an error from TipRanks'); return null; }
  if (res.structuredContent) return res.structuredContent;
  const t = (res.content || []).find(c => c.type === 'text'); if (!t) return null;
  try { return JSON.parse(t.text); } catch { return t.text; }
}
// Walk any JSON shape and collect every object that carries a ticker.
function rowsOf(data, out = []) {
  if (Array.isArray(data)) data.forEach(x => rowsOf(x, out));
  else if (data && typeof data === 'object') {
    const k = Object.keys(data).find(x => /^(ticker|symbol|stockTicker|tickerName)$/i.test(x));
    if (k && typeof data[k] === 'string' && /^[A-Z]{1,5}$/.test(data[k].toUpperCase())) out.push({ sym: data[k].toUpperCase(), o: data });
    for (const v of Object.values(data)) if (v && typeof v === 'object') rowsOf(v, out);
  }
  return out;
}
const pick = (o, re) => { for (const [k, v] of Object.entries(o)) if (re.test(k) && (typeof v === 'number' || typeof v === 'string') && String(v).length < 40) return v; for (const v of Object.values(o)) if (v && typeof v === 'object' && !Array.isArray(v)) { const x = pick(v, re); if (x !== undefined) return x; } return undefined; };
const shape = (d) => Array.isArray(d) ? 'list of ' + d.length : d && typeof d === 'object' ? 'object with keys ' + Object.keys(d).slice(0, 12).join(', ') : typeof d;

async function telegram(text) {
  for (let i = 0; i < text.length; i += 3800) { const r = await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(i, i + 3800), disable_web_page_preview: true }) }); if (!r.ok) console.error('Telegram error', r.status); }
}
let used = 0;
async function candles(sym) {
  for (let a = 0; a < 3; a++) {
    if (used >= RATE) { await sleep(FAST ? 5 : 61000); used = 0; }
    used++;
    const j = await (await fetch(TD + '/time_series?symbol=' + encodeURIComponent(sym) + '&interval=1day&outputsize=4000&order=ASC&apikey=' + encodeURIComponent(env.TWELVE_KEY))).json();
    if (j.code === 429) { await sleep(FAST ? 5 : 61000); used = 0; continue; }
    if (!j.values) return null;
    const today = new Date().toISOString().slice(0, 10);
    const all = j.values.map(v => ({ d: v.datetime.slice(0, 10), o: +v.open, h: +v.high, l: +v.low, c: +v.close, v: +v.volume || 0 })).sort((x, y) => x.d < y.d ? -1 : 1);
    return { candles: all.filter(c => c.d < today), last: all[all.length - 1].c };
  }
  return null;
}

// ---- run
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'stock-signal-board', version: '1.0' } });
await rpc('notifications/initialized', {}, true);
const tools = (await rpc('tools/list', {})).tools || [];
console.log('TipRanks offers ' + tools.length + ' tools');

const usage = await call(tools, 'get_my_usage').catch(() => null);
const left = usage && typeof usage === 'object' ? pick(usage, /remain/i) : undefined;
console.log('monthly calls remaining: ' + (left === undefined ? 'unknown' : left));
if (left !== undefined && Number(left) < MIN_LEFT) { console.log('Too few TipRanks calls left this month. Skipping this run.'); process.exit(0); }

const LISTS = [['get_trending_stocks', 'trending with analysts'], ['get_top_rated_stocks', 'top rated by analysts'], ['get_top_smart_score_stocks', 'top Smart Score']];
const seen = new Map();
try {
  for (const [name, label] of LISTS) {
    const data = await call(tools, name); if (data === null) continue;
    const rows = rowsOf(data); console.log(name + ': ' + shape(data) + ', ' + new Set(rows.map(r => r.sym)).size + ' tickers found');
    [...new Set(rows.map(r => r.sym))].slice(0, 25).forEach((sym, rank) => { const e = seen.get(sym) || { sym, tags: [], rank: 0 }; e.tags.push(label); e.rank += rank; seen.set(sym, e); });
    await sleep(FAST ? 0 : 7000);
  }
} catch (e) { if (!e.quota) throw e; console.log('TipRanks monthly quota reached.'); }
const short = [...seen.values()].sort((a, b) => b.tags.length - a.tags.length || a.rank - b.rank).slice(0, SHORTLIST);
if (!short.length) { console.log('No tickers could be read from the TipRanks replies. Send this log to get the reader adjusted.'); process.exit(0); }

let details = new Map();
try { const d = await call(tools, 'get_assets_data', short.map(s => s.sym)); if (d) { console.log('get_assets_data: ' + shape(d)); for (const r of rowsOf(d)) if (!details.has(r.sym)) details.set(r.sym, r.o); } } catch (e) { if (!e.quota) console.log('details unavailable: ' + e.message); }

const spy = await candles('SPY'), mkt = spy ? L.marketMap(spy.candles) : null, lines = [];
for (const s of short) {
  const o = details.get(s.sym) || {}, bits = [];
  const sc = pick(o, /smart.?score/i), cons = pick(o, /consensus/i), pt = pick(o, /price.?target|target.?price/i), nm = pick(o, /^(name|company.?name)$/i);
  if (sc !== undefined) bits.push('Smart Score ' + sc); if (cons !== undefined) bits.push('analysts: ' + cons); if (pt !== undefined && Number(pt) > 0) bits.push('average target ' + money(pt));
  let plan = '  price plan unavailable';
  const d = await candles(s.sym);
  if (d && d.candles.length >= 30) {
    let done = false;
    if (d.candles.length >= 600 && mkt) {
      const i = d.candles.length - 1, ind = L.indicators(d.candles, mkt), Lr = L.learn(d.candles, ind, null, false), v = L.verdict(d.candles, ind, Lr, null, d.last, false), dist = Lr.v.mult * ind.atr[i], trig = L.buyTrigger(d.candles, ind, Lr);
      if (v.act) { plan = '  BUY WATCH (tested rule): buy ' + money(d.last) + ' to ' + money(d.last + 0.5 * ind.atr[i]) + ', stop ' + money(d.last - dist) + (Lr.v.tp ? ', target ' + money(d.last + Lr.v.tp * dist) : ', no fixed target'); done = true; }
      else if (Lr.proven && trig.price && trig.price / d.last < 1.15) { plan = '  Not yet (tested rule): buy only after a close above ~' + money(trig.price) + ', stop ~' + money(trig.price - dist) + (Lr.v.tp ? ', target ~' + money(trig.price + Lr.v.tp * dist) : ''); done = true; }
    }
    if (!done) { const r = L.refPlan(d.candles, d.last); if (r) plan = '  Reference plan (not tested): ' + (r.extended ? 'wait for a pullback, then buy ' : 'buy ') + money(r.lo) + ' to ' + money(r.hi) + ', stop ' + money(r.stop) + ', target ' + money(r.target); }
    plan = '  now ' + money(d.last) + '\n' + plan;
  }
  lines.push(s.sym + (nm ? ' ' + nm : '') + '\n  ' + s.tags.join(', ') + (bits.length ? '\n  ' + bits.join(', ') : '') + '\n' + plan + '\n  ' + L.HALAL_TEXT[L.halalOf(s.sym, null)]);
}
await telegram('TipRanks radar\nStocks on the most TipRanks lists today, with a price plan for each.\n\n' + lines.join('\n\n') + '\n\nData by TipRanks. Ratings are opinions, not tested signals. Not financial advice, not a halal ruling.' + (env.PAGE_URL ? '\n' + env.PAGE_URL : ''));
console.log('radar sent: ' + short.length + ' stocks');
