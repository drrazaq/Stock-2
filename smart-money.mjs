// SMART MONEY AND ANALYSTS. Once each market morning (Kuwait ~2:20 pm):
//   1. INSIDER BUYING (Finnhub, free): company executives buying their own stock on the open market in the last 14 days:
//      two or more buyers of 10,000 USD+ each (50,000 USD+ together), or 250,000 USD+ in total.
//   2. ANALYSTS TURNING POSITIVE (Finnhub recommendation trends, free): more analysts at Buy/Strong Buy than last month.
//   3. ANALYST UPGRADES (FMP, if the plan allows it): today's upgrades from named firms.
// Every name found is (a) added to the nightly scan, so a tested entry can turn it into a BUY with range and stop, and
// (b) logged as a tip of its source, so the bot scores "Insider buying", "Analyst upgrades" against the S&P 500 over time.
// On Sundays (or STUDY=1) it also TESTS insider buying on years of history: buy the next open after a cluster of insider
// purchases, hold 20 sessions, after costs, against the S&P 500 over the same days, older half vs newer half.
// Read-only. Never an order. Not a halal ruling.
import fs from 'node:fs';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const FMP = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const MV = local(env.MASSIVE_BASE) ? [local(env.MASSIVE_BASE)] : ['https://api.massive.com', 'https://api.polygon.io'];
const FAST = Boolean(local(env.FH_BASE));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const money = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (+x).toFixed(2);
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const big = (x) => x >= 1e6 ? (x / 1e6).toFixed(1) + 'M USD' : Math.round(x / 1e3) + 'K USD';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
fs.mkdirSync('data', { recursive: true });
if (!env.FINNHUB_KEY) { console.log('smart money: FINNHUB_KEY missing'); process.exit(0); }
const STUDY = Boolean(env.STUDY) || new Date().getUTCDay() === 0;

let fhLast = 0;
async function fh(path) {                       // free plan: 60 calls a minute
  for (let a = 0; a < 3; a++) {
    const wait = 1050 - (Date.now() - fhLast); if (wait > 0 && !FAST) await sleep(wait); fhLast = Date.now();
    try { const r = await fetch(FH + path + (path.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(env.FINNHUB_KEY));
      if (r.status === 429) { await sleep(FAST ? 5 : 30000); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(FAST ? 5 : 2000); }
  }
  return null;
}
let mvHost = 0;
async function mv(path) {
  if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(MV[mvHost] + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY));
      if (r.status === 429) { await sleep(FAST ? 5 : 5000); continue; } if (!r.ok) return null; return await r.json(); }
    catch (e) { if (mvHost + 1 < MV.length) mvHost++; else await sleep(FAST ? 5 : 1500); }
  }
  return null;
}

// ---- universe: liquid companies (price 5 USD+, 10M USD+ a day), strongest-traded first, plus your holdings and candidates
const co = read('data/companies.json', null), CS = co && co.syms && co.syms.length > 3000 ? new Set(co.syms) : null;
const last = new Map();
for (let k = 1; k < 8 && !last.size; k++) { const d = new Date(Date.now() - k * 86400000); if ([0, 6].includes(d.getUTCDay())) continue;
  const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + iso(+d) + '?adjusted=true'); for (const r of (j && j.results) || []) if (/^[A-Z]{1,5}$/.test(r.T)) last.set(r.T, r); }
const liquid = [...last.values()].filter(r => r.c >= 5 && r.c * r.v >= 1e7 && (!CS || CS.has(r.T))).sort((a, b) => b.c * b.v - a.c * a.v).map(r => r.T);
const extra = [...Object.keys(read('data/my-positions.json', {})), ...((read('data/discovery.json', {}).candidates || []).map(c => c.sym)), ...((read('data/radar-universe.json', {}).syms || []).map(x => x.sym))];
const MAXN = +(env.SM_MAX || 450);
const UNI = [...new Set([...extra, ...liquid])].filter(s => /^[A-Z]{1,5}$/.test(s)).slice(0, MAXN);
const px = (s) => last.get(s) ? last.get(s).c : null;
console.log('smart money universe:', UNI.length, 'stocks');

// ---- 1 + 2: insider buying and analyst trends
const today = iso(Date.now()), since14 = iso(Date.now() - 14 * 86400000), insiders = [], analysts = [];
for (const sym of UNI) {
  const ins = await fh('/stock/insider-transactions?symbol=' + sym + '&from=' + since14);
  const buys = ((ins && ins.data) || []).filter(t => t.transactionCode === 'P' && t.change > 0 && t.transactionPrice > 0 && (t.transactionDate || t.filingDate) >= since14);
  // count a buyer only if they put in 10,000 USD or more (small employee-plan purchases are not a signal)
  const per = {}; for (const b of buys) per[b.name] = (per[b.name] || 0) + b.change * b.transactionPrice;
  const real = buys.filter(b => per[b.name] >= 10000);
  if (real.length) { const who = new Set(real.map(b => b.name)), usd = real.reduce((a, b) => a + b.change * b.transactionPrice, 0);
    if ((who.size >= 2 && usd >= 50000) || usd >= 250000) insiders.push({ sym, n: who.size, usd, names: [...who].slice(0, 3), last: real.map(b => b.transactionDate || b.filingDate).sort().pop() }); }
  // analysts: real rating changes only (not new analysts starting coverage), stocks 5 USD+
  const rec = await fh('/stock/recommendation?symbol=' + sym);
  if (Array.isArray(rec) && rec.length >= 2) { const [a, b] = rec, pos = (x) => (x.strongBuy || 0) + (x.buy || 0), tot = (x) => pos(x) + (x.hold || 0) + (x.sell || 0) + (x.strongSell || 0);
    if ((px(sym) || 0) >= 5 && tot(a) >= 5 && tot(b) >= 5 && tot(a) - tot(b) <= 2 && pos(a) - pos(b) >= 2 && pos(a) / tot(a) >= 0.6) analysts.push({ sym, now: pos(a), was: pos(b), of: tot(a), period: a.period }); }
}
insiders.sort((p, q) => q.usd - p.usd); analysts.sort((p, q) => (q.now - q.was) - (p.now - p.was));

// ---- 3: FMP upgrades (only if the FMP plan allows this endpoint; otherwise skipped quietly)
let upgrades = [], fmpNote = '';
if (env.FMP_KEY) {
  try { const r = await fetch(FMP + '/stable/grades-latest-news?page=0&limit=100&apikey=' + encodeURIComponent(env.FMP_KEY));
    if (r.ok) { const j = await r.json(); const arr = Array.isArray(j) ? j : [];
      upgrades = arr.filter(x => x && /^[A-Z]{1,5}$/.test(x.symbol || '') && /upgrade/i.test(x.action || x.newsTitle || '') && String(x.publishedDate || '').slice(0, 10) >= iso(Date.now() - 3 * 86400000))
        .map(x => ({ sym: x.symbol, firm: x.gradingCompany || x.newsPublisher || '', to: x.newGrade || '', from: x.previousGrade || '' }));
      upgrades = upgrades.filter((u, i) => upgrades.findIndex(v => v.sym === u.sym) === i && px(u.sym)); }
    else fmpNote = 'FMP upgrades not available on this plan (HTTP ' + r.status + ').'; } catch (e) { fmpNote = 'FMP upgrades unreachable.'; }
}

// ---- hand the names to the nightly scan, and log each as a tip of its source (scored against the S&P 500)
const picks = [...new Set([...insiders.slice(0, 15).map(x => x.sym), ...analysts.slice(0, 10).map(x => x.sym), ...upgrades.slice(0, 10).map(x => x.sym)])];
fs.writeFileSync('data/smart-money.json', JSON.stringify({ generatedAt: new Date().toISOString(), insiders, analysts, upgrades, picks }, null, 1));
{ const TIPS = 'data/tips.jsonl', old = fs.existsSync(TIPS) ? fs.readFileSync(TIPS, 'utf8') : '', lines = [];
  const add = (sym, src) => { const p0 = px(sym); if (!p0 || old.includes('"sym":"' + sym + '","src":"' + src + '","d":"' + today)) return; lines.push(JSON.stringify({ sym, src, d: today, p0, below: null, ts: Date.now() })); };
  insiders.slice(0, 15).forEach(x => add(x.sym, 'Insider buying')); analysts.slice(0, 10).forEach(x => add(x.sym, 'Analysts turning positive')); upgrades.slice(0, 10).forEach(x => add(x.sym, 'Analyst upgrades'));
  if (lines.length) fs.appendFileSync(TIPS, lines.join('\n') + '\n'); }

// ---- 4: Sunday study: does buying after insider buying make money? (years of history, whole universe above)
let study = read('data/smart-money-study.json', null);
if (STUDY && env.MASSIVE_KEY) {
  const from5 = iso(Date.now() - (365 * 5 + 30) * 86400000), spyJ = await mv('/v2/aggs/ticker/SPY/range/1/day/' + from5 + '/' + today + '?adjusted=true&sort=asc&limit=50000');
  const spy = new Map(((spyJ && spyJ.results) || []).map(x => [iso(x.t), x.c])), trades = [];
  for (const sym of UNI.slice(0, +(env.SM_STUDY_MAX || 400))) {
    const ins = await fh('/stock/insider-transactions?symbol=' + sym + '&from=' + from5); const ev = ((ins && ins.data) || []).filter(t => t.transactionCode === 'P' && t.change > 0 && t.transactionPrice > 0);
    if (!ev.length) continue;
    const pj = await mv('/v2/aggs/ticker/' + sym + '/range/1/day/' + from5 + '/' + today + '?adjusted=true&sort=asc&limit=50000'); const c = ((pj && pj.results) || []).map(x => ({ d: iso(x.t), o: x.o, c: x.c })); if (c.length < 60) continue;
    // a "cluster": 2+ different insiders, or 250K USD+, within 14 days; the signal day is the FILING date (when the public knew)
    const byDay = ev.map(t => ({ d: String(t.filingDate || t.transactionDate).slice(0, 10), who: t.name, usd: t.change * t.transactionPrice })).sort((a, b) => a.d < b.d ? -1 : 1);
    let nextFree = '';
    for (let i = 0; i < byDay.length; i++) { const d0 = byDay[i].d; if (d0 <= nextFree) continue;
      const win0 = byDay.filter(x => x.d <= d0 && x.d >= iso(Date.parse(d0) - 14 * 86400000)), pw = {}; for (const x of win0) pw[x.who] = (pw[x.who] || 0) + x.usd;
      const win = win0.filter(x => pw[x.who] >= 10000), who = new Set(win.map(x => x.who)), usd = win.reduce((a, x) => a + x.usd, 0);
      if (!((who.size >= 2 && usd >= 50000) || usd >= 250000)) continue;
      const k = c.findIndex(x => x.d > d0); if (k < 0 || k + 20 >= c.length) continue;
      const entry = c[k].o, exit = c[k + 20].c, s0 = spy.get(c[k].d), s1 = spy.get(c[k + 20].d);
      trades.push({ sym, d: c[k].d, r: exit / entry - 1 - 0.008, spy: s0 && s1 ? s1 / s0 - 1 : null }); nextFree = c[k + 20].d; }
  }
  trades.sort((a, b) => a.d < b.d ? -1 : 1);
  const half = Math.floor(trades.length / 2), st = (a) => { if (!a.length) return { n: 0 }; const avg = a.reduce((x, t) => x + t.r, 0) / a.length, sp = a.filter(t => t.spy !== null);
    return { n: a.length, win: a.filter(t => t.r > 0).length / a.length, avg, spy: sp.length ? sp.reduce((x, t) => x + t.spy, 0) / sp.length : null }; };
  const older = st(trades.slice(0, half)), newer = st(trades.slice(half)), why = [];
  if (older.n < 30 || newer.n < 30) why.push('too few cases (' + older.n + ' older, ' + newer.n + ' newer; 30 each needed)');
  else { if (!(older.avg > 0)) why.push('lost money in the older half'); if (!(newer.avg > 0)) why.push('lost money in the newer half');
    if (newer.spy !== null && !(newer.avg > newer.spy)) why.push('no better than the S&P 500 over the same days'); }
  study = { at: today, older, newer, verdict: why.length ? 'NOT PROVEN' : 'PROMISING', why: why.join('; ') || 'beat costs and the S&P 500 in both halves. Paper only until its live record also passes.' };
  fs.writeFileSync('data/smart-money-study.json', JSON.stringify(study, null, 1));
}

// ---- message
const line = (s) => !s || !s.n ? 'no cases' : s.n + ' cases, ' + Math.round(s.win * 100) + '% up, average ' + pc(s.avg) + ' after 0.8% costs' + (s.spy !== null ? ' (S&P 500 ' + pc(s.spy) + ' over the same days)' : '');
const msg = ['SMART MONEY AND ANALYSTS, ' + today, 'Checked ' + UNI.length + ' liquid companies.', ''];
msg.push('INSIDER BUYING (executives buying their own shares, last 14 days)');
if (insiders.length) for (const x of insiders.slice(0, 10)) msg.push(x.sym + ' ' + money(px(x.sym)) + ' | ' + x.n + ' insider' + (x.n > 1 ? 's' : '') + ' bought ' + big(x.usd) + ' | latest ' + x.last + ' | ' + x.names.join(', ').slice(0, 60));
else msg.push('None found.');
msg.push('', 'ANALYSTS TURNING POSITIVE (more Buy ratings than last month)');
if (analysts.length) for (const x of analysts.slice(0, 8)) msg.push(x.sym + ' ' + money(px(x.sym)) + ' | Buy ratings ' + x.was + ' -> ' + x.now + ' of ' + x.of);
else msg.push('None found.');
if (env.FMP_KEY && !fmpNote) { msg.push('', 'ANALYST UPGRADES (last 3 days)'); if (upgrades.length) for (const x of upgrades.slice(0, 8)) msg.push(x.sym + ' ' + money(px(x.sym)) + ' | ' + x.firm + (x.from || x.to ? ': ' + (x.from || '?') + ' -> ' + (x.to || '?') : '')); else msg.push('None found.'); }
msg.push('', 'WHAT HAPPENS NEXT: all of these are added to tonight’s scan. If one also has a tested entry, it appears in the PLAN as a BUY with range and stop. Each source is scored against the S&P 500 (send: sources).');
if (study) msg.push('', 'HISTORY TEST (' + study.at + '): buying the next open after insider buying, holding 20 sessions', '  older half: ' + line(study.older), '  newer half: ' + line(study.newer), '  ' + study.verdict + ': ' + study.why);
msg.push('', 'Insiders sell for many reasons; buying with their own money is the rarer, stronger signal. Not an order, not a halal ruling: check ZAD.');
const text = msg.join('\n');
if (env.TG_TOKEN && env.TG_CHAT) for (let i = 0; i < text.length; i += 3800) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(i, i + 3800), disable_web_page_preview: true }) }).catch(() => {});
console.log(text);
