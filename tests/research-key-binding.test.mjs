import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sealResearch,openResearch} from '../tools/seal-research-artifact.mjs';

const yaml=fs.readFileSync(new URL('../docs/validation/premarket-research-validation.yml.proposed',import.meta.url),'utf8');
const proposal=fs.readFileSync(new URL('../docs/production-validation-approval.md',import.meta.url),'utf8');

test('dormant Phase A proposal binds only separate research artifact secret',()=>{
  assert.match(yaml,/^\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yaml,/^\s*schedule:\s*$/m);
  assert.match(yaml,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(yaml,/secrets\.PRIVATE_KEY\b/);
  assert.match(yaml,/RESEARCH_ARTIFACT_KEY: \$\{\{ secrets\.RESEARCH_ARTIFACT_KEY \}\}/);
  assert.match(yaml,/PRIVATE_KEY: \$\{\{ secrets\.RESEARCH_ARTIFACT_KEY \}\}/);
  assert.equal((yaml.match(/secrets\.RESEARCH_ARTIFACT_KEY/g)||[]).length,2);
  assert.equal((yaml.match(/process\.env\.RESEARCH_ARTIFACT_KEY/g)||[]).length,2);
  assert.doesNotMatch(yaml,/process\.env\.PRIVATE_KEY/);
  assert.match(proposal,/independently recoverable external copy of `RESEARCH_ARTIFACT_KEY`/);
  assert.match(proposal,/never reads GitHub's existing `secrets\.PRIVATE_KEY`/);
});

test('new research password seals and opens an artifact, unrelated legacy password fails',()=>{
  const researchKey='fixture-only-research-password-2026-not-a-production-secret';
  const unrelatedLegacyKey='fixture-only-unrelated-existing-private-key';
  const original=Buffer.from('synthetic evidence, no provider responses or owner records');
  const sealed=sealResearch(original,researchKey,{sourceSha:'a'.repeat(40),path:'synthetic.json'});
  assert.deepEqual(openResearch(sealed,researchKey),original);
  assert.throws(()=>openResearch(sealed,unrelatedLegacyKey));
});
