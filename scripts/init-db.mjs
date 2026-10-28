import {Store} from '../lib/store.mjs';
const store=new Store();
console.log(`Database ready: ${store.path}`);
console.log('Applied migrations:',store.all('SELECT name FROM migrations').map(r=>r.name).join(', '));
console.log('Integrity:',store.get('PRAGMA integrity_check').integrity_check);
store.close();
