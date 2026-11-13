// P0 Route A (development): the WHOLE public data/signals.json is invariant to the owner's private state (ZAD marks, private watch list,
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
    S.value('LIST').splice(0, S.value('LIST').length, 'SPY', 'ZZP', ...p.extra); await S.fn('daily')();
    const raw = fs.readFileSync('data/signals.json', 'utf8'), pub = JSON.parse(raw), priv = JSON.parse(fs.readFileSync('data/signals-private.json', 'utf8'));
    const { generatedAt, ...rest } = pub;
    return { raw, pub, rest, priv, hydrated: S.fn('hydrateSignals')(pub), S };
  } finally { console.log = oldLog; server.closeAllConnections(); server.close(); }
}
const held = { entry: 12, stop: 11, src: 'try small', kind: 'manual', since: '2026-11-06', tryHold: 63 };
const dip = { entry: 8, target: 9.6, src: 'leader dip', kind: 'leader dip', since: '2026-11-06', boughtSession: '2026-11-06', ldHold: 126 };
test('whole public signals.json is invariant to private marks, watch list and holdings (full histories)', async () => {
  const a = await world({ extra: [], marks: { ZZP: { s: 'ok' } }, positions: {} });
  const b = await world({ extra: ['ZZQ'], marks: { ZZP: { s: 'fail' }, ZZQ: { s: 'ok' } }, positions: { ZZP: { ...held, entry: 30, stop: 25 }, ZZR: { ...held } }, tips: [{ sym: 'ZZP', d: '2026-11-03', src: 'synthetic source', px: 10 }] });
  const c = await world({ extra: ['ZZT'], marks: {}, positions: { ZZR: dip, ZZT: held } });
  const d = await world({ extra: [], marks: { ZZP: { s: 'fail' } }, positions: {} });
  for (const v of [b, c, d]) assert.deepEqual(v.rest, a.rest);
  for (const v of [a, b, c, d]) {
    for (const k of ['posVerdict', 'tipBoard', 'leaders', 'pead', 'evt', 'peadFunnel']) { assert.equal(k in v.pub, false, k + ' is never public'); assert.ok(k in v.hydrated, k + ' comes back through private hydration'); }
    assert.doesNotMatch(v.raw, /ZZQ|ZZR|ZZS|ZZT/, 'no private-only name appears anywhere in the public file');
    assert.equal(v.pub.stocks.some(x => 'halal' in x), false);
    assert.ok(v.pub.stocks.some(x => x.sym === 'ZZP' && !x.diagnosticOnly), 'the public name is scored publicly');
    assert.equal(v.priv.v, 1); assert.equal(v.priv.session, v.pub.session); assert.equal(v.priv.generatedAt, v.pub.generatedAt);
    assert.equal(v.hydrated.posVerdictUnavailable, undefined); assert.deepEqual(v.hydrated.posVerdict, v.priv.posVerdict);
  }
  assert.ok(Object.keys(b.priv.posVerdict).length > 0, 'held stocks still get their private exit verdicts');
  const pc = (v) => v.S.fn('planCands')(v.hydrated, {}).filter(x => x.ok && x.sym === 'ZZP').length;
  assert.equal(pc(d), 0, 'a private NOT HALAL mark still blocks every offer privately');
  assert.match(a.pub.stocks.find(x => x.sym === 'ZZP').why, /signal fired/i, 'the dip rule fired, so the signal path was exercised');
  assert.deepEqual(blocked, []);
});
test('unpaired or missing private record: readers get posVerdictUnavailable, the scan is not current, and no HOLD is inferred', async () => {
  const S = await loadScan({ files: { 'data/signals.json': { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z', stocks: [] }, 'data/signals-private.json': { v: 1, session: '2026-11-12', generatedAt: '2026-11-12T21:39:59.000Z', posVerdict: { ZZP: 'closed at or below your stop 11.00.' } } } });
  const sig = S.fn('hydrateSignals')(JSON.parse(fs.readFileSync('data/signals.json', 'utf8')));
  assert.equal(sig.posVerdictUnavailable, true); assert.equal(sig.posVerdict, undefined);
  assert.equal(S.fn('scanCloseCurrent')(sig, Date.parse('2026-11-13T12:00:00Z')), false);
  const act = S.fn('holdingAction')('ZZP', { entry: 12, stop: 11 }, { price: 12.5, t: Date.parse('2026-11-13T15:00:00Z') }, sig, Date.parse('2026-11-13T15:01:00Z'));
  assert.notEqual(act.act, 'HOLD'); assert.match(act.line, /EXIT RECORD UNKNOWN|UNKNOWN/);
  const kept = S.fn('holdingAction')('ZZP', { entry: 12, stop: 11, lastAct: { act: 'SELL', d: '2026-11-11', why: 'time exit' } }, { price: 12.5, t: Date.parse('2026-11-13T15:00:00Z') }, sig, Date.parse('2026-11-13T15:01:00Z'));
  assert.equal(kept.act, 'SELL', 'a retained earlier SELL is never erased by an unavailable private record');
  fs.rmSync('data/signals-private.json'); const sig2 = S.fn('hydrateSignals')(JSON.parse(fs.readFileSync('data/signals.json', 'utf8')));
  assert.equal(sig2.posVerdictUnavailable, true);
  const legacy = S.fn('hydrateSignals')({ session: 'x', posVerdict: { ZZP: 'time exit' } }); assert.equal(legacy.posVerdict, undefined, 'a public posVerdict is never current'); assert.equal(legacy.posVerdictUnavailable, true); assert.equal(legacy.posVerdictSource, 'LEGACY_PUBLIC_NOT_CURRENT');
});

test('the public row gate uses only ZAD\'s public list; the private mark gates the owner copy (gate function on an actionable verdict)', async () => {
  const S = await loadScan({ files: {} }); const L = S.value('L'), v0 = { act: true, word: 'Buy watch', why: 'A tested rule fired.' };
  const priv = L.applyGates(v0, { dollarVol: 5e6, halal: 'fail', limit: null }), pub = L.applyGates(v0, { dollarVol: 5e6, halal: 'unknown', limit: null });
  assert.match(priv.why, /not halal/i); assert.equal(priv.act, undefined);
  assert.equal(pub.act, true); assert.doesNotMatch(pub.why, /halal/i);
  const src = fs.readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8');
  assert.match(src, /vPub = L\.applyGates\(v0, \{ dollarVol: T\.dollarVol, halal: ZAD_PUBLIC_NOT\.has\(sym\) \? 'fail' : 'unknown', limit: null \}\)/);
  assert.match(src, /pub\.state = vPub\.word; pub\.why = vPub\.why; if \(vPub\.act\) Object\.assign\(pub, buyF\(\)\)/);
});

test('shared reader: news-watch and events-study read private buy lists only through pairing (no guessing from an older record)', async () => {
  const { hydrateSignals } = await import('../signals-read.mjs');
  const pub = { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z', stocks: [] };
  assert.deepEqual(hydrateSignals(pub, () => ({ v: 1, session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z', posVerdict: {}, pead: [{ sym: 'ZZP', live: true }] })).pead, [{ sym: 'ZZP', live: true }]);
  const stale = hydrateSignals(pub, () => ({ v: 1, session: '2026-11-12', generatedAt: '2026-11-11T21:40:00.000Z', posVerdict: {}, pead: [{ sym: 'ZZP' }] }));
  assert.equal(stale.posVerdictUnavailable, true); assert.equal(stale.pead, undefined);
  for (const f of ['news-watch.mjs', 'events-study.mjs']) assert.match(fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'), /readSignals\(\) \|\| \{\}/, f + ' uses the paired reader');
});

// Codex independent reader controls (PR #1 comment 6850181969), all FAILED on 9a204065.
const stamp = { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z' }, unavailable = () => { throw Error('synthetic unavailable'); };
test('missing private read cannot treat legacy public exit fields as current hydration', async () => { const { hydrateSignals } = await import('../signals-read.mjs'); const out = hydrateSignals({ ...stamp, posVerdict: { ZZQ: 'time exit' } }, unavailable); assert.equal(out.posVerdictUnavailable, true); assert.equal(out.posVerdict, undefined); });
test('unavailable private record removes every private-only legacy public list', async () => { const { hydrateSignals } = await import('../signals-read.mjs'); const out = hydrateSignals({ ...stamp, leaders: [{ sym: 'ZZQ' }], pead: [{ sym: 'ZZQ', live: true }], evt: [{ sym: 'ZZQ', live: true }] }, unavailable); assert.equal(out.posVerdictUnavailable, true); for (const k of ['leaders', 'pead', 'evt']) assert.equal(out[k], undefined, k); });
test('absent pair clocks never form an authenticated matching scan', async () => { const { hydrateSignals } = await import('../signals-read.mjs'); const out = hydrateSignals({ stocks: [] }, () => ({ v: 1, posVerdict: { ZZQ: 'time exit' } })); assert.equal(out.posVerdictUnavailable, true); assert.equal(out.posVerdict, undefined); });
test('malformed private list cannot be hydrated as a current assessment', async () => { const { hydrateSignals } = await import('../signals-read.mjs'); const out = hydrateSignals({ ...stamp }, () => ({ v: 1, ...stamp, posVerdict: {}, pead: 'malformed' })); assert.equal(out.posVerdictUnavailable, true); assert.equal(out.pead, undefined); });

test('malformed verdict values, bad clocks and oversized lists fail closed; valid records still pair', async () => {
  const { hydrateSignals } = await import('../signals-read.mjs'); const st = { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z' };
  for (const bad of [{ posVerdict: { ZZQ: {} } }, { posVerdict: { ZZQ: '' } }, { posVerdict: { 'not a symbol': 'x' } }, { posVerdict: {}, pead: [{}] }, { posVerdict: {}, leaders: Array.from({ length: 5001 }, () => ({ sym: 'ZZQ' })) }])
    assert.equal(hydrateSignals({ ...st }, () => ({ v: 1, ...st, ...bad })).posVerdictUnavailable, true, JSON.stringify(bad).slice(0, 60));
  for (const clocks of [{ session: 'garbage', generatedAt: 'garbage' }, { session: '2026-11-12', generatedAt: 'not-a-time' }]) assert.equal(hydrateSignals({ ...clocks }, () => ({ v: 1, ...clocks, posVerdict: {} })).posVerdictUnavailable, true);
  const ok = hydrateSignals({ ...st }, () => ({ v: 1, ...st, posVerdict: { ZZQ: 'time exit' }, pead: [{ sym: 'ZZQ', live: true }] }));
  assert.equal(ok.posVerdictUnavailable, undefined); assert.equal(ok.posVerdict.ZZQ, 'time exit');
});
test('legacy-only saved exit (no private record, no lastAct) is kept as HISTORICAL reconciliation, never current, never a new SELL', async () => {
  const S = await loadScan({ files: { 'data/signals.json': { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000Z', stocks: [], posVerdict: { ZZP: 'time exit after 126 sessions' } } } });
  const sig = S.fn('hydrateSignals')(JSON.parse(fs.readFileSync('data/signals.json', 'utf8')));
  assert.equal(sig.posVerdict, undefined); assert.equal(sig.posVerdictUnavailable, true); assert.equal(sig.legacyExitHistory.exits.ZZP, 'time exit after 126 sessions');
  const a = S.fn('holdingAction')('ZZP', { entry: 12 }, { price: 12.5, t: Date.parse('2026-11-13T15:00:00Z') }, sig, Date.parse('2026-11-13T15:01:00Z'));
  assert.equal(a.act, 'UNKNOWN'); assert.match(a.line, /HISTORICAL RECORDED EXIT \(legacy scan, session 2026-11-12\): time exit after 126 sessions\. .*reconcile it with your broker.*no new sale is instructed/);
  assert.doesNotMatch(a.line, /^ZZP: SELL/);
  assert.match(S.fn('retainedHoldingContext')('ZZP', { entry: 12 }, sig), /HISTORICAL RECORDED EXIT/);
});
