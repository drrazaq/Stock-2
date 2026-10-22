// Seam: mergeNightlyPositions(atLoad, nightly) in scan.mjs (the end of the nightly scan, where it saves data/my-positions.json).
// Guards review S-1 (22 Oct): the bot runs on another runner and its buys, sales and stop changes reach the nightly job only through
// git. The merge re-read the job's own checkout (hours old), so a sold position came back and a stop the owner changed was lost.
// The merge must start from the NEWEST copy on origin/main and apply only the fields the nightly job changed (3-way against the copy
// it loaded); without git it falls back to the local file.
// Run: node test/positions-merge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadScan, blocked } from './load-scan.mjs';

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const GIT = '-c user.name=t -c user.email=t@t -c commit.gpgsign=false';
const POS = 'data/my-positions.json';
// what the nightly job loaded at its start (AAA and BBB held, both with a 35%-style stop)
const atLoad = { AAA: { entry: 10, since: '2026-10-01', stop: 8 }, BBB: { entry: 20, since: '2026-10-02', stop: 15 } };
// what the nightly job computed: it raised both stops
const nightly = () => ({ AAA: { entry: 10, since: '2026-10-01', stop: 9, raised: '2026-10-22' }, BBB: { entry: 20, since: '2026-10-02', stop: 16, raised: '2026-10-22' } });
// what the bot saved on origin while the scan ran: AAA sold, BBB stop moved by the owner to 17, CCC bought
const botCopy = { BBB: { entry: 20, since: '2026-10-02', stop: 17, own: true }, CCC: { entry: 5, since: '2026-10-22', stop: 4 } };

// the scan's folder becomes a clone whose origin/main has the bot's newer copy, while its own checkout still has the old one
function gitSetup(dir) {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'origin-')), other = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
  sh('git init -q -b main && git add -A && git ' + GIT + ' commit -qm load', dir);
  sh('git init -q --bare -b main ' + bare, dir);
  sh('git remote add origin ' + bare + ' && git push -q origin main', dir);
  sh('git clone -q ' + bare + ' ' + other, dir);
  fs.writeFileSync(path.join(other, POS), JSON.stringify(botCopy, null, 1));
  sh('git add -A && git ' + GIT + ' commit -qm bot && git push -q origin main', other);
}

test('the merge starts from the newest copy on origin: a sold position stays sold, the owner\'s stop stays his, a new buy stays', async () => {
  const S = await loadScan({ files: { [POS]: atLoad } });
  gitSetup(S.dir);
  const myPos = nightly();
  S.fn('mergeNightlyPositions')(atLoad, myPos);
  const saved = S.readJson(POS);
  assert.deepEqual(Object.keys(saved).sort(), ['BBB', 'CCC']);
  assert.equal(saved.BBB.stop, 17);
  assert.equal(saved.BBB.own, true);
  assert.equal(saved.CCC.stop, 4);
  // the rest of the nightly run sees the same positions as the file
  assert.deepEqual(myPos, saved);
});

test('a field the bot did not touch on origin takes the nightly value', async () => {
  const S = await loadScan({ files: { [POS]: atLoad } });
  gitSetup(S.dir);
  const myPos = nightly();
  S.fn('mergeNightlyPositions')(atLoad, myPos);
  // CCC is new and BBB's stop is the owner's, but BBB's `raised` stamp was not changed on origin: the nightly value is applied
  assert.equal(S.readJson(POS).BBB.raised, '2026-10-22');
});

test('without git (or no origin) the local file is the base, as before', async () => {
  const local = { AAA: { entry: 10, since: '2026-10-01', stop: 8 }, DDD: { entry: 7, since: '2026-10-21', stop: 6 } };
  const S = await loadScan({ files: { [POS]: local } });
  const myPos = nightly();
  S.fn('mergeNightlyPositions')(atLoad, myPos);
  const saved = S.readJson(POS);
  assert.deepEqual(Object.keys(saved).sort(), ['AAA', 'DDD']);
  assert.equal(saved.AAA.stop, 9);
  assert.equal(saved.DDD.stop, 6);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
