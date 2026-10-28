import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync,chmodSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {DEFAULT_PREFERENCES,effectiveStatus,InputError} from './domain.mjs';
const now=()=>new Date().toISOString();
const bool=v=>Boolean(v);
const DOC_FIELDS='id,user_id,kind,title,filename,mime_type,size,original_text,text,suggested_skills,reviewed_skills,review_status,is_primary,bucket,bucket_reviewed,company,role,source_url,source_label,parent_id,job_id,created_at,updated_at,original_file IS NOT NULL AS has_file';
export class Store {
  constructor(path=process.env.DATABASE_PATH??'./data/careeros.sqlite'){
    this.path=path;
    if(path!==':memory:'){mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});}
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;');
    this.db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const dir=fileURLToPath(new URL('../migrations/',import.meta.url));
    for(const name of readdirSync(dir).filter(n=>n.endsWith('.sql')).sort()){
      if(!this.get('SELECT name FROM migrations WHERE name=?',name))this.tx(()=>{this.db.exec(readFileSync(resolve(dir,name),'utf8'));this.run('INSERT INTO migrations VALUES (?,?)',name,now());});
    }
    if(path!==':memory:')chmodSync(path,0o600);
  }
  run(sql,...args){return this.db.prepare(sql).run(...args);}
  get(sql,...args){return this.db.prepare(sql).get(...args);}
  all(sql,...args){return this.db.prepare(sql).all(...args);}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  close(){this.db.close();}
  hasOwner(){return !!this.get('SELECT id FROM users LIMIT 1');}
  createOwner(email,passwordHash){
    return this.tx(()=>{
      if(this.hasOwner())throw new InputError('An owner already exists.',409);
      const id=randomUUID();this.run('INSERT INTO users VALUES (?,?,?,?,?)',id,email,passwordHash,JSON.stringify(DEFAULT_PREFERENCES),now());
      return this.user(id);
    });
  }
  user(id){const r=this.get('SELECT id,email,preferences,created_at FROM users WHERE id=?',id);return r?{id:r.id,email:r.email,preferences:JSON.parse(r.preferences),createdAt:r.created_at}:null;}
  userByEmail(email){return this.get('SELECT id,password_hash FROM users WHERE email=?',email);}
  session(hash){const s=this.get('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?',hash,Date.now());return s?this.user(s.user_id):null;}
  newSession(hash,id,expires){this.run('DELETE FROM sessions WHERE expires_at<?',Date.now());this.run('INSERT INTO sessions VALUES (?,?,?)',hash,id,expires);}
  deleteSession(hash){this.run('DELETE FROM sessions WHERE token_hash=?',hash);}
  throttle(key,limit=10){
    return this.tx(()=>{
      const t=Date.now();this.run('DELETE FROM login_attempts WHERE reset_at<?',t);
      this.run('INSERT INTO login_attempts VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1',key,t+15*60000);
      return this.get('SELECT attempts FROM login_attempts WHERE key=?',key).attempts<=limit;
    });
  }
  clearThrottle(key){this.run('DELETE FROM login_attempts WHERE key=?',key);}
  preferences(id,p){this.run('UPDATE users SET preferences=? WHERE id=?',JSON.stringify(p),id);this.activity(id,'preferences','Career preferences updated; matching recalculated.');}
  activity(user,kind,summary){this.run('INSERT INTO activity VALUES (?,?,?,?,?)',randomUUID(),user,kind,summary,now());}
  activities(user){return this.all('SELECT id,kind,summary,created_at AS createdAt FROM activity WHERE user_id=? ORDER BY created_at DESC LIMIT 30',user);}
  acquireLock(key,ttl=10*60000){
    return this.tx(()=>{this.run('DELETE FROM locks WHERE expires_at<?',Date.now());return this.run('INSERT OR IGNORE INTO locks VALUES (?,?)',key,Date.now()+ttl).changes===1;});
  }
  releaseLock(key){this.run('DELETE FROM locks WHERE key=?',key);}
  startRun(source){const id=randomUUID();this.run('INSERT INTO source_runs (id,source_key,started_at) VALUES (?,?,?)',id,source,now());return id;}
  failRun(id,error){this.run('UPDATE source_runs SET finished_at=?,error=? WHERE id=?',now(),error,id);}
  ingest(source,jobs,runId){
    this.tx(()=>{
      const stamp=now();
      this.run('UPDATE job_postings SET available=0,verified_at=? WHERE source_key=?',stamp,source);
      for(const j of jobs){
        const known=this.get('SELECT job_id FROM job_postings WHERE source_key=? AND source_job_id=?',source,j.sourceJobId);
        const canonical=this.get('SELECT id FROM jobs WHERE fingerprint=?',j.fingerprint);
        const id=known?.job_id??canonical?.id??randomUUID();
        if(!known && !canonical){
          this.run('INSERT INTO jobs (id,fingerprint,company,title,location,arrangement,salary_min,salary_max,currency,salary_text,description,qualifications,url,posted_at,discovered_at,verified_at,availability) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,j.fingerprint,j.company,j.title,j.location,j.arrangement,j.salaryMin,j.salaryMax,j.currency,j.salaryText,j.description,j.qualifications,j.url,j.postedAt,stamp,stamp,'Open');
        } else {
          this.run('UPDATE jobs SET company=?,title=?,location=?,arrangement=?,salary_min=?,salary_max=?,currency=?,salary_text=?,description=?,qualifications=?,posted_at=COALESCE(?,posted_at),verified_at=?,availability=? WHERE id=?',j.company,j.title,j.location,j.arrangement,j.salaryMin,j.salaryMax,j.currency,j.salaryText,j.description,j.qualifications,j.postedAt,stamp,'Open',id);
        }
        this.run('INSERT INTO job_postings VALUES (?,?,?,?,1,?) ON CONFLICT(source_key,source_job_id) DO UPDATE SET job_id=excluded.job_id,url=excluded.url,available=1,verified_at=excluded.verified_at',source,j.sourceJobId,id,j.url,stamp);
      }
      // Canonical availability considers every source. A failed source never enters this transaction.
      this.run("UPDATE jobs SET availability=CASE WHEN EXISTS(SELECT 1 FROM job_postings p WHERE p.job_id=jobs.id AND p.available=1) THEN 'Open' ELSE 'Closed' END,verified_at=CASE WHEN EXISTS(SELECT 1 FROM job_postings p WHERE p.job_id=jobs.id AND p.available=1) THEN verified_at ELSE ? END WHERE id IN (SELECT job_id FROM job_postings WHERE source_key=?)",stamp,source);
      this.run('UPDATE source_runs SET finished_at=?,success=1,count=? WHERE id=?',stamp,jobs.length,runId);
      this.run('DELETE FROM source_runs WHERE started_at<?',new Date(Date.now()-90*86400000).toISOString());
    });
  }
  jobs(user){
    const rows=this.all(`SELECT j.*,s.saved,s.dismissed,s.feedback FROM jobs j LEFT JOIN job_states s ON s.job_id=j.id AND s.user_id=? ORDER BY j.discovered_at DESC`,user);
    const postings=this.all('SELECT source_key AS source,job_id AS jobId,url,available,verified_at AS verifiedAt FROM job_postings');
    const map=new Map();for(const p of postings){if(!map.has(p.jobId))map.set(p.jobId,[]);map.get(p.jobId).push({...p,available:bool(p.available)});}
    return rows.map(r=>({id:r.id,company:r.company,title:r.title,location:r.location,arrangement:r.arrangement,
      salaryMin:r.salary_min,salaryMax:r.salary_max,currency:r.currency,salaryText:r.salary_text,description:r.description,qualifications:r.qualifications,
      url:map.get(r.id)?.find(p=>p.available)?.url??r.url,postedAt:r.posted_at,discoveredAt:r.discovered_at,verifiedAt:r.verified_at,
      availability:r.availability,saved:bool(r.saved),dismissed:bool(r.dismissed),feedback:r.feedback,sources:map.get(r.id)??[]}));
  }
  jobState(user,job,patch){
    if(!this.get('SELECT id FROM jobs WHERE id=?',job))throw new InputError('Job not found.',404);
    const state=this.get('SELECT * FROM job_states WHERE user_id=? AND job_id=?',user,job)??{saved:0,dismissed:0,feedback:null};
    const saved=typeof patch.saved==='boolean'?Number(patch.saved):state.saved;
    const dismissed=typeof patch.dismissed==='boolean'?Number(patch.dismissed):state.dismissed;
    const feedback=patch.feedback===null?null:['More like this','Not interested'].includes(patch.feedback)?patch.feedback:state.feedback;
    this.run('INSERT INTO job_states VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET saved=excluded.saved,dismissed=excluded.dismissed,feedback=excluded.feedback,updated_at=excluded.updated_at',user,job,saved,dismissed,feedback,now());
  }
  applications(user){return this.all('SELECT * FROM applications WHERE user_id=? ORDER BY applied_at DESC,updated_at DESC',user).map(r=>this.applicationRow(r));}
  applicationRow(r){
    const a={id:r.id,company:r.company,title:r.title,location:r.location,appliedAt:r.applied_at,source:r.source,status:r.status,
      updatedAt:r.updated_at,lastResponseAt:r.last_response_at,contact:r.contact,summary:r.summary,notes:r.notes,url:r.url,jobId:r.job_id,
      manualOverride:bool(r.manual_override),needsReview:bool(r.needs_review),confidence:r.confidence,evidence:JSON.parse(r.evidence)};
    a.status=effectiveStatus(a);return a;
  }
  saveApplication(user,input,id=null,jobId=null){
    return this.tx(()=>{
      const existing=id?this.get('SELECT * FROM applications WHERE id=? AND user_id=?',id,user):null;
      if(id && !existing)throw new InputError('Application not found.',404);
      if(jobId){
        if(!this.get('SELECT id FROM jobs WHERE id=?',jobId))throw new InputError('Job not found.',404);
        const duplicate=this.get('SELECT id FROM applications WHERE user_id=? AND job_id=?',user,jobId);
        if(duplicate)return duplicate.id;
      }
      const key=id??randomUUID();
      // Editing notes alone never creates a recruiting response.
      const response=input.lastResponseAt??(!['Applied','No Response','Withdrawn'].includes(input.status)?existing?.last_response_at??now().slice(0,10):null);
      if(existing){
        this.run('UPDATE applications SET company=?,title=?,location=?,applied_at=?,source=?,status=?,updated_at=?,last_response_at=?,contact=?,summary=?,notes=?,url=?,manual_override=1 WHERE id=? AND user_id=?',input.company,input.title,input.location,input.appliedAt,input.source,input.status,now(),response,input.contact,input.summary,input.notes,input.url,key,user);
      }else{
        this.run('INSERT INTO applications (id,user_id,company,title,location,applied_at,source,status,updated_at,last_response_at,contact,summary,notes,url,job_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',key,user,input.company,input.title,input.location,input.appliedAt,input.source,input.status,now(),response,input.contact,input.summary,input.notes,input.url,jobId);
      }
      this.activity(user,'application',`${existing?'Updated':'Added'} ${input.company} · ${input.title} · ${input.status}`);
      return key;
    });
  }
  deleteApplication(user,id){const result=this.run('DELETE FROM applications WHERE user_id=? AND id=?',user,id);if(!result.changes)throw new InputError('Application not found.',404);this.activity(user,'application','An application was removed.');}
  sourceRuns(){return this.all('SELECT id,source_key AS source,started_at AS startedAt,finished_at AS finishedAt,success,count,error FROM source_runs ORDER BY started_at DESC LIMIT 150').map(r=>({...r,success:bool(r.success)}));}
  documentRow(r){if(!r)return null;return {id:r.id,kind:r.kind,title:r.title,filename:r.filename,mimeType:r.mime_type,size:r.size,text:r.text,originalText:r.original_text,suggestedSkills:JSON.parse(r.suggested_skills),reviewedSkills:JSON.parse(r.reviewed_skills),reviewStatus:r.review_status,isPrimary:bool(r.is_primary),bucket:r.bucket,bucketReviewed:bool(r.bucket_reviewed),company:r.company,role:r.role,sourceUrl:r.source_url,sourceLabel:r.source_label,parentId:r.parent_id,jobId:r.job_id,createdAt:r.created_at,updatedAt:r.updated_at,hasFile:!!r.has_file};}
  documents(user){return this.all('SELECT '+DOC_FIELDS+' FROM career_documents WHERE user_id=? ORDER BY is_primary DESC,updated_at DESC',user).map(r=>this.documentRow(r));}
  document(user,id){return this.documentRow(this.get('SELECT '+DOC_FIELDS+' FROM career_documents WHERE id=? AND user_id=?',id,user));}
  documentFile(user,id){return this.get('SELECT original_file AS bytes,mime_type AS mimeType,filename FROM career_documents WHERE id=? AND user_id=?',id,user);}
  addDocument(user,input){
    return this.tx(()=>{
      if(this.get('SELECT count(*) AS n FROM career_documents WHERE user_id=?',user).n>=250)throw new InputError('Your library has reached 250 documents. Remove an unused version before adding another.');
      const hash=input.contentHash??createHash('sha256').update(input.text.replace(/\s+/g,' ').trim()).digest('hex');
      if(!input.parentId){const duplicate=this.get('SELECT id FROM career_documents WHERE user_id=? AND kind=? AND content_hash=? AND parent_id IS NULL',user,input.kind,hash);if(duplicate)return {id:duplicate.id,duplicate:true};}
      if(input.parentId&&!this.document(user,input.parentId))throw new InputError('Source letter not found.',404);
      if(input.jobId&&!this.get('SELECT id FROM jobs WHERE id=?',input.jobId))throw new InputError('Job not found.',404);
      const id=randomUUID(),stamp=now();
      this.run(`INSERT INTO career_documents (id,user_id,kind,title,filename,mime_type,size,content_hash,original_file,original_text,text,suggested_skills,reviewed_skills,review_status,bucket,bucket_reviewed,company,role,source_url,source_label,parent_id,job_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,user,input.kind,input.title,input.filename??'',input.mimeType??'text/plain',input.size??0,hash,input.bytes??null,input.originalText??input.text,input.text,JSON.stringify(input.suggestedSkills??[]),JSON.stringify(input.reviewedSkills??[]),input.reviewStatus??'pending',input.bucket,Number(input.bucketReviewed??false),input.company??'',input.role??'',input.sourceUrl??'',input.sourceLabel??'',input.parentId??null,input.jobId??null,stamp,stamp);
      this.activity(user,'document',`Added ${input.kind==='resume'?'résumé':'cover letter'}: ${input.title}`);
      return {id,duplicate:false};
    });
  }
  updateDocument(user,id,input){
    return this.tx(()=>{
      const original=this.document(user,id);if(!original)throw new InputError('Document not found.',404);
      if(input.kind!==original.kind)throw new InputError('Document type cannot be changed.');
      this.run('UPDATE career_documents SET title=?,text=?,reviewed_skills=?,review_status=?,bucket=?,bucket_reviewed=1,company=?,role=?,updated_at=? WHERE id=? AND user_id=?',input.title,input.text,JSON.stringify(input.reviewedSkills),input.reviewStatus,input.bucket,input.company,input.role,now(),id,user);
      this.activity(user,'document',`Updated ${input.kind==='resume'?'résumé':'cover letter'}: ${input.title}`);
    });
  }
  primaryResume(user,id,enabled=true){
    return this.tx(()=>{const doc=this.document(user,id);if(!doc||doc.kind!=='resume')throw new InputError('Résumé not found.',404);
      if(!enabled){this.run('UPDATE career_documents SET is_primary=0 WHERE user_id=? AND id=?',user,id);this.activity(user,'document','Résumé matching paused; preference matching is active.');return;}
      if(doc.reviewStatus!=='reviewed')throw new InputError('Review the extracted résumé text and skills before using it for matching.');
      this.run('UPDATE career_documents SET is_primary=0 WHERE user_id=? AND kind=?',user,'resume');
      this.run('UPDATE career_documents SET is_primary=1,updated_at=? WHERE id=? AND user_id=?',now(),id,user);
      this.activity(user,'document',`Matching now uses résumé: ${doc.title}`);
    });
  }
  matchingProfile(user){const p=this.user(user)?.preferences;if(!p)return null;const r=this.get("SELECT id,title,text,reviewed_skills FROM career_documents WHERE user_id=? AND kind='resume' AND is_primary=1 AND review_status='reviewed'",user);return {...p,resumeEvidence:r?{id:r.id,title:r.title,text:r.text,skills:JSON.parse(r.reviewed_skills)}:null};}
  deleteDocument(user,id){const d=this.document(user,id);if(!d)throw new InputError('Document not found.',404);this.run('DELETE FROM career_documents WHERE user_id=? AND id=?',user,id);this.activity(user,'document',`Removed document: ${d.title}`);}
  exportUser(user){return {exportedAt:now(),profile:this.user(user),applications:this.applications(user),documents:this.documents(user),jobStates:this.jobs(user).filter(j=>j.saved||j.dismissed||j.feedback),activity:this.activities(user)};}
  deleteUser(user){this.run('DELETE FROM users WHERE id=?',user);}
}
