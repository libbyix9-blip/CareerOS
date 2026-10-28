import {createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {InputError} from './domain.mjs';
const scrypt=promisify(scryptCallback);
export const TOKEN_COOKIE='careeros_session';
export const tokenHash=s=>createHash('sha256').update(s).digest('hex');
export async function hashPassword(password){
  if(typeof password!=='string'||password.length<14||password.length>256)throw new InputError('Choose a password between 14 and 256 characters.');
  const salt=randomBytes(32).toString('hex');return salt+':'+Buffer.from(await scrypt(password,salt,64)).toString('hex');
}
export async function verifyPassword(password,encoded){
  const [salt,hash]=encoded.split(':');
  if(!salt || !hash || hash.length!==128 || typeof password!=='string'||password.length>256)return false;
  const derived=Buffer.from(await scrypt(password,salt,64));return timingSafeEqual(derived,Buffer.from(hash,'hex'));
}
export function cookieToken(req){const raw=req.headers.cookie??'';const value=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(TOKEN_COOKIE+'='))?.slice(TOKEN_COOKIE.length+1);return /^[a-f0-9]{64}$/.test(value??'')?value:null;}
export function currentUser(req,store){const token=cookieToken(req);return token?store.session(tokenHash(token)):null;}
export function requireUser(req,store){const user=currentUser(req,store);if(!user)throw new InputError('Please sign in to continue.',401);return user;}
export function sessionCookie(token,secure=false,clear=false){return `${TOKEN_COOKIE}=${clear?'':token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:7*86400}${secure?'; Secure':''}`;}
export function createSession(user,store){const token=randomBytes(32).toString('hex');store.newSession(tokenHash(token),user.id,Date.now()+7*86400000);return token;}
export async function signIn(email,password,store,key){
  if(!store.throttle(key))throw new InputError('Too many attempts. Wait 15 minutes before trying again.',429);
  const user=store.userByEmail(String(email??'').trim().toLowerCase());
  // A valid fixed hash forces equivalent work for an unknown account.
  const dummy='0'.repeat(64)+':'+'0'.repeat(128);
  const valid=await verifyPassword(password??'',user?.password_hash??dummy);
  if(!user || !valid)throw new InputError('Email or password is incorrect.',401);
  store.clearThrottle(key);return createSession(store.user(user.id),store);
}
