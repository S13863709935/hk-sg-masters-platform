import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-computing-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),academic=n=>p(n).rules.find(r=>r.labelEn==='Programme-specific academic and study conditions').noteEn;
const profile={major:'Computer Science',degreeStatus:'graduated',gpa:3,gpaScale:4,language:{type:'ielts',total:6,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5},testDate:'2025-09-01'}};
const resolve=(n,tag='FT',category)=>{const id=p(n).id,o=id+'-2027-'+tag;return resolveProgramme(p(n),routes,undefined,o,category?o+'-'+category:undefined,contexts);};
const match=(n,language=profile.language)=>matchProgramme(p(n),{...profile,language});

test('five existing HKU awards add eight options without new degrees, pilot changes or review claims',()=>{
 assert.deepEqual(obs.programmeIds,[15,17,18,67,99].map(n=>p(n).id));assert.equal(obs.counts.newDirectStudyOptions,8);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,363);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(applicantSummary(contexts),{studyOptions:237,categories:474,peerReviewed:0});assert.equal(store.all().filter(x=>x.universityId==='HK-HKU'&&x.verification==='programme_page_checked').length,93);
 for(const id of obs.programmeIds){const x=batch.programmes.find(x=>x.id===id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(x)),false);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(batch.pilotProgrammeIds.includes(id),false);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);}
});

test('FTDA records only the current part-time offer and keeps the stale PDF fee-year conflict visible',()=>{
 assert.deepEqual(p(17).offerings.map(o=>o.mode),['Part-time']);assert.throws(()=>resolve(17,'FT'));
 assert.equal(resolve(17,'PT','LOCAL').offerings[0].tuition,275000);assert.equal(resolve(17,'PT','NONLOCAL').offerings[0].tuition,375000);
 assert.match(academic(17),/2026\/27.*July 2026/);assert.match(p(17).offerings[0].feeEvidence.sourceUrl,/Admission\/Fee$/);
 const check=major=>matchProgramme(p(17),{...profile,major}).checks.find(c=>c.kind==='major');assert.equal(check('Science').status,'pass');assert.equal(check('History').status,'unknown');
 assert.equal(p(17).offerings[0].applicationOpen,null);assert.equal(programmeTimeline(resolve(17,'PT','LOCAL'),'2026-10-31').state,'dates_incomplete');
});

test('Science AI retains exact dates, 1.5-year total and an unknown application fee without borrowing CS rules',()=>{
 const x=resolve(15),o=x.offerings[0];assert.equal(o.tuition,420000);assert.equal(o.duration,'1.5 years');assert.equal(o.applicationFee,null);assert.equal(o.applicationOpen,'2026-09-21');
 assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2026-11-16','2027-02-01']);assert.equal(x.applicantOptions,undefined);assert.match(o.feeBasis,/3 instalments/);assert.match(academic(15),/July 2029.*1.5-year/);
 assert.match(academic(15),/GRE\/GMAT and references are not mandatory/);assert.match(academic(15),/four weeks.*whichever is earlier/);assert.equal(x.scope,undefined);
});

test('required preparation survives a high score and cannot be inferred from the undergraduate major',()=>{
 assert.match(academic(15),/linear algebra, calculus, probability, introductory statistics and computer programming/);
 assert.match(academic(18),/EACH.*calculus and algebra, computer programming, and introductory statistics/);
 assert.match(academic(99),/matrices and calculus, introductory statistics and linear modelling/);
 for(const n of [15,18,67,99]){const m=match(n,{...profile.language,total:9});assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);assert.ok(m.checks.some(c=>c.kind==='manual'));assert.equal(p(n).rules.some(r=>r.kind==='major'&&r.any),false);}
});

test('HKU language scores use the intake anchor and test-version date without borrowed Arts or format rules',()=>{
 for(const n of [15,17,18,67,99]){
  const score=language=>match(n,language).checks.find(c=>c.kind==='language');
  assert.equal(score(profile.language).status,'pass');assert.equal(score({...profile.language,components:{...profile.language.components,writing:5}}).status,'fail');
  assert.equal(score({...profile.language,testDate:'2025-08-31'}).status,'fail');
  assert.equal(score({type:'toefl_120',total:80,testDate:'2026-01-20'}).status,'pass');assert.equal(score({type:'toefl_6',total:4.5,testDate:'2026-01-21'}).status,'pass');
  assert.throws(()=>score({type:'toefl_6',total:4.5,testDate:'2026-01-20'}),/scale conflicts with the test date/);assert.equal(score({type:'waiver'}).status,'unknown');
  const r=p(n).rules.find(r=>r.kind==='language');assert.equal(r.validityMonths,undefined);assert.equal(r.atHomeAccepted,undefined);assert.equal(r.singleAttempt,undefined);assert.equal(r.tests.toefl_120.componentMins,undefined);
 }
});

test('seven category contexts bind exact tuition totals, modes and noon rounds without a default price',()=>{
 assert.equal(obs.applicantContextPlan.length,7);
 for(const plan of obs.applicantContextPlan){const n=Number(plan.programmeId.slice(-3)),tag=plan.offeringId.endsWith('PT')?'PT':'FT',masked=resolve(n,tag);
  assert.equal(masked.offerings[0].tuition,null);assert.equal(masked.offerings[0].deadline,null);
  const c=[...contexts.values()].find(c=>c.offeringId===plan.offeringId);assert.equal(c.offeringFingerprint,offeringFingerprint(p(n).offerings.find(o=>o.id===plan.offeringId)));
  for(const [cat,fee] of [['LOCAL',plan.localFee],['NONLOCAL',plan.nonLocalFee]]){const o=resolve(n,tag,cat).offerings[0];assert.equal(o.tuition,fee);assert.equal(o.applicationFee,780);assert.equal(o.deadline,'2027-04-30');assert.match(o.feeBasis,/subject to University approval/);assert.match(o.feeBasis,/credited, not extra tuition/);assert.match(o.feeBasis,/No scholarship/);}
 }
 assert.equal(resolve(18,'PT','NONLOCAL').offerings[0].tuition,369000);assert.match(resolve(18,'PT','LOCAL').offerings[0].feeBasis,/5 instalments/);
 assert.equal(resolve(99,'PT','LOCAL').offerings[0].tuition,245000);assert.equal(resolve(99,'FT','NONLOCAL').offerings[0].tuition,265000);
 assert.throws(()=>resolveProgramme(p(18),routes,undefined,p(18).id+'-2027-PT',p(18).id+'-2027-FT-LOCAL',contexts));
});

test('noon cutoffs change at the exact instant, and approximate opening statements never prove availability',()=>{
 for(const [n,main,clear] of [[15,'2026-11-16','2027-02-01'],[18,'2026-12-01','2027-04-30']]){
  const x=resolve(n,'FT',n===15?undefined:'LOCAL');
  const before=programmeTimeline(x,main,main+'T03:59:59.999Z'),at=programmeTimeline(x,main,main+'T04:00:00.000Z');
  assert.equal(before.offerings[0].rounds[0].state,n===15?'within_recorded_dates':'cutoff_ahead');assert.equal(at.offerings[0].rounds[0].state,'cutoff_reached');assert.equal(at.offerings[0].nextRoundId,'CLEARING');
  assert.equal(programmeTimeline(x,clear,clear+'T04:00:00.000Z').offerings[0].rounds[1].state,'cutoff_reached');assert.equal(at.livePortalChecked,false);
 }
});

test('source anomalies do not become current quotas, automatic discounts or extra degrees',()=>{
 assert.equal(obs.pdfVisualChecks.length,4);for(const x of obs.pdfVisualChecks){assert.match(x.sha256,/^[a-f0-9]{64}$/);assert.equal(x.renderedPage,2);}
 assert.match(obs.boundaries.dataScience,/unrelated footer links.*admission-rate counters/);assert.match(academic(18),/2026\/27 admission numbers.*not 2027 quotas/);
 assert.match(academic(99),/themes remain one degree/);assert.match(academic(99),/not additional intakes/);
 for(const id of obs.programmeIds)assert.ok(batch.programmes.find(p=>p.id===id).sources.every(s=>new URL(s.url).hostname.endsWith('.hku.hk')&&s.checkedOn==='2026-10-31'));
});

test('Delta X scope updates preserve dated fee contexts and ordinary CS, suppressing academic failure and actionable dates',()=>{
 const id='HK-HKU-P016',group=routes.get(id);assert.equal(group[0].lastChecked,'2026-10-21');assert.equal(group[0].scope,undefined);
 for(const r of group.slice(1)){
  assert.equal(r.lastChecked,'2026-10-31');assert.equal(r.scope.status,'out_of_scope');assert.ok(r.sources.some(s=>s.checkedOn==='2026-10-21'));assert.ok(r.sources.some(s=>s.url===r.officialUrl&&s.checkedOn==='2026-10-31'));
  for(const o of r.offerings){const c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.checkedOn,'2026-10-21');assert.equal(c.offeringFingerprint,offeringFingerprint(o));
   const x=resolveProgramme(store.get(id),routes,r.routeId,o.id,c.options[0].id,contexts),m=matchProgramme(x,profile);assert.equal(m.status,'out_of_scope');assert.equal(m.tier,null);assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.equal(programmeTimeline(x,'2026-10-31').state,'excluded');assert.match(m.disclaimerEn,/current project scope/);
  }
 }
});

test('repeated isolated imports preserve prior parent objects and load all category fingerprints',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-computing-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,363);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,237);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,641);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all fifteen ordinary mode/category combinations survive details, matching, saved restoration and export',async()=>{
 let visits=0;for(const id of obs.programmeIds){const x=store.get(id);for(const o of x.offerings){const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);for(const cat of plan?['LOCAL','NONLOCAL']:[null]){
  const applicant=cat?o.id+'-'+cat:undefined,query=new URLSearchParams({offering:o.id,...(applicant?{applicant}:{})}),response=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(response.status,200);
  const d=await response.json(),fee=plan?(cat==='LOCAL'?plan.localFee:plan.nonLocalFee):o.tuition;assert.equal(d.offerings[0].tuition,fee);const saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z');
  const restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,fee);
  const exported=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exported.offerings[0].tuition,fee);assert.equal(exported.profile,undefined);assert.equal(exported.match,undefined);
  const matches=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:applicant?{[id]:applicant}:{}})});assert.equal(matches.status,200);assert.equal((await matches.json()).items.find(p=>p.id===id).match.tier,null);visits++;
 }}}assert.equal(visits,15);
});
