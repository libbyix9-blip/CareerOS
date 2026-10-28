export const STATUSES = Object.freeze(['Applied','In Review','Recruiter Contact','Interviewing','Assessment','Offer','Rejected','Withdrawn','No Response']);
export const WEIGHTS = Object.freeze({role:35,skills:25,industry:15,compensation:10,location:10,seniority:5});
export const DEFAULT_PREFERENCES = {
  interests:['Trust & Safety','Platform Integrity','Online Abuse Prevention','Threat Assessment','Threat Management','Corporate Investigations','Private Investigations','OSINT','Corporate Intelligence','Protective Intelligence','Cyber Threat Intelligence','Fraud','Financial Crime Investigations','AI Safety','Adversarial Testing'],
  industries:['Technology','AI','Corporate Intelligence','Investigations','Cybersecurity','Corporate Security','Government','Public Safety','Fintech','Digital Payments'],
  locations:['New York','Los Angeles','San Francisco','Bay Area'],
  employers:['OpenAI','Anthropic','Meta','Snap','TikTok','Uber','Match Group','Cinder','Nardello & Co.','Kroll','K2 Integrity','Exiger'],
  minSalary:70000, remotePreferred:true, weights:{...WEIGHTS},
  constraints:'Individual contributor through manager. Other U.S. locations and exceptional on-site roles are welcome.',
  verifiedSkills:[]
};
export class InputError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export function string(value,name,max=200,required=false){
  if(typeof value!=='string' || value.length>max || (required && !value.trim()))throw new InputError(`Please provide a valid ${name}.`);
  return value.trim();
}
export function httpURL(value,empty=true){
  if(empty && !value)return '';
  try {const u=new URL(value);if(!['https:','http:'].includes(u.protocol) || u.username || u.password)throw 0;return u.href;}
  catch {throw new InputError('Use a complete http or https posting URL.');}
}
export function validDate(value,name='date',allowFuture=false){
  if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value || (!allowFuture && value>new Date().toISOString().slice(0,10)))throw new InputError(`Please provide a valid ${name} that is not in the future.`);
  return value;
}
export function validateApplication(input){
  if(!input || typeof input!=='object')throw new InputError('Application fields are required.');
  if(!STATUSES.includes(input.status))throw new InputError('Choose a supported application status.');
  if(input.lastResponseAt && input.lastResponseAt<input.appliedAt)throw new InputError('The recruiting response date cannot precede the application date.');
  return {company:string(input.company,'company',200,true),title:string(input.title,'job title',250,true),
    location:string(input.location??'','location',250),appliedAt:validDate(input.appliedAt,'application date'),
    source:string(input.source??'Manual','source',150,true),status:input.status,
    contact:string(input.contact??'','contact',300),summary:string(input.summary??'','update summary',2000),
    notes:string(input.notes??'','notes',10000),url:httpURL(input.url??''),
    lastResponseAt:input.lastResponseAt?validDate(input.lastResponseAt,'response date'):null};
}
export function validatePreferences(p){
  if(!p || typeof p!=='object')throw new InputError('Preferences are required.');
  const list=(key,max=40)=>{
    if(!Array.isArray(p[key]) || p[key].length>max)throw new InputError(`Check ${key}.`);
    return [...new Set(p[key].map(v=>string(v,key,120,true)))];
  };
  const interests=list('interests'),locations=list('locations',20),employers=list('employers',60),industries=list('industries',30),verifiedSkills=list('verifiedSkills',60);
  if(!interests.length || !locations.length)throw new InputError('Add at least one career interest and location.');
  if(!Number.isInteger(p.minSalary) || p.minSalary<0 || p.minSalary>1000000)throw new InputError('Salary must be between 0 and 1,000,000.');
  const weights={};for(const k of Object.keys(WEIGHTS)){const v=p.weights?.[k];if(!Number.isInteger(v)||v<0||v>100)throw new InputError('Weights must be whole numbers from 0 to 100.');weights[k]=v;}
  if(Object.values(weights).reduce((a,b)=>a+b,0)!==100)throw new InputError('Match weights must total 100%.');
  return {interests,locations,employers,industries,verifiedSkills,minSalary:p.minSalary,remotePreferred:p.remotePreferred===true,weights,constraints:string(p.constraints??'','career constraints',4000)};
}
export function effectiveStatus(a,now=Date.now()){
  return a.status==='Applied' && !a.lastResponseAt && now-Date.parse(a.appliedAt)>=30*86400000?'No Response':a.status;
}
export function toCSV(rows,columns=Object.keys(rows[0]??{company:0,title:0,status:0})){
  const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[columns.map(cell).join(','),...rows.map(r=>columns.map(k=>cell(typeof r[k]==='object'?JSON.stringify(r[k]):r[k])).join(','))].join('\r\n');
}
