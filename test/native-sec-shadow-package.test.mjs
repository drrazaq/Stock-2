import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
test('historical v1 exact5-file patch: disposable application preserves pinned result hashes',()=>{
 const m=JSON.parse(read('docs/validation/native-sec-shadow-production-manifest.json')),patch=read('docs/validation/native-sec-shadow-production.patch'),base=JSON.parse(gunzipSync(read('docs/validation/native-sec-shadow-base.json.gz'),{maxOutputLength:131072}));assert.equal(hash(patch),m.patchSha256);assert.equal(base.commit,m.productionBase);assert.equal(m.providerRequestsAdded,0);assert.equal(m.messagesAdded,0);assert.equal(m.scoringFormulaChanges,0);assert.equal(m.productionChanged,false);assert.deepEqual(m.files,['.github/workflows/ignition.yml','capture-json.mjs','ignition-watch.mjs','native-sec-events.mjs','native-sec-shadow.mjs']);
 const dir=fs.mkdtempSync('/tmp/native-patch-check-');try{for(const [p,text]of Object.entries(base.files)){assert.equal(hash(text),m.before[p]);fs.mkdirSync(path.dirname(path.join(dir,p)),{recursive:true});fs.writeFileSync(path.join(dir,p),text);}execFileSync('git',['init','-q'],{cwd:dir,stdio:'ignore'});const file=path.join(dir,'proposal.patch');fs.writeFileSync(file,patch);execFileSync('git',['apply','--check',file],{cwd:dir,stdio:'ignore',timeout:10000});for(const [p,text]of Object.entries(base.files))assert.equal(fs.readFileSync(path.join(dir,p),'utf8'),text);assert.equal(fs.existsSync(path.join(dir,'native-sec-events.mjs')),false);execFileSync('git',['apply',file],{cwd:dir,stdio:'ignore'});for(const [p,h]of Object.entries(m.after))assert.equal(hash(fs.readFileSync(path.join(dir,p))),h);assert.equal(hash(read('edgar-feed.mjs')),m.unchangedDependencies['edgar-feed.mjs']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('one canonical request budget:18reference +41capture =59, shadow adds0; live host remains a separate implementation gap',()=>{
 const b=JSON.parse(read('docs/validation/paper-capture-request-budget.json')),l=JSON.parse(read('docs/validation/paper-capture-live-scope.json'));assert.equal(b.referencePreparation.maximumRequests,18);assert.equal(b.referencePreparation.MassiveTickerDetails+b.referencePreparation.AlpacaSingleAsset+b.referencePreparation.SECSubmissions,18);assert.equal(b.capture.maximumRequests,41);assert.equal(b.combinedMaximumAdditionalSourceRequests,59);assert.equal(b.nativeShadowIntegration.additionalProviderRequests,0);assert.equal(b.allExecutionCurrentlyAuthorized,false);assert.equal(l.implemented,false);assert.equal(l.activated,false);assert.equal(l.rehearsalGuardMayBeBypassed,false);
});
