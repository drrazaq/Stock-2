// SHARE COUNT HISTORY (SEC, free, official). How many shares each US company had at the end of every quarter since 2019, from the
// number printed on the cover of its 10-Q / 10-K (dei:EntityCommonStockSharesOutstanding), read through the SEC "frames" service:
// one request per quarter returns every company at once (about 30 requests in total, then 3 a week to stay current).
// Used for two things:
// 1. DILUTION: a company whose share count rose 30%+ in a year keeps selling new shares, which weighs on the price (runners, check SYM).
// 2. FLOAT IN THE PAST: the fast-mover lab used TODAY's share count for days years ago (an approximation, marked as such). Now it can
//    use the count that was actually known on that day.
// Point in time: a count is treated as known only 30 days after its date (the cover date is usually a few days before the filing),
// so no test ever sees a number before it was public. Read-only; writes data/shares.json.gz.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const DATA = local(env.SEC_BASE) || 'https://data.sec.gov', WWW = local(env.SEC_BASE) || 'https://www.sec.gov';
const UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com', OUT = 'data/shares.json.gz', LAG = 30;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let calls = 0, note = '';
async function sec(url) {
  if (note) return null; await sleep(local(env.SEC_BASE) ? 0 : 200); calls++;   // SEC fair-use limit: 10 requests a second
  const go = () => fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  let r; try { r = await go(); } catch (e) { return null; }
  for (let k = 0; k < 3 && (r.status === 403 || r.status === 429); k++) { await sleep(5000); try { r = await go(); } catch (e) { return null; } }
  if (r.status === 403 || r.status === 429) { note = 'SEC refused (HTTP ' + r.status + ')'; return null; }
  if (!r.ok) return null; return r.json().catch(() => null); }
let S; try { S = JSON.parse(zlib.gunzipSync(fs.readFileSync(OUT)).toString()); } catch (e) { S = { frames: {}, c: {}, t: {} }; }
// 1. ticker -> SEC number, weekly
if (!S.tAt || Date.now() - Date.parse(S.tAt) > 6 * 864e5) { const j = await sec(WWW + '/files/company_tickers.json');
  if (j) { S.t = {}; for (const x of Object.values(j)) if (x && x.ticker && !S.t[String(x.ticker).toUpperCase().replace(/-/g, '.')]) S.t[String(x.ticker).toUpperCase().replace(/-/g, '.')] = x.cik_str; S.tAt = new Date().toISOString(); } }
// 2. quarters: every quarter since 2019 once; the last 3 quarters again every run (late filers, amendments)
const now = new Date(), Y = now.getUTCFullYear(), Q = Math.floor(now.getUTCMonth() / 3) + 1, want = [];
for (let y = +(env.SH_FROM || 2019); y <= Y; y++) for (let q = 1; q <= 4; q++) if (y < Y || q <= Q) want.push('CY' + y + 'Q' + q + 'I');
const recent = new Set(want.slice(-3)); let got = 0, failed = 0;
for (const f of want) { if (S.frames[f] && !recent.has(f)) continue;
  const j = await sec(DATA + '/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/' + f + '.json');
  if (!j || !Array.isArray(j.data)) { failed++; if (note) break; continue; }
  for (const x of j.data) { if (!x || !x.cik || !(x.val > 0) || !x.end) continue; const a = S.c[x.cik] || (S.c[x.cik] = []), i = a.findIndex(p => p[0] === x.end);
    if (i >= 0) a[i][1] = x.val; else a.push([x.end, x.val]); }
  S.frames[f] = j.data.length; got++; }
for (const a of Object.values(S.c)) a.sort((u, v) => u[0] < v[0] ? -1 : 1);
S.at = new Date().toISOString(); S.lagDays = LAG; S.note = note;
fs.mkdirSync('data', { recursive: true }); fs.writeFileSync(OUT, zlib.gzipSync(JSON.stringify(S)));
console.log('shares: ' + got + ' quarters read (' + calls + ' SEC requests' + (failed ? ', ' + failed + ' failed' : '') + (note ? ', ' + note : '') + '), ' + Object.keys(S.c).length + ' companies, ' + Object.keys(S.frames).length + ' quarters in the history');
