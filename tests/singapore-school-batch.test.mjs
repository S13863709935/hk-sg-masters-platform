import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CatalogueStore} from '../server/database.mjs';
import {loadRoutes,resolveProgramme} from '../server/routes.mjs';
import {loadApplicantContexts,offeringFingerprint} from '../server/applicants.mjs';
import {matchProgramme} from '../server/matching.mjs';
import {validateProgramme} from '../server/validation.mjs';
import {programmeTimeline} from '../server/application-dates.mjs';
import {shortlistExport} from '../public/saved-options.js';
import {createApp} from '../server/app.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url),'utf8'));
const ntu=read('data/research/ntu-whole-school-observation-2026-11-10.json'),nus=read('data/research/nus-public-recovery-observation-2026-11-10.json');
const cde=read('data/research/nus-cde-remainder-observation-2026-11-10.json');
const scale=read('data/research/nus-scale-iss-observation-2026-11-10.json'),fass=read('data/research/nus-fass-observation-2026-11-10.json'),policy=read('data/research/nus-public-policy-observation-2026-11-10.json'),medicine=read('data/research/nus-medicine-core-observation-2026-11-10.json'),nursing=read('data/research/nus-nursing-clinical-observation-2026-11-10.json');
const finished=read('data/research/singapore-local-finish-observation-2026-11-10.json'),newIds=finished.programmeIds;
const store=new CatalogueStore(':memory:',{seedPath:'data/catalogue.json',expansionPath:'data/catalogue-expansion.json',checkedPath:'data/checked-programmes.json',directoryEvidencePath:'data/directory-links.json',scopeAuditPath:'data/programme-scope-audit.json'});
const routes=loadRoutes('data/route-programmes.json',store.all()),applicants=loadApplicantContexts('data/applicant-contexts.json',store.all(),routes);
const t=n=>store.get(`SG-NTU-P${String(n).padStart(3,'0')}`),s=n=>store.get(`SG-NUS-P${String(n).padStart(3,'0')}`);
const profile={major:'Computer Science',degreeStatus:'graduated',classification:'second_lower',gpa:3.4,gpaScale:4,experienceYears:0,language:{type:'ielts',total:7,components:{listening:7,reading:7,writing:7,speaking:7},testDate:'2026-05-01',singleAttempt:true}};
const lang=(p,extra)=>matchProgramme(p,{...profile,language:{...profile.language,...(extra.type==='toefl_6'?{components:{listening:5,reading:5,writing:5,speaking:5}}:extra.type==='toefl_120'?{components:{listening:26,reading:26,writing:26,speaking:26}}:{}),...extra}}).checks.find(c=>c.kind==='language');
const route=(p,v)=>{const r=routes.get(p.id).find(r=>r.routeId.endsWith('-V'+v)||r.routeId.endsWith(v));assert.ok(r);return resolveProgramme(p,routes,r.routeId,r.offerings[0].id,undefined,applicants);};
test.after(()=>store.close());

test('NTU bulk observation preserves every previous parent and route; a later public-source recovery resolves the CMS-only hold',()=>{
 assert.deepEqual(ntu.counts,{newPartialParents:82,newRouteGroups:5,newRouteSnapshots:25,readProgrammePanels:102,completeRequirements:0,independentReviews:0});
 const parents=read('data/checked-programmes.json').programmes,rr=read('data/route-programmes.json').programmes.flatMap(g=>g.routes);
 const later=read('data/research/final-local-use-observation-2026-11-10.json').corrections;
 for(const [id,hash]of Object.entries(ntu.preservedParentFingerprints)){
  const correction=later.find(c=>c.programmeId===id),current=parents.find(p=>p.id===id);
  assert.equal(offeringFingerprint(correction?.beforeRecord||current),hash,id);
  if(correction)assert.equal(offeringFingerprint(current),correction.afterFingerprint,id);
 }
 for(const [id,hash]of Object.entries(ntu.preservedRouteFingerprints))assert.equal(offeringFingerprint(rr.find(p=>p.routeId===id)),hash,id);
 assert.equal(ntu.held[0].programmeId,t(50).id);assert.equal(t(50).researchBatch,'public-remainders-2026-11-10');assert.equal(store.quality().complete,0);assert.equal(store.quality().peerReviewed,0);
 for(const id of [...ntu.programmeIds,...nus.programmeIds]){const p=store.get(id);assert.equal(p.lastChecked,'2026-11-10');assert.equal(p.requirementsCoverage,'partial');assert.equal(p.reviewer,null);assert.equal(/\p{Script=Han}/u.test(JSON.stringify(parents.find(p=>p.id===id))),false,id);}
});

test('two public own-source recoveries do not use administrator URLs, scholarship GPA or an early round as final closure',()=>{
 const med=store.get('HK-EDUHK-P040');assert.equal(med.offerings[0].tuition,200000);assert.equal(med.offerings[0].deadline,null);assert.match(med.offerings[0].deadlineNote,/Early round.*4 January 2027/);
 assert.equal(med.rules.some(r=>r.kind==='gpa'),false);assert.equal(lang(med,{total:6,testDate:'2024-12-31'}).status,'fail');assert.equal(lang(med,{total:6,testDate:'2025-01-01'}).status,'pass');
 assert.equal(lang(t(50),{type:'toefl_6',total:4.5}).status,'pass');assert.equal(t(50).rules.some(r=>r.kind==='experience'),false);assert.equal(t(50).offerings[0].tuition,null);
 for(const p of [med,t(50)])assert.equal(p.sources.some(s=>/admin|sharepoint/i.test(new URL(s.url).host)),false);
});

test('English exclusive minima survive validation, boundary matching and public export',()=>{
 const p=t(8);assert.equal(lang(p,{total:6.5}).status,'fail');assert.equal(lang(p,{total:7}).status,'pass');
 assert.equal(lang(p,{type:'toefl_120',total:100,testDate:'2026-01-20'}).status,'fail');assert.equal(lang(p,{type:'toefl_120',total:101,testDate:'2026-01-20'}).status,'pass');
 const malformed=structuredClone(p);malformed.rules.find(r=>r.kind==='language').tests.ielts.exclusiveMinimum='yes';assert.throws(()=>validateProgramme(malformed,new Set(['SG-NTU'])),/exclusive-minimum/);
 const exported=shortlistExport([p]);assert.match(JSON.stringify(exported),/exclusiveMinimum/);
});

test('school-specific new scores, component minima, home-test exclusions and proposed equivalencies remain distinct',()=>{
 assert.equal(lang(t(2),{type:'toefl_6',total:4.5}).status,'fail');assert.equal(lang(t(38),{type:'toefl_6',total:4.5}).status,'fail');
 assert.equal(lang(t(35),{type:'toefl_6',total:5}).status,'fail');assert.equal(lang(t(33),{type:'toefl_6',total:5}).status,'unknown');
});

test('NIE ordinary and Teaching Chinese English minima differ; specialisation work alternatives never collapse',()=>{
 assert.equal(lang(t(24),{total:6}).status,'fail');assert.equal(lang(t(29),{total:6}).status,'pass');
 assert.equal(lang(t(29),{type:'toefl_6',total:4}).status,'pass');assert.equal(lang(t(24),{type:'toefl_6',total:4}).status,'fail');assert.equal(lang(t(24),{atHome:true}).status,'fail');
 const curriculum=route(t(39),2),early=route(t(39),5),special=route(t(39),14),math=route(t(39),11);
 assert.match(curriculum.notesEn,/three years/);assert.match(early.notesEn,/ECDA.*three years/);assert.match(special.notesEn,/disabilities/);assert.match(math.notesEn,/two undergraduate mathematics/);
 for(const p of [curriculum,early,special])assert.equal(p.rules.some(r=>r.kind==='experience'),false);
 assert.equal(t(12).rules.find(r=>r.kind==='experience').min,2);assert.equal(t(27).rules.some(r=>r.kind==='experience'),false);
});

test('Chinese pathways keep their own fees, work, no-English route and TBA dates',()=>{
 const em=route(t(20),0),cm=route(t(20),1),mme=route(t(21),2),ce=route(t(84),1);
 assert.equal(em.offerings[0].tuition,46508.8);assert.equal(cm.offerings[0].tuition,44720);assert.equal(cm.offerings[0].applicationOpen,null);assert.equal(cm.offerings[0].deadline,'2026-12-04');
 const november=routes.get(t(21).id).find(r=>r.routeId.endsWith('-V2')).offerings.find(o=>o.id.endsWith('NOV2027'));
 assert.equal(cm.rules.some(r=>r.kind==='language'),false);assert.equal(mme.fieldStatus.language.status,'not_applicable');assert.equal(mme.offerings[0].deadline,'2027-02-26');assert.equal(november.deadline,null);assert.equal(november.applicationOpen,null);
 assert.equal(ce.rules.find(r=>r.kind==='experience').min,8);assert.equal(ce.offerings[0].tuition,null);assert.equal(ce.offerings[0].deadline,null);
 assert.equal(route(t(82),1).rules.some(r=>r.kind==='experience'||r.kind==='language'),false);
 assert.equal(lang(em,{total:6.5,components:{listening:5,reading:6,writing:6,speaking:6}}).status,'fail');
});

test('preferences, optional routes and graduation grades cannot become universal failures or fake entry GPA',()=>{
 for(const n of [1,7,19,27,28,46,49,65,73,74,80,81,82])assert.equal(t(n).rules.some(r=>r.kind==='experience'),false,n);
 for(const n of [3,9,13,17,19,23,51,54,55,56,58,67,72,78])assert.equal(t(n).rules.some(r=>r.kind==='gpa'),false,n);
 assert.equal(t(67).admissionRoute,'unconfirmed');assert.equal(t(11).offerings[0].tuition,null);assert.equal(t(67).offerings[0].tuition,null);
 assert.equal(t(4).offerings[0].tuition,null);assert.equal(t(4).offerings[0].deadline,'2027-03-31');assert.equal(t(51).offerings[0].deadline,null);
 assert.equal(programmeTimeline(t(52),'2026-11-10').state,'source_closed');assert.equal(t(52).offerings[0].deadline,null);
 assert.equal(t(86).offerings[0].academicYear,'2026');assert.equal(t(86).offerings[0].deadline,null);
});

test('NUS recovered own pages keep CEMS, January 2028, TOEFL conflicts and gross/net prices separate',()=>{
 const management=route(s(9),'STANDALONE'),marketing=route(s(10),'STANDALONE');
 assert.equal(management.offerings[0].intake,'January 2028');assert.equal(management.offerings[0].deadline,'2027-06-30');assert.equal(management.offerings[0].tuition,61803);
 assert.equal(marketing.offerings[0].deadline,'2027-02-15');assert.equal(marketing.offerings[0].tuition,77608);assert.equal(routes.get(s(10).id).length,1);
 for(const n of [19,20,21])assert.equal(s(n).rules.some(r=>r.kind==='language'),false);
 for(const n of [17,23,83,99,106,107])assert.equal(lang(s(n),{type:'toefl_6',total:4.5}).status,'unknown');
 assert.equal(s(111).offerings[0].tuition,52320);assert.match(s(111).offerings[0].feeBasis,/22,562.*net/);assert.equal(s(82).offerings[0].tuition,52320);
 assert.equal(s(33).offerings[0].deadline,null);assert.equal(s(71).offerings[0].deadline,null);assert.equal(s(71).rules.some(r=>r.kind==='gpa'),false);
 assert.match(s(8).offerings.find(o=>o.mode==='Part-time').duration,/21.*24/);assert.match(s(12).offerings[0].duration,/Unresolved/);
 assert.equal(s(30).rules.some(r=>r.kind==='experience'),false);assert.equal(s(31).rules.some(r=>r.kind==='experience'),false);
});

test('CDE remainder isolates NUS-only architecture GPA and course requirements from the accredited non-NUS pathway',()=>{
 assert.equal(cde.counts.newPartialParents,17);const one=route(s(14),'NUS-ONE-YEAR'),non=route(s(14),'NONNUS-TWO-YEAR');
 assert.equal(one.offerings[0].tuition,null);assert.equal(non.offerings[0].tuition,98100);assert.equal(non.offerings[0].duration,'2 years');
 assert.equal(non.rules.some(r=>r.kind==='gpa'),false);assert.match(non.officialUrl,/2yrs_non_nus/);assert.match(one.notesEn,/AR3101/);
 for(const n of [22,24,79,94,95])assert.equal(s(n).rules.some(r=>r.kind==='experience'),false,n);
 for(const n of [24,40,94,95])assert.equal(s(n).rules.some(r=>r.kind==='language'),false,n);
 for(const n of [57,62,84])assert.equal(s(n).offerings[0].tuition,null,n);
 const january=s(24).offerings.find(o=>o.intake.startsWith('January'));assert.equal(january.deadline,null);assert.equal(january.applicationOpen,null);
});

test('later NUS groups retain hard-versus-preferred work, real English components and non-minimum benchmarks',()=>{
 assert.equal(s(117).rules.find(r=>r.kind==='experience').min,5);assert.equal(s(117).offerings[0].deadline,null);
 for(const n of [1,3,4,108,109,116,118,119,51,55,90])assert.equal(s(n).rules.some(r=>r.kind==='experience'),false,n);
 assert.equal(lang(s(1),{type:'toefl_120',total:85,testDate:'2026-01-20',atHome:true}).status,'pass');assert.equal(lang(s(116),{type:'toefl_120',total:85,testDate:'2026-01-20',atHome:true}).status,'fail');assert.equal(lang(s(116),{type:'toefl_6',total:4.5}).status,'unknown');
 for(const n of [51,53,55]){assert.equal(s(n).rules.some(r=>r.kind==='language'),false);assert.match(s(n).notesEn,/not.*(?:minimum|eligibility)|no strict admissibility/i);}
 assert.equal(lang(s(45),{total:8,components:{listening:8,reading:7.5,writing:8,speaking:8}}).status,'fail');assert.equal(lang(s(46),{total:7}).status,'fail');assert.equal(lang(s(46),{type:'toefl_6',total:5}).status,'unknown');
 assert.equal(s(45).offerings[0].deadline,null);assert.equal(s(43).offerings[0].deadline,null);assert.equal(s(44).rules.some(r=>r.kind==='language'),false);
 assert.equal(s(100).offerings[0].deadline,null);assert.equal(s(100).offerings[0].tuition,67362);assert.match(s(90).notesEn,/THREE years/);assert.equal(s(90).rules.find(r=>r.kind==='language').validityMonths,undefined);
 for(const n of [60,67,81,91]){assert.equal(s(n).fieldStatus.gpa.status,'unknown');assert.equal(s(n).rules.some(r=>r.kind==='gpa'),false);}
 assert.equal(s(67).rules.find(r=>r.kind==='experience').min,5);assert.equal(s(58).offerings[0].tuition,null);assert.equal(s(58).offerings[0].deadline,null);
});

test('published graduate-only applications reject known final-year status without guessing unknown completion',()=>{
 const p=s(69),check=degreeStatus=>matchProgramme(p,{...profile,degreeStatus}).checks.find(c=>c.kind==='degree');
 assert.equal(check('final_year').status,'fail');assert.equal(check('graduated').status,'pass');assert.equal(check('other').status,'unknown');
 assert.equal(matchProgramme(s(8),{...profile,degreeStatus:'final_year'}).checks.find(c=>c.kind==='degree').status,'unknown');
 const bad=structuredClone(p);bad.rules[0].completedOnly='yes';assert.throws(()=>validateProgramme(bad,new Set(['SG-NUS'])),/completed-degree-only/);assert.match(JSON.stringify(shortlistExport([p])),/completedOnly/);
});

test('whole-catalogue first pass completes the remaining202 IDs without claiming complete requirements or sibling coverage',()=>{
 assert.equal(newIds.length,202);assert.equal(new Set(newIds).size,202);assert.equal(store.quality().checked,858);assert.equal(finished.counts.unreadLeads,0);
 assert.equal(s(6).name,'MSc in Accounting and Financial Analytics');assert.equal(s(6).id,'SG-NUS-P006');assert.match(s(6).notesEn,/rename year/);assert.equal(s(6).rules.some(r=>r.kind==='experience'),false);
 const mba=route(s(5),'NUS-MBA');assert.equal(routes.get(s(5).id).length,1);assert.match(mba.notesEn,/Singapore-PR/);assert.equal(mba.offerings[0].tuition,106849.76);
 const llm=routes.get(s(64).id);assert.equal(llm.length,8);const ibl=llm.find(r=>r.name.includes('International Business Law'));assert.equal(ibl.scope.status,'out_of_scope');assert.equal(matchProgramme(resolveProgramme(s(64),routes,ibl.routeId,ibl.offerings[0].id,undefined,applicants),profile).status,'out_of_scope');
 const maritime=llm.find(r=>r.name.includes('Maritime'));assert.equal(maritime.offerings.length,2);assert.equal(maritime.rules.find(r=>r.appliesTo).appliesTo.offeringIds[0],maritime.offerings.find(o=>o.mode==='Part-time').id);
 assert.equal(llm.find(r=>r.name.includes('International and Comparative')).admissionRoute,'unconfirmed');
 assert.equal(lang(s(74),{total:6.5}).status,'fail');assert.equal(lang(s(74),{type:'toefl_120',total:100,testDate:'2026-01-20'}).status,'unknown');assert.equal(s(74).offerings[0].deadline,null);
 assert.equal(s(35).admissionRoute,'unconfirmed');assert.equal(s(35).rules.some(r=>r.kind==='experience'),false);assert.equal(programmeTimeline(s(36),'2026-11-10').state,'source_closed');assert.equal(programmeTimeline(s(114),'2026-11-10').state,'source_closed');
 assert.equal(s(105).offerings[0].deadline,null);assert.equal(s(102).offerings.find(o=>o.mode==='Full-time').tuition,57061.5);assert.equal(s(102).offerings.find(o=>o.mode==='Part-time').tuition,null);
 assert.equal(s(66).offerings[0].applicationOpen,null);assert.equal(s(66).offerings[0].deadline,null);assert.equal(s(65).rules.some(r=>r.kind==='gpa'||r.kind==='language'),false);
 assert.equal(s(98).rules.some(r=>r.kind==='experience'),false);assert.match(s(98).notesEn,/ONLY through named partner/);assert.match(s(104).notesEn,/three-year physics/);
 for(const p of newIds.map(id=>store.get(id))){assert.equal(p.lastChecked,'2026-11-10');assert.equal(p.requirementsCoverage,'partial');assert.equal(p.reviewer,null);}
});

test('every new route/offering survives actual details, matching, saved-choice restoration and export without a tier',async()=>{
 const app=createApp({store,publicDir:new URL('../public/',import.meta.url),routeEvidencePath:'data/route-programmes.json',applicantEvidencePath:'data/applicant-contexts.json',now:()=>new Date('2026-11-10T04:00:00Z')});await new Promise(r=>app.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${app.address().port}`;
 try{
 const contexts=[];let views=0;
 for(const id of newIds){const p=store.get(id);for(const r of routes.get(id)||[p])for(const o of r.offerings){const params=new URLSearchParams({offering:o.id,...(r.routeId?{route:r.routeId}:{})});const response=await fetch(`${url}/api/programmes/${id}?${params}`);assert.equal(response.status,200,id);const x=await response.json();assert.equal(x.officialUrl,r.officialUrl);assert.equal(x.selectedOffering.id,o.id);for(const total of [6,7]){const m=matchProgramme(resolveProgramme(p,routes,r.routeId,o.id,undefined,applicants),{...profile,language:{...profile.language,total}});assert.notEqual(m.status,'meets_checked');assert.equal(m.tier,null);}contexts.push({programmeId:id,routeId:r.routeId||null,offeringId:o.id,applicantId:null});views++;}}
 assert.ok(views>150);const restored=await (await fetch(url+'/api/saved-options/resolve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contexts})})).json();assert.equal(restored.items.length,views);assert.ok(restored.items.every(x=>x.status==='resolved'));assert.equal(store.export().programmes.length,873);
 }finally{await new Promise(r=>app.close(r));}
});
