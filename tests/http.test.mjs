import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {Store} from '../lib/store.mjs';
import {createApp} from '../server.mjs';
import {hashPassword,verifyPassword} from '../lib/auth.mjs';
test('passwords use salted scrypt and reject incorrect credentials',async()=>{const a=await hashPassword('a-long-test-password'),b=await hashPassword('a-long-test-password');assert.notEqual(a,b);assert.equal(await verifyPassword('a-long-test-password',a),true);assert.equal(await verifyPassword('wrong',a),false);});
test('HTTP handler: setup, authentication, CRUD, origin checks, export, logout and session invalidation',async()=>{
 const store=new Store(':memory:'),app=createApp({store,port:3000,sources:[],scheduleHours:0});const base=app.config.origin;let cookie='';
 const request=async(path,method='GET',body,origin=base)=>{
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.method=method;req.url=path;req.headers={host:new URL(base).host,origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})};req.socket={remoteAddress:'127.0.0.1'};
  const headers=new Headers();let status=200,resolve;const response=new Promise(r=>resolve=r);
  const res={setHeader(k,v){headers.set(k,v);},writeHead(code,h={}){status=code;for(const [k,v] of Object.entries(h))headers.set(k,v);},end(text){resolve(new Response(text,{status,headers}));}};
  await app.server.listeners('request')[0](req,res);return response;
 };
 try{
  assert.equal((await request('/api/bootstrap')).status,401);assert.equal((await request('/api/sync','POST',{})).status,401);
  assert.equal((await request('/api/setup','POST',{email:'owner@example.test',password:'a-long-test-password'},'https://attacker.test')).status,403);
  const setup=await request('/api/setup','POST',{email:'owner@example.test',password:'a-long-test-password'});assert.equal(setup.status,201);assert.match(setup.headers.get('set-cookie'),/HttpOnly/);cookie=setup.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/bootstrap')).status,200);const sync=await request('/api/sync','POST',{reason:'open'});assert.equal(sync.status,202);const syncResult=await sync.json();assert.equal(syncResult.gmail.connected,false);assert.equal(syncResult.gmail.implemented,true);
  const uploaded=await request('/api/documents/upload','POST',{kind:'resume',filename:'candidate.txt',base64:Buffer.from('Test Candidate\nSQL and OSINT research, due diligence and investigations.').toString('base64')});assert.equal(uploaded.status,201);const resumeId=(await uploaded.json()).id;
  assert.equal((await request('/api/documents/'+resumeId+'/primary','POST',{})).status,400);
  const resumeDoc=await (await request('/api/documents/'+resumeId)).json();
  assert.equal((await request('/api/documents/'+resumeId,'PUT',{...resumeDoc,reviewStatus:'reviewed',reviewedSkills:['SQL','OSINT']})).status,200);
  assert.equal((await request('/api/documents/'+resumeId+'/primary','POST',{})).status,200);
  const withResume=await (await request('/api/bootstrap')).json();assert.equal(withResume.matchingResume.id,resumeId);assert.equal(withResume.documents[0].text,undefined);assert.equal(withResume.documents[0].originalText,undefined);
  const original=await request('/api/documents/'+resumeId+'/download?original=true');assert.equal(original.status,200);assert.match(original.headers.get('content-disposition'),/attachment/);assert.match(await original.text(),/SQL and OSINT/);
  const cover=await request('/api/documents','POST',{kind:'cover-letter',title:'Corporate letter',text:'Dear company, I bring due diligence and investigative research experience.'});const coverId=(await cover.json()).id;
  const draft=await request('/api/documents/'+coverId+'/draft','POST',{});assert.equal(draft.status,201);const draftId=(await draft.json()).id;
  const draftData=await (await request('/api/documents/'+draftId)).json();assert.equal(draftData.parentId,coverId);
  assert.equal((await request('/api/documents/'+coverId,'DELETE',{},'https://attacker.test')).status,403);
  assert.equal((await request('/api/documents/'+resumeId+'/primary','POST',{enabled:false})).status,200);
  assert.equal((await (await request('/api/bootstrap')).json()).matchingResume,null);
  assert.equal((await request('/api/documents/'+resumeId,'DELETE',{})).status,200);

  const create=await request('/api/applications','POST',{company:'Company',title:'Analyst',status:'Applied',appliedAt:'2026-01-01',notes:'Private note'});assert.equal(create.status,201);const {id}=await create.json();
  const initial=await (await request('/api/bootstrap')).json();assert.equal(initial.applications.length,1);assert.equal(initial.applications[0].notes,'Private note');
  assert.equal((await request('/api/applications/'+id,'PUT',{...initial.applications[0],notes:'Edited note'})).status,200);
  const csv=await request('/api/export?format=csv');assert.match(await csv.text(),/Edited note/);assert.match(csv.headers.get('content-type'),/text\/csv/);
  assert.equal((await request('/api/preferences','PUT',{bad:true})).status,400);
  assert.equal((await request('/api/applications/'+id,'DELETE',{},'https://attacker.test')).status,403);
  assert.equal((await request('/api/applications/'+id,'DELETE',{})).status,200);
  assert.equal((await request('/api/logout','POST',{})).status,200);
  assert.equal((await request('/api/bootstrap')).status,401);
  const wrong=await request('/api/login','POST',{email:'owner@example.test',password:'wrong'});assert.equal(wrong.status,401);
  const login=await request('/api/login','POST',{email:'owner@example.test',password:'a-long-test-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/account','DELETE',{confirm:'wrong'})).status,400);
  assert.equal((await request('/api/account','DELETE',{confirm:'owner@example.test'})).status,200);
  assert.equal((await request('/api/bootstrap')).status,401);
 }finally{await app.stop();}
});

test('stable UI shell and every boot module are served without framework hydration',async()=>{
 const store=new Store(':memory:');let frameworkCalls=0;const app=createApp({store,sources:[],pageHandler:()=>{frameworkCalls++;throw Error('Framework hydration should not be required.');}});
 async function get(path){const req=Readable.from([]);req.method='GET';req.url=path;req.headers={host:'127.0.0.1:3000'};req.socket={remoteAddress:'127.0.0.1'};let status=200,content='';const headers=new Headers();const res={setHeader(k,v){headers.set(k,v);},writeHead(code,h){status=code;for(const [k,v]of Object.entries(h??{}))headers.set(k,v);},end(s){content=String(s??'');}};await app.server.listeners('request')[0](req,res);return {status,content,headers};}
 try{for(const path of ['/','/profile','/letters','/discover']){const r=await get(path);assert.equal(r.status,200);assert.match(r.content,/src="\/boot.mjs"/);assert.doesNotMatch(r.content,/_next\/static/);assert.equal(r.headers.get('cache-control'),'no-cache');}for(const path of ['/boot.mjs','/app.mjs','/library.mjs']){const r=await get(path);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/javascript/);}assert.equal(frameworkCalls,0);}finally{await app.stop();}
});
