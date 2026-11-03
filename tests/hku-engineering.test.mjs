import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-engineering-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),academic=x=>x.rules.find(r=>r.labelEn==='Programme-specific academic and study conditions').noteEn;
const profile={major:'Computer Science',degreeStatus:'graduated',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5},testDate:'2025-09-01'}};
const snapshots=()=>[...obs.programmeIds.map(id=>store.get(id)),...obs.routeRecords.map(r=>routes.get(r.programmeId).find(x=>x.routeId===r.routeId))];
const resolve=(plan,cat)=>resolveProgramme(store.get(plan.programmeId),routes,plan.routeId,plan.offeringId,cat?plan.offeringId+'-'+cat:undefined,contexts);
const direct=(n,tag='FT',cat='LOCAL')=>resolve(obs.applicantContextPlan.find(x=>x.programmeId===p(n).id&&x.offeringId.endsWith('-'+tag)),cat);

test('twelve existing direct awards and nine exact streams retain distinct catalogue and evidence counts',()=>{
 assert.equal(obs.programmeIds.length,12);assert.equal(obs.routeRecords.length,9);assert.equal(obs.applicantContextPlan.length,38);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,384);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:20,routes:47,pageChecked:47,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:258,categories:520,peerReviewed:0});
 for(const x of snapshots()){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-31');const source=x.routeId?x:batch.programmes.find(p=>p.id===x.id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(source)),false);assert.equal(x.rules.some(r=>['gpa','classification','experience'].includes(r.kind)),false);}
});

test('each grouped parent remains unselected and cannot silently supply a sibling stream or fee context',()=>{
 for(const [n,count] of [[69,4],[70,3],[73,2]]){const x=resolveProgramme(p(n),routes,undefined,undefined,undefined,contexts);assert.equal(x.verification,'catalogue_seed');assert.equal(x.routeOptions.length,count);assert.equal(x.selectedRoute,undefined);assert.equal(programmeTimeline(x,'2026-10-31').state,'route_required');
  const plan=obs.applicantContextPlan.find(c=>c.programmeId===x.id);assert.throws(()=>resolveProgramme(p(n),routes,undefined,plan.offeringId,undefined,contexts));
  const wrong=obs.applicantContextPlan.find(c=>c.programmeId===x.id&&c.routeId!==plan.routeId);assert.throws(()=>resolveProgramme(p(n),routes,plan.routeId,wrong.offeringId,undefined,contexts));
 }
});

test('all nine streams have independent current sources and reject inherited parent academic markers',()=>{
 for(const plan of obs.routeRecords){const base={...store.get(plan.programmeId),notesEn:'parent marker',rules:[{kind:'gpa',min:99,scale:100}]},x=resolveProgramme(base,routes,plan.routeId,undefined,undefined,contexts);
  assert.equal(x.officialUrl,plan.officialUrl);assert.equal(x.name,base.directoryListing.variants.find(v=>v.officialUrl===plan.officialUrl).nameEn);assert.equal(x.notesEn.includes('parent marker'),false);assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.ok(x.sources.some(s=>s.url===x.officialUrl&&s.checkedOn===x.lastChecked));
 }
});

test('current application-fee conflict stays unknown across all offerings and all seventy-six price projections',()=>{
 assert.equal(obs.boundaries.applicationFee.facultyWebpageHkd,600);assert.equal(obs.boundaries.applicationFee.october2026PdfHkd,780);
 for(const plan of obs.applicantContextPlan){const masked=resolve(plan);assert.equal(masked.offerings[0].tuition,null);assert.equal(masked.offerings[0].deadline,null);
  const c=[...contexts.values()].find(c=>c.offeringId===plan.offeringId);assert.equal(c.routeId,plan.routeId);assert.equal(c.offeringFingerprint,offeringFingerprint(snapshots().find(x=>(x.routeId||null)===(plan.routeId||null)&&(x.id||plan.programmeId)===plan.programmeId&&x.offerings.some(o=>o.id===plan.offeringId)).offerings.find(o=>o.id===plan.offeringId)));
  for(const [cat,fee] of [['LOCAL',plan.localFee],['NONLOCAL',plan.nonLocalFee]]){const o=resolve(plan,cat).offerings[0];assert.equal(o.tuition,fee);assert.equal(o.applicationFee,null);assert.equal(o.deadline,'2027-04-09');assert.match(o.feeBasis,/600.*780/);assert.match(o.feeBasis,/credited toward tuition/);assert.match(o.feeBasis,/No scholarship/);}
 }
});

test('full-time-only and low-altitude durations cannot inherit the ordinary two-mode template or a yearly fee multiplier',()=>{
 for(const n of [75,76,77,78]){assert.deepEqual(p(n).offerings.map(o=>o.mode),['Full-time']);assert.equal(obs.applicantContextPlan.some(c=>c.programmeId===p(n).id&&c.offeringId.endsWith('-PT')),false);assert.throws(()=>resolveProgramme(p(n),routes,undefined,p(n).id+'-2027-PT',undefined,contexts));}
 const lat=direct(77,'FT','NONLOCAL').offerings[0];assert.equal(lat.tuition,438000);assert.equal(direct(77).offerings[0].tuition,280020);assert.equal(lat.duration,'1.5 years normative; 3 years maximum');assert.match(lat.feeBasis,/3 instalments/);assert.match(academic(p(77)),/84-credit.*54 taught.*30-credit/);
 assert.deepEqual(p(80).offerings.map(o=>o.mode),['Full-time','Part-time']);assert.equal(direct(80,'PT').offerings[0].duration,'2 years normative; 3 years maximum');
});

test('Civil and IEM category exceptions stay exact and cannot borrow the EEE or low-altitude totals',()=>{
 for(const n of [69,73]){for(const plan of obs.applicantContextPlan.filter(c=>c.programmeId===p(n).id))assert.equal(resolve(plan,'NONLOCAL').offerings[0].tuition,375000);}
 for(const plan of obs.applicantContextPlan.filter(c=>c.programmeId===p(70).id))assert.equal(resolve(plan,'NONLOCAL').offerings[0].tuition,395000);
 assert.equal(direct(68,'PT','NONLOCAL').offerings[0].tuition,395000);assert.match(direct(68,'PT').offerings[0].feeBasis,/4 instalments/);
 const ft=obs.applicantContextPlan.find(c=>c.programmeId===p(71).id&&c.offeringId.endsWith('-FT')),pt=obs.applicantContextPlan.find(c=>c.programmeId===p(71).id&&c.offeringId.endsWith('-PT'));
 assert.throws(()=>resolveProgramme(p(71),routes,undefined,ft.offeringId,pt.offeringId+'-LOCAL',contexts));
});

test('subject lists differ by exact programme while related fields and IELM professional qualifications remain assessed',()=>{
 for(const n of [69,70,73]){const x=resolve(obs.applicantContextPlan.find(c=>c.programmeId===p(n).id),'LOCAL');assert.equal(matchProgramme(x,profile).checks.find(c=>c.kind==='major').status,'pass');assert.equal(matchProgramme(x,{...profile,major:'History'}).checks.find(c=>c.kind==='major').status,'unknown');}
 const ielm=matchProgramme(p(72),{...profile,degreeStatus:'other',major:'Professional Engineering Qualification'});assert.equal(ielm.status,'needs_confirmation');assert.equal(ielm.checks.some(c=>c.status==='fail'),false);assert.match(academic(p(72)),/professional qualifications.*Hong Kong.*UK/);assert.match(academic(p(72)),/not a mandatory job/);
 assert.match(academic(p(81)),/strong interest in Robotics/);assert.equal(matchProgramme(p(81),profile).checks.some(c=>c.kind==='experience'),false);
});

test('English comparisons retain HKU components and intake date without an Arts threshold or borrowed test-format restriction',()=>{
 for(const x of snapshots()){
  const score=language=>matchProgramme(x,{...profile,language}).checks.find(c=>c.kind==='language');assert.equal(score(profile.language).status,'pass');assert.equal(score({...profile.language,testDate:'2025-08-31'}).status,'fail');
  assert.equal(score({...profile.language,components:{...profile.language.components,writing:5}}).status,'fail');assert.equal(score({type:'toefl_120',total:80,testDate:'2026-01-20'}).status,'pass');assert.equal(score({type:'toefl_6',total:4.5,testDate:'2026-01-21'}).status,'pass');assert.equal(score({type:'waiver'}).status,'unknown');
  const r=x.rules.find(r=>r.kind==='language');assert.equal(r.atHomeAccepted,undefined);assert.equal(r.singleAttempt,undefined);assert.equal(r.validityMonths,undefined);assert.equal(r.tests.toefl_120.componentMins,undefined);
 }
});

test('published noon rounds preserve intraday transitions without treating approximate opening or July results as an application cutoff',()=>{
 for(const plan of obs.applicantContextPlan){const x=resolve(plan,'LOCAL'),before=programmeTimeline(x,'2027-01-04','2027-01-04T03:59:59.999Z'),at=programmeTimeline(x,'2027-01-04','2027-01-04T04:00:00.000Z');
  assert.equal(x.offerings[0].applicationOpen,null);assert.equal(before.offerings[0].rounds[0].state,'cutoff_ahead');assert.equal(at.offerings[0].rounds[0].state,'cutoff_reached');assert.equal(at.offerings[0].nextRoundId,'CLEARING');assert.equal(at.state,'dates_incomplete');assert.equal(at.livePortalChecked,false);
  assert.equal(programmeTimeline(x,'2027-04-09','2027-04-09T04:00:00.000Z').offerings[0].rounds[1].state,'cutoff_reached');assert.deepEqual(x.offerings[0].applicationRounds.map(r=>r.deadline),['2027-01-04','2027-04-09']);
 }
});

test('document timing, older generic modes and template recognition cannot turn into extra eligibility or promised admission',()=>{
 assert.equal(obs.pdfVisualChecks.length,3);for(const p of obs.pdfVisualChecks)assert.match(p.sha256,/^[a-f0-9]{64}$/);
 assert.match(obs.boundaries.olderRegulations,/INIE, MEAM and Sustainability/);assert.match(obs.boundaries.template,/repeated IELM recognition/);
 for(const x of snapshots()){const note=x.rules.find(r=>r.labelEn==='Supporting evidence and document timing').noteEn;assert.match(note,/one month.*notification email/);assert.match(note,/Reference letters.*NOT required/);assert.match(note,/request for originals is not an admission offer/);assert.equal(matchProgramme(x,{...profile,gpa:4}).tier,null);}
 for(const n of [76,78,82])assert.equal(p(n).sources.some(s=>s.url.includes('REGULATIONSYLLABUS')),false);
});

test('temporary restarts preserve earlier parent data and every context fingerprint without touching the daily database',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-engineering-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,384);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,258);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,689);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all seventy-six exact direct/stream/mode/category combinations survive detail, matching, saved restore and export',async()=>{
 let visits=0;for(const plan of obs.applicantContextPlan)for(const [cat,fee] of [['LOCAL',plan.localFee],['NONLOCAL',plan.nonLocalFee]]){
  const {programmeId:id,routeId,offeringId}=plan,applicant=offeringId+'-'+cat,query=new URLSearchParams({offering:offeringId,applicant,...(routeId?{route:routeId}:{})}),response=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(response.status,200);const d=await response.json();assert.equal(d.offerings[0].tuition,fee);assert.equal(d.offerings[0].applicationFee,null);
  const saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z'),restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,fee);
  const exported=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exported.offerings[0].tuition,fee);assert.equal(exported.offerings[0].applicationFee,null);assert.equal(exported.profile,undefined);assert.equal(exported.match,undefined);assert.equal(exported.selectedRoute?.id,routeId||undefined);
  const matches=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:routeId?{[id]:routeId}:{},selectedOfferings:{[id]:offeringId},selectedApplicants:{[id]:applicant},filters:{school:'HK-HKU'}})});assert.equal(matches.status,200);const m=(await matches.json()).items.find(p=>p.id===id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');visits++;
 }assert.equal(visits,76);
});
