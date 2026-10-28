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
import { optionSnapshot, shortlistExport } from '../public/saved-options.js';
import { loadRepositoryReviewQueue } from '../scripts/source-review-queue.mjs';

const root = new URL('../', import.meta.url), read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const batch = read('data/checked-programmes.json'), obs = read('data/research/sit-mhsc-observation-2026-10-27.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
// Synthetic software inputs; no participant, medical-professional credential or clinical role is verified.
const profile = { major: 'Nursing', degreeStatus: 'graduated', gpa: 3.5, gpaScale: 4, experienceYears: 3, language: { type: 'ielts', total: 7, testDate: '2026-05-01' } };
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
const note = label => p.rules.find(r => r.labelEn === label).noteEn;

test('the existing MHSc seed gains one partial observation and all four listed SIT coursework parents remain distinct', () => {
  assert.equal(read('data/catalogue.json').programmes.find(x => x.id === p.id).verification, 'catalogue_seed');
  assert.equal(validateProgramme(p, new Set(['SG-SIT'])), p); assert.equal(p.admissionRoute, 'direct');
  assert.equal(p.verification, 'programme_page_checked'); assert.equal(p.requirementsCoverage, 'partial'); assert.equal(p.reviewer, null);
  assert.equal(p.lastChecked, '2026-10-27'); assert.ok(p.sources.every(s => s.checkedOn === p.lastChecked));
  assert.equal(batch.programmes.filter(x => x.id === p.id).length, 1); assert.equal(batch.pilotProgrammeIds.includes(p.id), false); assert.equal(batch.pilotProgrammeIds.length, 20);
  assert.deepEqual(batch.programmes.filter(x => x.universityId === 'SG-SIT').map(x => x.id).sort(), ['SG-SIT-P001', 'SG-SIT-P002', 'SG-SIT-P003', 'SG-SIT-P004']);
  assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('CSM structure does not turn the degree into a certificate-only transfer route or five extra programmes', () => {
  assert.equal(obs.scope.degreeEnrolmentExplicit, true); assert.equal(obs.scope.notCertificateHolderOnly, true); assert.equal(obs.scope.notResearchClinicalMaster, true);
  assert.equal(obs.scope.specialisations.length, 5); assert.equal(obs.scope.singleAwardSpecialisation, true);
  assert.equal(obs.scope.credits, 60); assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false);
  assert.equal(o.mode, null); assert.equal(o.id, p.id + '-AUG2027-CSM');
  assert.match(note('CSM enrolment and conditional funding'), /does not guarantee degree admission/);
});

test('2027 month-only application evidence does not gain exact days or inherit obsolete 2026 banners', () => {
  assert.equal(o.intake, '31 August 2027'); assert.equal(o.academicYear, '2027 intake');
  assert.equal(o.applicationOpen, null); assert.equal(o.deadline, null); assert.equal(o.applicationRounds, undefined);
  assert.deepEqual(obs.cycle.applicationMonths, { from: '2027-02', to: '2027-04' });
  assert.equal(obs.cycle.mcBannerOlderDeadline, '2026-04-24');
  for (const day of ['2026-10-27', '2027-02-01', '2027-04-30', '2027-05-01']) {
    const timeline = programmeTimeline(selected(), day); assert.equal(timeline.state, 'dates_incomplete'); assert.equal(timeline.livePortalChecked, false);
    assert.ok(timeline.offerings.every(x => x.openingDate === null && x.deadline === null));
  }
  assert.equal(p.fieldStatus.deadline.status, 'unknown');
});

test('major and total work years cannot establish clinical employment, registration, track eligibility or an automatic registration rejection', () => {
  assert.equal(p.rules.some(r => ['major', 'experience', 'classification', 'gpa'].includes(r.kind)), false);
  for (const changes of [{ experienceYears: 0 }, { experienceYears: 10 }, { major: 'Computer Science', gpa: 90, gpaScale: 100 }]) {
    const result = matchProgramme(p, { ...profile, ...changes }); assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /Working healthcare professional/.test(c.labelEn)).status, 'unknown');
    assert.equal(result.checks.find(c => /Professional registration/.test(c.labelEn)).status, 'unknown');
  }
  assert.match(note('Professional registration and alternative assessment'), /not an automatic universal rejection/);
  assert.match(p.notesEn, /not general career conversion/);
});

test('nursing mandatory experience and physiotherapy preference remain track-specific rather than a generic two-year gate', () => {
  const tracks = obs.requirements.trackExperience;
  assert.equal(tracks.nursing.healthcareYears, 2); assert.equal(tracks.nursing.specialtyYears, 1); assert.equal(tracks.nursing.mandatoryForTheseTracksOnly, true);
  assert.equal(tracks.musculoskeletal.recommendedYears, 2); assert.equal(tracks.musculoskeletal.mandatory, false);
  assert.equal(p.rules.some(r => r.kind === 'experience'), false);
  assert.match(note('Track-specific experience, not a universal two-year minimum'), /preference is not a hard minimum for every track/);
  assert.equal(obs.requirements.noUniversalEngineeringOneYearRule, true);
  assert.match(note('Sonography access and track applicability'), /supervised clinical arrangement/);
});

test('Engineering and ICT English-table numbers do not become MHSc score rules or automatic waivers', () => {
  assert.equal(p.rules.some(r => r.kind === 'language'), false); assert.equal(p.fieldStatus.language.status, 'unknown');
  assert.equal(obs.requirements.english.numericMinimum, null); assert.equal(obs.requirements.english.engineeringTableNotInherited, true);
  assert.match(note('English applicability without engineering-score inheritance'), /Table A is explicitly for Engineering and Infocomm Technology/);
  for (const language of [{ type: 'waiver' }, { type: 'ielts', total: 5 }, { type: 'toefl_6', total: 6, testDate: '2026-05-01' }]) {
    const result = matchProgramme(p, { ...profile, language }); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => /English applicability/.test(c.labelEn)).status, 'unknown');
  }
});

test('undergraduate CSM rates and conditional MC subsidies never become an entire-MHSc default or invented applicant context', () => {
  assert.equal(o.tuition, null); assert.equal(o.applicationFee, null); assert.equal(p.fieldStatus.tuition.status, 'unknown');
  assert.equal(obs.fees.undergraduateCsmFeeTableNotApplicable, true); assert.equal(obs.fees.mcConcessionsNotWholeDegreePrice, true);
  assert.equal(obs.fees.stackingFundingModuleCap, 5); assert.equal(obs.fees.stackingFundingCreditCap, 30);
  assert.equal(obs.fees.noAutomatic70Or90PercentDiscount, true);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  assert.equal(selected().offerings[0].tuition, null); assert.equal(selected().selectedApplicant, undefined);
});

test('supporting documents and study-stage clinical training are not fabricated undergraduate GPA or pre-entry work thresholds', () => {
  assert.equal(obs.requirements.essayMaxWords, 300); assert.equal(obs.requirements.employerOrDepartmentSupport, true);
  const placement = p.rules.find(r => r.labelEn === 'Training requirements are not pre-entry experience');
  assert.equal(placement.mandatory, false); assert.match(placement.noteEn, /study\/training requirements/);
  assert.equal(obs.requirements.placementsNotAdmissionYears, true);
  assert.match(note('Essay, employer support and admission assessment'), /does not collect or submit/);
});

test('earlier EEE snapshots survive the new same-day batch and the queue does not make month-only windows actionable', () => {
  const expected = {
    'source-review-queue-2026-10-27-sit-eee.md': '23e7b36021370928fad83033478681bd09d9596880b3eecafddbe36e69d4167a',
    'core-pilot-acceptance-2026-10-27-sit-eee.md': 'c283b1cefb6c4a75b0d23b1c16dc65248d444c6708cbb268c2f3afdb718318b4'
  };
  for (const [file, hash] of Object.entries(expected)) assert.equal(createHash('sha256').update(readFileSync(new URL('docs/research/' + file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-27');
  assert.equal(queue.counts.programmePageRecords, 47); assert.equal(queue.counts.reviewUnits, 70); assert.equal(queue.counts.reviewRecordedInSource, 0);
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first MHSc source migration preserves all other records and directory context across isolated restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-sit-mhsc-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath });
    const previous = db.all().filter(x => x.id !== p.id), directory = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, 46); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath });
      assert.equal(db.get(p.id).verification, 'programme_page_checked'); assert.deepEqual(db.get(p.id).directoryListing, directory);
      assert.deepEqual(db.all().filter(x => x.id !== p.id), previous); assert.deepEqual(db.quality().sourceRefreshConflicts, []);
      assert.equal(db.quality().total, 873); assert.equal(db.quality().checked, 47); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-27T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('real APIs and saved choices retain current MHSc unknowns, retire the old seed and preserve public-only exports', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  assert.equal(detail.offerings[0].mode, null); assert.equal(detail.offerings[0].tuition, null); assert.equal(detail.applicationTimeline.state, 'dates_incomplete');
  const sit = await get('/api/catalogue?school=SG-SIT&limit=100'); assert.equal(sit.items.length, 4);
  assert.ok(sit.items.every(x => x.verification === 'programme_page_checked'));
  const matched = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, offerings: { [p.id]: o.id } }) });
  assert.equal(matched.status, 200); assert.equal((await matched.json()).items.find(x => x.id === p.id).match.status, 'needs_confirmation');
  const saved = optionSnapshot(detail, '2026-10-27T04:00:00.000Z');
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-seed' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0];
  assert.equal(exported.offerings[0].deadline, null); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 870); assert.equal(meta.quality.checked, 47);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 18, categories: 38, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 5);
  assert.equal(JSON.stringify(store.all()), before);
});
