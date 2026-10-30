import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(read(p)).digest('hex');
test('inactive proposal pins unchanged protocol and exact offline runtime; candidate is not an approval',()=>{
 const m=json('docs/validation/prospective-paper-capture-manifest.json'),w=json('docs/validation/prospective-paper-capture-workflow.json'),c=json('docs/validation/paper-capture-calibration.candidate.json');
 for(const [p,h]of Object.entries(m.runtimeFiles))assert.equal(hash(p),h,p);
 assert.equal(m.protocolUnchangedSha256,'57254fa0a2845cf392d4f5cbb59225eeda5d9387e34f1d7be6de546baf452b43');
 assert.equal(hash('docs/validation/prospective-paper-capture-workflow.json'),m.workflowSpecSha256);assert.equal(hash('docs/validation/paper-capture-calibration.candidate.json'),m.candidateSha256);
 assert.equal(w.runtimeSourceSha,m.sourceSha);assert.equal(c.sourceSha,m.sourceSha);assert.equal(c.granted,false);assert.equal(c.workflowImplemented,false);assert.equal(c.referenceInputSha256,null);assert.equal(c.evaluation.approved,false);assert.equal(w.installable,false);assert.equal(m.originalAuditGenuineAdmissions,0);
 assert.equal(w.budgets.totalProviderAttempts,48);assert.equal(w.budgets.snapshotAttempts,41);assert.equal(w.budgets.symbols,6);assert.deepEqual(c.universe,['AMD','INTC','NVDA','AMAT','LRCX','KLAC']);assert.equal(c.cohort,'CALIBRATION');assert.equal(c.enrollmentManifestSha256,null);
});
