import {randomBytes, scryptSync} from 'node:crypto';
import {createInterface} from 'node:readline';
import {Writable} from 'node:stream';
let hidden = false;
const output = new Writable({write(chunk, encoding, callback){ if (!hidden) process.stdout.write(chunk, encoding); callback(); }});
const rl = createInterface({input:process.stdin, output, terminal:true});
rl.question('Choose an owner password (minimum 14 characters, hidden): ', password=>{
  hidden=false; rl.close();
  if(password.length<14){process.stderr.write('\nPassword must have at least 14 characters.\n');process.exit(1);}
  const salt=randomBytes(32).toString('hex');
  process.stdout.write('\nOWNER_PASSWORD_HASH="'+salt+':'+scryptSync(password,salt,64).toString('hex')+'"\n');
});
hidden=true;
