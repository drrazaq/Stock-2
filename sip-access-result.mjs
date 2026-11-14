// Fixed non-sensitive output contract. Status and exit are validated together; no raw values are echoed.
export const RESULT_EXITS=Object.freeze({
 PASS:0,
 BLOCKED_CONTEXT:2,BLOCKED_SOURCE:2,BLOCKED_APPROVAL:2,BLOCKED_INPUT:2,BLOCKED_START_TOO_EARLY:2,BLOCKED_START_TOO_LATE:2,BLOCKED_BINDING:2,BLOCKED_EXISTING_REPORT:2,
 ERROR_CLOCK:1,ERROR_INTERRUPTED:1,ERROR_DEADLINE:1,ERROR_TIMEOUT:1,ERROR_HTTP_401:1,ERROR_HTTP_403:1,ERROR_HTTP_429:1,ERROR_HTTP_OTHER:1,ERROR_RESPONSE:1,ERROR_STORAGE:1,ERROR:1
});
export function normalizeSipResult(output,exitCode){
 if(typeof output!=='string'||output.length>128||!Number.isInteger(exitCode))return {code:'ERROR',exitCode:1};
 const match=/^([A-Z][A-Z0-9_]*)(?:\n)?$/.exec(output);
 if(!match||match[0]!==output||!Object.hasOwn(RESULT_EXITS,match[1])||RESULT_EXITS[match[1]]!==exitCode)return {code:'ERROR',exitCode:1};
 return {code:match[1],exitCode};
}
