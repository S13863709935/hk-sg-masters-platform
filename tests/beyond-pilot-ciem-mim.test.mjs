import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const batch = read('data/checked-programmes.json'), seed = read('data/catalogue.json');
const hk = batch.programmes.find(p => p.id === 'HK-HKUST-P001'), sm = batch.programmes.find(p => p.id === 'SG-SMU-P003');
const options = { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const resolve = (suffix, category) => resolveProgramme(store.get(hk.id), routes, undefined, hk.id + '-' + suffix, category && hk.id + '-' + suffix + '-' + category, contexts);
const manual = (p, label) => p.rules.find(r => r.kind === 'manual' && r.labelEn === label);
const profile = { major: 'Civil Engineering', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, components: { listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 }, testDate: '2026-05-01', singleAttempt: true } };

test('two existing catalogue IDs gain partial programme evidence without expanding the original pilot or source snapshot', () => {
  assert.deepEqual(batch.programmes.filter(p => p.researchBatch === 'beyond-pilot-ciem-mim-2026-10-24').map(p => p.id), [hk.id, sm.id]);
  assert.equal(batch.pilotProgrammeIds.length, 20);
  for (const p of [hk, sm]) {
    assert.ok(!batch.pilotProgrammeIds.includes(p.id)); assert.equal(seed.programmes.find(s => s.id === p.id).verification, 'catalogue_seed');
    assert.equal(p.lastChecked, '2026-10-24'); assert.equal(p.admissionRoute, 'direct'); assert.equal(p.requirementsCoverage, 'partial');
    assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.reviewer, null); assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
    assert.equal(/\p{Script=Han}/u.test(JSON.stringify({ name: p.name, notes: p.notesEn, rules: p.rules, fields: p.fieldStatus })), false);
    assert.equal(p.offerings.some(o => o.id === p.id + '-seed'), false);
  }
});

test('CIEM MSc modes, fees and coverage terms never import the shared-page PGD price or add concentrations as degrees', () => {
  assert.equal(hk.award, 'MSc'); assert.equal(hk.offerings.length, 3);
  for (const [suffix, amount, duration, terms] of [['FEB2027-PT', 180000, '2–2.5 years', 6], ['SEP2027-FT', 210000, '1–1.5 years', 4], ['SEP2027-PT', 180000, '2–2.5 years', 6]]) {
    const o = hk.offerings.find(o => o.id.endsWith(suffix)); assert.equal(o.tuition, amount); assert.equal(o.duration, duration); assert.equal(o.applicationFee, 600);
    assert.match(o.feeBasis, new RegExp('Covers ' + terms + ' terms')); assert.match(o.feeBasis, /not an annual amount/); assert.match(o.feeBasis, /separate pro-rata exception/);
  }
  assert.ok(hk.offerings.every(o => o.tuition !== 105000));
  assert.match(manual(hk, 'MSc-only award, concentrations and professional recognition').noteEn, /Seven optional concentrations.*one MSc/);
  assert.match(manual(hk, 'MSc-only award, concentrations and professional recognition').noteEn, /intake 2026.*not an automatic 2027/);
});

test('CIEM February remains part-time only with a common cutoff, no exact early-September opening or borrowed autumn rounds', () => {
  const p = resolve('FEB2027-PT'), o = p.offerings[0];
  assert.equal(o.academicYear, '2026/27'); assert.equal(o.intake, 'February 2027'); assert.equal(o.mode, 'Part-time');
  assert.equal(o.deadline, '2026-11-01'); assert.equal(o.applicationOpen, null); assert.equal(o.applicationRounds, undefined); assert.equal(p.applicantOptions, undefined);
  assert.equal(hk.offerings.some(o => o.intake === 'February 2027' && o.mode === 'Full-time'), false);
  for (const [day, state] of [['2026-10-24', 'dates_incomplete'], ['2026-11-01', 'deadline_today'], ['2026-11-02', 'deadline_passed']]) assert.equal(programmeTimeline(p, day).state, state);
  assert.throws(() => resolveProgramme(store.get(hk.id), routes, undefined, o.id, hk.id + '-SEP2027-PT-LOCAL', contexts));
});

test('CIEM September categories bind each mode and expose distinct final rounds without defaulting or claiming an open portal', () => {
  for (const suffix of ['SEP2027-FT', 'SEP2027-PT']) {
    const offering = hk.offerings.find(o => o.id.endsWith(suffix)), context = [...contexts.values()].find(c => c.offeringId === offering.id);
    assert.equal(context.offeringFingerprint, offeringFingerprint(offering));
    const unselected = resolve(suffix); assert.equal(unselected.offerings[0].tuition, null); assert.equal(programmeTimeline(unselected, '2026-10-24').state, 'applicant_required');
    for (const [category, deadline] of [['LOCAL', '2027-05-15'], ['NONLOCAL', '2027-04-01']]) {
      const p = resolve(suffix, category), o = p.offerings[0]; assert.equal(o.tuition, offering.tuition); assert.equal(o.deadline, deadline);
      assert.equal(o.applicationOpen, null); assert.deepEqual(o.applicationRounds.map(r => r.deadline), ['2026-12-15', deadline]);
      assert.ok(o.applicationRounds.every(r => r.deadlineAt === null && r.applicationOpen === null));
      assert.equal(programmeTimeline(p, '2026-12-16').offerings[0].nextRoundId, 'ROUND-2'); assert.equal(programmeTimeline(p, '2026-10-24').state, 'dates_incomplete');
    }
  }
  const altered = { ...store.get(hk.id), offerings: hk.offerings.map(o => ({ ...o, tuition: 1 })) };
  const stale = resolveProgramme(altered, routes, undefined, hk.id + '-SEP2027-FT', undefined, contexts);
  assert.equal(stale.applicantContextStatus, 'stale'); assert.deepEqual(stale.applicantOptions, []);
});

test('CIEM academic and language checks retain relatedness, waiver and qualification judgement without generic GPA or research entry', () => {
  assert.equal(hk.rules.some(r => ['gpa', 'experience'].includes(r.kind)), false);
  const lang = language => matchProgramme(hk, { ...profile, language }).checks.find(c => c.kind === 'language');
  assert.equal(lang(profile.language).status, 'pass'); assert.equal(lang({ ...profile.language, atHome: true }).status, 'fail');
  assert.equal(lang({ type: 'toefl_6', total: 4.5, testDate: '2026-01-21', singleAttempt: true }).status, 'pass');
  assert.equal(lang({ type: 'waiver' }).status, 'unknown');
  assert.equal(matchProgramme(hk, { ...profile, major: 'Mechanical Engineering' }).checks.find(c => c.kind === 'major').status, 'unknown');
  assert.equal(matchProgramme(hk, { ...profile, classification: 'ordinary' }).status, 'has_gap');
  assert.equal(matchProgramme(hk, profile).tier, null); assert.equal(matchProgramme(hk, profile).status, 'needs_confirmation');
  assert.match(manual(hk, 'MSc-only award, concentrations and professional recognition').noteEn, /does not make admission research-based/);
});

test('SMU any-field admission and experience ceiling do not become generic GPA or three-year minimum rules', () => {
  const major = sm.rules.find(r => r.kind === 'major'); assert.equal(major.any, true); assert.deepEqual(major.accepted, []);
  assert.equal(sm.rules.some(r => ['gpa', 'classification', 'experience', 'language'].includes(r.kind)), false);
  for (const experienceYears of [0, 4]) {
    const result = matchProgramme(sm, { ...profile, major: 'English Literature', experienceYears });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass'); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  assert.match(manual(sm, 'Academic quality and full-time experience ceiling').noteEn, /up to 3 years of full-time/);
  assert.match(manual(sm, 'Academic quality and full-time experience ceiling').noteEn, /not.*three-year minimum/);
});

test('SMU institution-specific test waivers, competitive scores and English validity remain manual and separate', () => {
  const tests = manual(sm, 'Admissions tests, competitive scores and narrow GPA waiver').noteEn;
  for (const pattern of [/600.*55\/80.*competitive/, /3.0\/4.0/, /3.5\/5.0/, /5 years after graduation/, /not general entry GPA/, /does not waive the test/]) assert.match(tests, pattern);
  const language = manual(sm, 'English evidence, validity and medium-of-instruction waiver').noteEn;
  assert.match(language, /No numeric IELTS\/TOEFL cutoff/); assert.match(language, /two years from the test date/); assert.match(language, /not a rolling expiry/);
  assert.equal(sm.fieldStatus.gpa.status, 'not_published'); assert.equal(sm.fieldStatus.language.status, 'unknown');
});

test('SMU January and August keep common gross tuition, credited advances and changed incidental charges without an all-in estimate', () => {
  assert.deepEqual(sm.offerings.map(o => [o.mode, o.duration, o.tuition, o.applicationFee]), [['Full-time', '18 months', 63220, 100], ['Full-time', '18 months', 63220, 100]]);
  const [jan, aug] = sm.offerings; assert.equal(jan.tuitionEstimate, undefined); assert.equal(aug.tuitionEstimate, true);
  assert.match(jan.feeBasis, /SGD 5,000.*not added again/); assert.match(jan.feeBasis, /registration SGD 400.*SGD 500/);
  assert.match(aug.feeBasis, /indicative August 2027/); assert.match(aug.feeBasis, /SGD 8,000.*not added again/);
  assert.match(aug.feeBasis, /annual miscellaneous fees replace registration/); assert.match(aug.feeBasis, /SGD 480.*excluding GST/);
  assert.equal([...contexts.values()].some(c => c.programmeId === sm.id), false);
});

test('SMU month-only year-specific notices do not become exact windows, invented rounds or current availability', () => {
  for (const o of sm.offerings) { assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.applicationRounds, undefined); }
  for (const day of ['2026-10-24', '2026-11-01', '2027-05-31', '2027-06-01']) assert.equal(programmeTimeline(sm, day).state, 'dates_incomplete');
  assert.match(sm.offerings[0].deadlineNote, /February 2026 to October 2026/); assert.match(sm.offerings[1].deadlineNote, /September 2026 to May 2027/);
  assert.equal(sm.fieldStatus.deadline.status, 'unknown'); assert.equal(programmeTimeline(sm, '2026-10-24').livePortalChecked, false);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-24T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`;
const get = async path => { const r = await fetch(base + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real APIs and remembered choices use new programme evidence while retired seed choices require attention', async () => {
  const offering = hk.id + '-SEP2027-PT', applicant = offering + '-NONLOCAL';
  const detail = await get(`/api/programmes/${hk.id}?offering=${offering}&applicant=${applicant}`);
  assert.equal(detail.offerings[0].tuition, 180000); assert.equal(detail.offerings[0].deadline, '2027-04-01');
  const qs = new URLSearchParams({ school: 'HK-HKUST', offerings: JSON.stringify({ [hk.id]: offering }), applicants: JSON.stringify({ [hk.id]: applicant }), limit: '100' });
  assert.equal((await get('/api/catalogue?' + qs)).items.find(p => p.id === hk.id).offerings[0].deadline, '2027-04-01');
  const r = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'SG-SMU' } }) });
  assert.equal(r.status, 200); assert.equal((await r.json()).items.find(p => p.id === sm.id).match.tier, null);
  const saved = optionSnapshot(detail), choices = [saved, { programmeId: hk.id, offeringId: hk.id + '-seed' }, { programmeId: sm.id, offeringId: sm.id + '-seed' }];
  const resolution = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: choices }) });
  assert.equal(resolution.status, 200); const items = (await resolution.json()).items; assert.deepEqual(items.map(i => i.status), ['resolved', 'needs_attention', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [hk.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].deadline, '2027-04-01'); assert.equal(exported.offerings[0].applicationFee, 600); assert.equal(exported.profile, undefined);
});

test('an existing file-backed catalogue with directory metadata loads both first checks without losing old source or directory data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-beyond-pilot-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json');
  let db;
  try {
    const prior = { ...batch, programmes: batch.programmes.filter(p => ![hk.id, sm.id].includes(p.id)) };
    writeFileSync(checkedPath, JSON.stringify(prior)); db = new CatalogueStore(path, { ...options, checkedPath });
    const directory = db.get(hk.id).directoryListing, oldProgramme = db.get('HK-HKUST-P002'); assert.equal(db.get(hk.id).verification, 'catalogue_seed');
    db.close(); db = null; writeFileSync(checkedPath, JSON.stringify(batch)); db = new CatalogueStore(path, { ...options, checkedPath });
    assert.equal(db.get(hk.id).verification, 'programme_page_checked'); assert.equal(db.get(sm.id).verification, 'programme_page_checked');
    assert.deepEqual(db.get(hk.id).directoryListing, directory); assert.deepEqual(db.get('HK-HKUST-P002'), oldProgramme);
    assert.equal(db.quality().checked, 53); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
    const routeIndex = loadRoutes(routePath, db.all()); assert.deepEqual(applicantSummary(loadApplicantContexts(contextPath, db.all(), routeIndex)), { studyOptions: 18, categories: 38, peerReviewed: 0 });
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

test('read-only views do not inflate record totals, independent review, completed requirements or programme-source dates', async () => {
  const before = JSON.stringify(store.all());
  for (const p of [hk, sm]) { programmeTimeline(p, '2026-10-24'); matchProgramme(p, profile); }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 53);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(meta.applicantEvidence, { studyOptions: 18, categories: 38, peerReviewed: 0 });
  assert.equal(JSON.stringify(store.all()), before);
});
