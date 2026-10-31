import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const obs = read('data/research/cityu-engineering-science-observation-2026-10-30.json'), batch = read('data/checked-programmes.json');
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const store = new CatalogueStore(':memory:', options), p = n => store.get(`HK-CITYU-P${String(n).padStart(3, '0')}`);
const profile = { major: 'Mechanical Engineering', degreeStatus: 'graduated', classification: 'first', gpa: 4, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-09-01', singleAttempt: true } };
const english = (n, language) => matchProgramme(p(n), { ...profile, language }).checks.find(c => c.kind === 'language');

test('fourteen existing catalogue identities gain partial evidence and no full requirements or independent approval', () => {
  assert.equal(obs.programmeIds.length, 14); assert.equal(new Set(obs.programmeIds).size, 14);
  assert.equal(obs.counts.newOfferings, 27); assert.equal(store.quality().checked, 267); assert.equal(store.quality().total, 873);
  assert.equal(store.quality().browsable, 869); assert.equal(store.quality().peerReviewed, 0); assert.equal(store.quality().complete, 0);
  assert.equal(store.all().filter(p => p.universityId === 'HK-CITYU' && p.verification === 'programme_page_checked').length, 60);
  for (const id of obs.programmeIds) {
    const raw = batch.programmes.find(p => p.id === id);
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(raw)), false);
    assert.equal(raw.requirementsCoverage, 'partial'); assert.equal(raw.reviewer, null); assert.equal(raw.lastChecked, '2026-10-30');
    assert.equal(raw.fieldStatus.gpa.status, 'not_published'); assert.equal(batch.pilotProgrammeIds.includes(id), false);
    assert.equal(raw.rules.some(r => r.kind === 'gpa'), false);
    assert.equal(matchProgramme(store.get(id), profile).tier, null);
  }
});

test('Neuroscience retains higher IELTS and updated TOEFL scores instead of inheriting the other programmes thresholds', () => {
  const ielts = { type: 'ielts', total: 6, testDate: '2026-09-01', singleAttempt: true };
  assert.equal(english(55, ielts).status, 'fail'); assert.equal(english(34, ielts).status, 'pass');
  assert.equal(english(55, { ...ielts, total: 6.5 }).status, 'pass');
  const newer = { type: 'toefl_6', total: 4, testDate: '2026-09-01', singleAttempt: true };
  assert.equal(english(55, newer).status, 'fail'); assert.equal(english(34, newer).status, 'pass');
  assert.equal(english(55, { ...newer, total: 4.5 }).status, 'pass');
  assert.match(p(55).rules.find(r => r.labelEn === 'English evidence, validity and accepted alternatives').noteEn, /does not establish the other programmes/);
});

test('the central explicit validity anchor, version boundary, excluded formats and waiver evidence remain distinct', () => {
  const older = { type: 'toefl_120', total: 79, testDate: '2024-09-14', singleAttempt: true };
  assert.equal(english(42, older).status, 'fail'); assert.equal(english(42, { ...older, testDate: '2024-09-15' }).status, 'pass');
  assert.throws(() => english(42, { ...older, testDate: '2026-01-21' }), /score scale conflicts with the test date/);
  assert.equal(english(42, { ...older, testDate: '2025-01-01', atHome: true }).status, 'fail');
  assert.equal(english(42, { type: 'waiver' }).status, 'unknown');
  assert.equal(english(42, { type: 'ielts', total: 7, testDate: '2026-01-01', singleAttempt: false }).status, 'unknown');
  for (const id of obs.programmeIds) {
    const language = store.get(id).rules.find(r => r.kind === 'language');
    assert.equal(language.testDateNotBefore, '2024-09-15'); assert.equal(language.testDateSourceUrl, obs.sharedSources.openingAndTestDate);
  }
});

test('architecture subject and portfolio requirements cannot become automatic accreditation or full eligibility', () => {
  const good = matchProgramme(p(22), { ...profile, major: 'Architecture' }), other = matchProgramme(p(22), { ...profile, major: 'History' });
  assert.equal(good.checks.find(c => c.kind === 'major').status, 'pass'); assert.equal(other.checks.find(c => c.kind === 'major').status, 'fail');
  assert.equal(good.status, 'needs_confirmation'); assert.equal(good.tier, null);
  const manual = p(22).rules.find(r => r.labelEn === 'Programme-specific qualification and study conditions');
  assert.match(manual.noteEn, /40 pages/); assert.match(manual.noteEn, /500 words/); assert.match(manual.noteEn, /Plans to seek professional accreditation/);
  assert.equal(good.checks.find(c => c.labelEn === manual.labelEn).status, 'unknown');
});

test('professional alternatives, relevant subjects and preferred experience are not universal mandatory work-year gates', () => {
  for (const n of [27, 34, 38, 42, 43, 44, 48, 49, 50, 53, 54, 55, 57]) {
    const result = matchProgramme(p(n), { ...profile, major: 'History', degreeStatus: 'other', experienceYears: 0 });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(p(n).rules.some(r => r.kind === 'experience'), false);
  }
  assert.equal(p(42).fieldStatus.major.status, 'not_published'); assert.equal(p(42).rules.some(r => r.kind === 'major'), false);
  assert.match(p(49).rules.find(r => r.kind === 'manual').noteEn, /three post-graduation industry years are preferences/);
});

test('architecture and planning durations and minimum-credit estimates stay programme-specific', () => {
  assert.equal(p(22).offerings.length, 1); assert.equal(p(22).offerings[0].duration, '2 years'); assert.equal(p(22).offerings[0].tuition, 478500);
  assert.deepEqual(p(27).offerings.map(o => o.duration), ['2 years', '4 years']);
  for (const o of p(27).offerings) { assert.equal(o.tuition, 522000); assert.equal(o.tuitionEstimate, true); assert.equal(o.applicationFee, 600); }
  assert.equal(p(34).offerings[0].tuition, 228000); assert.equal(p(57).offerings[0].tuition, 213000);
  for (const id of obs.programmeIds) for (const o of store.get(id).offerings) assert.equal(o.tuitionEstimate, true);
});

test('EEE variants, construction diploma and proposed chemistry stream do not inflate masters or import later CGPA', () => {
  for (const o of p(42).offerings) { assert.equal(o.tuition, 279000); assert.match(o.duration, /Ordinary 30-credit/); }
  assert.equal(p(42).offerings.length, 2);
  for (const o of p(49).offerings) { assert.equal(o.tuition, 258000); assert.match(o.feeBasis, /no 24-credit diploma/); assert.match(o.duration, /additional summer/); }
  assert.match(p(54).offerings.find(o => o.mode === 'Full-time').duration, /1\.5 years with dissertation/);
  assert.equal(p(54).offerings[0].tuition, p(54).offerings[1].tuition);
  assert.equal(p(38).offerings.length, 2); assert.match(p(38).notesEn, /Cosmetic Chemistry stream is subject to approval/);
  assert.match(p(38).notesEn, /CGPA 3\.4.*not an admission GPA/); assert.equal(p(38).rules.some(r => r.kind === 'gpa'), false);
});

test('conflicting official Energy deadlines remain unresolved without a guessed extension or opening status', () => {
  assert.equal(p(43).fieldStatus.deadline.status, 'unknown');
  assert.equal(p(43).sources.some(s => s.url === obs.energyDeadlineConflict.departmentUrl), true);
  for (const o of p(43).offerings) {
    assert.equal(o.deadline, null); assert.match(o.deadlineNote, /31 May 2027/); assert.match(o.deadlineNote, /31 March 2027/);
    assert.equal(o.intake, 'September 2027'); assert.equal(o.tuition, 213000);
  }
  for (const day of ['2026-10-30', '2027-03-31', '2027-04-30', '2027-05-31']) assert.equal(programmeTimeline(p(43), day).state, 'dates_incomplete');
  const q = loadRepositoryReviewQueue('2026-10-30'); assert.equal(q.counts.reviewUnits, 477); assert.equal(q.counts.nearCutoffUnits, 3);
  assert.equal(q.counts.applicantContexts, 184); assert.equal(q.counts.applicantCategories, 370); assert.equal(q.counts.staleApplicantContexts, 0);
});

test('one 14-record import is idempotent and preserves other current records over isolated restarts', () => {
  const ids = new Set(obs.programmeIds), before = { ...batch, programmes: batch.programmes.filter(p => !ids.has(p.id)) };
  assert.equal(before.programmes.length, batch.programmes.length - 14);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cityu-engineering-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify(before)); db = new CatalogueStore(path, { ...options, checkedPath });
    assert.equal(db.quality().checked, before.programmes.length); const earlier = db.all().filter(p => !ids.has(p.id)); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.quality().checked, 267);
      assert.deepEqual(db.all().filter(p => !ids.has(p.id)), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      for (const id of ids) assert.equal(db.get(id).verification, 'programme_page_checked'); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => new Date('2026-10-30T07:00:00Z') });
let base;
test.before(async () => { await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.address().port}`; });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
test('real API detail, matching, remembered choices and export retain all 27 ordinary study options and partial limits', async () => {
  for (const id of obs.programmeIds) {
    const first = store.get(id).offerings[0].id;
    const matchResponse = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [id]: first } }) });
    assert.equal(matchResponse.status, 200); const result = (await matchResponse.json()).items.find(p => p.id === id).match;
    assert.equal(result.tier, null); assert.notEqual(result.status, 'meets_checked');
    for (const o of store.get(id).offerings) {
      const response = await fetch(`${base}/api/programmes/${id}?offering=${o.id}`); assert.equal(response.status, 200); const detail = await response.json();
      assert.equal(detail.offerings[0].tuition, o.tuition); assert.equal(detail.offerings[0].applicationFee, 600);
      if (id === 'HK-CITYU-P043') assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
      const remembered = optionSnapshot(detail, '2026-10-30T07:00:00.000Z');
      const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [remembered] }) });
      assert.equal(restored.status, 200); assert.equal((await restored.json()).items[0].status, 'resolved');
      const exported = shortlistExport([detail], { [id]: remembered }).programmes[0];
      assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuitionEstimate, true);
      assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    }
  }
});
