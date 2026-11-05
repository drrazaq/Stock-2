// Inactive origin safeguards. A name without a test marker is never authentication.
import {createHash,createPublicKey} from 'node:crypto';
const need=(v,c)=>{if(!v)throw Error(c);};
export const publicFingerprint=p=>createHash('sha256').update(createPublicKey(p).export({type:'spki',format:'der'})).digest('hex');
// RFC8032 section7.1 public test vector, SPKI SHA256; never a deployable authority.
export const KNOWN_PUBLIC_TEST_FINGERPRINTS=Object.freeze(['06e3fd8fda29bb60ab59557de61edb0aecdb231134be30e75b455f8e1b792fa9']);
const marker=s=>typeof s==='string'&&/(?:SYNTHETIC|FIXTURE|TEST_ONLY|TEST_KEY|LAB_ONLY)/i.test(s);
export function assertResearchBoundary(store,contract,context={}){
 if(store.origin==='SYNTHETIC')return {status:'SYNTHETIC_ONLY',authenticated:false};
 need(store.origin==='RETAINED_RESEARCH','STORE_ORIGIN_MISMATCH');
 const ids=[store.recoveryAuthority?.id,...(contract?.roots||[]).map(x=>x.id),...(contract?.collectors||[]).flatMap(x=>[x.id,x.provenanceReference]),...(context.hosts||[]),...(context.ids||[])];
 need(!ids.some(marker),'SYNTHETIC_IDENTITY_IN_RESEARCH_STORE');
 const e=store.retainedEnrollment;need(e?.version===1&&e.kind==='EXPLICIT_RETAINED_ROOT_ENROLLMENT'&&/^[a-f0-9]{64}$/.test(e.reviewReference||'')&&e.authentication==='NOT_ESTABLISHED_BY_ENROLLMENT','RETAINED_ENROLLMENT_REQUIRED');
 need(!marker(e.id)&&e.recoveryFingerprint===publicFingerprint(store.recoveryAuthority.publicKey),'RETAINED_RECOVERY_ROOT_MISMATCH');
 need(Array.isArray(e.roleFingerprints)&&e.roleFingerprints.length===4&&e.roleFingerprints.every(x=>['OWNER','CAPTURE','REVIEW','WITNESS'].includes(x.role)&&/^[a-f0-9]{64}$/.test(x.sha256))&&new Set(e.roleFingerprints.map(x=>x.role)).size===4&&new Set(e.roleFingerprints.map(x=>x.sha256)).size===4,'RETAINED_ROLE_PINS_REQUIRED');
 if(contract){const actual=contract.roots.map(x=>({role:x.roles[0],sha256:publicFingerprint(x.publicKey)}));need(actual.length===4&&actual.every(x=>e.roleFingerprints.some(y=>x.role===y.role&&x.sha256===y.sha256)),'RETAINED_ROLE_PIN_MISMATCH');}
 if(context.fingerprints)need(!context.fingerprints.some(x=>[...KNOWN_PUBLIC_TEST_FINGERPRINTS,...(e.knownTestFingerprints||[])].includes(x)),'KNOWN_TEST_KEY_IN_RESEARCH_STORE');
 need(Array.isArray(e.knownTestFingerprints)&&e.knownTestFingerprints.every(x=>/^[a-f0-9]{64}$/.test(x)),'TEST_KEY_EXCLUSION_LIST_REQUIRED');
 const all=[e.recoveryFingerprint,...e.roleFingerprints.map(x=>x.sha256)];need(!all.some(x=>[...KNOWN_PUBLIC_TEST_FINGERPRINTS,...e.knownTestFingerprints].includes(x)),'KNOWN_TEST_KEY_IN_RESEARCH_STORE');
 need(!(context.securityIds||[]).some(x=>['BBG000000001','SYNTHETIC_COMMON'].includes(x))&&!(context.assetIds||[]).includes('11111111-1111-4111-8111-111111111111'),'KNOWN_TEST_SECURITY_IN_RESEARCH_STORE');
 return {status:'ENROLLED_DECLARATION_NOT_AUTHENTICATED',authenticated:false,synthetic:null};
}
