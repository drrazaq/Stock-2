// Alpaca live snapshots: the full-market SIP feed first (Algo Trader Plus, 99 USD a month), IEX (free plan) on 403.
// ALPACA_FEED=iex or =sip forces one. feedUsed() says which feed the run used, so every report can name it.
let FEED = null;
export const resetFeed = () => { FEED = null; };
export const feedUsed = () => FEED || (process.env.ALPACA_FEED || 'sip');
export async function snapshots(base, syms, opts, f = fetch) {
  const forced = process.env.ALPACA_FEED; if (!FEED && (forced === 'iex' || forced === 'sip')) FEED = forced;
  const ask = (feed) => f(base + '/v2/stocks/snapshots?feed=' + feed + '&symbols=' + syms.map(encodeURIComponent).join(','), opts);
  if (!FEED || FEED === 'sip') { const r = await ask('sip');
    if (r.ok) { FEED = 'sip'; return await r.json(); }
    if ((r.status === 403 || r.status === 422) && forced !== 'sip') FEED = 'iex'; else return null; }
  const r = await ask('iex'); return r.ok ? await r.json() : null;
}
