// P0 Route A ACCEPTANCE (Codex PR #1 comments 6850096925/6850067038; open until the two-pass scan): the WHOLE public data/signals.json is invariant to the owner's private state (ZAD marks, private watch list,
// holdings), using full price histories so regular scored rows, gates and per-symbol lists are exercised; the owner-derived fields
// (posVerdict, tipBoard, leaders, pead, evt, peadFunnel) exist only in the private data/signals-private.json, paired to the same scan. Synthetic fixtures only.
import test from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http'; import fs from 'node:fs';
import { loadScan, blocked } from './load-scan.mjs';
const bars = []; let i = 0;
for (let d = new Date('2023-01-02T00:00:00Z'); d <= new Date('2026-11-10T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) if (![0, 6].includes(d.getUTCDay())) {
  const c = 10 * (1 + 0.0009 * i) * (1 + 0.04 * Math.sin(i / 7)); i++;
  bars.push({ datetime: d.toISOString().slice(0, 10), open: c.toFixed(4), high: (c * 1.01).toFixed(4), low: (c * 0.99).toFixed(4), close: c.toFixed(4), volume: '3000000' }); }
{ // the last bar closes back above the 20-day average after the dip, so the tested dip rule fires and the gates are exercised
  const last = bars[bars.length - 1], top = Math.max(...bars.slice(-21, -1).map(b => +b.close)) * 1.02; Object.assign(last, { open: (top * 0.99).toFixed(4), high: (top * 1.01).toFixed(4), low: (top * 0.98).toFixed(4), close: top.toFixed(4) }); }
async function world(p) {
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); const u = new URL(req.url, 'http://local'); res.end(JSON.stringify(u.pathname === '/time_series' ? { status: 'ok', values: bars.slice(-900) } : {})); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const oldLog = console.log; console.log = () => {};
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const S = await loadScan({ env: { TD_BASE: base, FH_BASE: base, SEC_BASE: base, NO_CROWD: '1', RATE: '10000', FORCE: '1', NO_WIDE: '1' }, files: { 'watchlist.txt': 'SPY ZZP\n', 'data/watch-extra.json': p.extra, 'data/halal.json': p.marks, 'data/my-positions.json': p.positions, 'data/tips.jsonl': p.tips || [] } });
    S.value('LIST').splice(0, S.value('LIST').length, 'SPY', 'ZZP', 'ABBV', ...p.extra); await S.fn('daily')();
    const raw = fs.readFileSync('data/signals.json', 'utf8'), pub = JSON.parse(raw), priv = JSON.parse(fs.readFileSync('data/signals-private.json', 'utf8'));
    const { generatedAt, ...rest } = pub;
    return { raw, pub, rest, priv, hydrated: S.fn('hydrateSignals')(pub), S };
  } finally { console.log = oldLog; server.closeAllConnections(); server.close(); }
}

// Known open defect, reproduced by Codex on de8362e0: a private extra name that is also a fixed public quick-extra source changes public
// membership/counts. Marked TODO (reported, not hidden) until the public pass is computed from public sources only; then remove `todo`.
test('public source membership survives overlap with private extra names', { todo: 'P0 two-pass scan pending (6850152361)' }, async () => {
  const a = await world({ extra: [], marks: {}, positions: {} }), b = await world({ extra: ['ABBV'], marks: {}, positions: {} });
  assert.ok(a.S.value('QEXTRA').includes('ABBV'), 'baseline includes the fixed public quick-extra source');
  assert.deepEqual(b.rest, a.rest, 'whole public file invariant to a private extra that overlaps a public source');
});
