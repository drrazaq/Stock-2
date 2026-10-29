import {telegramFetch} from './telegram-delivery.mjs';
// PRE-MARKET CHECK (every trading day, about 8:40 New York = 3:40 pm Kuwait in summer, 4:40 pm in winter, before the open): one short message about the stocks YOU
// hold: their pre-market price, the change since yesterday's close, the distance to your stop, and a plain decision:
//   SELL (at the open, after the first 15 minutes): the pre-market price is at/under your stop, or last night's scan already said sell.
//   WATCH: within 3% of your stop.  HOLD: otherwise.
// Pre-market prices are thin (few trades, wide spreads, often reversed at the open), so the system never says "sell pre-market"; the
// decision is acted on in the regular session. Prices: Alpaca market-data snapshots (free IEX feed; the paper keys are enough).
// Read-only; places no orders. Sends one Telegram message.
import {isFreshPriceAge} from './ignition-gates.mjs';
import { snapshots } from './alpaca-feed.mjs';
import fs from 'node:fs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const money = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(2) : x.toFixed(4));
const pcs = (x) => x === null || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const AS = J('data/actions-sells.json', { sells: [] }), asell = Object.fromEntries((Date.now() - Date.parse(AS.at || 0) >= 0 && Date.now() - Date.parse(AS.at || 0) < 4 * 864e5 ? AS.sells : []).map(x => [x.sym, x.why]));
const P = J('data/my-positions.json', {}), SG = J('data/signals.json', {}), pv = Date.now()-Date.parse(SG.generatedAt)>=0&&Date.now()-Date.parse(SG.generatedAt)<4*864e5 ? (SG.posVerdict||{}) : {}, syms = Object.keys(P).filter(s => P[s] && P[s].entry);
if (!syms.length) { console.log('premarket: no positions'); process.exit(0); }
const ny = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
let snaps = {}, note = '';
if (env.ALPACA_KEY && env.ALPACA_SECRET) { try { const j = await snapshots(AD, syms, { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET } });
    if (j) snaps = j; else note = 'price feed refused'; } catch (e) { note = 'price feed unreachable'; } } else note = 'no Alpaca key in this workflow';
const last = {}; for (const x of SG.stocks || []) if (x.last) last[x.sym] = x.last;
const rows = { sell: [], watch: [], hold: [] };
for (const s of syms) { const p = P[s], sn = snaps[s] || {}, lt = sn.latestTrade, prevC = (sn.prevDailyBar && sn.prevDailyBar.c) || (sn.dailyBar && String(sn.dailyBar.t || '').slice(0, 10) < ny ? sn.dailyBar.c : null) || last[s] || null;
  const pre = lt && Number.isFinite(lt.p)&&lt.p>0&&isFreshPriceAge((Date.now()-Date.parse(lt.t))/60000)&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(lt.t))===ny ? lt.p : null, px = pre || prevC, stop = p.stop || null, chg = pre && prevC ? pre / prevC - 1 : null, toStop = px && stop ? px / stop - 1 : null;
  const tag = s + ' ' + (pre ? 'pre-market ' + money(pre) + ' (' + pcs(chg) + ' vs close)' : 'no pre-market trade yet, close ' + money(prevC)) + ', stop ' + (stop ? money(stop) + (toStop !== null ? ' (' + pcs(toStop) + ' away)' : '') : 'NOT SET') + ', you ' + pcs(px && p.entry ? px / p.entry - 1 : null);
  if (stop && pre && pre <= stop) rows.sell.push('- ' + tag + ': SELL at the open (after the first 15 minutes). The price is at or under your stop.');
  else if (asell[s]) rows.sell.push('- ' + tag + ': SELL today, as the last ACTIONS message said: ' + asell[s].replace(/^[A-Z.]+[^:]*: /, '').slice(0, 160));
  else if (pv[s] && !(/stop/i.test(pv[s]) && stop && px && px > stop)) rows.sell.push('- ' + tag + ': SELL today, as last night’s scan said: ' + pv[s].replace(/\.$/, '') + '.');
  else if (stop && pre && toStop < 0.03) rows.watch.push('- ' + tag + ': WATCH. Within 3% of your stop; your broker stop does the work.');
  else rows.hold.push('- ' + tag + (pre?': HOLD.':': PRICE UNVERIFIED; previous close is reference only. Check the broker before acting.'));  }
// (28 Oct) Kuwait time of 9:30 New York on that New York day: Kuwait is UTC+3 all year, New York moves on 1 Nov (never a fixed string)
const openKuwait = (d) => { const noon = new Date(d + 'T12:00:00Z'), h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(noon), k = 570 - (h - 12) * 60 + 180; return (Math.floor(k / 60) % 12 || 12) + ':' + String(k % 60).padStart(2, '0') + ' pm'; };
const msg = ['PRE-MARKET CHECK ' + ny + ' (your stocks, before the open: ' + openKuwait(ny) + ' Kuwait)' + (note ? ' [' + note + ']' : ''), '',
  ...(rows.sell.length ? ['SELL', ...rows.sell, ''] : ['SELL: nothing.', '']), ...(rows.watch.length ? ['WATCH', ...rows.watch, ''] : []), ...(rows.hold.length ? ['HOLD', ...rows.hold, ''] : []),
  'Do not trade in the pre-market itself (thin, wide spreads, often reversed at the open). Act in the regular session; keep every stop at your broker. After you sell, send  sold SYM PRICE .'];
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await telegramFetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n'), disable_web_page_preview: true }) }).catch(() => {});
