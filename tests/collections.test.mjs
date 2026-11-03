import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileReferences,editReferences,loadCandidateReferences,saveCandidateReferences,forgetCandidateReferences,programmeReferencesExport,storageKey} from '../public/collections.js';
const pilot=JSON.parse(readFileSync(new URL('../data/checked-programmes.json',import.meta.url),'utf8'));
const catalogue=pilot.programmes.filter(p=>p.admissionRoute==='direct'),p=catalogue.find(p=>p.id==='SG-SMU-P010'),o=p.offerings[2];
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('comparison stays capped at four unique pilot identities while duplicate additions keep their selected offering',()=>{
 let list=[];for(const x of catalogue.slice(0,4))list=editReferences(list,'add',x.id,null,catalogue,4).choices;
 assert.equal(list.length,4);const selected=editReferences(list,'select',list[0].programmeId,catalogue[0].offerings[0].id,catalogue,4).choices;
 assert.deepEqual(editReferences(selected,'add',list[0].programmeId,null,catalogue,4).choices,selected);
 assert.equal(editReferences(list,'add',catalogue[4].id,null,catalogue,4).choices.length,4);
 assert.match(editReferences(list,'add',catalogue[4].id,null,catalogue,4).message,/up to 4/);
});
test('removal makes room and separate lists do not mutate each other or the catalogue',()=>{
 const before=JSON.stringify(catalogue),list=editReferences([],'add',p.id,o.id,catalogue,4).choices,candidates=structuredClone(list);
 assert.deepEqual(editReferences(list,'remove',p.id,null,catalogue,4).choices,[]);assert.equal(candidates[0].offeringId,o.id);assert.equal(list.length,1);assert.equal(JSON.stringify(catalogue),before);
});
test('an unselected offering never resolves to the first price, and a cross-programme offering is refused',()=>{
 const list=editReferences([],'add',p.id,null,catalogue).choices;
 assert.equal(programmeReferencesExport(list,catalogue).programmes[0].selectedOffering,null);
 const r=editReferences(list,'select',p.id,catalogue[0].offerings[0].id,catalogue);assert.equal(r.choices[0].offeringId,null);assert.match(r.message,/No substitute/);
});
test('restoration rejects retired modes and unknown identities without substituting an intake or updating storage',()=>{
 const storage=memory(),raw=JSON.stringify({schemaVersion:1,choices:[{programmeId:p.id,offeringId:p.id+'-RETIRED'},{programmeId:'HK-HKUST-P003',offeringId:null},{programmeId:catalogue[0].id,offeringId:null}]});storage.setItem(storageKey,raw);
 const result=loadCandidateReferences(storage,catalogue);assert.equal(result.choices.length,1);assert.equal(result.unresolved.length,2);assert.equal(storage.getItem(storageKey),raw);
});
test('malformed, oversized and unsupported stored formats remain recoverable failures',()=>{
 for(const raw of ['{',JSON.stringify({schemaVersion:2,choices:[]}),JSON.stringify({schemaVersion:1,choices:{}}),'x'.repeat(32001)]){const storage=memory();storage.setItem(storageKey,raw);const r=loadCandidateReferences(storage,catalogue);assert.equal(r.choices.length,0);assert.ok(r.unresolved.length>0);assert.equal(storage.getItem(storageKey),raw);}
 assert.equal(reconcileReferences([{programmeId:'bad url https://example.invalid'}],catalogue).choices.length,0);
});
test('only IDs are persisted even when input is tainted with scores, match results, notes and fee snapshots',()=>{
 const storage=memory(),choices=[{programmeId:p.id,offeringId:o.id,profile:{gpa:4,major:'private'},match:{status:'personal'},tuition:1,notes:'private'}];assert.equal(saveCandidateReferences(storage,choices,catalogue),true);
 assert.deepEqual(JSON.parse(storage.getItem(storageKey)),{schemaVersion:1,choices:[{programmeId:p.id,offeringId:o.id}]});assert.equal(loadCandidateReferences(storage,catalogue).remembered,true);assert.equal(forgetCandidateReferences(storage),true);assert.equal(loadCandidateReferences(storage,catalogue).remembered,false);
});
test('blocked browser storage never destroys the current temporary list or claims a successful save',()=>{
 const storage={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('quota');},removeItem:()=>{throw new Error('blocked');}},choices=[{programmeId:p.id,offeringId:o.id}];
 assert.equal(loadCandidateReferences(storage,catalogue).error,true);assert.equal(saveCandidateReferences(storage,choices,catalogue),false);assert.equal(forgetCandidateReferences(storage),false);assert.deepEqual(choices,[{programmeId:p.id,offeringId:o.id}]);
});
test('export preserves exact currencies, cohort price basis, original source dates and explicit unknowns',()=>{
 const choices=[{programmeId:p.id,offeringId:o.id},{programmeId:'SG-SUSS-P001',offeringId:'SG-SUSS-P001-O1'}],out=programmeReferencesExport(choices,catalogue);assert.equal(out.programmes.length,2);assert.equal(out.programmes[0].selectedOffering.id,o.id);assert.equal(out.programmes[0].selectedOffering.tuition,o.tuition);assert.equal(out.programmes[0].selectedOffering.feeBasis,o.feeBasis);assert.equal(out.programmes[0].lastChecked,'2026-10-20');assert.equal(out.programmes[1].selectedOffering.tuition,null);assert.equal(out.programmes[1].selectedOffering.deadline,null);
});
test('export uses a whitelist so active matching or a future personal field cannot leak',()=>{
 const tainted=catalogue.map(x=>({...x,profile:{gpa:99},match:{private:'personal'},studentEmail:'private@example.invalid',offerings:x.offerings.map(o=>({...o,studentName:'PRIVATE'}))}));const text=JSON.stringify(programmeReferencesExport([{programmeId:p.id,offeringId:o.id}],tainted));
 for(const privateValue of ['"profile"','"match"','studentEmail','studentName','private@example.invalid','PRIVATE'])assert.equal(text.includes(privateValue),false);
});
test('the browser module is served as a static feature; no sensitive backend list or export endpoint is introduced',()=>{
 const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(js,/programmeReferencesExport\(state.candidates, state.all\)/);assert.match(js,/Save list in this browser/);assert.match(js,/Not selected — do not assume a fee/);assert.match(html,/WEEK 7/);assert.equal(/\p{Script=Han}/u.test(js+html),false);
});
