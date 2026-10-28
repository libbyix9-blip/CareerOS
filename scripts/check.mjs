import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const dirs=['.','lib','public','scripts','tests'];let count=0;
for(const dir of dirs)for(const file of readdirSync(dir).filter(f=>f.endsWith('.mjs'))){const r=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});if(r.status)process.exit(r.status);count++;}
console.log(`Syntax checked ${count} JavaScript modules.`);
