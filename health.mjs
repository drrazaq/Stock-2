// SYSTEM HEALTH: every evening, checks that every job actually produced fresh results, and tells you on Telegram when one
// silently stopped (a step that "continues on error", a crash after a code change, a key that expired, an API that changed).
// Today's smart-money crash ran unnoticed for a day; this is what catches that. Read-only; sends a message only when something is wrong.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org';
const readJson = (f) => { try { return JSON.parse(/\.gz$/.test(f) ? zlib.gunzipSync(fs.readFileSync(f)).toString() : fs.readFileSync(f, 'utf8')); } catch (e) { return undefined; } };
const now = Date.now();
// hours between t and now, not counting Saturdays and Sundays (US jobs do not run then)
const bizHours = (t) => { let h = 0; for (let x = t; x < now; x += 3600e3) { const d = new Date(x).getUTCDay(); if (d !== 0 && d !== 6) h++; } return h; };
const stamp = (j) => { if (!j) return null; for (const k of ['updated', 'at', 'generatedAt', 'session', 'day', 'd']) if (j[k] && !isNaN(Date.parse(j[k]))) return Date.parse(String(j[k]).length === 10 ? j[k] + 'T21:00:00Z' : j[k]); return null; };
// [file, plain name, how often it should update, max age in weekday hours (daily) or calendar days (weekly), extra content check]
const ran = (j) => /^(NOT RUN|FAIL|ERROR)/i.test(String(j.status || '')) ? 'not run: ' + (j.why || j.status) : null;
const CHECKS = [
  ['data/signals.json', 'nightly scan (ACTIONS, buy list)', 'every weekday night', { biz: 30 }],
  ['data/smart-money.json', 'smart money (insiders, analysts)', 'every weekday', { biz: 30 }],
  ['data/sec-status.json', 'SEC company filings', 'every weekday', { biz: 30 }, (j) => j.ok ? null : 'the SEC refused or failed: ' + j.why],
  ['data/events-recent.json', 'SEC filings of the last 10 days', 'every weekday', { biz: 30 }],
  ['data/calendar-status.json', 'economic calendar', 'every weekday', { biz: 30 }, (j) => j.official && Object.keys(j.official).length >= 3 ? null :   // official BLS/Fed dates loaded: TipRanks is only a fallback, its quota is not a problem (23 Oct)
 !/^ok/.test(j.tipranks || '') ? 'TipRanks: ' + j.tipranks : j.econUpcoming === 0 && /^ok: 0 /.test(j.tipranks) ? 'TipRanks answered but no events were read (input or reply format mismatch)' : (j.tipranksCallsLeft !== null && j.tipranksCallsLeft !== undefined && j.tipranksCallsLeft < 10 ? 'only ' + j.tipranksCallsLeft + ' TipRanks calls left this month' : null)],
  ['data/missed-runners.json', 'missed-runner report', 'weekly (Sunday)', { days: 8 },   // (28 Oct) was { biz: 30 }: a weekly job flagged as failing every Tuesday night
    (j) => { try { const L = fs.readFileSync('data/ignition-days.jsonl', 'utf8').trim().split('\n').map(x => JSON.parse(x).day).sort(), last = L[L.length - 1]; return j.asOfDay && last && last > j.asOfDay && (Date.parse(last) - Date.parse(j.asOfDay)) > 8 * 864e5 ? 'missed-runner report is stale (covers to ' + j.asOfDay + ', ledger to ' + last + '): its feed decision is not current' : null; } catch (e) { return null; } }],
  ['data/ignition-live.json', 'fast-mover watcher (live session)', 'every weekday session', { biz: 34 }],
  ['data/movers-state.json', 'movers radar', 'every weekday morning', { biz: 34 }],
  ['data/intraday-radar.json', 'intraday radar', 'every weekday session', { biz: 34 }],
  ['data/discovery.json', 'discovery', 'every weekday', { biz: 34 }],
  ['data/deals.json', 'deals and IPOs', 'every weekday', { biz: 34 }],
  ['data/leaders-study.json', 'Sunday studies (LEADERS)', 'every Sunday', { days: 8 }],
  ['data/events-study.json', 'Sunday company-news test', 'every Sunday', { days: 8, optional: true }, (j) => j.status && j.status !== 'OK' ? 'not run: ' + (j.why || j.status) : null],
  ['data/octopus.json', 'Sunday octopus test', 'every Sunday', { days: 8, optional: true }, (j) => j.status && j.status !== 'OK' ? 'not run: ' + (j.why || j.status) : null],
  ['data/fastmover-lab.json', 'Sunday fast-mover lab', 'every Sunday', { days: 8, optional: true }, (j) => j.status && j.status !== 'OK' ? 'not run: ' + (j.why || j.status) : null],
  ['data/octopus-daily.json', 'daily octopus ranking', 'every weekday morning', { biz: 34, optional: true }],
  ['data/autolab.json', 'Sunday autolab (new rules)', 'every Sunday', { days: 8, optional: true }, (j) => j.status && j.status !== 'OK' ? 'not run: ' + (j.why || j.status) : null],
  ['data/horizons.json', 'Sunday horizons test', 'every Sunday', { days: 8, optional: true }, (j) => j.status && j.status !== 'OK' ? 'not run: ' + (j.why || j.status) : null],
  ['data/shares.json.gz', 'SEC share counts (dilution flag, past float)', 'every weekday evening', { days: 5 }, (j) => j.note ? 'SEC: ' + j.note : null],
  // Added 22 Oct 2026 (audit H1): research outputs, so a crash inside a 'continue on error' step no longer stays silent. Sunday studies
  // (leaders-study.yml, 06:00 UTC Sunday) may be up to 8 days old; the Saturday intraday lab (fastmover-intraday.yml) too.
  ['data/earnings-study.json', 'Sunday earnings-drift test (feeds the nightly earnings-drift buys)', 'every Sunday', { days: 8 }, ran],
  ['data/ignition-lab.json', 'Saturday intraday ignition lab (ignition alerts use only rules that pass it)', 'every Saturday', { days: 8 }, ran],
  ['data/agent-league.json', 'agent league (weekly freeze and scoring of champion picks)', 'every Sunday', { days: 8 }, (j) => j.priced === false ? 'ran without the price cache: no picks frozen or scored' : null],
  ...[['insider-study', 'insider cluster study (Agent C champion E3)'], ['chain-ripple', 'chain-ripple study'], ['regime-gate', 'regime-gate study (A-RG1)'], ['pattern-lab', 'pattern lab (Agent A)'],
    ['swing-lab', 'swing lab (Agent A)'], ['fulfilling', 'fulfilling lab (Agent C)'], ['ew-stack', 'early-wave stack (A-EW1)'], ['tip-score', 'tip-source scoreboard (FADE list)'], ['gov-awards', 'government awards study (C-GOV1)'],
    ['orb-study', 'opening-range breakout study (A-ORB1)'], ['missed-runners', 'missed-runner audit (A-MISS1)'], ['sequence-study', 'sequence study (filing, quiet, breakout)'], ['quality', 'quality companies study (Agent B champion)'],
    ['stops', 'stop study (stop advice)'], ['exits', 'exit study'], ['rebuy', 'sell-and-buy-back study'], ['rebalance', 'rebalancing study'], ['winners-study', 'winners study'], ['hunting-lab', 'hunting lab'], ['score-study', 'stock score study']]
    .map(([f, n]) => ['data/' + f + '.json', 'Sunday ' + n, 'every Sunday', { days: 8 }, ran]),
  // Agent C, 22 Oct 2026: new pre-registered studies (optional until their first Sunday run writes the file).
  ...[['gov-awards2', 'government awards with the parent map (C-GOV1b)'], ['share-supply', 'share-supply avoid blocks (C-S8, C-LOCK)']].map(([f, n]) => ['data/' + f + '.json', 'Sunday ' + n, 'every Sunday', { days: 8, optional: true }, ran]),
];
const problems = [], ok = [];
for (const [f, name, how, lim, check] of CHECKS) {
  const j = readJson(f); if (j === undefined) { if (!lim.optional) problems.push(name + ': its file is missing (' + f + '). It should update ' + how + '.'); continue; }
  const t = stamp(j); if (!t) { problems.push(name + ': its file has no date (' + f + '), so its age cannot be checked. The output format may have changed.'); continue; }
  const age = lim.biz ? bizHours(t) : (now - t) / 864e5, stale = lim.biz ? age > lim.biz : age > lim.days;
  if (stale) problems.push(name + ': last result ' + new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC; it should update ' + how + '. The job is probably failing.');
  else { const c = check ? check(j) : null; if (c) problems.push(name + ': ' + c); else ok.push(name); } }
// WATCHER START (28 Oct, owner item 4): the live watcher must be watching by 9:35 New York. GitHub's cron started it 9:38-9:49 every day and
// 11:10 on 26 Oct; the watcher guard (watcher-guard.mjs, in the bot job) now starts it when GitHub has not. This reads the last watched day.
try { const L = fs.readFileSync('data/ignition-days.jsonl', 'utf8').trim().split('\n'), j = JSON.parse(L[L.length - 1]);
  if (j.firstMinute && j.firstMinute > '09:35') problems.push('live watcher started late on ' + j.day + ': first watched minute ' + j.firstMinute + ' New York' + (j.procStart ? ' (process started ' + j.procStart + ')' : '') + '; it should watch from 9:30. The open was not watched.'); else ok.push('live watcher start'); } catch (e) {}
// MISSING SCRIPTS: every 'node X.mjs' named in a workflow must exist. A file deleted during an upload (shares.mjs, 16 Oct 2026) made
// a 'continue on error' step fail silently every day; this catches it the same evening.
try { const W = '.github/workflows', seen = new Set();
  for (const f of fs.readdirSync(W).filter(f => /\.ya?ml$/.test(f))) for (const m of fs.readFileSync(W + '/' + f, 'utf8').matchAll(/\bnode\s+([\w.-]+\.m?js)\b/g)) {
    if (seen.has(m[1])) continue; seen.add(m[1]); if (!fs.existsSync(m[1])) problems.push('the script ' + m[1] + ' is missing from the main folder, but the workflow ' + f + ' runs it. Upload it again (it was probably deleted during an upload).'); }
  if (seen.size) ok.push('workflow scripts present'); } catch (e) {}
const H = readJson('data/health.json') || {}, key = problems.join('|'), today = new Date().toISOString().slice(0, 10);
fs.writeFileSync('data/health.json', JSON.stringify({ at: new Date().toISOString(), ok: ok.length, problems, sentKey: H.sentKey, sentDay: H.sentDay }, null, 1));
console.log('health: ' + ok.length + ' fine, ' + problems.length + ' problems' + (problems.length ? '\n- ' + problems.join('\n- ') : ''));
// tell the owner once per day per set of problems (and once when everything is fine again)
const recovered = !problems.length && H.problems && H.problems.length;
if ((problems.length && (H.sentKey !== key || H.sentDay !== today)) || recovered) {
  const msg = problems.length ? ['SYSTEM HEALTH: ' + problems.length + ' problem' + (problems.length > 1 ? 's' : '') + ' (' + ok.length + ' parts fine)', '', ...problems.map(p => '- ' + p), '', 'Your ACTIONS may be missing information until this is fixed. Send this message to Claude.'] : ['SYSTEM HEALTH: all ' + ok.length + ' parts are running again.'];
  if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
  const J = readJson('data/health.json'); J.sentKey = key; J.sentDay = today; J.problems = problems; fs.writeFileSync('data/health.json', JSON.stringify(J, null, 1)); }
