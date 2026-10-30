// Admission audit for newly supplied evidence. No study execution or source writes.
import fs from 'node:fs';
import {auditHistoricalEvidence} from '../historical-integrity.mjs';
if(process.argv.length!==3)throw Error('usage: node tools/check-research-evidence.mjs EVIDENCE.json');
const report=auditHistoricalEvidence(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));
console.log(JSON.stringify(report,null,2));
if(report.status!=='STRUCTURE_VALID_ONLY')process.exitCode=1;
