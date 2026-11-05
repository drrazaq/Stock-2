import net from 'node:net';import fs from 'node:fs';
const orig=net.Socket.prototype.connect;const log=process.env.NOEXT_LOG;
net.Socket.prototype.connect=function(...a){const o=typeof a[0]==='object'&&!Array.isArray(a[0])?a[0]:{port:a[0],host:a[1]};const h=o.host||'localhost';if(o.path||['127.0.0.1','localhost','::1'].includes(h))return orig.apply(this,a);if(log)fs.appendFileSync(log,h+':'+o.port+'\n');throw new Error('BLOCKED_EXTERNAL '+h);};
