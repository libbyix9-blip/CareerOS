import {spawn,execFileSync} from 'node:child_process';
import {watch,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const project=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
export function shouldRestart(path){
  const file=String(path??'').replaceAll('\\','/');
  return file==='server.mjs'||file==='.env'||/^lib\/.*\.mjs$/.test(file)||/^scripts\/(desktop|next-server)\.mjs$/.test(file);
}
function openBrowser(url){const child=spawn(process.platform==='darwin'?'open':process.platform==='win32'?'explorer':'xdg-open',[url],{stdio:'ignore'});child.on('error',()=>console.log(`Open ${url} in your browser.`));child.unref();}
export function verifiedListener(pid,workingDirectory){return Number.isInteger(pid)&&pid>1&&workingDirectory===project;}
async function health(url){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1500)});return r.ok?await r.json():null;}catch{return null;}}
export async function launchDesktop(){
  process.chdir(project);
  const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3000);
  const url=process.env.APP_URL??`http://${host}:${port}`;
  const existing=await health(url);
  if(existing?.ok&&existing.app==='CareerOS'&&existing.managed){console.log(`CareerOS is already running: ${url}`);openBrowser(url);return;}
  // Replace only a CareerOS listener whose working directory is this checkout.
  if(existing?.ok&&existing.storage==='sqlite'){
    let pid,cwd;
    try{pid=Number(execFileSync('/usr/sbin/lsof',['-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'}).trim());cwd=execFileSync('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8'}).split('\n').find(x=>x.startsWith('n'))?.slice(1);}catch{}
    if(!verifiedListener(pid,cwd))throw new Error('A server is already using this port and could not be verified as this CareerOS instance. No process was stopped.');
    process.kill(pid,'SIGTERM');
    for(let attempt=0;attempt<100;attempt++){try{process.kill(pid,0);}catch{break;}if(attempt===99)throw new Error('The previous CareerOS instance is still finishing work. Try this shortcut again shortly.');await new Promise(r=>setTimeout(r,200));}
  }
  let child=null,restarting=false,stopping=false,opened=false,debounce;
  function start(){
    restarting=false;
    // The stable local UI/server needs no build or dependency download.
    child=spawn(process.execPath,['--env-file-if-exists=.env','server.mjs'],{cwd:project,stdio:'inherit',env:{...process.env,CAREEROS_DESKTOP:'true'}});
    child.on('error',error=>{console.error(error.message);process.exitCode=1;});
    child.on('exit',code=>{child=null;if(stopping)return;if(restarting){start();return;}console.error(`CareerOS stopped (${code??'signal'}). Double-click the shortcut to start it again.`);watcher.close();process.exitCode=code||1;});
    (async()=>{for(let i=0;i<50&&!stopping;i++){const state=await health(url);if(state?.app==='CareerOS'&&state.managed){console.log(`CareerOS is ready: ${url}\nUse your browser’s normal Reload button for updates. Keep this window open.`);if(!opened){opened=true;openBrowser(url);}return;}await new Promise(r=>setTimeout(r,200));}})();
  }
  const watcher=watch(project,{recursive:true},(_,name)=>{if(!shouldRestart(name)||stopping)return;clearTimeout(debounce);debounce=setTimeout(()=>{if(!child||restarting)return;console.log('CareerOS code updated. Restarting automatically…');restarting=true;child.kill('SIGTERM');},500);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;clearTimeout(debounce);watcher.close();if(child)child.kill(signal);});
  start();
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))launchDesktop().catch(error=>{console.error(error.message);process.exitCode=1;});
