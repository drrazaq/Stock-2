// "slot" job of the scheduled workflows: prints skip=1 when this run came from GitHub's cron while the schedule guard (inside the
// always-on bot job) is alive, because the guard already started this job on time and GitHub's cron is often hours late (a late
// copy re-sends messages or scans after the close). Fails open: any doubt prints skip= and the job runs as before.
import fs from 'node:fs';
const env = process.env;
let skip = '';
try {
  if (env.EVENT === 'schedule') {
    const st = JSON.parse(fs.readFileSync('data/schedule-guard.json', 'utf8'));
    const fresh = st && st.beat && Date.now() - st.beat < 45 * 60000;
    let botUp = false;
    if (fresh && env.GH_TOKEN && env.REPO) {
      const r = await fetch('https://api.github.com/repos/' + env.REPO + '/actions/workflows/bot.yml/runs?status=in_progress&per_page=1', { headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json' } });
      botUp = r.ok && ((await r.json()).total_count || 0) > 0;
    }
    if (fresh && botUp) skip = '1';
  }
} catch (e) { skip = ''; }
console.log('skip=' + skip);
