// HISTORY-03 regression harness: shared environment (reviewer: Claude). Synthetic and offline only.
// - REPO: the repository root (one level up from test), or HISTORY03_TREE to point at another checkout.
// - loadScan / blocked: the repository's own test loader (test/load-scan.mjs): scan.mjs loaded without running, network refused.
// - lift(): reuses the repository's own test fixtures verbatim (definitions before the first test() call of a test file).
// - src(): reads a source file of the tree for source-contract checks.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const REPO = path.resolve(process.env.HISTORY03_TREE || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
export const mod = (rel) => import(pathToFileURL(path.join(REPO, rel)).href);
export const { loadScan, blocked } = await mod('test/load-scan.mjs');
export const src = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
export async function lift(testFile, names) {
  const s = src(testFile), head = s.slice(0, s.indexOf('\ntest('));
  const body = head.split('\n').filter(l => !/^import (test|assert)\b/.test(l)).join('\n')
    .replace(/from '\.\.\/([^']+)'/g, (_, f) => 'from ' + JSON.stringify(pathToFileURL(path.join(REPO, f)).href))
    .replace(/from '\.\/([^']+)'/g, (_, f) => 'from ' + JSON.stringify(pathToFileURL(path.join(REPO, 'test', f)).href));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h03-fx-')), f = path.join(dir, path.basename(testFile));
  fs.writeFileSync(f, body + '\nexport { ' + names.join(', ') + ' };\n');
  return import(pathToFileURL(f).href);
}
// Synthetic research files shared by several tests (no market data, no owner data).
export const SYN = {
  rebuyBelowBar: { generatedAt: '2026-11-01T00:00:00Z', status: 'OK', from: '2022-01-06', to: '2026-07-22', versions: 6, tCrit: 2.64, results: {
    'STRETCH/LOWER10': { trigger: 'STRETCH', rebuy: 'LOWER10', name: 'stock 30%+ above its 50-day average -> sell, buy back 10% lower (or after 60 sessions)', verdict: 'BELOW THE LEAGUE BAR', why: 'synthetic',
      results: { older: { n: 100, adv: 0.04, t: 6, tBlock: 4, noTop2: 0.03, better: 0.7, cameBack: 0.7 }, newer: { n: 100, adv: 0.02, t: 5, tBlock: 3, noTop2: 0.015, better: 0.7, cameBack: 0.7 }, stress: { adv: 0.01 } } },
    'SPIKE/LOWER10': { trigger: 'SPIKE', rebuy: 'LOWER10', name: 'stock up 25%+ in 10 sessions -> sell, buy back 10% lower (or after 60 sessions)', verdict: 'NOT PROVEN', why: 'synthetic', results: { older: { n: 50, adv: 0, t: 0 }, newer: { n: 50, adv: 0, t: 0 } } } } },
};
