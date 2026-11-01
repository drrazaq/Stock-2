import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),hash=s=>createHash('sha256').update(s).digest('hex');
const manifest=JSON.parse(read('docs/validation/sip-access-diagnostic-manifest.json'));
test('inactive package hashes and immutable source pin match the reviewed guard/client bytes',()=>{
 for(const [p,digest]of Object.entries(manifest.fileHashes))assert.equal(hash(read(p)),digest,p);
 assert.match(manifest.sourceCommit,/^[a-f0-9]{40}$/);
 const y=read('docs/validation/sip-access-diagnostic.workflow.yml.proposed');assert.ok(y.includes('ref: '+manifest.sourceCommit));assert.ok(y.includes('SIP_APPROVED_SOURCE: '+manifest.sourceCommit));
 assert.equal(fs.existsSync(new URL('../.github/workflows/sip-access-diagnostic.yml',import.meta.url)),false);
});
test('proposed wrapper has read-only permissions, no automatic trigger and exactly the existing provider bindings',()=>{
 const y=read('docs/validation/sip-access-diagnostic.workflow.yml.proposed');
 assert.match(y,/permissions:\n  contents: read\n/);assert.match(y,/timeout-minutes: 20/);assert.match(y,/github.run_attempt == 1/);
 assert.doesNotMatch(y,/schedule:|pull_request:|push:|contents: write|actions: write|TG_TOKEN|PRIVATE_KEY|RESEARCH_ARTIFACT_KEY|cancel-in-progress: true/);
 assert.deepEqual([...y.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]).sort(),['ALPACA_KEY','ALPACA_SECRET']);
 assert.ok(y.indexOf('Verify immutable files before binding')<y.indexOf('      - name: Protected diagnostic only'));assert.match(y,/persist-credentials: false/);assert.match(y,/retention-days: 3/);
});
test('accepted inactive contracts and separate integration/approval boundaries remain explicit',()=>{
 const report=read('docs/market-data-contracts-review-pass.md');
 assert.match(report,/f61bcf748c569bd86ec6997267bc23fa5984e113/);assert.match(report,/d49ff0fa3c5045ea0a0b72f61945a4f8e891b567a36c4c0c45445eebc8013f4d/);
 assert.equal(manifest.contractsEdited,false);assert.equal(manifest.productionDeployment,false);assert.equal(manifest.providerCallsMade,0);
 const p=JSON.parse(read('docs/validation/sip-access-plan.proposed.json'));assert.equal(p.approved,false);assert.equal(p.limits.requests,7);
 const d=read('docs/contracts-integration-proposal.md');assert.match(d,/not that patch/);assert.match(d,/Twenty sessions is an initial measurement suggestion/);
});
