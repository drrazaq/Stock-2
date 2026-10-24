// MACRO CORE (24 Oct 2026; owner: "traders make money from what is happening in the world: demand, war, oil up -> industry up, weapons
// companies on conflict, peace, global warming / energy policy, inflation, rates"). Pure functions, no network, no files. Used by
// macro-lab.mjs (one 5-year run per rule, first complete verdict frozen + a forward PAPER lane from Monday 26 Oct 2026) and
// test/macro-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids MACRO-*; the same text is written into
// data/strategy-library.json in the same commit and again, idempotently, by macro-lab.mjs before its first computation).
// LIBRARY CHECK (data/strategy-library.json, 24 Oct 2026): A-ROT1 (sector ETFs ranked by THEIR OWN 6-month / 12-1 return: rejected) and
// A-ROT2 (SPUS/HLAL vs gold vs cash trend rule: rejected) rank funds by their own price; R4 (sector rotation, themes study) and
// CHAIN-MOM1 (hot chain layers: not proven) rank industries by their own return; Z11 (global macro: rates, currencies, countries) was
// marked "not for this system" as a TRADING style (we never trade the drivers themselves here: oil, gas, gold, copper, bonds, the dollar
// and volatility are only SIGNALS; every buy is a US sector fund or US stock, long only); ANG-FOMC (pre-FOMC drift on SPUS) is the only
// tested calendar-of-policy rule; A-VIX1 (VIX range as a risk GATE) is queued and is not a buy rule; E10 / C-GOV1 (government contracts)
// are company-level awards, not wars. No entry tests a commodity / rate / dollar / volatility move as the signal for a sector, a dated
// war / ceasefire / OPEC / climate-law event as the signal, or a rotation by the macro DRIVER's strength. Nothing below repeats them.
// Common conventions (the system's, unchanged):
//   PRICES: the 5-year whole-market cache (study-cache/grouped.json.gz, dead stocks included; its sessions are the clock D) for stocks and
//   the average-stock yardstick; each fund's daily bars from Massive (split-adjusted; 5 years) with older days from Nasdaq's historical
//   endpoint (scaled to Massive at the first common day) for the driver look-backs. Price return (no dividends) for funds and stocks alike.
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the signal day (SPY excluded).
//   Signal at the CLOSE of session t (only what is known then); buy the OPEN of t+1; sell the CLOSE of the exit session t+hold. One open
//   trade per instrument per rule (a new signal while it is held is skipped). Event rules: the entry session is the first session whose
//   OPEN comes after the news (news before the US open -> that session; during / after the session or on a non-trading day -> the next).
//   JUDGED at the system's tier-2 standard (value-core.mjs judge): both halves (signal before / from 2024-01-01) positive after 0.8% and
//   1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same instrument on its other
//   days (same half, same length, step 10; for a FUND: the fund over ALL same-length windows of the half, the ANG-FOMC convention), positive without the 2 best trades, block t >= 2.5 (non-overlapping blocks of the hold length)
//   -> TRADABLE SMALL; block t >= the proof bar (max of 2.5, the league bar, 4.0) -> PROVEN; PLUS (raised, never lowered) better than SPY
//   over the same sessions in both halves (not for the SPY rule itself) and, for the rotation, better than the equal weight of its 6
//   funds over the same months. Fewer than 20 trades or 3 blocks in a half -> TOO FEW CASES. Nothing lowered.
//   HALAL: every fund and stock carries the owner's ZAD mark (data/halal.json / ZAD list) as recorded: 'ok', 'fail' or 'unknown'. It is
//   recorded, never used to filter the test.
import { judge } from './value-core.mjs';
import { nextSession, NYSE_HOLIDAYS } from './anomaly-core.mjs';
export { nextSession, NYSE_HOLIDAYS };
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26';
const S = (cite, url) => ({ cite, url });

// ---------------- the funds ----------------
// macro DRIVERS (signals only, never bought here except SPY for the VIX rule)
export const DRIVERS = { USO: 'oil (WTI futures fund)', BNO: 'oil (Brent futures fund)', UNG: 'natural gas (futures fund)', GLD: 'gold', CPER: 'copper (futures fund)', TLT: 'long Treasury bonds (up = long rates falling)',
  IEF: '7-10 year Treasuries', UUP: 'US dollar index (bullish fund)', VIXY: 'VIX short-term futures (fear)', SPY: 'S&P 500' };
// sector funds bought or measured
export const SECTOR_ETFS = ['XLE', 'XOP', 'FCG', 'ITA', 'XAR', 'XLU', 'XLB', 'XLI', 'ICLN', 'TAN', 'GDX', 'COPX', 'KRE', 'XLK', 'IWM', 'XLF', 'XLV', 'XLY', 'XLP', 'XLC', 'XLRE', 'SPUS', 'HLAL'];
export const SPDR11 = ['XLE', 'XLB', 'XLI', 'XLU', 'XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLC', 'XLRE'];
export const ALL_ETFS = [...new Set([...Object.keys(DRIVERS), ...SECTOR_ETFS])];
// the monthly rotation: driver -> the sector fund it is documented to move (sign -1: the driver FALLING is the good news)
export const ROT_MAP = { USO: { etf: 'XLE', sign: 1 }, UNG: { etf: 'FCG', sign: 1 }, GLD: { etf: 'GDX', sign: 1 }, CPER: { etf: 'COPX', sign: 1 }, TLT: { etf: 'IWM', sign: 1 }, UUP: { etf: 'XLK', sign: -1 } };

// ---------------- stock groups ----------------
// SIC as scan.mjs maps it (Energy = 1311/1381/1389/2911, Mining = 1000-1099, Aerospace = 3720-3769), split finer here: oil & gas
// producers, drillers, services, refiners and pipelines; gold & silver ores (1040s); other metal mining (not gold, not uranium 1094);
// defense = aircraft, parts, guided missiles & space (3720-3769), search / navigation / guidance systems (3812), ordnance (3480-3489),
// tanks (3795). Gas producers and clean energy have no SIC of their own: fixed lists, written down 24 Oct 2026 from the companies that
// were known as such in 2021 (a survivorship risk, stated: a list made today knows which names survived; companies that later failed,
// e.g. SunPower, are kept in so they are bought when they were liquid).
const inR = (c, a, b) => c >= a && c <= b;
export const GROUPS = {
  energy: { name: 'oil & gas stocks (SIC 1311, 1381-1389, 2911, 4610-4619, 4922-4923)', sic: (c) => c === 1311 || inR(c, 1381, 1389) || c === 2911 || inR(c, 4610, 4619) || c === 4922 || c === 4923 },
  gold: { name: 'gold & silver miners (SIC 1040-1049)', sic: (c) => inR(c, 1040, 1049) },
  metals: { name: 'metal miners, not gold or uranium (SIC 1000-1099 except 1040-1049 and 1094)', sic: (c) => inR(c, 1000, 1099) && !inR(c, 1040, 1049) && c !== 1094 },
  defense: { name: 'defense & aerospace (SIC 3720-3769, 3812, 3480-3489, 3795)', sic: (c) => inR(c, 3720, 3769) || c === 3812 || inR(c, 3480, 3489) || c === 3795 },
  gas: { name: 'natural-gas-weighted producers (fixed list)', list: ['EQT', 'AR', 'RRC', 'CNX', 'SWN', 'CHK', 'EXE', 'CTRA', 'CRK', 'GPOR', 'TELL', 'NFE', 'KOS', 'SD', 'EPSN'] },
  clean: { name: 'clean-energy stocks (fixed list)', list: ['FSLR', 'ENPH', 'SEDG', 'RUN', 'SPWR', 'NOVA', 'PLUG', 'BE', 'ARRY', 'SHLS', 'FLNC', 'CSIQ', 'JKS', 'MAXN', 'FCEL', 'BLDP', 'STEM', 'ORA', 'CWEN', 'AY', 'NEP', 'HASI', 'AMRC', 'NXT', 'EVGO', 'CHPT'] },
};
export function groupOf(sic) { const c = +sic; if (!c) return []; return ['energy', 'gold', 'metals', 'defense'].filter(g => GROUPS[g].sic(c)); }

// ---------------- the dated events (fixed 24 Oct 2026 BEFORE any test; sources named) ----------------
// when: 'pre' = the news broke before the US open of d (overnight / early morning ET, or d is a non-trading day); 'after' = during or after
// the US session of d. Kinds: war (start of a war or the first direct strike between states in a cycle, or the restart after a ceasefire),
// peace (a ceasefire / truce / peace deal ending the active phase; 1-3 day holiday truces left out), opec (a NEW OPEC+ cut, an extension of
// cuts or a delay of a planned increase), climate (US federal climate law steps), fed (first hike / first cut of a cycle), tariff (US tariff
// shock and its pause). Fed and tariff events are information only (one or two per half cannot be a rule).
const W = 'https://en.wikipedia.org/wiki/';
export const EVENTS = [
  { id: 'IIJA', d: '2021-11-15', when: 'after', kind: 'climate', what: 'Infrastructure Investment and Jobs Act signed (clean-energy and grid money)', src: W + 'Infrastructure_Investment_and_Jobs_Act' },
  { id: 'UKR', d: '2022-02-24', when: 'pre', kind: 'war', what: 'Russia invades Ukraine (about 22:00 ET on 23 Feb)', src: W + 'Russian_invasion_of_Ukraine' },
  { id: 'FED-HIKE1', d: '2022-03-16', when: 'after', kind: 'fed', what: 'Fed first hike of the cycle (+0.25%)', src: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20220316a.htm' },
  { id: 'IRA-DEAL', d: '2022-07-27', when: 'after', kind: 'climate', what: 'Manchin-Schumer deal on the Inflation Reduction Act announced (late afternoon ET)', src: 'https://www.allsides.com/news/2022-07-28-0700/economy-and-jobs-solar-stocks-jump-schumer-manchin-announce-climate-spending-deal' },
  { id: 'IRA-SENATE', d: '2022-08-07', when: 'pre', kind: 'climate', what: 'Senate passes the Inflation Reduction Act (Sunday)', src: W + 'Inflation_Reduction_Act' },
  { id: 'IRA-SIGNED', d: '2022-08-16', when: 'after', kind: 'climate', what: 'Inflation Reduction Act signed into law', src: W + 'Inflation_Reduction_Act' },
  { id: 'OPEC-2210', d: '2022-10-05', when: 'after', kind: 'opec', what: 'OPEC+ cuts output targets by 2 million barrels a day', src: W + 'OPEC%2B' },
  { id: 'OPEC-2304', d: '2023-04-02', when: 'pre', kind: 'opec', what: 'OPEC+ surprise voluntary cuts of about 1.16 million b/d (Sunday)', src: W + 'OPEC%2B' },
  { id: 'OPEC-2306', d: '2023-06-04', when: 'pre', kind: 'opec', what: 'Saudi Arabia pledges an extra 1 million b/d cut (Sunday)', src: W + 'OPEC%2B' },
  { id: 'HAMAS', d: '2023-10-07', when: 'pre', kind: 'war', what: 'Hamas attack on Israel; Israel declares war (Saturday)', src: W + 'Gaza_war' },
  { id: 'GAZA-TRUCE1', d: '2023-11-22', when: 'pre', kind: 'peace', what: 'Israel-Hamas truce and hostage deal agreed (overnight)', src: W + '2023_Israel%E2%80%93Hamas_war_ceasefire' },
  { id: 'OPEC-2311', d: '2023-11-30', when: 'after', kind: 'opec', what: 'OPEC+ voluntary cuts of about 2.2 million b/d for Q1 2024', src: W + 'OPEC%2B' },
  { id: 'OPEC-2403', d: '2024-03-03', when: 'pre', kind: 'opec', what: 'OPEC+ extends the 2.2 million b/d voluntary cuts into Q2 (Sunday)', src: W + 'OPEC%2B' },
  { id: 'IRAN-ISR1', d: '2024-04-13', when: 'pre', kind: 'war', what: 'Iran\'s first direct drone and missile attack on Israel (Saturday)', src: W + 'April_2024_Iranian_strikes_against_Israel' },
  { id: 'OPEC-2406', d: '2024-06-02', when: 'pre', kind: 'opec', what: 'OPEC+ extends most cuts into 2025 (Sunday)', src: W + 'OPEC%2B' },
  { id: 'OPEC-2409', d: '2024-09-05', when: 'after', kind: 'opec', what: 'OPEC+ delays its October output increase by two months', src: W + 'OPEC%2B' },
  { id: 'FED-CUT1', d: '2024-09-18', when: 'after', kind: 'fed', what: 'Fed first cut of the cycle (-0.50%)', src: 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20240918a.htm' },
  { id: 'IRAN-ISR2', d: '2024-10-01', when: 'after', kind: 'war', what: 'Iran fires about 180 ballistic missiles at Israel (midday ET)', src: W + 'October_2024_Iranian_strikes_against_Israel' },
  { id: 'LEB-CEASE', d: '2024-11-26', when: 'after', kind: 'peace', what: 'Israel-Hezbollah ceasefire announced', src: W + '2024_Israel%E2%80%93Hezbollah_ceasefire_agreement' },
  { id: 'OPEC-2412', d: '2024-12-05', when: 'after', kind: 'opec', what: 'OPEC+ delays output increases to April 2025', src: W + 'OPEC%2B' },
  { id: 'GAZA-CEASE2', d: '2025-01-15', when: 'after', kind: 'peace', what: 'Gaza ceasefire and hostage deal announced', src: W + '2025_Gaza_war_ceasefire' },
  { id: 'TARIFF', d: '2025-04-02', when: 'after', kind: 'tariff', what: '"Liberation Day" tariffs announced after the close', src: W + 'Liberation_Day_tariffs' },
  { id: 'TARIFF-PAUSE', d: '2025-04-09', when: 'after', kind: 'tariff', what: '90-day pause on most of the new tariffs (early afternoon ET)', src: W + 'Liberation_Day_tariffs' },
  { id: 'IND-PAK', d: '2025-05-07', when: 'pre', kind: 'war', what: 'India strikes Pakistan (Operation Sindoor, after the US close of 6 May)', src: W + '2025_India%E2%80%93Pakistan_conflict' },
  { id: 'IND-PAK-CEASE', d: '2025-05-10', when: 'pre', kind: 'peace', what: 'India-Pakistan ceasefire (Saturday)', src: W + '2025_India%E2%80%93Pakistan_conflict' },
  { id: 'ISR-IRAN', d: '2025-06-13', when: 'pre', kind: 'war', what: 'Israel strikes Iran (the evening of 12 June ET); twelve-day war', src: W + 'Iran%E2%80%93Israel_war' },
  { id: 'ISR-IRAN-CEASE', d: '2025-06-23', when: 'after', kind: 'peace', what: 'Iran-Israel ceasefire announced (evening ET)', src: W + 'Iran%E2%80%93Israel_war' },
  { id: 'GAZA-DEAL', d: '2025-10-08', when: 'after', kind: 'peace', what: 'Gaza peace plan phase one agreed (evening ET)', src: W + 'Gaza_peace_plan' },
  { id: 'OPEC-2511', d: '2025-11-02', when: 'pre', kind: 'opec', what: 'OPEC+ pauses its output increases for Q1 2026 (Sunday)', src: W + 'OPEC%2B' },
  { id: 'VENEZUELA', d: '2026-01-03', when: 'pre', kind: 'war', what: 'US strikes Venezuela and captures Maduro (Saturday)', src: 'https://www.opb.org/article/2026/01/03/trump-claims-u-s-captured-maduro-after-caracas-blasts/' },
  { id: 'IRAN-WAR', d: '2026-02-28', when: 'pre', kind: 'war', what: 'US and Israeli strikes on Iran begin the 2026 Iran war (Saturday)', src: W + 'Timeline_of_the_2026_Iran_war' },
  { id: 'IRAN-CEASE', d: '2026-04-07', when: 'after', kind: 'peace', what: 'Two-week US-Iran ceasefire announced (in force 8 April)', src: W + '2026_Iran_war_ceasefire' },
  { id: 'IRAN-DEAL', d: '2026-06-14', when: 'pre', kind: 'peace', what: '"The deal with Iran is now complete" (Sunday; Islamabad Memorandum signed 17 June)', src: 'https://gvwire.com/2026/07/25/from-celebration-to-escalation-how-trumps-iran-ceasefire-collapsed/' },
  { id: 'IRAN-WAR2', d: '2026-07-08', when: 'after', kind: 'war', what: 'Ceasefire declared over; US strikes dozens of Iranian coastal targets', src: 'https://gvwire.com/2026/07/25/from-celebration-to-escalation-how-trumps-iran-ceasefire-collapsed/' },
];

// ---------------- sources (shared) ----------------
const SRC = {
  hong: S('Hong, Torous & Valkanov (2007) Do industries lead stock markets? Journal of Financial Economics 83(2) (industry and commodity returns lead the market by up to two months)', 'https://doi.org/10.1016/j.jfineco.2005.09.010'),
  driesprong: S('Driesprong, Jacobsen & Maat (2008) Striking oil: Another puzzle? Journal of Financial Economics 89(2) (oil changes predict stock returns with a lag: slow information diffusion)', 'https://ideas.repec.org/a/eee/jfinec/v89y2008i2p307-327.html'),
  kilian: S('Kilian & Park (2009) The impact of oil price shocks on the U.S. stock market, International Economic Review 50(4) (demand-driven oil rises lift stocks; supply shocks hurt; oil-sector stocks move with oil)', 'https://doi.org/10.1111/j.1468-2354.2009.00568.x'),
  moskowitz: S('Moskowitz & Grinblatt (1999) Do Industries Explain Momentum? Journal of Finance 54(4)', 'https://doi.org/10.1111/0022-1082.00146'),
  neville: S('Neville, Draaisma, Funnell, Harvey & Van Hemert (2021) The Best Strategies for Inflationary Times (energy the only US sector with positive real returns in 8 US inflation regimes since 1926)', 'https://www.evidenceinvestor.com/wp-content/uploads/2021/12/SSRN-id3813202.pdf'),
  defense: S('War! Good news for defense firms? Analysis of the impact of the Russia-Ukraine conflict, Journal of Economic Studies (2024) (positive abnormal returns of defense firms at the invasion)', 'https://www.emeraldinsight.com/insight/content/doi/10.1108/JES-11-2023-0667/full/html'),
  fool22: S('Motley Fool, 1 Mar 2022: why defense stocks rocketed higher in February 2022', 'https://www.fool.com/investing/2022/03/01/why-defense-stocks-rocketed-higher-in-february'),
  defense24: S('Benzinga, Dec 2023: defense stocks Lockheed and RTX shot higher when Russia first attacked Ukraine, then struggled', 'https://in.benzinga.com/news/23/12/36097989/defense-stocks-lockheed-and-rtx-shot-higher-when-russia-first-attacked-ukraine-now-they-struggle'),
  ira: S('Schaeffer\'s, 28 Jul 2022: Senate unveils climate bill, solar stocks pop', 'https://www.schaeffersresearch.com/content/news/2022/07/28/senate-unveils-climate-change-bill-solar-stocks-pop'),
  ira2: S('Motley Fool, 28 Jul 2022: why Plug Power and alternative-energy stocks exploded', 'https://www.fool.com/investing/2022/07/28/why-plug-power-alternative-energy-stocks-exploded/'),
  gdx: S('ETF Trends: gold miners as leveraged exposure to gold (operating leverage: costs fixed, revenue moves with the metal)', 'https://www.etftrends.com/?p=130644'),
  vix: S('Whaley (2000) The Investor Fear Gauge, Journal of Portfolio Management 26(3) (VIX spikes mark sell-offs; high VIX precedes higher expected returns)', 'https://doi.org/10.3905/jpm.2000.319728'),
  opec: S('Kilian & Park (2009) IER 50(4) (oil supply shocks: oil-sector stocks gain while the market loses)', 'https://doi.org/10.1111/j.1468-2354.2009.00568.x'),
};

// ---------------- the rules (exact) ----------------
// one fund held one trade at a time gives 5-19 trades in a half, under the system's 20-case minimum by construction; so every flagged session
// is its own TRANCHE (overlapping holds, as the anomaly lab's monthly sorts and ANG-DIVG); the dependence is handled by the block t (one
// value per non-overlapping block of the hold length), which is the gate. The one-at-a-time version is reported as information.
const TRANCHE_TXT = 'EVERY flagged session is its own tranche (overlapping holds); the block t over non-overlapping blocks of the hold length is the test (one-at-a-time version: information).';
const DRV = (key, name, side, target, sources, lib, extra = '') => ({ key, name, side, target, sources, lib, extra });
const DRIVER_RULES = {
  OIL: DRV('USO', 'Oil up -> energy', 'up', { etf: 'XLE', group: 'energy' }, [SRC.kilian, SRC.driesprong, SRC.neville, SRC.hong], 'none for oil as a signal (A-ROT1 ranks XLE by its own return; Z11 trades oil itself: not done here)'),
  GAS: DRV('UNG', 'Natural gas up -> gas producers', 'up', { etf: 'FCG', group: 'gas' }, [SRC.hong, SRC.kilian], 'none'),
  GOLD: DRV('GLD', 'Gold up -> gold miners', 'up', { etf: 'GDX', group: 'gold' }, [SRC.gdx, SRC.hong], 'A-ROT2 holds gold itself when stocks trend down (rejected); gold as a signal for miners never tested'),
  CU: DRV('CPER', 'Copper up -> metal miners', 'up', { etf: 'COPX', group: 'metals' }, [SRC.hong, SRC.neville], 'none'),
};
export const RULES = {};
for (const [k, d] of Object.entries(DRIVER_RULES)) for (const h of [20, 60]) {
  const base = 'Signal at the close of session t: ' + d.key + ' (' + DRIVERS[d.key] + ') 20-session return (close t vs close t-20) is in the TOP 20% of its own 20-session returns on the previous 252 sessions (strictly more than 80% of them are lower). ';
  RULES['MACRO-' + k + '-E' + h] = { name: d.name + ' (fund ' + d.target.etf + ', hold ' + h + ')', family: 'driver', hold: h, driver: d.key, side: d.side, target: { etf: d.target.etf }, tranche: true,
    rule: base + 'Buy ' + d.target.etf + ' at the next open, sell at the close of the ' + h + 'th session. ' + TRANCHE_TXT, sources: d.sources, lib: d.lib };
  RULES['MACRO-' + k + '-S' + h] = { name: d.name + ' (10 most traded ' + d.target.group + ' stocks, hold ' + h + ')', family: 'driver', hold: h, driver: d.key, side: d.side, target: { group: d.target.group, n: 10 },
    rule: base + 'Buy at the next open the 10 liquid stocks of the group "' + GROUPS[d.target.group].name + '" with the highest 20-session average traded value on day t, equal weight; sell each at the close of the ' + h + 'th session. One open trade per stock.', sources: d.sources, lib: d.lib };
}
for (const h of [20, 60]) {
  RULES['MACRO-RATE-E' + h] = { name: 'Long rates falling (TLT up) -> small caps (IWM, hold ' + h + ')', family: 'driver', hold: h, driver: 'TLT', side: 'up', target: { etf: 'IWM' }, tranche: true,
    rule: 'Signal at the close of t: TLT 20-session return in the TOP 20% of its 20-session returns on the previous 252 sessions (long yields falling fast). Buy IWM at the next open, hold ' + h + ' sessions. ' + TRANCHE_TXT, sources: [SRC.hong, SRC.moskowitz], lib: 'ANG-FOMC (FOMC-day drift on SPUS, a calendar rule); no rate-move signal tested' };
  RULES['MACRO-USD-E' + h] = { name: 'Dollar falling (UUP down) -> multinational tech (XLK, hold ' + h + ')', family: 'driver', hold: h, driver: 'UUP', side: 'down', target: { etf: 'XLK' }, tranche: true,
    rule: 'Signal at the close of t: UUP 20-session return in the BOTTOM 20% of its 20-session returns on the previous 252 sessions (strictly more than 80% of them are higher). Buy XLK (the most foreign-revenue-heavy US sector) at the next open, hold ' + h + ' sessions. ' + TRANCHE_TXT, sources: [SRC.hong], lib: 'Z11 (currencies: not traded here; the dollar is only a signal)' };
  RULES['MACRO-VIX-E' + h] = { name: 'Fear spike, then fear falling -> S&P 500 (SPY, hold ' + h + ')', family: 'driver', hold: h, driver: 'VIXY', side: 'spike', target: { etf: 'SPY' },
    rule: 'Signal at the close of t: within the last 10 sessions (t included) VIXY closed 30%+ above its average of the 60 sessions before that day (a spike), AND VIXY closes at t 15%+ under its highest close of the last 10 sessions (fear falling); first such session only (the day before was not a signal). Buy SPY at the next open, hold ' + h + ' sessions. Yardsticks: the average liquid stock and SPY on its other same-length windows of the half (the "better than SPY" gate cannot apply). SPUS is the halal way to own the same thing; SPY is tested as the owner asked.', sources: [SRC.vix], lib: 'A-VIX1 (queued: the VIX range as a GATE, not a buy rule); ANOM-* calendar rules on SPY' };
  RULES['MACRO-WAR-E' + h] = { name: 'Conflict start -> defense fund (ITA, hold ' + h + ')', family: 'event', hold: h, kind: 'war', target: { etf: 'ITA' },
    rule: 'Each dated war event of the table EVENTS (kind war: a war\'s start, the first direct strike between states in a cycle, or the restart after a ceasefire; fixed 24 Oct 2026). Buy ITA at the open of the entry session (the first open after the news), hold ' + h + ' sessions.', sources: [SRC.defense, SRC.fool22, SRC.defense24], lib: 'E10 / C-GOV1 (company contract awards), not wars; none' };
  RULES['MACRO-WAR-S' + h] = { name: 'Conflict start -> 10 most traded defense stocks (hold ' + h + ')', family: 'event', hold: h, kind: 'war', target: { group: 'defense', n: 10 },
    rule: 'Each dated war event (table EVENTS). Buy at the open of the entry session the 10 liquid stocks of "' + GROUPS.defense.name + '" with the highest 20-session average traded value on the session before; hold ' + h + ' sessions. One open trade per stock.', sources: [SRC.defense, SRC.fool22], lib: 'E10 / C-GOV1 (contract awards); none' };
  RULES['MACRO-PEACE-E' + h] = { name: 'Ceasefire / peace deal -> the beaten sector fund (hold ' + h + ')', family: 'event', hold: h, kind: 'peace', target: { worst: SPDR11 },
    rule: 'Each dated peace event (table EVENTS: kind peace). On the session before the entry session, rank the 11 SPDR sector funds (' + SPDR11.join(', ') + ') by their 20-session return; buy the WORST at the open of the entry session, hold ' + h + ' sessions.', sources: [SRC.defense24, SRC.hong], lib: 'none' };
  RULES['MACRO-OPEC-E' + h] = { name: 'OPEC+ cut / extension -> energy fund (XLE, hold ' + h + ')', family: 'event', hold: h, kind: 'opec', target: { etf: 'XLE' },
    rule: 'Each dated OPEC+ event (table EVENTS: a new cut, an extension of cuts, or a delay of a planned increase). Buy XLE at the open of the entry session, hold ' + h + ' sessions.', sources: [SRC.opec, SRC.kilian], lib: 'none' };
  RULES['MACRO-OPEC-S' + h] = { name: 'OPEC+ cut / extension -> 10 most traded oil & gas stocks (hold ' + h + ')', family: 'event', hold: h, kind: 'opec', target: { group: 'energy', n: 10 },
    rule: 'Each dated OPEC+ event. Buy at the open of the entry session the 10 liquid stocks of "' + GROUPS.energy.name + '" with the highest 20-session average traded value on the session before; hold ' + h + ' sessions.', sources: [SRC.opec], lib: 'none' };
  RULES['MACRO-CLIM-E' + h] = { name: 'US climate-law step -> clean-energy fund (ICLN, hold ' + h + ')', family: 'event', hold: h, kind: 'climate', target: { etf: 'ICLN' },
    rule: 'Each dated US federal climate-law step (table EVENTS: kind climate). Buy ICLN at the open of the entry session, hold ' + h + ' sessions.', sources: [SRC.ira, SRC.ira2], lib: 'none' };
  RULES['MACRO-CLIM-S' + h] = { name: 'US climate-law step -> 10 most traded clean-energy stocks (hold ' + h + ')', family: 'event', hold: h, kind: 'climate', target: { group: 'clean', n: 10 },
    rule: 'Each dated US federal climate-law step. Buy at the open of the entry session the 10 liquid stocks of the fixed clean-energy list with the highest 20-session average traded value on the session before; hold ' + h + ' sessions.', sources: [SRC.ira, SRC.ira2], lib: 'none' };
}
RULES['MACRO-ROT'] = { name: 'Macro-regime rotation: the 2 sector funds whose macro driver is strongest, monthly', family: 'rotation', hold: 21, target: { rotation: true },
  rule: 'At the close of the last session of each month, score each driver of the fixed map ' + Object.entries(ROT_MAP).map(([d, m]) => (m.sign < 0 ? 'minus ' : '') + d + ' -> ' + m.etf).join(', ') + ': score = sign x (63-session return) / (standard deviation of its daily returns over the previous 252 sessions x sqrt(63)). Hold, equal weight, the funds of the 2 highest POSITIVE scores (fewer positive -> the empty place is cash at 0%), bought at the next open, sold at the close of the last session of that month. Each fund-month is one trade (hold field 21 = one month, for blocks). Extra yardstick: the equal weight of all 6 funds over the same months must be beaten in both halves.',
  sources: [SRC.hong, SRC.moskowitz, SRC.driesprong], lib: 'A-ROT1 (sector funds ranked by their OWN 6-month / 12-1 return: rejected), A-ROT2 (rejected), R4, CHAIN-MOM1: here the rank is the DRIVER\'s move, never the fund\'s own' };
export const IDS = Object.keys(RULES);

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
// first index with D[i] >= d
export const onOrAfter = (D, d) => { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
// the entry session of an event: news before the open of d -> the first session on or after d; else the first session after d. -1 if none yet.
export function entryIdx(D, ev) { let k = onOrAfter(D, ev.d); if (k < D.length && D[k] === ev.d && ev.when !== 'pre') k++; return k < D.length ? k : -1; }
export const retN = (c, t, n) => t - n >= 0 && c[t] > 0 && c[t - n] > 0 ? c[t] / c[t - n] - 1 : null;
// DRIVER FLAGS: flag[t] = 1 when the look-session return at t is in the top (side 'up') or bottom (side 'down') 1-q of the look-session
// returns on the n sessions before t (strictly more than q of them lower / higher); 90% of those n values needed.
export function driverFlags(c, { look = 20, n = 252, q = 0.8, side = 'up' } = {}) { const T = c.length, f = new Uint8Array(T), r = new Array(T).fill(null);
  for (let t = look; t < T; t++) r[t] = retN(c, t, look);
  for (let t = look + n; t < T; t++) { const x = r[t]; if (!ok(x)) continue; let have = 0, beat = 0; for (let k = t - n; k < t; k++) { const y = r[k]; if (!ok(y)) continue; have++; if (side === 'down' ? y > x : y < x) beat++; }
    if (have >= n * 0.9 && beat / have > q) f[t] = 1; }
  return f; }
// VIX SPIKE THEN FALLING: spike at s = close >= (1 + spike) x average of the avgN closes before s; flag at t = a spike in [t-within+1, t]
// and close t <= (1 - drop) x the highest close of those sessions; only the first session of a run of flags is returned.
export function vixFlags(c, { avgN = 60, spike = 0.30, within = 10, drop = 0.15 } = {}) { const T = c.length, sp = new Uint8Array(T), raw = new Uint8Array(T), f = new Uint8Array(T);
  for (let s = avgN; s < T; s++) { let sum = 0, n = 0; for (let k = s - avgN; k < s; k++) if (c[k] > 0) { sum += c[k]; n++; } if (n >= avgN * 0.9 && c[s] >= (1 + spike) * sum / n) sp[s] = 1; }
  for (let t = within; t < T; t++) { if (!(c[t] > 0)) continue; let any = false, hi = 0; for (let k = t - within + 1; k <= t; k++) { if (sp[k]) any = true; if (c[k] > hi) hi = c[k]; } if (any && c[t] <= (1 - drop) * hi) raw[t] = 1; }
  for (let t = 1; t < T; t++) if (raw[t] && !raw[t - 1]) f[t] = 1; return f; }
// rows [{ key, dv }] -> the keys of the n largest finite dv (ties by key)
export function topByValue(rows, n = 10) { return rows.filter(r => ok(r.dv) && r.dv > 0).sort((a, b) => b.dv - a.dv || (a.key < b.key ? -1 : 1)).slice(0, n).map(r => r.key); }
// volatility-scaled 63-session move (null without 252 sessions of daily returns before t)
export function driverScore(c, t, { n = 63, volN = 252 } = {}) { if (t < volN || t - n < 0 || !(c[t] > 0) || !(c[t - n] > 0)) return null; const d = [];
  for (let k = t - volN + 1; k <= t; k++) if (c[k] > 0 && c[k - 1] > 0) d.push(Math.log(c[k] / c[k - 1])); if (d.length < volN * 0.9) return null;
  const m = mean(d), sd = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1)); return sd > 0 ? (c[t] / c[t - n] - 1) / (sd * Math.sqrt(n)) : null; }
// rotation pick: { fund: score } -> the k highest strictly positive scores
export function rotPick(scores, k = 2) { return Object.entries(scores).filter(([, s]) => ok(s) && s > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k).map(([e]) => e); }
export function worstOf(rets) { const a = Object.entries(rets).filter(([, r]) => ok(r)).sort((x, y) => x[1] - y[1]); return a.length ? a[0][0] : null; }
// the last NYSE session of the month of date d (d itself a session)
export function monthEndAfter(d, hol = NYSE_HOLIDAYS) { let x = d; for (;;) { const nx = nextSession(x, hol); if (nx.slice(0, 7) !== d.slice(0, 7)) return x; x = nx; } }

// ---------------- price history ----------------
// rows [[date, open, close]] ascending. Massive rows win; Nasdaq rows BEFORE Massive's first day are scaled by Massive close / Nasdaq close on
// the first common day (split basis); without a common day the Nasdaq rows are not used (unless there is no Massive history at all).
export function stitch(mass, nq) { const m = Array.isArray(mass) ? mass : [], n = Array.isArray(nq) ? nq : []; if (!m.length) return n.slice(); if (!n.length) return m.slice();
  const first = m[0][0], common = m.find(r => n.some(q => q[0] === r[0])); if (!common) return m.slice(); const q0 = n.find(q => q[0] === common[0]), f = common[2] / q0[2]; if (!(f > 0) || !isFinite(f)) return m.slice();
  return [...n.filter(q => q[0] < first).map(q => [q[0], q[1] * f, q[2] * f]), ...m]; }
// a close-to-close jump of 1.9x+ (or 1/1.9 or less) is treated as an unadjusted split: every earlier row is scaled to the new basis
export function splitGuard(rows, maxJump = 1.9) { const out = rows.map(r => r.slice()), fixed = [];
  for (let i = out.length - 1; i >= 1; i--) { const a = out[i - 1][2], b = out[i][2]; if (!(a > 0 && b > 0)) continue; const r = b / a; if (r >= maxJump || r <= 1 / maxJump) { fixed.push(out[i][0]); for (let k = 0; k < i; k++) { out[k][1] *= r; out[k][2] *= r; } } }
  return { rows: out, fixed: fixed.reverse() }; }
// event window: close of the session before entry k -> close of day h (k + h - 1); null if not in the data
export function eventWindow(c, k, hs = [1, 5, 20, 60]) { const o = {}; for (const h of hs) { const x = k + h - 1; o[h] = k >= 1 && x < c.length && c[k - 1] > 0 && c[x] > 0 ? c[x] / c[k - 1] - 1 : null; } return o; }
export function corrBeta(x, y) { const p = []; for (let i = 0; i < Math.min(x.length, y.length); i++) if (ok(x[i]) && ok(y[i])) p.push([x[i], y[i]]); if (p.length < 3) return { n: p.length, corr: null, beta: null };
  const mx = mean(p.map(z => z[0])), my = mean(p.map(z => z[1])); let sxy = 0, sxx = 0, syy = 0; for (const [a, b] of p) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return { n: p.length, corr: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null, beta: sxx > 0 ? sxy / sxx : null }; }

// ---------------- judging ----------------
// average gap between each trade's gross return and a yardstick field (spy / ew) over the trades that have it
export function yardGap(tr, field) { const v = tr.filter(z => ok(z[field])).map(z => z.g - z[field]); return v.length ? r4(mean(v)) : null; }
// the system's judge (unchanged) + the raised gates: better than SPY in both halves (gaps.half.spy, when given) and, for the rotation,
// better than the equal weight of its 6 funds (gaps.half.ew, when given)
export function judgeMacro(R, { bar, gaps = {} } = {}) { const extra = [];
  for (const h of ['older', 'newer']) { const g = gaps[h] || {};
    if ('spy' in g && !(g.spy > 0)) extra.push('not better than SPY in the ' + h + ' half');
    if ('ew' in g && !(g.ew > 0)) extra.push('not better than the equal weight of the 6 rotation funds in the ' + h + ' half'); }
  return judge(R, { bar, extra }); }

// ---------------- library pre-registration (idempotent) ----------------
export function preRegister(LB, day = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Macro and world events', name: a.name, explain: a.rule + ' Source(s): ' + a.sources.map(p => p.cite).join('; ') + '.', status: 'pre-registered ' + day + ' (macro lab); 5-year one-shot pending', agent: 'macro', libraryCheck: a.lib,
      sources: a.sources.map(p => p.url), note: 'Pre-registered ' + day + ' BEFORE any run (macro-core.mjs = the exact rule and the dated event table; one version; hold ' + a.hold + ' sessions). 5-year one-shot by macro-lab.mjs, first complete verdict frozen in data/macro-lab.json; forward paper lane (data/macro-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = day; return ch; }
