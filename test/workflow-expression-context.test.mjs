// GitHub status-check functions (success/failure/always/cancelled) are only valid in `if:` conditions. Anywhere else (run, env, with)
// GitHub rejects the whole workflow file and the workflow never starts (found 14 Nov: 66 dev-branch workflows invalid since 1d82a514).
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import path from 'node:path';
const WF = path.resolve(import.meta.dirname, '../.github/workflows');
test('status-check functions appear only in if: conditions', () => {
  const bad = [];
  for (const f of fs.readdirSync(WF).filter(x => /\.ya?ml$/.test(x))) fs.readFileSync(path.join(WF, f), 'utf8').split('\n').forEach((l, i) => {
    for (const m of l.matchAll(/\$\{\{([^}]*)\}\}/g)) if (/\b(success|failure|always|cancelled)\s*\(\s*\)/.test(m[1]) && !/^\s*(-\s+)?if:/.test(l)) bad.push(f + ':' + (i + 1));
  });
  assert.deepEqual(bad, []);
});
