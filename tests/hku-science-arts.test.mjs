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
const batch=read('data/checked-programmes.json'),obs=read('data/research/hku-science-arts-observation-2026-11-01.json');
const options={seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)};
const store=new CatalogueStore(':memory:',options),routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root);
const routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const p=n=>store.get(`HK-HKU-P${String(n).padStart(3,'0')}`),records=obs.programmeIds.map(id=>store.get(id));
const profile={major:'Physics',degreeStatus:'graduated',classification:'second_lower',gpa:3,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:6,reading:6,writing:6,speaking:6},testDate:'2025-09-01'}};
const resolve=(n,mode='FT',cat)=>{const o=p(n).offerings.find(o=>o.mode===(mode==='FT'?'Full-time':'Part-time'));assert.ok(o,'Unsupported mode');return resolveProgramme(p(n),routes,undefined,o.id,cat?o.id+'-'+cat:undefined,contexts);};
const language=(x,l=profile.language)=>matchProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');
const academic=x=>x.rules.find(r=>r.labelEn==='Programme-specific academic and evidence conditions').noteEn,docs=x=>x.rules.find(r=>r.labelEn==='Exact supporting documents and relative timing').noteEn;
const choices=()=>records.flatMap(x=>x.offerings.flatMap(o=>(obs.applicantContextPlan.some(c=>c.offeringId===o.id)?['LOCAL','NONLOCAL']:[undefined]).map(cat=>resolveProgramme(x,routes,undefined,o.id,cat?o.id+'-'+cat:undefined,contexts))));

test('eight existing identities gain ten offerings and three deadline contexts without inventing degrees or complete verification',()=>{
 assert.equal(records.length,8);assert.equal(records.flatMap(p=>p.offerings).length,10);assert.equal(choices().length,13);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().checked,345);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.equal(store.all().filter(p=>p.universityId==='HK-HKU'&&p.verification==='programme_page_checked').length,93);assert.deepEqual(routeSummary(routes),{groups:17,routes:41,pageChecked:41,peerReviewed:0,complete:0});assert.deepEqual(applicantSummary(contexts),{studyOptions:228,categories:457,peerReviewed:0});
 for(const x of records){assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-01');assert.equal(x.rules.some(r=>['gpa','experience'].includes(r.kind)),false);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p=>p.id===x.id))),false);}
});

test('AI ethics and Museum academic alternatives never collapse into a single exclusive major or invented employment threshold',()=>{
 assert.match(academic(p(8)),/Philosophy.*OR another major.*experience studying/);assert.match(academic(p(10)),/relevant experience or qualifications/);
 for(const n of [8,10]){const x=resolve(n),m=matchProgramme(x,{...profile,major:'Computer Science',experienceYears:0});assert.equal(x.rules.some(r=>r.kind==='major'),false);assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.equal(m.status,'needs_confirmation');assert.equal(x.offerings[0].applicationFee,780);assert.throws(()=>resolve(n,'PT'));}
});

test('Arts language floors retain writing and exam-version boundaries instead of borrowing Science scores',()=>{
 for(const n of [8,10]){const x=resolve(n),r=x.rules.find(r=>r.kind==='language');assert.equal(language(x,{...profile.language,total:6.5}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:80,components:{writing:24},testDate:'2026-01-20'}).status,'fail');assert.equal(language(x,{type:'toefl_120',total:80,components:{writing:25},testDate:'2026-01-20'}).status,'pass');assert.equal(language(x,{type:'toefl_6',total:4.5,components:{writing:4.5},testDate:'2026-01-21'}).status,'fail');assert.equal(language(x,{type:'toefl_6',total:4.5,components:{writing:5},testDate:'2026-01-21'}).status,'pass');assert.equal(r.tests.ielts.componentMin,5.5);assert.equal(r.tests.toefl_120.atHomeAccepted,false);assert.equal(language(x,{type:'toefl_120',total:80,components:{writing:25},testDate:'2026-01-20',atHome:true}).status,'fail');assert.equal(language(x,{...profile.language,testDate:'2025-08-31'}).status,'fail');}
});

test('Applied Geosciences honours classes are comparable while GPA conversion and General-theme PT remain unconfirmed',()=>{
 const x=resolve(62),check=profile=>matchProgramme(x,profile).checks.find(c=>c.kind==='classification');assert.equal(check(profile).status,'pass');assert.equal(check({...profile,classification:'first'}).status,'pass');assert.equal(check({...profile,classification:'third'}).status,'fail');assert.equal(check({...profile,classification:undefined,gpa:4,gpaScale:4}).status,'unknown');assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.equal(routes.has(x.id),false);
 assert.match(x.rules.find(r=>r.labelEn==='Theme and mode availability').noteEn,/General Applied Geosciences is FT ONLY/);assert.equal(resolve(62,'PT').offerings[0].tuition,210000);assert.equal(resolve(62).offerings[0].tuition,210000);assert.match(resolve(62).offerings[0].deadlineNote,/31 March.*distinct.*30 April/);
});

test('Marine any-major eligibility keeps required science coursework and the Australia field course remains elective',()=>{
 const x=resolve(85,'FT','NONLOCAL'),m=matchProgramme(x,{...profile,major:'History'});assert.equal(m.checks.find(c=>c.kind==='major').status,'pass');assert.equal(m.status,'needs_confirmation');assert.match(x.rules.find(r=>r.labelEn==='Marine prior learning and elective overseas field course').noteEn,/biology, ecology and chemistry.*IMEC7008.*ELECTIVE.*AUSTRALIA/);assert.equal(x.scope,undefined);assert.match(academic(x),/honours bachelor\/equivalent/);assert.equal(x.rules.some(r=>r.kind==='classification'),false);assert.throws(()=>resolve(85,'PT'));
});

test('Physics degree labels, GPA and programming alone do not establish its full prerequisite preparation',()=>{
 const x=resolve(87,'FT','NONLOCAL'),m=matchProgramme(x,{...profile,major:'Computer Science',gpa:4});assert.match(academic(x),/electromagnetism.*quantum mechanics.*thermodynamics.*linear algebra.*multivariable calculus/);assert.equal(m.status,'needs_confirmation');assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.throws(()=>resolve(87,'PT'));
});

test('Innovation FT and tentative January PT select different cohort dates and only trusted FT selection activates its date anchor',()=>{
 const ft=resolve(84),pt=resolve(84,'PT');assert.equal(ft.academicYear,'2027/28');assert.equal(pt.academicYear,'January 2027');assert.equal(p(84).fieldStatus.academicYear.status,'unknown');assert.match(pt.offerings[0].intake,/January 2027.*tentative/);assert.equal(ft.offerings[0].duration,'10 months (one academic year)');assert.equal(pt.offerings[0].duration,'18 months (1.5 academic years)');assert.equal(pt.offerings[0].deadline,'2026-10-30');assert.deepEqual(ft.offerings[0].applicationRounds.map(r=>r.deadline),['2027-01-15','2027-04-30']);assert.equal(programmeTimeline(pt,'2026-11-01').state,'deadline_passed');
 const old={...profile.language,testDate:'2025-08-31'};assert.equal(language(ft,old).status,'fail');assert.equal(language(pt,old).status,'pass');assert.equal(matchProgramme(pt,{...profile,language:old}).status,'needs_confirmation');
 const bare=p(84),forged=JSON.parse(JSON.stringify(ft));for(const x of [bare,forged]){const cs=matchProgramme(x,profile).checks.filter(c=>c.kind==='language');assert.equal(cs.length,2);assert.ok(cs.every(c=>c.status==='unknown'));}
 assert.ok(ft.rules.find(r=>r.labelEn==='January PT English-date applicability').appliesTo.offeringIds.includes(pt.offerings[0].id));
});

test('Innovation portfolio alternatives and GBA delivery stay explicit without invented rejection or HK-only approval',()=>{
 const x=resolve(84),m=matchProgramme(x,{...profile,major:'History'});assert.match(academic(x),/STEM-related degree OR a portfolio/);assert.match(docs(x),/Portfolio REQUIRED for non-STEM.*highly recommended for STEM/);assert.equal(x.rules.some(r=>r.kind==='major'),false);assert.equal(x.scope.status,'unconfirmed');assert.match(x.scope.reasonEn,/Hong Kong & GBA.*Shenzhen/);assert.equal(m.checks.find(c=>c.kind==='scope').status,'unknown');assert.equal(m.checks.some(c=>c.status==='fail'),false);assert.equal(m.tier,null);assert.match(x.rules.find(r=>r.labelEn==='Technical portfolio and exact cohort evidence').noteEn,/no separate pre-application/);
});

test('referee quantities, optional/mandatory wording, scanned materials and incompatible relative clocks remain programme-specific',()=>{
 assert.match(docs(p(8)),/TWO ACADEMIC.*NOT REQUIRED.*MONTH from notification.*MONTH from application.*FOUR WEEKS/);assert.match(docs(p(10)),/THREE pages.*scanned.*TWO ACADEMIC.*600-800-word/);assert.match(docs(p(62)),/OPTIONAL/);assert.match(docs(p(64)),/does not establish a numeric referee count/);assert.match(docs(p(83)),/MANDATORY.*does not establish a numeric count/);assert.match(docs(p(85)),/AT LEAST ONE.*OPTIONAL/);assert.match(docs(p(87)),/TWO.*OPTIONAL.*FOUR WEEKS.*ONE MONTH/);assert.match(docs(p(84)),/CV and TWO referees.*MONTH of application/);
 for(const x of choices()){const r=x.rules.find(r=>r.kind==='language'&&(!r.appliesTo||r.appliesTo.offeringIds.includes(x.selectedOffering.id)));assert.equal(r.tests.toefl_120.atHomeAccepted,false);assert.equal(r.tests.toefl_6.atHomeAccepted,false);if(![8,10].some(n=>p(n).id===x.id)){assert.equal(r.tests.ielts.total,6);assert.equal(r.tests.toefl_120.componentMins,undefined);}}
});

test('three source-bound applicant contexts mask unselected facts and preserve exact category-specific noon boundaries',()=>{
 for(const [n,local,nonlocal] of [[64,'2027-06-30','2027-04-30'],[85,'2027-06-29','2027-05-31'],[87,'2027-06-30','2027-04-30']]){const bare=resolve(n);assert.equal(bare.offerings[0].tuition,null);assert.equal(bare.offerings[0].deadline,null);assert.equal(programmeTimeline(bare,'2026-11-01').state,'applicant_required');for(const [cat,date] of [['LOCAL',local],['NONLOCAL',nonlocal]]){const x=resolve(n,'FT',cat),o=x.offerings[0];assert.equal(o.deadline,date);assert.equal(o.applicationRounds[0].deadlineAt,date+'T12:00:00+08:00');assert.equal(programmeTimeline(x,date,date+'T03:59:59.999Z').offerings[0].rounds[0].state,o.applicationOpen?'within_recorded_dates':'cutoff_ahead');assert.equal(programmeTimeline(x,date,date+'T04:00:00.000Z').offerings[0].rounds[0].state,'cutoff_reached');assert.equal(x.selectedApplicant.id,o.id+'-'+cat);assert.equal(x.offerings[0].applicationFee,null);}}
 for(const plan of obs.applicantContextPlan){const o=store.get(plan.programmeId).offerings.find(o=>o.id===plan.offeringId),c=[...contexts.values()].find(c=>c.offeringId===o.id);assert.equal(c.offeringFingerprint,offeringFingerprint(o));}
});

test('current-cohort and whole-programme fees never inherit old Science prices, instalment multiples or automatic grants',()=>{
 assert.equal(resolve(83).offerings[0].tuition,230000);assert.match(resolve(83).offerings[0].feeBasis,/200,000.*2,610.*2026\/27/);assert.equal(resolve(83).offerings[0].applicationOpen,'2026-11-09');assert.equal(resolve(83).offerings[0].deadline,'2027-04-30');assert.equal(programmeTimeline(resolve(83),'2026-11-01').state,'not_yet_open');assert.equal(resolve(87,'FT','NONLOCAL').offerings[0].applicationOpen,'2026-11-02');assert.equal(resolve(64,'FT','LOCAL').offerings[0].tuition,293100);assert.match(resolve(64,'FT','LOCAL').offerings[0].feeBasis,/THREE instalments.*not three times/);assert.equal(resolve(85,'FT','LOCAL').offerings[0].tuition,315000);for(const m of ['FT','PT'])assert.equal(resolve(84,m).offerings[0].tuition,330000);
 assert.equal(obs.pdfChecks.length,19);assert.equal(obs.pdfChecks.filter(p=>p.textExtractable).length,18);assert.equal(obs.pdfChecks.reduce((n,p)=>n+p.renderedPages.length,0),13);assert.equal(obs.pdfChecks.filter(p=>p.renderedPages.length).length,8);
});

test('temporary repeated source migration preserves previous parents and exactly binds the three new deadline contexts',()=>{
 const ids=new Set(obs.programmeIds),before={...batch,programmes:batch.programmes.filter(p=>!ids.has(p.id))},dir=mkdtempSync(join(tmpdir(),'gradpath-hku-science-arts-')),file=join(dir,'test.sqlite'),checkedPath=join(dir,'checked.json');let db;
 try{writeFileSync(checkedPath,JSON.stringify(before));db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,before.programmes.length);const earlier=db.all().filter(p=>!ids.has(p.id));db.close();db=null;writeFileSync(checkedPath,JSON.stringify(batch));for(let i=0;i<2;i++){db=new CatalogueStore(file,{...options,checkedPath});assert.equal(db.quality().checked,345);assert.deepEqual(db.all().filter(p=>!ids.has(p.id)),earlier);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);assert.equal(loadApplicantContexts(contextPath,db.all(),loadRoutes(routePath,db.all())).size,228);db.close();db=null;}}
 finally{db?.close();rmSync(file,{force:true});rmSync(checkedPath,{force:true});rmdirSync(dir);}
 const q=loadRepositoryReviewQueue('2026-11-01');assert.equal(q.counts.reviewUnits,614);assert.equal(q.counts.nearCutoffUnits,7);assert.equal(q.counts.staleApplicantContexts,0);
});

const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-01T08:00:00Z')});let base;
test.before(async()=>{await new Promise(r=>app.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.address().port}`;});test.after(async()=>{await new Promise(r=>app.close(r));store.close();});
test('all thirteen mode/category choices preserve identity, fees, dates and conditions through actual API, saved restore and export',async()=>{
 let visits=0;for(const x of choices()){const id=x.id,o=x.offerings[0],cat=x.selectedApplicant?.id,query=new URLSearchParams({offering:o.id,...(cat?{applicant:cat}:{})}),res=await fetch(`${base}/api/programmes/${id}?${query}`,{headers:{Connection:'close'}});assert.equal(res.status,200);const d=await res.json(),saved=optionSnapshot(d,'2026-11-01T08:00:00.000Z');const rr=await fetch(base+'/api/saved-options/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contexts:[saved]})});assert.equal(rr.status,200);const item=(await rr.json()).items[0];assert.equal(item.status,'resolved');assert.deepEqual(item.programme.offerings,d.offerings);assert.equal(item.programme.selectedApplicant?.id,cat);
  const exp=shortlistExport([d],{[id]:saved}).programmes[0];assert.equal(exp.profile,undefined);assert.equal(exp.match,undefined);assert.equal(exp.offerings[0].tuition,o.tuition);assert.equal(exp.offerings[0].deadline,o.deadline);assert.equal(exp.selectedOffering.id,o.id);assert.equal(exp.selectedApplicant?.id,cat);assert.equal(exp.academicYear,d.academicYear);
  const response=await fetch(base+'/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({profile,selectedOfferings:{[id]:o.id},selectedApplicants:cat?{[id]:cat}:{},filters:{school:'HK-HKU'}})});assert.equal(response.status,200);const m=(await response.json()).items.find(v=>v.id===id);assert.equal(m.match.tier,null);assert.equal(m.match.status,'needs_confirmation');visits++;
 }assert.equal(visits,13);
});
