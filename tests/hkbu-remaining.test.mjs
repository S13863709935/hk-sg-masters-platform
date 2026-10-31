import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hkbu-remaining-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKBU-P${String(n).padStart(3,'0')}`),academic=n=>p(n).rules.find(r=>r.labelEn==='Programme-specific academic and study conditions').noteEn;
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_upper',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2026-05-01',singleAttempt:true}};
const match=(n,changes={})=>matchProgramme(p(n),{...profile,...changes});
const resolve=(n,tag='FT',category)=>{const id=p(n).id,o=id+'-2027-'+tag;return resolveProgramme(p(n),routes,undefined,o,category?o+'-'+category:undefined,contexts);};

test('the remaining 27 existing HKBU identities receive partial English observations without new awards or review claims',()=>{
 assert.equal(obs.programmeIds.length,27);assert.equal(new Set(obs.programmeIds).size,27);assert.equal(obs.counts.newDirectStudyOptions,48);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,869);assert.equal(store.quality().checked,297);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.deepEqual(store.quality().sourceRefreshConflicts,[]);
 assert.equal(store.all().filter(x=>x.universityId==='HK-HKBU'&&x.verification==='programme_page_checked').length,49);
 assert.deepEqual(routeSummary(routes),{groups:16,routes:39,pageChecked:39,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:193,categories:388,peerReviewed:0});
 for(const id of obs.programmeIds){const x=batch.programmes.find(x=>x.id===id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(x)),false);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-31');assert.equal(batch.pilotProgrammeIds.includes(id),false);}
});

test('all 32 contexts retain exact programme/mode/category amounts, dates and source bindings',()=>{
 assert.equal(obs.applicantContextPlan.length,32);
 for(const plan of obs.applicantContextPlan){const n=Number(plan.programmeId.slice(-3)),tag=plan.offeringId.endsWith('-FT')?'FT':'PT';
  const masked=resolve(n,tag);assert.equal(masked.offerings[0].tuition,null);assert.equal(masked.offerings[0].deadline,null);
  for(const [cat,fee,dates] of [['LOCAL',plan.localFee,plan.localRounds],['NONLOCAL',plan.nonLocalFee,plan.nonLocalRounds]]){const x=resolve(n,tag,cat),o=x.offerings[0];assert.equal(o.tuition,fee);assert.equal(o.deadline,dates.at(-1));assert.deepEqual(o.applicationRounds.map(r=>r.deadline),dates);assert.equal(x.applicantContextStatus,'available');assert.equal(o.applicationFee,450);}
 }
 assert.equal(resolve(10,'FT','LOCAL').offerings[0].tuition,217820);assert.equal(resolve(10,'PT','NONLOCAL').offerings[0].tuition,229620);
 assert.equal(resolve(14,'FT','NONLOCAL').offerings[0].tuition,191700);assert.equal(resolve(25,'FT','LOCAL').offerings[0].tuition,218988);
});

test('Visual Arts headline is a first round, with a local-only clearing round and no copied interview deadline',()=>{
 const local=resolve(18,'FT','LOCAL'),nonlocal=resolve(18,'FT','NONLOCAL');
 assert.deepEqual(local.offerings[0].applicationRounds.map(r=>r.deadline),['2026-12-31','2027-04-23','2027-07-15']);
 assert.deepEqual(nonlocal.offerings[0].applicationRounds.map(r=>r.deadline),['2026-12-31','2027-04-23']);
 assert.equal(local.offerings[0].deadline,'2027-07-15');assert.equal(nonlocal.offerings[0].deadline,'2027-04-23');
 assert.match(academic(18),/5–10 images.*Studio & Media Arts OR Craft & Design/);assert.match(academic(18),/Interview dates are not application cutoffs/);
});

test('mode totals and curriculum changes cannot turn into annual multipliers or duplicate master awards',()=>{
 assert.equal(resolve(47,'FT','LOCAL').offerings[0].tuition,366940);assert.equal(resolve(47,'PT','LOCAL').offerings[0].tuition,346840);assert.match(resolve(47,'PT','LOCAL').offerings[0].feeBasis,/Includes.*two fieldwork placements/);
 assert.equal(p(11).offerings[1].tuition,160000);assert.match(p(11).offerings[1].feeBasis,/106,680.*53,320.*160,000/);
 assert.deepEqual(p(22).offerings.map(o=>[o.mode,o.duration,o.tuition]),[['Full-time','2 years',436000]]);assert.match(academic(22),/replacing the older three-year/);
 assert.deepEqual(p(21).offerings.map(o=>[o.mode,o.deadline]),[['Full-time','2026-11-30'],['Part-time','2027-01-31']]);assert.equal(p(21).rules.find(r=>r.kind==='language').tests.toefl_120,undefined);
 assert.match(academic(21),/2018\/19 scholarship note do not establish five current/);
});

test('Psychology January and September keep separate academic years, prices, windows and interpretation of non-psychology',()=>{
 assert.deepEqual(p(45).offerings.map(o=>[o.id,o.academicYear,o.intake,o.tuition,o.applicationOpen,o.deadline]),[
 [p(45).id+'-2027-JAN-FT','2026/27','January 2027',235440,'2026-09-01','2026-09-30'],
 [p(45).id+'-2027-FT','2027/28','September 2027',269280,'2026-10-01','2026-11-30'],
 [p(45).id+'-2027-PT','2027/28','September 2027',269280,'2026-10-01','2026-11-30']]);
 assert.equal(programmeTimeline(resolve(45,'JAN-FT'),'2026-10-31').state,'deadline_passed');assert.equal(programmeTimeline(resolve(45),'2026-10-31').state,'within_recorded_dates');
 assert.equal(p(45).rules.some(r=>r.kind==='major'),false);assert.equal(match(45,{major:'Psychology'}).checks.some(c=>c.kind==='major'&&c.status==='fail'),false);
 assert.match(academic(45),/HKPS.*NOT merely its title/);
});

test('bilingual requirements and the Translation Technology other-language branch do not become universal Chinese gates',()=>{
 assert.match(academic(10),/Both English AND Chinese.*Cantonese is not required/);assert.match(academic(10),/HSK VI total 240/);
 assert.match(academic(17),/Technology requires another advanced language.*need NOT be Chinese/);assert.match(academic(17),/Technology does NOT require the Chinese statement/);
 for(const n of [10,17]){const m=match(n,{language:{...profile.language,total:9}});assert.equal(m.status,'needs_confirmation');assert.ok(m.checks.some(c=>c.kind==='manual'));assert.equal(m.tier,null);}
 for(const n of [9,20,24,32,41]){assert.equal(p(n).rules.some(r=>r.kind==='language'),false);assert.equal(match(n,{language:{type:'ielts',total:1}}).checks.some(c=>c.kind==='language'&&c.status==='fail'),false);}
});

test('Music and the corrected Green Energy branch cannot fail local or unclassified applicants through a universal English score gate',()=>{
 for(const n of [15,36]){assert.equal(p(n).rules.some(r=>r.kind==='language'),false);const m=match(n,{language:{type:'ielts',total:1}});assert.equal(m.checks.some(c=>c.kind==='language'&&c.status==='fail'),false);assert.ok(m.checks.some(c=>c.kind==='manual'&&/non-local|NON-LOCAL/.test(c.reasonEn)));}
 const low=matchProgramme(resolve(36,'FT','LOCAL'),{...profile,language:{type:'ielts',total:1}});assert.equal(low.status,'needs_confirmation');
 assert.equal(resolve(36,'FT','NONLOCAL').offerings[0].tuition,181500);assert.equal(resolve(36,'FT','LOCAL').offerings[0].deadline,'2027-07-23');
});

test('EMBA experience branches, preferred work and degree equivalents never acquire sibling admission rules',()=>{
 assert.equal(match(8,{experienceYears:5}).checks.find(c=>c.kind==='experience').status,'fail');assert.equal(match(8,{experienceYears:6}).checks.find(c=>c.kind==='experience').status,'pass');
 assert.match(academic(8),/ten years.*twelve years/);assert.match(academic(8),/no compulsory English or GMAT/);assert.equal(p(8).rules.some(r=>r.kind==='language'),false);
 assert.equal(resolve(8,'FT','LOCAL').offerings[0].tuition,888000);assert.equal(p(8).offerings[0].duration,'2 years');
 for(const n of [2,3,9,24,43,44,47,48,49])assert.equal(p(n).rules.some(r=>r.kind==='experience'),false);
 assert.match(academic(2),/seven years is NOT a universal/i);assert.match(academic(49),/Two relevant work years is PREFERRED/);
 assert.match(academic(24),/MORE THAN three.*THREE OR MORE/);
});

test('conditional MPA interview GPA and Melbourne pathway-only scores are not ordinary universal admission cutoffs',()=>{
 assert.equal(p(25).fieldStatus.gpa.status,'known');assert.equal(p(25).rules.some(r=>r.kind==='gpa'),false);assert.match(academic(25),/2.60.*no original scale.*NOT a universal/s);
 assert.equal(p(14).rules.some(r=>r.kind==='gpa'),false);assert.equal(p(14).rules.find(r=>r.kind==='language').tests.ielts.total,6);assert.match(academic(14),/Melbourne.*3.0\/4.0.*NOT ordinary/s);
 for(const id of obs.programmeIds.filter(id=>id!==p(25).id))assert.equal(store.get(id).fieldStatus.gpa.status,'not_published');
 assert.equal(p(46).rules.find(r=>r.kind==='classification').min,'second_upper');assert.equal(match(46,{classification:'second_lower'}).checks.find(c=>c.kind==='classification').status,'fail');
 assert.equal(match(46,{major:'History'}).checks.find(c=>c.kind==='major').status,'unknown');assert.equal(match(46,{major:'Data Science'}).checks.find(c=>c.kind==='major').status,'pass');
});

test('local-only part-time and excluded Zhuhai delivery stay exact mode conditions rather than programme-wide exclusions',()=>{
 for(const n of [20,24,32,41,48]){const pt=resolve(n,'PT'),ft=resolve(n);assert.match(pt.offerings[0].duration,/local applicants only/);assert.ok(matchProgramme(pt,profile).checks.some(c=>c.labelEn==='Part-time local-applicant restriction'));assert.equal(matchProgramme(ft,profile).checks.some(c=>c.labelEn==='Part-time local-applicant restriction'),false);assert.equal(pt.applicantOptions,undefined);assert.throws(()=>resolve(n,'PT','NONLOCAL'));}
 assert.deepEqual(p(49).offerings.map(o=>o.mode),['Full-time']);assert.match(academic(49),/Zhuhai BNBU.*NOT offered/);assert.equal(p(49).scope?.status==='out_of_scope',false);
 assert.equal(p(20).scope.status,'unconfirmed');assert.match(p(20).scope.reasonEn,/and\/or mainland/);assert.equal(read('data/programme-scope-audit.json').decisions.length,3);
});

test('Chinese Medicine current department evidence resolves central year typos without treating a diploma branch as a universal experience gate',()=>{
 assert.equal(p(20).academicYear,'2027/28');for(const o of p(20).offerings){assert.equal(o.tuition,156000);assert.equal(o.applicationOpen,'2026-10-02');assert.equal(o.deadline,'2027-03-02');assert.equal(o.feeEvidence.sourceUrl,'https://scm.hkbu.edu.hk/en/education/taught-postgraduate/MCM.html');}
 assert.equal(obs.boundaries.mcm.centralDeadline,'2026-03-02');assert.equal(obs.boundaries.mcm.centralHeaderCutoff,'2027-03-02');
 assert.equal(programmeTimeline(resolve(20),'2026-10-31').offerings[0].sourceUrl,'https://scm.hkbu.edu.hk/en/education/taught-postgraduate/MCM.html');
 for(const n of [24,32,41]){assert.match(p(n).offerings[0].feeBasis,/adds HKD 14,300 only when required/);assert.ok(![146000+14300,155000+14300,150000+14300].includes(p(n).offerings[0].tuition));assert.equal(p(n).rules.some(r=>r.kind==='gpa'),false);}
 assert.equal(match(24,{major:'Chemistry'}).checks.find(c=>c.kind==='major').status,'pass');assert.equal(match(32,{major:'Information Technology'}).checks.find(c=>c.kind==='major').status,'pass');
});

test('Counselling recruitment image proves the cohort only; unresolved fees/dates and training hours stay non-actionable',()=>{
 assert.equal(obs.boundaries.counselling.centralNominalTuitionHkd,213440);assert.match(obs.boundaries.counselling.imageSha256,/^[a-f0-9]{64}$/);assert.match(obs.boundaries.counselling.visuallyRead,/Admission 2027\/28.*No fee/);
 assert.equal(p(44).academicYear,'2027/28');for(const o of p(44).offerings){assert.equal(o.tuition,null);assert.equal(o.applicationOpen,null);assert.equal(o.deadline,null);assert.equal(o.applicationRounds,undefined);}
 assert.equal(p(44).fieldStatus.tuition.status,'unknown');assert.equal(p(44).fieldStatus.deadline.status,'unknown');assert.equal(programmeTimeline(resolve(44),'2026-10-31').state,'dates_incomplete');
 assert.equal([...contexts.values()].some(c=>c.programmeId===p(44).id),false);assert.match(academic(44),/80-hour.*not prior work/);assert.equal(p(44).rules.some(r=>r.kind==='experience'),false);
});

test('Sport preserves the old TOEFL Writing minimum while explicit new-test acceptance does not create a numeric conversion',()=>{
 const r=p(48).rules.find(r=>r.kind==='language');assert.equal(r.tests.toefl_120.total,74);assert.equal(r.tests.toefl_120.componentMins.writing,21);assert.equal(r.tests.toefl_6,undefined);
 const score=(total,writing)=>match(48,{language:{type:'toefl_120',total,components:{writing},singleAttempt:true,testDate:'2025-12-01'}}).checks.find(c=>c.kind==='language');
 assert.equal(score(80,20).status,'fail');assert.equal(score(74,21).status,'pass');assert.equal(score(80,null).status,'unknown');
 assert.equal(match(48,{language:{type:'toefl_6',total:6,singleAttempt:true,testDate:'2026-10-01'}}).checks.find(c=>c.kind==='language').status,'unknown');
 assert.match(academic(48),/New 1–6 TOEFL is expressly accepted.*no exact 1–6 cutoff/);
 for(const n of [21,22,48]){const rule=p(n).rules.find(r=>r.kind==='language');assert.equal(rule.validityMonths,undefined);assert.equal(rule.testDateNotBefore,undefined);}
 const lower=match(22,{language:{...profile.language,total:6}});assert.equal(lower.checks.find(c=>c.kind==='language').status,'pass');assert.equal(lower.status,'needs_confirmation');assert.match(academic(22),/English enhancement/);
});

test('isolated restarts preserve all unrelated earlier parents, stable IDs and category fingerprints',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hkbu-remaining-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,297);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,193);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,529);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all 80 new option/category combinations survive actual details, matches, saved restore and privacy-safe export',async()=>{
 let visits=0;for(const id of obs.programmeIds){const x=store.get(id);for(const o of x.offerings){const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);for(const cat of plan?['LOCAL','NONLOCAL']:[null]){
  const applicant=cat?o.id+'-'+cat:undefined,query=new URLSearchParams({offering:o.id,...(applicant?{applicant}:{})});const response=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(response.status,200);const d=await response.json(),fee=plan?(cat==='LOCAL'?plan.localFee:plan.nonLocalFee):o.tuition;
  assert.equal(d.offerings[0].tuition,fee);assert.equal(d.offerings[0].applicationFee,450);const saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z');
  const restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,fee);
  const exported=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exported.offerings[0].tuition,fee);assert.equal(exported.profile,undefined);assert.equal(exported.match,undefined);
  const matches=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:applicant?{[id]:applicant}:{}})});assert.equal(matches.status,200);assert.equal((await matches.json()).items.find(p=>p.id===id).match.tier,null);visits++;
 }}}assert.equal(visits,80);
});
