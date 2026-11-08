// Regression test (Agent A repair, 8 Nov 2026): autolab's library-status loop must skip library entries whose `rule` is plain text.
// On 8 Nov the Sunday study crashed in autolab.mjs with "TypeError: r.b is not iterable" on Agent C's text rules (C-INSQ1, C-CT1a ...),
// so the week's library statuses were not written. Each loop that reads e.rule.b must first check Array.isArray(e.rule.b).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../autolab.mjs', import.meta.url), 'utf8');

test('every autolab loop over library entries guards e.rule.b before using it', () => {
  const loops = src.split('\n').filter(l => /for \(const e of LIBR\.strategies/.test(l));
  assert.ok(loops.length >= 2, 'expected the libRules and status loops');
  for (const l of loops) if (/e\.rule\.b/.test(l)) assert.match(l, /Array\.isArray\(e\.rule\.b\)/, 'unguarded e.rule.b: ' + l.slice(0, 120));
});

test('the guard skips text rules and keeps block rules', () => {
  const keep = (e) => !(!e.rule || !Array.isArray(e.rule.b));
  assert.equal(keep({ id: 'C-INSQ1', rule: '2+ different insiders ...' }), false);
  assert.equal(keep({ id: 'X' }), false);
  assert.equal(keep({ id: 'LIB-1', rule: { b: ['tr200', 'pb12'], h: 20 } }), true);
});
