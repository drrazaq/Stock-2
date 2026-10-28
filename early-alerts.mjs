// EARLY ALERTS (owner, 28 Oct 2026, V3.0 item 5): prompt Telegram messages from the live watcher, in three SEPARATE kinds, and the
// per-candidate log behind the Opportunity Delivery Scorecard (item 7). Research and routing only: no buy rule, no gate, no cost changes.
//   RESEARCH LEAD   (trigger EW-ALERT-1, pre-registered here 28 Oct before any alert was sent): an early-wave observation (early-wave-
//                    discovery.mjs) with score 80+, up +3% to +8% on the day (early, not extended), 1M USD+ traded so far, live price,
//                    first seen 9:35-11:30 New York. Unproven: on 26-27 Oct about 80 stocks a day met it and only 4-15% reached the
//                    +3.6% gross a +2% net needs, so it is capped at 5 a day and every message says so.
//   PAPER SETUP     an intraday rule hit (IG1-IG9) before 11:30, with the rule's own live paper record and its 5-year verdict.
//   APPROVED        unchanged: only ignition-watch.mjs maybeAlert (rules that passed every gate) sends those.
// HARD RULES apply to every kind and are never bypassed: under 1 USD, NOT HALAL (ZAD), the one-day-jump AVOID list, an SEC danger filing
// in 30 days (share sale / registration, delisting notice, late report) and an SEC check that FAILED (unknown = blocked, as for alerts).
// LEVELS (settings.alerts, command  alerts all|paper|approved|off): all (default) = leads + paper + approved; paper = paper + approved;
// approved = approved only; off = none of these (approved alerts keep their own existing switches). quiet / opportunitiesOnly / focus
// do not apply here: this channel exists because the owner asked for prompt, labelled research (28 Oct).
import { netHurdle, netOf } from './radar-v3-core.mjs';

export const LEAD = { minScore: 80, chgMin: 0.03, chgMax: 0.08, minDollarVol: 1e6, from: 575, to: 690, perDay: 5 };
export const PAPER = { to: 690, perDay: 4 };
export const LEVELS = ['all', 'paper', 'approved', 'off'];
export const alertLevel = (st) => (st && LEVELS.includes(st.alerts) ? st.alerts : 'all');
const pct = (x, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? '?' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const usd = (x) => (x >= 10 ? '$' + x.toFixed(2) : '$' + x.toFixed(x >= 1 ? 2 : 4));
export const fm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

// soft trigger for a research lead: returns null when it qualifies, else the reason (soft: it stays visible in the radar and scorecard)
export function leadSoftReason(c) {
  if (!c.live) return 'no fresh price'; if (c.m < LEAD.from) return 'before 9:35'; if (c.m > LEAD.to) return 'after 11:30';
  if (c.chg > LEAD.chgMax) return 'already extended (over +8%)'; if (c.chg < LEAD.chgMin) return 'move under +3% so far';
  if (!(c.score >= LEAD.minScore)) return 'early-wave score under 80'; if (!(c.dollarVol >= LEAD.minDollarVol)) return 'under 1M USD traded so far';
  return null;
}
// hard rules (never bypassed); sec = { known, tags } from the watcher's SEC check
export function hardReason({ price, halalFail, lottery, sec }) {
  if (!(price >= 1)) return 'under 1 USD'; if (halalFail) return 'NOT HALAL (ZAD)'; if (lottery >= 0.15) return 'AVOID list (one-day jump ' + pct(lottery) + ')';
  if (!sec || !sec.known) return 'SEC check failed (blocked until it works)'; if (sec.tags && sec.tags.length) return 'SEC danger: ' + sec.tags.join(', ');
  return null;
}
// CATALYST CHECK (owner approved 28 Oct; classes refined the same day, owner item 5, before any live alert used them). Never invents a
// reason; never reads a failed source as "no catalyst". Three separate answers:
//   SOURCE     SEC (a filing with its SEC acceptance time: authentic, from the company, via the regulator)
//              ISSUER_WIRE (a headline whose source is a press-release wire: GlobeNewswire, Business Wire, PR Newswire, Accesswire,
//                           Newsfile: the company's own words, not checked by anyone) / AGGREGATOR (any other headline: unverified)
//              NONE (both checked, nothing) / UNAVAILABLE (a source failed; said which)
//   DIRECTION  DILUTION (financing: 8-K 2.03 / 3.02 / 3.03, a prospectus or registration 424B / S-1 / S-3 / F-1 / F-3, or headline words
//              offering, placement, priced, warrants, ATM, convertible) / NEGATIVE (8-K 1.02 1.03 2.04 2.05 2.06 3.01 4.01 4.02, or
//              headline words delisting, downgrade, misses, cuts guidance, lawsuit, investigation, recall, bankruptcy, going concern,
//              resigns, terminates, restatement) / POSITIVE (ONLY from headline words: award, contract, approval, clearance, partnership,
//              collaboration, acquired by, beats, record revenue, raises guidance, wins, order: wording, not verified meaning) /
//              AMBIGUOUS (an SEC item that does not say which way, e.g. 1.01, 2.02, 7.01, 8.01, or positive and negative words together)
//              / UNKNOWN (nothing found)
//   FRESHNESS  FRESH (in the 24 h before the check) / RECYCLED (only 24-72 h old, or an amended filing /A: old news moving now)
// cls (kept for the ledger): VERIFIED (SEC, fresh) / UNCONFIRMED (headline only, fresh) / RECYCLED / NONE / UNAVAILABLE.
const nyHM = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' });
export const NEG_ITEMS = ['1.02', '1.03', '2.04', '2.05', '2.06', '3.01', '4.01', '4.02'], DIL_ITEMS = ['2.03', '3.02', '3.03'];
export const DIL_FORMS = /^(424B|S-1|S-3|F-1|F-3)/, EVENT_FORMS = /^(8-K|6-K|SC 13D|425|DEFA14A)/;
const DIL_W = /\b(offering|private placement|registered direct|priced at|pricing of|warrants?|at-the-market|ATM program|convertible|shelf)\b/i;
const NEG_W = /\b(delist\w*|downgrade\w*|miss(es|ed)?|cuts? (guidance|outlook)|lawsuit|investigation|recall\w*|bankrupt\w*|going concern|resign\w*|terminat\w*|restat\w*|subpoena|halt\w*)\b/i;
const POS_W = /\b(award\w*|contract|approv\w*|clearance|partnership|collaborat\w*|acquired by|to be acquired|beats?|record (revenue|quarter|sales)|raises? (guidance|outlook)|wins?|purchase order|orders? from)\b/i;
const WIRE = /globe ?newswire|business ?wire|pr ?newswire|accesswire|newsfile|globenewswire/i;
export function itemsOf(s) { return String(s || '').split(/[,\s]+/).filter(x => /^\d\.\d\d$/.test(x)); }
export function filingDirection(f) {
  const it = itemsOf(f.items); if (DIL_FORMS.test(f.form) || it.some(x => DIL_ITEMS.includes(x))) return 'DILUTION';
  if (it.some(x => NEG_ITEMS.includes(x))) return 'NEGATIVE'; return 'AMBIGUOUS';
}
export function headlineDirection(h) {
  const t = String(h || ''); if (DIL_W.test(t)) return 'DILUTION'; const n = NEG_W.test(t), p = POS_W.test(t);
  return n && p ? 'AMBIGUOUS' : n ? 'NEGATIVE' : p ? 'POSITIVE' : 'AMBIGUOUS';
}
export function classifyCatalyst({ sec, news, nowMs, hours = 24, recycledHours = 72 }) {
  const t0 = nowMs - hours * 3600e3, t1 = nowMs - recycledHours * 3600e3, ok = (t) => t !== null && t !== undefined && Number.isFinite(t) && t <= nowMs;
  const F = sec && sec.known ? (sec.filings || []).map(x => ({ ...x, t: x.at ? Date.parse(x.at) : null })).filter(x => ok(x.t) && x.t >= t1 && (EVENT_FORMS.test(x.form) || DIL_FORMS.test(x.form))).sort((a, b) => a.t - b.t) : [];
  const N = news && news.ok ? (news.items || []).filter(x => ok(x.at) && x.at >= t1).sort((a, b) => a.at - b.at) : [];
  const fF = F.filter(x => x.t >= t0 && !/\/A$/.test(x.form)), fN = N.filter(x => x.at >= t0);
  const worst = (ds) => ['DILUTION', 'NEGATIVE', 'POSITIVE', 'AMBIGUOUS'].find(d => ds.includes(d)) || 'UNKNOWN';
  const hDir = fN.length ? (() => { const ds = fN.map(x => headlineDirection(x.headline)); return ds.includes('DILUTION') ? 'DILUTION' : ds.includes('NEGATIVE') && ds.includes('POSITIVE') ? 'AMBIGUOUS' : worst(ds); })() : null;
  const tag = (o) => ({ ...o, text: o.text + ' [source ' + o.source + ', direction ' + o.direction + (o.direction === 'POSITIVE' ? ' (headline wording, not verified)' : '') + ', ' + o.freshness + ']' });
  if (fF.length) { const x = fF[0], fd = worst(fF.map(filingDirection)), dir = fd !== 'AMBIGUOUS' ? fd : hDir && hDir !== 'AMBIGUOUS' ? hDir : 'AMBIGUOUS';
    return tag({ cls: 'VERIFIED', source: 'SEC', direction: dir, freshness: 'FRESH', text: 'SEC ' + x.form + (x.items ? ' item ' + x.items : '') + ' accepted ' + nyHM(x.t) + ' New York' + (fN.length ? '; headline ' + nyHM(fN[0].at) + ' (' + (fN[0].source || 'news') + '): "' + fN[0].headline + '"' : '') }); }
  if (fN.length) { const x = fN[0], src = WIRE.test(x.source || '') ? 'ISSUER_WIRE' : 'AGGREGATOR';
    return tag({ cls: 'UNCONFIRMED', source: src, direction: hDir, freshness: 'FRESH', text: 'earliest headline ' + nyHM(x.at) + ' New York (' + (x.source || 'news') + '): "' + x.headline + '"' }); }
  if (F.length || N.length) { const x = F[0] || null, h = N[0] || null;
    return tag({ cls: 'RECYCLED', source: x ? 'SEC' : WIRE.test((h && h.source) || '') ? 'ISSUER_WIRE' : 'AGGREGATOR', direction: x ? filingDirection(x) : headlineDirection(h.headline), freshness: 'RECYCLED', text: 'only older news (24-72 h' + (x && /\/A$/.test(x.form) ? ', an amended filing' : '') + '): ' + (x ? 'SEC ' + x.form + ' accepted ' + new Date(x.t).toISOString().slice(5, 16).replace('T', ' ') + ' UTC' : '"' + h.headline + '"') }); }
  if (!sec || !sec.known) return tag({ cls: 'UNAVAILABLE', source: 'UNAVAILABLE', direction: 'UNKNOWN', freshness: 'NONE', text: 'the SEC check failed' + (news && news.ok ? '; no headline in 72 h' : '; news not available either') });
  if (!news || !news.ok) return tag({ cls: 'UNAVAILABLE', source: 'UNAVAILABLE', direction: 'UNKNOWN', freshness: 'NONE', text: 'no SEC filing in 72 h; news source unavailable (' + ((news && news.why) || 'not checked') + ')' });
  return tag({ cls: 'NONE', source: 'NONE', direction: 'UNKNOWN', freshness: 'NONE', text: 'no SEC filing and no headline in 72 h' });
}
export const levelAllows = (level, kind) => (kind === 'lead' ? level === 'all' : kind === 'paper' ? level === 'all' || level === 'paper' : false);

// (28 Oct, owner approved) the REAL spread and the real gross move needed for +2% net, from the quote recorded at detection. Round trip on
// 1,000 USD: 0.6% fees + the full spread once (buying at the ask pays half, selling at the bid the other half). A quote older than 2 minutes
// or a spread of 10%+ is not trusted: the assumed spread is used and said. A quote is not a fill: the message says the hurdle is a minimum.
export function spreadHurdle(c) {
  const sp = Number.isFinite(c.bid) && Number.isFinite(c.ask) && c.bid > 0 && c.ask >= c.bid ? (c.ask - c.bid) / ((c.ask + c.bid) / 2) : null, fresh = sp !== null && Number.isFinite(c.qAgeSec) && c.qAgeSec >= 0 && c.qAgeSec <= 120 && sp < 0.10;
  if (fresh) return 'Spread now ' + (sp * 100).toFixed(2) + '% (bid ' + usd(c.bid) + ' / ask ' + usd(c.ask) + ', quote ' + Math.round(c.qAgeSec) + ' s old): +2% net on 1,000 USD needs at least ' + pct(0.026 + sp, 1) + ' gross.';
  return 'Spread: no fresh quote' + (sp !== null ? ' (last ' + (sp * 100).toFixed(1) + '%, ' + (Number.isFinite(c.qAgeSec) ? Math.round(c.qAgeSec) + ' s old' : 'age unknown') + ')' : '') + '; at an assumed ' + (c.price < 5 ? '1%' : '0.3%') + ' spread +2% net needs at least ' + pct(netHurdle(c.price), 1) + ' gross.';
}
export function leadText(items, ctx = {}) {
  return ['EARLY WATCH: RESEARCH LEAD' + (items.length > 1 ? 'S' : '') + ' (NOT AN APPROVED BUY) ' + fm(items[0].m) + ' New York', ...items.map(c =>
    '- ' + c.sym + ' ' + pct(c.chg, 1) + ' at ' + usd(c.price) + ', volume pace ' + (c.rvT ? c.rvT.toFixed(1) + 'x' : '?') + ', ' + (c.dollarVol / 1e6).toFixed(1) + 'M USD traded so far. '
      + (ctx.halalOk && ctx.halalOk(c.sym) ? 'Halal (your ZAD mark).' : 'HALAL UNKNOWN: check ZAD first.') + ' SEC: no danger filing in 30 days.\n  Catalyst: ' + (c.cat ? c.cat.text : 'not checked') + '.\n  ' + spreadHurdle(c)
      + (c.price < 5 ? ' Under 5 USD: wide spreads, halts, gaps.' : '')),
    'Trigger EW-ALERT-1 is UNPROVEN: on its first 2 days only about 1 in 10 such stocks reached that gross move. At most 5 a day; the after-close radar scores every one. Fewer messages: alerts paper  or  alerts off.'].join('\n');
}
export function paperText(items) {
  return ['EARLY WATCH: PAPER SETUP' + (items.length > 1 ? 'S' : '') + ' (NOT AN APPROVED BUY) ' + fm(items[0].m) + ' New York', ...items.map(c => { const r = c.record;
    return '- ' + c.sym + ': ' + c.rule + ' at ' + usd(c.price) + ' (' + pct(c.chg) + ' today). Rule record: ' + (r ? r.n + ' paper trades, ' + pct(r.avg, 1) + ' a trade after costs' + (r.noTop2 !== null && r.noTop2 !== undefined ? ', ' + pct(r.noTop2, 1) + ' without its 2 best' : '') : 'none yet')
      + '; 5-year test ' + (c.history || 'not tested') + '.\n  Catalyst: ' + (c.cat ? c.cat.text : 'not checked') + '.\n  ' + spreadHurdle(c) + '\n  Paper only: logged and scored, not a buy. ' + (c.halalOk ? 'Halal (your ZAD mark).' : 'HALAL UNKNOWN: check ZAD first.'); }),
    'Fewer messages: alerts approved  or  alerts off.'].join('\n');
}

// opts: { day, level, send(text) -> Promise<{ok}>, secRisk(sym) -> Promise<{known, tags}>, notHalal(sym), halalOk(sym), lottery: {}, record: {}, lab: {}, now() -> NY minute }
export function createEarlyAlerts(opts) {
  const S = { level: opts.level || 'all', seen: {}, queue: { lead: [], paper: [] }, sent: { lead: 0, paper: 0 }, rows: [], sec: {} };
  const secOf = async (sym) => S.sec[sym] || (S.sec[sym] = await opts.secRisk(sym).catch(() => ({ known: false, tags: [] })));
  // decide(): one ledger row per candidate; quote, quote age, volume pace, dollar volume and score are the A/B/C shadow-ranking inputs
  const decide = (kind, c, decision) => { const k = kind + '|' + c.sym; const row = { d: opts.day, kind, sym: c.sym, m: c.m, px: c.price, chg: c.chg !== undefined ? +(+c.chg).toFixed(4) : null, rule: c.rule, decision, bid: c.bid > 0 ? c.bid : null, ask: c.ask > 0 ? c.ask : null, qAgeSec: Number.isFinite(c.qAgeSec) ? Math.round(c.qAgeSec) : null, rvT: Number.isFinite(c.rvT) ? +(+c.rvT).toFixed(2) : null, dollarVol: Number.isFinite(c.dollarVol) ? Math.round(c.dollarVol) : null, score: Number.isFinite(c.score) ? c.score : null }; S.seen[k] = row; return row; };
  return {
    S, setLevel(l) { if (LEVELS.includes(l)) S.level = l; },
    // called every minute for every early-wave observation; only the first decision per stock counts (soft misses are re-checked until final)
    noteLead(c) { const k = 'lead|' + c.sym; if (S.seen[k] && S.seen[k].final) return; const soft = leadSoftReason(c);
      if (soft) { const prev = S.seen[k], keep = soft === 'after 11:30' && prev && /^SOFT/.test(prev.decision) && !/after 11:30/.test(prev.decision);   // keep the reason that blocked it inside the window
        const row = decide('lead', c, keep ? prev.decision + ' (until 11:30)' : 'SOFT: ' + soft); if (/extended|after 11:30/.test(soft)) row.final = true; return; }
      const row = decide('lead', c, 'PENDING'); row.final = true; row.c = c; S.queue.lead.push(row); },
    notePaper(t, chg, q = {}) { const k = 'paper|' + t.sym; if (S.seen[k]) return; const c = { sym: t.sym, m: t.m, price: t.price, chg, rule: t.rule, bid: q.bid, ask: q.ask, qAgeSec: q.qAgeSec };
      const row = decide('paper', c, t.m > PAPER.to ? 'SOFT: after 11:30' : 'PENDING'); row.final = true; if (row.decision === 'PENDING') { row.c = c; S.queue.paper.push(row); } },
    // once a minute: hard rules, level, daily caps, then one message per kind
    async process() {
      for (const kind of ['paper', 'lead']) { const q = S.queue[kind].splice(0), out = [];
        for (const row of q) { const c = row.c; delete row.c;
          const hard = hardReason({ price: c.price, halalFail: opts.notHalal(c.sym), lottery: (opts.lottery || {})[c.sym], sec: await secOf(c.sym) });
          if (hard) { row.decision = 'HARD: ' + hard; continue; }
          if (opts.catalyst) { c.cat = await opts.catalyst(c.sym, S.sec[c.sym]).catch(() => null); if (c.cat) { row.cat = c.cat.cls; row.catSource = c.cat.source; row.catDir = c.cat.direction; row.catFresh = c.cat.freshness; row.catText = c.cat.text; } }   // (28 Oct, owner approved) catalyst check inside alerts; every eligible candidate, sent or not, so the scorecard can compare
          if (!levelAllows(S.level, kind)) { row.decision = 'MUTED: alerts ' + S.level; continue; }
          if (S.sent[kind] + out.length >= (kind === 'lead' ? LEAD.perDay : PAPER.perDay)) { row.decision = 'LIMIT: ' + (kind === 'lead' ? LEAD.perDay : PAPER.perDay) + ' a day reached'; continue; }
          if (kind === 'paper') { const r = (opts.record || {})[c.rule + '/close']; c.record = r; c.history = ((opts.lab || {})[c.rule + '/close'] || {}).verdict; c.halalOk = opts.halalOk(c.sym); }
          out.push({ row, c }); }
        if (!out.length) continue;
        const text = kind === 'lead' ? leadText(out.map(x => x.c), { halalOk: opts.halalOk }) : paperText(out.map(x => x.c));
        const r = await opts.send(text).catch(e => ({ ok: false, why: e.message })), at = opts.now();
        for (const x of out) { x.row.decision = r && r.ok ? 'SENT' : 'SEND FAILED' + (r && r.why ? ': ' + r.why : ''); x.row.sentM = at; x.row.latencyMin = at - x.row.m; }
        if (r && r.ok) S.sent[kind] += out.length; } },
    // end of the session: one row per candidate with its 15:00 price and net result after the 6 USD round trip and the spread
    finish(lastPx = {}, mkt = null, approved = 0) {
      const rows = Object.values(S.seen).map(({ final, c, ...r }) => { const px15 = lastPx[r.sym] > 0 ? lastPx[r.sym] : null, net = px15 ? netOf(r.px, px15) : null;
        return { ...r, decision: r.decision === 'PENDING' ? 'NOT PROCESSED' : r.decision, px15, net, mkt }; });
      return { rows, summary: { ...summarize(opts.day, rows), approved } };
    },
  };
}

// the daily DELIVERY SCORECARD line (data/opp-days.jsonl)
export function summarize(day, rows) {
  const cnt = (f) => rows.filter(f).length, grp = (re) => { const o = {}; for (const r of rows) { const m = r.decision.match(re); if (m) o[m[1]] = (o[m[1]] || 0) + 1; } return o; };
  const trig = rows.filter(r => !/^SOFT/.test(r.decision)), elig = trig.filter(r => !/^HARD/.test(r.decision)), sent = rows.filter(r => r.decision === 'SENT');
  const scored = (a) => a.filter(r => r.net !== null && r.net !== undefined), win = (a) => scored(a).filter(r => r.net > 0).length;
  const missedGood = elig.filter(r => r.decision !== 'SENT' && r.net > 0.02).map(r => ({ sym: r.sym, kind: r.kind, m: fm(r.m), net: r.net, why: r.decision }));
  return { day, detected: rows.length, leadsDetected: cnt(r => r.kind === 'lead'), paperDetected: cnt(r => r.kind === 'paper'), metTrigger: trig.length, eligible: elig.length,
    hard: grp(/^HARD: (.*)$/), soft: grp(/^SOFT: (.*)$/), muted: cnt(r => /^MUTED/.test(r.decision)), limited: cnt(r => /^LIMIT/.test(r.decision)), sendFailed: cnt(r => /^SEND FAILED/.test(r.decision)),
    delivered: sent.length, medianLatencyMin: sent.length ? sent.map(r => r.latencyMin).sort((a, b) => a - b)[Math.floor(sent.length / 2)] : null,
    deliveredScored: scored(sent).length, deliveredWon: win(sent), deliveredAvgNet: scored(sent).length ? +(scored(sent).reduce((a, r) => a + r.net, 0) / scored(sent).length).toFixed(4) : null,
    eligibleScored: scored(elig).length, eligibleWon: win(elig), eligibleAvgNet: scored(elig).length ? +(scored(elig).reduce((a, r) => a + r.net, 0) / scored(elig).length).toFixed(4) : null,
    missedGood, best: pick(sent, 1), worst: pick(sent, -1), bestUndelivered: pick(elig.filter(r => r.decision !== 'SENT'), 1), worstUndelivered: pick(elig.filter(r => r.decision !== 'SENT'), -1) };
}
// best / worst by same-day net after costs (Part 9: delivered vs eligible-but-not-delivered)
function pick(a, dir) { const s = a.filter(r => r.net !== null && r.net !== undefined).sort((x, y) => dir * (y.net - x.net))[0]; return s ? { sym: s.sym, kind: s.kind, net: s.net, why: s.decision } : null; }
export function scorecardText(d) {
  if (!d) return 'DELIVERY SCORECARD: no record for today (the live watcher did not save one).';
  const h = Object.entries(d.hard || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ');
  return ['DELIVERY SCORECARD (' + d.day + '): detected ' + d.detected + ' (' + d.leadsDetected + ' early-wave, ' + d.paperDetected + ' rule hits); met the alert trigger ' + d.metTrigger + '; eligible ' + d.eligible
    + '; blocked by hard rules ' + (d.metTrigger - d.eligible) + (h ? ' (' + h + ')' : '') + '; muted by your setting ' + d.muted + '; over the daily cap ' + d.limited + '; send failed ' + d.sendFailed + '; DELIVERED ' + d.delivered
    + (d.medianLatencyMin !== null ? ' (median ' + d.medianLatencyMin + ' min after detection)' : '') + '; approved alerts ' + (d.approved || 0) + '.',
    'After costs at 15:00: delivered ' + (d.deliveredScored ? d.deliveredWon + ' of ' + d.deliveredScored + ' positive, average ' + pct(d.deliveredAvgNet, 1) : 'none scored')
      + '; all eligible ' + (d.eligibleScored ? d.eligibleWon + ' of ' + d.eligibleScored + ' positive, average ' + pct(d.eligibleAvgNet, 1) : 'none scored') + '.',
    'Best / worst delivered: ' + (d.best ? d.best.sym + ' ' + pct(d.best.net, 1) + ' / ' + d.worst.sym + ' ' + pct(d.worst.net, 1) : 'none') + '. Best / worst eligible NOT delivered: ' + (d.bestUndelivered ? d.bestUndelivered.sym + ' ' + pct(d.bestUndelivered.net, 1) + ' / ' + d.worstUndelivered.sym + ' ' + pct(d.worstUndelivered.net, 1) : 'none') + '.',
    d.missedGood && d.missedGood.length ? 'Eligible and +2% net by 15:00 but NOT delivered: ' + d.missedGood.slice(0, 5).map(x => x.sym + ' ' + x.m + ' ' + pct(x.net, 1) + ' (' + x.why.toLowerCase() + ')').join('; ') + '.' : 'No eligible candidate made +2% net by 15:00 without being delivered.'].join('\n');
}
