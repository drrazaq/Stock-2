// Offline legacy-fixture context, never a production or market-observation clock.
const RealDate=globalThis.Date,at=RealDate.parse('2026-10-26T12:00:00.000Z');
globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}};
