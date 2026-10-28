import {randomUUID} from 'node:crypto';
import {SOURCES,retrieve} from './sources.mjs';
export class Discovery {
  constructor(store,{sources=SOURCES,fetcher=fetch}={}){this.store=store;this.sources=sources;this.fetcher=fetcher;this.running=false;this.promise=null;}
  status(){
    const runs=this.store.sourceRuns();
    return {running:this.running,sources:this.sources.map(s=>{
      const latest=runs.find(r=>r.source===s.key),success=runs.find(r=>r.source===s.key&&r.success);
      return {...s,lastRun:latest??null,lastSuccessfulAt:success?.finishedAt??null};
    }),lastSuccessfulAt:runs.find(r=>r.success)?.finishedAt??null};
  }
  start(){
    if(this.running || !this.store.acquireLock('discovery'))return false;
    this.running=true;
    this.promise=this.run().finally(()=>{this.running=false;this.store.releaseLock('discovery');});
    return true;
  }
  async run(){
    // Two independent sources at a time; bounded retries and total response size.
    const queue=[...this.sources];
    const worker=async()=>{while(queue.length){const source=queue.shift();const id=this.store.startRun(source.key);
      try{const jobs=await retrieve(source,this.fetcher);this.store.ingest(source.key,jobs,id);}
      catch(e){
        const code=/^HTTP_\d{3}$/.test(e.message)?e.message:e.cause?.code==='ENOTFOUND'?'DNS_LOOKUP_FAILED':e.name==='TimeoutError'?'SOURCE_TIMEOUT':'FETCH_OR_INGEST_FAILED';
        const reference=randomUUID();this.store.failRun(id,`${code} · ${reference}`);console.error('Source refresh failed',{source:source.key,code,reference});
      }
    }};
    await Promise.all([worker(),worker()]);
  }
}
