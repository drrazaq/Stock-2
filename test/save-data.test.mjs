// Seam: .github/save-data.sh (the save step of the nightly scan in main.yml: commit data/, pull --rebase, push, 5 tries).
// Guards review S-1 (22 Oct): the step used `git pull --rebase -X theirs`, so on a conflicting hunk the nightly job's stale copy of
// the owner's files (data/my-positions.json, data/my-trades.jsonl, data/tg-state.json) won over what the bot had saved meanwhile.
// Now, on a conflict, those three files keep the copy on origin (the bot's) hunk by hunk; every other file keeps the job's copy, as
// -X theirs did. Hunks that do not conflict are kept from both sides, as before.
// Run: node test/save-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'save-data.sh');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', SAVE_SLEEP: '0' };
const sh = (cmd, cwd) => execSync(cmd, { cwd, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const R = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const lines = (...a) => a.join('\n') + '\n';

// origin starts with the files; the job clones it (the nightly checkout), then the bot pushes its own changes while the job runs
function setup(base, bot) {
  const bare = tmp('origin-'), seed = tmp('seed-'), job = tmp('job-'), other = tmp('bot-');
  sh('git init -q --bare -b main ' + bare, seed);
  sh('git init -q -b main && git -c commit.gpgsign=false commit -q --allow-empty -m init', seed);
  for (const [f, s] of Object.entries(base)) W(seed, f, s);
  sh('git add -A && git -c commit.gpgsign=false commit -qm base && git remote add origin ' + bare + ' && git push -q origin main', seed);
  sh('git clone -q ' + bare + ' ' + job, seed); sh('git clone -q ' + bare + ' ' + other, seed);
  for (const [f, s] of Object.entries(bot)) W(other, f, s);
  sh('git add -A && git -c commit.gpgsign=false commit -qm bot && git push -q origin main', other);
  return { bare, job };
}
const originFile = (bare, f) => sh('git --git-dir=' + bare + ' show main:' + f, os.tmpdir());

const POS0 = lines('{', ' "AAA": {', '  "stop": 8', ' },', ' "x1": 1,', ' "x2": 2,', ' "x3": 3,', ' "x4": 4,', ' "BBB": {', '  "stop": 15', ' }', '}');

test('on a conflicting hunk the owner\'s positions keep the bot\'s copy on origin, not the job\'s stale one', () => {
  const { bare, job } = setup({ 'data/my-positions.json': POS0 },
    { 'data/my-positions.json': POS0.replace('"stop": 8', '"stop": 7.5') });             // the owner moved AAA's stop to 7.5
  W(job, 'data/my-positions.json', POS0.replace('"stop": 8', '"stop": 9').replace('"stop": 15', '"stop": 16'));   // the job raised both
  sh('bash ' + SCRIPT + ' "scan test"', job);
  const got = originFile(bare, 'data/my-positions.json');
  assert.match(got, /"stop": 7\.5/);      // the conflicting hunk: the owner's stop
  assert.match(got, /"stop": 16/);        // a hunk that did not conflict: the job's raise is kept
  assert.doesNotMatch(got, /"stop": 9/);
});

test('the owner\'s trades and the bot state keep origin\'s copy on a conflict', () => {
  const { bare, job } = setup({ 'data/my-trades.jsonl': lines('{"sym":"AAA"}'), 'data/tg-state.json': '{"offset":1}\n' },
    { 'data/my-trades.jsonl': lines('{"sym":"AAA"}', '{"sym":"BBB","sold":20}'), 'data/tg-state.json': '{"offset":5}\n' });
  W(job, 'data/my-trades.jsonl', lines('{"sym":"AAA"}', '{"sym":"OLD"}'));
  W(job, 'data/tg-state.json', '{"offset":2}\n');
  sh('bash ' + SCRIPT + ' "scan test"', job);
  assert.equal(originFile(bare, 'data/my-trades.jsonl'), lines('{"sym":"AAA"}', '{"sym":"BBB","sold":20}'));
  assert.equal(originFile(bare, 'data/tg-state.json'), '{"offset":5}\n');
});

test('control: any other data file still keeps the job\'s copy on a conflict (as -X theirs did)', () => {
  const { bare, job } = setup({ 'data/signals.json': '{"v":1}\n' }, { 'data/signals.json': '{"v":2}\n' });
  W(job, 'data/signals.json', '{"v":3}\n');
  sh('bash ' + SCRIPT + ' "scan test"', job);
  assert.equal(originFile(bare, 'data/signals.json'), '{"v":3}\n');
});

test('control: with no conflict both sides are kept and the commit carries the message', () => {
  const { bare, job } = setup({ 'data/a.json': '1\n', 'data/b.json': '1\n' }, { 'data/a.json': '2\n' });
  W(job, 'data/b.json', '3\n');
  sh('bash ' + SCRIPT + ' "scan test"', job);
  assert.equal(originFile(bare, 'data/a.json'), '2\n');
  assert.equal(originFile(bare, 'data/b.json'), '3\n');
  assert.match(sh('git --git-dir=' + bare + ' log -1 --format=%s main', os.tmpdir()), /scan test/);
});
