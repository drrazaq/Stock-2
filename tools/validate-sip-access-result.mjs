import fs from 'node:fs';import {normalizeSipResult} from '../sip-access-result.mjs';
let value={code:'ERROR',exitCode:1};
try{const [file,raw]=process.argv.slice(2);if(process.argv.length!==4||!/^\d{1,3}$/.test(raw))throw Error();const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>128)throw Error();value=normalizeSipResult(fs.readFileSync(file,'utf8'),Number(raw));}catch{}
console.log(value.code);process.exitCode=value.exitCode;
