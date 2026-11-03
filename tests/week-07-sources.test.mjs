import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkProgramme} from '../server/checks.mjs';
const batch=JSON.parse(readFileSync(new URL('../data/checked-programmes.json',import.meta.url),'utf8'));
const p=id=>batch.programmes.find(p=>p.id===id),profile={major:'Computer Science',degreeStatus:'graduated',classification:'first',experienceYears:1,language:{type:'ielts',total:7,testDate:'2025-09-01',singleAttempt:true,components:{listening:7,reading:7,writing:7,speaking:7}}};
test('Lingnan retains submission-based validity and manual alternatives without borrowing graduation GPA or new TOEFL',()=>{
 const x=p('HK-LU-P001');assert.equal(x.lastChecked,'2026-10-23');assert.ok(x.offerings.every(o=>o.tuition===198000&&o.applicationFee===400));assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.equal(x.rules.find(r=>r.kind==='language').tests.toefl_6,undefined);assert.equal(checkProgramme(x,{...profile,language:{...profile.language,atHome:true}}).checks.find(c=>c.kind==='language').status,'fail');assert.ok(x.rules.some(r=>/submission date/.test(r.noteEn||'')));
});
test('PolyU exact charged credits and additional overseas expenses remain visible rather than an all-in price',()=>{
 const x=p('HK-POLYU-P001');assert.equal(x.lastChecked,'2026-10-23');assert.ok(x.offerings.every(o=>o.tuition===424800&&o.applicationFee===600));assert.match(x.offerings[0].feeBasis,/36 charged credits.*43.*external/);assert.ok(x.rules.some(r=>/outside Greater China/.test(r.noteEn||'')));assert.equal(checkProgramme(x,profile).tier,null);
});
test('Urban Analytics keeps its own September2027 date floor and unknown equivalence instead of an automated GPA conversion',()=>{
 const x=p('HK-HKU-P007'),lang=l=>checkProgramme(x,{...profile,language:l}).checks.find(c=>c.kind==='language');assert.equal(x.lastChecked,'2026-10-23');assert.equal(x.offerings[0].tuition,252000);assert.equal(lang({...profile.language,testDate:'2025-08-31'}).status,'fail');assert.equal(lang({...profile.language,testDate:'2025-09-01'}).status,'pass');assert.equal(x.rules.some(r=>r.kind==='gpa'),false);
});
test('SIT Civil experience does not establish relevant work, an old closed window or an unverified current fee',()=>{
 const x=p('SG-SIT-P002'),check=n=>checkProgramme(x,{...profile,experienceYears:n});assert.equal(x.lastChecked,'2026-10-24');assert.ok(x.offerings.every(o=>o.tuition===null&&o.deadline==='2026-09-30'));assert.equal(check(0).checks.find(c=>c.kind==='experience').status,'fail');assert.equal(check(1).checks.find(c=>c.kind==='experience').status,'pass');assert.equal(x.rules.some(r=>r.kind==='language'),false);assert.equal(check(1).status,'needs_confirmation');
});
test('SUSS recurring months, path eligibility and completion GPA never become a dated fee window or entry score',()=>{
 const x=p('SG-SUSS-P001');assert.equal(x.lastChecked,'2026-10-23');assert.equal(x.offerings[0].tuition,null);assert.equal(x.offerings[0].deadline,null);assert.equal(x.offerings[0].mode,null);assert.equal(x.rules.some(r=>r.kind==='gpa'),false);assert.equal(x.rules.find(r=>r.kind==='language').tests.toefl_120,undefined);assert.match(x.notesEn,/CGPA 3.0 is a graduation condition/);assert.equal(checkProgramme(x,profile).status,'needs_confirmation');
});
