import {DEFAULT_PREFERENCES} from './domain.mjs';
import {suggestedSkills} from './documents.mjs';
export const normalize=s=>String(s??'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const contains=(s,t)=>(' '+s+' ').includes(' '+normalize(t)+' ');
const terms=(s,list)=>list.filter(t=>contains(s,t));
const CORE=['trust and safety','platform integrity','abuse prevention','threat assessment','threat management','investigator','investigations','osint','protective intelligence','corporate intelligence','threat intelligence','financial crime','ai safety','adversarial'];
const ADJ=['fraud','insider risk','geopolitical','corporate security','risk intelligence','security intelligence','due diligence','risk analyst','intelligence analyst','anti money laundering','aml','sanctions','compliance analyst'];
const WILD=['red team','red teaming','adversarial testing','gaming integrity','brand protection','cryptocurrency investigations','crypto investigations','geospatial','crisis intelligence','investigative journalism','marketplace fraud','sports integrity','model evaluation','misuse','biosecurity','frontier risk'];
export function matchJob(job,p=DEFAULT_PREFERENCES,feedback=[]){
  const title=normalize(job.title),body=normalize(job.description),all=title+' '+body;
  const core=terms(title,CORE),adj=terms(title,ADJ),wild=terms(title,WILD),personal=terms(title,p.interests);
  const bodyEvidence=terms(body,[...CORE,...ADJ,...WILD,...p.interests]);
  const titleEvidence=[...new Set([...core,...adj,...wild,...personal])];
  const relevant=titleEvidence.length>0 || bodyEvidence.length>=3;
  const category=wild.length?'Wildcard':core.length||personal.length?'Core':adj.length?'Adjacent':'Wildcard';
  let role=core.length||personal.length?94:adj.length?80:wild.length?84:Math.min(60,bodyEvidence.length*10);
  let feedbackAdjustment=0;
  for(const f of feedback){
    const tokens=normalize(f.title).split(' ').filter(w=>w.length>4);
    if(tokens.filter(w=>contains(title,w)).length>=2)feedbackAdjustment+=f.feedback==='More like this'?3:-4;
  }
  feedbackAdjustment=Math.max(-10,Math.min(10,feedbackAdjustment));role=Math.max(0,Math.min(100,role+feedbackAdjustment));
  const resume=p.resumeEvidence;
  const resumeSkills=resume?.skills??[];
  const selfReported=terms(all,p.verifiedSkills??[]);
  const resumeMatchedSkills=terms(all,resumeSkills);
  const matchedSkills=[...new Set([...resumeMatchedSkills,...selfReported])];
  const resumeRoleEvidence=resume?terms(normalize(resume.text),[...CORE,...ADJ,...WILD]).filter(term=>contains(all,term)):[];
  if(resume){const resumeRole=Math.min(95,30+resumeRoleEvidence.length*12+resumeMatchedSkills.length*10);role=Math.round(0.7*resumeRole+0.3*role);}
  const postingSkills=suggestedSkills(job.qualifications||job.description);
  const skills=resume?postingSkills.length?Math.round(35+Math.min(1,matchedSkills.length/postingSkills.length)*55):matchedSkills.length?75:50:(p.verifiedSkills??[]).length?Math.min(85,45+10*selfReported.length):50;
  // Text evidence comes only from the selected, reviewed résumé, never a cover letter.
  const resumeEvidence=resume?resume.text.split(/\n+/).filter(line=>!/@|\+?\d[\d ()-]{8,}/.test(line)&&resumeMatchedSkills.some(skill=>contains(normalize(line),skill))).slice(0,3).map(line=>line.trim().slice(0,240)):[];
  const salaryKnown=job.currency==='USD' && (Number.isFinite(job.salaryMin)||Number.isFinite(job.salaryMax));
  const compensation=!salaryKnown?50:job.salaryMin!==null && job.salaryMin>=p.minSalary?100:job.salaryMax!==null && job.salaryMax<p.minSalary?10:75;
  const loc=normalize(job.location);
  const preferredLocations=p.locations.flatMap(v=>v==='New York'?['New York','NYC']:v==='San Francisco'?['San Francisco','San Francisco Bay Area']:v==='Bay Area'?['Bay Area','San Mateo','San Jose','Mountain View']:v);
  const location=job.arrangement==='Remote' && p.remotePreferred?95:terms(loc,preferredLocations).length?100:/united states|usa|new york|california|austin|seattle|washington|boston|chicago/.test(loc)?75:50;
  const seniority=/\b(vp|vice president|director|head of|chief|principal)\b/.test(title)?25:/\b(manager|analyst|investigator|specialist|associate|researcher|engineer|lead)\b/.test(title)?90:60;
  const industry=terms(normalize(job.company),p.employers).length?100:terms(all,p.industries).length?85:60;
  const components={role,skills,industry,compensation,location,seniority};
  const score=Math.round(Object.entries(components).reduce((n,[k,v])=>n+v*p.weights[k]/100,0));
  const classification=category==='Wildcard'?'Wildcard':seniority===25?'Stretch Opportunity':score>=80?'Strong Match':score>=65?'Good Match':score>=50?'Stretch Opportunity':'Low Match';
  return {score,category,classification,relevant,provisional:true,components,feedbackAdjustment,
    basis:resume?'Résumé-informed':'Preference-based',resume:resume?{id:resume.id,title:resume.title,matchedSkills:resumeMatchedSkills,evidence:resumeEvidence}:null,
    explanation:(titleEvidence.length?`The title connects to ${titleEvidence.slice(0,3).join(', ')}. `:'Related responsibilities appear in the description, but title alignment is uncertain. ')+(resume?resumeMatchedSkills.length?`Your reviewed résumé mentions ${resumeMatchedSkills.slice(0,3).join(', ')}. `:'No confirmed skill overlap was detected in the selected résumé. ':'')+(salaryKnown?'Published USD base pay informs the score.':'Salary is unknown and scored neutrally.'),
    interesting:category==='Wildcard'?`Explore ${wild[0]??'an unfamiliar career path'} through the lens of your safety and investigative interests.`:'Aligned with your stated career interests and preferred employers or industries.',
    transferable:'Evidence analysis, investigative research, and risk triage may transfer if you have these skills. They are possibilities, not verified qualifications.',
    knownSkills:matchedSkills,
    missing:[resume?'Reviewed résumé text informs this score; years of experience, credentials, and eligibility still require review.':p.verifiedSkills?.length?'Only self-reported skills are available; years of experience and credentials remain unverified.':'No résumé or experience evidence supplied. Skills, experience, education, and eligibility are unverified.',...(resume?postingSkills.filter(skill=>!matchedSkills.includes(skill)).slice(0,6).map(skill=>`${skill}: mentioned in the posting, not matched to your reviewed skills.`):[]),...(seniority===25?['Leadership scope may exceed your preferred individual contributor–manager level.']:[]),...(category==='Wildcard'?['Review specialist tools, technical depth, domain experience, and mandatory requirements.']:[])],
    realism:seniority===25?'Stretch: senior leadership scope':category==='Wildcard'?'Exploratory: specialist qualifications need review':'Preference alignment; eligibility has not been assessed',
    caveats:[...(job.arrangement==='Remote'?['Remote may be restricted to specified regions; verify work authorization and residence requirements.']:[]),...(!salaryKnown?['Unpublished or non-USD salary is treated as unknown.']:[]),...(job.arrangement==='Not specified'?['Work arrangement is not specified by the source.']:[])]};
}
export function blendFeeds(items){
  const queues=['Core','Adjacent','Wildcard'].map(c=>items.filter(j=>j.match.category===c));
  const pattern=[0,0,1,0,2,0,1,0,0,1,0,2,0,1,0,0,2,0,1,0];
  const out=[];while(queues.some(q=>q.length)){for(const i of pattern){const item=queues[i].shift();if(item)out.push(item);}}
  return out;
}
