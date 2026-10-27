import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { isOfficialUrl, validateDirectoryListing } from '../server/validation.mjs';

const root = new URL('../', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const inventory = read('data/research/nus-ntu-programme-inventory-2026-10-13.json');
const links = read('data/directory-links.json');
const seed = read('data/catalogue.json');
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const profile = {major:'Computer Science',degreeStatus:'graduated',gpa:4,gpaScale:4,language:{type:'ielts',total:9}};

test('all NUS and NTU coursework-filtered pages are captured with continuous result ranges', () => {
  const nus = read('data/research/nus-directory-observation-2026-10-13.json');
  const ntu = read('data/research/ntu-directory-observation-2026-10-13.json');
  assert.equal(nus.pages.length,14); assert.equal(ntu.pages.length,12);
  assert.equal(nus.pages.flatMap(p=>p.entries).length,136);
  assert.equal(ntu.pages.flatMap(p=>p.entries).length,113);
  nus.pages.forEach((p,i)=>{ assert.match(p.filterLabel,/Master's by Coursework/); assert.ok(p.resultLabel.startsWith('Showing '+(i*10+1)+'–')); assert.ok(p.entries.every(e=>e.tags[0]==="MASTER'S BY COURSEWORK")); });
  ntu.pages.forEach((p,i)=>{ assert.equal(new URL(p.sourceUrl).searchParams.get('page'),String(i+1)); assert.equal(new URL(p.sourceUrl).searchParams.get('programmelevels'),'master'); assert.equal(p.selectedCoursework,true); });
});
test('raw result counts stay distinct from candidate groups and verified programme totals', () => {
  const audit = read('data/directory-audit.json');
  for (const i of inventory.inventories) {
    const u = audit.universities.find(u=>u.universityId===i.universityId);
    assert.equal(i.rawEntryCount,i.entries.length);
    assert.equal(i.confirmedProgrammeCount,null);
    assert.equal(u.confirmedProgrammeCount,null);
    assert.equal(u.enumerationStatus,'entries_enumerated');
    assert.equal(u.directoryMasterEntryCount,i.rawEntryCount);
    assert.ok(i.candidateGroupCount < i.rawEntryCount);
  }
  assert.deepEqual(inventory.inventories.map(i=>[i.universityId,i.rawEntryCount,i.candidateGroupCount,i.heldEntryCount]),[['SG-NUS',136,119,6],['SG-NTU',113,88,4]]);
});
test('ambiguous Computing and Accounting names cannot replace or duplicate existing seed identities', () => {
  const nus = inventory.inventories.find(i=>i.universityId==='SG-NUS');
  const held = nus.entries.filter(e=>e.decision==='needs_identity_reconciliation');
  assert.deepEqual(held.map(e=>e.relatedSeedId).sort(),['SG-NUS-P006','SG-NUS-P029']);
  assert.ok(held.every(e=>!e.programmeId));
  assert.equal(links.listings.some(l=>l.programmeId==='SG-NUS-P029'),false);
  const all = read('data/catalogue-expansion.json').programmes;
  assert.ok(!all.some(p=>p.universityId==='SG-NUS' && ['Master of Computing','MSc (Accounting and Financial Analytics)'].includes(p.name)));
});
test('partner routes remain research evidence rather than separate eligibility records', () => {
  const held=inventory.inventories.flatMap(i=>i.entries).filter(e=>e.decision==='needs_partner_reconciliation');
  assert.equal(held.length,8);
  assert.ok(held.every(e=>!e.programmeId));
  assert.ok(held.some(e=>e.rawName==='TUM-NUS MSc (Industrial Chemistry)'));
  assert.equal(isOfficialUrl('https://tum-asia.edu.sg/'),false);
});
test('Duke-NUS source-domain support does not add another target university or accept spoofed hosts', () => {
  assert.equal(seed.universities.length,14);
  assert.equal(isOfficialUrl('https://www.duke-nus.edu.sg/admissions/masters/mitm'),true);
  assert.equal(isOfficialUrl('https://duke-nus.edu.sg.attacker.invalid/'),false);
  assert.equal(isOfficialUrl('https://not-duke-nus.edu.sg/'),false);
});
test('grouped routes have explicit evidence and English labels, not shared criteria', () => {
  assert.equal(links.listings.filter(l=>l.programmeId.startsWith('SG-')).length,207);
  for (const listing of links.listings) { validateDirectoryListing(listing); assert.equal(/\p{Script=Han}/u.test(listing.nameEn+listing.noteEn+listing.variants.map(v=>v.nameEn).join('')),false); }
  assert.equal(links.listings.find(l=>l.nameEn==='Master of Laws').variants.length,8);
  assert.equal(links.listings.find(l=>l.nameEn==='Master of Education').variants.length,16);
  assert.equal(links.listings.find(l=>l.programmeId==='SG-NTU-P021').variants.length,3);
});
test('153 new leads remain unreviewed and source overlays preserve all checked rules and fees', () => {
  const additions=read('data/catalogue-expansion.json').programmes.filter(p=>p.inventoryPass==='nus-ntu-dynamic');
  assert.equal(additions.length,153);
  assert.ok(additions.every(p=>p.verification==='catalogue_seed' && p.rules.length===0 && p.academicYear===null && p.reviewer===null));
  const db=new CatalogueStore(':memory:',options);
  try {
    const q=db.quality(); assert.equal(q.total,873);assert.equal(q.browsable,870);assert.equal(q.checked,39);assert.equal(q.peerReviewed,0);assert.equal(q.complete,0);
    for (const original of read('data/checked-programmes.json').programmes) {
      const current=db.get(original.id); assert.deepEqual(current.rules,original.rules);assert.deepEqual(current.offerings,original.offerings);assert.equal(current.lastChecked,original.lastChecked);assert.equal(current.name,original.name);
    }
    assert.ok(additions.every(p=>matchProgramme(db.get(p.id),profile).tier===null));
    assert.deepEqual(q.sourceRefreshConflicts,[]);
    assert.deepEqual(db.get('SG-NTU-P018'),db.all().find(p=>p.id==='SG-NTU-P018'));
    assert.equal(db.get('SG-NTU-P999'),null);
  } finally { db.close(); }
});
test('even synthetic complete reviewed rules cannot assign a tier to an unresolved grouped route', () => {
  const listing=links.listings.find(l=>l.nameEn==='Master of Education');
  const p={name:'Synthetic group test',verification:'peer_reviewed',requirementsCoverage:'complete',admissionRoute:'direct',officialUrl:listing.programmeUrl,directoryListing:listing,rules:[{kind:'degree'},{kind:'major',accepted:['Computer Science']},{kind:'gpa',scale:4,min:3},{kind:'language',tests:{ielts:{total:6}}}]};
  const blocked=matchProgramme(p,profile);assert.equal(blocked.status,'needs_confirmation');assert.equal(blocked.tier,null);assert.ok(blocked.checks.some(c=>c.kind==='route' && c.status==='unknown'));
  const single=matchProgramme({...p,directoryListing:{...listing,variants:[]}},profile);assert.equal(single.tier,'relatively_safer');
});
test('unsafe directory route links and malformed evidence are rejected', () => {
  const invalid=structuredClone(links.listings.find(l=>l.variants.length));invalid.variants[0].officialUrl='https://attacker.invalid/';
  assert.throws(()=>validateDirectoryListing(invalid),/route evidence/);
  assert.throws(()=>validateDirectoryListing({...invalid,variants:undefined}),/listing evidence/);
});
