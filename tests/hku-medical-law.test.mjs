import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-medical-law-observation-2026-11-03.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),records=obs.programmeIds.map(id=>store.get(id));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3,gpaScale:4,experienceYears:3,language:{type:'ielts',total:7,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2025-09-01'}};
const resolve=(n,mode='FT',cat)=>{const o=p(n).offerings.find(o=>o.mode===(mode==='FT'?'Full-time':'Part-time'));assert.ok(o,'Unsupported mode');return resolveProgramme(p(n),routes,undefined,o.id,cat?o.id+'-'+cat:undefined,contexts);};
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
const academic=x=>x.rules.find(r=>r.labelEn==='Programme-specific academic and evidence conditions').noteEn,docs=x=>x.rules.find(r=>r.labelEn==='Exact supporting documents and relative timing').noteEn;
const choices=()=>records.flatMap(x=>x.offerings.flatMap(o=>{const c=obs.applicantContextPlan.find(c=>c.offeringId===o.id);return(c?c.options:[undefined]).map(cat=>resolveProgramme(x,routes,undefined,o.id,cat?.id,contexts));}));

test('seven existing identities add twelve study options and nine exact contexts without inflating complete review or degree counts',()=>{
 assert.equal(records.length,7);assert.equal(records.flatMap(p=>p.offerings).length,12);assert.equal(choices().length,20);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,373);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.equal(store.all().filter(p=>p.universityId==='HK-HKU'&&p.verification==='programme_page_checked').length,93);assert.deepEqual(routeSummary(routes),{groups:18,routes:43,pageChecked:43,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:239,categories:478,peerReviewed:0});
 for(const x of records){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-03');assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===x.id))),false);assert.equal(routes.has(x.id),false);}
 assert.equal(p(3).scope.status,'out_of_scope');
});

test('MPH PT exposes only an explicitly selected local category and never invents non-local availability or pricing',()=>{
 const pt=resolve(19,'PT');assert.equal(pt.applicantOptions.length,1);assert.equal(pt.selectedApplicant,undefined);assert.equal(pt.offerings[0].tuition,null);assert.equal(pt.offerings[0].deadline,null);assert.equal(programmeTimeline(pt,'2026-11-03').state,'applicant_required');
 const local=resolve(19,'PT','LOCAL');assert.equal(local.offerings[0].tuition,254400);assert.equal(local.offerings[0].deadline,'2027-06-30');assert.match(local.offerings[0].feeBasis,/127200 per year.*TWO years/);assert.equal(matchProgramme(local,profile).checks.find(c=>c.kind==='applicant').status,'unknown');
 assert.throws(()=>resolve(19,'PT','NONLOCAL'));assert.equal(resolve(19,'FT','NONLOCAL').offerings[0].tuition,317100);assert.equal(resolve(19,'FT','LOCAL').offerings[0].tuition,254400);assert.equal(resolve(19,'FT','NONLOCAL').offerings[0].deadline,'2027-04-30');
 assert.match(academic(p(19)),/Honours bachelor OR MBBS.*not restricted/);assert.equal(p(19).rules.some(r=>r.kind==='experience'),false);assert.match(local.offerings[0].deadlineNote,/Early Decision.*BEFORE 15 February 2027.*separate/);
});

test('single-category validation still rejects an empty list, duplicate options and stale source binding',()=>{
 const c=structuredClone([...contexts.values()].find(c=>c.offeringId===p(19).offerings[1].id)),dir=mkdtempSync(join(tmpdir(),'gradpath-local-only-')),file=join(dir,'context.json');
 try{for(const options of [[...c.options],[],[c.options[0],c.options[0]]]){writeFileSync(file,JSON.stringify({schemaVersion:1,checkedOn:c.checkedOn,contexts:[{...c,options}]}));if(options.length===1)assert.equal(loadApplicantContexts(file,store.all(),routes).size,1);else assert.throws(()=>loadApplicantContexts(file,store.all(),routes));}}
 finally{rmSync(file,{force:true});rmdirSync(dir);}
 const changed=structuredClone(p(19));changed.offerings[1].tuition=1;const o=changed.offerings[1];const stale=resolveProgramme(changed,routes,undefined,o.id,undefined,contexts);assert.equal(stale.applicantContextStatus,'stale');assert.equal(stale.offerings[0].tuition,null);assert.deepEqual(stale.applicantOptions,[]);assert.throws(()=>resolveProgramme(changed,routes,undefined,o.id,o.id+'-LOCAL',contexts));
});

test('EMBL second-class and full-time experience conditions stay separate from numeric GPA and its unresolved January fee',()=>{
 const x=resolve(24,'PT','LOCAL'),check=pr=>matchProgramme(x,pr);assert.equal(check({...profile,experienceYears:2}).checks.find(c=>c.kind==='experience').status,'fail');assert.equal(check(profile).checks.find(c=>c.kind==='experience').status,'pass');assert.equal(check({...profile,classification:'third'}).checks.find(c=>c.kind==='classification').status,'fail');assert.equal(check({...profile,classification:undefined,gpa:4}).checks.find(c=>c.kind==='classification').status,'unknown');assert.match(academic(x),/FULL-TIME.*mandatory.*PREFERRED/);assert.equal(x.offerings[0].tuition,null);assert.equal(x.fieldStatus.tuition.status,'unknown');assert.match(x.offerings[0].feeBasis,/366000.*390000.*NULL/);assert.equal(x.offerings[0].applicationFee,600);assert.equal(check(profile).status,'needs_confirmation');assert.throws(()=>resolve(24,'FT'));
});

test('Law and Clinical Research retain their own score scales, boundaries and different validity evidence',()=>{
 for(const [n,mode,old,newScore] of [[24,'PT',97,5],[51,'FT',85,4.5]]){const x=resolve(n,mode);assert.equal(language(x,{...profile.language,total:6}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:old-1,testDate:'2026-01-20'}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:old,testDate:'2026-01-20'}).status,'pass');assert.equal(language(x,{type:'toefl_6',total:newScore,testDate:'2026-01-21'}).status,'pass');assert.throws(()=>language(x,{type:'toefl_120',total:old,testDate:'2026-01-21'}),/scale conflicts/);}
 const law=resolve(24,'PT');assert.equal(law.rules.find(r=>r.kind==='language').testDateNotBefore,undefined);assert.equal(language(law,{type:'toefl_120',total:97,testDate:'2026-01-20',atHome:true}).status,'fail');assert.match(law.rules.find(r=>r.labelEn==='English applicability, formats and exact date scope').noteEn,/January 2027.*UNCONFIRMED/);
 assert.equal(language(resolve(51),{...profile.language,testDate:'2025-08-31'}).status,'fail');assert.equal(language(resolve(51),profile.language).status,'pass');
 for(const n of [19,27,44,52]){const x=resolve(n),r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,6);assert.equal(r.tests.toefl_120.total,80);assert.equal(r.tests.toefl_6.total,4.5);assert.equal(r.tests.toefl_120.atHomeAccepted,undefined);}
});

test('Pharmacy streams preserve distinct degree alternatives and whole-course prices without pretending four checked routes',()=>{
 assert.match(academic(p(27)),/PHARMACY for Clinical Practice or Community Health.*Pharmaceutical Medicine or Generalist.*Science degree does not establish/);assert.equal(p(27).rules.some(r=>r.kind==='major'),false);assert.equal(matchProgramme(resolve(27),profile).status,'needs_confirmation');assert.equal(resolve(27,'PT','NONLOCAL').offerings[0].tuition,186300);assert.equal(resolve(27,'FT','LOCAL').offerings[0].tuition,283590);assert.equal(resolve(27,'PT','LOCAL').offerings[0].deadline,'2027-06-30');assert.equal(resolve(27,'PT','NONLOCAL').offerings[0].deadline,'2027-04-30');
});

test('Biomedical FT compulsory immersion and possible GBA attendance never become a compulsory PT surcharge or invented exclusion',()=>{
 const ft=resolve(44),pt=resolve(44,'PT');for(const x of [ft,pt]){assert.equal(x.scope,undefined);assert.equal(x.rules.filter(r=>r.labelEn.includes('immersion')||r.labelEn.includes('Immersion')).length,2);}
 const checks=x=>matchProgramme(x,profile).checks.filter(c=>c.kind==='manual');assert.equal(checks(ft).filter(c=>c.labelEn==='Full-time immersion and GBA attendance').length,1);assert.equal(checks(ft).filter(c=>c.labelEn==='Optional part-time immersion').length,0);assert.equal(checks(pt).filter(c=>c.labelEn==='Optional part-time immersion').length,1);assert.equal(checks(pt).filter(c=>c.labelEn==='Full-time immersion and GBA attendance').length,0);
 assert.match(ft.rules.find(r=>r.labelEn==='Full-time immersion and GBA attendance').noteEn,/COMPULSORY.*Greater Bay Area.*UNCONFIRMED/);assert.match(resolve(44,'PT','LOCAL').offerings[0].feeBasis,/OPT IN.*80000.*not a compulsory PT surcharge/);assert.equal(resolve(44,'PT','LOCAL').offerings[0].tuition,290000);assert.equal(resolve(44,'FT','NONLOCAL').offerings[0].tuition,370000);assert.match(academic(p(44)),/subject to University approval/);
});

test('Chinese Medicine retains archived stream-specific uncertainty, explicit language waivers and diploma alternatives',()=>{
 const x=resolve(49,'PT');assert.equal(x.academicYear,'2026/27');assert.equal(x.offerings[0].deadline,null);assert.equal(x.fieldStatus.deadline.status,'unknown');assert.equal(x.rules.some(r=>r.kind==='language'),false);assert.equal(x.rules.some(r=>r.kind==='major'),false);assert.match(x.rules.find(r=>r.labelEn==='Chinese and English readiness with explicit regulation waivers').noteEn,/G2\(b\).*TPG2\(d\).*WAIVED.*Chinese AND English/);assert.match(academic(x),/PLUS a recognised Chinese Medicine diploma.*PLUS a recognised acupuncture diploma.*Gynaecology is NOT OFFERED/);assert.match(x.offerings[0].deadlineNote,/27 March 2026.*24 April 2026.*NULL/);assert.equal(programmeTimeline(x,'2026-11-03').state,'dates_incomplete');assert.equal(x.offerings[0].tuition,170000);assert.equal(x.offerings[0].applicationFee,600);assert.match(x.rules.find(r=>r.labelEn==='Chosen clinical attachment and location').noteEn,/MAINLAND.*project-based/);assert.equal(matchProgramme(x,profile).status,'needs_confirmation');assert.throws(()=>resolve(49,'FT'));
});

test('conditional Clinical Research clearing and in-study Community Healthcare hours do not become unconditional entry claims',()=>{
 const x=resolve(51);assert.deepEqual(x.offerings[0].applicationRounds.map(r=>r.deadline),['2027-01-30','2027-03-30']);assert.match(x.offerings[0].deadlineNote,/21 May 2027.*SUBJECT TO PLACES/);assert.match(academic(x),/PREFERRED, not an exclusive.*IN PERSON/);assert.match(docs(x),/NO NUMERIC one-month.*31 AUGUST.*30 JUNE/);assert.equal(p(51).rules.some(r=>r.kind==='major'),false);
 assert.match(academic(p(52)),/600 hours.*DURING STUDY.*not 600 hours of pre-entry/);assert.match(docs(p(52)),/300-word.*TWO referees.*IF AVAILABLE.*conditional, not a universal licence/);assert.equal(resolve(52,'PT','LOCAL').offerings[0].tuition,210000);assert.equal(resolve(52,'FT','NONLOCAL').offerings[0].deadline,'2027-03-30');assert.equal(resolve(52,'FT','LOCAL').offerings[0].deadline,'2027-06-30');
});

test('programme document optionality and relative clocks remain exact instead of copying one medical checklist',()=>{
 assert.match(docs(p(19)),/TWO referee.*ONE MONTH FROM EMAIL NOTIFICATION/);assert.match(docs(p(24)),/14 CALENDAR DAYS FROM ACCOUNT CREATION.*BEFORE THE APPLICATION DEADLINE.*28 CALENDAR DAYS/);assert.match(docs(p(27)),/CV REQUIRED.*OPTIONAL.*ONE MONTH FROM APPLICATION DATE/);assert.match(docs(p(44)),/CV OPTIONAL.*OPTIONAL.*ONE MONTH FROM EMAIL NOTIFICATION/);assert.match(docs(p(49)),/FIVE WORKING DAYS.*without a stated universal numeric count/);assert.match(docs(p(51)),/CV REQUIRED.*OPTIONAL.*NO NUMERIC one-month/);assert.match(docs(p(52)),/rejects applicant-submitted notarised academic copies.*certified professional-registration evidence/);
 assert.equal(obs.pdfChecks.length,19);assert.ok(obs.pdfChecks.every(p=>p.textExtractable));assert.equal(obs.pdfChecks.reduce((n,p)=>n+p.renderedPages.length,0),14);assert.equal(obs.pdfChecks.filter(p=>p.renderedPages.length).length,11);
});

test('category timelines keep archived Law rounds and exact current local/non-local noon cutoffs',()=>{
 for(const cat of ['LOCAL','NONLOCAL'])assert.equal(programmeTimeline(resolve(24,'PT',cat),'2026-11-03').state,'deadline_passed');
 assert.equal(resolve(24,'PT','LOCAL').offerings[0].deadline,'2026-10-26');assert.equal(resolve(24,'PT','NONLOCAL').offerings[0].deadline,'2026-09-18');
 for(const plan of obs.applicantContextPlan){const o=store.get(plan.programmeId).offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));for(const cat of c.options){const x=resolveProgramme(store.get(plan.programmeId),routes,undefined,o.id,cat.id,contexts),date=cat.deadline;assert.equal(programmeTimeline(x,date,date+'T03:59:59.999Z').offerings[0].rounds.at(-1).state,cat.applicationOpen?'within_recorded_dates':'cutoff_ahead');assert.equal(programmeTimeline(x,date,date+'T04:00:00.000Z').offerings[0].rounds.at(-1).state,'cutoff_reached');}}
});

test('repeated temporary source migration preserves old parents and all prior route/context bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-medical-law-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,373);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,239);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-11-03');assert.equal(q.counts.reviewUnits,655);assert.equal(q.counts.nearCutoffUnits,5);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-03T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty mode/category choices survive actual API, saved restore and export without a complete-admission tier',async()=>{
 let visits=0;for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant?.id,query=new URLSearchParams({offering:o.id,...(cat?{applicant:cat}:{})}),res=await fetch(`${base}/api/programmes/${id}?${query}`,{headers:{Connection:'close'}});assert.equal(res.status,200);const d=await res.json(),saved=optionSnapshot(d,'2026-11-03T08:00:00.000Z');const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const item=(await rr.json()).items[0];assert.equal(item.status,'resolved');assert.deepEqual(item.programme.offerings,d.offerings);assert.equal(item.programme.selectedApplicant?.id,cat);
  const exp=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);assert.equal(exp.offerings[0].tuition,o.tuition);assert.equal(exp.offerings[0].deadline,o.deadline);assert.equal(exp.selectedOffering.id,o.id);assert.equal(exp.selectedApplicant?.id,cat);
  const response=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:cat?{[id]:cat}:{},filters:{school:'HK-HKU'}})});assert.equal(response.status,200);const m=(await response.json()).items.find(v=>v.id===id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');visits++;
 }assert.equal(visits,20);
});
test('API rejects unsupported non-local PT and never assigns the lone Local option by default',async()=>{
 const o=p(19).offerings[1],path=`${base}/api/programmes/${p(19).id}?offering=${o.id}`;const r=await fetch(path,{headers:{Connection:'close'}}),d=await r.json();assert.equal(r.status,200);assert.equal(d.applicantOptions.length,1);assert.equal(d.selectedApplicant,undefined);assert.equal(d.offerings[0].tuition,null);assert.equal(d.applicationTimeline.state,'applicant_required');assert.equal((await fetch(path+'&applicant='+o.id+'-NONLOCAL',{headers:{Connection:'close'}})).status,422);
});
