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
const batch=read('data/checked-programmes.json'),obs=read('data/research/eduhk-fhm-observation-2026-11-04.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-EDUHK-P${String(n).padStart(3,'0')}`),route=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId.endsWith('-'+tag));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},testDate:'2026-05-01',singleAttempt:true}};
const chosen=(n,tag=null,mode='FT',category='NONLOCAL')=>{const x=tag?route(n,tag):p(n),o=x.offerings.find(o=>o.id.endsWith('-'+mode));return resolveProgramme(p(n),routes,x.routeId,o.id,category?o.id+'-'+category:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(o=>resolveProgramme(store.get(c.programmeId),routes,c.routeId||undefined,c.offeringId,o.id,contexts)));
const note=(x,label)=>x.rules.find(r=>r.labelEn===label)?.noteEn;
const languageCheck=(x,language)=>matchProgramme(x,{...profile,language}).checks.find(c=>c.kind==='language');

test('FHM batch adds eight existing identities, six independent language snapshots and twenty-six exact choices',()=>{
 assert.equal(obs.programmeIds.length,8);assert.equal(obs.directoryRows.length,12);assert.equal(obs.applicantContextPlan.length,13);assert.equal(choices().length,26);assert.equal(obs.counts.newParentStudyOptions,9);assert.equal(obs.counts.newRouteStudyOptions,7);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,416);assert.equal(store.quality().universities,14);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:27,routes:61,pageChecked:61,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:303,categories:610,peerReviewed:0});
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.lastChecked,'2026-11-04');assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
 assert.equal(p(1).lastChecked,'2026-10-30');assert.equal(p(44).lastChecked,'2026-10-25');
});

test('shared programme URLs retain separate language rules, exact modes and an explicit route-selection requirement',()=>{
 for(const n of [15,16,22]){assert.equal(routes.get(p(n).id).length,2);assert.equal(programmeTimeline(resolveProgramme(p(n),routes),'2026-11-04').state,'route_required');assert.throws(()=>resolveProgramme(p(n),routes,undefined,route(n,'EN').offerings[0].id),/specific route/);assert.equal(route(n,'ZH').rules.some(r=>r.kind==='language'),false);assert.equal(route(n,'ZH').fieldStatus.language.status,'unknown');assert.equal(route(n,'EN').rules.some(r=>r.kind==='language'),true);}
 assert.equal(route(16,'EN').offerings.length,2);assert.equal(route(16,'ZH').offerings.length,1);assert.equal(route(16,'ZH').offerings[0].duration,'1 year');assert.equal(chosen(16,'EN','PT').offerings[0].duration,'2 years');
 assert.equal(chosen(15,'EN').offerings[0].tuition,chosen(15,'ZH').offerings[0].tuition);assert.equal(chosen(22,'EN').offerings[0].tuition,chosen(22,'ZH').offerings[0].tuition);
});

test('observed MADLIC alias redirects preserve immutable directory identity without weakening exact route matching',()=>{
 const old=read('data/directory-links.json').listings.find(x=>x.programmeId===p(16).id),source=obs.sourceRetrievals.find(x=>x.key===p(16).id);
 assert.equal(old.checkedOn,'2026-10-20');assert.equal(old.programmeUrl,'https://www.eduhk.hk/madlic');assert.equal(source.requestedUrl,old.programmeUrl);assert.match(source.url,/\/fhm\/postgraduate-programme\/master-of-arts-in-digital-linguistics/);assert.equal(source.status,200);
 for(const tag of ['EN','ZH']){const r=route(16,tag);assert.equal(r.officialUrl,old.programmeUrl);assert.ok(r.sources.some(x=>x.url===source.requestedUrl&&x.checkedOn==='2026-11-04'));assert.ok(r.sources.some(x=>x.url===source.url));assert.equal(chosen(16,tag).applicantContextStatus,'available');}
});

test('digital English IELTS component floor is enforced rather than accepting the central overall score alone',()=>{
 for(const n of [15,16]){const x=chosen(n,'EN'),r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,6);assert.equal(r.tests.ielts.componentMin,5.5);
  assert.equal(languageCheck(x,{...profile.language,total:6,components:{listening:6,reading:6,writing:5,speaking:6.5}}).status,'fail');
  assert.equal(languageCheck(x,{...profile.language,total:6,components:{listening:6,reading:6,writing:5.5,speaking:6.5}}).status,'pass');
  assert.equal(languageCheck(x,{...profile.language,components:{}}).status,'unknown');assert.equal(matchProgramme(chosen(n,'ZH'),profile).status,'needs_confirmation');
 }
});

test('TESOL preserves higher English scores and preferences without imposing a teaching-experience gate',()=>{
 const x=chosen(36),r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,7);assert.equal(r.tests.ielts.componentMin,6.5);assert.equal(r.tests.toefl_120.total,100);assert.equal(r.tests.toefl_6.total,5);
 assert.equal(languageCheck(x,profile.language).status,'fail');assert.equal(languageCheck(x,{...profile.language,total:7,components:{listening:7,reading:7,writing:6,speaking:7}}).status,'fail');
 const enough={...profile.language,total:7,components:{listening:7,reading:7,writing:6.5,speaking:7}};assert.equal(languageCheck(x,enough).status,'pass');assert.equal(matchProgramme(x,{...profile,language:enough}).status,'needs_confirmation');assert.equal(x.rules.some(r=>r.kind==='experience'),false);assert.match(note(x,'Programme academic and preparatory conditions'),/PREFERRED.*disciplines other than English/);
 assert.equal(languageCheck(x,{type:'toefl_120',total:99,testDate:'2026-01-20',singleAttempt:true}).status,'fail');assert.equal(languageCheck(x,{type:'toefl_6',total:5,testDate:'2026-01-21',singleAttempt:true}).status,'pass');
 assert.match(note(x,'English alternatives, applicability and validity'),/No CET-6 acceptance/);
});

test('MACSLE explicitly optional English and MATCIL additional English plus Chinese evidence remain different',()=>{
 assert.equal(p(10).rules.some(r=>r.kind==='language'),false);assert.equal(p(10).rules.some(r=>r.kind==='degree'),false);assert.match(note(p(10),'Chinese instruction and optional English evidence'),/NOT mandatory.*optional merit|NOT mandatory.*may support merit/);assert.match(p(10).notesEn,/postgraduate diploma.*alternatives/);
 const x=chosen(35);assert.equal(x.rules.find(r=>r.kind==='language').tests.ielts.total,6);assert.equal(languageCheck(x,profile.language).status,'pass');
 const chinese=note(x,'Chinese proficiency even for native speakers');assert.match(chinese,/PSC 2B.*LPAT.*HSK 5.*EACH.*HSKK Advanced 70.*Taiwan TOP/);assert.match(chinese,/Native Putonghua speakers STILL/);assert.match(chinese,/Teaching experience is not required/);assert.equal(matchProgramme(x,profile).status,'needs_confirmation');
});

test('music major OR minor and optional Australian progression do not produce false undergraduate-entry requirements',()=>{
 const x=chosen(29);assert.match(note(x,'Music minor and optional Melbourne progression'),/MAJOR OR MINOR.*profile without minor data.*LTCL level.*at least 12 credits.*AFTER EdUHK/);assert.match(note(x,'Music minor and optional Melbourne progression'),/No numeric progression GPA is stated/);assert.doesNotMatch(note(x,'Music minor and optional Melbourne progression'),/2\.5/);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='classification'),false);assert.equal(x.rules.find(r=>r.kind==='language').tests.ielts.total,6);
 const m=matchProgramme(x,profile);assert.equal(m.checks.find(c=>c.kind==='major').status,'unknown');assert.equal(m.status,'needs_confirmation');assert.equal(matchProgramme(x,{...profile,major:'Music'}).checks.find(c=>c.kind==='major').status,'pass');assert.equal(routes.has(x.id),false);assert.equal(store.quality().universities,14);
 assert.match(note(x,'English alternatives, applicability and validity'),/2026\/27 example.*1 January 2024.*CENTRAL entrance page/);assert.equal(x.rules.find(r=>r.kind==='language').testDateSourceUrl,'https://www.eduhk.hk/acadprog/EnReq(Pg)/index.html');
});

test('post-entry dissertation grades and optional research strands never become entrance GPA minima or extra research degrees',()=>{
 for(const x of [chosen(16,'EN'),chosen(16,'ZH'),chosen(36)]){assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='classification'),false);assert.match(note(x,'Dissertation and post-entry course grade'),/post-entry.*not an undergraduate-entry/);}
 assert.match(note(chosen(16,'EN'),'Dissertation and post-entry course grade'),/grade B\+.*Chinese MADLIC has coursework only/);assert.match(note(chosen(36),'Dissertation and post-entry course grade'),/grade B .*may not run every year/);assert.match(p(22).notesEn,/Optional research project.*taught degree/);
});

test('exact 2027 tuition, categories and old-cycle conflicts survive without scholarship or part-time multipliers',()=>{
 assert.equal(chosen(10,null,'FT','LOCAL').offerings[0].tuition,144000);assert.equal(chosen(10).offerings[0].tuition,180000);
 assert.equal(chosen(15,'EN').offerings[0].tuition,180000);assert.equal(chosen(16,'EN').offerings[0].tuition,178200);assert.equal(chosen(16,'EN','PT').offerings[0].tuition,178200);assert.equal(chosen(16,'ZH').offerings[0].tuition,178200);
 assert.equal(chosen(22,'EN').offerings[0].tuition,196800);assert.match(chosen(22,'EN').offerings[0].feeBasis,/140,800.*2024\/25.*196,800/);assert.equal(chosen(36).offerings[0].tuition,180000);
 const v=chosen(38).offerings[0];assert.equal(v.tuition,199400);assert.notEqual(v.tuition,8309*24);assert.match(v.feeBasis,/2026\/27 tuition HKD 189,800.*FTSS 2027\/28 is explicitly unconfirmed.*subtract HKD 100,000/);
 for(const x of choices()){const o=x.offerings[0],local=o.applicantCategory.id.endsWith('-LOCAL');assert.equal(o.applicationFee,local?400:500);assert.equal(o.tuitionEstimate,true);}
});

test('music and MATCIL retain visible quotes while their unlabelled fee years remain unknown numerically',()=>{
 for(const mode of ['FT','PT']){const x=chosen(29,null,mode);assert.equal(x.offerings[0].tuition,null);assert.match(x.offerings[0].feeBasis,/180,000.*does NOT explicitly identify its academic year/);assert.match(x.offerings[0].feeBasis,/7500 per credit.*caution350.*Australian/);}
 const x=chosen(35);assert.equal(x.offerings[0].tuition,null);assert.match(x.offerings[0].feeBasis,/217,800.*overseas school experience.*25% is not an extra25%/);
});

test('earlier unqualified MADLIC cutoff overrides central final dates without extending its application window',()=>{
 for(const tag of ['EN','ZH'])for(const mode of tag==='EN'?['FT','PT']:['FT'])for(const category of ['LOCAL','NONLOCAL']){
  const x=chosen(16,tag,mode,category),o=x.offerings[0];assert.equal(o.deadline,'2027-01-04');assert.equal(o.applicationRounds.length,1);assert.equal(o.applicationRounds[0].id,'PROGRAMME');assert.equal(o.applicationRounds[0].deadlineAt,null);assert.equal(programmeTimeline(x,'2027-01-04').state,'deadline_today');assert.equal(programmeTimeline(x,'2027-01-05').state,'deadline_passed');assert.equal(programmeTimeline(x,'2027-02-01').offerings[0].nextRoundId,null);assert.match(x.applicantEvidence.dateSourceUrl,/digital-linguistics.*admission/);
 }
 for(const x of choices().filter(x=>x.id!==p(16).id)){const o=x.offerings[0],local=o.applicantCategory.id.endsWith('-LOCAL');assert.equal(o.deadline,local?'2027-05-31':'2027-05-10');assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2027-01-04','2027-02-15',o.deadline]);assert.deepEqual(o.applicationRounds.map(r=>r.applicationOpen),['2026-10-05',null,null]);assert.ok(o.applicationRounds.every(r=>r.deadlineAt===null));assert.equal(programmeTimeline(x,'2027-01-05').state,'within_recorded_dates');}
});

test('current mandatory portfolio types and old 2026 PDF format limits are visibly versioned rather than enforced as 2027 gates',()=>{
 const x=chosen(38),text=note(x,'Documents, referees and version applicability');assert.match(text,/Current 2027 HTML requires.*portfolio.*personal statement.*signed declaration/);assert.match(text,/2026 Intake.*25 September 2025.*1-3 projects.*maximum 10 pages/);assert.match(text,/maximum 500 words.*500 characters.*400 characters.*200 words/);assert.match(text,/ONLY as dated guidance pending 2027 confirmation/);assert.equal(x.rules.find(r=>r.labelEn==='Documents, referees and version applicability').kind,'manual');assert.equal(matchProgramme(x,profile).status,'needs_confirmation');assert.equal(obs.sourceRetrievals.find(x=>x.key==='P038-portfolio-guideline').format,'pdf');
});

test('held AI programme has newly observed evidence without silently clearing central approval or expanding the catalogue',()=>{
 const h=obs.heldProgrammeUpdate;assert.equal(h.originalRow,51);assert.equal(h.activation,'not_added_to_catalogue');assert.equal(h.observedYear,'2027/28');assert.equal(h.observedTuition,250000);assert.match(h.observedOfficialUrl,/artificial-intelligence-technology-and-language-learning/);assert.match(h.noteEn,/central2027 prospectus still marks.*approval/);
 assert.equal(store.all().some(p=>p.name==='Master of Arts in Artificial Intelligence and Technology in Language Learning'),false);assert.equal(read('data/research/eduhk-programme-inventory-2026-10-20.json').entries.find(x=>x.rowNumber===51).officialUrl,null);assert.equal(obs.limits.heldProgrammeActivated,false);
});

test('HTTP success, redirects, one retained 500 and same-day source reuse are not mistaken for fresh field verification',()=>{
 assert.equal(obs.sourceRetrievals.length,92);assert.equal(obs.sourceRetrievals.filter(x=>x.contentReadable).length,91);assert.equal(obs.sourceRetrievals.filter(x=>x.reusedFromBatch).length,8);assert.equal(obs.sourceRetrievals.filter(x=>x.format==='pdf').length,4);
 const failed=obs.sourceRetrievals.find(x=>x.key==='P010-tc-1');assert.equal(failed.contentReadable,false);assert.match(failed.error,/500/);assert.equal(failed.sha256,undefined);assert.equal(obs.sourceRetrievals.find(x=>x.key==='P010-tc-fee-retry').status,200);
 const bad=obs.sourceRetrievals.find(x=>x.key==='HK-EDUHK-P038-panel-34-sub-16-fees-detail');assert.match(bad.requestedUrl,/ruition/);assert.equal(bad.url,'https://mavaecp.eduhk.hk/');assert.equal(bad.usedInRecords,false);assert.equal(obs.sourceRetrievals.find(x=>x.key==='P038-current-fee-link').usedInRecords,true);
 assert.ok(obs.sourceRetrievals.filter(x=>x.contentReadable).every(x=>/^[a-f0-9]{64}$/.test(x.sha256)&&x.observedOn==='2026-11-04'));assert.equal(obs.limits.centralGsDirectoryReadThisTurn,false);assert.equal(obs.limits.independentHumanReviews,0);
});

test('latest backlog retains 38 unread EdUHK leads, complete-zero status and unchanged core results',()=>{
 const b=loadSchoolBacklog('2026-11-04'),s=b.schools.find(x=>x.schoolId==='HK-EDUHK');assert.equal(s.catalogueRecords,59);assert.equal(s.pageCheckedRecords,45);assert.equal(s.unreadLeads,14);assert.equal(s.completeRecords,0);assert.equal(b.counts.pageCheckedRecords,416);assert.equal(b.counts.catalogueLeads,457);assert.equal(b.counts.unreadLeads,442);
 assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-eduhk-aedi.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-eduhk-aedi.md',root),'utf8').replaceAll('\r\n','\n'));
 const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,780);assert.equal(q.counts.nearCutoffUnits,7);assert.equal(q.counts.staleApplicantContexts,0);assert.equal(batch.pilotProgrammeIds.length,20);
 for(const plan of obs.applicantContextPlan){const r=plan.routeId?routes.get(plan.programmeId).find(r=>r.routeId===plan.routeId):store.get(plan.programmeId),o=r.offerings.find(o=>o.id===plan.offeringId),binding=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(binding.offeringFingerprint,offeringFingerprint(o));assert.equal(binding.intake,'September 2027');}
});

test('isolated repeated imports preserve every earlier parent and reload exact alias/language/category bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-eduhk-fhm-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,416);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,27);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,303);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty-six choices preserve independent language, fees and dates through real APIs, matching, saved restore and export',async()=>{
 for(const x of choices()){
  const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})});
  const r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.offerings,x.offerings);const saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');
  const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(ex.offerings[0].applicationRounds,o.applicationRounds);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat},filters:{school:'HK-EDUHK'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.ok(['needs_confirmation','has_gap'].includes(m.match.status));assert.equal(m.match.tier,null);
 }
});

test('API rejects a sibling language applicant category rather than reusing its fee/date selection',async()=>{
 const x=chosen(15,'ZH'),o=x.offerings[0],wrong=chosen(15,'EN').selectedApplicant.id,q=new URLSearchParams({route:x.selectedRoute.id,offering:o.id,applicant:wrong});const r=await fetch(`${base}/api/programmes/${x.id}?${q}`);assert.equal(r.status,422);assert.match((await r.json()).error,/Unknown or stale applicant category/);
});
