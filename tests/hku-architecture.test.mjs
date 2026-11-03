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
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-architecture-observation-2026-10-31.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),rt=(n,tag)=>routes.get(p(n).id).find(r=>r.routeId===p(n).id+'-ROUTE-'+tag);
const snapshots=()=>[...obs.programmeIds.map(id=>store.get(id)),...obs.routeRecords.map(r=>routes.get(r.programmeId).find(x=>x.routeId===r.routeId))];
const profile={major:'Architecture',degreeStatus:'graduated',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,components:{listening:5.5,reading:5.5,writing:5.5,speaking:5.5},testDate:'2025-09-01'}};
const resolve=(n,tag,mode='FT',cat)=>{const rid=tag?p(n).id+'-ROUTE-'+tag:undefined,oid=(rid||p(n).id)+'-2027-'+mode;return resolveProgramme(p(n),routes,rid,oid,cat?oid+'-'+cat:undefined,contexts);};
const academic=x=>x.rules.find(r=>r.labelEn==='Programme-specific academic and evidence conditions').noteEn;
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');

test('seven existing direct records and eleven standalone routes preserve catalogue identities and separate evidence counts',()=>{
 assert.equal(obs.programmeIds.length,7);assert.equal(obs.routeRecords.length,11);assert.equal(obs.applicantContextPlan.length,7);assert.equal(snapshots().flatMap(x=>x.offerings).length,25);
 assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,866);assert.equal(store.quality().checked,328);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.equal(store.all().filter(x=>x.universityId==='HK-HKU'&&x.verification==='programme_page_checked').length,92);
 assert.deepEqual(routeSummary(routes),{groups:16,routes:39,pageChecked:39,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:218,categories:437,peerReviewed:0});
 for(const x of snapshots()){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.lastChecked,'2026-10-31');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>['gpa','classification','experience'].includes(r.kind)),false);const raw=x.routeId?read('data/route-programmes.json').programmes.find(g=>g.programmeId===x.id).routes.find(r=>r.routeId===x.routeId):batch.programmes.find(p=>p.id===x.id);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(raw)),false);}
 assert.equal(p(3).verification,'catalogue_seed');assert.equal(obs.programmeIds.includes(p(3).id),false);assert.equal(p(3).selectedRoute,undefined);
});

test('each grouped parent needs an explicit path and cannot supply inherited parent or sibling requirements',()=>{
 for(const [n,size] of [[1,2],[65,2],[89,3],[101,2],[102,2]]){const x=resolveProgramme(p(n),routes,undefined,undefined,undefined,contexts);assert.equal(x.verification,'catalogue_seed');assert.equal(x.routeOptions.length,size);assert.equal(programmeTimeline(x,'2026-10-31').state,'route_required');const plan=obs.routeRecords.find(v=>v.programmeId===p(n).id),r=routes.get(p(n).id).find(v=>v.routeId===plan.routeId);
  assert.throws(()=>resolveProgramme(p(n),routes,undefined,r.offerings[0].id,undefined,contexts));
  const poisoned={...p(n),notesEn:'parent marker',rules:[{kind:'gpa',min:100,scale:100}]},chosen=resolveProgramme(poisoned,routes,r.routeId,r.offerings[0].id,undefined,contexts);assert.equal(chosen.notesEn.includes('parent marker'),false);assert.equal(chosen.rules.some(r=>r.kind==='gpa'),false);assert.equal(chosen.officialUrl,r.officialUrl);assert.equal(chosen.name,p(n).directoryListing.variants.find(v=>v.officialUrl===r.officialUrl).nameEn);
  const sibling=routes.get(p(n).id).find(v=>v.routeId!==r.routeId);assert.throws(()=>resolveProgramme(p(n),routes,r.routeId,sibling.offerings[0].id,undefined,contexts));
 }
});

test('MLA separately published annual quotes and inclusive two-year estimates cannot become a default annual or double-counted tuition',()=>{
 const x=resolve(4),o=x.offerings[0];assert.equal(o.tuition,null);assert.equal(x.applicantOptions.length,2);assert.match(p(4).offerings[0].feeBasis,/annual amounts220,000.*240,000.*not whole-course totals/);
 for(const [cat,fee] of [['LOCAL',440000],['NONLOCAL',480000]]){const y=resolve(4,undefined,'FT',cat),v=y.offerings[0];assert.equal(v.tuition,fee);assert.equal(v.tuitionEstimate,true);assert.match(v.feeBasis,/440,450\/480,450 inclusive of350.*100/);assert.equal(v.duration,'2 years');assert.equal(v.applicationFee,null);assert.equal(v.tuition===220000||v.tuition===240000,false);}
 assert.throws(()=>resolve(4,undefined,'PT'));assert.match(academic(p(4)),/Oral IELTS6 is preferred/);assert.equal(language(resolve(4,undefined,'FT','LOCAL'),{...profile.language,total:6}).status,'pass');
});

test('construction, real estate and built-assets contexts retain exact totals, fees, modes and source fingerprints',()=>{
 for(const n of [5,6,66])for(const mode of ['FT','PT']){const x=resolve(n,undefined,mode);assert.equal(x.offerings[0].tuition,null);assert.equal(x.offerings[0].deadline,null);for(const [cat,fee] of [['LOCAL',280080],['NONLOCAL',300000]]){const y=resolve(n,undefined,mode,cat);assert.equal(y.offerings[0].tuition,fee);assert.equal(y.offerings[0].applicationFee,n===66?null:780);assert.equal(y.offerings[0].deadline,'2027-01-04');assert.match(y.offerings[0].feeBasis,/whole-programme/);assert.match(y.offerings[0].feeBasis,/No PT10% scholarship is automatically applied/);}}
 for(const plan of obs.applicantContextPlan){const x=p(Number(plan.programmeId.slice(-3))),o=x.offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));assert.equal(c.feeSourceUrl,plan.feeSourceUrl);}
 assert.equal(resolve(5,undefined,'PT','LOCAL').offerings[0].duration,'2 years normative; 3 years maximum');
});

test('MArch funded/self-funded totals exclude explicit ancillary charges and Design remains a distinct three-year August award',()=>{
 assert.equal(resolve(1,'NONLOCAL').offerings[0].tuition,460000);assert.equal(resolve(1,'UGC').offerings[0].tuition,99000);assert.match(resolve(1,'NONLOCAL').offerings[0].feeBasis,/460,450 inclusive of350.*100/);assert.match(resolve(1,'UGC').offerings[0].feeBasis,/99,450 inclusive of350.*100/);
 for(const tag of ['NONLOCAL','UGC']){assert.equal(resolve(1,tag).offerings[0].duration,'2 years');assert.equal(resolve(1,tag).applicantOptions,undefined);assert.equal(matchProgramme(resolve(1,tag),profile).status,'needs_confirmation');}
 const d=resolve(28);assert.equal(d.offerings[0].intake,'August 2027');assert.equal(d.offerings[0].duration,'3 years');assert.equal(d.offerings[0].tuition,724500);assert.match(academic(p(28)),/20 pages\/30MB is OPTIONAL/);assert.match(academic(rt(1,'UGC')),/30 pages\/30MB/);assert.match(d.offerings[0].deadlineNote,/April2026\/January2026.*2027/);
});

test('same-document Conservation fee conflict remains numeric-null while current PDF language minima override general/old web wording',()=>{
 for(const tag of ['PLANNING','DESIGN'])for(const mode of ['FT','PT']){const x=resolve(65,tag,mode),r=x.rules.find(r=>r.kind==='language');assert.equal(x.offerings[0].tuition,null);assert.equal(x.fieldStatus.tuition.status,'unknown');assert.match(x.offerings[0].feeBasis,/250,000.*248,800.*Neither conflicting amount/);assert.equal(r.tests.ielts.total,6.5);assert.equal(r.tests.toefl_120.total,90);assert.equal(r.tests.toefl_6.total,4.5);assert.equal(language(x,{...profile.language,total:6}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:89,testDate:'2026-01-20'}).status,'fail');assert.equal(language(x,{type:'toefl_6',total:4.5,testDate:'2026-01-21'}).status,'pass');}
 assert.match(academic(rt(65,'DESIGN')),/final allocation remains assessed/);assert.match(academic(rt(65,'PLANNING')),/15 pages\/30MB/);
});

test('Conservation PT residency and minimum cohort do not apply to FT and cannot be inferred from the student profile',()=>{
 for(const tag of ['PLANNING','DESIGN']){const ft=matchProgramme(resolve(65,tag),profile),pt=matchProgramme(resolve(65,tag,'PT'),profile);assert.equal(ft.checks.some(c=>c.labelEn==='Part-time residency and minimum cohort'),false);const c=pt.checks.find(c=>c.labelEn==='Part-time residency and minimum cohort');assert.equal(c.status,'unknown');assert.match(c.reasonEn,/at least8.*Hong Kong or Macau/);assert.equal(pt.tier,null);}
});

test('Urban Planning exact paths keep ordinary versus ADB cutoffs, unknown ADB fees and conflicting starts without inherited scholarships',()=>{
 assert.equal(resolve(89,'REGIONAL').offerings[0].tuition,426000);assert.equal(resolve(89,'UGC').offerings[0].tuition,99000);assert.equal(resolve(89,'ADB').offerings[0].tuition,null);assert.equal(resolve(89,'REGIONAL').offerings[0].deadline,'2027-01-04');assert.equal(resolve(89,'ADB').offerings[0].deadline,'2027-01-29');
 for(const tag of ['REGIONAL','UGC','ADB']){const x=resolve(89,tag);assert.equal(x.offerings[0].intake,'2027 entry (start month unconfirmed)');assert.equal(x.scope.status,'unconfirmed');assert.match(academic(x),/October2027.*September2027/);assert.equal(matchProgramme(x,{...profile,major:'History'}).checks.find(r=>r.kind==='major').status,'pass');}
 const ugc=rt(89,'UGC');assert.equal(ugc.scope.sourceUrl.includes('pREF_CODE=R260'),true);assert.equal(ugc.offerings[0].feeEvidence.sourceUrl,ugc.officialUrl);assert.equal(ugc.sources.some(s=>s.url.includes('pREF_CODE=R392')),false);
});

test('ADB policy remains path-specific documentary evidence without numeric employment or a guaranteed fee waiver',()=>{
 for(const n of [89,101]){const a=resolve(n,'ADB'),g=resolve(n,n===89?'REGIONAL':'GENERAL');assert.equal(a.offerings[0].tuition,null);assert.equal(a.rules.some(r=>r.kind==='experience'),false);assert.equal(g.rules.some(r=>r.labelEn==='ADB-JSP eligibility and funding decision'),false);const c=matchProgramme(a,{...profile,experienceYears:20}).checks.find(c=>c.labelEn==='ADB-JSP eligibility and funding decision');assert.equal(c.status,'unknown');assert.match(c.reasonEn,/POST-DEGREE FULL-TIME.*age35.*October2015.*no numeric work pass/);}
 assert.equal(obs.externalPolicyChecks[0].url,'https://www.adb.org/work-with-us/careers/japan-scholarship-program');
});

test('international field-trip uncertainty stays on exact routes and never changes unrelated parents into excluded programmes',()=>{
 for(const n of [65,89,101])for(const r of routes.get(p(n).id)){const x=resolveProgramme(p(n),routes,r.routeId,r.offerings[0].id,undefined,contexts);assert.equal(x.scope.status,'unconfirmed');assert.equal(matchProgramme(x,profile).checks.find(c=>c.kind==='scope').status,'unknown');assert.equal(matchProgramme(x,profile).status,'needs_confirmation');assert.equal(p(n).scope,undefined);}
 assert.equal(resolve(2).scope,undefined);assert.equal(resolve(28).scope,undefined);assert.equal(resolve(101,'GENERAL').offerings[0].tuition,306000);assert.match(resolve(101,'GENERAL').offerings[0].duration,/three-semester.*confirmation/);
});

test('Housing alternative professional work years do not become a universal bachelor requirement or create an Urban Studies PT option',()=>{
 const h=resolve(102,'HOUSING','PT'),u=resolve(102,'URBAN');assert.equal(h.offerings[0].tuition,238000);assert.equal(u.offerings[0].tuition,229000);assert.throws(()=>resolve(102,'URBAN','PT'));
 for(const x of [h,u]){assert.equal(x.rules.some(r=>r.kind==='experience'),false);assert.match(academic(x),/Five years.*alternatives.*NOT universal/);assert.equal(matchProgramme(x,{...profile,experienceYears:0}).checks.some(c=>c.status==='fail'),false);}
 assert.equal(resolve(88,undefined,'PT').offerings[0].tuition,300000);assert.match(resolve(88,undefined,'PT').offerings[0].feeBasis,/PT150,000 per year.*not added on top/);
});

test('test-date anchor, ordinary thresholds and per-exam MLA format limits remain exact without Arts writing floors',()=>{
 for(const x of snapshots()){assert.equal(language(x,{...profile.language,testDate:'2025-08-31'}).status,'fail');assert.equal(language(x,{type:'waiver'}).status,'unknown');const r=x.rules.find(r=>r.kind==='language');assert.equal(r.tests.toefl_120.componentMins,undefined);assert.equal(r.tests.toefl_6.componentMins,undefined);assert.equal(r.tests.ielts.componentMin,5.5);}
 const x=resolve(4,undefined,'FT','LOCAL');assert.equal(language(x,{type:'toefl_120',total:80,testDate:'2026-01-20',atHome:true}).status,'fail');assert.equal(language(x,{...profile.language,total:6,atHome:true}).status,'pass');
});

test('all twenty-five options retain exact noon boundaries, approximate openings and no live-open claim',()=>{
 for(const x of snapshots())for(const o of x.offerings){assert.equal(o.applicationOpen,null);for(const r of o.applicationRounds){assert.equal(r.deadlineAt,r.deadline+'T12:00:00+08:00');const n=Number(x.id.slice(-3)),routed=x.routeId?x.routeId.slice((x.id+'-ROUTE-').length):undefined,cat=obs.applicantContextPlan.some(c=>c.offeringId===o.id)?'LOCAL':undefined,y=resolve(n,routed,o.mode==='Full-time'?'FT':'PT',cat);const before=programmeTimeline(y,r.deadline,r.deadline+'T03:59:59.999Z'),at=programmeTimeline(y,r.deadline,r.deadline+'T04:00:00.000Z');assert.equal(before.offerings[0].rounds.find(v=>v.id===r.id).state,'cutoff_ahead');assert.equal(at.offerings[0].rounds.find(v=>v.id===r.id).state,'cutoff_reached');assert.equal(at.livePortalChecked,false);}}
 assert.equal(obs.pdfChecks.length,16);assert.equal(obs.pdfChecks.reduce((n,p)=>n+p.renderedPages.length,0),10);assert.equal(obs.pdfChecks.filter(p=>p.renderedPages.length).length,8);
});

test('temporary database upgrades preserve unrelated earlier parents and all 218 current context fingerprints',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(x=>!ids.has(x.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-architecture-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(x=>!ids.has(x.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,328);assert.deepEqual(db.all().filter(x=>!ids.has(x.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,218);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-10-31');assert.equal(q.counts.reviewUnits,585);assert.equal(q.counts.nearCutoffUnits,4);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-10-31T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all thirty-two direct/route/mode/category combinations survive actual detail, matching, saved restore and export without substitutions',async()=>{
 let visits=0;for(const x of snapshots())for(const o of x.offerings){const cats=obs.applicantContextPlan.some(c=>c.offeringId===o.id)?['LOCAL','NONLOCAL']:[undefined];for(const cat of cats){const id=x.id,rid=x.routeId,query=new URLSearchParams({offering:o.id,...(rid?{route:rid}:{}),...(cat?{applicant:o.id+'-'+cat}:{})}),res=await fetch(`${base}/api/programmes/${id}?${query}`);assert.equal(res.status,200);const d=await res.json(),saved=optionSnapshot(d,'2026-10-31T08:00:00.000Z');
  const restored=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(restored.status,200);const item=(await restored.json()).items[0];assert.equal(item.status,'resolved');assert.equal(item.programme.offerings[0].tuition,d.offerings[0].tuition);
  const exp=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);assert.equal(exp.offerings[0].tuition,d.offerings[0].tuition);assert.equal(exp.selectedOffering.id,o.id);assert.equal(exp.selectedRoute?.id,rid);if(id==='HK-HKU-P004')assert.equal(exp.offerings[0].tuitionEstimate,true);if(id==='HK-HKU-P065')assert.equal(exp.offerings[0].tuition,null);
  const response=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:cat?{[id]:o.id+'-'+cat}:{},filters:{school:'HK-HKU'}})});assert.equal(response.status,200);const m=(await response.json()).items.find(p=>p.id===id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');visits++;
 }}assert.equal(visits,32);
});
