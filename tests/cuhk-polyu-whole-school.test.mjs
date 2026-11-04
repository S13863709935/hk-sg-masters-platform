import {repositoryExpected} from './repository-expected-state.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CatalogueStore} from '../server/database.mjs';
import {loadRoutes,resolveProgramme,routeSummary} from '../server/routes.mjs';
import {loadApplicantContexts,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {validateProgramme} from '../server/validation.mjs';
import {createApp} from '../server/app.mjs';
const root=new URL('../',import.meta.url),read=f=>JSON.parse(readFileSync(new URL(f,root),'utf8'));
const obs=read('data/research/cuhk-polyu-whole-school-observation-2026-11-04.json');
const store=new CatalogueStore(':memory:',{seedPath:new URL('data/catalogue.json',root),expansionPath:new URL('data/catalogue-expansion.json',root),checkedPath:new URL('data/checked-programmes.json',root),directoryEvidencePath:new URL('data/directory-links.json',root),scopeAuditPath:new URL('data/programme-scope-audit.json',root)});
const routePath=new URL('data/route-programmes.json',root),contextPath=new URL('data/applicant-contexts.json',root),routes=loadRoutes(routePath,store.all()),contexts=loadApplicantContexts(contextPath,store.all(),routes);
const c=n=>store.get(`HK-CUHK-P${String(n).padStart(3,'0')}`),p=n=>store.get(`HK-POLYU-P${String(n).padStart(3,'0')}`);
const choose=(n,code)=>{const r=routes.get(p(n).id).find(r=>r.officialUrl.endsWith('/'+code));assert.ok(r,code);return resolveProgramme(p(n),routes,r.routeId,r.offerings[0].id,undefined,contexts);};
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:7,reading:7,writing:7,speaking:7},testDate:'2026-05-01',singleAttempt:true}};
const english=(x,language)=>matchProgramme(x,{...profile,language:{...profile.language,components:language.type==='toefl_6'?{listening:5,reading:5,writing:5,speaking:5}:language.type==='toefl_120'?{listening:26,reading:26,writing:26,speaking:26}:profile.language.components,...language}}).checks.find(c=>c.kind==='language');
const sourceParents=read('data/checked-programmes.json').programmes,rawRoutes=read('data/route-programmes.json').programmes.flatMap(g=>g.routes);
const app=createApp({store,publicDir:new URL('public/',root),routeEvidencePath:routePath,applicantEvidencePath:contextPath,now:()=>new Date('2026-11-04T04:00:00Z')});
await new Promise(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.address().port}`;
test.after(async()=>{await new Promise(r=>app.close(r));store.close();});

test('one school batch adds 216 partial parents and 75 scoped snapshots while preserving every earlier checked record',()=>{
 assert.deepEqual(obs.counts,{newPartialParents:216,CUHK:117,PolyU:99,newRouteGroups:39,newRouteSnapshots:75,readProgrammePanels:252,completeRequirements:0,independentReviews:0});
 assert.equal(store.quality().checked,repositoryExpected.checked);assert.equal(store.quality().total,873);assert.equal(store.quality().browsable,865);assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 assert.deepEqual(routeSummary(routes),{groups:repositoryExpected.routeGroups,routes:repositoryExpected.routeRecords,pageChecked:repositoryExpected.routeRecords,peerReviewed:0,complete:0});
 for(const [id,hash] of Object.entries(obs.preservedParentFingerprints))assert.equal(offeringFingerprint(sourceParents.find(p=>p.id===id)),hash,id);
 for(const [id,hash] of Object.entries(obs.preservedRouteFingerprints))assert.equal(offeringFingerprint(rawRoutes.find(r=>r.routeId===id)),hash,id);
 for(const id of obs.programmeIds){const x=store.get(id);assert.equal(x.requirementsCoverage,'partial');assert.equal(x.reviewer,null);assert.equal(x.lastChecked,'2026-11-04');assert.ok(!/\p{Script=Han}/u.test(JSON.stringify(sourceParents.find(p=>p.id===id))),id);}
});

test('preferences, alternative work routes and an unscaled GPA do not become fabricated universal academic failures',()=>{
 for(const n of [20,32,69,75,91,95,99,105,110,120])assert.equal(c(n).rules.some(r=>r.kind==='experience'),false);
 for(const n of [5,22,23,68])assert.equal(matchProgramme(c(n),profile).checks.find(c=>c.kind==='experience').status,'fail');
 assert.equal(c(126).fieldStatus.gpa.status,'unknown');assert.equal(c(126).rules.some(r=>r.kind==='gpa'),false);assert.match(c(126).notesEn,/GPA at least 3.0.*NOT identify.*scale/);
 assert.match(choose(70,'61030-fit-pit').notesEn,/FIVE years/);assert.match(p(39).notesEn,/THREE years/);assert.equal(p(39).rules.some(r=>r.kind==='experience'),false);
 assert.equal(english(c(13),{total:6.5}).status,'pass');assert.equal(english(c(32),{total:6.5}).status,'pass');
 assert.match(c(51).notesEn,/OUTSIDE Hong Kong.*IELTS 7 including writing 7/);assert.match(c(111).notesEn,/LOCAL.*registered midwives.*NON-LOCAL/);
});

test('school-specific home-test policy, higher law TOEFL and real IELTS components remain separate',()=>{
 assert.equal(english(c(57),{type:'toefl_120',total:85,testDate:'2026-01-20',atHome:true}).status,'fail');
 assert.equal(english(c(57),{type:'toefl_120',total:88,testDate:'2026-01-20',atHome:true}).status,'pass');
 assert.equal(english(c(124),{total:6.5,components:{...profile.language.components,writing:5.5}}).status,'fail');
 assert.equal(english(c(124),{total:6.5,atHome:true}).status,'pass');assert.equal(english(p(7),{atHome:true}).status,'fail');
 const ordinary=choose(91,'15058-mft'),practicum=choose(91,'15058-npf');assert.equal(english(ordinary,{total:6}).status,'pass');assert.equal(english(practicum,{total:6}).status,'fail');
 assert.equal(english(practicum,{type:'toefl_6',total:5}).status,'unknown');assert.equal(english(p(9),{total:7,components:{...profile.language.components,writing:6}}).status,'fail');
});

test('published subjects help matching while related-field and work alternatives remain confirmation paths',()=>{
 const x=choose(41,'62037-fai-pai');
 const result=major=>matchProgramme(x,{...profile,major}).checks.find(c=>c.kind==='major');
 assert.equal(result('Computer Science').status,'pass');assert.equal(result('History').status,'unknown');
 assert.equal(matchProgramme(x,{...profile,major:'History',experienceYears:4}).checks.some(c=>c.kind==='experience'&&c.status==='fail'),false);
 assert.equal(matchProgramme(c(123),{...profile,major:'Psychology'}).checks.find(c=>c.kind==='major').status,'pass');
 assert.equal(matchProgramme(c(123),profile).checks.find(c=>c.kind==='major').status,'unknown');
 assert.ok(obs.positiveSubjectComparisons.length>100);assert.ok(obs.positiveSubjectComparisons.every(c=>obs.programmeIds.includes(c.programmeId)));
});

test('PolyU January closure and its cheaper fee stay separate from September and from the live portal',()=>{
 const rr=routes.get(p(41).id),resolve=r=>resolveProgramme(p(41),routes,r.routeId,r.offerings[0].id,undefined,contexts);
 const j=resolve(rr.find(r=>r.academicYear==='2026/27')),s=resolve(rr.find(r=>r.academicYear==='2027/28'));
 assert.equal(j.offerings[0].tuition,387000);assert.equal(s.offerings[0].tuition,405000);assert.equal(j.offerings[0].tuitionEstimate,true);
 const status=programmeTimeline(j,'2026-11-04');assert.equal(status.state,'source_closed');assert.equal(status.livePortalChecked,false);assert.equal(status.offerings[0].deadline,null);assert.equal(status.offerings[0].sourceCheckedOn,'2026-11-04');assert.equal(status.offerings[0].sourceUrl,j.officialUrl);
 assert.equal(programmeTimeline(s,'2026-11-04').state,'within_recorded_dates');assert.equal(programmeTimeline(j,'2026-11-03').state,'unverified');assert.equal(programmeTimeline(p(41),'2026-11-04').state,'route_required');
 assert.equal(j.admissionRoute,'direct');
});

test('closed availability rejects missing, sibling, future or invented opening evidence',()=>{
 const j=rawRoutes.find(r=>r.routeId.includes('P041-ROUTE-JAN2027')),valid=structuredClone(j);validateProgramme(valid,new Set(['HK-POLYU']));
 for(const a of [{...j.offerings[0].applicationAvailability,sourceUrl:'https://www.polyu.edu.hk/study/other'},{...j.offerings[0].applicationAvailability,checkedOn:'2026-11-05'},{...j.offerings[0].applicationAvailability,status:'open'},{...j.offerings[0].applicationAvailability,deadline:'2026-10-31'}]){const x=structuredClone(j);x.offerings[0].applicationAvailability=a;assert.throws(()=>validateProgramme(x,new Set(['HK-POLYU'])),/Closed-intake/);}
 const x=structuredClone(j);x.sources=[];assert.throws(()=>validateProgramme(x,new Set(['HK-POLYU'])),/Closed-intake/);
});

test('fee-year uncertainty, different rates, postgraduate diplomas, scholarship coverage and pending approval do not create false prices',()=>{
 for(const n of [2,3,19,43,55,123])assert.ok(c(n).offerings.every(o=>o.tuition===null));
 assert.ok(p(23).offerings.every(o=>o.tuition===null));assert.ok(p(78).offerings.every(o=>o.tuition===null));assert.ok(p(6).offerings.every(o=>o.tuition===null));assert.ok(p(81).offerings.every(o=>o.tuition===null));
 assert.equal(p(30).offerings[0].tuition,385200);assert.ok(p(30).offerings.every(o=>!/PgD/.test(o.duration)));assert.equal(choose(76,'44087-iss').offerings[0].tuition,null);
 assert.equal(p(40).admissionRoute,'unconfirmed');assert.equal(p(81).admissionRoute,'unconfirmed');assert.equal(programmeTimeline(p(40),'2026-11-04').state,'unverified');assert.equal(c(21).scope.status,'unconfirmed');assert.equal(c(56).scope.status,'unconfirmed');
 assert.match(c(19).notesEn,/ALSO.*School of Architecture/);assert.match(c(81).notesEn,/Acupuncture.*PART-TIME ONLY/);
});

test('all 252 own-panel views resolve, compare and export as partial without an eligibility tier',()=>{
 let count=0;
 for(const id of obs.programmeIds){const base=store.get(id),choices=routes.get(id)||[base];for(const r of choices){const x=resolveProgramme(base,routes,r.routeId,r.offerings[0].id,undefined,contexts);assert.equal(x.officialUrl,r.officialUrl);for(const language of [{total:6},{total:7}]){const m=matchProgramme(x,{...profile,language:{...profile.language,...language}});assert.notEqual(m.status,'meets_checked');assert.equal(m.tier,null);}count++;}}
 assert.equal(count,252);const exported=store.export();assert.equal(exported.programmes.length,873);assert.equal('profile' in exported,false);
});

test('every batch view survives actual HTTP details and saved-choice restoration',async()=>{
 const saved=[];let n=0;
 for(const id of obs.programmeIds){const base=store.get(id);for(const r of routes.get(id)||[base]){const o=r.offerings[0],query=new URLSearchParams({offering:o.id,...(r.routeId?{route:r.routeId}:{})});const response=await fetch(`${url}/api/programmes/${id}?${query}`);assert.equal(response.status,200,id);const x=await response.json();assert.equal(x.selectedOffering.id,o.id);assert.equal(x.officialUrl,r.officialUrl);assert.equal(x.requirementsCoverage,'partial');saved.push({programmeId:id,routeId:r.routeId||null,offeringId:o.id,applicantId:null});n++;}}
 const response=await fetch(url+'/api/saved-options/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contexts:saved})});assert.equal(response.status,200);const restored=await response.json();assert.equal(restored.items.length,n);assert.ok(restored.items.every(x=>x.status==='resolved'));
});
