import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogueStore } from '../server/database.mjs';
import { createApp } from '../server/app.mjs';
import { validateProgramme } from '../server/validation.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, shortlistExport, parseSavedOption } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-matsl-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId);
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = id => resolveProgramme(store.get(p.id), routes, undefined, id, undefined, contexts);
const rule = label => p.rules.find(r => r.labelEn === label);
// Synthetic only: degree recognition, native language, English medium, assessment and pass/residence are unverified.
const profile = { major: 'Education', degreeStatus: 'graduated', gpa: 2.5, gpaScale: 4, experienceYears: 0, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };

test('existing MATSL seed becomes one standalone coursework master without merging MECED TESOL or smaller awards', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(read('data/catalogue-expansion.json').programmes.some(x => x.id === p.id), false);
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'MATSL'); assert.equal(p.faculty, 'School of Humanities and Behavioural Sciences');
  assert.equal(obs.identity.coreCu + obs.identity.electiveCu, 60); assert.equal(obs.identity.internationalDirectoryClassifiesCoursework, true);
  assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null); assert.equal(obs.identity.mecedTesolTrackNotMerged, 'SG-SUSS-P020');
  assert.notEqual(store.get('SG-SUSS-P020').id, p.id); assert.notEqual(store.get('SG-SUSS-P020').name, p.name);
  assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('published degree fields can compare directly while related/other fields stay case-by-case rather than rejected', () => {
  for (const major of ['English Studies', 'Linguistics', 'Education']) {
    const result = matchProgramme(p, { ...profile, major });
    assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass'); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
  }
  const result = matchProgramme(p, { ...profile, major: 'Business Administration' });
  assert.equal(result.checks.find(c => c.kind === 'major').status, 'unknown'); assert.equal(result.checks.some(c => c.status === 'fail'), false);
});

test('Education major and high external English cannot automatically satisfy the separate school assessment', () => {
  assert.equal(obs.requirements.schoolEnglishAssessment.educationDegreeDoesNotAutomaticallyExempt, true);
  assert.equal(obs.requirements.schoolEnglishAssessment.requiredUnlessDegreeInEnglishStudiesOrLinguistics, true);
  assert.equal(obs.requirements.schoolEnglishAssessment.externalTestNotAutomaticSubstitute, true);
  assert.match(rule('School English assessment by degree field').noteEn, /Education is an accepted degree field/);
  const result = matchProgramme(p, { ...profile, language: { type: 'ielts', total: 9 } });
  assert.equal(result.checks.find(c => c.kind === 'major').status, 'pass');
  assert.equal(result.checks.find(c => /School English assessment/.test(c.labelEn)).status, 'unknown'); assert.equal(result.status, 'needs_confirmation');
});

test('native/medium external English condition, strict totals, components and expiry do not flatten into general ELPR or a waiver', () => {
  const english = obs.requirements.programmeExternalEnglish;
  assert.equal(english.appliesIfNativeLanguageOrUndergraduateMediumNotEnglish, true); assert.equal(english.nativeAndMediumAreSeparateFacts, true);
  assert.deepEqual(english.ielts, { operator: '>', total: 6.5, allComponentsMin: 6 });
  assert.deepEqual(english.toeflIbtUnversioned, { operator: '>', total: 85, writingMin: 22 });
  assert.equal(english.toeflPbt.preferredTwe, 5); assert.equal(english.ieltsToeflYearsAtApplication, 2);
  assert.equal(obs.requirements.generalElpr.ieltsAcademicMin, 6.5); assert.equal(p.rules.some(r => r.kind === 'language'), false);
  for (const language of [{ type: 'ielts', total: 6.5 }, { type: 'ielts', total: 7, components: { writing: 5.5 } }, { type: 'ielts', total: 9 }, { type: 'waiver' }, { type: 'toefl_120', total: 85 }, { type: 'toefl_6', total: 6 }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Additional external English/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.find(c => /General English policy/.test(c.labelEn)).status, 'unknown');
  }
});

test('regular/accelerated choices retain separate load and residence/switch conditions without inferring FT/PT or approving a pass', () => {
  assert.deepEqual(p.offerings.map(o => o.id), [p.id + '-REGULAR', p.id + '-ACCELERATED']); assert.equal(routes.has(p.id), false);
  assert.deepEqual(obs.pathways.regular.durationYears, { minimum: 2, maximum: 4 }); assert.equal(obs.pathways.regular.semesterMaximumCu, 15);
  assert.equal(obs.pathways.accelerated.durationYears, 1); assert.equal(obs.pathways.accelerated.semesterCu, 30);
  assert.equal(obs.pathways.accelerated.internationalStudentsMustEnterAndRemain, true);
  assert.equal(obs.pathways.residentStudentsMaySwitchPathwaySubjectToUniversity, true);
  for (const o of p.offerings) {
    const record = selected(o.id); assert.equal(record.offerings[0].id, o.id); assert.equal(record.offerings[0].mode, null);
    assert.equal(matchProgramme(record, profile).checks.find(c => /Pathway, residence/.test(c.labelEn)).status, 'unknown');
  }
});

test('novice teachers, CV row and award standards do not import MECED training requirements or another programme research proposal', () => {
  assert.equal(obs.requirements.englishTeachingExperienceRequired, false); assert.equal(obs.requirements.englishTeachingExperienceAdvantage, true);
  assert.equal(rule('Teaching experience is an advantage').mandatory, false); assert.equal(p.rules.some(r => ['experience', 'gpa', 'classification'].includes(r.kind)), false);
  assert.equal(obs.requirements.cvRequiredInCurrentLinkedChecklist, true); assert.equal(obs.requirements.neighbouringResearchProposalNotMatslRequirement, true);
  assert.equal(rule('CV and admission-document review').mandatory, true); assert.equal(rule('Award GPA and optional project').mandatory, false);
  assert.equal(obs.study.masterAwardCgpa, 3); assert.equal(obs.study.certificateDiplomaAwardCgpa, 2.5);
  assert.equal(obs.study.universityExplicitlyDoesNotCertifyTeachers, true); assert.equal(rule('Teacher certification and candidature limit').mandatory, false);
  assert.equal(matchProgramme(p, { ...profile, gpa: 1, experienceYears: 0 }).checks.some(c => c.status === 'fail'), false);
});

test('rolling review, recurring intake and older search snippets do not create a live application window', () => {
  assert.deepEqual(obs.cycle.recurringIntakes, ['January', 'July']); assert.equal(obs.cycle.olderSearchEventNotUsedForCurrentWindow, true);
  for (const o of p.offerings) {
    assert.equal(o.academicYear, null); assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null);
    for (const day of ['2026-10-27', '2027-01-01', '2027-04-15', '2027-07-01']) assert.equal(programmeTimeline(selected(o.id), day).state, 'dates_incomplete');
  }
  assert.equal(obs.cycle.livePortalChecked, false);
});

test('MATSL fee quote and document sources retain programme-specific boundaries and text-only limitations', () => {
  assert.deepEqual(obs.fees.masterTextQuote, { scPr: 26400, otherResidents: 31680, conditionalSubsidisedAsLowAs: 16588 });
  assert.equal(obs.fees.acceptanceDeposit.notExtraTuition, true); assert.equal(obs.fees.pdfColumnsNotVisuallyVerified, true);
  assert.equal(obs.sourceLimitations.linkedCurriculumPlanFetchFailed, true); assert.equal(obs.sourceLimitations.pdfVisualInspectionCompleted, false);
  assert.equal(obs.sourceLimitations.olderSearchChecklistNotUsed, true); assert.equal(obs.sourceLimitations.checklistRelevantPage, 4);
  assert.ok(p.offerings.every(o => o.tuition === null && o.applicationFee === null)); assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
});

test('first MATSL seed migration preserves all earlier source objects and MBE archive snapshots across isolated restarts', () => {
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27'); assert.equal(queue.counts.programmePageRecords, 48); assert.equal(queue.counts.reviewUnits, 71);
  assert.equal(queue.counts.reviewRecordedInSource, 0); assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-matsl-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 47); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, directory); assert.deepEqual(db.all().filter(x => x.id !== p.id), previous);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 48); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual API/save/restore/export retains matched degree but unresolved assessment, selected duration and retired-seed attention', async () => {
  const before = JSON.stringify(store.all());
  for (const o of p.offerings) {
    const detail = await get('/api/programmes/' + p.id + '?offering=' + o.id); assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(detail.offerings[0].duration, o.duration);
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, 'needs_confirmation'); assert.equal(match.checks.find(c => c.kind === 'major').status, 'pass');
    assert.equal(match.checks.find(c => /School English assessment/.test(c.labelEn)).status, 'unknown');
    const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
    const restored = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
    assert.equal(restored.status, 200); const items = (await restored.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
    const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
    assert.equal(exported.offerings[0].duration, o.duration); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
    assert.match(exported.evidence.publishedRequirements.find(r => /School English assessment/.test(r.labelEn)).noteEn, /does not automatically exempt/);
    assert.equal(exported.evidence.publishedRequirements.find(r => /Teaching experience/.test(r.labelEn)).mandatory, false);
    assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  }
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 48);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5); assert.equal(JSON.stringify(store.all()), before);
});
