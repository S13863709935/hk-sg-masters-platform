import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';
import {loadSchoolBacklog,formatSchoolBacklog} from '../scripts/school-data-backlog.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/eduhk-aedi-observation-2026-11-04.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-EDUHK-P${String(n).padStart(3,'0')}`),route=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId.endsWith('-'+tag));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},testDate:'2026-05-01',singleAttempt:true}};
const chosen=(n,tag=null,mode='FT',category='NONLOCAL')=>{const x=tag?route(n,tag):p(n),o=x.offerings.find(o=>o.id.endsWith('-'+mode));return resolveProgramme(p(n),routes,x.routeId,o.id,category?o.id+'-'+category:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(o=>resolveProgramme(store.get(c.programmeId),routes,c.routeId||undefined,c.offeringId,o.id,contexts)));
const note=(x,label)=>x.rules.find(r=>r.labelEn===label)?.noteEn;
const languageCheck=(x,language)=>matchProgramme(x,{...profile,language}).checks.find(c=>c.kind==='language');


test('academy batch adds 15 existing partial identities and 30 explicit category choices without inventing degrees or reviews',()=>{
 assert.equal(obs.programmeIds.length,15);assert.equal(choices().length,30);assert.equal(store.quality().total,873);assert.equal(store.quality().checked,440);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.deepEqual(applicantSummary(contexts),{studyOptions:345,categories:694,peerReviewed:0});
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-04');assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'||r.kind==='major'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
});
test('Chinese elective English thresholds cannot incorrectly reject an otherwise potentially eligible low-English applicant',()=>{
 for(const n of [6,28]){assert.equal(p(n).rules.some(r=>r.kind==='language'),false);assert.match(note(p(n),'Language scope and conditional course requirements'),/SPECIFIC ENGLISH-ONLY ELECTIVE.*not a universal hard entry rule/);const result=matchProgramme(chosen(n),{...profile,language:{type:'ielts',total:3,testDate:'2026-05-01'}});assert.equal(result.status,'needs_confirmation');assert.equal(result.checks.some(c=>c.kind==='language'&&c.status==='fail'),false);assert.equal(result.tier,null);}
 assert.equal(p(2).rules.some(r=>r.kind==='language'),false);assert.equal(languageCheck(chosen(3),{...profile.language,total:5}).status,'fail');
});
test('work experience and robotics discipline preferences do not become mandatory hard failures for a new graduate',()=>{
 assert.match(p(11).notesEn,/TWO years.*PREFERRED.*not a mandatory/);assert.match(p(33).notesEn,/PREFERRED.*not an exclusive hard major/);
 for(const n of [6,11,12,33,9,24]){const m=matchProgramme(chosen(n),{...profile,major:'History',experienceYears:0});assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.some(c=>['major','experience'].includes(c.kind)&&c.status==='fail'),false);}
});
test('renamed HR degree preserves old directory identity and cites observed new page; same ID and no duplicate award',()=>{
 assert.match(p(14).name,/Digital Human Resource Management/);assert.match(p(14).officialUrl,/organisational-marketing$/);assert.match(p(14).notesEn,/FROM 2027\/28.*2026\/27/);assert.ok(p(14).sources.some(s=>s.url.endsWith('/master-of-arts-in-digital-human-resource-management')));assert.equal(chosen(14).offerings[0].tuition,252000);assert.equal(store.all().filter(p=>p.id==='HK-EDUHK-P014').length,1);
});
test('New Media fees and application fees require correct local/nonlocal selection and do not default a personal category',()=>{
 const local=chosen(30,null,'FT','LOCAL'),nonlocal=chosen(30);assert.equal(local.offerings[0].tuition,158960);assert.equal(nonlocal.offerings[0].tuition,198700);assert.equal(local.offerings[0].applicationFee,400);assert.equal(nonlocal.offerings[0].applicationFee,500);assert.equal(chosen(30,null,'FT',null).offerings[0].tuition,null);assert.equal(programmeTimeline(chosen(30,null,'FT',null),'2026-11-04').state,'applicant_required');
});
test('unlabelled fee-year quotes remain unknown and a stray PT duration is not promoted to a verified intake',()=>{
 for(const n of [9,24,37]){const x=chosen(n);assert.equal(x.offerings[0].tuition,null);assert.equal(x.fieldStatus.tuition.status,'unknown');assert.match(x.offerings[0].feeBasis,/NO explicit academic year/);}
 assert.equal(p(28).offerings.length,1);assert.equal(p(28).offerings[0].mode,'Full-time');assert.match(p(28).notesEn,/PT availability\/current fee basis requires confirmation/);assert.match(chosen(3).offerings[0].feeBasis,/Field-trip expenses excluded/);
});
test('qualification-location documents and Chinese statement units retain conditional applicability',()=>{
 assert.match(p(18).notesEn,/Mainland-university degree holders.*SIX MONTHS.*qualification location, not nationality/);assert.match(p(37).notesEn,/500-WORD.*IN CHINESE.*rather than.*characters/);assert.match(p(50).notesEn,/not automatically confer.*licence/);
});
test('source retrievals distinguish actual panel reading, mere discovery, reuse and timeout without claiming a full re-enumeration',()=>{
 assert.equal(obs.sourceRetrievals.length,16);assert.ok(obs.sourceRetrievals.every(x=>x.status===200&&x.contentReadable&&/^[a-f0-9]{64}$/.test(x.sha256)));assert.equal(obs.reusedCentralSources.length,3);const fail=obs.discoveryRetrievals.find(x=>x.key==='HK-EDUHK-P040-row1');assert.equal(fail.contentReadable,false);assert.equal(fail.sha256,undefined);assert.match(fail.error,/timed out/);assert.equal(obs.limits.fullCatalogueReenumerated,false);assert.equal(obs.limits.livePortalChecked,false);
 const b=loadSchoolBacklog('2026-11-04'),s=b.schools.find(s=>s.schoolId==='HK-EDUHK');assert.equal(s.pageCheckedRecords,58);assert.equal(s.unreadLeads,1);assert.equal(b.counts.unreadLeads,418);assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-cuhk-engineering.json'));const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,848);assert.equal(q.counts.staleApplicantContexts,0);
});
test('isolated repeated imports preserve all earlier parents and reload exact condition/language bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-eduhk-aedi-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,440);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,28);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,345);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all thirty choices retain conditions, null prices and category fees through detail/matching APIs, restore and export',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})});const r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.offerings,x.offerings);assert.equal(d.admissionRoute,x.admissionRoute);const saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');
  const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);assert.equal(restored.programme.admissionRoute,x.admissionRoute);
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(ex.offerings[0].applicationRounds,o.applicationRounds);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat},filters:{school:'HK-EDUHK'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);
 }
});
