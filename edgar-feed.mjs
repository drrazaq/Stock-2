// SEC LIVE FILING FEED (owner item 3, 28 Oct 2026: "can the existing feeds capture credible early signals before the price moves?").
// EDGAR's official "latest filings" Atom feed (www.sec.gov/cgi-bin/browse-edgar?action=getcurrent, free, same User-Agent rule as the other
// SEC calls): every 8-K / 6-K the moment the SEC accepts it, with the company's CIK, the 8-K item numbers and the acceptance time. The
// watcher polls it about every 2 minutes from its start to 11:00 New York (paging back to 4:00 on the first poll) and hands each new
// filing to the D shadow model (rank-models.mjs). Pure parsing here; no network.
const dec = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export function parseAtom(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)) { const e = m[1];
    const title = dec((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]), t = title.match(/^(.+?) - (.+) \((\d{4,10})\) \((Filer|Subject)\)/);
    const form = (e.match(/<category[^>]*term="([^"]+)"/) || [])[1] || (t && t[1]) || '', at = (e.match(/<updated>([^<]+)<\/updated>/) || [])[1] || null;
    const acc = ((e.match(/accession-number=([\d-]+)/) || [])[1]) || ((e.match(/AccNo:\s*(?:<\/b>)?\s*([\d-]+)/) || [])[1]) || null, sum = dec((e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1]);
    if (!t || !acc || !at) continue;
    out.push({ acc, form: form.trim(), cik: +t[3], name: t[2].trim(), role: t[4], at, items: [...sum.matchAll(/Item (\d\.\d\d)/g)].map(x => x[1]).join(',') }); }
  return out;
}
// New York minute of an ISO time with offset (the feed gives -04:00 / -05:00)
export function nyMinuteOf(iso) { const d = new Date(iso); if (isNaN(d)) return null; const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(x => p[x.type] = x.value); return +p.hour * 60 + +p.minute; }
export const nyDateOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
