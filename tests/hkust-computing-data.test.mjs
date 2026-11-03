import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hkust-computing-data-observation-2026-10-30.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKUST-P${String(n).padStart(3,'0')}`),profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:6,reading:6,writing:6,speaking:6},singleAttempt:true,testDate:'2026-09-01'}};
const note=(n,label)=>p(n).rules.find(r=>r.labelEn===label).noteEn;
const choose=(n,mode='Full-time',category)=>{const x=p(n),o=x.offerings.find(o=>o.mode===mode);return resolveProgramme(x,routes,undefined,o.id,category?o.id+'-'+category:undefined,contexts);};
const lang=(n,language)=>matchProgramme(p(n),{...profile,language}).checks.find(c=>c.kind==='language');

test('ten existing IDs gain twenty English-data options without adding awards, full criteria or reviewers',()=>{
 assert.equal(obs.programmeIds.length,10);assert.equal(new Set(obs.programmeIds).size,10);
 assert.equal(obs.programmeIds.reduce((sum,id)=>sum+store.get(id).offerings.length,0),20);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,373);
 assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.deepEqual(store.quality().sourceRefreshConflicts,[]);
 const school=store.all().filter(x=>x.universityId==='HK-HKUST');assert.equal(school.length,49);assert.equal(school.filter(x=>x.verification==='programme_page_checked').length,48);
 assert.deepEqual(applicantSummary(contexts),{studyOptions:239,categories:478,peerReviewed:0});
 for(const id of obs.programmeIds){const x=batch.programmes.find(x=>x.id===id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(x)),false);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-10-30');assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.equal(batch.pilotProgrammeIds.includes(id),false);}
});

test('mode-specific programme totals and separate application fees do not become annual or 30-credit estimates',()=>{
 for(const [n,ft,pt,fee] of [[19,415000,415000,800],[21,286000,286000,550],[24,298000,258000,600],[32,300000,300000,500],[33,405000,405000,800],[37,400000,360000,800],[38,360000,297000,800],[39,320000,260000,600],[40,298000,258000,600],[49,298000,258000,600]]){
  for(const [mode,total] of [['Full-time',ft],['Part-time',pt]]){const x=choose(n,mode,n===40&&mode==='Part-time'?'NONLOCAL':undefined),o=x.offerings[0];assert.equal(o.tuition,total);assert.equal(o.applicationFee,fee);assert.notEqual(o.tuitionEstimate,true);assert.match(o.feeBasis,/not an annual fee multiplied/);}
 }
 assert.equal(p(32).offerings[0].duration,'1.5 years');assert.equal(p(32).offerings[1].duration,'2.5 years');
 assert.match(p(24).offerings[0].feeBasis,/24 curriculum credits/);assert.match(p(40).offerings[0].feeBasis,/25 curriculum credits/);assert.match(p(21).offerings[0].feeBasis,/31 curriculum credits/);
 assert.match(p(38).offerings[1].duration,/Winter Term/);
});

test('DDM three rounds remain distinct from final cutoff, unknown opening and the live portal',()=>{
 const expected=['2026-11-01','2027-02-15','2027-04-15'];
 for(const mode of ['Full-time','Part-time']){
  const x=choose(21,mode),o=x.offerings[0];assert.deepEqual(o.applicationRounds.map(r=>r.deadline),expected);assert.equal(o.deadline,'2027-04-15');assert.equal(o.applicationOpen,null);
  const before=programmeTimeline(x,'2026-10-30');assert.equal(before.state,'dates_incomplete');assert.equal(before.offerings[0].nextRoundId,'ROUND-1');assert.equal(before.livePortalChecked,false);
  assert.equal(programmeTimeline(x,'2026-11-01').offerings[0].rounds[0].state,'deadline_today');
  const later=programmeTimeline(x,'2026-11-02');assert.equal(later.offerings[0].rounds[0].state,'deadline_passed');assert.equal(later.offerings[0].nextRoundId,'ROUND-2');
 }
 const q=loadRepositoryReviewQueue('2026-10-30');assert.equal(q.counts.nearCutoffUnits,3);assert.equal(q.counts.reviewUnits,655);assert.equal(q.counts.staleApplicantContexts,0);
 const unit=q.units.find(u=>u.kind==='programme'&&u.programmeId===p(21).id);assert.equal(unit.reviewOrder,'cutoff_within_14_days');assert.ok(unit.upcomingRecordedCutoffs.every(d=>d.deadline==='2026-11-01'));
 assert.equal(loadRepositoryReviewQueue('2026-10-29').units.find(u=>u.kind==='programme'&&u.programmeId===p(21).id).upcomingRecordedCutoffs.length,0);
});

test('only local IC part-time has a June third round; category selection never applies to full-time or another mode',()=>{
 const x=p(40),pt=x.offerings[1],ft=x.offerings[0];
 assert.equal(programmeTimeline(choose(40,'Part-time'),'2026-10-30').state,'applicant_required');assert.equal(choose(40,'Part-time').offerings[0].tuition,null);
 for(const [category,final,rounds] of [['LOCAL','2027-06-01',3],['NONLOCAL','2027-04-01',2]]){const o=choose(40,'Part-time',category).offerings[0];assert.equal(o.deadline,final);assert.equal(o.applicationRounds.length,rounds);assert.equal(o.tuition,258000);}
 assert.equal(choose(40).offerings[0].deadline,'2027-04-01');assert.equal(choose(40).applicantOptions,undefined);
 assert.throws(()=>resolveProgramme(x,routes,undefined,ft.id,pt.id+'-LOCAL',contexts));assert.throws(()=>resolveProgramme(x,routes,undefined,pt.id,ft.id+'-LOCAL',contexts));
 assert.equal([...contexts.values()].filter(c=>obs.programmeIds.includes(c.programmeId)).length,1);
});

test('past priority dates do not become the regular opening or leak to the joint FinTech programme',()=>{
 for(const n of [19,37,38]){
  for(const mode of ['Full-time','Part-time']){const x=choose(n,mode),o=x.offerings[0];assert.equal(o.applicationOpen,'2026-09-01');assert.equal(o.applicationRounds[0].applicationOpen,'2026-09-01');assert.equal(o.deadline,mode==='Full-time'?'2027-02-28':'2027-05-02');assert.equal(programmeTimeline(x,'2026-08-16').state,'not_yet_open');assert.equal(programmeTimeline(x,'2026-10-30').state,'within_recorded_dates');}
  assert.match(note(n,'Separate priority and regular cycles'),/2 July to 15 August 2026/);assert.equal(p(n).sources.some(s=>s.url===obs.priorityCycle.sourceUrl),true);
 }
 assert.equal(p(33).offerings[0].applicationOpen,null);assert.equal(p(33).sources.some(s=>s.url===obs.priorityCycle.sourceUrl),false);
});

test('honours, work preferences and integrated CGA conditions are not one generic admission-GPA template',()=>{
 assert.equal(p(40).rules.find(r=>r.kind==='classification').min,'second_lower');
 assert.equal(matchProgramme(p(40),profile).checks.find(c=>c.kind==='classification').status,'pass');
 assert.equal(matchProgramme(p(40),{...profile,classification:'third',gpa:4}).checks.find(c=>c.kind==='classification').status,'fail');
 assert.equal(matchProgramme(p(40),{...profile,classification:null,gpa:4}).checks.find(c=>c.kind==='classification').status,'unknown');
 for(const n of [19,24,32,33,37,38,39,49]){assert.equal(p(n).rules.some(r=>r.kind==='classification'),false);assert.equal(p(n).rules.some(r=>r.kind==='experience'),false);}
 assert.match(note(32,'Programme-specific academic preparation'),/CGA 3.5.*only.*integrated/);assert.match(note(33,'Ordinary study and restricted pathway boundaries'),/CGA 3.3/);
 for(const n of [19,33,37,38])assert.equal(matchProgramme(choose(n,'Part-time'),profile).checks.some(c=>c.kind==='experience'&&c.status==='fail'),false);
});

test('DDM alternative work/coding/mathematics conditions and included confirmation payment remain scoped',()=>{
 const text=note(21,'Programme-specific academic preparation');assert.match(text,/another discipline.*computation work.*programming language, calculus and linear algebra/);assert.match(text,/no fixed work-year minimum/);
 assert.equal(p(21).rules.some(r=>r.kind==='experience'),false);assert.equal(p(21).rules.some(r=>r.kind==='major'&&r.any),false);
 const o=p(21).offerings[0];assert.equal(108900+34100+143000,o.tuition);assert.match(o.feeBasis,/not extra deposits/);assert.match(o.feeBasis,/9,226 each/);assert.notEqual(31*9226,o.tuition);
 assert.equal(matchProgramme(p(21),{...profile,major:'Business',experienceYears:10}).status,'needs_confirmation');
});

test('all IELTS components, single-sitting/home restrictions and independent TOEFL scales remain enforceable',()=>{
 for(const id of obs.programmeIds){const n=Number(id.slice(-3)),r=p(n).rules.find(r=>r.kind==='language');assert.equal(r.testDateNotBefore,undefined);assert.equal(r.validityMonths,undefined);
  assert.equal(lang(n,{...profile.language,components:{...profile.language.components,writing:5}}).status,'fail');
  assert.equal(lang(n,{...profile.language,components:undefined}).status,'unknown');assert.equal(lang(n,{...profile.language,atHome:true}).status,'fail');assert.equal(lang(n,{...profile.language,singleAttempt:false}).status,'unknown');
  assert.equal(lang(n,{type:'toefl_120',total:80,testDate:'2026-01-20',singleAttempt:true}).status,'pass');assert.equal(lang(n,{type:'toefl_6',total:4.5,testDate:'2026-01-21',singleAttempt:true}).status,'pass');assert.throws(()=>lang(n,{type:'toefl_120',total:80,testDate:'2026-01-21',singleAttempt:true}),/score scale conflicts/);
  assert.equal(matchProgramme(p(n),profile).tier,null);
 }
});

test('isolated batch imports remain idempotent across restarts without altering other current records',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))};const dir=mkdtempSync(join(tmpdir(),'gradpath-hkust-computing-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,373);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,239);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-30T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});

test('all twenty study options and both IC categories survive matching, API detail, remembered restore and export',async()=>{
 let checked=0;
 for(const id of obs.programmeIds)for(const o of store.get(id).offerings)for(const category of (id===p(40).id&&o.mode==='Part-time'?['LOCAL','NONLOCAL']:[null])){
  const applicant=category?o.id+'-'+category:undefined,query=new URLSearchParams({offering:o.id,...(applicant?{applicant}:{})});const response=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(response.status,200);const d=await response.json();assert.equal(d.offerings[0].tuition,o.tuition);assert.equal(d.offerings[0].applicationFee,o.applicationFee);
  const saved=optionSnapshot(d,'2026-10-30T08:00:00.000Z'),restore=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restore.status,200);assert.equal((await restore.json()).items[0].status,'resolved');
  const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].id,o.id);assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
  const r=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:applicant?{[id]:applicant}:{}})});assert.equal(r.status,200);const item=(await r.json()).items.find(x=>x.id===id);assert.ok(item);assert.equal(item.match.tier,null);assert.notEqual(item.match.status,'meets_checked');checked++;
 }
 assert.equal(checked,21);
});
