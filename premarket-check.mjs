// PRE-MARKET CHECK (every trading day, about 8:40 New York = 3:40 pm Kuwait in summer, 4:40 pm in winter, before the open): one short message about the stocks YOU
// hold: their pre-market price, the change since yesterday's close, the distance to your stop, and a plain decision:
//   SELL (at the open, after the first 15 minutes): the pre-market price is at/under your stop, or last night's scan already said sell.
//   WATCH: within 3% of your stop.  HOLD: otherwise.
// Pre-market prices are thin (few trades, wide spreads, often reversed at the open), so the system never says "sell pre-market"; the
// decision is acted on in the regular session. Prices: Alpaca market-data snapshots (SIP first, IEX after a SIP 403); the message names the feed
// of the response actually used and each trade's own New York time (1 Nov: dates are New York dates, never UTC slices).
// Read-only; places no orders. Sends one Telegram message.
import { snapshots, snapshotFeed } from './alpaca-feed.mjs';
import fs from 'node:fs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const money = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(2) : x.toFixed(4));
const pcs = (x) => x === null || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const AS = J('data/actions-sells.json', { sells: [] }), asell = Object.fromEntries((Date.now() - Date.parse(AS.at || 0) < 4 * 864e5 ? AS.sells : []).map(x => [x.sym, x.why]));
const P = J('data/my-positions.json', {}), SG = J('data/signals.json', {}), pv = SG.posVerdict || {}, syms = Object.keys(P).filter(s => P[s] && P[s].entry);
if (!syms.length) { console.log('premarket: no positions'); process.exit(0); }
const nyDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d), ny = nyDate(new Date());
// A provider clock counts only if it is a real instant; an after-hours trade at 7:30 pm New York is 00:30 UTC the next day in winter.
const at = (x) => { const ms = typeof x === 'string' ? Date.parse(x) : NaN; return Number.isFinite(ms) && ms <= Date.now() ? new Date(ms) : null; };
let snaps = {}, note = '', feed = null;
if (env.ALPACA_KEY && env.ALPACA_SECRET) { try { const j = await snapshots(AD, syms, { headers: { 'APCA-API-KEY-ID': env.ALPACA_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_SECRET } });
    if (j) { snaps = j; feed = snapshotFeed(j); } else note = 'price feed refused'; } catch (e) { note = 'price feed unreachable'; } } else note = 'no Alpaca key in this workflow';
const last = {}; for (const x of SG.stocks || []) if (x.last) last[x.sym] = x.last;
// (1 Nov) Decisions are production's, unchanged: px = today's pre-market trade, else the last close; at or under the stop -> SELL at the
// open; ACTIONS and last-night-scan SELLs; within 3% of the stop -> WATCH; else HOLD (also HOLD when no price exists, as before).
// What is added is evidence on every line: the price basis, its source, its timestamp and its exact age. No freshness cut-off is applied
// and no price is called current or fit for an entry: no freshness contract for this message has been approved.
//   PREMARKET_TRADE  a trade on today's New York date (an after-hours trade from yesterday evening is NOT today's, even if UTC says so)
//   PRIOR_CLOSE      no trade today; the last session's close (snapshot previous-day bar, or last night's scan)
//   NONE             no price at all
const age = (ms) => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ' h ' : '') + (h || m ? m + ' min ' : '') + r + ' s'; };
const nySecond = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(d);
const rows = { sell: [], watch: [], hold: [] };
for (const s of syms) { const p = P[s], sn = snaps[s] || {}, lt = sn.latestTrade, pbAt = sn.prevDailyBar && at(sn.prevDailyBar.t), dbAt = sn.dailyBar && at(sn.dailyBar.t);
  const fromPrev = sn.prevDailyBar && sn.prevDailyBar.c ? sn.prevDailyBar.c : null, fromDaily = !fromPrev && dbAt && nyDate(dbAt) < ny && sn.dailyBar.c ? sn.dailyBar.c : null, fromScan = !fromPrev && !fromDaily && last[s] ? last[s] : null;
  const prevC = fromPrev || fromDaily || fromScan || null, feedName = feed ? feed.toUpperCase() : 'unknown feed';
  const closeSrc = fromPrev ? feedName + ' snapshot previous-day bar' + (pbAt ? ', session ' + nyDate(pbAt) : ', session date not given') : fromDaily ? feedName + ' snapshot daily bar, session ' + nyDate(dbAt) : fromScan ? 'last night\u2019s scan' + (SG.session ? ', session ' + SG.session : '') : null;
  const ltAt = lt && lt.p > 0 ? at(lt.t) : null, pre = ltAt && nyDate(ltAt) === ny ? lt.p : null;
  const basis = pre ? 'PREMARKET_TRADE' : prevC ? 'PRIOR_CLOSE' : 'NONE';
  const px = pre || prevC, stop = p.stop || null, chg = pre && prevC ? pre / prevC - 1 : null, toStop = px && stop ? px / stop - 1 : null;
  const priceText = basis === 'PREMARKET_TRADE' ? 'pre-market trade ' + money(pre) + ' (' + feedName + ', ' + nySecond(ltAt) + ' NY, age ' + age(Date.now() - ltAt) + '; ' + pcs(chg) + ' vs close)'
    : basis === 'PRIOR_CLOSE' ? 'no pre-market trade today; prior close ' + money(prevC) + ' (' + closeSrc + ')' : 'no price available' + (note ? ' (' + note + ')' : '');
  const tag = s + ' ' + priceText + ', stop ' + (stop ? money(stop) + (toStop !== null ? ' (' + pcs(toStop) + ' away)' : '') : 'NOT SET') + ', you ' + pcs(px && p.entry ? px / p.entry - 1 : null);
  const on = basis === 'PREMARKET_TRADE' ? ' Based on the pre-market trade above.' : basis === 'PRIOR_CLOSE' ? ' Based on the prior close, not on a price from today.' : ' No price: this is the default, not an assessment.';
  if (stop && px && px <= stop) rows.sell.push('- ' + tag + ': SELL at the open (after the first 15 minutes). ' + (basis === 'PREMARKET_TRADE' ? 'The pre-market trade is at or under your stop.' : 'PRIOR-CLOSE INSTRUCTION: the prior close is at or under your stop (no price from today).'));
  else if (asell[s]) rows.sell.push('- ' + tag + ': SELL today, as the last ACTIONS message said: ' + asell[s].replace(/^[A-Z.]+[^:]*: /, '').slice(0, 160));
  else if (pv[s] && !(/stop/i.test(pv[s]) && stop && px && px > stop)) rows.sell.push('- ' + tag + ': SELL today, as last night\u2019s scan said: ' + pv[s].replace(/\.$/, '') + '.');
  else if (stop && px && toStop < 0.03) rows.watch.push('- ' + tag + ': WATCH. Within 3% of your stop; your broker stop does the work.' + on);
  else rows.hold.push('- ' + tag + ': HOLD.' + on); }
// (28 Oct) Kuwait time of 9:30 New York on that New York day: Kuwait is UTC+3 all year, New York moves on 1 Nov (never a fixed string)
const openKuwait = (d) => { const noon = new Date(d + 'T12:00:00Z'), h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(noon), k = 570 - (h - 12) * 60 + 180; return (Math.floor(k / 60) % 12 || 12) + ':' + String(k % 60).padStart(2, '0') + ' pm'; };
const msg = ['PRE-MARKET CHECK ' + ny + ' (your stocks, before the open: ' + openKuwait(ny) + ' Kuwait)' + (note ? ' [' + note + ']' : feed ? ' [prices: ' + feed.toUpperCase() + ' feed]' : ''), '',
  ...(rows.sell.length ? ['SELL', ...rows.sell, ''] : ['SELL: nothing.', '']), ...(rows.watch.length ? ['WATCH', ...rows.watch, ''] : []), ...(rows.hold.length ? ['HOLD', ...rows.hold, ''] : []),
  'Do not trade in the pre-market itself (thin, wide spreads, often reversed at the open). Act in the regular session; keep every stop at your broker. After you sell, send  sold SYM PRICE .'];
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
