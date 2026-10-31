// SYNTHETIC ONLY: disposable commits and owner grants are NOT authorization.
import fs from 'node:fs';import path from 'node:path';
import {wrapperFixture,fixtureGit,t,fixtureKey} from './capture-wrapper-fixture.mjs';
import {APPROVED_BINDING_FILES,inputFingerprint} from '../paper-capture-wrapper.mjs';
import {sha} from '../prospective-paper-capture.mjs';
import {APPROVED_CONTROL_LIMITS} from '../capture-approved-binding.mjs';
import {artifactWireFixture,syntheticArtifactToken,syntheticResultsOrigin,syntheticStorageOrigin} from './artifact-wire-fixture.mjs';
const root=new URL('../',import.meta.url);
export function approvedFixture(native){const f=wrapperFixture();
 for(const file of APPROVED_BINDING_FILES){fs.mkdirSync(path.dirname(path.join(f.root,file)),{recursive:true});fs.copyFileSync(new URL(file,root),path.join(f.root,file));}
 fixtureGit(f.root,['add','.']);fixtureGit(f.root,['commit','-qm','SYNTHETIC approved binding source']);const sourceSha=fixtureGit(f.root,['rev-parse','HEAD']);
 const wf=path.join(f.reviewRoot,'.github/workflows/sec-paper-capture.yml');fs.writeFileSync(wf,fs.readFileSync(wf,'utf8').replace(f.approval.plan.sourceSha,sourceSha).replace('PAPER_CAPTURE_EXECUTION: INACTIVE_OFFLINE_REHEARSAL','PAPER_CAPTURE_EXECUTION: APPROVED_CALIBRATION_V1').replace('timeout-minutes: 10','timeout-minutes: 45'));
 fixtureGit(f.reviewRoot,['add','.']);fixtureGit(f.reviewRoot,['commit','-qm','SYNTHETIC future workflow contract not installed']);const workflowCommitSha=fixtureGit(f.reviewRoot,['rev-parse','HEAD']);
 f.approval.kind='PAPER_CAPTURE_LIVE_BINDING_APPROVAL_V1';f.approval.plan.sourceSha=sourceSha;f.approval.plan.enrollmentManifestSha256=inputFingerprint(f.approval.referenceSha256,f.approval.plan);f.approval.runtimeFiles=Object.fromEntries(APPROVED_BINDING_FILES.map(n=>[n,sha(fs.readFileSync(path.join(f.root,n)))]));f.approval.workflowCommitSha=workflowCommitSha;f.approval.workflowSha256=sha(fs.readFileSync(wf));f.context.workflowCommitSha=workflowCommitSha;f.history.workflow_runs[0].head_sha=workflowCommitSha;
 f.entitlementFile=path.join(f.dir,'SYNTHETIC-entitlement.json');fs.writeFileSync(f.entitlementFile,JSON.stringify({label:'SYNTHETIC_NOT_OFFICIAL_EVIDENCE',plan:'MOCK_SIP_AND_RETENTION'}));f.entitlementSha256=sha(fs.readFileSync(f.entitlementFile));f.approval.entitlements.evidenceSha256=f.entitlementSha256;
 f.approval.controlLimits={...APPROVED_CONTROL_LIMITS};f.approval.bindingReview={version:1,approved:true,continuityPolicyApproved:false,protocol:'EXISTING_STREAM_SEC_30M_V1',primaryAdmission:'DISABLED_PENDING_CONTINUITY_REVIEW'};f.approval.native={sourceSha:native.expectedSourceSha,runId:'123-1',workflowId:7,directorySuffix:'runtime/native-sec-events/123-1'};f.approval.artifactScope={resultsOrigin:'https://results-receiver.actions.githubusercontent.com',storageOrigins:[syntheticStorageOrigin]};
 f.native=native;f.output=path.join(f.root,'runtime/paper-capture/123-1');f.save=()=>{fs.writeFileSync(f.approvalFile,JSON.stringify(f.approval));f.approvalSha256=sha(fs.readFileSync(f.approvalFile));};f.save();return f;
}
export function approvedServices(f,{historyFault,providerFault,artifactFault,onHistory=()=>{},onProvider=()=>{},onArtifact=()=>{}}={}){
 let clock=f.nowMs-30000,controlOpens=0,captureOpens=0;const requests={history:[],provider:[],artifact:[]},wire=artifactWireFixture({onRequest:onArtifact});
 return {requests,wire,clock:{now:()=>clock,sleep:async ms=>{clock+=ms;},setTimeout,clearTimeout},setTime:x=>{clock=x;},opens:()=>({controlOpens,captureOpens}),
 openControlBindings:async()=>{controlOpens++;return {githubToken:'SYNTHETIC_GITHUB_TOKEN'};},openCaptureBindings:async()=>{captureOpens++;return {keyId:'SYNTHETIC_ALPACA_KEY',secret:'SYNTHETIC_ALPACA_SECRET',encryptionKey:fixtureKey,runtimeToken:syntheticArtifactToken};},
 transports:{history:async(url,o)=>{requests.history.push({url,...o});await onHistory(url,o);if(historyFault)return historyFault(url,o);if(url.includes('/sec-paper-capture.yml/runs?'))return Response.json(f.history);if(url.includes('/workflows/7/runs?'))return Response.json({total_count:0,workflow_runs:[]});throw Error('SYNTHETIC_UNEXPECTED_HISTORY');},
 provider:async(url,o)=>{requests.provider.push({url,...o});await onProvider(url,o);if(providerFault){const response=await providerFault(url,o);if(response)return response;}const minute=Math.floor((clock-f.nowMs)/60000),data=Object.fromEntries(f.universe.map(symbol=>[symbol,{latestQuote:{t:new Date(clock).toISOString(),bp:9.99,ap:10.01,bs:1000,as:1000},minuteBar:{t:t(minute-1),l:9,h:11,v:250000}}]));return Response.json(data);},
 artifact:async(url,o)=>{requests.artifact.push({url,...o});if(artifactFault)return artifactFault(url,o);return wire.fetcher(url.replace(f.approval.artifactScope.resultsOrigin,syntheticResultsOrigin),o);}}};
}
