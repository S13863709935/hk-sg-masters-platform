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
const batch=read('data/checked-programmes.json'),obs=read('data/research/hkust-remaining-observation-2026-10-30.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes),p=n=>store.get(`HK-HKUST-P${String(n).padStart(3,'0')}`);
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2026-09-01',singleAttempt:true}};
const academic=n=>p(n).rules.find(r=>r.labelEn==='Programme-specific academic and study conditions').noteEn;
const mba=(route,tag,category)=>resolveProgramme(p(10),routes,`HK-HKUST-P010-ROUTE-${route}`,`HK-HKUST-P010-2027-${tag}`,category?`HK-HKUST-P010-2027-${tag}-${category}`:undefined,contexts);

test('eighteen retained parents gain partial evidence without adding awards, reviewers or core-pilot membership',()=>{
 assert.equal(obs.programmeIds.length,18);assert.equal(new Set(obs.programmeIds).size,18);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,869);assert.equal(store.quality().checked,221);assert.equal(store.quality().complete,0);assert.deepEqual(store.quality().sourceRefreshConflicts,[]);
 assert.equal(store.all().filter(x=>x.universityId==='HK-HKUST'&&x.verification==='programme_page_checked').length,48);
 assert.equal(store.all().filter(x=>x.universityId==='HK-HKUST'&&x.verification==='catalogue_seed').length,1);
 assert.deepEqual(routeSummary(routes),{groups:7,routes:17,pageChecked:17,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:139,categories:280,peerReviewed:0});
 for(const id of obs.programmeIds){const x=batch.programmes.find(x=>x.id===id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(x)),false);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,['HK-HKUST-P008','HK-HKUST-P031'].includes(id)?'2026-10-31':'2026-10-30');assert.equal(batch.pilotProgrammeIds.includes(id),false);}
});

test('Accounting keeps non-business alternatives disjunctive and the conditional professional fee separate',()=>{
 assert.equal(p(12).rules.some(r=>r.kind==='major'||r.kind==='experience'),false);
 assert.match(academic(12),/at least ONE of.*Statistics.*CPA.*two full-time post-qualification years/);assert.match(academic(12),/not cumulative/);
 assert.equal(p(12).offerings[0].tuition,428000);assert.match(p(12).offerings[0].feeBasis,/HKD 10,000 each when needed/);
 assert.equal(matchProgramme(p(12),profile).checks.some(c=>c.kind==='experience'&&c.status==='fail'),false);
});

test('Finance mandatory PT experience is distinct from FT entry and Family Office PT preference',()=>{
 assert.match(academic(31),/Full-time Finance has no minimum work duration.*Part-time Finance requires one year/);
 assert.ok(p(31).rules.find(r=>r.kind==='experience').appliesTo.offeringIds.includes('HK-HKUST-P031-2027-PT'));assert.equal(matchProgramme(p(31),profile).checks.some(c=>c.kind==='experience'&&c.status==='fail'),false);
 for(const n of [30,31]){assert.deepEqual(p(n).offerings.map(o=>o.deadline),['2027-02-28','2027-05-02']);assert.ok(p(n).offerings.every(o=>o.applicationFee===800));}
 assert.match(academic(30),/PREFERRED.*not a compulsory minimum/);for(const n of [30,36,43])assert.equal(p(n).rules.some(r=>r.kind==='experience'),false);
});

test('ordinary International Management does not inherit CEMS maximum work, GMAT, languages or overseas study',()=>{
 assert.match(academic(42),/Optional CEMS.*no more than two/);assert.match(academic(42),/not universal MSc gates/);
 assert.match(p(42).offerings[0].intake,/Summer foundation/);assert.equal(p(42).offerings[0].tuition,420000);assert.equal(p(42).rules.some(r=>r.kind==='experience'||r.kind==='major'),false);
 assert.ok(p(42).rules.some(r=>r.kind==='manual'&&/MGMT 5983/.test(r.noteEn)));assert.equal(matchProgramme(p(42),{...profile,experienceYears:10}).tier,null);
});

test('GCS uses its real 3.0/4.0 and higher English thresholds while its research-concentration price stays separate',()=>{
 const gpa=input=>matchProgramme(p(34),{...profile,...input}).checks.find(c=>c.kind==='gpa').status;
 assert.equal(gpa({gpa:2.99}), 'fail');assert.equal(gpa({gpa:3}), 'pass');assert.equal(gpa({gpa:85,gpaScale:100}), 'unknown');
 const lang=input=>matchProgramme(p(34),{...profile,language:{...profile.language,...input}}).checks.find(c=>c.kind==='language').status;
 assert.equal(lang({total:6.5}), 'fail');assert.equal(lang({total:7}), 'pass');assert.equal(lang({type:'toefl_6',total:4.5,testDate:'2026-02-01'}),'fail');assert.equal(lang({type:'toefl_6',total:5,testDate:'2026-02-01'}),'pass');
 assert.deepEqual(p(34).offerings.map(o=>[o.mode,o.duration,o.tuition]),[['Full-time','1 year',170000],['Part-time','2 years',170000]]);assert.match(academic(34),/two years full-time at HKD 255,000/);
 for(const n of [4,29,11])assert.equal(p(n).rules.find(r=>r.kind==='classification').min,'second_lower');
});

test('ILE language concentrations stay mandatory manual checks rather than a borrowed common English pass',()=>{
 assert.equal(p(8).rules.some(r=>r.kind==='language'),false);assert.match(academic(8),/Choose one explicit concentration/);
 const teaching=routes.get(p(8).id);assert.equal(teaching.length,2);assert.equal(teaching[0].rules.find(r=>r.kind==='language').tests.ielts.componentMins.writing,7);assert.match(teaching[1].rules.find(r=>r.labelEn==='TCSL Chinese language evidence').noteEn,/HSK Level 5.*PSC Grade 2B/);
 const m=matchProgramme(p(8),{...profile,language:{...profile.language,total:9}});assert.equal(m.checks.some(c=>c.kind==='language'&&c.status==='pass'),false);assert.equal(m.status,'needs_confirmation');assert.equal(m.tier,null);
 assert.match(academic(7),/ONE of HSK Level 4.*not an exclusive required major/);assert.equal(p(7).rules.some(r=>r.kind==='major'),false);
});

test('public policy and management have different work gates and totals are not multiplied by duration or extra-credit rate',()=>{
 assert.equal(matchProgramme(p(11),profile).checks.find(c=>c.kind==='experience').status,'fail');assert.equal(matchProgramme(p(11),{...profile,experienceYears:3}).checks.find(c=>c.kind==='experience').status,'pass');
 assert.equal(p(4).rules.some(r=>r.kind==='experience'),false);assert.equal(p(4).offerings[0].duration,'2 years');assert.equal(p(4).offerings[0].tuition,320000);
 assert.match(p(4).offerings[0].feeBasis,/7,000 each/);assert.match(p(11).offerings[0].feeBasis,/7,500 each/);
 assert.equal(p(6).offerings[0].tuition,200000);assert.notEqual(p(6).offerings[0].tuition,27*7500);
 assert.equal(p(9).offerings.length,2);assert.ok(p(9).offerings.every(o=>o.tuition===178000&&!/PGD/.test(o.id)));assert.match(academic(9),/PGD is not available for new admission/);
 assert.equal(p(48).rules.some(r=>r.kind==='major'),false);assert.match(academic(48),/other fields.*not an engineering-only hard filter/);
});

test('MSc priority and ordinary category evidence remain exact; EMBA does not inherit a generic English or MSc date gate',()=>{
 for(const id of obs.boundaries.priority.appliesTo){const x=store.get(id);assert.ok(x.offerings.every(o=>o.applicationOpen==='2026-09-01'));assert.ok(x.sources.some(s=>s.url===obs.boundaries.priority.sourceUrl));}
 for(const plan of obs.applicantContextPlan.filter(x=>!x.mba)){const x=store.get(plan.programmeId),o=x.offerings.find(o=>o.id===plan.offeringId);assert.equal(o.deadline,null);for(const [suffix,date] of [['LOCAL',plan.local],['NONLOCAL',plan.nonLocal]]){const r=resolveProgramme(x,routes,undefined,o.id,o.id+'-'+suffix,contexts);assert.equal(r.offerings[0].deadline,date);assert.equal(r.offerings[0].tuition,o.tuition);assert.equal(r.offerings[0].intake,'September 2027');}}
 assert.equal(p(5).scope.status,'unconfirmed');assert.equal(p(5).rules.some(r=>r.kind==='language'),false);assert.equal(p(5).rules.find(r=>r.kind==='experience').min,8);assert.equal(p(5).offerings[0].deadline,null);assert.equal(p(5).offerings[0].applicationOpen,null);assert.match(academic(5),/exempts applicants.*English/);
 const m=matchProgramme(p(5),{...profile,experienceYears:8,language:{type:'ielts',total:1}});assert.equal(m.checks.some(c=>c.kind==='language'&&c.status==='fail'),false);assert.equal(m.status,'needs_confirmation');
});

test('MBA stays grouped until exact route selection; PT categories retain their distinct visa label and FT local stays unknown',()=>{
 assert.equal(programmeTimeline(resolveProgramme(p(10),routes),'2026-10-30').state,'route_required');
 assert.throws(()=>resolveProgramme(p(10),routes,undefined,'HK-HKUST-P010-2027-FT'));
 for(const [route,tag] of [['REGULAR','WEEKLY'],['BIWEEKLY','BIWEEKLY']]){
  assert.equal(programmeTimeline(mba(route,tag),'2026-10-30').state,'applicant_required');
  const local=mba(route,tag,'LOCALHKVALIDVISA'),intl=mba(route,tag,'INTERNATIONAL');assert.equal(local.offerings[0].deadline,'2027-06-24');assert.equal(intl.offerings[0].deadline,'2027-05-27');assert.match(local.selectedApplicant.label,/valid visa/);assert.match(local.offerings[0].intake,/July 2027.*August/);assert.equal(local.offerings[0].tuition,510000);
  assert.throws(()=>resolveProgramme(p(10),routes,`HK-HKUST-P010-ROUTE-${route}`,`HK-HKUST-P010-2027-${tag}`,'HK-HKUST-P010-2027-FT-INTERNATIONAL',contexts));
 }
 const ft=mba('REGULAR','FT');assert.equal(ft.offerings[0].deadline,null);assert.equal(ft.offerings[0].applicationRounds,undefined);assert.match(ft.offerings[0].deadlineNote,/International rolling cutoff 13 May 2027.*No local final/);assert.equal(programmeTimeline(ft,'2026-10-30').state,'dates_incomplete');
 assert.equal(ft.offerings[0].tuition,600000);assert.equal(ft.offerings[0].applicationFee,500);assert.match(ft.offerings[0].feeBasis,/65,000.*deducted.*not added/);
 assert.match(ft.notesEn,/Full-time: two.*Weekly part-time: three/);assert.equal(matchProgramme(mba('BIWEEKLY','BIWEEKLY'),{...profile,experienceYears:2}).checks.find(c=>c.kind==='experience').status,'fail');
 assert.ok(ft.rules.some(r=>r.kind==='manual'&&/DET 125.*manual alternative/.test(r.noteEn)));
});

test('repeated isolated imports preserve all earlier IDs and bind 139 contexts without touching the daily database',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hkust-remaining-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));
  for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,221);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const ri=loadRoutes(routePath,db.all());assert.equal(loadApplicantContexts(contextPath,db.all(),ri).size,139);db.close();db=null;}
 }finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-30');assert.equal(q.counts.reviewUnits,377);assert.equal(q.counts.nearCutoffUnits,3);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-30T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all current direct/routed options in the earlier batch preserve source-scoped details, matching, remembered choices and privacy-safe export',async()=>{
 let visits=0;const selections=obs.programmeIds.filter(id=>![p(10).id,p(8).id].includes(id)).map(id=>[store.get(id),undefined]).concat([p(10).id,p(8).id].flatMap(id=>routes.get(id).map(r=>[r,r.routeId])));
 for(const [x,routeId] of selections)for(const o of x.offerings){const plan=obs.applicantContextPlan.find(c=>c.offeringId===o.id);for(const category of plan?(plan.mba?['INTERNATIONAL','LOCALHKVALIDVISA']:['LOCAL','NONLOCAL']):[null]){
  const id=x.id||p(10).id,applicant=category?o.id+'-'+category:undefined,query=new URLSearchParams({offering:o.id,...(routeId?{route:routeId}:{}),...(applicant?{applicant}:{})});
  const res=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(res.status,200);const d=await res.json();assert.equal(d.offerings[0].tuition,o.tuition);assert.equal(d.offerings[0].applicationFee,o.applicationFee);
  const saved=optionSnapshot(d,'2026-10-30T08:00:00.000Z'),restore=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restore.status,200);assert.equal((await restore.json()).items[0].status,'resolved');
  const exported=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exported.offerings[0].tuition,o.tuition);assert.equal(exported.profile,undefined);assert.equal(exported.match,undefined);
  const result=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:routeId?{[id]:routeId}:{},selectedOfferings:{[id]:o.id},selectedApplicants:applicant?{[id]:applicant}:{}})});assert.equal(result.status,200);assert.equal((await result.json()).items.find(x=>x.id===id).match.tier,null);visits++;
 }}assert.equal(visits,44);
});
