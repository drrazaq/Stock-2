// Whole-market intraday early-wave radar for Stock-2.
// Research-only: no broker access, no order execution, no guaranteed outcome.
// Writes data/intraday-radar.json and append-only paper/missed logs.
import fs from 'node:fs';

const env = process.env;
const MASSIVE = env.MASSIVE_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.MASSIVE_BASE) ? env.MASSIVE_BASE : 'https://api.massive.com';
const FH = env.FH_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.FH_BASE) ? env.FH_BASE : 'https://finnhub.io/api/v1';
const TG = env.TG_BASE && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(env.TG_BASE) ? env.TG_BASE : 'https://api.telegram.org';
if (!env.MASSIVE_KEY) { console.error('Missing MASSIVE_KEY'); process.exit(1); }
fs.mkdirSync('data', { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const write = (f, x) => fs.writeFileSync(f, JSON.stringify(x, null, 1));
const ny = ms => { const p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value); return { d: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' }; };
const now = Date.now(), n = ny(now), marketOpen = !n.weekend && n.mins >= 570 && n.mins < 960;
if (!marketOpen && !env.FORCE) { console.log('Market closed; radar skipped.'); process.exit(0); }
const num = x => Number.isFinite(+x) ? +x : null;
const money = x => Number.isFinite(x) ? x.toFixed(2) : 'n/a';
const pct = x => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.status === 429) { await sleep(5000 * (i + 1)); continue; } return { status: r.status, json: await r.json().catch(() => ({})) }; }
    catch (e) { if (i === 2) return { status: 0, json: {} }; await sleep(1500); }
  }
  return { status: 0, json: {} };
}
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) return;
  await fetch(`${TG}/bot${env.TG_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: text.slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
}
const snap = await get(`${MASSIVE}/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false&apiKey=${encodeURIComponent(env.MASSIVE_KEY)}`);
if (snap.status === 401 || snap.status === 403 || snap.status === 404) { const was = read('data/intraday-radar.json', {}); if (was.status === 'UNAVAILABLE' && was.session === n.d) { console.log('UNAVAILABLE again today; nothing written'); process.exit(0); } await telegram('WHOLE-MARKET LIVE RADAR: NOT AVAILABLE\nThe data provider answered HTTP ' + snap.status + ' to the live whole-market request, so this key\u2019s plan does not include it. Send this message to Claude. The rest of the system is not affected.'); write('data/intraday-radar.json', { generatedAt: new Date(now).toISOString(), session: n.d, status: 'UNAVAILABLE', reason: `Massive snapshot endpoint returned HTTP ${snap.status}`, candidates: [] }); console.log('UNAVAILABLE: snapshot endpoint not on current plan'); process.exit(0); }
const tickers = Array.isArray(snap.json?.tickers) ? snap.json.tickers : [];
if (!tickers.length) { write('data/intraday-radar.json', { generatedAt: new Date(now).toISOString(), session: n.d, status: 'NO_DATA', candidates: [] }); console.log('NO_DATA: no snapshot tickers'); process.exit(0); }
const hard = /\b(pric(es|ed|ing)|announc(es|ed|ing)|launch(es|ed|ing)?|propos(es|ed)|commenc(es|ed|ing)|clos(es|ed|ing)|files? for|plans?)\b[^.]{0,70}\b((public|follow-on|underwritten|registered direct|secondary) offering|offering of (common |ordinary )?(stock|shares|ADSs)|private placement|convertible (senior )?notes)|\bregistered direct\b|\bsecondary offering\b|at-the-market (offering|program|facility)|\bATM (offering|program|facility)\b|\b(share|stock|equity) offering\b|reverse (stock )?split|trading halt|\bhalted\b|bankruptcy|chapter 11|going[- ]concern|delist|\b(SEC|DOJ)\b[^.]{0,40}(investigat|probe|subpoena)|complete response letter|FDA (rejects|rejection|declines)|clinical hold/i;
const candidates = [];
for (const t of tickers) {
  const sym = String(t.ticker || ''); if (!/^[A-Z]{1,5}$/.test(sym)) continue;
  const day = t.day || {}, prev = t.prevDay || {}, price = num(day.c) ?? num(t.lastTrade?.p), open = num(day.o), high = num(day.h), low = num(day.l), vol = num(day.v), prevClose = num(prev.c);
  if (!(price > 0 && prevClose > 0 && vol > 0)) continue;
  const change = price / prevClose - 1, dollarVol = price * vol, range = high && low ? Math.max(high - low, price * 0.005) : price * 0.01, pos = high && low ? (price - low) / Math.max(high - low, 1e-9) : 0.5;
  if (price < +(env.RADAR_MIN_PRICE || 0.50) || price > +(env.RADAR_MAX_PRICE || 250) || dollarVol < +(env.RADAR_MIN_DOLLAR_VOLUME || 1000000) || change < 0.02 || change > 0.35) continue;
  const extended = pos > 0.92 || change > 0.18;
  const score = Math.round(Math.min(100, 35 + Math.min(change * 100, 20) + Math.min(Math.log10(Math.max(dollarVol, 1)) - 6, 4) * 8 + pos * 20 - (extended ? 25 : 0)));
  candidates.push({ sym, price, open, high, low, volume: vol, dollarVolume: Math.round(dollarVol), change, range, rangePosition: pos, score, extended });
}
candidates.sort((a, b) => b.score - a.score);
const shortlist = candidates.slice(0, 30);
const verified = [];
for (const c of shortlist) {
  let catalyst = { status: 'NOT_CHECKED', headline: null, hardBlock: false };
  if (env.FINNHUB_KEY) {
    const from = new Date(now - 48 * 3600000).toISOString().slice(0, 10), to = n.d;
    const r = await get(`${FH}/company-news?symbol=${c.sym}&from=${from}&to=${to}&token=${encodeURIComponent(env.FINNHUB_KEY)}`);
    const hs = Array.isArray(r.json) ? r.json.map(x => String(x.headline || '')).filter(Boolean) : [];
    const hit = hs.find(h => hard.test(h));
    catalyst = { status: hit ? 'BLOCKED' : hs.length ? 'FOUND' : 'UNEXPLAINED', headline: (hit || hs[0] || null)?.slice(0, 180) || null, hardBlock: Boolean(hit) };
    await sleep(800);
  }
  const blocked = catalyst.hardBlock;
  const verdict = blocked ? 'BLOCKED' : c.extended ? 'EXTENDED_DO_NOT_CHASE' : catalyst.status === 'FOUND' ? 'EARLY_WAVE_REVIEW' : 'EARLY_WAVE_UNVERIFIED';
  const risk = +(c.range * 1.2).toFixed(2), entryLo = +(c.price - 0.25 * c.range).toFixed(2), entryHi = +(c.price + 0.10 * c.range).toFixed(2), stop = +(c.price - risk).toFixed(2), target1 = +(c.price + 1.5 * risk).toFixed(2), target2 = +(c.price + 2.5 * risk).toFixed(2);
  verified.push({ ...c, verdict, catalyst, entry: verdict.includes('EARLY_WAVE') ? { lo: Math.max(0.01, entryLo), hi: entryHi } : null, stop: verdict.includes('EARLY_WAVE') ? Math.max(0.01, stop) : null, targets: verdict.includes('EARLY_WAVE') ? [target1, target2] : [], generatedAt: new Date(now).toISOString() });
}
const prior = read('data/intraday-radar.json', {}), priorSyms = new Set((prior.candidates || []).map(x => x.sym));
const fresh = verified.filter(x => !priorSyms.has(x.sym) && x.verdict === 'EARLY_WAVE_REVIEW');
const missed = verified.filter(x => x.change >= 0.10 && !priorSyms.has(x.sym)).map(x => ({ sym: x.sym, price: x.price, change: x.change, seenAt: new Date(now).toISOString(), reason: 'first seen after a large move' }));
for (const x of missed) fs.appendFileSync('data/intraday-missed.jsonl', JSON.stringify(x) + '\n');
for (const x of fresh) fs.appendFileSync('data/intraday-paper.jsonl', JSON.stringify({ sym: x.sym, seenAt: x.generatedAt, entry: x.entry, stop: x.stop, targets: x.targets, verdict: x.verdict }) + '\n');
const out = { generatedAt: new Date(now).toISOString(), session: n.d, status: 'OK', universe: tickers.length, scanned: candidates.length, candidates: verified.slice(0, 20), freshCount: fresh.length, missedCount: missed.length, note: 'Research radar only. A candidate is not a validated buy until the existing tested daily rule and manual risk checks agree.' };
write('data/intraday-radar.json', out);
const lines = fresh.slice(0, 5).map(x => `${x.sym} ${money(x.price)} (${pct(x.change)} today)\n  news: ${x.catalyst.headline || 'none found'}\n  reference levels, NOT tested: range ${money(x.entry.lo)}-${money(x.entry.hi)}, stop ${money(x.stop)}, markers ${x.targets.map(money).join(' and ')}`);
if (lines.length) await telegram(`WHOLE-MARKET LIVE RADAR: moving now, with news\n${lines.join('\n\n')}\n\nThese are stocks to look at, not buy signals. This rule has no past test yet; each one is recorded on paper so it can be measured. Tonight\u2019s scan checks them with the tested rules. Not financial advice.`);
console.log(`intraday radar: ${tickers.length} universe, ${candidates.length} movers, ${fresh.length} fresh review candidates, ${missed.length} missed-mover records`);
