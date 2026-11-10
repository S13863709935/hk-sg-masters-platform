import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCheckpoint} from '../server/app.mjs';
import {checkProgramme} from '../server/checks.mjs';
import {programmeReferencesExport,reconcileReferences,storageKey,loadCandidateReferences} from '../public/collections.js';
const root=new URL('../',import.meta.url),batch=JSON.parse(readFileSync(new URL('data/checked-programmes.json',root),'utf8'));
const pilot=batch.programmes.filter(p=>p.admissionRoute==='direct'),p=id=>pilot.find(x=>x.id===id);
const profile={major:'Civil Engineering',degreeStatus:'graduated',classification:'second_upper',language:{type:'ielts',total:7,components:{reading:7,listening:7,speaking:7,writing:7},singleAttempt:true}};
const server=createCheckpoint({publicDir:new URL('public/',root),pilotPath:new URL('data/checked-programmes.json',root),directoryPath:new URL('data/directory-audit.json',root)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
test.after(()=>new Promise(r=>server.close(r)));

test('each study choice resolves exactly through details, saved references and public export without changing the catalogue',async()=>{
 const before=JSON.stringify(pilot);
 for(const x of pilot){
  const unselected=await(await fetch(base+'/api/programmes/'+x.id)).json();assert.equal(unselected.selectedOffering,null);
  for(const o of x.offerings){
   const r=await fetch(base+'/api/programmes/'+x.id+'?offering='+o.id);assert.equal(r.status,200);
   const detail=await r.json();assert.deepEqual(detail.selectedOffering,o);assert.equal(detail.lastChecked,x.lastChecked);
   const refs=reconcileReferences([{programmeId:x.id,offeringId:o.id}],pilot);assert.equal(refs.unresolved.length,0);
   const exported=programmeReferencesExport(refs.choices,pilot);assert.equal(exported.programmes[0].selectedOffering.id,o.id);assert.equal(exported.programmes[0].selectedOffering.tuition,o.tuition);
  }
 }
 assert.equal(JSON.stringify(pilot),before);
});
test('foreign, retired, empty and repeated study options are rejected instead of falling back to a fee',async()=>{
 const x=pilot[0],foreign=pilot[1].offerings[0].id;
 for(const query of ['?offering='+foreign,'?offering=RETIRED','?offering=','?offering='+x.offerings[0].id+'&offering='+x.offerings[0].id])assert.equal((await fetch(base+'/api/programmes/'+x.id+query)).status,400);
});
test('all five updates retain source-dependent dates, applicant fees and separate academic evidence',()=>{
 assert.equal(p('HK-CITYU-P010').lastChecked,'2026-10-20');assert.ok(p('HK-CITYU-P010').offerings.every(o=>o.tuition===null));
 assert.equal(p('HK-HKBU-P001').offerings[0].deadline,null);assert.equal(p('HK-HKBU-P001').offerings[1].tuition,null);
 assert.equal(p('HK-HKBU-P007').offerings[0].tuition,null);assert.equal(p('HK-HKBU-P007').offerings[0].deadline,'2027-04-01');
 assert.equal(p('HK-EDUHK-P001').offerings[0].tuition,null);assert.equal(p('HK-EDUHK-P001').offerings[1].tuition,208000);
 assert.equal(p('HK-HKUST-P002').academicYear,'2027/28');assert.ok(p('HK-HKUST-P002').rules.some(r=>r.kind==='classification'));
 assert.ok(pilot.every(x=>!x.rules.some(r=>r.kind==='gpa')));
});
test('mixed scoped source dates remain visible and are not promoted to a publication-day recheck',()=>{
 const x=p('HK-HKBU-P001');assert.equal(x.lastChecked,'2026-10-30');assert.ok(x.sources.some(s=>s.checkedOn==='2026-10-23'));assert.ok(x.sources.some(s=>s.checkedOn==='2026-10-30'));
 assert.equal(batch.checkedOn,'2026-10-30');assert.ok(batch.programmes.every(x=>x.lastChecked!=='2026-11-10'&&x.reviewer===null&&x.requirementsCoverage==='partial'));
});
test('public export retains ordered rounds and noon cutoff offsets without nested personal fields',()=>{
 const x=structuredClone(p('HK-HKU-P007'));x.offerings[0].applicationRounds[0].profile={gpa:3.8};x.offerings[0].applicationRounds[0].email='private@example.invalid';x.profile=profile;
 const out=programmeReferencesExport([{programmeId:x.id,offeringId:x.offerings[0].id}],[x]);assert.equal(out.checkpoint,'week-08');
 assert.equal(out.programmes[0].applicationRounds[0].deadlineAt,'2027-01-04T12:00:00+08:00');assert.doesNotMatch(JSON.stringify(out),/private@example|gpa|classification|experienceYears/);
 const cuhk=p('HK-CUHK-P001');assert.equal(programmeReferencesExport([{programmeId:cuhk.id,offeringId:cuhk.offerings[0].id}],pilot).programmes[0].applicationRounds.length,5);
 assert.deepEqual(programmeReferencesExport([{programmeId:cuhk.id,offeringId:null}],pilot).programmes[0].applicationRounds,[]);
});
test('greater-than score floors reject equality while inclusive floors accept equality',()=>{
 const x=structuredClone(p('HK-CITYU-P010'));x.rules=[{kind:'language',labelEn:'Synthetic strict-boundary fixture',tests:{ielts:{total:6.5,exclusiveMinimum:true}},sourceUrl:x.officialUrl}];
 const score=n=>checkProgramme(x,{...profile,language:{type:'ielts',total:n}}).checks.find(c=>c.kind==='language').status;
 assert.equal(score(6.5),'fail');assert.equal(score(7),'pass');x.rules[0].tests.ielts.exclusiveMinimum=false;assert.equal(score(6.5),'pass');
});
test('completed-only rule separates known final year from an unknown completion status',()=>{
 const x=structuredClone(pilot[0]);x.rules=[{kind:'degree',completedOnly:true,labelEn:'Synthetic completed-only fixture',sourceUrl:x.officialUrl}];
 const degree=s=>checkProgramme(x,{...profile,degreeStatus:s}).checks.find(c=>c.kind==='degree').status;
 assert.equal(degree('final_year'),'fail');assert.equal(degree('unconfirmed'),'unknown');assert.equal(degree('graduated'),'pass');
});
test('new source constraints flow into matching without granting admission tiers',async()=>{
 const r=await fetch(base+'/api/matches',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({profile:{...profile,classification:'ordinary'}})});assert.equal(r.status,200);const d=await r.json();
 assert.equal(d.checkpoint,'week-08');assert.equal(d.items.length,20);const x=d.items.find(x=>x.id==='HK-HKUST-P002');assert.equal(x.match.checks.find(c=>c.kind==='classification').status,'fail');
 assert.ok(d.items.every(x=>x.match.tier===null&&x.match.status!=='meets_checked'));assert.equal(Object.hasOwn(d,'profile'),false);
});

test('older W7 saved choices are not silently rebound to revised W8 intakes',()=>{
 const oldKey='gradpath-week-07-candidate-references', oldCopy=JSON.stringify({schemaVersion:1,choices:[{programmeId:'HK-HKUST-P002',offeringId:'HK-HKUST-P002-O1'}]});
 const saved=new Map([[oldKey,oldCopy]]),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 assert.notEqual(storageKey,oldKey);assert.deepEqual(loadCandidateReferences(storage,pilot).choices,[]);assert.equal(saved.get(oldKey),oldCopy);
});
