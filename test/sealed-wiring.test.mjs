// R1 wiring (static, offline): every code path, workflow, log and website channel that could publish T1 provider data in plaintext.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isT1 } from '../sealed-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const R = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const WF = fs.readdirSync(path.join(ROOT, '.github/workflows')).filter((f) => f.endsWith('.yml'));
const wf = (f) => R('.github/workflows/' + f);
// literal names of the T1 families as they appear in code
const T1_LITERAL = /['"`](?:data\/)?(?:opp-ledger\.jsonl|premarket\.jsonl|early-wave-obs\.jsonl|ignition-missed-history\.jsonl|movers-journal\.jsonl|ignition-live\.json|fastmover-live\.json|movers-state\.json|options-shadow\.json|options-spread-survey\.(?:json|md))['"`]|['"`]data\/shadow['"`/]|['"`]data\/ignition-runs['"`/]|analyst-archive-/;
const MODULES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.mjs') && !/^sealed-/.test(f));

test('no module reads or writes a T1 file with plain fs calls (only through sealed-store)', () => {
  const bad = [];
  for (const m of MODULES) R(m).split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return;
    for (const call of line.matchAll(/fs\.(writeFileSync|appendFileSync|readFileSync|renameSync|createWriteStream|copyFileSync)\(([^;]{0,200})/g))
      if (T1_LITERAL.test(call[2])) bad.push(m + ':' + (i + 1) + ' ' + call[1]);
  });
  assert.deepEqual(bad, []);
  for (const m of ['ignition-watch.mjs', 'missed-runners.mjs', 'shadow-outcomes.mjs', 'watcher-reporting.mjs', 'scorecard-1023.mjs', 'health.mjs', 'scan.mjs', 'movers.mjs', 'fastmover-lab.mjs', 'options-survey.mjs', 'smart-money.mjs'])
    assert.match(R(m), /from '\.\/sealed-store\.mjs'/, m + ' uses the sealed store');
});

test('indirect writers: variables holding T1 paths are only written through sealed-store calls', () => {
  // missed-runners HIST, fastmover-lab LIVE, movers JF, smart-money F (analyst archive), ignition-watch per-run archive names
  assert.doesNotMatch(R('missed-runners.mjs'), /fs\.(append|write)FileSync\(HIST/);
  assert.doesNotMatch(R('fastmover-lab.mjs'), /fs\.writeFileSync\(LIVE/);
  assert.doesNotMatch(R('movers.mjs'), /fs\.(append|write)FileSync\(JF/);
  assert.doesNotMatch(R('smart-money.mjs'), /fs\.writeFileSync\(F,/);
  assert.doesNotMatch(R('ignition-watch.mjs'), /fs\.writeFileSync\((?:incidentArchive|dir)\s*\+/);
  assert.doesNotMatch(R('ignition-watch.mjs'), /fs\.writeFileSync\(tmp,/, 'progress archive no longer written in plaintext');
});

test('public Actions logs: no per-stock option quotes, survey summary, or analyst/price message text is printed', () => {
  const os = R('options-survey.mjs'), sm = R('smart-money.mjs');
  assert.doesNotMatch(os, /console\.log\(p\.s\.padEnd/); assert.doesNotMatch(os, /console\.log\(JSON\.stringify\(S/);
  assert.doesNotMatch(sm, /^console\.log\(text\);/m);
  assert.match(sm, /content not printed: Actions logs of this repository are public/);
});

const KEYED = { 'ignition.yml': 3, 'opportunity-radar.yml': 1, 'options-survey.yml': 2, 'Smart-money.yml': 2, 'movers.yml': 3, 'leaders-study.yml': 2, 'main.yml': 2, 'bot.yml': 2, 'scorecard-1023.yml': 1, 'r1-migrate.yml': 1 };
test('the key reaches exactly the steps that read/write T1 or merge sealed files (step env, never job-wide, never echoed)', () => {
  for (const f of WF) {
    const s = wf(f), n = (s.match(/SEALED_SECRET: \$\{\{ secrets\.PRIVATE_KEY \}\}/g) || []).length;
    assert.equal(n, KEYED[f] || 0, f);
    assert.doesNotMatch(s, /echo[^\n]*SEALED_SECRET|\$SEALED_SECRET|\$\{SEALED_SECRET/, f);
    if (n) assert.doesNotMatch(s.split('steps:')[0], /SEALED_SECRET/, f + ': not job-level');
  }
  assert.doesNotMatch(wf('fastmover-intraday.yml'), /SEALED_SECRET/, 'intraday/study modes never touch T1');
});

const STAGERS = ['ignition.yml', 'options-survey.yml', 'Smart-money.yml', 'movers.yml', 'leaders-study.yml'];
test('every workflow save that can carry T1 changes registers the sealed merge driver and runs the guard before committing', () => {
  for (const f of STAGERS) {
    const s = wf(f); assert.match(s, /source \.github\/sealed-git\.sh/, f);
    const g = s.indexOf('sealed_guard'), c = s.indexOf('git commit', s.indexOf('source .github/sealed-git.sh'));
    assert.ok(g > 0 && c > g, f + ': guard before commit');
  }
  const sd = R('.github/save-data.sh');
  assert.match(sd, /source "\$\(dirname "\$0"\)\/sealed-git\.sh"/); assert.ok(sd.indexOf('sealed_guard') < sd.indexOf('git commit'));
  assert.match(sd, /\*\.sealed\) echo "sealed file still in conflict/, 'never byte-merges a sealed file');
  assert.match(wf('main.yml'), /save-data\.sh/);
  // the other broad `git add data` workflows run no T1 writer, so they can only stage T1 if another tool put a plaintext copy there
  const WRITERS = /node (?:ignition-watch|missed-runners|movers|options-survey|smart-money|scan)\.mjs|MODE=live node fastmover-lab\.mjs/;
  for (const f of WF.filter((f) => /git add (?:-A )?data(?:\s|$|;)/m.test(wf(f)) && !STAGERS.includes(f))) assert.doesNotMatch(wf(f), WRITERS, f);
});

test('explicit stage lists use sealed_stage (addition + deletion) for T1 names; no plaintext T1 name is git-added directly', () => {
  for (const f of WF) for (const line of wf(f).split('\n')) {
    if (!/git add/.test(line) || /sealed_stage|sealed-git/.test(line)) continue;
    for (const m of line.matchAll(/data\/[\w./-]+/g)) assert.ok(!isT1(m[0]), f + ': ' + m[0]);
    assert.doesNotMatch(line, /git add data\/(shadow|ignition-runs)(\s|;|$)/, f);
  }
  assert.match(wf('ignition.yml'), /sealed_stage data\/shadow data\/ignition-runs/);
  assert.match(wf('options-survey.yml'), /sealed_stage data\/options-spread-survey\.json data\/options-spread-survey\.json\.sealed data\/options-spread-survey\.md data\/options-spread-survey\.md\.sealed/);
  assert.match(wf('leaders-study.yml'), /data\/ignition-missed-history\.jsonl\.sealed/); assert.match(wf('leaders-study.yml'), /node sealed-merge\.mjs "\$BASED\/\$f" "\$f" "\$OUTD\/\$f" "\$f"/);
});

test('watcher artifact: the only T1 path uploaded is data/ignition-runs/, which now holds sealed files only', () => {
  const s = wf('ignition.yml'), block = s.slice(s.indexOf('upload-artifact'));
  const paths = [...block.matchAll(/^\s+(data\/[^\s]+|runtime\/[^\s]+)$/gm)].map((m) => m[1]);
  assert.deepEqual(paths.filter((p) => isT1(p) || /ignition-runs|shadow\//.test(p)), ['data/ignition-runs/']);
});

test('website: index.html fetches signals.json and discovery.json only (T2), and names no T1 file or sealed file', () => {
  const h = R('index.html');
  assert.match(h, /fetch\(url\.replace\('signals\.json', 'discovery\.json'\)/);
  assert.doesNotMatch(h, T1_LITERAL); assert.doesNotMatch(h, /\.sealed\b/);
  assert.match(wf('pages.yml'), /index\.html/);
});

test('migration workflow: manual dispatch only, exact confirmation, approved source checkout, fast-forward push, tree receipt; no schedule', () => {
  const s = wf('r1-migrate.yml');
  assert.doesNotMatch(s, /schedule:|push:\n/); assert.match(s, /github\.event\.inputs\.confirm == 'MIGRATE-R1'/);
  assert.match(s, /ref: \$\{\{ github\.event\.inputs\.source_sha \}\}/); assert.match(s, /--apply "\$SOURCE_SHA"/);
  assert.ok(s.indexOf('--apply') < s.indexOf('sealed-guard.mjs --all') && s.indexOf('sealed-guard.mjs --all') < s.indexOf('git commit'));
  assert.doesNotMatch(s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n'), /git pull|rebase|for i in/, 'no rebase onto newer data and no retry');
  assert.match(s, /git push -q origin HEAD:refs\/heads\/main/); assert.match(s, /--verify-tree origin\/main/);
});

test('every push is preceded by the push-time guard on the reconciled tree (Codex re-review 5)', () => {
  for (const f of ['ignition.yml', 'options-survey.yml', 'Smart-money.yml', 'movers.yml', 'leaders-study.yml']) {
    const s = wf(f); for (const line of s.split('\n').filter((l) => /git push/.test(l))) assert.match(line, /sealed_push_guard && git push/, f);
  }
  assert.match(R('.github/save-data.sh'), /pull && sealed_push_guard && git push -q/);
  assert.match(R('.github/bot-save.sh'), /git pull -q --rebase -X theirs && sealed_push_guard && git push -q/);
  assert.match(wf('bot.yml'), /source \.github\/bot-save\.sh/);
});

test('.gitattributes keeps sealed files out of text merge and diff', () => {
  assert.match(R('.gitattributes'), /^\*\.sealed -text -diff merge=sealed$/m);
});

test('inventory reconciliation: the 45 tracked T1 paths at b0d76987 (D2 34 + 11 same-family) all match the sealed patterns', () => {
  const rows = R('docs/r1-sealed-provider-data/t1-inventory.tsv').trim().split('\n').slice(1).map((l) => l.split('\t'));
  assert.equal(rows.length, 45);
  assert.equal(rows.filter((r) => r[1] === 'D2').length, 34);
  for (const r of rows) assert.ok(isT1(r[0]), r[0]);
});

test('rev4 save recovery: every save path pushes to a recovery branch on final failure; the bot merges them; temp files are ignored', () => {
  for (const f of ['ignition.yml', 'options-survey.yml', 'movers.yml', 'leaders-study.yml', 'Smart-money.yml']) assert.match(wf(f), /\[ "\$ok" = 1 \] \|\| \{[^\n]*sealed_recovery_push \|\| true; exit 1; \}/, f);
  assert.match(R('.github/save-data.sh'), /sealed_recovery_push \|\| true; exit 1; \}/);
  assert.match(R('.github/bot-save.sh'), /sealed_recovery_push 2>&1/); assert.match(R('.github/bot-save.sh'), /bot_recover\(\)/);
  const b = wf('bot.yml'); assert.match(b, /bot_recover   # R1 rev4/);
  const fin = b.indexOf('the last chance to publish what the bot recorded'); assert.ok(fin > 0 && b.indexOf('- if: always()', fin) > fin, 'final always() save step');
  assert.match(R('.gitignore'), /^\*\.sealed\.tmp-\*$/m);
});
