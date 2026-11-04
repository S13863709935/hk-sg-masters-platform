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
const batch=read('data/checked-programmes.json'),obs=read('data/research/eduhk-aapsef-observation-2026-11-04.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-EDUHK-P${String(n).padStart(3,'0')}`),route=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId.endsWith('-'+tag));
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6.5,reading:6.5,writing:6.5,speaking:6.5},testDate:'2026-05-01',singleAttempt:true}};
const chosen=(n,tag=null,mode='FT',category='NONLOCAL')=>{const x=tag?route(n,tag):p(n),o=x.offerings.find(o=>o.id.endsWith('-'+mode));return resolveProgramme(p(n),routes,x.routeId,o.id,category?o.id+'-'+category:undefined,contexts);};
const choices=()=>obs.applicantContextPlan.flatMap(c=>c.options.map(o=>resolveProgramme(store.get(c.programmeId),routes,c.routeId||undefined,c.offeringId,o.id,contexts)));
const note=(x,label)=>x.rules.find(r=>r.labelEn===label)?.noteEn;
const languageCheck=(x,language)=>matchProgramme(x,{...profile,language}).checks.find(c=>c.kind==='language');


test('AAPSEF first pass retains thirteen identities, twenty mode bindings, forty categories and one unread MEd lead',()=>{
 assert.equal(obs.programmeIds.length,13);assert.equal(choices().length,40);assert.equal(store.quality().total,873);assert.equal(store.quality().checked,repositoryExpected.checked);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.deepEqual(routeSummary(routes),{groups:repositoryExpected.routeGroups,routes:repositoryExpected.routeRecords,pageChecked:repositoryExpected.routeRecords,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:345,categories:694,peerReviewed:0});assert.equal(p(40).verification,'catalogue_seed');
 const b=loadSchoolBacklog('2026-11-04'),school=b.schools.find(x=>x.schoolId==='HK-EDUHK');assert.equal(school.pageCheckedRecords,58);assert.equal(school.unreadLeads,1);assert.equal(b.counts.unreadLeads,repositoryExpected.unreadLeads);assert.deepEqual(b,read(repositoryExpected.backlogJson));
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-04');assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
 const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,repositoryExpected.reviewUnits);assert.equal(q.counts.staleApplicantContexts,0);
});
test('public administration hard experience, law preferences and executive AI fresh-graduate alternatives have distinct results',()=>{
 const zero={...profile,experienceYears:0};assert.equal(matchProgramme(chosen(4),zero).checks.find(c=>c.kind==='experience').status,'fail');assert.equal(matchProgramme(chosen(4),{...profile,experienceYears:2}).checks.find(c=>c.kind==='experience').status,'pass');
 for(const n of [41,42,52]){const x=chosen(n);assert.equal(x.rules.some(r=>r.kind==='experience'),false);assert.equal(matchProgramme(x,zero).checks.some(c=>c.kind==='experience'&&c.status==='fail'),false);}
 for(const tag of ['EN','ZH']){const x=chosen(46,tag);assert.equal(x.rules.some(r=>r.kind==='experience'),false);assert.equal(matchProgramme(x,zero).status,'needs_confirmation');assert.match(x.notesEn,/excellent fresh graduates MAY.*No automatic hard failure/);}
});
test('executive AI English rule belongs only to EMI and each FT/PT category preserves the selected language',()=>{
 const en=chosen(46,'EN'),zh=chosen(46,'ZH');assert.equal(languageCheck(en,{...profile.language,total:5}).status,'fail');assert.equal(zh.rules.some(r=>r.kind==='language'),false);assert.equal(matchProgramme(zh,{...profile,language:{...profile.language,total:3}}).status,'needs_confirmation');
 for(const tag of ['EN','ZH'])for(const mode of ['FT','PT']){const x=chosen(46,tag,mode);assert.equal(x.offerings[0].tuition,207900);assert.equal(x.offerings[0].duration,mode==='FT'?'1 year':'2 years');assert.equal(x.selectedRoute.id,'HK-EDUHK-P046-ROUTE-'+tag);}
});
test('five explicitly proposed programmes retain reference prices and dates without becoming approved or live-open',()=>{
 assert.deepEqual(obs.pendingApprovalIds,['HK-EDUHK-P025','HK-EDUHK-P008','HK-EDUHK-P039','HK-EDUHK-P054','HK-EDUHK-P005']);
 for(const n of [25,8,39,54,5]){const x=chosen(n);assert.equal(x.admissionRoute,'unconfirmed');assert.equal(programmeTimeline(x,'2026-11-04').state,'unverified');assert.equal(x.fieldStatus.tuition.status,'unknown');assert.equal(x.fieldStatus.deadline.status,'unknown');assert.match(x.offerings[0].feeBasis,/SUBJECT TO UNIVERSITY APPROVAL/);assert.equal(matchProgramme(x,profile).tier,null);}
 assert.match(p(25).notesEn,/GBA Internship\/Practicum is an ELECTIVE/);
});
test('OT whole programme fees, two years and accreditation limits are not converted to annual price or automatic registration',()=>{
 const x=chosen(43);assert.equal(x.offerings[0].duration,'2 years');assert.equal(x.offerings[0].tuition,682950);assert.equal(x.rules.some(r=>r.kind==='major'),false);assert.match(x.notesEn,/87 credits.*FOUR clinical placements.*1,000 hours.*WFOT approval.*OT Board accreditation is STILL PENDING/);assert.match(x.notesEn,/not automatically confer registration/);
});
test('actual English EMPAL amounts resolve malformed Chinese prose without category defaults or PT multipliers',()=>{
 for(const mode of ['FT','PT']){assert.equal(chosen(4,null,mode,'LOCAL').offerings[0].tuition,179520);assert.equal(chosen(4,null,mode).offerings[0].tuition,224400);assert.equal(chosen(4,null,mode,null).offerings[0].tuition,null);}
 assert.match(p(4).notesEn,/1,000 WORDS in Chinese plus 800 WORDS in English/);assert.match(p(41).notesEn,/1,000-WORD.*800-WORD/);assert.match(p(42).notesEn,/TWO referees.*800-WORD/);
});
test('Chinese evidence follows degree location, and English statement invitations differ from all-applicant requirements',()=>{
 assert.match(note(p(41),'Language applicability and alternatives'),/outside China.*Gaokao 110\/150.*not a nationality test/);assert.match(p(25).notesEn,/internal Putonghua assessment/);assert.match(p(39).notesEn,/spoken and written Chinese/);assert.match(p(54).notesEn,/INVITED.*not described as mandatory/);assert.match(p(48).notesEn,/ALL applicants.*ENGLISH.*1,000 WORDS/);assert.match(p(42).notesEn,/NOT a shortcut.*national judicial examination/);
});
test('all forty options retain category rounds, no scholarship deductions, null later openings and exact offering fingerprints',()=>{
 for(const x of choices()){const o=x.offerings[0],local=o.applicantCategory.id.endsWith('-LOCAL');assert.equal(o.applicationFee,local?400:500);assert.equal(o.deadline,local?'2027-05-31':'2027-05-10');assert.deepEqual(o.applicationRounds.map(r=>r.applicationOpen),['2026-10-05',null,null]);assert.ok(o.applicationRounds.every(r=>r.deadlineAt===null));assert.match(o.feeBasis,/30,000.*NOT an automatic discount/);const c=[...contexts.values()].find(c=>c.offeringId===o.id);const rr=x.selectedRoute?route(46,x.selectedRoute.id.endsWith('-EN')?'EN':'ZH'):p(Number(x.id.slice(-3)));assert.equal(c.offeringFingerprint,offeringFingerprint(rr.offerings.find(q=>q.id===o.id)));}
});
test('reused discovery bodies become read evidence honestly, while failed GS bodies and search snippets remain outside the checked catalogue',()=>{
 assert.equal(obs.sourceRetrievals.length,24);assert.equal(obs.sourceRetrievals.filter(s=>s.reusedFromBatch).length,14);assert.ok(obs.sourceRetrievals.every(s=>s.status===200&&s.contentReadable&&/^[a-f0-9]{64}$/.test(s.sha256)));assert.equal(obs.failedRetrievals.length,1);assert.equal(obs.failedRetrievals[0].contentReadable,false);assert.equal(obs.failedRetrievals[0].sha256,undefined);assert.equal(obs.medIndexObservation.usedInProgrammeRecords,false);assert.equal(obs.programmeIds.includes(p(40).id),false);
});
test('isolated repeated imports preserve all earlier parents and reload exact condition/language bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-eduhk-aapsef-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,repositoryExpected.checked);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,repositoryExpected.routeGroups);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,345);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all forty choices retain language, conditions, approval and fees through detail/matching APIs, restore and export',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,applicant:cat,...(rid?{route:rid}:{})});const r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json();assert.deepEqual(d.offerings,x.offerings);assert.equal(d.admissionRoute,x.admissionRoute);const saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');
  const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);assert.equal(restored.programme.admissionRoute,x.admissionRoute);
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(ex.offerings[0].applicationRounds,o.applicationRounds);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:{[id]:cat},filters:{school:'HK-EDUHK'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,id==='HK-EDUHK-P004'?'has_gap':'needs_confirmation');assert.equal(m.match.tier,null);
 }
});


test('cross-language AI Executive category is rejected rather than silently changing its meaning',async()=>{const x=chosen(46,'ZH'),o=x.offerings[0],wrong=chosen(46,'EN').selectedApplicant.id,q=new URLSearchParams({route:x.selectedRoute.id,offering:o.id,applicant:wrong});const response=await fetch(`${base}/api/programmes/${x.id}?${q}`);assert.equal(response.status,422);assert.match((await response.json()).error,/Unknown or stale applicant category/);});
