const N = await import(process.argv[2] + '/new/watcher-guard-core.mjs'), O = await import(process.argv[2] + '/old/watcher-guard-core.mjs');
// Mon 16 Nov 2026, 9:16 New York (14:16Z): no watcher run yet today -> the NEW guard decides to dispatch.
const t1 = Date.parse('2026-11-16T14:16:00Z'), noRuns = [];
const a = N.guardDecide(t1, noRuns, {}, undefined, {});
console.log('new guard 9:16 dispatch:', a.dispatch, '| state keys:', Object.keys(a.state).join(','), '| dispatched:', JSON.stringify(a.state.dispatched), '| attempts:', (a.state.attempts||[]).length);
// Rollback at 9:20: the OLD guard reads that saved state; still no run visible.
const t2 = Date.parse('2026-11-16T14:20:00Z'), b = O.guardDecide(t2, noRuns, JSON.parse(JSON.stringify(a.state)));
console.log('old guard 9:20 on new state -> dispatch:', b.dispatch, '| why:', b.why || '', '| alerts:', b.alerts.map(x=>x.slice(0,60)).join(' / '));
// control: old guard on its OWN state after its own 9:16 dispatch (15-minute spacing rule)
const c0 = O.guardDecide(t1, noRuns, {}), c = O.guardDecide(t2, noRuns, JSON.parse(JSON.stringify(c0.state)));
console.log('control old->old 9:16 dispatch:', c0.dispatch, '| 9:20 dispatch:', c.dispatch);
// forward: new guard on OLD state after old dispatch
const d = N.guardDecide(t2, noRuns, JSON.parse(JSON.stringify(c0.state)), undefined, {});
console.log('forward old->new 9:20 dispatch:', d.dispatch, '| attempts:', JSON.stringify(d.state.attempts));
