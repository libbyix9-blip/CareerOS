import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {Store} from '../lib/store.mjs';
import {hashPassword} from '../lib/auth.mjs';
const store=new Store();
if(store.hasOwner()){console.error('An owner already exists. Use the application to sign in.');store.close();process.exit(1);}
let hidden=false;
const output=new Writable({write(chunk,encoding,callback){if(!hidden)process.stdout.write(chunk,encoding);callback();}});
const rl=createInterface({input:process.stdin,output,terminal:true});
try{
  const email=(await rl.question('Owner email: ')).trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email.');
  process.stdout.write('Password (14+ characters; hidden): ');hidden=true;
  const password=await rl.question('');hidden=false;process.stdout.write('\n');
  store.createOwner(email,await hashPassword(password));console.log('Owner account created. Run npm start.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();store.close();}
