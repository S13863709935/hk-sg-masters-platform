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
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8')),batch=read('data/checked-programmes.json'),obs=read('data/research/lingnan-arts-social-observation-2026-11-03.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)},store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-LU-P${String(n).padStart(3,'0')}`),profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,testDate:'2026-05-01',singleAttempt:true}};
const selected=(n,index=0,cat)=>{const o=p(n).offerings[index];return resolveProgramme(p(n),routes,undefined,o.id,cat?o.id+'-'+cat:undefined,contexts);};
const note=(n,label)=>p(n).rules.find(r=>r.labelEn===label)?.noteEn,academic=n=>note(n,'Programme academic and preparatory conditions'),docs=n=>note(n,'Documents, referees and personal timing');
const language=(n,evidence,index=0)=>matchProgramme(selected(n,index),{...profile,language:evidence}).checks.find(c=>c.kind==='language');
const choices=()=>obs.programmeIds.flatMap(id=>store.get(id).offerings.flatMap(o=>{const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);return(plan?plan.options:[undefined]).map(c=>resolveProgramme(store.get(id),routes,undefined,o.id,c?.id,contexts));}));

test('eighteen existing arts/social identities produce forty-one modes/terms and forty-nine explicit choices without degree inflation',()=>{
 assert.equal(obs.programmeIds.length,18);assert.equal(choices().length,49);assert.equal(obs.programmeIds.flatMap(id=>store.get(id).offerings).length,41);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,373);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:18,routes:43,pageChecked:43,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:239,categories:478,peerReviewed:0});assert.equal(p(1).lastChecked,'2026-10-23');
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.lastChecked,'2026-11-03');assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>['gpa','experience','classification'].includes(r.kind)),false);assert.equal(routes.has(id),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
});

test('translation rename keeps P018 and its previous title while the conflicting history approval/instruction remains explicit',()=>{
 assert.equal(p(18).name,'Master of Arts in Language, Communication, and Technology');assert.match(academic(18),/former Translation Studies.*2027\/28/);assert.match(academic(18),/copied application paragraph still says proposed\/pending/);assert.match(p(18).officialUrl,/lit\/programmes\/malct$/);assert.equal(store.all().filter(x=>x.universityId==='HK-LU'&&/Language, Communication, and Technology/.test(x.name)).length,1);
 assert.equal(p(16).name,'Master of Arts in Digital History in Global Asia');assert.match(academic(16),/same|One existing degree identity/);assert.match(academic(16),/UNCONFIRMED/);assert.equal(p(16).fieldStatus.language.status,'unknown');assert.match(note(16,'Language applicability, instruction and test versions'),/English\/PUTONGHUA/);assert.match(selected(16).offerings[0].feeBasis,/PT 80,000.*annual-versus-total/);assert.equal(selected(16).offerings[0].tuition,null);
});

test('Chinese old TOEFL60, creative IELTS6.5 and low English thresholds stay programme-specific',()=>{
 assert.equal(p(12).rules.find(r=>r.kind==='language').tests.toefl_120.total,60);assert.equal(language(12,{type:'toefl_120',total:60,testDate:'2026-01-20',singleAttempt:true}).status,'pass');
 for(const n of [13,14]){assert.equal(language(n,{...profile.language,total:6}).status,'fail');assert.equal(language(n,profile.language).status,'pass');}
 for(const n of [20,34]){assert.equal(p(n).rules.find(r=>r.kind==='language').tests.ielts.total,5.5);assert.equal(p(n).rules.find(r=>r.kind==='language').tests.toefl_120.total,46);assert.match(academic(n),/CHINESE/);}
 assert.match(academic(15),/IELTS 7.*NOT.*IELTS 6/);assert.match(academic(13),/GPA 3.5.*not/);assert.match(academic(43),/GPA 3.50.*scholarships/);
});

test('only explicit TOEFL versions are automated; admission-source conflicts and future submission validity remain unresolved',()=>{
 for(const n of [16,18,40,41,43]){assert.equal(language(n,{type:'toefl_6',total:4,testDate:'2026-01-21',singleAttempt:true},n===40?2:0).status,'pass');}
 assert.equal(p(15).rules.find(r=>r.kind==='language').tests.toefl_6,undefined);assert.match(note(15,'Language applicability, instruction and test versions'),/4.0 without an explicit.*boundary/);assert.equal(p(35).fieldStatus.language.status,'unknown');assert.match(note(35,'Language applicability, instruction and test versions'),/CONFLICT.*6.0.*6.5/);assert.equal(p(39).fieldStatus.language.status,'unknown');assert.match(note(39,'Language applicability, instruction and test versions'),/SUBJECT TO SENATE APPROVAL.*One Skill Retake/);
 for(const id of obs.programmeIds){const r=store.get(id).rules.find(r=>r.kind==='language');assert.equal(r.validityMonths,undefined);assert.equal(r.testDateNotBefore,undefined);}assert.equal(language(14,{...profile.language,atHome:true}).status,'fail');
});

test('broad backgrounds, conditional pre-entry study, concentration evidence and preferred experience do not become universal hard gates',()=>{
 assert.match(academic(11),/no prior AI, technical or strong mathematical background/);assert.match(academic(41),/CONVERSION.*with or without psychology/);assert.match(academic(44),/statistics training is NOT REQUIRED/);assert.match(academic(35),/ALTERNATIVE pathway.*without a numeric/);assert.match(academic(40),/two modules totalling 60 hours/);assert.match(academic(14),/one art-history elective after entry/);assert.match(academic(20),/FALL INTAKE ONLY/);assert.match(academic(39),/BASIC COMPUTING KNOWLEDGE.*only PREFERRED/);
 assert.equal(p(12).offerings.length,1);assert.equal(p(17).offerings.length,1);assert.match(academic(12),/NOT been accepted since AY2018\/19/);assert.match(academic(42),/OTHER BACKGROUNDS.*PREFERENCE/);
});

test('mode fee bases and old-year tables are not annual amounts or per-course prices mislabelled as guaranteed totals',()=>{
 assert.equal(selected(11,0).offerings[0].tuition,200000);assert.equal(selected(11,1,'LOCAL').offerings[0].tuition,200000);assert.equal(selected(11,1,'LOCAL').offerings[0].tuitionEstimate,true);assert.equal(p(11).offerings[1].tuition,null);assert.deepEqual(selected(11,1).applicantOptions.map(x=>x.id),['HK-LU-P011-2027-PT-LOCAL']);assert.throws(()=>selected(11,1,'NONLOCAL'));
 assert.equal(selected(14,1).offerings[0].tuition,168000);assert.match(selected(14,1).offerings[0].feeBasis,/ANNUAL HKD 84,000 × 2 = HKD 168,000/);assert.equal(selected(19,1).offerings[0].tuition,180000);assert.equal(selected(15,1).offerings[0].tuition,null);assert.match(selected(15,1).offerings[0].feeBasis,/do NOT infer HKD 356,000/);
 for(const n of [13,39])for(const o of p(n).offerings){assert.equal(o.tuition,null);assert.match(o.feeBasis,/2026[-/]27|2026\/27/);}assert.equal(selected(40,3).offerings[0].tuition,null);assert.match(selected(40,3).offerings[0].feeBasis,/17,800 PER COURSE/);assert.equal(selected(41).offerings[0].tuition,178000);assert.match(selected(41).offerings[0].feeBasis,/ONWARDS.*varies-by-year/);
});

test('Economics local/non-local amounts bind each exact study mode instead of choosing an applicant classification automatically',()=>{
 for(const n of [34,35])for(const index of [0,1]){assert.equal(selected(n,index).offerings[0].tuition,null);assert.equal(programmeTimeline(selected(n,index),'2026-11-03').state,'applicant_required');assert.equal(selected(n,index,'LOCAL').offerings[0].tuition,150000);assert.equal(selected(n,index,'NONLOCAL').offerings[0].tuition,270000);assert.equal(selected(n,index,'NONLOCAL').offerings[0].deadline,'2027-05-31');}
 for(const plan of obs.applicantContextPlan){const o=store.get(plan.programmeId).offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));}
});

test('unknown non-local category cutoffs keep known tuition while the documented local July date remains independently usable',()=>{
 for(const n of [42,44])for(const i of [0,1]){const a=selected(n,i,'NONLOCAL'),b=selected(n,i,'LOCAL');assert.equal(a.offerings[0].deadline,null);assert.equal(a.offerings[0].tuition,n===42?160000:181500);assert.equal(programmeTimeline(a,'2026-11-03').state,'dates_incomplete');assert.equal(b.offerings[0].deadline,'2027-07-31');assert.equal(programmeTimeline(b,'2026-11-03').state,'within_recorded_dates');assert.match(a.offerings[0].deadlineNote,/15 June.*30 June.*NULL/);assert.equal(programmeTimeline(selected(n,i),'2026-11-03').state,'applicant_required');}
 for(const i of [0,1]){assert.equal(selected(19,i).offerings[0].deadline,null);assert.match(selected(19,i).offerings[0].deadlineNote,/30 June 2027.*31 December 2026/);assert.equal(programmeTimeline(selected(19,i),'2026-11-03').state,'dates_incomplete');}
});

test('explicit null category dates are supported without accepting omitted, malformed, out-of-order or inconsistent round dates',()=>{
 const dir=mkdtempSync(join(tmpdir(),'gradpath-null-category-date-')),file=join(dir,'contexts.json'),source=read('data/applicant-contexts.json'),record=source.contexts.find(x=>x.programmeId==='HK-LU-P042');
 try{const make=()=>({schemaVersion:1,checkedOn:'2026-11-03',contexts:[structuredClone(record)]});let b=make();b.contexts[0].options[1].applicationOpen=null;writeFileSync(file,JSON.stringify(b));assert.equal(loadApplicantContexts(file,store.all(),routes).size,1);
 for(const mutate of [o=>delete o.deadline,o=>o.deadline='',o=>o.deadline='2027-02-30',o=>o.applicationOpen='2027-02-30',o=>{o.deadline='2027-01-01';o.applicationOpen='2027-01-02';},o=>o.applicationRounds=[{id:'FINAL',label:'Invalid conflict substitute',applicationOpen:null,deadline:'2027-06-30',deadlineAt:null}]]){b=make();mutate(b.contexts[0].options[1]);writeFileSync(file,JSON.stringify(b));assert.throws(()=>loadApplicantContexts(file,store.all(),routes));}}
 finally{rmSync(file,{force:true});rmdirSync(dir);}
});

test('MLS and psychology terms preserve their own year, cutoffs and requirement applicability',()=>{
 assert.deepEqual(p(20).offerings.map(o=>[o.academicYear,o.deadline,o.tuition]),[['2026/27','2026-11-30',188000],['2027/28','2027-07-30',null],['2027/28','2027-11-30',null]]);assert.match(docs(20),/2026–27 application portal/);assert.equal(matchProgramme(selected(20,1),profile).checks.some(c=>c.kind==='language'),false);assert.match(selected(20,2).offerings[0].intake,/Term 2, 2027\/28/);
 assert.equal(p(40).offerings.length,6);assert.equal(programmeTimeline(selected(40,0),'2026-11-03').state,'deadline_passed');assert.equal(matchProgramme(selected(40,0),profile).checks.some(c=>c.kind==='language'),false);assert.equal(selected(40,2).offerings[0].tuition,178000);assert.equal(selected(40,0).offerings[0].tuition,null);assert.equal(selected(40,4).offerings[0].applicationOpen,'2027-06-16');
 assert.equal(p(41).offerings.length,4);assert.equal(selected(41,0).offerings[0].applicationOpen,'2026-10-16');assert.equal(selected(41,2).offerings[0].deadline,'2027-10-15');assert.match(selected(41,2).offerings[0].deadlineNote,/applicability conflict/);
});

test('statement and reference requirements retain distinct word/page limits, counts, submission methods and clocks',()=>{
 assert.match(docs(11),/200–300 words.*IF ANY/);assert.match(docs(14),/500–1,200 words.*ADVISED/);assert.match(docs(15),/at least ONE/i);assert.match(docs(15),/official transcript directly/);assert.match(docs(42),/TWO A4 PAGES.*TWO recommendation letters/);assert.match(docs(43),/TWO referees.*sealed originals.*OR upload/);for(const n of [34,35])assert.match(docs(n),/14 DAYS.*NOT read\/upload/);assert.match(docs(20),/SEALED POST.*NO LATER THAN THE OFFICIAL PROGRAMME DEADLINE/);for(const n of [17,40,41])assert.match(docs(n),/IF ANY/);
});

test('MADES exact-looking hours have no fabricated timezone, and optional overseas awards do not exclude ordinary programmes',()=>{
 for(const o of p(15).offerings){assert.equal(o.applicationRounds,undefined);assert.match(o.deadlineNote,/6:00 AM.*6:00 PM.*no explicit timezone/);}for(const n of [35,40]){assert.notEqual(p(n).scope?.status,'out_of_scope');assert.match(note(n,'Optional double degree is a separate choice'),/Only the ordinary Hong Kong/);}assert.match(selected(12).offerings[0].feeBasis,/175,000.*600.*700/);assert.match(selected(34,0,'NONLOCAL').offerings[0].feeBasis,/6,700/);
});

test('coverage and retrieval evidence distinguish remaining leads, failed old URLs and partial observations',()=>{
 const b=loadSchoolBacklog('2026-11-04');assert.equal(b.counts.pageCheckedRecords,373);assert.equal(b.counts.catalogueLeads,500);assert.equal(b.counts.unreadLeads,485);const lu=b.schools.find(s=>s.schoolId==='HK-LU');assert.equal(lu.catalogueRecords,44);assert.equal(lu.pageCheckedRecords,44);assert.equal(lu.unreadLeads,0);assert.equal(lu.activeParentNotPublishedFields.gpa,44);
 assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-lingnan-gs-remainder.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-lingnan-gs-remainder.md',root),'utf8').replaceAll('\r\n','\n'));assert.equal(obs.sourceRetrievals.length,119);assert.equal(obs.sourceRetrievals.filter(s=>s.status===200&&s.contentReadable).length,117);assert.equal(obs.sourceRetrievals.filter(s=>s.error?.includes('404')).length,2);assert.equal(obs.limits.completeRequirements,0);assert.equal(obs.limits.livePortalChecked,false);
});

test('temporary repeated imports preserve all prior parents and validate every context fingerprint without using the daily database',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-lingnan-arts-social-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,373);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,239);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-03T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all forty-nine term/mode/category choices survive real APIs, matching, saved restore and export including unresolved dates',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant?.id,q=new URLSearchParams({offering:o.id,...(cat?{applicant:cat}:{})}),r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json(),saved=optionSnapshot(d,'2026-11-03T08:00:00.000Z');const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].deadline,o.deadline);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
 const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:cat?{[id]:cat}:{},filters:{school:'HK-LU'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);}
});
