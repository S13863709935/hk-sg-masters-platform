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
const batch=read('data/checked-programmes.json'),obs=read('data/research/eduhk-flass-observation-2026-11-04.json'),reconciliation=read(obs.directoryReconciliationFile);
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-EDUHK-P${String(n).padStart(3,'0')}`),route=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId.endsWith('-'+tag));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},testDate:'2026-05-01',singleAttempt:true}};
const chosen=(n,tag=null,mode='FT',category='NONLOCAL')=>{const x=tag?route(n,tag):p(n),o=x.offerings.find(o=>o.id.endsWith('-'+mode));return resolveProgramme(p(n),routes,x.routeId,o.id,category?o.id+'-'+category:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(o=>resolveProgramme(store.get(c.programmeId),routes,c.routeId||undefined,c.offeringId,o.id,contexts)));
const note=(x,label)=>x.rules.find(r=>r.labelEn===label)?.noteEn;
const languageCheck=(x,language)=>matchProgramme(x,{...profile,language}).checks.find(c=>c.kind==='language');

test('FLASS adds nine existing identities, six language snapshots, two condition views and thirty-four explicit choices',()=>{
 assert.equal(obs.programmeIds.length,9);assert.equal(obs.directoryRows.length,17);assert.equal(obs.applicantContextPlan.length,17);assert.equal(choices().length,34);assert.equal(obs.counts.newParentStudyOptions,11);assert.equal(obs.counts.newRouteStudyOptions,10);assert.equal(obs.counts.newLanguageRoutes,6);assert.equal(obs.counts.newConditionViews,2);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,429);assert.equal(store.quality().universities,14);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:28,routes:63,pageChecked:63,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:323,categories:650,peerReviewed:0});
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.lastChecked,'2026-11-04');assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
 assert.equal(p(1).lastChecked,'2026-10-30');assert.equal(p(44).lastChecked,'2026-10-25');
});

test('the actual Chinese STEM link replaces a documented loop without guessing a URL or rewriting October observations',()=>{
 const before=reconciliation.changes.find(x=>x.programmeId===p(34).id),current=read('data/directory-links.json').listings.find(x=>x.programmeId===p(34).id),failed=obs.sourceRetrievals.find(x=>x.key==='HK-EDUHK-P034-row68'),fresh=obs.sourceRetrievals.find(x=>x.key==='P034-cmi-current');
 assert.deepEqual(current,before.after);assert.equal(before.before.checkedOn,'2026-10-20');assert.equal(current.checkedOn,'2026-11-04');assert.equal(failed.requestedUrl,before.before.variants[1].officialUrl);assert.equal(failed.contentReadable,false);assert.match(failed.error,/redirects/i);assert.equal(failed.sha256,undefined);
 assert.equal(current.variants[1].officialUrl,'https://ses.eduhk.hk/sc/programmes/mastemedcmi');assert.equal(fresh.url,current.variants[1].officialUrl);assert.equal(fresh.status,200);assert.equal(route(34,'ZH').officialUrl,fresh.url);assert.equal(chosen(34,'ZH').applicantContextStatus,'available');
 const inventory=read('data/research/eduhk-programme-inventory-2026-10-20.json');assert.equal(inventory.entries.find(x=>x.rowNumber===68).officialUrl,before.before.variants[1].officialUrl);
});

test('separately read language versions retain exact modes and do not copy English scores into Chinese',()=>{
 for(const n of [19,34,45]){assert.equal(routes.get(p(n).id).length,2);assert.equal(programmeTimeline(resolveProgramme(p(n),routes),'2026-11-04').state,'route_required');assert.throws(()=>resolveProgramme(p(n),routes,undefined,route(n,'EN').offerings[0].id),/specific route/);assert.equal(route(n,'ZH').rules.some(r=>r.kind==='language'),false);assert.equal(route(n,'EN').rules.find(r=>r.kind==='language').tests.ielts.total,6);for(const tag of ['EN','ZH']){assert.equal(route(n,tag).offerings.length,1);assert.equal(route(n,tag).offerings[0].mode,'Full-time');assert.equal(route(n,tag).offerings[0].duration,'1 year');}}
 assert.match(p(19).notesEn,/C2.*without confirming a current part-time intake/);assert.match(p(34).notesEn,/C2 code alone.*not current PT-intake confirmation/);assert.equal(route(19,'ZH').fieldStatus.language.status,'unknown');assert.equal(route(34,'ZH').fieldStatus.language.status,'unknown');
});

test('AI education requires prior programming in both versions and applies HSK6 only to the stated joint condition',()=>{
 for(const tag of ['EN','ZH']){const x=chosen(45,tag);assert.match(note(x,'Required prior programming knowledge and skills'),/BOTH.*require PRIOR programming.*not merely a preference/);const m=matchProgramme(x,profile);assert.equal(m.checks.find(c=>c.kind==='major').status,'pass');assert.equal(m.checks.find(c=>c.labelEn==='Required prior programming knowledge and skills').status,'unknown');assert.equal(m.status,'needs_confirmation');}
 const zh=chosen(45,'ZH');assert.match(note(zh,'Chinese instruction and language evidence'),/BOTH.*NOT Chinese AND no degree.*HSK LEVEL 6 OR equivalent/);assert.equal(zh.rules.some(r=>r.kind==='language'),false);assert.equal(chosen(45,'EN').rules.find(r=>r.kind==='language').tests.toefl_6.total,4);
});

test('math preparation is not replaced by a required mathematics undergraduate major or an automatic exam equivalence',()=>{
 const x=chosen(27),text=note(x,'Mathematics preparation and assessed alternatives');assert.match(text,/HKALE Mathematics E OR HKDSE compulsory Mathematics 4 OR equivalent/);assert.match(text,/undergraduate.*courses may also be considered/);assert.match(text,/non-Mathematics bachelor is PREFERRED, not required.*Mathematics degree is not excluded/);
 assert.equal(x.rules.some(r=>r.kind==='major'),false);for(const major of ['Mathematics','Computer Science']){const m=matchProgramme(x,{...profile,major});assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.some(c=>c.kind==='major'&&c.status==='fail'),false);}assert.match(note(x,'Documents, referees and condition applicability'),/mathematics-course transcripts.*overseas applicant/);
});

test('Personal Finance keeps its retitled identity, non-finance backgrounds, full-time/part-time price and assessed project/CFP conditions',()=>{
 assert.equal(p(31).name,'Master of Arts in Personal Finance');assert.match(p(31).notesEn,/retitling Personal Finance Education to Personal Finance FROM 2027\/28/);assert.match(p(31).notesEn,/non-business\/non-finance/);assert.equal(matchProgramme(chosen(31),profile).checks.find(c=>c.kind==='major').status,'pass');assert.equal(p(31).offerings.length,2);assert.equal(chosen(31).offerings[0].tuition,184800);assert.equal(chosen(31,null,'PT').offerings[0].tuition,184800);assert.equal(chosen(31,null,'PT').offerings[0].duration,'2 years');assert.match(p(31).notesEn,/research project.*approval.*CFP.*conditional/);assert.equal(store.all().filter(x=>x.name==='Master of Arts in Personal Finance').length,1);
});

test('standard sports English remains comparable while the regional/national elite exception does not become a universal failure',()=>{
 const standard=chosen(57,'STANDARD'),elite=chosen(57,'ELITE'),low={...profile.language,total:5.5};assert.equal(languageCheck(standard,low).status,'fail');assert.equal(matchProgramme(standard,{...profile,language:low}).status,'has_gap');assert.equal(elite.rules.some(r=>r.kind==='language'),false);
 const m=matchProgramme(elite,{...profile,language:low});assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);const text=note(elite,'Elite English exception requires university assessment');assert.match(text,/REGIONAL\/NATIONAL.*MAY.*LIMITED QUOTA/);assert.match(text,/MUST complete.*SELF-FUNDED English enhancement/);assert.match(note(elite,'Athlete identity, academic alternatives and scope'),/Local-elite status alone does NOT activate/);
});

test('sports exception is an explicit condition view of one degree, never an automatic athlete classification or guaranteed waiver',()=>{
 const group=routes.get(p(57).id);assert.equal(group.length,2);assert.ok(group.every(r=>r.officialUrl===p(57).officialUrl));const parent=resolveProgramme(p(57),routes);assert.equal(parent.selectedRoute,undefined);assert.equal(matchProgramme(parent,profile).status,'needs_confirmation');assert.match(p(57).directoryListing.noteEn,/CONDITION VIEWS of ONE degree.*not university-named specialisations/);
 assert.equal(store.all().filter(p=>p.name==='Master of Social Sciences in Sports Coaching and Management').length,1);assert.equal(p(57).offerings.length,1);for(const tag of ['STANDARD','ELITE'])assert.equal(route(57,tag).offerings.length,2);assert.equal(store.quality().universities,14);
});

test('required sports statement/CV page counts and separate PDF instructions are not converted into words or one combined document',()=>{
 const text=note(chosen(57,'STANDARD'),'Documents, referees and condition applicability');assert.match(text,/TWO-PAGE personal statement.*TWO-PAGE CV in ONE PDF/);assert.match(text,/sports\/health supporting documents in ONE PDF IF APPLICABLE/i);assert.match(text,/regional\/national elite-athlete proof IF APPLICABLE/);assert.match(text,/does not mean statement and CV must be combined/);assert.match(text,/Do not turn page limits into word counts/);
});

test('elite enhancement has an unknown extra fee rather than a fabricated all-in tuition or scholarship deduction',()=>{
 for(const mode of ['FT','PT']){const x=chosen(57,'ELITE',mode),o=x.offerings[0];assert.equal(o.tuition,184800);assert.equal(o.tuitionEstimate,true);assert.equal(x.fieldStatus.tuition.status,'unknown');assert.match(o.feeBasis,/additional SELF-FUNDED.*fee was not established.*BASE TUITION ONLY/);assert.match(o.feeBasis,/not multiplied by.*PT duration/);}
 assert.equal(chosen(57,'STANDARD').fieldStatus.tuition.status,'known');
});

test('Therapeutic Play full-time duration, block schedule and prior certificate exemptions are distinct from ordinary admission',()=>{
 const ft=chosen(58),pt=chosen(58,null,'PT');assert.equal(ft.offerings[0].duration,'1.5 years');assert.equal(pt.offerings[0].duration,'2 years');assert.equal(ft.offerings[0].tuition,209160);assert.equal(pt.offerings[0].tuition,209160);assert.match(p(58).notesEn,/Monday-Saturday 9:30-17:30.*two consecutive weeks/);assert.match(p(58).notesEn,/not guaranteed evening\/weekend-only/);assert.match(p(58).notesEn,/within\/over five years.*not ordinary admission/);assert.match(p(58).notesEn,/Further study may be needed.*professional recognition/);assert.match(note(ft,'Programme academic and preparatory conditions'),/Shortlisted candidates MUST interview/);
});

test('two explicitly proposed programmes never become live-open or approved merely from known fees and future calendar dates',()=>{
 for(const n of [47,55]){const x=chosen(n);assert.equal(x.admissionRoute,'unconfirmed');assert.match(note(x,'Programme approval and activation remain pending'),/SUBJECT TO UNIVERSITY APPROVAL/);assert.equal(programmeTimeline(x,'2026-11-04').state,'unverified');assert.equal(x.fieldStatus.deadline.status,'unknown');assert.equal(x.fieldStatus.tuition.status,'unknown');assert.match(x.offerings[0].feeBasis,/PROPOSED programme.*SUBJECT TO UNIVERSITY APPROVAL/);assert.equal(x.offerings[0].tuitionEstimate,true);assert.equal(matchProgramme(x,profile).status,'needs_confirmation');}
 assert.equal(chosen(47).offerings[0].tuition,231000);assert.equal(chosen(55).offerings[0].tuition,180000);assert.deepEqual(obs.pendingApprovalIds,['HK-EDUHK-P047','HK-EDUHK-P055']);
});

test('Chinese BAFT still requires an English statement capped at 1000 words without an invented English score or work-year floor',()=>{
 const x=chosen(47),text=note(x,'Documents, referees and condition applicability');assert.match(text,/ALL applicants.*IN ENGLISH.*maximum 1,000 WORDS/);assert.match(text,/not a 1,000-word minimum or a 1,000-character/);assert.equal(x.rules.some(r=>r.kind==='language'||r.kind==='experience'||r.kind==='gpa'),false);assert.match(p(47).notesEn,/PREFERRED.*not a universal major\/work-year minimum/);assert.match(p(47).notesEn,/preliminary teaching-team\/supervisor assessment/);
});

test('all standard English panels keep own score boundaries and source the missing cohort example to the central entrance page',()=>{
 const list=[chosen(19,'EN'),chosen(27),chosen(31),chosen(34,'EN'),chosen(45,'EN'),chosen(55),chosen(57,'STANDARD'),chosen(58)];
 for(const x of list){const r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,6);assert.equal(r.tests.ielts.componentMin,undefined);assert.equal(r.tests.toefl_120.total,80);assert.equal(r.tests.toefl_6.total,4);assert.equal(r.testDateNotBefore,'2025-01-01');assert.equal(r.validityMonths,undefined);assert.equal(languageCheck(x,{type:'toefl_120',total:80,testDate:'2026-01-20',singleAttempt:true}).status,'pass');assert.equal(languageCheck(x,{type:'toefl_6',total:4,testDate:'2026-01-21',singleAttempt:true}).status,'pass');assert.equal(languageCheck(x,{...profile.language,testDate:'2024-12-31'}).status,'fail');assert.equal(languageCheck(x,{...profile.language,atHome:true}).status,'fail');}
 for(const x of [chosen(27),chosen(45,'EN'),chosen(55)])assert.equal(x.rules.find(r=>r.kind==='language').testDateSourceUrl,'https://www.eduhk.hk/acadprog/EnReq(Pg)/index.html');
});

test('all current tuition panels retain exact cohort quotes, category application fees and complete-zero status',()=>{
 const prices={19:184800,27:176100,31:184800,34:184800,45:230500,47:231000,55:180000,57:184800,58:209160};
 for(const x of choices()){const n=Number(x.id.slice(-3)),o=x.offerings[0],local=o.applicantCategory.id.endsWith('-LOCAL');assert.equal(o.tuition,prices[n]);assert.equal(o.applicationFee,local?400:500);assert.equal(o.tuitionEstimate,true);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(o.intake,'September 2027');}
 for(const n of [27,45,57,58]){const x=chosen(n,n===45?'EN':n===57?'STANDARD':null);assert.match(x.offerings[0].feeBasis,/earlier 2025\/26 or 2026\/27.*no guaranteed 2027\/28.*HKD 100,000 deduction/);}
});

test('central category rounds retain null intraday cutoffs and do not invent later openings or personal classifications',()=>{
 for(const x of choices()){const o=x.offerings[0],local=o.applicantCategory.id.endsWith('-LOCAL');assert.equal(o.applicationOpen,'2026-10-05');assert.equal(o.deadline,local?'2027-05-31':'2027-05-10');assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2027-01-04','2027-02-15',o.deadline]);assert.deepEqual(o.applicationRounds.map(r=>r.applicationOpen),['2026-10-05',null,null]);assert.ok(o.applicationRounds.every(r=>r.deadlineAt===null));if(x.admissionRoute==='direct'){assert.equal(programmeTimeline(x,'2026-11-04').state,'within_recorded_dates');assert.equal(programmeTimeline(x,'2027-01-04').offerings[0].rounds[0].state,'deadline_today');assert.equal(programmeTimeline(x,'2027-02-16').offerings[0].nextRoundId,'FINAL');}}
 assert.equal(programmeTimeline(chosen(31,null,'FT',null),'2026-11-04').state,'applicant_required');assert.match(chosen(58).applicantEvidence.dateSourceUrl,/therapeutic-play/);
});

test('same-day reuse, redirect failure and current identity archive remain honest while three unlinked proposals stay held',()=>{
 assert.equal(obs.sourceRetrievals.length,21);assert.equal(obs.sourceRetrievals.filter(x=>x.contentReadable).length,20);assert.equal(obs.sourceRetrievals.filter(x=>x.reusedFromBatch).length,8);assert.equal(obs.sourceRetrievals.filter(x=>x.format==='pdf').length,3);assert.ok(obs.sourceRetrievals.filter(x=>x.contentReadable).every(x=>x.status===200&&/^[a-f0-9]{64}$/.test(x.sha256)&&x.observedOn==='2026-11-04'));
 assert.deepEqual(reconciliation.changes.map(x=>x.programmeId),['HK-EDUHK-P034','HK-EDUHK-P057']);assert.equal(read('data/directory-links.json').checkedOn,'2026-11-04');for(const x of read('data/research/eduhk-programme-inventory-2026-10-20.json').entries.filter(x=>[77,78,79].includes(x.rowNumber))){assert.equal(x.officialUrl,null);assert.equal(x.pendingApproval,true);assert.equal(x.programmeId,undefined);}assert.equal(obs.limits.fullCatalogueReenumerated,false);assert.equal(obs.limits.heldProgrammeActivated,false);
});

test('latest backlog distinguishes thirty partial parents, twenty-nine unread leads and still-unconfirmed requirements',()=>{
 const b=loadSchoolBacklog('2026-11-04'),s=b.schools.find(x=>x.schoolId==='HK-EDUHK');assert.equal(s.catalogueRecords,59);assert.equal(s.pageCheckedRecords,58);assert.equal(s.unreadLeads,1);assert.equal(s.completeRecords,0);assert.equal(b.counts.pageCheckedRecords,429);assert.equal(b.counts.catalogueLeads,444);assert.equal(b.counts.unreadLeads,429);assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-eduhk-aapsef.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-eduhk-aapsef.md',root),'utf8').replaceAll('\r\n','\n'));
 const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,815);assert.equal(q.counts.nearCutoffUnits,7);assert.equal(q.counts.staleApplicantContexts,0);assert.equal(batch.pilotProgrammeIds.length,20);
 for(const plan of obs.applicantContextPlan){const r=plan.routeId?routes.get(plan.programmeId).find(r=>r.routeId===plan.routeId):store.get(plan.programmeId),o=r.offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));}
});

test('isolated repeated imports preserve all earlier parents and reload exact condition/language bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-eduhk-flass-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,429);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,28);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,323);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all thirty-four choices retain language, conditions, approval and fees through detail/matching APIs, restore and export',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})});const r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.offerings,x.offerings);assert.equal(d.admissionRoute,x.admissionRoute);const saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');
  const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);assert.equal(restored.programme.admissionRoute,x.admissionRoute);
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(ex.offerings[0].applicationRounds,o.applicationRounds);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat},filters:{school:'HK-EDUHK'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);
 }
});

test('cross-language and cross-condition applicant categories are rejected rather than silently replacing the selected meaning',async()=>{
 for(const [n,a,b] of [[34,'EN','ZH'],[57,'STANDARD','ELITE']]){const x=chosen(n,b),o=x.offerings[0],wrong=chosen(n,a).selectedApplicant.id,q=new URLSearchParams({route:x.selectedRoute.id,offering:o.id,applicant:wrong});const r=await fetch(`${base}/api/programmes/${x.id}?${q}`);assert.equal(r.status,422);assert.match((await r.json()).error,/Unknown or stale applicant category/);}
});
