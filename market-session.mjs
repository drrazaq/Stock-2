// NYSE cash-equity calendar, explicitly bounded to reviewed 2026/2027 dates.
// Source: https://www.nyse.com/markets/hours-calendars . Unknown years fail closed.
const holidays=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25','2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24']);
const early=new Set(['2026-11-27','2026-12-24','2027-11-26']);
export function marketSession(day) {
 const valid=typeof day==='string'&&/^202[67]-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
 const closed=!valid||[0,6].includes(new Date(day+'T12:00:00Z').getUTCDay())||holidays.has(day);
 return {day,known:valid,closed,open:closed?null:570,close:closed?null:early.has(day)?780:960};
}
