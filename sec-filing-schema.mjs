// Structural coverage only. This does not authenticate SEC availability or revisions.
export function validSecFilings(value) {
 if (!value || typeof value !== 'object' || Array.isArray(value) || value.error || value.errors) return false;
 const keys=['form','accessionNumber','acceptanceDateTime','filingDate'];
 if (!keys.every(k=>Array.isArray(value[k]))) return false;
 const n=value.form.length;
 return keys.every(k=>value[k].length===n) && keys.every(k=>value[k].every(x=>typeof x==='string'));
}
export function validSecArchiveList(value) {
 return Array.isArray(value) && value.every(x=>x && typeof x==='object' && /^CIK\d+-submissions-\d+\.json$/.test(x.name) && /^\d{4}-\d{2}-\d{2}$/.test(x.filingTo));
}
