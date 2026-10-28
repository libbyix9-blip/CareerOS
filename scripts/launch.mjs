import {spawnSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const npm=process.platform==='win32'?'npm.cmd':'npm';
for(const args of [['install'],['audit','--audit-level=high'],['run','db:init'],['run','check'],['test'],['run','typecheck'],['run','build']]){
  console.log(`\nCareerOS setup: npm ${args.join(' ')}`);
  const result=spawnSync(npm,args,{stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
  if(result.status!==0){console.error('Setup stopped at this check. Review the error above; no forced dependency changes were made.');process.exit(result.status??1);}
}
const child=spawn(process.execPath,['--env-file-if-exists=.env','scripts/next-server.mjs'],{stdio:'inherit',env:{...process.env,OPEN_BROWSER:'true',NEXT_TELEMETRY_DISABLED:'1'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>process.exit(code??0));
