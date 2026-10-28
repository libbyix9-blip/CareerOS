import {createHash} from 'node:crypto';
export const SOURCES=[
  {key:'greenhouse:anthropic',company:'Anthropic',kind:'Greenhouse',board:'anthropic'},
  {key:'ashby:openai',company:'OpenAI',kind:'Ashby',board:'openai'},
  {key:'greenhouse:exiger',company:'Exiger',kind:'Greenhouse',board:'exiger'},
  {key:'lever:matchgroup',company:'Match Group',kind:'Lever',board:'matchgroup'},
  {key:'greenhouse:chainalysis',company:'Chainalysis',kind:'Greenhouse',board:'chainalysis'},
  {key:'greenhouse:discord',company:'Discord',kind:'Greenhouse',board:'discord'},
  {key:'greenhouse:andurilindustries',company:'Anduril',kind:'Greenhouse',board:'andurilindustries'},
  {key:'ashby:cinder',company:'Cinder',kind:'Ashby',board:'cinder'}
];
export function plainText(value){
  let s=String(value??'');
  for(let i=0;i<2;i++)s=s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ');
  return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<\/(p|li|div|h[1-6])>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();
}
export function fingerprint(company,title,location){return createHash('sha256').update([company,title,location].map(s=>String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).join('|')).digest('hex');}
function iso(value){if(value===null||value===undefined)return null;const d=new Date(value);return Number.isNaN(+d)?null:d.toISOString();}
function safeURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw new Error('INVALID_POSTING_URL');return u.href;}
export function normalizePosting(source,j){
  const title=plainText(j.title??j.text);
  const locations=[typeof j.location==='object'?j.location?.name:j.location??j.categories?.location,...(j.secondaryLocations??[]).map(l=>l.location)];
  const location=[...new Set(locations.filter(Boolean).map(plainText))].join(' · ')||'Not specified';
  const url=safeURL(j.absolute_url??j.hostedUrl??j.jobUrl);
  // Ashby's public API may omit an id; its stable hosted URL contains the posting UUID.
  const sourceJobId=String(j.id??new URL(url).pathname.split('/').filter(Boolean).at(-1)??'');
  if(!title||!sourceJobId)throw new Error('INVALID_SOURCE_DATA');
  const type=String(j.workplaceType??'').toLowerCase();
  const arrangement=type==='hybrid'?'Hybrid':['on-site','onsite'].includes(type)?'On-site':type==='remote'?'Remote':j.isRemote?'Remote':/\bhybrid\b/i.test(location)?'Hybrid':/\bremote\b/i.test(location)?'Remote':'Not specified';
  const lists=(j.lists??[]).map(l=>plainText(l.text)+'\n'+plainText(l.content));
  const description=[plainText(j.content??j.descriptionPlain??j.descriptionHtml??j.description),...lists,plainText(j.additionalPlain??j.additional)].filter(Boolean).join('\n\n').slice(0,100000);
  const qualifications=(j.lists??[]).filter(l=>/require|qualif|you bring|experience/i.test(l.text)).map(l=>plainText(l.content)).join('\n\n')||null;
  let salaryMin=null,salaryMax=null,currency=null;
  const salary=j.salaryRange;
  if(salary && /^(year|yearly|annual|annually|1 year)$/i.test(salary.interval??'')){
    salaryMin=Number.isFinite(salary.min)?Math.round(salary.min):null;salaryMax=Number.isFinite(salary.max)?Math.round(salary.max):null;currency=salary.currency??null;
  }else{
    const components=j.compensation?.summaryComponents??[];
    const annual=components.filter(c=>c.compensationType==='Salary' && c.interval==='1 YEAR');
    const currencies=[...new Set(annual.map(c=>c.currencyCode).filter(Boolean))];
    if(currencies.length===1){currency=currencies[0];const mins=annual.map(c=>c.minValue).filter(Number.isFinite),maxes=annual.map(c=>c.maxValue).filter(Number.isFinite);salaryMin=mins.length?Math.round(Math.min(...mins)):null;salaryMax=maxes.length?Math.round(Math.max(...maxes)):null;}
  }
  if(salaryMin!==null && salaryMin<0 || salaryMax!==null && salaryMax<0){salaryMin=null;salaryMax=null;currency=null;}
  return {fingerprint:fingerprint(source.company,title,location),company:source.company,title,location,arrangement,
    salaryMin,salaryMax,currency,salaryText:plainText(j.compensation?.compensationTierSummary??j.salaryDescriptionPlain??j.salaryDescription)||null,
    description,qualifications,url,postedAt:iso(j.publishedAt??j.createdAt),sourceJobId};
}
export async function fetchJSON(url,fetcher=fetch){
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'CareerOS/0.2 (personal career research)'},signal:AbortSignal.timeout(15000),redirect:'error'});
      if(!r.ok){const error=new Error(`HTTP_${r.status}`);if(r.status!==429&&r.status<500)error.permanent=true;throw error;}
      const length=Number(r.headers.get('content-length'));if(length>20_000_000)throw new Error('SOURCE_TOO_LARGE');
      let bytes=0;const chunks=[];for await(const chunk of r.body){bytes+=chunk.byteLength;if(bytes>20_000_000)throw new Error('SOURCE_TOO_LARGE');chunks.push(Buffer.from(chunk));}
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch(e){if(e.permanent||attempt===2)throw e;await new Promise(r=>setTimeout(r,250*2**attempt));}
  }
}
export async function retrieve(source,fetcher=fetch){
  const board=encodeURIComponent(source.board);
  let raw=[];
  if(source.kind==='Lever'){
    for(let page=0;page<50;page++){
      const batch=await fetchJSON(`https://api.lever.co/v0/postings/${board}?mode=json&limit=100&skip=${page*100}`,fetcher);
      if(!Array.isArray(batch))throw new Error('INVALID_SOURCE_DATA');raw.push(...batch);
      if(batch.length<100)break;
      if(page===49)throw new Error('PAGINATION_LIMIT');
    }
  }else{
    const url=source.kind==='Greenhouse'?`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`:`https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`;
    const payload=await fetchJSON(url,fetcher);if(!Array.isArray(payload?.jobs))throw new Error('INVALID_SOURCE_DATA');raw=payload.jobs;
    if(source.kind==='Greenhouse' && Number.isFinite(payload.meta?.total) && payload.meta.total!==raw.length)throw new Error('INCOMPLETE_SOURCE');
  }
  return raw.filter(j=>j.isListed!==false).map(j=>normalizePosting(source,j));
}
