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
const batch=read('data/checked-programmes.json'),obs=read('data/research/eduhk-fehd-observation-2026-11-04.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-EDUHK-P${String(n).padStart(3,'0')}`),route=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId.endsWith('-'+tag));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,testDate:'2026-05-01',singleAttempt:true}};
const chosen=(n,tag=null,mode='FT',category='NONLOCAL')=>{const x=tag?route(n,tag):p(n),o=x.offerings.find(o=>o.id.endsWith('-'+mode));return resolveProgramme(p(n),routes,x.routeId,o.id,category?o.id+'-'+category:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(o=>resolveProgramme(store.get(c.programmeId),routes,c.routeId||undefined,c.offeringId,o.id,contexts)));
const note=(x,label)=>x.rules.find(r=>r.labelEn===label)?.noteEn;

test('FEHD batch adds eleven existing identities, four language snapshots and forty-two exact choices',()=>{
 assert.equal(obs.programmeIds.length,11);assert.equal(obs.directoryRows.length,13);assert.equal(choices().length,42);assert.equal(obs.counts.newParentStudyOptions,16);assert.equal(obs.counts.newRouteStudyOptions,5);assert.equal(obs.applicantContextPlan.length,19);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,416);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:27,routes:61,pageChecked:61,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:303,categories:610,peerReviewed:0});
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.lastChecked,'2026-11-04');assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
 assert.equal(p(1).lastChecked,'2026-10-30');assert.equal(p(44).lastChecked,'2026-10-25');
});

test('English and Chinese EPM paths keep separate modes and language criteria before resolving category dates',()=>{
 assert.equal(route(49,'EN').offerings.length,2);assert.equal(route(49,'ZH').offerings.length,1);assert.equal(programmeTimeline(resolveProgramme(p(49),routes),'2026-11-04').state,'route_required');
 assert.throws(()=>resolveProgramme(p(49),routes,undefined,route(49,'EN').offerings[0].id),/specific route/);
 const en=chosen(49,'EN'),zh=chosen(49,'ZH');assert.equal(en.rules.find(r=>r.kind==='language').tests.ielts.total,6);assert.equal(zh.rules.some(r=>r.kind==='language'),false);
 const text=note(zh,'Chinese instruction and language evidence');assert.match(text,/Chinese is NOT an official language/);assert.match(text,/PSC Level 2B/);assert.match(text,/HSK Level 5.*EACH.*AND HSKK Advanced/);
 assert.equal(programmeTimeline(chosen(49,'EN','FT',null),'2026-11-04').state,'applicant_required');assert.equal(en.offerings[0].tuition,174200);assert.equal(zh.offerings[0].tuition,174200);assert.equal(en.offerings[0].tuitionEstimate,true);assert.equal(chosen(49,'EN','PT','LOCAL').offerings[0].tuition,174200);
 assert.throws(()=>resolveProgramme(p(49),routes,route(49,'ZH').routeId,route(49,'EN').offerings[0].id),/study option/);
});

test('all nineteen mode/language bindings keep category-specific fees, three rounds and unknown intraday cutoffs',()=>{
 for(const x of choices()){
  const o=x.offerings[0],local=o.applicantCategory.id.includes('-LOCAL'),t=programmeTimeline(x,'2026-11-04');
  assert.equal(o.applicationFee,local?400:500);assert.equal(o.applicationOpen,'2026-10-05');assert.equal(o.deadline,local?'2027-05-31':'2027-05-10');assert.equal(t.state,'within_recorded_dates');
  assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2027-01-04','2027-02-15',o.deadline]);assert.deepEqual(o.applicationRounds.map(r=>r.applicationOpen),['2026-10-05',null,null]);assert.ok(o.applicationRounds.every(r=>r.deadlineAt===null));
  assert.equal(programmeTimeline(x,'2027-01-04').offerings[0].rounds[0].state,'deadline_today');assert.equal(programmeTimeline(x,'2027-02-16').offerings[0].nextRoundId,'FINAL');
  assert.equal(programmeTimeline(x,local?'2027-06-01':'2027-05-11').state,'deadline_passed');
 }
 for(const plan of obs.applicantContextPlan){const x=plan.routeId?routes.get(plan.programmeId).find(r=>r.routeId===plan.routeId):store.get(plan.programmeId),o=x.offerings.find(o=>o.id===plan.offeringId),binding=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(binding.offeringFingerprint,offeringFingerprint(o));assert.match(binding.dateSourceUrl,/schedule_index/);}
});

test('unlabelled fee years stay numerically unknown while quoted local/bridge amounts remain visible',()=>{
 for(const x of choices()){const o=x.offerings[0];if(x.id===p(49).id){assert.equal(o.tuition,174200);assert.equal(o.tuitionEstimate,true);}else{assert.equal(o.tuition,null);assert.match(o.feeBasis,/fee panel does NOT explicitly label its academic year/);}}
 assert.match(chosen(13,null,'FT','LOCAL').offerings[0].feeBasis,/HKD 146,640/);assert.match(chosen(13).offerings[0].feeBasis,/HKD 183,300/);
 assert.match(chosen(59,'EN','FT','LOCAL').offerings[0].feeBasis,/displays HKD 160,000/);assert.match(chosen(59,'ZH','FT','LOCAL').offerings[0].feeBasis,/displays HKD 200,000/);
 assert.match(chosen(7,null,'PT').offerings[0].feeBasis,/HKD 184,200.*7,675 per credit/);assert.match(chosen(51).offerings[0].feeBasis,/628,074.*7,754 per credit/);
});

test('closed modes and related versions are not turned into current available options',()=>{
 assert.equal(p(13).offerings.length,1);assert.ok(p(13).offerings[0].id.endsWith('-FT'));assert.match(p(13).notesEn,/Xiqu and part-time study are NOT offered/);assert.equal(p(13).offerings.some(o=>/Xiqu/.test(o.intake)),false);
 assert.equal(p(53).offerings.length,1);assert.match(p(53).notesEn,/PT is NOT offered in 2027\/28/);assert.equal(p(26).offerings.length,2);assert.equal(p(23).directoryListing.variants.length,0);assert.match(p(23).notesEn,/English-medium.*NO ADMISSION/);
 for(const tag of ['EN','ZH']){assert.equal(route(59,tag).offerings.length,1);assert.equal(route(59,tag).offerings[0].duration,'1 year');}
 assert.equal(p(51).offerings[0].duration,'2 years (5 semesters)');
});

test('Chinese requirements and unknown Chinese proof are not replaced by generic English tests',()=>{
 for(const n of [13,23,26,53])assert.equal(p(n).rules.some(r=>r.kind==='language'),false);assert.equal(route(59,'ZH').rules.some(r=>r.kind==='language'),false);
 assert.match(note(p(13),'Chinese instruction and language evidence'),/BOTH.*HSK Level 6 OR equivalent/);
 for(const n of [26,53])assert.equal(p(n).fieldStatus.language.status,'unknown');assert.equal(route(59,'ZH').fieldStatus.language.status,'unknown');
 for(const x of [chosen(13),chosen(23),chosen(26),chosen(53),chosen(59,'ZH')])assert.equal(matchProgramme(x,profile).status,'needs_confirmation');
});

test('English old/new TOEFL boundary, explicit test-date floor and rejected online formats are independent checks',()=>{
 for(const x of [chosen(7),chosen(20),chosen(32),chosen(49,'EN'),chosen(51),chosen(56,null,'FT','NONLOCAL-NO-BRIDGE'),chosen(59,'EN')]){
  const lr=x.rules.find(r=>r.kind==='language');assert.equal(lr.testDateNotBefore,'2025-01-01');assert.equal(lr.validityMonths,undefined);assert.equal(lr.tests.toefl_120.validBefore,'2026-01-21');assert.equal(lr.tests.toefl_6.validFrom,'2026-01-21');
  const check=l=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
  assert.equal(check({type:'ielts',total:6.5,testDate:'2024-12-31',singleAttempt:true}).status,'fail');assert.equal(check({type:'ielts',total:6.5,testDate:'2025-01-01',singleAttempt:true}).status,'pass');
  assert.equal(check({type:'toefl_120',total:80,testDate:'2026-01-20',singleAttempt:true}).status,'pass');assert.equal(check({type:'toefl_6',total:4,testDate:'2026-01-21',singleAttempt:true}).status,'pass');
  assert.equal(check({...profile.language,atHome:true}).status,'fail');assert.equal(check({...profile.language,singleAttempt:false}).status,'unknown');
 }
 assert.match(note(p(56),'English alternatives, applicability and validity'),/does NOT list CET-6/);assert.match(note(p(32),'English alternatives, applicability and validity'),/CET-6 430/);
});

test('speech-language professional admission needs Chinese, Cantonese and both interview and test after English scores',()=>{
 const x=chosen(51);assert.equal(x.rules.some(r=>r.kind==='degree'),false);assert.match(note(x,'Programme academic and preparatory conditions'),/AND\/OR.*Qualification level\/equivalence/);
 assert.match(note(x,'Chinese evidence, Cantonese and selection test'),/HKDSE Level 3.*HKCEE E.*HKALE AS.*ALSO proficient Cantonese.*BOTH interview and test/);
 const m=matchProgramme(x,profile);assert.equal(m.checks.find(c=>c.kind==='language').status,'pass');assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);
});

test('psychology bridge has four explicit local/residency/course conditions per mode without automatic exemption',()=>{
 const records=obs.applicantContextPlan.filter(c=>c.programmeId===p(56).id);assert.equal(records.length,2);assert.ok(records.every(c=>c.options.length===4));
 for(const mode of ['FT','PT'])for(const local of ['LOCAL','NONLOCAL']){
  const base=chosen(56,null,mode,local+'-NO-BRIDGE'),bridge=chosen(56,null,mode,local+'-BRIDGE');assert.equal(base.offerings[0].tuition,null);assert.equal(bridge.offerings[0].tuition,null);
  assert.match(base.offerings[0].feeBasis,/displays HKD 183,960 without/);assert.match(bridge.offerings[0].feeBasis,/displays HKD 199,290 including/);assert.match(note(bridge,'Prior psychology course and mandatory bridge'),/required BEFORE.*outside the 36-credit/);assert.equal(matchProgramme(bridge,profile).status,'needs_confirmation');
 }
});

test('required, recommended and scholarship-only documents do not become one universal admissions checklist',()=>{
 assert.match(note(p(23),'Documents, referees and personal timing'),/500-1,000 words is REQUIRED/);assert.match(note(p(56),'Documents, referees and personal timing'),/requires a transcript showing Psychology.*RECOMMENDS.*up to 400.*not a mandatory/);
 assert.match(note(p(51),'Documents, referees and personal timing'),/Chinese examination evidence.*scholarship personal statement.*ADMITTED/);
 for(const tag of ['EN','ZH']){const x=route(59,tag);assert.match(note(x,'Documents, referees and personal timing'),/ONE recommendation.*not.*universal/);assert.match(note(x,'Language-specific specialisations and QTS'),/Neither version leads.*scholarship.*not an admissions gate/);assert.equal(x.rules.some(r=>r.kind==='experience'),false);}
 for(const n of [7,13,20,26])assert.match(p(n).notesEn,/prefer/i);assert.equal(p(13).rules.some(r=>r.kind==='experience'),false);
});

test('retrieval failures and later Schannel success remain separate from review and fresh-directory claims',()=>{
 assert.equal(obs.sourceRetrievals.length,38);const ok=obs.sourceRetrievals.filter(x=>x.contentReadable),failed=obs.sourceRetrievals.filter(x=>!x.contentReadable);assert.equal(ok.length,22);assert.equal(failed.length,16);
 assert.ok(ok.every(x=>x.status===200&&/^[a-f0-9]{64}$/.test(x.sha256)&&x.observedOn==='2026-11-04'));assert.ok(failed.every(x=>x.error&&!x.sha256&&!x.usedInRecords));assert.equal(obs.sourceRetrievals.find(x=>x.key==='directory-curl').contentReadable,false);
 assert.equal(obs.sourceRetrievals.filter(x=>x.format==='pdf').length,3);assert.deepEqual(obs.sourceRetrievals.find(x=>x.key==='prospectus-2027').pagesRead,[3,4]);assert.equal(obs.limits.centralGsDirectoryReadThisTurn,false);assert.equal(obs.limits.certificateVerificationDisabled,false);assert.equal(obs.limits.independentHumanReviews,0);
});

test('current FEHD backlog and maintenance snapshot reflect partial coverage without changing the twenty-ID core',()=>{
 const b=loadSchoolBacklog('2026-11-04'),s=b.schools.find(x=>x.schoolId==='HK-EDUHK');assert.equal(s.catalogueRecords,59);assert.equal(s.pageCheckedRecords,45);assert.equal(s.unreadLeads,14);assert.equal(s.completeRecords,0);
 assert.equal(b.counts.pageCheckedRecords,416);assert.equal(b.counts.unreadLeads,442);assert.equal(b.counts.catalogueLeads,457);assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-eduhk-aedi.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-eduhk-aedi.md',root),'utf8').replaceAll('\r\n','\n'));
 const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,780);assert.equal(q.counts.nearCutoffUnits,7);assert.equal(q.counts.staleApplicantContexts,0);assert.equal(batch.pilotProgrammeIds.length,20);
});

test('isolated repeated imports preserve prior parent objects, route identities and applicant bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-eduhk-fehd-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,416);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,27);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,303);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all forty-two choices retain source-bound language, fees and round dates through real APIs, matching, restore and export',async()=>{
 for(const x of choices()){
  const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})});
  const r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.offerings,x.offerings);const saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');
  const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(ex.offerings[0].applicationRounds,o.applicationRounds);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat},filters:{school:'HK-EDUHK'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);
 }
});

test('a category from another language path is rejected rather than silently replacing fees',async()=>{
 const x=chosen(49,'ZH'),o=x.offerings[0],wrong=chosen(49,'EN').selectedApplicant.id,q=new URLSearchParams({route:x.selectedRoute.id,offering:o.id,applicant:wrong});
 const r=await fetch(`${base}/api/programmes/${x.id}?${q}`);assert.equal(r.status,422);assert.match((await r.json()).error,/Unknown or stale applicant category/);
});
