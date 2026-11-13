// The declared private data repository binding, shared by the watcher reservation route and custody check (read-only helpers; no git
// command runs here). Same URL rule and credential passing as .github/private-data.sh: environment config only, never a URL, file or log.
import path from 'node:path';
export const PRIVATE_REPO_URL = (env = process.env) => env.PRIVATE_DATA_URL || 'https://github.com/' + (env.PRIVATE_DATA_REPO || 'drrazaq/stock-2-private-data') + '.git';
export const privateCloneDir = (env = process.env) => env.PRIVATE_DATA_DIR || path.join(env.RUNNER_TEMP || '/tmp', 'private-data');
export const custodyReceipt = (env = process.env) => path.join(env.RUNNER_TEMP || '/tmp', 'watcher-custody-admitted.json');
// git credentials for the private repository, exactly as private-data.sh passes them: environment config only, never a URL, file or log line
export function privateGitEnv(env = process.env) {
  if (!env.PRIVATE_DATA_TOKEN) return {};
  return { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: 'AUTHORIZATION: basic ' + Buffer.from('x-access-token:' + env.PRIVATE_DATA_TOKEN).toString('base64'), GIT_TERMINAL_PROMPT: '0' };
}
