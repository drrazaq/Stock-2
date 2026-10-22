// IGNITION PAPER SCORING: the watcher's ignitions of earlier days (data/ignition-paper.jsonl), scored on minute bars exactly like the
// Saturday test, into data/ignition-results.json. Moved out of fastmover-lab.mjs (MODE=live) on 22 Oct so it can be tested; the
// rules are unchanged. minuteBars(sym, day) returns the Massive minute-aggregates answer (or null / { refused: true }).
import { IG_RULES, LIVE_RULES, EXITS, simulate, toBars, costOf } from './ignition-core.mjs';

export async function scoreIgnitionPaper(L, IR, { today, max = 400, minuteBars }) {
  IR.done = IR.done || {}; let asked = 0;
  for (const t of L) { const k = t.d + '|' + t.sym + '|' + t.rule; if (IR.done[k] || t.d >= today || asked >= max) continue;
    const R = [...IG_RULES, ...LIVE_RULES].find(r => r.id === t.rule); if (!R) continue;
    if (typeof t.delay === 'number' && t.delay > 3) { IR.done[k] = { d: t.d, sym: t.sym, rule: t.rule, res: 'stale signal (price ' + t.delay + ' min old): not scored' }; continue; }   // (outside review, 22 Oct) only fresh signals count
    const j = await minuteBars(t.sym, t.d); asked++; if (!j || j.refused) continue;
    const b = toBars(j.results, t.d), k0 = b.findIndex(x => x[0] >= t.m && x[0] >= 570); if (k0 < 0) { IR.done[k] = { d: t.d, sym: t.sym, rule: t.rule, res: 'no bars' }; continue; }
    // strict fill: bought at the next minute's open; if that open is more than 3% above the alert price (the alert's limit), NO FILL
    const nx = R.orb ? b[k0] : b[k0 + 1]; if (!nx || (!R.orb && nx[1] > t.price * 1.03)) { IR.done[k] = { d: t.d, sym: t.sym, rule: t.rule, res: 'no fill (opened past the 3% limit)' }; continue; }
    const out = {}; for (const X of EXITS) { const o = simulate(b, t.prevC, R.orb ? { k: k0, orH: t.orH, orL: t.orL } : R.pull ? { k: k0, stop: t.stop } : { k: k0 }, R, X); if (o) { out[X.id] = +(o.g - costOf(o.e)).toFixed(4); out[X.id + '_s'] = +(o.g - 1.5 * costOf(o.e)).toFixed(4); } }
    IR.done[k] = { d: t.d, sym: t.sym, rule: t.rule, ...out }; }
  for (const t of L) if (typeof t.delay === 'number' && t.delay > 3) { const k = t.d + '|' + t.sym + '|' + t.rule; if (IR.done[k] && !IR.done[k].res) IR.done[k] = { d: t.d, sym: t.sym, rule: t.rule, res: 'stale signal (price ' + t.delay + ' min old): removed from the record 22 Oct' }; }   // earlier stale signals leave the record too
  const rec = {}; for (const v of Object.values(IR.done)) for (const X of EXITS) { if (typeof v[X.id] !== 'number') continue; const id = v.rule + '/' + X.id, r = rec[id] || (rec[id] = { n: 0, sum: 0, won: 0 }); r.n++; r.sum += v[X.id]; if (v[X.id] > 0) r.won++; }
  for (const [id, r] of Object.entries(rec)) { const [ru, ex] = id.split('/'), vals = Object.values(IR.done).filter(v => v.rule === ru && typeof v[ex] === 'number'), st = vals.map(v => v[ex + '_s']).filter(x => typeof x === 'number'), srt = vals.map(v => v[ex]).sort((a, b) => b - a);
    r.avg = r.sum / r.n; r.win = r.won / r.n; r.stress = st.length ? st.reduce((a, b) => a + b, 0) / st.length : null; r.noTop2 = srt.length > 2 ? srt.slice(2).reduce((a, b) => a + b, 0) / (srt.length - 2) : null;
    r.days = new Set(vals.map(v => v.d)).size; r.stocks = new Set(vals.map(v => v.sym)).size; const w = srt.filter(x => x > 0), l = srt.filter(x => x <= 0); r.pf = l.length ? w.reduce((a, b) => a + b, 0) / -l.reduce((a, b) => a + b, 0) : (w.length ? 99 : null); }
  IR.record = rec; return { asked, record: rec };
}
