// Exact public producer source excerpts at774273205e1c8ce3db30c59ca368dc107617ef73.
const qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => +x.o.toFixed(4)), h: rows.map(x => +x.h.toFixed(4)), l: rows.map(x => +x.l.toFixed(4)), c: rows.map(x => +x.c.toFixed(4)), v: rows.map(x => Math.round(x.v)) });
// x rows for days fetched before 22 Oct 2026 (main rows are left exactly as they are)
{ let tailCalls = 0; const TAIL_CALLS = +(env.TAIL_CALLS || 1300), need = Object.keys(store.days).filter(d => !store.days[d].x).sort().reverse();
  for (const d of need) { if (tailCalls >= TAIL_CALLS) break; const j = await api(`/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=true`); tailCalls++;
    if (!j || j.refused || !Array.isArray(j.results)) continue;
    store.days[d].x = pack(j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || !CS.size) && !qualifies(x) && x.c > 0)); store.days[d].xAt = iso(Date.now());
    if (tailCalls % 100 === 0) { save(); console.log('dead-stock rows added for', tailCalls, 'older days'); } }
  if (need.length) console.log('dead-stock rows: ' + Math.min(need.length, tailCalls) + ' of ' + need.length + ' older days filled this run' + (need.length > tailCalls ? ' (the rest next run)' : '')); }
