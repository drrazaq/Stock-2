import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const r=spawnSync(process.execPath,[fileURLToPath(new URL('../historical-custody-rehearsal.mjs',import.meta.url))],{cwd:root,env:process.env,timeout:240000,killSignal:'SIGKILL',maxBuffer:16384,encoding:'utf8'});
const ok=r.status===0&&!r.signal&&r.stdout==='PASS\n';console.log(ok?'PASS':'ERROR');process.exitCode=ok?0:1;
