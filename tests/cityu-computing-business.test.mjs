import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const obs = read('data/research/cityu-computing-business-observation-2026-10-30.json');
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) };
const store = new CatalogueStore(':memory:', options), p = n => store.get(`HK-CITYU-P${String(n).padStart(3, '0')}`);
const background = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'second_upper', gpa: 3.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-09-01', singleAttempt: true } };
const english = (n, language) => matchProgramme(p(n), { ...background, language }).checks.find(c => c.kind === 'language');

test('21 existing IDs gain partial source evidence without creating new catalogue awards or changing the original pilot', () => {
  assert.equal(obs.programmeIds.length, 21); assert.equal(new Set(obs.programmeIds).size, 21);
  const q = store.quality(); assert.equal(q.total, 873); assert.equal(q.checked, 274); assert.equal(q.browsable, 869); assert.equal(q.complete, 0); assert.equal(q.peerReviewed, 0);
  assert.equal(store.all().filter(p => p.universityId === 'HK-CITYU' && p.verification === 'programme_page_checked').length, 60);
  const batch = read('data/checked-programmes.json'); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.ok(obs.programmeIds.every(id => !batch.pilotProgrammeIds.includes(id)));
  for (const id of obs.programmeIds) {
    const record = store.get(id); assert.equal(record.requirementsCoverage, 'partial'); assert.equal(record.reviewer, null); assert.equal(record.lastChecked, '2026-10-30');
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(batch.programmes.find(p => p.id === id))), false);
    assert.equal(record.fieldStatus.gpa.status, 'not_published'); assert.equal(record.rules.some(r => r.kind === 'gpa'), false);
    assert.equal(matchProgramme(record, background).tier, null);
  }
});

test('the first-batch P17 hold is retained historically and its later partial record keeps title approval unresolved', () => {
  assert.equal(obs.held[0].programmeId, p(7).id);
  for (const n of [3, 9]) assert.equal(p(n).verification, 'catalogue_seed');
  for (const n of [36, 37]) assert.equal(p(n).verification, 'programme_page_checked');
  assert.equal(p(7).verification, 'programme_page_checked');
  assert.equal(matchProgramme(p(7), background).status, 'needs_confirmation');
  assert.ok(p(7).rules.some(r => /title approval/i.test(r.labelEn) && r.kind === 'manual'));
  assert.equal(obs.programmeIds.includes(p(7).id), false);
});

test('one school batch upgrades 21 existing catalogue records over isolated restarts while preserving other current records', () => {
  const batch = read('data/checked-programmes.json'), ids = new Set(obs.programmeIds);
  const earlierBatch = { ...batch, programmes: batch.programmes.filter(p => !ids.has(p.id)) };
  assert.equal(earlierBatch.programmes.length, batch.programmes.length - 21);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cityu-batch-'));
  const path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json');
  let db;
  try {
    writeFileSync(checkedPath, JSON.stringify(earlierBatch));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const earlier = db.all().filter(p => !ids.has(p.id));
    assert.equal(db.quality().checked, earlierBatch.programmes.length);
    for (const id of ids) assert.equal(db.get(id).verification, 'catalogue_seed');
    db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.quality().checked, 274);
      assert.deepEqual(db.all().filter(p => !ids.has(p.id)), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      for (const id of ids) assert.equal(db.get(id).verification, 'programme_page_checked');
      db.close(); db = null;
    }
  } finally {
    db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir);
  }
});

test('programme-specific IELTS and new TOEFL thresholds are not copied between AI, data science and digital transformation', () => {
  const ielts = { type: 'ielts', total: 6, testDate: '2026-09-01', singleAttempt: true };
  assert.equal(english(31, ielts).status, 'pass'); assert.equal(english(41, ielts).status, 'fail'); assert.equal(english(6, ielts).status, 'fail');
  assert.equal(english(41, { ...ielts, total: 6.5 }).status, 'pass');
  const newer = { type: 'toefl_6', total: 4, testDate: '2026-09-01', singleAttempt: true };
  assert.equal(english(31, newer).status, 'pass'); assert.equal(english(41, newer).status, 'fail');
  assert.equal(english(41, { ...newer, total: 4.5 }).status, 'pass');
  const note = n => p(n).rules.find(r => r.labelEn === 'English evidence and accepted alternatives').noteEn;
  assert.match(note(31), /CET-6 450/); assert.match(note(5), /CET-6 490/);
  assert.match(note(30), /No CET-6 number was established/);
  assert.match(note(52), /All shortlisted Marketing candidates/);
  assert.match(note(31), /IELTS 6\.0 or updated TOEFL band 4/);
  assert.equal(p(31).rules.some(r => r.tests?.cet6), false);
});

test('new TOEFL paired evidence and non-local-only applicability remain unresolved', () => {
  assert.equal(english(58, { type: 'toefl_6', total: 4, testDate: '2026-09-01', singleAttempt: true }).status, 'unknown');
  assert.match(p(58).rules.find(r => r.labelEn === 'Programme-specific preparation and selection').noteEn, /comparable 79/);
  assert.equal(p(32).rules.some(r => r.kind === 'language'), false);
  assert.equal(p(32).fieldStatus.language.status, 'unknown');
  assert.equal(matchProgramme(p(32), { ...background, major: 'History', language: { type: 'none' } }).status, 'needs_confirmation');
});

test('test validity uses the application-period anchor and rejects excluded test formats', () => {
  const score = { type: 'toefl_120', total: 90, testDate: '2024-09-14', singleAttempt: true };
  assert.equal(english(31, score).status, 'fail'); assert.equal(english(31, { ...score, testDate: '2024-09-15' }).status, 'pass');
  assert.equal(english(31, { ...score, testDate: '2025-09-01', atHome: true }).status, 'fail');
});

test('preferences, stream choices and academic equivalents never become universal work-year or named-major exclusions', () => {
  for (const n of [1, 2, 5, 6, 19, 35, 45, 52, 56, 58]) {
    assert.equal(p(n).rules.some(r => r.kind === 'experience'), false);
    assert.equal(matchProgramme(p(n), background).checks.some(c => c.kind === 'experience' && c.status === 'fail'), false);
  }
  assert.match(p(1).rules.find(r => r.kind === 'manual').noteEn, /non-accounting.*Corporate Governance/);
  const history = matchProgramme(p(30), { ...background, major: 'History' });
  assert.equal(history.checks.find(c => c.kind === 'major').status, 'pass'); assert.equal(history.status, 'needs_confirmation');
  assert.equal(matchProgramme(p(31), { ...background, major: 'History' }).checks.find(c => c.kind === 'major').status, 'unknown');
  assert.equal(matchProgramme(p(16), { ...background, classification: 'unknown', gpa: 4 }).checks.find(c => c.kind === 'classification').status, 'unknown');
});

test('universal deadlines remain withheld after category reconciliation and study-mode boundaries stay explicit', () => {
  for (const n of [6, 16, 51, 52]) {
    assert.equal(p(n).fieldStatus.deadline.status, 'known');
    for (const o of p(n).offerings) assert.equal(o.deadline, null);
    assert.equal(programmeTimeline(p(n), '2026-10-30').state, 'dates_incomplete');
  }
  assert.equal(p(2).offerings[0].deadline, '2026-11-18'); assert.equal(p(47).offerings[0].deadline, '2026-12-31');
  assert.deepEqual(p(47).offerings.map(o => o.mode), ['Full-time']); assert.deepEqual(p(51).offerings.map(o => o.mode), ['Full-time']);
  assert.deepEqual(p(39).offerings.map(o => o.duration), ['Ordinary option: 1 year', 'Ordinary option: 2 years']);
  for (const n of [2, 31, 32, 40, 46]) for (const o of p(n).offerings) assert.equal(o.tuition, null);
  assert.equal(p(39).offerings[0].tuition, 279000);
});

test('current maintenance units distinguish later category evidence from unchanged routes and imminent cutoffs', () => {
  const q = loadRepositoryReviewQueue('2026-10-30'); assert.equal(q.counts.programmePageRecords, 274); assert.equal(q.counts.remainingCatalogueLeads, 599);
  assert.equal(q.counts.reviewUnits, 502); assert.equal(q.counts.routeRecords, 37); assert.equal(q.counts.applicantContexts, 191);
  assert.equal(q.counts.nearCutoffUnits, 3); assert.equal(q.counts.staleApplicantContexts, 0);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root) });
let url;
test.before(async () => { await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${app.address().port}`; });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
const get = async path => { const r = await fetch(url + path); assert.equal(r.status, 200); return r.json(); };

test('real APIs expose checked details and restore new choices without silently substituting retired lead choices', async () => {
  const listing = await get('/api/catalogue?school=HK-CITYU&verification=programme_page_checked&limit=100'); assert.equal(listing.total, 60);
  const id = p(31).id, offering = p(31).offerings[0].id;
  const detail = await get(`/api/programmes/${id}?offering=${offering}`); assert.equal(detail.selectedOffering.id, offering); assert.equal(detail.offerings[0].tuition, null);
  const original = [...read('data/catalogue.json').programmes, ...read('data/catalogue-expansion.json').programmes].find(p => p.id === id);
  const response = await fetch(url + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [{ programmeId: id, offeringId: offering }, { programmeId: id, offeringId: original.offerings[0].id }] }) });
  assert.equal(response.status, 200); const resolved = (await response.json()).items;
  assert.equal(resolved[0].status, 'resolved'); assert.equal(resolved[1].status, 'needs_attention');
  const exported = shortlistExport([detail], { [id]: optionSnapshot(detail) }, '2026-10-30T04:00:00.000Z').programmes[0];
  assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
});
