import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {InputError,string,httpURL} from './domain.mjs';
export const MAX_FILE_SIZE=5_000_000;
export const BUCKETS={
  'Trust & Safety / Platform Integrity':['trust and safety','platform integrity','child safety','content moderation','online abuse','community safety','modsquad'],
  'Cyber Threat Intelligence':['cyber threat intelligence','cti','cybersecurity','cyber security','cyber threats','threat actor','malware','incident response'],
  'Threat & Protective Intelligence':['protective intelligence','threat assessment','threat management','protective services','executive protection','behavioral threat','workplace violence'],
  'Corporate Investigations & Intelligence':['corporate investigations','corporate intelligence','due diligence','kroll','nardello','k2 integrity','exiger','intelligence and diligence','business intelligence','investigations'],
  'Fraud & Financial Crime':['financial crime','fraud','anti money laundering','aml','sanctions','cryptocurrency investigations'],
  'AI Safety & Adversarial Testing':['ai safety','red teaming','red team','adversarial testing','model evaluation','anthropic','openai'],
  'Public Safety & Government':['district attorney','da s office','law enforcement','prosecutor','criminal justice','public safety','police','government'],
  'General / Review':[]
};
export const norm=v=>String(v??'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const has=(body,term)=>(' '+norm(body)+' ').includes(' '+norm(term)+' ');
export function bucketScores(text,title=''){
  const employerTerms=new Set(['kroll','nardello','k2 integrity','exiger','anthropic','openai']);
  return Object.entries(BUCKETS).map(([bucket,terms])=>({bucket,evidence:terms.filter(term=>has(text,term)||has(title,term)),score:terms.reduce((n,term)=>n+(has(text,term)?employerTerms.has(term)?0.25:1:0)+(has(title,term)?employerTerms.has(term)?1:6:0),0)})).sort((a,b)=>b.score-a.score);
}
export function suggestBucket(text,title=''){const [best]=bucketScores(text,title);return best.score?best.bucket:'General / Review';}
const SKILL_TERMS=['OSINT','Open-source intelligence','Open source intelligence','Open source research','Threat assessment','Threat management','Protective intelligence','Corporate investigations','Criminal investigations','Investigations','Due diligence','Cyber threat intelligence','Trust & Safety','Platform integrity','Content moderation','Fraud investigations','Financial crime','Case management','Intelligence analysis','Evidence review','Evidence analysis','Digital evidence','Financial analysis','Data analysis','Witness interviews','Research','Interviewing','Python','SQL','Excel','PowerPoint','Tableau','Power BI','Maltego','i2 Analyst','Palantir','Social media analysis','Report writing','Risk assessment','Law enforcement','Adversarial testing','Red teaming'];
export function suggestedSkills(text){return SKILL_TERMS.filter(term=>has(text,term));}
const PDF_SCRIPT=`ObjC.import('Foundation'); ObjC.import('PDFKit');
function run() {
 const input=$.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
 const encoded=ObjC.unwrap($.NSString.alloc.initWithDataEncoding(input,$.NSUTF8StringEncoding));
 const data=$.NSData.alloc.initWithBase64EncodedStringOptions(encoded,0);
 const pdf=$.PDFDocument.alloc.initWithData(data);
 if(!pdf || pdf.isNil())throw Error('INVALID_PDF');
 if(pdf.isLocked)throw Error('LOCKED_PDF');
 if(Number(pdf.pageCount)>50)throw Error('TOO_MANY_PAGES');
 const content=ObjC.unwrap(pdf.string)||'';
 return JSON.stringify({text:content});
}`;
function pdfText(bytes){
  if(process.platform!=='darwin')throw new InputError('PDF text extraction currently needs macOS PDFKit. Paste the text instead, or use DOCX/TXT.');
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/osascript',['-l','JavaScript','-e',PDF_SCRIPT],{stdio:['pipe','pipe','pipe']});
    let output='',size=0,finished=false;const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new InputError('PDF extraction timed out. Try a smaller file or paste its text.'));},15000);
    function finish(error,text){if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(text);}
    child.on('error',()=>finish(new InputError('PDF extraction is unavailable. Paste its text or upload DOCX/TXT.')));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>1_000_000){child.kill('SIGKILL');finish(new InputError('Extracted text is too large.'));}else output+=chunk.toString('utf8');});
    // Native diagnostics can include private metadata. Never log them.
    child.stderr.on('data',()=>{});
    child.on('close',code=>{if(code!==0)return finish(new InputError('Could not read this PDF. It may be locked or scanned; paste readable text instead.'));try{finish(null,JSON.parse(output).text);}catch{finish(new InputError('PDF text extraction failed. Paste the document text instead.'));}});
    child.stdin.on('error',()=>{});child.stdin.end(bytes.toString('base64'));
  });
}
function decodeXML(xml){
  return xml.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,s)=>{if(s[0]==='#'){const n=s[1].toLowerCase()==='x'?parseInt(s.slice(2),16):Number(s.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[s.toLowerCase()]??'';});
}
export function docxText(bytes){
  // Read only the bounded Word text part. Never extract archive paths to disk.
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new InputError('This is not a valid DOCX archive.');
  const count=bytes.readUInt16LE(end+10),offset=bytes.readUInt32LE(end+16);
  if(count>2000||offset>=bytes.length)throw new InputError('DOCX archive is too complex.');
  let pos=offset,total=0,found=null;
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)throw new InputError('Invalid DOCX archive.');
    const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),compressed=bytes.readUInt32LE(pos+20),uncompressed=bytes.readUInt32LE(pos+24),nameLen=bytes.readUInt16LE(pos+28),extraLen=bytes.readUInt16LE(pos+30),commentLen=bytes.readUInt16LE(pos+32),local=bytes.readUInt32LE(pos+42);
    const name=bytes.subarray(pos+46,pos+46+nameLen).toString('utf8');total+=uncompressed;
    if(flags&1 || total>20_000_000)throw new InputError('Encrypted or oversized DOCX archives are not supported.');
    if(name==='word/document.xml'){
      if(found||uncompressed>1_000_000||compressed>MAX_FILE_SIZE||local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)throw new InputError('Invalid Word text part.');
      const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
      if(start+compressed>bytes.length)throw new InputError('Truncated DOCX archive.');
      const raw=bytes.subarray(start,start+compressed);
      if(method!==0&&method!==8)throw new InputError('Unsupported DOCX compression.');
      found=(method===8?inflateRawSync(raw,{maxOutputLength:1_000_000}):raw).toString('utf8');
    }
    pos+=46+nameLen+extraLen+commentLen;
  }
  if(!found||/<!DOCTYPE|<!ENTITY/i.test(found))throw new InputError('This file does not contain a supported Word document.');
  return decodeXML(found.replace(/<w:tab\b[^>]*\/>/g,'\t').replace(/<w:br\b[^>]*\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<[^>]*>/g,''));
}
export function validateDocumentInput(input){
  if(!input||typeof input!=='object')throw new InputError('Document details are required.');
  if(!['resume','cover-letter'].includes(input.kind))throw new InputError('Choose résumé or cover letter.');
  const title=string(input.title,'document title',200,true);
  const text=string(input.text??'','document text',100000,true);
  const bucket=string(input.bucket??suggestBucket(text,title),'bucket',100,true);
  const company=string(input.company??'','company',200),role=string(input.role??'','role',250);
  const skills=input.reviewedSkills??[];if(!Array.isArray(skills)||skills.length>60)throw new InputError('Choose at most 60 skills.');
  return {kind:input.kind,title,text,bucket,company,role,reviewedSkills:[...new Set(skills.map(s=>string(s,'skill',120,true)))],reviewStatus:input.reviewStatus==='reviewed'?'reviewed':'pending',sourceUrl:httpURL(input.sourceUrl??''),sourceLabel:string(input.sourceLabel??'','source',200)};
}
export async function extractUpload(input){
  if(!input||typeof input.filename!=='string'||!['resume','cover-letter'].includes(input.kind))throw new InputError('A supported file and document type are required.');
  const filename=string(input.filename,'filename',250,true).split(/[\\/]/).at(-1);
  if(typeof input.base64!=='string'||input.base64.length>Math.ceil(MAX_FILE_SIZE/3)*4||input.base64.length%4!==0||/[^A-Za-z0-9+/=]/.test(input.base64))throw new InputError('Upload a file of 5 MB or less.');
  const bytes=Buffer.from(input.base64,'base64');if(!bytes.length||bytes.length>MAX_FILE_SIZE||bytes.toString('base64')!==input.base64)throw new InputError('Upload a valid, nonempty file of 5 MB or less.');
  let text,mime;
  if(/\.pdf$/i.test(filename)&&bytes.subarray(0,5).toString()==='%PDF-'){text=await pdfText(bytes);mime='application/pdf';}
  else if(/\.docx$/i.test(filename)&&bytes.length>=4&&bytes.readUInt16LE(0)===0x4b50){try{text=docxText(bytes);}catch(error){if(error instanceof InputError)throw error;throw new InputError('Could not extract this DOCX. Try exporting it again or paste the text.');}mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';}
  else if(/\.txt$/i.test(filename)&&!bytes.includes(0)){text=bytes.toString('utf8');mime='text/plain';}
  else throw new InputError('Upload a valid PDF, DOCX, or UTF-8 TXT file.');
  text=String(text??'').replace(/\u0000/g,'').trim();
  if(text.length<30)throw new InputError('There is not enough readable text. Scanned documents need OCR; paste the text instead.');
  if(text.length>100000)throw new InputError('Document text exceeds 100,000 characters.');
  const title=(input.title||filename.replace(/\.[^.]+$/,'')).slice(0,200);
  return {...validateDocumentInput({kind:input.kind,title,text}),filename,mimeType:mime,size:bytes.length,bytes,contentHash:createHash('sha256').update(text.replace(/\s+/g,' ').trim()).digest('hex'),suggestedSkills:input.kind==='resume'?suggestedSkills(text):[]};
}
export function recommendLetters(job,letters){
  const jobScores=bucketScores(job.title+' '+job.description,job.title),active=new Set(jobScores.filter(x=>x.score>0).map(x=>x.bucket));
  const titleTokens=[...new Set(norm(job.title).split(' ').filter(t=>t.length>4&&!['senior','manager','analyst','specialist','associate','director'].includes(t)))];
  return letters.filter(l=>l.kind==='cover-letter').map(l=>{
    const shared=titleTokens.filter(t=>has(l.text+' '+l.role,t));
    const bucket=active.has(l.bucket)?jobScores.find(x=>x.bucket===l.bucket).score:0;
    const score=Math.min(100,bucket*12+shared.length*8+(norm(l.company)===norm(job.company)&&l.company?15:0));
    return {id:l.id,title:l.title,bucket:l.bucket,score,reason:bucket?`Related career area: ${l.bucket}. Review employer names and claims before using.`:shared.length?`Shares role concepts: ${shared.slice(0,4).join(', ')}.`:'A general starting point; no strong role overlap detected.'};
  }).sort((a,b)=>b.score-a.score).slice(0,3);
}
