// Strict bounded JSON shape parser shared by the inactive wrapper and recovery.
export function captureJson(text,maxBytes=8*1024*1024){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024||typeof text!=='string'||Buffer.byteLength(text)>maxBytes)throw Error('JSON_BUDGET');
 let at=0,nodes=0;const bad=()=>{throw Error('JSON_SCHEMA');},ws=()=>{while(/[ \t\r\n]/.test(text[at]||'x'))at++;};
 const str=()=>{const from=at++;while(at<text.length){if(text[at]==='\\'){at+=2;continue;}if(text[at++]==='"')return JSON.parse(text.slice(from,at));}bad();};
 function value(depth){if(depth>64||++nodes>500000)bad();ws();const ch=text[at];if(ch==='"'){str();return;}if(ch==='{'||ch==='['){at++;ws();const end=ch==='{'?'}':']',keys=new Set();if(text[at]===end){at++;return;}while(at<text.length){if(ch==='{'){if(text[at]!=='"')bad();const key=str();if(keys.has(key)||['__proto__','constructor','prototype'].includes(key))bad();keys.add(key);ws();if(text[at++]!==':')bad();}value(depth+1);ws();if(text[at]===end){at++;return;}if(text[at++]!==',')bad();ws();}bad();}const from=at;while(at<text.length&&!/[ ,}\]\t\r\n]/.test(text[at]))at++;if(at===from)bad();}
 value(0);ws();if(at!==text.length)bad();return JSON.parse(text,(_,x)=>{if(typeof x==='number'&&!Number.isFinite(x))bad();return x;});
}
