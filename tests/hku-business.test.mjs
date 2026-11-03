import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {validateProgramme} from '../server/validation.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-business-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),records=obs.programmeIds.map(id=>store.get(id)),specialised=records.filter(p=>p.id!=='HK-HKU-P047');
const profile={major:'History',degreeStatus:'graduated',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5},testDate:'2025-09-01',singleAttempt:true}};
const resolve=(n,tag='FT')=>resolveProgramme(p(n),routes,undefined,p(n).id+'-2027-'+tag,undefined,contexts);
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
const academic=n=>p(n).rules.find(r=>r.labelEn==='Programme-specific academic and study conditions').noteEn;

test('thirteen existing awards add fourteen options without invented routes, categories or review completion',()=>{
 assert.equal(records.length,13);assert.equal(specialised.length,12);assert.equal(records.flatMap(p=>p.offerings).length,14);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,373);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.equal(store.all().filter(p=>p.universityId==='HK-HKU'&&p.verification==='programme_page_checked').length,93);
 assert.deepEqual(routeSummary(routes),{groups:18,routes:43,pageChecked:43,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:239,categories:478,peerReviewed:0});
 for(const x of records){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-31');assert.equal(batch.pilotProgrammeIds.includes(x.id),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===x.id))),false);assert.equal(x.directoryListing?.variants.length||0,0);assert.equal(validateProgramme(x,new Set(['HK-HKU'])),x);}
});

test('named specialised totals stay whole-programme, proposed and separate from payment period or discounts',()=>{
 const fees={25:468000,26:468000,29:508000,53:438000,55:508000,56:508000,57:508000,59:468000,63:468000,86:438000,100:508000,103:508000};
 for(const [n,total] of Object.entries(fees)){const x=p(n),o=x.offerings[0];assert.equal(o.tuition,total);assert.equal(o.applicationFee,780);assert.equal(o.applicationOpen,null);assert.equal(o.currency,'HKD');assert.equal(o.mode,'Full-time');assert.equal(o.intake,'2027 entry (start month unconfirmed)');assert.match(o.duration,/2 years reported by portal.*confirm/);assert.match(o.feeBasis,/Deposit.*part of tuition/);assert.match(o.feeBasis,/two instalments over one academic year/);assert.match(o.feeBasis,/does not establish normative study length/);assert.equal(resolve(n).applicantOptions,undefined);assert.throws(()=>resolve(n,'PT'));}
 assert.match(academic(25),/one-year.*confirm the cohort timetable/);assert.notEqual(p(57).name,p(17).name);assert.equal(p(17).offerings[0].mode,'Part-time');
});

test('rounds keep exact noon boundaries, unknown opening and latest-announced rather than final-cycle meaning',()=>{
 for(const x of specialised){const o=x.offerings[0];assert.deepEqual(o.applicationRounds.map(r=>r.deadline),['2026-07-24','2026-09-28','2026-12-04']);assert.match(o.deadlineNote,/not a confirmed final deadline/);
  for(const r of o.applicationRounds)assert.equal(r.deadlineAt,r.deadline+'T12:00:00+08:00');
  const before=programmeTimeline(x,'2026-12-04','2026-12-04T03:59:59.999Z'),at=programmeTimeline(x,'2026-12-04','2026-12-04T04:00:00.000Z');assert.equal(before.offerings[0].rounds[2].state,'cutoff_ahead');assert.equal(at.offerings[0].rounds[2].state,'cutoff_reached');assert.equal(at.livePortalChecked,false);
 }
 for(const x of [resolve(47),resolve(47,'PT-HK')]){assert.equal(x.offerings[0].deadline,'2026-11-09');assert.equal(x.offerings[0].applicationRounds[0].deadlineAt,'2026-11-09T12:00:00+08:00');assert.match(x.offerings[0].deadlineNote,/not the final-cycle deadline/);assert.equal(programmeTimeline(x,'2026-11-09','2026-11-09T04:00:00.000Z').offerings[0].rounds[0].state,'cutoff_reached');}
 const src=readFileSync(new URL('public/app.js',root),'utf8'),fn=src.slice(src.indexOf('function roundDeadline('),src.indexOf('const offeringLabel')),ctx={known:x=>String(x),esc:x=>String(x)};vm.runInNewContext(fn,ctx);const text=ctx.deadlineText(p(25).offerings[0]);assert.match(text,/Latest recorded cutoff/);assert.doesNotMatch(text,/Final recorded deadline/);assert.match(text,/12:00 UTC\+08:00/);assert.match(text,/not a confirmed final deadline for the whole cycle/);
});

test('specific TOEFL Home rejection cannot become an invented IELTS format rejection',()=>{
 for(const x of specialised){for(const [type,total,testDate] of [['toefl_120',80,'2026-01-20'],['toefl_6',4.5,'2026-01-21']]){assert.equal(language(x,{type,total,testDate}).status,'pass');assert.equal(language(x,{type,total,testDate,atHome:true}).status,'fail');}
  assert.equal(language(x,{...profile.language,atHome:true}).status,'pass');assert.equal(language(x,{...profile.language,testDate:'2025-08-31'}).status,'fail');assert.equal(language(x,{...profile.language,components:{...profile.language.components,reading:5}}).status,'fail');assert.equal(language(x,{type:'waiver'}).status,'unknown');assert.equal(matchProgramme(x,profile).status,'needs_confirmation');assert.equal(x.rules.find(r=>r.kind==='language').singleAttempt,undefined);
  assert.match(x.rules.find(r=>r.labelEn==='English applicability and accepted test evidence').noteEn,/IELTS One Skill Retake.*not accepted.*not captured/);
 }
});

test('per-examination format validation, legacy fallback, explicit overrides and published export stay aligned',()=>{
 const x=structuredClone(p(25)),r=x.rules.find(r=>r.kind==='language');r.atHomeAccepted=false;
 assert.equal(language(x,{...profile.language,atHome:true}).status,'fail');r.tests.ielts.atHomeAccepted=true;assert.equal(language(x,{...profile.language,atHome:true}).status,'pass');
 for(const value of ['false',0,null,{}]){r.tests.ielts.atHomeAccepted=value;assert.throws(()=>validateProgramme(x,new Set(['HK-HKU'])),/examination-specific/);}
 r.tests.ielts.atHomeAccepted=true;r.tests.ielts.privateMarker='must not export';const exported=shortlistExport([x]).programmes[0].evidence.publishedRequirements.find(r=>r.kind==='language');assert.equal(exported.tests.ielts.atHomeAccepted,true);assert.equal(exported.tests.toefl_6.atHomeAccepted,false);assert.equal(exported.tests.ielts.privateMarker,undefined);
 r.tests.ielts.atHomeAccepted='false';assert.equal(shortlistExport([x]).programmes[0].evidence.publishedRequirements.find(r=>r.kind==='language').tests.ielts.atHomeAccepted,undefined);
 const src=readFileSync(new URL('public/app.js',root),'utf8'),fn=src.slice(src.indexOf('function ruleText('),src.indexOf('function roundDeadline(')),ctx={esc:x=>String(x),t:x=>x};vm.runInNewContext(fn,ctx);
 const text=ctx.ruleText(p(25).rules.find(r=>r.kind==='language')).split('<br>');assert.doesNotMatch(text[0],/at-home test not accepted/);assert.match(text[1],/at-home test not accepted/);assert.match(text[2],/at-home test not accepted/);
});

test('MBA exact-mode English rules differ without making unselected modes pass or borrowing specialised GMAT policy',()=>{
 assert.equal(language(resolve(47)).status,'fail');assert.equal(language(resolve(47,'PT-HK')).status,'pass');assert.equal(language(resolve(47),{...profile.language,total:6.5}).status,'pass');
 assert.equal(language(resolve(47,'PT-HK'),{...profile.language,singleAttempt:false}).status,'unknown');assert.equal(matchProgramme(p(47),profile).checks.filter(r=>r.kind==='language').every(r=>r.status==='unknown'),true);
 assert.match(p(47).rules.find(r=>r.appliesTo?.offeringIds[0].endsWith('-FT')&&r.kind==='manual').noteEn,/GMAT\/GRE.*no numeric minimum/);
 assert.match(p(47).rules.find(r=>r.appliesTo?.offeringIds[0].endsWith('-PT-HK')&&r.kind==='manual').noteEn,/GMAT\/GRE\/GRK\/EA.*More than seven.*MAY.*case by case.*exactly seven is not automatic/);
 assert.equal(p(47).rules.some(r=>r.kind==='experience'),false);assert.match(p(47).rules.find(r=>r.labelEn==='Postgraduate full-time work and equivalence').noteEn,/POSTGRADUATE FULL-TIME.*August 2027.*no automatic numeric/);
});

test('MBA fees, starts and delivery remain mode-specific and never silently substitute GBA or an HK-only FT promise',()=>{
 const ft=resolve(47),pt=resolve(47,'PT-HK');assert.equal(ft.offerings[0].tuition,648000);assert.equal(pt.offerings[0].tuition,588000);assert.equal(ft.offerings[0].intake,'August 2027');assert.equal(pt.offerings[0].intake,'September 2027');
 for(const x of [ft,pt]){assert.equal(x.offerings[0].applicationFee,780);assert.equal(x.offerings[0].applicationOpen,null);assert.match(x.offerings[0].feeBasis,/not automatically added to or subtracted/);assert.equal(x.applicantOptions,undefined);assert.equal(matchProgramme(x,{...profile,experienceYears:20,language:{...profile.language,total:9}}).tier,null);}
 const f=matchProgramme(ft,profile).checks.find(r=>r.labelEn==='Exact MBA mode tests and delivery'),t=matchProgramme(pt,profile).checks.find(r=>r.labelEn==='Exact MBA mode tests and delivery');assert.match(f.reasonEn,/Shanghai\/Beijing for ALL students/);assert.doesNotMatch(t.reasonEn,/ALL students/);assert.match(t.reasonEn,/GBA.*excluded/);assert.throws(()=>resolve(47,'PT-GBA'));
});

test('preferences, ordinary cross-discipline entry and conditional documents never become universal GPA, work or scholarship gates',()=>{
 for(const x of records)assert.equal(x.rules.some(r=>['gpa','classification','experience'].includes(r.kind)),false);
 assert.equal(matchProgramme(p(25),profile).checks.find(r=>r.kind==='major').status,'pass');assert.equal(matchProgramme(p(53),profile).checks.find(r=>r.kind==='major').status,'pass');assert.equal(p(57).rules.some(r=>r.kind==='major'),false);assert.match(academic(57),/HIGHLY PREFERRED, not universally mandatory/);
 assert.match(academic(53),/Advanced Research.*two academic references.*two-page research statement.*not universal ordinary-MEcon/);assert.match(academic(55),/300-word family-member-day essay/);assert.match(academic(103),/essay is not imposed/);
 for(const x of specialised){const note=x.rules.find(r=>r.labelEn==='References, evidence and current availability').noteEn;assert.match(note,/at least one academic.*official university profile/);assert.match(note,/References.*before.*deadline; supporting documents.*two WORKING days/);assert.match(x.rules.find(r=>r.labelEn==='Preferences, recognition and fee/duration limitations').noteEn,/GMAT\/GRE is not required/);}
 assert.equal(obs.pdfVisualCheck.pages,4);assert.match(obs.pdfVisualCheck.sha256,/^[a-f0-9]{64}$/);
});

test('temporary database upgrades preserve prior records and independent context fingerprints across restarts',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-business-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,373);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,239);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,655);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all fourteen exact modes survive detail, matching, saved restore and privacy-preserving export',async()=>{
 let visits=0;for(const x of records)for(const o of x.offerings){const id=x.id,query=new URLSearchParams({offering:o.id}),response=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(response.status,200);const d=await response.json();assert.equal(d.offerings[0].tuition,o.tuition);assert.equal(d.offerings[0].applicationFee,780);assert.equal(d.applicantOptions,undefined);
  const saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z'),restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,o.tuition);
  const exported=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exported.profile,undefined);assert.equal(exported.match,undefined);assert.equal(exported.offerings[0].tuition,o.tuition);assert.equal(exported.selectedOffering.id,o.id);if(id!=='HK-HKU-P047')assert.equal(exported.evidence.publishedRequirements.find(r=>r.kind==='language').tests.toefl_6.atHomeAccepted,false);
  const res=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile:{...profile,language:{...profile.language,total:9}},selectedOfferings:{[id]:o.id},filters:{school:'HK-HKU'}})});assert.equal(res.status,200);const m=(await res.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);visits++;
 }assert.equal(visits,14);
});
