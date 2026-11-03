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
const batch = read('data/checked-programmes.json'), obs = read('data/research/suss-emba-observation-2026-10-28.json');
const p = batch.programmes.find(x => x.id === obs.programmeId), o = p.offerings[0];
const options = { seedPath: new URL('data/catalogue.json', root), expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryEvidencePath: new URL('data/directory-links.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root) };
const routePath = new URL('data/route-programmes.json', root), contextPath = new URL('data/applicant-contexts.json', root);
const store = new CatalogueStore(':memory:', options), routes = loadRoutes(routePath, store.all()), contexts = loadApplicantContexts(contextPath, store.all(), routes);
const selected = () => resolveProgramme(store.get(p.id), routes, undefined, o.id, undefined, contexts);
// Synthetic totals do not establish managerial experience, recognised qualifications or Chinese proficiency.
const profile = { major: 'Business Administration', degreeStatus: 'graduated', classification: 'ordinary', gpa: 2.5, gpaScale: 4, experienceYears: 8, language: { type: 'ielts', total: 6.5, testDate: '2026-05-01' } };
const check = (result, label) => result.checks.find(c => c.labelEn === label);

test('EMBA compares eight total years without adding managerial years or passing management experience from the total', () => {
  for (const experienceYears of [0, 3, 7.9]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears, gpa: 4 });
    assert.equal(result.status, 'has_gap'); assert.equal(result.tier, null);
    assert.equal(result.checks.find(c => c.kind === 'experience').status, 'fail');
  }
  for (const experienceYears of [8, 10.9, 11, 20]) {
    const result = matchProgramme(selected(), { ...profile, experienceYears });
    assert.equal(result.checks.find(c => c.kind === 'experience').status, 'pass');
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null);
    assert.equal(check(result, 'At least three managerial years within the total experience').status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, experienceYears: null }).checks.find(c => c.kind === 'experience').status, 'unknown');
  assert.match(p.rules.find(r => /three managerial years/.test(r.labelEn)).noteEn, /not added to form eleven years/);
});

test('equivalent qualification and Chinese-evidence alternatives are not hard-rejected by bachelor status, award GPA or English-only matching', () => {
  assert.equal(p.rules.some(r => ['gpa', 'classification', 'major', 'language'].includes(r.kind)), false);
  for (const changes of [{ degreeStatus: 'other' }, { degreeStatus: 'final_year' }, { gpa: 1, major: 'History' }, { gpa: 3, gpaScale: 5 }, { language: { type: 'none' } }, { language: { type: 'ielts', total: 4 } }, { language: { type: 'waiver' } }]) {
    const result = matchProgramme(selected(), { ...profile, ...changes });
    assert.equal(result.status, 'needs_confirmation'); assert.equal(result.tier, null); assert.equal(result.checks.some(c => c.status === 'fail'), false);
    assert.equal(check(result, 'Qualification equivalence and exceptional career route').status, 'unknown');
    assert.equal(check(result, 'Conditional English or Chinese evidence and bilingual readiness').status, 'unknown');
  }
  assert.equal(matchProgramme(p, { ...profile, degreeStatus: 'other', experienceYears: 1 }).status, 'has_gap');
  assert.match(p.rules.find(r => /bilingual readiness/.test(r.labelEn)).noteEn, /HSK Level 5 at least 180/);
  assert.match(p.rules.find(r => /graduation standard/.test(r.labelEn)).noteEn, /not an undergraduate entry GPA/);
});

test('EMBA document and attendance requirements stay separate from optional contacts, DBA proposals, compulsory immersion and remote promises', () => {
  const detail = selected(), result = matchProgramme(detail, profile);
  const documents = detail.rules.find(r => /Template CV, employer documents/.test(r.labelEn));
  assert.equal(check(result, documents.labelEn).status, 'unknown');
  for (const text of [/current-employer company profile and organisation chart/, /two letters/, /Referees send letters directly/, /not a replacement/, /must pass the admission interview/, /No adjacent DBA research proposal/]) assert.match(documents.noteEn, text);
  const attendance = detail.rules.find(r => /Resident category/.test(r.labelEn));
  assert.equal(check(result, attendance.labelEn).status, 'unknown'); assert.match(attendance.noteEn, /some overseas/);
  assert.match(attendance.noteEn, /not an established nationality restriction/); assert.match(attendance.noteEn, /Do not promise entirely remote/);
  assert.match(detail.rules.find(r => /graduation standard/.test(r.labelEn)).noteEn, /GMAT\/GRE are explicitly not required/);
  assert.match(detail.rules.find(r => /graduation standard/.test(r.labelEn)).noteEn, /elective, not a universally compulsory/);
  assert.equal(o.mode, null); assert.equal(/\p{Script=Han}/u.test(JSON.stringify(p)), false);
});

test('EMBA raw current feature dates and historical July 2026 brochure do not produce a live-open cohort or personal DBA-inflated fee', () => {
  for (const key of ['academicYear', 'applicationOpen', 'deadline', 'tuition', 'applicationFee']) assert.equal(o[key], null);
  assert.match(o.deadlineNote, /16 October 2026 to 15 April 2027/); assert.match(o.deadlineNote, /16 October 2025 to 15 April 2026/);
  for (const day of ['2026-10-28', '2027-01-01', '2027-04-15', '2027-07-01']) assert.equal(programmeTimeline(selected(), day).state, 'dates_incomplete');
  assert.match(o.feeBasis, /90,000 SC\/PR and 108,000 Other Residents before GST/);
  assert.match(o.feeBasis, /DBA retention charge of 5,000 per semester/); assert.match(o.feeBasis, /do not apply automatically to EMBA/);
  assert.match(o.feeBasis, /No EMBA maximum-SSG price is established/);
  assert.equal([...contexts.values()].some(c => c.programmeId === p.id), false);
  const queue = loadRepositoryReviewQueue('2026-10-28');
  assert.equal(queue.units.find(u => u.programmeId === p.id).upcomingRecordedCutoffs.length, 0);
});

test('first EMBA source migration keeps one existing coursework identity and all other records stable over restarts', () => {
  assert.equal(validateProgramme(p, new Set(['SG-SUSS'])), p); assert.equal(p.award, 'EMBA');
  assert.equal(p.offerings.length, 1); assert.equal(routes.has(p.id), false); assert.equal(batch.pilotProgrammeIds.includes(p.id), false);
  assert.equal(obs.identity.coreCu + obs.identity.electiveCu + obs.identity.appliedProjectCu, 90);
  for (const [file, hash] of Object.entries(obs.preservation.previousSnapshotHashes)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n')).digest('hex'), hash);
  const queue = loadRepositoryReviewQueue('2026-10-28'); assert.equal(queue.counts.programmePageRecords, 363); assert.equal(queue.counts.reviewUnits, 641); assert.equal(queue.counts.reviewRecordedInSource, 0);
  const dir = mkdtempSync(join(tmpdir(), 'gradpath-suss-emba-')), path = join(dir, 'test.sqlite'), checkedPath = join(dir, 'checked.json'); let db;
  try {
    writeFileSync(checkedPath, JSON.stringify({ ...batch, programmes: batch.programmes.filter(x => x.id !== p.id) }));
    db = new CatalogueStore(path, { ...options, checkedPath }); const earlier = db.all().filter(x => x.id !== p.id), listing = db.get(p.id).directoryListing;
    assert.equal(db.get(p.id).verification, 'catalogue_seed'); assert.equal(db.quality().checked, batch.programmes.length - 1); db.close(); db = null;
    writeFileSync(checkedPath, JSON.stringify(batch));
    for (let restart = 0; restart < 2; restart++) {
      db = new CatalogueStore(path, { ...options, checkedPath }); assert.equal(db.get(p.id).verification, 'programme_page_checked');
      assert.deepEqual(db.get(p.id).directoryListing, listing); assert.deepEqual(db.all().filter(x => x.id !== p.id), earlier);
      assert.deepEqual(db.quality().sourceRefreshConflicts, []); assert.equal(db.quality().checked, 363); db.close(); db = null;
    }
  } finally { db?.close(); rmSync(path, { force: true }); rmSync(checkedPath, { force: true }); rmdirSync(dir); }
});

const app = createApp({ store, publicDir: new URL('public/', root), routeEvidencePath: routePath, applicantEvidencePath: contextPath, now: () => new Date('2026-10-28T04:00:00Z') });
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`, get = async path => (await fetch(base + path)).json();
test.after(async () => { await new Promise(resolve => app.close(resolve)); store.close(); });

test('actual EMBA match/save/restore/export distinguishes total-year gaps from unresolved management, language and fees without source mutation', async () => {
  const before = JSON.stringify(store.all()), detail = await get('/api/programmes/' + p.id + '?offering=' + o.id);
  for (const [experienceYears, expected] of [[7, 'has_gap'], [8, 'needs_confirmation']]) {
    const response = await fetch(base + '/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: { ...profile, experienceYears, language: { type: 'none' } }, offerings: { [p.id]: o.id } }) });
    assert.equal(response.status, 200); const match = (await response.json()).items.find(x => x.id === p.id).match;
    assert.equal(match.status, expected); assert.equal(match.tier, null); assert.equal(check(match, 'At least three managerial years within the total experience').status, 'unknown');
  }
  const saved = optionSnapshot(detail, '2026-10-28T04:00:00.000Z'); assert.equal(parseSavedOption(saved).offeringId, o.id);
  const response = await fetch(base + '/api/saved-options/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contexts: [saved, { programmeId: p.id, offeringId: p.id + '-catalogue' }] }) });
  assert.equal(response.status, 200); const items = (await response.json()).items; assert.deepEqual(items.map(x => x.status), ['resolved', 'needs_attention']);
  const exported = shortlistExport([items[0].programme], { [p.id]: saved }).programmes[0]; assert.equal(exported.offerings[0].id, o.id);
  assert.equal(exported.evidence.publishedRequirements.find(r => r.kind === 'experience').min, 8);
  assert.match(exported.evidence.publishedRequirements.find(r => /three managerial years/.test(r.labelEn)).noteEn, /profile records total years only/);
  assert.match(exported.evidence.publishedRequirements.find(r => /bilingual readiness/.test(r.labelEn)).noteEn, /HSK Level 5/);
  assert.match(exported.offerings[0].deadlineNote, /already historical/); assert.equal(exported.offerings[0].tuition, null); assert.equal(exported.offerings[0].deadline, null);
  assert.equal(exported.profile, undefined); assert.equal(exported.match, undefined);
  const meta = await get('/api/meta'); assert.equal(meta.quality.checked, 363); assert.equal(meta.quality.total, 873); assert.equal(meta.quality.browsable, 865);
  assert.equal(meta.quality.peerReviewed, 0); assert.equal(meta.quality.complete, 0); assert.deepEqual(meta.quality.sourceRefreshConflicts, []);
  assert.deepEqual(applicantSummary(contexts), { studyOptions: 237, categories: 474, peerReviewed: 0 }); assert.equal(meta.routeEvidence.routes, 41);
  assert.equal(detail.applicationTimeline.state, 'dates_incomplete'); assert.equal(JSON.stringify(store.all()), before);
});
