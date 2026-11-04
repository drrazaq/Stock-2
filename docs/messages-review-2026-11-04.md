# Review of 4 Nov 2026 Telegram stop and research messages (sanitized)

Reviewer: the Claude session, read-only. The owner pasted the message texts. They are kept **privately in this session only** (SHA256 `b9439df5…d8ef8d45`) and are not in this repository.

- **Holdings:** held positions appear here as A–D, with no prices, entries or stops.
- **Research tickers:** public market symbols, named only where needed.
- **Times:** Telegram receipt times were not supplied, and none are inferred.
- **Not changed:** no rule change and no test message.

## Delivered versus covered

| | Evidence | Status |
|---|---|---|
| Watcher messages delivered | 14 delivery records today (`data/watcher-message-state/2026-11-04/`), all `ACKNOWLEDGED` on the first attempt between 09:28 and 10:03 New York | **Delivered, verified.** The 14 match the pasted watcher texts exactly: 6 stop messages and 8 EARLY WATCH messages. |
| Bot "Market hours check" messages | 2 messages, which the owner received | **Delivered, owner-reported.** The bot keeps no per-message delivery receipt. |
| Market coverage | Watcher run 41845636679 was started by the watcher guard at 09:14 New York, and its job began observing at 09:15 | **Not yet verified.** Its first recorded minute and the full session (to 15:00 New York) can only be checked after the run finishes. Delivered messages do not prove the market was continuously covered. |

## Findings

**F1. Every stop event goes out twice, through two routes with separate de-duplication.**
- **Route A:** the live watcher (`ignition-watch.mjs` → `stop-watch.mjs`, every minute) sends `STOP HIT NOW` or `NEAR STOP`. It de-duplicates by watcher message key, once per day.
- **Route B:** the bot's full check (`scan.mjs` ~4181, about every 15 minutes in chat mode) sends `Market hours check … YOUR POSITION: STOP LOSS REACHED`. It de-duplicates in `data/alert-state.json`, once per day.
- Each route stops its own repeats but cannot see the other's. Today all four stop events (A–D) arrived once from each route.

**F2. The two routes give conflicting instructions for the same event.**
- **Route A:** "SELL NOW at market … Then send: sold … PRICE".
- **Route B:** "Sell / reassess now", followed by "Tested signals, not instructions. Not financial advice".
- For the owner's own stop, the footer contradicts the action line.

**F3. "is under your stop" is printed when the price equals the stop.**
- One message read "*X.XX is under your stop X.XX*" with identical numbers. Both routes trigger at `price <= stop`, but the text says "under".
- The trigger rule is correct. The wording is not.

**F4. The stop alert's price source and freshness are not shown, and Route B has no staleness gate for stops.**
- **Stop levels:** they match the saved stops in `data/my-positions.json` exactly for all four positions.
- **Route A prices:** come from the watcher's live snapshot, either Alpaca IEX or the Massive snapshot. Each field keeps its own provider clock.
- **Route B prices:** come from a Finnhub quote. Its timestamp is computed (`fresh`), but that is used only to gate BUY NOW, not stop alerts.
- **Result:** the two routes' prices for the same event differed by about 0.1–0.3%, which fits different feeds and moments. Neither message states the source or the quote time, so freshness cannot be verified from the message.

**F5. Catalyst times have no date and mix time zones.**
- The SEC and headline times print only `HH:MM New York` (`early-alerts.mjs` `nyHM`). FRESH means "within 24 hours", so a time from the previous afternoon prints with no date:
  - SMCI: headline "10:23" in a 09:39 alert;
  - ALIT: headline "12:07" in a 09:57 alert;
  - SGHC: filing "16:07" and headline "16:05" in a 09:37 alert.

  Each is from the previous day, yet reads like today and is labelled FRESH.
- RECYCLED items print a date in **UTC** ("11-02 12:15 UTC") while FRESH items use New York time without a date. One message therefore mixes two time formats.
- I could not cross-check the full timestamps against a saved ledger. Today's `opp-ledger` rows are not on `main` yet; they are written after the close.

**F6. Research labels are consistent.** I found no defect in the eight EARLY WATCH messages:
- every one states NOT AN APPROVED BUY, paper or research only, HALAL UNKNOWN or the ZAD mark, REJECTED or UNPROVEN status, and the spread-adjusted hurdle;
- the opt-out hints differ by kind ("alerts approved" for paper setups, "alerts paper" for research leads), which is intended.

## Suggested follow-ups

These need separate owner approval. No trading-rule change is proposed.

1. Send stop events through one route, or make the routes share one de-duplication key.
2. Give stop alerts one instruction style.
3. Say "at or under".
4. Show the price source and quote age on stop alerts, and give Route B a staleness note.
5. Print catalyst dates, for example "Nov 3 16:07 New York", in one time zone.
6. After the watcher finishes, confirm its coverage separately.
