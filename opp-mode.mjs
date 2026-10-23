// OPPORTUNITIES ONLY (owner, 23 Oct 2026: "I want opportunities, not alerts"). On unless data/settings.json has opportunitiesOnly: false.
// Messages that are not a tested buy (early-wave paper alerts, RUNNERS NOW heads-ups) are still recorded for the scorecard, but not sent.
export const oppOnly = (st) => !st || st.opportunitiesOnly !== false;
export const sendAlert = ({ early }, st) => !(early && oppOnly(st));
