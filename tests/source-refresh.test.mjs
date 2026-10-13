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
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(),'gradpath-refresh-'));
  const path = join(dir,'test.sqlite'), sourcePath = join(dir,'checked.json');
  let db;
  const open = () => { db?.close(); db = new CatalogueStore(path, {seed,checkedPath:sourcePath}); return db; };
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
