// LEAGUE LUCK BAR for every study verdict (shared helper; imported, not run by a workflow). league.mjs counts the rules tried by all
// studies and agents together and writes the bar to data/agent-league.json. A study that prints a passing verdict (PASS / PROMISING /
// SWITCH WINS / BETTER ...) on its own, smaller luck bar must also clear max(own bar, league bar); otherwise the verdict becomes
// 'BELOW THE LEAGUE BAR' and says so plainly. Rules and their own bars are unchanged: this can only downgrade, never upgrade.
import fs from 'node:fs';
export const BELOW = 'BELOW THE LEAGUE BAR';
export function leagueBar() { try { const L = JSON.parse(fs.readFileSync('data/agent-league.json', 'utf8')), b = +L.bar; return isFinite(b) && b > 0 ? { bar: b, trials: L.trials || null } : { bar: 0, trials: null }; } catch (e) { return { bar: 0, trials: null }; } }
// ts: the t values the verdict rests on (all must clear); own: the study's own bar. Returns null when it clears, else a plain reason.
export function belowLeague(ts, own) { const { bar, trials } = leagueBar(), need = Math.max(own || 0, bar), vals = (Array.isArray(ts) ? ts : [ts]).map(Number);
  if (!(bar > (own || 0))) return null; if (vals.every(t => isFinite(t) && t >= need)) return null;
  return 'it cleared its own ' + (own ? 'luck bar (t ' + vals.map(t => isFinite(t) ? t.toFixed(2) : 'n/a').join(' / ') + ', ' + (+own).toFixed(2) + ' needed)' : 'tests (t ' + vals.map(t => isFinite(t) ? t.toFixed(2) : 'n/a').join(' / ') + ')') + ' but not the league bar (t ' + need.toFixed(2) + ' needed' + (trials ? ', ' + trials + ' rules tried by all studies and agents together' : '') + '), so it could be luck'; }
