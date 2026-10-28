import {backup} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {Store} from '../lib/store.mjs';
mkdirSync('backups',{recursive:true,mode:0o700});
const store=new Store(),path=`backups/careeros-${new Date().toISOString().replaceAll(':','-')}.sqlite`;
try{await backup(store.db,path);chmodSync(path,0o600);console.log(`Backup created: ${path}`);}finally{store.close();}
