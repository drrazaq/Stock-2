// Production review dependency: publish a text-free reservation before any real watcher message.
// No pull, force push, permission change or credential setup. Failure prevents sending.
import {execFileSync} from 'node:child_process';
export function publishWatcherReservation(file,{cwd=process.cwd(),git=execFileSync}={}){
 if(!/^data\/watcher-message-state\/\d{4}-\d\d-\d\d\/[a-f0-9]{64}\.json$/.test(file))throw Error('invalid watcher reservation path');
 const run=args=>git('git',args,{cwd,stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024});
 try{
  run(['add','--',file]);
  run(['-c','user.name=scanner','-c','user.email=scanner@users.noreply.github.com','commit','--only','-m','watcher message reservation','--',file]);
  run(['push']);
 }catch{throw Object.assign(Error('watcher reservation publication unconfirmed; message not sent'),{code:'WATCHER_MESSAGE_STATE'});}
}
