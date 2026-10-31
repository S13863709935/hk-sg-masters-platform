import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme, routeSummary } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root=new URL('../',import.meta.url), read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'), obs=read('data/research/cityu-professional-streams-observation-2026-10-30.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options), routePath=new URL('data/route-programmes.json',root), contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()), applicants=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-CITYU-P${String(n).padStart(3,'0')}`), bis=p(37), siblings=routes.get(bis.id);
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'first',gpa:4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:8,testDate:'2026-09-01',singleAttempt:true}};
const note=(x,label)=>x.rules.find(r=>r.labelEn===label).noteEn;
const select=(x,o,category)=>resolveProgramme(x,routes,undefined,o.id,category?o.id+'-'+category:undefined,applicants);

test('six existing IDs and two separate BIS snapshots preserve counts without new degrees or full approvals',()=>{
 assert.equal(obs.programmeIds.length,6); assert.equal(new Set(obs.programmeIds).size,6);
 assert.equal(store.quality().checked,174); assert.equal(store.quality().total,873); assert.equal(store.quality().browsable,869);
 assert.equal(store.quality().complete,0); assert.equal(store.quality().peerReviewed,0); assert.deepEqual(store.quality().sourceRefreshConflicts,[]);
 assert.equal(store.all().filter(x=>x.universityId==='HK-CITYU'&&x.verification==='programme_page_checked').length,60);
 assert.deepEqual(routeSummary(routes),{groups:7,routes:17,pageChecked:17,peerReviewed:0,complete:0});
 assert.deepEqual(applicantSummary(applicants),{studyOptions:78,categories:158,peerReviewed:0});
 for(const x of [...obs.programmeIds.map(id=>store.get(id)),...siblings]){
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(y=>y.id===x.id)||x)),false);
  assert.equal(x.requirementsCoverage,'partial'); assert.equal(x.reviewer,null); assert.equal(x.lastChecked,'2026-10-30');
  assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);
 }
});

test('law credit loads are explicit conditional estimates, never one universal 30-credit price',()=>{
 for(const [n,loads,totals] of [[23,[24,30],[206400,258000]],[24,[30,33],[228000,250800]]]){
  const x=p(n); assert.equal(x.offerings.length,4);
  for(const [i,c] of loads.entries()) for(const o of x.offerings.filter(o=>o.id.includes(`-${c}CU-`))){
   const chosen=select(x,o,'NONLOCAL'); assert.equal(chosen.offerings[0].tuition,totals[i]);
   assert.equal(chosen.offerings[0].tuitionEstimate,true); assert.match(chosen.offerings[0].feeBasis,/school confirmation is required/);
   assert.equal(matchProgramme(chosen,profile).status,'needs_confirmation'); assert.equal(matchProgramme(chosen,profile).tier,null);
  }
 }
 assert.match(note(p(24),'Exemption and award boundary'),/CGPA 2.00 intermediate-diploma exit rule is not an undergraduate entry GPA/);
 assert.match(p(24).notesEn,/within eight years/);
});

test('local/non-local cutoffs bind to the exact law load and mode and cannot be borrowed across options',()=>{
 for(const [n,local] of [[23,'2027-06-30'],[24,'2027-05-31']]){
  const x=p(n);
  for(const o of x.offerings){
   assert.equal(programmeTimeline(select(x,o),'2026-10-30').state,'applicant_required');
   for(const [category,date] of [['LOCAL',local],['NONLOCAL','2027-04-30']]){
    const chosen=select(x,o,category);assert.equal(chosen.offerings[0].deadline,date);
    assert.equal(programmeTimeline(chosen,date).state,'deadline_today');assert.equal(chosen.offerings[0].applicationFee,600);
   }
   const other=x.offerings.find(y=>y.id!==o.id); assert.throws(()=>resolveProgramme(x,routes,undefined,o.id,other.id+'-LOCAL',applicants));
  }
 }
});

test('law alternatives, stream exclusions and conflicting August 2026 preparation year remain manual',()=>{
 const x=p(23), text=note(x,'Programme-specific academic and study conditions');
 assert.match(text,/alternative legal qualifications or professional admission/);assert.match(text,/only for the corresponding Maritime or IP stream/);
 assert.match(text,/Common-law-qualified applicants cannot enter the Common Law Stream/);assert.match(text,/Mainland LLB holders cannot enter Chinese and Comparative Law/);
 assert.equal(x.rules.some(r=>r.kind==='major'&&r.any),false);assert.equal(x.rules.some(r=>r.kind==='experience'),false);
 assert.match(note(x,'Foundation load and conflicting preparation date'),/August 2026.*not changed to August 2027/);
 assert.equal(obs.boundaries.LLM.preparationDate,null); assert.ok(x.offerings.every(o=>o.intake==='2027 entry'));
 const r=matchProgramme(x,{...profile,major:'Business',experienceYears:4});assert.equal(r.status,'needs_confirmation'); assert.equal(r.tier,null);
});

test('law higher English scores and independent old/new TOEFL scales do not copy neighbouring triggers',()=>{
 for(const n of [23,24]){
  const x=p(n), language=l=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
  const common={testDate:'2026-09-01',singleAttempt:true};assert.equal(language({type:'ielts',total:6,...common}).status,'fail');
  assert.equal(language({type:'ielts',total:6.5,...common}).status,'pass');
  assert.equal(language({type:'toefl_6',total:4,...common}).status,'fail');assert.equal(language({type:'toefl_6',total:4.5,...common}).status,'pass');
  assert.equal(language({type:'toefl_120',total:87,testDate:'2025-09-01',singleAttempt:true}).status,'fail');
  assert.equal(language({type:'toefl_120',total:88,testDate:'2025-09-01',singleAttempt:true}).status,'pass');
  assert.match(note(x,'English applicability, alternatives and test formats'),/CET-6 520.*three-year/);
 }
 assert.equal(p(25).rules.find(r=>r.kind==='language').tests.ielts.total,6);
});

test('BIS routes require explicit selection and keep MIS preference separate from FIT preparation',()=>{
 const unselected=resolveProgramme(bis,routes,undefined,undefined,undefined,applicants);
 assert.equal(unselected.routeOptions.length,2);assert.ok(matchProgramme(unselected,profile).checks.some(c=>c.kind==='route'));
 assert.throws(()=>resolveProgramme(bis,routes,undefined,siblings[0].offerings[0].id,undefined,applicants));
 for(const x of siblings){
  const resolved=resolveProgramme(bis,routes,x.routeId,x.offerings[0].id,undefined,applicants), r=matchProgramme(resolved,profile);
  assert.equal(r.status,'needs_confirmation');assert.equal(r.tier,null);assert.equal(resolved.offerings[0].tuition,330000);
  assert.equal(r.checks.some(c=>c.kind==='route'),false);
  const text=note(resolved,'Programme-specific academic and study conditions');
  if(x.routeId.endsWith('-MIS')){assert.match(text,/preference, not a hard ban/);assert.doesNotMatch(text,/requires.*intermediate/);}
  else {assert.match(text,/intermediate IT\/IS or Finance\/Accounting/);assert.match(text,/major label alone does not prove/);}
 }
 assert.throws(()=>resolveProgramme(bis,routes,siblings[0].routeId,siblings[1].offerings[0].id,undefined,applicants));
});

test('veterinary professional entry, MPH stream quota and business mathematics stay visible despite high scores',()=>{
 assert.match(note(p(28),'Programme-specific academic and study conditions'),/BVM.*DVM/);
 assert.equal(p(28).rules.some(r=>r.kind==='major'&&r.any),false);assert.equal(p(28).offerings.length,1);assert.equal(p(28).offerings[0].tuition,300000);
 assert.match(p(25).notesEn,/Global has limited quota and may require an interview/);assert.equal(p(25).offerings[0].tuition,297000);
 assert.match(p(36).notesEn,/appropriate mathematical knowledge/);assert.match(p(36).notesEn,/alternative streams under one P84/);
 assert.equal(p(36).offerings[0].tuition,360000);
 for(const n of [25,28,36])assert.notEqual(matchProgramme(p(n),profile).status,'meets_checked');
});

test('EMBA and legacy Civil holds remain leads without merging Chinese experience rules or attaching P60 data',()=>{
 for(const n of [3,9]){assert.equal(p(n).verification,'catalogue_seed');assert.equal(routes.has(p(n).id),false);assert.equal(p(n).rules.length,0);}
 assert.equal(obs.boundaries.EMBA.decision,'retain_catalogue_lead');assert.match(obs.boundaries.EMBA.notesEn,/not imported into P12/);
 assert.match(obs.boundaries.EMBA.notesEn,/HKD 1000/);assert.equal(obs.boundaries.civil.decision,'retain_legacy_identity_hold');
 const q=loadRepositoryReviewQueue('2026-10-30');assert.equal(q.counts.reviewUnits,269);assert.equal(q.counts.nearCutoffUnits,3);assert.equal(q.counts.staleApplicantContexts,0);
});

test('isolated imports preserve all earlier records over restarts and route/context evidence still validates',()=>{
 const ids=new Set(obs.programmeIds), before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))};
 const dir=mkdtempSync(join(tmpdir(),'gradpath-cityu-professional-')), file=join(dir,'test.sqlite'), checkedPath=join(dir,'checked.json');let db;
 try{
  writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;
  writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);
   const ri=loadRoutes(routePath,db.all());assert.equal(ri.get(bis.id).length,2);assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,78);db.close();db=null;}
 }finally{db?.close();for(const f of [file,checkedPath])rmSync(f,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-30T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});
test.after(async()=>{await new Promise(r=>app.close(r));store.close();});

test('all seventeen represented choices retain exact load, route, category, date and fee through matching/restore/export',async()=>{
 const choices=obs.programmeIds.filter(id=>id!==bis.id).flatMap(id=>store.get(id).offerings.map(o=>({p:store.get(id),o,route:undefined})));
 for(const r of siblings)for(const o of r.offerings)choices.push({p:bis,o,route:r.routeId});assert.equal(choices.length,17);
 for(const {p:x,o,route} of choices){
  const category=[p(23).id,p(24).id].includes(x.id)?o.id+'-NONLOCAL':undefined;
  const query=new URLSearchParams({offering:o.id,...(route?{route}:{}),...(category?{applicant:category}:{})});
  const response=await fetch(`${base}/api/programmes/${x.id}?${query}`);assert.equal(response.status,200);const detail=await response.json();
  assert.equal(detail.offerings[0].tuition,o.tuition);assert.equal(detail.offerings[0].applicationFee,600);
  const saved=optionSnapshot(detail,'2026-10-30T08:00:00.000Z');
  const restore=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});
  assert.equal(restore.status,200);assert.equal((await restore.json()).items[0].status,'resolved');
  const exp=shortlistExport([detail],{[x.id]:saved}).programmes[0];assert.equal(exp.offerings[0].id,o.id);assert.equal(exp.offerings[0].tuition,o.tuition);assert.equal(exp.profile,undefined);
  const match=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:route?{[x.id]:route}:{},selectedOfferings:{[x.id]:o.id},selectedApplicants:category?{[x.id]:category}:{}})});
  assert.equal(match.status,200);const matched=(await match.json()).items.find(y=>y.id===x.id);assert.ok(matched);assert.equal(matched.match.tier,null);assert.notEqual(matched.match.status,'meets_checked');
 }
});
