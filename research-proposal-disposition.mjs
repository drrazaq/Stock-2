// Current disposition over archived unadopted B/C designs. No enrollment or policy adoption.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const FILE=new URL('./docs/research-bc/current-disposition.json',import.meta.url),PIN='efc64a9dc99f32044111a24800a72e83ba09e93030fe219bfafebd235670fb78';
export function bcDisposition(track){const b=fs.readFileSync(FILE);if(createHash('sha256').update(b).digest('hex')!==PIN)throw Error('DISPOSITION_PIN_CHANGED');const d=JSON.parse(b);if(!['B','C'].includes(track))throw Error('UNSUPPORTED_TRACK');return Object.freeze({...d[track],sourceReview:d.review,policyAdopted:false});}
export function requireBCStudyPermission(track){const d=bcDisposition(track);if(!d.enrollmentAllowed||!d.persistenceAllowed)throw Error('BC_DESIGN_RETIRED_OR_STOPPED');return d;}
