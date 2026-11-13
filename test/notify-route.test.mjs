// Row-5 notification routing (development only). Invariants:
// - default OFF: with NOTIFY_ROUTE unset every caller sends exactly as before;
// - only class QUIET is ever withheld; with routing enabled it is either durably stored privately or reported UNRETAINED (never pushed);
// - protective, BUY, plan, critical and owner-reply paths are never routed;
// - every routed caller is labelled explicitly and the labelled set is exactly the reviewed inventory.
// Synthetic fixtures only; no network beyond 127.0.0.1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { execFile } from 'node:child_process'; import { promisify } from 'node:util';
import { deliver, quietRoot, recordQuiet, NOTIFY_CLASSES, QUIET_LIMITS } from '../notify-route.mjs';
import { createEarlyAlerts } from '../early-alerts.mjs';
import { loadScan, blocked } from './load-scan.mjs';

const exec = promisify(execFile), root = path.resolve(import.meta.dirname, '..');
const privateRoot = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-private-')); fs.chmodSync(d, 0o700); return d; };
const rows = (dir) => fs.readdirSync(dir).filter(f => /^quiet-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)));
const ON = (r) => ({ NOTIFY_ROUTE: '1', NOTIFY_REPORT_ROOT: r });

test('default OFF: every class is sent unchanged and nothing is stored', async () => {
  const r = privateRoot();
  for (const cls of NOTIFY_CLASSES) { let n = 0; const out = await deliver({ cls, sender: 'unit:x', text: 'hi', send: () => { n++; return 'sent'; }, env: { NOTIFY_REPORT_ROOT: r }, log: () => {} }); assert.equal(out, 'sent'); assert.equal(n, 1); }
  assert.deepEqual(rows(r), []);
});

test('only QUIET is withheld; ACTION/PROTECT/PLAN/CRITICAL/REPLY always go to the sender', async () => {
  const r = privateRoot();
  for (const cls of NOTIFY_CLASSES.filter(c => c !== 'QUIET')) { let n = 0; await deliver({ cls, sender: 'unit:x', text: 'SELL', send: () => { n++; return { ok: true }; }, env: ON(r), log: () => {} }); assert.equal(n, 1, cls); }
  let n = 0; const out = await deliver({ cls: 'QUIET', sender: 'unit:quiet', text: 'study summary', send: () => { n++; }, env: ON(r), log: () => {} });
  assert.equal(n, 0); assert.deepEqual(out, { ok: true, routed: 'report', sender: 'unit:quiet' });
  const st = rows(r); assert.equal(st.length, 1); assert.equal(st[0].sender, 'unit:quiet'); assert.equal(st[0].text, 'study summary'); assert.equal(st[0].cls, 'QUIET');
  for (const f of fs.readdirSync(r)) assert.equal(fs.statSync(path.join(r, f)).mode & 0o777, 0o600);
  await assert.rejects(deliver({ cls: 'BUY', sender: 'unit:x', text: '', send: () => {}, env: ON(r) }), /unknown class/);
});

test('enabled routing never pushes QUIET on a bad store: missing, relative, checkout, group-readable or full roots are UNRETAINED, not sent', async () => {
  const cases = [{ NOTIFY_ROUTE: '1' }, { NOTIFY_ROUTE: '1', NOTIFY_REPORT_ROOT: 'relative/dir' }, ON(path.join(os.tmpdir(), 'notify-missing-' + process.pid)), ON(root)];
  const open = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-open-')); fs.chmodSync(open, 0o755); cases.push(ON(open));
  for (const env of cases) { let n = 0; const out = await deliver({ cls: 'QUIET', sender: 'unit:fallback', text: 't', send: () => { n++; }, env, cwd: root, log: () => {} }); assert.equal(n, 0, JSON.stringify(env)); assert.equal(out.ok, false); assert.equal(out.routed, 'unretained'); assert.ok(out.reason); }
  assert.equal(quietRoot(ON(root), root).reason, 'ROOT_INSIDE_CHECKOUT');
  assert.equal(quietRoot(ON(path.join(root, 'test')), root).reason, 'ROOT_INSIDE_CHECKOUT');
  const r = privateRoot(), limits = { ...QUIET_LIMITS, rowsPerDay: 2 };
  assert.equal(recordQuiet({ root: r, sender: 'unit:cap', text: 'a', limits }).stored, true);
  assert.equal(recordQuiet({ root: r, sender: 'unit:cap', text: 'b', limits }).stored, true);
  assert.deepEqual(recordQuiet({ root: r, sender: 'unit:cap', text: 'c', limits }), { stored: false, reason: 'STORE_FULL' });
  assert.equal(recordQuiet({ root: r, sender: 'Bad Sender!', text: 'x' }).reason, 'BAD_SENDER_ID');
  assert.deepEqual(recordQuiet({ root: privateRoot(), sender: 'unit:big', text: 'x'.repeat(QUIET_LIMITS.textBytes + 10) }), { stored: false, reason: 'TEXT_TOO_LARGE' }, 'oversized context is refused, never truncated and called retained');
  const tot = privateRoot(); assert.equal(recordQuiet({ root: tot, sender: 'unit:t', text: 'a', limits: { ...QUIET_LIMITS, totalBytes: 10 } }).reason, 'STORE_FULL', 'total retention bound');
  const lk = privateRoot(); fs.mkdirSync(path.join(lk, '.quiet.lock')); assert.equal(recordQuiet({ root: lk, sender: 'unit:l', text: 'a' }).reason, 'STORE_LOCKED', 'a held lock refuses instead of racing past the caps');
  const un = privateRoot(), uf = path.join(un, 'quiet-2026-11-13.jsonl'); fs.writeFileSync(uf, '{"partial"', { mode: 0o600 }); assert.equal(recordQuiet({ root: un, sender: 'unit:u', text: 'a', now: Date.parse('2026-11-13T12:00:00Z') }).reason, 'STORE_UNTERMINATED');
});

// Codex independent regressions (PR #1 comment 6849689610), verbatim intent: both FAILED on 40a4a2f1.
test('private report rejects checkout child whose name starts with two dots', () => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-review-')); try { const repo = path.join(top, 'repo'), p = path.join(repo, '..private'); fs.mkdirSync(p, { recursive: true, mode: 0o700 }); const r = quietRoot({ NOTIFY_REPORT_ROOT: p }, repo); assert.equal(r.root, null, 'report root remains inside checkout despite its name'); } finally { fs.rmSync(top, { recursive: true, force: true }); }
});
test('private report refuses a public hardlink and leaves that file untouched', () => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-review-')); try { const r = path.join(top, 'private'); fs.mkdirSync(r, { mode: 0o700 }); const pub = path.join(top, 'public.jsonl'); fs.writeFileSync(pub, ''); fs.chmodSync(pub, 0o644); fs.linkSync(pub, path.join(r, 'quiet-2026-11-13.jsonl')); const result = recordQuiet({ root: r, sender: 'review:x', text: 'synthetic-only', now: Date.parse('2026-11-13T12:00:00Z') }); assert.equal(result.stored, false, 'shared public inode cannot be a private report'); assert.equal(fs.readFileSync(pub, 'utf8'), ''); } finally { fs.rmSync(top, { recursive: true, force: true }); }
});
test('a 0600 single-owner hardlink is refused too (nlink check), and no lock directory is left behind', () => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-review-')); try { const r = path.join(top, 'private'); fs.mkdirSync(r, { mode: 0o700 }); const other = path.join(top, 'other.jsonl'); fs.writeFileSync(other, '', { mode: 0o600 }); fs.linkSync(other, path.join(r, 'quiet-2026-11-13.jsonl')); assert.equal(recordQuiet({ root: r, sender: 'review:y', text: 'z', now: Date.parse('2026-11-13T12:00:00Z') }).reason, 'STORE_UNSAFE_FILE'); assert.equal(fs.existsSync(path.join(r, '.quiet.lock')), false); } finally { fs.rmSync(top, { recursive: true, force: true }); }
});

test("the owner's explicit opt-in sends QUIET messages even when routing is on", async () => {
  const r = privateRoot(); let n = 0;
  await deliver({ cls: 'QUIET', sender: 'unit:optin', text: 't', ownerOptIn: true, send: () => { n++; }, env: ON(r), log: () => {} });
  assert.equal(n, 1); assert.deepEqual(rows(r), []);
});

test('labelled caller inventory: exactly the reviewed QUIET senders, no other class routed, protective paths untouched', () => {
  const files = fs.readdirSync(root).filter(f => f.endsWith('.mjs') && f !== 'notify-route.mjs');
  const found = [];
  for (const f of files) { const s = fs.readFileSync(path.join(root, f), 'utf8'); for (const m of s.matchAll(/deliver\(\{ cls: '([A-Z]+)', sender: '([^']+)'/g)) found.push(m[1] + ' ' + m[2] + ' @' + f); }
  assert.deepEqual(found.sort(), [
    'QUIET earnings-study:summary @earnings-study.mjs', 'QUIET events-study:summary @events-study.mjs', 'QUIET fastmover-lab:day-trade-list @fastmover-lab.mjs',
    'QUIET fastmover-lab:intraday-study @fastmover-lab.mjs', 'QUIET fastmover-lab:study @fastmover-lab.mjs', 'QUIET hunting-lab:study @hunting-lab.mjs',
    'QUIET ignition:early-alert @ignition-watch.mjs', 'QUIET ignition:fast-trade @ignition-watch.mjs', 'QUIET intraday-radar:review-buy @intraday-radar.mjs',
    'QUIET news-watch:market-news @news-watch.mjs', 'QUIET octopus:daily @octopus.mjs', 'QUIET opportunity-radar @opportunity-radar.mjs',
    'QUIET scan:options-weekly @scan.mjs', 'QUIET scan:sunday-scoreboard @scan.mjs', 'QUIET score-study:summary @score-study.mjs', 'QUIET winners-study:summary @winners-study.mjs'].sort());
  const ig = fs.readFileSync(path.join(root, 'ignition-watch.mjs'), 'utf8');
  assert.match(ig, /await tg\(h\.text,key\);/, 'the watcher stop route still calls the sender directly');
  const scan = fs.readFileSync(path.join(root, 'scan.mjs'), 'utf8');
  for (const line of scan.split('\n').filter(l => /deliver\(/.test(l))) assert.doesNotMatch(line, /BUY NOW|STOP|SELL|ACTIONS FOR THE NEXT SESSION|MORNING ACTIONS|WATCHDOG|reply/i);
  const nw = fs.readFileSync(path.join(root, 'news-watch.mjs'), 'utf8');
  assert.equal((nw.match(/deliver\(/g) || []).length, 1, 'NEWS DECISIONS (mixed SELL NOW) stays a direct send');
});

test('actual early-alert caller: a routed lead is recorded as REPORTED, never as SENT/delivered', async () => {
  const r = privateRoot(), tg = [];
  const EA = createEarlyAlerts({ day: '2026-10-29', level: 'all', now: () => 601, lottery: {}, record: {}, lab: {},
    send: (text) => deliver({ cls: 'QUIET', sender: 'ignition:early-alert', text, send: async () => { tg.push(text); return { ok: true }; }, env: ON(r), log: () => {} }),
    secRisk: async () => ({ known: true, tags: [] }), notHalal: () => false, halalOk: (s) => s === 'GOOD' });
  EA.noteLead({ sym: 'GOOD', m: 600, price: 12, chg: 0.04, score: 90, rvT: 3, dollarVol: 2e6, live: true }); await EA.process();
  assert.equal(tg.length, 0); assert.equal(rows(r).length, 1); assert.match(rows(r)[0].text, /RESEARCH LEAD/);
  assert.match(Object.values(EA.S.seen)[0].decision, /^REPORTED \(private report, not pushed\)$/);
});

async function stubTelegram() { const bodies = []; const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { bodies.push(b); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ ok: true, result: { message_id: bodies.length } })); }); }); await new Promise(r => server.listen(0, '127.0.0.1', r)); return { server, bodies, base: 'http://127.0.0.1:' + server.address().port }; }

test('actual opportunity-radar caller: OFF sends, ON stores privately and sends nothing, explicit radar on sends', async () => {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const snap = { day, at: '11:15', mode: 'live', scanned: 1, live: 1, tally: {}, sec: { ZZQ: { known: true, tags: [], instrument: { status: 'ELIGIBLE_COMMON_STOCK', securityId: 'SYNTHETIC001', referenceSha256: 'a'.repeat(64) } } }, hits: [{ sym: 'ZZQ', rule: 'IG1', m: 600, price: 10 }], early: [], now: { ZZQ: { px: 10.5, chg: 0.05 } } };
  const T = await stubTelegram();
  try {
    for (const c of [{ name: 'off', env: {}, settings: {}, expectTg: true }, { name: 'on', env: 'route', settings: {}, expectTg: false }, { name: 'optin', env: 'route', settings: { radar: true }, expectTg: true }]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-radar-')); fs.mkdirSync(path.join(dir, 'data'));
      for (const f of fs.readdirSync(root).filter(x => x.endsWith('.mjs'))) fs.copyFileSync(path.join(root, f), path.join(dir, f));
      fs.writeFileSync(path.join(dir, 'data/radar-v3-snap.json'), JSON.stringify(snap)); fs.writeFileSync(path.join(dir, 'data/settings.json'), JSON.stringify(c.settings));
      const pr = privateRoot(), before = T.bodies.length;
      const env = { PATH: process.env.PATH, TG_BASE: T.base, TG_TOKEN: 'synthetic', TG_CHAT: '42', ...(c.env === 'route' ? ON(pr) : {}) };
      await exec(process.execPath, ['opportunity-radar.mjs', 'midday'], { cwd: dir, env });
      assert.equal(T.bodies.length > before, c.expectTg, c.name);
      assert.equal(rows(pr).length, c.name === 'on' ? 1 : 0, c.name);
      if (c.name === 'on') { assert.equal(rows(pr)[0].sender, 'opportunity-radar'); assert.match(rows(pr)[0].text, /ZZQ/); }
      assert.deepEqual(fs.readdirSync(dir).filter(f => /^quiet-/.test(f)), [], 'nothing written into the checkout');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally { T.server.close(); }
});

test('actual scan caller: the Sunday scoreboard is stored privately when routing is on and sent when it is off', async () => {
  const sunday = Date.parse('2026-11-15T06:00:00Z');   // Sunday 09:00 Kuwait
  const T = await stubTelegram();
  try {
    for (const route of [false, true]) {
      const pr = privateRoot(), before = T.bodies.length;
      const S = await loadScan({ env: { TG_BASE: T.base, TG_TOKEN: 'synthetic', TG_CHAT: '42', ...(route ? ON(pr) : {}) }, files: { 'data/tg-state.json': { offset: 0 } } });
      await S.fn('sundayScoreboard')(sunday);
      assert.equal(T.bodies.length > before, !route, 'telegram when route=' + route);
      assert.equal(rows(pr).length, route ? 1 : 0); if (route) assert.equal(rows(pr)[0].sender, 'scan:sunday-scoreboard');
      assert.equal(JSON.parse(fs.readFileSync('data/tg-state.json', 'utf8')).scoreboardSent, '2026-11-15', 'sent-once marker kept either way');
    }
    assert.deepEqual(blocked, []);
  } finally { T.server.close(); }
});
