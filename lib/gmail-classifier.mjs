import {plainText} from './sources.mjs';
export const roleKey=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function emailText(payload){let size=0;const out=[];function visit(p){if(size>=200000)return;if(['text/plain','text/html'].includes(p.mimeType)){const t=Buffer.from(p.body?.data??'','base64url').toString('utf8').slice(0,200000-size);out.push(p.mimeType==='text/html'?plainText(t):t);size+=t.length;}for(const child of p.parts??[])visit(child);}visit(payload??{});return out.join('\n');}
export function classifyGmail(message){
 const headers=message.payload?.headers??[],header=name=>headers.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value??'';
 const subject=header('Subject').trim(),body=emailText(message.payload)||message.snippet||'',text=(subject+'\n'+body).replace(/\s+/g,' ');
 const ms=Number(message.internalDate);if(!Number.isFinite(ms)||ms<=0)return {ignore:true};
 const list=!!header('List-Id')||!!header('List-Unsubscribe');
 if(/job alerts?|jobs? (?:you might|you may|for you|matching)|recommended (?:jobs|roles)|new (?:job|career) opportunities|newsletter|weekly digest|career tips/i.test(subject)||list&&!/your application|your interview|thank you for applying|application (?:received|update)/i.test(subject))return {ignore:true};
 let status=null;
 if(/(?:your application|you have).{0,45}(?:withdrawn|withdrawal)|confirm.{0,25}withdrawal/i.test(text))status='Withdrawn';
 else if(/offer of employment|offer letter|pleased to (?:offer|extend)|job offer|employment offer/i.test(text))status='Offer';
 else if(/not (?:be )?moving forward|not (?:be )?proceeding|regret to inform|unfortunately.{0,120}(?:application|position|candidate)|application.{0,40}(?:unsuccessful|rejected)|selected another candidate/i.test(text))status='Rejected';
 else if(/take.home (?:assignment|exercise)|assessment|coding challenge|complete.{0,30}(?:exercise|test)/i.test(text))status='Assessment';
 else if(/interview invitation|schedule.{0,35}interview|interview.{0,35}(?:scheduled|availability|confirmation)|invite you.{0,35}interview|next.round interview/i.test(text))status='Interviewing';
 else if(/(?:recruiter|talent acquisition|recruiting team).{0,150}(?:reach|connect|discuss)|(?:reach|connect|discuss).{0,150}(?:recruiter|talent acquisition)/i.test(text))status='Recruiter Contact';
 else if(/application (?:is )?(?:under|in) review|reviewing your application|application has been forwarded/i.test(text))status='In Review';
 else if(/thank you for (?:your interest in|applying|your application)|received your application|application (?:received|confirmation|submitted)|successfully (?:submitted|applied)|your application.{0,30}(?:was |has been )?(?:sent|submitted|received)/i.test(text))status='Applied';
 if(!status)return {ignore:true};
 let title='',company='';const full=subject+'\n'+body.slice(0,4000);
 const pair=[/you (?:applied|have applied) (?:to|for) (?:the )?(.+?) at (.+?)(?:[.!\n]|$)/i,/your application (?:for|to) (.+?) at (.+?)(?:[.!\n]|$)/i,/(?:applied|applying) (?:to|for) (?:the )?(.+?) (?:role|position) (?:at|with) (.+?)(?:[.!\n]|$)/i,/application (?:received|confirmation)\s*[-–:]\s*(.+?)\s*[-–|]\s*(.+?)(?:[.!\n]|$)/i].map(r=>r.exec(full)).find(Boolean);
 if(pair){title=pair[1].trim();company=pair[2].trim();}
 if(!company){const c=/thank you for (?:applying to|your interest in) ([^.!\n]{2,100})/i.exec(full);if(c)company=c[1].trim();}
 if(!title){const r=/(?:applying for|application for|applied for) (?:the )?([^.!\n]{3,150}?) (?:position|role)(?:[.!\n]| at| with|$)/i.exec(full);if(r)title=r[1].trim();}
 if(title.length>150||/thank you|we have|we are|your application/i.test(title))title='';
 if(company.length>100||/we have|we are|your application|the position|for the/i.test(company))company='';
 return {ignore:false,messageId:String(message.id),threadId:String(message.threadId??message.id),receivedAt:new Date(ms).toISOString(),company,title,status,contact:header('From').slice(0,300),summary:subject.slice(0,400)||status,confidence:company&&title?0.95:0.65,reason:company&&title?'Explicit role and employer.':'Employer or role needs review.'};
}
