import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {Store} from './lib/store.mjs';
import {Discovery} from './lib/discovery.mjs';
import {matchJob,blendFeeds} from './lib/matching.mjs';
import {InputError,validateApplication,validatePreferences,toCSV,string} from './lib/domain.mjs';
import {currentUser,requireUser,createSession,signIn,hashPassword,sessionCookie,cookieToken,tokenHash} from './lib/auth.mjs';
import {extractUpload,validateDocumentInput,suggestedSkills,recommendLetters,BUCKETS} from './lib/documents.mjs';

const root=fileURLToPath(new URL('./public/',import.meta.url));
const assets=new Map([['/boot.mjs',['boot.mjs','text/javascript; charset=utf-8']],['/app.mjs',['app.mjs','text/javascript; charset=utf-8']],['/library.mjs',['library.mjs','text/javascript; charset=utf-8']],['/styles.css',['styles.css','text/css; charset=utf-8']],['/design.css',['design.css','text/css; charset=utf-8']],['/favicon.svg',['favicon.svg','image/svg+xml']]]);
const pages=new Set(['/','/overview','/discover','/wildcards','/saved','/applications','/insights','/profile','/letters','/settings','/login']);
async function body(req,maxSize=150000){
  if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new InputError('Use a JSON request body.',415);
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxSize)throw new InputError('Request is too large.',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InputError('Request body is not valid JSON.');}
}
function respond(res,data,status=200,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data));}
function equalSecret(a,b){return !!a && !!b && Buffer.byteLength(a)===Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function createApp({store=new Store(),host='127.0.0.1',port=3000,appURL=null,secure=false,sources,fetcher,scheduleHours=0,pageHandler=null}={}){
  const discovery=new Discovery(store,{sources,fetcher});
  const config={origin:appURL?new URL(appURL).origin:`http://${host}:${port}`};
  let timer=null;
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    const nonce=randomBytes(16).toString('base64');
    const csp=`default-src 'self'; script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV==='development'?" 'unsafe-eval'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
    res.setHeader('Content-Security-Policy',csp);
    req.headers['content-security-policy']=csp;
    try{
      if(req.headers.host!==new URL(config.origin).host)throw new InputError('Unrecognized host.',403);
      const url=new URL(req.url,config.origin),path=url.pathname,method=req.method;
      if(path==='/api/health' && method==='GET')return respond(res,{ok:true,app:'CareerOS',storage:'sqlite',version:'0.3.0',managed:process.env.CAREEROS_DESKTOP==='true'});
      if(path==='/api/cron' && method==='POST'){
        if(!equalSecret(req.headers.authorization,process.env.CRON_SECRET?`Bearer ${process.env.CRON_SECRET}`:null))throw new InputError('Invalid cron credential.',401);
        return respond(res,{started:discovery.start()},202);
      }
      if(['POST','PATCH','PUT','DELETE'].includes(method)){
        if(req.headers.origin!==config.origin || req.headers['sec-fetch-site']==='cross-site')throw new InputError('Request origin is not permitted.',403);
      }
      if(path==='/api/session' && method==='GET'){
        const user=currentUser(req,store);return respond(res,{authenticated:!!user,ownerExists:store.hasOwner(),user:user?{email:user.email}:null,setupAllowed:['127.0.0.1','localhost','::1'].includes(host)});
      }
      if(path==='/api/setup' && method==='POST'){
        if(!['127.0.0.1','localhost','::1'].includes(host) || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))throw new InputError('Initial setup is available only on localhost. Use npm run setup on the server.',403);
        if(store.hasOwner())throw new InputError('An owner already exists.',409);
        if(!store.throttle('setup',5))throw new InputError('Too many setup attempts. Try again in 15 minutes.',429);
        const data=await body(req);const email=string(data.email,'email',250,true).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InputError('Enter a valid email address.');
        const hash=await hashPassword(data.password);const user=store.createOwner(email,hash);const token=createSession(user,store);
        if(!store.sourceRuns().length)discovery.start();
        return respond(res,{ok:true},201,{'Set-Cookie':sessionCookie(token,secure)});
      }
      if(path==='/api/login' && method==='POST'){
        const data=await body(req);const token=await signIn(data.email,data.password,store,tokenHash(req.socket.remoteAddress??'local'));
        return respond(res,{ok:true},200,{'Set-Cookie':sessionCookie(token,secure)});
      }
      if(path==='/api/logout' && method==='POST'){
        const token=cookieToken(req);if(token)store.deleteSession(tokenHash(token));return respond(res,{ok:true},200,{'Set-Cookie':sessionCookie('',secure,true)});
      }
      if(path.startsWith('/api/')){
        const user=requireUser(req,store);
        if(path==='/api/bootstrap' && method==='GET'){
          const jobs=store.jobs(user.id),feedback=jobs.filter(j=>j.feedback),matchingProfile=store.matchingProfile(user.id);
          const ranked=jobs.map(j=>({...j,match:matchJob(j,matchingProfile,feedback)})).filter(j=>j.match.relevant||j.saved||j.feedback).sort((a,b)=>b.match.score-a.match.score);
          const applications=store.applications(user.id);
          // Descriptions are fetched individually; dashboard payload stays bounded.
          return respond(res,{profile:user,jobs:blendFeeds(ranked).map(({description,...j})=>j),applications,
            documents:store.documents(user.id).map(({text,originalText,...d})=>({...d,excerpt:text.slice(0,220)})),buckets:Object.keys(BUCKETS),matchingResume:matchingProfile.resumeEvidence?{id:matchingProfile.resumeEvidence.id,title:matchingProfile.resumeEvidence.title}:null,
            activity:store.activities(user.id),discovery:discovery.status(),schedule:{hours:scheduleHours,requiresRunningProcess:true},
            integrations:{gmail:{configured:false,implemented:false},resume:{configured:true,implemented:true},ai:{configured:false,engine:'Transparent résumé and preference rules'}},totalIngested:jobs.length});
        }
        if(path==='/api/documents/upload'&&method==='POST'){
          if(!store.throttle('uploads:'+user.id,60))throw new InputError('Too many uploads. Please try again in 15 minutes.',429);
          const input=await body(req,7_000_000),document=await extractUpload(input);
          return respond(res,store.addDocument(user.id,document),201);
        }
        if(path==='/api/documents'&&method==='POST'){
          const input=validateDocumentInput(await body(req));
          return respond(res,store.addDocument(user.id,{...input,suggestedSkills:input.kind==='resume'?suggestedSkills(input.text):[]}),201);
        }
        const documentPath=path.match(/^\/api\/documents\/([a-f0-9-]+)(?:\/(primary|download|draft))?$/);
        if(documentPath){
          const doc=store.document(user.id,documentPath[1]);if(!doc)throw new InputError('Document not found.',404);
          if(!documentPath[2]&&method==='GET')return respond(res,doc);
          if(!documentPath[2]&&method==='PUT'){const input=validateDocumentInput(await body(req));store.updateDocument(user.id,doc.id,input);return respond(res,{ok:true});}
          if(!documentPath[2]&&method==='DELETE'){store.deleteDocument(user.id,doc.id);return respond(res,{ok:true});}
          if(documentPath[2]==='primary'&&method==='POST'){const input=await body(req);store.primaryResume(user.id,doc.id,input.enabled!==false);return respond(res,{ok:true});}
          if(documentPath[2]==='download'&&method==='GET'){
            if(url.searchParams.get('original')==='true'){
              const file=store.documentFile(user.id,doc.id);if(!file.bytes)throw new InputError('No original file is stored. Download the text instead.',404);
              res.writeHead(200,{'Content-Type':file.mimeType,'Cache-Control':'no-store','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`});return res.end(Buffer.from(file.bytes));
            }
            res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.title+'.txt')}`});return res.end(doc.text);
          }
          if(documentPath[2]==='draft'&&method==='POST'){
            if(doc.kind!=='cover-letter')throw new InputError('Only cover letters can be used as letter templates.');
            const input=await body(req),job=input.jobId?store.jobs(user.id).find(j=>j.id===input.jobId):null;
            if(input.jobId&&!job)throw new InputError('Job not found.',404);
            const title=job?`${job.company} · ${job.title}`:`${doc.title} · working copy`;
            return respond(res,store.addDocument(user.id,{kind:doc.kind,title:title.slice(0,200),text:doc.text,bucket:doc.bucket,bucketReviewed:true,parentId:doc.id,jobId:job?.id??null,company:job?.company??doc.company,role:job?.title??doc.role,sourceLabel:'Working copy — original preserved'}),201);
          }
        }
        if(path==='/api/refresh' && method==='POST'){
          const last=store.sourceRuns()[0];if(!discovery.running && last && Date.now()-Date.parse(last.startedAt)<60000)throw new InputError('A refresh just ran. Please wait a minute before retrying.',429);
          return respond(res,{started:discovery.start()},202);
        }
        if(path==='/api/preferences' && method==='PUT'){const preferences=validatePreferences(await body(req));store.preferences(user.id,preferences);return respond(res,{ok:true});}
        const jobPath=path.match(/^\/api\/jobs\/([a-f0-9-]+)(?:\/(state|applied))?$/);
        if(jobPath){
          const job=store.jobs(user.id).find(j=>j.id===jobPath[1]);if(!job)throw new InputError('Job not found.',404);
          if(!jobPath[2] && method==='GET')return respond(res,{...job,match:matchJob(job,store.matchingProfile(user.id),store.jobs(user.id).filter(j=>j.feedback)),letterSuggestions:recommendLetters(job,store.documents(user.id))});
          if(jobPath[2]==='state' && method==='PATCH'){store.jobState(user.id,job.id,await body(req));return respond(res,{ok:true});}
          if(jobPath[2]==='applied' && method==='POST'){
            const input=validateApplication({company:job.company,title:job.title,location:job.location,appliedAt:new Date().toISOString().slice(0,10),source:job.sources[0]?.source.split(':')[0]??'CareerOS',status:'Applied',url:job.url});
            const id=store.saveApplication(user.id,input,null,job.id);return respond(res,{id},201);
          }
        }
        if(path==='/api/applications' && method==='POST'){const id=store.saveApplication(user.id,validateApplication(await body(req)));return respond(res,{id},201);}
        const appPath=path.match(/^\/api\/applications\/([a-f0-9-]+)$/);
        if(appPath && method==='PUT'){store.saveApplication(user.id,validateApplication(await body(req)),appPath[1]);return respond(res,{ok:true});}
        if(appPath && method==='DELETE'){store.deleteApplication(user.id,appPath[1]);return respond(res,{ok:true});}
        if(path==='/api/export' && method==='GET'){
          if(url.searchParams.get('format')==='csv'){
            res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Cache-Control':'no-store','Content-Disposition':'attachment; filename="careeros-applications.csv"'});
            return res.end(toCSV(store.applications(user.id),['company','title','location','appliedAt','source','status','updatedAt','lastResponseAt','contact','summary','notes','url','confidence','evidence']));
          }
          return respond(res,store.exportUser(user.id),200,{'Content-Disposition':'attachment; filename="careeros-export.json"'});
        }
        if(path==='/api/account' && method==='DELETE'){
          const data=await body(req);if(data.confirm!==user.email)throw new InputError('Type your account email to confirm deletion.');
          store.deleteUser(user.id);return respond(res,{ok:true},200,{'Set-Cookie':sessionCookie('',secure,true)});
        }
        throw new InputError('This API route is not available.',404);
      }
      if(method==='GET' && (assets.has(path)||pages.has(path))){
        // The UI owns its DOM. Serve its independent shell so stale framework
        // hydration chunks cannot prevent startup after a local update.
        const [file,type]=assets.get(path)??['index.html','text/html; charset=utf-8'];
        res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});return res.end(readFileSync(root+file));
      }
      if(pageHandler && path.startsWith('/_next/'))return pageHandler(req,res);
      throw new InputError('Page not found.',404);
    }catch(e){
      if(e instanceof InputError)return respond(res,{error:e.message},e.status);
      const reference=randomUUID();console.error('Request failed',{reference,code:e.code??'INTERNAL'});respond(res,{error:`Something went wrong. Retry or check server logs. Reference: ${reference}`},500);
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  server.on('listening',()=>{
    if(port===0 && !appURL)config.origin=`http://${host}:${server.address().port}`;
    if(scheduleHours>0){
      const check=()=>{const stamp=discovery.status().lastSuccessfulAt;if(store.hasOwner() && (!stamp || Date.now()-Date.parse(stamp)>scheduleHours*3600000))discovery.start();};
      // Schedules run while this server is running; errors remain in source history.
      timer=setInterval(check,scheduleHours*3600000);timer.unref();
      check();
    }
  });
  return {server,store,discovery,config,async stop(){if(timer)clearInterval(timer);await discovery.promise;await new Promise(r=>server.close(r));store.close();}};
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  const host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??3000),secure=process.env.SECURE_COOKIES==='true';
  const store=new Store();
  if(!['127.0.0.1','localhost','::1'].includes(host) && (!secure || !store.hasOwner() || !process.env.APP_URL?.startsWith('https://')))throw new Error('Remote binding requires an existing owner, HTTPS APP_URL, and secure cookies. Run setup first.');
  const app=createApp({store,host,port,appURL:process.env.APP_URL,secure,scheduleHours:Math.max(0,Number(process.env.REFRESH_HOURS??12))});
  app.server.listen(port,host,()=>console.log(`CareerOS running at ${app.config.origin}\nPrivate local storage: ${store.path}\n${store.hasOwner()?'Sign in to continue.':'Open the app to create your private owner account.'}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.stop().then(()=>process.exit(0)));
}
