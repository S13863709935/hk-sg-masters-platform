import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { CatalogueStore } from '../server/database.mjs';

const root = new URL('../', import.meta.url);
const seed = JSON.parse(readFileSync(new URL('data/catalogue.json', root), 'utf8'));
const source = JSON.parse(readFileSync(new URL('data/checked-programmes.json', root), 'utf8'));
const unreviewedSeeds = seed.programmes.filter(p => !source.programmes.some(s => s.id === p.id));
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(),'gradpath-refresh-'));
  const path = join(dir,'test.sqlite'), sourcePath = join(dir,'checked.json');
  let db;
  const open = (options = {}) => { db?.close(); db = new CatalogueStore(path, {seed,checkedPath:sourcePath,...options}); return db; };
  const save = data => writeFileSync(sourcePath, JSON.stringify(data));
  try { save(source); run({ open, save, path, sourcePath, get:()=>db }); }
  finally { db?.close(); rmSync(path,{force:true}); rmSync(sourcePath,{force:true}); rmdirSync(dir); }
}
test('changing one source record preserves manual edits to every unchanged record', () => fixture(({open,save})=>{
  let db = open();
  const a = source.programmes[0], b = source.programmes[1];
  db.importBatch({schemaVersion:1,programmes:[{...a,notesEn:'Synthetic manual edit to preserve.'}]},'Synthetic manual edit');
  const revised = structuredClone(source); revised.programmes[1].notesEn += ' Synthetic source refresh.';
  save(revised); db = open();
  assert.equal(db.get(a.id).notesEn,'Synthetic manual edit to preserve.');
  assert.equal(db.get(b.id).notesEn,revised.programmes[1].notesEn);
  assert.deepEqual(db.quality().sourceRefreshConflicts,[]);
}));
test('changed source conflicts preserve manual data and stay pending across restarts', () => fixture(({open,save})=>{
  let db = open(); const a = source.programmes[0];
  db.importBatch({schemaVersion:1,programmes:[{...a,notesEn:'Synthetic locally edited value.'}]},'Synthetic manual edit');
  const revised = structuredClone(source); revised.programmes[0].notesEn += ' Synthetic upstream change.';
  save(revised); db = open();
  assert.equal(db.get(a.id).notesEn,'Synthetic locally edited value.');
  assert.deepEqual(db.quality().sourceRefreshConflicts,[a.id]);
  db = open(); assert.deepEqual(db.quality().sourceRefreshConflicts,[a.id]);
}));
test('automatic source changes cannot demote a reviewed record', () => fixture(({open,save})=>{
  let db = open(); const a = source.programmes[0];
  db.importBatch({schemaVersion:1,programmes:[{...a,verification:'peer_reviewed',collector:'Synthetic collector',reviewer:'Synthetic reviewer'}]},'Synthetic peer review');
  const revised = structuredClone(source); revised.programmes[0].notesEn += ' Synthetic upstream change.';
  save(revised); db = open();
  assert.equal(db.get(a.id).verification,'peer_reviewed');
  assert.deepEqual(db.quality().sourceRefreshConflicts,[a.id]);
}));
test('safe source updates retain programme scope corrections', () => fixture(({open,save})=>{
  let db = open(); const a = source.programmes[0];
  db.importBatch({schemaVersion:1,programmes:[{...a,scope:{status:'out_of_scope',checkedOn:'2026-10-13',sourceUrl:a.officialUrl,reasonEn:'Synthetic scope only'}}]},'Synthetic scope');
  const revised = structuredClone(source); revised.programmes[0].notesEn += ' Synthetic safe refresh.';
  save(revised); db = open();
  assert.equal(db.get(a.id).scope.status,'out_of_scope');
  assert.equal(db.get(a.id).notesEn,revised.programmes[0].notesEn);
}));
test('safe source updates retain non-admission directory evidence', () => fixture(({open,save})=>{
  let db=open();const a=source.programmes[0];
  const directoryListing={nameEn:a.name,checkedOn:'2026-10-13',sourceUrl:a.officialUrl,programmeUrl:a.officialUrl,variants:[],noteEn:'Synthetic directory metadata only'};
  db.importBatch({schemaVersion:1,programmes:[{...a,directoryListing}]},'Synthetic directory overlay');
  const revised=structuredClone(source);revised.programmes[0].notesEn+=' Synthetic source refresh.';
  save(revised);db=open();assert.deepEqual(db.get(a.id).directoryListing,directoryListing);assert.equal(db.get(a.id).notesEn,revised.programmes[0].notesEn);assert.deepEqual(db.quality().sourceRefreshConflicts,[]);
}));
test('a legacy checked batch gains fingerprints without replacing later manual data', () => fixture(({open,save})=>{
  let db = open(); const a = source.programmes[0];
  db.importBatch({schemaVersion:1,programmes:[{...a,notesEn:'Synthetic legacy manual change.'}]},'Synthetic manual edit');
  db.db.prepare("DELETE FROM metadata WHERE key LIKE 'checkedRecordHash:%'").run();
  db = open(); assert.equal(db.get(a.id).notesEn,'Synthetic legacy manual change.');
  const revised = structuredClone(source); revised.programmes[0].notesEn += ' Synthetic next source.';
  save(revised); db = open(); assert.equal(db.get(a.id).notesEn,'Synthetic legacy manual change.');
  assert.deepEqual(db.quality().sourceRefreshConflicts,[a.id]);
}));
test('legacy historical source entries support a safe migration when the file changed', () => fixture(({open,save})=>{
  let db = open(); const a = source.programmes[0];
  db.db.prepare("DELETE FROM metadata WHERE key LIKE 'checkedRecordHash:%'").run();
  const revised = structuredClone(source); revised.programmes[0].notesEn += ' Synthetic next source.';
  save(revised); db = open();
  assert.equal(db.get(a.id).notesEn,revised.programmes[0].notesEn);
  assert.deepEqual(db.quality().sourceRefreshConflicts,[]);
}));
test('invalid refreshed batches leave records and fingerprints unchanged', () => fixture(({open,get})=>{
  const db = open(); const before = db.export(), priorHash = db.getMeta('checkedHash');
  const invalid = structuredClone(source); invalid.programmes[0].notesEn = 'Should not apply'; invalid.programmes[1].officialUrl = 'https://attacker.invalid/';
  assert.throws(()=>db.refreshCheckedBatch(invalid,hash('synthetic invalid')));
  assert.deepEqual(get().export().programmes,before.programmes);
  assert.equal(db.getMeta('checkedHash'),priorHash);
}));

test('first programme check upgrades an unchanged seed beneath directory and scope overlays after restart', () => fixture(({open,save})=>{
  let db = open(); const lead = db.get(unreviewedSeeds[0].id);
  assert.equal(lead.verification, 'catalogue_seed');
  const directoryListing = { nameEn: lead.name, checkedOn: '2026-10-20', sourceUrl: lead.officialUrl, programmeUrl: lead.officialUrl, variants: [], noteEn: 'Synthetic directory-only overlay.' };
  const scope = { status: 'unconfirmed', checkedOn: '2026-10-20', sourceUrl: lead.officialUrl, reasonEn: 'Synthetic delivery scope remains pending.' };
  db.importBatch({ schemaVersion: 1, programmes: [{ ...lead, directoryListing, scope }] }, 'Synthetic non-admission overlays');
  const { university, ...withoutUniversity } = lead;
  const incoming = { ...withoutUniversity, verification: 'programme_page_checked', admissionRoute: 'direct', requirementsCoverage: 'partial', academicYear: '2027/28', lastChecked: '2026-10-24', collector: 'Synthetic collector', reviewer: null, notesEn: 'Synthetic first programme-page check.' };
  const revised = structuredClone(source); revised.programmes.push(incoming); save(revised); db = open();
  assert.equal(db.get(lead.id).verification, 'programme_page_checked'); assert.equal(db.get(lead.id).notesEn, incoming.notesEn);
  assert.deepEqual(db.get(lead.id).directoryListing, directoryListing); assert.deepEqual(db.get(lead.id).scope, scope);
  assert.deepEqual(db.quality().sourceRefreshConflicts, []);
  db = open(); assert.equal(db.get(lead.id).notesEn, incoming.notesEn); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
}));

test('first checks of directory-expansion leads use their own untouched admission baseline', () => fixture(({open,save})=>{
  const expansionPath = new URL('data/catalogue-expansion.json', root);
  let db = open({ expansionPath }); const raw = JSON.parse(readFileSync(expansionPath, 'utf8')).programmes.find(p => !seed.programmes.some(s => s.id === p.id) && !source.programmes.some(s => s.id === p.id));
  const lead = db.get(raw.id);
  const directoryListing = { nameEn: lead.name, checkedOn: '2026-10-20', sourceUrl: lead.officialUrl, programmeUrl: lead.officialUrl, variants: [], noteEn: 'Synthetic expansion directory-only overlay.' };
  db.importBatch({ schemaVersion: 1, programmes: [{ ...lead, directoryListing }] }, 'Synthetic non-admission overlay');
  const incoming = { ...raw, verification: 'programme_page_checked', admissionRoute: 'direct', requirementsCoverage: 'partial', academicYear: '2027/28', lastChecked: '2026-10-24', collector: 'Synthetic collector', reviewer: null, notesEn: 'Synthetic first expanded-lead check.' };
  const revised = structuredClone(source); revised.programmes.push(incoming); save(revised); db = open({ expansionPath });
  assert.equal(db.get(raw.id).notesEn, incoming.notesEn); assert.equal(db.get(raw.id).verification, 'programme_page_checked');
  assert.deepEqual(db.get(raw.id).directoryListing, directoryListing); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
}));

test('first programme checks cannot overwrite locally changed or independently reviewed catalogue leads', () => fixture(({open,save})=>{
  let db = open(); const lead = db.get(unreviewedSeeds[0].id), reviewedLead = db.get(unreviewedSeeds[1].id);
  const manual = { ...lead, notesEn: 'Synthetic manual data that must survive.' };
  const reviewed = { ...reviewedLead, verification: 'peer_reviewed', requirementsCoverage: 'partial', academicYear: '2027/28', lastChecked: '2026-10-24', collector: 'Synthetic collector', reviewer: 'Synthetic independent reviewer' };
  db.importBatch({ schemaVersion: 1, programmes: [manual, reviewed] }, 'Synthetic manual/imported review');
  const revised = structuredClone(source);
  for (const p of [lead, reviewedLead]) {
    const { university, ...raw } = p;
    revised.programmes.push({ ...raw, verification: 'programme_page_checked', admissionRoute: 'direct', requirementsCoverage: 'partial', academicYear: '2027/28', lastChecked: '2026-10-24', collector: 'Synthetic collector', reviewer: null, notesEn: 'Synthetic upstream first check.' });
  }
  save(revised); db = open();
  assert.equal(db.get(lead.id).notesEn, manual.notesEn); assert.equal(db.get(reviewedLead.id).verification, 'peer_reviewed');
  assert.equal(db.get(reviewedLead.id).reviewer, reviewed.reviewer);
  assert.deepEqual(db.quality().sourceRefreshConflicts, [lead.id, reviewedLead.id]);
  db = open(); assert.deepEqual(db.quality().sourceRefreshConflicts, [lead.id, reviewedLead.id]);
  // Explicitly restoring the untouched admission baseline makes only that pending upgrade safe.
  db.importBatch({ schemaVersion: 1, programmes: [lead] }, 'Synthetic explicit restoration to catalogue baseline');
  db = open(); assert.equal(db.get(lead.id).notesEn, 'Synthetic upstream first check.');
  assert.equal(db.get(reviewedLead.id).verification, 'peer_reviewed');
  assert.deepEqual(db.quality().sourceRefreshConflicts, [reviewedLead.id]);
}));
