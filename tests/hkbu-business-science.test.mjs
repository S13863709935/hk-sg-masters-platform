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
const batch=read('data/checked-programmes.json'),obs=read('data/research/hkbu-business-science-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKBU-P${String(n).padStart(3,'0')}`),academic=n=>p(n).rules.find(r=>r.labelEn==='Programme-specific academic and study conditions').noteEn;
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'ordinary',gpa:2.8,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2026-05-01',singleAttempt:true}};
const match=(n,changes={})=>matchProgramme(p(n),{...profile,...changes});
const language=(n,changes)=>match(n,{language:{...profile.language,...changes}}).checks.find(c=>c.kind==='language');
const resolve=(n,tag='FT',category)=>{const id=p(n).id,o=id+'-2027-'+tag;return resolveProgramme(p(n),routes,undefined,o,category?o+'-'+category:undefined,contexts);};

test('twenty existing HKBU identities gain partial English evidence without duplicating awards or claiming reviews',()=>{
 assert.equal(obs.programmeIds.length,20);assert.equal(new Set(obs.programmeIds).size,20);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,392);assert.equal(store.quality().complete,0);assert.deepEqual(store.quality().sourceRefreshConflicts,[]);
 assert.equal(store.all().filter(x=>x.universityId==='HK-HKBU'&&x.verification==='programme_page_checked').length,49);
 assert.deepEqual(routeSummary(routes),{groups:23,routes:53,pageChecked:53,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:271,categories:546,peerReviewed:0});
 for(const id of obs.programmeIds){const x=batch.programmes.find(x=>x.id===id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(x)),false);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-31');assert.equal(batch.pilotProgrammeIds.includes(id),false);assert.ok(x.sources.some(s=>s.url===x.officialUrl&&s.checkedOn===x.lastChecked));}
});

test('category-specific prices stay masked until selection, while shared amounts and mode-specific fees stay exact',()=>{
 for(const [n,lf,nf] of [[5,250000,315000],[6,235000,308000],[23,227000,285000],[30,260000,300000],[31,248000,318000],[37,220000,260000],[38,240000,298000]]){
  assert.equal(resolve(n).offerings[0].tuition,null);assert.equal(resolve(n).offerings[0].deadline,null);
  assert.equal(resolve(n,'FT','LOCAL').offerings[0].tuition,lf);assert.equal(resolve(n,'FT','NONLOCAL').offerings[0].tuition,nf);
 }
 assert.deepEqual(p(29).offerings.map(o=>[o.mode,o.duration,o.tuition]),[['Full-time','1 year',270000],['Part-time','1.5 years',255000]]);
 assert.equal(p(4).offerings[0].tuition,180000);assert.equal(p(33).offerings[0].tuition,298000);assert.equal(p(35).offerings[1].tuition,335000);
 assert.match(p(5).offerings[0].feeBasis,/5,000 each/);assert.match(p(38).offerings[0].feeBasis,/up to HKD 10,000.*not deducted/);
 assert.ok(obs.programmeIds.flatMap(id=>store.get(id).offerings).every(o=>o.applicationFee===450));
});

test('programme opening and local/non-local final dates and explicit rounds cannot leak across categories',()=>{
 for(const plan of obs.applicantContextPlan){const n=Number(plan.programmeId.slice(-3)),tag=plan.offeringId.endsWith('-FT')?'FT':'PT';
  for(const [cat,fee,date] of [['LOCAL',plan.localFee,plan.localDeadline],['NONLOCAL',plan.nonLocalFee,plan.nonLocalDeadline]]){
   const x=resolve(n,tag,cat),o=x.offerings[0];assert.equal(o.tuition,fee);assert.equal(o.deadline,date);assert.equal(o.applicationRounds.at(-1).deadline,date);assert.equal(x.applicantContextStatus,'available');assert.equal(o.feeEvidence.checkedOn,'2026-10-31');
  }
 }
 assert.equal(resolve(6,'FT','NONLOCAL').offerings[0].deadline,'2027-05-17');
 assert.deepEqual(resolve(28,'FT','NONLOCAL').offerings[0].applicationRounds.map(r=>r.deadline),['2027-02-28','2027-04-30','2027-06-07']);
 assert.deepEqual(resolve(28,'PT','LOCAL').offerings[0].applicationRounds.map(r=>r.deadline),['2027-02-28','2027-04-30','2027-07-30']);
 assert.equal(p(28).offerings[1].duration,'1.5 years');assert.equal(p(29).offerings[0].applicationOpen,'2027-01-04');
 assert.equal(programmeTimeline(resolve(29),'2026-10-31').state,'not_yet_open');
 assert.equal(resolve(30,'FT','NONLOCAL').offerings[0].applicationOpen,'2026-10-06');
 assert.equal(resolve(26,'FT','LOCAL').offerings[0].applicationOpen,'2026-09-10');
 assert.throws(()=>resolveProgramme(p(5),routes,undefined,p(5).offerings[0].id,p(30).offerings[0].id+'-LOCAL',contexts));
});

test('Putonghua MBA keeps the Hong Kong weekend format and distinct qualification/experience branches',()=>{
 assert.deepEqual(p(19).offerings.map(o=>[o.mode,o.duration]),[['Full-time','2 years']]);
 assert.equal(resolve(19,'FT','LOCAL').offerings[0].tuition,550000);assert.match(academic(19),/Putonghua.*weekend classes in Hong Kong/);
 assert.equal(p(19).rules.some(r=>r.kind==='language'),false);assert.equal(p(19).fieldStatus.language.status,'unknown');
 assert.equal(match(19,{experienceYears:2}).checks.find(c=>c.kind==='experience').status,'fail');
 const m=match(19,{experienceYears:3,language:{type:'ielts',total:1}});assert.equal(m.checks.find(c=>c.kind==='experience').status,'pass');assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);
 assert.match(academic(19),/Benke plus six.*eight full-time managerial/);
});

test('diploma alternatives and work preferences never become mandatory bachelor work thresholds',()=>{
 for(const n of [23,26,28,29,34,35,36,42])assert.equal(p(n).rules.some(r=>r.kind==='experience'),false);
 assert.match(academic(23),/four work years.*NOT a universal/);assert.match(academic(34),/five relevant.*NOT imposed on all bachelor/);
 assert.match(academic(29),/PREFERRED, not mandatory/);assert.match(academic(35),/preference that may be relaxed/);
 for(const n of [23,26,29,34,35,36,42])assert.equal(match(n).checks.some(c=>c.kind==='experience'&&c.status==='fail'),false);
});

test('non-business preparation and exact named science fields remain useful without excluding assessed alternatives',()=>{
 for(const n of [5,6,26,33,38])assert.equal(match(n,{major:'History'}).checks.find(c=>c.kind==='major').status,'pass');
 for(const n of [27,30,37,39,40])assert.equal(match(n,{major:'History'}).checks.find(c=>c.kind==='major').status,'unknown');
 assert.equal(match(27,{major:'Chemistry'}).checks.find(c=>c.kind==='major').status,'pass');
 assert.equal(match(37,{major:'Business'}).checks.find(c=>c.kind==='major').status,'pass');
 for(const n of [39,40])assert.equal(match(n,{major:'Computer Science'}).checks.find(c=>c.kind==='major').status,'pass');
 for(const n of [28,35,42])assert.equal(p(n).rules.some(r=>r.kind==='major'&&!r.relatedAllowed),false);
 assert.match(academic(42),/online preparatory modules AND a one-day/);assert.match(academic(35),/OR assigned preparatory courses/);
});

test('no scholarship, exit-award or curriculum GPA becomes an undergraduate entry cutoff',()=>{
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.fieldStatus.gpa.status,'not_published');assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='classification'),false);}
 assert.match(academic(30),/scholarship GPA.*not undergraduate/);assert.match(academic(4),/CGPA 2.5.*not.*admission GPA/);
 assert.equal(obs.records.find(r=>r.programmeId===p(40).id).minimumCredits,40);assert.equal(obs.records.find(r=>r.programmeId===p(37).id).minimumCredits,29);
});

test('English enhancement is an assessed branch rather than a universal normal-route failure or complete pass',()=>{
 for(const n of [27,34]){assert.equal(language(n,{total:6}).status,'pass');assert.equal(language(n,{total:5.5}).status,'fail');assert.equal(match(n,{language:{...profile.language,total:6}}).status,'needs_confirmation');assert.match(academic(n),/English enhancement/);}
 assert.equal(language(34,{type:'toefl_120',total:74,testDate:'2025-12-01'}).status,'pass');
 assert.equal(language(4,{total:6}).status,'pass');assert.equal(language(23,{total:6}).status,'fail');
 assert.match(academic(42),/CET-6 470.*not CET-6 450/);
});

test('unpublished new TOEFL thresholds and offer-letter-relative validity do not gain invented conversions or rolling dates',()=>{
 for(const id of obs.programmeIds.filter(id=>![p(19).id,p(36).id].includes(id))){const n=Number(id.slice(-3)),r=p(n).rules.find(r=>r.kind==='language');
  assert.equal(r.tests.toefl_6,undefined);assert.equal(r.validityMonths,undefined);assert.equal(r.testDateNotBefore,undefined);
  assert.equal(language(n,{type:'toefl_6',total:6,testDate:'2026-10-01'}).status,'unknown');
  assert.equal(language(n,{type:'waiver',total:null,components:{},waiverBasis:'english_degree'}).status,'unknown');
  assert.equal(language(n,{atHome:true,total:9}).status,'fail');
 }
 assert.equal(language(5,{total:9,testDate:'2020-01-01'}).status,'pass');assert.equal(match(5,{language:{...profile.language,total:9,testDate:'2020-01-01'}}).status,'needs_confirmation');
 assert.match(p(5).rules.find(r=>r.labelEn==='English evidence, alternatives and validity').noteEn,/Admission Offer letter.*no rolling/);
 assert.match(academic(26),/which opening.*anchor needs confirmation/);
});

test('EGM retains January 2028 and refuses to combine conflicting central/department deadlines',()=>{
 assert.equal(p(33).offerings[0].intake,'January 2028');assert.equal(p(33).offerings[0].duration,'1.25 years');
 assert.equal(p(33).offerings[0].deadline,null);assert.equal(p(33).offerings[0].applicationRounds,undefined);assert.equal(p(33).fieldStatus.deadline.status,'unknown');
 assert.equal(programmeTimeline(resolve(33),'2026-10-31').state,'dates_incomplete');
 assert.deepEqual(obs.boundaries.egm.departmentDeadlines,['2026-11-30','2027-01-31','2027-03-31','2027-07-24']);
 assert.match(academic(33),/Grenoble double degree is OPTIONAL.*France/);assert.equal(p(33).scope?.status==='out_of_scope',false);
 assert.equal(language(33,{total:6.5,components:{listening:6,reading:6,writing:5.5,speaking:6}}).status,'fail');
 assert.equal(language(33,{type:'toefl_120',total:90,testDate:'2025-12-01',components:{listening:21,reading:21,writing:20,speaking:28}}).status,'fail');
});

test('Reading OR Listening remains a mandatory disjunction, not an accidental AND or an overall-only qualification',()=>{
 for(const n of [39,40]){
  const rule=p(n).rules.find(r=>r.kind==='language');assert.equal(rule.tests.ielts.componentMin,undefined);assert.equal(rule.tests.ielts.componentMins,undefined);
  for(const components of [{listening:6.5,reading:5.5},{listening:5.5,reading:6.5},{listening:5.5,reading:5.5}]){
   const m=match(n,{language:{...profile.language,total:6,components}});assert.equal(m.checks.find(c=>c.kind==='language').status,'pass');assert.equal(m.status,'needs_confirmation');assert.ok(m.checks.some(c=>c.kind==='manual'&&/Reading at least 6.5 OR Listening/.test(c.reasonEn)));
  }
 }
});

test('required overseas component and unconfirmed partner delivery are explicit without fabricating exclusions or extra parents',()=>{
 assert.equal(p(38).scope.status,'unconfirmed');assert.match(p(38).scope.reasonEn,/required overseas.*destination.*unconfirmed/i);
 assert.equal(p(40).scope.status,'unconfirmed');assert.match(p(40).scope.reasonEn,/does not establish required UK attendance/);
 for(const n of [38,40]){const m=match(n);assert.equal(m.status,'needs_confirmation');assert.ok(m.checks.some(c=>c.kind==='scope'&&c.status==='unknown'));assert.equal(m.tier,null);}
 assert.equal(read('data/programme-scope-audit.json').decisions.length,7);assert.equal(store.quality().browsable,865);
});

test('isolated repeated source migration preserves earlier objects, stable IDs and category bindings',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hkbu-business-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,392);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,271);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,716);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});
test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all 63 batch option/category combinations survive actual details, matches, saved restore and private-data-free export',async()=>{
 let visits=0;
 for(const id of obs.programmeIds){const x=store.get(id);for(const o of x.offerings){const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);for(const cat of plan?['LOCAL','NONLOCAL']:[null]){
  const applicant=cat?o.id+'-'+cat:undefined,query=new URLSearchParams({offering:o.id,...(applicant?{applicant}:{})});
  const res=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(res.status,200);const d=await res.json(),expected=plan?(cat==='LOCAL'?plan.localFee:plan.nonLocalFee):o.tuition;
  assert.equal(d.offerings[0].tuition,expected);assert.equal(d.offerings[0].applicationFee,450);assert.equal(d.selectedApplicant?.id,applicant);
  const saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z'),restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});
  assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,expected);
  const exported=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exported.offerings[0].tuition,expected);assert.equal(exported.profile,undefined);assert.equal(exported.match,undefined);
  const result=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:applicant?{[id]:applicant}:{}})});
  assert.equal(result.status,200);assert.equal((await result.json()).items.find(p=>p.id===id).match.tier,null);visits++;
 }}}
 assert.equal(visits,63);
});
