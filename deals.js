// DEALS AND NEW LISTINGS. One message each market morning (Kuwait ~3 pm, before the open):
//   1. UPCOMING IPOs (next 14 days): companies about to join the US market, with date, price range and deal size.
//   2. RECENT IPOs (last 120 days): how each has done since listing, and which are building a base above their IPO price.
//      Those are followed on paper for 20 sessions, so the system learns whether "new listing holding up" makes money.
//   3. MERGERS AND DEALS (last 2 days): takeover and merger headlines, marking the company being bought.
// Sources: Finnhub (IPO calendar, merger news, profiles, free) and Massive (daily prices). Read-only. Never an order.
import fs from 'node:fs';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const MV = local(env.MASSIVE_BASE) ? [local(env.MASSIVE_BASE)] : ['https://api.massive.com', 'https://api.polygon.io'];
const FAST = Boolean(local(env.FH_BASE));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const money = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (+x).toFixed(2);
const pc = (x) => x === null || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const big = (x) => !x ? '' : x >= 1e9 ? (x / 1e9).toFixed(1) + 'B USD' : (x / 1e6).toFixed(0) + 'M USD';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
fs.mkdirSync('data', { recursive: true });
if (!env.FINNHUB_KEY) { console.log('deals: FINNHUB_KEY missing'); process.exit(0); }

let fhLast = 0;
async function fh(path) {
  for (let a = 0; a < 3; a++) {
    const wait = 1100 - (Date.now() - fhLast); if (wait > 0 && !FAST) await sleep(wait); fhLast = Date.now();
    try { const r = await fetch(FH + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(env.FINNHUB_KEY));
      if (r.status === 429) { await sleep(FAST ? 5 : 30000); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(FAST ? 5 : 2000); }
  }
  return null;
}
let mvHost = 0;
async function daily(sym, fromMs) {
  if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(MV[mvHost] + '/v2/aggs/ticker/' + sym + '/range/1/day/' + iso(fromMs) + '/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=5000&apiKey=' + encodeURIComponent(env.MASSIVE_KEY));
      if (r.status === 429) { await sleep(FAST ? 5 : 15000); continue; } if (!r.ok) return null; const j = await r.json();
      return (j.results || []).map(x => ({ d: iso(x.t), o: x.o, h: x.h, l: x.l, c: x.c, v: x.v })); }
    catch (e) { if (mvHost + 1 < MV.length) mvHost++; else await sleep(FAST ? 5 : 2000); }
  }
  return null;
}
const isShell = (name) => /acquisition|blank check|capital corp\.? ?(i|ii|iii|iv|v)?$|\bspac\b|merger corp|holdings? corp\.? ?(i|ii|iii|iv)$/i.test(name || '');   // SPACs: not operating companies
const today = iso(Date.now());

// ---- 1 + 2. IPO calendar: next 14 days, and the last 120 days
const cal = await fh('/calendar/ipo?from=' + iso(Date.now() - 120 * 86400000) + '&to=' + iso(Date.now() + 14 * 86400000));
const ipos = ((cal && cal.ipoCalendar) || []).filter(x => x && x.name && /nasdaq|nyse/i.test(x.exchange || ''));
const upcoming = ipos.filter(x => x.date >= today && !/withdrawn/i.test(x.status || '')).sort((a, b) => a.date < b.date ? -1 : 1);
const recent = ipos.filter(x => x.date < today && /priced/i.test(x.status || '') && x.symbol && /^[A-Z]{1,5}$/.test(x.symbol) && !isShell(x.name));

const rows = [];
for (const x of recent.slice(0, 60)) {
  const c = await daily(x.symbol, Date.parse(x.date) - 3 * 86400000); if (!c || c.length < 3) continue;
  const ipoPx = parseFloat(String(x.price || '').split('-').pop()) || null, last = c[c.length - 1], hi = Math.max(...c.map(k => k.h)), first = c[0];
  const n = c.length, avg20 = n >= 20 ? c.slice(-20).reduce((a, k) => a + k.c, 0) / 20 : null, dv = c.slice(-10).reduce((a, k) => a + k.c * k.v, 0) / Math.min(10, n);
  // BUILDING A BASE: listed 15+ sessions, above its IPO price, within 12% of its post-listing high, above its 20 day average
  // (when known), price 5 USD+, 5M USD a day traded. That is the "new listing holding up" pattern, followed on paper.
  const base = n >= 15 && ipoPx && last.c > ipoPx && last.c >= hi * 0.88 && (!avg20 || last.c > avg20) && last.c >= 5 && dv >= 5e6;
  rows.push({ sym: x.symbol, name: String(x.name).slice(0, 40), date: x.date, ipoPx, first: first.o, last: last.c, d: last.d, hi, n, dv, base, vsIpo: ipoPx ? last.c / ipoPx - 1 : null, offHi: last.c / hi - 1 });
}

// ---- paper record of "building a base" picks, judged 20 sessions after they were first flagged
const PAPER = 'data/ipo-paper.json', P = read(PAPER, { open: [], done: [] });
for (const r of rows.filter(r => r.base)) if (!P.open.some(p => p.sym === r.sym) && !P.done.some(p => p.sym === r.sym)) P.open.push({ sym: r.sym, flagged: r.d, price: r.last });
for (const p of [...P.open]) {
  const c = await daily(p.sym, Date.parse(p.flagged) - 86400000); if (!c) continue;
  const k = c.findIndex(x => x.d > p.flagged); if (k < 0) continue;
  const entry = c[k].o, after = c.slice(k);
  // a 10% stop below the entry, or out at the close 20 sessions later
  let exit = null, why = null; for (let j = 0; j < after.length && j < 20; j++) { if (after[j].l <= entry * 0.9) { exit = Math.min(after[j].o, entry * 0.9); why = 'stop'; break; } if (j === 19) { exit = after[j].c; why = 'time'; } }
  if (exit !== null) { P.done.push({ ...p, entry, exit, why, pct: +(exit / entry - 1 - 0.004).toFixed(4) }); P.open = P.open.filter(z => z !== p); }
}
fs.writeFileSync(PAPER, JSON.stringify(P, null, 1));
const done = P.done, rec = done.length ? done.length + ' finished, ' + Math.round(done.filter(x => x.pct > 0).length / done.length * 100) + '% won, average ' + pc(done.reduce((a, x) => a + x.pct, 0) / done.length) + ' after costs' : 'no finished paper trade yet';

// ---- 3. Mergers and deals, last 2 days
const news = (await fh('/news?category=merger')) || [];
const TARGET = /to be acquired|agrees? to be (acquired|bought)|acquired by|to sell itself|take[- ]private|tender offer for|buyout of|definitive agreement to be/i;
const deals = news.filter(n => n && n.headline && Date.now() - n.datetime * 1000 < 2 * 86400000).slice(0, 40).map(n => {
  const rel = String(n.related || '').split(',').map(s => s.trim()).filter(s => /^[A-Z]{1,5}$/.test(s));
  return { h: String(n.headline).slice(0, 140), rel, target: TARGET.test(n.headline), src: n.source || '' };
}).filter(d => d.rel.length);
const seen = new Set(), dealLines = [];
for (const d of deals.sort((a, b) => b.target - a.target)) { const k = d.rel.join(','); if (seen.has(k)) continue; seen.add(k); dealLines.push((d.target ? 'BEING BOUGHT: ' : '') + d.rel.join(', ') + ': ' + d.h); if (dealLines.length >= 8) break; }

// ---- message
const msg = ['DEALS AND NEW LISTINGS, ' + today, ''];
msg.push('UPCOMING IPOs (next 14 days)');
if (upcoming.length) for (const x of upcoming.slice(0, 10)) msg.push(x.date + '  ' + (x.symbol || '?') + '  ' + String(x.name).slice(0, 40) + (x.price ? ' | price ' + x.price + ' USD' : '') + (x.totalSharesValue ? ' | raising ' + big(x.totalSharesValue) : '') + (isShell(x.name) ? ' | SPAC (blank check), not an operating company' : ''));
else msg.push('None listed on Nasdaq or NYSE.');
msg.push('First days after an IPO swing wildly. The system does not buy on day one; it watches whether the stock holds above its IPO price.', '');
const b = rows.filter(r => r.base).sort((p, q) => q.dv - p.dv);
msg.push('RECENT IPOs HOLDING UP (building a base above the IPO price)');
if (b.length) for (const r of b.slice(0, 8)) msg.push(r.sym + ' ' + money(r.last) + ' | listed ' + r.date + ' at ' + money(r.ipoPx) + ' (' + pc(r.vsIpo) + ' since) | ' + pc(r.offHi) + ' from its high ' + money(r.hi) + ' | ' + r.n + ' sessions');
else msg.push('None right now.');
msg.push('Paper record of this pattern (buy next open, 10% stop, out after 20 sessions): ' + rec + '. It becomes a BUY only after 30+ paper trades with a profit.', '');
const weak = rows.filter(r => r.vsIpo !== null && r.vsIpo < -0.2).sort((p, q) => p.vsIpo - q.vsIpo).slice(0, 4);
if (weak.length) msg.push('RECENT IPOs FAILING (20%+ under the IPO price, avoid): ' + weak.map(r => r.sym + ' ' + pc(r.vsIpo)).join(', '), '');
msg.push('MERGERS AND DEALS (last 2 days)');
if (dealLines.length) msg.push(...dealLines); else msg.push('No new deal headlines on US stocks.');
msg.push('A company being bought usually jumps to just under the offer price at once. Buying after that earns only a small gap and loses heavily if the deal breaks. Not a buy signal.');
msg.push('', 'Check every company in ZAD. Research only, not an order. Not financial advice, not a halal ruling.');
fs.writeFileSync('data/deals.json', JSON.stringify({ generatedAt: new Date().toISOString(), upcoming: upcoming.slice(0, 20), recent: rows, deals }, null, 1));
const text = msg.join('\n');
if (env.TG_TOKEN && env.TG_CHAT) for (let i = 0; i < text.length; i += 3800) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(i, i + 3800), disable_web_page_preview: true }) }).catch(() => {});
console.log(text);
