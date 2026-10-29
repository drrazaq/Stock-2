// Persist intent before I/O: a timeout/crash must not create a claimed restart
// or an immediate duplicate request. GitHub's 204 accepts a REQUEST only.
export async function dispatchGuard(out,{fetcher=fetch,url,headers,ref='main',persist}) {
 if(!out.dispatch) return out;
 await persist(out.state);
 let status=null;
 try {status=(await fetcher(url,{method:'POST',headers,body:JSON.stringify({ref}),signal:AbortSignal.timeout(10000)})).status;}catch{}
 const attempt=out.state.attempts.at(-1);
 if(status===204) {
  attempt.status='ACCEPTED';out.state.dispatched.push(attempt.min);
  out.alerts.push('WATCHER START REQUEST ACCEPTED by GitHub; watcher execution and heartbeat are not yet confirmed.');
 }else{
  attempt.status=status===null?'UNCONFIRMED':'REJECTED';
  if(Number.isInteger(status))attempt.httpStatus=status;
  out.alerts.push('WATCHER START REQUEST '+attempt.status+(status===null?' (network error or timeout)':' (HTTP '+status+')')+'; no restart is confirmed.');
 }
 await persist(out.state);
 return out;
}
