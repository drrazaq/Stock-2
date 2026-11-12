import fs from 'node:fs';import path from 'node:path';
import {quoteHash,restoreQuoteRecovery,readPrivateAssessmentQuote} from '../private-quote-retention.mjs';
import {readPrivateAssessment} from '../research-assessment.mjs';
const [input,target]=process.argv.slice(2);
try{
 if(!path.isAbsolute(target)||fs.existsSync(target)||target.startsWith(process.cwd()+path.sep))throw Error('FRESH_PRIVATE_ROOT');fs.mkdirSync(target,{mode:0o700});
 const read=n=>{const p=path.join(input,n),s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.size>3*1048576)throw Error('EXPORT_BOUND');return fs.readFileSync(p);};
 const receipt=JSON.parse(read('receipt.json')),q=read('quote-recovery.json'),a=JSON.parse(read('assessment-recovery.json'));
 const qr=path.join(target,'quote'),ar=path.join(target,'assessment');for(const d of [qr,ar])fs.mkdirSync(d,{mode:0o700});
 restoreQuoteRecovery({bundle:q,pinnedSha256:receipt.quoteRecoverySha256,root:qr,checkout:process.cwd()});
 if(a.kind!=='BOUNDED_ASSESSMENT_RECOVERY_V1'||!a.files||Object.keys(a.files).length>20)throw Error('ASSESSMENT_ENVELOPE');
 let total=0;const checked=[];for(const [name,row] of Object.entries(a.files)){
  if(!/^(assessment-policy\.json|evaluation\.json|book-current\.json|book-[a-f0-9]{64}\.json|journal-[a-f0-9]{64}\.jsonl|assessment-delivery\.jsonl)$/.test(name)||typeof row.data!=='string')throw Error('RECOVERY_PATH');
  const b=Buffer.from(row.data,'base64');total+=b.length;if(total>3*1048576||quoteHash(b)!==row.sha256)throw Error('RECOVERY_BYTES');checked.push([name,b]);
 }
 for(const [n,b]of checked)fs.writeFileSync(path.join(ar,n),b,{mode:0o600,flag:'wx'});
 if(quoteHash(fs.readFileSync(path.join(qr,'policy.json')))!==receipt.quotePolicySha256||quoteHash(fs.readFileSync(path.join(ar,'assessment-policy.json')))!==receipt.assessmentPolicySha256)throw Error('POLICY_BINDING');
 // Reader validates derivation at original observation time, not a fabricated fresh quote clock.
 for(const symbol of ['TWLO','COST']){
  readPrivateAssessmentQuote(symbol,{root:qr,policySha256:receipt.quotePolicySha256});
  const b=readPrivateAssessment(symbol,{root:ar,checkout:process.cwd(),policySha256:receipt.assessmentPolicySha256,now:Date.parse(receipt.at)});
  if(!b.record)throw Error('ASSESSMENT_DERIVATION');
 }
 console.log('ORIGINAL_QUOTE_AND_ASSESSMENT_BYTES_RESTORED_NO_EXPIRY_REFRESH_NO_SEND');
}catch{console.error('PRIVATE_RECOVERY_UNVERIFIED_NO_REACQUISITION');process.exitCode=1;}
