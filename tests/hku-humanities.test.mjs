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
import {validateProgramme} from '../server/validation.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';

const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-humanities-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),records=obs.programmeIds.map(id=>store.get(id));
const profile={major:'Computer Science',degreeStatus:'graduated',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5},testDate:'2025-09-01',singleAttempt:true}};
const resolve=(n,tag='FT')=>resolveProgramme(p(n),routes,undefined,p(n).id+'-2027-'+tag,undefined,contexts);
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
const academic=n=>p(n).rules.find(r=>r.labelEn==='Programme-specific academic and evidence conditions').noteEn;

test('sixteen existing humanities parents add twenty-one options without new degree, route or category counts',()=>{
 assert.equal(records.length,16);assert.equal(records.flatMap(x=>x.offerings).length,21);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,429);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.equal(store.all().filter(x=>x.universityId==='HK-HKU'&&x.verification==='programme_page_checked').length,93);
 assert.deepEqual(routeSummary(routes),{groups:28,routes:63,pageChecked:63,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:323,categories:650,peerReviewed:0});
 for(const x of records){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.lastChecked,'2026-10-31');assert.equal(x.reviewer,null);assert.equal(batch.pilotProgrammeIds.includes(x.id),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===x.id))),false);assert.equal(validateProgramme(x,new Set(['HK-HKU'])),x);assert.equal(x.rules.some(r=>['gpa','classification','experience'].includes(r.kind)),false);}
});

test('only five exact PT options exist and their quoted fees are not annual multipliers or invented category tiers',()=>{
 assert.deepEqual(records.filter(x=>x.offerings.some(o=>o.mode==='Part-time')).map(x=>x.id),[9,30,32,39,41].map(n=>p(n).id));
 for(const x of records)for(const o of x.offerings){const y=resolveProgramme(x,routes,undefined,o.id,undefined,contexts);assert.equal(y.applicantOptions,undefined);assert.equal(o.duration,o.mode==='Full-time'?'1 year':'2 years');assert.match(o.feeBasis,/No annual\/maximum-duration multiplier/);}
 for(const n of [11,31,34,35,36,37,38,40,42,43,58])assert.throws(()=>resolve(n,'PT'));
 for(const n of [9,32]){assert.equal(resolve(n).offerings[0].tuition,238200);assert.equal(resolve(n,'PT').offerings[0].tuition,238200);assert.equal(p(n).offerings.every(o=>o.applicationFee===780),true);assert.match(p(n).offerings[0].feeBasis,/whole one-year FT\/two-year PT total.*two\/four instalments/);}
});

test('Applied Linguistics FT/PT clearing differs by one month and old department fees cannot replace current portal amounts',()=>{
 const ft=resolve(30).offerings[0],pt=resolve(30,'PT').offerings[0];assert.equal(ft.tuition,271200);assert.equal(pt.tuition,235200);assert.equal(ft.deadline,'2027-02-24');assert.equal(pt.deadline,'2027-03-24');assert.equal(ft.applicationRounds[0].deadline,'2026-12-30');assert.equal(pt.applicationRounds[0].deadline,'2026-12-30');assert.match(pt.feeBasis,/2026-entry.*263,200\/228,300.*not substituted/);
 assert.match(p(30).rules.find(r=>r.labelEn==='Current supporting checklist and timing').noteEn,/six-credit.*NO composition-fee reduction/);assert.equal(p(30).rules.some(r=>r.kind==='experience'),false);
});

test('Chinese Historical Studies keeps the named Arts English exception without turning Chinese teaching into a blanket waiver',()=>{
 const lower={...profile.language,total:6};assert.equal(language(p(32),lower).status,'pass');for(const x of records.filter(p=>p.id!=='HK-HKU-P032'))assert.equal(language(x,lower).status,'fail');
 for(const [type,total,testDate,writing] of [['toefl_120',80,'2026-01-20',24],['toefl_6',4.5,'2026-01-21',4.5]]){const l={type,total,testDate,components:{writing},singleAttempt:true};assert.equal(language(p(32),l).status,'pass');for(const x of records.filter(p=>p.id!=='HK-HKU-P032'))assert.equal(language(x,l).status,'fail');}
 assert.equal(language(p(32),{type:'waiver'}).status,'unknown');assert.equal(p(32).rules.find(r=>r.kind==='language').tests.toefl_6.componentMins,undefined);assert.equal(matchProgramme(p(32),profile).status,'needs_confirmation');
});

test('ordinary Arts Writing minima, version boundary, date anchor and exam-specific Home policy survive all modes',()=>{
 const home=new Set([30,32,34,35,36,37,40,41,58].map(n=>p(n).id));
 for(const x of records){assert.equal(language(x,{...profile.language,testDate:'2025-08-31'}).status,'fail');const r=x.rules.find(r=>r.kind==='language');assert.equal(r.atHomeAccepted,undefined);
  for(const [type,total,testDate,writing] of [['toefl_120',80,'2026-01-20',25],['toefl_6',4.5,'2026-01-21',5]]){const l={type,total,testDate,components:{writing},singleAttempt:true};assert.equal(language(x,l).status,'pass');assert.equal(language(x,{...l,atHome:true}).status,home.has(x.id)?'fail':'pass');}
  assert.equal(language(x,{...profile.language,atHome:true}).status,'pass');assert.equal(matchProgramme(x,profile).tier,null);
 }
 for(const n of [34,36,58])assert.equal(language(p(n),{...profile.language,singleAttempt:false}).status,'unknown');
});

test('other-degree art, music, history and PPE alternatives stay assessed rather than rejected from a title or converted to work-years',()=>{
 for(const [n,major] of [[31,'Art History'],[39,'History'],[42,'Music'],[43,'Economics']]){assert.equal(matchProgramme(p(n),{...profile,major}).checks.find(c=>c.kind==='major').status,'pass');const m=matchProgramme(p(n),profile);assert.equal(m.checks.find(c=>c.kind==='major').status,'unknown');assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.some(c=>c.status==='fail'),false);}
 assert.match(academic(31),/another subject with substantial art-related experience/);assert.match(academic(39),/another bachelor with experience studying history/);assert.match(academic(42),/another subject with relevant musical experience/);assert.match(academic(43),/another degree with experience studying at least one/);
 assert.equal(matchProgramme(p(36),{...profile,major:'English'}).checks.find(c=>c.kind==='major').status,'pass');assert.match(academic(36),/School of English.*English or a closely related major.*central portal summary/);assert.match(academic(40),/2025.*preferred.*Division 2/);
});

test('exact regional-language certificates remain mandatory evidence even with a listed major and maximum English scores',()=>{
 for(const [n,major,pattern] of [[35,'Japanese',/JLPT N2\+.*TOPIK 4\+.*TORFL II\+/],[37,'European Studies',/French\/German\/Spanish CEFR B2\+.*TORFL II\+/]]){assert.match(academic(n),pattern);assert.match(academic(n),/CEFL B2.*not/);const m=matchProgramme(p(n),{...profile,major,language:{...profile.language,total:9}});assert.equal(m.checks.find(c=>c.kind==='major').status,'pass');assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);assert.match(academic(n),/Elective.*not/);}
});

test('creative portfolio and writing samples retain their own size, statement, referee and relative timing rules',()=>{
 assert.match(academic(34),/500-750 words.*12 pages\/5 MB/);assert.match(academic(58),/10 pages\/5 MB.*250-300-word/);assert.match(academic(41),/1,000-1,200 words.*Times New Roman 12.*separate from a personal statement/);
 for(const n of [30,32,41,58]){const r=p(n).rules.find(r=>r.labelEn==='Current supporting checklist and timing');assert.match(r.noteEn,/within one month.*no later than closing/);assert.match(r.noteEn,/Two academic referees.*official university\/company email/);}
 assert.equal(obs.pdfVisualChecks.length,4);for(const check of obs.pdfVisualChecks){assert.match(check.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(check.renderedPages,[1,2]);}assert.match(academic(31),/at least one academic/);assert.match(academic(41),/scanned checklist/);
});

test('mixed-year prices and unconfirmed starts stay explicit rather than filled from a generic semester or scholarship deadline',()=>{
 assert.equal(p(39).fieldStatus.tuition.status,'unknown');assert.equal(p(39).offerings[0].tuition,259600);assert.match(p(39).offerings[0].feeBasis,/To be confirmed.*2026\/27 249,600 FT \/124,800 per PT year/);
 assert.equal(resolve(41).offerings[0].tuition,273800);assert.equal(resolve(41,'PT').offerings[0].tuition,220700);assert.equal(p(41).offerings[0].applicationFee,null);assert.match(p(41).offerings[0].feeBasis,/2025\/26.*263,200\/212,200.*600/);
 for(const n of [41,42])assert.equal(p(n).offerings.every(o=>o.intake==='2027 entry (start month unconfirmed)'),true);
 for(const n of [11,31,34,36,38,39,40,41,42,43,58])assert.equal(p(n).offerings.every(o=>o.applicationFee===null),true);
 const dates=p(41).offerings[0];assert.equal(dates.applicationOpen,'2026-10-12');assert.match(dates.deadlineNote,/NOON.*calendar-date precision.*intraday/);assert.equal(programmeTimeline(resolve(41),'2026-10-31').livePortalChecked,false);assert.equal(programmeTimeline(resolve(41),'2026-10-31').state,'within_recorded_dates');
});

test('all exact noon rounds retain before/at-cutoff transitions without an assumed midnight or live closure',()=>{
 for(const x of records)for(const o of x.offerings){for(const r of o.applicationRounds){assert.equal(r.deadlineAt,r.deadline+'T12:00:00+08:00');const chosen=resolveProgramme(x,routes,undefined,o.id,undefined,contexts),before=programmeTimeline(chosen,r.deadline,r.deadline+'T03:59:59.999Z'),at=programmeTimeline(chosen,r.deadline,r.deadline+'T04:00:00.000Z');assert.equal(before.offerings[0].rounds.find(v=>v.id===r.id).state,x.id==='HK-HKU-P041'?'within_recorded_dates':'cutoff_ahead');assert.equal(at.offerings[0].rounds.find(v=>v.id===r.id).state,'cutoff_reached');assert.equal(at.livePortalChecked,false);}}
 assert.deepEqual(p(43).offerings[0].applicationRounds.map(r=>r.deadline),['2027-01-22','2027-04-30','2027-06-30']);
});

test('temporary restarts retain unrelated parent objects and every existing applicant fingerprint without the daily database',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-humanities-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,429);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,323);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,815);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty-one modes preserve fees, round identity and unresolved evidence through detail, matching, saved restore and export',async()=>{
 let visits=0;for(const x of records)for(const o of x.offerings){const id=x.id,query=new URLSearchParams({offering:o.id}),res=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(res.status,200);const d=await res.json();assert.equal(d.offerings[0].tuition,o.tuition);assert.equal(d.offerings[0].deadline,o.deadline);assert.equal(d.applicantOptions,undefined);
  const saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z'),restore=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restore.status,200);const item=(await restore.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,o.tuition);
  const exp=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);assert.equal(exp.selectedOffering.id,o.id);assert.equal(exp.offerings[0].applicationFee,o.applicationFee);assert.deepEqual(exp.offerings[0].applicationRounds,o.applicationRounds);assert.equal(exp.evidence.publishedRequirements.some(r=>r.kind==='manual'),true);
  const m=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},filters:{school:'HK-HKU'}})});assert.equal(m.status,200);const choice=(await m.json()).items.find(p=>p.id===id);assert.equal(choice.match.status,'needs_confirmation');assert.equal(choice.match.tier,null);visits++;
 }assert.equal(visits,21);
});
