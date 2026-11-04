import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CatalogueStore} from '../server/database.mjs';
import {createApp} from '../server/app.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,applicantSummary,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {optionSnapshot,shortlistExport} from '../public/saved-options.js';
import {loadSchoolBacklog,formatSchoolBacklog} from '../scripts/school-data-backlog.mjs';
import {loadRepositoryReviewQueue} from '../scripts/source-review-queue.mjs';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8')),batch=read('data/checked-programmes.json'),obs=read('data/research/lingnan-gs-remainder-observation-2026-11-03.json');
const paths={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)},store=new CatalogueStore(':memory:',paths),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-LU-P${String(n).padStart(3,'0')}`),profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:6.5,testDate:'2026-05-01',singleAttempt:true}};
const selected=(n,index=0,cat)=>{const o=p(n).offerings[index];return resolveProgramme(p(n),routes,undefined,o.id,cat?o.id+'-'+cat:undefined,contexts);};
const route=tag=>resolveProgramme(p(5),routes,'HK-LU-P005-ROUTE-'+tag,'HK-LU-P005-'+tag+'-2027-FT',undefined,contexts);
const note=(n,label)=>p(n).rules.find(r=>r.labelEn===label)?.noteEn,academic=n=>note(n,'Programme academic and preparatory conditions'),docs=n=>note(n,'Documents, referees and personal timing');
const choices=()=>obs.programmeIds.flatMap(id=>{const r=routes.get(id);return(r||[store.get(id)]).flatMap(x=>x.offerings.flatMap(o=>{const plan=obs.applicantContextPlan.find(c=>c.programmeId===id&&c.routeId===(x.routeId||null)&&c.offeringId===o.id);return(plan?plan.options:[undefined]).map(c=>resolveProgramme(store.get(id),routes,x.routeId,o.id,c?.id,contexts));}));});

test('ten remaining Lingnan identities add two exact ACHM paths and twenty-two choices without extra catalogue degrees',()=>{
 assert.equal(obs.programmeIds.length,10);assert.equal(choices().length,22);assert.equal(obs.programmeIds.flatMap(id=>store.get(id).offerings).length,19);assert.equal(routes.get(p(5).id).flatMap(r=>r.offerings).length,2);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,440);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);assert.equal(store.quality().outOfScope,7);
 assert.deepEqual(routeSummary(routes),{groups:28,routes:63,pageChecked:63,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:345,categories:694,peerReviewed:0});assert.equal(p(1).lastChecked,'2026-10-23');
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.lastChecked,'2026-11-03');assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.rules.some(r=>r.kind==='gpa'||r.kind==='experience'),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===id))),false);}
 assert.equal(obs.observedOn,'2026-11-03');assert.equal(obs.preparedOn,'2026-11-04');
});

test('MRes follows official taught classification rather than its degree name, retaining research/entry-honours alternatives and credit contradictions',()=>{
 const x=selected(21);assert.equal(x.scope.status,'in_scope');assert.match(x.scope.sourceUrl,/sds\/dai\/programmes$/);assert.match(academic(21),/TAUGHT POSTGRADUATE.*MPhil\/PhD.*Research Postgraduate/);assert.match(academic(21),/FIRST- OR SECOND-CLASS HONOURS, OR.*equivalent/);assert.equal(x.rules.some(r=>r.kind==='classification'||r.kind==='gpa'),false);assert.equal(matchProgramme(x,{...profile,classification:'ordinary',gpa:99,gpaScale:100}).status,'needs_confirmation');assert.match(x.offerings[0].duration,/1.5 years.*maximum 3/);
 assert.match(note(21,'MRes research structure and entry honours'),/45-credit.*6-credit.*15-credit thesis.*TWO electives.*THREE/);assert.match(academic(21),/non-credit pre-entry/);assert.equal(x.offerings[0].tuition,351000);assert.equal(x.offerings[0].tuitionEstimate,true);assert.match(x.offerings[0].feeBasis,/SUBJECT TO APPROVAL.*3,000 PER COURSE.*600/);
});

test('ACHM requires an explicit path and keeps Hong Kong HTM separate from dual mixed-currency UK study',()=>{
 const grouped=resolveProgramme(p(5),routes);assert.equal(grouped.routeOptions.length,2);assert.equal(programmeTimeline(grouped,'2026-11-04').state,'route_required');assert.throws(()=>selected(5));assert.equal(grouped.offerings[0].tuition,null);assert.equal(grouped.offerings[0].deadline,null);
 const h=route('HTM'),d=route('LINCOLN');assert.equal(h.scope.status,'in_scope');assert.equal(h.offerings[0].tuition,180000);assert.equal(h.offerings[0].currency,'HKD');assert.equal(d.scope.status,'unconfirmed');assert.equal(d.offerings[0].tuition,null);assert.equal(d.offerings[0].currency,'HKD');assert.match(d.offerings[0].feeBasis,/HKD 90,000 PLUS.*GBP 10,500.*INDICATIVE/);assert.match(d.scope.reasonEn,/required UK study.*no blanket parent exclusion/);assert.equal(d.fieldStatus.language.status,'unknown');assert.match(d.rules.find(r=>r.labelEn==='Separate University of Lincoln requirements').noteEn,/NOT confirmation/);assert.equal(matchProgramme(d,profile).tier,null);assert.equal(matchProgramme(h,profile).tier,null);
 for(const r of [h,d]){assert.equal(r.offerings[0].deadline,'2027-06-30');assert.equal(r.rules.some(q=>q.kind==='gpa'),false);assert.equal(r.lastChecked,'2026-11-03');}
});

test('SAG keeps the partner boundary and fee-approval/application-fee conflicts without adding a fifteenth institution',()=>{
 assert.equal(p(8).scope.status,'unconfirmed');assert.match(academic(8),/LU\/HKMU DOUBLE DEGREE.*2026\/27/);assert.match(p(8).scope.reasonEn,/fourteen-institution list/);assert.equal(store.quality().universities,14);
 for(const i of [0,1]){assert.equal(programmeTimeline(selected(8,i),'2026-11-04').state,'applicant_required');for(const tag of ['LOCAL','NONLOCAL']){const x=selected(8,i,tag),o=x.offerings[0];assert.equal(o.tuition,150000);assert.equal(o.tuitionEstimate,true);assert.equal(o.applicationFee,null);assert.match(o.feeBasis,/300.*515.*400.*NULL/);assert.equal(o.deadline,'2027-06-30');const m=matchProgramme(x,profile);assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.find(c=>c.kind==='scope').status,'unknown');}}
 for(const plan of obs.applicantContextPlan){const o=p(8).offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));}
});

test('published whole-programme prices are not doubled for part-time study or reduced by scholarships',()=>{
 for(const [n,price] of [[2,190000],[3,175000],[4,174000],[6,205000],[7,198000],[9,210000]]){assert.equal(selected(n).offerings[0].tuition,price);assert.equal(selected(n,1).offerings[0].tuition,price);assert.equal(selected(n,1).offerings[0].applicationFee,400);assert.equal(selected(n,1).offerings[0].deadline,'2027-06-30');}
 for(const n of [6,7,9])assert.match(selected(n,1).offerings[0].feeBasis,/SAME WHOLE-PROGRAMME.*do not double/);assert.equal(selected(6,1).offerings[0].duration,'24 months; maximum 36 months');assert.equal(selected(7).offerings[0].duration,'12 months; maximum 24 months');
});

test('Cross-disciplinary Technologies keeps all three term windows and prevents Spring prices/rules from becoming later-year gates',()=>{
 assert.deepEqual(p(26).offerings.map(o=>[o.academicYear,o.deadline,o.tuition]),[['2026/27','2026-11-30',188000],['2027/28','2027-07-30',null],['2027/28','2027-11-30',null]]);assert.equal(p(26).offerings[2].applicationOpen,'2027-08-01');assert.match(docs(26),/2026–27 portal/);assert.equal(matchProgramme(selected(26,1),profile).checks.some(c=>c.kind==='language'),false);assert.equal(matchProgramme(selected(26),profile).checks.find(c=>c.kind==='language').status,'pass');assert.match(p(26).offerings[2].intake,/Term 2, 2027\/28/);
 const s=note(26,'Concentrations, terms and required course choices');assert.match(s,/Ten.*older highlight prose says eight/);assert.match(s,/Four are FALL ONLY/);assert.match(s,/General students can choose either/);assert.match(academic(26),/does not establish.*mandatory overseas/);assert.equal(p(26).directoryListing,undefined);
});

test('degree type, optional concentrations and graduation or scholarship GPA do not create new degree IDs or hard entry minima',()=>{
 assert.match(academic(2),/optional concentration.*not a separate/);assert.match(academic(3),/2024\/25 title change/);assert.match(academic(3),/not a universal requirement/);assert.match(academic(4),/diverse backgrounds/);assert.match(academic(7),/not proof of.*licence/);assert.match(academic(9),/not another degree/);assert.match(academic(8),/2.67 LU \/ 2.7 HKMU.*not an entry GPA/);
 for(const n of [2,3,4,6,7,8,9,21,26])assert.equal(p(n).fieldStatus.gpa.status,'not_published');assert.equal(p(1).id,'HK-LU-P001');
});

test('reference methods, counts, recommended statement length and alternate referee clocks remain distinct',()=>{
 assert.match(route('HTM').rules.find(r=>r.labelEn==='Documents, referees and personal timing').noteEn,/NO MORE THAN TWO PAGES.*TWO confidential.*SEALED POST/);for(const n of [6,7,9])assert.match(docs(n),/reference letters IF ANY/);for(const n of [2,3,4])assert.match(docs(n),/IF APPLICABLE.*No programme-specific referee count/);assert.match(docs(21),/TWO.*THREE WEEKS.*14 DAYS/);assert.match(docs(26),/RECOMMENDED 200–500.*not.*mandatory.*SEALED POST.*no numeric referee count/);
});

test('English old-scale and relative validity conditions do not invent new TOEFL mappings or automatic waiver outcomes',()=>{
 for(const n of [2,3,4,6,7,8,9,21,26]){const r=p(n).rules.find(r=>r.kind==='language');assert.equal(r.tests.ielts.total,6);assert.equal(r.tests.toefl_120.total,79);assert.equal(r.tests.toefl_6,undefined);assert.equal(r.validityMonths,undefined);assert.equal(r.testDateNotBefore,undefined);assert.match(note(n,'Language applicability, formats and relative validity'),/ACTUAL APPLICATION SUBMISSION/);}
 const x=selected(21);assert.equal(matchProgramme(x,{...profile,language:{...profile.language,atHome:true}}).checks.find(c=>c.kind==='language').status,'fail');assert.equal(matchProgramme(x,{...profile,language:{type:'toefl_6',total:4,testDate:'2026-01-21',singleAttempt:true}}).checks.find(c=>c.kind==='language').status,'unknown');
});

test('Lingnan current inventory has no unread first-pass lead while partial/unknown conditions and older source dates remain honest',()=>{
 const b=loadSchoolBacklog('2026-11-04'),lu=b.schools.find(s=>s.schoolId==='HK-LU');assert.equal(b.counts.pageCheckedRecords,440);assert.equal(b.counts.catalogueLeads,433);assert.equal(b.counts.unreadLeads,418);assert.equal(lu.catalogueRecords,44);assert.equal(lu.pageCheckedRecords,44);assert.equal(lu.unreadLeads,0);assert.equal(lu.completeRecords,0);assert.equal(lu.activeParentNotPublishedFields.gpa,44);
 assert.deepEqual(b,read('data/research/school-backlog-2026-11-04-cuhk-engineering.json'));assert.equal(formatSchoolBacklog(b),readFileSync(new URL('docs/research/school-data-backlog-2026-11-04-cuhk-engineering.md',root),'utf8').replaceAll('\r\n','\n'));const q=loadRepositoryReviewQueue('2026-11-04');assert.equal(q.counts.reviewUnits,848);assert.equal(q.counts.nearCutoffUnits,11);assert.equal(q.counts.staleApplicantContexts,0);
 assert.equal(obs.sourceRetrievals.length,73);assert.ok(obs.sourceRetrievals.every(x=>x.status===200&&x.contentReadable&&/^[a-f0-9]{64}$/.test(x.sha256)));assert.equal(obs.limits.fullCatalogueReenumerated,false);assert.equal(obs.limits.pdfBrochuresUsed,false);assert.equal(obs.limits.independentHumanReviews,0);
});

test('isolated repeated imports preserve all earlier parent objects and prior route/context evidence across restarts',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-lingnan-gs-remainder-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...paths,checkedPath});assert.equal(db.quality().checked,440);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);const rs=loadRoutes(routePath,db.all());assert.equal(rs.size,28);assert.equal(loadApplicantContexts(contextPath,db.all(),rs).size,345);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all twenty-two exact choices survive real APIs, matching, saved restore and export without mixing sibling fees or requirements',async()=>{
 for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant?.id,rid=x.selectedRoute?.id,q=new URLSearchParams({offering:o.id,...(rid?{route:rid}:{}),...(cat?{applicant:cat}:{})}),r=await fetch(`${base}/api/programmes/${id}?${q}`);assert.equal(r.status,200);const d=await r.json(),saved=optionSnapshot(d,'2026-11-04T08:00:00.000Z');const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const restored=(await rr.json()).items[0];assert.equal(restored.status,'resolved');assert.deepEqual(restored.programme.offerings,d.offerings);const ex=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(ex.offerings[0].tuition,o.tuition);assert.equal(ex.offerings[0].deadline,o.deadline);assert.equal(ex.offerings[0].applicationFee,o.applicationFee);assert.equal(ex.profile,undefined);assert.equal(ex.match,undefined);
 const mr=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedRoutes:rid?{[id]:rid}:{},selectedOfferings:{[id]:o.id},selectedApplicants:cat?{[id]:cat}:{},filters:{school:'HK-LU'}})});assert.equal(mr.status,200);const m=(await mr.json()).items.find(p=>p.id===id);assert.equal(m.match.status,'needs_confirmation');assert.equal(m.match.tier,null);}
});
