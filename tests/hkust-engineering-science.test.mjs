import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp,filterProgrammes} from '../server/app.mjs';
import {loadRoutes,resolveProgramme} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hkust-engineering-science-observation-2026-10-30.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes),p=n=>store.get(`HK-HKUST-P${String(n).padStart(3,'0')}`);
const profile={major:'Chemical Engineering',degreeStatus:'graduated',classification:'second_lower',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2026-09-01',singleAttempt:true}};
const choose=(n,mode='Full-time',category)=>{const x=p(n),o=x.offerings.find(o=>o.mode===mode);return resolveProgramme(x,routes,undefined,o.id,category?o.id+'-'+category:undefined,contexts);};
const note=(n,label)=>p(n).rules.find(r=>r.labelEn===label).noteEn;

test('fifteen existing IDs gain twenty-eight options; a separate delivery exclusion does not add awards or full reviews',()=>{
 assert.equal(obs.programmeIds.length,15);assert.equal(new Set(obs.programmeIds).size,15);assert.equal(obs.programmeIds.reduce((s,id)=>s+store.get(id).offerings.length,0),28);
 const q=store.quality();assert.equal(q.total,873);assert.equal(q.checked,384);assert.equal(q.browsable,865);assert.equal(q.outOfScope,7);assert.equal(q.complete,0);assert.equal(q.peerReviewed,0);assert.deepEqual(q.sourceRefreshConflicts,[]);
 assert.equal(store.all().filter(x=>x.universityId==='HK-HKUST'&&x.verification==='programme_page_checked').length,48);
 assert.deepEqual(applicantSummary(contexts),{studyOptions:258,categories:520,peerReviewed:0});
 for(const id of obs.programmeIds){const x=batch.programmes.find(x=>x.id===id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(x)),false);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-30');assert.equal(batch.pilotProgrammeIds.includes(id),false);assert.equal(x.rules.some(r=>r.kind==='gpa'),false);}
});

test('programme fees and modes retain smaller-award, credit-load and annual-price boundaries',()=>{
 for(const r of obs.records){const n=Number(r.programmeId.slice(-3));assert.equal(p(n).offerings[0].tuition,r.fullTimeFeeHkd);assert.equal(p(n).offerings[0].applicationFee,r.applicationFeeHkd);assert.notEqual(p(n).offerings[0].tuitionEstimate,true);if(r.partTimeFeeHkd!==null)assert.equal(p(n).offerings[1].tuition,r.partTimeFeeHkd);else assert.equal(p(n).offerings.length,1);}
 assert.equal(p(27).offerings.length,2);for(const o of p(27).offerings){assert.notEqual(o.tuition,105000);assert.match(o.feeBasis,/15|PGD HKD 105,000/);assert.match(o.feeBasis,/PGD graduates later admitted to MSc also pay the full MSc/);}
 assert.equal(p(27).offerings[0].duration,'1–1.5 years');assert.equal(p(27).offerings[1].duration,'2–2.5 years');
 assert.match(p(28).offerings[0].feeBasis,/5,834 each/);assert.equal(p(28).offerings[0].tuition,175000);assert.notEqual(5834*30,175000);
});

test('Biotechnology has August entry, 26 minimum credits, 1.5-year part-time and conditional daytime labs',()=>{
 assert.ok(p(18).offerings.every(o=>o.intake==='August 2027'&&o.id.includes('-AUG2027-')));assert.equal(p(18).offerings[1].duration,'1.5 years');
 for(const o of p(18).offerings)assert.match(o.feeBasis,/26 credits is not a compulsory 31-credit plan/);
 assert.match(note(18,'Programme-specific academic and study conditions'),/Daytime laboratory work applies to specified research-project choices/);
 assert.equal(p(18).rules.some(r=>r.kind==='classification'),false);assert.equal(p(18).offerings.some(o=>/January|February/.test(o.intake)),false);
});

test('Aeronautical opposite June-category allocations remain unresolved despite matching fees',()=>{
 assert.equal(obs.boundaries.aeronautical.catalogueJuneCategory,'non-local');assert.equal(obs.boundaries.aeronautical.departmentJuneCategory,'local');assert.equal(obs.boundaries.aeronautical.resolvedFinalDeadline,null);
 assert.equal(p(13).fieldStatus.deadline.status,'unknown');assert.ok(p(13).sources.some(s=>s.url===obs.boundaries.aeronautical.departmentUrl));
 for(const o of p(13).offerings){assert.equal(o.deadline,null);assert.equal(o.applicationRounds,undefined);assert.equal(programmeTimeline(choose(13,o.mode),'2026-10-30').state,'dates_incomplete');}
 assert.equal([...contexts.values()].some(c=>c.programmeId===p(13).id),false);assert.match(note(13,'Conflicting applicant-category final rounds'),/central catalogue.*non-local.*engineering page.*local/);
 assert.deepEqual(p(13).offerings.map(o=>o.tuition),[249000,216000]);
});

test('exact category/mode/intake bindings retain engineering and science fall dates without an earlier-spring substitution',()=>{
 assert.equal(obs.applicantContextPlan.length,22);
 for(const plan of obs.applicantContextPlan){const x=store.get(plan.programmeId),o=x.offerings.find(o=>o.id===plan.offeringId),n=Number(x.id.slice(-3));assert.equal(programmeTimeline(choose(n,o.mode),'2026-10-30').state,'applicant_required');
  for(const [category,dates] of [['LOCAL',plan.local],['NONLOCAL',plan.nonLocal]]){const chosen=choose(n,o.mode,category);assert.deepEqual(chosen.offerings[0].applicationRounds.map(r=>r.deadline),dates);assert.equal(chosen.offerings[0].deadline,dates.at(-1));assert.equal(chosen.offerings[0].academicYear,'2027/28');assert.equal(chosen.offerings[0].tuition,o.tuition);assert.equal(chosen.offerings[0].applicationOpen,null);}
  const other=x.offerings.find(y=>y.id!==o.id);assert.throws(()=>resolveProgramme(x,routes,undefined,o.id,other.id+'-LOCAL',contexts));
 }
 for(const n of [20,27,41,14,18,22,26])assert.ok(p(n).offerings.every(o=>!/January|February/.test(o.intake)));
 assert.deepEqual(p(20).offerings[0].applicationRounds.map(r=>r.deadline),['2026-12-01','2027-03-01']);
});

test('ordinary second-class gates are distinct from preferred backgrounds, integrated conditions and GPA conversions',()=>{
 const required=[13,14,17,27,28,41,44,46];
 for(const n of required){assert.equal(p(n).rules.find(r=>r.kind==='classification').min,'second_lower');assert.equal(matchProgramme(p(n),profile).checks.find(c=>c.kind==='classification').status,'pass');assert.equal(matchProgramme(p(n),{...profile,classification:'third',gpa:4}).checks.find(c=>c.kind==='classification').status,'fail');assert.equal(matchProgramme(p(n),{...profile,classification:null,gpa:4}).checks.find(c=>c.kind==='classification').status,'unknown');}
 for(const n of [18,20,22,25,26,45,47])assert.equal(p(n).rules.some(r=>r.kind==='classification'),false);
 assert.equal(p(25).fieldStatus.major.status,'not_published');assert.equal(p(25).rules.some(r=>r.kind==='major'),false);
 assert.match(note(20,'Programme-specific academic and study conditions'),/at least five foundation courses/);assert.match(note(45,'Programme-specific academic and study conditions'),/multivariable calculus, linear algebra and differential equations/);
});

test('Physics work is an alternative, not a universal gate; DRAP and BEHI retain explicit computing/business routes',()=>{
 assert.match(note(47,'Programme-specific academic and study conditions'),/OR another discipline with at least two relevant full-time post-qualification work years/);assert.equal(p(47).rules.some(r=>r.kind==='experience'),false);
 assert.equal(matchProgramme(p(47),{...profile,major:'Computer Science',experienceYears:0}).checks.find(c=>c.kind==='major').status,'pass');
 assert.ok(p(17).rules.find(r=>r.kind==='major').accepted.includes('Computer Science'));assert.ok(p(22).rules.find(r=>r.kind==='major').accepted.includes('Business Management'));
 for(const n of [22,26])assert.equal(p(n).rules.some(r=>r.kind==='experience'),false);
});

test('marine UK delivery is excluded independently of applicant strength and never gets a cheap HKD-only offering',async()=>{
 const x=p(35);assert.equal(x.verification,'catalogue_seed');assert.equal(x.scope.status,'out_of_scope');assert.match(x.scope.reasonEn,/Southampton.*UK/);assert.equal(batch.programmes.some(y=>y.id===x.id),false);
 assert.equal(filterProgrammes(store.all(),{school:'HK-HKUST'}).some(y=>y.id===x.id),false);assert.equal(filterProgrammes(store.all(),{school:'HK-HKUST',includeOutOfScope:'true'}).some(y=>y.id===x.id),true);
 const result=matchProgramme(x,{...profile,gpa:4});assert.equal(result.status,'out_of_scope');assert.equal(result.counts.fail,0);assert.equal(result.tier,null);
 const d=await (await fetch(base+'/api/programmes/'+x.id)).json();assert.equal(d.scope.status,'out_of_scope');assert.ok(d.offerings.every(o=>o.tuition===null));assert.equal(shortlistExport([d],{}).programmes[0].scope.status,'out_of_scope');
});

test('isolated repeated imports preserve older records and exactly bind the 64 contexts with scope applied',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hkust-engineering-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,384);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,258);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-30');assert.equal(q.counts.reviewUnits,689);assert.equal(q.counts.nearCutoffUnits,3);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-30T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});

test('all 28 study options and both category choices preserve details, comparison inputs, saved restore and privacy-safe export',async()=>{
 let visits=0;
 for(const id of obs.programmeIds)for(const o of store.get(id).offerings){const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);for(const suffix of plan?['LOCAL','NONLOCAL']:[null]){
  const applicant=suffix?o.id+'-'+suffix:undefined,query=new URLSearchParams({offering:o.id,...(applicant?{applicant}:{})}),res=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(res.status,200);const d=await res.json();assert.equal(d.offerings[0].tuition,o.tuition);assert.equal(d.offerings[0].applicationFee,o.applicationFee);
  const saved=optionSnapshot(d,'2026-10-30T08:00:00.000Z'),restore=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restore.status,200);assert.equal((await restore.json()).items[0].status,'resolved');
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].id,o.id);assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const m=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:applicant?{[id]:applicant}:{}})});assert.equal(m.status,200);const match=(await m.json()).items.find(x=>x.id===id).match;assert.equal(match.tier,null);assert.notEqual(match.status,'meets_checked');visits++;
 }}assert.equal(visits,50);
});
