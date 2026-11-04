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
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-education-policy-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),records=obs.programmeIds.map(id=>store.get(id));
const profile={major:'English',degreeStatus:'graduated',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},testDate:'2025-09-01'}};
const academic=x=>x.rules.find(r=>r.labelEn==='Programme-specific academic and evidence conditions').noteEn;
const docs=x=>x.rules.find(r=>r.labelEn==='Exact supporting documents and relative timing').noteEn;
const resolve=(n,mode='FT',cat)=>{const oid=p(n).id+(n===14?'-2026-':'-2027-')+mode;return resolveProgramme(p(n),routes,undefined,oid,cat?oid+'-'+cat:undefined,contexts);};
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');

test('twelve existing identities gain eighteen options with separate route/category counts and no human-review claim',()=>{
 assert.equal(records.length,12);assert.equal(records.flatMap(p=>p.offerings).length,18);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,429);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.equal(store.all().filter(p=>p.universityId==='HK-HKU'&&p.verification==='programme_page_checked').length,93);assert.deepEqual(routeSummary(routes),{groups:28,routes:63,pageChecked:63,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:323,categories:650,peerReviewed:0});
 for(const x of records){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-31');assert.equal(batch.pilotProgrammeIds.includes(x.id),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===x.id))),false);assert.equal(x.rules.some(r=>['gpa','classification','experience'].includes(r.kind)),false);}
});

test('TESOL retains exact high scores, named degree/equivalence and per-exam online exclusions without a teaching-year gate',()=>{
 const x=resolve(12),r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,7);assert.equal(r.tests.ielts.componentMin,6.5);assert.equal(r.tests.toefl_120.total,94);assert.deepEqual(r.tests.toefl_120.componentMins,{writing:25});assert.equal(r.tests.toefl_6.total,5);assert.deepEqual(r.tests.toefl_6.componentMins,{writing:5});
 assert.equal(language(x,{...profile.language,total:6.5}).status,'fail');assert.equal(language(x,{...profile.language,components:{...profile.language.components,writing:6}}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:94,components:{writing:24},testDate:'2026-01-20'}).status,'fail');assert.equal(language(x,{type:'toefl_6',total:5,components:{writing:5},testDate:'2026-01-21'}).status,'pass');
 for(const t of Object.keys(r.tests))assert.equal(r.tests[t].atHomeAccepted,false);assert.equal(language(x,{...profile.language,atHome:true}).status,'fail');assert.equal(matchProgramme(x,profile).checks.find(c=>c.kind==='major').status,'pass');assert.match(academic(x),/not restricted to existing teachers/);
});

test('TESOL conditional second round never becomes a guaranteed selectable or currently open round',()=>{
 const x=resolve(12),o=x.offerings[0];assert.equal(o.tuition,null);assert.equal(o.applicationFee,780);assert.equal(o.applicationOpen,'2026-11-20');assert.equal(o.deadline,'2026-12-21');assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2026-12-21']);assert.match(o.deadlineNote,/Round2 is CONDITIONAL.*lateJanuary2027.*19February2027/);
 assert.equal(programmeTimeline(x,'2026-11-19').state,'not_yet_open');assert.equal(programmeTimeline(x,'2027-01-10').state,'deadline_passed');assert.equal(programmeTimeline(x,'2027-01-10').offerings[0].nextRoundId,null);assert.match(o.feeBasis,/UNDER REVIEW/);
});

test('MEd current 2027 evidence overrides the closed 2026 portal without carrying old specialism fees or inventing IB part-time paths',()=>{
 for(const m of ['FT','PT']){const x=resolve(13,m),o=x.offerings[0],r=x.rules.find(r=>r.kind==='language');assert.equal(o.academicYear,'2027/28');assert.equal(o.intake,'September 2027');assert.equal(o.deadline,'2027-02-01');assert.equal(o.applicationOpen,null);assert.equal(o.tuition,null);assert.equal(o.applicationFee,600);assert.match(o.feeBasis,/234,000\/249,000.*2026/);assert.equal(r.tests.ielts.total,6.5);assert.equal(r.tests.ielts.componentMin,6);assert.equal(r.tests.toefl_120.total,93);assert.equal(r.tests.toefl_6.total,4.5);assert.equal(r.tests.toefl_120.componentMins,undefined);assert.equal(x.fieldStatus.major.status,'unknown');assert.match(x.rules.find(r=>r.labelEn==='MEd field and mode availability').noteEn,/TCSL and TCLL are FT ONLY/);}
 assert.equal(p(13).offerings.length,2);assert.equal(routes.has(p(13).id),false);assert.equal(language(resolve(13),{...profile.language,total:6}).status,'fail');assert.equal(language(resolve(13),{...profile.language,total:6.5,components:{listening:6,reading:6,writing:6,speaking:6}}).status,'pass');
});

test('Audiology stays archived 2026, preserves unresolved annual/category basis and does not invent a new TOEFL scale or validity trigger',()=>{
 const x=resolve(14),o=x.offerings[0],r=x.rules.find(r=>r.kind==='language');assert.equal(o.academicYear,'2026/27');assert.equal(o.intake,'2026 entry (start month unconfirmed)');assert.equal(o.applicationOpen,'2025-12-10');assert.equal(o.deadline,'2026-04-02');assert.equal(programmeTimeline(x,'2026-10-31').state,'deadline_passed');assert.equal(o.tuition,null);assert.equal(x.applicantOptions,undefined);assert.match(o.feeBasis,/47,000.*49,500.*224,000.*unconfirmed/);assert.equal(r.tests.toefl_6,undefined);assert.equal(r.testDateNotBefore,undefined);assert.equal(r.validityMonths,undefined);assert.equal(x.fieldStatus.language.status,'unknown');assert.equal(language(x,{type:'toefl_6',total:6,testDate:'2026-01-21'}).status,'unknown');assert.equal(matchProgramme(x,{...profile,major:'Computer Science'}).checks.some(c=>c.kind==='major'&&c.status==='fail'),false);assert.throws(()=>resolve(14,'PT'));
});

test('Education reference letters remain optional and personal document clocks do not inherit another faculty checklist',()=>{
 for(const n of [12,13,14]){assert.match(docs(p(n)),/reference letter is NOT REQUIRED/i);assert.match(docs(p(n)),/FOUR WEEKS.*account/i);assert.equal(p(n).rules.some(r=>r.labelEn==='Two mandatory referees'),false);}
 assert.match(docs(p(60)),/ONE-PAGE.*TWO PAGES.*TWO.*TWO WEEKS/);assert.match(docs(p(20)),/ONE WEEK.*ONE MONTH/);assert.match(docs(p(61)),/FOUR WEEKS.*ONE WEEK/);assert.match(docs(p(96)),/personal statement.*CV/);assert.match(docs(p(50)),/optional.*Naming legends|filename.*requiredCV|Naming legends|file-naming legend/);
});

test('MGP and SLG work-year preferences, and Population/SDA academic preferences, cannot become mandatory failures',()=>{
 for(const n of [60,98]){const x=resolve(n,'FT',n===98?'LOCAL':undefined),m=matchProgramme(x,{...profile,experienceYears:0});assert.equal(m.checks.some(c=>c.mandatory!==false&&c.status==='fail'),false);assert.equal(x.rules.find(r=>r.labelEn==='Preferred relevant professional experience').mandatory,false);assert.equal(x.rules.some(r=>r.kind==='experience'),false);}
 for(const n of [95,96]){const x=resolve(n),m=matchProgramme(x,{...profile,major:'Fine Art',experienceYears:0});assert.equal(x.rules.some(r=>r.kind==='major'),false);assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.equal(m.status,'needs_confirmation');assert.match(academic(x),/PREFERRED/);}
 assert.equal(resolve(60).offerings[0].tuition,320000);assert.throws(()=>resolve(60,'PT'));
});

test('MPA exceptional non-bachelor entry remains assessed and optional mainland study never excludes all ordinary applicants',()=>{
 const x=resolve(61),m=matchProgramme(x,{...profile,degreeStatus:'other'});assert.equal(x.rules.some(r=>r.kind==='degree'),false);assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.match(academic(x),/exceptional non-bachelor.*qualifying examination/);assert.match(academic(x),/optional/);assert.equal(x.scope,undefined);
 for(const n of [20,61])for(const mode of ['FT','PT']){const o=resolve(n,mode).offerings[0];assert.equal(o.tuition,298000);assert.equal(o.applicationFee,780);assert.equal(o.duration,mode==='FT'?'1 year':'2 years');assert.match(o.feeBasis,/not annual298,000 multiplied/);}
});

test('China Development title/2027 fee and date do not borrow the old PDF or compulsory-field-trip status',()=>{
 for(const mode of ['FT','PT']){const x=resolve(48,mode),o=x.offerings[0];assert.equal(x.name,'Master of China Development Studies');assert.equal(o.intake,'September 2027');assert.equal(o.tuition,250000);assert.equal(o.applicationFee,null);assert.equal(o.applicationOpen,'2026-11-02');assert.equal(o.deadline,'2027-04-30');assert.match(o.feeBasis,/2x125,000 or4x62,500/);assert.match(docs(x),/September2026.*fee600.*15May2026/);assert.match(x.rules.find(r=>r.labelEn==='Elective field trip and programme identity').noteEn,/GEOG7116.*ELECTIVES/);assert.equal(x.scope,undefined);}
 assert.match(academic(p(48)),/weekday morning\/afternoon/);assert.match(academic(p(22)),/weekday daytime/);assert.equal(resolve(22,'PT').offerings[0].tuition,280000);assert.equal(resolve(22).offerings[0].deadline,'2027-04-30');
});

test('Population application-opening label and quantitative readiness do not replace the actual September intake',()=>{
 const o=resolve(95).offerings[0];assert.equal(o.intake,'September 2027');assert.equal(o.applicationOpen,'2026-10-08');assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2026-11-30','2027-01-11','2027-03-01']);assert.match(o.deadlineNote,/mislabels.*intake/);assert.deepEqual(resolve(96).offerings[0].applicationRounds.map(r=>r.deadline),['2026-12-01','2027-01-04','2027-03-01']);assert.equal(resolve(96).offerings[0].tuition,265000);
 assert.equal(resolve(50).offerings[0].tuition,360000);assert.equal(resolve(50).offerings[0].deadline,'2026-12-31');assert.match(resolve(50).offerings[0].deadlineNote,/FIRST ROUND.*not established as the final/);assert.equal(resolve(50).offerings[0].applicationFee,null);assert.equal(p(50).rules.some(r=>r.kind==='classification'),false);
});

test('SLG mode/category dates survive unknown PT tuition and unresolved noon-versus-midnight precision without default categories',()=>{
 for(const mode of ['FT','PT']){const bare=resolve(98,mode);assert.equal(bare.offerings[0].tuition,null);assert.equal(bare.offerings[0].deadline,null);assert.equal(programmeTimeline(bare,'2026-10-31').state,'applicant_required');
  for(const [cat,date] of [['LOCAL','2027-03-31'],['NONLOCAL','2027-03-01']]){const x=resolve(98,mode,cat),o=x.offerings[0];assert.equal(o.tuition,mode==='FT'?300000:null);assert.equal(o.applicationFee,780);assert.equal(o.deadline,date);assert.equal(o.applicationRounds[0].deadlineAt,null);assert.match(o.deadlineNote,/NOON|noon/);assert.match(o.deadlineNote,/12:00AM/);for(const instant of [date+'T03:59:59.999Z',date+'T04:00:00.000Z']){const t=programmeTimeline(x,date,instant);assert.equal(t.offerings[0].rounds[0].state,'deadline_today');assert.equal(t.livePortalChecked,false);}assert.equal(x.fieldStatus.tuition.status,'unknown');}
 }
 assert.match(resolve(98,'PT','LOCAL').offerings[0].feeBasis,/300,000.*150,000|300,000.*150,000/);assert.equal(obs.applicantContextPlan.length,2);
});

test('nullable category tuition is explicit, source-bound and distinct from zero; malformed numbers or absent properties remain invalid',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gradpath-null-category-')),file=join(dir,'categories.json'),slg=read('data/applicant-contexts.json').contexts.find(c=>c.programmeId===p(98).id&&c.mode==='Part-time'),fixture={schemaVersion:1,checkedOn:'2026-10-31',contexts:[slg]};
 try{writeFileSync(file,JSON.stringify(fixture));const idx=loadApplicantContexts(file,store.all(),routes),x=resolveProgramme(p(98),routes,undefined,slg.offeringId,slg.options[0].id,idx);assert.equal(x.offerings[0].tuition,null);assert.equal(x.offerings[0].deadline,'2027-03-31');assert.equal(x.offerings[0].feeEvidence.sourceUrl,slg.feeSourceUrl);
  for(const mutate of [o=>delete o.tuition,o=>o.tuition='300000',o=>o.tuition=-1,o=>o.tuition={},o=>o.currency=null,o=>o.feeBasis='']){const f=structuredClone(fixture);mutate(f.contexts[0].options[0]);writeFileSync(file,JSON.stringify(f));assert.throws(()=>loadApplicantContexts(file,store.all(),routes));}
  const zero=structuredClone(fixture);zero.contexts[0].options[0].tuition=0;writeFileSync(file,JSON.stringify(zero));const z=loadApplicantContexts(file,store.all(),routes);assert.equal(resolveProgramme(p(98),routes,undefined,slg.offeringId,slg.options[0].id,z).offerings[0].tuition,0);
 }finally{rmSync(file,{force:true});rmdirSync(dir);}
});

test('ordinary exact noon transitions and programme-specific English date anchors do not claim portal availability',()=>{
 for(const x of records){if(x.id!==p(14).id){assert.equal(language(x,{...profile.language,testDate:'2025-08-31'}).status,'fail');assert.equal(language(x,{type:'waiver'}).status,'unknown');}for(const o of x.offerings){if(x.id===p(98).id)continue;for(const r of o.applicationRounds){assert.equal(r.deadlineAt,r.deadline+'T12:00:00+08:00');const y=resolve(Number(x.id.slice(-3)),o.mode==='Part-time'?'PT':'FT');const a=programmeTimeline(y,r.deadline,r.deadline+'T03:59:59.999Z'),b=programmeTimeline(y,r.deadline,r.deadline+'T04:00:00.000Z');assert.equal(a.offerings[0].rounds.find(v=>v.id===r.id).state,r.applicationOpen?'within_recorded_dates':'cutoff_ahead');assert.equal(b.offerings[0].rounds.find(v=>v.id===r.id).state,'cutoff_reached');assert.equal(b.livePortalChecked,false);}}}
 assert.equal(obs.pdfChecks.length,23);assert.equal(obs.pdfChecks.reduce((n,p)=>n+p.renderedPages.length,0),11);assert.equal(obs.pdfChecks.filter(p=>p.renderedPages.length).length,8);
});

test('temporary database upgrades preserve unrelated prior records and both new exact category fingerprints',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-education-policy-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,429);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,323);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 for(const plan of obs.applicantContextPlan){const o=p(98).offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,815);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty mode/category combinations preserve unknown prices and exact choices through real API matching, saved restore and export',async()=>{
 let visits=0;for(const x of records)for(const o of x.offerings){const cats=x.id===p(98).id?['LOCAL','NONLOCAL']:[undefined];for(const cat of cats){const query=new URLSearchParams({offering:o.id,...(cat?{applicant:o.id+'-'+cat}:{})}),response=await fetch(`${base}/api/programmes/${x.id}?${query}`);assert.equal(response.status,200);const d=await response.json(),saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z');
  const restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,d.offerings[0].tuition);assert.equal(item.programme.offerings[0].deadline,d.offerings[0].deadline);
  const exp=shortlistExport([d],{[x.id]:saved}).programmes[0];assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);assert.equal(exp.offerings[0].tuition,d.offerings[0].tuition);assert.equal(exp.selectedOffering.id,o.id);assert.equal(exp.selectedApplicant?.id,cat?o.id+'-'+cat:undefined);if(x.id===p(98).id&&o.mode==='Part-time')assert.equal(exp.offerings[0].tuition,null);
  const matched=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[x.id]:o.id},selectedApplicants:cat?{[x.id]:o.id+'-'+cat}:{},filters:{school:'HK-HKU'}})});assert.equal(matched.status,200);const m=(await matched.json()).items.find(v=>v.id===x.id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');visits++;
 }}assert.equal(visits,20);
});
