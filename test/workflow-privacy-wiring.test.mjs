// P0 Route A wiring (development): the nightly scan runs the two isolated passes; main and bot pull owner files fail-closed in private mode
// and save through the shared public-save privacy floor, with PRIVATE_SAVE_OK only after a verified private push. Static source checks.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const W = (f) => fs.readFileSync(path.resolve(import.meta.dirname, '..', '.github/workflows', f), 'utf8');
test('main.yml: daily mode runs scan-passes.mjs; private pull is fail-closed in private mode; save floor after private push', () => {
  const m = W('main.yml');
  assert.match(m, /if \[ "\$MODE" = daily \]; then node scan-passes\.mjs/);
  assert.match(m, /if \[ -e \.github\/private-data-mode \]; then bash \.github\/private-data\.sh pull && touch \"\$RUNNER_TEMP\/private-pulled-ok\"; else/);
  assert.match(m, /if \[ -e \.github\/private-data-mode \] && PRIVATE_DATA_TOKEN="\$PRIVATE_DATA_TOKEN" bash \.github\/private-data\.sh push; then PRIVATE_SAVE_OK=1; fi/);
  assert.match(m, /PRIVATE_SAVE_OK=\$PRIVATE_SAVE_OK bash \.github\/save-data\.sh/);
  assert.match(m, /hashFiles\('\.github\/private-data-mode'\) == ''/, 'mirror only before the cutover');
});
test('bot.yml: no private bytes through its own git add; it saves via save-data.sh with the same private-first rule', () => {
  const b = W('bot.yml');
  assert.doesNotMatch(b.split('accounting-preflight:')[0], /git add data/);
  assert.match(b, /PRIVATE_SAVE_OK=\$PRIVATE_SAVE_OK SAVE_SLEEP=5 bash \.github\/save-data\.sh "bot/);
  assert.match(b, /bash \.github\/private-data\.sh pull >> run\.log 2>&1 \|\| pr=\$\?/);   // every cycle pulls; exit 3 pauses owner commands, any other failure skips the cycle
  assert.match(b, /elif \[ "\$pr" != 0 \]; then echo "Error: private owner files unavailable; cycle skipped"/);
  assert.match(b, /git pull -q --rebase --autostash/);
});
