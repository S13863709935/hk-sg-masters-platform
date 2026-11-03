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
const obs = read('data/research/cityu-humanities-media-observation-2026-10-30.json'), batch = read('data/checked-programmes.json');
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const store = new CatalogueStore(':memory:', options), p = n => store.get(`HK-CITYU-P${String(n).padStart(3, '0')}`);
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 4, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-09-01', singleAttempt: true } };
const english = (n, language) => matchProgramme(p(n), { ...profile, language }).checks.find(c => c.kind === 'language');
const specific = n => p(n).rules.find(r => r.labelEn === 'Programme-specific preparation and study conditions').noteEn;

test('sixteen existing IDs gain thirty English-data study options without adding awards or complete approvals', () => {
  assert.equal(obs.programmeIds.length, 16); assert.equal(new Set(obs.programmeIds).size, 16); assert.equal(obs.counts.newOfferings, 30);
  assert.equal(store.quality().checked, 384); assert.equal(store.quality().total, 873); assert.equal(store.quality().browsable, 865);
  assert.equal(store.quality().complete, 0); assert.equal(store.quality().peerReviewed, 0);
  assert.equal(store.all().filter(p => p.universityId === 'HK-CITYU' && p.verification === 'programme_page_checked').length, 61);
  for (const id of obs.programmeIds) {
    const raw = batch.programmes.find(p => p.id === id);
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify(raw)), false);
    assert.equal(raw.requirementsCoverage, 'partial'); assert.equal(raw.reviewer, null); assert.equal(raw.lastChecked, '2026-10-30');
    assert.equal(raw.rules.some(r => ['gpa', 'experience'].includes(r.kind)), false);
    assert.equal(raw.fieldStatus.gpa.status, 'not_published'); assert.equal(batch.pilotProgrammeIds.includes(id), false);
    assert.equal(matchProgramme(store.get(id), profile).tier, null);
  }
});

test('English Studies uses IELTS 7 or old TOEFL 102/new 5.5 and never borrows neighbouring scores or CET alternatives', () => {
  const ielts = { type: 'ielts', total: 6.5, testDate: '2026-09-01', singleAttempt: true };
  assert.equal(english(15, ielts).status, 'fail'); assert.equal(english(13, ielts).status, 'pass'); assert.equal(english(15, { ...ielts, total: 7 }).status, 'pass');
  const older = { type: 'toefl_120', total: 101, testDate: '2025-09-01', singleAttempt: true };
  assert.equal(english(15, older).status, 'fail'); assert.equal(english(15, { ...older, total: 102 }).status, 'pass');
  const newer = { type: 'toefl_6', total: 5, testDate: '2026-09-01', singleAttempt: true };
  assert.equal(english(15, newer).status, 'fail'); assert.equal(english(15, { ...newer, total: 5.5 }).status, 'pass');
  assert.equal(english(15, { type: 'waiver' }).status, 'unknown');
  assert.equal(obs.records.find(r => r.code === 'P40').cet6ObservedMin, null);
  assert.match(specific(15), /other English evidence is not accepted for that test branch/);
  assert.match(p(14).rules.find(r => r.labelEn === 'English evidence and applicability').noteEn, /CET-6 500/);
});

test('Chinese evidence and Putonghua-medium exemptions remain manual despite high English scores or location claims', () => {
  for (const n of [12, 60]) {
    const result = matchProgramme(p(n), { ...profile, language: { ...profile.language, total: 9 }, nationality: 'China', chineseMedium: true });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.ok(result.checks.some(c => /Chinese/.test(c.labelEn) && c.kind === 'manual' && c.status === 'unknown'));
    assert.equal(p(n).rules.some(r => r.kind === 'language' && r.tests?.hsk), false);
  }
  const chinese = p(12).rules.find(r => r.labelEn === 'Required Chinese-language evidence').noteEn;
  assert.match(chinese, /30 hours/); assert.match(chinese, /grade D/); assert.match(chinese, /level 4/); assert.match(chinese, /admission test must be passed/);
  assert.match(specific(60), /no published numeric HSK threshold/);
  assert.deepEqual(p(60).offerings.map(o => o.mode), ['Full-time']);
});

test('MFA stream-dependent portfolio and five-calendar-day HCI survey are not universal requirements or MA rules', () => {
  assert.match(specific(29), /Main\/Games applicants submit a creative portfolio and artist statement/);
  assert.match(specific(29), /HCI applicants complete a survey within five calendar days/);
  assert.match(specific(29), /No universal portfolio requirement/);
  assert.match(specific(14), /do not borrow the MFA portfolio\/survey rule/);
  assert.equal(p(29).offerings.length, 1); assert.equal(p(29).offerings[0].mode, 'Full-time');
  assert.equal(p(29).offerings[0].tuition, 410400); assert.match(p(29).offerings[0].feeBasis, /54 credits/);
});

test('Counselling preserves mode lock, project/practicum differences and preferred experience without automatic certification', () => {
  assert.match(specific(59), /two relevant work years are preferred/); assert.match(specific(59), /cannot be changed during/);
  assert.match(specific(59), /Full-time students take the project through summer rather than counselling practicum/);
  assert.match(specific(59), /part-time students may choose/); assert.match(specific(59), /No automatic Certified Counsellor/);
  assert.match(p(59).offerings[0].duration, /project through summer/); assert.match(p(59).offerings[1].duration, /project or practicum/);
  assert.equal(matchProgramme(p(59), profile).checks.some(c => c.kind === 'experience' && c.status === 'fail'), false);
});

test('minimum credits, separate expenses and Social Work field training are not replaced by a 30-credit or prior-hours template', () => {
  assert.equal(p(8).offerings[0].tuition, 255600); assert.match(p(8).offerings[0].feeBasis, /36 credits/);
  assert.equal(p(20).offerings[0].tuition, 218400); assert.match(p(20).offerings[0].feeBasis, /24 credits/);
  for (const o of p(26).offerings) { assert.equal(o.tuition, 390500); assert.match(o.feeBasis, /55 credits/); }
  assert.match(p(26).offerings[0].duration, /2 years/); assert.match(p(26).offerings[1].duration, /3 years/);
  assert.match(specific(26), /passed admission interview/); assert.match(specific(26), /900 training hours.*not prior work experience/);
  assert.match(p(17).offerings[0].feeBasis, /residential-trip expenses are additional and unpriced/);
  assert.equal(p(17).offerings[0].feeEvidence.sourceUrl, 'https://www.cityu.edu.hk/sgs/tuitionfee/sf_P78.htm');
});

test('the unavailable 45-credit heritage route and smaller awards cannot become open cheap Hong Kong masters', () => {
  assert.equal(obs.boundaries.P34.notAvailableFor2027.credits, 45); assert.equal(obs.boundaries.P34.representedCredits, 30);
  assert.equal(p(12).offerings.length, 2);
  for (const o of p(12).offerings) {
    assert.equal(o.tuition, 228000); assert.match(o.duration, /ordinary Hong Kong 30-credit/);
    assert.match(o.feeBasis, /unavailable 45-credit Peking University/); assert.equal(o.deadline, '2027-03-31');
  }
  assert.match(specific(12), /unavailable for 2027 entry, subject to university approval/);
  assert.equal(store.all().filter(p => p.universityId === 'HK-CITYU').length, 62);
});

test('explicit dates and score validity remain comparable without invented category, work or GPA constraints', () => {
  const old = { type: 'toefl_120', total: 79, testDate: '2024-09-14', singleAttempt: true };
  assert.equal(english(8, old).status, 'fail'); assert.equal(english(8, { ...old, testDate: '2024-09-15' }).status, 'pass');
  assert.throws(() => english(8, { ...old, testDate: '2026-01-21' }), /score scale conflicts with the test date/);
  assert.equal(english(8, { ...old, testDate: '2025-01-01', atHome: true }).status, 'fail');
  for (const id of obs.programmeIds) assert.equal(programmeTimeline(store.get(id), '2026-10-30').state, 'within_recorded_dates');
  const q = loadRepositoryReviewQueue('2026-10-30'); assert.equal(q.counts.programmePageRecords, 384);
  assert.equal(q.counts.reviewUnits, 689); assert.equal(q.counts.nearCutoffUnits, 3); assert.equal(q.counts.staleApplicantContexts, 0);
  assert.equal(q.counts.applicantContexts, 258); assert.equal(q.counts.applicantCategories, 520);
});

test('a sixteen-record batch imports over isolated restarts while preserving every other current record', () => {
  const ids = new Set(obs.programmeIds), before = { ...batch, programmes: batch.programmes.filter(p => !ids.has(p.id)) };
  assert.equal(before.programmes.length, batch.programmes.length - 16);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-cityu-humanities-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify(before)); db = new CatalogueStore(path, { ...options, checkedPath });
    const earlier = db.all().filter(p => !ids.has(p.id)); assert.equal(db.quality().checked, before.programmes.length); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.quality().checked, 384);
      assert.deepEqual(db.all().filter(p => !ids.has(p.id)), earlier); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      for (const id of ids) assert.equal(db.get(id).verification, 'programme_page_checked'); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: new URL('data/route-programmes.json', root), applicantEvidencePath: new URL('data/applicant-contexts.json', root), now: () => new Date('2026-10-30T08:00:00Z') });
let base;
test.before(async () => { await new Promise(resolve => app.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${app.address().port}`; });
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });
test('real matching, detail, saved-choice restore and export retain all thirty scoped study options and unresolved evidence', async () => {
  for (const id of obs.programmeIds) {
    const first = store.get(id).offerings[0].id;
    const matched = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [id]: first } }) });
    assert.equal(matched.status, 200); const result = (await matched.json()).items.find(p => p.id === id).match;
    assert.equal(result.tier, null); assert.notEqual(result.status, 'meets_checked');
    for (const o of store.get(id).offerings) {
      const response = await fetch(`${base}/api/programmes/${id}?offering=${o.id}`); assert.equal(response.status, 200); const detail = await response.json();
      assert.equal(detail.offerings[0].tuition, o.tuition); assert.equal(detail.offerings[0].applicationFee, 600);
      const remembered = optionSnapshot(detail, '2026-10-30T08:00:00.000Z');
      const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [remembered] }) });
      assert.equal(restored.status, 200); assert.equal((await restored.json()).items[0].status, 'resolved');
      const exported = shortlistExport([detail], { [id]: remembered }).programmes[0];
      assert.equal(exported.offerings[0].id, o.id); assert.equal(exported.offerings[0].tuitionEstimate, true);
      assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
    }
  }
});
