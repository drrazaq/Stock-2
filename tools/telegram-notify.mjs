// Failure-notification adapter. Credentials are environment-only, never argv.
import fs from 'node:fs';
import {telegramFetch} from '../telegram-delivery.mjs';
const env=process.env,local=u=>u&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)?u:null;
if(!env.TG_TOKEN||!env.TG_CHAT){console.error('Telegram notification not sent: missing credentials');process.exitCode=1;}
else{
 const text=fs.readFileSync(0,'utf8'),base=local(env.TG_BASE)||'https://api.telegram.org';
 const r=await telegramFetch(base+'/bot'+env.TG_TOKEN+'/sendMessage',{body:JSON.stringify({chat_id:env.TG_CHAT,text})});
 if(!r.ok)process.exitCode=1;
 else console.log('Telegram notification acknowledged');
}
