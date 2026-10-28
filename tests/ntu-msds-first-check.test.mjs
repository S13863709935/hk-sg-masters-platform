import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { loadRoutes } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { validateProgramme } from '../server/validation.mjs';

const root = new URL('../', import.meta.url), read = f => JSON.parse(readFileSync(new URL(f, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/ntu-msds-observation-2026-10-24.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const manual = name => p.rules.find(r => r.kind === 'manual' && r.labelEn === name).noteEn;
const profile = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'first', gpa: 3.8, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const language = value => matchProgramme(p, { ...profile, language: value }).checks.find(c => c.kind === 'language');

test('one existing directory lead gains partial MSDS evidence without enlarging the pilot or inventing review', () => {
  assert.equal(read('data/catalogue-expansion.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.deepEqual(batch.programmes.filter(x => x.researchBatch === 'ntu-msds-first-check-2026-10-24').map(x => x.id), [p.id]);
  assert.equal(validateProgramme(p, new Set(['SG-NTU'])), p);
  assert.equal(p.award, 'MSc'); assert.equal(p.area, 'Computing'); assert.equal(p.admissionRoute, 'direct');
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.reviewer, null);
  assert.equal(p.lastChecked, obs.checkedOn); assert.ok(p.sources.every(s => s.checkedOn === obs.checkedOn));
  assert.equal(p.sources.length, 4); assert.equal(batch.pilotProgrammeIds.length, 20); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('MSDS mode fees retain GST, credited deposit and shortest-candidature basis without automatic discounts', () => {
  assert.deepEqual(p.offerings.map(o => [o.id, o.mode, o.duration, o.tuition, o.applicationFee]), [
    [p.id + '-AUG2027-FT', 'Full-time', 'Minimum 1 year; maximum 2.5 years', 65748.8, 50],
    [p.id + '-AUG2027-PT', 'Part-time', 'Minimum 2 years; maximum 4 years', 65748.8, 50]
  ]);
  for (const [i, o] of p.offerings.entries()) {
    for (const re of [/AY2027\/28/, /shortest-candidature/, /9% GST/, /5,000 deposit offsets/, /not multiplied by years/, /No automatic/]) assert.match(o.feeBasis, re);
    assert.match(o.feeBasis, i ? /four semesters/ : /two semesters/); assert.equal(o.tuitionEstimate, undefined);
  }
  assert.match(manual('Fee scope and discretionary funding'), /one-time and annual/);
  assert.match(manual('Fee scope and discretionary funding'), /generic two-instalment/);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('MSDS honours OR bachelor-and-experience retains mathematics without universal honours, GPA or work gates', () => {
  assert.equal(p.rules.some(r => ['classification', 'gpa', 'experience'].includes(r.kind)), false);
  assert.equal(p.fieldStatus.gpa.status, 'not_published');
  for (const re of [/honours degree OR/, /bachelor plus two/, /both require solid mathematics/, /Experience is not universal/, /GPA field is not a cutoff/]) assert.match(manual('Alternative academic routes and mathematical preparation'), re);
  for (const input of [profile, { ...profile, classification: 'ordinary', experienceYears: 2 }, { ...profile, major: 'Mathematics' }]) {
    const r = matchProgramme(p, input); assert.equal(r.status, 'needs_confirmation'); assert.equal(r.tier, null);
    assert.equal(r.checks.some(c => c.kind === 'experience' && c.status === 'fail'), false);
  }
  assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'final_year' }).checks.find(c => c.kind === 'degree').status, 'unknown');
});

test('MSDS central semester merged cells and FAQ conflict do not manufacture opening, January or MComp dates', () => {
  assert.deepEqual(obs.centralTableObservation.dateCellRowspans, [12, 12]);
  assert.equal(obs.centralTableObservation.rowIndexWithinAugustGroup, 2); assert.equal(obs.centralTableObservation.intakeRowspan, 15);
  assert.equal(obs.centralTableObservation.interpretationNotFullDateLiteral, true);
  for (const o of p.offerings) {
    assert.equal(o.applicationOpen, null); assert.equal(o.deadline, '2027-03-31'); assert.equal(o.intake, 'August 2027'); assert.equal(o.academicYear, '2027/28');
    assert.equal(o.applicationRounds, undefined); assert.match(o.deadlineNote, /November/); assert.match(o.deadlineNote, /not the trimester MComp/);
  }
  for (const [day, expected] of [['2026-10-24', 'dates_incomplete'], ['2026-11-01', 'dates_incomplete'], ['2027-03-31', 'deadline_today'], ['2027-04-01', 'deadline_passed']]) assert.equal(programmeTimeline(p, day).state, expected);
  assert.equal(programmeTimeline(p, '2026-10-24').livePortalChecked, false);
});

test('MSDS TOEFL versions remain date-specific; unestablished IELTS components and waiver rules are not imported', () => {
  const rule = p.rules.find(r => r.kind === 'language');
  for (const k of ['validityMonths', 'singleAttempt', 'atHomeAccepted', 'testDateNotBefore']) assert.equal(rule[k], undefined);
  assert.equal(rule.tests.ielts.componentMin, undefined);
  assert.equal(language({ type: 'ielts', total: 6.5 }).status, 'pass');
  assert.equal(language({ type: 'toefl_120', total: 100, testDate: '2026-01-20' }).status, 'pass');
  assert.equal(language({ type: 'toefl_6', total: 5, testDate: '2026-01-21' }).status, 'pass');
  assert.equal(language({ type: 'toefl_6', total: 4.5, testDate: '2026-01-21' }).status, 'fail');
  assert.equal(language({ type: 'waiver' }).status, 'unknown');
  assert.match(manual('English evidence and submission-time validity'), /two years of application, not today/);
});

test('MSDS curriculum, documents and PT permissions preserve applicant-facing distinctions', () => {
  assert.match(manual('Coursework and optional Python bridge'), /six-AU.*capstone/);
  assert.match(manual('Coursework and optional Python bridge'), /Python bridge is optional.*not a prerequisite/);
  assert.match(manual('Documents, payment and final-year applicants'), /GRE\/reference letters optional/);
  assert.match(manual('Documents, payment and final-year applicants'), /photograph, grading scale, certified translations/);
  assert.match(manual('Opening conflict and part-time permissions'), /valid immigration pass/);
  assert.match(manual('Opening conflict and part-time permissions'), /prohibits simultaneous FT\/PT applications/);
});

test('unresolved current-cohort NTU economics/MSIS fees retain their previous observations, not refreshed dates', () => {
  for (const [id, day] of [['SG-NTU-P015', '2026-10-22'], ['SG-NTU-P018', '2026-10-21']]) {
    const old = batch.programmes.find(x => x.id === id); assert.equal(old.lastChecked, day);
    assert.ok(old.offerings.every(o => o.tuition === null)); assert.equal(old.fieldStatus.tuition.status, 'unknown');
  }
  assert.equal(obs.feeRecheck.programmeIds.length, 2);
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-24T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + app.address().port, get = async path => { const r = await fetch(base + path); assert.equal(r.status, 200); return r.json(); };
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('MSDS APIs and exports resolve the chosen study mode; retired catalogue choices need explicit repair', async () => {
  const before = JSON.stringify(store.all()), o = p.offerings[1], detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.offerings[0].mode, 'Part-time'); assert.equal(detail.offerings[0].tuition, 65748.8);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.applicantOptions, undefined);
  const list = await get('/api/catalogue?' + new URLSearchParams({ school: 'SG-NTU', limit: '100', offerings: JSON.stringify({ [p.id]: o.id }) }));
  assert.equal(list.items.find(x => x.id === p.id).offerings[0].mode, 'Part-time');
  const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, filters: { school: 'SG-NTU' }, selectedOfferings: { [p.id]: o.id } }) });
  assert.equal(response.status, 200); const result = (await response.json()).items.find(x => x.id === p.id);
  assert.equal(result.match.status, 'needs_confirmation'); assert.equal(result.match.tier, null);
  const saved = optionSnapshot(detail);
  const r = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(r.status, 200); const items = (await r.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].tuition, 65748.8); assert.equal(exported.evidence.lastChecked, obs.checkedOn);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 49);
  assert.equal(meta.quality.complete, 0); assert.equal(meta.quality.peerReviewed, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 });
  assert.equal(JSON.stringify(store.all()), before);
});

test('first MSDS source migration preserves directory evidence, previous checked records and restart state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-msds-source-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const directory = db.get(p.id).directoryListing, previous = db.all().filter(x => x.id !== p.id);
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), previous); assert.equal(db.quality().checked, 49); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});
