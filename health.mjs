// SYSTEM HEALTH: every evening, checks that every job actually produced fresh results, and tells you on Telegram when one
// silently stopped (a step that "continues on error", a crash after a code change, a key that expired, an API that changed).
// Today's smart-money crash ran unnoticed for a day; this is what catches that. Read-only; sends a message only when something is wrong.
import fs from 'node:fs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org';
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return undefined; } };
const now = Date.now();
// hours between t and now, not counting Saturdays and Sundays (US jobs do not run then)
const bizHours = (t) => { let h = 0; for (let x = t; x < now; x += 3600e3) { const d = new Date(x).getUTCDay(); if (d !== 0 && d !== 6) h++; } return h; };
const stamp = (j) => { if (!j) return null; for (const k of ['updated', 'at', 'generatedAt', 'session', 'day', 'd']) if (j[k] && !isNaN(Date.parse(j[k]))) return Date.parse(String(j[k]).length === 10 ? j[k] + 'T21:00:00Z' : j[k]); return null; };
// [file, plain name, how often it should update, max age in weekday hours (daily) or calendar days (weekly), extra content check]
const CHECKS = [
  ['data/signals.json', 'nightly scan (ACTIONS, buy list)', 'every weekday night', { biz: 30 }],
  ['data/smart-money.json', 'smart money (insiders, analysts)', 'every weekday', { biz: 30 }],
  ['data/sec-status.json', 'SEC company filings', 'every weekday', { biz: 30 }, (j) => j.ok ? null : 'the SEC refused or failed: ' + j.why],
  ['data/events-recent.json', 'SEC filings of the last 10 days', 'every weekday', { biz: 30 }],
  ['data/calendar-status.json', 'economic calendar (TipRanks)', 'every weekday', { biz: 30 }, (j) => !/^ok/.test(j.tipranks || '') ? 'TipRanks: ' + j.tipranks : j.econUpcoming === 0 && /^ok: 0 /.test(j.tipranks) ? 'TipRanks answered but no events were read (input or reply format mismatch)' : (j.tipranksCallsLeft !== null && j.tipranksCallsLeft !== undefined && j.tipranksCallsLeft < 10 ? 'only ' + j.tipranksCallsLeft + ' TipRanks calls left this month' : null)],
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
];
const problems = [], ok = [];
for (const [f, name, how, lim, check] of CHECKS) {
  const j = readJson(f); if (j === undefined) { if (!lim.optional) problems.push(name + ': its file is missing (' + f + '). It should update ' + how + '.'); continue; }
  const t = stamp(j); if (!t) { ok.push(name); continue; }
  const age = lim.biz ? bizHours(t) : (now - t) / 864e5, stale = lim.biz ? age > lim.biz : age > lim.days;
  if (stale) problems.push(name + ': last result ' + new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC; it should update ' + how + '. The job is probably failing.');
  else { const c = check ? check(j) : null; if (c) problems.push(name + ': ' + c); else ok.push(name); } }
const H = readJson('data/health.json') || {}, key = problems.join('|'), today = new Date().toISOString().slice(0, 10);
fs.writeFileSync('data/health.json', JSON.stringify({ at: new Date().toISOString(), ok: ok.length, problems, sentKey: H.sentKey, sentDay: H.sentDay }, null, 1));
console.log('health: ' + ok.length + ' fine, ' + problems.length + ' problems' + (problems.length ? '\n- ' + problems.join('\n- ') : ''));
// tell the owner once per day per set of problems (and once when everything is fine again)
const recovered = !problems.length && H.problems && H.problems.length;
if ((problems.length && (H.sentKey !== key || H.sentDay !== today)) || recovered) {
  const msg = problems.length ? ['SYSTEM HEALTH: ' + problems.length + ' problem' + (problems.length > 1 ? 's' : '') + ' (' + ok.length + ' parts fine)', '', ...problems.map(p => '- ' + p), '', 'Your ACTIONS may be missing information until this is fixed. Send this message to Claude.'] : ['SYSTEM HEALTH: all ' + ok.length + ' parts are running again.'];
  if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
  const J = readJson('data/health.json'); J.sentKey = key; J.sentDay = today; J.problems = problems; fs.writeFileSync('data/health.json', JSON.stringify(J, null, 1)); }
