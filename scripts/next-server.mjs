import next from 'next';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {spawn} from 'node:child_process';
const dev=process.argv.includes('--dev');
const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3000),secure=process.env.SECURE_COOKIES==='true';
const store=new Store();
if(!['127.0.0.1','localhost','::1'].includes(host) && (!secure || !store.hasOwner() || !process.env.APP_URL?.startsWith('https://')))throw new Error('Remote binding requires an owner, HTTPS APP_URL and secure cookies.');
const framework=next({dev,hostname:host,port});
await framework.prepare();
const nextHandler=framework.getRequestHandler();
const app=createApp({store,host,port,appURL:process.env.APP_URL,secure,scheduleHours:Math.max(0,Number(process.env.REFRESH_HOURS??12)),pageHandler:nextHandler});
// Next's internal assets use the same host, with no exposure of the API on another port.
app.server.removeAllListeners('upgrade');
app.server.on('upgrade',framework.getUpgradeHandler());
app.server.on('error',error=>{console.error(`CareerOS could not start (${error.code??'SERVER_ERROR'}). Use another port if it is already in use, or run this command from your normal Terminal if this session restricts local listeners.`);store.close();process.exit(1);});
app.server.listen(port,host,()=>{
  console.log(`CareerOS ${dev?'development':'production'}: ${app.config.origin}`);
  if(process.env.OPEN_BROWSER==='true'){
    const opener=process.platform==='darwin'?'open':process.platform==='win32'?'explorer':'xdg-open';
    const child=spawn(opener,[app.config.origin],{stdio:'ignore'});child.on('error',()=>console.log('Open the local URL above in your browser.'));child.unref();
  }
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.stop();await framework.close();process.exit(0);});
