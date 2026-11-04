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
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8')),batch=read('data/checked-programmes.json'),obs=read('data/research/lingnan-business-data-observation-2026-11-03.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)},store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-LU-P${String(n).padStart(3,'0')}`),profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,testDate:'2026-05-01',singleAttempt:true}};
const selected=(n,index=0,cat)=>{const o=p(n).offerings[index];return resolveProgramme(p(n),routes,undefined,o.id,cat?o.id+'-'+cat:undefined,contexts);};
const note=(n,label)=>p(n).rules.find(r=>r.labelEn===label)?.noteEn,academic=n=>note(n,'Programme academic and preparatory conditions'),docs=n=>note(n,'Documents, referees and personal timing');
const lang=(n,evidence)=>matchProgramme(selected(n),{...profile,language:evidence}).checks.find(c=>c.kind==='language');
const choices=()=>obs.programmeIds.flatMap(id=>store.get(id).offerings.flatMap(o=>{const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);return(plan?plan.options:[undefined]).map(c=>resolveProgramme(store.get(id),routes,undefined,o.id,c?.id,contexts));}));

test('fifteen existing Lingnan IDs add seventeen options and four contexts without degree or review inflation',()=>{
 assert.equal(obs.programmeIds.length,15);assert.equal(obs.programmeIds.flatMap(id=>store.get(id).offerings).length,17);assert.equal(choices().length,21);const q=store.quality();assert.equal(q.total,873);assert.equal(q.checked,429);assert.equal(q.browsable,865);assert.equal(q.complete,0);assert.equal(q.peerReviewed,0);assert.equal(q.outOfScope,7);
 assert.deepEqual(routeSummary(routes),{groups:28,routes:63,pageChecked:63,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:323,categories:650,peerReviewed:0});assert.equal(p(1).lastChecked,'2026-10-23');
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.lastChecked,'2026-11-03');assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);assert.equal(routes.has(id),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
});

test('Chinese ATB/BIE scores remain distinct from English-taught thresholds and never establish Chinese readiness',()=>{
 for(const n of [24,25]){const r=p(n).rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,5.5);assert.equal(r.tests.toefl_120.total,46);assert.equal(r.tests.toefl_6,undefined);assert.match(academic(n),/CHINESE/);assert.equal(lang(n,{...profile.language,total:5.5}).status,'pass');assert.equal(lang(n,{type:'toefl_120',total:46,testDate:'2026-01-20',singleAttempt:true,atHome:true}).status,'fail');}
 for(const n of [10,22,23,27,29,31,33,37,38])assert.equal(p(n).rules.find(r=>r.kind==='language').tests.ielts.total,6);
 for(const n of [22,23,27,33,38])assert.equal(lang(n,{type:'toefl_6',total:4,testDate:'2026-01-21',singleAttempt:true}).status,'pass');
});

test('preparation, explicit related fields and experience preferences do not become universal degree or work-year exclusions',()=>{
 assert.equal(matchProgramme(selected(10),profile).checks.find(c=>c.kind==='major').status,'pass');assert.match(academic(10),/MUST PASS.*BEFORE formal admission/);assert.equal(matchProgramme(selected(33),profile).checks.find(c=>c.kind==='major').status,'pass');assert.match(academic(33),/PREFERENCE.*mandatory numeric minimum/);
 assert.match(academic(29),/30-hour Introduction to Business/);assert.match(academic(25),/Economics and\/or Marketing/);assert.match(academic(38),/BEFORE ENROLMENT/);
 const hr=note(31,'Mainstream versus HRADT preparatory scope');assert.match(hr,/HRADT requires Python unless special approval.*HRM preparation is optional/);assert.match(academic(31),/Do not impose Python on mainstream/);
 for(const n of [10,25,29,31,33,37,38])assert.equal(matchProgramme(selected(n),profile).tier,null);
});

test('AAIS and IDAI January and September intakes retain their own years, prices and recorded rounds',()=>{
 for(const n of [22,33]){const jan=selected(n,0),fall=selected(n,1);assert.equal(jan.offerings[0].academicYear,'2026/27');assert.equal(jan.offerings[0].tuition,289000);assert.equal(jan.offerings[0].applicationOpen,null);assert.equal(jan.offerings[0].deadline,'2026-11-30');assert.equal(programmeTimeline(jan,'2026-11-03').state,'dates_incomplete');
  assert.equal(fall.offerings[0].academicYear,'2027/28');assert.equal(fall.offerings[0].tuition,293000);assert.equal(fall.offerings[0].applicationOpen,n===22?'2026-09-01':'2026-08-01');assert.deepEqual(fall.offerings[0].applicationRounds.map(r=>r.deadline),['2027-04-30','2027-06-30']);assert.ok(fall.offerings[0].applicationRounds.every(r=>r.deadlineAt===null));assert.equal(fall.offerings[0].applicationRounds[1].applicationOpen,null);assert.equal(programmeTimeline(fall,'2026-11-03').state,'within_recorded_dates');}
 assert.equal(selected(38).offerings[0].applicationOpen,'2026-08-24');assert.equal(selected(36).offerings[0].duration,'1 year (10 months)');
});

test('conflicting eBSCM dates and old eBSCM/Finance fee tables stay unresolved rather than borrowing a newer sibling',()=>{
 const e=selected(28);assert.equal(e.offerings[0].tuition,null);assert.equal(e.offerings[0].deadline,null);assert.equal(e.fieldStatus.deadline.status,'unknown');assert.match(e.offerings[0].deadlineNote,/30 June 2027.*31 July 2027.*NULL/);assert.equal(programmeTimeline(e,'2026-11-03').state,'dates_incomplete');assert.equal(selected(30).offerings[0].tuition,null);assert.match(selected(30).offerings[0].feeBasis,/2026\/27.*not reused/);
 const ida=selected(32);assert.equal(ida.offerings[0].deadline,'2027-06-30');assert.equal(ida.offerings[0].applicationOpen,'2026-08-01');assert.match(ida.offerings[0].deadlineNote,/30 Jun 2026|30Jun2026/);assert.equal(ida.fieldStatus.major.status,'unknown');assert.equal(ida.fieldStatus.language.status,'unknown');assert.equal(ida.rules.some(r=>r.kind==='language'||r.kind==='major'),false);assert.match(academic(32),/PROVISIONAL/);
});

test('four applicant contexts mask fees and dates until the exact Lingnan category is explicitly selected',()=>{
 for(const [n,local,nonlocal] of [[10,229000,315000],[31,208000,248000],[36,228000,278000],[37,208000,238000]]){const base=selected(n);assert.equal(base.offerings[0].tuition,null);assert.equal(base.offerings[0].deadline,null);assert.equal(base.selectedApplicant,undefined);assert.equal(programmeTimeline(base,'2026-11-03').state,'applicant_required');assert.equal(selected(n,0,'LOCAL').offerings[0].tuition,local);assert.equal(selected(n,0,'NONLOCAL').offerings[0].tuition,nonlocal);assert.equal(selected(n,0,'NONLOCAL').offerings[0].deadline,'2027-06-30');}
 for(const c of obs.applicantContextPlan){const o=store.get(c.programmeId).offerings.find(o=>o.id===c.offeringId),stored=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(stored.offeringFingerprint,offeringFingerprint(o));}
 for(const x of choices())assert.equal(x.offerings[0].applicationFee,400);
});

test('TOEFL version conflicts and submission-based validity remain manual instead of false precision',()=>{
 for(const n of [30,36]){assert.equal(p(n).rules.find(r=>r.kind==='language').tests.toefl_6,undefined);assert.equal(p(n).fieldStatus.language.status,'unknown');}
 assert.equal(p(30).rules.find(r=>r.kind==='language').tests.toefl_120,undefined);assert.match(note(30,'English applicability, versions and relative validity'),/26 JANUARY 2026.*21 JANUARY/);assert.match(note(36,'English applicability, versions and relative validity'),/21 Jan itself ambiguous/);
 assert.equal(lang(22,{...profile.language,atHome:true}).status,'fail');assert.equal(lang(22,{...profile.language,singleAttempt:false}).status,'unknown');
 for(const n of [10,22,23,24,27,29,31,33,37,38]){assert.equal(p(n).rules.find(r=>r.kind==='language').testDateNotBefore,undefined);assert.equal(p(n).rules.find(r=>r.kind==='language').validityMonths,undefined);}
 assert.match(note(23,'English applicability, versions and relative validity'),/PTE Academic 62.*59.*manually/);assert.equal(matchProgramme(selected(23),profile).status,'needs_confirmation');
});

test('referee methods, counts and clocks remain programme-specific, including unresolved older wording',()=>{
 for(const n of [23,27])assert.match(docs(n),/TWO referees.*THREE WEEKS OF APPLICATION.*personal-email/);
 for(const n of [24,25])assert.match(docs(n),/OAS.*WITHIN 14 DAYS.*post\/email is no longer/);
 assert.match(docs(28),/ONE MONTH AFTER ONLINE APPLICATION/);assert.match(docs(10),/TWO recommendation forms.*IF ANY.*conflict/);assert.match(docs(36),/14-day OAS.*sealed envelopes.*conflict/);assert.match(docs(31),/TWO confidential references.*No numeric relative deadline/);
});

test('ordinary GPA rules, optional dual awards and added fees are not mixed with scholarships or graduation targets',()=>{
 assert.match(academic(30),/DUAL DEGREE has GPA 3.0\/4.0.*none is imported/);assert.match(academic(10),/CGPA 2.67\/2.50.*not an undergraduate/);assert.match(academic(31),/Scholarship GPA 3.0.*not an admission/);assert.match(academic(37),/Scholarship GPA 3.5.*not undergraduate/);
 for(const n of [10,30]){assert.notEqual(p(n).scope?.status,'out_of_scope');assert.match(note(n,'Optional dual degree is a separate choice'),/OPTIONAL.*overseas partner.*separately/);}
 assert.match(selected(10,0,'LOCAL').offerings[0].feeBasis,/6,000 PER.*pre-entry.*400 is SEPARATE/);assert.match(selected(37,0,'NONLOCAL').offerings[0].feeBasis,/6,000.*4,000.*only if required/);assert.equal(selected(24).offerings[0].tuition,258000);assert.equal(selected(25).offerings[0].tuition,308000);
});

test('batch backlog and retrieval metadata preserve honest coverage instead of treating fetched pages as complete requirements',()=>{
 const b=loadSchoolBacklog('2026-11-04');assert.equal(b.counts.pageCheckedRecords,429);assert.equal(b.counts.catalogueLeads,444);assert.equal(b.counts.unreadLeads,429);const lu=b.schools.find(s=>s.schoolId==='HK-LU');assert.equal(lu.catalogueRecords,44);assert.equal(lu.pageCheckedRecords,44);assert.equal(lu.unreadLeads,0);assert.equal(lu.activeParentUnknownFields.gpa,0);assert.equal(lu.activeParentNotPublishedFields.gpa,44);
 assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-eduhk-aapsef.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-eduhk-aapsef.md',root),'utf8').replaceAll('\r\n','\n'));
 assert.equal(obs.sourceRetrievals.length,144);assert.ok(obs.sourceRetrievals.every(s=>s.contentReadable&&s.status===200&&/^[a-f0-9]{64}$/.test(s.sha256)));assert.equal(obs.limits.completeRequirements,0);assert.equal(obs.limits.pdfBrochuresUsed,false);assert.equal(obs.limits.livePortalChecked,false);
});

test('repeated temporary imports preserve every earlier parent and validate all current exact context bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-lingnan-business-data-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,429);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,323);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-03T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty-one intake/category choices survive actual matching, details, saved restoration and privacy-safe export',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant?.id,q=new URLSearchParams({offering:o.id,...(cat?{applicant:cat}:{})}),r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json(),saved=optionSnapshot(d,'2026-11-03T08:00:00.000Z');const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].deadline,o.deadline);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
 const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:cat?{[id]:cat}:{},filters:{school:'HK-LU'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);}
});
