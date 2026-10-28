// DAILY OPPORTUNITY RADAR runner (rules and wording in radar-v3-core.mjs). Research and routing only; never places an order.
//   node opportunity-radar.mjs midday   called by ignition-watch.mjs at about 11:15 New York, after it writes data/radar-v3-snap.json
//   node opportunity-radar.mjs close    .github/workflows/opportunity-radar.yml after the watcher has saved the day (scores 5-session rows too)
// Off with  radar off  (data/settings.json radar: false). The quiet / opportunitiesOnly / focus switches are NOT read here: this one
// message is the owner's chosen exception (28 Oct 2026), and every unproven line in it says NOT AN APPROVED BUY.
import fs from 'node:fs';
import { radarOn, buildMidday, buildClose, halalMap, netOf } from './radar-v3-core.mjs';
import { scorecardText } from './early-alerts.mjs';
const env = process.env, MODE = process.argv[2] || 'close', LEDGER = 'data/radar-v3-ledger.jsonl';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org';
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const readLines = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
const nyDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
async function telegram(text) {
  if (!env.TG_TOKEN || !env.TG_CHAT) { console.log('[radar]\n' + text); return; }
  const parts = []; let cur = ''; for (const l of text.split('\n')) { if ((cur + l).length > 3800) { parts.push(cur); cur = ''; } cur += l + '\n'; } if (cur) parts.push(cur);
  for (const p of parts) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: p, disable_web_page_preview: true }) }).catch(e => console.log('telegram: ' + e.message));
}
function context() {
  const events = {}; for (const e of ((readJson('data/events-recent.json') || {}).events || [])) (events[e.sym] || (events[e.sym] = [])).push(e);
  return { halal: halalMap(readJson('data/zad-list.json'), readJson('data/halal.json', {}), Date.now()), events, lottery: (readJson('data/signals.json') || {}).lottery || {},
    record: (readJson('data/ignition-results.json') || {}).record || {}, lab: (readJson('data/ignition-lab.json') || {}).rules || {} };
}
// 5-session scores from Alpaca daily bars (SIP, IEX if the plan refuses SIP); SPY is the yardstick
async function score5(ledger, today) {
  const done = new Set(ledger.filter(r => r.type === 's5').map(r => r.d + '|' + r.sym + '|' + r.panel)), todo = ledger.filter(r => r.type === 'list' && r.d < today && !done.has(r.d + '|' + r.sym + '|' + r.panel));
  if (!todo.length || !env.ALPACA_KEY || !env.ALPACA_SECRET) return [];
  const start = todo.map(r => r.d).sort()[0], syms = [...new Set([...todo.map(r => r.sym), 'SPY'])], H = { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET } }, bars = {};
  for (const feed of ['sip', 'iex']) { let tok = '', ok = true;
    do { const r = await fetch('https://data.alpaca.markets/v2/stocks/bars?symbols=' + syms.map(encodeURIComponent).join(',') + '&timeframe=1Day&start=' + start + '&end=' + today + '&adjustment=raw&feed=' + feed + '&limit=10000' + (tok ? '&page_token=' + tok : ''), H).catch(() => null);
      if (!r || !r.ok) { ok = false; break; } const j = await r.json(); for (const [s, b] of Object.entries(j.bars || {})) (bars[s] || (bars[s] = [])).push(...b.map(x => ({ d: String(x.t).slice(0, 10), c: x.c }))); tok = j.next_page_token || ''; } while (tok);
    if (ok) break; for (const k of Object.keys(bars)) delete bars[k]; }
  const out = [], spy = bars.SPY || [];
  for (const r of todo) { const b = (bars[r.sym] || []).filter(x => x.d > r.d), s0 = spy.find(x => x.d === r.d), s5 = spy.filter(x => x.d > r.d)[4];
    if (b.length < 5) continue; const px5 = b[4].c; out.push({ type: 's5', d: r.d, sym: r.sym, panel: r.panel, px5, net: netOf(r.px, px5), spy: s0 && s5 ? +(s5.c / s0.c - 1).toFixed(4) : null }); }
  return out;
}

const ST = readJson('data/settings.json', {});
if (!radarOn(ST)) { console.log('radar: off (radar on to switch it back)'); process.exit(0); }
const today = nyDay(), ctx = context();
if (MODE === 'midday') {
  const snap = readJson('data/radar-v3-snap.json');
  if (!snap || snap.day !== today) { console.log('radar midday: no snapshot for ' + today); process.exit(0); }
  const r = buildMidday(snap, ctx);
  if (r.rows.length) fs.appendFileSync(LEDGER, r.rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  await telegram(r.text); console.log('radar midday: ' + r.rows.length + ' lines listed');
} else {
  let ledger = readLines(LEDGER); const s5 = await score5(ledger, today);
  if (s5.length) { fs.appendFileSync(LEDGER, s5.map(x => JSON.stringify(x)).join('\n') + '\n'); ledger = ledger.concat(s5); }
  const od = readLines('data/opp-days.jsonl').filter(x => x.day === today).pop();   // DELIVERY SCORECARD from the live watcher (early-alerts.mjs)
  const SRp = readJson('data/shadow-report.json'), pc = (x) => (x === null || x === undefined ? '?' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%');   // Phase 1 shadow test (shadow-outcomes.mjs runs just before)
  const shadowLine = SRp ? 'FILTER SHADOW TEST: ' + SRp.shadowSessions + ' session' + (SRp.shadowSessions === 1 ? '' : 's') + ' collected (verdicts after 10). ' + (SRp.alerts5d && SRp.alerts5d.delivered.n ? 'Alerts after 5 sessions, net: delivered ' + SRp.alerts5d.delivered.n + ' avg ' + pc(SRp.alerts5d.delivered.avg) + ' (median ' + pc(SRp.alerts5d.delivered.median) + '); eligible not delivered ' + SRp.alerts5d.notDelivered.n + ' avg ' + pc(SRp.alerts5d.notDelivered.avg) + '.' : 'No alert has 5 sessions yet.') : '';
  await telegram(buildClose(today, readJson('data/ignition-live.json'), ledger, ctx) + '\n\n' + scorecardText(od) + (shadowLine ? '\n' + shadowLine : '')); console.log('radar close: ' + s5.length + ' 5-session scores added');
}
