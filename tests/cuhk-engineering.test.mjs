import {repositoryExpected} from './repository-expected-state.mjs';
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
const batch=read('data/checked-programmes.json'),obs=read('data/research/cuhk-engineering-observation-2026-11-04.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-CUHK-P${String(n).padStart(3,'0')}`),route=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId.endsWith('-'+tag));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},testDate:'2026-05-01',singleAttempt:true}};
const chosen=(n,tag=null,mode='FT',category='NONLOCAL')=>{const x=tag?route(n,tag):p(n),o=x.offerings.find(o=>o.id.endsWith('-'+mode));return resolveProgramme(p(n),routes,x.routeId,o.id,category?o.id+'-'+category:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(o=>resolveProgramme(store.get(c.programmeId),routes,c.routeId||undefined,c.offeringId,o.id,contexts)));
const note=(x,label)=>x.rules.find(r=>r.labelEn===label)?.noteEn;
const languageCheck=(x,language)=>matchProgramme(x,{...profile,language}).checks.find(c=>c.kind==='language');


test('engineering batch adds eleven existing partial parents and forty-four mode/category selections, not new awards',()=>{
 assert.equal(obs.programmeIds.length,11);assert.equal(obs.applicantContextPlan.length,22);assert.equal(choices().length,44);assert.equal(store.quality().total,873);assert.equal(store.quality().checked,repositoryExpected.checked);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.deepEqual(applicantSummary(contexts),{studyOptions:345,categories:694,peerReviewed:0});
 const b=loadSchoolBacklog(repositoryExpected.asOfDate),school=b.schools.find(s=>s.schoolId==='HK-CUHK');assert.equal(school.pageCheckedRecords,129);assert.equal(school.unreadLeads,0);assert.equal(b.counts.unreadLeads,repositoryExpected.unreadLeads);assert.deepEqual(b,read(repositoryExpected.backlogJson));const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,repositoryExpected.reviewUnits);assert.equal(q.counts.nearCutoffUnits,repositoryExpected.nearCutoffNovember4);assert.equal(q.counts.staleApplicantContexts,0);
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-04');assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
});
test('Second Class OR average B OR assessed equivalent is not a fabricated numeric GPA or universal honours-only rejection',()=>{
 for(const x of choices()){assert.equal(x.rules.some(r=>['gpa','classification'].includes(r.kind)),false);assert.match(note(x,'Taught-master academic alternatives'),/SECOND CLASS HONOURS OR average grade B, OR assessed professional/);const m=matchProgramme(x,{...profile,classification:'third',gpa:75,gpaScale:100});assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);}
});
test('CUHK English evidence differs from EdUHK: IELTS6.5, TOEFL79/4.5, online/home formats, actual two-year expiry and assessed waiver',()=>{
 const x=chosen(83);assert.equal(languageCheck(x,{...profile.language,total:6}).status,'fail');assert.equal(languageCheck(x,{...profile.language,total:6.5,atHome:true}).status,'pass');assert.equal(languageCheck(x,{type:'toefl_120',total:79,testDate:'2026-01-20',atHome:true}).status,'pass');assert.equal(languageCheck(x,{type:'toefl_6',total:4,testDate:'2026-05-01',atHome:true}).status,'fail');assert.equal(languageCheck(x,{type:'toefl_6',total:4.5,testDate:'2026-05-01',atHome:true}).status,'pass');assert.equal(languageCheck(x,{...profile.language,testDate:'2024-01-01'}).status,'fail');assert.equal(languageCheck(x,{type:'waiver'}).status,'unknown');assert.equal(x.rules.find(r=>r.kind==='language').testDateNotBefore,undefined);assert.match(note(x,'English alternatives, modes and validity'),/GMAT Verbal21.*Focus Verbal78/);
});
test('AI alternative two-year experience is not universal; CS and IE retain other-degree content routes and FinTech retains preferences',()=>{
 assert.match(p(74).notesEn,/OTHER undergraduate disciplines require.*TWO years.*not a universal/);assert.equal(p(74).rules.some(r=>r.kind==='experience'),false);assert.match(p(83).notesEn,/another degree with extensive COMPUTER-RELATED CONTENT/);assert.match(p(97).notesEn,/another degree with relevant courses or IT-industry experience/);assert.match(p(92).notesEn,/PREFERABLY.*not.*hard skill\/major failures/);
 for(const n of [74,79,83,87,92,97,106,108,116]){const m=matchProgramme(chosen(n),{...profile,major:'History',experienceYears:0});assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.some(c=>['major','experience'].includes(c.kind)&&c.status==='fail'),false);}
});
test('mode-specific prices and atypical durations do not become annual amounts or multiplied part-time totals',()=>{
 assert.equal(chosen(74).offerings[0].duration,'1.5 years');assert.equal(chosen(74,null,'PT').offerings[0].duration,'3 years');assert.equal(chosen(79,null,'PT').offerings[0].duration,'3 years');assert.equal(chosen(79,null,'PT').offerings[0].tuition,240000);assert.equal(chosen(83).offerings[0].tuition,300000);assert.equal(chosen(83,null,'PT').offerings[0].tuition,260000);assert.equal(chosen(97).offerings[0].tuition,284000);assert.equal(chosen(97,null,'PT').offerings[0].tuition,242500);assert.equal(chosen(108).offerings[0].tuition,290000);assert.notEqual(chosen(108).offerings[0].tuition,12084*24);
 for(const n of [87,92,108])assert.equal(chosen(n).offerings[0].tuition,chosen(n,null,'PT').offerings[0].tuition);
});
test('unlabelled fee years remain null while CS financial approval does not incorrectly disable a direct application route',()=>{
 for(const n of [74,85,106,116,122])for(const mode of ['FT','PT']){const x=chosen(n,null,mode);assert.equal(x.offerings[0].tuition,null);assert.match(x.offerings[0].feeBasis,/Fee-year NOT explicitly identified/);assert.equal(x.fieldStatus.tuition.status,'unknown');}
 const cs=chosen(83);assert.equal(cs.admissionRoute,'direct');assert.equal(cs.fieldStatus.tuition.status,'unknown');assert.match(cs.offerings[0].feeBasis,/SUBJECT TO APPROVAL.*2026\/27.*historical/);assert.equal(programmeTimeline(cs,'2026-11-04').state,'within_recorded_dates');
});
test('BME conflicting department rounds and central category dates cannot produce a false open or authoritative final deadline',()=>{
 for(const mode of ['FT','PT'])for(const category of ['LOCAL','NONLOCAL']){const x=chosen(79,null,mode,category),o=x.offerings[0];assert.equal(o.deadline,null);assert.equal(o.applicationRounds,undefined);assert.equal(o.applicationOpen,'2026-09-01');assert.equal(programmeTimeline(x,'2026-11-04').state,'dates_incomplete');assert.match(o.deadlineNote,/30April2027 NON-LOCAL.*15June2027 LOCAL.*31March2027/);}
});
test('own upcoming rounds remain separate from research dates, old 2025/26 blocks, unknown clocks and provisional January PT',()=>{
 const expected={74:['2026-10-02','2026-11-06','2026-12-31','2027-02-28'],83:['2027-01-31'],85:['2027-03-16'],87:['2026-09-28','2026-10-26','2026-11-20','2027-01-18'],92:['2026-10-02','2026-11-06','2026-12-31','2027-02-28'],97:['2026-09-30','2026-11-30','2027-03-31'],106:['2027-03-31'],108:['2026-09-28','2026-10-26','2026-11-20','2027-01-18'],116:['2027-03-31'],122:['2027-03-16']};
 for(const [n,dates]of Object.entries(expected)){const x=chosen(Number(n)),o=x.offerings[0];assert.deepEqual(o.applicationRounds.map(r=>r.deadline),dates);assert.deepEqual(o.applicationRounds.map(r=>r.applicationOpen),['2026-09-01',...dates.slice(1).map(()=>null)]);assert.ok(o.applicationRounds.every(r=>r.deadlineAt===null));assert.equal(o.applicationFee,500);}
 assert.equal(programmeTimeline(chosen(74),'2026-11-04').offerings[0].nextRoundId,'ROUND-2');assert.equal(p(87).offerings.length,2);assert.ok(p(87).offerings.every(o=>o.intake==='September 2027'));assert.match(p(87).notesEn,/provisional January PT.*unresolved/);
});
test('BME references are required while CS references are optional; FinTech does not invent an interview/GRE or PGD fee',()=>{
 assert.match(note(p(79),'Documents and professional or curricular conditions'),/TWO confidential references.*Personal Statement and CV are explicitly NOT REQUIRED/);assert.match(note(p(83),'Documents and professional or curricular conditions'),/TWO references are explicitly OPTIONAL/);assert.match(note(p(92),'Documents and professional or curricular conditions'),/NO interview and NO GRE.*80,000.*no automatic fee deduction/i);assert.equal(chosen(92).offerings[0].tuition,395000);assert.notEqual(chosen(92).offerings[0].tuition,197500);assert.equal(store.all().some(p=>p.universityId==='HK-CUHK'&&p.name==='Postgraduate Diploma in Financial Technology'),false);
});
test('explicit meta-refresh and HTTPS upgrades preserve provenance rather than turning empty HTTP200 bodies into checked content',()=>{
 assert.equal(obs.sourceRetrievals.length,63);assert.equal(obs.sourceRetrievals.filter(x=>x.contentReadable).length,61);const empty=obs.sourceRetrievals.filter(x=>!x.contentReadable);assert.equal(empty.length,2);assert.ok(empty.every(x=>x.status===200&&x.sha256));assert.equal(obs.sourceRetrievals.filter(x=>x.upgradedFromObservedHttpUrl).length,6);
 for(const n of [106,116]){assert.ok(p(n).sources.some(s=>s.url.startsWith('https://www4.mae.cuhk.edu.hk/')));assert.match(chosen(n).offerings[0].feeBasis,/explicitly2026\/27.*NOT substituted/);}for(const id of obs.programmeIds)assert.ok(store.get(id).sources.every(s=>s.url.startsWith('https://')));
});
test('isolated repeated imports preserve all earlier parents and reload exact condition/language bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-cuhk-engineering-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,repositoryExpected.checked);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,repositoryExpected.routeGroups);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,345);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all forty-four choices retain null fees, conflicting dates, modes and source evidence through detail/matching APIs, restore and export',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})});const r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.offerings,x.offerings);assert.equal(d.admissionRoute,x.admissionRoute);const saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');
  const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);assert.equal(restored.programme.admissionRoute,x.admissionRoute);
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(ex.offerings[0].applicationRounds,o.applicationRounds);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat},filters:{school:'HK-CUHK'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);
 }
});


test('a saved category from a different engineering mode cannot silently overwrite the chosen mode',async()=>{const x=chosen(83,null,'PT'),o=x.offerings[0],wrong=chosen(83).selectedApplicant.id,q=new URLSearchParams({offering:o.id,applicant:wrong});const response=await fetch(`${base}/api/programmes/${x.id}?${q}`);assert.equal(response.status,422);assert.match((await response.json()).error,/Unknown or stale applicant category/);});
